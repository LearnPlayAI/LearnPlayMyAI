# Technical Landscape

Last updated: 2026-03-21
Owner: LearnPlay platform operations

## 1. Platform Tracks

### STACK-DEV
- Role: development control plane and build/runtime host for both variants.
- Hostname: `learnplay-stack-dev`
- Static IP: `192.168.89.40`
- Usage:
  - source code workspace
  - package builds
  - orchestration via `devadmin`
  - bootstrap origin for passwordless SSH to remote targets

### cloud ACC
- Role: cloud acceptance/test runtime.
- Hostname: `acccl-learnplay`
- Static IP: `192.168.89.50`
- Primary URL: `https://acccl.learnplay.co.za`
- Ops alias URL/host: `acchost.learnplay.co.za`

### cloud PRD
- Role: cloud production runtime.
- Hostname: `prdcl-learnplay`
- Static IP: `192.168.89.60`
- Primary URL: `https://learnplay.co.za`
- Ops alias URL/host: `prdhost.learnplay.co.za`

### onprem ACC
- Role: onprem acceptance/test runtime for enterprise self-host use case.
- Hostname: `accop-learnplay`
- Static IP: `192.168.89.55`
- Primary URL: `https://accop.learnplay.co.za`
- Ops alias URL/host: `acconprem.learnplay.co.za`

### onprem PRD
- Role: onprem production runtime for enterprise self-host use case.
- Hostname: `prdop-learnplay`
- Static IP: `192.168.89.65`
- Primary URL: `https://prdop.learnplay.co.za`
- Ops alias URL/host: `prdonprem.learnplay.co.za`

### Reverse Proxy
- Role: dispatch + TLS certificate handling.
- Hostname: `caddy-prd`
- Static IP: `192.168.89.10`
- Endpoint: `crp.learnplay.co.za`

## 2. DNS and Alias Mapping Notes
- `STACK-DEV` also uses:
  - `stcloud.learnplay.co.za` (IP alias `192.168.89.41`)
  - `stonprem.learnplay.co.za` (IP alias `192.168.89.42`)
- Many public FQDNs resolve through Caddy (`192.168.89.10`) and are routed internally.

## 3. SSH Access Pattern (from STACK-DEV)
- Standard remote user on app hosts: `lppadmin`
- Scope-specific aliases expected:
  - `acc-cloud-devadmin`
  - `prd-cloud-devadmin`
  - `acc-onprem-devadmin`
  - `prd-onprem-devadmin`

Do not mix scope aliases.
- Wrong: using `acc-cloud-devadmin` for onprem ACC operations.
- Wrong: using `acc-onprem-devadmin` for cloud ACC operations.

## 4. Install/Config Invariants (all systems unless specified)
- Admin user: `support@learnplay.co.za`
- SMTP: do not use own SMTP
- API keys: random/generated values
- Reverse proxy mode: Behind Caddy
- DB password: random/generated per install
- Timezone: `Africa/Johannesburg`
- Default app ports: use defaults
- System type:
  - ACC = QA/Testing
  - PRD = Production
- Org names:
  - onprem ACC org name: `LearnPlay ACC OP`
  - onprem PRD org name: `LearnPlay PRD OP`

## 5. Scope-Specific URLs
- onprem ACC base URL: `accop.learnplay.co.za`
- onprem PRD base URL: `prdop.learnplay.co.za`
- cloud ACC base URL: `acccl.learnplay.co.za`
- cloud PRD base URL: `learnplay.co.za`

## 6. Operational Safety Contracts
1. Always identify target explicitly as one of:
- cloud ACC
- cloud PRD
- onprem ACC
- onprem PRD

2. Snapshot policy:
- On any failure in installer/updater/bootstrap on any target, stop and request snapshot restore before retry.

3. Health checks behind Caddy:
- Local ports `80/443` can appear closed on runtime hosts and still be valid in Behind Caddy mode.

## 7. Secrets Handling
- Do not store cleartext credentials in general handoff docs.
- Use `TECHNICAL_SECRETS_TEMPLATE.md` structure and keep filled version local/private.

## 8. Runtime Memory and Pool Tuning Contract
- LearnPlay cloud and onprem systemd services dynamically tune runtime memory and DB/session pools at process start.
- Dynamic tuning is executed by:
  - `/opt/learnplay/cloud/bin/runtime-tuning-env.sh`
  - `/opt/learnplay/onprem/bin/runtime-tuning-env.sh`
- The script runs on each start/restart (including after host reboot) and derives values from current host RAM/CPU.
- It exports:
  - `NODE_OPTIONS` with dynamic `--max-old-space-size`
  - `MAX_OLD_SPACE_SIZE`
  - `ENABLE_OPTIMIZED_POOL=true`
  - `DB_POOL_MAX`, `DB_POOL_MIN`
  - `SESSION_POOL_MAX`, `SESSION_POOL_MIN`
- Controls:
  - Default: dynamic tuning enabled.
  - Disable per host: `LEARNPLAY_DYNAMIC_TUNING=false`.
  - Manual slot override: `LEARNPLAY_HOST_APP_SLOTS=<n>`.
- Operator expectation:
  - Host memory changes no longer require static heap/pool rewrites to stay safe.
  - Restarting `learnplay-cloud` / `learnplay-onprem` applies recalculated runtime limits.
