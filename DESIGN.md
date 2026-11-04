---
name: MasterCangjie
description: A calm, atmospheric Cangjie learning workspace.
---

# Design System: MasterCangjie

## Direction

**Deep Current** established the product direction on 2026-11-03; the selected 21st.dev export below updates its styling on 2026-11-04. It evokes the quiet immersion of exploring an unfamiliar language: deep navy surfaces, a restrained blue atmosphere, clear typography, and precise interaction feedback. Use Cangjie blue and blue-green as the recognizable accents. Keep the experience welcoming and playful through responsive feedback and progress, with the learning task always in focus.

The dark theme is primary. A separate light theme uses cool light surfaces and dark text. The theme control is visible in the header and remembers the learner's choice on that browser. Do not mix large light cards into the dark theme or place light text on light surfaces.

This is a developer's workspace, not a literal terminal: avoid fake prompts, CRT effects, decorative code, heavy texture, and moving background effects. Use the selected theme tokens for corners, typography, surfaces and controls. Product behavior remains governed by [product](docs/product.md), [use cases](docs/use-cases.md), and [domain model](docs/domain-model.md).

## Selected 21st.dev theme

Accepted on 2026-11-04 from the maintainer's CSS export. This supersedes the earlier Deep Current palette, square corners and Secular One/JetBrains typography requirements. The canonical values are in `apps/web/src/app/theme.css`, imported by `globals.css`.

Dark remains the default and the existing header control persists the light/dark choice using `data-theme`. Dark uses `#11161f` background, `#1a2029` cards, `#f4f9ff` text, `#95a0ab` muted text, `#409cff` primary, `#00c47f` secondary, `#00ced9` accent and `#cc272e` destructive. Light uses the supplied OKLCH values, white cards, cool neutral surfaces, blue primary, green secondary and cyan accent. Sidebar, popover, input, border, ring and chart tokens retain their supplied values.

Use the supplied semantic foreground/background pairs. Existing screen variables bridge to these tokens; legacy muted text and selection variables use separate names so they cannot override shadcn background roles. Blue denotes selection/action and green denotes confirmed progress. Supporting status text may use a foreground-mixed green for legibility. Selection does not imply correctness. Keep explicit result labels and recovery actions.

## Typography, shape and elevation

Use the exported Inter-first sans stack for headings, reading and controls; use the exported system monospace stack for code and compact data. Inter is a preferred family, not a downloaded font: browsers use the declared fallback when it is unavailable. No local font assets are bundled; add one only if the shared type direction changes.

Use a base radius of `0.625rem` (10px), a `0.25rem` spacing unit, zero default letter spacing and a restrained shadow with 1px vertical offset, 3px blur and 10% black. Tailwind maps colors to its color namespace and radius to radius utilities; fonts and spacing use their native token namespaces rather than the export's color-prefixed aliases. Keep existing layout and assessment behavior during theme adoption.

Check rendered contrast, focus visibility and state legibility in both themes; supplied tokens alone do not prove accessibility. Keep practical 44px targets, keyboard access, text resizing, reduced motion and truthful status feedback.

## Product surfaces

- The roadmap groups ordered topics and clearly distinguishes availability and completion with text and restrained accents.
- Lessons use a quiet navigation rail and a solid reading surface with comfortable line length.
- The coding workspace keeps instructions, editor, output, and feedback distinct without sacrificing contrast.
- Quizzes retain five questions per page, clear selection and answer review, question-group navigation, and fixed save and submission controls. Use 21st.dev Tree Nav for the question-group progress links, showing each group's answered count; blue marks the current page and teal marks a fully answered group. Blue selection and teal confirmed-correct answers remain distinct. Mistakes and recovery states must include text.
- Support keyboard, pointer, touch, screen readers, text resizing, reduced motion, and a minimum practical 44 by 44 CSS-pixel target. Keep sticky controls from preventing access to content.

## Components and motion

Use the theme radius for cards, buttons, controls, and dialogs. Separate surfaces with quiet borders and changes in tone; reserve stronger contrast for active choices, focus, and essential actions. Keep color roles consistent across the product.

Use short transitions that communicate interaction or state. The ambient background remains still, and reduced-motion preferences must be respected. Show saving, results, errors, conflicts, and recovery truthfully without suggesting an operation succeeded before confirmation.

## Frontend implementation standard

Accepted on 2026-11-04: use **shadcn/ui with 21st.dev** for UI components and **Motion (motion.dev)** for animation. The shadcn structure, semantic theme tokens, and dependency baseline are configured; component adoption is incremental. The quiz progress sidebar now uses 21st.dev Tree Nav. See the [frontend audit](docs/development/frontend-design-audit.md) for current evidence and gaps.

- shadcn/ui is the foundation for shared controls and interaction primitives. Keep adopted component source in the web application under `apps/web/src/components/ui/`.
- Use 21st.dev as the component catalog and design source alongside shadcn/ui. Review retrieved source, dependencies, licensing, accessibility, and responsive behavior before adoption. Adapt components to this design system rather than importing a second visual identity. Catalog availability does not establish production readiness.
- Preserve Tailwind CSS and Lucide React. Map shadcn semantic color roles to the existing dark and light palettes; preserve the selected radius and font stacks, visible focus, and practical 44px targets. Review global element selectors before adding component styles so they do not override primitive states.
- Use Motion for coordinated React animation and transitions when animation helps explain a state change. Simple CSS hover/focus transitions may remain CSS. Do not animate the ambient background or use animation to imply confirmed saves or results.
- Respect reduced motion through Motion configuration or reduced-motion hooks and CSS media queries. Preserve immediate state feedback and readable status text when movement is reduced.
- Keep interactive primitives and Motion in client components only where required. Preserve server rendering for suitable page content and lazy loading for Monaco.
- Keep assessment, persistence, submission, conflict, retry, and progression decisions in their existing owning modules. Component adoption must preserve those contracts and the accepted quiz flow, including five questions per page and persistent save/submission controls.

### Adoption checks for future implementation

Before significant UI work, follow the [frontend research and implementation workflow](docs/development/frontend-workflow.md) for reference research, access limits, candidate evaluation, a proposed direction, native implementation, and browser/Playwright verification. Maintain approval and license evidence in the [component register](docs/development/frontend-components.md). These are contribution requirements, not evidence of a completed migration.

## Best quiz review and result dialogs (2026-11-04)

The historical review extends the existing quiz theme with static answer rows, explicit Your answer/Correct answer labels, explanations, and two five-question groups. Choices have no editable or disabled-input semantics. Review navigation remains keyboard accessible and keeps readable text in both themes.

The confirmed-failure dialog uses the native modal surface with explicit centering, focus containment, Escape dismissal and focus restoration to the current questions. Its two actions are Review answers and Retry. Persistent Retry stays on the topic page; product/domain documents own automatic completion and retained-progress behavior. Blue and green surface mixes use Oklab to avoid hue rotation into pink against light cards. Destructive button colors are unchanged.
