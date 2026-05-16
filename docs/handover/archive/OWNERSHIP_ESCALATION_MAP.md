# Ownership and Escalation Map

Status: MUST keep current
Last updated: 2026-03-21

## Operational Owners
- Snapshot restore owner: operator/user
- Dev tooling owner: devadmin maintainers
- Runtime tooling owner: lppadmin maintainers
- DNS/Caddy owner: platform/network operator

## Escalation Triggers
Escalate immediately when:
1. DNS or Caddy routing mismatch blocks validation,
2. host access/SSH bootstrap cannot be restored quickly,
3. repeated updater failure persists after restore + fix,
4. data/schema risk is suspected.

## Escalation Record Template
- issue:
- affected target:
- severity:
- owner assigned:
- started at:
- latest status:
- next checkpoint:

