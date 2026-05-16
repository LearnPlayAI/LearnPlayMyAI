# User Management Functionality

## About
This document defines the behavior of the User Management admin UI for managing users, roles, organization assignment, and account state.

## Feature List
- User list with pagination and searchable fields (display name, email, first/last name, gamer name).
- Inline organization filter table for high-volume organization selection.
- Role filter chips and status toggles (locked, disabled, no organization, superadmin).
- Sort controls (joined date, last active, display name, email) and direction.
- Density and page-size controls.
- Saved views (persisted filters/sort/layout preferences).
- Row selection and bulk operations:
  - lock/unlock
  - enable/disable
  - reassign selected users to one organization/role set
  - CSV export of selected users
- Inline action panels (no modal dialogs) for:
  - reset password
  - edit global/org roles
  - reassign organization/role
  - change email
  - delete confirmation

## Rules and Constraints
- SuperAdmin users are hidden from non-SuperAdmin viewers.
- Global role changes are restricted to authorized admins.
- CustSuper assignment is onprem-only behavior.
- Reassignment follows existing backend authorization checks.
- Delete remains irreversible and must require explicit inline confirmation.
- Bulk actions process selected users and report success/failure counts.
- Modal-based interactions are not used for these flows.

## Environment-Specific Behavior
- cloud DEV / cloud ACC / cloud PRD:
  - shared User Management UI behavior; CustSuper controls may be unavailable by role/mode.
- onprem DEV / onprem ACC / onprem PRD:
  - shared User Management UI behavior with onprem mode enabling CustSuper-specific controls.

## Integrations
- `GET /api/admin/users`: user list source.
- `GET /api/admin/organizations`: organization list source.
- `PATCH /api/admin/users/:id/lock`: lock user.
- `PATCH /api/admin/users/:id/unlock`: unlock user.
- `PATCH /api/admin/users/:id/disable`: disable user.
- `PATCH /api/admin/users/:id/enable`: enable user.
- `PATCH /api/admin/users/:id/reset-password`: reset password.
- `PATCH /api/admin/users/:id/roles`: role updates and reassignments.
- `PUT /api/admin/users/:id/email`: email update.
- `DELETE /api/admin/users/:id`: user deletion.

## Assumptions and Out of Scope
- Server-side pagination/virtualization is not implemented in this change; UI remains client-side paginated after fetch.
- Bulk operations currently use existing single-user endpoints per selected user.
- Undo workflows are out of scope for destructive operations.

## Change Summary
- 2026-03-23: Reworked User Management UI for scale and admin efficiency: inline organization table filtering, advanced filters/sorting, saved views, batch actions, and inline (non-modal) action panels.
