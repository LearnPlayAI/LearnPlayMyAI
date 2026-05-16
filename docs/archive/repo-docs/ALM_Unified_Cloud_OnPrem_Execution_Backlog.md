# ALM Backlog: Unified Cloud/OnPrem Runtime and Release Lifecycle

## Progress Dashboard
- Program status: `Completed`
- Overall completion: `100%` (24/24 backlog items completed)
- Current milestone: `M5`
- Last updated (UTC): `2026-03-10`

### Epic Status
| Epic | Status | Progress |
|---|---|---|
| EPIC 1 Runtime and Variant Contract | Completed | 3/3 |
| EPIC 2 Build and Package Isolation | Completed | 4/4 |
| EPIC 3 Installer and Updater Hardening | Completed | 5/5 |
| EPIC 4 Unified Production lppadmin | Completed | 3/3 |
| EPIC 5 OnPrem Licensing and Access Policy | Completed | 4/4 |
| EPIC 6 Parity Across Hosts and ALM Controls | Completed | 3/3 |
| EPIC 7 Linux Tree Retirement | Completed | 2/2 |

### Live Ticket Status
| Backlog ID | Status | Notes |
|---|---|---|
| LP-001 | Completed | Runtime contract doc created |
| LP-002 | Completed | Linux workspace dependency removed from runtime detection |
| LP-003 | Completed | Runtime marker + startup fail-closed enforcement implemented |
| LP-010 | Completed | Distinct `dist-cloud` and `dist-onprem` build targets |
| LP-011 | Completed | Checksum + signature-capable manifest verification implemented |
| LP-012 | Completed | Variant contamination guardrails enforced in cloud/onprem build scripts |
| LP-013 | Completed | Source exclusion gate + package inventory enforced |
| LP-020 | Completed | Backup root resolver with `/lppbackups` fallback |
| LP-021 | Completed | Backup-before-mutate hard gate implemented |
| LP-022 | Completed | Onprem manifest parity validation implemented |
| LP-023 | Completed | Bridge upgrade hook (`dist/*/bridges/*.sh`) implemented |
| LP-024 | Completed | Rollback transaction metadata + provenance files implemented |
| LP-030 | Completed | Installed runtime lppadmin menus restricted |
| LP-031 | Completed | Scope/service parity normalized |
| LP-032 | Completed | Added `parity-report`, `verify-package`, `backup-root-status`, `update-preflight` |
| LP-040 | Completed | Onprem policy matrix enforced server-side |
| LP-041 | Completed | 30-day unlicensed lock mode enforced |
| LP-042 | Completed | Branding admin access gated for unlicensed onprem |
| LP-043 | Completed | Clock rollback/tamper remediation mode enforced |
| LP-050 | Completed | Release provenance files standardized |
| LP-051 | Completed | Mandatory upgrade test matrix documented |
| LP-052 | Completed | Backup retention + 80%/95% storage guardrails implemented |
| LP-060 | Completed | Linux/Cloud reconciliation report + archive snapshot |
| LP-061 | Completed | Linux-On-Prem folder retired on this host |

## Status Update Rule (Working Agreement)
- This document is the live source of implementation progress.
- Update `Progress Dashboard`, `Epic Status`, and the relevant ticket status immediately when a task starts/completes.
- Each completed task must include:
  - completion date (UTC)
  - short evidence note (PR/commit/test reference)
  - any follow-up action

## Scope
- Single source of truth: `Cloud-On-Prem` only.
- One `lppadmin` runtime tool for cloud and onprem installed systems.
- Build/package isolation between cloud and onprem variants.
- Safe upgrades from supported historical versions with no data loss.
- Runtime parity across hosts (except transactional data and host-specific secrets/config).

## Delivery Principles
- Keep implementation minimal and necessary.
- Enforce fail-closed behavior for variant identity and package validation.
- Treat backup success as a hard gate for app/db updates.
- Keep dev-only actions out of installed/runtime package workflows.

## Milestones
- `M1`: Variant and runtime contract finalized.
- `M2`: Packaging and updater hardening complete.
- `M3`: Unified production `lppadmin` complete.
- `M4`: Onprem licensing policy complete.
- `M5`: Cross-host parity verification complete.

