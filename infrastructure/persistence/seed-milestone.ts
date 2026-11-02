import { connect, transaction } from "./connection.ts";
import { requireEnv } from "../runtime/config.ts";
import {
  readHelloWorld,
  contentHash,
} from "../../modules/roadmap/adapters/hello-world-content.ts";
import { readTopicCodingAssessment } from "../../modules/roadmap/adapters/coding-content.ts";
import {
  readQuiz,
  quizContentHash,
} from "../../modules/roadmap/adapters/quiz-content.ts";
import {
  LEARNER,
  OTHER_LEARNER,
} from "../../modules/learner-account/adapters/development-session.ts";

export async function seed(url: string) {
  const { pool } = connect(url);
  const content = await readHelloWorld();
  const quiz1 = await readQuiz("getting-started-with-cangjie");
  const quiz2 = await readQuiz("installing-the-cangjie-toolchain");
  const quiz3 = await readQuiz("identifiers");

  try {
    await transaction(pool, async (client) => {
      for (const [id, name] of [
        [LEARNER, "milestone-primary"],
        [OTHER_LEARNER, "milestone-other"],
      ]) {
        await client.query(
          "INSERT INTO learner_accounts VALUES($1,$2) ON CONFLICT DO NOTHING",
          [id, name],
        );
      }
      const topics = [
        [
          "getting-started-with-cangjie",
          "Getting Started with Cangjie",
          "Getting Started with Cangjie",
          "multiple-choice",
          1,
        ],
        [
          "installing-the-cangjie-toolchain",
          "Installing the Cangjie Toolchain",
          "Getting Started with Cangjie",
          "multiple-choice",
          1,
        ],
        [
          content.topicId,
          "Running the First Cangjie Program",
          "Getting Started with Cangjie",
          "coding",
          1,
        ],
        [
          "identifiers",
          "Identifiers",
          "Basic Concepts",
          "multiple-choice",
          1,
        ],
        [
          "program-structure",
          "Program Structure",
          "Basic Concepts",
          "coding",
          1,
        ],
        [
          "expressions",
          "Expressions",
          "Basic Concepts",
          "coding",
          1,
        ],
        [
          "functions",
          "Functions",
          "Basic Concepts",
          "coding",
          1,
        ],
      ];
      for (const [i, t] of topics.entries()) {
        await client.query(
          "INSERT INTO topics(id,title,category,kind,position,current_revision) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, category=EXCLUDED.category, kind=EXCLUDED.kind, position=EXCLUDED.position, current_revision=EXCLUDED.current_revision",
          [t[0], t[1], t[2], t[3], i, t[4]],
        );
      }

      // Coding assessments
      const codingAssessments = [
        content,
        await readTopicCodingAssessment("program-structure"),
        await readTopicCodingAssessment("expressions"),
        await readTopicCodingAssessment("functions"),
      ];

      for (const coding of codingAssessments) {
        const hash = contentHash(coding);
        const existingCoding = await client.query(
          "SELECT content_hash FROM assessment_revisions WHERE topic_id=$1 AND revision=1",
          [coding.topicId],
        );
        if (
          existingCoding.rowCount &&
          existingCoding.rows[0].content_hash !== hash
        ) {
          throw new Error(
            `Refusing changed assessment bytes under existing revision for ${coding.topicId}.`,
          );
        }
        await client.query(
          "INSERT INTO assessment_revisions VALUES($1,1,$2,$3) ON CONFLICT DO NOTHING",
          [coding.topicId, coding, hash],
        );
      }

      // Quizzes
      for (const quiz of [quiz1, quiz2, quiz3]) {
        const hash = quizContentHash(quiz);
        const existing = await client.query(
          "SELECT content_hash FROM assessment_revisions WHERE topic_id=$1 AND revision=$2",
          [quiz.topicId, quiz.revision],
        );
        if (existing.rowCount && existing.rows[0].content_hash !== hash) {
          throw new Error(
            `Refusing changed assessment bytes under existing revision for ${quiz.topicId}.`,
          );
        }
        await client.query(
          "INSERT INTO assessment_revisions VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          [quiz.topicId, quiz.revision, quiz, hash],
        );
      }

      for (const learner of [LEARNER, OTHER_LEARNER]) {
        for (const [i, t] of topics.entries()) {
          await client.query(
            "INSERT INTO learner_topic_progress(learner_id,topic_id,available,completed,provenance) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
            [
              learner,
              t[0],
              i < 3,
              i < 2,
              "internal prerequisite fixture; not quiz execution evidence",
            ],
          );
        }
      }
    });
  } finally {
    await pool.end();
  }
}
if (process.argv[1]?.endsWith("seed-milestone.ts"))
  await seed(requireEnv("MIGRATION_DATABASE_URL"));
