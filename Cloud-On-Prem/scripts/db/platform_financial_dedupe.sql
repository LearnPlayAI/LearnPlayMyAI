BEGIN;

CREATE TEMP TABLE IF NOT EXISTS _dedupe_stats (
  action text,
  affected integer
);

-- 1) platformRevenueSources: dedupe by (sourceType, sourceId) for sourceId-backed events
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "sourceType", "sourceId"
           ORDER BY COALESCE("recordedAt", "createdAt") ASC, "createdAt" ASC, id ASC
         ) AS rn
  FROM "platformRevenueSources"
  WHERE "sourceId" IS NOT NULL
), del AS (
  DELETE FROM "platformRevenueSources" prs
  USING ranked r
  WHERE prs.id = r.id
    AND r.rn > 1
  RETURNING prs.id
)
INSERT INTO _dedupe_stats(action, affected)
SELECT 'platformRevenueSources duplicate source event rows removed', COUNT(*)::int FROM del;

-- 2) platformRevenueReports: keep latest per (reportDate, organizationType-null-aware)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "reportDate", COALESCE("organizationType"::text, '__NULL__')
           ORDER BY COALESCE("createdAt", now()) DESC, id DESC
         ) AS rn
  FROM "platformRevenueReports"
), del AS (
  DELETE FROM "platformRevenueReports" prr
  USING ranked r
  WHERE prr.id = r.id
    AND r.rn > 1
  RETURNING prr.id
)
INSERT INTO _dedupe_stats(action, affected)
SELECT 'platformRevenueReports duplicate cache rows removed', COUNT(*)::int FROM del;

-- 3) platformFinancialSnapshots: keep latest per period/org
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "periodStart", "periodEnd", "periodType", COALESCE("organizationId", '00000000-0000-0000-0000-000000000000')
           ORDER BY COALESCE("generatedAt", now()) DESC, id DESC
         ) AS rn
  FROM "platformFinancialSnapshots"
), del AS (
  DELETE FROM "platformFinancialSnapshots" pfs
  USING ranked r
  WHERE pfs.id = r.id
    AND r.rn > 1
  RETURNING pfs.id
)
INSERT INTO _dedupe_stats(action, affected)
SELECT 'platformFinancialSnapshots duplicate rows removed', COUNT(*)::int FROM del;

-- 4) platformCostCategoryTypes: dedupe by lower(name), keep most recently updated active row
WITH ranked AS (
  SELECT id,
         LOWER(TRIM("name")) AS canon_name,
         ROW_NUMBER() OVER (
           PARTITION BY LOWER(TRIM("name"))
           ORDER BY COALESCE("isActive", false) DESC, COALESCE("updatedAt", "createdAt", now()) DESC, id DESC
         ) AS rn
  FROM "platformCostCategoryTypes"
), canonical AS (
  SELECT canon_name, id AS keep_id
  FROM ranked
  WHERE rn = 1
), remap AS (
  SELECT r.id AS drop_id, c.keep_id, r.canon_name
  FROM ranked r
  JOIN canonical c ON c.canon_name = r.canon_name
  WHERE r.rn > 1
), merged_categories AS (
  UPDATE "platformCostCategories" c
  SET "type" = t_keep."name",
      "updatedAt" = now()
  FROM remap m
  JOIN "platformCostCategoryTypes" t_drop ON t_drop.id = m.drop_id
  JOIN "platformCostCategoryTypes" t_keep ON t_keep.id = m.keep_id
  WHERE c."type" = t_drop."name"
  RETURNING c.id
), del AS (
  DELETE FROM "platformCostCategoryTypes" t
  USING remap m
  WHERE t.id = m.drop_id
  RETURNING t.id
)
INSERT INTO _dedupe_stats(action, affected)
SELECT 'platformCostCategoryTypes duplicate rows removed', COUNT(*)::int FROM del;

