# MasterCangjie product design specification

**Design context:** The shared visual direction is in the repository-root [DESIGN.md](../../../DESIGN.md), which Impeccable discovers for `apps/web`. Maintain shared visual rules there. This document retains product positioning, accessibility guidance, and quiz interaction guardrails; it does not override DESIGN.md or the authoritative product rules.

**Status:** The original visual proposal was superseded on 2026-11-04 by the accepted shared visual system in [DESIGN.md](../../../DESIGN.md). This document retains product positioning, accessibility guidance, and quiz interaction guardrails; current product and domain rules remain authoritative. It is not evidence that every screen or state has been implemented or verified.

**First application:** Multiple-choice quiz workspace. The identity is intended to extend to the coding workspace, roadmap, lessons, and account flows; those surfaces need their own detailed designs and acceptance review. The intended sequencing is quiz polish, coding-workspace polish, then account creation.

## Product truth and authority

MasterCangjie helps students and existing programmers learn Cangjie through a sequential roadmap, lessons, coding practice, and multiple-choice activities. Its visual identity should make exploring an unfamiliar language feel exciting, capable, inviting, and playful. A learner's immediate job is to understand the task, do the work, and trust the feedback and save status.

The [product specification](../../product.md), [use cases](../../use-cases.md), [domain model](../../domain-model.md), [architecture](../../architecture.md), [risk register](../../risk-register.md), and [learner-facing writing guide](../../content-style.md) remain authoritative for behavior and content. A mockup or this brief does not change a business rule. The selected stack and current implementation are described in [mvp-stack.md](../../mvp-stack.md).

## Visual direction

**Positioning:** A playful, focused Cangjie tutor with the confidence of a developer's workspace. The learner should feel curious and capable, including when a result is wrong or a save needs attention.

**Initial visual proposal (superseded):** This brief first explored Hallmark's Terminal theme, muted blue and blue-green accents, display fonts, and square geometry. Use the current palette, typography, shape, and theme behavior in [DESIGN.md](../../../DESIGN.md); those earlier visual choices are historical context, not implementation guidance. Do not imply an official Cangjie affiliation or redraw its logo.

**Voice:** A patient tutor: specific, direct, encouraging through useful feedback, and comfortable with technical terms. Use the editorial and technical-preservation pass in [content-style.md](../../content-style.md) before shipping learner copy. Text in generated images is illustrative; use reviewed product content in the app.

### Visual references and their limits

Early generated mockups were exploratory and are not included in the repository or used as runtime assets. Their scores, dates, questions, answers, and wording were examples, not content or product claims. Follow the current [DESIGN.md](../../../DESIGN.md) for visual decisions and the product, use-case, and domain documents for behavior.

## Design foundations

### Color and modes

The palette candidates in the original proposal are superseded. Use semantic role tokens and the current light and dark values in [DESIGN.md](../../../DESIGN.md) and `apps/web/src/app/theme.css`.

Derive separate semantic tokens for borders, focus, selected surfaces, errors, warnings, and disabled controls in both modes. Green selection does not mean a quiz answer is correct. Correct, incorrect, warning, unsynced, and pending states require words or icons as well as color; coding feedback retains the product's green/matching, orange/formatting, red/other-difference mapping. Never use success styling for an unconfirmed save or result.

The dark theme is primary with a light option. Use the visible theme control and browser-local preference described in [DESIGN.md](../../../DESIGN.md). Do not assume the preference is synchronized with future accounts.

### Typography

Use the current `--font-sans` and `--font-mono` stacks defined by the shared theme. No local font files are required. Differentiate screen title, task/question, body, and supporting status through size, weight, and spacing. Default body text should be at least 16 CSS pixels where practical; long content wraps without truncating meaning. Avoid tracked uppercase labels.

### Layout, shape, and motion

Use the layout, radius, surface, and elevation rules in [DESIGN.md](../../../DESIGN.md). Keep the learner's current task more prominent than decorative cues. Avoid CRT effects, fake terminal windows, stock imagery, and ornament that suggests functionality.

Quiz activities display five questions per page, with a compact progress sidebar on wide screens and stacked navigation on narrow screens. Keep all ten answers in one draft and submission. On narrow screens, stack choices, controls, and conflict comparisons in a logical reading order.

