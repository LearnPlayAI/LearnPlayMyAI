# LearnPlay Global Changelog

This is the source-of-truth changelog used for package release notes.

Entry rules:
- Keep entries high-level and human-readable.
- Do not include file names or code-level implementation details.
- Allowed variants: `cloud`, `onprem`, `both`.
- Use OS timezone timestamp format: `YYYY-MM-DD HH:MM:SS TZ +/-HH:MM`.

## Entry LPLOG-20260428-001
- Timestamp: 2026-04-28 00:00:00 SAST +02:00
- Variant: both
- Issue: Knowledge and documentation loading had grown too broad because active docs, historical handover material, generated artifacts, and repo-local legacy docs were mixed across two roots.
- Fix: Introduced compact knowledge, landscape, handover, testing, operations, and changelog entrypoints under the canonical docs root, deprecated the repo-local docs root for active documentation, and moved large/stale docs into searchable archive paths.

## Entry LPLOG-20260428-002
- Timestamp: 2026-04-28 13:03:57 SAST +02:00
- Variant: both
- Issue: Course export/import packages depended on a shared transfer secret, which made cloud/onprem transfer compatibility fragile and did not enforce Cloud PRD active-license authority for customer-managed onprem systems.
- Fix: Reworked protected course-transfer packages to use Cloud PRD license-authority key wrapping and onprem export/import authorization while keeping cloud export/import governed by internal role and organization scope controls.

## Entry LPLOG-20260428-003
- Timestamp: 2026-04-28 13:33:08 SAST +02:00
- Variant: both
- Issue: Large course transfer packages could be rejected by the reverse proxy before LearnPlay received them, while modal dismissal could hide an active or completed transfer and make users rerun export/import work.
- Fix: Added route-specific large streamed handling for course transfer upload endpoints, removed the application-level 1GB transfer upload cap, and made the transfer dialog preserve recoverable transfer state with explicit 413 messaging.

## Entry LPLOG-20260428-004
- Timestamp: 2026-04-28 13:50:38 SAST +02:00
- Variant: both
- Issue: Course import could fail after successful upload/decrypt when course lesson links referenced quiz collections that were inserted later or absent from the imported bundle, and outside-click protection used failure styling while transfers were still running.
- Fix: Insert quiz collections before course lesson links, harden imported bundle foreign keys immediately before insert by filtering missing required relationships and nulling optional quiz pointers, and show outside-click transfer protection as an informational still-running notice.

## Entry LPLOG-20260428-009
- Timestamp: 2026-04-28 15:58:00 SAST +02:00
- Variant: both
- Issue: AI/dev operations guidance did not make the WSL-native execution contract explicit enough, so project tests could be attempted with Windows-native Node tooling and fail due to UNC workspace path resolution.
- Fix: Documented that LearnPlay workspace Node tooling, Jest, TypeScript, package builds, and local app processes must run inside WSL/Linux, with WSL Node activation as the recovery path when shell Node tooling is missing.

## Entry LPLOG-20260429-001
- Timestamp: 2026-04-29 11:49:43 SAST +02:00
- Variant: both
- Issue: Education organization registration could create selected grades and classes while silently dropping selected subjects, and the Central Management Hub did not surface grade-level subjects in the hierarchy.
- Fix: Aligned education registration subject selection with the backend grade-subject contract, returned grade-level subjects in hierarchy data, rendered those subjects in the Central Management Hub, and documented user-owned deployment/manual validation plus terminology-helper label rules.

## Entry LPLOG-20260429-002
- Timestamp: 2026-04-29 12:18:11 SAST +02:00
- Variant: both
- Issue: Education organization subject workflows still had follow-up drift risks: manual grade-scoped subject creation could miss the grade-subject link, join approvals could mutate state before rejecting incompatible subject choices, on-prem DEV/QA role defaults could map education joins incorrectly, and some active admin copy still bypassed central terminology helpers.
- Fix: Linked manually created grade/unit subjects through the grade-subject table, validated join-request subject compatibility before approval side effects across approval paths, preserved education approval as the `student` role, and moved remaining active management wording through organization terminology helpers.

## Entry LPLOG-20260427-001
- Timestamp: 2026-04-27 10:32:00 SAST +02:00
- Variant: both
- Issue: Lesson translation could fail during Source DB artifact translation when the workflow treated translated text content as if it required storage-backed presentation versioning, causing translated lessons to stop with a missing storage-key error. Local cloud smoke validation also exposed that unreadable integration secret state could block translation even when a valid legacy Gemini configuration existed.
- Fix: Persisted Source DB translation output as auditable lesson content history, keeping storage-backed versioning for presentation artifacts only, and hardened Gemini configuration resolution to prefer integration settings while falling back to valid legacy AI configuration when integration secrets are unavailable.

## Entry LPLOG-20260427-002
- Timestamp: 2026-04-27 13:15:00 SAST +02:00
- Variant: both
- Issue: Lesson translation review could falsely mark lesson digest output as stale immediately after a successful run, blocking progression and pushing users toward broad retranslation even when existing artifact translations were still valid. Bloom objectives were also not selected by default despite being part of lesson data when present.
- Fix: Aligned digest and step-guide freshness contracts with the actual source-content hash, preserved compatibility with prior translated runs, limited refresh-from-source selection to genuinely stale artifacts, and included Bloom objectives by default when source lesson objectives exist.

## Entry LPLOG-20260424-001
- Timestamp: 2026-04-24 14:40:00 SAST +02:00
- Variant: both
- Issue: Runtime memory limits and connection-pool sizing could become stale after host resource changes, and default Node heap behavior could trigger avoidable out-of-memory failures during heavier auth/test workloads.
- Fix: Added dynamic startup-time runtime tuning in cloud and onprem install/update service flows so each restart recalculates Node heap and DB/session pool settings from current host capacity, with explicit operator overrides and disable controls.

## Entry LPLOG-20260413-001
- Timestamp: 2026-04-13 11:15:56 SAST +02:00
- Variant: both
- Issue: Artifact Quick Access and lesson viewer language handling could fail when a selected translated lesson variant existed but only some artifacts were translated, causing partial loads, missing artifact actions, or stuck viewer loading behavior instead of deterministic source-language fallback.
- Fix: Implemented artifact-level language fallback resolution across lesson viewer and quick-access selector flows so each artifact resolves selected-language first and source-language fallback second, added selector/action wiring for resolved artifact targets, and expanded fallback metadata propagation for consistent UI behavior.

## Entry LPLOG-20260413-002
- Timestamp: 2026-04-13 11:34:33 SAST +02:00
- Variant: both
- Issue: Platform default branding updates could appear not to apply due to resolved-theme caching/context refresh gaps, and platform-wide UI still had residual low-contrast readability debt from opacity-based disabled/subtle styling patterns in shared primitives and page-level consumers.
- Fix: Hardened theme resolution freshness and editor mutation refresh flow, added cache-busting response policy for resolved theme payloads, clarified platform-theme scope behavior in the editor, and executed a shared-primitive-first contrast remediation sweep plus page hotspot fixes to replace opacity dimming with semantic disabled token styling.

## Entry LPLOG-20260413-003
- Timestamp: 2026-04-13 12:00:51 SAST +02:00
- Variant: both
- Issue: The AI operating standard became too dense for reliable day-to-day execution, increasing risk of missed directives and inconsistent task setup across domains.
- Fix: Reframed `aimem.md` as a master control/routing standard, added mandatory skill-selection preflight rules, and introduced modular LearnPlay skill packs (repo-scoped and local mirror) for governance, UI/token policy, API/data contracts, testing/release gates, and observability/rollback workflows.

## Entry LPLOG-20260409-001
- Timestamp: 2026-04-09 18:59:12 SAST +02:00
- Variant: both
- Issue: Platform-wide UI parity remained inconsistent because legacy gradient/override utility classes and page-level styling debt were still present across many user-facing screens, causing runtime visuals to diverge from UI Kit primitive contracts.
- Fix: Executed a source-level primitive adoption remediation sweep across user-facing pages/components, expanded automated parity enforcement to block residual gradient/orphan stop utilities, and validated strict parity/type/test gates so UI surfaces consume centralized tokenized primitive styling consistently.

## Entry LPLOG-20260410-002
- Timestamp: 2026-04-10 09:49:13 SAST +02:00
- Variant: both
- Issue: Theme generation and primitive editing still showed cross-primitive coupling and inconsistent accessibility behavior, which made UI Kit edits difficult to apply predictably across real runtime pages.
- Fix: Expanded primitive token granularity for navigation/link families, hardened contrast-safe token derivation for recurring failing pairs in the canonical builder, aligned UI Kit edit targets to primitive-local tokens, and validated full theme contract/parity/type/test gates for cloud+onprem shared runtime paths.

## Entry LPLOG-20260410-001
- Timestamp: 2026-04-10 00:20:10 SAST +02:00
- Variant: both
- Issue: Theme token propagation and accessibility behavior could regress because key primitive token contracts were incomplete, and SuperAdmin impersonation could leak stale org context through legacy session fallbacks after ending impersonation.
- Fix: Hardened token/primitive contract parity and contrast-preserving theme enforcement, added regression coverage for theme and impersonation cross-domain flows, and fixed session-context resolution so impersonation start/stop behavior remains deterministic across admin, billing, and theme domains.

## Entry LPLOG-20260409-002
- Timestamp: 2026-04-09 23:08:21 SAST +02:00
- Variant: both
- Issue: UI primitive parity checks could still pass with hidden baseline debt for action/status/link token misuse, and on-prem cloud check-in reliability could break during shared-secret rotation windows.
- Fix: Tightened route-domain parity enforcement to strict-zero for primitive state overrides, raw action/status/link token class usage, and gradients; completed a broad token normalization remediation sweep; and hardened on-prem PRD check-in signing to safely retry PRD-scoped shared-secret candidates during controlled key rotation.

