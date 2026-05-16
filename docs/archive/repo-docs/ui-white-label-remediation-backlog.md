# UI White-Label Remediation Backlog

Generated: 2026-04-03

## Current Audit Snapshot

- Hardcoded palette utility count (pages/components): 0
- Preview token family adoption in live pages/components:
  - `--course-card-*`: 0
  - `--filter-pill-*`: 0
  - `--empty-state-*`: 0
  - `--question-card-*`: 0
  - `--lesson-nav-*`: 0
  - `--admin-sidebar-*`: 0
  - `--admin-table-*`: 0
  - `--step-card-*`: 0
  - `--stepper-*`: 0
  - `--feature-card-*`: 0

## Priority Migration Order

1. `client/src/pages/CourseLessons.tsx`
2. `client/src/pages/CourseDocumentWizard.tsx`
3. `client/src/pages/GamificationSettings.tsx`
4. `client/src/pages/TranslateLesson.tsx`
5. `client/src/pages/QuizWizard.tsx`
6. `client/src/pages/MyCourses.tsx`
7. `client/src/pages/PlatformPricing.tsx`
8. `client/src/pages/UnifiedManagementHub.tsx`
9. `client/src/pages/OrgRegistrationWizard.tsx`
10. `client/src/pages/LessonViewer.tsx`

## Migration Rules (Non-Negotiable)

- No new hardcoded Tailwind palette utilities in pages/components (`text-blue-600`, `bg-slate-50`, etc).
- No opacity-only disabled states for controls.
- Use semantic tokens/components (`Button`, `Badge`, `Tabs`, `Input`, `Select`, `Textarea`) first.
- Status/intent UI must use semantic badge/button variants (`success`, `warning`, `danger`, `info`, `secondary`, `outline`).
- Any new preview token family must have at least one live-page consumer.

## Definition of Done per File

- Remove fixed palette classes for text/background/border/ring/gradients where semantic tokens exist.
- Ensure disabled control states use explicit disabled token colors.
- Confirm no white-on-white combinations introduced.
- Verify route with at least one light and one dark/extreme custom theme.

## Verification Commands

- `npm run check`
- `npm run check:ui-contrast`
- `npm run audit:ui-white-label`
