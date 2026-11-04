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
  attemptId?: string;
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
export type QuizRetryIntent = Readonly<{
  sourceSubmissionId: string;
  expectedAttemptId: string;
  baseRevision: number;
}>;
export type QuizRetryReceipt = Readonly<{ attemptId: string; workRevision: number }>;
export type PendingQuizRetry = Readonly<{
  key: string;
  learnerId: string;
  topicId: string;
  intent: QuizRetryIntent;
  receipt?: QuizRetryReceipt;
}>;
const key = (learnerId: string, problemId: string) =>
  JSON.stringify([learnerId, problemId]);
const quizProblemId = (topicId: string, tabId: string) => `quiz:${topicId}:${tabId}`;
const quizDraftKey = (learnerId: string, topicId: string, tabId: string, attemptId: string | null) =>
  JSON.stringify([learnerId, quizProblemId(topicId, tabId), attemptId ?? "legacy"]);
const quizSubmissionKey = (learnerId: string, topicId: string, attemptId: string) =>
  key(learnerId, `quiz-submit:${topicId}:${attemptId}`);
const legacyQuizSubmissionKey = (learnerId: string, topicId: string) =>
  key(learnerId, `quiz-submit:${topicId}`);
const quizRetryKey = (learnerId: string, topicId: string, sourceSubmissionId: string) =>
  key(learnerId, `quiz-retry:${topicId}:${sourceSubmissionId}`);
export type QuizDraftSnapshot = {
  /** Null only for a pre-attempt pending save whose original hash must be replayed unchanged. */
  attemptId: string | null;
  baseRevision: number;
  answers: Record<string, string>;
};
export type QuizLocalDraft = {
  key: string;
  learnerId: string;
  topicId: string;
  tabId: string;
  /** Null means this local row has not yet been safely associated with a server attempt. */
  attemptId: string | null;
  answers: Record<string, string>;
  baseRevision: number;
  dirty: boolean;
  pendingSave: QuizDraftSnapshot | null;
};
type BrowserDatabase = Dexie & {
  drafts: EntityTable<LocalDraft, "key">;
  requests: EntityTable<PendingRequest, "key">;
  quizDrafts: EntityTable<QuizLocalDraft, "key">;
  quizRetryRequests: EntityTable<PendingQuizRetry, "key">;
};
let database: BrowserDatabase | undefined;

function parseLegacyAnswers(source: unknown): Record<string, string> | undefined {
  if (typeof source !== "string") return undefined;
  try {
    const value: unknown = JSON.parse(source);
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    if (Object.values(value).some((answer) => typeof answer !== "string")) return undefined;
    return value as Record<string, string>;
  } catch {
    return undefined;
  }
}

function migrateLegacyQuizDraft(draft: LocalDraft): QuizLocalDraft | undefined {
  if (typeof draft.problemId !== "string" || typeof draft.learnerId !== "string" ||
      typeof draft.dirty !== "boolean" || !Number.isSafeInteger(draft.baseRevision) ||
      draft.baseRevision < 0) return undefined;
  const parts = draft.problemId.split(":");
  if (parts.length !== 3 || parts[0] !== "quiz" || !parts[1] || !parts[2]) return undefined;
  const answers = parseLegacyAnswers(draft.source);
  if (!answers) return undefined;
  return {
    key: quizDraftKey(draft.learnerId, parts[1], parts[2], null),
    learnerId: draft.learnerId,
    topicId: parts[1],
    tabId: parts[2],
    attemptId: null,
    answers,
    baseRevision: draft.baseRevision,
    dirty: draft.dirty,
    pendingSave: null,
  };
}