## Entry LPLOG-20260408-004
- Timestamp: 2026-04-08 10:57:06 SAST +02:00
- Variant: both
- Issue: On-prem cloud-control-plane authentication depended on a single shared signing secret, which created fleet-wide blast radius, blocked updates when absent, and did not provide per-system credential lifecycle isolation for customer-managed deployments.
- Fix: Added per-system on-prem sync credential isolation tied to enterprise system identity, propagated credentials through check-in/profile sync flows, added system credential rotate/revoke controls, migrated on-prem signing to system-bound headers when available, and updated install/update/admin secret gates so legacy shared secret is bootstrap-optional rather than rollout-blocking.

## Entry LPLOG-20260408-005
- Timestamp: 2026-04-08 11:16:27 SAST +02:00
- Variant: both
- Issue: Full on-prem landscape rollouts could fail at package build time because asset export integrity checks resolved uploads from non-canonical roots, which missed valid scoped runtime branding assets and surfaced false missing-asset failures; platform default branding references were also vulnerable to drift from packaged baseline assets.
- Fix: Hardened export/build asset-root resolution to prioritize scoped runtime uploads with deterministic fallback and actionable diagnostics, and aligned platform default branding references to canonical packaged assets so build/update pipelines remain consistent across cloud and onprem environments.

## Entry LPLOG-20260408-006
- Timestamp: 2026-04-08 11:20:54 SAST +02:00
- Variant: both
- Issue: Update reliability was degraded by always-running dependency installs, noisy internal-DEV warning semantics, and missing deterministic in-pipeline reconciliation for functional schema drift on ACC/PRD.
- Fix: Added dependency fingerprint gating to skip reinstall when manifests are unchanged, introduced safe functional schema reconciliation before parity verification (including empty extra-table archival), and tightened warning/failure semantics so internal-DEV skips are informational while ACC/PRD baseline failures remain blocking.

## Entry LPLOG-20260408-007
- Timestamp: 2026-04-08 11:24:33 SAST +02:00
- Variant: both
- Issue: Install and update dependency behavior was not fully aligned, and routine migration-only update notices were surfaced as warnings, creating unnecessary rollout noise.
- Fix: Extended dependency fingerprint handling into both installer paths so dependency state remains deterministic from first install through updates, and reclassified expected migration-only data-sync skip notices as informational for clearer operator signaling.

## Entry LPLOG-20260408-003
- Timestamp: 2026-04-08 10:20:05 SAST +02:00
- Variant: both
- Issue: Theme Editor and Theme Builder had cross-org domain action context gaps, mode-intent fallback drift, and persistence inconsistencies that could regress dark-mode behavior and multi-mode token integrity after reset/upload operations.
- Fix: Completed theme-domain hardening by propagating selected org context across domain actions, enforcing deterministic mode-aware token resolution in resolved/embed flows, synchronizing reset/upload persistence contracts for multi-mode tokens, tightening custom-domain input validation, extending asset cleanup for canonical public-object URLs, and expanding focused theme-domain automated tests.

## Entry LPLOG-20260408-001
- Timestamp: 2026-04-08 16:40:00 SAST +02:00
- Variant: both
- Issue: License lifecycle enforcement had security and policy gaps, including unauthenticated public onprem licensing endpoints, identity-collision risk, and policy-versus-check-in mismatches that could block valid waived/auto-renew systems from receiving licenses.
- Fix: Hardened public onprem license APIs with signed-request verification and replay protection, aligned issuance/check-in behavior to policy-driven approval rules across all tracks, normalized license-state handling, and added identity/collision guardrails plus license-domain tests and migration constraints.

## Entry LPLOG-20260408-002
- Timestamp: 2026-04-08 09:40:37 SAST +02:00
- Variant: both
- Issue: License-domain security hardening introduced a required shared check-in signing secret, but installer/update/admin secret workflows did not yet provision and enforce that key consistently, risking runtime check-in failures after upgrades.
- Fix: Updated cloud and onprem installer flows, update preflight enforcement, required-secrets validation tooling, and environment templates so the shared onprem cloud check-in signing secret is consistently provisioned and validated across both variants.

## Entry LPLOG-20260403-001
- Timestamp: 2026-04-03 13:29:30 SAST +02:00
- Variant: both
- Issue: Course Lessons artifact quick-access flow required richer context actions per selected language/version, and linked quiz primary-state switching could not be performed directly from artifact-side workflows.
- Fix: Expanded Artifact Quick Access with contextual Open/Play, Download, Set Active, Replace, and Edit actions, wired actions to selected language-variant lesson targets, and added a dedicated linked-quiz primary activation endpoint for direct sidebar-based activation.

## Entry LPLOG-20260407-007
- Timestamp: 2026-04-07 17:33:53 SAST +02:00
- Variant: both
- Issue: DEV->ACC->PRD rollouts could fail and auto-rollback on legacy environments because post-migration schema verification treated structural constraint/index naming drift as fatal, and cloud runtime migration could abort on legacy no-journal database state.
- Fix: Updated runtime migration governance to support functional-only contract verification for updater post-checks, and added a guarded cloud migration recovery retry path that activates only after standard migration execution fails.

## Entry LPLOG-20260331-001
- Timestamp: 2026-03-31 09:47:06 SAST +02:00
- Variant: both
- Issue: Lesson artifact version UX could show ambiguous active/current entries and missing timestamps, causing confusion about which version is truly active per language.
- Fix: Standardized lesson source-version semantics around canonical current/initial identity, added stable timestamp/language metadata for source/version payloads, and aligned version matching logic in Lesson Content Studio to remove active-version ambiguity.

## Entry LPLOG-20260331-002
- Timestamp: 2026-03-31 10:13:50 SAST +02:00
- Variant: both
- Issue: Governance references across AI memory, functional docs protocol, and handover onboarding still enforced mandatory `*_Functionality_TESTING.md` maintenance, conflicting with the current documentation workflow.
- Fix: Aligned AI operating, functional-doc, handover-bootstrap, and seat-rotation guidance to require `*_Functionality.md` updates plus current validation guidance, and introduced a reusable always-load project operating skill for short-prompt governance continuity.

## Entry LPLOG-20260331-003
- Timestamp: 2026-03-31 10:23:43 SAST +02:00
- Variant: both
- Issue: UI governance continuity did not explicitly codify Theme Editor-driven white-label and branding consistency expectations across onboarding and seat-rotation directives.
- Fix: Added mandatory UI white-label/theme consistency rules in AI operating memory and handover startup/rotation checklists to ensure all UI changes align with Theme Editor-governed branding tokens and assets.

## Entry LPLOG-20260331-004
- Timestamp: 2026-03-31 10:32:30 SAST +02:00
- Variant: both
- Issue: UI implementation quality and consistency could vary because design-contract discipline, manual visual QA evidence expectations, and reusable world-class UI workflow guardrails were not explicit enough for short-prompt development.
- Fix: Strengthened UI governance skills and references with required design contracts, Theme Editor branding alignment, reusable token-driven pattern guidance, strict breakpoint/state validation expectations, and added a reusable UI task template for design-first delivery.

## Entry LPLOG-20260331-005
- Timestamp: 2026-03-31 10:37:16 SAST +02:00
- Variant: both
- Issue: UI consistency improvements needed an explicit shared-component evolution path so future page work steadily converges on a cohesive design system instead of one-off implementations.
- Fix: Added a UI shared-components roadmap with phased priorities, adoption workflow, and definition-of-done expectations, and linked it into the UI task template for routine use in UI delivery.

## Entry LPLOG-20260331-006
- Timestamp: 2026-03-31 10:54:50 SAST +02:00
- Variant: both
- Issue: Live user testing support did not have a formal cross-seat protocol for real-time monitoring and evidence correlation across logs, database state, code flow, and user-supplied screenshots/comments.
- Fix: Added a mandatory live test monitoring protocol across AI operating memory, project skill guidance, handover startup/rotation directives, and command runbook instructions so short monitoring prompts trigger consistent observe-and-recommend behavior.

## Entry LPLOG-20260331-007
- Timestamp: 2026-03-31 10:56:52 SAST +02:00
- Variant: both
- Issue: Variant scope interpretation for change requests could be inconsistent when users did not explicitly call out cloud/onprem boundaries.
- Fix: Added a mandatory default-scope rule that implement/fix/enhance requests apply to both cloud and onprem unless the user explicitly restricts work to a single variant.

## Entry LPLOG-20260321-001
- Timestamp: 2026-03-21 10:40:00 SAST +02:00
- Variant: both
- Issue: Git backup and repository management workflows were inconsistent and hard to operate safely.
- Fix: Added centralized GitHub management workflows in devadmin to make backup, sync, PAT updates, and safety checks predictable.

## Entry LPLOG-20260321-002
- Timestamp: 2026-03-21 12:50:15 SAST +02:00
- Variant: both
- Issue: Package version labels and release communication were not aligned to business-readable release tracking.
- Fix: Introduced unified LP-CL/LP-OP package versioning and changelog-driven release notes focused on issue and fix summaries.

## Entry LPLOG-20260321-003
- Timestamp: 2026-03-21 14:05:00 SAST +02:00
- Variant: both
- Issue: Some guidance and handover references still showed legacy package naming, which could cause operator confusion.
- Fix: Updated operational and handover documentation to consistently use LP-CL/LP-OP package naming and release-notes expectations.

## Entry LPLOG-20260321-004
- Timestamp: 2026-03-21 14:05:00 SAST +02:00
- Variant: both
- Issue: Local DEV runtimes had drift in user identity standards, enterprise/license data state, and host package alignment.
- Fix: Standardized cloud DEV and onprem DEV identities and data baseline, applied host package/patch alignment, and refreshed both local runtime app-db layers.

## Entry LPLOG-20260321-005
- Timestamp: 2026-03-21 14:05:00 SAST +02:00
- Variant: both
- Issue: Seat handover context did not reflect that remote ACC/PRD hosts were being rebuilt and not yet ready for remote update operations.
- Fix: Updated handover docs, runbook, runtime facts, snapshot registry, and version matrix to clearly mark cloud ACC/cloud PRD/onprem ACC/onprem PRD as rebuild-in-progress with exact next actions.

## Entry LPLOG-20260322-001
- Timestamp: 2026-03-22 09:20:56 SAST +02:00
- Variant: both
- Issue: Functional documentation continuity and AI long-term memory expectations were not codified for seat rotation and pre-implementation behavior.
- Fix: Added mandatory AI operating standard and functional documentation protocol, introduced `docs/func` governance guidance with testing gate rules, and integrated these references into handover startup flow.