## Sprint 1 (P0) Execution Backlog
- Sprint objective: establish non-negotiable safety/variant foundations before feature rollout.
- Planned sprint status: `Completed`

| Sprint Task ID | Backlog IDs | Description | Primary File Areas | Tests / Validation | Status |
|---|---|---|---|---|---|
| S1-01 | LP-001 | Write and approve runtime/variant contract and canonical paths | `docs/architecture/*`, installer docs | Contract review checklist | Completed |
| S1-02 | LP-002 | Remove Linux-On-Prem coupling from runtime detection and scope logic | `cloud/lppadmin.sh` | `lppadmin self-check` in dev workspace and installed profile | Completed |
| S1-03 | LP-020 | Implement shared backup-root resolver with `/lppbackups` fallback to `/opt/lpdb/lppbackups` | `cloud/lppadmin.sh`, `cloud/update.sh`, `onprem/update.sh`, install scripts | Backup dry run on host with and without `/lppbackups` | Completed |
| S1-04 | LP-022 | Add onprem release manifest product/version/min-supported validation parity with cloud updater | `onprem/update.sh` | Attempt cloud pkg on onprem (must fail), valid onprem pkg (must pass) | Completed |
| S1-05 | LP-021 | Enforce no-data-loss update gate (abort app/db update if backup fails) | `cloud/update.sh`, `onprem/update.sh` | Simulate `pg_dump` failure, verify update aborts before mutate | Completed |
| S1-06 | LP-030 | Gate installed-runtime `lppadmin` menus to production-only operations (no dev build/package tasks) | `cloud/lppadmin.sh` | Installed profile menu/CLI command audit | Completed |
| S1-07 | LP-031 | Normalize scope parity and paths for cloud/onprem runtime roots | `cloud/lppadmin.sh`, install/update scripts | Dual-scope action parity test (`status`, `health`, `update`, `backup`) | Completed |
| S1-08 | LP-011 (partial) | Add mandatory package verification step usage in both update entrypoints | `cloud/lppadmin.sh`, `cloud/update.sh`, `onprem/update.sh` | Invalid signature/checksum test blocks update | Completed |
| S1-09 | LP-013 (partial) | Add package inventory check in release flow to block app source code in artifacts | packaging scripts and CI workflow | CI fails if `client/src` or `server/*.ts` included | Completed |

### Sprint 1 Exit Criteria
- S1-01 through S1-09 completed.
- Cloud and onprem updates both fail closed on manifest mismatch and backup failure.
- `lppadmin` installed runtime surface excludes development tasks.
- Backup fallback behavior verified on this host.

### Completion Notes (UTC)
- `2026-03-10`: S1-01 completed.
  - Evidence: Added runtime contract doc (`docs/architecture/Runtime_Variant_Contract.md`).
- `2026-03-10`: S1-02 completed.
  - Evidence: Removed Linux-On-Prem runtime dependency from root/scope detection in `cloud/lppadmin.sh`.
- `2026-03-10`: S1-03 completed.
  - Evidence: Added backup-root fallback resolver in `cloud/lppadmin.sh`, `cloud/update.sh`, `onprem/update.sh`, `cloud/app-install.sh`, `onprem/app-install.sh`, `cloud/master-install.sh`, `onprem/master-install.sh`.
- `2026-03-10`: S1-04 completed.
  - Evidence: Added onprem release manifest validation (`product/version/minSupported`) in `onprem/update.sh`.
- `2026-03-10`: S1-05 completed.
  - Evidence: Enforced hard abort on DB backup failure in both updater scripts.
- `2026-03-10`: S1-06 completed.
  - Evidence: Restricted installed-runtime `Misc` menu to hide dev build/deploy and script runner paths.
- `2026-03-10`: S1-09 completed.
  - Evidence: Added source exclusion gate, package inventory, checksums, and release manifest generation to `onprem/build-onprem.sh` (cloud already had equivalent gates).
- `2026-03-10`: S1-07 completed.
  - Evidence: Added canonical+legacy runtime path handling and fallback-aware scope defaults across lppadmin/install/update scripts.
- `2026-03-10`: LP-032 completed.
  - Evidence: Added `parity-report`, `verify-package`, `backup-root-status`, and `update-preflight` CLI commands to `lppadmin`.
