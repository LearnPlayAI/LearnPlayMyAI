# Release State

Last updated: 2026-04-28
Scope: both

## Current Known-Good Matrix
| Target | Installed Version | Build Date | Runtime Commit | Last Good Package | Last Update Status | Last Verified At |
|---|---|---|---|---|---|---|
| cloud DEV | LP-CL-V1.00.063 | 2026-03-27T08:49:21Z | 4843148 | LP-CL-V1.00.063 | PASS | 2026-03-27 10:52 SAST |
| onprem DEV | LP-OP-V1.00.073 | 2026-03-27T08:49:38Z | unknown | LP-OP-V1.00.073 | PASS | 2026-03-27 10:52 SAST |
| cloud ACC | pending | pending | pending | pending | PENDING | pending |
| cloud PRD | pending | pending | pending | pending | PENDING | pending |
| onprem ACC | pending | pending | pending | pending | PENDING | pending |
| onprem PRD | pending | pending | pending | pending | PENDING | pending |

## Snapshot Policy
- Snapshot restore owner: operator/user.
- If installer, updater, or bootstrap fails on any target, stop and request snapshot restore before retry.
- Do not continue promotion after any failed acceptance criterion.

## Acceptance Criteria
ACC acceptance requires:
- update completes without critical errors
- runtime version reports expected version
- health checks pass
- basic login/admin smoke passes
- no unresolved blockers in handoff state

PRD acceptance requires:
- ACC acceptance passed for the same package lineage
- PRD update completes cleanly
- runtime version and health checks pass
- core user flow smoke passes
- release state and handover docs updated