Motion communicates state: selection, save progress, and confirmation. Keep transitions short and limited to properties that do not shift layout. Respect reduced-motion preferences and keep content available without animation. No animation is evidence that a server operation succeeded.

## Shared interaction and accessibility requirements

- Design for keyboard, pointer, touch, zoom, and screen-reader use. Use semantic headings, native buttons and links, and radio groups with a visible question/legend. Preserve focus and make it visible; do not obscure it with sticky controls.
- Provide at least 44 × 44 CSS-pixel touch targets as a project design target where practical. Reflow at narrow widths and 200% text zoom; avoid clipping, forced horizontal page scroll, and hiding actionable content.
- Target [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/) for applicable web content. Normal text needs at least 4.5:1 contrast, large text at least 3:1, and relevant non-text control boundaries and focus indicators at least 3:1 against adjacent colors. Test actual rendered combinations in both modes; don't infer conformance from a palette alone.
- Palette definitions alone do not establish conformance; test actual rendered combinations, borders, focus rings, and states in both modes.
- Loading, empty, full, error, disabled, focus, and recovery states must be designed where applicable. Announce meaningful async status changes without interrupting the learner; connect errors to the affected control and include an actionable next step.
- Do not make color, position, animation, an icon, or a sound the only way to distinguish information. Avoid relying on long hover-only interactions. Validate with actual content, including lengthy questions and choices.

## Quiz workspace: behavioral guardrails

**Job:** Answer and review a ten-question multiple-choice activity, submit deliberately, understand the confirmed result, and continue learning. These are behavior and usability guardrails, not final screen layouts; decide detailed quiz designs incrementally with each slice. The workspace needs an activity title, question progress, answer controls, a truthful save status, navigation back to the topic, and a clear path to review and submit. Page navigation identifies the current group and its answered count, and each question shows its answer status. Keep keyboard focus visible and do not imply correctness before submission.

### Journey and state requirements

| State                            | Visual and interaction requirement                                                                                                                                                                                                                                                                            | Rule                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| First open / loading             | Show the task structure or an honest loading placeholder; do not fabricate progress or results. A load failure identifies a recovery action.                                                                                                                                                                  | UC-12, UC-16                 |
| Answering                        | Show exactly ten questions, one selectable choice per question, and permit changes before submission. Distinguish answered from unanswered, not correct from incorrect. Drafts award no score.                                                                                                                | UC-12, INV-04, INV-06        |
| Saving                           | Distinguish unsaved, saving, confirmed server save, and error. Show a server-saved state only after confirmation.                                                                                                                                                                                             | UC-12, UC-16                 |
| Offline / local work             | Show locally saved but unsynced only when local persistence actually succeeded. Preserve the work and offer a path to sync on return; if browser storage is unavailable, explain that and do not imply it is safely stored locally.                                                                           | UC-16, ALG-10                |
| Review                           | Present all ten current selections, identify unanswered questions, and let the learner return to edit. Do not show correct-answer indicators before confirmed submission.                                                                                                                                     | UC-13                        |
| Incomplete confirmation          | Before an incomplete submission, identify unanswered items and explain that each earns zero; allow cancellation and return to editing.                                                                                                                                                                        | UC-13, INV-06                |
| Submission in progress / unknown | Show progress without inventing a result. If the outcome is unknown, identify it as unconfirmed and recover the same submission before allowing another; do not report an assumed zero or create a duplicate. If the submitted snapshot differs from the editable draft, distinguish them.                    | UC-13, UC-16, INV-11, INV-12 |
| Confirmed result                 | Show the confirmed attempt score and per-question feedback with the appropriate explanation. The ten-question quiz is worth 100 points; 60/100 passes, 50/100 does not. Distinguish service failure from a learner's incorrect answer.                                                                        | UC-13, ALG-04, ALG-05        |
| Passed, not complete             | Offer **Mark complete** when a retained passing result makes the learner eligible. Keep the next topic locked until that action succeeds.                                                                                                                                                               | UC-14, INV-14                |
| Failed or lower retry            | Show the latest finalized result separately from the retained best. A lower retry does not erase earned completion, unlocks, or eligibility from an earlier passing score. Do not imply a retry limit.                                                                                                        | UC-15, INV-13, INV-15        |
| Topic complete                   | Only show completion and next-topic availability after confirmed completion. On the final topic, show path completion rather than inventing a next topic.                                                                                                                                                     | UC-14, ALG-07                |
| Draft conflict                   | Explain the conflict, preserve both drafts, and compare each answer with enough question context to choose. Give **Keep saved answers** and **Keep my answers** equivalent prominence. Allow postponement without silently discarding either; show when the server version changes during review. | UC-17, ALG-10                |

