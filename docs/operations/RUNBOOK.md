# LearnPlay Operations Runbook

Last updated: 2026-04-28
Scope: both

## Baseline Checks
Validate local DEV runtime baseline:

```bash
sudo lppadmin cloud runtime-version
sudo lppadmin onprem runtime-version
sudo lppadmin cloud health
sudo lppadmin onprem health
```

Verify workspace source state:

```bash
git -C /antigravity status --short
git -C /antigravity log --oneline -n 12
```

Verify host package baseline:

```bash
dpkg-query -W -f='${Package} ${Version}\n' nodejs npm nginx postgresql-16 openssl libreoffice poppler-utils
```

## Failure Signatures
- Local `80/443` closed on runtime host can be valid in Behind Caddy mode; verify Caddy routing and external URL health first.
- Scope mismatch means cloud/onprem alias, package, runtime path, or target was mixed; correct target and rerun preflight.
- SSH passwordless errors require scope-correct bootstrap from STACK-DEV.
- Package scope mismatch must fail closed.

## Snapshot And Retry Rule
Retry after installer, updater, or bootstrap failure is not allowed until snapshot restore is completed and confirmed, unless the operator explicitly confirms no mutation occurred and immediate retry is safe.

## Documentation Rules
- Update `/antigravity/docs/handover/RELEASE_STATE.md` after release/update sessions.
- Update `/antigravity/docs/changelog/CURRENT_CHANGELOG.md` and compatibility changelog path when release-note-visible changes complete.
- Keep operational detail current; archive stale runbooks under `/antigravity/docs/operations/archive/`.

