# Multi-Department Course Assignment And Publishing Design

## Goal

Course publishing and assignment must support one-or-more department targets across both cloud and onprem variants. When a course otherwise meets publish criteria but has no assignment scope, the publish modal must give the user a direct path to assign the course without leaving the workflow.

## Contract

- `courseAssignments` remains the source of truth for course scope.
- A course may have multiple department-level assignment rows, one per selected department.
- Organization-wide assignment remains valid for courses that do not belong to one specific department.
- Department, unit, team, organization, user, and onprem cross-organization assignment flows must preserve independent assignment targets instead of replacing all existing course assignments.
- Publish validation must pass when a non-public course has at least one department/unit/team assignment or an organization-wide assignment.
- Cloud and onprem must share the same client/server/database behavior unless an onprem-only feature, such as cross-organization assignment, explicitly requires extra target organization context.

## UI Requirements

- Course publish readiness surfaces missing assignment as an actionable issue.
- The publish modal opens the course assignment UI directly.
- The course assignment UI allows selecting multiple departments in one operation.
- The standalone Course Assignments page also allows selecting multiple departments in one operation.
- Optional sub-unit/team narrowing is available when exactly one department is selected.
- Existing checklist and publish summary states must read assignment data from `courseAssignments`, not legacy course fields.

## Server And Data Requirements

- Assignment upsert identity must include course, organization, target organization, audience, inferred assignment scope, and target IDs.
- Upserting a department assignment must update only the matching department target.
- Upserting one target must not delete or replace other department, unit, team, organization, or user assignments for the same course.
- Bulk assignment payloads may include `targets[]` so the client can create several department assignments through one request.
- Existing unique database constraints remain compatible with multiple department rows because the department `unitId` participates in the uniqueness key.

## Validation

- Add a focused regression test proving two departments on the same course are distinct assignment targets.
- Run TypeScript validation after UI and service changes.
- Manual cloud/onprem smoke path:
  1. Create or open a draft course with all lesson publish criteria complete.
  2. Leave it unassigned and click Publish Course.
  3. Use the modal's assignment action.
  4. Select two departments and confirm.
  5. Verify the course publishes or becomes publish-ready, and both department assignments remain listed.
  6. Repeat on cloud and onprem. On onprem, also verify cross-organization assignment still works for public active courses.

## Role-Journey Matrix

| Role | Variant | Entry | Core Task | Recovery | Exit | Status |
| --- | --- | --- | --- | --- | --- | --- |
| superadmin | cloud | Course builder | Assign one-or-more departments before publish | Reopen assignment modal from publish issue | Published/ready course | same |
| custsuper | onprem | Course builder | Assign one-or-more departments before publish | Reopen assignment modal from publish issue | Published/ready course | same |
| orgadmin | cloud/onprem | Course Assignments page | Assign course to multiple departments | Edit/delete individual assignment rows | Learners receive scoped courses | same |
| teacher | cloud/onprem | Course builder | Resolve missing assignment during publish | Fix validation gaps then assign | Course available to learners | same |
| student | cloud/onprem | My Courses | See courses assigned through their department cascade | Assignment removal hides course | Course progress unaffected | same |

