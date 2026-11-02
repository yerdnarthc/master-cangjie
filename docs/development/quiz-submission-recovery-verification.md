# Quiz submission recovery verification

Date: 2026-11-02.
Branch: `feat/onboarding-learning-assessments`.
Base commits: `13bb572` and `ee0742b`.

## Scope

Verifies recovery when a quiz submission is interrupted after the learner
confirms it: the original request identity and answer snapshot survive retries,
reloads, tab handoffs, session expiry, and account changes, while duplicate
submissions are refused. The checks cover the uncommitted quiz recovery
implementation. Unrelated onboarding, curriculum, and navigation edits in the
same working tree are outside this evidence. Related risk: RISK-02.

## Implementation under test

- `apps/web/src/components/quiz-workspace.tsx` adds request timeouts, a pending
  submission state, confirmed-result validation, draft-preparation coordination,
  and recovery controls that lock answer changes while a request is unresolved.
- `modules/activity-draft/adapters/browser-drafts.ts` stores one pending
  submission per learner/topic with atomic claim, owner lease, ready transition,
  release, and clear operations.
- `modules/activity-draft/adapters/quiz-drafts.ts` compares answer maps by
  key/value rather than JSON key order.
- The quiz draft and submit routes pass an optional `expectedLearnerId`.
  `apps/web/src/bootstrap/http.ts` rejects a mismatch with `409` so a changed
  account cannot prepare or submit another learner's request.
- `tests/journeys/quiz-submission-recovery.spec.ts` contains 18 browser
  recovery scenarios. `tests/integration/quiz-journey.test.ts` adds a
  concurrent-replay and changed-snapshot identity test against PostgreSQL.

## Verification performed

| Check | Result |
| --- | --- |
| `npm run check` | Passed TypeScript and architecture-boundary checks. Re-ran after generated-file cleanup. |
| `npm run test:domain` | 3 files, 56 tests passed. |
| `vitest run --project integration tests/integration/quiz-journey.test.ts` | 3 tests passed against real PostgreSQL. |
| Focused Playwright `--grep=eventually` | 1 passed (21.8s): a stalled earlier autosave eventually releases submission recovery. |
| Focused Playwright `--grep=signed-in` | 1 passed (8.9s): preparation and submission are rejected after an account change. |
| Scoped Playwright selection | 25 tests in 7 files passed (2.5m): 18 submission-recovery, 4 conflict, 2 autosave, and 1 onboarding-quiz journey. |

The focused browser checks ran individually before the full selection. The full
selection covered:

- `tests/journeys/quiz-submission-recovery.spec.ts` (18)
- `tests/journeys/quiz-conflict.spec.ts`, `quiz-conflict-newer.spec.ts`, and
  `quiz-conflict-persistence.spec.ts` (4)
- `tests/journeys/quiz-autosave.spec.ts` and `quiz-autosave-persistence.spec.ts` (2)
- `tests/journeys/onboarding-quizzes.spec.ts` (1)

The last recorded pre-fix browser failure, "a stalled earlier autosave
eventually releases submission recovery", now passes in isolation and in the
full selection.

## Environment and evidence boundaries

Browser checks used the dedicated `*_test` database, the test host on
`127.0.0.1:3001`, Windows Node `v24.22.1`, Vitest `5.0.5`, Playwright `1.64.1`,
and Chromium. The reset helpers targeted the dedicated test database.

Several recovery scenarios use controlled route responses to simulate lost,
held, or malformed responses. Those checks establish browser recovery behavior,
not server persistence by themselves. The PostgreSQL integration test and the
browser scenarios that query or advance real persisted records establish the
real database behavior.

These checks do not verify the Cangjie compiler, evaluator, sandbox, or the
coding path. They also do not establish the rest of the branch or MVP readiness.

## Cleanup

Next dev rewrote `apps/web/next-env.d.ts` and `apps/web/tsconfig.json` to point at
`.next-test` during browser verification. Both generated files were restored to
their committed state afterward. CRLF line endings were normalized to LF in
`apps/web/src/bootstrap/http.ts` and
`modules/activity-draft/adapters/browser-drafts.ts`; this changed whitespace
only. No commit was created.

## Fresh verification after debugger-clock changes

