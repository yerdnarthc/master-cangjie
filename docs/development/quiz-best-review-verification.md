# Quiz best-submission review verification

Date: 2026-11-04. The original feature verification below was performed in `.worktrees/quiz-best-review`, branch `feat/quiz-best-review`, based on `eaa5591` plus the preserved dirty baseline. Statements about checkout preservation and uncommitted work describe that verification point; the integration checkpoint is recorded separately below.

## Delivered behavior

- Topic actions distinguish Start, Continue, Review best submission with score, and Retry from persisted state without creating drafts during reads.
- `/topics/[topicId]/activity/review` shows the learner's retained best finalized answers, correct choices, explanations and original assessment revision as static evidence. Question navigation remains available; no answer mutation or Retry occurs here.
- Opening review from an answering workspace saves the latest choices, drains older pending snapshots first, checks learner/attempt identity, and keeps editing/submission locked through navigation. Save failures/conflicts preserve work and block this navigation.
- Passing quiz finalization completes/unlocks atomically, replacing the separate Mark complete action. Failures preserve previous best scores and earned progress.
- Newly confirmed failures offer a dismissible Review answers/Retry dialog. Retry uses current submitted evidence and the existing durable recovery identities. Ordinary restored results do not reopen the dialog.
- Migration `0008_quiz_automatic_completion.sql` backfills valid historical passing-but-unmarked quiz progress without changing snapshots or drafts. The first quiz's instructional explanation is revision 2; seed now publishes each quiz's declared revision instead of hardcoding 1.

Runtime observed: Node v24.22.1, npm 12.2.1, Next.js 16.4.3.

## Checks run after review fixes

| Check | Observed result |
| --- | --- |
| `npm run check` | TypeScript and architecture boundaries passed |
| `npm run build` | Production build passed, including new review/state routes |
| `npm run test:domain` | 5 files, 63 tests passed |
| Scoped integration suites listed below | 7 files, 38 tests passed |
| Combined Chromium journeys listed below | 53 passed in 6.6 minutes |
| `git diff --check` | Exit 0; only line-ending conversion warnings |
| Main checkout preservation | All 426 captured paths and original staged patch unchanged |
| Changed documentation local links | Checked; no missing local targets |

Scoped integration command:

```powershell
npm run test:integration -- tests/integration/quiz-automatic-completion.test.ts tests/integration/quiz-best-review.test.ts tests/integration/quiz-journey.test.ts tests/integration/quiz-retry.test.ts tests/integration/quiz-attempt-transition.test.ts tests/integration/quiz-review-navigation.test.ts tests/integration/roadmap-access.test.ts
```

Combined browser command, using a dedicated `_test` PostgreSQL database and port 3029:

```powershell
$env:MCJ_JOURNEY_PORT='3029'
npm run test:journeys -- tests/journeys/quiz-topic-actions.spec.ts tests/journeys/quiz-best-review.spec.ts tests/journeys/quiz-question-card.spec.ts tests/journeys/onboarding-quizzes.spec.ts tests/journeys/quiz-retry-persistence.spec.ts tests/journeys/quiz-autosave.spec.ts tests/journeys/quiz-autosave-migration.spec.ts tests/journeys/quiz-autosave-persistence.spec.ts tests/journeys/quiz-conflict.spec.ts tests/journeys/quiz-conflict-newer.spec.ts tests/journeys/quiz-conflict-persistence.spec.ts tests/journeys/quiz-submission-recovery.spec.ts --timeout 60000
```

Database tests exercised duplicate submission replay, rollback on unlock failure, final-topic completion, normalized best retention, legacy backfill exclusions/replay, original revision recovery, foreign evidence rejection, and no draft creation during reads. Browser recovery scenarios used real PostgreSQL/IndexedDB, with transport failures/held responses injected deliberately.

## Independent review and fixes

An independent whole-feature review found two Important issues and no Critical or Minor findings. Both were reproduced with failing real browser regressions before fixes:

1. Replaying an older pending save could acknowledge that snapshot but stop before saving newer choices. The navigation adapter now reports confirmed progress separately from a failed save and continues draining.
2. App Router navigation could remain pending after controls re-enabled. Successful navigation now retains editing/submission locks until unmount; preparation failures restore controls.

