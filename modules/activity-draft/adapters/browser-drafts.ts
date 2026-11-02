"use client";
import Dexie, { type EntityTable } from "dexie";

export type LocalDraft = {
  key: string;
  learnerId: string;
  problemId: string;
  source: string;
  baseRevision: number;
  dirty: boolean;
};
export type PendingRequest = {
  key: string;
  learnerId: string;
  problemId: string;
  url: string;
  body: Record<string, unknown>;
  operationId?: string;
};
export type QuizSubmissionRequest = {
  requestKey: string;
  answers: Record<string, string>;
  assessmentRevision: number;
};
export type PendingQuizSubmission = {
  request: QuizSubmissionRequest;
  phase: 'preparing' | 'ready';
  baseRevision: number;
  owner: string;
  leaseUntil: number;
};
const key = (learnerId: string, problemId: string) =>
  JSON.stringify([learnerId, problemId]);
type BrowserDatabase = Dexie & {
  drafts: EntityTable<LocalDraft, "key">;
  requests: EntityTable<PendingRequest, "key">;
};
let database: BrowserDatabase | undefined;
function db() {
  if (!database) {
    database = new Dexie("master-cangjie-work") as BrowserDatabase;
    database!
      .version(1)
      .stores({ drafts: "key,learnerId", requests: "key,learnerId" });
  }
  return database!;
}
export const browserDrafts = {
  key,
  read: (learnerId: string, problemId: string) =>
    db().drafts.get(key(learnerId, problemId)),
  save: (draft: Omit<LocalDraft, "key">) =>
    db().drafts.put({ ...draft, key: key(draft.learnerId, draft.problemId) }),
  pending: (learnerId: string, problemId: string) =>
    db().requests.get(key(learnerId, problemId)),
  rememberRequest: (request: Omit<PendingRequest, "key">) =>
    db().requests.put({
      ...request,
      key: key(request.learnerId, request.problemId),
    }),
  forgetRequest: (learnerId: string, problemId: string) =>
    db().requests.delete(key(learnerId, problemId)),
};

