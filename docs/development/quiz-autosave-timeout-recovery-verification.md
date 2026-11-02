# Quiz autosave timeout recovery verification

Date: 2026-11-02  
Branch: `fix/quiz-autosave-timeout-recovery` in an isolated worktree  
Base: `f0422ef`  
Runtime: Windows Node `v24.22.1`, npm `12.2.1`, Vitest `5.0.5`, Playwright `1.64.1`, Chromium

## Scope

Verifies that quiz answers remain recoverable when an autosave times out, loses
its response, encounters transient service or network failure, or resumes after
connectivity returns. The browser persists an immutable pending answer snapshot,
replays it before newer answers, and advances the revision only after an
affirmative server response. This covers quiz-draft autosave behavior under
UC-12-AC2, UC-16-AC2, and INV-22. It does not verify the coding evaluator or
worker recovery path; RISK-02 remains In progress.

## Implementation under verification

- Dexie v2 adds a quiz-specific local-draft store with the latest answer map and
  pending save snapshot. Its upgrade migrates valid legacy quiz rows and leaves
  coding drafts, malformed quiz rows, and pending submission records intact.
- Quiz saves retain the exact `{ baseRevision, answers }` snapshot across reload
  and uncertain responses. Newer edits wait until the pending snapshot is
  acknowledged, then save at the returned revision.
- Request timeouts remain 15 seconds and the answer debounce remains 1.5
  seconds. Transport failures and HTTP 408, 429, and 5xx receive up to three
  automatic retries after the initial attempt, with delays of 1, 2, and 4
  seconds.
- Conflicts, expired sessions, account-change responses, and other 4xx errors
  do not schedule automatic retries. After exhaustion, the **Save draft**
  action or a browser `online` event can replay the pending snapshot.
- If IndexedDB fails, the activity still opens from the server, keeps current
  answers visible, attempts the live save using the in-memory snapshot, and
  displays a separate storage warning. An unconfirmed request is never reported
  as saved.

## Verification results

| Check | Result |
| --- | --- |
| `npm run check` | Passed TypeScript and architecture-boundary checks. |
| `npm run test:domain` | 3 files, 56 tests passed. |
| `npm run test:integration -- tests/integration/quiz-journey.test.ts` | 1 file, 4 tests passed against PostgreSQL, including identical stale-snapshot replay and a newer snapshot. |
| `npm run test:integration` | 12 files passed, 1 skipped; 32 tests passed, 6 skipped. Separate app, migration, and worker roles were configured against the dedicated test database. |
| Scoped browser command below | 11 Chromium journeys passed (37 seconds), including real database lost-response replay, timeout retries, retry exhaustion/manual retry, reconnect, 401/409 terminal handling, storage+network failure, conflict recovery, and held-save answer preservation. |
| `git diff --check` | Passed with no whitespace errors. |
| Full `npm run test:journeys -- --workers=1` | Not green and not completed. The run started 51 journeys; the first two passed, then seven coding-workflow journeys failed. It was stopped after repeated two-minute failures, before reaching the quiz journeys. See the separate findings below. |

The scoped browser command was:

```text
npm run test:journeys -- tests/journeys/quiz-autosave.spec.ts tests/journeys/quiz-conflict-newer.spec.ts tests/journeys/quiz-autosave-persistence.spec.ts --workers=1
```

It used `TEST_DATABASE_URL` ending in `_test`, a Windows Node/npm dependency
tree, and the test host on `127.0.0.1:3001`. The database-backed journeys
deleted only the development learner's draft for the tested topic. PostgreSQL
confirmed that an exact stale replay returns revision 1 without a conflict or
revision increment; the subsequent newer snapshot saves at revision 2.

## Full browser-suite findings

The complete browser suite is not yet verified. These failures are outside the
quiz-autosave implementation and remain open:

- `tests/journeys/hello-world-recovery.spec.ts` fixtures expect the legacy
  `/api/workspace` endpoint. The current coding workspace calls
  `/api/topics/{topic}/coding`; the focused `http-503` case therefore never
  renders its **Run test** button and fails before exercising recovery. A
  read-only comparison against base `f0422ef` confirmed this endpoint mismatch
  already existed there.
- `tests/journeys/hello-world-drafts.spec.ts` fails its competing-tabs journey:
  after **Keep my version** and reload, the browser receives the first tab's
  server draft instead of the selected second-tab version. The coding component
  and this journey file are unchanged from base. The new browser-draft migration
  intentionally leaves coding rows untouched, but a base-commit rerun was not
  performed, so this failure is not classified as a regression or as confirmed
  pre-existing behavior.

The `hello-world-recovery` endpoint mismatch and the competing coding-draft
conflict failure need separate follow-up before claiming that the full browser
suite is green. This verification does not mark the broader coding-path
recovery milestone complete.

## Scoped commits

- `6630fd0 fix: persist pending quiz autosaves across reloads`
- `03b6b66 fix: retry quiz autosaves after transient failures`
- Task 3 PostgreSQL characterization and evidence commit is pending.
