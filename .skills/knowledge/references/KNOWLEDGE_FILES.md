# LearnPlay Knowledge Files

This map is the canonical quick-reference for `$knowledge`.

## Compact Default Bootstrap
- `docs/aimem/aimem.md`
- `docs/knowledge/KNOWLEDGE_KERNEL.md`
- `docs/knowledge/KNOWLEDGE_INDEX.md`
- `docs/landscape/CURRENT_LANDSCAPE.md`
- `docs/landscape/CLOUD_ONPREM_SCOPE_MAP.md`
- `docs/handover/CURRENT_HANDOVER.md`

## Core Operating Standards
- `.skills/SKILLS_INDEX.md`
- `.skills/core-governance/SKILL.md`
- `.skills/project-operating-standard/SKILL.md`

## Handover and Runtime Facts
- `docs/handover/CURRENT_HANDOVER.md`
- `docs/handover/RELEASE_STATE.md`
- `docs/landscape/CURRENT_LANDSCAPE.md`
- `docs/operations/RUNBOOK.md`
- `docs/operations/RELEASE_AND_ROLLBACK.md`
- `docs/changelog/CURRENT_CHANGELOG.md`
- `docs/handoverdocs/CHANGELOG.md` (compatibility path used by existing release tooling)

## Functional Source of Truth
- `docs/func/README.md`
- `docs/func/Deployment/Deployment_Functionality.md`
- domain files: `docs/func/<Domain>/<Domain>_Functionality.md`

## Testing Source of Truth
- `docs/testing/TESTING_INDEX.md`
- `docs/testing/current/`

## Searchable Historical Reference
- `docs/archive/ARCHIVE_INDEX.md`
- `docs/archive/`
- `docs/handover/archive/`
- `docs/testing/archive/`
- `docs/func/archive/`
- `docs/archive/repo-docs/`

## Dynamic Runtime Memory Knowledge
- Deployment functional contract: `DEP-F08` in `docs/func/Deployment/Deployment_Functionality.md`
- Current landscape contract: section `Runtime Memory And Pool Tuning` in `docs/landscape/CURRENT_LANDSCAPE.md`
- Release log entries: `docs/changelog/CURRENT_CHANGELOG.md` and `docs/handoverdocs/CHANGELOG.md`

## Roles and Org-Type Knowledge
- Canonical role map by org type: `.skills/knowledge/references/ROLE_SYSTEMTYPE_MATRIX.md`

## Knowledge Evolution Contract
- `$knowledge` is self-evolving and must be updated when new durable facts are discovered.
- Durable facts must be:
  - evidence-backed (code/runtime verified)
  - scope-labeled (`cloud`, `onprem`, `both`)
  - traceable to source anchors (path/contract/check)
- Update targets when applicable:
  - this file (`KNOWLEDGE_FILES.md`) for canonical map/index changes
  - `docs/knowledge/KNOWLEDGE_INDEX.md` for compact routing changes
  - `docs/func/<Domain>/<Domain>_Functionality.md` for behavior contracts
  - `docs/landscape/*.md`, `docs/handover/*.md`, and `docs/operations/*.md` for runtime/operational architecture facts
  - `docs/aimem/aimem.md` for durable cross-cutting standards
  - `docs/changelog/CURRENT_CHANGELOG.md` and `docs/handoverdocs/CHANGELOG.md` for completed-cycle traceability
