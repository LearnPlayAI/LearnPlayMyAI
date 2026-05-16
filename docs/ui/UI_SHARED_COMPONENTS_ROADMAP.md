# UI Shared Components Roadmap

Purpose: grow a consistent, world-class, Theme Editor-aligned UI system across LearnPlay by default.

## North Star
- Every new page or UI change should prefer shared, token-driven components over one-off styling.
- Shared components must honor Theme Editor branding and organization overrides.
- Mobile-first behavior is non-negotiable.

## Core Principles
- Reuse before create: check existing primitives first.
- Token-first styling: no hardcoded branding values.
- State-complete components: each shared component supports loading/empty/error/success where relevant.
- Accessibility baseline: keyboard usable, visible focus, touch-safe targets.
- Responsive by design: validate at `320`, `360`, `375`, `390`, `768`, `1024`, `1280`.

## Priority Component Tracks
1. Foundations
- `PageShell`, `SectionHeader`, spacing primitives, responsive container wrappers.
- Typography scale and heading/body helpers using theme tokens.

2. Inputs and Forms
- Shared `FormField`, `Select`, `Textarea`, validation summary, inline help/error patterns.
- Draft-aware form footer/actions with save/publish status affordances.

3. Data Presentation
- Unified `DataTable` patterns for filters, empty states, pagination, and row actions.
- Shared `StatCard` and metrics blocks for dashboards/reports.

4. Feedback and States
- Shared inline state blocks (`LoadingState`, `EmptyState`, `ErrorState`, `SuccessState`).
- Consistent inline alert/banner patterns.

5. Navigation and Workflow
- Stepper/wizard shell for multi-step flows.
- Non-modal side panels/inline expansion patterns for advanced actions.

## Adoption Workflow (Per UI Task)
1. Identify if requested UI can use existing shared components.
2. Reuse existing components where available.
3. If missing, add a reusable component rather than page-specific styling.
4. Verify Theme Editor compatibility and responsive behavior.
5. Record what was reused vs newly added in task summary.

## Definition of Done For Componentization
- Component is reused in at least one real page flow.
- Token-driven and Theme Editor compatible.
- Responsive and accessible across required breakpoints.
- Includes all required interaction states.
- Documented in implementation summary so future tasks discover and reuse it.

## Governance Notes
- This roadmap complements:
  - `.skills/ui-governance/SKILL.md`
  - `.skills/ui-governance/references/world-class-patterns.md`
  - `.skills/ui-governance/references/ui-acceptance-checklist.md`
  - `docs/ui/UI_TASK_TEMPLATE.md`
