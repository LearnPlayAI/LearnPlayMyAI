# EnrollmentManagement Functionality Testing

## About
This document defines how to validate onprem enrollment-management filtering and value reporting behavior.

## Scope
- `/admin/enrollment-management` UI filter behavior
- Onprem enrollment report API filtering correctness
- Paid-value display for enrollment rows

## Feature Index
1. Access and mode gate
2. Baseline enrollment list load
3. Expanded filters
4. Paid-value visibility

## Preconditions
- Target is `onprem DEV` or `onprem ACC`
- Logged in as `SuperAdmin` or `CustSuper`
- Demo data (or equivalent enrollment data) exists

## Test Cases

### 1. Access and mode gate
1. Open `/admin/enrollment-management` in onprem mode.
2. Verify page is accessible.

Expected result:
- Page loads for privileged users in onprem mode.

### 2. Baseline enrollment list load
1. Open page with default filters.
2. Confirm enrollments render and total count appears.

Expected result:
- Enrollment rows are visible and paginated.

### 3. Expanded filters
1. Apply each filter and verify row changes:
   - Organization
   - Role
   - Value type
   - Min/Max value
   - Start/End date
   - Status
2. Combine multiple filters and confirm count narrows.
3. Click `Clear Filters` and confirm defaults restore.

Expected result:
- Each filter affects results consistently.
- Combined filters provide narrow report slices.
- Clearing resets query and result scope.

### 4. Paid-value visibility
1. Verify rows for priced courses show non-zero value where applicable.
2. Set `Value type` to `Paid Value (> 0)` and confirm only non-zero rows remain.
3. Set `Value type` to `Zero Value (0)` and confirm only zero-value rows remain.

Expected result:
- Paid-value reporting is visible and filterable.
- Value-type filter behavior is correct.

## Negative/Edge Cases
- Invalid min/max values should not crash page load.
- Empty result sets should show a no-data state without UI errors.
- Date range with no matching records should show zero rows.

## Change Summary
- 2026-03-23: Created initial EnrollmentManagement testing guide for expanded filtering and paid-value visibility checks.
