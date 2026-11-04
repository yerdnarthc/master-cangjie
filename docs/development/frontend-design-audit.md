# Frontend design audit

Date: 2026-11-04. Scope: current working tree, including existing uncommitted frontend changes. This is a source and documentation audit plus a focused rendered check of quiz question-group navigation in the dark theme at desktop and 390px widths. It does not cover all screens, light-theme contrast, screen-reader announcements, or runtime performance. This follow-up replaces only the quiz question-group control and adds no dependencies.

## Accepted direction and observed implementation

[DESIGN.md](../../DESIGN.md) defines the maintainer's selected 21st.dev theme: dark navy surfaces, blue action/selection, teal progress, a 10px radius, Inter-first sans typography, and a separate light theme. The canonical tokens live in `apps/web/src/app/theme.css`; typography uses system fallbacks, with no bundled font files. Theme selection uses `data-theme` and browser storage, with an early initialization script and storage-failure handling.

The web application uses Next.js App Router, React, Tailwind CSS v4 and Lucide React. Routes cover the roadmap, topic lessons and activities. `apps/web/components.json` and `apps/web/src/components/ui/` provide the shadcn structure; Choicebox and Tree Nav are local shared components. The quiz workspace uses Tree Nav for the two five-question groups, and Tree Nav uses `motion/react` with a reduced-motion preference hook. Other surfaces still rely mostly on custom components and CSS.

## Findings and follow-up priorities

| Priority | Evidence | Impact and future action |
| --- | --- | --- |
| P1 documentation, resolved here | `docs/mvp-stack.md` deferred a design system and UI libraries despite the accepted DESIGN direction and new maintainer decision. | Updated the owning stack and design documents to select shadcn/ui with 21st.dev and Motion, and record incremental component adoption. |
| P2 theming | `globals.css` uses fixed neutral disabled-button colors and a generic `button.primary` white foreground; the dark accent is a light blue. Later surface overrides also exist. | Review computed cascade and contrast for every affected control in both themes before migration; map foreground/background pairs to semantic tokens. Source alone does not establish which rendered controls fail contrast. |
| P2 theming | `code-editor.tsx` sets Monaco `theme="vs-dark"` independently of the page theme. | The editor stays dark when the learner selects light mode. Decide and document an intentional editor palette or synchronize it during future UI work. |
| P2 maintainability | `globals.css` combines global element styles, tokens, surface-specific rules and later overrides in one file exceeding 1,600 lines. Controls are authored directly in workspace components. | Introducing primitives without reviewing this cascade risks conflicting states. Establish semantic tokens and shared variants before migrating screens. |
| P2 motion | CSS has global reduced-motion suppression and a separate quiz spinner override. Tree Nav uses Motion and jumps its marker and opacity when reduced motion is requested. | Review motion and persistent textual feedback in the remaining surfaces; a focused component check does not establish app-wide motion behavior. |
| Verification gap | Breakpoints, focus styles, ARIA labels/status regions, quiz selection/review markup and sticky quiz controls exist in source. Tree Nav's page-change state, accessible labels, 44px links, and horizontal overflow were checked in the browser at desktop and 390px. | Browser checks must still establish full keyboard order, screen-reader announcements, zoom behavior, sticky-control clearance, and contrast across themes. No WCAG compliance claim is made. |
| Verification gap | Monaco is dynamically loaded from the coding workspace with a loading status; the editor supports a plain textarea fallback. | Preserve these recovery paths. Bundle size, hydration and animation performance remain unmeasured. |

## UX contracts to preserve

The quiz and coding components contain save, pending, retry, storage-warning, conflict and submission-review states. They are functional interaction flows rather than decorative component states. Follow the complete relevant [use cases](../use-cases.md) and [domain rules](../domain-model.md) before changing their presentation or timing. Keep selected answers distinct from confirmed correctness and retain textual error and recovery information.

Positive source evidence includes visible focus styling, labelled navigation and editor controls, status/alert regions, minimum button heights, persistent theme choice, and an editor fallback. These provide useful foundations but do not prove the rendered experience is accessible at every size or state.

## Documentation outcome

The accepted foundation is shadcn/ui with 21st.dev, Tailwind CSS, Lucide React and Motion. The selected 21st.dev theme in DESIGN.md remains the visual authority. The shadcn structure and theme tokens are configured, and Tree Nav is now used in the quiz progress sidebar. Continue migrating other surfaces incrementally, reviewing catalog source and validating both themes and recovery states. This focused integration changed UI source and documentation but added no dependencies.
