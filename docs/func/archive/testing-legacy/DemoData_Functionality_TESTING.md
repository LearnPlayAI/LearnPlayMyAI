# DemoData Functionality Testing

## About
This document defines validation steps for Demo Data behavior in both Cloud and OnPrem tracks, including balanced hierarchy assignment behavior for generated users.

## Scope
- Demo-data access and policy guard behavior
- Backup/generate/restore lifecycle
- Generated data consistency checks
- Balanced assignment checks across departments, units, and teams

## Feature Index
1. Access and environment policy gate
2. Backup -> generate -> restore flow
3. Data consistency verification
4. Hierarchy assignment balance verification
5. OnPrem paid-value enrollment verification
6. OnPrem course-reviews demo-data verification

## Preconditions
- User has required role:
  - cloud DEV/cloud ACC: `superAdmin`
  - onprem DEV/onprem ACC: `custSuper` or `superAdmin`
- Target is non-PRD (`cloud DEV`, `cloud ACC`, `onprem DEV`, or `onprem ACC`)
- Database credentials are available for SQL verification
- Existing backup can be created from Demo Data Manager

## Test Cases

### 1. Access and policy gate
1. Log in with required admin role.
2. Open `/admin/demo-data`.
3. Confirm page loads and policy/environment panel is visible.

Expected result:
- Demo Data Manager is accessible for authorized roles only.
- Policy/environment status is displayed without errors.

### 2. Backup -> generate -> restore flow
1. Click `Backup Database Now` and wait for success.
2. Click `Generate Demo Data` and wait for completion.
3. Verify job status shows completed and no failure message.
4. Trigger `Generate Demo Data` a second time (without append mode).
5. Confirm old demo org rows are replaced, not accumulated.
6. Click `Restore Database Backup` and confirm with required text.
7. Wait for restore completion.

Expected result:
- Backup succeeds.
- Generate succeeds.
- Repeat generate does not accumulate duplicate demo datasets.
- Restore succeeds and returns system to pre-generate baseline.

### 3. Data consistency verification
1. After generation, run SQL checks (adjust database name for scope):
```sql
select role, count(*) from "userOrganizationRoles" group by role order by role;
select count(*) as enrollments from "userCourseEnrollments";
select count(*) as lessons from "courseLessons";
```
2. Confirm role and activity tables contain generated data.
3. After restore, rerun counts and compare with pre-generate baseline.

Expected result:
- Counts increase after generation.
- Counts return to baseline after restore.

### 4. Hierarchy assignment balance verification
1. After generation, run:
```sql
select
  count(*) filter (where "subUnitId" is null and "teamId" is null) as department_level,
  count(*) filter (where "subUnitId" is not null and "teamId" is null) as unit_level,
  count(*) filter (where "teamId" is not null) as team_level
from "userOrganizationAssignments" a
join organizations o on o.id = a."organizationId"
where o."isDemo" = true;
```
2. Confirm all three categories are populated.
3. Confirm distribution is reasonably balanced (no category is empty when hierarchy exists).
4. For approved join requests, verify assigned hierarchy depth is also mixed:
```sql
select
  count(*) filter (where "assignedSubUnitId" is null and "assignedTeamId" is null) as department_level,
  count(*) filter (where "assignedSubUnitId" is not null and "assignedTeamId" is null) as unit_level,
  count(*) filter (where "assignedTeamId" is not null) as team_level
from "joinRequests" jr
join organizations o on o.id = jr."organizationId"
where o."isDemo" = true and jr.status = 'approved';
```

Expected result:
- Demo assignments are not restricted to team-only placement.
- Department-level, unit-level, and team-level assignment rows are present where hierarchy data exists.

### 5. OnPrem paid-value enrollment verification
1. In `onprem DEV` or `onprem ACC`, run demo data generation.
2. Open `/admin/enrollment-management`.
3. Confirm enrollment rows include non-zero paid values when course prices are non-zero.
4. SQL verification:
```sql
select count(*) filter (where "purchasePrice"::numeric > 0) as nonzero_value,
       count(*) as total_rows
from "coursePurchases" cp
join organizations o on o.id = (select c."organizationId" from courses c where c.id = cp."courseId")
where o."isDemo" = true;
```

Expected result:
- Demo onprem enrollments are represented with completed purchase-value rows.
- Enrollment management can display meaningful paid values instead of all zero where priced courses exist.

### 6. OnPrem course-reviews demo-data verification
1. In `onprem DEV` or `onprem ACC`, run demo data generation.
2. Open `/admin/course-reviews`.
3. Confirm review rows are present for generated demo courses.
4. SQL verification:
```sql
select count(*) as total_reviews
from "courseReviews" cr
join organizations o on o.id = cr."organizationId"
where o."isDemo" = true;

select count(*) as total_ratings
from "courseRatings" r
join courses c on c.id = r."courseId"
join organizations o on o.id = c."organizationId"
where o."isDemo" = true;
```

Expected result:
- Demo onprem datasets include non-zero rows in `courseReviews` and `courseRatings`.
- `/admin/course-reviews` is no longer empty after generation.

## Negative/Edge Cases
- If an organization has no sub-units or teams, generation should still succeed with department-level assignments.
- If generation is retried after a failed run, backup/restore flow must still be usable.
- PRD-like environment labels must block generate/reset/delete actions.
- If delete-all encounters schema drift in optional tables/columns (for example legacy/renamed email-log columns), purge should continue with warning logging rather than fail the full operation.

## Change Summary
- 2026-03-23: Created initial DemoData testing document with end-to-end and SQL validation steps, including balanced hierarchy assignment verification.
- 2026-03-23: Added OnPrem enrollment paid-value validation steps for demo-generated data.
- 2026-03-23: Added OnPrem course-reviews validation steps to ensure demo generation seeds review/rating rows without marketplace dependencies.
- 2026-03-23: Added schema-drift tolerance verification expectation for delete-all demo purge behavior.
- 2026-03-27: Added validation for default pre-generate purge behavior to ensure repeat demo generation does not accumulate duplicates.
