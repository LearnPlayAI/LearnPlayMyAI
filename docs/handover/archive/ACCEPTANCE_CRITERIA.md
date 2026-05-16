# Acceptance Criteria

Status: MUST satisfy before promotion/closure
Last updated: 2026-03-21

## ACC Acceptance (per scope)
A change is ACC-accepted only if all pass:
1. update completed without critical errors,
2. runtime-version command returns expected version,
3. health command passes required checks,
4. basic login/admin smoke test passes,
5. no unresolved blockers in handoff notes.

## PRD Acceptance (per scope)
A change is PRD-accepted only if all pass:
1. ACC acceptance was completed for same package lineage,
2. PRD update completed cleanly,
3. runtime-version and health checks pass,
4. core user flow smoke test passes,
5. handoff files updated with final state.

## Rejection Rule
If any acceptance criterion fails:
- mark status FAIL,
- request snapshot restore before retry,
- do not promote further.

