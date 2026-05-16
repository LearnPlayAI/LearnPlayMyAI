# Licensing Functionality Testing

## About
This document defines the current regression and acceptance tests for automated LearnPlay licensing across onprem DEV/ACC/PRD and cloud PRD SuperAdmin licensing management.

Manual request/export/import operation tests are retired as primary flow tests.

## Functional Feature Index
- `LIC-T01`: Automated cloud sync bootstrap (no manual lifecycle path)
- `LIC-T02`: Track-bound enforcement (DEV/ACC/PRD)
- `LIC-T03`: Business profile completeness, reissue gates, and banner reason behavior
- `LIC-T04`: Billing-aware auto-approval rules
- `LIC-T05`: SuperAdmin policy save/persist/hydrate
- `LIC-T06`: Monthly fee decimal delimiter and 2-decimal behavior
- `LIC-T07`: Manual activate/deactivate and immediate propagation
- `LIC-T08`: Customer suspension cascades to all systems
- `LIC-T09`: Enterprise customer list track badges
- `LIC-T10`: Per-system royalty policy behavior

## Preconditions
- Test environments available per track:
  - DEV (`development`)
  - ACC (`qa`)
  - PRD (`production`)
- Onprem admin access and cloud SuperAdmin access available.
- Shared push secret configured for immediate push tests.
- At least one enterprise customer with systems in cloud PRD.

## Detailed Test Steps

### LIC-T01: Automated cloud sync bootstrap
1. Open onprem License Management on a system without valid local license.
2. Complete and save Business Information (Cloud Sync).
3. Confirm check-in executes and cloud request is created/updated.
4. For zero-cost policy system, run check-in and confirm license is issued and installed automatically.

Expected result:
- No manual export/import action is required for normal lifecycle.
- Zero-cost systems can bootstrap license through cloud sync + check-in.

### LIC-T02: Track enforcement
1. Validate each track only accepts matching license payload (`development`, `qa`, `production`).
2. Attempt mismatched track and identity data (hardware key / hostname mismatch).

Expected result:
- Mismatched track or identity is rejected.
- Only valid matching payload is accepted.

### LIC-T03: Business profile and reissue gating
1. Save incomplete business profile and attempt check-in.
2. Complete profile and save again.
3. Trigger identity-changing update requiring reissue and attempt check-in.
4. Observe unlicensed/restricted banner reason output.

Expected result:
- Incomplete profile blocks check-in.
- Reissue-required state blocks check-in.
- Banner/state reason communicates why licensing is blocked.

### LIC-T04: Billing-aware approval rules
1. In cloud customer detail, set monthly fee = `0.00` for a system and billing status `due`.
2. Run onprem check-in.
3. Set monthly fee > `0.00` and billing status `due` for another system.
4. Run onprem check-in.
5. Change billing status to `paid` (or `waived`) and run check-in again.

Expected result:
- Zero-fee system auto-licenses.
- Paid-fee + not-settled does not auto-activate.
- Paid/waived allows activation flow per policy.

### LIC-T05: Policy persistence/hydration
1. In cloud customer detail, edit per-system:
  - Monthly Fee
  - Currency
  - Grace Days
  - Billing Status
  - Auto-Approve Renewals
2. Click Save Policy.
3. Refresh and reopen details.

Expected result:
- Saved values persist and reload correctly.
- UI shows saved values instead of old defaults.

### LIC-T06: Decimal delimiter and 2-decimal behavior
1. Enter Monthly Fee using comma delimiter (example `7000,50`) and save.
2. Enter Monthly Fee using dot delimiter (example `7000.50`) and save.
3. Verify reloaded field formatting.

Expected result:
- Both comma and dot inputs are accepted.
- Stored/displayed policy value is normalized to 2 decimals.
- 4-decimal user input style is no longer required for policy entry.

### LIC-T07: Manual activate/deactivate
1. In customer detail system card, click Deactivate License and enter reason.
2. Verify onprem reflects deactivated/unlicensed state and shows reason.
3. Click Activate License.
4. Verify onprem receives active license (push or next check-in fallback).

Expected result:
- Manual deactivate works regardless of billing status.
- Deactivation reason is visible to customer-side admin.
- Manual activate restores active licensed state.

### LIC-T08: Suspension cascade
1. From enterprise customer list, suspend a customer with reason.
2. Verify all customer systems are deactivated.
3. Verify onprem systems update to deactivated state.

Expected result:
- Suspension revokes/deactivates all linked system licenses.
- Onprem systems reflect deactivation promptly.

### LIC-T09: Track badge visibility
1. Open enterprise customer list.
2. Verify DEV/ACC/PRD status columns and badge colors.

Expected result:
- Each customer row shows DEV/ACC/PRD Active/Inactive badges.
- Active appears green and Inactive appears red.

### LIC-T10: Per-system royalty policy
1. Confirm royalty percentage is not edited in generic customer edit form.
2. In customer detail, set royalty per system policy and save.
3. Validate royalty-driven telemetry reflects per-system setting.

Expected result:
- Royalty setting is managed per system in detail page.
- Per-system royalty value is persisted and used for telemetry calculations.

## Negative and Edge Cases
- Push delivery fails: onprem still converges to cloud truth on next check-in.
- Suspended customer cannot continue normal licensing check-in.
- Invalid policy values (unsupported currency, invalid billing status, invalid monthly fee) are rejected with clear error.
- Deactivate without reason is blocked.

## Traceability Matrix
- `LIC-F01` -> `LIC-T01`
- `LIC-F02` -> `LIC-T02`
- `LIC-F03` -> `LIC-T03`
- `LIC-F04` -> `LIC-T04`
- `LIC-F05` -> `LIC-T05`, `LIC-T06`
- `LIC-F06` -> `LIC-T07`
- `LIC-F07` -> `LIC-T08`
- `LIC-F08` -> `LIC-T09`
- `LIC-F09` -> `LIC-T10`

## Change Summary
- 2026-03-22: Replaced legacy manual lifecycle tests with automated sync/check-in coverage and added tests for billing policy, policy persistence, decimal handling, manual activate/deactivate, suspension cascade, badges, and per-system royalty.
- 2026-03-22: Initial baseline created.
