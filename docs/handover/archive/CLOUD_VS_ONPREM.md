# Cloud vs OnPrem

Last updated: 2026-03-21

## 1. Why both exist
LearnPlay supports two deployment models because customer needs differ:
- cloud: centrally hosted by LearnPlay for internal operations and public cloud tenants.
- onprem: customer self-hosted model for enterprise organizations with internal hosting/compliance requirements.

## 2. Business usage
- cloud ACC:
  - acceptance/testing for cloud release flow.
  - validates cloud package before production.
- cloud PRD:
  - production cloud runtime.
  - externally consumed by public SME/business users.
- onprem ACC:
  - acceptance/testing for onprem package lifecycle.
  - validates onprem installer/updater before production onprem.
- onprem PRD:
  - production onprem runtime for enterprise self-host contexts.

## 3. Key technical differences
1. Delivery model
- cloud: runtime managed as hosted cloud environment.
- onprem: runtime delivered as installable package for enterprise-hosted systems.

2. Operational ownership
- cloud: centralized platform operations.
- onprem: distributed customer-oriented deployment pattern.

3. Runtime scope identity
- cloud runtime identity: `cloud`
- onprem runtime identity: `onprem`

4. Packaging identity
- cloud artifacts: `LP-CL-V<major>.<minor>.<patch>.tar.gz`
- onprem artifacts: `LP-OP-V<major>.<minor>.<patch>.tar.gz`

5. Update commands
- cloud updates must target `cloud ACC`/`cloud PRD` only.
- onprem updates must target `onprem ACC`/`onprem PRD` only.

## 4. Shared architecture assumptions
- All environments are behind Caddy reverse proxy.
- TLS termination/routing is handled by Caddy.
- Local port 80/443 state on runtime host may not imply external outage in Behind Caddy mode.

## 5. Tooling boundaries
- `devadmin`:
  - packaging/build orchestration
  - remote ACC/PRD update orchestration from STACK-DEV
  - environment target/bootstrap management
- `lppadmin`:
  - runtime administration on target hosts
  - health/status/patch/runtime checks and update execution controls

## 6. Non-negotiable isolation rule
Cloud and onprem must remain isolated in:
- target host selection
- ssh alias usage
- package type selection
- updater scope
- rollback/snapshot flow

Always write the full target name in logs and notes:
- cloud ACC
- cloud PRD
- onprem ACC
- onprem PRD

## 7. Failure handling rule
If any installer/updater/bootstrap step fails on any target:
1. Stop.
2. Request snapshot restore of affected target.
3. Continue only after restore confirmation.