Both regressions passed after fixes, followed by the complete scoped verification above. No second independent review was claimed.

## Rendered UI evidence

Inspected via ego-browser at requested desktop 1440x900 and mobile 390x844 viewports in both themes. Review choices were static and readable; all three surfaces fit mobile without horizontal overflow. Mobile review was also checked at 200% root text size. Reduced motion and native dialog keyboard containment/dismissal were checked. A sampled light static-choice contrast was 14.63:1; this is not a full accessibility conformance audit.

Visual QA corrected native dialog centering/focus wrapping and hue rotation in the new blue/green review/completion surfaces. Destructive button colors were preserved. Screenshots, scripts and measured geometry remain local in `.ai-work/ego-browser/quiz-best-review/`; observations are in `.ai-work/verification/manual-ui.md`.

New copy received a manual content-style/editorial check. No automated authorship detector, marks normalizer, or preservation validator ran.

## Implementation decisions and practical limits

- Work stays in an isolated copy of the dirty baseline; no automatic commits or integration. Integration must transfer the feature delta rather than blindly merging a branch with no new commits.
- The roadmap retains an always-false `awaitingCompletion` compatibility field. Quiz `canMarkComplete` and the separate completion operation are retired. The small compatibility field can be removed in a separate cleanup.
- Historical evidence reads live in a focused adapter within topic-submission rather than making the existing submission adapter larger. This adds one internal file without a new module boundary.
- The failure dialog is project-authored native HTML, with explicit focus/centering behavior and no new package or copied catalog source. Its accessibility depends on the browser/keyboard checks recorded here.
- Correcting instructional completion wording publishes quiz revision 2 and requires seeding that revision. Earlier assessment rows and saved evaluations remain available for historical review.
- Seed uses each quiz's declared revision; future corrections must still receive new revisions rather than overwriting retained definitions.

Only dedicated test databases were migrated/seeded. The development learner database was not migrated or seeded, and no production deployment occurred. To use this feature with that database, run the existing migration and milestone seed workflow from this worktree with the intended local environment before starting the app:

```powershell
npm run db:migrate
npm run db:seed:milestone
npm run dev --workspace @mcj/web -- --port 3001
```

The main checkout, its staged product-design specification, and the older Retry worktree remain preserved. Temporary test/inspection hosts on ports 3029/3030 were stopped. Generated next-env.d.ts was restored to its baseline bytes. Raw verification output and feature-delta records remain local under `.ai-work/verification/`.

These checks establish the scoped quiz behavior, not compiler/sandbox/provider behavior or full MVP launch readiness. RISK-02 remains in progress; no broader risk is closed here.


## Integration checkpoint ? 2026-11-04

The reviewed feature and development-reset fix were transferred to feat/quiz-system-polish using 48 explicitly tracked integration paths. All 426 original baseline hashes matched before transfer; no newer main-checkout edits were overwritten. Original working files and index were backed up locally before regrouping the pending work into scoped commits.

Fresh checks in the integrated main checkout:

- TypeScript and architecture boundaries passed.
- Domain suites: 63 tests passed in five files.
- Full integration suite: 100 tests passed; six existing real-sandbox tests in one suite were skipped because MCJ_REAL_SANDBOX was not enabled.
- Production build passed after removing two stale generated route validators that referenced the retired completion endpoint. No application change was needed for that cache issue.
- Chromium: 13 focused topic-action, best-review and Retry-persistence journeys passed in 2.1 minutes on the dedicated test database, using port 3031.
- A fresh independent read-only integration review found no blocking findings or actionable minor concerns. It checked transfer fidelity, both earlier navigation fixes, reset deletion order/learner scoping, historical review and progression.
- Pending Markdown links and generated/sensitive path candidates were checked; generated next-env.d.ts was restored to its original bytes.

The question-bank design and implementation plan are retained under docs/development/designs and docs/development/plans and linked from README. They are deferred proposals, not implemented behavior. The current quiz retains the reviewed ability to access historical answer feedback during retries; the proposed bank and access-policy changes require the next development session.

This integration did not apply development database migrations, seed the development learner database, or deploy a running application. Existing worktrees and local investigation evidence were retained.
