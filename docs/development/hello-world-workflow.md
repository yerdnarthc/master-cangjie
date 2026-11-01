# Hello World Coding Workflow Runbook & Evidence

This document records the exact runtime environment, pinned components, database roles, execution procedures, and verification evidence for the MasterCangjie Hello World milestone per [2026-11-01-hello-world-integration.md](../superpowers/plans/2026-11-01-hello-world-integration.md).

The [independent verification of commit c5ea8d6](hello-world-verification.md)
preserves the original audit and records the completed recovery follow-up. The
Hello World coding-path recovery milestone now has passing real-process,
persistence and browser evidence; see that report for scope and test-clock details.

---

## 1. Environment & Pinned Versions

| Component | Pinned Version / Digest | Notes |
| :--- | :--- | :--- |
| **Node.js** | `>=24.0.0 <25` (tested `v24.22.1`) | Pinned in `.nvmrc` and root `package.json` |
| **npm** | `12.2.1` | Pinned with `package-lock.json` |
| **Next.js** | `16.4.3` | App router, React 19.3.1, `@mcj/web` |
| **PostgreSQL** | `postgres:18.6` (`sha256:3a4264520e121176...`) | Exposed on port `15432` via `compose.development.yml` |
| **Queue** | `pg-boss` `12.38.0` | Schema `evaluation_queue`, queue `cangjie-evaluate` |
| **Cangjie Evaluator Image** | `sha256:77cf9faa236790dbd636cb41c93c62f3b1a12c3e5e5630b3892eee9ba15b0534` | Cangjie LTS 1.0.5 in Ubuntu container |
| **Sandbox Isolation** | `runsc-systrap` | gVisor systrap runtime in Docker |
| **Monaco Editor** | `0.56.0` (`@monaco-editor/react` `4.7.0`) | Client-side dynamic import in workspace |
| **Client Storage** | `dexie` `4.4.7` | IndexedDB recovery for unconfirmed drafts |

---

## 2. Architecture & Role Separation

### Database Roles & Permissions
1. **`mcj_migrate`**: Schema owner. Runs migrations (`0001_hello_world.sql`, `0002_worker_leases.sql`) and pg-boss queue setup.
2. **`mcj_app`**: Web host credentials. Granted `SELECT, INSERT, UPDATE, DELETE` on public business tables and `evaluation_exchange.jobs`. Explicitly revoked from `schema_migrations`.
3. **`mcj_worker`**: Isolated execution worker credentials. Strictly prohibited from reading any public business tables (`learner_accounts`, `topics`, `coding_drafts`, `topic_submissions`). Granted `EXECUTE` only on `evaluation_exchange` functions (`claim_job`, `heartbeat`, `finish_job`).

Verified by automated integration suite: `tests/integration/database-roles.test.ts`.

---

## 3. Repeatable Verification Suites

### A. Static Architecture & Type Checks
```bash
npm run check
```
* Runs `tsc --noEmit` across all modules and applications.
* Runs `tools/development/check-boundaries.mjs` ensuring:
  * Domain modules (`modules/**/domain/`) import zero frameworks or adapters.
  * Worker coordinator (`apps/evaluation-worker/`) imports no scoring or progression logic.
  * Components (`apps/web/src/components/`) import no direct database persistence.

### B. Pure Domain Tests (Deterministic, no DB)
```bash
npm run test:domain
```
* Verifies exact byte matching (`Hello, World!\n`), passing threshold (`5 * earned >= 3 * possible`), fraction-based best score retention, and zero-requirement gates.
* Test suite: `evaluation.test.ts` (36 tests), `progress.test.ts` (10 tests) — **46 passed**.

### C. Real Database & Transport Integration Tests
```bash
npm run test:integration
```
* `content-and-identity.test.ts`: Authorized content reads, public problem projection, session development actor.
* `drafts.test.ts`: Compare-and-swap saves, revision conflict preservation, resolution against base revision.
* `cooldown.test.ts`: 5-second minimum manual validation cooldown, concurrency locking.
* `dispatch.test.ts`: Outbox generation, exchange job insertion, pg-boss dispatch notification.
* `claims.test.ts`: Monotonic execution generation, heartbeat lease extension, fencing stale claim evidence.
* `ingestion.test.ts`: Durable outcome ingestion, exact grading (10/10), solved achievement recording.
* `submissions.test.ts`: Unattempted 0/10 acknowledgement, qualifying batch reuse, atomic progress finalization, Identifiers unlocking, lower-score retry retention.
* `feedback-visibility.test.ts`: Complete masking of hidden test inputs/outputs/diagnostics from learner responses.
* `recovery.test.ts`: Operational error handling without fabricating scores, learner-initiated retry.

