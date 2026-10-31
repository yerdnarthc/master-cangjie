# MasterCangjie Risk Register

## Purpose and baseline

**Initial review: 2026-11-01.** This register preserves the risks identified after accepting the product specification, use cases, domain model, architecture, and MVP technology stack.

At this review, the repository contains design documentation and no application implementation. Accepted documents record decisions; they do not establish runtime compatibility, reliable recovery, operating costs, or learning effectiveness. The risks below are prospective failure scenarios, not claims of observed implementation defects.

Read this register alongside the [product specification](product.md), [use cases](use-cases.md), [domain model](domain-model.md), [architecture](architecture.md), and [accepted MVP stack](mvp-stack.md).

The main delivery risk is building most of the website before proving real Cangjie execution and reliable submission recovery.

## Priority overview

The ranking reflects the initial judgment about delivery impact and how early evidence is needed. It is not a measured probability estimate.

| ID | Risk | Main consequence | Initial status |
| --- | --- | --- | --- |
| RISK-01 | Evaluator compatibility and containment remain unproven | Core coding workflow blocked or unsafe to release | Open |
| RISK-02 | Interrupted or repeated evaluations produce inconsistent results | Wrong scores, lost unlocks, duplicate outcomes, or permanently pending submissions | Open |
| RISK-03 | MVP effort is underestimated | Schedule overruns and a broad but incomplete implementation | Open |
| RISK-04 | Curriculum preparation and correctness become bottlenecks | A working platform delivers weak or incorrect learning activities | Open |
| RISK-05 | Cooldowns are mistaken for capacity and cost control | Overloaded workers, excessive queues, or uncontrolled provider usage | Open |
| RISK-06 | Completion statistics are mistaken for learning evidence | Apparent engagement without demonstrated learner value | Open |

## RISK-01: Evaluator compatibility and containment remain unproven

**Failure scenario:** The web application is largely complete before discovering that the exact Cangjie LTS 1.0.5 artifact does not run correctly under the selected sandbox or host. Alternatively, execution works but resource restrictions, credential isolation, or worker queue permissions do not hold.

**Why it matters:** Running learner code is essential to the product. A fake evaluator, a successful Hello World outside the sandbox, or an accepted stack document cannot establish the required behavior. gVisor's [compatibility guidance](https://gvisor.dev/docs/user_guide/compatibility/) explicitly identifies trying a workload as the way to establish compatibility. Its [security model](https://gvisor.dev/docs/architecture_guide/security/) also requires deliberate configuration of permitted resources and access.

**Relevant operations:** UC-08, UC-09, UC-11, and UC-23.

**Early action:** Perform a focused evaluation feasibility check before substantial general feature implementation.

**Evidence required to reduce this risk:**

- The exact compiler/runtime artifact is identified and pinned for the real worker architecture.
- Representative programs compile and run under the actual selected sandbox, including exercises beyond Hello World.
- Compilation failure, wrong output, timeout, excessive output, and resource exhaustion produce the correct distinguishable outcomes.
- Network, filesystem, process, memory, time, and output restrictions are demonstrated for compilation and execution.
- Learner programs receive no application, queue, storage, delivery, or Google credentials.
- The trusted worker coordinator can operate with queue-only privileges and cannot read application accounts or mutate scores and progress.
- The chosen queue/persistence versions support the intended durable dispatch and result-ingestion path.

**Evidence at initial review:** None recorded for the implemented evaluator or deployment combination.

## RISK-02: Interrupted or repeated evaluations produce inconsistent results

**Failure scenario:** A worker finishes but the application restarts before finalization; an outcome arrives twice; an expired worker reports late; or code and assessment content change while evaluation is underway. The application credits the wrong work, loses an unlock, or leaves a submission pending indefinitely.

**Why it matters:** These failures happen between successful individual steps. A passing compiler test or an isolated score-calculation test does not prove that the entire submission workflow recovers correctly. The queue's delivery behavior does not replace application-level operation identity and duplicate prevention.