## Entry LPLOG-20260322-002
- Timestamp: 2026-03-22 11:32:28 SAST +02:00
- Variant: both
- Issue: Completion-stage governance did not explicitly require handover changelog updates for every finished change set.
- Fix: Added mandatory AI operating rule requiring changelog updates in `docs/handoverdocs/CHANGELOG.md` after each completed implementation cycle, aligned to changelog formatting requirements.

## Entry LPLOG-20260322-003
- Timestamp: 2026-03-22 11:51:52 SAST +02:00
- Variant: both
- Issue: GitHub Management option 10 behavior was too broad and triggered full multi-scope update actions when only scoped tooling sync was expected.
- Fix: Split GitHub Management workflows into scoped lppadmin-only sync, scoped full rollout, and DEV-only devadmin refresh so each option has a clear and isolated outcome.

## Entry LPLOG-20260322-004
- Timestamp: 2026-03-22 11:54:47 SAST +02:00
- Variant: both
- Issue: Scope selection options for GitHub Management workflows were not visible during interactive selection, causing operator confusion.
- Fix: Corrected scope prompt handling so Cloud/OnPrem options are displayed properly before selecting scoped option 10 or 11 actions.

## Entry LPLOG-20260322-005
- Timestamp: 2026-03-22 11:57:55 SAST +02:00
- Variant: both
- Issue: GitHub Management menu did not provide a dedicated DEV-only devadmin sync/update entry in the requested position before scoped lppadmin/full rollout options.
- Fix: Added a dedicated option 10 for DEV-only devadmin sync/update and shifted scoped lppadmin/full rollout actions to options 11 and 12.

## Entry LPLOG-20260322-006
- Timestamp: 2026-03-22 12:05:23 SAST +02:00
- Variant: both
- Issue: AI memory and remote execution expectations needed tighter clarity to avoid ambiguity and password-prompt regressions during devadmin remote operations.
- Fix: Updated AI operating rules to explicitly map long-term memory requests to `AI_Operating_Standard.md` and to require SSH alias/passwordless handling for all devadmin remote-host features.

## Entry LPLOG-20260322-007
- Timestamp: 2026-03-22 12:10:22 SAST +02:00
- Variant: both
- Issue: Scoped lppadmin sync and scoped full rollout actions were placed in GitHub Management instead of the scope-specific Build and Artifacts workflows.
- Fix: Moved scoped lppadmin sync and scoped full rollout actions into Cloud/OnPrem Build and Artifacts submenus and kept GitHub Management focused on DEV-only devadmin sync/update.

## Entry LPLOG-20260322-008
- Timestamp: 2026-03-22 12:24:35 SAST +02:00
- Variant: both
- Issue: Some devadmin remote execution paths could still rely on direct hostnames, which risks password prompts and inconsistent remote automation behavior.
- Fix: Enforced alias-first remote execution for ACC/PRD cloud and onprem operations across devadmin and updater scripts so remote tasks consistently target configured SSH aliases.

## Entry LPLOG-20260322-009
- Timestamp: 2026-03-22 12:26:31 SAST +02:00
- Variant: both
- Issue: AI operating guidance needed explicit boundaries for remote troubleshooting versus where permanent fixes must be made, and consistent deployment guidance before user testing.
- Fix: Added operating rules confirming full host/alias-based remote access for diagnostics, enforcing source-only fixes on this host, and requiring devadmin Build and Artifacts deployment paths before requesting user tests.

## Entry LPLOG-20260322-010
- Timestamp: 2026-03-22 12:40:29 SAST +02:00
- Variant: both
- Issue: Scoped full update controls in Build and Artifacts did not provide separate deploy-only paths for ACC and PRD from the latest DEV build artifact.
- Fix: Added scoped full-update options for DEV-only, ACC-only, PRD-only, and build-once full DEV->ACC->PRD rollout, with explicit no-GitHub-sync behavior for ACC/PRD deploy-only paths.

## Entry LPLOG-20260322-011
- Timestamp: 2026-03-22 15:09:23 SAST +02:00
- Variant: both
- Issue: License validity windows were based on fixed 30-day durations, which did not align to calendar-month license policy and caused uneven month boundaries.
- Fix: Updated cloud license issuance and renewal expiry calculation to use calendar month-end validity and aligned on-prem license lifetime validation to accept calendar-month renewal windows.

## Entry LPLOG-20260322-012
- Timestamp: 2026-03-22 15:23:15 SAST +02:00
- Variant: both
- Issue: OnPrem scoped full rollouts could fail during platform data sync due to missing database context, while rollout orchestration could still report success after failed stages.
- Fix: Hardened OnPrem update/import context and rollback DB restore handling, and updated devadmin rollout flow to fail-fast and report failure when DEV/ACC/PRD stages do not complete successfully.

## Entry LPLOG-20260322-013
- Timestamp: 2026-03-22 15:27:57 SAST +02:00
- Variant: both
- Issue: Scoped rollout wrapper actions could still print completion messages even when an underlying scoped stage failed, causing operator confusion during failed deployments.
- Fix: Added strict failure propagation and guard checks across scoped devadmin wrapper flows so completion messages are only emitted after successful stage execution.

## Entry LPLOG-20260322-014
- Timestamp: 2026-03-22 16:02:00 SAST +02:00
- Variant: onprem
- Issue: OnPrem DEV updates in the shared internal environment could fail platform data sync by writing assets to `/opt/learnplay/uploads`, and rollback health checks could report false failures due to stale port/service assumptions.
- Fix: Aligned platform-data asset sync to scoped runtime upload paths (`/opt/learnplay/onprem/uploads`), passed upload context explicitly from updater, made rollback stop/log behavior service-manager aware (systemd vs pm2), and fixed rollback health checks to resolve the active runtime port from `.env`.

## Entry LPLOG-20260322-015
- Timestamp: 2026-03-22 16:12:00 SAST +02:00
- Variant: onprem
- Issue: OnPrem health checks on PM2-managed ACC/PRD hosts could be reported as "App running outside systemd" when root PATH did not resolve `pm2`, even though the app process was healthy under the runtime user.
- Fix: Updated PM2 runtime detection in onprem `lppadmin` health checks to resolve `pm2` in the runtime user's shell context, eliminating false DEGRADED service-status warnings on PM2-managed hosts.

## Entry LPLOG-20260322-016
- Timestamp: 2026-03-22 16:20:00 SAST +02:00
- Variant: onprem
- Issue: Some PM2-managed ACC/PRD hosts still reported a false "outside systemd" warning despite healthy app/runtime state.
- Fix: Updated OnPrem health-check classification to report `OK` when the app port is listening and no systemd unit exists, so non-systemd runtime deployments no longer show false DEGRADED status.

## Entry LPLOG-20260323-001
- Timestamp: 2026-03-23 16:50:00 SAST +02:00
- Variant: both
- Issue: Demo-data generation could fail on some long-lived environments due to DB constraint drift during leaderboard/statistics upsert steps.
- Fix: Hardened demo-data generation to use compatibility-safe write behavior that does not depend on missing unique constraints, improving cross-environment reliability.

## Entry LPLOG-20260323-002
- Timestamp: 2026-03-23 16:50:00 SAST +02:00
- Variant: both
- Issue: Generated learner users and learner-linked demo visibility were inconsistent across some admin/reporting surfaces due to learner role canonicalization mismatch.
- Fix: Aligned demo learner generation to the canonical learner role used by platform reporting/UI paths so generated learner volumes and related data are surfaced consistently.

## Entry LPLOG-20260323-003
- Timestamp: 2026-03-23 16:50:00 SAST +02:00
- Variant: both
- Issue: Seat-rotation handover state had stale runtime/version references and did not fully reflect current rebuild boundaries and validation posture.
- Fix: Updated handover state docs, runtime facts, runbook, snapshot registry, and version matrix to reflect current cloud DEV/onprem DEV facts and rebuild-in-progress status for all ACC/PRD targets.

## Entry LPLOG-20260323-004
- Timestamp: 2026-03-23 17:29:00 SAST +02:00
- Variant: both
- Issue: User Management became inefficient at scale due to badge-style organization filtering and modal-heavy interaction patterns for core admin tasks.
- Fix: Reworked User Management into a high-scale inline workflow with table-based organization filtering, richer filtering/sorting controls, saved views, batch operations, and non-modal inline action panels.

## Entry LPLOG-20260323-005
- Timestamp: 2026-03-23 17:35:21 SAST +02:00
- Variant: both
- Issue: Build and Artifacts rollout options did not include a dedicated DEV->ACC path that performs sync/build on DEV and deploys ACC while intentionally skipping PRD.
- Fix: Added a new scoped full-update option for DEV->ACC rollout (no PRD), and renumbered downstream PRD-only/full-chain rollout options accordingly.

## Entry LPLOG-20260323-006
- Timestamp: 2026-03-23 17:48:49 SAST +02:00
- Variant: both
- Issue: While impersonating organization context, lesson editor flows could fail with forbidden errors and remain in loading state, and course-lesson health checks were still calling a stale API path.
- Fix: Updated lesson access handling to honor effective impersonation organization scope (including linked-course lesson cases) and aligned lesson health fetches to the current course health endpoint path.

## Entry LPLOG-20260323-007
- Timestamp: 2026-03-23 17:55:00 SAST +02:00
- Variant: both
- Issue: While impersonating, some privileged admin pages (including gamma themes/image styles) returned forbidden responses even for users with true platform-level entitlement.
- Fix: Updated privileged admin authorization flow to preserve underlying SuperAdmin/CustSuper entitlement during impersonation so platform admin pages remain accessible.

## Entry LPLOG-20260323-008
- Timestamp: 2026-03-23 17:55:00 SAST +02:00
- Variant: both
- Issue: Generated demo organization users were biased toward team-level assignment and did not reflect balanced hierarchy placement across departments, units, and teams.
- Fix: Updated demo-data generation to distribute user assignments across department-level, unit-level, and team-level placement, including approved join-request users.

