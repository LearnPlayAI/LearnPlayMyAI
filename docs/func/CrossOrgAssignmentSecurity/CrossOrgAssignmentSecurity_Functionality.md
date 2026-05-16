# CrossOrgAssignmentSecurity Functionality

## About
This document defines the mandatory security and authorization model for cross-organization course assignment while preserving tenant safety and strict role boundaries.

## Owner
- LearnPlay Platform Security / Product

## Scope
- User-management authorization boundaries
- Impersonation restrictions
- Cross-org assignment targeting and reporting permissions
- Cross-org browsing and assignment workflow in `/org-management`
- Ownership-scoped assignment discovery and management in `/custsuper/interorg-config`
- API contract requirements for secure enforcement

## Feature List
- Role-based capability matrix for user management and assignment actions.
- Separation of permissions between:
  - target-directory visibility (read-only)
  - user/account management (write)
- Onprem cross-org assignment support that allows source-org course owners to assign to students in external target organizations.
- Multi-target assignment support:
  - one source-org course can be assigned to multiple target organizations, departments, units, teams, and users in a single operation.
- Outbound cross-org reporting for source-org owned courses.
- Backend-first authorization enforcement (UI reflects, backend enforces).

## Rules and Constraints
- Lower roles must never manage upper-role user data.
- No admin role may manage other admin users except top platform role:
  - onprem: `CustSuper`
  - cloud: `SuperAdmin`
- Only top platform role may impersonate:
  - onprem: `CustSuper`
  - cloud: `SuperAdmin`
- Learner/Student users have no admin panel access.
- Non-top roles may browse external org structure and student targets for assignment, but this access is read-only and must exclude admin-sensitive data.
- Course assignment authority is ownership-scoped: only course owner-org operators (or top platform role) may assign/revoke that course across organizations.
- For non-top roles, cross-org assignment targets must be student audiences only.
- Reporting must preserve ownership context and assignment-target context on every row.
- Non-top roles can read (browse) cross-org structure for assignment targeting, but cannot mutate structure or admin profiles in other organizations.

## Role Capability Matrix
- onprem `CustSuper`:
  - Manage users: all roles, all orgs
  - Impersonate: yes
  - Cross-org target browse: all
  - Cross-org assignment manage: all
  - Cross-org reporting: all
- cloud `SuperAdmin`:
  - Manage users: all roles, all orgs
  - Impersonate: yes
  - Cross-org target browse: all
  - Cross-org assignment manage: all
  - Cross-org reporting: all
- `OrgAdmin` (both variants):
  - Manage users: own org only, and only non-admin roles (`trainer/teamlead`, `student`)
  - Impersonate: no
  - Cross-org target browse: yes (read-only)
  - Cross-org assignment manage: yes, but only for courses owned by own org and only student targets
  - Cross-org reporting: yes, for own-org owned courses including outbound assignments
- `Trainer/TeamLead` (both variants):
  - Manage users: own org only, and only `student`
  - Impersonate: no
  - Cross-org target browse: yes (read-only)
  - Cross-org assignment manage: yes, but only for courses owned by own org and only student targets
  - Cross-org reporting: yes, for own-org owned courses including outbound assignments
- `Learner/Student`:
  - Manage users: no
  - Admin panel access: no
  - Impersonate: no
  - Assignment/report admin actions: no

## User Management Guardrails
- onprem:
  - UI role filter must label top role as `CustSuper` (not `SuperAdmin`).
- cloud:
  - UI role filter must label top role as `SuperAdmin`.
- Any admin attempting to modify users above their authority boundary must be blocked server-side with `403`.
- Learner/Student users must never receive admin navigation or admin endpoint access.

## `/org-management` Cross-Org Assignment Logic
- `/org-management` must expose two explicit operating modes:
  - `Manage Own Organization` mode:
    - full org-structure management limited to active org and actor role authority.
  - `Assign To External Targets` mode:
    - read-only browse of external org hierarchy (`organization -> department -> unit -> team -> student`),
    - assignment-target selection for source-org owned courses only.
