# InterOrgConfig Functionality

## About
This document defines onprem Inter-Organization Course Sharing configuration behavior at `/custsuper/interorg-config`.

## Scope
- Shared Courses tab behavior
- Sharing Rules tab behavior
- Search/filter and pagination controls in both tabs

## Feature List
- Shared Courses:
  - Search by course title, course ID, source/target organization, audience, and scope
  - Filters for source organization, target organization, audience, and scope
  - Pagination controls
- Sharing Rules:
  - Search by source/target organization and rule ID
  - Filters for status (enabled/disabled), source organization, target organization
  - Pagination controls

## Rules and Constraints
- Feature is available in onprem mode only.
- Existing CRUD behavior for sharing rules remains unchanged.
- Filtering and pagination are inline in-page controls (no modal dependency).

## Environment-Specific Behavior
- onprem DEV/onprem ACC/onprem PRD:
  - Inter-org config page available (role-dependent).
- cloud DEV/cloud ACC/cloud PRD:
  - Inter-org config page is not available.

## Integrations
- `/api/admin/interorg-rules`
- `/api/admin/interorg-shared-courses`
- `/api/admin/organizations`
- Client-side grouping/filtering/pagination state management

## Assumptions
- Organization names are available from admin organizations endpoint.
- Shared-course and rule datasets are available and role-accessible.

## Out of Scope
- Rule-model changes
- Cross-tab bulk actions

## Change Summary
- 2026-03-23: Added search/filter and pagination behavior to both InterOrgConfig tabs for improved large-data navigation and reporting.