## Entry LPLOG-20260323-009
- Timestamp: 2026-03-23 18:03:00 SAST +02:00
- Variant: onprem
- Issue: OnPrem demo enrollments did not expose paid-value amounts in enrollment reporting, which made generated enrollment data look unrealistically zero-valued.
- Fix: Updated demo-data generation to create completed enrollment valuation records using course price/currency so enrollment reporting can show paid values without requiring real payment processing.

## Entry LPLOG-20260323-010
- Timestamp: 2026-03-23 18:03:00 SAST +02:00
- Variant: onprem
- Issue: Enrollment Management filtering was too limited for practical reporting slices on onprem systems.
- Fix: Expanded enrollment-management filtering with organization, role, value-type, min/max value, and date-range filters plus clear-filter reset workflow.

## Entry LPLOG-20260323-011
- Timestamp: 2026-03-23 18:09:00 SAST +02:00
- Variant: onprem
- Issue: Inter-organization sharing administration became difficult to navigate at scale because Shared Courses and Sharing Rules lacked built-in search/filter controls and pagination.
- Fix: Added search/filter controls and pagination to both Inter-Organization Config tabs so operators can find, segment, and navigate large cross-org sharing datasets.

## Entry LPLOG-20260323-012
- Timestamp: 2026-03-23 18:20:53 SAST +02:00
- Variant: both
- Issue: Quiz Lobby leaderboard filtering could mis-handle impersonation context and role naming differences, causing foreign unit filters, forbidden sub-unit lookups, and empty leaderboard results.
- Fix: Hardened effective-organization role/assignment context and leaderboard filter behavior so admin role formats are normalized, learner unit locks are effective-org scoped, and invalid unit/sub-unit selections safely reset instead of blocking leaderboard load.

## Entry LPLOG-20260323-013
- Timestamp: 2026-03-23 18:26:49 SAST +02:00
- Variant: cloud
- Issue: Cloud enterprise admin UX required clearer customer-details information architecture and stricter Revenue Overview track filtering, while combined filter behavior needed to remain composable under search/filter pagination use.
- Fix: Added two-tab customer-details structure (`Systems License Policy`, `Registered Org Metrics`), introduced searchable/filterable/paginated metrics browsing, replaced Revenue Overview environment control with explicit PRD/ACC/DEV dropdown options, and preserved combined filter application across all active controls.

## Entry LPLOG-20260323-014
- Timestamp: 2026-03-23 18:35:47 SAST +02:00
- Variant: onprem
- Issue: OnPrem demo generation did not create course review/rating rows, leaving `/admin/course-reviews` empty after demo runs.
- Fix: Added OnPrem review/rating seeding from enrolled learner activity so realistic demo review data is generated without depending on marketplace payment flow.

## Entry LPLOG-20260323-015
- Timestamp: 2026-03-23 18:39:57 SAST +02:00
- Variant: both
- Issue: Delete-all demo purge could fail on long-lived environments due to schema drift (for example optional column naming differences), blocking full demo data cleanup.
- Fix: Hardened purge flow with schema-drift-tolerant step handling and corrected quoted-column filtering for email-log cleanup so delete-all continues with warnings instead of failing entire operation on optional drifted structures.

## Entry LPLOG-20260323-016
- Timestamp: 2026-03-23 20:57:00 SAST +02:00
- Variant: onprem
- Issue: Onprem ACC demo-data delete could still fail or leave residual demo records due to FK dependency drift, org-delete ordering gaps, and orphaned demo users not tied to active demo org rows.
- Fix: Added dynamic FK-aware purge sequencing for resilient delete ordering, ensured privileged real accounts are protected while demo-email accounts are purged, and added orphan-demo-user cleanup so delete-all completes with zero demo org/user residue.

## Entry LPLOG-20260323-017
- Timestamp: 2026-03-23 22:29:44 SAST +02:00
- Variant: both
- Issue: LPC tier and subscription seeds were duplicated repeatedly during platform-data import/reseed on drifted environments.
- Fix: Hardened platform-data seed import to be natural-key idempotent for LPC tables and added resilient row-level dedupe/remap execution so repeated updates keep one canonical row per seed key.

## Entry LPLOG-20260323-018
- Timestamp: 2026-03-23 22:37:05 SAST +02:00
- Variant: onprem
- Issue: On onprem ACC, `/gamma-themes` appeared empty for CustSuper users because duplicate gamma admin route guards enforced SuperAdmin-only access and returned 403 even when data existed.
- Fix: Aligned gamma admin route authorization to SuperAdmin-or-CustSuper for onprem behavior, hotfixed onprem ACC runtime, and confirmed authenticated gamma admin endpoints return populated data.

## Entry LPLOG-20260324-001
- Timestamp: 2026-03-24 12:20:00 SAST +02:00
- Variant: both
- Issue: Cross-organization assignment and admin-boundary requirements were agreed but not fully consolidated into a single implementation-ready contract with explicit testing coverage.
- Fix: Expanded functional requirements for secure cross-org assignment/workflow boundaries and added a complete testing matrix plus implementation checklist to prepare safe execution across cloud and onprem tracks.

## Entry LPLOG-20260324-002
- Timestamp: 2026-03-24 11:49:53 SAST +02:00
- Variant: both
- Issue: AI memory path references were inconsistent after renaming the operating standard location, risking startup/read-order failures for new AI seats.
- Fix: Standardized all handover and protocol references to `docs/aimem/aimem.md` and removed the temporary legacy-path compatibility copy.

## Entry LPLOG-20260324-003
- Timestamp: 2026-03-24 12:35:00 SAST +02:00
- Variant: both
- Issue: Cross-organization user-management and assignment workflows still allowed policy drift in role hierarchy enforcement, ownership-scoped visibility, and multi-target assignment behavior.
- Fix: Implemented backend-first hierarchy enforcement for user actions, ownership-scoped inter-org config access, platform-top role alignment (`CustSuper`/`SuperAdmin`) in UI filtering, and multi-target course assignment support with duplicate-target dedupe and organization-scope handling.

## Entry LPLOG-20260324-004
- Timestamp: 2026-03-24 13:22:00 SAST +02:00
- Variant: both
- Issue: Onprem pricing governance still exposed `/admin/platform-pricing` control paths and did not enforce system-track royalty from cloud PRD license check-in as a local runtime authority.
- Fix: Removed onprem UI access to `admin/platform-pricing`, blocked onprem `platform-pricing` admin endpoints in favor of CustSuper pricing control, added cloud check-in response field for track royalty, and enforced/persisted that royalty locally on onprem by syncing `ONPREM_SYSTEM_ROYALTY_PERCENTAGE` and applying it to `platformPricing.defaultCourseCommissionRate` each successful check-in.

## Entry LPLOG-20260324-005
- Timestamp: 2026-03-24 14:05:00 SAST +02:00
- Variant: both
- Issue: After onprem demo-data deletion and check-in, cloud enterprise customer metrics could still show stale/duplicate organization rows from earlier snapshots.
- Fix: Updated telemetry ingestion and customer-metrics read behavior to treat check-ins as authoritative latest snapshots per system, prune stale same-day org rows, and correctly reflect empty latest snapshots without surfacing old organization rows.

## Entry LPLOG-20260324-006
- Timestamp: 2026-03-24 14:48:00 SAST +02:00
- Variant: both
- Issue: Demo generation controls did not allow operators to choose full data-domain scope, naming style conventions, or explicit activity date/time windows for seeded records.
- Fix: Added configurable demo-generation controls across cloud/onprem for dataset scope selection, naming convention strategy, custom generated email domain, and bounded activity timeframe generation.

## Entry LPLOG-20260324-007
- Timestamp: 2026-03-24 15:22:00 SAST +02:00
- Variant: both
- Issue: Demo tooling still lacked a complete generation-planner workflow for per-feature module control, pre-run impact preview, and reusable generation plans.
- Fix: Added feature-module based planning controls, generation preview estimates with warnings, reusable template save/apply/delete workflows, and generator execution wiring to honor module-level enablement across cloud/onprem.

## Entry LPLOG-20260324-008
- Timestamp: 2026-03-24 15:36:00 SAST +02:00
- Variant: both
- Issue: Demo purge/reset operations could remove data tied to the currently selected main organization when that organization matched demo-selection criteria.
- Fix: Added protected-main-organization purge safeguards so selected main organization and its related users are excluded from demo purge/reset deletion flows.

## Entry LPLOG-20260324-009
- Timestamp: 2026-03-24 14:28:34 SAST +02:00
- Variant: both
- Issue: Impersonation behavior was still inconsistent across several admin, content, leaderboard, and payment paths because some flows derived organization scope from raw user/session fields or request parameters instead of a single effective-organization authority.
- Fix: Standardized high-risk backend and UI flows to resolve and enforce effective impersonation organization context (including SuperAdmin/CustSuper behavior), tightened org-access enforcement on quiz/admin routes, and aligned client defaults/query keys to effective organization scope to prevent count/list mismatches, empty-state drift, and cross-org leakage.

## Entry LPLOG-20260325-001
- Timestamp: 2026-03-25 11:40:00 SAST +02:00
- Variant: both
- Issue: Integration credentials/defaults were fragmented across environment variables and legacy secret maintenance flows, causing inconsistent admin operations and non-unified runtime configuration behavior.
- Fix: Added unified Integration Settings management for MailerSend, Gemini, Gamma, and ElevenLabs (cloud + onprem), moved runtime key/default resolution to encrypted DB-backed integration settings, introduced provider health/testing workflows, and aligned legacy secret routes to compatibility-map into the new integration authority.

## Entry LPLOG-20260325-002
- Timestamp: 2026-03-25 13:05:00 SAST +02:00
- Variant: both
- Issue: Lesson podcast script generation depended on ElevenLabs Studio API (enterprise-only), causing deterministic 403 failures on non-enterprise plans and preventing end-to-end podcast creation.
- Fix: Replaced Studio-dependent script generation with LearnPlay-owned Gemini thinking-model script generation, preserved ElevenLabs public API usage for voices/TTS/usage only, added host/guest script segment linkage, enforced step-aware draft resume behavior, and finalized podcast functional/testing documentation for the new architecture.

