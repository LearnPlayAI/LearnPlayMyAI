# EnrollmentManagement Functionality

## About
This document defines behavior for the onprem enrollment-management admin page and its reporting filters.

## Scope
- `/admin/enrollment-management` UI behavior
- Onprem enrollment reporting API
- Filtering and result shaping for enrollment records

## Feature List
- Search by user/course text
- Status filtering
- Organization filtering
- Role filtering
- Value-type filtering (`all`, `Paid Value (>0)`, `Zero Value`)
- Min/max value filtering
- Date-range filtering
- Pagination and count reporting

## Rules and Constraints
- Feature is available in onprem mode only.
- Access requires `SuperAdmin` or `CustSuper`.
- Enrollment rows prefer purchase-backed records when available.
- Enrollment fallback rows use course value/currency when purchase rows are absent.

## Environment-Specific Behavior
- onprem DEV/onprem ACC/onprem PRD:
  - Page and API are available.
- cloud DEV/cloud ACC/cloud PRD:
  - Page/API are not available.

## Integrations
- Admin auth middleware (`isSuperAdminOrCustSuper`)
- `coursePurchases`, `userCourseEnrollments`, `courses`, `users`, `userOrganizationRoles`, `organizations`
- React Query client-side filtering state

## Assumptions
- Course price/currency values are populated.
- User-role rows exist for org membership/role filters.

## Out of Scope
- External payment gateway processing
- Cross-variant cloud enrollment admin reporting

## Change Summary
- 2026-03-23: Added expanded onprem enrollment-management filtering (organization, role, value type, min/max value, and date range) and fallback value display from course pricing for non-purchase enrollment rows.
