# CrossOrgAssignmentSecurity Functionality Testing

## Purpose
Validate secure cross-organization assignment behavior while preserving strict tenant and role isolation.

## Preconditions
- Test users exist for roles:
  - `CustSuper` (onprem) / `SuperAdmin` (cloud)
  - `OrgAdmin`
  - `Trainer` or `TeamLead`
  - `Student`
- At least two organizations exist (`Org A`, `Org B`) with departments, units, teams, and students.
- At least one course is owned by `Org A`.
- Inter-org assignment pages and APIs are available:
  - `/org-management`
  - `/custsuper/interorg-config`

## Target Coverage
- cloud DEV
- cloud ACC
- cloud PRD
- onprem DEV
- onprem ACC
- onprem PRD

## Test Scenarios

1. Top-role labeling in user management filter
- onprem: verify top-role filter label is `CustSuper`.
- cloud: verify top-role filter label is `SuperAdmin`.
- Expected: correct label by variant, no mixed naming.

2. Impersonation restriction
- Attempt impersonation as `OrgAdmin`, `Trainer/TeamLead`, `Student`.
- Expected: denied (`403`) for all non-top roles.
- Attempt impersonation as `CustSuper`/`SuperAdmin`.
- Expected: allowed.

3. Upper-role protection in user management
- `OrgAdmin` attempts to modify top role and peer admin outside authority.
- `Trainer/TeamLead` attempts to modify `OrgAdmin` or top role.
- Expected: denied (`403`) in all cases.

4. Same-org management boundaries
- `OrgAdmin` manages same-org `Trainer/TeamLead` and `Student`.
- `Trainer/TeamLead` manages same-org `Student`.
- Expected: allowed.

5. Cross-org browse in `/org-management`
- As `OrgAdmin` and `Trainer/TeamLead`, open `Assign To External Targets` mode.
- Browse `Org B` departments/units/teams/students.
- Expected: read-only browse works; no org-structure mutation actions available.

6. External admin data isolation
- In external target browse mode, inspect results for admin users.
- Expected: admin users are not returned as assignable targets.

7. Multi-target assignment in one request
- From `Org A`, assign one owned course to:
  - one org-level target,
  - one department in `Org B`,
  - one unit in `Org B`,
  - one team in `Org B`,
  - one individual student in `Org B`.
- Expected: operation succeeds with per-target results and no duplicate assignment materialization.

8. Overlap dedupe edge case
- Submit multi-target assignment with overlapping parent/child targets (for example org + team in same org).
- Expected: no duplicate enrollments/assignments for same effective student.

9. Ownership-scoped management
- As non-top role in `Org A`, attempt to modify assignment where `ownerOrganizationId = Org B`.
- Expected: denied (`403`).
- Modify assignment where `ownerOrganizationId = Org A`.
- Expected: allowed.

10. `/custsuper/interorg-config` row visibility
- Top role: verify all owner-org rows visible.
- Non-top role in `Org A`: verify only `ownerOrganizationId = Org A` rows visible.

11. `/custsuper/interorg-config` manage actions
- Non-top role attempts revoke/delete on row owned by `Org B`.
- Expected: denied (`403`).
- Non-top role manages row owned by `Org A`.
- Expected: allowed.

12. Reporting scope and outbound visibility
- Non-top role in `Org A` opens assignment/reporting views.
- Expected:
  - outbound rows from `Org A` to external orgs are visible,
  - rows owned by other orgs are hidden.

13. Student role lockout from admin surfaces
- Login as `Student`, navigate to admin routes and call admin endpoints.
- Expected: admin nav hidden, admin APIs denied (`403`/`401`).

14. Bulk-action partial success behavior
- Submit bulk assignment/revoke containing authorized and unauthorized items.
- Expected:
  - authorized items apply,
  - unauthorized items return explicit denial reason,
  - response includes per-item status.

## API Validation Checklist
- Denials return `403` with actionable reason text.
- Assignment/report rows include required dimensions:
  - `ownerOrganizationId`
  - `targetOrganizationId`
  - `targetAudienceRole`
  - `scope`
  - `unitId` / `subUnitId` / `teamId` / `userId` as applicable
- Non-top inter-org list endpoints enforce `ownerOrganizationId == activeOrgId`.

## Regression Focus
- User management edits (all role combinations)
- Impersonation gating
- Inter-org filters/search + pagination under ownership scope
- Multi-target assignment idempotency and overlap dedupe

## Exit Criteria
- All scenarios above pass for impacted variants.
- No privilege-escalation path exists via UI or direct API calls.
- Cross-org assignment remains functional for source-org course owners without breaking tenant isolation.
