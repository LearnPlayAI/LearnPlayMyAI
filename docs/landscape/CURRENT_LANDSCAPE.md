# Current LearnPlay Landscape

Last updated: 2026-04-28
Scope: both

## Canonical Roots
- Source workspace: `/antigravity/Cloud-On-Prem`
- Documentation root: `/antigravity/docs`
- Archive root for retired repository-local docs: `/antigravity/docs/archive/repo-docs`

## DEV Host Execution Contract
- STACK-DEV/Codex Desktop uses WSL/Linux as the execution environment for the LearnPlay workspace.
- Run project Node tooling from WSL: `node`, `npm`, `npx`, Jest, TypeScript, package builds, and `scripts/dev-workspace/local-apps.sh`.
- Do not run LearnPlay repo tests with Windows-native Node or the bundled Codex Windows runtime from `C:\Users\...\codex-runtimes`; it can resolve the workspace as `\\wsl.localhost\...` and break Jest/ts-jest resolution.
- If shell Node tooling is missing, activate/install WSL Node with `bash scripts/dev-workspace/bootstrap-wsl-dev.sh node`. Current known WSL Node path: `/home/lppadmin/.nvm/versions/node/v20.20.2/bin/node`.

## Platform Tracks
- `STACK-DEV`: development control plane and build/runtime host.
- `cloud DEV`: `https://stcloud.learnplay.co.za`
- `cloud ACC`: `https://acccl.learnplay.co.za`
- `cloud PRD`: `https://learnplay.co.za`
- `onprem DEV`: `https://stonprem.learnplay.co.za`
- `onprem ACC`: `https://accop.learnplay.co.za`
- `onprem PRD`: `https://prdop.learnplay.co.za`
- Reverse proxy: `caddy-prd`, endpoint `crp.learnplay.co.za`

## Runtime Paths
- Cloud app root: `/opt/learnplay/cloud`
- Onprem app root: `/opt/learnplay/onprem`
- Cloud uploads: `/opt/learnplay/cloud/uploads`
- Onprem uploads: `/opt/learnplay/onprem/uploads`

## Access And Scope Discipline
- Use explicit target labels: `cloud DEV`, `cloud ACC`, `cloud PRD`, `onprem DEV`, `onprem ACC`, `onprem PRD`.
- Do not mix cloud and onprem SSH aliases, packages, runtime roots, uploads, or release checks.
- Standard remote runtime user on app hosts: `lppadmin`.
- Approved remote aliases from STACK-DEV:
  - `acc-cloud-devadmin`
  - `prd-cloud-devadmin`
  - `acc-onprem-devadmin`
  - `prd-onprem-devadmin`

## Install And Config Invariants
- Admin user: `support@learnplay.co.za`
- Timezone: `Africa/Johannesburg`
- Reverse proxy mode: Behind Caddy
- API keys and DB passwords are generated/random per install.
- ACC system type: QA/Testing.
- PRD system type: Production.
- Onprem ACC org name: `LearnPlay ACC OP`.
- Onprem PRD org name: `LearnPlay PRD OP`.

## Runtime Memory And Pool Tuning
- Cloud and onprem services dynamically tune runtime memory and DB/session pools at process start.
- Tuning scripts:
  - `/opt/learnplay/cloud/bin/runtime-tuning-env.sh`
  - `/opt/learnplay/onprem/bin/runtime-tuning-env.sh`
- Restarts recalculate heap and pool limits from current host resources.
- Disable per host with `LEARNPLAY_DYNAMIC_TUNING=false`.
- Override app slot count with `LEARNPLAY_HOST_APP_SLOTS=<n>`.
