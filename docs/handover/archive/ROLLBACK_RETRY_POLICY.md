# Rollback and Retry Policy

Status: MUST follow
Last updated: 2026-03-21

## Core Rule
Retry after failure is not allowed until snapshot restore is completed and confirmed.

## Decision Tree
1. Did installer/updater/bootstrap fail?
- yes -> STOP immediately.

2. Was target state mutated?
- yes or uncertain -> restore snapshot.
- no and clearly safe -> operator may approve immediate retry.

3. After restore confirmation:
- apply fix,
- rerun from first safe step,
- document outcome in handoff files.

## Required Documentation for Every Failure
- target (cloud ACC / cloud PRD / onprem ACC / onprem PRD)
- failing command or menu step
- log path
- snapshot requested (yes/no)
- snapshot restored (timestamp)
- retry result

