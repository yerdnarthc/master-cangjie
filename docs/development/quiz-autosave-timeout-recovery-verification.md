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
- If the activity is reopened offline while its workspace request is in flight,
  reconnecting queues a workspace reload; the recovered pending snapshot is
  replayed before any newer local answers are sent.
- Autosave errors have their own state. A confirmed draft save clears only the
  autosave error and leaves an unrelated completion or submission error visible.

## Verification results

| Check | Result |
| --- | --- |
| `npm.cmd run check` (PowerShell) | Passed TypeScript and architecture-boundary checks. |
| `node --env-file=<local .env> node_modules/vitest/vitest.mjs run --project domain` | 3 files, 56 tests passed. |
| `npm run test:integration -- tests/integration/quiz-journey.test.ts` | 1 file, 4 tests passed against PostgreSQL, including identical stale-snapshot replay and a newer snapshot. |
| `node --env-file=<local .env> node_modules/vitest/vitest.mjs run --project integration` | 12 files passed, 1 skipped; 32 tests passed, 6 skipped. Separate app, migration, and worker roles were configured against the dedicated test database. |
| Scoped browser command below | 13 Chromium journeys passed (42.5 seconds), including real database lost-response replay, timeout retries, retry exhaustion/manual retry, reconnect and offline reload recovery, 401/409 terminal handling, storage+network failure, conflict recovery, held-save answer preservation, and completion-error isolation. |
| `git diff --check` | Passed with no whitespace errors. |
| Full browser journey suite | Not green and not completed. A fresh run discovered 53 journeys with `--max-failures=1`: the first two passed, then `hello-world-drafts.spec.ts` failed its competing-tabs recovery journey; 50 tests did not run. The exact failure was reproduced at base `f0422ef`. Earlier runs also found a coding-recovery fixture route mismatch. See the separate findings below. |

The scoped browser command was:

```text
node --env-file=<local .env> node_modules/@playwright/test/cli.js test tests/journeys/quiz-autosave.spec.ts tests/journeys/quiz-conflict-newer.spec.ts tests/journeys/quiz-autosave-persistence.spec.ts --workers=1 --output=test-results/quiz-autosave-focused-recheck
```

It used `TEST_DATABASE_URL` ending in `_test`, a Windows Node/npm dependency
tree, and the test host on `127.0.0.1:3001`. The database-backed journeys
deleted only the development learner's draft for the tested topic. Held-save
journeys wait for the IndexedDB acknowledgement before advancing the fake debounce
clock. PostgreSQL confirmed that an exact stale replay returns revision 1 without
a conflict or revision increment; the subsequent newer snapshot saves at revision
2. A read-only follow-up review found no actionable issues in the autosave error
isolation or acknowledgement gates.

## Full browser-suite findings

The complete browser suite is not yet verified. A fresh bounded run failed in an
unrelated coding-draft journey before reaching the quiz journeys:

```text
node --env-file=<local .env> node_modules/@playwright/test/cli.js test tests/journeys --workers=1 --max-failures=1 --output=test-results/all-journeys-final
```

- `tests/journeys/hello-world-drafts.spec.ts` fails its competing-tabs journey:
  after **Keep my version** and reload, the browser restores the first tab's
  code instead of the selected second-tab version. The exact failure was
  reproduced by running this single journey in a detached worktree at base
  `f0422ef`, confirming it predates the autosave implementation. The quiz-store
  migration leaves coding rows intact. This existing coding-draft issue remains
  outside this change and still blocks a green full browser suite.
- An earlier broad run found that `tests/journeys/hello-world-recovery.spec.ts`
  fixtures expect the legacy
  `/api/workspace` endpoint. The current coding workspace calls
  `/api/topics/{topic}/coding`; the focused `http-503` case therefore never
  renders its **Run test** button and fails before exercising recovery. A
  read-only comparison against base `f0422ef` confirmed that route mismatch
  already existed there. This journey did not run in the latest bounded pass.

The baseline comparison used the same dedicated test database and this focused
command at detached `f0422ef`; it failed at the same reload assertion:

```text
node --env-file=<local .env> node_modules/@playwright/test/cli.js test tests/journeys/hello-world-drafts.spec.ts -g "competing tabs preserve both drafts until the learner chooses" --workers=1 --output=test-results/baseline-hello-world-tabs
```

The competing coding-draft conflict and `hello-world-recovery` fixture mismatch
need separate follow-up before claiming that the full browser suite is green.
This verification does not mark the broader coding-path recovery milestone
complete.

## Scoped commits

- `6630fd0 fix: persist pending quiz autosaves across reloads`
- `03b6b66 fix: retry quiz autosaves after transient failures`
- `5e1317b test: verify quiz autosave recovery with PostgreSQL`
- The scoped follow-up commit adds offline reload recovery, error isolation,
  deterministic acknowledgements, and refreshed evidence.