## Entry LPLOG-20260325-003
- Timestamp: 2026-03-25 15:30:00 SAST +02:00
- Variant: both
- Issue: Integration configuration still had incomplete provider coverage and lacked centralized operational visibility for runtime failures and sensitive setting changes.
- Fix: Expanded Integration Settings to include SMTP and YOCO management, added active email transport selection, introduced integration runtime log views and system-change audit views, and completed backend API support for these controls.

## Entry LPLOG-20260325-004
- Timestamp: 2026-03-25 15:30:00 SAST +02:00
- Variant: both
- Issue: Installer/configuration workflows continued to prompt for and maintain integration secrets in `.env`, which conflicted with the database-backed Integration Settings authority model.
- Fix: Removed installer prompts for SMTP/MailerSend/API keys, reduced generated `.env` integration content to non-secret defaults, and blocked cloud/onprem configure-env secret operations for integration-managed keys to enforce in-app secret administration.

## Entry LPLOG-20260325-005
- Timestamp: 2026-03-25 16:21:10 SAST +02:00
- Variant: both
- Issue: Legacy operational paths still exposed duplicate secret-management touchpoints (`/admin/secret-keys`, lppadmin integration env tests, and master-install summaries), which could mislead operators and conflict with the single Integration Settings authority.
- Fix: Removed legacy Secret Keys route/nav entry, updated cloud/onprem master-install flows and summaries to Integration Settings-first behavior, and converted lppadmin integration validation/testing guidance to UI-driven provider checks in `/admin/integration-settings`.

## Entry LPLOG-20260325-006
- Timestamp: 2026-03-25 16:31:00 SAST +02:00
- Variant: both
- Issue: Integration Settings required manual text entry for AI model defaults, which was error-prone and did not reflect current provider model catalogs.
- Fix: Added provider-backed model dropdowns in Integration Settings for Gemini and ElevenLabs model settings, including live model-catalog fetch and refresh actions.

## Entry LPLOG-20260325-007
- Timestamp: 2026-03-25 17:08:44 SAST +02:00
- Variant: both
- Issue: YOCO configuration in Integration Settings was incomplete and inconsistent with required key governance, and onprem still exposed YOCO integration controls.
- Fix: Enforced cloud-only YOCO visibility, moved YOCO public keys into encrypted secret management, required all five YOCO keys (`test/live public`, `test/live secret`, `webhook secret`), and aligned payment/runtime reads to use secret authority consistently.

## Entry LPLOG-20260327-001
- Timestamp: 2026-03-27 09:32:00 SAST +02:00
- Variant: both
- Issue: Podcast wizard source handling, draft persistence, and lesson-source usability remained inconsistent: Source DB content was not directly editable/versioned from lesson UI, PPTX podcast source could silently fall back to Source DB content, draft save could fail when source extraction was unavailable, and publishing-readiness guidance did not surface podcast as an optional item.
- Fix: Added editable lesson Source DB content with save/versioning and on-demand feedback preview, persisted manual source edits into lesson content version history, enforced strict podcast source behavior for PPTX without silent Source DB fallback (including on-demand transcript extraction path), hardened podcast draft save behavior to preserve draft state even when estimate/source extraction is unavailable, and updated course readiness display to include optional podcast coverage.

## Entry LPLOG-20260327-002
- Timestamp: 2026-03-27 10:25:00 SAST +02:00
- Variant: both
- Issue: Lesson Source Content review flow still lacked strong usability for version comparison and actionable AI guidance, and current-version hydration could be inconsistent when switching versions.
- Fix: Added robust current-version hydration and selection handling, introduced compare mode with side-by-side version selection and highlighted line-level diff output, and upgraded feedback preview to actionable recommendations (prioritized actions, strengths, and weakest-dimension next steps) while keeping stale-feedback detection visible when content changes.

## Entry LPLOG-20260327-003
- Timestamp: 2026-03-27 11:10:00 SAST +02:00
- Variant: both
- Issue: Podcast wizard source and draft behavior still showed instability: PPTX transcript extraction could fail when storage key metadata drifted (despite valid transcript/presentation assets), and draft continuity could appear fragmented during step navigation/autosave.
- Fix: Hardened transcript resolution to reuse existing transcript first and self-heal PPTX storage key from canonical/legacy paths before extraction, expanded PPTX source availability detection, and improved wizard draft lifecycle so autosave/save consistently pin to one active draft with stable draft selection and step-navigation persistence.

## Entry LPLOG-20260327-004
- Timestamp: 2026-03-27 10:56:00 SAST +02:00
- Variant: both
- Issue: Seat-rotation handover state was stale and did not consistently reflect the latest podcast/source-content hardening work, current DEV runtime versions, and immediate next actions.
- Fix: Refreshed handover documentation set with synchronized cloud DEV/onprem DEV runtime facts, completed-vs-pending state, exact next steps, key risks/blockers, and updated validation command runbook.

## Entry LPLOG-20260327-001
- Timestamp: 2026-03-27 13:45:00 SAST +02:00
- Variant: both
- Issue: Course and lesson management flows were still heavily modal/dialog-driven, causing mobile layout friction and inconsistent in-page continuity.
- Fix: Shifted core course/lesson management interactions to inline in-page workflows for key builder/assignment/edit flows, reducing overlay dependency and improving mobile-to-desktop UX continuity.

## Entry LPLOG-20260327-002
- Timestamp: 2026-03-27 14:20:00 SAST +02:00
- Variant: both
- Issue: `View Lesson Content (DB)` remained a constrained modal workflow, making long-form content editing/review impractical on smaller screens.
- Fix: Added a dedicated full-page Lesson Content Studio route and wired lesson actions to navigate there, enabling richer content review/edit/compare flows without modal constraints.

## Entry LPLOG-20260327-003
- Timestamp: 2026-03-27 14:40:00 SAST +02:00
- Variant: both
- Issue: Lesson action menu behavior was inconsistent: `Get Feedback` could appear inactive, manual quiz creation option was still exposed, and regenerate wording was ambiguous.
- Fix: Updated lesson action flow to trigger feedback immediately for single-language lessons, removed manual quiz creation from lesson dropdowns, and relabeled regenerate actions as `Regenerate PPTX`.

## Entry LPLOG-20260327-004
- Timestamp: 2026-03-27 15:10:00 SAST +02:00
- Variant: both
- Issue: Lesson Content Studio could show blank content/edit state in some contexts due to initialization timing and missing organization context resolution.
- Fix: Added resilient org-context resolution and explicit loading/empty/error handling with safe editor initialization and no-history version handling to prevent blank studio regressions.

## Entry LPLOG-20260327-005
- Timestamp: 2026-03-27 16:35:00 SAST +02:00
- Variant: both
- Issue: Source DB versioning and feedback workflows were inconsistent: Content Studio called non-canonical version endpoints/contracts, initial/current semantics were ambiguous, users could not explicitly set a selected version as current per language, and lesson-menu `Get Feedback` depended on modal flows that could appear inactive.
- Fix: Added robust source-content version APIs with explicit synthetic `Initial` and `Current` entries, introduced per-language `set current version` activation route with version-history audit entry, aligned Content Studio to canonical version/feedback contracts (including quick/deep/compare payloads and response rendering), and routed lesson-menu `Get Feedback` to full-page Content Studio with optional inline auto-feedback trigger (no modal dependency).

## Entry LPLOG-20260327-006
- Timestamp: 2026-03-27 17:20:00 SAST +02:00
- Variant: both
- Issue: Source DB compare mode still made differences hard to interpret because both panes displayed plain text without strong visual change cues, and version choices lacked visible timestamp context.
- Fix: Implemented explicit side-by-side visual diff rendering (line-level add/remove/change markers, inline token highlights, synchronized pane scrolling, changed-only filtering, and previous/next diff navigation) and added date/time timestamps to version selectors and compare headers for all source-content versions.

## Entry LPLOG-20260327-007
- Timestamp: 2026-03-27 18:00:00 SAST +02:00
- Variant: both
- Issue: Source DB feedback in Lesson Content Studio was not actionable enough; users received score/summary output without direct in-context execution of recommendations.
- Fix: Added actionable recommendation rendering in the studio feedback panel with per-item `Apply This Fix` actions, introduced backend `POST /api/lessons/:lessonId/source-document/apply-feedback-action` to apply selected recommendations to Source DB content via AI, and persisted each applied recommendation as a new `feedback_fix` content version.

## Entry LPLOG-20260327-008
- Timestamp: 2026-03-27 13:37:18 SAST +02:00
- Variant: both
- Issue: Lesson-linked AI quiz generation could not reliably control which lesson content source/version was used, causing inconsistent results and making source provenance unclear in the wizard flow.
- Fix: Added `GET /api/lessons/:lessonId/quiz-sources` to expose versioned source options (Source DB, PPTX, Word, Podcast, manual-topic), introduced a new mandatory `Select Source` step in Quiz Wizard, and enforced source-contract resolution in `POST /api/ai/generate-quiz` with explicit validation errors when selected sources are missing/stale (no silent fallback).

## Entry LPLOG-20260327-009
- Timestamp: 2026-03-27 13:56:07 SAST +02:00
- Variant: both
- Issue: Platform Revenue Reports costs data could accumulate large duplicate sets in long-lived environments, and several finance-write paths lacked full DB-enforced idempotency under retries/concurrency.
- Fix: Executed cross-environment financial dedupe across cloud/onprem DEV/ACC/PRD, remapped dependent records safely, and hardened prevention with null-aware uniqueness for report/snapshot caches, canonical uniqueness for cost type/category definitions, and idempotent service-level create/ingest guards for revenue sources and cost writes.

## Entry LPLOG-20260327-010
- Timestamp: 2026-03-27 14:02:02 SAST +02:00
- Variant: both
- Issue: After uniqueness hardening, concurrent report-cache and snapshot-generation jobs could still race in application flow and surface transient duplicate-key failures during update windows.
- Fix: Replaced race-prone cache/snapshot write paths with conflict-tolerant reconciliation logic that catches key conflicts and updates the canonical row, preserving single-record guarantees without write-failure regressions.

