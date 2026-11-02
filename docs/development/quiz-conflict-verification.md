# Quiz draft conflict verification

The learner reported manually testing the draft conflict choices, reload recovery,
multiple competing drafts and slow network scenarios successfully. This is
reported manual QA, not an independently recorded browser trace.

Automated verification during implementation included six Playwright journeys
covering autosave, conflict choice, repeated conflicts, reload recovery and newer
edits. One journey used the real quiz API and PostgreSQL to resolve two persisted
conflicts; another used controlled API responses and real browser storage to
exercise newer edits while a save was pending. The quiz PostgreSQL integration
suite passed two tests, and TypeScript and architecture checks passed.

The controlled browser test does not establish real PostgreSQL behavior for the
newer-edit timing scenario. The separate issue where earlier submission feedback
appears alongside edited answers remains open.

## Isolated commit verification

On 2026-11-02, the conflict changes were reconstructed on top of `13bb572` in
an isolated checkout, excluding the in-progress curriculum and navigation edits.
The following checks passed there:

- `npm run check`: TypeScript and architecture boundaries.
- `vitest run --project integration tests/integration/quiz-journey.test.ts`:
  two tests using real PostgreSQL in the dedicated test database.
- `playwright test quiz-conflict quiz-autosave --timeout=45000`:
  five browser tests, including real API/database conflict persistence and
  controlled-response timing tests with actual IndexedDB storage.

The isolated scope includes the existing autosave browser regression, but excludes
the supplemental autosave persistence journey and test-host changes still in
progress in the main working directory. No compiler or evaluator verification is
claimed by these quiz checks.
