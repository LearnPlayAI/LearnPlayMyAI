---
name: core-governance
description: "Apply mandatory cross-cutting engineering governance for all tasks: preflight doc reading, root-cause discipline, safe/idempotent implementation, docs/tests lockstep, explicit completion checks, and required changelog/handover maintenance after each completed change set."
---

# Core Governance Skill

Apply this skill to every task, regardless of domain.

## Mandatory Startup
1. Read `docs/aimem/aimem.md` before analysis/planning/coding.
2. For `$knowledge` or platform-context bootstraps, read `docs/knowledge/KNOWLEDGE_KERNEL.md` and `docs/knowledge/KNOWLEDGE_INDEX.md`; do not load archive or legacy handover docs by default.
3. Read task-relevant skills listed in `.skills/SKILLS_INDEX.md`.

## Implementation Discipline
- Reproduce issues and identify evidence-based root cause before fixing.
- Prefer permanent fixes over workarounds.
- Default to safe, idempotent, backward-compatible changes.
- Update tests and behavior docs in same change set when behavior changes.
- Do not create/update `*_Functionality_TESTING.md` files unless the user explicitly requests it.

## Mandatory Completion Actions
Before marking a task complete:
1. Run relevant validation/checks.
2. Summarize what changed, why, and remaining risks.
3. Perform post-change docs tasks in `docs/func/README.md` when applicable.
4. Update changelog/handover records.
5. If user is executing manual UAT, provide/refresh deterministic retest steps and keep defect status explicit (`fixed-awaiting-retest` vs `closed`).
6. Always provide a reusable screenshot-analysis prompt template in the completion message for follow-up defect cycles.

## Changelog Rule (Required)
After each completed change set, update:
- `docs/handoverdocs/CHANGELOG.md` (mandatory)
- `docs/changelog/CURRENT_CHANGELOG.md` when the change affects current release-train context

If task scope also uses another changelog file, update that too.

Do not mark the task complete without explicit confirmation that changelog update(s) were done (or a clear reason why not applicable).
