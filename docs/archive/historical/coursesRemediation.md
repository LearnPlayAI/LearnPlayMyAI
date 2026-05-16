# Courses Domain Remediation Tracker

## At-a-Glance Progress

- Overall Progress: `100%` (34/34 scoped remediation tasks complete)
- Current Phase: `5 - Deployment Readiness`
- Current Task: `Final rollout + UAT checklist`
- Status: `Complete`
- Last Updated (UTC): `2026-04-02T18:20:00Z`
- Owner: `Codex + parallel sub-agents`

## Phase Progress

| Phase | Name | Status | Progress |
|---|---|---|---|
| 0 | Audit Initialization | Complete | 4/4 |
| 1 | Critical Fixes | Complete | 10/10 |
| 2 | High Fixes | Complete | 11/11 |
| 3 | Medium/Low Hardening | Complete | 7/7 |
| 4 | Tests + CI Gates | Complete | 4/4 |
| 5 | Deployment Readiness | Complete | 2/2 |

---

## Findings and Resolution Status

| ID | Severity | Finding | Root Cause | Impacted Files | Resolution | Status |
|---|---|---|---|---|---|---|
| C-001 | Critical | Course translated language selection unreliable | FE used `lang`, BE resolved `languageCode`; course fetch not language-aware | `client/src/pages/CourseDetail.tsx`, `client/src/pages/BrowseCourses.tsx`, `client/src/lib/courseLanguageRouting.ts`, `server/routes/courseRoutes.ts` | Standardized canonical `languageCode` with legacy `lang` read compatibility; made course fetch/query keys language-aware | Fixed |
| C-002 | Critical | Org language setting endpoint cross-tenant writable | Missing org role/scope checks | `server/routes/languageRoutes.ts`, `server/services/languageAccessPolicy.ts` | Added staff-scope enforcement before org language mutation | Fixed |
| C-003 | Critical | Course metadata translation cross-tenant risk | Route selected first org role instead of source-course org authorization | `server/routes/languageRoutes.ts` | Route now resolves source course org and enforces staff scope in that org | Fixed |
| C-004 | Critical | Public showcase lesson fallback could expose non-showcase variant | Resolved variant not revalidated for showcase eligibility | `server/routes/public.ts`, `server/services/languageAccessPolicy.ts` | Added resolved-variant showcase eligibility guard | Fixed |
| C-005 | High | Translation readiness/status/cancel APIs under-scoped | Missing tenant ownership checks | `server/routes/languageRoutes.ts` | Added staff/org checks for all affected routes | Fixed |
| C-006 | High | Public batch language availability exposed inactive/unpublished variants | Missing publish/status filters | `server/routes/languageRoutes.ts`, `server/services/languageAccessPolicy.ts`, `server/services/contentLanguageService.ts` | Added public availability policy filters (active + default/published) | Fixed |
| C-007 | High | `MyCourses` query key generated wrong path (`/api/my-courses/:page`) | Default query-key URL builder mismatch | `client/src/pages/MyCourses.tsx`, `client/src/lib/courseLanguageRouting.ts` | Added explicit queryFn with proper `limit/offset` URL builder | Fixed |
| C-008 | High | `CoursePreview` fetched nonexistent route (`/api/courses/:id/details`) | Missing explicit queryFn | `client/src/pages/CoursePreview.tsx` | Added explicit fetch to `/api/courses/:id` with language support | Fixed |
| C-009 | High | Translation worker stale timeout falsely fails async handoff jobs | Blanket stale-fail on `translating` status | `server/workers/translationWorker.ts` | Added async-handoff detection and stale/process skip for external pending assets | Fixed |
| C-010 | Medium | Variant fallback nondeterministic in language service | Unsorted variants with first-row fallback | `server/services/contentLanguageService.ts` | Added deterministic variant normalization/sort before fallback selection | Fixed |
| C-011 | Medium | MyCourses language availability non-actionable | Badges were informational only | `client/src/pages/MyCourses.tsx` | Added actionable language controls and variant-aware navigation links | Fixed |
| C-012 | Medium | Mobile language controls too small | Small chip/trigger sizes | `client/src/pages/BrowseCourses.tsx`, `client/src/pages/MyCourses.tsx`, `client/src/pages/CourseDetail.tsx` | Increased touch targets (`min-h-[44px]`) for language controls | Fixed |

---

## Implementation Waves

### Wave A (Critical)

- Canonicalized `languageCode` handling for course pages and API resolution.
- Closed cross-tenant org-language and metadata-translation authorization gaps.
- Enforced showcase eligibility after public language fallback resolution.

Files:
- `Cloud-On-Prem/client/src/pages/CourseDetail.tsx`
- `Cloud-On-Prem/client/src/lib/courseLanguageRouting.ts`
- `Cloud-On-Prem/server/routes/courseRoutes.ts`
- `Cloud-On-Prem/server/routes/languageRoutes.ts`
- `Cloud-On-Prem/server/routes/public.ts`
- `Cloud-On-Prem/server/services/languageAccessPolicy.ts`

### Wave B (High)

