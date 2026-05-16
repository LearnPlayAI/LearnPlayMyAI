# Cloud Production Installer Tasks

Status: Active execution checklist
Scope: Cloud production installer readiness (no source code in installer payload)
Owner: LearnPlay platform team
Last updated: 2026-03-05 UTC

## Progress Legend
- `[x]` Done
- `[~]` In progress
- `[ ]` Not started

## Current Sprint Focus
- [x] Add package-time source exclusion gate in `build-cloud-linux.sh`.
- [x] Add package inventory report generation in `build-cloud-linux.sh`.
- [x] Add package checksum manifest generation in `build-cloud-linux.sh`.
- [x] Add required runtime asset manifest + package-time validation for cloud build.
- [x] Expand installer/runtime validation so install itself hard-fails on missing required assets.
- [x] Add production directory/mount-point validation for non-dev installs (`/opt/learnplay`, `/opt/lpdb`, `/lppbackups`, `/var/log`, `/home/lppadmin`).
- [~] Add full release manifest with checksums and align installer/version display end-to-end.

## 1. Release Contract and Inputs
- [ ] Define installer input contract (single source of truth):
  - [ ] `BASE_URL` / cloud domain
  - [ ] DB mode (managed/local) and connection details
  - [ ] SMTP mode and provider settings (MailerSend for cloud default)
  - [ ] API keys: Gemini, Gamma, MailerSend, Yoco, and all required production integrations
  - [ ] Storage mode and upload paths/buckets
  - [ ] Admin bootstrap values and organization seed defaults
- [ ] Mark each input as required/optional with validation rules.
- [ ] Add clear error messages for invalid/missing inputs.

## 2. Packaging Rules (No Source Code Allowed)
- [~] Update package build to include runtime artifacts only:
  - [x] Built server bundle
  - [x] Built client bundle
  - [ ] Production dependencies only
  - [x] Install/update scripts
  - [x] Seed data and required runtime assets
- [x] Exclude all source/dev artifacts from installer package.
- [x] Add packaging gate that fails if banned file patterns are found in package.
- [x] Add packaging report that lists included files and total size.

## 3. Versioning and Traceability
- [x] Generate release manifest with:
  - [x] App version
  - [x] Build timestamp
  - [x] Commit/tag reference
  - [x] Package checksum(s)
- [x] Display installer version at install start and completion.
- [x] Write installed version metadata to a persistent file on target host.
- [ ] Expose installed version in `lppadmin` (version/status output).

## 4. Required Files Manifest (Runtime Completeness)
- [~] Create required-files manifest for cloud runtime assets:
  - [x] Gamma theme thumbnails
  - [x] Gamma image-style assets
  - [x] Branding assets (logo/favicon/default platform branding)
  - [x] Platform seed JSONs and required catalog/config files
  - [~] Any other files needed for fully functional first login and admin flows
- [x] Add package-time check: fail build if any required file is missing.
- [x] Add install-time check: fail install if any required file is missing after copy.
- [ ] Add post-install check: validate that asset-dependent APIs/UI routes are functional.

## 5. Installer Orchestration (Cloud)
- [ ] Finalize orchestration sequence and idempotency:
  - [ ] OS prep
  - [ ] Dependency install
  - [ ] DB setup/migrations
  - [ ] Platform seed + file seed
  - [ ] Service setup (systemd)
  - [ ] Nginx and TLS
  - [ ] Health checks
- [ ] Ensure step-level failure handling with actionable remediation output.
- [ ] Ensure installer can run fully interactive and fully non-interactive (answer file/env).

## 6. Environment and Secret Wiring
- [ ] Ensure all runtime config is environment-driven (no hardcoded URLs or keys).
- [ ] Ensure `BASE_URL` is always read from env secret and propagated correctly.
- [ ] Validate all required secrets before app start.
- [ ] Add secret presence/format checks in installer preflight.

