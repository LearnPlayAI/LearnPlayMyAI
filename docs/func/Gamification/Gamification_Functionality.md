# Gamification Functionality

## About
This document defines core quiz-lobby gamification behavior, with focus on leaderboard filter context and impersonation-safe organization scoping.

## Scope
- `/quiz-lobby` leaderboard filters and organization context selection
- Role-based learner vs admin/teacher filter behavior
- Backend `/api/user/roles` context payload used by quiz-lobby

## Feature List
- Leaderboard organization/unit/sub-unit/subject filtering for organization collections
- Learner unit lock behavior based on assignment context
- Impersonation-safe effective-organization assignment context in `/api/user/roles`
- Defensive handling for stale/foreign unit filters in leaderboard UI

## Rules and Constraints
- Learner assignment context (`unitId`, `subUnitId`) is only returned for learner roles in the effective organization context.
- During impersonation, effective organization context determines assignment lookup and filter defaults.
- Admin/teacher roles must not be misclassified as learners due to role-string format differences (for example `org_admin` vs `orgadmin`).
- If a selected unit does not belong to the currently selected organization, leaderboard filters reset to organization-wide defaults.

## Environment-Specific Behavior
- cloud DEV, cloud ACC, cloud PRD:
  - Same role normalization and effective-org filter behavior.
- onprem DEV, onprem ACC, onprem PRD:
  - Same role normalization and effective-org filter behavior.

## Integrations
- `/api/user/roles`: provides effective organization + learner assignment context for quiz-lobby filters
- `/api/organization/units`: organization unit list used by leaderboard filters
- `/api/organization/sub-units/:unitId`: sub-unit list scoped to selected unit
- `/api/quiz-leaderboard`: leaderboard data query using active filter context

## Assumptions
- Session context and impersonation state are valid and current.
- Organization unit/sub-unit records are correctly linked to organization ownership.

## Out of Scope
- Challenge/power-up economy rules and balance calculations
- Quiz scoring algorithm changes

## Change Summary
- 2026-03-23: Hardened quiz-lobby leaderboard context handling for impersonation and mixed role-string formats, and restricted learner assignment context to effective-organization learner roles.
