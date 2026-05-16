# InterOrgConfig Functionality Testing

## About
This document defines validation steps for search/filter and pagination behavior in `/custsuper/interorg-config`.

## Scope
- Shared Courses tab filtering/search/pagination
- Sharing Rules tab filtering/search/pagination

## Feature Index
1. Shared Courses filtering and search
2. Shared Courses pagination
3. Sharing Rules filtering and search
4. Sharing Rules pagination

## Preconditions
- Target is `onprem DEV` or `onprem ACC`
- Logged in as authorized user for inter-org config page
- Shared course mappings and rules exist (demo data or seeded data)

## Test Cases

### 1. Shared Courses filtering and search
1. Open `/custsuper/interorg-config`, select `Shared Courses`.
2. Search by:
   - course title fragment
   - source org name
   - target org name
   - course ID fragment
3. Apply filters: source org, target org, audience, scope.
4. Combine multiple filters and verify count/list updates.

Expected result:
- Results match filter/search criteria accurately.

### 2. Shared Courses pagination
1. Ensure result set has more than one page.
2. Use next/previous controls.
3. Change filter/search and confirm page resets/clamps correctly.

Expected result:
- Pagination navigates pages correctly and remains stable after filtering.

### 3. Sharing Rules filtering and search
1. Select `Sharing Rules`.
2. Search by source/target org and rule ID fragment.
3. Apply status filter (all/enabled/disabled).
4. Apply source and target org filters.
5. Combine filters and verify results.

Expected result:
- Rules list reflects all filter/search combinations correctly.

### 4. Sharing Rules pagination
1. Ensure rules exceed one page.
2. Navigate with next/previous controls.
3. Toggle a rule enabled/disabled and confirm list refresh preserves valid page.

Expected result:
- Pagination remains functional with updates and filter changes.

## Negative/Edge Cases
- No-match searches should show empty-state text.
- Filtering down from high page counts should not produce invalid page state.
- Rapid filter changes should not crash or freeze UI.

## Change Summary
- 2026-03-23: Created InterOrgConfig testing guide for both-tab search/filter and pagination behavior.
