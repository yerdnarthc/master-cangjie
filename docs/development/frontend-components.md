# Shared frontend component register

Follow the [frontend workflow](frontend-workflow.md) when adopting or changing shared components. Runtime use and approval for reuse are separate facts. An approval records reviewed reuse permissions, design fit, and verification evidence; it does not imply accessibility compliance across every consumer.

## Current inventory

These components are imported by `apps/web/src/components/quiz-workspace.tsx`. Their original source URLs, revisions, and license evidence have not been recorded in this register. They remain pending review; no license or approval is inferred from their presence in the codebase.

| Component | Local source | Current role | Reuse approval |
| --- | --- | --- | --- |
| Button | `apps/web/src/components/ui/button.tsx` | Shared button variants; wraps Base UI | Pending provenance, license, and interaction review |
| Choicebox | `apps/web/src/components/ui/choicebox.tsx` | Quiz answer choices | Pending provenance, license, and interaction review |
| FlowButton | `apps/web/src/components/ui/flow-button.tsx` | Quiz submission action and phases | Pending provenance, license, and interaction review |
| TreeNav | `apps/web/src/components/ui/tree-nav.tsx` | Question-group progress navigation | Pending provenance, license, and interaction review |

The [frontend audit](frontend-design-audit.md) contains earlier source and focused browser evidence, including its limits. It does not resolve the missing provenance or licensing records.

## Adoption record

For each adoption or approval, record:

- **Component and consumers:** local paths, purpose, and intended reuse scope.
- **Source:** canonical URL, original author, and exact version or commit. For independently authored code, record that origin and any inspiration URLs.
- **Access and license:** how source was legitimately obtained, the license identifier and license URL/file at that revision, and licenses of added dependencies or assets. Unknown permission remains unresolved.
- **Notices:** required attribution, copyright notices, and where they are preserved in the distributed project. Record no-notice conclusions only when supported by the actual license.
- **Adaptations:** theme mappings, behavior changes, accessibility fixes, dependencies, and meaningful differences from upstream.
- **Verification:** reviewed routes, themes, viewports, keyboard and reduced-motion states, relevant Playwright results, and known gaps.
- **Decision:** pending, approved with scope, or retired; include review date and evidence supporting the decision.

## Quiz best-submission review extension (2026-11-04)

The review page uses project-authored static choice rows and navigation controls styled with the current theme. The post-failure flow uses a project-authored native HTML dialog. No third-party source was copied, no catalog component was installed, and no dependency was added. Existing Button, Choicebox and Tree Nav provenance remains unchanged. Catalog/docs comparisons are local in `.ai-work/research/quiz-best-review.md`; these are references, not new reuse approvals. Browser evidence and final verification are recorded after implementation checks.

Rendered review, topic/activity and failure-dialog checks passed in both themes; see the [verification record](quiz-best-review-verification.md) for scope and limits. No new external component reuse approval is implied.
