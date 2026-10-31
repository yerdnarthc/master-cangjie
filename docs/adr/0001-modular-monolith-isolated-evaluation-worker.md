---
status: accepted
date: 2026-11-01
---

# Use a modular monolith with an isolated evaluation worker

Keep the trusted learning, submission, draft, and account modules in one application release, while compiling and running learner code on an isolated evaluation host. This keeps submission finalization and earned progress local and consistent without putting untrusted learner execution in the application process. A separately deployed browser and distributed business modules were considered; neither provides enough current MVP benefit to justify additional transport and distributed consistency work.

## Consequences

- Web and background continuation hosts share the application's business modules and release. The evaluator supplies execution evidence but cannot mutate application scores or progress.
- Learner programs receive no application credentials, and database transactions never remain open during compilation or execution.
- This decision records the architecture shape. The user separately accepted the [MVP technology stack](../mvp-stack.md) on 2026-11-01. [Architecture details](../architecture.md) define module ownership, dependency direction, and test strategy.
