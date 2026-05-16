# DemoData Functionality

## About
This document defines LearnPlay demo data functionality for Cloud and OnPrem systems.
It covers policy gating, admin access, backup/restore, generation, reset/purge behavior, and data consistency requirements for full-system demonstrations.

## Scope
- Demo data management UI and API
- Demo dataset generation across core application areas
- Demo dataset purge/reset lifecycle
- Database backup and restore from Demo Data Manager UI
- Environment and role-based protection rules

## Feature List
- Demo Data Manager page in admin panel (`/admin/demo-data`)
- Environment guard display (mode, stage, policy source, allow/block)
- Policy control in UI:
  - `Auto`
  - `Force Enable`
  - `Force Disable`
- Database operations from UI:
  - `Backup Database Now`
  - `Restore Database Backup` (choose from available backup list)
- Demo operations from UI:
  - `Generate Demo Data`
  - `Reset (Delete + Regenerate)`
  - `Delete All Demo Data`
- Generation controls for both Cloud and OnPrem:
  - Data-domain inclusion toggles (for example course catalog, enrollments/progress, reviews, gamification, join requests, inter-org assignments)
  - Feature-module planner with per-module enablement and volume intent
  - Naming convention selection:
    - `realistic` (no `[DEMO]` tagging)
    - `demo_tagged` (`[DEMO]` prefix style)
  - Custom generated-email domain
  - Activity timeframe window (`From`/`To` datetime range) used to anchor generated timestamps
  - Template lifecycle:
    - save current generation plan as reusable template
    - apply saved template
    - delete saved template
  - Pre-run preview endpoint/UI for estimated row volumes and dependency warnings
- Background job tracking:
  - queued/running/completed/failed
  - progress percentage
  - status message
  - recent jobs history

## Access Rules
- Cloud:
  - Demo data tools require `superAdmin`.
- OnPrem:
  - Demo data tools require `custSuper` or `superAdmin`.
- Side panel visibility:
  - Demo Data menu is visible to `superAdmin` and `custSuper` (including OnPrem).

## Environment and Policy Rules
- Hard PRD safety:
  - Demo data operations are always blocked in PRD-like stages (`prd`, `prod`, `production`, `live`).
- Default behavior (no OS-level toggles required):
  - DEV/ACC/QA/TEST/STAGING are enabled by default via stage policy.
- Optional override behavior (stored in database `systemSettings`):
  - `auto`: stage default behavior
  - `enabled`: force enable where not PRD
  - `disabled`: force disable
- Legacy env toggle:
  - `DEMO_DATA_ENABLED` remains supported as optional input, but is no longer required for normal DEV/ACC usage.

## Data Generation Coverage
- Organizations (single or multiple)
- Users per organization by type:
  - OnPrem `custSuper`
  - `orgAdmin`
  - `trainer` / `teamlead`
  - `learner` (including disabled learner logins on OnPrem where required)
- Org hierarchy:
  - Departments
  - Units
  - Teams
- Courses per organization with mixed statuses:
  - draft, active, inactive, archived
- Lessons per course:
  - 1 overview lesson
  - 1 content lesson
  - 1 key takeaways lesson
- Quiz data:
  - seeded question bank
  - lesson-linked quizzes for content and key-takeaways
  - user quiz progress and quiz game results
- Learning activity:
  - assignments
  - enrollments
  - course progress
  - lesson progress
  - certification artifacts
- Marketplace/commercial activity (Cloud):
  - course purchases
  - reviews and ratings
  - refund flow examples
  - credit pack purchases for non-learner roles
- Reviews and ratings (OnPrem):
  - seeded from enrolled learner activity without marketplace payment dependency
  - visible on admin course review surfaces (`/admin/course-reviews`)
- Credits/ledger:
  - user LP credit ledger
  - organization credit ledger
  - credit transactions/orders
- OnPrem cross-org:
  - inter-org sharing rules
  - cross-org assignments
- Reporting-supporting records:
  - financial/revenue snapshots
  - notification and engagement traces
- Timeframe control:
  - Generated activity timestamps are constrained to the selected generation window when provided.

## Data Quality and Consistency Rules
- Demo data must be internally consistent across related tables.
- If a user interacts with a generated course, related entities are also generated consistently:
  - assignment/enrollment/progress/quiz activity/ledger/reporting traces.
