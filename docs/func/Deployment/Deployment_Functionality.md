# Deployment Functionality

## About
This document describes how LearnPlay deployment packaging and environment updates are expected to work through `devadmin` for DEV, ACC, and PRD across cloud and onprem scopes.

## Functional Feature Set
- `DEP-F01`: Build package versioning and artifact selection
- `DEP-F02`: DEV update package resolution
- `DEP-F03`: ACC/PRD update package consistency
- `DEP-F04`: Cross-environment version parity expectations
- `DEP-F05`: Alias-based non-interactive remote execution
- `DEP-F06`: One-click environment rollout
- `DEP-F07`: GitHub-scoped tooling sync and rollout controls
- `DEP-F08`: Dynamic runtime memory and pool tuning at service start

## Current Behavior

### DEP-F01: Build artifact naming
- Cloud packages use `LP-CL-V...tar.gz`.
- Onprem packages use `LP-OP-V...tar.gz`.
- These are the canonical release package families for promotion/update pipelines.

### DEP-F02: DEV update package resolution
- DEV update now resolves packages from canonical `LP-*` prefixes by scope:
  - cloud: `LP-CL-V*`
  - onprem: `LP-OP-V*`
- DEV update rejects package names that do not match the selected scope prefix.
- If a package name is passed as a basename, it is resolved from the scope package directory.

### DEP-F03: ACC/PRD consistency
- ACC and PRD update flows already use the canonical `LP-*` package prefixes.
- DEV now uses the same prefix model, preventing accidental legacy package selection and version skew.

### DEP-F04: Version parity interpretation
- When DEV, ACC, and PRD are all updated from the same `LP-*` package line for a scope, LearnPlay component version parity should match.
- If DEV remains on legacy runtime version while ACC/PRD are on `LP-*`, parity check reports mismatch by design.

### DEP-F05: Alias-based remote execution (ACC/PRD, cloud/onprem)
- Remote interactions must use Environment Target SSH aliases for ACC/PRD operations (for example `acc-cloud-devadmin`, `prd-onprem-devadmin`), even if stored target hosts are raw hostnames.
- Remote SSH/SCP execution is non-interactive by default (no terminal password prompts).
- If key-based alias auth fails, tooling reports a non-interactive auth failure and requires fixing Environment Targets/SSH bootstrap.
- Password fallback may be used only through configured stored credentials (`sshpass`), never through interactive prompts.

### DEP-F06: One-click rollout from Cross-Environment
- Cross-Environment now supports a one-click rollout for the active scope:
  - DEV: build + update
  - ACC: deploy the same package with no build
  - PRD: deploy the same package with no build
- This guarantees the same package version is promoted through DEV -> ACC -> PRD for that scope.
- The feature also records the package as the tested default for that scope.

### DEP-F07: GitHub-scoped tooling sync and rollout controls
- DEV host is authoritative source for tooling/runtime code.
- GitHub is backup storage for committed/pushed code.
- Preferred GitHub sync order for tool maintenance is:
  - push latest local committed DEV state first,
  - then pull latest on DEV,
  - then build/deploy from DEV packages.
- If the DEV working tree has uncommitted changes when a GitHub sync/update option is executed, `devadmin` must:
  - warn that GitHub is behind latest DEV source state,
  - offer a proceed option for automatic local backup (`commit + push`),
  - continue the sync workflow after successful backup.
- Menu placement outcomes:
  - `GitHub Management -> 10) Scoped devadmin sync and update`: sync GitHub and refresh `devadmin` on STACK DEV only.
  - `<Cloud|OnPrem> -> Build & Artifacts -> 5) Scoped lppadmin sync`: updates `lppadmin` only on scoped DEV/ACC/PRD.
  - `<Cloud|OnPrem> -> Build & Artifacts -> 6) Scoped full update (sync GitHub + build/deploy DEV)`: full update on DEV only.
  - `<Cloud|OnPrem> -> Build & Artifacts -> 7) Scoped full update (deploy ACC from latest DEV build, no GitHub sync)`: full update on ACC only from latest scoped DEV build artifact.
  - `<Cloud|OnPrem> -> Build & Artifacts -> 8) Scoped full update (sync GitHub + build/deploy DEV + deploy ACC, no PRD)`: one-build DEV->ACC rollout path that intentionally does not deploy PRD.
  - `<Cloud|OnPrem> -> Build & Artifacts -> 9) Scoped full update (deploy PRD from latest DEV build, no GitHub sync)`: full update on PRD only from latest scoped DEV build artifact.
  - `<Cloud|OnPrem> -> Build & Artifacts -> 10) Scoped full update (sync GitHub + build once on DEV + deploy DEV->ACC->PRD)`: one build used for DEV, ACC, and PRD deployment.