- Scoped translation readiness/status/cancel endpoints to tenant staff.
- Hardened public language availability filtering for courses/lessons.
- Fixed `MyCourses` and `CoursePreview` API mapping defects.

Files:
- `Cloud-On-Prem/client/src/pages/MyCourses.tsx`
- `Cloud-On-Prem/client/src/pages/CoursePreview.tsx`
- `Cloud-On-Prem/server/routes/languageRoutes.ts`

### Wave C (Medium/Low + Resilience)

- Added deterministic language fallback behavior.
- Added worker guard to prevent false stale failures and duplicate processing during external async handoff.
- Improved mobile responsiveness of language controls.

Files:
- `Cloud-On-Prem/server/services/contentLanguageService.ts`
- `Cloud-On-Prem/server/workers/translationWorker.ts`
- `Cloud-On-Prem/client/src/pages/BrowseCourses.tsx`
- `Cloud-On-Prem/client/src/pages/MyCourses.tsx`
- `Cloud-On-Prem/client/src/pages/CourseDetail.tsx`

### Wave D (Quality Gates)

- Upgraded the critical-path gate to include newly added course-language routing and language access security tests.
- Ensures future regressions in course translation/language pathing fail fast in shared critical suite runs.

Files:
- `Cloud-On-Prem/package.json`

---

## Files Changed

- `Cloud-On-Prem/client/src/lib/courseLanguageRouting.ts` (new)
- `Cloud-On-Prem/client/src/pages/BrowseCourses.tsx`
- `Cloud-On-Prem/client/src/pages/CourseDetail.tsx`
- `Cloud-On-Prem/client/src/pages/CoursePreview.tsx`
- `Cloud-On-Prem/client/src/pages/MyCourses.tsx`
- `Cloud-On-Prem/client/src/tests/courseLanguageRouting.test.ts` (new)
- `Cloud-On-Prem/server/routes/courseRoutes.ts`
- `Cloud-On-Prem/server/routes/languageRoutes.ts`
- `Cloud-On-Prem/server/routes/public.ts`
- `Cloud-On-Prem/server/services/contentLanguageService.ts`
- `Cloud-On-Prem/server/services/languageAccessPolicy.ts` (new)
- `Cloud-On-Prem/server/tests/languageSecurityAvailability.test.ts` (new)
- `Cloud-On-Prem/server/workers/translationWorker.ts`
- `Cloud-On-Prem/package.json`

---

## Validation Evidence

### Commands executed

1. `cd /antigravity/Cloud-On-Prem && npm run -s check`
2. `cd /antigravity/Cloud-On-Prem && npx jest --runInBand client/src/tests/courseLanguageRouting.test.ts server/tests/languageSecurityAvailability.test.ts`
3. `cd /antigravity/Cloud-On-Prem && npm run -s test:critical`
4. `cd /antigravity/Cloud-On-Prem && npm run -s test:critical:integration`

### Results

- `check`: PASS
- `courseLanguageRouting + languageSecurityAvailability` tests: PASS (`2` suites, `10` tests)
- `test:critical`: PASS (`10` suites, `45` tests)
- `test:critical:integration`: BLOCKED in current environment (`DATABASE_URL` not set)

---

## Residual Risks / Deferrals

| Item | Decision | Justification |
|---|---|---|
| End-to-end browser automation for courses language switching across all tabs | Deferred | Existing stack in this workspace is Jest-first. Manual UAT checklist below covers cloud + onprem behavior parity and user-facing language flow validation. |
| Translation index worker backoff/dead-letter replay redesign | Deferred (separate worker-hardening epic) | Identified during audit, but broader queue-contract changes exceed safe scope for this courses rollout. Kept current rollout focused on language selection correctness, tenant-safety, and public availability truthfulness. |
| Integration critical suite execution in this workspace | Environment constrained | `test:critical:integration` requires configured `DATABASE_URL`; the suites fail-fast by design when DB is unavailable. Run these in cloud/onprem DEV with DB credentials during rollout validation. |

---

## Deployment Checklist (Cloud + Onprem)

1. Deploy backend + frontend together.
2. Restart workers/services so translation worker safeguards load.
3. Clear CDN/static cache for client bundle.
4. Verify DB connectivity and background workers healthy.
5. Smoke test public marketplace cards for language selector availability.
6. Smoke test course detail language switching (`EN` <-> translated variants).
7. Verify MyCourses assigned/public/purchased cards can navigate to selected language variants.
8. Verify translation admin routes enforce tenant/staff scope correctly.
9. Verify public showcase lesson viewer rejects non-showcase resolved variants.

---

## UAT Checklist

- [ ] On `BrowseCourses`, select translated language from card selector and open course in that language.
- [ ] On `CourseDetail`, switching language retains correct course variant and lesson start routes.
- [ ] Legacy links using `?lang=xx` still resolve correctly.
- [ ] On `MyCourses`, language controls navigate to selected variant for purchased/public/assigned cards.
- [ ] Public language chips/selectors do not expose draft/unpublished variants.
- [ ] Org language update route denies non-staff users.
- [ ] Translation readiness/status/cancel endpoints deny unauthorized org users.
- [ ] Public showcase viewer does not leak non-showcase translated variants.
