# Independent Hello World verification

Date: 2026-11-01. Reviewed commit: `c5ea8d6`.

**Current status:** The Hello World coding-path recovery milestone is verified by
the implementation follow-up below, including the full real-process interruption
matrix and all fourteen browser tests. The original audit findings are preserved
as history of commit `c5ea8d6`.

## Original audit

The Hello World application path works with real PostgreSQL and the pinned
Cangjie/gVisor evaluator. Recovery is only partially verified and has reproducible
gaps. The milestone should not yet be described as having passed its complete
interruption/restart exit criteria. This review changes documentation only.

## Current implementation

- Next.js route handlers invoke `PostgresSubmissions`; PostgreSQL adapters contain
  request orchestration, durable operation identities, scoring ingestion and
  transactional submission/progress updates.
- `application-jobs` dispatches persisted evaluation intents through pg-boss,
  ingests exchange outcomes and continues submissions.
- The Linux evaluation worker claims generation-fenced exchange jobs, heartbeats
  leases and runs the sandbox adapter. It supplies evidence; the trusted
  application computes grades and progress.
- The React workspace uses Monaco with a plain text fallback, server draft
  revisions, Dexie recovery records and operation polling.
- This is an internal Hello World milestone with development identity and seeded
  onboarding prerequisites. It does not establish Google authentication,
  onboarding quiz execution, the rest of the curriculum or MVP readiness.

## Verification performed

| Check | Result | What it establishes |
| --- | --- | --- |
| `npm.cmd run check` | Passed | TypeScript and configured import-boundary checks |
| `npm.cmd run test:domain` | 46 passed | Existing deterministic scoring, eligibility and progress scenarios |
| `npm.cmd run test:integration` | 13 passed; 6 sandbox tests skipped | Existing real PostgreSQL/transport checks; not real execution evidence by itself |
| `npm.cmd run build` | Passed | Next.js production build |
| All six existing Playwright journeys | 6 passed | Draft reload, offline recovery, competing drafts, untouched submission acknowledgement, real Run/Validate/Submit, completion/unlock retention, lower retry and formatting feedback |
| Direct calls to the current `runSandbox` adapter on WSL/Linux | 7 passed | Correct greeting with exact output bytes; incorrect greeting preserved as execution evidence; compile rejection; nonzero exit; deadline; output cap; pre-aborted request |
| Targeted recovery scenarios against real PostgreSQL | Two defects reproduced; explicit submission retry control passed | Findings 1 and 2 below |
| Two controlled-API Playwright probes against the real workspace component | Both defects reproduced | Restoration priority and Dismiss behavior; these probes do not establish real worker behavior |

The browser run used a temporary web host on port 3001, trusted continuation
process and Linux worker, all targeting the dedicated `*_test` database. The
journey reset helper was redirected to that database. The learner's development
database was not reset. The normal journey configuration otherwise resets the
database named by `MIGRATION_DATABASE_URL`; do not casually run it against saved
development work.

Runtime evidence: Windows Node `v24.22.1`, WSL Node `v24.22.2`, Next.js `16.4.3`,
Vitest `5.0.5`, Cangjie `1.0.5`, Docker runtime `runsc-systrap`, image
`sha256:77cf9faa236790dbd636cb41c93c62f3b1a12c3e5e5630b3892eee9ba15b0534`.
Sandbox probes confirmed cleanup and no active/refused containers in their final
reconciliation. This is not a rerun of the entire network/filesystem/memory/process
containment harness.

At the start of review, port 3000 was not accepting connections; a read-only query
of the development database found ten confirmed evaluations and no pending jobs.
Consequently, this review does not establish the historical cause of the reported
incident. Temporary hosts were used for fresh verification.

## Findings

### 1. High: an unclaimed evaluation can still lock the workspace indefinitely

Sources: [transport recovery](../../infrastructure/evaluation-transport/postgres.ts),
[operation creation and retry](../../modules/topic-submission/adapters/postgres.ts),
[workspace waiting state](../../apps/web/src/components/coding-workspace.tsx).