- Non-DEV hosts (cloud/onprem ACC/PRD) must receive tool updates from DEV-generated packages only.
- `lppadmin(v2)` on non-DEV hosts must never be used to access GitHub/source repository content.

### DEP-F08: Dynamic runtime memory and pool tuning at service start
- Cloud and onprem install/update flows now provision a runtime tuning script at:
  - `/opt/learnplay/cloud/bin/runtime-tuning-env.sh`
  - `/opt/learnplay/onprem/bin/runtime-tuning-env.sh`
- Systemd service startup sources `.env` first, then sources the runtime tuning script, then starts Node.
- The tuning script recalculates values on each service start/restart (including host reboot), using current host RAM/CPU:
  - `NODE_OPTIONS` (injects `--max-old-space-size=<dynamic_mb>`)
  - `MAX_OLD_SPACE_SIZE`
  - `ENABLE_OPTIMIZED_POOL`
  - `DB_POOL_MAX`, `DB_POOL_MIN`
  - `SESSION_POOL_MAX`, `SESSION_POOL_MIN`
- Slot-aware behavior:
  - If both LearnPlay services exist on the host, memory/pool budget is divided across active app slots.
  - Override available with `LEARNPLAY_HOST_APP_SLOTS=<n>`.
- Safety and control:
  - Dynamic tuning is enabled by default.
  - Set `LEARNPLAY_DYNAMIC_TUNING=false` in `.env` to disable dynamic runtime tuning for that host.
- Operational outcome:
  - Prevents stale static memory sizing when VM allocations change.
  - Reduces Node OOM risk from default heap limits.
  - Keeps app pool sizing aligned to current runtime capacity.

## Integration Points
- `devadmin` menus for build/update/promote
- `/antigravity/update-dev.sh`
- `/antigravity/update-acc.sh`
- `/antigravity/update-prd.sh`
- Version parity checks in `devadmin`

## Change Summary
- 2026-03-22: Fixed DEV updater package selection to use canonical `LP-*` prefixes and added scope-prefix validation to prevent legacy artifact deployment drift.
- 2026-03-22: Hardened remote target execution to prefer SSH aliases and non-interactive auth for ACC/PRD cloud+onprem operations.
- 2026-03-22: Added one-click Cross-Environment rollout (DEV build+update, ACC no-build deploy, PRD no-build deploy) per scope.
- 2026-03-22: Added source-of-truth policy coverage (DEV authoritative, GitHub backup-only, non-DEV package-only tool updates).
- 2026-03-22: Updated GitHub tools sync behavior to warn on uncommitted DEV changes and allow in-flow automatic backup before continuing option 10.
- 2026-03-22: Moved scoped lppadmin/full rollout actions from GitHub Management into each scope's Build & Artifacts submenu (options 5 and 6), keeping GitHub Management option 10 for DEV-only devadmin sync/update.
- 2026-03-22: Enforced alias-first execution for all remote ACC/PRD operations in devadmin and updater scripts (cloud/onprem), preventing direct-host SSH paths.
- 2026-03-22: Expanded Build & Artifacts full-update controls with separate DEV-only, ACC-only, PRD-only, and build-once DEV->ACC->PRD options; clarified no-GitHub-sync behavior for ACC/PRD deploy-only actions.
- 2026-03-23: Added Build & Artifacts DEV->ACC rollout option (sync GitHub + build/deploy DEV + deploy ACC, no PRD) and shifted downstream numbering so PRD-only deploy is option 9 and full-chain rollout is option 10.
- 2026-04-24: Added dynamic runtime memory/pool tuning contract for cloud+onprem install/update systemd flows so Node heap and DB/session pools are recalculated at every service start/reboot based on host resources.
