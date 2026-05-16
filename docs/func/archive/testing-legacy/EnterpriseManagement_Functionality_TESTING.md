# EnterpriseManagement Functionality Testing

## About
This document provides cloud SuperAdmin test coverage for customer-details tabs and combined Revenue Overview filtering.

## Scope
- Customer Details tab behavior
- Registered Org Metrics composable filtering and pagination
- Revenue Overview PRD/ACC/DEV dropdown and combined filter behavior

## Feature Index
1. Customer Details two-tab structure
2. Registered Org Metrics search/filter/sort/pagination
3. Revenue Overview track dropdown options
4. Combined filter composition on Revenue Overview

## Preconditions
- User is logged in as SuperAdmin.
- Cloud enterprise customer exists with:
  - at least one system entry,
  - multiple registered organization metric rows.
- Revenue telemetry exists for at least one of production/qa/development tracks.

## Test Cases

### 1. Customer Details two-tab structure
1. Open `/superadmin/enterprise/customer/:id`.
2. Confirm tabs exist:
   - `Systems License Policy`
   - `Registered Org Metrics`
3. Switch between tabs.

Expected result:
- Both tabs render and switch correctly.
- Systems/license content is shown on Systems License Policy tab.
- Metrics table content is shown on Registered Org Metrics tab.

### 2. Registered Org Metrics search/filter/sort/pagination
1. Open `Registered Org Metrics` tab.
2. Enter search text matching a subset of organization names.
3. Apply currency filter.
4. Change sort order.
5. Use pagination controls.

Expected result:
- Search + currency + sort apply together before pagination.
- Page counts/results update correctly for filtered rows.
- Next/Previous navigation works without losing active filters.

### 3. Revenue Overview track dropdown options
1. Open `/superadmin/enterprise` and select `Revenue Overview` tab.
2. Inspect the track dropdown.

Expected result:
- Dropdown options are exactly: `PRD`, `ACC`, `DEV`.
- Selection updates report data.

### 4. Combined filter composition on Revenue Overview
1. In Revenue Overview, set:
   - customer filter,
   - track filter,
   - date range,
   - reporting currency,
   - search text.
2. Change each filter while keeping others applied.

Expected result:
- Filters combine (logical AND behavior), not override each other.
- Table rows and KPI cards remain consistent with current combined filter state.

## Negative/Edge Cases
- No metric rows after filters: table shows empty-state message, no crash.
- Revenue dataset empty for selected track/date/customer: empty-state message is shown.
- Invalid partial search text should simply return zero or matching rows without errors.

## Change Summary
- 2026-03-23: Added testing guidance for two-tab customer details, composable metrics filtering/pagination, and PRD/ACC/DEV revenue track dropdown behavior.