A subsequent verification run on 2026-11-02 used the current working-tree
implementation, including the four fake-clock journeys and friendly autosave
timeout message:

- `npm.cmd run check`: passed before browser tests and again after restoring
  generated files; TypeScript and architecture boundaries passed.
- `node.exe node_modules/vitest/vitest.mjs run --project domain`: 56 tests
  passed in three files.
- `node.exe node_modules/vitest/vitest.mjs run --project integration tests/integration/quiz-journey.test.ts`:
  three tests passed against real PostgreSQL.
- `node.exe node_modules/@playwright/test/cli.js test quiz-submission-recovery quiz-conflict quiz-autosave onboarding-quizzes --timeout=60000`:
  all 25 browser journeys passed, exit code 0 (2.4 minutes).
- `git diff --check`: passed. Git emitted line-ending conversion warnings,
  without whitespace errors.

A read-only independent review found no blocking defect in the scoped recovery
change. It did not execute tests; the command results above provide that evidence.
It identified an adjacent, pre-existing account-guard gap in draft conflict
resolution: the follow-up draft PUT omits `expectedLearnerId`, and the conflict
resolve route has no expected-learner guard. That gap was reported separately
and was not changed during this verification.

At the time of this automated verification run, actual Inspector Step-over
interaction had not yet been rerun. The automated run alone also did not
establish that every journey tolerates arbitrary debugger pauses; several cases
intentionally depend on real time. The previously deferred historical
feedback/current-draft display issue remains outside this recovery verification.

## Manual Inspector verification reported by the user

After the automated verification above, the user manually ran Playwright
Inspector Step over on the four journeys that had been failing under slow
debugger stepping. The user reports all four now pass:

- two tabs cannot create duplicate submissions while a draft save is pending;
- submits the confirmed newer answers when an earlier autosave is in flight;
- a stalled earlier autosave eventually releases submission recovery; and
- a former preparation owner cannot submit after another tab takes over.

This closes the earlier manual-Inspector verification gap based on the user's
direct QA. It is recorded as user-observed evidence; the automated rerun and
independent code review remain separate evidence sources.

## Updated scoped code review

A fresh read-only independent review was completed after recording the manual
Inspector results. It found no Critical or Important findings in Issue 3 and
assessed the scoped recovery change as ready to merge. The reviewer did not run
tests; the automated results above remain the test evidence, and the Inspector
results remain user-reported QA.

The reviewer kept the conflict-resolution account-guard gap as adjacent work
outside Issue 3, and the historical feedback/current-draft display issue remains
explicitly deferred. The review does not approve unrelated working-tree changes
or establish whole-branch readiness.

Generated `next-env.d.ts` and `tsconfig.json` were restored from pre-run copies,
preserving existing working-tree edits. No application code was changed and no
commit was created in this verification pass.

## Next development slice

The maintainer proposed prioritizing real account access after the scoped
submission-recovery change is committed and integrated. The recommended next
slice follows the existing [product specification](../product.md): Google
registration and sign-in, a persisted learner identity, authenticated sessions,
and sign-out. The existing learner database and learner-scoped assessment data
are foundations to connect to that flow, rather than replace.

Its verification should exercise two real learner accounts through the website
and API, including account switching, to confirm isolation of drafts, pending
requests, submissions, results, and progress. Browser storage scoping and server
authorization both need coverage. Detailed account design and implementation
planning remain separate work.

The remaining quiz audit findings, the conflict-resolution account-guard gap,
and the historical feedback/current-draft display issue remain tracked follow-up
work. Completing submission recovery does not close the entire quiz slice or
approve all changes on the onboarding branch for merge.

## Isolated commit verification

Before committing, the recovery change was reconstructed on `ee0742b` in an
isolated worktree. Unrelated navigation, curriculum, coding, and formatting
changes were excluded. The test-host configuration keeps browser verification
separate from the developer's running web server.

Fresh checks passed: TypeScript and architecture boundaries, 56 domain tests,
three real PostgreSQL integration tests, and all 24 selected browser journeys
(2.3 minutes), including all 18 submission-recovery scenarios. This selection
contains one fewer autosave journey than the earlier 25-test run because the
separate uncommitted autosave-persistence test was excluded from this commit.
Generated Next.js declaration and configuration edits were excluded.
