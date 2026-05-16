# Storage Functionality

## About
This document defines LearnPlay storage behavior for database-related files, log files, and runtime growth-control paths across cloud and onprem system variants for DEV, ACC, and PRD.

Owner: Platform/Operations

## Functional Feature Set
- `STO-F01`: PostgreSQL data directory placement on `/opt/lpdb`
- `STO-F02`: PostgreSQL text log placement on `/var/log/postgresql`
- `STO-F03`: PM2 log placement on `/var/log/learnplay/pm2`
- `STO-F04`: Runtime cache/temp relocation to `/tmp/learnplay-cache`
- `STO-F05`: Log rotation and storage-maintenance automation
- `STO-F06`: Restore/DR path-resolution safety
- `STO-F07`: Installer/updater/admin guardrails to prevent regression

## Current Behavior

### STO-F01: PostgreSQL data directory placement
- Cloud target data path: `/opt/lpdb/cloud/pg16/main`
- Onprem target data path: `/opt/lpdb/onprem/pg16/main`
- Internal DEV stack-host shared exception: `/opt/lpdb/shared/pg16/main`
- PostgreSQL data/rollback/WAL growth is constrained to the `/opt/lpdb` mount.

### STO-F02: PostgreSQL text logs on `/var/log`
- PostgreSQL `log_directory` is set to `/var/log/postgresql`.
- Database text logs are separated from database data files and root filesystem hot paths.

### STO-F03: PM2 logs on `/var/log/learnplay/pm2`
- PM2 logs are centralized under `/var/log/learnplay/pm2`.
- `~/.pm2/logs` is symlinked to `/var/log/learnplay/pm2`.
- PM2 native `pm2-logrotate` module is removed in favor of OS logrotate policy.

### STO-F04: Cache/temp relocation to `/tmp`
- npm/XDG runtime caches are set to:
  - `/tmp/learnplay-cache/npm`
  - `/tmp/learnplay-cache/xdg`
- Profile exports and `.npmrc` are configured to keep cache growth off persistent root/home paths.

### STO-F05: Retention controls
- OS logrotate policies are defined for:
  - `/var/log/learnplay/*.log`
  - `/var/log/learnplay-admin/*.log`
  - `/var/log/postgresql/*.log`
- Daily maintenance script removes stale temporary cache artifacts under `/tmp/learnplay-cache`.

### STO-F06: Restore/DR safety
- `db-restore.sh` now resolves PostgreSQL data directory in safe order:
  1. `LEARNPLAY_PGDATA`
  2. live `SHOW data_directory`
  3. configured `postgresql.conf` value
  4. variant-safe fallback path
- DEV DR tooling recognizes scoped/shared lpdb layouts, including `/opt/lpdb/shared`.

### STO-F07: Regression prevention in operational tooling
- `install-deps.sh` (cloud/onprem) creates/owns/enforces new storage paths.
- `master-install.sh` (cloud/onprem) validates required directories and reports variant-correct DB path in summary.
- `app-install.sh` / `update.sh` enforce PM2 log directory preparation.
- `lppadmin.sh self-check` now reports:
  - `POSTGRES_DATA_DIRECTORY`
  - `POSTGRES_LOG_DIRECTORY`

## Environment-Specific Behavior

### DEV
- Internal stack host supports both cloud and onprem runtimes on one host.
- PostgreSQL data directory may be shared: `/opt/lpdb/shared/pg16/main`.

### ACC
- Cloud runtime data directory: `/opt/lpdb/cloud/pg16/main`
- Onprem runtime data directory: `/opt/lpdb/onprem/pg16/main`

### PRD
- Cloud runtime data directory: `/opt/lpdb/cloud/pg16/main`
- Onprem runtime data directory: `/opt/lpdb/onprem/pg16/main`

## Rules and Constraints
- All database growth files must remain on `/opt/lpdb` (not `/` root paths).
- Log growth files must remain on `/var/log`.
- Installation files, binaries, and static configs are not moved into `/opt/lpdb`.
- No direct source-code fixing on remote ACC/PRD hosts; permanent fixes are source-driven from DEV.

## Integrations
- PostgreSQL service (`SHOW data_directory`, `SHOW log_directory`) for runtime validation.
- `lppadmin` self-check for operational visibility.
- `devadmin` target orchestration for cross-environment rollout/verification.
- Installer/update scripts (`install-deps`, `master-install`, `app-install`, `update`, `db-restore`).
- DR scripts (`restore-dev-bundle.sh`, `postcheck-dev-restore.sh`).

## Assumptions
- Required mounts exist and are writable:
  - `/opt/lpdb`
  - `/var/log`
  - `/tmp`
- Snapshots are taken before invasive storage-path changes.
- No active user load during migration windows.

## Out of Scope
- Partition resizing or OS-level mount creation.
- PostgreSQL major version upgrade.
- Backup retention policy redesign outside storage path alignment.

## Change Summary
- 2026-03-23: Introduced storage governance for all variants/tracks to keep DB growth on `/opt/lpdb`, logs on `/var/log`, and caches on `/tmp`; added installer/updater/admin/restore/DR guardrails and cross-environment rollout validation outcomes.
