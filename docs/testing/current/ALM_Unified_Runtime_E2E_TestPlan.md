# ALM Unified Runtime E2E Test Plan

## Preconditions
1. Cloud runtime installed under `/opt/learnplay/cloud`.
2. Onprem runtime installed under `/opt/learnplay/onprem`.
3. `lppadmin` command installed: `/usr/local/bin/lppadmin`.
4. Update package extracted to `/tmp/dist-cloud` and `/tmp/dist-onprem` (or `LEARNPLAY_DIST_DIR` set).

## Test Steps
1. Run `sudo lppadmin cloud parity-report`.
Expected: report shows `RuntimeProduct: cloud`, manifest product `cloud`, provenance file path present.

2. Run `sudo lppadmin onprem parity-report`.
Expected: report shows `RuntimeProduct: onprem`, manifest product `onprem`, system type shown (if configured).

3. Run `sudo lppadmin cloud update-preflight`.
Expected: `Result: PASS` and checksum/manifest validation pass for cloud package.

4. Run `sudo lppadmin onprem update-preflight`.
Expected: `Result: PASS` and checksum/manifest validation pass for onprem package.

5. Negative product gate: point onprem updater at cloud package (`LEARNPLAY_DIST_DIR=/tmp/dist-cloud sudo /opt/learnplay/onprem/scripts/update.sh --component app-db --yes`).
Expected: preflight fails with manifest product mismatch; no runtime mutation.

6. Backup fallback check on host without `/lppbackups`: run `sudo lppadmin cloud backup-root-status` and `sudo lppadmin onprem backup-root-status`.
Expected: resolved backup root falls back to `/opt/lpdb/lppbackups/cloud` and `/opt/lpdb/lppbackups/onprem`.

7. Onprem lock mode check (unlicensed >30 days): attempt login as non-customer-super user.
Expected: login blocked with lock-mode message; customer super admin login still allowed.

8. Onprem tamper check: set system clock behind `lastValidatedAt` by >15 minutes (in controlled environment), attempt non-customer-super login.
Expected: remediation lock enforced; only customer super admin can login.

9. Branding gate (onprem unlicensed): call branding admin endpoint.
Expected: 403 with licensing/permission denial; app remains functional.

10. Full cloud update: `sudo lppadmin cloud update` and select full component.
Expected: DB backup created before mutation, transaction metadata written to backup folder, health check passes, provenance updated.

11. Full onprem update: `sudo lppadmin onprem update` and select full component.
Expected: DB backup created before mutation, transaction metadata written, health check passes, runtime marker stays `onprem`.

12. Retention guardrails: create >12 backups over multiple days/weeks, run an update.
Expected: updater applies retention policy (`7 daily + 4 weekly`), warns at >=80% disk usage, blocks at >=95%.

## Validation Artifacts
1. `/opt/learnplay/cloud/.runtime-identity.json`
2. `/opt/learnplay/onprem/.runtime-identity.json`
3. `/opt/learnplay/cloud/.release-provenance.json`
4. `/opt/learnplay/onprem/.release-provenance.json`
5. backup folder `backup_*/update-transaction.json`
