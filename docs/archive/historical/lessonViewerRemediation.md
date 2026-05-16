# Lesson Viewer Remediation Tracker

## At-a-Glance Progress

- Overall Progress: `100%` (32/32 scoped tasks complete)
- Current Phase: `5 - Deployment Readiness & Verification`
- Current Task: `Final validation and rollout checklist`
- Status: `Complete`
- Last Updated (UTC): `2026-04-02`
- Owner: `Codex + parallel sub-agents`

### Phase Progress

| Phase | Name | Status | Progress |
|---|---|---|---|
| 0 | Initialization & Audit Baseline | Complete | 4/4 |
| 1 | Critical Remediation | Complete | 8/8 |
| 2 | High Remediation | Complete | 8/8 |
| 3 | Medium/Low Hardening | Complete | 6/6 |
| 4 | Tests + CI Gates | Complete | 4/4 |
| 5 | Deployment Readiness | Complete | 2/2 |

---

## Scope Covered

Lesson viewer domain across cloud + onprem:

- Authenticated and public lesson viewer APIs and language variant resolution
- Lesson viewer page navigation/state, language switching, podcast version selection, and back-navigation consistency
- Podcast playback selection/reset behavior for version/language transitions
- Completion guard robustness (slide-count reconciliation)
- Regression tests and critical-path CI script hardening

---

## Findings and Resolutions

| ID | Severity | Finding | Root Cause | Impacted Files | Resolution | Status |
|---|---|---|---|---|---|---|
| LV-001 | Critical | Viewer used source lesson id after language resolution, causing wrong viewer/video artifact fetches | Post-resolution calls still referenced route param id | `server/routes/courseRoutes.ts`, `server/routes/public.ts` | Introduced `resolvedLessonId` and consistently used it in `getViewerUrl`/`getVideoUrl` calls | Fixed |
| LV-002 | Critical | Lesson completion could fail despite full slide views due stale cached counts | Completion check trusted cached `slidesViewedCount` only | `server/services/lessonProgressService.ts` | Reconciles count from `lessonProgressSlides` before completion block | Fixed |
| LV-003 | High | Auth viewer fetch path lacked robust non-OK handling and auth cookie forwarding | Fetch path assumed JSON success and omitted explicit credentials | `client/src/pages/LessonViewer.tsx` | Added `credentials: 'include'`, non-OK guard, and resilient error parsing | Fixed |
| LV-004 | High | Language switch path leaked legacy `lang` semantics and inconsistent query carryover | Ad-hoc query param building across handlers | `client/src/pages/LessonViewer.tsx`, `client/src/lib/lessonNavigationState.ts` | Added normalized helpers (`buildLessonVariantSearchParams`) and support for both `languageCode` and legacy `lang` reads | Fixed |
| LV-005 | High | Back navigation targets could drift and allowed unsafe `returnTo` usage | Repeated local parsing + no central path sanitization | `client/src/pages/LessonViewer.tsx`, `client/src/components/CourseBackLink.tsx`, `client/src/lib/courseBackNavigation.ts` | Centralized sanitized back-target resolution and shared helpers | Fixed |
| LV-006 | High | Podcast version selection could mismatch language/version and stick to stale active version | Selection logic preferred first language match only | `client/src/pages/LessonViewer.tsx`, `client/src/lib/lessonNavigationState.ts` | Added deterministic preferred-version resolver with active/language/timestamp prioritization | Fixed |
| LV-007 | Medium | Podcast player could retain stale source when lesson/version/language changed | Audio element source not reset on context change | `client/src/components/PodcastPlayer.tsx` | Added source reset + pause/load cycle on key prop changes | Fixed |
| LV-008 | Medium | Viewer UI had hardcoded color usage violating theme/white-label consistency | Hardcoded visual classes in showcase/demo controls and confetti palette | `client/src/pages/LessonViewer.tsx` | Replaced with theme token-driven values and semantic classes | Fixed |
| LV-009 | Medium | Utility logic coupled to component import path, reducing testability | Navigation helper logic embedded in component | `client/src/components/CourseBackLink.tsx`, `client/src/lib/courseBackNavigation.ts` | Extracted reusable course-back utilities to `lib` | Fixed |
| LV-010 | Low | Critical Jest suite instability (OOM risk and incompatible mock style) | Top-level await mock usage and default heap limit | `package.json`, `client/src/tests/courseBackLink.test.ts`, `server/tests/lessonProgressService.test.ts` | Converted tests to stable mock style and raised heap for critical suite via `NODE_OPTIONS` | Fixed |

