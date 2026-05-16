# LearnPlay Cloud Update Guide

## Scope
This guide is for LearnPlay developers/operators updating Cloud runtime hosts.

Cloud packages are the single delivery artifact for both:
- fresh installs
- in-place updates

## Developer Build (from dev workspace)
Build a new Cloud package whenever anything changes (app, migrations, scripts, lppadmin, assets).

Use:
```bash
sudo lppadmin cloud
```

Then:
1. `Build and Deployment`
2. `Build and package cloud installer`

Output artifact pattern:
- `LP-CL-V<major>.<minor>.<patch>.tar.gz`
- `LP-CL-V<major>.<minor>.<patch>.tar.gz.sha256`
- `learnplay-cloud.tar.gz` symlink (latest)

## What the package contains
The packaged `dist-cloud` contains all runtime parts required for a working update:
- `server/`
- `client/`
- `scripts/` (including `update.sh` and `lppadmin.sh`)
- `migrations/`
- `data/`
- `uploads/` runtime assets
- `version.json`
- `release-manifest.json`
- `package-inventory.txt`
- checksum manifest

## Update a Cloud host (existing installation)
1. Copy package to target host:
```bash
scp LP-CL-V<major>.<minor>.<patch>.tar.gz lppadmin@<host>:/tmp/
```

2. Extract on target host:
```bash
cd /tmp
tar xzf LP-CL-V<major>.<minor>.<patch>.tar.gz
```

3. Apply update from target host lppadmin:
```bash
sudo lppadmin
```
Then:
1. `Manage Cloud system`
2. `Maintenance Administration`
3. `Apply update package`

Updater automatically resolves `dist-cloud` from:
- `/tmp/dist-cloud`
- `/tmp/dist-cloud-*`
- or `LEARNPLAY_DIST_DIR` (if set)

## Fresh install on clean host
Use `master-install.sh` from extracted `dist-cloud/scripts/`.

## Safety gates (enforced)
Before update starts, updater hard-fails if:
- `release-manifest.json` missing
- package `product` is not `cloud`
- manifest version mismatches `version.json`
- installed version is below `minSupportedVersion`
- required package paths are missing

## Rollback model
Updater creates backup first, then updates.
If startup/health fails, updater follows rollback path and restores previous state from backup.

## Operator checklist
Before update:
- confirm package checksum
- confirm backup target has free space
- schedule maintenance window

After update:
- verify `sudo lppadmin` works
- verify application health
- verify core flows (auth, content load, payments)