-- 5) platformCostCategories: dedupe by lower(name)+lower(type), keep active/recent
WITH ranked AS (
  SELECT id,
         LOWER(TRIM("name")) AS canon_name,
         LOWER(TRIM("type")) AS canon_type,
         ROW_NUMBER() OVER (
           PARTITION BY LOWER(TRIM("name")), LOWER(TRIM("type"))
           ORDER BY COALESCE("isActive", false) DESC, COALESCE("updatedAt", "createdAt", now()) DESC, id DESC
         ) AS rn
  FROM "platformCostCategories"
), canonical AS (
  SELECT canon_name, canon_type, id AS keep_id
  FROM ranked
  WHERE rn = 1
), remap AS (
  SELECT r.id AS drop_id, c.keep_id
  FROM ranked r
  JOIN canonical c
    ON c.canon_name = r.canon_name
   AND c.canon_type = r.canon_type
  WHERE r.rn > 1
), moved_costs AS (
  UPDATE "platformCostEntries" e
  SET "categoryId" = m.keep_id,
      "updatedAt" = now()
  FROM remap m
  WHERE e."categoryId" = m.drop_id
  RETURNING e.id
), del AS (
  DELETE FROM "platformCostCategories" c
  USING remap m
  WHERE c.id = m.drop_id
  RETURNING c.id
)
INSERT INTO _dedupe_stats(action, affected)
SELECT 'platformCostCategories duplicate rows removed', COUNT(*)::int FROM del;

-- 6) platformCostEntries automated rows dedupe by source key
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "categoryId", COALESCE("organizationId", '00000000-0000-0000-0000-000000000000'), "sourceReference", "effectiveDate"
           ORDER BY COALESCE("updatedAt", "createdAt", now()) DESC, id DESC
         ) AS rn
  FROM "platformCostEntries"
  WHERE COALESCE("isAutomated", false) = true
    AND "sourceReference" IS NOT NULL
), drop_alloc AS (
  DELETE FROM "platformCostAllocations" a
  USING ranked r
  WHERE a."costEntryId" = r.id
    AND r.rn > 1
  RETURNING a.id
), del AS (
  DELETE FROM "platformCostEntries" e
  USING ranked r
  WHERE e.id = r.id
    AND r.rn > 1
  RETURNING e.id
)
INSERT INTO _dedupe_stats(action, affected)
SELECT 'platformCostEntries automated duplicate rows removed', COUNT(*)::int FROM del;

-- 7) platformCostEntries manual exact duplicates
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY
             "categoryId",
             COALESCE("organizationId", '00000000-0000-0000-0000-000000000000'),
             TRIM("description"),
             "amount",
             "currency",
             "normalizedAmountZAR",
             "recurrence",
             "effectiveDate",
             COALESCE("endDate"::text, ''),
             COALESCE("createdBy", ''),
             COALESCE("metadata"::text, '')
           ORDER BY COALESCE("createdAt", now()) ASC, id ASC
         ) AS rn
  FROM "platformCostEntries"
  WHERE COALESCE("isAutomated", false) = false
), drop_alloc AS (
  DELETE FROM "platformCostAllocations" a
  USING ranked r
  WHERE a."costEntryId" = r.id
    AND r.rn > 1
  RETURNING a.id
), del AS (
  DELETE FROM "platformCostEntries" e
  USING ranked r
  WHERE e.id = r.id
    AND r.rn > 1
  RETURNING e.id
)
INSERT INTO _dedupe_stats(action, affected)
SELECT 'platformCostEntries manual exact duplicate rows removed', COUNT(*)::int FROM del;

-- Summarize in-session dedupe actions before commit.
SELECT action, affected FROM _dedupe_stats ORDER BY action;

COMMIT;

-- Idempotency constraints/indexes (must run after dedupe)
CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_platform_revenue_sources_type_sourceid"
ON "platformRevenueSources"("sourceType", "sourceId")
WHERE "sourceId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_platform_revenue_reports_date_null_orgtype"
ON "platformRevenueReports"("reportDate")
WHERE "organizationType" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_platform_revenue_reports_date_orgtype"
ON "platformRevenueReports"("reportDate", "organizationType")
WHERE "organizationType" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_platform_cost_entries_automated_source"
ON "platformCostEntries"("categoryId", "organizationId", "sourceReference", "effectiveDate")
WHERE "isAutomated" = true AND "sourceReference" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_platform_cost_category_types_name_ci"
ON "platformCostCategoryTypes"(LOWER(TRIM("name")));

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_platform_cost_categories_name_type_ci"
ON "platformCostCategories"(LOWER(TRIM("name")), LOWER(TRIM("type")));

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_platform_financial_snapshot_period_null_org"
ON "platformFinancialSnapshots"("periodStart", "periodEnd", "periodType")
WHERE "organizationId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_platform_financial_snapshot_period_org"
ON "platformFinancialSnapshots"("periodStart", "periodEnd", "periodType", "organizationId")
WHERE "organizationId" IS NOT NULL;
