# User Management Functionality Testing

## About
This document defines validation steps for User Management behavior and UI safety after the inline/no-modal redesign.

## Feature Index
1. User search and pagination
2. Organization table filtering
3. Role and status filtering
4. Sorting, density, and page-size controls
5. Saved views
6. Row selection and bulk actions
7. Inline reset password panel
8. Inline roles panel
9. Inline reassign panel
10. Inline change-email panel
11. Inline delete confirmation panel

## Preconditions and Required Test Data
- Admin account with access to User Management.
- Dataset includes users with mixed states:
  - locked/unlocked
  - enabled/disabled
  - with and without organizations
  - at least one superadmin (for visibility checks)
- At least two organizations available.

## Test Steps and Expected Results
1. Search and pagination
- Step: Search by display name/email and navigate pages.
- Expected: Matching records only; page counts and ranges remain correct.

2. Organization table filter
- Step: Use organization table search, select a specific organization row, then select All Organizations.
- Expected: User table filters correctly by org and clears correctly.

3. Role and status filters
- Step: Apply role filter and each status toggle individually and combined.
- Expected: Result set respects all active filters with no UI errors.

4. Sorting and density
- Step: Change sort key/direction and density.
- Expected: Ordering updates correctly; density changes row spacing.

5. Saved views
- Step: Configure filters/sort, save a named view, switch to another state, then apply saved view.
- Expected: Saved view restores full configuration.

6. Selection and bulk actions
- Step: Select current page, run bulk lock/unlock/enable/disable/export.
- Expected: Success/failure summary toast; data refreshes; CSV downloads for export.

7. Reset password panel
- Step: Open reset action, submit invalid short password, then valid password.
- Expected: Validation blocks short password; valid reset succeeds.

8. Roles panel
- Step: Open roles action and change allowed global/org roles.
- Expected: Save updates roles and closes or resets panel state.

9. Reassign panel
- Step: Open reassign, choose target organization and role, save.
- Expected: Reassignment succeeds and reflects in organization/role badges.

10. Change email panel
- Step: Open email action, enter a new email, save.
- Expected: Update succeeds; verification notice is shown.

11. Delete confirmation panel
- Step: Open delete action and cancel; reopen and confirm delete.
- Expected: Cancel leaves user intact; confirm deletes user and refreshes table.

## Negative/Edge Cases
- Empty organization search result displays clear empty state.
- Applying filters with no matching users shows empty table state.
- Bulk actions with no selection block with user feedback.
- Non-superadmin cannot see/modify superadmin users.
- onprem mode only: CustSuper controls appear only when permitted.

## Change Summary
- 2026-03-23: Added full test coverage for inline no-modal User Management flows, table-based organization filtering, and bulk-action operations.