// A single account/topic slot is shared by tabs. Claim and release are atomic.
export const quizSubmissionRequests = {
  async read(learnerId: string, topicId: string): Promise<PendingQuizSubmission | null> {
    const entry = await db().requests.get(key(learnerId, `quiz-submit:${topicId}`));
    return entry ? parsePendingQuizSubmission(entry.body) : null;
  },
  async claim(learnerId: string, topicId: string, request: QuizSubmissionRequest, baseRevision: number, owner: string): Promise<{ pending: PendingQuizSubmission; created: boolean }> {
    const database = db();
    const problemId = `quiz-submit:${topicId}`;
    return database.transaction('rw', database.requests, async () => {
      const existing = await database.requests.get(key(learnerId, problemId));
      if (existing) return { pending: parsePendingQuizSubmission(existing.body), created: false };
      const pending: PendingQuizSubmission = { request, baseRevision, phase: 'preparing', owner, leaseUntil: Date.now() + 30000 };
      await database.requests.add({ key: key(learnerId, problemId), learnerId, problemId, url: `/api/topics/${encodeURIComponent(topicId)}/quiz/submit`, body: serializePendingQuizSubmission(pending) });
      return { pending, created: true };
    });
  },
  async acquire(learnerId: string, topicId: string, requestKey: string, owner: string): Promise<{ kind: 'gone' | 'busy' | 'owned' | 'ready'; pending?: PendingQuizSubmission }> {
    const database = db();
    const storageKey = key(learnerId, `quiz-submit:${topicId}`);
    return database.transaction('rw', database.requests, async () => {
      const entry = await database.requests.get(storageKey);
      if (!entry) return { kind: 'gone' };
      const pending = parsePendingQuizSubmission(entry.body);
      if (pending.request.requestKey !== requestKey) return { kind: 'gone' };
      if (pending.phase === 'ready') return { kind: 'ready', pending };
      if (pending.owner !== owner && pending.leaseUntil > Date.now()) return { kind: 'busy', pending };
      const acquired: PendingQuizSubmission = { ...pending, owner, leaseUntil: Date.now() + 30000 };
      await database.requests.put({ ...entry, body: serializePendingQuizSubmission(acquired) });
      return { kind: 'owned', pending: acquired };
    });
  },
  async setReady(learnerId: string, topicId: string, requestKey: string, owner: string): Promise<boolean> {
    const database = db();
    const storageKey = key(learnerId, `quiz-submit:${topicId}`);
    return database.transaction('rw', database.requests, async () => {
      const entry = await database.requests.get(storageKey);
      if (!entry) return false;
      const pending = parsePendingQuizSubmission(entry.body);
      if (pending.request.requestKey !== requestKey) return false;
      if (pending.phase === 'ready') return true;
      if (pending.owner !== owner) return false;
      await database.requests.put({ ...entry, body: serializePendingQuizSubmission({ ...pending, phase: 'ready' }) });
      return true;
    });
  },
  async releasePreparation(learnerId: string, topicId: string, requestKey: string, owner: string, cancel = false): Promise<boolean> {
    const database = db();
    const storageKey = key(learnerId, `quiz-submit:${topicId}`);
    return database.transaction('rw', database.requests, async () => {
      const entry = await database.requests.get(storageKey);
      if (!entry) return false;
      const pending = parsePendingQuizSubmission(entry.body);
      if (pending.request.requestKey !== requestKey || pending.phase !== 'preparing' || pending.owner !== owner) return false;
      if (cancel) await database.requests.delete(storageKey);
      else await database.requests.put({ ...entry, body: serializePendingQuizSubmission({ ...pending, leaseUntil: 0 }) });
      return true;
    });
  },
  async clear(learnerId: string, topicId: string, requestKey: string): Promise<void> {
    const database = db();
    const storageKey = key(learnerId, `quiz-submit:${topicId}`);
    await database.transaction('rw', database.requests, async () => {
      const existing = await database.requests.get(storageKey);
      if (existing && existing.body.requestKey === requestKey) await database.requests.delete(storageKey);
    });
  },
};

function parseQuizSubmission(body: Record<string, unknown>): QuizSubmissionRequest {
  const answers = body.answers;
  if (typeof body.requestKey !== 'string' || !body.requestKey ||
      !Number.isSafeInteger(body.assessmentRevision) || Number(body.assessmentRevision) < 0 ||
      !answers || typeof answers !== 'object' || Array.isArray(answers) ||
      Object.values(answers).some(value => typeof value !== 'string')) {
    throw new Error('The saved submission could not be read. Your earlier result may still be recorded.');
  }
  return { requestKey: body.requestKey, assessmentRevision: Number(body.assessmentRevision), answers: answers as Record<string, string> };
}

function serializePendingQuizSubmission(pending: PendingQuizSubmission): Record<string, unknown> {
  return { ...pending.request, recovery: { phase: pending.phase, baseRevision: pending.baseRevision, owner: pending.owner, leaseUntil: pending.leaseUntil } };
}

function parsePendingQuizSubmission(body: Record<string, unknown>): PendingQuizSubmission {
  const request = parseQuizSubmission(body);
  if (body.recovery === undefined) return { request, phase: 'ready', baseRevision: 0, owner: '', leaseUntil: 0 };
  const recovery = body.recovery as Record<string, unknown> | null;
  if (!recovery || !['preparing', 'ready'].includes(String(recovery.phase)) ||
      !Number.isSafeInteger(recovery.baseRevision) || Number(recovery.baseRevision) < 0 ||
      typeof recovery.owner !== 'string' || typeof recovery.leaseUntil !== 'number' || !Number.isFinite(recovery.leaseUntil)) {
    throw new Error('The saved submission could not be read. Your earlier result may still be recorded.');
  }
  return { request, phase: recovery.phase as 'preparing' | 'ready', baseRevision: Number(recovery.baseRevision), owner: recovery.owner, leaseUntil: recovery.leaseUntil };
}
