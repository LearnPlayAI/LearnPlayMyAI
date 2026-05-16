# EnterpriseManagement Functionality

## About
This document defines SuperAdmin cloud enterprise-management behavior for customer details and revenue-overview filtering.

## Scope
- `/superadmin/enterprise/customer/:id` customer details UX structure
- `/superadmin/enterprise` Revenue Overview filter controls
- Combined filter/search behavior expectations

## Feature List
- Customer Details page now contains two tabs:
  - `Systems License Policy`
  - `Registered Org Metrics`
- Registered Org Metrics tab supports:
  - search by organization name,
  - currency filter,
  - sort options,
  - pagination.
- Revenue Overview environment selector is a dropdown with exactly:
  - `PRD`
  - `ACC`
  - `DEV`
- Revenue filters (customer, track, date range, currency, search) work in combination.

## Rules and Constraints
- Registered Org Metrics filtering is composable: search + currency + sort are applied together before pagination.
- Revenue Overview always sends an explicit track filter (`production`, `qa`, or `development`) to the revenue API.
- No modal/dialog flow is introduced for this feature set.

## Environment-Specific Behavior
- cloud DEV/cloud ACC/cloud PRD:
  - Full functionality applies.
- onprem DEV/onprem ACC/onprem PRD:
  - Enterprise management remains unavailable as designed.

## Integrations
- `GET /api/admin/enterprise/customers/:id` (customer details + registered org metrics payload)
- `GET /api/admin/enterprise/revenue` (track/customer/date/currency filtering)

## Assumptions
- Enterprise customer payload contains `registeredOrganizationMetrics` when available.
- Revenue API accepts `systemType` values `production`, `qa`, and `development`.

## Out of Scope
- License policy business-rule changes
- Revenue computation logic changes in backend

## Change Summary
- 2026-03-23: Added two-tab customer-details layout, composable Registered Org Metrics search/filter/sort/pagination, and strict PRD/ACC/DEV dropdown filtering on Revenue Overview.
