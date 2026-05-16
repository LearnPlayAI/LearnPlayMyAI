# World-Class UI/UX Patterns

Use these patterns as defaults for LearnPlay UI delivery.

## 1) Mobile-First Responsive Foundation
- Start with `320px` baseline, then scale to `768px`, `1024px`, and `1280px+`.
- Prefer fluid layouts (`minmax`, `clamp`, `%`, `fr`) over fixed widths.
- Define explicit reflow behavior for dense sections (tables, toolbars, cards, filters).
- Protect against overlap using wrapping, truncation, and vertical stacking fallbacks.

## 2) Modern Information Architecture
- Prefer route/page flows and inline disclosure over modal-heavy interaction.
- Keep one dominant primary action per viewport section.
- Use progressive disclosure: show essentials first, expand advanced controls on demand.
- Use sticky action bars on mobile when forms are long.

## 3) Wizard and Stepper Flows
- Use wizard flow for multi-step tasks with dependencies.
- Provide step labels, current step indicator, and save-and-exit capability.
- Validate per-step and globally before final submit.
- Persist step progress and return user to last incomplete step.

## 4) Draft Management
- Create draft at flow start for high-effort tasks.
- Autosave on meaningful change with debounce.
- Distinguish statuses clearly: `Draft`, `Saving`, `Saved`, `Publish failed`.
- Support resume, discard, and publish actions.
- Keep draft-to-published transition explicit and reversible when feasible.

## 5) Input Persistence
- Persist form state for interrupted sessions where user effort is significant.
- Prefer server-side draft persistence; use local persistence as fallback.
- Scope persisted data to user + organization + entity to avoid cross-context leakage.
- Expire stale local drafts and show safe recovery UI.

## 6) Data Freshness and Cache Invalidation
- Every mutation must explicitly invalidate or refresh affected queries/views.
- Use stale-while-revalidate behavior where it improves perceived speed.
- Define optimistic update policy per action and include rollback on failure.
- Display inline freshness indicators when data can become stale.
- Prevent duplicate submissions with idempotent action guards.

## 7) State and Feedback Design
- Always design for all key states:
  - loading
  - empty
  - error
  - partial success
  - success
- Use inline contextual feedback near the affected control/section.
- Avoid generic toasts as the only feedback mechanism for critical actions.

## 8) LearnPlay Branding and Theme System
- Consume theme tokens instead of hardcoded values.
- Treat Theme Editor as the authority for brand behavior (tokens, logos, typography, organization overrides).
- Respect organization-level theme overrides for color, surfaces, and accents.
- Validate contrast and readability under default and overridden themes.
- Keep brand personality consistent: modern, confident, clean, high-clarity layouts.

## 9) UI Pattern Reuse and Systemization
- Reuse existing shared components/patterns first to keep visual language consistent.
- Promote repeated page-specific UI into shared token-driven primitives.
- Keep spacing, radius, typography scale, and elevation behavior consistent across pages.
- Avoid one-off styling that cannot adapt to Theme Editor overrides.

## 10) Accessibility and Usability Baseline
- Maintain visible keyboard focus.
- Ensure tap target sizing is mobile-friendly.
- Use semantic headings and landmarks.
- Preserve readable line length and text scaling behavior.

## 11) Required Validation Before Completion
- Verify at least these widths: `320`, `360`, `375`, `390`, `768`, `1024`, `1280`.
- Confirm no overlap/clipping in primary and edge-case data scenarios.
- Confirm cache invalidation behavior after each mutation path.
- Confirm drafts/input persistence via refresh and navigation tests.
