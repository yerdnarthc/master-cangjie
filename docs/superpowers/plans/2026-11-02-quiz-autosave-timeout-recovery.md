# Quiz Autosave Timeout Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep quiz answer drafts recoverable and automatically synchronized after transient save failures, timeouts, reloads, and reconnection without overwriting newer or conflicting answers.

**Architecture:** Store quiz-local state in a quiz-specific IndexedDB store, including the latest answer map and the immutable request snapshot awaiting confirmation. The quiz workspace serializes saves, retries the same uncertain snapshot with bounded backoff, then sends newer answers against the acknowledged revision. Existing server behavior acknowledges an identical stale snapshot and returns a conflict for divergent work.

**Tech Stack:** TypeScript, React 19, Next.js, Dexie 4, Playwright 1.64, Vitest, PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-11-02-quiz-autosave-timeout-recovery-design.md`

## Global Constraints

- UC-12-AC2: changed answer selections must be recoverable on return.
- UC-16-AC2: offline edits remain unsynced until confirmed and conflicting work is not silently overwritten.
- INV-22: preserve conflicting drafts until learner choice.
- Keep the current 1.5-second debounce and 15-second request timeout.
- Retry transport failures, timeouts, HTTP 408, HTTP 429, and HTTP 5xx up to three times after the initial attempt, with delays of 1, 2, and 4 seconds. Do not automatically retry conflicts, HTTP 401, account-change errors, or other 4xx responses.
- Keep quiz retry metadata out of the shared coding-draft format. Preserve and migrate existing locally stored quiz answers when adding the quiz-specific IndexedDB store.
- Do not change the quiz draft API contract unless verification proves identical stale-answer replay is insufficient.
- Browser and database tests must use the dedicated `*_test` database. Run commands with one OS-matched Node/npm dependency tree; do not invoke Windows Node against WSL-installed packages or vice versa.
- Learner-facing status and recovery copy must follow `docs/content-style.md`.

## Review Focus

1. Existing dirty quiz answers in the current Dexie database survive the new store version and restore after reload. Test: `migrates a dirty legacy quiz draft and restores its answers` in Task 1.
2. A request fails while a newer selection exists, then the learner reloads; replay the exact pending snapshot first and sync newer answers at the acknowledged revision. Test: `replays a persisted pending quiz save before syncing newer answers after reload` in Task 1.
3. The server commits a draft but the browser loses its response; an identical replay confirms the existing revision without creating a conflict, then newer answers sync. Tests: `recovers a committed quiz save after its response is lost` in Task 2 and the PostgreSQL characterization test in Task 3.
4. Connectivity remains unavailable through the retry limit, then returns or the learner retries manually; keep the draft unsynced and bound the request count. Tests: `stops after three automatic retries and lets the learner retry manually` and `retries the pending quiz save when connectivity returns` in Task 2.
5. A conflict, expired session, account change, or browser-storage failure occurs; stop automatic retries, retain the learner's current answers, and never claim an uncertain save was confirmed. Tests: the conflict, authentication, and storage-failure journeys in Task 2.

---

### Task 1: Persist quiz-specific pending saves and recover them after reload

**Files:**

- Modify: `modules/activity-draft/adapters/browser-drafts.ts`
- Modify: `apps/web/src/components/quiz-workspace.tsx`
- Modify: `tests/journeys/quiz-autosave.spec.ts`
- Create: `tests/journeys/quiz-autosave-migration.spec.ts`

**Interfaces:**

- Add `QuizDraftSnapshot = { baseRevision: number; answers: Record<string, string> }`.
- Add `QuizLocalDraft = { key: string; learnerId: string; topicId: string; tabId: string; answers: Record<string, string>; baseRevision: number; dirty: boolean; pendingSave: QuizDraftSnapshot | null }`.
- Add `quizDrafts.read(learnerId, topicId, tabId): Promise<QuizLocalDraft | undefined>`.
- Add `quizDrafts.writeCurrent(learnerId, topicId, tabId, current: { answers: Record<string, string>; baseRevision: number; dirty: boolean }): Promise<void>`; preserve any existing `pendingSave` while updating the latest answer map.
- Add `quizDrafts.beginSave(learnerId, topicId, tabId, proposed: QuizDraftSnapshot): Promise<QuizDraftSnapshot>`; return the existing pending snapshot if one is already stored, otherwise persist and return `proposed`.
- Add `quizDrafts.acknowledge(learnerId, topicId, tabId, request: QuizDraftSnapshot, workRevision: number): Promise<QuizLocalDraft | undefined>`; clear only the matching pending snapshot, update the current base revision, and retain newer answers as dirty.
- Add `quizDrafts.clearPending(learnerId, topicId, tabId, request: QuizDraftSnapshot): Promise<void>` for a server-confirmed conflict; preserve the latest local answers.
- Add `quizDrafts.clear(learnerId, topicId, tabId): Promise<void>` for a confirmed submission or completed conflict resolution.
- Keep the existing `browserDrafts` interfaces and coding-draft records unchanged.

- [ ] **Step 1: Add the failing reload-recovery journey**

In `tests/journeys/quiz-autosave.spec.ts`, add `replays a persisted pending quiz save before syncing newer answers after reload`. Install `page.clock` before navigation. Select q0 and advance 1.5 seconds to start the first draft request; hold it, select q1, and advance another 1.5 seconds so its debounce is consumed while the first request is pending. Abort the first request and reload. Have the next response acknowledge the original q0 snapshot at revision 1. Assert the replay has the same `{ baseRevision: 0, answers: { q0: "a" } }` payload and the following request has `{ baseRevision: 1, answers: { q0: "a", q1: "b" } }`.

- [ ] **Step 2: Run the new journey and confirm it fails for missing pending-snapshot recovery**

Run: `npm run test:journeys -- tests/journeys/quiz-autosave.spec.ts --workers=1`

Expected: the new journey fails because the workspace does not persist and replay the exact in-flight snapshot after reload.

- [ ] **Step 3: Add the quiz-specific IndexedDB record and wire recovery**

In `modules/activity-draft/adapters/browser-drafts.ts`, add the `quizDrafts` object store in Dexie version 2 with the interfaces above. Do not change the shared `drafts` store record. In `quiz-workspace.tsx`, track the tab ID, load the quiz record, persist each latest answer through `writeCurrent`, and await queued local writes before calling `beginSave` and sending a request. Call `acknowledge` only after a valid `kind: "saved"` response. On reload, replay `pendingSave` before sending newer local answers. When a server conflict arrives, call `clearPending` for that exact request, preserve the latest local answer map, and let the existing conflict flow take control. Route all quiz-specific local-draft clearing in conflict resolution and confirmed submission through `quizDrafts.clear`.

- [ ] **Step 4: Run the reload-recovery journey and verify the request ordering**

Run: `npm run test:journeys -- tests/journeys/quiz-autosave.spec.ts --workers=1`

Expected: PASS; the original q0 request is replayed before the q0/q1 snapshot, and the newer save uses the server-confirmed revision.

- [ ] **Step 5: Add the failing legacy-draft migration journey**

In `tests/journeys/quiz-autosave-migration.spec.ts`, seed a version-1 `master-cangjie-work` database with one dirty `quiz:<topicId>:<tabId>` draft, set the matching `sessionStorage` tab ID, then open the activity. Assert the legacy selected answer is restored and remains recoverable after reload.

- [ ] **Step 6: Run the migration journey and confirm it fails before adding migration logic**

Run: `npm run test:journeys -- tests/journeys/quiz-autosave-migration.spec.ts --workers=1`

Expected: FAIL because the version-2 quiz store does not yet contain the legacy answer.

- [ ] **Step 7: Migrate valid legacy quiz rows during the Dexie upgrade**

In `browser-drafts.ts`, migrate legacy rows whose `problemId` starts with `quiz:` into `QuizLocalDraft` records, parsing `source` as answers and preserving `baseRevision` and `dirty`. Delete a legacy row only after its valid replacement is written. Leave all coding-draft and submission-request rows untouched; leave malformed quiz rows in the legacy store rather than discarding them.

- [ ] **Step 8: Run both browser recovery journeys and verify migration plus reload recovery**

Run: `npm run test:journeys -- tests/journeys/quiz-autosave.spec.ts tests/journeys/quiz-autosave-migration.spec.ts --workers=1`

Expected: both journeys pass; a dirty legacy answer remains selected after the Dexie upgrade, and an in-flight save is reconciled before newer local answers are sent.

- [ ] **Step 9: Commit the durable quiz-draft slice**

```bash
git add apps/web/src/components/quiz-workspace.tsx modules/activity-draft/adapters/browser-drafts.ts tests/journeys/quiz-autosave.spec.ts tests/journeys/quiz-autosave-migration.spec.ts
git commit -m "fix: persist pending quiz autosaves across reloads"
```

### Task 2: Retry transient failures and stabilize the browser journeys

**Files:**

- Modify: `apps/web/src/components/quiz-workspace.tsx`
- Modify: `tests/journeys/quiz-autosave.spec.ts`
- Modify: `tests/journeys/quiz-conflict-newer.spec.ts`
- Modify: `tests/journeys/quiz-autosave-persistence.spec.ts`

**Interfaces:**

- Consume `QuizDraftSnapshot` and `quizDrafts.beginSave` / `quizDrafts.acknowledge` from Task 1.
- Keep one pending network request per workspace. Retry the exact persisted `QuizDraftSnapshot`; do not add an API request identity.
- Reuse the existing **Save draft** action for learner-triggered recovery after automatic retries are exhausted.

- [ ] **Step 1: Add the failing timeout-retry browser journey**

In `tests/journeys/quiz-autosave.spec.ts`, add `retries a timed-out quiz save with the same snapshot before saving newer answers`. Install `page.clock` before navigation. After selecting q0, advance 1.5 seconds to start and hold the first request. Select q1, advance 1.5 seconds so its debounce is consumed, advance 15 seconds for the request timeout, then advance 1 second for the retry. Fulfill the retry, advance 1.5 seconds for the newer q0/q1 save, and assert the retry repeats the original payload and the newest answer uses the acknowledged work revision.

- [ ] **Step 2: Run the journey and confirm it fails because timeout currently stops autosaving**

Run: `npm run test:journeys -- tests/journeys/quiz-autosave.spec.ts --workers=1`

Expected: FAIL because the timed-out snapshot is not automatically retried.

- [ ] **Step 3: Implement one retry for a timed-out pending snapshot**

In `quiz-workspace.tsx`, add a component-owned retry timer and attempt counter. After an `AbortError` timeout, schedule the first replay after 1 second using the same persisted `QuizDraftSnapshot`; do not capture newer answers into that replay. Keep one request active at a time and retain the existing 15-second timeout.

- [ ] **Step 4: Run the timeout journey and verify snapshot identity and newer-answer ordering**

Run: `npm run test:journeys -- tests/journeys/quiz-autosave.spec.ts --workers=1`

Expected: the same pending payload is replayed; the newer answer is sent only after the saved revision is known; the UI reports a server save only after acknowledgement.

- [ ] **Step 5: Add the real-database journey for a committed save with a lost response**

In `tests/journeys/quiz-autosave-persistence.spec.ts`, add `recovers a committed quiz save after its response is lost`. Install `page.clock`. Let the first `/quiz/draft` request reach the real route with `route.fetch()`, then abort its browser response after the database commit. Make a newer answer selection while recovery is pending. Advance the clock explicitly through the 1.5-second debounce, 1-second retry, and subsequent 1.5-second debounce. Assert the retry repeats the exact original base revision and answers, then the latest answer is saved at the returned revision. Reload and verify both selections and the final draft revision through the workspace API.

- [ ] **Step 6: Run the real-database journey and confirm it fails without network-error retries**

Run: `npm run test:journeys -- tests/journeys/quiz-autosave-persistence.spec.ts --workers=1`

Expected: FAIL because the client does not retry after the response is dropped, even though the database committed the first request. Use only the dedicated `_test` database; reset only the test learner/topic draft as the existing spec does.

- [ ] **Step 7: Retry transient transport outcomes with the persisted request snapshot**

Extend retry classification in `quiz-workspace.tsx` to include fetch/network errors, HTTP 408, HTTP 429, and HTTP 5xx alongside timeouts. For each attempt, replay the same `{ baseRevision, answers }`. Preserve `pendingSave` until a saved response or conflict is confirmed. On a saved response, advance the revision, clear that pending request, and schedule the newest local answer map if it differs.

- [ ] **Step 8: Run both timeout and real-database lost-response journeys**

Run: `npm run test:journeys -- tests/journeys/quiz-autosave.spec.ts tests/journeys/quiz-autosave-persistence.spec.ts --workers=1`

Expected: both pass; the same pending snapshot is replayed and the real database's idempotent response confirms its existing revision before newer answers are saved.

- [ ] **Step 9: Add failing tests for retry exhaustion and reconnection**

Add these journeys in `quiz-autosave.spec.ts`:

- `stops after three automatic retries and lets the learner retry manually`: fail four attempts total, assert no fifth request appears until **Save draft** is clicked, then acknowledge that request.
- `retries the pending quiz save when connectivity returns`: after a retryable failure, dispatch one browser `online` event and assert exactly one immediate replay of the same request.

- [ ] **Step 10: Run the journeys and confirm the retry cap and reconnect path are missing**

Run: `npm run test:journeys -- tests/journeys/quiz-autosave.spec.ts --workers=1`

Expected: FAIL because the current retry is not capped at three and no connectivity-triggered attempt exists.

- [ ] **Step 11: Enforce the retry cap, backoff schedule, and online recovery**

In `quiz-workspace.tsx`, allow three retries after the initial attempt with 1-, 2-, and 4-second delays. Stop scheduling after the third retry and leave **Save draft** available as the manual recovery action. A manual retry cancels any waiting retry timer before dispatch. Register one `online` listener while a pending save exists; if a retry timer is waiting, cancel it and make one immediate attempt through the same single-flight guard. Do not let an online event start a second request while one is active. Reset the attempt counter after a confirmed save or explicit learner retry.

- [ ] **Step 12: Run the retry-limit and reconnect journeys and verify bounded request counts**

Run: `npm run test:journeys -- tests/journeys/quiz-autosave.spec.ts --workers=1`

Expected: no request is sent after four automatic attempts until manual retry or a new online transition; each recovery action replays the same pending payload once.

- [ ] **Step 13: Add browser coverage for terminal errors and storage failure**

Add `does not retry an expired-session or account-change response` and `keeps an unsynced answer visible when browser storage and the network fail` to `quiz-autosave.spec.ts`. Assert HTTP 401 and account-change HTTP 409 do not schedule retries, IndexedDB failure is reported, the selected answer remains on screen, and a failed/uncertain server request never displays a saved status.

- [ ] **Step 14: Run the journeys and identify the missing terminal-error feedback**

Run: `npm run test:journeys -- tests/journeys/quiz-autosave.spec.ts --workers=1`

Expected: the 401/account-change no-retry assertions pass with the retry classifier; the storage-failure feedback assertion fails until the warning and status handling are added.

- [ ] **Step 15: Stop retries on terminal outcomes and keep save status truthful**

In `quiz-workspace.tsx`, never retry conflicts, HTTP 401, account-change errors, or other 4xx responses. Use the workspace's expired-session state for 401. Keep current answers visible if IndexedDB fails, attempt the live save when possible, and display a separate storage warning. Show server-saved status only after an affirmative server acknowledgement.

- [ ] **Step 16: Run the terminal-error and storage-failure journeys**

Run: `npm run test:journeys -- tests/journeys/quiz-autosave.spec.ts --workers=1`

Expected: both pass; terminal errors produce no automatic retry, storage and network failures keep answers visible and unsynced, and no request is reported saved without confirmation.

- [ ] **Step 17: Make held-response journeys independent of Inspector wall time**

In `quiz-autosave.spec.ts`, `quiz-autosave-persistence.spec.ts`, and `quiz-conflict-newer.spec.ts`, install `page.clock` before navigation and replace `page.waitForTimeout(1700)` with explicit 1.5-second clock advances. Advance 1.5 seconds after the first selection in `quiz-conflict-newer.spec.ts` to start its held request. Capture each route response in an immutable local value before awaiting a held promise, so later requests cannot mutate the earlier response body.

- [ ] **Step 18: Run autosave and conflict journeys together**

Run: `npm run test:journeys -- tests/journeys/quiz-autosave.spec.ts tests/journeys/quiz-conflict-newer.spec.ts tests/journeys/quiz-autosave-persistence.spec.ts --workers=1`

Expected: autosave retry, exhaustion, reconnect, auth, storage-failure, pending-save, lost-response, and newer-conflict journeys pass without wall-clock sleeps controlling their request order.

- [ ] **Step 19: Commit the retry and deterministic-journey slice**

```bash
git add apps/web/src/components/quiz-workspace.tsx tests/journeys/quiz-autosave.spec.ts tests/journeys/quiz-conflict-newer.spec.ts tests/journeys/quiz-autosave-persistence.spec.ts
git commit -m "fix: retry quiz autosaves after transient failures"
```

### Task 3: Verify the PostgreSQL replay contract and record evidence

**Files:**

- Modify: `tests/integration/quiz-journey.test.ts`
- Create: `docs/development/quiz-autosave-timeout-recovery-verification.md`
- Modify: `docs/risk-register.md` under RISK-02

**Interfaces:**

- Use the existing `PostgresQuizSubmissions.saveDraft(actor, topicId, { baseRevision, answers })` boundary and `workspace(actor, topicId)` read; do not add persistence APIs unless the test demonstrates a contract gap.
- Use the dedicated `TEST_DATABASE_URL` ending in `_test`.

- [ ] **Step 1: Add a PostgreSQL characterization test for identical stale-snapshot replay**

In `tests/integration/quiz-journey.test.ts`, add `acknowledges an identical stale quiz draft replay and accepts a newer snapshot`. Save answers A at base revision 0, replay the exact same A snapshot at base revision 0, assert the replay returns the current revision without a conflict or revision increment, then save A+B at the returned revision and assert the workspace returns A+B at the next revision.

- [ ] **Step 2: Run the characterization test against dedicated PostgreSQL**

Run: `npm run test:integration -- tests/integration/quiz-journey.test.ts`

Expected: PASS using real PostgreSQL. If identical replay creates a conflict or advances the revision twice, stop and correct the server contract before accepting client retry behavior.

- [ ] **Step 3: Run full verification from one matching Node installation**

Run:

```bash
npm run check
npm run test:domain
npm run test:integration
npm run test:journeys -- --workers=1
```

Expected: all commands exit 0. Browser journeys use the dedicated `_test` database. Record exact totals, runtime, Node/npm platform, and any unavailable checks; do not infer real database behavior from mocked routes.

- [ ] **Step 4: Record verified behavior and remaining limits**

Create `docs/development/quiz-autosave-timeout-recovery-verification.md` following `docs/development/quiz-submission-recovery-verification.md`. Record exact red/green commands, full verification results, real PostgreSQL and browser evidence, and limits. Add a dated evidence entry under RISK-02 in `docs/risk-register.md`; keep RISK-02 open for unrelated worker and full coding-path recovery evidence.

- [ ] **Step 5: Commit the PostgreSQL characterization and evidence**

```bash
git add tests/integration/quiz-journey.test.ts docs/development/quiz-autosave-timeout-recovery-verification.md docs/risk-register.md
git commit -m "test: verify quiz autosave recovery with PostgreSQL"
```

### Final review

- [ ] Re-read the approved design and this plan; account for each goal, retry class, recovery action, migration, and Review Focus test.
- [ ] Run `git diff --check` and inspect the complete diff. Stage only the files listed in the scoped commits; preserve unrelated working-tree changes, including generated Next.js files.
- [ ] Request an independent code review after implementation and resolve any Critical or Important findings before marking autosave recovery complete.
