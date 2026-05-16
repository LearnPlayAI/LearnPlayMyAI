# Storage Functionality Testing

## About
This document defines test procedures for LearnPlay runtime storage behavior after database/log/cache path governance changes across cloud and onprem for DEV, ACC, and PRD.

Owner: Platform/Operations

## Functional Feature Index
- `STO-T01`: PostgreSQL data directory is variant-correct
- `STO-T02`: PostgreSQL log directory uses `/var/log/postgresql`
- `STO-T03`: PM2 logs are redirected to `/var/log/learnplay/pm2`
- `STO-T04`: Cache relocation is active
- `STO-T05`: Retention controls exist and are executable
- `STO-T06`: Restore tooling resolves correct data path
- `STO-T07`: lppadmin self-check exposes storage state

## Preconditions
- Target host is reachable with sudo access.
- Services are running (`postgresql`, LearnPlay app process).
- Mountpoints are present:
  - `/opt/lpdb`
  - `/var/log`
  - `/tmp`
- Snapshot exists before any remediating action.

## Required Test Data
- Runtime scope (`cloud` or `onprem`).
- Expected data path for target:
  - DEV stack host: `/opt/lpdb/shared/pg16/main`
  - ACC/PRD cloud: `/opt/lpdb/cloud/pg16/main`
  - ACC/PRD onprem: `/opt/lpdb/onprem/pg16/main`

## Detailed Test Steps

### STO-T01: PostgreSQL data directory
1. Run `sudo -u postgres psql -tAc "SHOW data_directory;"`.
2. Compare returned path to expected path for that host/scope.

Expected result:
- Returned value exactly matches expected target path.

### STO-T02: PostgreSQL log directory
1. Run `sudo -u postgres psql -tAc "SHOW log_directory;"`.

Expected result:
- Returned value is `/var/log/postgresql`.

### STO-T03: PM2 log redirection
1. Determine app user home (normally `/home/lppadmin`).
2. Run `readlink -f /home/lppadmin/.pm2/logs`.
3. Confirm `/var/log/learnplay/pm2` exists and is writable by app user.

Expected result:
- Symlink resolves to `/var/log/learnplay/pm2`.
- Directory exists with correct ownership.

### STO-T04: Cache relocation
1. Check `/home/lppadmin/.npmrc` contains `cache=/tmp/learnplay-cache/npm`.
2. Check `/etc/profile.d/learnplay-cache.sh` exports:
  - `NPM_CONFIG_CACHE=/tmp/learnplay-cache/npm`
  - `XDG_CACHE_HOME=/tmp/learnplay-cache/xdg`
3. Verify cache directories exist under `/tmp/learnplay-cache`.

Expected result:
- Cache configuration and directories are present and consistent.

### STO-T05: Retention controls
1. Verify files exist:
  - `/etc/logrotate.d/learnplay`
  - `/etc/logrotate.d/learnplay-admin`
  - `/etc/logrotate.d/postgresql-learnplay`
  - `/usr/local/bin/learnplay-storage-maintenance.sh`
  - `/etc/cron.daily/learnplay-storage-maintenance`
2. Run dry-run checks:
  - `sudo logrotate --debug /etc/logrotate.d/learnplay`
  - `sudo logrotate --debug /etc/logrotate.d/postgresql-learnplay`

Expected result:
- All files exist.
- Logrotate debug runs without syntax errors.

### STO-T06: Restore path resolution safety
1. Inspect `db-restore.sh` on the runtime host.
2. Confirm fallback logic is variant/shared aware (not generic `/opt/lpdb` only).
3. Optionally run a restore dry-run path validation in maintenance window.

Expected result:
- Restore script resolves PG data path safely and scope-correctly.

### STO-T07: lppadmin storage visibility
1. Run `sudo lppadmin self-check` (or runtime-local lppadmin script).
2. Verify output includes:
  - `POSTGRES_DATA_DIRECTORY=...`
  - `POSTGRES_LOG_DIRECTORY=...`

Expected result:
- Both fields appear and reflect current runtime state.

## Negative and Edge Cases
- If PostgreSQL is temporarily down, restore logic still resolves configured data path from config/fallback order.
- If a host uses the internal DEV shared layout, checks must accept `/opt/lpdb/shared/pg16/main`.
- If PM2 log symlink is missing, test must fail and remediation is required before signoff.
- If `pm2-logrotate` is still installed, remove it to avoid dual-rotation conflicts.

## Change Summary
- 2026-03-23: Added full storage-governance test suite for database/log/cache path controls, restore safety, and operator self-check validation across DEV/ACC/PRD and cloud/onprem scopes.
