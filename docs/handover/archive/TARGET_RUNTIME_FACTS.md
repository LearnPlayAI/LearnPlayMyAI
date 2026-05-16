# Target Runtime Facts (Authoritative)

Status: MUST maintain
Last updated: 2026-03-27 10:56 SAST

## Runtime Facts Table
| Target | Scope | Runtime Root | Service Unit | App Port | DB Port | Health Command | Version Command | State |
|---|---|---|---|---:|---:|---|---|---|
| cloud DEV | cloud | /opt/learnplay/cloud | learnplay-cloud | 8000 | 5432 | `sudo lppadmin cloud health` | `sudo lppadmin cloud runtime-version` | healthy_local |
| onprem DEV | onprem | /opt/learnplay/onprem | learnplay-onprem | 9000 | 5432 | `sudo lppadmin onprem health` | `sudo lppadmin onprem runtime-version` | healthy_local |
| cloud ACC | cloud | remote host | remote unit | env-specific | 5432 (expected) | `sudo lppadmin cloud health` | `sudo lppadmin cloud runtime-version` | operator_managed |
| cloud PRD | cloud | remote host | remote unit | env-specific | 5432 (expected) | `sudo lppadmin cloud health` | `sudo lppadmin cloud runtime-version` | operator_managed |
| onprem ACC | onprem | remote host | remote unit | env-specific | 5432 (expected) | `sudo lppadmin onprem health` | `sudo lppadmin onprem runtime-version` | operator_managed |
| onprem PRD | onprem | remote host | remote unit | env-specific | 5432 (expected) | `sudo lppadmin onprem health` | `sudo lppadmin onprem runtime-version` | operator_managed |

## Installed Version Facts (Validated This Seat)
- cloud DEV
  - InstalledVersion: `LP-CL-V1.00.063`
  - BuildDate: `2026-03-27T08:49:21Z`
  - GitCommit: `4843148`
- onprem DEV
  - InstalledVersion: `LP-OP-V1.00.073`
  - BuildDate: `2026-03-27T08:49:38Z`
  - GitCommit: `unknown` (runtime metadata value)

## Host Package Facts (Local Host)
- nodejs: `18.19.1+dfsg-6ubuntu5`
- npm: `9.2.0~ds1-2`
- nginx: `1.24.0-2ubuntu7.6`
- postgresql-16: `16.13-0ubuntu0.24.04.1`
- openssl: `3.0.13-0ubuntu3.7`
- libreoffice: `4:24.2.7-0ubuntu0.24.04.4`
- poppler-utils: `24.02.0-1ubuntu9.8`

## Notes
1. This host runs both local DEV variants independently (cloud 8000, onprem 9000).
2. Caddy dispatch is external; no auto-dispatch assumptions should be made by app runtime.
3. ACC/PRD remain separate hosts and require operator-managed promotion.

