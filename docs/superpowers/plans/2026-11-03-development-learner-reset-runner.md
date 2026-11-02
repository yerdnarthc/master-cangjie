# Development Learner Reset Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one short, guarded command that resets the local development learner's server-side activity and progression to the first onboarding topic.

**Architecture:** Keep the database reset in a transactional persistence operation and expose it through a small Node/TypeScript CLI. Invoke it with Node 24's existing `--experimental-transform-types` project pattern so the command works from WSL or PowerShell without relying on a platform-native `tsx`/esbuild binding. The CLI must validate the configured target before connecting, require an explicit typed confirmation, and report that browser IndexedDB needs separate cleanup.

**Tech Stack:** Node.js 24, TypeScript, PostgreSQL (`pg`), Vitest.

**Spec:** `docs/architecture.md` (migration and content-maintenance tooling, required consistency); `docs/domain-model.md` (INV-03 and progression state); `docs/development/hello-world-workflow.md` (local environment and verification setup). This is development tooling, not a new learner-facing use case.

## Global Constraints

- Operate only on `MIGRATION_DATABASE_URL` after confirming `MCJ_DEVELOPMENT_IDENTITY=true`, a loopback host, and the exact development database name `mcj_hello`. Require `DATABASE_URL` to identify the same host, port, and database; reject `_test`, remote hosts, mismatched URLs, other database names, malformed URLs, and production mode before opening a pool.
- Reset only the fixed development learner `LEARNER` (`10000000-0000-4000-8000-000000000001`). Preserve learner accounts, topics, assessment revisions, and every other learner's records.
- Use one database transaction. Delete dependent evaluation and submission records in foreign-key-safe order, clear server drafts/conflicts, then ensure every topic has progress with only `getting-started-with-cangjie` available and all completion/best-result fields cleared.
- Do not drop/recreate the database or Docker volume. Do not change the test-only behavior of `tests/journeys/reset.ts`.
- The command cannot clear browser storage. Document deleting the `master-cangjie-work` IndexedDB database for `http://localhost:3000` separately; preserve cookies/session state.
- Never print database credentials or full connection URLs.
- Keep implementation and any later commit scoped to the files listed in this plan; leave existing unrelated working-tree edits untouched.

## Review Focus

1. A remote, test, production, malformed, or wrong-name database target must be rejected before any connection or mutation. Cover each rejected target in the guard test.
2. Confirmation cancellation or non-interactive input must leave data unchanged. Cover both paths in the CLI/guard test.
3. A reset with evaluation jobs and linked attempts/submissions must complete in FK-safe order and atomically. Assert all target learner activity rows are gone in the PostgreSQL integration test.
4. Another learner's progress and activity must remain unchanged. Seed a second learner with representative records and assert preservation in the same integration test.
5. Existing browser-local drafts can restore stale work after the server reset. Document the exact IndexedDB cleanup and verify it is stated in the runbook and CLI output.

---

### Task 1: Add the transactional learner reset operation

**Files:**
- Create: `infrastructure/persistence/reset-development-learner.ts`
- Create: `tests/integration/development-learner-reset.test.ts`

**Interfaces:**
- Produces: `resetDevelopmentLearner(pool: pg.Pool, learnerId: string): Promise<ResetDevelopmentLearnerResult>`; return deleted row counts grouped as `jobs`, `dispatches`, `validationWindows`, `achievements`, `submissions`, `reviews`, `attempts`, `codingDrafts`, `codingConflicts`, `quizDrafts`, and `quizConflicts`.
- The operation accepts the learner ID for integration-test isolation. Only the CLI may pass the fixed `LEARNER` identity.