## Entry LPLOG-20260327-011
- Timestamp: 2026-03-27 14:19:55 SAST +02:00
- Variant: both
- Issue: Demo-data finance seeding still used direct inserts for revenue reports/snapshots and could duplicate rows (or fail under uniqueness constraints) when a batch retried or reran.
- Fix: Made demo finance seeding idempotent per batch/org by reconciling to existing seeded rows, added conflict-safe fallback updates for concurrent writes, and aligned seeded revenue-source inserts to ignore duplicate source keys.

## Entry LPLOG-20260327-012
- Timestamp: 2026-03-27 14:28:35 SAST +02:00
- Variant: both
- Issue: Non-finance demo seeding could still accumulate duplicate datasets across repeated Generate runs because standard generate flow appended on top of prior demo organizations.
- Fix: Hardened demo generation lifecycle to purge existing demo organizations before standard generate (while keeping explicit append mode opt-in), ensuring repeated generation runs stay duplicate-free across all seeded domains.

## Entry LPLOG-20260327-013
- Timestamp: 2026-03-27 14:59:26 SAST +02:00
- Variant: both
- Issue: Lesson-linked quiz generation/regeneration could still allow ungrounded content via manual-topic selection, empty-source resolution, and prompt-only enforcement without deterministic output validation.
- Fix: Enforced strict lesson source contract rules (no manual-topic or empty-source fallback), required source selection for lesson-linked regenerate actions, and added deterministic grounding validation with bounded retries so quiz questions/answers are accepted only when supported by the selected source content.

## Entry LPLOG-20260327-014
- Timestamp: 2026-03-27 15:14:40 SAST +02:00
- Variant: both
- Issue: Lesson-linked quiz publish flow could lose course-return context and redirect users to Quiz Drafts, and Course Lessons lacked direct lesson-level Bloom objective editing/visibility from the lesson card workflow.
- Fix: Preserved lesson/course return context across draft transitions in Quiz Wizard so publish/cancel return to the originating Course Lessons route, added lesson action entry for setting learning objectives, and introduced inline lesson-card Bloom taxonomy objective viewing/editing with persistence to lesson-topic mappings.

## Entry LPLOG-20260327-015
- Timestamp: 2026-03-27 16:21:14 SAST +02:00
- Variant: both
- Issue: Lesson translation was not selection-driven, podcast translation was detached from the main translation package, PPTX handling was fragmented, and translation state/version APIs lacked consistent cross-asset visibility.
- Fix: Added translation preflight and selectable content-package support (Source DB, Word docs, Quiz, Podcast script/audio, PPTX), wired package options into lesson translation start and worker execution with per-asset status/error tracking, and extended translation state/version responses with package metadata plus podcast/source-document history support.

## Entry LPLOG-20260327-016
- Timestamp: 2026-03-27 18:36:00 SAST +02:00
- Variant: both
- Issue: Immediately after Gamma PPTX generation, first-open lesson view/download could show false not-generated/no-PPTX states until hard refresh, and quiz source selection state was not visually obvious enough.
- Fix: Reworked PPTX readiness detection to rely on stored/versioned presentation state (not Gamma metadata alone), added better in-progress finalization feedback for download selection, allowed viewer fetch when presentation artifacts exist even if generation status lags, added best-effort slide pre-conversion before marking Gamma jobs complete, and strengthened Quiz Wizard source-card selected-state visuals with explicit selected affordances.

## Entry LPLOG-20260327-017
- Timestamp: 2026-03-27 19:05:00 SAST +02:00
- Variant: both
- Issue: Lesson-linked quiz generation could fail strict selected-source grounding and leave users feeling stuck in Wizard Step 3 (no persistent guidance), back navigation could be reset by draft rehydration races, and course-framework document ingestion still excluded PDF sources (including large indexed manuals).
- Fix: Hardened Quiz Wizard draft hydration and navigation behavior (single-load draft hydration, best-effort persisted back-step state, non-blocking post-generation draft save, and inline actionable generation-failure messaging), and extended course-framework ingestion to support PDF uploads/supplements with page-aware extraction, structural heading/index hint detection, and source-map/raw-text preservation for grounded downstream framework/topic generation.

## Entry LPLOG-20260327-018
- Timestamp: 2026-03-27 19:32:00 SAST +02:00
- Variant: both
- Issue: DOCX topic-to-content grounding was still weaker than desired for numbered technical documents, and framework generation could hard-fail when strict structured-heading assignment could not be completed even though users should still be able to continue with warnings.
- Fix: Added numbered DOCX top-level heading extraction (`1 ...`, `2 ...`) as explicit section boundaries for source assignment and structured heading metadata, and changed framework generation to fail-open by falling back from strict structured assignment to distribution-based grounding with surfaced `assignmentWarnings` metadata instead of aborting framework creation.

## Entry LPLOG-20260327-019
- Timestamp: 2026-03-27 18:25:48 SAST +02:00
- Variant: onprem
- Issue: On onprem DEV Node 18 runtimes, PDF uploads in Course Framework wizard could fail with "No extractable text/image-only" even for text-based PDFs due to invalid `pdftotext` output handling.
- Fix: Corrected onprem Node 18 `pdftotext` fallback extraction to read valid output and split pages reliably, restoring successful PDF ingestion/extraction for text PDFs while retaining explicit failure messaging for truly image-only scans.

## Entry LPLOG-20260327-020
- Timestamp: 2026-03-27 18:43:53 SAST +02:00
- Variant: both
- Issue: In cloud DEV impersonation flows, `Create Course -> Start AI-Assisted Course` could return false 403 draft-creation errors when client-side org payload became stale after org switching, despite valid effective impersonation context.
- Fix: Updated course draft creation to always bind and authorize against effective session organization context (including impersonation), while tolerating stale client org IDs and logging mismatches for diagnostics instead of hard-failing.

## Entry LPLOG-20260327-021
- Timestamp: 2026-03-27 18:58:00 SAST +02:00
- Variant: both
- Issue: Additional impersonation org-context gaps remained: AI helper generation endpoints still trusted request `organizationId` for top-admin sessions (including impersonation), usage-limit middleware resolved org from `userRoles[0]` instead of effective session context, and document-wizard draft bootstrap still preferred first-org list order over effective org metadata.
- Fix: Added effective-org resolution enforcement for AI helper endpoints during impersonation (with mismatch logging + safe effective-org binding), switched usage-limit checks to resolve quota org from effective session context (with role-order fallback only when context unavailable), and updated document wizard to prioritize `/api/user/roles.effectiveOrganizationId`/`defaultOrganizationId` before first-org fallback.

## Entry LPLOG-20260327-022
- Timestamp: 2026-03-27 19:12:00 SAST +02:00
- Variant: both
- Issue: After generating lesson Source DB feedback in full-page Lesson Content Studio and returning to Course Lessons without applying fixes/saving edits, lesson cards could remain stuck on `Step 2/7: Get feedback` because preview feedback did not persist canonical feedback-completion fields used by step/status logic.
- Fix: Updated Source Content Studio feedback preview endpoint to persist canonical feedback completion metadata (`contentScore10`, `previousScore10`, `lastFeedbackAt`, `lastFeedbackHash`, `feedbackReport`, `feedbackStatus=completed`) when previewed text matches current saved lesson source content, enabling consistent step progression in Course Lessons without requiring `Apply This Fix` or manual save.

## Entry LPLOG-20260327-023
- Timestamp: 2026-03-27 19:26:00 SAST +02:00
- Variant: both
- Issue: Learning objectives generated during framework creation could appear inconsistent on lesson cards, and lesson objective editing lacked an inline way to regenerate Bloom-targeted objectives from current lesson source content after framework creation.
- Fix: Added course-aware objective fallback hydration in lesson detail responses (preferring framework structured objectives, then linked course-lesson objectives), updated Course Lessons objective normalization to use lesson fallback data when framework-topic objectives are missing, and introduced inline Bloom-level AI objective generation in `Edit Objectives` using Source DB text so users can generate, append, manually edit, and save objectives directly on lesson cards.

## Entry LPLOG-20260327-024
- Timestamp: 2026-03-27 21:05:00 SAST +02:00
- Variant: both
- Issue: Source DB feedback in Lesson Content Studio was lesson-level and action-level only, so users could not persist/reload feedback by selected version, could not keep explicit per-item keep/remove decisions, and could accidentally lose control over relevance cleanup when returning later.
- Fix: Added version-scoped Source DB feedback run persistence (`lessonFeedbackRuns`) with itemized relevance audit records (`lessonFeedbackItems`), implemented latest-run retrieval and per-item decision APIs, added stale-hash safeguards, and upgraded Studio UI to user-controlled relevance selection with `Apply Selected Fixes` (selected items only) saved as a new auditable `feedback_fix` version.

## Entry LPLOG-20260407-001
- Timestamp: 2026-04-07 13:05:33 SAST +02:00
- Variant: both
- Issue: Storage governance drift remained possible due to empty storage-key persistence paths and incomplete execution tracking discipline during multi-phase remediation work.
- Fix: Enforced strict non-empty storage-key write guards in versioning flows, removed known empty-string metadata key writes, expanded storage governance audit coverage to fail invalid key patterns, and standardized live phase/findings/progress tracking through the shared TODO execution log.

## Entry LPLOG-20260407-002
- Timestamp: 2026-04-07 13:29:32 SAST +02:00
- Variant: both
- Issue: DEV storage integrity checks were incomplete, allowing DB file-key references to drift from actual upload filesystem state and obscuring cloud/onprem parity risk.
- Fix: Added a dedicated storage-reference-integrity audit for DB-referenced private/public keys, repaired onprem lesson version storage-key data corruption, and formalized a mandatory DB-to-filesystem integrity validation directive in AI operating standards.

## Entry LPLOG-20260407-003
- Timestamp: 2026-04-07 13:34:46 SAST +02:00
- Variant: both
- Issue: DEV variants had active storage-data inconsistencies and cloud path-depth risk: onprem contained invalid lesson version storage keys, cloud had missing referenced lesson/media artifacts, and cloud filesystem retained excessive deep legacy path structures.
- Fix: Repaired onprem lesson-version storage-key integrity, remediated cloud broken artifact references and revalidated strict DB-to-filesystem integrity, and introduced a controlled long-path compaction step that moved over-threshold cloud legacy files into canonical short-key storage layout.

