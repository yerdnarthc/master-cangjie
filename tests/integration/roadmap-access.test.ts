import { afterAll, beforeAll, expect, it } from "vitest";
import type pg from "pg";
import { PostgresSubmissions } from "../../modules/topic-submission/adapters/postgres.ts";
import { freshFixture, testDatabase } from "./database.ts";

const topicIds = [
  "getting-started-with-cangjie",
  "installing-the-cangjie-toolchain",
  "running-the-first-cangjie-program",
  "identifiers",
  "program-structure",
  "expressions",
  "functions",
];

let pool: pg.Pool;
let submissions: PostgresSubmissions;

beforeAll(async () => {
  pool = await testDatabase();
  submissions = new PostgresSubmissions(pool);
});

afterAll(async () => {
  await pool?.end();
});

it("returns ordered topic access and immediate prerequisites from the first-topic fixture", async () => {
  const actor = await freshFixture(pool);

  const access = await submissions.roadmapAccess(actor);

  expect(access.filter(({ topicId }) => topicIds.includes(topicId))).toEqual(
    topicIds.map((topicId, index) => ({
      topicId,
      available: index === 0,
      completed: false,
      awaitingCompletion: false,
      prerequisiteTopicId: topicIds[index - 1] ?? null,
    })),
  );
});

it("reports persisted progress and treats a missing progress row as locked", async () => {
  const actor = await freshFixture(pool);
  await pool.query(
    `UPDATE learner_topic_progress
     SET available = true, completed = false, best_score = $3::jsonb
     WHERE learner_id = $1 AND topic_id = $2`,
    [actor.learnerId, topicIds[1], JSON.stringify({ earned: 60, possible: 100 })],
  );
  await pool.query(
    `UPDATE learner_topic_progress
     SET best_score = $3::jsonb
     WHERE learner_id = $1 AND topic_id = $2`,
    [actor.learnerId, topicIds[0], JSON.stringify({ earned: 50, possible: 100 })],
  );
  await pool.query(
    `UPDATE learner_topic_progress
     SET available = true, completed = true, best_score = $3::jsonb
     WHERE learner_id = $1 AND topic_id = $2`,
    [actor.learnerId, topicIds[3], JSON.stringify({ earned: 80, possible: 100 })],
  );
  await pool.query(
    `DELETE FROM learner_topic_progress
     WHERE learner_id = $1 AND topic_id = $2`,
    [actor.learnerId, topicIds.at(-1)],
  );

  const access = await submissions.roadmapAccess(actor);

  expect(access.find(({ topicId }) => topicId === topicIds[1])).toEqual({
    topicId: topicIds[1],
    available: true,
    completed: false,
    awaitingCompletion: false,
    prerequisiteTopicId: topicIds[0],
  });
  expect(access.find(({ topicId }) => topicId === topicIds[0])?.awaitingCompletion).toBe(false);
  expect(access.find(({ topicId }) => topicId === topicIds[3])).toEqual({
    topicId: topicIds[3],
    available: true,
    completed: true,
    awaitingCompletion: false,
    prerequisiteTopicId: topicIds[2],
  });
  expect(access.find(({ topicId }) => topicId === topicIds.at(-1))).toEqual({
    topicId: topicIds.at(-1),
    available: false,
    completed: false,
    awaitingCompletion: false,
    prerequisiteTopicId: topicIds.at(-2),
  });
});