### Quiz controls and feedback

- Answer choices are full-width labeled radio targets. Preserve a clear selected indicator, hover, keyboard focus, disabled, and error treatments in both modes. Selection must not be mistaken for correctness.
- Keep save status close enough to the learner's current work to be discoverable. Avoid claiming a successful server save based on a local browser write.
- Review and incomplete-submission confirmation must be explicit and reversible before submission. Use actual selections, including unanswered items; never show invented or stale selections as current.
- Result feedback shows the submitted attempt's context, score, and permitted per-question explanation. Show the correct choice only if the operation's authorized response supplies it; do not derive or expose protected answer data in the client before submission.
- Confirmation, conflict, and recovery actions need clear pending, success, failure, and retry states. Prevent repeated actions from creating duplicate submissions or completion outcomes through the owning operation, not only by disabling a button.

## Product-wide extension guidance

These are identity applications, not completed screen designs:

- **Roadmap and lessons (UC-04–UC-05):** Use the same typography and tokens for an ordered learning path. Distinguish completed, available, awaiting completion, and locked states with labels and a clear next action. Locked topics expose no lesson, summary, or activity content; provide prerequisite guidance.
- **Coding workspace (UC-06–UC-11, UC-16–UC-17):** Apply the system to instructions, Monaco, tests, output, validation, and recovery while preserving space for code. Make the current code revision and outdated results distinguishable. Individual test runs award no points; hide hidden-test input, output, differences, and diagnostics. Explain platform failures separately from learner errors. Structural requirements, when present, follow the product's approved gate and require their own implementation design.
- **Statistics (UC-18):** Separate coding achievements, multiple-choice results, current attempts, and historical bests. Provide an informative first-use state; a passed but unmarked quiz is not a completed topic.
- **Account and profile (UC-01–UC-03, UC-19–UC-22):** Reuse the system when these slices are designed. Google is the approved MVP sign-in method; contact verification does not change that identity. Do not represent future account functionality as already available.

## Design decisions still open

1. Further refinements to quiz navigation after learner feedback. Follow the current quiz flow in the product and use-case documents.
2. Focus, error, warning, and contrast review for each remaining surface and supported mode. Theme token definitions do not replace rendered checks.
3. Complete narrow-screen designs for review, conflicts, result feedback, and recovery. Responsive behavior still needs validation at the relevant viewports.
4. Which existing quiz and coding recovery gaps need fixes, based on current source, the relevant use-case acceptance criteria, and fresh evidence. Visual polish does not close RISK-01 or RISK-02.

## Review and implementation handoff

1. Review this brief and its proposed interactions with the maintainer; record revisions before treating it as a locked design system.
2. Inventory the existing quiz UI, underlying operations, and current failure/recovery behavior. Map any behavior change to UC-12–UC-17 and the owning modules; investigate reported bugs before proposing fixes.
3. Develop a file-level implementation plan covering state handling, responsive layouts, theme, accessibility, and the project's applicable verification strategy. Preserve durable submission and conflict behavior; use real PostgreSQL/browser evidence where the risk register requires it.
4. Validate the implementation against real reviewed quiz content, long and short choices, keyboard and screen-reader workflows, both color modes, reduced motion, and narrow screens. Account for each relevant acceptance criterion; image-generation previews and token-pair arithmetic are not evidence of implemented accessibility or recovery.
5. Once the quiz direction is accepted and validated, document reusable final tokens and components for the roadmap and coding workspace. Account creation remains a later slice under the current sequencing preference.
