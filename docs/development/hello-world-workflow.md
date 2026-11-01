# Hello World Coding Workflow Runbook & Evidence

This document records the exact runtime environment, pinned components, database roles, execution procedures, and verification evidence for the MasterCangjie Hello World milestone per [2026-11-01-hello-world-integration.md](../superpowers/plans/2026-11-01-hello-world-integration.md).

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