### D. Browser Journeys (Playwright & Monaco Editor)
```bash
npx playwright test hello-world-drafts
npx playwright test hello-world-workflow -g "untouched starter"
```
* Verified browser journeys with Monaco and plain text editor fallback, local draft recovery through IndexedDB/Dexie, reload preservation, and untouched submission zero-point confirmation.

---

## 4. Evidence Summary against Risk Register

* **RISK-01 (Evaluation containment and isolation)**:
  * Demonstrated real gVisor systrap container running Cangjie 1.0.5 (`master-cangjie-evaluator:1.0.5-prototype`, `sha256:77cf9faa2367...`).
  * `content-check.py` passes with zero failures on Hello World starter and reference implementations.
  * Role isolation verified: `mcj_worker` cannot access business tables or manufacture scores.
* **RISK-02 (Database concurrency and state integrity)**:
  * Transaction boundaries verified: atomic draft compare-and-swap, evaluation dispatch outbox, and progress finalization.
  * Monotonic progress retention verified: passing 10/10 score and completion cannot be overwritten by a subsequent 0/10 attempt.


## Local startup and isolated verification

Run from the repository root using Node 24 and installed locked dependencies.
On Windows PowerShell, use `npm.cmd` where execution policy blocks `npm.ps1`.
Copy `.env.example` to `.env` and configure the four database URLs, development
session secret and evaluator image/runtime. Never commit credentials.

1. Start PostgreSQL: `docker compose -f compose.development.yml up -d`.
2. Initialize the development database with `npm run db:migrate`,
   `npm run db:roles`, and `npm run db:seed:milestone`.
3. Start the trusted web and continuation processes in separate terminals:
   `npm run dev:web` and `npm run dev:jobs`.
4. On the Linux/gVisor host, provide a reachable `WORKER_DATABASE_URL`, the pinned
   image/runtime, and an absolute writable `MCJ_EVALUATOR_LEASE_DIRECTORY` such as
   `/tmp/master-cangjie-evaluator-leases`, then run `npm run dev:worker`.
   The worker needs Docker access; the untrusted sandbox receives no database
   credentials. Preserve the lease directory across worker restarts.
5. Open `http://127.0.0.1:3000/topics/running-the-first-cangjie-program`.

The configured test database name must end in `_test`. Run static/domain and
integration suites first; they must not run concurrently with browser journeys or
process-recovery checks because those suites share the test database.

Browser journeys now use a separate test web host on port 3001 and refuse to reset
a non-test database. Initialize the test database by running the integration suite.
Start `npm run test:host -- jobs` on the trusted host and
`npm run test:host -- worker` on Linux with the evaluator lease directory configured.
These commands map runtime database URLs to the configured test database while
retaining each role. Then run `npm run test:journeys`; Playwright starts/stops its
own web host. `MCJ_JOURNEY_PORT` can select another unused port. Do not start a
second web host on that port. Stop test jobs/worker before persistence suites.

On Linux, `npm run test:recovery:process` runs the real-process recovery
harness. Its required configuration and scenarios are described in the harness.
It must target only the dedicated test database, with no competing test worker.
The harness uses the pinned real compiler and sandbox; constructed evidence in
ordinary persistence tests is not a substitute for this check.


### Cross-platform dependency note

Use a platform-native dependency install on each host. A Windows `node_modules`
directory shared into WSL can run the pure JavaScript worker, but native Vitest/Vite
bindings may be missing. The recovery verification used the matching Linux
`@rolldown/binding-linux-x64-gnu@1.2.16` in `/tmp/mcj-linux-verification`, supplied
through `NODE_PATH`, to execute the six existing real-sandbox tests without
changing the repository dependency lock. A fresh Linux `npm ci` is the normal
repeatable setup.


## Onboarding lesson entry (2026-11-02)

`/topics/running-the-first-cangjie-program` now opens its lesson handout.
Select **Open Hello World activity** to reach the unchanged assessment workflow
at `/topics/running-the-first-cangjie-program/activity`. The activity provides a
**Back to lesson** link. Saved work and operation APIs keep their existing keys;
lesson navigation does not create assessment attempts or progress.