- `2026-03-10`: S1-08 completed (partial scope).
  - Evidence: Added package checksum verification + manifest validation gates in both updater scripts.
- `2026-03-10`: Validation check.
  - Evidence: `bash -n` passed for all modified shell scripts.
- `2026-03-10`: LP-003 completed.
  - Evidence: Added `.runtime-identity.json` generation in install/update scripts and startup enforcement via `server/services/runtimeIdentityService.ts`.
- `2026-03-10`: LP-011 completed.
  - Evidence: Added manifest signature creation hooks in build scripts and signature verification in cloud/onprem updater preflight.
- `2026-03-10`: LP-012 completed.
  - Evidence: Added variant contamination guards validating runtime mode defaults in both cloud and onprem build outputs.
- `2026-03-10`: LP-023 completed.
  - Evidence: Added bridge upgrade preflight (`dist/*/bridges/*.sh`) in both updater scripts.
- `2026-03-10`: LP-024 completed.
  - Evidence: Added updater transaction IDs and rollback metadata files in backup snapshots.
- `2026-03-10`: LP-032 completed.
  - Evidence: Added `update-preflight` command and enhanced parity report fields in `cloud/lppadmin.sh`.
- `2026-03-10`: LP-040/041/042/043 completed.
  - Evidence: Updated onprem role policy limits, lock-mode login gating, branding access gate, and time tamper remediation checks in auth/license routes.
- `2026-03-10`: LP-050/051/052 completed.
  - Evidence: Added `.release-provenance.json` generation, upgrade matrix doc (`docs/testing/ALM_Upgrade_Test_Matrix.md`), and backup retention/storage guardrails in updater scripts.
- `2026-03-10`: LP-060/061 completed.
  - Evidence: Added reconciliation report (`docs/architecture/LinuxOnPrem_Reconciliation_and_Retirement.md`), archived Linux tree snapshot, and removed `/antigravity/Linux-On-Prem` from host.
- `2026-03-10`: Host runtime cutover completed (cloud + onprem).
  - Evidence: Installed runtime profile switched to `/opt/learnplay/{cloud,onprem}`, canonical services `learnplay-cloud` and `learnplay-onprem` active on ports `8000/9000`, nginx endpoints verified for `cloud.learnplay.co.za` and `onprem.learnplay.co.za`.
- `2026-03-10`: Runtime identity cross-variant resolution fix applied.
  - Evidence: Updated `server/services/runtimeIdentityService.ts` candidate resolution order to prefer runtime-local marker first; validated cloud stays `onpremMode=false` while onprem remains `onpremMode=true` on same host.

## Backlog

### EPIC 1: Runtime and Variant Contract

#### LP-001 Define immutable runtime contract
- Description: Document canonical runtime roots, DB roots, uploads, backup fallback, scope names, service names.
- Dependencies: None.
- Deliverables:
  - Runtime contract doc in `docs/architecture`.
  - Canonical paths:
    - Cloud: `/opt/learnplay/cloud`, `/opt/lpdb/cloud`, `/opt/learnplay/cloud/uploads`
    - OnPrem: `/opt/learnplay/onprem`, `/opt/lpdb/onprem`, `/opt/learnplay/onprem/uploads`
    - Backup: `/lppbackups/<scope>` fallback `/opt/lpdb/lppbackups/<scope>`
- Acceptance criteria:
  - Contract approved and referenced by installer/update/lppadmin docs.

#### LP-002 Remove Linux workspace dependency
- Description: Remove runtime detection logic that relies on `/antigravity/Linux-On-Prem`.
- Dependencies: LP-001.
- Deliverables:
  - Updated detection logic to use Cloud-On-Prem and installed runtime markers only.
- Acceptance criteria:
  - `lppadmin self-check` shows correct scopes with no Linux-On-Prem references.

#### LP-003 Enforce immutable variant identity
- Description: Add install/update runtime marker + manifest-based product identity checks.
- Dependencies: LP-001.
- Deliverables:
  - Runtime marker file and validation logic at startup/update.
  - Protected keys cannot be mutated via normal env editing in installed mode.
- Acceptance criteria:
  - Onprem runtime cannot be switched to cloud via env edits.