**Relevant operations:** UC-07 through UC-11, UC-13 through UC-17, and UC-24. See the domain's result-eligibility and progress invariants and the architecture's [recovery rules](architecture.md#recovery-rules).

**Early action:** Exercise UC-09 and UC-11 through real persistence and deliberately interrupt the workflow at meaningful transitions.

**Evidence required to reduce this risk:**

- A repeated request or repeated result produces one consistent finalized outcome.
- A restart after dispatch, evaluation, ingestion, or before finalization preserves recoverable work.
- Submission finalization and earned progress commit consistently; neither is left without the other.
- Edited code and corrected assessment revisions cannot reuse unrelated historical results.
- An old worker claim cannot replace a newer accepted outcome.
- A service failure remains unevaluated rather than becoming an assumed score of zero.
- Browser reconnect restores the recorded operation outcome without blindly creating another submission.
- Lower retries preserve the best finalized percentage, solved achievements, completion, and earned unlocks.

**Evidence at initial review:** Rules and scenarios are documented; executable recovery evidence is not yet recorded.

## RISK-03: MVP effort is underestimated

**Failure scenario:** The use-case list is treated as a collection of similarly sized tasks. Profile editing progresses quickly while offline drafts, conflicting edits, durable execution, verification, and historical assessment handling consume much more effort than expected.

**Why it matters:** A single UC identifier does not indicate implementation size. UC-17, resolving conflicting drafts, is materially different from changing a bio. The accepted MVP combines several demanding behaviors even though visual polish has been deferred.

**Relevant operations:** All implementation planning, particularly UC-09, UC-11, UC-16, UC-17, UC-21, and UC-22.

**Early action:** Estimate by risk and dependencies, and deliver complete working paths. UC numbering identifies behavior; it does not establish implementation order, effort, or one-module-per-UC structure.

**Evidence required to reduce this risk:**

- Implementation milestones identify their dependencies and unknowns rather than merely listing UC numbers.
- The core assessment path works before substantial time is spent on optional learner customization.
- Actual effort from early milestones informs later estimates.
- Every delivered UC includes its relevant exceptions and acceptance criteria, rather than only its easiest path.
- The implementation avoids unnecessary modules that merely forward arguments or duplicate existing business decisions.

**Scope constraint:** This register does not remove offline recovery, profile customization, or verification from the accepted MVP. Scheduling these after the first assessment demonstration is sequencing, not a silent release-scope change. Full visual polish remains deferred as already agreed.

**Evidence at initial review:** No implementation estimates or completed application milestones are recorded in this register.

## RISK-04: Curriculum preparation and correctness become bottlenecks

**Failure scenario:** The application is technically functional but release waits on lessons, coding problems, test cases, reference solutions, and reviewed questions. Incorrect expected output or ambiguous instructions then cause learners to fail valid solutions.

**Why it matters:** The current roadmap contains 18 topics, including five multiple-choice activities requiring 50 questions in total. It also contains 13 coding topics, whose problem and test inventory still require preparation. Exact output matching makes unintended whitespace in expected output consequential.

**Relevant operations:** UC-05 through UC-14, UC-23, and UC-24.

**Early action:** Prepare a few complete, reviewed topics alongside the first implementation path. Do not postpone all content authoring until the platform is finished.

**Evidence required to reduce this risk:**

- Reference solutions compile with the pinned Cangjie toolchain and pass every intended coding test.
- Expected outputs, including spaces and line endings, have been reviewed against the product's exact-match policy.
- Multiple-choice activities each contain ten reviewed questions with one correct choice per question and useful instructional context.
- The content inventory tracks readiness of lessons, problems, tests, and questions for every launch topic.
- Representative learners can understand the instructions and feedback without maintainer explanation.
- Content corrections preserve the historical score and unlock behavior already agreed in the product specification.

**Scope constraint:** Early content samples are internal implementation or pilot milestones. They do not redefine the accepted full launch roadmap.

**Evidence at initial review:** The topic inventory and scoring policies are specified; reviewed assessment content and reference-solution execution evidence are not present in the repository.

## RISK-05: Cooldowns are mistaken for capacity and cost control

**Failure scenario:** The per-learner/per-problem Validate cooldown works, but users can still generate work through different problems, individual runs, and submission-required evaluations faster than workers can process it. Verification requests create a separate usage and spending exposure.

**Why it matters:** A five-second cooldown is one eligibility rule, not a complete operating policy. It does not define total simultaneous work, maximum queued work, fair scheduling, execution budgets, or message-provider usage limits.

**Relevant operations:** UC-08, UC-09, UC-11, UC-21, and UC-22; worker deployment and operating configuration.

**Early action:** Measure representative compilation/execution workloads and choose explicit operating limits before exposing unrestricted public use.

**Evidence required to reduce this risk:**

- The pilot hosting budget, worker capacity, and expected simultaneous evaluations are recorded.
- Representative compilation and execution time and memory are measured.
- Total worker concurrency, queued-work limits, and per-account workload controls are defined for all execution entry points.
- Resource limits apply to individual runs and submission-required evaluation as well as manual batch validation.
- Contact-verification retry and usage controls and provider spending limits are established.
- Learners receive understandable busy, retry, or recovery status when capacity is exhausted.
- Queue and outcome retention cannot discard the only copy of work still awaiting ingestion or recovery.

**Scope constraint:** These controls must preserve the accepted per-problem cooldown semantics. They must not silently introduce an unexplained five-second wait between tests or change scoring.

**Evidence at initial review:** Operating parameters are explicitly left for implementation planning in the architecture and stack documents.

## RISK-06: Completion statistics are mistaken for learning evidence

**Failure scenario:** Learners earn scores and unlock topics, but the content and feedback do not help them solve unfamiliar problems. Project progress is judged only by completion counts, without checking whether learners understand the material.

**Why it matters:** Visible tests, retries, fixed multiple-choice activities, and retained best scores support practice. Those choices also limit what passing and unlocking establish about broader understanding. The existing product limitation about mastery still applies.

**Relevant operations:** UC-04, UC-05, UC-10, UC-13, UC-18, and UC-23.

**Early action:** Run a small learner pilot once complete sample topics work. Ask target learners to use the lessons and feedback, then attempt an unfamiliar exercise appropriate to the same concepts.

**Evidence required to reduce this risk:**

- Learner observations identify confusing instructions, unhelpful feedback, and progression friction.
- Topic completion and assessment results are examined alongside performance on unfamiliar exercises.
- Multiple-choice results remain distinguishable from solved coding problems in statistics.
- Product wording does not equate topic unlocks or repeated-test success with verified broad language mastery.
- Findings inform content improvements before the complete curriculum is treated as validated.

**Evidence at initial review:** The repository documents intended learners and workflows but no learner-validation findings.

## First milestone: prove one complete coding path

Before broad feature implementation, demonstrate one genuine coding topic through the actual application and evaluator:

1. Establish a learner and a valid unlocked-topic state consistent with the roadmap prerequisites.
2. Open and edit a real coding problem: UC-06 and UC-07.
3. Perform batch validation with the actual isolated Cangjie worker: UC-09, with permitted feedback through UC-10.
4. Submit sufficient work for the topic to reach its specified passing threshold: UC-11. Preserve unattempted problems in the denominator where applicable.
5. Record the finalized score, completion, and next-topic unlock consistently.
6. Reopen the application and recover the confirmed outcome and saved work: UC-16.
7. Repeat requests, interrupt execution and finalization, change the draft, and restart the worker/application. Confirm the same recovery and historical-progress rules still hold.

Use real persistence, pinned assessment content, and an actual evaluator for this milestone. The Hello World topic retains its specified one-test structure; broader evaluator stress checks use appropriate additional fixtures or other representative problems rather than silently changing that topic.

**Milestone exit evidence:** A reproducible working path, recorded runtime versions and configuration, confirmed permission/resource restrictions, and recovery checks covering the failures above. A screenshot, mocked evaluator, or completed documentation alone does not meet this milestone.

This milestone primarily reduces RISK-01 and RISK-02 while providing effort and workload evidence for RISK-03 and RISK-05. It is an early implementation checkpoint, not completion of the full MVP.

## Maintaining this register

- Keep risk IDs stable. Add new IDs rather than renumbering existing records.
- Review the register when planning milestones, selecting operating limits, completing the first working path, and preparing a learner pilot or release.
- Update status from Open to In progress or Reduced as evidence appears. Record the date, relevant change, runtime/tool versions where applicable, and a link to the evidence.
- Close a risk only when its stated failure conditions are sufficiently addressed and remaining limitations are explicit. An accepted architecture or stack is not evidence that a risk is closed.
- Do not use risk reduction as an implicit authorization to change product scope, remove acceptance criteria, provision infrastructure, or incur provider costs.

No application checks described here have been run as part of creating this register. It is the persistent reference for what must be demonstrated during implementation and validation.
