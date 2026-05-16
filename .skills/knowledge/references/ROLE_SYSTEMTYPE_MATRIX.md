# LearnPlay Role and Org-Type Truth Map

Purpose: canonical, evidence-backed role reference for `education`, `business`, and `elearning` org types.

Scope: `both` (cloud + onprem), unless stated otherwise.

## Canonical Role Sources
- Org role constants are defined in `Cloud-On-Prem/server/storage.ts`:
  - `LEARNER_ROLES = ['student', 'employee', 'learner']` (line 681)
  - `INSTRUCTOR_ROLES = ['teacher', 'team_lead']` (line 682)
  - `ADMIN_ROLES = ['org_admin']` (line 683)
  - `ALL_STAFF_ROLES = ['teacher', 'team_lead', 'org_admin']` (line 684)
- Org type enum is defined in `Cloud-On-Prem/shared/schema.ts`:
  - `organizationType = education | business | elearning` (lines 10-13)

## Platform-Level Roles (Global)
These are not `userOrganizationRoles.role` values; they are user flags/capabilities.
- `superadmin`
  - Backed by `users.isSuperAdmin` and session `effectiveRole='SuperAdmin'`
  - Source: `Cloud-On-Prem/server/adminAuth.ts` lines 148-163, 183-189
- `custsuper` (on-prem functional role)
  - Backed by `users.isCustSuper`; explicitly gated by `ONPREM_MODE`
  - Source: `Cloud-On-Prem/server/adminAuth.ts` lines 205-213, 227-233, 250-256
- `isAdmin` flag exists as legacy/global admin boolean, but org authorization primarily relies on org roles + platform roles.

## Organization-Level Roles (DB)
Stored in `userOrganizationRoles.role` (`varchar`, not strict DB enum).
- Documented examples: `org_admin`, `teacher`, `team_lead`, `student`, `employee`
- Source: `Cloud-On-Prem/shared/schema.ts` line 633

## Truth Table: Org Type to Role Usage

### education
- Learner role used by defaults: `student`
  - Source: `Cloud-On-Prem/server/storage.ts` line 3395
  - Source: `Cloud-On-Prem/server/routes/orgRoutes.ts` line 94
- Educator/instructor role used by management and most checks: `teacher` (also supports `team_lead` in shared instructor sets)
  - Source: `Cloud-On-Prem/server/storage.ts` lines 682, 684
- Admin role: `org_admin`

### business
- Learner role used by current default assignment paths: `learner` (not `employee`)
  - Source: `Cloud-On-Prem/server/storage.ts` line 3395
  - Source: `Cloud-On-Prem/server/routes/orgRoutes.ts` line 94
  - Source: `Cloud-On-Prem/server/routes/authRoutes.ts` lines 377-384 (code assigns `learner`)
- Educator/instructor roles accepted in authorization: `teacher`, `team_lead`
  - Source: `Cloud-On-Prem/server/storage.ts` line 682
- Admin role: `org_admin`
- Important: `employee` is still recognized as learner-compatible in many checks, but is not the current default-assigned role in key onboarding flows.

### elearning
- Learner role used by defaults: `learner`
  - Source: `Cloud-On-Prem/server/routes/authRoutes.ts` lines 380-383
  - Source: `Cloud-On-Prem/server/routes/orgRoutes.ts` line 94
- Educator/instructor checks are mostly aligned to `teacher`/`team_lead` in shared role constants.
- Admin role: `org_admin`

## Canonical Roles to Use in New Work
Use these canonical values when referencing and implementing auth/role checks:
- Platform: `superadmin`, `custsuper`
- Org-level: `org_admin`, `teacher`, `team_lead`, `learner`, `student`
- Legacy-compatible only: `employee`, `instructor`, `teamlead`, `admin`, `super_admin`, `cust_super`, `orgadmin`

## Legacy and Alias Notes (Important)
Because role column is free-text, legacy aliases still exist in parts of the code.
- Examples of alias handling:
  - `instructor` appears in permission checks (`Cloud-On-Prem/server/routes/orgRoutes.ts` line 189; `Cloud-On-Prem/server/routes/reportRoutes.ts` line 1560)
  - Enrollment filters include `teamlead`, `cust_super`, `superadmin` string variants (`Cloud-On-Prem/server/routes/adminRoutes.ts` lines 8413-8422)
- UI terminology is not always the same as auth role values:
  - `client/src/utils/terminology.ts` sets business learner label role as `employee` (line 43)
  - `authRoutes` default-role logic actually assigns business learners as `learner` (lines 377-384)

## Operational Recommendation
For consistency across cloud and onprem shared auth:
- Treat `org_admin`, `teacher`, `team_lead`, `learner`, `student` as the canonical org-role contract.
- Keep alias normalization at boundaries (read/compat) but avoid creating new writes with legacy aliases.
