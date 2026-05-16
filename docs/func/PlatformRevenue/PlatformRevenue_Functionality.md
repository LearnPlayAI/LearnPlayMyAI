# Platform Revenue and Costs Functionality

## Scope
This domain covers platform finance data used by SuperAdmin reporting, including:
- Revenue source ingestion (`platformRevenueSources`)
- Daily revenue report cache (`platformRevenueReports`)
- Financial period snapshots (`platformFinancialSnapshots`)
- Platform cost types/categories/entries (`platformCostCategoryTypes`, `platformCostCategories`, `platformCostEntries`)

## Core Behaviors
- Revenue source ingestion is idempotent for source-backed events.
  - Natural key: `(sourceType, sourceId)` when `sourceId` exists.
  - Repeated ingestion of the same source event returns the existing record instead of creating duplicates.
- Revenue report cache is unique per day and org-type context.
  - Exactly one row per `reportDate` for `organizationType IS NULL` (global report).
  - Exactly one row per `(reportDate, organizationType)` when org type is present.
  - Concurrent cache writers reconcile to update the canonical row on key conflict.
- Financial snapshots are unique per period and org context (null-aware).
  - Exactly one row per `(periodStart, periodEnd, periodType)` when organization is null.
  - Exactly one row per `(periodStart, periodEnd, periodType, organizationId)` when organization is present.
  - Concurrent snapshot generation reconciles to update the canonical row on key conflict.
- Automated cost ingestion is idempotent.
  - Natural key: `(categoryId, organizationId, sourceReference, effectiveDate)` for automated rows with `sourceReference`.
- Cost category type creation is canonicalized and duplicate-safe.
  - Name matching is case-insensitive and trim-insensitive.
  - Duplicate create attempts return existing record identity.
- Cost category creation is canonicalized and duplicate-safe.
  - Matching key is case-insensitive and trim-insensitive `(name, type)`.
  - Duplicate create attempts return existing record identity.
- Manual cost entry creation has a short retry/double-submit guard.
  - Same creator + same payload in a 5-minute window returns existing row.

## Data Hygiene and Remediation
- A standard dedupe script exists at:
  - `Cloud-On-Prem/scripts/db/platform_financial_dedupe.sql`
- A verification report exists at:
  - `Cloud-On-Prem/scripts/db/platform_financial_duplicate_report.sql`
- The dedupe script:
  - Removes duplicate groups for revenue sources, report cache, snapshots, automated costs, manual exact duplicates, cost types, and cost categories.
  - Remaps dependent foreign-key references before deleting duplicate parent rows.
  - Recreates required idempotency/uniqueness indexes.

## Environment Notes (DEV/ACC/PRD)
- Behavior and constraints are intended to be identical across DEV, ACC, and PRD for both cloud and onprem variants.
- No intentional environment-specific logic differences exist for dedupe or uniqueness behavior.

## Change Summary
- Added null-aware uniqueness rules for report and snapshot caches.
- Added canonical uniqueness for category types and categories.
- Added idempotent ingest/creation behavior in service layer for concurrent/retry-safe writes.
- Added standardized DB dedupe and duplicate-report scripts for operational cleanup and verification.
- Hardened demo data seeding so repeated/retried batches update existing finance seed rows instead of inserting duplicates.
