# Frontend research and implementation

Use this workflow before significant UI work: a new screen, substantial layout or interaction changes, a new shared component, or adopting a third-party component. Small fixes within an accepted design can use the existing references and components; repeat research when the design direction or component choice changes.

[DESIGN.md](../../DESIGN.md) owns visual direction. The [MVP stack](../mvp-stack.md) owns technology choices, and the product, use-case, domain, and architecture documents own behavior. Research informs those decisions; adopting a reference does not change them.

## 1. Research patterns

Inspect the current surface and shared components first. Explore relevant patterns in [21st.dev](https://21st.dev/), [Magic UI](https://magicui.design/), [React Bits](https://reactbits.dev/), [Animata](https://animata.design/), [Aceternity UI](https://ui.aceternity.com/), and suitable open-source registries. Search across these sources, then study the strongest relevant candidates in depth. Record when a source has no suitable reference or cannot be accessed.

Use free previews and search for discovery. Retrieve source only through authorized free-tier allowances or openly licensed repositories. Respect subscription restrictions and usage limits; never bypass access controls. A visible preview or publicly viewable file does not establish permission to reuse its source. When source is unavailable, use the reference to inform an independent implementation in the project's own visual system.

## 2. Evaluate candidates

Compare a small set of relevant references against the current implementation. For each candidate, record:

- Reference URL and the specific pattern worth using.
- Visual quality and fit with the project's palette, typography, spacing, and component hierarchy.
- Usability with real content, including loading, empty, disabled, error, and recovery states.
- Responsiveness, keyboard operation, semantics, focus, contrast, and reduced-motion behavior.
- Rendering and animation cost, client JavaScript, dependencies, and maintenance burden.
- Source availability, license evidence, and attribution or distribution requirements.

Separate observed behavior from assumptions and unverified claims. Prefer cohesive interfaces with a clear visual identity; catalog popularity and animated previews do not establish production quality.

## 3. Propose the direction before writing UI code

Present the strongest direction and explain why it fits the task. Include the references and comparison, proposed layout and interaction behavior, existing components to reuse, implementation approach, dependency and licensing implications, and browser/test checks. Resolve material open decisions before implementing dependent work. An already accepted direction can be referenced rather than proposed again.

Keep exploratory notes and execution plans local. Put accepted visual decisions in DESIGN.md, behavior decisions in their owning documents, and retained component provenance in the [component register](frontend-components.md).

## 4. Implement with the native stack

MasterCangjie currently uses Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, Lucide React, and Motion. Adapt legitimately available components to the shared theme and existing module boundaries, or implement the pattern independently. Reuse installed dependencies where suitable; justify additions and check compatibility, maintenance, license, and bundle impact before adopting them.

Keep server rendering where appropriate and limit client components to interactions that require them. Preserve assessment, saving, conflict, submission, and progression contracts. Motion must communicate state, respect reduced motion, and preserve immediate feedback.

If this workflow is applied to a Blazor surface, prioritize Razor, CSS, and targeted JavaScript interop rather than embedding React. This conditional guidance does not change MasterCangjie's selected stack.

## 5. Verify the rendered flow

Inspect the actual page in a browser with real content at desktop and narrow widths, in both themes. Check wrapping and overflow, touch targets, keyboard order and focus, contrast, sticky controls, relevant failure/recovery states, and motion with reduced motion enabled. Record the routes, viewport sizes, states, and any remaining gaps.

Run the relevant existing Playwright journeys under `tests/journeys/` using the `test:journeys` script in the root package manifest. Select tests for the changed flow; assess whether existing coverage exercises the new behavior and add meaningful coverage when needed. The Playwright configuration requires a dedicated database whose name ends in `_test`; use the existing test host and controlled adapters. Report missing prerequisites or failures explicitly. Browser inspection and passing behavioral tests provide different evidence; neither alone proves accessibility or visual quality.

For documentation-only changes to this workflow, check links and diffs; browser journeys are required when UI implementation changes.

## 6. Reuse and record provenance

Maintain a small library under `apps/web/src/components/ui/`. Consolidate useful shared controls instead of accumulating near-duplicate variants and unused demos. Record each externally adapted component in the [component register](frontend-components.md) with its source URL, author, version or commit, license evidence, attribution requirements, adaptations, and verification status. Preserve required notices in distributed source or an accompanying notice file.

A component becomes approved for reuse only after its provenance, reuse permissions, theme fit, accessibility, responsive behavior, and relevant interactions have been reviewed. Recheck approval when a substantial source or dependency update changes those assumptions.
