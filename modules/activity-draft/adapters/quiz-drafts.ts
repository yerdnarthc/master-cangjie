import type pg from "pg";
import { randomUUID } from "node:crypto";
import {
  OperationError,
  type Actor,
} from "../../learner-account/application/actor.ts";
import { accessible } from "./postgres.ts";

export type QuizDraft = {
  answers: Record<string, string>;
  workRevision: number;
};

export type SaveQuizResult =
  | { kind: "saved"; workRevision: number; nextConflict?: Extract<SaveQuizResult, { kind: "conflict" }> | null }
  | {
      kind: "conflict";
      conflictId: string;
      server: QuizDraft;
      candidate: QuizDraft;
    };

export async function readOpenQuizConflict(
  client: pg.Pool | pg.PoolClient,
  actor: Actor,
  topicId: string,
  server: QuizDraft,
): Promise<Extract<SaveQuizResult, { kind: "conflict" }> | null> {
  const result = await client.query(
    `SELECT c.id, c.base_revision, c.candidate_answers
     FROM quiz_draft_conflicts c
     JOIN quiz_drafts d
       ON d.learner_id = c.learner_id AND d.topic_id = c.topic_id AND d.attempt_id = c.attempt_id
     WHERE c.learner_id=$1 AND c.topic_id=$2 AND c.resolved=false
     ORDER BY c.created_at, c.id LIMIT 1`,
    [actor.learnerId, topicId],
  );
  const row = result.rows[0];
  return row ? { kind: 'conflict', conflictId: row.id, server, candidate: { answers: row.candidate_answers, workRevision: row.base_revision } } : null;
}

function validateAnswers(
  answers: unknown,
): asserts answers is Record<string, string> {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    throw new OperationError(400, "Answers must be a valid key-value mapping.");
  }
  for (const [k, v] of Object.entries(answers)) {
    if (typeof k !== "string" || typeof v !== "string") {
      throw new OperationError(
        400,
        "Question IDs and selected choices must be strings.",
      );
    }
    if (k.length > 200 || v.length > 200) {
      throw new OperationError(400, "Identifier exceeds maximum length.");
    }
  }
}

function sameAnswers(first: Record<string, string>, second: Record<string, string>): boolean {
  const keys = Object.keys(first);
  return keys.length === Object.keys(second).length &&
    keys.every(key => Object.hasOwn(second, key) && first[key] === second[key]);
}

export async function readQuizDraft(
  client: pg.Pool | pg.PoolClient,
  actor: Actor,
  topicId: string,
  lock = false,
): Promise<QuizDraft> {
  await accessible(client, actor, topicId);
  const r = await client.query(
    "SELECT answers, work_revision FROM quiz_drafts WHERE learner_id=$1 AND topic_id=$2" +
      (lock ? " FOR UPDATE" : ""),
    [actor.learnerId, topicId],
  );
  const row = r.rows[0];
  if (!row) {
    throw new OperationError(409, "The quiz attempt must be initialized before loading its draft.");
  }
  return {
    answers: (row?.answers ?? {}) as Record<string, string>,
    workRevision: row?.work_revision ?? 0,
  };
}

export async function saveQuizDraftIn(
  client: pg.PoolClient,
  actor: Actor,
  topicId: string,
  request: { baseRevision: number; answers: Record<string, string> },
): Promise<SaveQuizResult> {
  validateAnswers(request.answers);
  if (!Number.isSafeInteger(request.baseRevision) || request.baseRevision < 0) {
    throw new OperationError(400, "Invalid base revision.");
  }

  const draft = await readQuizDraft(client, actor, topicId, true);
  if (draft.workRevision !== request.baseRevision) {
    // A lost save response can safely acknowledge identical answers.
    if (sameAnswers(draft.answers, request.answers)) {
      return { kind: "saved", workRevision: draft.workRevision };
    }
    const conflictId = randomUUID();
    const attempt = await client.query(
      "SELECT attempt_id FROM quiz_drafts WHERE learner_id=$1 AND topic_id=$2",
      [actor.learnerId, topicId],
    );
    await client.query(
      "INSERT INTO quiz_draft_conflicts(id, learner_id, topic_id, attempt_id, base_revision, candidate_answers) VALUES($1, $2, $3, $4, $5, $6)",
      [
        conflictId,
        actor.learnerId,
        topicId,
        attempt.rows[0].attempt_id,
        request.baseRevision,
        request.answers,
      ],
    );
    return {
      kind: "conflict",
      conflictId,
      server: draft,
      candidate: {
        answers: request.answers,
        workRevision: request.baseRevision,
      },
    };
  }

  // Update
  await client.query(
    "UPDATE quiz_drafts SET answers=$3, work_revision=work_revision+1, updated_at=now() WHERE learner_id=$1 AND topic_id=$2",
    [actor.learnerId, topicId, request.answers],
  );
  return { kind: "saved", workRevision: draft.workRevision + 1 };
}

export async function resolveQuizDraftIn(
  client: pg.PoolClient,
  actor: Actor,
  topicId: string,
  request: {
    conflictId: string;
    choice: "server" | "candidate";
    baseRevision: number;
  },
): Promise<SaveQuizResult> {
  if (!["server", "candidate"].includes(request.choice)) {
    throw new OperationError(400, "Choose a preserved draft.");
  }
  const draft = await readQuizDraft(client, actor, topicId, true);
  const r = await client.query(
    `SELECT * FROM quiz_draft_conflicts
     WHERE id=$1 AND learner_id=$2 AND topic_id=$3
       AND attempt_id=(SELECT attempt_id FROM quiz_drafts WHERE learner_id=$2 AND topic_id=$3)
       AND resolved=false FOR UPDATE`,
    [request.conflictId, actor.learnerId, topicId],
  );
  if (!r.rowCount) {
    throw new OperationError(409, "This draft conflict is no longer open.");
  }
  const conflict = r.rows[0];
  if (draft.workRevision !== request.baseRevision) {
    return {
      kind: "conflict",
      conflictId: conflict.id,
      server: draft,
      candidate: {
        answers: conflict.candidate_answers,
        workRevision: conflict.base_revision,
      },
    };
  }

  const answers =
    request.choice === "candidate" ? conflict.candidate_answers : draft.answers;
  await client.query(
    "UPDATE quiz_drafts SET answers=$3, work_revision=work_revision+1, updated_at=now() WHERE learner_id=$1 AND topic_id=$2",
    [actor.learnerId, topicId, answers],
  );
  await client.query(
    "UPDATE quiz_draft_conflicts SET resolved=true WHERE id=$1",
    [conflict.id],
  );
  const workRevision = draft.workRevision + 1;
  const nextConflict = await readOpenQuizConflict(client, actor, topicId, { answers, workRevision });
  return { kind: "saved", workRevision, nextConflict };
}
