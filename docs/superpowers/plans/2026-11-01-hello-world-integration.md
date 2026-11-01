# Hello World Coding Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. These skill names come from the planning template; confirm availability before execution. Their absence does not authorize installing tools or delegating work without the user's chosen execution approach.

**Goal:** A learner opens Hello World, saves code, runs and validates it with the isolated Cangjie worker, submits the topic, earns the correct progress, and recovers work and outcomes after interruption.

**Architecture:** Use the accepted modular monolith with separate web and trusted continuation processes, PostgreSQL persistence, and a separate Linux evaluation coordinator. The coordinator supplies execution evidence only. Topic submission owns grading and atomic score/progress finalization.

**Tech Stack:** TypeScript, supported Node.js LTS, Next.js App Router/React, Tailwind, Monaco, Dexie, PostgreSQL, Drizzle migrations, pg-boss, Cangjie LTS 1.0.5 and gVisor/runsc. Better Auth remains the accepted production Google/session integration.

**Spec:** [Product](../../product.md), [UC catalog](../../use-cases.md), [domain model](../../domain-model.md), [architecture](../../architecture.md), [ADR-0001](../../adr/0001-modular-monolith-isolated-evaluation-worker.md), [stack](../../mvp-stack.md), [milestone](../../risk-register.md#first-milestone-prove-one-complete-coding-path), and [approved Hello World assessment](../../../content/coding/running-the-first-cangjie-program/hello-world/assessment.md).

## Global constraints

- This document is a proposed execution plan, not implementation or runtime evidence. At authoring, no application package manifests, schema, migrations or application tests exist; `src/` contains no application implementation.
- Cangjie LTS 1.0.5; one Hello World problem, one visible case, no structural rules. Input is zero bytes; expected stdout is the 14 bytes `Hello, World!\n`.
- Each passed test earns 10 points. Passing is exactly `5 * earned >= 3 * possible`. An individual Run awards no points or achievements; Validate does not complete the topic.
- Hello World submission passes at 10/10 and fails at 0/10. Completion unlocks Identifiers, not Program Structure. Categories have no separate score or unlock transaction.
- Opening alone is unattempted. Editing, Run or Validate makes work attempted, even when the supplied correct starter is unchanged.
- Every result belongs to fixed source, work revision, language version, assessment revision and scope. Service failures remain unevaluated; they never manufacture a score of zero.
- Retain best finalized scores, solved achievements, completion and unlocks after lower retries. Preserve historical assessment revisions and confirmed submission snapshots.
- Manual Validate is blocked for at least five seconds and while pending for the same learner/problem across tabs/devices. Submission-required validation has no artificial per-test five-second delay.
- Domain code imports no framework/database/queue SDK. UI and transports call module operations; worker imports no scoring/progress implementation.
- Compiler and learner execution remain isolated from the web host. Worker queue credentials never enter the sandbox; expected outputs are not mounted in it.
- Hello World's content approval is complete. Basic Data Types content, full onboarding quizzes, profile/contact features, full curriculum publication and visual polish are outside this milestone; their accepted MVP requirements remain.

## Review focus

1. Correct prefilled starter submitted without any edit/run: require incomplete-work confirmation and score it as unattempted zero (Tasks 2, 7, 8).
2. Lost save response, offline edits or competing tabs: preserve both candidates and never label unconfirmed work saved (Tasks 3, 4, 8).
3. Worker finishes after its lease expires or the application restarts: fence stale evidence, retain unconsumed results and resume finalization (Tasks 5–7, 9).
4. Content or draft changes after review/evaluation: reject stale review confirmation, preserve confirmed submission snapshots and label old feedback (Tasks 2, 4, 7, 9).
5. Learner identity or hidden data crosses a boundary: deny cross-account access; filter all response paths; reject a development identity in a deployed build (Tasks 1, 3, 6, 8, 9).

## 1. Milestone scope and learner setup

Use Hello World as the primary complete topic. Its public problem statement asks only that the learner run the supplied program; do not introduce an editing requirement. Editing still needs demonstration as an application capability, using a disposable draft or harmless comment.

For the internal demonstration, propose a local-only authenticated development learner adapter. Seed two prerequisite MCQ completions with explicit fixture provenance, along with a second learner for ownership checks. These fixtures do not demonstrate real quiz completion or Google authentication. Never expose an endpoint accepting an arbitrary learner ID; derive actor context on the server. Refuse the development adapter unless running explicitly in local development/test mode. Exercise sign-out by clearing the development session and denying protected operations; restoring the same session identity recovers the same account's data.

The first two onboarding topics and Identifiers may be seeded as roadmap metadata without published quizzes. Display Identifiers as unlocked after Hello World, but indicate that its activity is unavailable in this internal build. Full Google sign-in, reviewed quizzes and their progression remain separate MVP work. If deployment/public access is brought into scope, replace the local adapter with the accepted Better Auth integration before exposing it.

After the main path passes, use an existing Expressions item as an integration fixture for nonempty stdin, visible/hidden filtering and partial batch results. This does not alter Hello World's one-case assessment or require completing that topic's prerequisites through UI.

## 2. Planned files and ownership

All application paths below are proposed. Keep a small npm workspace; no orchestration framework is required.

| Files/directories | Responsibility |
| --- | --- |
| `package.json`, `package-lock.json`, `tsconfig.base.json`, `vitest.config.ts`, `playwright.config.ts` | Pinned workspace, shared checks and test entry points |
| `apps/web/package.json`, `apps/web/src/app/`, `apps/web/src/bootstrap/` | Next.js host, thin authorized routes, composition root |
| `apps/web/src/app/topics/[topicId]/page.tsx`, `apps/web/src/components/coding-workspace.tsx` | Problem view, editor, save/run/validation/submission feedback |
| `apps/web/src/app/api/drafts/[problemId]/route.ts` | Read/save/resolve through Activity draft operations |
| `apps/web/src/app/api/evaluations/route.ts`, `api/operations/[operationId]/route.ts` under the same app directory | Accept run/validate; poll authorized operation status |
| `apps/web/src/app/api/submissions/review/route.ts`, `api/submissions/route.ts` under the same app directory | Review and confirm fixed submission work |
| `apps/application-jobs/src/main.ts` | Durable dispatch, outcome ingestion and submission continuation |
| `apps/evaluation-worker/src/main.ts`, `sandbox.ts` | Restricted queue consumer and isolated Cangjie execution orchestration |
| `modules/learner-account/application/actor.ts`, `adapters/development-session.ts` | Authenticated actor boundary and explicitly local session adapter |
| `modules/roadmap/application/content.ts`, `adapters/hello-world-content.ts` | Immutable content import and permitted problem reads |
| `modules/activity-draft/application/drafts.ts`, `adapters/postgres.ts`, `adapters/browser-drafts.ts` | Revisioned saves, conflicts, account-scoped Dexie recovery |
| `modules/topic-submission/domain/evaluation.ts`, `domain/progress.ts`, `application/operations.ts`, `adapters/postgres.ts` | Eligibility, exact grading, operations, finalization and filtered results |
| `infrastructure/persistence/schema.ts`, `migrations/`, `roles.sql`, `seed-milestone.ts` | Schema, reviewed role grants and explicit development fixtures |
| `infrastructure/evaluation-transport/contracts.ts`, `postgres.ts` | Versioned wire contracts, dispatch and fenced durable outcomes |
| `infrastructure/runtime/config.ts`, `compose.development.yml` | Validated runtime settings; local PostgreSQL, never a web-host sandbox |
| `tests/integration/`, `tests/journeys/`, `docs/development/hello-world-workflow.md` | Real integration evidence, browser journey and repeatable runbook |

Module-local tests sit beside their owning files. Add package manifests for the hosts and modules when those units are introduced, with explicit exports. Avoid a shared service container, generic repository framework or extra forwarding modules.

## 3. Records and consistency boundaries

These are proposed logical database records, implemented through Drizzle migrations. Use UUID identities, explicit foreign keys, UTC timestamps and unique constraints. Store exact source and test bytes, not newline-normalized copies. Separate immutable historical snapshots from mutable drafts.

| Record | Owner and essential fields | Enforced rules |
| --- | --- | --- |
| `learner_accounts` | Learner account: ID and development fixture identity | Stable account; production identity remains Google-backed |
| `topics` | Roadmap: ID, category, order, kind, current published revision | Unique order; immediate successor derives from roadmap |
| `assessment_revisions` | Roadmap: topic/revision, immutable problem/test definition and content hashes | Unique topic/revision; no in-place scoring changes |
| `coding_drafts` | Activity draft: learner/problem, source, work revision, attempted, last location | Unique learner/problem; conditional revision updates |
| `draft_conflicts` | Activity draft: base revision, competing candidate bytes, resolution | Preserve both until learner choice; resolve against current base |
| `evaluation_attempts` | Topic submission: operation ID, kind, learner/problem, fixed source/hash, work/revision, selected case IDs, state, result, active execution generation | Unique actor/idempotency key; matching key with different payload rejected; accepted result immutable |
| `validation_windows` | Topic submission: learner/problem, last manual request, pending batch reference | Unique pair; lock and reserve eligibility atomically |
| `topic_submissions` | Topic submission: operation ID, learner/topic, confirmed work/revision, attempted flags, result references, possible/earned, state | Unique actor/idempotency key; immutable confirmed work; finalized once |
| `learner_topic_progress` | Topic submission: learner/topic, best submission reference, completion and earned availability | Unique pair; monotonic completion/unlock; best by exact fraction comparison |
| `solved_achievements` | Topic submission: learner/problem, qualifying batch reference | Unique pair; individual runs cannot insert |
| `evaluation_dispatch` | Topic submission persistence: request ID and dispatch state | Insert with accepted attempt in the same transaction; replayable after crash |
| `evaluation_exchange.jobs` | Restricted transport: request ID, execution payload, generation/lease, bounded outcome and ingestion acknowledgement | No business-table access for worker; expected output absent from payload; outcomes retained until ingestion acknowledgement |

The exchange is a small durable transport ledger, not a second scoring ledger. Use pg-boss to deliver work notifications. Upsert exchange rows by evaluation ID and allow repeated notifications. This outbox arrangement avoids assuming Drizzle/pg-boss transactional integration works before it has been demonstrated.

Before taking an execution lease, lock the exchange row; only one live lease per request. A renewed claim advances a monotonic generation. Conditional heartbeat/outcome writes require the matching generation and unexpired claim. Ingestion checks that generation against the exchange's current claim and the immutable application request. An obsolete result never overwrites a canonical result. Recovery scans expired unfinished exchange work so loss/expiry of a pg-boss notification cannot strand an accepted request.

Grant the worker access only to evaluation-specific queue operations and narrowly scoped exchange operations. Use database functions or column grants to prevent it writing payload identities, ingestion acknowledgements or business records outside its role. Queue migrations use a different credential. Do not solve a grant failure by making the worker a database owner.

Transaction boundaries:

1. Save draft by compare-and-swap on base revision; an ambiguous network retry must not overwrite newer content.
2. Reserve evaluation/cooldown and insert fixed attempt plus dispatch intent together.
3. Ingest matching outcome into the canonical attempt, record its result and durable continuation state, then acknowledge exchange ingestion. A crash before acknowledgement only repeats idempotent ingestion.
4. Finalize submission, compare best score, retain solved evidence, complete Hello World and grant Identifiers availability in one short transaction. Lock learner/topic progress in stable roadmap order; retry serialization/deadlock failures using the same operation identity.

No database transaction stays open during compilation, execution or learner review. No queue housekeeping removes unacknowledged outcomes. Keep milestone exchange data until evidence collection and deliberate maintenance; do not rely on pg-boss defaults for business retention.

Transactions spanning draft participation and evaluation reservation must coordinate
through the owning module operations using the same database unit of work. Topic
submission must not directly rewrite another module's draft tables. Mark Run and
Validate participation through Activity draft in the accepted-operation transaction;
a rejected cooldown/request must not accidentally dispatch work.

## 4. Shared operation contracts

Create these representations in the owning application/transport files, not a global business types package. IDs below are UUID strings; assessment references use the content's stable topic ID and revision 1.

```ts
type Actor = { learnerId: string }; // server-derived only
type AssessmentRef = { topicId: string; revision: number };
type Work = { problemId: string; workRevision: number; source: string };
type Score = { earned: number; possible: number };
type SaveRequest = { problemId: string; baseRevision: number; source: string };
type SaveResult =
  | { kind: "saved"; workRevision: number }
  | { kind: "conflict"; conflictId: string; server: Work; candidate: Work };
type EvaluationRequest = {
  requestKey: string; problemId: string; workRevision: number;
  assessment: AssessmentRef; kind: "single" | "batch"; caseId?: string;
};
type OperationView = {
  operationId: string; state: "pending" | "confirmed" | "retryable-error";
  currentForDraft: boolean; score?: Score;
  feedback: Array<{ caseId: string; status: string; actual?: string;
    expected?: string; diagnostics?: string }>;
};
type ReviewedWork = { assessment: AssessmentRef; work: Work[];
  attempted: boolean[]; reviewToken: string };
type ConfirmRequest = { requestKey: string; reviewToken: string;
  acknowledgeUnattempted: boolean };
```

`reviewToken` identifies a short-lived server-stored review of exact work, not client-supplied scoring facts. If work or current assessment changes before confirmation, return a new review requirement. Once confirmed, later edits belong to a new draft context. Status reads always authorize ownership. An unknown/foreign operation returns no private result.

Define these module operations with promise-returning persistence effects:

```ts
// Activity draft
saveDraft(actor: Actor, request: SaveRequest): Promise<SaveResult>;
resolveDraft(actor: Actor, conflictId: string,
  choice: "server" | "candidate", baseRevision: number): Promise<SaveResult>;
// Topic submission
requestEvaluation(actor: Actor, request: EvaluationRequest): Promise<OperationView>;
reviewSubmission(actor: Actor, topicId: string): Promise<ReviewedWork>;
confirmSubmission(actor: Actor, request: ConfirmRequest): Promise<OperationView>;
readOperation(actor: Actor, operationId: string): Promise<OperationView>;
```

Bodies never accept `learnerId`, score, expected output or claimed pass/fail from the browser. Save/flush the latest local edit before requesting a work-revision-based operation; on conflict, resolve it rather than evaluating an unidentified local buffer.

The worker transport contract contains request ID, contract version, source bytes/hash, Cangjie version, assessment reference, input bytes and selected case IDs, resource policy, generation and lease identity. It excludes expected output, learner contact data and score fields. Bounded evidence carries matching IDs/generation, actual stdout bytes, compilation/execution outcomes and cleanup status. Transport bytes use base64 and hashes; the trusted application does exact byte comparison.

## 5. Implementation tasks

Each task is an independently reviewable checkpoint. Add the named scripts when introducing the workspace; commands below are planned commands, not currently available tools. Use test-first steps within each task, run the focused check before broadening, and commit each completed scope only when executing with version-control authorization.

### Task 1: Reproducible content-backed application and development identity

**Files:** Create root workspace/configuration files, `apps/web/`, the Learner account files, Roadmap files, persistence migrations/seed and development compose file listed above. Create `tests/integration/content-and-identity.test.ts` and `tests/integration/database-roles.test.ts`.

**Consumes:** Accepted stack and approved content files. **Produces:** An authorized Hello World read model, fixture learner context, migrated PostgreSQL and reproducible boot commands.

- [ ] Check official package/runtime documentation, select mutually compatible supported versions, pin exact dependencies and the lockfile, and record versions in `docs/development/hello-world-workflow.md`. Verify pg-boss supports the selected PostgreSQL/Node versions. Do not infer versions from this dated plan.
- [ ] Define npm scripts `dev:web`, `dev:jobs`, `dev:worker`, `db:migrate`, `db:seed:milestone`, `check`, `test:domain`, `test:integration`, `test:journeys`. Introduce each host script when its host exists; the final runbook lists all prerequisites and environment values by name, never secrets.
- [ ] Write failing import/identity tests: exactly one Hello World test, empty input, expected 14 bytes, no requirements; reject a hidden field in public output; reject missing actor and deployed development identity. Use real PostgreSQL for migration/role checks.
- [ ] Implement a narrow Hello World importer that explicitly selects `problem.md`, starter and exact test bytes. Do not publish `assessment.md`, reference source or arbitrary directory files. Import idempotently by revision/hash; reject changed bytes under an existing scored revision. Do not build a generic Markdown schema/parser framework.
- [ ] Seed stable roadmap IDs, fixture learners, two prerequisite completions and Hello World's published revision. Label seed data as internal fixtures; use a separate resettable test database. Never apply a development reset to other database URLs.
- [ ] Run `npm ci`, `npm run db:migrate`, `npm run db:seed:milestone`, `npm run test:integration -- content-and-identity database-roles`. Expect exact content, authorized reads and denied cross-role writes. Start the page and inspect the public network payload.

### Task 2: Exact grading, eligibility and retained progress rules

**Files:** Create `modules/topic-submission/domain/evaluation.ts`, `progress.ts`, and adjacent `evaluation.test.ts`, `progress.test.ts`.

**Consumes:** Immutable assessment and source context. **Produces:** Pure exact comparison, eligibility and score/progress decisions for Tasks 5–7.

- [ ] Write failing deterministic tests using Vitest, including:

```ts
it("uses the exact passing threshold", () => {
  expect(passes({ earned: 10, possible: 10 })).toBe(true);
  expect(passes({ earned: 0, possible: 10 })).toBe(false);
  expect(passes({ earned: 90, possible: 150 })).toBe(true);
  expect(passes({ earned: 80, possible: 150 })).toBe(false);
});
```

- [ ] Export `passes(score: Score): boolean`, `sameBytes(a: Uint8Array, b: Uint8Array): boolean`, and `betterScore(candidate: Score, retained: Score): boolean`. Implement threshold by `5 * earned >= 3 * possible`, best comparison by cross multiplication, and byte comparison without trimming/normalizing. Validate score bounds and integer points before applying them.
- [ ] Add tests for extra LF, missing LF, CRLF, tabs, spaces and invalid UTF-8 bytes; a display decoder must not decide correctness. Treat compile rejection as batch zero, execution failure as the affected failed case, and operational interruption as incomplete with no score.
- [ ] Test unchanged prefilled starter remains unattempted until edit/run/validate; single runs never produce a scored batch/solved achievement; a passing batch is solved but not topic completion; different source/revision/test scope is ineligible for reuse.
- [ ] Test lower retry preserves 10/10 and unlock; differing denominators compare percentages without adding scores; zero requirements bypass structural analysis. Unsupported nonempty requirements fail content preparation rather than silently ignoring a gate.
- [ ] Run `npm run test:domain -- evaluation progress`; expect all cases above to pass before wiring database writes.

### Task 3: Persisted, versioned drafts and conflict preservation

**Files:** Create Activity draft application/PostgreSQL adapters, draft route, `tests/integration/drafts.test.ts` and `conflicts.test.ts`.

**Consumes:** Actor and published problem. **Produces:** `saveDraft`/`resolveDraft`, current work revision and attempted status.

- [ ] Write two-connection PostgreSQL tests for concurrent saves at the same base revision; exactly one becomes current and the other is preserved as a conflict. Test foreign account access and a lost save response followed by retry.
- [ ] Implement conditional revision writes and durable candidates. Merely reading the starter does not insert attempted=true. Editing makes attempted monotonic for this draft; returning text to the original starter does not erase an attempted event.
- [ ] Resolve only the actor's conflict against the current base revision. If another save wins during resolution, preserve candidates and return a conflict again. Never modify evaluation or submission snapshots.
- [ ] Run `npm run test:integration -- drafts conflicts`; verify reopening returns exact source bytes and a chosen unvalidated candidate has no inherited validation.

### Task 4: Working browser editor and local draft recovery

**Files:** Create coding workspace component, topic page, browser draft adapter, `tests/journeys/hello-world-drafts.spec.ts`.

**Consumes:** Authorized read model and Task 3 save operations. **Produces:** First user-visible milestone: edit, save, reload and recover source.

- [ ] Write a Playwright journey that opens Hello World, inserts a comment, waits for confirmed save, reloads and sees the same source. Verify opening alone awards nothing.
- [ ] Load Monaco only for the coding workspace, configure Cangjie text/tokenization, and expose saved/unsynced/conflict status with accessible text. Introduce account/problem-scoped Dexie storage, base revisions and recoverable local candidates.
- [ ] Test offline editing, closing/reopening, reconnect and a conflicting second tab. Preserve both candidates until explicit choice. A delayed save response for old text must not mark newer edits saved.
- [ ] Show previously validated work as outdated after edits. Save/resolve before Run, Validate or submission review. Clear active account context on sign-out without deleting its recoverable drafts or exposing them to the next account.
- [ ] Run `npm run test:journeys -- hello-world-drafts`; manually confirm keyboard access, labeled editor/actions and readable status. This is the first implementation demonstration checkpoint.

### Task 5: Durable evaluation requests and restricted delivery

**Files:** Create evaluation transport contract/adapter, Topic submission application/PostgreSQL operations, evaluation/status routes, application-jobs entry point and `tests/integration/dispatch.test.ts`, `claims.test.ts`, `cooldown.test.ts`.

**Consumes:** Fixed persisted work, assessment and actor. **Produces:** Durable pending operation, dispatch intent and fenced worker payload.

- [ ] Write transaction fault tests: terminate between attempt/intent insertion, after exchange upsert and before pg-boss notification acknowledgement. Expect either no accepted operation or recoverable dispatch, never a lost accepted request.
- [ ] Implement idempotency by actor/request key and canonical payload hash. A repeated key with identical intent returns the original operation even during cooldown; a reused key with changed intent is rejected. Lock the learner/problem window before accepting a new manual batch.
- [ ] Test two concurrent manual Validates and pending status after five seconds. Require a shared five-second minimum and completion before another manual Validate. Single Run and submission-required evaluation do not inherit the manual cooldown, but duplicate/overlapping actions are coalesced or rejected explicitly.
- [ ] Implement an outbox dispatcher, exchange-row lease operations and pg-boss consumer startup using queue-only runtime credentials. Set a local pilot policy of one active sandbox and bounded queue admission; record exact limits/configuration and treat busy as retryable, not a learner failure.
- [ ] Use an initial operational retry limit of three deliveries, with persisted backoff and visible retryable-error after exhaustion. A retry increments execution generation only when the prior claim expires; an explicit learner recovery action resumes the same frozen operation context. Confirm repeated notifications cannot launch concurrent generations.
- [ ] Run `npm run test:integration -- dispatch claims cooldown database-roles`. Verify worker startup/claim/heartbeat/outcome writes work without business-table access or schema-migration permission. Verify an expired generation's write is refused.

### Task 6: Real isolated Cangjie execution and durable outcomes

**Files:** Create evaluation worker main/sandbox files and `tests/integration/evaluator.test.ts`; retain `tools/evaluator/` as separate feasibility/regression tooling.

**Consumes:** Task 5 versioned execution payload. **Produces:** Bounded, associated, durable execution evidence; no score fields.

- [ ] Implement the Node/TypeScript coordinator using the documented sandbox boundaries. Transfer/preserve containment behavior from the prototype deliberately; do not expose the Python command-line runner as the public service or assume its reports implement durable worker recovery.
- [ ] Pin image digest/runtime configuration and verify Cangjie identifies as 1.0.5. Initially retain the demonstrated local profile: 60-second compilation, five-second execution, 1 MiB combined stdout/stderr capture per phase, 2 GiB memory, one CPU, guest NPROC 32, host PID limit 256, separate 256 MiB work/tmp mounts. Record that broader/native-thread coverage remains limited.
- [ ] Mount only source/input read-only, execute as UID 10001 with network disabled, read-only root, dropped capabilities and no-new-privileges. Keep expected output, queue credentials, application files and Docker socket outside the sandbox. Enforce budgets externally on compilation and execution.
- [ ] Associate sandbox ownership and lease with request/generation. Handle SIGINT/SIGTERM, cleanup in finally, reconcile abandoned containers at worker startup and refuse to remove containers with live leases. A worker outage alone does not imply a periodic orphan watchdog.
- [ ] Test actual approved source, wrong greeting, compile error, nonzero exit, timeout and excess output. Persist byte evidence before acknowledging job completion; kill the worker between persistence and acknowledgement and recover the same outcome. Treat setup/daemon/cleanup failures conservatively as operational failures, not fabricated learner results.
- [ ] Run `npm run test:integration -- evaluator` against the Linux/gVisor host and `database-roles` against real PostgreSQL. Repeat the maintained relevant containment/credential probes after integrating the new coordinator; mocked execution is insufficient evidence.

### Task 7: Ingest, grade, review and atomically finalize submission

**Files:** Extend Topic submission operations/PostgreSQL adapter, add review/confirmation routes, extend application-jobs host; create `tests/integration/ingestion.test.ts`, `submissions.test.ts`, `progress.test.ts`.

**Consumes:** Durable worker evidence, Task 2 rules, current draft and reviewed work. **Produces:** Canonical feedback, batch result, finalized submission and retained progress.

- [ ] Reject wrong request/source/assessment/case identities, invalid byte encodings, oversized evidence and stale claim generations. Ingest one canonical result and continuation state transactionally; a repeat cannot add points twice. Acknowledge exchange ingestion only after canonical persistence is confirmed.
- [ ] Compare bytes and filter feedback in the trusted application. Passing batch inserts solved achievement idempotently; single Run never does. Compilation failure yields 0/10 batch evidence; platform failure leaves the attempt retryable with no assumed batch score.
- [ ] Implement server-stored submission review and confirmed fixed snapshots. Reject review confirmation if current work/assessment changed since review. If the confirmed work is attempted, reuse only a matching complete batch or request one; if unattempted, require explicit zero-point acknowledgement. Run-only success still requires a batch for scoring.
- [ ] Finalize only once every required result is confirmed. For passing Hello World, atomically store 10/10, retain best evidence, complete its topic and unlock Identifiers. For zero, store 0/10 without first completion; retain prior completions/best evidence on retries.
- [ ] Write PostgreSQL concurrency/fault tests for duplicate confirmations, concurrent progress updates and a crash immediately before/after commit. Repeated continuation must produce one consistent result. Test content revision change during confirmed work: keep that submission's fixed assessment; independent new work uses the corrected revision.
- [ ] Run `npm run test:integration -- ingestion submissions progress`. Check unauthenticated/foreign operation status and hidden fields through both live and restored views.

### Task 8: Complete learner workflow and reconnect behavior

**Files:** Extend coding workspace/topic page, add `tests/journeys/hello-world-workflow.spec.ts`.

**Consumes:** Tasks 3–7 operations. **Produces:** Complete browser path with Run, Validate, review, Submit, polling and restored progress.

- [ ] Write the journey: open correct starter; Run passes with no points; Validate produces 10/10 and solved status but no topic completion; review/confirm Submit; see completed topic and Identifiers unlocked; reopen and recover source/result/progress.
- [ ] Add an untouched-starter submission journey: review explicitly says unattempted 0/10; cancellation finalizes nothing; acknowledged confirmation finalizes zero. No implicit validation of untouched work.
- [ ] Show pending, retryable service failure, compiler failure, output mismatch and outdated-result states in plain language. Render formatting differences with text/symbols plus the accepted green/orange/red distinction; do not rely on color alone.
- [ ] Persist operation identity locally before sending a request. Following a lost response, reconnect/query or retry the same key rather than inventing another submission. Confirm ownership on every polling/read path.
- [ ] Run `npm run test:journeys -- hello-world-workflow hello-world-drafts`. Verify browser reload during pending work recovers the eventual result, and a lower 0/10 retry still shows retained 10/10 and Identifiers availability.

### Task 9: Failure matrix, broader fixture and reproducible milestone evidence

**Files:** Create `tests/integration/recovery.test.ts`, `feedback-visibility.test.ts`, extend the runbook and record evidence against RISK-01/RISK-02.

**Consumes:** The complete implemented workflow. **Produces:** Repeatable evidence satisfying the milestone, with explicit remaining release gaps.

- [ ] Interrupt at these named boundaries: before dispatch commit; after commit before notification; during sandbox compilation/execution; after durable outcome before queue acknowledgement; after canonical ingestion before continuation; immediately before and after progress finalization commit. Restart the affected hosts and assert recoverability or one finalized result.
- [ ] Add duplicate-result, expired-claim, exhausted-retry and corrected-assessment checks. A malformed or absent outcome never becomes zero; a stale result never overwrites newer accepted evidence.
- [ ] Run an existing Expressions item as an internal fixture with visible and hidden inputs and partial results. Assert hidden outputs/diagnostics absent from HTTP responses, page serialization, reconnect views and routine logs. Do not add cases to Hello World or change real learner prerequisite rules for this fixture.
- [ ] Record actual dependency versions, image digest, runtime aliases/versions, schema migration ID, role-grant checks, resource policy, invocation commands and exact report identifiers. Keep bulky raw reports and machine-specific paths local. Do not store secrets or personal filesystem paths in the maintained runbook.
- [ ] Run `npm run check`, focused domain/integration suites, and both browser journeys. Document any unavailable real dependency as an unverified gap rather than substituting a mock pass.
- [ ] Update the risk register with observed results. Keep RISK-01 In progress if deployment-host or other acceptance evidence remains missing; do not equate this local milestone with full MVP launch readiness.

## 6. Exit checklist

- [ ] A reproducible local application/DB/worker setup with pinned versions and separate credentials.
- [ ] Actual browser edit/save/reload, Run, Validate, review/Submit and reconnect paths pass.
- [ ] Hello World retains one test and produces only 0/10 or 10/10 confirmed scores.
- [ ] A passing finalized submission unlocks Identifiers; Validate alone does not.
- [ ] Attempts/results/submissions are associated with exact code and revision; confirmed work is immutable.
- [ ] Repeated requests, crashes, stale claims and lower retries preserve the established domain outcomes.
- [ ] Queue-only grants, sandbox restrictions, cleanup, retained outcomes and hidden-feedback filtering have real evidence.
- [ ] Internal identity/prerequisite fixtures and remaining Google/onboarding/deployment work are explicitly identified.

The first deliverable to implement is Tasks 1–4: an authorized content-backed editor whose drafts survive reload, offline interruption and competing saves. Then connect durable execution and finalization through Tasks 5–8 and collect milestone evidence in Task 9.
