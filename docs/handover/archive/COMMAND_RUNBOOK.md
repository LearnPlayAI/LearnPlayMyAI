# Command Runbook (Copy/Paste)

Status: MUST use for repeatable operations
Last updated: 2026-04-27 00:00 SAST

## 1. Validate local DEV runtime baseline
```bash
sudo lppadmin cloud runtime-version
sudo lppadmin onprem runtime-version
sudo lppadmin cloud health
sudo lppadmin onprem health
```

## 2. Verify workspace source state
```bash
git -C /antigravity status --short
git -C /antigravity log --oneline -n 12
```

## 3. Verify host package baseline
```bash
dpkg-query -W -f='${Package} ${Version}\n' nodejs npm nginx postgresql-16 openssl libreoffice poppler-utils
```

## 4. Validate podcast/source-content regressions after code updates
```bash
cd /antigravity/Cloud-On-Prem && npm run -s check
```

Codex WSL local test runner note:
```bash
cd /antigravity/Cloud-On-Prem
/home/lppadmin/.nvm/versions/node/v20.20.2/bin/node node_modules/jest/bin/jest.js --runInBand client/src/tests/example.test.ts
```

Do not use the bundled Windows Codex Node runtime for repo Jest runs from WSL. It resolves the repo through `\\wsl.localhost\...` and can make Jest fail to find `ts-jest/presets/default-esm`.

Functional verification checklist (UI/API):
1. Open lesson source-content modal and validate version switch hydration.
2. Save source-content edit and confirm new version appears.
3. Compare two versions and confirm diff highlights render.
4. Start podcast wizard on lesson with PPTX and ensure PPTX transcript path is used (no hidden Source DB fallback).
5. Save draft, navigate steps, reload, confirm same active draft continuity.

## 5. Optional runtime logs (when diagnosing failures)
```bash
sudo journalctl -u learnplay-cloud -n 200 --no-pager
sudo journalctl -u learnplay-onprem -n 200 --no-pager
```

## 6. Live test monitoring (user-driven sessions)
Use when user says they are testing live and asks AI to monitor.

Runtime log tail (choose target variant):
```bash
# cloud runtime (live tail)
sudo journalctl -u learnplay-cloud -f --no-pager

# onprem runtime (live tail)
sudo journalctl -u learnplay-onprem -f --no-pager
```

App log fallback (if service logs are redirected to file):
```bash
# adjust path per runtime deployment layout if needed
sudo tail -f /opt/learnplay/cloud/logs/app.log
sudo tail -f /opt/learnplay/onprem/logs/app.log
```

Database inspection (PostgreSQL examples):
```bash
# list latest table updates by timestamp columns where available
sudo -u postgres psql -d learnplay -c "SELECT NOW();"

# example pattern: inspect most recent rows for a known table
sudo -u postgres psql -d learnplay -c "SELECT * FROM users ORDER BY updatedAt DESC NULLS LAST, createdAt DESC NULLS LAST LIMIT 20;"
```

Code-flow tracing during test:
1. Map user step to expected endpoint/handler/service path.
2. Correlate timestamped log entries and DB changes to that path.
3. Record anomalies (missing logs, unexpected query shape, state mismatch).

Session closeout when user says "done":
1. Consolidate findings from logs + DB + code-flow.
2. Analyze attached screenshots/comments from user.
3. Return prioritized recommendations and next-step options.

## 7. Failure protocol (MUST)
If installer/update/bootstrap fails:
1. stop,
2. request snapshot restore for affected target,
3. continue only after restore confirmation.
