# Development Lifecycle and Practices

Last updated: 2026-03-21

## 1. Lifecycle Goals
Maintain consistent, testable delivery for both platform variants:
- cloud
- onprem

Keep each scope isolated while preserving predictable promotion from test to production.

## 2. Standard lifecycle
1. Plan
- define change scope and impacted targets.
- identify whether cloud, onprem, or both are affected.

2. Implement
- apply code/script changes in DEV workspace.
- update handover state files as changes are made.

3. Build
- produce scope-correct artifacts:
  - `LP-CL-V<major>.<minor>.<patch>.tar.gz`
  - `LP-OP-V<major>.<minor>.<patch>.tar.gz`
 - ensure package includes:
  - `RELEASE_NOTES.txt` (from `docs/handoverdocs/CHANGELOG.md`, scope filtered)
  - `CHANGELOG_PACKAGE.md` (packaged changelog extract)

4. Validate in ACC
- run end-to-end updates on:
  - cloud ACC (for cloud changes)
  - onprem ACC (for onprem changes)
- execute post-checks/health checks.

5. Promote to PRD
- use tested package lineage from ACC validation.
- update:
  - cloud PRD
  - onprem PRD
- run post-checks.

6. Closeout
- update handoff docs (`AI-HANDOFF.md`, `AI-STATE.json`).
- record known issues and next actions.

## 3. Core practices
1. Scope isolation
- never mix cloud/onprem package identities.
- never mix cloud/onprem target aliases.

2. Explicit target naming
Always write full target in logs and notes:
- cloud ACC
- cloud PRD
- onprem ACC
- onprem PRD

3. One-source handoff state
- all active state must live in repo docs, not only in chat.

4. Build-once promote-forward mindset
- use tested artifact lineage from ACC to PRD per scope.

## 4. Failure and recovery practice
Mandatory rule:
- if any installer/updater/bootstrap step fails on any target:
  1. stop immediately,
  2. request snapshot restore of affected target,
  3. continue only after restore confirmation.

## 5. Validation checklist by stage
Before ACC update:
- target scope and host verified
- package scope verified
- snapshot readiness confirmed

After ACC update:
- runtime version check
- health check
- key workflow smoke test

Before PRD update:
- ACC-tested package confirmed
- approval status recorded

After PRD update:
- runtime version check
- health check
- primary user journey smoke test

## 6. Seat-rotation practice
At end of each seat session:
- update `AI-HANDOFF.md` with completed/pending/blockers
- update `AI-STATE.json` with machine-readable status
- capture exact next 3 actions

At start of next seat session:
- ingest handoff files first
- confirm current phase and next action before changes

## 7. Definition of done
A change is done only when:
- scope-correct package/build applied,
- ACC and PRD target checks passed (for impacted scope),
- no unresolved blockers,
- handoff state is fully updated.
