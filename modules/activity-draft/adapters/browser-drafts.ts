'use client';
import Dexie, { type EntityTable } from 'dexie';

export type LocalDraft = { key: string; learnerId: string; problemId: string; source: string; baseRevision: number; dirty: boolean };
export type PendingRequest = { key: string; learnerId: string; problemId: string; url: string;
  body: Record<string, unknown>; operationId?: string };
const key = (learnerId: string, problemId: string) => JSON.stringify([learnerId, problemId]);
type BrowserDatabase = Dexie & { drafts: EntityTable<LocalDraft, 'key'>; requests: EntityTable<PendingRequest, 'key'> };
let database: BrowserDatabase | undefined;
function db() {
  if (!database) {
    database = new Dexie('master-cangjie-work') as BrowserDatabase;
    database!.version(1).stores({ drafts: 'key,learnerId', requests: 'key,learnerId' });
  }
  return database!;
}
export const browserDrafts = {
  key,
  read: (learnerId: string, problemId: string) => db().drafts.get(key(learnerId, problemId)),
  save: (draft: Omit<LocalDraft, 'key'>) => db().drafts.put({ ...draft, key: key(draft.learnerId, draft.problemId) }),
  pending: (learnerId: string, problemId: string) => db().requests.get(key(learnerId, problemId)),
  rememberRequest: (request: Omit<PendingRequest, 'key'>) => db().requests.put({ ...request, key: key(request.learnerId, request.problemId) }),
  forgetRequest: (learnerId: string, problemId: string) => db().requests.delete(key(learnerId, problemId)),
};
