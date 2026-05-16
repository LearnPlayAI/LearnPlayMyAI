---
name: knowledge
description: Unified LearnPlay knowledge intake skill. Load this first when the user says "$knowledge" so core operating standards and canonical platform knowledge are ingested before task execution.
---

# LearnPlay Knowledge Skill

## Highest-Priority Rule
Before any analysis, code changes, migrations, tests, deployments, or recommendations:
1. Read `/antigravity/docs/aimem/aimem.md`.
2. Treat `aimem.md` as the highest-priority project development/operations standard.
3. If any request conflicts with `aimem.md`, stop, state the conflict clearly, and propose a compliant path.
4. Do not proceed until the conflict is resolved.

## Absolute Evidence Rule (Top Priority)
1. All recommendations and implementation plans MUST be grounded in verified facts from code paths and/or runtime evidence.
2. No guessing, no assumption-led recommendations, and no speculative fixes are allowed.
3. For UI/runtime behavior, browser-based verification evidence is mandatory when required to validate findings or solutions.
4. Use tester-assisted browser runs when UI steps are required and cannot be accurately validated from static code inspection alone.
5. No runtime testing can be done before the user has deployed the changes and explicitly confirmed deployment to the target runtime(s).

## When To Use
- The user explicitly says `$knowledge`.
- The task is high-risk (runtime, deployment, auth, data integrity) and a knowledge baseline is required.

## Mandatory Compact Bootstrap
1. `/antigravity/docs/aimem/aimem.md`
2. `/antigravity/docs/knowledge/KNOWLEDGE_KERNEL.md`
3. `/antigravity/docs/knowledge/KNOWLEDGE_INDEX.md`
4. `/antigravity/docs/landscape/CURRENT_LANDSCAPE.md`
5. `/antigravity/docs/landscape/CLOUD_ONPREM_SCOPE_MAP.md`
6. `/antigravity/docs/handover/CURRENT_HANDOVER.md`

Do not ingest large handover, changelog, archive, generated audit, or legacy repo-local docs by default. Use the knowledge index to select task-specific references and search large historical docs only when directly relevant.

## Invocation Protocol
For prompts in the form:
- `$knowledge, Issue, Task`

Required behavior:
1. Enforce the Highest-Priority Rule above.
2. Ingest the compact bootstrap files above first.
3. Confirm a short knowledge-loaded baseline.
4. Execute issue/task with root-cause-first discipline.

## Self-Evolving Knowledge Protocol (Mandatory)
`$knowledge` is a living system. After each completed investigation/fix cycle, update knowledge artifacts when new durable facts are discovered.

Durable facts include:
- platform/system architecture facts
- feature/functional behavior facts
- auth/role/scope model facts
- user journey and route-access behavior facts
- deployment/runtime/operational contract facts

Update rules:
1. Only add fact-grounded content verified from code/runtime evidence (no guesses).
2. Tag each new fact with explicit scope impact: `cloud`, `onprem`, or `both`.
3. Record concrete source anchors (file paths, contracts, or runtime evidence point).
4. Update `.skills/knowledge/references/KNOWLEDGE_FILES.md` when canonical references change.
5. Update relevant canonical docs (`docs/knowledge/*`, `docs/landscape/*`, `docs/func/*`, `docs/handover/*`, `docs/operations/*`, `docs/aimem/aimem.md`) when behavior/standards changed.
6. Add changelog traceability in `docs/changelog/CURRENT_CHANGELOG.md` and the compatibility release changelog at `docs/handoverdocs/CHANGELOG.md` for completed change sets.

Response contract for `$knowledge` tasks:
- Include a short `Knowledge Delta` section summarizing what was learned and where it was persisted.

## Critical Runtime Contract
For memory/runtime/deploy work, apply:
- `DEP-F08` in `/antigravity/docs/func/Deployment/Deployment_Functionality.md`
- Runtime Memory and Pool Tuning Contract in `/antigravity/docs/landscape/CURRENT_LANDSCAPE.md`
- Changelog traceability in `/antigravity/docs/changelog/CURRENT_CHANGELOG.md` and `/antigravity/docs/handoverdocs/CHANGELOG.md`

## WSL-Native Dev Host Contract
- The LearnPlay dev host runs the workspace and project Node tooling inside WSL/Linux, not the Windows-native environment.
- ALWAYS use the workspace WSL runtime for LearnPlay commands. NEVER assume a generic shell PATH is valid for LearnPlay work.
- Run Jest, TypeScript, npm/npx, package builds, and local app supervision from the WSL shell with WSL Node.
- Prefix LearnPlay Node/npm/npx commands with the known WSL Node path when needed: `export PATH=/home/lppadmin/.nvm/versions/node/v20.20.2/bin:$PATH`.
- Do not use bundled Codex Windows Node paths such as `C:\Users\...\codex-runtimes` for LearnPlay repo tests; Windows Node can resolve `/antigravity/Cloud-On-Prem` as `\\wsl.localhost\...` and break Jest/ts-jest module resolution.
- If `node`, `npm`, or `npx` are not available in the shell, activate/install WSL Node with `bash scripts/dev-workspace/bootstrap-wsl-dev.sh node` before testing. Current known WSL Node path: `/home/lppadmin/.nvm/versions/node/v20.20.2/bin/node`.

## Deployment Package Schema Parity Contract
- Scope: both cloud and onprem.
- Before any deployment package is built, verify that the source database schema matches the source schema contract.
- If schema drift exists, the deployment package MUST include the required migrations for both Cloud and OnPrem before the package is produced.
- Do not rely only on the runtime migration journal; verify concrete tables, columns, enums, and other schema contract objects against the actual database state.
- Package `schema-full.sql` must be generated only after required schema drift has been reconciled, so fresh installs and runtime updates both carry the same complete contract.
