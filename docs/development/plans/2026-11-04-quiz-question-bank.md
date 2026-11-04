# Topic Question Banks Implementation Plan

Execute task-by-task; checkboxes track verified outcomes. This plan is deferred and has not been implemented.

**Goal:** Give quiz attempts topic-aligned question variants while preserving reliable recovery, scoring, progression, and exact historical review.

**Architecture:** Git-authored slot-based banks publish as immutable PostgreSQL assessment revisions. Topic submission selects ten variants once and persists an immutable resolved form with each attempt. Activity draft, evaluation and review use that form; the server pauses old detailed feedback during an answering attempt.

**Tech Stack:** Existing Node 24, TypeScript, Next.js/React, PostgreSQL/pg, Vitest and Playwright. No new runtime dependencies or services.

**Spec:** ../designs/2026-11-04-quiz-question-bank-design.md

**Status:** Deferred future work. The different-question-set direction is accepted; inventory, selection/reuse, migration and review-access details require review before implementation.

## Global constraints

- Exactly ten questions per attempt, 10 points each, 60/100 passes; automatic completion/unlocks and historical best/tie rules remain.
- Ten ordered assessment slots; at least three variants each; all three implemented quiz topics included.
- Runtime selection is server-only; answers/explanations and whole banks never enter answering responses.
- Published content and attempt forms are immutable; old work retains its exact questions across deployment.
- Keep existing learner locks, Retry receipts, submission identities, draft conflicts and offline recovery.
- Keep raw verification logs and machine-specific session records local; retain accepted decisions in their owning project documents.
- No tests or migrations against the development learner database. Use the existing dedicated *_test guards.
- Follow repository development conventions: TDD for persistence/progression, rendered browser checks for UI, the content style guide for learner copy, and frontend research/provenance checks when adopting components.
- Do not rerun broad suites without changes or unresolved concerns. Record real evidence and gaps.

## Review focus

1. Bank changes between draft creation and submission must not change the attempt's questions or grading — tasks 3, 5.
2. Duplicate/lost Retry responses and concurrent tabs must recover one identical form without clearing newer answers — task 4.
3. A stale old submission replay must confirm the operation while withholding old answer feedback during a retry — task 6.
4. Reused legacy q01 keys and incompatible browser candidates must never be interpreted as another form — tasks 3, 5.
5. Exhausted banks and missing historical aliases must follow explicit reuse/error rules without sacrificing earned progress — tasks 1, 2, 4.

## Baseline and file ownership

Use the integrated quiz retry, best-review, automatic-completion and development-reset behavior as the baseline. Inspect the current branch, pending work and schema before implementation; preserve unrelated edits and use an isolated feature branch.

Roadmap owns bank types, validation and publication definitions:
- modules/roadmap/application/content.ts
- new modules/roadmap/domain/quiz-bank.ts and quiz-bank.test.ts
- modules/roadmap/adapters/quiz-content.ts
- new modules/roadmap/adapters/quiz-bank-content.ts
- content/quizzes/<topicId>/bank.json and content/quizzes/README.md

Topic submission owns learner-specific selection, form persistence and feedback policy:
- new domain/quiz-form-selection.ts and quiz-form-selection.test.ts
- new application/quiz-attempt-form.ts (form and assignment types)
- new adapters/quiz-attempt-forms.ts (authorized transactional form operations)
- adapters/quiz-submissions.ts, adapters/quiz-review.ts, application/quiz-review.ts
- domain/quiz-evaluation.ts only where contract changes require it

Activity draft owns editable answer/conflict storage; its existing attempt helper must delegate creation to the form lifecycle rather than generating form-less attempts:
- modules/activity-draft/adapters/quiz-attempt-drafts.ts
- modules/activity-draft/adapters/quiz-drafts.ts
- modules/activity-draft/adapters/browser-drafts.ts

Infrastructure owns migration/publication mechanisms; web invokes module operations:
- new infrastructure/persistence/migrations/0009_quiz_attempt_forms.sql (recheck next free number)
- infrastructure/persistence/seed-milestone.ts and reset-development-learner.ts
- apps/web/src/bootstrap/application.ts
- apps/web/src/app/api/topics/[topicId]/quiz/{route.ts,submit/route.ts,retry/route.ts,activity-state/route.ts,draft/route.ts,draft/resolve/route.ts}
- apps/web/src/app/topics/[topicId]/activity/review/page.tsx
- apps/web/src/components/{quiz-workspace,quiz-topic-actions,quiz-best-review,quiz-failure-dialog,workspace-contract}.tsx (workspace-contract is .ts)
- apps/web/src/lib/quiz-review-navigation.ts and affected retry/recovery helpers: inspect actual imports before edits.