- Generated demo content is human-readable and realistic in style.
- Visible demo names and titles avoid random character strings.
- Uniqueness is enforced for key generated demo entities (for example org names, user emails, course titles) within each generation run.
- Generated organization user assignments are balanced across hierarchy depth:
  - department-level placements,
  - unit-level placements,
  - team-level placements.
- Approved join-request demo users follow the same balanced assignment policy so assignment depth is not biased toward teams only.

## Backup and Restore Behavior
- `Backup Database Now`:
  - Creates a compressed SQL backup (`.sql.gz`) via `pg_dump`.
  - Saves in runtime backup directories (auto-discovered/fallback path set).
- `Restore Database Backup`:
  - Requires explicit confirmation text.
  - Creates pre-restore safety backup.
  - Resets schema and restores from selected backup.
  - Restores DB to exact pre-generation baseline when used with backup created before generation.
- Known operational note:
  - During restore, active DB sessions are intentionally terminated; transient pool warnings are expected.

## Guardrails and Constraints
- Demo tools are intended for Cloud/OnPrem DEV and ACC tracks.
- PRD contamination prevention is mandatory and enforced.
- All destructive operations require explicit user confirmation text in UI.
- Only one demo-data job runs at a time.
- Duplicate-prevention default:
  - Standard `Generate Demo Data` now runs from a clean demo baseline by purging existing demo organizations first, then seeding.
  - This prevents duplicate accumulation across repeated generate runs.
  - Optional append behavior is still available only when explicitly requested by payload (`appendDemoData=true`).
- Purge/delete operations are schema-drift tolerant for known table/column variance in long-lived environments:
  - purge steps log warnings for missing/renamed optional columns/tables instead of failing the entire delete action.
- Purge/delete/reset operations must preserve data for the currently selected main organization:
  - selected main org is treated as protected scope,
  - users linked to protected org are excluded from demo user purge even if their data matches demo patterns.

## Integrations
- PostgreSQL (`pg_dump`, `psql`) for backup/restore
- Drizzle ORM for database operations
- Admin authentication/session middleware
- Admin side-panel navigation model
- `systemSettings` for persisted policy override and batch metadata

## Assumptions
- App runtime can access `pg_dump` and `psql`.
- Runtime has read/write access to selected backup directory.
- Stage/environment identifiers are set correctly on runtime.
- User running operations has required role.

## Out of Scope
- PRD enablement of demo data operations
- Non-admin access to demo tooling
- Direct OS-level scripts as primary UI workflow

## End-to-End Verification Summary
Validated in ACC profile simulation for both deployment modes:
- Cloud ACC:
  - backup -> generate -> verify growth -> restore -> baseline restored exactly
- OnPrem ACC:
  - backup -> generate -> verify growth including cross-org rules -> restore -> baseline restored exactly

Observed expected differences:
- Cloud generation includes marketplace purchases and credit order growth.
- OnPrem generation includes cross-org sharing growth; marketplace/credit purchases remain unchanged by design in OnPrem mode.
- OnPrem demo enrollment valuation now stores completed enrollment purchase-value records (using course price/currency) so enrollment reporting can show paid values without requiring real payment flows.

## Change Summary
- 2026-03-23: Added full Demo Data domain functionality documentation including policy model, UI/API capabilities, backup/restore behavior, data coverage, consistency rules, and ACC end-to-end verification outcomes.
- 2026-03-23: Added assignment distribution rule to balance generated demo users and approved demo join requests across department/unit/team hierarchy levels.
- 2026-03-23: Added OnPrem enrollment valuation rule so demo enrollments expose paid-value amounts in enrollment reporting while preserving no-real-payment operational semantics.
- 2026-03-23: Added OnPrem course-review seeding rule so demo generation populates realistic review/rating rows without relying on cloud marketplace purchase flow.
- 2026-03-23: Added purge schema-drift tolerance behavior for delete-all demo workflows so missing/renamed optional columns do not hard-fail full demo purge.
- 2026-03-24: Added configurable demo generation controls for Cloud and OnPrem to select generated data domains, naming convention style, generated email domain, and activity date/time window.
- 2026-03-24: Added full generation-planner workflow with feature-module controls, preview estimates/warnings, and reusable template save/apply/delete support.
- 2026-03-24: Added protected-main-org purge rule to prevent reset/delete operations from removing selected main-org data and linked user records.
- 2026-03-27: Added default pre-generate purge behavior so all demo seeding runs avoid duplicate accumulation across repeat executions (with explicit opt-in append mode only).