function db() {
  if (!database) {
    database = new Dexie("master-cangjie-work") as BrowserDatabase;
    database
      .version(1)
      .stores({ drafts: "key,learnerId", requests: "key,learnerId" });
    database
      .version(2)
      .stores({
        drafts: "key,learnerId",
        requests: "key,learnerId",
        quizDrafts: "key,learnerId,topicId,tabId",
      })
      .upgrade(async (transaction) => {
        const drafts = transaction.table("drafts");
        const quizDrafts = transaction.table("quizDrafts");
        const legacyRows = (await drafts.toArray()) as LocalDraft[];
        for (const legacy of legacyRows) {
          const migrated = migrateLegacyQuizDraft(legacy);
          if (!migrated) continue;
          await quizDrafts.put(migrated);
          await drafts.delete(legacy.key);
        }
      });
    database
      .version(3)
      .stores({
        drafts: "key,learnerId",
        requests: "key,learnerId",
        quizDrafts: "key,learnerId,topicId,tabId,attemptId",
        quizRetryRequests: "key,learnerId,topicId",
      })
      .upgrade(async (transaction) => {
        const quizDrafts = transaction.table("quizDrafts");
        const existingRows = await quizDrafts.toArray() as Array<QuizLocalDraft & { attemptId?: string | null }>;
        for (const row of existingRows) {
          const attemptId = row.attemptId ?? null;
          const scopedKey = quizDraftKey(row.learnerId, row.topicId, row.tabId, attemptId);
          if (row.key === scopedKey && row.attemptId === attemptId) continue;
          await quizDrafts.delete(row.key);
          await quizDrafts.put({ ...row, key: scopedKey, attemptId });
        }
      });
  }
  return database;
}
export const quizDrafts = {
  async read(
    learnerId: string,
    topicId: string,
    tabId: string,
    attemptId: string,
    isLegacyAttempt: boolean,
  ): Promise<QuizLocalDraft | undefined> {
    const database = db();
    const activeKey = quizDraftKey(learnerId, topicId, tabId, attemptId);
    return database.transaction("rw", database.quizDrafts, async () => {
      const active = await database.quizDrafts.get(activeKey);
      if (active) return active;
      if (!isLegacyAttempt) return undefined;
      const unboundKey = quizDraftKey(learnerId, topicId, tabId, null);
      const unbound = await database.quizDrafts.get(unboundKey);
      if (!unbound) return undefined;
      const rebound: QuizLocalDraft = { ...unbound, key: activeKey, attemptId };
      await database.quizDrafts.delete(unboundKey);
      await database.quizDrafts.put(rebound);
      return rebound;
    });
  },
  async readObsolete(
    learnerId: string,
    topicId: string,
    tabId: string,
    activeAttemptId: string,
  ): Promise<QuizLocalDraft[]> {
    const rows = await db().quizDrafts.where("learnerId").equals(learnerId).toArray();
    return rows.filter(row => row.topicId === topicId && row.tabId === tabId &&
      row.attemptId !== activeAttemptId && (row.dirty || !!row.pendingSave));
  },
  async writeCurrent(
    learnerId: string,
    topicId: string,
    tabId: string,
    attemptId: string,
    current: { answers: Record<string, string>; baseRevision: number; dirty: boolean },
  ): Promise<void> {
    const database = db();
    const storageKey = quizDraftKey(learnerId, topicId, tabId, attemptId);
    await database.transaction("rw", database.quizDrafts, async () => {
      const previous = await database.quizDrafts.get(storageKey);
      await database.quizDrafts.put({
        key: storageKey,
        learnerId,
        topicId,
        tabId,
        attemptId,
        answers: { ...current.answers },
        baseRevision: current.baseRevision,
        dirty: current.dirty || !!previous?.pendingSave,
        pendingSave: previous?.pendingSave ?? null,
      });
    });
  },
  async beginSave(
    learnerId: string,
    topicId: string,
    tabId: string,
    activeAttemptId: string,
    proposed: QuizDraftSnapshot,
  ): Promise<QuizDraftSnapshot> {
    const database = db();
    const storageKey = quizDraftKey(learnerId, topicId, tabId, activeAttemptId);
    return database.transaction("rw", database.quizDrafts, async () => {
      const existing = await database.quizDrafts.get(storageKey);
      if (existing?.pendingSave) return existing.pendingSave;
      const pendingSave = { ...proposed, answers: { ...proposed.answers } };
      await database.quizDrafts.put({
        key: storageKey,
        learnerId,
        topicId,
        tabId,
        attemptId: activeAttemptId,
        answers: existing?.answers ?? { ...proposed.answers },
        baseRevision: existing?.baseRevision ?? proposed.baseRevision,
        dirty: true,
        pendingSave,
      });
      return pendingSave;
    });
  },
  async acknowledge(
    learnerId: string,
    topicId: string,
    tabId: string,
    activeAttemptId: string,
    request: QuizDraftSnapshot,
    workRevision: number,
  ): Promise<QuizLocalDraft | undefined> {
    const database = db();
    const storageKey = quizDraftKey(learnerId, topicId, tabId, activeAttemptId);
    return database.transaction("rw", database.quizDrafts, async () => {
      const existing = await database.quizDrafts.get(storageKey);
      if (!existing) return undefined;
      if (!sameQuizSnapshot(existing.pendingSave, request)) return existing;
      const updated: QuizLocalDraft = {
        ...existing,
        baseRevision: workRevision,
        dirty: !sameAnswerMaps(existing.answers, request.answers),
        pendingSave: null,
      };
      await database.quizDrafts.put(updated);
      return updated;
    });
  },
  async clearPending(
    learnerId: string,
    topicId: string,
    tabId: string,
    activeAttemptId: string,
    request: QuizDraftSnapshot,
  ): Promise<void> {
    const database = db();
    const storageKey = quizDraftKey(learnerId, topicId, tabId, activeAttemptId);
    await database.transaction("rw", database.quizDrafts, async () => {
      const existing = await database.quizDrafts.get(storageKey);
      if (!existing || !sameQuizSnapshot(existing.pendingSave, request)) return;
      await database.quizDrafts.put({ ...existing, dirty: true, pendingSave: null });
    });
  },
  async clear(learnerId: string, topicId: string, tabId: string, attemptId: string): Promise<void> {
    await db().quizDrafts.delete(quizDraftKey(learnerId, topicId, tabId, attemptId));
  },
};