## Task 1: Bank schema and content validation

**Interfaces:** Export QuizQuestionBank, QuizBankSlot, QuizVariant, QuizPublishedContent = MultipleChoiceAssessment | QuizQuestionBank from roadmap application content. Bank discriminant is format: quiz-bank-v1. Export validateQuizBank(input: unknown): QuizQuestionBank from roadmap/domain/quiz-bank.ts. Export readQuizBank(topicId: string): Promise<QuizQuestionBank> from roadmap/adapters/quiz-bank-content.ts.

- [ ] Add domain tests for exactly ten slots, minimum three variants per slot, topic-wide unique variant IDs, valid lesson anchors/source URLs, unique choice IDs, one valid correctChoiceId, and nonempty explanations/objectives. Reject unknown format and duplicate/ambiguous legacy aliases.
- [ ] Run npx vitest run --project domain modules/roadmap/domain/quiz-bank.test.ts; confirm tests fail for the missing contract.
- [ ] Implement validation and the server file adapter. Keep readQuiz/activity.json parsing available for legacy content. Validate lesson anchors against the actual topic metadata at content loading/publication, not in a filesystem-dependent domain function.
- [ ] Add integration fixture tests in tests/integration/quiz-bank-content.test.ts for missing files, path traversal, wrong topic, invalid anchors, and three real topic inventories.
- [ ] Run the two targeted suites; require green with no silent partial bank.

## Task 2: Author the initial banks and publish immutable revisions

**Interfaces:** Publish banks through assessment_revisions using the existing topic/revision/hash identity. Add readPublishedQuizContent(client, topicId, revision?): Promise<QuizPublishedContent> with runtime validation to roadmap/application/content.ts; code paths requiring fixed forms use the attempt reader instead.

- [ ] Create a ten-slot coverage table for each real lesson, mapping slot IDs to lesson anchors, objectives and comparable difficulty. Include existing questions where appropriate.
- [ ] Author/review at least 30 variants/topic in the three bank.json files; add explicit legacy aliases for every retained activity revision. Verify source claims against authoritative Cangjie material, preserve the project's supported version, and record reviewed sources/readiness. Use the content editorial workflow.
- [ ] Add publication tests: reject a changed hash under an existing revision, incomplete bank, invalid legacy mapping, duplicate slot/variant identities; a publication failure leaves current_revision unchanged. Repeating the identical publication is a no-op. For every legacy revision, assert its ten questions map bijectively to the ten stable slots; reject two questions mapped to one slot, a missing slot, moved variants, and changed slot identities across revisions.
- [ ] Run tests/integration/quiz-bank-content.test.ts to establish failures for publication behavior.
- [ ] Extend seed-milestone.ts to validate all inventories before publishing and atomically insert a new revision/update current_revision. Seed retained legacy definitions first; do not republish changed old bytes. Include discriminated bank parsing and coding compatibility.
- [ ] Run content/publication tests. Require 90+ reviewed variants and a coverage record; mark authoring readiness separately from passing schema tests. Bank publication is activated only after tasks 3–7 are deployed together.

## Task 3: Immutable attempt forms and legacy migration

**Interfaces:** QuizAttemptForm contains schemaVersion: 1, assessment: MultipleChoiceAssessment, sourceFormat: legacy-fixed | quiz-bank-v1, selectionPolicyVersion: number (0 for legacy, 1 for bank), selections: {slotId, variantId}[] (empty only for legacy). Export hashQuizAttemptForm(form): string and readQuizAttemptFormIn(client, actor, topicId, attemptId): Promise<{form, formHash}> from the owning module.

- [ ] Add tests/integration/quiz-attempt-forms.test.ts with a legacy submitted attempt, unfinished draft/conflict, old best submission, and multiple retained revisions. Assert backfill preserves exact question/choice IDs, answers, work revisions and scores.
- [ ] Confirm RED before writing migration/reader.
- [ ] Implement migration 0009: nullable form_snapshot/form_hash, exact-revision backfill, validation, required columns and immutable-field guard. Database immutability covers revision/form/hash; state and submission transitions remain legal. Missing/corrupt history aborts the transaction with IDs in safe diagnostics.
- [ ] Implement canonical snapshot hashing and the authorized form reader; validate ownership/topic, shape and hash on reads. Do not expose answer keys to callers requiring PublicQuiz.
- [ ] Test a second migration run, failed backfill rollback, forbidden snapshot modification, wrong learner/topic, missing hash/content, and publication after migration. Ensure no fixture creates attempts without required forms.
- [ ] Run the form suite and development-learner-reset.test.ts. Update reset fixtures to include real forms; preserve the quizAttempts deletion/count fix and other-learner/rollback assertions.

