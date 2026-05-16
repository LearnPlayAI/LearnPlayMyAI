# Codex Desktop Master Prompt For Windows + WSL Take-On

You are taking over the LearnPlay Cloud-On-Prem development workspace on a Windows host using Codex Desktop with the agent and terminal set to WSL.

Project location inside WSL:

```text
/antigravity/Cloud-On-Prem
```

Important context:

- Treat `/antigravity` as the Git repository root.
- Treat `/antigravity/Cloud-On-Prem` as the app root.
- Use WSL/Linux commands, not PowerShell, for app setup, dev, tests, builds, and packaging.
- For visual local web checks, use Codex Desktop's built-in browser or workspace CDP browser flow. Follow `docs/dev/live-browser-qa.md`.
- Do not copy or invent secrets. Local `.env` files should contain development-only values.
- Preserve existing uncommitted changes. Do not reset, checkout, or revert unless explicitly asked.
- Cloud and onprem must both remain supported.

Your mission:

1. Inspect the workspace state.
2. Run the WSL bootstrap helper through OS/package/env/database preparation:

   ```bash
   cd /antigravity
   bash Cloud-On-Prem/scripts/dev-workspace/bootstrap-wsl-dev.sh doctor
   bash Cloud-On-Prem/scripts/dev-workspace/bootstrap-wsl-dev.sh apt
   bash Cloud-On-Prem/scripts/dev-workspace/bootstrap-wsl-dev.sh node
   bash Cloud-On-Prem/scripts/dev-workspace/bootstrap-wsl-dev.sh db
   bash Cloud-On-Prem/scripts/dev-workspace/bootstrap-wsl-dev.sh env
   bash Cloud-On-Prem/scripts/dev-workspace/bootstrap-wsl-dev.sh npm
   ```

3. Restore the DEV runtime data bundle if it is present. The user should copy `learnplay-runtime-data-*.tar.gz` into Windows Downloads or somewhere reachable from WSL. If the bundle exists, run:

   ```bash
   cd /antigravity
   bash Cloud-On-Prem/scripts/dev-workspace/restore-runtime-data.sh /path/to/learnplay-runtime-data-*.tar.gz
   ```

   This should restore:

   - cloud runtime DB into `learnplay_cloud_dev`
   - onprem runtime DB into `learnplay_onprem_dev`
   - cloud runtime files into `Cloud-On-Prem/uploads/cloud`
   - onprem runtime files into `Cloud-On-Prem/uploads/onprem`

   If no runtime data bundle is available, fall back to:

   ```bash
   bash Cloud-On-Prem/scripts/dev-workspace/bootstrap-wsl-dev.sh init-db cloud
   bash Cloud-On-Prem/scripts/dev-workspace/bootstrap-wsl-dev.sh init-db onprem
   ```

4. If any step fails, fix the smallest root cause in the setup script or local environment and rerun the failed step. Keep changes scoped.
5. Confirm both local variant envs exist:

   ```bash
   ls -la /antigravity/Cloud-On-Prem/.env.cloud.local /antigravity/Cloud-On-Prem/.env.onprem.local
   ```

6. Confirm both local databases are reachable:

   ```bash
   psql "postgresql://learnplay:learnplay_dev_password@localhost:5432/learnplay_cloud_dev" -c "select 1;"
   psql "postgresql://learnplay:learnplay_dev_password@localhost:5432/learnplay_onprem_dev" -c "select 1;"
   ```

7. Validate local code health:

   ```bash
   cd /antigravity/Cloud-On-Prem
   bash scripts/dev-workspace/bootstrap-wsl-dev.sh use cloud
   npm run -s migration:validate
   npm run -s check
   NODE_OPTIONS=--max-old-space-size=4096 npm run -s test:critical
   bash scripts/dev-workspace/bootstrap-wsl-dev.sh use onprem
   npm run -s migration:validate
   NODE_OPTIONS=--max-old-space-size=4096 npm run -s test:critical
   ```

8. Start and smoke both local apps:

   ```bash
   cd /antigravity/Cloud-On-Prem
   bash scripts/dev-workspace/local-apps.sh ensure
   bash scripts/dev-workspace/local-apps.sh status
   ```

   Use Codex Desktop's built-in browser or workspace CDP browser flow to open:

   ```text
   http://localhost:8010
   http://localhost:8020
   ```

   Check that both public pages render and unauthenticated routes are not broken.
   The local supervisor starts each variant with its own env file, so automatic
   restarts do not depend on whichever profile was last copied to `.env`.
   Do not install, invoke, or generate third-party browser automation tests for
   this local QA loop.

9. Restart both local apps after changes that are not covered by hot reload:

   ```bash
   cd /antigravity/Cloud-On-Prem
   bash scripts/dev-workspace/local-apps.sh restart
   ```

   To install the WSL/Codex Desktop autostart monitor:

   ```bash
   bash scripts/dev-workspace/install-local-apps-autostart.sh
   ```

10. Check package build readiness from WSL:

   ```bash
   cd /antigravity/Cloud-On-Prem
   bash scripts/dev-workspace/bootstrap-wsl-dev.sh build cloud
   bash scripts/dev-workspace/bootstrap-wsl-dev.sh build onprem
   ```

   If current packaging scripts still assume the old internal DEV runtime host, add a minimal explicit "WSL workstation package build" path. Do not weaken production/devadmin safety gates for real deployments.

11. Prepare Codex Desktop local environment actions if the app supports project actions on this host. Suggested actions:

    - Doctor: `bash scripts/dev-workspace/bootstrap-wsl-dev.sh doctor`
    - Use Cloud Env: `bash scripts/dev-workspace/bootstrap-wsl-dev.sh use cloud`
    - Use Onprem Env: `bash scripts/dev-workspace/bootstrap-wsl-dev.sh use onprem`
    - Start/ensure both local apps: `bash scripts/dev-workspace/local-apps.sh ensure`
    - Restart both local apps: `bash scripts/dev-workspace/local-apps.sh restart`
    - Local app status: `bash scripts/dev-workspace/local-apps.sh status`
    - Install local app autostart monitor: `bash scripts/dev-workspace/install-local-apps-autostart.sh`
    - Check: `bash scripts/dev-workspace/bootstrap-wsl-dev.sh check`
    - Critical Tests: `bash scripts/dev-workspace/bootstrap-wsl-dev.sh test-critical`
    - Build Cloud Package: `bash scripts/dev-workspace/bootstrap-wsl-dev.sh build cloud`
    - Build Onprem Package: `bash scripts/dev-workspace/bootstrap-wsl-dev.sh build onprem`

Completion criteria:

- The workspace is usable from Codex Desktop in WSL mode.
- `npm install` has completed inside WSL.
- Cloud and onprem local DBs exist and are migrated.
- Cloud and onprem local env files exist.
- Cloud and onprem local servers can start on separate ports.
- Static checks and critical tests have either passed or have clearly documented existing blockers.
- Cloud and onprem package build readiness has been verified or the remaining blocker is precisely documented.
- No secrets from the old host were copied into the new host.

Report back with:

- What completed.
- Any files changed.
- Commands that passed.
- Commands that failed, with exact next steps.
- How to start cloud and onprem development servers going forward.