## 7. Database and Seed Integrity
- [ ] Run schema migrations automatically.
- [ ] Seed required platform data idempotently.
- [ ] Seed mandatory hidden platform superadmin account for fresh installs.
- [ ] Validate seed integrity via post-seed queries and expected counts.
- [ ] Abort install when critical seed validation fails.

## 8. Service and Network Readiness
- [ ] Create/enable systemd units for runtime services.
- [ ] Configure nginx vhost for cloud domain.
- [ ] Configure TLS/certbot flow and renewal checks.
- [ ] Validate service startup and persistence after reboot.
- [ ] Validate cloud host routing isolation behavior.
- [~] Validate required production directories and mount targets:
  - [~] `/home/lppadmin` (admin home)
  - [x] `/opt/learnplay` (application)
  - [x] `/opt/lpdb` (database data, local PG)
  - [x] `/lppbackups` (backups/DR)
  - [~] `/var/log` (logs)

## 9. lppadmin Production Readiness
- [ ] Install/update `lppadmin` as part of installer.
- [ ] Add/verify commands for:
  - [ ] installer health summary
  - [ ] variant isolation health
  - [ ] secrets/config validation
  - [ ] service stack status/logs
- [ ] Ensure outputs are human-readable with success/failure summary and command details.

## 10. Automated Verification Gate
- [ ] Implement post-install verification suite (hard gate):
  - [ ] Login/auth flow
  - [ ] Admin/superadmin pages
  - [ ] Theme/branding asset loading
  - [ ] Gamma theme/image assets available
  - [ ] Mail provider test send
  - [ ] Payment provider connectivity check
  - [ ] AI provider connectivity check (Gemini/Gamma)
  - [ ] Job queue/background processing health
- [ ] Produce final machine-readable and human-readable install report.
- [ ] Mark install `LIVE-READY` only when all critical checks pass.

## 11. Backups, Restore, and Rollback
- [ ] Define pre-go-live backup snapshot procedure.
- [ ] Validate DR restore path on a clean host.
- [ ] Validate installer rollback behavior on failure mid-install.
- [ ] Document recovery steps for each critical failure point.

## 12. Security Hardening and Access Control
- [ ] Enforce least-privilege file permissions for runtime and uploads.
- [ ] Validate no sensitive secrets are logged in plaintext.
- [ ] Confirm default hidden superadmin is seeded only as intended and not exposed in UI.
- [ ] Validate firewall/open ports and SSH hardening checklist.

## 13. Documentation and Operator Runbook
- [ ] Update cloud installation guide with exact production workflow.
- [ ] Add non-interactive install guide for LearnPlay employees.
- [ ] Add post-install operational checks and handover checklist.
- [ ] Add “known failure modes and fixes” troubleshooting section.

## 14. CI/CD Release Gates
- [ ] Add CI job to build installer package and run source-exclusion checks.
- [ ] Add CI job to run package required-files manifest validation.
- [ ] Add VM smoke test (Ubuntu 24.04) for full unattended cloud install.
- [ ] Block release if any gate fails.

## 15. Final Go-Live Checklist
- [ ] Domain DNS verified
- [ ] TLS valid
- [ ] Services healthy
- [ ] Background jobs healthy
- [ ] Email send test passed
- [ ] Payment provider checks passed
- [ ] AI providers checks passed
- [ ] `lppadmin` health checks all green
- [ ] Version metadata confirmed
- [ ] Backup snapshot captured
- [ ] Install report archived

---

## Execution Order (Recommended)
1. Packaging rules + source exclusion gates
2. Required-files manifest and validation
3. Version manifest + installer version surfacing
4. Installer input contract + validation
5. Seed/migration integrity checks
6. Service/nginx/TLS hardening
7. `lppadmin` readiness commands
8. Automated verification gate
9. Documentation + runbook
10. CI release gates + VM smoke test

## Definition of Done
- A clean Ubuntu 24.04 server can run one cloud installer flow end-to-end.
- Installer payload contains no app source code.
- All required runtime files (themes/thumbnails/branding/etc.) are present and validated.
- System boots with full production functionality and passes verification gates.
- Installed version is visible and auditable.