## Entry LPLOG-20260407-004
- Timestamp: 2026-04-07 14:24:27 SAST +02:00
- Variant: both
- Issue: DEV promotion readiness remained blocked by migration governance drift after camelCase journal conversion and by shared cloud/onprem contract mismatch on shared organization columns.
- Fix: Completed camelCase migration-journal alignment (`drizzleMigrations.createdAt`) across cloud/onprem DEV, reconciled journal hash history with governance verification gates, added shared organizations column alignment migration for both variants, and tightened shared contract validation to enforce shared logical schema parity consistently across cloud/onprem.

## Entry LPLOG-20260407-005
- Timestamp: 2026-04-07 16:39:42 SAST +02:00
- Variant: both
- Issue: DEV runtime stability and UX reliability had active regressions: intermittent cloud login session loss, Theme Editor accessibility remediation showing non-actionable apply suggestions, and digest-first lesson flows appearing stuck during generation.
- Fix: Hardened login session persistence to commit store state before response, filtered accessibility remediation suggestions to only show real token changes, aligned digest availability/render logic to avoid contradictory state, and deployed validated runtime updates to both cloud and onprem DEV with passing critical checks and post-deploy storage integrity audits.

## Entry LPLOG-20260407-006
- Timestamp: 2026-04-07 17:04:00 SAST +02:00
- Variant: both
- Issue: Onprem DEV cloud check-in failed before policy evaluation due to TLS trust failure on self-signed DEV cloud certificate, storage integrity auditing could report false missing files from a non-runtime upload root, and operator directives lacked canonical environment endpoint definitions.
- Fix: Switched onprem DEV control-plane/metrics hardcoded targets to stage-aware DEV HTTP endpoint routing, restored successful control-plane reachability (now surfacing actionable policy responses), corrected storage-reference-integrity default upload roots to runtime variant paths, and updated AI operating directives with approved SSH aliases plus canonical cloud/onprem DEV/ACC/PRD URLs.

## Entry LPLOG-20260407-007
- Timestamp: 2026-04-07 17:50:00 SAST +02:00
- Variant: both
- Issue: Post-deploy parity drift risk remained across feature domains: snake_case/camelCase convergence was not enforced as a hard runtime invariant, onprem updates could still overwrite customer-managed platform configuration through packaged data imports, and cloud/onprem updates lacked full-table data parity regression blocking.
- Fix: Added explicit snake_case-to-camelCase remediation with safe data transfer + cleanup as an update gate, removed onprem packaged platform-data import from update flow (migration-only upgrades), added pre/post full-table data parity snapshot verification to both update pipelines, hardened fresh-install detection to fail safe on uncertainty, and enforced packaged baseline branding/runtime asset guarantees to prevent missing default platform visuals.

## Entry LPLOG-20260407-008
- Timestamp: 2026-04-07 20:10:00 SAST +02:00
- Variant: both
- Issue: Root-cause follow-up on parity rollout found two deployment blockers and one scope gap: parity scripts depended on unavailable runtime `node_modules` when executed from `/tmp/dist-*`, pre-update parity snapshot attempted to write into root-owned backup directories while running as app user (`EACCES`), and snake_case remediation needed strict ALL-domain enforcement rather than fixed-table subset handling.
- Fix: Reworked parity/remediation scripts to be `psql`-backed (no runtime Node package dependency), moved parity baseline snapshots to scoped writable temp files with cleanup, expanded snake_case remediation to dynamic public-schema discovery with strict unresolved-table failure, and successfully re-ran DEV cloud/onprem updates with active parity gates (`LP-CL-V1.00.198`, `LP-OP-V1.00.221`) plus post-update data/asset parity validation.

## Entry LPLOG-20260407-009
- Timestamp: 2026-04-07 20:50:00 SAST +02:00
- Variant: both
- Issue: During ACC/PRD deployment continuation after all-domain snake_case remediation, update flow still encountered strict-parity edge cases (legacy snake FK drop ordering and parity-regression false positives for expected removed snake tables), leaving rollout closure incomplete and cross-environment verification docs unfinished.
- Fix: Added deferred iterative snake-table drop handling to resolve FK ordering safely, updated parity verify logic to ignore expected snake_case table removals after convergence, completed successful ACC+PRD rollout for cloud (`LP-CL-V1.00.205`) and onprem (`LP-OP-V1.00.222`) with healthy post-checks, and finalized TODO closure for DEV/ACC/PRD cloud+onprem parity enforcement.

## Entry LPLOG-20260408-001
- Timestamp: 2026-04-08 11:48:00 SAST +02:00
- Variant: both
- Issue: Full landscape updates still exhibited recurring operational friction: dependency install step re-ran unnecessarily across stages, parity checks lacked deterministic in-pipeline remediation for safe functional drift cleanup, and warning semantics made operator triage noisy.
- Fix: Added dependency-manifest fingerprint gating to installer/update flows so unchanged dependencies are skipped, introduced deterministic schema-contract reconciliation before parity verification (including safe archival of empty extra drift objects), and normalized update messaging severity so expected paths are informational while real ACC/PRD safety failures remain blocking.

## Entry LPLOG-20260408-002
- Timestamp: 2026-04-08 11:48:30 SAST +02:00
- Variant: both
- Issue: Landscape rollout confidence remained incomplete without a fresh end-to-end validation pass after updater hardening, including prior onprem asset-export integrity failures and cloud/onprem parity rollback concerns.
- Fix: Executed full DEV->ACC->PRD one-click rollouts for cloud and onprem with snapshots in place, confirmed package deployment success and healthy post-checks on all stages, verified no recurrence of onprem missing-asset export failures, and validated no functional schema parity rollback failures during promotion.

## Entry LPLOG-20260408-003
- Timestamp: 2026-04-08 12:18:00 SAST +02:00
- Variant: both
- Issue: License-domain outage was caused by migration architecture drift: baseline-only package migration selection truncated post-baseline migrations and stale schema contracts allowed required sync-auth columns to be absent at runtime, breaking enterprise customer/license screens and onprem check-in flows.
- Fix: Hardened cloud/onprem build migration packaging to ship baseline plus all subsequent delta migrations with complete journal entries, added build-time critical schema guards for enterprise sync-auth columns, and added onprem cloud-sync request fallback from per-system auth to shared bootstrap auth to self-recover stale credential mismatches.

## Entry LPLOG-20260408-004
- Timestamp: 2026-04-08 12:19:00 SAST +02:00
- Variant: both
- Issue: DEV source-of-truth databases were missing `enterpriseSystems` sync-auth columns required by runtime license/auth flows, causing repeated runtime exceptions and signature failures.
- Fix: Applied migration `0086_onprem_system_sync_credentials.sql` to cloud DEV and onprem DEV databases and verified all required sync-auth columns exist so packaging and promotion can proceed from corrected DEV schema state.

## Entry LPLOG-20260408-005
- Timestamp: 2026-04-08 12:42:00 SAST +02:00
- Variant: both
- Issue: Updater functional parity checks still hard-failed on ACC/PRD when customer-owned extra `public` tables/columns existed because checks were scoped to full-schema totals/signatures instead of package-owned functional scope; migration reconciliation also produced avoidable first-pass fail/retry churn on unknown journal entries.
- Fix: Updated cloud/onprem build contracts to emit canonical core table scope metadata, switched updater functional parity verification to core-scope minimum checks/signature validation (tolerating extra customer structural objects), and hardened migration runner to auto-reconcile unknown journal entries in standard mode with an explicit strict-mode override (`LEARNPLAY_MIGRATION_STRICT_UNKNOWN_JOURNAL=true`).

## Entry LPLOG-20260409-001
- Timestamp: 2026-04-09 17:17:26 SAST +02:00
- Variant: both
- Issue: Theme/white-label reliability regressed after a failed repo-wide gradient codemod left `client/src` source files malformed, and AI palette synthesis could hard-fail when integration-secret decryption/config was unavailable instead of degrading safely.
- Fix: Restored corrupted `client/src` files from canonical source state, retained and validated enhanced contrast-coverage parity logic, hardened AI palette synthesis to fall back deterministically when Gemini key retrieval fails, and increased compile-time contrast remediation passes to improve first-pass accessibility convergence for palette apply flows.

## Entry LPLOG-20260409-002
- Timestamp: 2026-04-09 18:25:00 SAST +02:00
- Variant: both
- Issue: Lesson generation/replace flows could fail after successful Gamma generation because PPTX version validation still enforced legacy `/v{n}.pptx` suffixes while storage keys were canonical-hash based; onprem cloud check-ins across non-PRD stages also remained vulnerable to shared-secret authority drift when all check-ins target cloud PRD.
- Fix: Implemented canonical-aware lesson storage-key/version validation with legacy-path compatibility and regression tests, and aligned onprem/cloud shared-signature secret resolution to PRD-authoritative keys/candidates so DEV/ACC/PRD onprem can bootstrap signatures consistently against cloud PRD.

## Entry LPLOG-20260409-003
- Timestamp: 2026-04-09 18:26:00 SAST +02:00
- Variant: both
- Issue: AI palette strict mode could fail even when AI participated, because the selection policy required an AI-mutated anchor winner instead of evaluating candidate participation and accessibility outcomes.
- Fix: Updated strict-mode policy to require valid AI candidate participation rather than forced anchor mutation, preventing false palette build failures when baseline anchors remain the optimal accessible result.

## Entry LPLOG-20260409-004
- Timestamp: 2026-04-09 19:55:00 SAST +02:00
- Variant: both
- Issue: Onprem check-ins still produced `Invalid onprem request signature` in mixed-stage environments because source paths retained fallback to generic shared-secret keys while all onprem check-ins are verified by Cloud PRD.
- Fix: Enforced PRD-only shared-secret authority in runtime signing/verification paths and aligned cloud/onprem installer/update secret wiring to persist and migrate `ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD` as the canonical key.

