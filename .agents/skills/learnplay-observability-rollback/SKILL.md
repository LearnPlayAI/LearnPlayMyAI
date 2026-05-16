---
name: learnplay-observability-rollback
description: LearnPlay observability, runtime verification, and rollback safety for mutable runtime changes. Use when changes affect active behavior, state propagation, or production diagnostics.
---

# LearnPlay Observability And Rollback

## When To Use
- Use when runtime behavior can drift, stale state can occur, or rollback may be required.

## Required Workflow
1. Ensure structured telemetry for mutations and propagation outcomes.
2. Add stale-read/stale-state diagnostics where applicable.
3. Verify rollback-safe state/version path exists.
4. Define operator recovery runbook for changed domain.

## References
- `references/telemetry-contract.md`
- `references/rollback-checklist.md`
