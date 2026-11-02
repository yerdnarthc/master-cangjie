import type pg from "pg";

export type CaseDefinition = {
  id: string;
  visibility: "visible" | "hidden";
  inputBase64: string;
  expectedBase64: string;
};

export type CodingProblem = {
  problemId: string;
  slug?: string;
  topicId: string;
  revision: number;
  title: string;
  statement: string;
  starter: string;
  languageVersion: "1.0.5";
  requirements: unknown[];
  tests: CaseDefinition[];
};

export type CodingAssessment = {
  kind?: "coding";
  topicId: string;
  revision: number;
  problemId: string;
  title: string;
  statement: string;
  starter: string;
  languageVersion: "1.0.5";
  requirements: unknown[];
  tests: CaseDefinition[];
  slug?: string;
  problems?: CodingProblem[];
};

export type Choice = { id: string; text: string };
export type Question = {
  id: string;
  prompt: string;
  choices: Choice[];
  correctChoiceId: string;
  explanation: string;
};

export type MultipleChoiceAssessment = {
  kind: "multiple-choice";
  topicId: string;
  revision: number;
  title: string;
  questions: Question[];
};

export type Assessment = CodingAssessment;
export type AnyAssessment = CodingAssessment | MultipleChoiceAssessment;

export const HELLO_TOPIC = "running-the-first-cangjie-program";
export const HELLO_PROBLEM = `${HELLO_TOPIC}/hello-world`;

export function getProblems(assessment: AnyAssessment): CodingProblem[] {
  if (
    "problems" in assessment &&
    Array.isArray(assessment.problems) &&
    assessment.problems.length > 0
  ) {
    return assessment.problems;
  }
  if (
    "tests" in assessment &&
    Array.isArray((assessment as CodingAssessment).tests)
  ) {
    const single = assessment as CodingAssessment;
    return [
      {
        problemId: single.problemId,
        slug:
          single.slug ||
          single.problemId.split("/")[1] ||
          single.problemId,
        topicId: single.topicId,
        revision: single.revision,
        title: single.title,
        statement: single.statement,
        starter: single.starter,
        languageVersion: single.languageVersion || "1.0.5",
        requirements: single.requirements || [],
        tests: single.tests,
      },
    ];
  }
  return [];
}

export function problemFromAssessment(
  assessment: AnyAssessment,
  problemId?: string,
): CodingProblem {
  const problems = getProblems(assessment);
  if (!problems.length) {
    throw new Error(`No coding problems available for topic.`);
  }
  if (!problemId) return problems[0];
  const found = problems.find(
    (p) => p.problemId === problemId || p.slug === problemId,
  );
  if (!found) {
    throw new Error(`Problem ${problemId} not found in topic.`);
  }
  return found;
}

export async function assessmentFor<T extends AnyAssessment = CodingAssessment>(
  client: pg.Pool | pg.PoolClient,
  topicId: string = HELLO_TOPIC,
  revision?: number,
): Promise<T> {
  const result = await client.query(
    "SELECT definition FROM assessment_revisions WHERE topic_id=$1 AND revision=COALESCE($2,(SELECT current_revision FROM topics WHERE id=$1))",
    [topicId, revision ?? null],
  );
  if (!result.rowCount) throw new Error("Published assessment is unavailable.");
  return result.rows[0].definition as T;
}