## Entry LPLOG-20260409-005
- Timestamp: 2026-04-09 19:56:00 SAST +02:00
- Variant: both
- Issue: AI palette strict mode could still false-fail when AI returned valid candidates that overlapped deterministic seeds, because candidate merge logic dropped AI provenance for duplicate hex values.
- Fix: Updated candidate merge behavior to preserve AI provenance on deterministic-overlap colors and added regression coverage to guarantee strict participation checks treat overlapping AI candidates as valid AI input.

## Entry LPLOG-20260409-006
- Timestamp: 2026-04-09 22:35:00 SAST +02:00
- Variant: both
- Issue: Artifact generation/download flows still showed false-missing versions and storage/version guard failures due to inconsistent language normalization (`EN` vs `en`) across write/read selectors, while installer/update paths still retained legacy shared-secret alias fallbacks that could reintroduce non-PRD signature drift.
- Fix: Standardized lesson/presentation language matching to canonical lowercase across store/query/download selectors, hardened podcast completed-version and language selection to case-insensitive matching, ensured presentation signed-download URLs always carry explicit filenames, and removed legacy shared-secret alias fallbacks from cloud/onprem install/update/master-install source flows so PRD-authoritative key usage remains strict.

## Entry LPLOG-20260412-001
- Timestamp: 2026-04-12 17:45:00 SAST +02:00
- Variant: both
- Issue: Course lesson workflow sequencing allowed structural lessons to progress out of order because readiness and CTA gating inferred completion from raw content presence; this let Key Takeaways surface digest actions too early and allowed Overview to unlock before full Key Takeaways completion.
- Fix: Hardened shared cloud/onprem lesson workflow contracts so content prerequisites now require objectives + digest + presentation asset + quiz, Key Takeaways source generation remains gated behind full content completion, Key Takeaways objectives/digest APIs enforce ordered progression, Overview generation now requires full content plus full Key Takeaways completion, and lesson editor CTA sequencing now follows source -> objectives -> digest -> presentation -> quiz.

## Entry LPLOG-20260427-001
- Timestamp: 2026-04-27 17:48:53 SAST +02:00
- Variant: both
- Issue: Full landscape rollout through devtools was blocked by package-build and promotion-gate tooling drift: cloud builds required a managed `/opt/learnplay/cloud/.env` even on WSL DEV, devadmin build/promotion paths did not consistently load the workspace Node runtime, remote localhost database promotion gates were not reliably tunneled, and onprem package asset export missed variant-scoped upload roots.
- Fix: Hardened cloud/onprem build DB URL resolution, loaded Node for devadmin package and promotion-gate paths, switched DB URL host/port parsing to Python so tunnel setup works from root, added variant upload roots to onprem asset export, generated the cloud DEV schema baseline migration, and completed full devtools rollouts with green DEV/ACC/PRD version and schema-count parity for cloud and onprem.

## Entry LPLOG-20260427-002
- Timestamp: 2026-04-27 17:48:53 SAST +02:00
- Variant: both
- Issue: Customer-facing `lppadmin` had health and runtime-version reports but lacked a single rollout verification view equivalent to the devtools compare evidence operators use after deployment.
- Fix: Extended packaged cloud/onprem `lppadmin` parity reporting into a rollout verification command/menu path that includes installed/manifest version, migration table state, and database table/column/enum/constraint/index counts for post-update customer validation.

## Entry LPLOG-20260427-003
- Timestamp: 2026-04-27 21:14:36 SAST +02:00
- Variant: both
- Issue: Lesson viewer language switching could leave translated lessons without a visible slide surface and without an obvious way back to the source language when the selected variant only exposed fallback artifacts.
- Fix: Updated shared lesson viewer state handling so translated-language fallback/pending PPTX states remain renderable, the source-language switch option is recovered from artifact fallback metadata, and the Codex WSL Linux Node test-runner command is documented for future sessions.

## Entry LPLOG-20260428-005
- Timestamp: 2026-04-28 13:58:44 SAST +02:00
- Variant: both
- Issue: Course import still converted a package into normalized rows and replayed them through a raw table-order insert loop, leaving relationship edge cases vulnerable to opaque foreign-key failures.
- Fix: Reworked course import execution into a staged server-built course-domain import plan with pre-execution reference hardening, ordered domain stages for courses/lessons/quizzes/artifacts/version history, and post-import verification before the job completes.

## Entry LPLOG-20260428-006
- Timestamp: 2026-04-28 14:21:45 SAST +02:00
- Variant: both
- Issue: Lesson translation entry blocked admins with “all languages already have translations” even when an imported or partial target-language lesson was missing artifacts such as podcast script/audio, PPTX, quiz, objectives, or digest.
- Fix: Made translation language selection artifact-aware by allowing existing target languages to be selected for update/remediation, using target preflight coverage to enter re-translate mode automatically, and allowing podcast-only remediation to start the wizard.

## Entry LPLOG-20260428-007
- Timestamp: 2026-04-28 15:06:12 SAST +02:00
- Variant: both
- Issue: Translation creation and organization preferred-language dropdowns could be empty after deployment when a runtime database missed or lost the supported-language seed rows.
- Fix: Made the supported-language catalog required platform data in cloud/onprem install and update maintenance paths, added runtime canonical-language fallback for empty/source-only language tables, and routed translation language validation through the language service instead of direct table lookups.

## Entry LPLOG-20260428-008
- Timestamp: 2026-04-28 15:19:25 SAST +02:00
- Variant: both
- Issue: The supported-language update repair could fail on runtimes where historical `supportedLanguages` rows existed without a primary/unique constraint on `code`, because `ON CONFLICT (code)` requires a matching unique or exclusion constraint.
- Fix: Hardened cloud/onprem install and update language repair to de-duplicate language codes, restore the `supportedLanguages_pkey` primary key when missing, and only then upsert the canonical language catalog.

## Entry LPLOG-20260501-001
- Timestamp: 2026-05-01 13:00:00 SAST +02:00
- Variant: both
- Issue: DOCX course creation exposed Word heading sections as a flat outline, so selecting a parent heading did not reliably represent a complete cascading lesson section.
- Fix: Preserved Word heading levels during DOCX extraction, built a parent/child document outline from Heading 1/2/3 levels, made each outline node carry the full subtree content up to the next same-or-higher heading, kept selected outline titles as content lessons even when they mention overview or key takeaways, allowed users to promote sourced lessons into Overview/Key Takeaways roles while deleting empty placeholders, finalized the exact reviewed lesson list instead of a possibly stale autosaved draft copy, handled immediate selected-outline generation completion in the wizard, and recorded original selected source text as immutable V1 lesson source content with clearer V1/V1.1 diff labels.

## Entry LPLOG-20260501-002
- Timestamp: 2026-05-01 14:35:00 SAST +02:00
- Variant: both
- Issue: Screenshot UAT found three follow-up workflow issues: the lesson viewer desktop side rail could not collapse, podcast voice selection did not reliably update speaker display names, and promoted Overview/Key Takeaways lessons with existing source content hid optional structural source generation actions.
- Fix: Added a collapsible desktop lesson viewer side rail, made podcast host/guest voice selections refresh display names immediately while still allowing manual overrides, and kept Generate/Regenerate Overview or Key Takeaways Source DB actions available for structural lessons when prerequisites are ready even if they already contain source material.

## Entry LPLOG-20260501-003
- Timestamp: 2026-05-01 14:58:58 SAST +02:00
- Variant: both
- Issue: Screenshot UAT found that the course category creation input lost focus after each character, showcase marketplace cards could miss the orange showcase badge, and unauthenticated learners could be blocked from starting a public free showcase course.
- Fix: Stabilized the inline category creation form so full names can be typed before saving, made showcase badges use the orange warning badge treatment, required showcase publishing to target a configured showcase department, and aligned public showcase detection so showcase courses and their lessons are available to unauthenticated learners when the course is public and assigned through a showcase scope.

## Entry LPLOG-20260501-004
- Timestamp: 2026-05-01 15:01:57 SAST +02:00
- Variant: both
- Issue: The unauthenticated homepage did not surface public showcase courses directly, so visitors had to browse the marketplace before trying a free showcase course.
- Fix: Added a homepage showcase-course carousel below the hero actions, powered by the public showcase course feed, with orange showcase badges and a “Try now for free” action linking to the public course detail flow.

## Entry LPLOG-20260501-005
- Timestamp: 2026-05-01 15:07:55 SAST +02:00
- Variant: both
- Issue: A department named Showcase was still treated as a normal department unless its hidden showcase flag was set, and the Central Management Hub assignment picker could appear empty because it only listed already-active courses.
- Fix: Treat departments named Showcase as showcase-capable across hierarchy, course publishing, and public showcase detection, automatically mark newly created or renamed Showcase departments, surface a Showcase badge in Central Management Hub, and allow the assignment picker to list non-archived courses so valid drafts can be assigned and auto-published.

## Entry LPLOG-20260501-006
- Timestamp: 2026-05-01 15:20:00 SAST +02:00
- Variant: both
- Issue: Saving a course as Showcase could fail with a duplicate `UNQ_course_assignment_user` error when the course already had a non-user assignment, and the Central Management Hub assign-course picker could route through the generic course detail endpoint.
- Fix: Made course assignment upsert replace the existing non-user course scope before inserting a new one, added regression coverage for normalized replacement data, and moved the Central Management Hub assignable-course picker to a non-conflicting organization endpoint.

## Entry LPLOG-20260501-007
- Timestamp: 2026-05-01 15:28:00 SAST +02:00
- Variant: both
- Issue: The homepage showcase carousel requested only the first eight showcase courses, so additional public showcase courses would not appear on the landing page.
- Fix: Updated the homepage carousel to collect every showcase-course page from the public feed and render the full showcase set.

## Entry LPLOG-20260501-008
- Timestamp: 2026-05-01 15:42:00 SAST +02:00
- Variant: both
- Issue: Course transfer protected-package parsing left the temporary decrypted wrapper directory behind after extracting the authoritative inner payload.
- Fix: Removed the temporary protected-package wrapper directory immediately after payload extraction and added contract coverage so cloud/on-prem export/import clone runs do not accumulate stale transfer files.
