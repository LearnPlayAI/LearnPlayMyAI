# Deployment Functionality Testing

## About
This document defines testing steps for deployment package selection and version parity across DEV, ACC, and PRD for cloud and onprem.

## Functional Feature Index
- `DEP-T01`: DEV update selects canonical package family
- `DEP-T02`: DEV/ACC/PRD parity after same-package rollout
- `DEP-T03`: Scope mismatch package is rejected
- `DEP-T04`: ACC/PRD remote actions use alias-based non-interactive SSH
- `DEP-T05`: GitHub tools sync honors DEV source-of-truth policy
- `DEP-T06`: GitHub option outcomes are correctly split (10/11/12)

## Preconditions
- `devadmin` available on DEV host.
- Cloud and onprem package directories contain current `LP-*` artifacts.
- ACC and PRD targets configured and reachable.

## Detailed Test Steps

### DEP-T01: DEV update package family
1. Run DEV update for cloud (`Update DEV cloud` with build or no-build path).
2. Observe selected package line in output.
3. Repeat for onprem.

Expected result:
- Cloud DEV update uses `LP-CL-V*`.
- Onprem DEV update uses `LP-OP-V*`.
- DEV no longer auto-selects legacy `learnplay-<scope>-v*` package names.

### DEP-T02: End-to-end parity
1. Build cloud package once.
2. Update DEV cloud.
3. Update ACC cloud with no-build.
4. Update PRD cloud with no-build.
5. Run 3-way cloud parity check.
6. Repeat steps for onprem scope.

Expected result:
- LearnPlay component version matches across DEV/ACC/PRD per scope.
- No `LEGACY-*` mismatch appears when all three were updated from same `LP-*` line.

### DEP-T03: Scope mismatch rejection
1. Attempt DEV cloud update with an onprem package (`LP-OP-*`) via explicit `--package`.
2. Attempt DEV onprem update with a cloud package (`LP-CL-*`) via explicit `--package`.

Expected result:
- Command is rejected with scope mismatch error.
- No runtime update is applied.

### DEP-T04: Alias and non-interactive remote behavior
1. In Environment Targets, configure ACC/PRD targets (host/user/password) for cloud and onprem.
2. Run remote operations from `devadmin`:
  - compare versions
  - ACC/PRD post-check
  - patch subcommands
  - update ACC/PRD
  - scoped full update in Build & Artifacts
3. Verify commands run without interactive password prompts.
4. Confirm menu target display resolves to alias names (`acc-<scope>-devadmin`, `prd-<scope>-devadmin`) for remote operations.
5. Temporarily break alias key auth and retry a remote operation.

Expected result:
- Normal operation uses alias targets and completes without password prompts (no direct hostname SSH path).
- On auth failure, command exits with non-interactive auth error guidance (no interactive prompt loop).

### DEP-T05: Source-of-truth GitHub behavior
1. Make a small uncommitted change on DEV (for example, edit a doc line).
2. Run `devadmin` -> `GitHub Management` -> `10) Scoped devadmin sync and update`.
3. Confirm a warning appears stating GitHub is not yet synced to latest DEV source.
4. Choose `y` when prompted to proceed with automatic backup commit+push.
5. Verify the DEV-only devadmin sync/update continues after backup.
6. Repeat with clean working tree and confirm no warning prompt appears.
7. Simulate remote-ahead divergence (`origin` ahead of local) and rerun.

Expected result:
- Dirty tree path: tool warns, offers proceed prompt, creates auto backup commit, pushes, then continues sync.
- Workflow pushes latest local committed state first, then pulls latest from GitHub on DEV.
- Non-DEV hosts are updated via package deployments only; no GitHub operations are attempted there.

### DEP-T06: GitHub + Build & Artifacts option behavior split
1. Run option `10`.
2. Verify only local DEV `devadmin` refresh runs after GitHub sync; no ACC/PRD update actions are executed.
3. Open `Cloud -> Build & Artifacts` and run option `5`.
4. Verify only `lppadmin` updates run for cloud DEV/ACC/PRD (no full package build/deploy).
5. In `Cloud -> Build & Artifacts`, run option `6`.
6. Verify full DEV-only update executes (build+deploy DEV only).
7. In `Cloud -> Build & Artifacts`, run option `7`.
8. Verify ACC-only full deploy runs from latest cloud DEV build package (no GitHub sync, no build).
9. In `Cloud -> Build & Artifacts`, run option `8`.
10. Verify DEV->ACC full rollout executes (sync GitHub + build/deploy DEV + deploy ACC), with no PRD deploy step.
11. In `Cloud -> Build & Artifacts`, run option `9`.
12. Verify PRD-only full deploy runs from latest cloud DEV build package (no GitHub sync, no build).
13. In `Cloud -> Build & Artifacts`, run option `10`.
14. Verify full rollout executes with one build on DEV then same package deploy to ACC and PRD.
15. Repeat scoped checks under `OnPrem -> Build & Artifacts` and verify cloud scope remains untouched.

Expected result:
- Option `10` updates `devadmin` only on STACK DEV.
- Build & Artifacts option `5` updates scoped `lppadmin` only.
- Build & Artifacts option `6` performs scoped full DEV-only update.
- Build & Artifacts option `7` performs scoped full ACC-only deploy from latest DEV build (no sync/build).
- Build & Artifacts option `8` performs scoped DEV->ACC full rollout (sync + DEV build/deploy + ACC deploy, no PRD).
- Build & Artifacts option `9` performs scoped full PRD-only deploy from latest DEV build (no sync/build).
- Build & Artifacts option `10` performs scoped full rollout using one DEV build artifact for DEV/ACC/PRD.
- No cross-scope updates occur unless selected.

## Negative and Edge Cases
- If package basename is passed instead of absolute path, updater resolves it from the scope package directory.
- If matching package does not exist, updater exits with clear "No package found" error.

## Change Summary
- 2026-03-22: Added tests for canonical DEV package selection and version parity consistency after fixing DEV updater prefix behavior.
- 2026-03-22: Added coverage for alias-based, non-interactive ACC/PRD remote execution across cloud and onprem.
- 2026-03-22: Added tests ensuring GitHub tool sync follows DEV-as-source-of-truth and package-only non-DEV updates.
- 2026-03-22: Updated DEP-T05 to validate warning + proceed auto-backup flow for option 10 when DEV has uncommitted changes.
- 2026-03-22: Updated DEP-T06 menu placement: GitHub option 10 remains DEV-only devadmin update, and scoped lppadmin/full rollout moved to Build & Artifacts options 5 and 6 per scope.
- 2026-03-22: Strengthened DEP-T04 to validate alias-enforced remote execution for all ACC/PRD operations (including scoped full update), independent of stored raw hostnames.
- 2026-03-22: Expanded DEP-T06 to validate new Build & Artifacts options 6/7/8/9 for full-update control (DEV-only, ACC-only, PRD-only, and build-once full-chain rollout).
- 2026-03-23: Updated DEP-T06 for new Build & Artifacts option 8 (DEV->ACC no-PRD rollout) and renumbered PRD-only and full-chain validation to options 9 and 10.