Reproduction against the real test database:

1. Request a batch evaluation without a worker consuming it.
2. Backdate the evaluation's `created_at` by one day and run dispatch and ingestion.
3. Read the operation: it remains `pending`.
4. Request another validation: it is rejected as already pending.
5. Retry the pending operation: it remains pending; retry only resets errors.

Exhausted-delivery recovery requires `deliveries >= 3` and an expired lease. A job
never claimed has neither. Reads do not reconcile service health or operation age.
The client continues polling a successful `pending` response and disables Run,
Validate and Review submission, with no recovery action for that state. Dismiss
is available only when an error is displayed.

Resuming the missing worker/continuation can still finish durable work. The defect
is the absence of an actionable outage/stalled-work state while that service is
unavailable; it is not evidence that durable work was lost. Aging the timestamp
tests the absence of an age policy, not a literal day-long outage.

Recommended correction: define an explicit stalled-operation policy, distinguish
queued work from running work and service outage, and provide recovery that retains
the operation identity. Any reset must respect live leases and generation fencing.
Do not merely unlock the client and create replacement requests.

Related criteria: UC-08 service-failure recovery, UC-09-AC4, UC-11-AC4,
UC-16-AC3; RISK-01, RISK-02 and RISK-05.

### 2. High: a failed submission can be hidden and remain unfinalized after its evaluation succeeds

Sources: `load` in
[the workspace](../../apps/web/src/components/coding-workspace.tsx), and `retry`
and `continueSubmissions` in
[the persistence adapter](../../modules/topic-submission/adapters/postgres.ts).

Reproduction against the real test database:

1. Request a batch, then confirm a submission of the same work. The submission
   shares the pending batch.
2. Persist operational-failure evidence and ingest it. Both operations become
   `retryable-error`.
3. Retry the evaluation directly, persist successful evidence and ingest it.
4. The evaluation is confirmed at 10/10, but the submission remains
   `retryable-error` and the topic remains incomplete.
5. Explicitly retrying the submission and running continuation finalizes it.

The UI compounds this: restoration prioritizes a submission only when it is
`pending`; otherwise it prefers `latestEvaluation`. The failed submission is
therefore hidden after reopening without a remembered submission record. Error
results clear remembered requests. A controlled-API browser probe confirmed that
a confirmed batch plus a failed latest submission displays only Batch validation,
with no submission retry button.

`continueSubmissions` selects only `pending` submissions. Retrying an evaluation
does not resume its error-state dependent submissions. A reopened learner can
therefore retry the visible evaluation successfully without completing the
original confirmed submission. Making a fresh submission is a workaround, not
recovery of that original operation.

Recommended correction: expose unresolved submissions separately from practice
results, preserve their retry identity across reloads, and ensure the selected
recovery operation resumes the submission and its dependencies consistently.

Related criteria: UC-11-AC3/AC4, UC-16-AC1/AC3; RISK-02.

### 3. Medium: Dismiss abandons result tracking without changing the pending server operation

Source: the error-panel Dismiss handler in
[the workspace](../../apps/web/src/components/coding-workspace.tsx).

A controlled-API browser probe restored a pending evaluation, returned a temporary
503 from its status endpoint, then clicked Dismiss. Run became enabled and the
result panel disappeared. Reloading restored the same pending evaluation and
disabled Run again.

Dismiss clears the local request record and pending operation display, stopping
polling. It neither cancels nor recovers the durable server operation. A new
same-kind evaluation remains subject to the server's pending-operation guard.
This makes the workspace appear recovered while its underlying restriction
persists. The same handler is also used for unrelated save/storage errors.

Recommended correction: dismiss the message while retaining operation tracking.
Use a separate explicit recovery action if needed, with defined server behavior.

Related rules: shared repeated-action and persistence rules, UC-16-AC3; RISK-02.

## Remaining evidence gaps