---

## Implementation Waves

### Wave A (Critical)

- Fixed language-resolved viewer id usage in private + public routes.
- Hardened completion slide-count validation with DB reconciliation.

Files:
- `Cloud-On-Prem/server/routes/courseRoutes.ts`
- `Cloud-On-Prem/server/routes/public.ts`
- `Cloud-On-Prem/server/services/lessonProgressService.ts`

### Wave B (High)

- Hardened viewer fetch/query handling.
- Unified viewer back-target logic and language-switch query construction.
- Stabilized podcast language/version selection.

Files:
- `Cloud-On-Prem/client/src/pages/LessonViewer.tsx`
- `Cloud-On-Prem/client/src/lib/lessonNavigationState.ts`
- `Cloud-On-Prem/client/src/components/CourseBackLink.tsx`
- `Cloud-On-Prem/client/src/lib/courseBackNavigation.ts`

### Wave C (Medium/Low + CI)

- Reset podcast player source on context changes.
- Added regression tests for navigation/back-target and completion reconciliation.
- Hardened critical test script heap settings.

Files:
- `Cloud-On-Prem/client/src/components/PodcastPlayer.tsx`
- `Cloud-On-Prem/client/src/tests/courseBackLink.test.ts`
- `Cloud-On-Prem/client/src/tests/lessonViewerNavigation.test.ts`
- `Cloud-On-Prem/server/tests/lessonProgressService.test.ts`
- `Cloud-On-Prem/package.json`

---

## Validation Evidence

### Commands run

1. `cd /antigravity/Cloud-On-Prem && npm run -s test:viewer-critical`
2. `cd /antigravity/Cloud-On-Prem && npm run -s check`
3. `cd /antigravity/Cloud-On-Prem && npx jest --runInBand client/src/tests/lessonViewerNavigation.test.ts`

### Result

- `test:viewer-critical`: PASS (`8` suites, `35` tests)
- `check`: PASS
- `lessonViewerNavigation.test.ts`: PASS (`1` suite, `4` tests)

---

## Residual Risks / Explicit Deferrals

| Item | Decision | Justification |
|---|---|---|
| Full browser-level E2E automation for lesson viewer UX flows | Deferred | Current repo validation stack is Jest-centric; no committed Playwright/Cypress coverage was added in this wave. Manual UAT checklist provided below to cover runtime UX paths in cloud + onprem. |

---

## Deployment + Verification Checklist (Cloud + Onprem)

1. Deploy backend + frontend together (routes + viewer UI changes are coupled).
2. Clear app caches/CDN for client bundle.
3. Smoke test authenticated viewer:
- open EN lesson with translations
- switch to NL via language menu
- verify viewer/video/podcast align to translated lesson artifacts
4. Smoke test public/showcase viewer language fallback path.
5. Validate podcast card behavior:
- switch language and version
- verify playback source updates immediately
- verify download URL reflects selected version/language
6. Validate lesson completion guard:
- partial slides -> completion blocked
- full slide views -> completion succeeds
7. Run parity checks in both cloud and onprem runtime with same lesson fixture set.
8. Confirm no regressions in translation-related critical tests (`npm run -s test:viewer-critical`).

---

## UAT Checklist

- [ ] Back button always returns to intended course/return route.
- [ ] Language switch keeps `courseId` and safe `returnTo`.
- [ ] Selected podcast version persists correctly when switching languages.
- [ ] Podcast playback source resets (no stale audio) when selection changes.
- [ ] Theme colors are applied (no hardcoded brand breaks in viewer action buttons).
- [ ] Completion behavior respects actual viewed slides.
