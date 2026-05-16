---
name: learnplay-api-data-contracts
description: LearnPlay API, data, migration, and contract discipline. Use for backend routes/services/storage/schema changes and cross-layer consistency checks.
---

# LearnPlay API/Data Contracts

## When To Use
- Use for route/service/storage/schema/migration and cross-layer contract changes.

## Required Workflow
1. Trace read/write paths and scope resolution.
2. Enforce naming and schema alignment.
3. Ensure idempotent, state-aware migration/update behavior.
4. Verify mutable-domain coherence (invalidate/refetch/read freshness).
5. Add or update regression tests for changed contracts.

## References
- `references/contract-checklist.md`
- `references/migration-safety.md`
