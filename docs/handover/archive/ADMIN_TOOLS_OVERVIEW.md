# Admin Tools Overview

Last updated: 2026-03-21

## 1. Purpose
This document explains the purpose and intended use of LearnPlay admin tooling at a high level.

## 2. `devadmin` (orchestration tool)
Primary location: `/antigravity/devadmin.sh`

Use `devadmin` for:
- Build and package workflows (`cloud` and `onprem` artifacts)
- Environment target management (ACC/PRD for each scope)
- SSH bootstrap for passwordless automation
- Remote update pipeline orchestration from STACK-DEV to target hosts
- Promotion-style workflows across ACC -> DEV -> PRD

Typical context:
- operated from `STACK-DEV`
- coordinates updates to:
  - cloud ACC
  - cloud PRD
  - onprem ACC
  - onprem PRD

## 3. `lppadmin` (runtime admin tool)
Primary context: run on target runtime hosts.

Use `lppadmin` for:
- runtime health/status checks
- service and environment checks
- runtime version checks
- patch/update and post-check operations
- system-level operational diagnostics

Typical context:
- run directly on each target host with sudo
- scope-aware operations (`cloud` vs `onprem`)

## 4. Related scripts
- `/antigravity/update-dev.sh`
  - local DEV runtime update pipeline for chosen scope.
- `/antigravity/update-acc.sh`
  - remote ACC update pipeline for chosen scope.
- `/antigravity/update-prd.sh`
  - remote PRD update pipeline for chosen scope.
- `/antigravity/scripts/devadmin/ssh-bootstrap.sh`
  - sets up key-based SSH and passwordless sudo for automation targets.
- `/antigravity/scripts/devadmin/validate-scope-isolation.sh`
  - validates cloud/onprem isolation guards in devadmin stack.

## 5. Which tool to use when
1. Building package artifacts:
- Use `devadmin`.

2. Deploying/update orchestration from STACK-DEV:
- Use `devadmin` update menus/commands.

3. Runtime verification and host-local operations:
- Use `lppadmin` on target host.

## 6. Safe usage rules
- Always specify target explicitly as:
  - cloud ACC
  - cloud PRD
  - onprem ACC
  - onprem PRD
- Never mix cloud aliases with onprem operations and vice versa.
- Never apply cloud package to onprem runtime or vice versa.
- On any failed installer/updater/bootstrap step, stop and request snapshot restore before retry.

## 7. Minimal command examples
- Validate devadmin scope isolation:
```bash
sudo devadmin validate-scope-isolation
```

- Show configured targets:
```bash
sudo devadmin env-show all
```

- Host-local health check example:
```bash
sudo lppadmin onprem health
```

