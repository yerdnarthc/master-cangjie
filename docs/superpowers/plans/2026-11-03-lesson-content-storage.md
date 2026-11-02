# Lesson Handout Content Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the seven existing lesson handouts from TypeScript literals into validated Markdown files with per-topic metadata, while preserving their current content and enforcing the approved locked-topic rule.

**Architecture:** Keep lesson prose in `content/lessons/<topicId>/` as `introduction.md`, `sections/<sectionId>.md`, and `summary.md`; keep activity, ordering, section titles, and sources in `topic.json`. A Roadmap filesystem adapter validates and loads this content. Topic Submission remains the authority for learner availability, and server routes load lesson bodies only after checking that authority.

**Tech Stack:** Node.js 24.x, TypeScript, Next.js App Router, PostgreSQL, Vitest, Playwright, React Markdown.

**Spec:** `docs/product.md` (topic access and curriculum), `docs/use-cases.md` (UC-04, UC-05, UC-23), `docs/domain-model.md` (INV-14 and ALG-07), `docs/architecture.md`, `docs/adr/0001-modular-monolith-isolated-evaluation-worker.md`, `docs/mvp-stack.md`, `docs/content-style.md`, and `docs/risk-register.md` (RISK-04).

## Global Constraints

- Use Node.js `>=24 <25` as specified by `docs/mvp-stack.md`.
- Keep lesson content in version-controlled files; this work adds no lesson database schema, CMS, or authoring interface.
- Topic Submission owns availability and prerequisites. Roadmap and web routes must read access through that module and must not recreate prerequisite SQL or progression rules.
- For locked topics, show only the topic title, locked status, and immediate prerequisite guidance. Do not send or render lesson prose, summaries, source links, or activity content; enforce this for roadmap selection, direct lesson URLs, and direct activity URLs.
- Preserve existing lesson wording, section order, summaries, source URLs, code, commands, and version references. This is a storage migration, not a copy rewrite. If any learner-facing wording must change, follow `docs/content-style.md` and the Avoid AI Writing skill.
- Do not change quiz scoring, coding evaluation, completion rules, activity availability, or the development learner seed. Use the existing first-topic reset helper for locked-access regression coverage.

## Review Focus

- Missing or unreadable Markdown files must fail content loading clearly instead of returning a partial handout; test each required file through the filesystem adapter.
- Topic metadata with a mismatched ID, unsafe topic/section ID, duplicate section, or unsupported activity kind must be rejected; test invalid fixtures in the adapter suite.
- A learner with a locked topic must receive prerequisite guidance without lesson-only text or an activity workspace through roadmap, lesson, and activity routes; test using the first-topic-only database state.
- Each published topic must route to the activity type named in metadata, and unknown topic IDs must remain not-found; cover all seven IDs in adapter tests and representative routes in Playwright.
- Markdown code fences, command text, source URLs, and section order must survive the move; compare migrated material with the current `onboarding.ts` and assert representative rendered content in the content and browser tests.

---

### Task 1: Store and validate lesson files

**Files:**
- Create: `topic.json`, `introduction.md`, and `summary.md` under each of `content/lessons/{getting-started-with-cangjie,installing-the-cangjie-toolchain,running-the-first-cangjie-program,identifiers,program-structure,expressions,functions}/`.
- Create section files under those topic folders: `getting-started-with-cangjie/sections/{meet-cangjie,source-to-output,your-first-topics}.md`; `installing-the-cangjie-toolchain/sections/{choose-sdk,prepare-terminal,verify-compiler}.md`; `running-the-first-cangjie-program/sections/{read-program,compile-run,practice-output}.md`; `identifiers/sections/{naming-elements,syntax-rules,keywords-and-raw,wildcard-and-conventions}.md`; `program-structure/sections/{entry-point,bindings-and-mutability,scopes-and-shadowing}.md`; `expressions/sections/{if-expressions,loops,flow-control}.md`; and `functions/sections/{declaring-functions,parameters-and-returns,unit-functions}.md`.
- Create: `modules/roadmap/adapters/lesson-content.ts`.
- Modify: `modules/roadmap/application/onboarding.ts` to retain shared category and lesson types, removing embedded handout prose and the hard-coded lesson catalog.
- Test: `tests/integration/lesson-content.test.ts`.

**Interfaces:**
- `TopicMetadata`: `{ id: string; title: string; categoryId: string; categoryTitle: string; position: number; activity: 'quiz' | 'coding'; sections: { id: string; title: string }[]; sources: { label: string; href: string }[] }`.
- `Lesson`: `TopicMetadata` plus `introduction: string`, section bodies as `{ id: string; title: string; body: string }[]`, and `summary: string` containing Markdown.
- `FileLessonContent` constructor accepts a lessons root directory (defaulting to `<root>/content/lessons`) and exposes `listMetadata(): Promise<TopicMetadata[]>`, `readMetadata(topicId: string): Promise<TopicMetadata | undefined>`, and `readLesson(topicId: string): Promise<Lesson | undefined>`.
- Metadata defines the seven current topic IDs, existing global order (zero-based to match `topics.position`), activity kind, section IDs/titles, and source labels/URLs. `listMetadata()` sorts by position and rejects duplicate IDs or positions. The adapter derives content paths from validated IDs; metadata does not provide arbitrary filesystem paths.