function sameAnswerMaps(first: Record<string, string>, second: Record<string, string>): boolean {
  const keys = Object.keys(first);
  return keys.length === Object.keys(second).length &&
    keys.every((questionId) => Object.hasOwn(second, questionId) && first[questionId] === second[questionId]);
}

function sameQuizSnapshot(
  first: QuizDraftSnapshot | null | undefined,
  second: QuizDraftSnapshot,
): boolean {
  return !!first && first.attemptId === second.attemptId && first.baseRevision === second.baseRevision &&
    sameAnswerMaps(first.answers, second.answers);
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
  async read(
    learnerId: string,
    topicId: string,
    activeAttemptId: string,
    isLegacyAttempt: boolean,
  ): Promise<PendingQuizSubmission | null> {
    const database = db();
    const scopedKey = quizSubmissionKey(learnerId, topicId, activeAttemptId);
    return database.transaction("rw", database.requests, async () => {
      const current = await database.requests.get(scopedKey);
      if (current) return parsePendingQuizSubmission(current.body);
      if (!isLegacyAttempt) return null;
      const legacy = await database.requests.get(legacyQuizSubmissionKey(learnerId, topicId));
      if (!legacy) return null;
      const problemId = `quiz-submit:${topicId}:${activeAttemptId}`;
      const rebound = { ...legacy, key: scopedKey, problemId };
      await database.requests.delete(legacy.key);
      await database.requests.put(rebound);
      return parsePendingQuizSubmission(rebound.body);
    });
  },
  async readAll(learnerId: string, topicId: string): Promise<PendingQuizSubmission[]> {
    const rows = await db().requests.where("learnerId").equals(learnerId).toArray();
    return rows
      .filter(row => row.problemId === `quiz-submit:${topicId}` || row.problemId.startsWith(`quiz-submit:${topicId}:`))
      .map(row => parsePendingQuizSubmission(row.body));
  },
  async claim(
    learnerId: string,
    topicId: string,
    activeAttemptId: string,
    request: QuizSubmissionRequest,
    baseRevision: number,
    owner: string,
  ): Promise<{ pending: PendingQuizSubmission; created: boolean }> {
    const database = db();
    const problemId = `quiz-submit:${topicId}:${activeAttemptId}`;
    const storageKey = quizSubmissionKey(learnerId, topicId, activeAttemptId);
    return database.transaction('rw', database.requests, async () => {
      const existing = await database.requests.get(storageKey);
      if (existing) return { pending: parsePendingQuizSubmission(existing.body), created: false };
      const pending: PendingQuizSubmission = { request, baseRevision, phase: 'preparing', owner, leaseUntil: Date.now() + 30000 };
      await database.requests.add({ key: storageKey, learnerId, problemId, url: `/api/topics/${encodeURIComponent(topicId)}/quiz/submit`, body: serializePendingQuizSubmission(pending) });
      return { pending, created: true };
    });
  },
  async acquire(learnerId: string, topicId: string, activeAttemptId: string, requestKey: string, owner: string): Promise<{ kind: 'gone' | 'busy' | 'owned' | 'ready'; pending?: PendingQuizSubmission }> {
    const database = db();
    const storageKey = quizSubmissionKey(learnerId, topicId, activeAttemptId);
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
  async setReady(learnerId: string, topicId: string, activeAttemptId: string, requestKey: string, owner: string): Promise<boolean> {
    const database = db();
    const storageKey = quizSubmissionKey(learnerId, topicId, activeAttemptId);
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
  async releasePreparation(learnerId: string, topicId: string, activeAttemptId: string, requestKey: string, owner: string, cancel = false): Promise<boolean> {
    const database = db();
    const storageKey = quizSubmissionKey(learnerId, topicId, activeAttemptId);
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
  async clear(learnerId: string, topicId: string, activeAttemptId: string, requestKey: string): Promise<void> {
    const database = db();
    const storageKey = quizSubmissionKey(learnerId, topicId, activeAttemptId);
    await database.transaction('rw', database.requests, async () => {
      const existing = await database.requests.get(storageKey);
      if (existing && existing.body.requestKey === requestKey) await database.requests.delete(storageKey);
    });
  },
};

export const quizRetryRequests = {
  async readAll(learnerId: string, topicId: string): Promise<PendingQuizRetry[]> {
    const rows = await db().quizRetryRequests.where("learnerId").equals(learnerId).toArray();
    return rows.filter(row => row.topicId === topicId);
  },
  async claim(learnerId: string, topicId: string, intent: QuizRetryIntent): Promise<PendingQuizRetry> {
    const database = db();
    const storageKey = quizRetryKey(learnerId, topicId, intent.sourceSubmissionId);
    return database.transaction("rw", database.quizRetryRequests, async () => {
      const existing = await database.quizRetryRequests.get(storageKey);
      if (existing) {
        if (existing.intent.expectedAttemptId !== intent.expectedAttemptId ||
            existing.intent.baseRevision !== intent.baseRevision) {
          throw new Error("A Retry for this submission is already being recovered.");
        }
        return existing;
      }
      const pending: PendingQuizRetry = { key: storageKey, learnerId, topicId, intent };
      await database.quizRetryRequests.add(pending);
      return pending;
    });
  },
  async recordReceipt(learnerId: string, topicId: string, sourceSubmissionId: string, receipt: QuizRetryReceipt): Promise<void> {
    const database = db();
    const storageKey = quizRetryKey(learnerId, topicId, sourceSubmissionId);
    await database.transaction("rw", database.quizRetryRequests, async () => {
      const pending = await database.quizRetryRequests.get(storageKey);
      if (pending) await database.quizRetryRequests.put({ ...pending, receipt });
    });
  },
  async clear(learnerId: string, topicId: string, sourceSubmissionId: string): Promise<void> {
    await db().quizRetryRequests.delete(quizRetryKey(learnerId, topicId, sourceSubmissionId));
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
  if (body.attemptId !== undefined && typeof body.attemptId !== 'string') {
    throw new Error('The saved submission could not be read. Your earlier result may still be recorded.');
  }
  return {
    attemptId: body.attemptId as string | undefined,
    requestKey: body.requestKey,
    assessmentRevision: Number(body.assessmentRevision),
    answers: answers as Record<string, string>,
  };
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
