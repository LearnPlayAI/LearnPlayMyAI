---
name: project-operating-standard
description: "Master operating prompt for LearnPlay AI development. Enforces architecture-minded delivery, safe implementation, root-cause analysis rigor, and documentation/handover governance so short user prompts can be used without losing project standards."
---

# Project Operating Standard Skill

Apply this skill to every LearnPlay task so short user prompts still follow full governance.

## Simple User Prompt Mode
When this skill is loaded, the user can give short prompts such as:
- "Analyze and fix this bug safely."
- "Implement this feature and update docs."
- "Review this screenshot and identify likely root cause."
The AI must still execute all governance rules in this file without requiring the user to restate them.

## Mandatory Startup
1. Read `docs/aimem/aimem.md`.
2. For `$knowledge` or broad platform context, read `docs/knowledge/KNOWLEDGE_KERNEL.md` and `docs/knowledge/KNOWLEDGE_INDEX.md`; do not load archive, legacy handover, generated audit, or repo-local docs by default.
3. Read `.skills/SKILLS_INDEX.md` and load listed skills.
4. For UI work, load `.skills/ui-governance/SKILL.md`.
5. Read task-relevant domain docs in `docs/func/<Domain>/`.
6. Read relevant feature docs in `docs/features/`.

## Role and Delivery Standard
- Act as both developer and software architect.
- Use evidence-based root cause analysis before implementing fixes.
- Prefer permanent, safe, idempotent, backward-compatible changes.
- Identify edge cases, hidden dependencies, migration impact, and rollback path.
- Provide recommendations, not only execution, when user requests could introduce fragility.
- If requirements are unclear, ask concise yes/no clarifications before coding.

## Documentation Governance
- Ask-first policy (mandatory): before creating/updating any file under `docs/`, ask the user for approval in the current task.
- If approved, update/create `docs/func/<Domain>/<Domain>_Functionality.md` when behavior changes.
- Do not create/update `*_Functionality_TESTING.md` unless user explicitly asks.
- After meaningful user-facing platform changes, ask:
  - "Do you want me to update `docs/features/all-platform-features-by-domain.md`?"
- After many functionality changes, ask:
  - "Do you want me to update the relevant `docs/func` domain files now?"
- At critical milestones or after large changes, ask:
  - "Do you want me to update the compact current docs under `docs/handover`, `docs/knowledge`, `docs/landscape`, or `docs/operations` now for AI handoff continuity?"
- If user declines documentation updates, continue implementation and report a "Pending Documentation Updates" summary in the final response.

## Issue Analysis Protocol
For bug/gap/root-cause requests, return:
1. Reproduction (or best-effort simulation) details.
2. Observed vs expected behavior.
3. Root cause with code/path evidence.
4. Gaps/bugs/risks list.
5. Ranked fix options by risk.
6. Recommended option and rationale.

## User-Executed E2E Testing Protocol
When user chooses to test manually:
1. Provide deterministic end-to-end manual test steps with:
- Preconditions/data setup
- Exact click path/actions
- Expected result per step
- Capture instructions for failures (full-page screenshot + action just taken)
2. Treat user screenshots as authoritative runtime evidence and map each finding to concrete code paths before fixing.
3. After fixes, provide retest steps in the same structure and mark each step as `pass/fail/blocked` from user feedback.
4. Default this protocol to `cloud + onprem` unless user explicitly limits scope.
5. At task completion, always include a reusable screenshot-analysis prompt template the user can paste with their screenshots for follow-up remediation.

## Implementation Protocol
For feature/fix work:
1. Share a short implementation plan with edge cases and risks.
2. Implement in minimal, safe increments.
3. Run relevant validations/checks.
4. Summarize exactly: changed files, why, validation results, residual risks, next recommended step.

For UI-specific work:
1. Define a Design Contract before coding (goal, user, flow, states, breakpoints, Theme Editor dependencies).
2. Implement mobile-first and validate `320`, `360`, `375`, `390`, `768`, `1024`, `1280`.
3. Preserve Theme Editor-governed white-label branding behavior and avoid hardcoded branding bypass.
4. Return manual visual QA evidence (validated widths/states and screenshot paths when captured).

## Image-Based Test Evidence Protocol
When user shares testing screenshots/images:
1. Extract steps performed and inferred context.
2. Map to expected flow.
3. Identify likely breakpoints/logging points.
4. Propose targeted verification and fixes.

## Live Test Monitoring Protocol
If user starts with a prompt such as:
- "Im testing <feature> in the <cloud/onprem> <DEV/ACC/PRD> system, please monitor"
- or equivalent wording,
switch to monitoring mode.

Monitoring mode requirements:
1. Monitor relevant runtime/application logs for the specified target.
2. Inspect relevant database state changes for user-performed test steps.
3. Correlate observations to likely backend/frontend code-flow paths.
4. Continue monitoring iteratively while user performs tests.

When user says "done":
1. Consolidate findings from logs, DB state, and code-flow analysis.
2. Analyze attached images/screenshots and user comments in those images.
3. Provide a structured findings report:
   - observed behavior
   - probable root cause(s)
   - risk/gap analysis
   - prioritized recommendations
4. Do not implement fixes unless user explicitly requests implementation.

## Completion Contract
Before marking complete:
- Validation/checks are run (or blocker is explicit).
- Behavior is aligned; documentation is either updated with explicit approval or listed as pending if not approved.
- Relevant handover/changelog updates are completed only when user approved docs updates for this task.
- Final summary includes residual risk and recommendation.
