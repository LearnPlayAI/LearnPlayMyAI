# Release And Rollback

Last updated: 2026-04-28
Scope: both

## Promotion Flow
Deployments flow through controlled tooling:
- DEV source workspace
- ACC validation
- PRD promotion

## Package Rules
- Cloud artifacts use the cloud product identity and cloud package lineage.
- Onprem artifacts use the onprem product identity and onprem package lineage.
- Release notes are generated from the global changelog and filtered by scope.

## Rollback Rule
If a target update, installer, or bootstrap fails:
1. Stop immediately.
2. Record target, failing step, and evidence.
3. Request operator snapshot restore.
4. Resume only after restore confirmation or explicit operator approval that no mutation occurred.

## Acceptance Gate
Do not promote if:
- update failed
- health failed
- runtime version is unexpected
- login/admin smoke failed
- unresolved blockers remain

