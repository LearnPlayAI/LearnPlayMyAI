# Failure Signature Catalog

Status: MUST consult during incident triage
Last updated: 2026-03-21

## 1. Expected Warning (not immediate failure)
Signature:
- health/status shows local `80/443` closed on runtime host.
Interpretation:
- often valid in Behind Caddy mode.
Action:
- verify Caddy routing and external URL health before declaring failure.

## 2. Scope mismatch warning
Signature:
- cloud task tries onprem alias/host or vice versa.
Action:
- correct target scope/alias.
- rerun pre-flight checks.

## 3. SSH passwordless issue
Signature:
- `Permission denied (publickey,password)` in devadmin remote step.
Action:
- run scope-correct bootstrap for affected target.
- verify alias from STACK-DEV.

## 4. Package scope mismatch
Signature:
- selected package does not match scope.
Action:
- use `LP-CL-V...` only for cloud targets.
- use `LP-OP-V...` only for onprem targets.

## 5. Snapshot-required failure
Signature:
- any failed installer/updater/bootstrap with partial changes.
Action:
- STOP.
- request snapshot restore.
- continue only after restore confirmation.
