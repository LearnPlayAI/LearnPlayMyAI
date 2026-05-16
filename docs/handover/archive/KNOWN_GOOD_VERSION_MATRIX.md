# Known-Good Version Matrix

Status: MUST maintain at end of each release/update session
Last updated: 2026-03-27 10:56 SAST

## Current Matrix
| Target | Installed Version | Build Date | Runtime Commit | Last Good Package | Last Update Status | Last Verified At |
|---|---|---|---|---|---|---|
| cloud DEV | LP-CL-V1.00.063 | 2026-03-27T08:49:21Z | 4843148 | LP-CL-V1.00.063 | PASS | 2026-03-27 10:52 SAST |
| onprem DEV | LP-OP-V1.00.073 | 2026-03-27T08:49:38Z | unknown | LP-OP-V1.00.073 | PASS | 2026-03-27 10:52 SAST |
| cloud ACC | not validated in this seat | pending | pending | pending | PENDING | pending |
| cloud PRD | not validated in this seat | pending | pending | pending | PENDING | pending |
| onprem ACC | not validated in this seat | pending | pending | pending | PENDING | pending |
| onprem PRD | not validated in this seat | pending | pending | pending | PENDING | pending |

## Notes
- Cloud and onprem DEV are healthy on this host.
- Onprem runtime metadata currently does not expose a commit hash in `runtime-version`; version/build date are authoritative for that target.
- ACC/PRD verification remains operator-driven after DEV pass.

## Update Rule
When any target is updated, immediately update this matrix with:
- actual installed version,
- exact package filename (if available),
- pass/fail result,
- verification timestamp.

