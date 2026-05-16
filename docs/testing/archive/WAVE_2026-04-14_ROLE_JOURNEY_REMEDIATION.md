# Wave Report: 2026-04-14 Role-Journey Remediation

## Goal
Deliver a cloud + onprem role-journey sweep with zero active findings, code-backed remediations, and re-audit evidence.

## Scope
- Variants: `cloud`, `onprem`
- Tracks exercised in this wave: `dev`
- Roles: `public`, `superadmin`, `custsuper`, `orgadmin`, `teacher`, `student`

## Direct + Indirect Impact Stocktake
- Direct domains: UI journey orchestration, UX sweep automation, API/data contracts, server regression gate, load/concurrency checks.
- Indirect domains: release confidence, CI stability, variant policy handling (onprem learner login in non-production), operator evidence quality.

## Role-Journey Matrix (`role x stage x variant x status`)
| Role | Stage | Cloud | OnPrem | Status | Evidence |
|---|---|---|---|---|---|
| public | entry/auth | same | same | pass | legacy live-browser sweep reports `live-ux-cloud-2026-04-13T22-06-43-886Z`, `live-ux-onprem-2026-04-13T22-08-21-470Z` |
| superadmin | core task | variant-specific | not-applicable | pass | cloud routes and deny checks in cloud sweep report |
| custsuper | core task | not-applicable | variant-specific | pass | onprem routes and deny checks in onprem sweep report |
| orgadmin | core task | same | same | pass | cloud + onprem sweep reports |
| teacher | core task | same | same | pass | cloud + onprem sweep reports |
| student | auth/core task | same | variant-specific | pass | cloud learner flow pass; onprem dev learner block expected by policy |
| all roles | error path/recovery/exit | same | same | pass | route deny checks + no blocking modal regressions |

## Findings and Disposition
| ID | Severity | Variant | Role/Journey | Root Cause | Disposition |
|---|---|---|---|---|---|
| W14-F001 | P1 | cloud + onprem | `npm run -s test:server` gate | Jest heap limit in script default | fixed (`package.json` `test:server` memory flag), validated pass |
| W14-F002 | P1 | cloud + onprem | load short-profile execution | k6 CSV path resolution mismatch | fixed in `tests/load/k6-app-2000.js`, validated |
| W14-F003 | P1 | cloud + onprem | load auth accounting | session cookie name handling too narrow | fixed in `tests/load/k6-app-2000.js`, validated |
| W14-F004 | P1 | onprem | load learner policy path | expected onprem non-prod learner block counted as failure | fixed in `tests/load/k6-app-2000.js`, validated |
| W14-F005 | P1 | cloud + onprem | load wave practicality | short-wave thresholds/gates not profile-aware | fixed via profile-aware thresholds + docs/scripts |
| W14-F006 | P1 | onprem | schema contract validation | stale onprem contract baseline | fixed (`contracts/schema/onprem-contract.*`), validated |

## Changes Made
- `client/src/components/QuizAdminLayout.tsx`
- `package.json`
- `tests/load/k6-app-2000.js`
- `tests/load/README.md`
- `contracts/schema/onprem-contract.env`
- `contracts/schema/onprem-contract.json`
- `server/tests/courseLesson.integration.test.ts`
- `server/tests/sessionAuth.integration.test.ts`
- `docs/testing/BROKEN_ROLE_JOURNEY_REGISTER.md`

## Validation Executed
- `npm run -s check` -> pass
- `npm run -s schema:contract:validate:onprem` -> pass
- `npm run -s migration:drift:check` -> pass
- `npm run -s test:server` -> pass (`35/35` suites, `158/158` tests)
- UX sweeps:
  - cloud: `P0=0 P1=0 P2=0`
  - onprem (development policy-aware): `P0=0 P1=0 P2=0`
- Load short profile reruns:
  - cloud: pass (`k6-short-cloud-summary-rerun2.json`)
  - onprem: pass (`k6-short-onprem-summary-rerun2.json`)

## Residual Risk
- Full long-running `app2000` soak (default profile) remains a scheduled non-wave activity due runtime duration; no active functional blockers in this wave.

## Reusable Screenshot-Analysis Prompt Template
```text
Analyze this LearnPlay role-journey evidence set for <variant> / <role>.
Return: P0/P1/P2 findings only, with journey stage (entry/auth/core/error/recovery/exit),
exact evidence file path, probable root-cause area, and regression test to add.
If no findings, return exactly: "No findings".
```

## Manual User Test Steps
1. Login on `https://stcloud.learnplay.co.za` as `superadmin`, `orgadmin`, `teacher`, `student`; verify key route access and deny routes.
2. Login on `https://stonprem.learnplay.co.za` as `custsuper`, `orgadmin`, `teacher`; verify onprem-specific route access and deny routes.
3. Confirm no display-currency modal interrupts navigation.
4. Run `npm run -s test:server` and confirm all suites pass.
5. Run short load checks and confirm pass:
   - `npm run -s load:test:appshort:cloud:devsafe`
   - `npm run -s load:test:appshort:onprem:devsafe`