### EPIC 2: Build and Package Isolation

#### LP-010 Variant-specific build targets
- Description: Ensure distinct cloud and onprem build outputs from shared codebase.
- Dependencies: LP-001.
- Deliverables:
  - Stable `dist-cloud` and `dist-onprem` outputs.
- Acceptance criteria:
  - Both outputs build successfully in CI from same commit.

#### LP-011 Signed release manifest and checksum enforcement
- Description: Require `release-manifest.json` with `product`, `version`, `minSupportedVersion`, `buildId`, checksum/signature.
- Dependencies: LP-010.
- Deliverables:
  - Packaging scripts emit manifest and signatures.
  - Install/update scripts verify before applying.
- Acceptance criteria:
  - Any tampered or mismatched package is rejected.

#### LP-012 Contamination guardrails
- Description: Prevent cloud-only features in onprem packages and onprem-only features in cloud packages.
- Dependencies: LP-010.
- Deliverables:
  - CI checks for forbidden routes/modules per variant.
  - Package inventory report.
- Acceptance criteria:
  - CI fails on cross-variant contamination.

#### LP-013 No source code in release packages
- Description: Enforce runtime artifact-only packaging (allow `lppadmin` scripts source).
- Dependencies: LP-010.
- Deliverables:
  - Packaging filter and CI assertion.
- Acceptance criteria:
  - Artifacts contain compiled runtime assets only (plus allowed scripts/config/templates).

### EPIC 3: Installer and Updater Hardening

#### LP-020 Backup root fallback resolver
- Description: Implement shared backup path resolver in installer/updater/lppadmin.
- Dependencies: LP-001.
- Deliverables:
  - Resolver behavior:
    - Use `/lppbackups/<scope>` if available/writable.
    - Else `/opt/lpdb/lppbackups/<scope>`.
  - Log fallback decision.
- Acceptance criteria:
  - On hosts without `/lppbackups`, backups complete under `/opt/lpdb/lppbackups/<scope>`.

#### LP-021 Harden cloud updater preflight
- Description: Enforce backup gate and deterministic update behavior for cloud updates.
- Dependencies: LP-011, LP-020.
- Deliverables:
  - Block app/db update if DB backup fails.
  - Deterministic dependency install (`npm ci --omit=dev`) where applicable.
- Acceptance criteria:
  - Update aborts safely with clear reason if backup/preflight fails.

#### LP-022 Add full manifest validation to onprem updater
- Description: Bring onprem updater to parity with cloud manifest checks.
- Dependencies: LP-011.
- Deliverables:
  - Validate `product=onprem`, version match, minimum supported version.
- Acceptance criteria:
  - Onprem updater rejects cloud packages and unsupported baselines.

#### LP-023 Universal update path with bridge upgrades
- Description: Support “update from any supported version” via bridge chain.
- Dependencies: LP-021, LP-022.
- Deliverables:
  - Supported floor definition.
  - Optional bridge scripts for legacy baselines.
- Acceptance criteria:
  - Upgrade succeeds from oldest supported baseline in test matrix.

#### LP-024 Rollback contract and metadata
- Description: Standardize rollback metadata and procedures.
- Dependencies: LP-021.
- Deliverables:
  - Update transaction ID.
  - File rollback always available.
  - DB rollback policy explicit (full restore by operator confirmation).
- Acceptance criteria:
  - Failed update returns app to healthy prior state with audit trail.

### EPIC 4: Unified Production lppadmin

#### LP-030 Single script, profile-gated behavior
- Description: One `lppadmin` for both variants; installed runtime excludes development tasks.
- Dependencies: LP-002.
- Deliverables:
  - `dev_workspace` profile: full dev actions.
  - `installed_runtime` profile: operations/update/recovery only.
- Acceptance criteria:
  - Installed systems expose no build/package/dev commands.

#### LP-031 Scope and service parity
- Description: Standardize cloud/onprem scope behavior in menus and CLI.
- Dependencies: LP-030.
- Deliverables:
  - Symmetric scope handling.
  - Consistent stack/service actions.
- Acceptance criteria:
  - Same operator command patterns work for both scopes.

