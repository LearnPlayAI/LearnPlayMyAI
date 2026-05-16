# UI Acceptance Checklist

Use this checklist before finishing any UI-related task.

## Design Contract (Before Build)
- Page goal and target user are explicitly defined.
- Primary task flow and intended success outcome are documented.
- Required states are defined: `loading`, `empty`, `error`, `success`.
- Breakpoint validation plan is defined for `320`, `360`, `375`, `390`, `768`, `1024`, `1280`.
- Theme Editor dependencies (token groups/branding behaviors) are identified before implementation.

## Layout and Responsiveness
- Mobile-first styles are implemented first.
- No clipping, overlap, or horizontal scroll at `320px`, `360px`, `375px`, `390px`, and `768px`.
- Desktop layouts (`1024px+`, `1280px+`) are balanced and readable.
- Spacing and typography scale consistently across breakpoints.
- Containers, cards, and tables reflow safely at small widths (stack, wrap, or collapse strategy defined).
- Long text and dynamic values (names, emails, IDs, tags) wrap or truncate safely without collision.

## Interaction Pattern Compliance
- No modal/dialog/popup pattern is introduced unless explicitly requested in current task.
- Primary actions are reachable in-page and keyboard-accessible.
- Error, loading, and empty states are visible inline in context.
- Multi-step flows use wizard/stepper/page flow patterns with clear progress indication.

## LearnPlay Branding and Themes
- LearnPlay visual identity is preserved.
- Organization-specific theme overrides are respected.
- Theme Editor-governed branding behavior remains intact for all changed UI.
- Color contrast remains accessible after theme overrides.
- Components rely on theme tokens instead of hardcoded brand values where tokenized values exist.
- No hardcoded branding overrides (color/font/logo/asset) bypass Theme Editor behavior.
- Typography, iconography, spacing, and component style remain visually coherent across themed organizations.

## Drafts and Input Persistence
- For long/multi-step forms, draft save behavior is implemented and testable.
- Unsaved changes are preserved across route refresh/navigation when intended.
- Recover/resume draft flow is available where user effort is high.

## Data Freshness and Cache
- Every create/update/delete action defines cache invalidation or revalidation behavior.
- Updated data is visible without requiring manual hard refresh.
- Optimistic updates, if used, have rollback/error handling.

## Quality Checks
- Visual quality is production-level on both mobile and desktop.
- States tested: default, hover/focus (where applicable), loading, empty, error.
- No regression to existing critical workflows.
- Accessibility basics validated: keyboard navigation, focus visibility, semantic landmarks, tap-target sizing.

## Manual Evidence Package
- Validated widths are reported explicitly.
- Key states validated are reported explicitly.
- Screenshot evidence paths are provided when screenshots are captured during the task.
- Any residual UI risk is listed with recommended follow-up.
