# Snapshot Registry

Status: MUST maintain
Last updated: 2026-03-27 10:56 SAST

This file tracks snapshot restore points and restore triggers.

## Snapshot Catalog
| Target | Clean OS Snapshot | Fresh App Install Snapshot | Latest Known Good Snapshot | Restore Owner |
|---|---|---|---|---|
| cloud DEV | available (operator-managed) | n/a | available (host-level + DB backups) | operator |
| onprem DEV | available (operator-managed) | n/a | available (host-level + DB backups) | operator |
| cloud ACC | operator-managed | operator-managed | pending revalidation after next deploy | operator |
| cloud PRD | operator-managed | operator-managed | pending revalidation after next deploy | operator |
| onprem ACC | operator-managed | operator-managed | pending revalidation after next deploy | operator |
| onprem PRD | operator-managed | operator-managed | pending revalidation after next deploy | operator |

## Recent Snapshot/Backup Notes
- Current seat focused on source/handover consistency; no destructive runtime operations executed.
- Podcast/source-content work introduces multi-step draft state changes; keep DB backup before bulk retry/regression on production-like targets.
- If runtime update/migration fails: snapshot restore remains mandatory before retry.

## Mandatory Restore Triggers
A restore is REQUIRED before retry when:
1. installer fails,
2. updater fails,
3. bootstrap fails after partial state mutation,
4. schema or runtime integrity becomes uncertain.

## Restore Confirmation Format
Use this confirmation in handoff notes:
- target:
- snapshot type:
- restore completed at:
- confirmed by:

