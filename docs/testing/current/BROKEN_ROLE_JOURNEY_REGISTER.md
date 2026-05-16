# Broken Role Journey Register

Last updated: 2026-04-14
Scope: cloud + onprem dev systems

## Sequencing Rule
Each item follows this order: `document -> root-cause -> fix -> validate -> close`.

## Active Items
| ID | Variant | Role | Journey/Route | Severity | Root Cause | Status |
|---|---|---|---|---|---|---|
| None | - | - | - | - | - | No open role-journey findings in current wave |

## Recently Closed
| ID | Variant | Role | Journey/Route | Evidence |
|---|---|---|---|---|
| RJ-C001 | cloud + onprem | orgadmin/student | dashboard render flows | `OrgAdminDashboard` + `StudentDashboard` hook-order fixes deployed in latest dev packages |
| RJ-C002 | cloud + onprem | all authenticated admin roles | currency onboarding modal interruption | `client/src/components/QuizAdminLayout.tsx`, UX sweeps `live-ux-cloud-2026-04-13T22-06-43-886Z`, `live-ux-onprem-2026-04-13T22-08-21-470Z` |
| RJ-C003 | cloud + onprem | API/data/security quality gate | stale onprem contract baseline | `contracts/schema/onprem-contract.env`, `contracts/schema/onprem-contract.json`, `npm run -s schema:contract:validate:onprem` |
| RJ-C004 | cloud + onprem | engineering release gate | server test OOM in default run | `package.json` (`test:server`), `npm run -s test:server` now passing (`35/35` suites) |
| RJ-C005 | cloud + onprem | load/concurrency validation | k6 load script path/cookie/policy handling false positives | `tests/load/k6-app-2000.js`, `package.json`, `tests/load/README.md`, `output/load/k6-short-*-summary-rerun2.json` |

## Validation Evidence Sources
1. Cloud UX sweep report: legacy live-browser sweep `live-ux-cloud-2026-04-13T22-06-43-886Z`
2. Onprem UX sweep report: legacy live-browser sweep `live-ux-onprem-2026-04-13T22-08-21-470Z`
3. Server regression gate: `npm run -s test:server` (`35 passed`, `158 tests`)
4. Load short profile summaries:
   - `output/load/k6-short-cloud-summary-rerun2.json`
   - `output/load/k6-short-onprem-summary-rerun2.json`

## Next Execution Order
1. Continue scheduled live-browser role sweeps for cloud + onprem on each deployment.
2. Keep load short profile in remediation loops; reserve full `app2000` profile for scheduled soak runs.
3. Keep role-journey register at zero-open baseline; reopen only with code-backed evidence.
