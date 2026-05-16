# Gamification Functionality Testing

## About
This document provides test steps for quiz-lobby leaderboard filter and impersonation-context behavior.

## Scope
- `/quiz-lobby` leaderboard context initialization
- Role normalization for admin/teacher vs learner behavior
- Effective-organization learner assignment resolution from `/api/user/roles`

## Feature Index
1. Learner unit lock in effective organization
2. Admin/teacher role normalization
3. Impersonation-safe leaderboard filter defaults
4. Stale/foreign unit filter fallback

## Preconditions
- Test users available:
  - learner with unit assignment
  - org_admin and/or teacher
  - SuperAdmin with impersonation access
- Organization hierarchy contains units/sub-units
- Quiz-lobby route accessible on target runtime

## Test Cases

### 1. Learner unit lock in effective organization
1. Log in as learner assigned to a unit in one organization.
2. Open `/quiz-lobby`.
3. Observe leaderboard unit filter default.

Expected result:
- Unit filter defaults to learner-assigned unit.
- No 403 errors for `/api/organization/sub-units/:unitId` when the unit belongs to effective organization.

### 2. Admin/teacher role normalization
1. Log in as `org_admin` user.
2. Open `/quiz-lobby`.
3. Inspect unit filter behavior.

Expected result:
- User is treated as admin/teacher (not learner-locked).
- Unit filter remains selectable; no learner-only lock from `unitId` context.

### 3. Impersonation-safe leaderboard defaults
1. Log in as SuperAdmin.
2. Start impersonation into an organization.
3. Open `/quiz-lobby`.
4. Inspect network response for `/api/user/roles`.

Expected result:
- Response includes effective organization context.
- `unitId`/`subUnitId` are only present when effective-org learner role exists.
- Leaderboard does not auto-apply foreign organization unit filters.

### 4. Stale/foreign unit filter fallback
1. Set leaderboard unit filter to a unit from org A.
2. Switch organization context to org B (or impersonate org B).
3. Re-open `/quiz-lobby`.

Expected result:
- Leaderboard resets invalid unit/sub-unit filters to `All` defaults.
- No blocking error state for leaderboard.

## Negative/Edge Cases
- If sub-unit fetch returns 403/404 for an invalid unit context, UI should not hard-fail and should continue with reset/default filters.
- If learner has no unit assignment in effective org, leaderboard remains on all-units view.

## Change Summary
- 2026-03-23: Added test coverage for role normalization (`org_admin`), impersonation-safe assignment context, and invalid-unit fallback behavior on quiz-lobby leaderboard.