- The six standard sandbox tests still require an explicitly enabled Linux run.
  The seven direct adapter checks above provide fresh execution evidence, but do
  not silently turn those skipped tests into passes.
- The full named interruption matrix has not been exercised: hard worker death
  during compile/run, application/worker restart, durable outcome before queue
  acknowledgement, ingestion before continuation, and finalization transaction
  boundaries. Existing lease and ingestion tests cover selected cases with
  constructed evidence; they do not prove every real-process restart boundary.
- No new broad containment, backup/restore, deployment, capacity or provider
  acceptance is claimed.
- The existing recovery test exercises an explicit operational-error outcome and
  reset. Despite its title, it does not exercise exhausted deliveries, a never
  claimed job, browser reload of a failed submission or the Dismiss behavior.
- The runbook lists versions and checks but lacks a complete startup procedure
  for all three hosts. `.env.example` also omits the worker-required
  `MCJ_EVALUATOR_LEASE_DIRECTORY` setting. A fresh checkout cannot reproduce the
  running system solely by following that runbook.

The next implementation should address these recovery findings and add regression
coverage at the browser and real-persistence seams before marking the complete
coding-path recovery milestone verified.


## Recovery implementation follow-up (2026-11-01)

The three original findings above have been addressed. Pending work becomes
retryable after a two-minute waiting budget when no live lease or durable outcome
exists. Recovery atomically fences abandoned claims; explicit retry renews the
budget and preserves the operation, work snapshot and assessment. Retrying an
evaluation resumes dependent submissions and reserves the shared validation window.
Unresolved submissions are returned separately from newer practice results.

Browser dismissal now hides only the message. Lost responses, server failures and
401/403 responses preserve the remembered request identity; replacement actions
stay blocked while that identity is uncertain. Submission retries retain the same
operation, including after a lost retry response and reload.

Independent review found and resolved two additional cases: account serialization
now permits foreign-key checks during concurrent successful ingestion, and trusted
status/workspace reads ingest available evidence and finalize ready submissions
when the jobs process is unavailable. Transient ingestion failures retain evidence;
rejection of malformed evidence is transactional and conditional on the exact
persisted generation/outcome.

Fresh verification of the recovery implementation:

- Static/import-boundary checks and all 46 domain tests passed.
- All 28 real PostgreSQL integration tests passed, including 15 new recovery,
  admission, evidence and concurrency regressions. The ordinary Windows run skips
  the six Linux sandbox cases; these were separately executed on Linux and all six
  passed with the real pinned compiler/runtime.
- All fourteen browser tests passed together against the isolated test web host: six
  real application/worker journeys and eight controlled-API recovery regressions.
  Eight controlled-API browser regressions passed. The initial six were also run
  against the original component and all six failed at the intended recovery
  assertions before the fixes were restored.
- The real-process harness passed actual SIGKILL/restart checks before
  dispatch-intent commit, after commit before notification, after canonical
  ingestion before continuation, and before/after finalization commit. It passed
  worker death during both compilation and execution, orphan reconciliation,
  stale-generation fencing, retry of the same operation, and durable worker
  evidence before queue acknowledgement. Duplicate request/result handling and
  atomic retained completion/unlock were asserted.

Run `npm run test:recovery:process` alone on the configured Linux/gVisor host to
repeat the process matrix. Test-only SQL advances persisted lease/stale timestamps
to avoid literal 90/120-second waits; real child-process deaths, actual compiler
execution, orphan cleanup and data recovery are not mocked. The harness retries
durable dispatch every ten seconds, matching the continuation host rather than
assuming every pg-boss notification is immediately accepted. Correct phase
observation uses guest `/proc`, not host `docker top` under gVisor.

The startup runbook and `.env.example` now identify all required hosts and the
worker lease directory. Browser configuration/reset rejects non-test databases;
test runtime URLs are mapped to the same configured test server with their
respective roles. Test suites sharing that database must be run serially.

Broader MVP, hosting capacity, backup/restore and provider acceptance remain outside
this Hello World milestone. This follow-up does not close those risks.