#### LP-032 Add parity and provenance commands
- Description: Add host parity verification and package provenance reporting.
- Dependencies: LP-011, LP-030.
- Deliverables:
  - `parity-report`, `verify-package`, `backup-root-status`, `update-preflight`.
- Acceptance criteria:
  - Commands produce machine-readable and operator-readable outputs.

### EPIC 5: OnPrem Licensing and Access Policy

#### LP-040 Implement agreed policy matrix
- Description: Enforce user/org/learner and capability limits by onprem license state and system type.
- Dependencies: LP-003.
- Deliverables:
  - Policy engine values for unlicensed/licensed dev/prod as agreed.
- Acceptance criteria:
  - Role and org limits enforced server-side, not UI-only.

#### LP-041 30-day unlicensed lock enforcement
- Description: After grace period, only customer super admin login allowed.
- Dependencies: LP-040.
- Deliverables:
  - Grace timer and lock mode enforcement.
  - Recovery/licensing flow.
- Acceptance criteria:
  - Non-super-admin users blocked post-expiry.

#### LP-042 Branding capability gating without functional breakage
- Description: Keep branding internals active; restrict access when unlicensed.
- Dependencies: LP-040.
- Deliverables:
  - Capability checks on write/admin endpoints and UI entry points.
  - Default theme fallback for unlicensed onprem.
- Acceptance criteria:
  - System remains functional while unlicensed users cannot administer branding.

#### LP-043 Tamper and clock rollback handling
- Description: Detect suspicious rollback and fail to remediation mode.
- Dependencies: LP-041.
- Deliverables:
  - Timestamp integrity checks.
  - Restricted remediation behavior.
- Acceptance criteria:
  - Tamper attempts do not restore full access.

### EPIC 6: Parity Across Hosts and ALM Controls

#### LP-050 Release provenance standard
- Description: Standardize build IDs, manifest hashes, migration markers, lppadmin version.
- Dependencies: LP-011.
- Deliverables:
  - Provenance file in each install.
- Acceptance criteria:
  - Two hosts on same release report matching provenance.

#### LP-051 Minimal mandatory upgrade test matrix
- Description: Define and automate required upgrade paths.
- Dependencies: LP-023.
- Deliverables:
  - Matrix:
    - Oldest supported -> latest
    - Previous release -> latest
    - Current -> latest
    - Onprem licensed/unlicensed dev/prod checks
- Acceptance criteria:
  - All matrix scenarios pass before release approval.

#### LP-052 Backup retention and storage guardrails
- Description: Implement minimum retention and low-space behavior.
- Dependencies: LP-020.
- Deliverables:
  - Retention: 7 daily + 4 weekly.
  - Warn at 80% backup volume usage.
  - Block update if backup cannot be created.
- Acceptance criteria:
  - Retention and guardrails validated on cloud and onprem runtimes.

### EPIC 7: Linux Tree Retirement

#### LP-060 Reconciliation and archive
- Description: Final diff audit and archival snapshot before retirement.
- Dependencies: LP-002, LP-030.
- Deliverables:
  - Reconciliation checklist and archive.
- Acceptance criteria:
  - No active runtime/tooling dependency on Linux-On-Prem.

#### LP-061 Retire Linux-On-Prem folder
- Description: Remove folder after verification window.
- Dependencies: LP-060.
- Deliverables:
  - Folder removal and docs update.
- Acceptance criteria:
  - CI and runtime operations remain green.

## Execution Order
1. LP-001, LP-002, LP-003
2. LP-010, LP-011, LP-012, LP-013
3. LP-020, LP-021, LP-022, LP-023, LP-024
4. LP-030, LP-031, LP-032
5. LP-040, LP-041, LP-042, LP-043
6. LP-050, LP-051, LP-052
7. LP-060, LP-061

## Non-Negotiable Release Gates
- Manifest/signature verification enabled.
- Cross-variant contamination checks enforced.
- Backup-before-update hard gate enforced.
- Upgrade matrix passes.
- No source code in release packages (except allowed script sources).

## Done Definition (Program Level)
- One codebase (`Cloud-On-Prem`) drives cloud and onprem.
- One production `lppadmin` operates both variants consistently.
- Updates are safe from supported historical baselines.
- Onprem policy and licensing behavior matches agreed rules.
- Cross-host parity is verifiable and repeatable.
