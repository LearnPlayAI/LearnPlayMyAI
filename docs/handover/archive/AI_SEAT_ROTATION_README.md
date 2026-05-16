# AI Seat Rotation Documentation Pack

Purpose: enable a new AI developer seat to resume work with full context in minutes.

## Mandatory Rule
Every new AI seat MUST start with `docs/handoverdocs/START_HERE.md` and follow that protocol exactly.
Before implementation work, every seat MUST consult `docs/aimem/aimem.md`.

## Functional Documentation Continuity (Mandatory)
- Functional capability docs live in `docs/func`.
- Contribution and maintenance guide: `docs/func/README.md`.
- Seat-rotation functional docs protocol: `docs/handoverdocs/FUNCTIONAL_DOCS_PROTOCOL.md`.
- Testing gate rule: do not ask the user to test feature behavior until:
  - `<Domain>_Functionality.md` is updated for changed behavior, and
  - current validation steps are provided in-session (or in an explicitly requested document).
- Legacy note: `*_Functionality_TESTING.md` files may remain for history but are not maintained unless explicitly requested.
- Durable "remember this long-term" requests must be written to `docs/aimem/aimem.md`.

## UI Branding Continuity (Mandatory)
- LearnPlay UI is white-label aware and branding-sensitive across pages.
- For any UI creation/modification, follow Theme Editor-governed tokens/assets and organization branding rules.
- Do not introduce hardcoded colors/fonts/branding values that bypass Theme Editor behavior.
- Keep UI theming and branding consistent across affected pages and responsive breakpoints.

## Live Test Monitoring Continuity (Mandatory)
- When user requests live monitoring for active testing, AI must monitor logs, relevant DB state, and likely code-flow during user test execution.
- Trigger example: "Im testing <feature> in the <cloud/onprem> <DEV/ACC/PRD> system, please monitor".
- AI must remain in monitoring mode until the user indicates completion (for example, "done").
- After user completion, AI must provide findings and recommendations using logs + DB + code-flow correlation, and include analysis of user-provided images/comments.

## Scope Labels (must always be explicit)
- cloud DEV
- cloud ACC
- cloud PRD
- onprem DEV
- onprem ACC
- onprem PRD

Never use ambiguous labels like only `ACC` or only `PRD`.

## Default Variant Scope (Mandatory)
- For implement/fix/enhance requests, default scope is both variants: `cloud` and `onprem`.
- Only limit to a single variant when user explicitly says `only cloud` or `only onprem` (or equivalent explicit wording).

## STACK-DEV Host Context (must be explicit in handover)
- Host: `learnplay-stack-dev` (STACK-DEV control plane)
- Local runtimes:
  - cloud DEV at `/opt/learnplay/cloud` (service `learnplay-cloud`)
  - onprem DEV at `/opt/learnplay/onprem` (service `learnplay-onprem`)
- Remote targets from this host:
  - cloud ACC/cloud PRD
  - onprem ACC/onprem PRD
- Tool boundaries:
  - `devadmin`: build/artifacts, target/bootstrap, remote orchestration
  - `lppadmin`: runtime admin, health/version/patch/update

## Global Safety Rule
If any installer/updater/bootstrap step fails on any target host:
1. Stop immediately.
2. Ask for snapshot restore of affected host.
3. Continue only after restore is confirmed complete.

## Files in this Pack
1. `START_HERE.md`
- mandatory onboarding and maintenance protocol.

2. `TECHNICAL_LANDSCAPE.md`
- topology, host map, URL map, routing model, invariants.

3. `TARGET_RUNTIME_FACTS.md`
- authoritative runtime facts table per target.

4. `KNOWN_GOOD_VERSION_MATRIX.md`
- installed versions and last good package per target.

5. `SNAPSHOT_REGISTRY.md`
- restore points and restore trigger policy.

6. `FAILURE_SIGNATURE_CATALOG.md`
- known failure signatures and triage guidance.

7. `COMMAND_RUNBOOK.md`
- copy/paste commands and menu flows.

8. `ACCEPTANCE_CRITERIA.md`
- pass/fail gates for ACC and PRD.

9. `ROLLBACK_RETRY_POLICY.md`
- retry/restore decision tree.

10. `OWNERSHIP_ESCALATION_MAP.md`
- who owns what and when to escalate.

11. `TECHNICAL_SECRETS_TEMPLATE.md`
- secret structure template for local/private fill.

12. `CLOUD_VS_ONPREM.md`
- business and technical differences between variants.

13. `ADMIN_TOOLS_OVERVIEW.md`
- purpose and usage boundaries for `devadmin` and `lppadmin`.

14. `DEVELOPMENT_LIFECYCLE.md`
- end-to-end practices across build, test, promotion, and recovery.

15. `AI-HANDOFF.md`
- human-friendly current state and next actions.

16. `AI-STATE.json`
- machine-readable state for fast context ingestion.

17. `AGENT_BOOTSTRAP_CHECKLIST.md`
- quick startup checklist.

18. `FUNCTIONAL_DOCS_PROTOCOL.md`
- handover continuity rules for `docs/func` and documentation gates.

## End-of-Seat Checkpoint (required)
Update at minimum:
- `docs/handoverdocs/AI-HANDOFF.md`
- `docs/handoverdocs/AI-STATE.json`

Also update impacted operational docs from this pack whenever session changes them.

## Suggested Session-Start Prompt
```text
Ingest docs/handoverdocs/START_HERE.md and follow it exactly.
Then ingest AI-HANDOFF.md and AI-STATE.json and restate goals, completed work, blockers, and next 3 actions.
Treat this host as STACK-DEV control plane (learnplay-stack-dev) with local cloud DEV/onprem DEV runtimes and remote cloud ACC/cloud PRD/onprem ACC/onprem PRD orchestration.
Always use explicit labels (cloud DEV, cloud ACC, cloud PRD, onprem DEV, onprem ACC, onprem PRD).
If any installer/updater/bootstrap step fails, stop and request snapshot restore before retry.
```