- [ ] **Step 1: Write the PostgreSQL integration test first.** Create two isolated learners with progress rows and representative linked records across evaluation jobs/dispatch, attempts, validation windows, achievements, topic submissions/reviews, coding drafts/conflicts, and quiz drafts/conflicts. Call the operation for the first learner. Assert its activity rows are removed, every topic has only the initial topic available with completion and best-result fields cleared, the second learner is unchanged, and account/content rows remain.
- [ ] **Step 2: Run the new integration test against `TEST_DATABASE_URL`.** Run `npx vitest run --project integration tests/integration/development-learner-reset.test.ts`. Expected: it fails because `resetDevelopmentLearner` is not implemented.
- [ ] **Step 3: Implement `resetDevelopmentLearner(pool, learnerId)`.** Use the existing `transaction` helper. Delete jobs and dispatch/validation/achievement rows before their referenced attempts; delete submissions before their referenced reviews and attempts; then delete learner-owned drafts and conflicts. Upsert progress from `topics` so all current topics exist, only `getting-started-with-cangjie` is available, and `completed`, `best_score`, `best_submission`, and `provenance` are cleared. Return the affected-row counts.
- [ ] **Step 4: Run the integration test again.** Expected: the operation is called with a pool connected to `TEST_DATABASE_URL`; it does not run the CLI or mutate learner data in `mcj_hello`.

### Task 2: Expose a one-command development CLI

**Files:**
- Create: `tools/development/reset-local-learner.ts`
- Modify: `package.json`
- Test: `tests/integration/development-learner-reset.test.ts`

**Interfaces:**
- Produces: package command `npm run db:reset:dev`, invoking `node --experimental-transform-types tools/development/reset-local-learner.ts`.
- Create `assertDevelopmentResetTarget(migrationUrl: string, runtimeUrl: string, environment: { developmentIdentity?: string; nodeEnv?: string }): void`; reject unless both URLs use the same loopback host, port, and exact database `mcj_hello`, `MCJ_DEVELOPMENT_IDENTITY` is `true`, and `NODE_ENV` is not `production`.
- Create `isResetConfirmation(answer: string | undefined): boolean`; accept only the trimmed exact input `reset`. The CLI must exit before creating a pool if stdin is non-interactive or the user declines.

- [ ] **Step 1: Add guard and confirmation tests.** Assert the configured local development URLs are accepted. Assert remote hosts, different hosts/ports/databases between the two URLs, the `_test` database, any other database name, malformed URLs, missing development identity, and production mode are rejected before connection. Assert only exact `reset` confirmation succeeds; decline and missing/non-interactive input do not authorize the reset.
- [ ] **Step 2: Run the guard tests and confirm they fail for the missing guard.** Run `npx vitest run --project integration tests/integration/development-learner-reset.test.ts`.
- [ ] **Step 3: Implement the CLI and package command.** Load the existing runtime configuration, validate `MIGRATION_DATABASE_URL`, `DATABASE_URL`, and development identity before creating a pool, display only the sanitized target and fixed learner ID, then require the user to type `reset`. Cancellation and non-interactive input must exit without connecting. On confirmation, call `resetDevelopmentLearner` for `LEARNER`, close the pool in `finally`, and report the reset counts plus the browser IndexedDB reminder. Do not expose secrets in error output.
- [ ] **Step 4: Run the guard and database integration tests.** Run the focused integration test command. Expected: target allow/deny cases and learner-isolation assertions pass.

### Task 3: Document the reset and its QA steps

**Files:**
- Modify: `docs/development/hello-world-workflow.md`

- [ ] **Step 1: Document the safe reset procedure.** Add the exact command `npm run db:reset:dev`, its `reset` confirmation prompt, and the requirement to stop `dev:web`, `dev:jobs`, and `dev:worker` first so they cannot create or process work during reset.
- [ ] **Step 2: Document browser cleanup.** Explain that the script only resets PostgreSQL. To discard local unsaved/recoverable drafts, open DevTools > Application > IndexedDB on `http://localhost:3000` and delete `master-cangjie-work`; cookies and the development session can remain.
- [ ] **Step 3: Verify the runbook and implementation.** Run `npm run check`, `npm run test:integration`, and review the new reset section against the implemented guards and actual cleanup behavior. Expected: checks pass and the documented command matches the package script.
- [ ] **Step 4: Commit the verified scoped change.** Stage only the reset CLI, transactional operation, tests, package script, and runbook. Use the conventional message `feat: add development learner reset runner`.

## Completion Evidence

- The focused PostgreSQL integration test passes against a database ending in `_test` and proves learner isolation, complete reset state, preservation of content/account data, and cleanup of linked records.
- Guard tests prove unsafe targets are rejected before connecting.
- `npm run check` and the complete `npm run test:integration` suite pass.
- The CLI has not been run against the development database during automated tests. Manual use is the explicit, confirmed operation `npm run db:reset:dev` against `mcj_hello`.
