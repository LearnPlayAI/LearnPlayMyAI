# START HERE (MANDATORY)

Read this first before making any runtime or code changes.

## Mandatory Read Order
1. `docs/handoverdocs/AI_SEAT_ROTATION_README.md`
2. `docs/aimem/aimem.md`
3. `docs/handoverdocs/FUNCTIONAL_DOCS_PROTOCOL.md`
4. `docs/func/README.md`
5. `docs/handoverdocs/AI-HANDOFF.md`
6. `docs/handoverdocs/AI-STATE.json`
7. `docs/handoverdocs/TARGET_RUNTIME_FACTS.md`
8. `docs/handoverdocs/KNOWN_GOOD_VERSION_MATRIX.md`
9. `docs/handoverdocs/SNAPSHOT_REGISTRY.md`
10. `docs/handoverdocs/COMMAND_RUNBOOK.md`
11. `docs/handoverdocs/CHANGELOG.md`

## Immediate Scope Reminder
This host is `learnplay-stack-dev` and is the local control plane for:
- cloud DEV (`/opt/learnplay/cloud`, app port `8000`)
- onprem DEV (`/opt/learnplay/onprem`, app port `9000`)

Remote targets (`cloud ACC`, `cloud PRD`, `onprem ACC`, `onprem PRD`) are separate hosts.

## Current Runtime Snapshot (as of 2026-03-27)
- cloud DEV: `LP-CL-V1.00.063`, git `4843148`, healthy
- onprem DEV: `LP-OP-V1.00.073`, healthy

## Safety Rules
1. Always use explicit labels: `cloud DEV`, `cloud ACC`, `cloud PRD`, `onprem DEV`, `onprem ACC`, `onprem PRD`.
2. Never mix cloud/onprem scope.
3. Default implementation scope is both variants (`cloud` + `onprem`) unless user explicitly restricts to one variant.
4. If installer/update/bootstrap fails on any target: stop, request snapshot restore, continue only after confirmation.
5. Do not ask for functional testing before docs in `docs/func` are updated for changed behavior and current validation steps are provided.
6. For any UI change, preserve white-label/theme consistency and use Theme Editor-governed branding tokens/assets (no hardcoded branding bypass).
7. For user-requested live testing sessions, run monitoring mode (logs + DB + code-flow), then produce findings/recommendations after user says "done", including attached image/comment analysis.

## Required Handover Maintenance
When seat rotation is requested, update all required handover files in one session and keep them mutually consistent.
