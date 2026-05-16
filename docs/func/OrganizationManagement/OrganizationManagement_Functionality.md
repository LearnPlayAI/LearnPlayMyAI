# Organization Management Functionality

## About
This document defines current behavior for organization self-registration, organization hierarchy management, and organization-type terminology in admin surfaces.

## Scope
- Organization self-registration at `/org-registration`
- Central Management Hub hierarchy at `/org-management`
- Management Hub context and subject/topic handling where organization type changes wording
- Shared education/business/elearning terminology rendering

## Feature List
- Education organization registration supports grade selection and per-grade subject selection.
- Business organization registration supports department selection and per-department unit/topic setup.
- Registered education organizations create selected grades plus default `Class A` sub-units.
- Registered education grade subjects are persisted as organization `subjects` rows and linked to the selected grade through `unitSubjects`.
- Manually created subjects with a selected grade/unit are automatically linked to that grade/unit through `unitSubjects`.
- Join request approval validates the final selected subject IDs against the final selected grade/unit before mutating request approval, role, or assignment state.
- Education join request approval assigns the default learner role as `student`; on-prem DEV/QA business-only approval can map to `team_lead`, but education organizations must not be mapped to teacher during approval.
- The Central Management Hub hierarchy returns grade-level subjects with the grade node and renders those subjects when the grade is expanded.
- The hierarchy remains role/organization scoped through existing session organization access checks.

## Rules and Constraints
- Education grade-subject payload keys use numeric grade strings such as `"10"`, matching backend registration processing.
- Subject visibility in hierarchy depends on both `subjects` and `unitSubjects`; orphaned or deleted subjects must not appear as grade subjects.
- Join request subject assignment is valid only when every selected subject is linked to the selected/requested grade or unit.
- Subject rows in the Central Management Hub are display-only hierarchy children, not drag/drop movement targets and not independent member-assignment nodes.
- User-visible labels that differ by organization type must come from terminology helpers/components, not hardcoded copy.
- Current approved terminology sources are `getTerminology`, `getLowercaseTerminology`, `useOrganizationTerminology`, `Term`, and closely related shared helpers.

## Environment-Specific Behavior
- cloud DEV / cloud ACC / cloud PRD:
  - Organization registration and hierarchy behavior are shared with cloud runtime data.
- onprem DEV / onprem ACC / onprem PRD:
  - Organization registration and hierarchy behavior are shared, subject to onprem organization/license policy gates.

## Integrations
- `POST /api/org/register`: creates organization, creator role, grade/department structure, and education subject links.
- `POST /api/admin/subjects`: creates organization subjects and links grade/unit-scoped subjects to `unitSubjects`.
- `POST /api/admin/join-requests/:id/approve` and bulk/token approval paths: validate grade/unit-to-subject compatibility before approval-side effects.
- `GET /api/organization/hierarchy/:organizationId`: returns units, sub-units, teams, member counts, and grade-level subject metadata.
- `subjects`: organization subject definitions.
- `unitSubjects`: grade/department-to-subject/topic links.
- `organizationUnits`, `organizationSubUnits`, `organizationTeams`: hierarchy structure.

## Testing And Validation
- Source-level regression coverage must assert that education registration sends numeric grade-subject keys and that Central Management Hub code exposes/renders grade-level subjects.
- Source-level and DB-backed regression coverage must assert manual subject creation creates the unit-subject link, join approval rejects mismatched grade/subject requests before side effects, role defaults preserve education `student`, and active admin screens use centralized terminology helpers.
- Runtime acceptance follows the user-driven validation loop: user deploys the source change, manually registers or impersonates an education organization, and verifies subjects appear under selected grades in the Central Management Hub.
- Screenshot findings from manual validation are evidence and must be mapped back to the registration write path, hierarchy read path, or UI render path before remediation.

## Change Summary
- 2026-04-29: Hardened education organization subject/approval contracts after the registration hierarchy fix. Manual grade-scoped subject creation now links through `unitSubjects`; join request approval validates grade-subject compatibility before approval side effects; education approval defaults to `student`; active management screens use central organization terminology helpers for subject/unit/learner wording.
- 2026-04-29: Fixed education organization registration subject persistence by aligning grade-subject payload keys with backend processing, and made Central Management Hub render grade-level subjects from hierarchy data. Added durable documentation for user-driven runtime validation and terminology-helper label rendering.
