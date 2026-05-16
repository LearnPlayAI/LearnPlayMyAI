---
name: knowledge
description: "Unified LearnPlay knowledge intake skill. Use this first to ingest core operating standards and canonical platform knowledge files before analysis or implementation."
---

# LearnPlay Knowledge Skill

Use this skill when the user says `$knowledge` (or asks to load platform knowledge first).

## Highest-Priority Rule
Before any analysis, code changes, migrations, tests, deployments, or recommendations:
1. Read `/antigravity/docs/aimem/aimem.md`.
2. Treat `aimem.md` as the highest-priority project development/operations standard.
3. If any request conflicts with `aimem.md`, stop, state the conflict clearly, and propose a compliant path.
4. Do not proceed until the conflict is resolved.

## Intent
Provide one entry point that ingests:
- core operating standards
- handover/runtime facts
- functional source-of-truth docs
- deployment/runtime behavior rules

This enables short prompts such as:
- `$knowledge, Issue, Task`
- `$knowledge, investigate auth regression`
- `$knowledge, implement fix and update docs`

## Mandatory Compact Bootstrap
1. `docs/aimem/aimem.md`
2. `docs/knowledge/KNOWLEDGE_KERNEL.md`
3. `docs/knowledge/KNOWLEDGE_INDEX.md`
4. `docs/landscape/CURRENT_LANDSCAPE.md`
5. `docs/landscape/CLOUD_ONPREM_SCOPE_MAP.md`
6. `docs/handover/CURRENT_HANDOVER.md`

Do not ingest large handover, changelog, archive, generated audit, or legacy repo-local docs by default. Use `docs/knowledge/KNOWLEDGE_INDEX.md` to select task-specific references and search large historical docs only when directly relevant.

## Runtime/Deployment Knowledge Contract (Critical)
When work touches runtime stability, deployment, or memory behavior, explicitly apply:
- Dynamic runtime startup tuning contract (`DEP-F08`) in:
  - `docs/func/Deployment/Deployment_Functionality.md`
  - `docs/landscape/CURRENT_LANDSCAPE.md`
- Changelog traceability in:
  - `docs/changelog/CURRENT_CHANGELOG.md`
  - `docs/handoverdocs/CHANGELOG.md`

## Invocation Contract
If the user starts with `$knowledge`:
1. Enforce the Highest-Priority Rule above.
2. Ingest the compact bootstrap files above first.
3. Return a short "knowledge loaded" summary (scope + key constraints).
4. Then execute the issue/task request.

If `$knowledge` is omitted but task risk is high (deployment/auth/runtime/data):
1. Load the same knowledge baseline before making changes.
2. State that baseline was applied.

## Self-Evolving Knowledge Contract (Mandatory)
`$knowledge` must improve as work progresses. After each completed investigation/fix cycle, persist new durable knowledge.

Durable knowledge categories:
- system architecture and boundaries
- feature/functionality behavior contracts
- auth/permission/scope model behavior
- user journey/route gating behavior
- deployment/runtime/operations contracts

Persistence rules:
1. Add only evidence-backed facts verified from code/runtime behavior.
2. Mark impact scope explicitly: `cloud`, `onprem`, or `both`.
3. Include source anchors (paths/contracts/runtime checks) for traceability.
4. Update `references/KNOWLEDGE_FILES.md` when canonical knowledge map changes.
5. Update canonical docs (`docs/knowledge/*`, `docs/landscape/*`, `docs/func/*`, `docs/handover/*`, `docs/operations/*`, `docs/aimem/aimem.md`) when behavior/standards change.
6. Add changelog traceability in `docs/changelog/CURRENT_CHANGELOG.md` and the compatibility release changelog at `docs/handoverdocs/CHANGELOG.md` for completed change sets.

Output requirement for `$knowledge` tasks:
- Include a concise `Knowledge Delta` summary of newly learned facts and persisted locations.

## Output Expectations
After ingest and before implementation, provide:
- scope (`cloud`, `onprem`, or both)
- key constraints to honor
- root-cause-first plan for the requested task

## Reference Map
See:
- `references/KNOWLEDGE_FILES.md`