## Task 4: Selection and atomic first-attempt/Retry creation

**Interfaces:** selectQuizForm(bank, history, excludedVariantIds, randomInt): QuizAttemptForm is a pure topic-submission domain function. History entries contain attemptId, assignedAt, and stable variant identities; order by assignedAt then attemptId for deterministic recency. randomInt(maxExclusive) is supplied by Node crypto.randomInt in the adapter and scripted in tests. Export createQuizAttemptIn(client, actor, topicId, input) inside topic-submission/adapters/quiz-attempt-forms.ts; input distinguishes first versus Retry and includes the existing expected/source identities.

- [ ] Add domain tests proving one variant per slot, ten distinct questions, source/best exclusions, unseen preference, least-recent assignment reuse, deterministic tie injection, cross-revision aliases, and zero-candidate failure. No test relies on two random draws happening to differ.
- [ ] Confirm RED, implement the selector and alias resolution, and run the targeted domain suite.
- [ ] When ranking legacy assignment history, resolve its questions through the same validated alias mapping even though legacy form selections are empty; prior exposure must not become unseen merely because it predates banks.
- [ ] Add integration tests to quiz-retry.test.ts and quiz-attempt-transition.test.ts: first form created once, disjoint latest/best variants, existing empty attempt resumed, duplicate transition returns identical form, two simultaneous transitions create one successor, lost receipt preserves later draft answers, and selection failure rolls everything back.
- [ ] Replace all first-attempt/Retry INSERT sites with the shared creation operation under the existing learner lock. Read receipt before selection. Persist form/hash, draft and successor identity atomically. Refactor readQuizAttemptDraftIn to read existing state without owning form-less creation; authorized workspace creation orchestrates it explicitly.
- [ ] Run scoped Retry/transition/form suites. No topic/review/state read creates an attempt.

## Task 5: Bound workspaces, drafts, submission and browser recovery to the form

**Interfaces:** Workspace publishes only publicQuiz(form.assessment), current attempt identity and formHash. New finalized submission snapshots add attemptId and formHash. Add assertAnswersForQuizForm(answers, assessment): void in topic-submission domain or a deliberately exported roadmap validation interface; Activity draft uses the explicit interface, not another module's SQL.

- [ ] Add integration assertions for rejection of unknown question IDs/choice IDs on save, conflict creation, candidate resolution and submission; rejection must occur before any mutation.
- [ ] Add correction-during-attempt tests: publish bank B after starting A, then resume/save/submit A and verify exact A score; next Retry uses B. Legacy unfinished forms also finish unchanged.
- [ ] Confirm RED, replace latest-assessment lookups in affected quiz calls with the pinned form reader, and keep existing evaluator operating on ten resolved questions. Submission verifies/form-hashes its context; replay preserves original intent.
- [ ] Extend browser envelopes with optional formHash. Preserve old records; attach same-attempt hash-less records only after membership validation. Mismatched hash/attempt candidates stay recoverable, blocked from autosave into another form.
- [ ] Add browser persistence/migration tests: pending autosave + newer edits, stale old q01, offline return after bank publication, account switch, pending submission receipt, and lost Retry response. A hash is never accepted as proof of identity.
- [ ] Run scoped content, quiz journey, autosave migration/persistence, conflict and submission-recovery suites.

## Task 6: Historical form review and feedback access policy

**Interfaces:** Add a single server-side review access decision based on current attempt state. QuizSubmissionResult retains submissionId/attemptId, progress and score, and has feedback: {kind: available, evaluation: QuizEvaluation} | {kind: paused}. QuizActivityState exposes bestReviewAvailability: available | paused | none. Use literal TypeScript string unions in implementation. All consumers must narrow feedback before reading evaluation.