- In `Assign To External Targets` mode:
  - external admin users must not be visible as assignable targets,
  - external org structure metadata is visible only to the minimum needed for targeting/reporting,
  - assignment payload can contain multiple targets across multiple organizations in one request.

## Multi-Target Assignment Semantics
- A single assignment transaction may include any combination of target scopes:
  - `organization`, `department`, `unit`, `team`, `user`.
- Deduplication rules:
  - if parent and child targets overlap in the same request, backend must avoid duplicate enrollment/assignment records.
- Ownership rules:
  - non-top actors can only create/revoke assignments where `ownerOrganizationId == activeOrgId`.
  - top role actors (`CustSuper`/`SuperAdmin`) may manage all owners.

## `/custsuper/interorg-config` Ownership Logic
- Listing and search/filter behavior:
  - top role sees all inter-org rows.
  - non-top roles see only rows where `ownerOrganizationId == activeOrgId`.
- Manage behavior (create/update/delete/revoke):
  - top role can manage any inter-org row.
  - non-top roles can manage only rows owned by active org and only for student audiences.
- Reporting behavior:
  - non-top role reports must include outbound assignments from active org to other orgs and their target scopes.
  - non-top role reports must exclude rows owned by other orgs.

## Policy and Endpoint Contract
- Central policy functions (backend):
  - `canManageUser(actor, targetUser, activeOrgId)`
  - `canImpersonate(actor)`
  - `canBrowseAssignmentTargets(actor, activeOrgId)`
  - `canManageAssignment(actor, ownerOrganizationId, targetOrganizationId, targetAudienceRole, activeOrgId)`
  - `canViewAssignmentReportRow(actor, row, activeOrgId)`
  - `canViewInterOrgConfigRow(actor, ownerOrganizationId, activeOrgId)`
- Required API behavior:
  - All mutating and reporting endpoints must call policy checks server-side.
  - Any denied action must return `403` with explicit denial reason.
  - Bulk actions must validate each row/target individually and return per-item result details.
  - Multi-target assignment endpoint must perform authorization and dedupe per target item and return partial-success details where applicable.
- Required data fields in assignment/report rows:
  - `ownerOrganizationId`
  - `targetOrganizationId`
  - `assignedByUserId`
  - `targetAudienceRole`
  - `scope` (`organization`, `department`, `unit`, `team`, `user`)
  - `unitId` / `subUnitId` / `teamId` / `userId` where applicable

## Environment-Specific Behavior
- cloud DEV / cloud ACC / cloud PRD:
  - Top platform role is `SuperAdmin`.
  - Only `SuperAdmin` can impersonate.
  - Cross-org assignment logic follows the same ownership and student-target constraints.
- onprem DEV / onprem ACC / onprem PRD:
  - Top platform role is `CustSuper`.
  - Only `CustSuper` can impersonate.
  - Inter-org course assignment is enabled and must allow outbound assignment/reporting for own-org courses to external org students.

## Integrations
- User management APIs (`/api/admin/users*`) for profile/role state changes.
- Impersonation/session context APIs.
- Inter-org assignment APIs:
  - rules and assignment endpoints
  - target-directory endpoints for org/department/unit/team/student browse
- Reporting APIs for enrollment/assignment outcomes with owner-vs-target org dimensions.

## Assumptions
- Active organization context is available on each request for non-top roles.
- Course ownership is represented by `course.organizationId`.
- Assignment model stores target-org and target-scope dimensions.

## Out of Scope
- UI visual redesign details.
- Data migration from legacy assignment models not carrying owner/target dimensions.
- Payment/commerce authorization logic.

## Change Summary
- 2026-03-24: Created canonical security model for cross-org assignment and reporting with strict role hierarchy, top-role-only impersonation, read-only cross-org target browsing, and backend policy contract requirements.
- 2026-03-24: Expanded model with `/org-management` dual-mode workflow, multi-target assignment semantics, `/custsuper/interorg-config` ownership-scoped visibility/manage rules, and explicit cloud/onprem top-role labeling constraints.
