# MVP Technology Stack

## Status and assumptions

**Accepted on 2026-11-01.** The user confirmed this stack for implementing Option A — modular monolith plus an isolated evaluation worker. The [architecture decision](adr/0001-modular-monolith-isolated-evaluation-worker.md) and the technology choices below are accepted. Exact compatible package versions, deployment configuration, and the documented integration checks remain implementation work.

This stack assumes a browser-first MVP maintained by one person. It favors a common application language, one transactional data platform, and focused external adapters. It does not assume a specific number of users, evaluation throughput, cloud provider, or monthly budget.

Use the [risk register](risk-register.md) when sequencing implementation and collecting evidence for the compatibility, recovery, capacity, curriculum, and learner-validation assumptions.

## Accepted stack

| Concern | Selected technology | Why it fits and what it does not decide |
| --- | --- | --- |
| Application language and runtime | TypeScript on a supported Node.js LTS release | One language across the web host, trusted continuation host, and worker coordinator. Domain code remains independent of runtime effects. Cangjie remains the learner-code language, not a requirement for writing the website. |
| Web host and UI | Next.js App Router with React | One origin for UI and trusted web operations, with server rendering where useful and client-side editor/draft behavior. Self-hosted Node or container deployment is supported by the [official Next.js guidance](https://nextjs.org/docs/app/guides/self-hosting). |
| Web transport | Thin Next.js Route Handlers; Server Actions for suitable forms | Both invoke the same UC orchestration. Server Actions do not remove authentication or authorization requirements; follow the [official data security guidance](https://nextjs.org/docs/app/guides/data-security). Use ordinary status queries for long-running evaluations initially. |
| Styling | Tailwind CSS with accessible HTML controls | Use basic styling for a clean, functional MVP following the already defined UX architecture and UC flows. Full visual polish, a dedicated visual design, and a design system are deferred. Additional visual-design tooling or UI libraries can be introduced later. |
| Database | PostgreSQL, using a supported stable release | Stores immutable assessment/submission context and transactional progress. Use constraints and a deliberate concurrency strategy rather than assuming a default transaction solves every race. See [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html). |
| Persistence tooling | Drizzle ORM and migrations, contained in persistence adapters | SQL-oriented persistence while keeping ORM types out of domain contracts. It supports explicit [transactions](https://orm.drizzle.team/docs/transactions); locking, uniqueness, migration roles, and retry behavior still need deliberate implementation. |
| Google sign-in and sessions | Better Auth with its Google provider and database adapter | Its official documentation covers the [Google provider](https://better-auth.com/docs/authentication/google) and [database integration](https://better-auth.com/docs/concepts/database). Enable only the accepted Google access flow; keep contact-email/mobile verification separate from auth identity and disable deferred linking/sign-in flows. |
| Durable jobs | pg-boss backed by PostgreSQL | A PostgreSQL-backed job queue reduces the need to operate a separate queue database for the MVP. Its [official repository](https://github.com/timgit/pg-boss) documents background work and transactional enqueue support, including ORM integrations. It does not replace application-level duplicate prevention or trusted scoring. |
| Code editor | Monaco Editor, loaded only for coding activities | The [official editor project](https://github.com/microsoft/monaco-editor) provides the editing foundation. Configure Cangjie text editing and basic tokenization; do not assume a VS Code extension works unchanged in the browser or promise a full Cangjie language-server integration for MVP. |
| Offline activity drafts | IndexedDB through Dexie | Dexie provides an [IndexedDB abstraction](https://dexie.org/docs). Keep code and answer drafts account-scoped, preserve base revisions, and implement the product's explicit conflict choice. Browser storage is not the authority for scores, unlocks, or confirmed saved-on-server status. |
| Code execution | Separate Linux worker coordinator using Node.js/TypeScript, with Cangjie LTS 1.0.5 pinned inside disposable execution environments | Code is dispatched asynchronously, outside the web host. The [official Cangjie download page](https://cangjie-lang.cn/en/download) describes Linux distributions generally; compatibility of the exact pinned artifact and sandbox must be checked, not inferred. |
| Execution isolation | gVisor/runsc on a dedicated evaluation host, subject to compatibility and containment checks | gVisor is designed for [workload isolation](https://gvisor.dev/docs/architecture_guide/intro/). Its [security model](https://gvisor.dev/docs/architecture_guide/security/) still permits capabilities such as mapped files and network where configured; explicitly restrict them. This is the selected baseline, not a claim that Cangjie 1.0.5 has already been tested under it. |
| Profile images | S3-compatible object storage through a profile adapter | Keeps images outside application deployment files. Storage provider and region remain unchosen. Validate input and update the active profile reference only after the accepted image is available. |
| Contact email delivery | Resend | Its [Node.js integration](https://resend.com/docs/send-with-nodejs) supports transactional delivery. The learner-account module owns the pending contact and verification lifecycle; delivery alone does not verify ownership or change Google identity. A sending domain and provider configuration are still required. |
| Mobile verification | Twilio Verify | [Verify](https://www.twilio.com/docs/verify) supplies verification workflows. Keep it behind a contact-verification adapter and map accepted evidence to the current request. Region availability, usage controls, and pricing need checking before purchase or launch. No mobile sign-in is enabled. |
| Domain and UC tests | Vitest | Use [Vitest](https://vitest.dev/guide/) for deterministic domain and module-interface behavior; use the real PostgreSQL engine for persistence/concurrency evidence rather than a fake that cannot reproduce it. |
| Browser journeys | Playwright | Use [Playwright](https://playwright.dev/docs/intro) for the selected UC journeys and hidden-feedback assertions. Ordinary automated runs use controlled external adapters rather than sending real verification messages. |
| Dependency checks and automation | TypeScript checks, lint/import rules, and repository CI | Enforce dependency direction and UC acceptance behavior. Choose a small workspace setup; a monorepo orchestration framework is unnecessary until the source build justifies one. |

Pin exact compatible package versions and compiler artifacts when implementation starts. Do not use an unreviewed floating production image. The source links support stated capabilities; this accepted combination is not a vendor-tested reference deployment.

## MVP UI scope

Build a working, clean UI around the UX architecture and use-case flows already defined in the project. Keep navigation, forms, the code editor, assessment feedback, saving status, loading states, errors, and recovery actions understandable and accessible. These behaviors are part of delivering the MVP.

Visual polish, detailed branding, a dedicated visual design, and a full design system come later. They do not block MVP implementation. Introduce any additional visual-design tooling or UI libraries into the stack when that work begins; no such library is selected by this acceptance.

## Why this combination

TypeScript lets the browser and trusted Node hosts share small domain representations without sharing authorization authority or provider credentials. Next.js supplies the single web host from Option A, while framework-independent modules keep UC behavior portable.

PostgreSQL supplies the transactional record authority needed by submissions and progress. A PostgreSQL-backed queue can keep durable dispatch within that data platform rather than adding Redis solely for initial background work. pg-boss documents an [enqueue transaction adapter](https://github.com/timgit/pg-boss/blob/master/docs/api/jobs.md); verify the exact selected Drizzle/pg-boss combination during integration.

The learner-code runtime is deliberately separate from the application runtime. Browser Monaco edits source; it does not compile Cangjie or establish scores. A trusted worker coordinator controls the compiler and sandbox, while the application interprets execution evidence using the existing domain algorithms.

## Runtime arrangement

| Runtime | Contains | Credential/access scope |
| --- | --- | --- |
| Web host | Next.js UI, transport adapters, trusted UC operations, authentication integration | Application records and required dispatch privileges, through authorized adapters |
| Trusted application continuation host | Background ingestion and resumption of pending UC work from the same business release | Required application records and job mechanisms, without browser sessions |
| Evaluation worker coordinator | Queue adapter and execution orchestration on the separate Linux host | Evaluation queue scope only, with no learner-account/contact/progress table access |
| Learner-code sandbox | Fixed code, permitted test input, pinned compiler/runtime, temporary workspace | No database, queue, Google, delivery, storage, or application credentials |

The first two hosts can be two processes on one trusted application host for the pilot. They remain one coordinated release. Do not put the evaluator on that host simply to make local development or deployment cheaper.

For pg-boss, reserve an evaluation-only queue scope separate from any notification/authentication work. A dedicated schema and restricted runtime grants are the proposed mechanism; migrations run with separate privileges. Verify that worker startup, claim, heartbeat, result retention, and retry functions work without granting application-table or schema-migration privileges. See [pg-boss operations](https://github.com/timgit/pg-boss/blob/master/docs/api/ops.md) and [worker behavior](https://github.com/timgit/pg-boss/blob/master/docs/api/workers.md).

Queue records and default cleanup settings are not the permanent assessment ledger. Preserve confirmed business results in application records, and keep unconsumed execution outcomes durable until ingestion. Duplicate delivery or a restarted consumer must not double-finalize a topic.

## Hosting recommendation

Use a container-capable Node.js host for the trusted application, managed PostgreSQL where budget permits, object storage, and a separate Linux evaluation host with control over the sandbox runtime. Keep network paths private and credentials scoped to their task.

No cloud provider is chosen or priced here. The key requirement is support for persistent background work and the selected Linux isolation mechanism. A platform suited to web requests is not automatically suited to the evaluator. Moving the web host to a serverless platform later must retain durable continuation and isolation behavior.

Local development may run the web application and PostgreSQL locally. On Windows, exercise the real evaluator through an appropriate isolated Linux environment or dedicated development host. A fake evaluator is useful for domain/UI work but does not prove compiler compatibility, resource limits, or sandbox containment.

## Deferred work

- Kubernetes, independent deployments for each business module, an additional Redis installation, and a general event-streaming platform.
- A standalone frontend deployment or mobile-client contract without a concrete client/release need.
- A full Cangjie language-server integration, arbitrary package installation, and multi-language execution.
- Full visual polish, detailed branding, a dedicated visual design, a design system, and additional visual-design tooling or UI libraries.
- Exact infrastructure sizing, concurrency targets, verification limits, upload constraints, and storage retention; these must follow explicit operating requirements.
- Provider accounts, purchases, provisioning, package installation, migrations, and product implementation. This document authorizes none of those actions by itself.

## Implementation and launch checks

The approved optional structural-requirement gate additionally needs a defined
requirement vocabulary and reliable Cangjie 1.0.5 analysis adapter. No analyzer or
parsing dependency is selected yet. Do not treat substring matching as implemented
structural verification. The trusted application retains scoring authority; the
adapter supplies source/revision-associated compliance evidence.

1. Use the accepted stack as the implementation baseline and pin compatible versions. Record any necessary technology changes explicitly without silently replacing the accepted Option A shape.
2. Confirm the deployment region, pilot budget, and expected simultaneous evaluations.
3. Obtain the exact Cangjie LTS 1.0.5 artifact for the worker architecture and check its build/runtime dependencies.
4. Demonstrate compile/run behavior, containment, resource limits, and cleanup under the selected sandbox. If it is incompatible, document and evaluate an alternative isolation mechanism while retaining the same execution seam.
5. Verify transactional enqueue with the chosen persistence versions and queue-only worker grants without migration privileges.
6. Verify duplicate finalization recovery, stale worker outcomes, and restored feedback against the UC and domain acceptance scenarios.

These checks are future implementation evidence, not results claimed by this documentation work.