- [ ] Add quiz-best-review.test.ts cases where two forms share a bank revision but contain different questions. Review must match the best submission's exact form, not the current bank or latest attempt. Legacy submissions resolve by quiz_attempts.submission_id.
- [ ] Add tests that historical keys are withheld while an answering attempt exists, including direct review URL/API, old submit request replay and concurrent Retry/review ordering. Scores and committed receipts remain recoverable.
- [ ] Confirm RED, implement exact form resolution, ownership/hash checks and the shared feedback access decision under learner lock.
- [ ] Audit every quiz response path and client serialization for old evaluations/keys: workspace, submit replay, review page, errors and bootstrap. Return no-store/private learner responses. Client bundles never import bank JSON.
- [ ] Confirm newly submitted current feedback is available and the failure dialog remains correct; old feedback becomes paused only if another answering attempt has become current. Run best-review, automatic-completion and submission-recovery suites.

## Task 7: Topic/workspace/review UX integration

**Interfaces:** UI consumes bestReviewAvailability and the discriminated feedback result; it cannot infer access solely from a cached best score.

- [ ] Preserve Start/Continue/Retry placement and the submitted failure-dialog exception. During answering, show retained best score and a brief paused-review explanation with Continue activity where appropriate. Remove the now-obsolete save-before-review navigation action without removing general autosave/recovery.
- [ ] Use the existing accepted DESIGN.md direction and the frontend workflow. Research new component patterns only if needed; reuse approved primitives. Draft learner copy under docs/content-style.md and the editorial review workflow, including honest question-reuse wording.
- [ ] Revalidate on focus/pageshow and retry transitions; an already mounted review learns of an active attempt and replaces detailed content with the paused state. Never claim client hiding revokes previously delivered answers.
- [ ] Adapt route guards and available/paused/no-submission/error states; preserve question navigation on legitimate submitted review.
- [ ] Add tests/journeys/quiz-question-bank.spec.ts for topic Retry, changed questions, partial-save/reload, stale second tab, paused direct review, finish-and-review, and best score retention.
- [ ] Update quiz-best-review.spec.ts and quiz-topic-actions.spec.ts to supersede always-available review expectations; retain relevant recovery assertions instead of deleting them wholesale.
- [ ] Inspect real desktop/mobile, light/dark, keyboard and reduced-motion flow with browser inspection. Record observations; browser journeys and visual inspection are different evidence.

## Task 8: Owning documents, release evidence and verification

- [ ] Update docs/product.md, docs/use-cases.md (UC-12/13/15/16/17/23/24), docs/domain-model.md, docs/architecture.md and GLOSSARY.md. Distinguish bank, slot, variant, published revision and attempt form. A bank can contain 30+ questions while every activity contains ten.
- [ ] Update content/quizzes/README.md with authoring/alias/publication instructions and the actual three-topic inventory; update DESIGN.md for paused review. Record content correctness/fairness and finite-bank limits in docs/risk-register.md without closing risks on design alone.
- [ ] Add docs/development/quiz-question-bank-verification.md with exact runtime/database commands, publication ordering, historical recovery behavior and verification evidence. Keep local content review notes separate from accepted policy.
- [ ] Run npm run test:domain, npm run check, and npm run build. Run the scoped integration files named above plus content-and-identity, quiz-journey, automatic-completion, roadmap-access and development reset regressions on the dedicated test database.
- [ ] Run scoped Playwright journeys for new bank flow, best review/topic actions, onboarding, Retry persistence, autosave/conflicts and submission recovery. Require pass counts and investigate every failure; do not claim mocks prove concurrency or content quality.
- [ ] Request independent code review per the repository workflow, focusing on form immutability, key leakage, content correction, duplicate transitions and legacy replay. Resolve actionable findings with regression evidence.
- [ ] Inspect diffs and documentation links, preserve unrelated changes, and remove generated-file noise. Report completion, checks, content review limitations and remaining risks accurately.

## Release order and rollback

Deploy compatible migration + application together while bank activation remains off: legacy fixed definitions remain usable. Validate/backfill historical forms before activating banks. Then publish reviewed bank revisions transactionally. Existing drafts continue with their saved forms.

After any bank attempt exists, rollback must use a compatible application that understands attempt forms. Do not drop form columns, downgrade to an application that assumes one fixed assessment per revision, delete published banks, or repoint learner drafts. To stop a problematic bank, pause new attempt creation for that topic until a reviewed replacement revision is published; permit existing form recovery/submission where safe. No earned score or unlock is revoked.

## Handoff

Review both documents and the proposed inventory, reuse and review-access policies before implementation. Resume with task 1, use an independent reviewer at completion, and explicitly scope any development database migration or deployment.
