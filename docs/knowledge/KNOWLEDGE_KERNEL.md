# LearnPlay Knowledge Kernel

Last updated: 2026-04-29
Scope: both

## Purpose
This is the compact default knowledge entry point for LearnPlay work. It keeps every AI seat aligned without loading large historical docs by default.

## Highest-Priority Rules
- `/antigravity/docs/aimem/aimem.md` remains the highest-priority operating standard.
- `/antigravity/docs` is the canonical documentation root.
- `/antigravity/Cloud-On-Prem` is the canonical source workspace.
- Source changes must be made in `/antigravity/Cloud-On-Prem`, never by hotpatching installed runtime trees.
- Default implementation and documentation scope is `cloud + onprem` unless the user explicitly narrows scope.
- Recommendations and plans must be grounded in verified code, docs, or runtime evidence.
- For runtime mutation, deployment, installer, updater, or bootstrap failure, stop and require operator snapshot/restore discipline before retry.
- The dev host is WSL-native for LearnPlay workspace execution. Run Node, npm/npx, Jest, TypeScript, package builds, and local app processes inside WSL/Linux, not with Windows-native Node or bundled Codex Windows runtimes.
- User-facing runtime validation is user-deployed and user-tested by default. AI provides source changes, exact manual test steps, and screenshot triage support, and waits for the user to confirm deployment before treating any runtime/browser validation as authoritative.
- Organization-type-specific UI wording must use the shared terminology helpers/components so education, business, and elearning labels stay consistent with the active organization context.

## Required Skill Routing
- Always load `learnplay-core-governance` first for LearnPlay tasks.
- Add `learnplay-ui-ux-tokens` for UI, frontend, styling, branding, theme, or accessibility work.
- Add `learnplay-api-data-contracts` for API, backend, schema, migration, storage, auth, or data contract work.
- Add `learnplay-testing-release-gates` for substantial changes and release-impacting work.
- Add `learnplay-observability-rollback` for mutable runtime behavior, propagation, cache, telemetry, rollback, deployment, or operational diagnostics.

## Current Landscape Anchors
- Current runtime topology: `/antigravity/docs/landscape/CURRENT_LANDSCAPE.md`
- Cloud/onprem boundaries: `/antigravity/docs/landscape/CLOUD_ONPREM_SCOPE_MAP.md`
- Current handover state: `/antigravity/docs/handover/CURRENT_HANDOVER.md`
- Current release state: `/antigravity/docs/handover/RELEASE_STATE.md`
- Operations runbook: `/antigravity/docs/operations/RUNBOOK.md`
- Disaster recovery guide: `/antigravity/docs/operations/DR_GUIDE.md`
- Functional behavior docs: `/antigravity/docs/func/<Domain>/<Domain>_Functionality.md`
- Testing index: `/antigravity/docs/testing/TESTING_INDEX.md`

## Retrieval Policy
- Load this kernel and current landscape docs by default.
- Use `/antigravity/docs/knowledge/KNOWLEDGE_INDEX.md` to choose task-specific references.
- Search large historical docs instead of ingesting them wholesale.
- Do not load archive, changelog history, old handover packs, generated audits, or legacy test-case books unless directly relevant to the task.

## Documentation Hygiene Rules
- Active docs describe current truth only.
- Historical material lives under an `archive/` folder.
- Generated audits, temporary inventories, and superseded migration notes do not belong in active knowledge paths.
- Large docs need a compact index or summary before they can become default knowledge.
- When durable platform facts change, update the compact current docs first, then archive/reference docs as needed.