- [ ] **Step 1: Write failing adapter tests** in `tests/integration/lesson-content.test.ts` for the ordered seven-topic catalog, complete lesson shape, unknown topic result, ID mismatch, duplicate section ID, unsupported activity kind, and missing required Markdown file. Use a temporary directory passed to `FileLessonContent` for invalid-file cases.
- [ ] **Step 2: Run the focused test and confirm it fails** because `FileLessonContent` and the Markdown content directories do not exist.

Run: `npx vitest run --project integration tests/integration/lesson-content.test.ts`

Expected: FAIL on missing exports/content, with no database connection required by this test file.

- [ ] **Step 3: Migrate the seven current handouts** into their directories. Use the metadata shape above; write one Markdown file for the introduction, each section body, and summary. Preserve all existing lesson copy and code examples from `modules/roadmap/application/onboarding.ts` without editorial changes.
- [ ] **Step 4: Implement `FileLessonContent`** in `modules/roadmap/adapters/lesson-content.ts`. Validate metadata types, exact directory ID match, safe IDs, unique section IDs, supported activity values, nonempty required prose, and valid HTTP(S) source URLs. Return `undefined` only for an unknown topic; throw a descriptive error for malformed metadata or any missing/unreadable required Markdown file. Do not silently omit a failed section.
- [ ] **Step 5: Run the focused adapter test and confirm it passes.**

Run: `npx vitest run --project integration tests/integration/lesson-content.test.ts`

Expected: PASS for all seven real handouts and all malformed/missing-file cases.

- [ ] **Step 6: Review the migration diff** against the original `onboarding.ts`; confirm lesson prose, summaries, order, links, Markdown code fences, and activity kinds are retained. Correct any accidental content changes before proceeding.
- [ ] **Step 7: Commit the content and adapter slice.**

```bash
git add content/lessons modules/roadmap/application/onboarding.ts modules/roadmap/adapters/lesson-content.ts tests/integration/lesson-content.test.ts
git commit -m "refactor(content): store lesson handouts as markdown"
```

### Task 2: Enforce topic access while loading lessons and activities

**Files:**
- Modify: `modules/topic-submission/application/operations.ts` to define the read-only roadmap access result.
- Modify: `modules/topic-submission/adapters/postgres.ts` to return ordered per-topic availability, completion, and immediate prerequisite IDs from persisted progress.
- Create: `tests/integration/roadmap-access.test.ts`.
- Create: `apps/web/src/bootstrap/roadmap.ts` with `server-only` protection to expose the file content reader to server components.
- Modify: `apps/web/src/app/page.tsx` to show locked topics with title, status, and prerequisite only; available topics can retain their lesson and activity details.
- Modify: `apps/web/src/app/topics/[topicId]/page.tsx` to check availability before loading lesson Markdown and render prerequisite guidance for a locked topic.
- Modify: `apps/web/src/app/topics/[topicId]/activity/page.tsx` to enforce availability before rendering a workspace and select quiz or coding from topic metadata rather than hard-coded ID lists.
- Modify: `apps/web/src/components/topic-lesson.tsx` to receive the loaded lesson and topic metadata catalog instead of importing a prose-bearing TypeScript catalog.
- Create: `apps/web/src/components/locked-topic.tsx` for the shared locked-topic title, status, and prerequisite guidance.
- Modify: `apps/web/src/components/quiz-workspace.tsx` and `apps/web/src/components/coding-workspace.tsx` to receive the topic title from their server route instead of importing `lessonFor`.
- Modify: `tests/journeys/onboarding-lessons.spec.ts` and `tests/journeys/onboarding-quizzes.spec.ts` for locked and newly unlocked topic behavior.

**Interfaces:**
- `TopicAccessSummary`: `{ topicId: string; available: boolean; completed: boolean; prerequisiteTopicId: string | null }`.
- `PostgresSubmissions.roadmapAccess(actor: Actor): Promise<TopicAccessSummary[]>` returns all database topics ordered by persisted topic position. It reports the persisted `available` value and prior topic ID; it does not calculate or mutate progression.
- `TopicLesson` receives `{ lesson: Lesson; catalog: TopicMetadata[] }`.
- `QuizWorkspace` and `CodingWorkspace` receive `{ topicId: string; topicTitle: string }`.

- [ ] **Step 1: Write a failing real-database test** in `tests/integration/roadmap-access.test.ts` using the existing `testDatabase()` and first-topic-only fixture. Assert ordered topic IDs, first topic available, later topics locked, correct immediate prerequisite IDs, and `completed` values from persisted rows.
- [ ] **Step 2: Run the focused integration test and confirm it fails** because `roadmapAccess` is not implemented.

Run: `npx vitest run --project integration tests/integration/roadmap-access.test.ts`

Expected: FAIL on the missing method/type, before any web route changes.

- [ ] **Step 3: Implement `TopicAccessSummary` and `PostgresSubmissions.roadmapAccess(actor)`** with one ordered read of `topics` left-joined to that learner's `learner_topic_progress`. Treat missing progress as unavailable and derive only the immediate prerequisite ID from the topic order; do not grant or revoke access here.
- [ ] **Step 4: Run the focused integration test and confirm it passes.**

Run: `npx vitest run --project integration tests/integration/roadmap-access.test.ts`

Expected: PASS against the dedicated `*_test` database.

- [ ] **Step 5: Update the home, lesson, and activity server routes** to use Roadmap metadata and Topic Submission access. A locked page may read topic metadata and prerequisite metadata only; call `readLesson()` only after access is confirmed. Render locked-route guidance through `LockedTopic`. Direct locked lesson and activity URLs show the topic title and prerequisite guidance but no introduction, sections, summary, sources, activity CTA, or workspace. Keep existing API authorization checks intact.
- [ ] **Step 6: Update lesson navigation and workspace labels** to consume the loaded metadata/title props. Render the Markdown introduction, section bodies, and summary with React Markdown; preserve the current summary list appearance. Select the activity component using `TopicMetadata.activity`; preserve the existing route URLs and activity handoff for every published topic.
- [ ] **Step 7: Add Playwright regressions** in `onboarding-lessons.spec.ts` that reset the learner to first-topic-only, verify locked topics show no preview on the roadmap, verify direct locked lesson/activity URLs show prerequisite guidance without handout/workspace content, and verify unknown topic routes remain 404. Update the existing assertion that treats the known `/topics/identifiers/activity` route as 404. In `onboarding-quizzes.spec.ts`, verify completing the preceding topic makes its next topic's lesson and activity routes accessible.
- [ ] **Step 8: Run the focused browser journeys and confirm they pass.**

Run: `npm run test:journeys -- tests/journeys/onboarding-lessons.spec.ts tests/journeys/onboarding-quizzes.spec.ts`

Expected: PASS using the configured dedicated `*_test` database; locked routes must not request or render activity workspaces.

- [ ] **Step 9: Commit the access and route slice.**

```bash
git add modules/topic-submission/application/operations.ts modules/topic-submission/adapters/postgres.ts tests/integration/roadmap-access.test.ts apps/web/src/bootstrap/roadmap.ts apps/web/src/app/page.tsx "apps/web/src/app/topics/[topicId]/page.tsx" "apps/web/src/app/topics/[topicId]/activity/page.tsx" apps/web/src/components/topic-lesson.tsx apps/web/src/components/locked-topic.tsx apps/web/src/components/quiz-workspace.tsx apps/web/src/components/coding-workspace.tsx tests/journeys/onboarding-lessons.spec.ts tests/journeys/onboarding-quizzes.spec.ts
git commit -m "fix(roadmap): enforce access before loading topic content"
```

### Task 3: Document the lesson content contract and verify the slice

**Files:**
- Modify: `content/lessons/README.md` to explain the directory shape, `topic.json` fields, required Markdown files, validation behavior, and how activity/prerequisite ownership works.
- Preserve: any existing uncommitted README work while reconciling stale statements with the actual migrated files and routes.

- [ ] **Step 1: Update `content/lessons/README.md`** to describe the Markdown-plus-metadata contract, current seven handouts, content-preservation expectations, and the fact that file presence means published content while learner access remains progress-gated. Do not mark RISK-04 complete; the storage migration alone is not curriculum correctness evidence.
- [ ] **Step 2: Run the full static and automated verification set.**

Run: `npm run check`

Expected: PASS TypeScript checks and module-boundary checks.

Run: `npm run build`

Expected: PASS Next.js production build with no client bundle importing the filesystem adapter.

Run: `npm run test:domain`

Expected: PASS all domain tests.

Run: `npm run test:integration`

Expected: PASS against the dedicated `*_test` database, including lesson-content and roadmap-access coverage.

Run: `npm run test:journeys -- tests/journeys/onboarding-lessons.spec.ts tests/journeys/onboarding-quizzes.spec.ts`

Expected: PASS for content rendering, progression to the next accessible topic, locked-route denial, and activity handoff.

- [ ] **Step 3: Review the complete diff** for unintended lesson copy changes, leaked locked prose in client props or page HTML, and changes outside the lesson-content and access scope. Confirm the existing user changes in `docs/product.md`, `docs/use-cases.md`, `docs/risk-register.md`, the timeout-recovery plan/spec files, and other unrelated work remain untouched.
- [ ] **Step 4: Commit the documentation update.**

```bash
git add content/lessons/README.md
git commit -m "docs(content): document lesson handout storage"
```
