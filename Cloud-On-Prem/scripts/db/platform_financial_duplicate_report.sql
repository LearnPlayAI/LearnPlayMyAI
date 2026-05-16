WITH revenue_dups AS (
  SELECT COUNT(*)::int AS groups, COALESCE(SUM(cnt - 1), 0)::int AS extra_rows
  FROM (
    SELECT "sourceType", "sourceId", COUNT(*) AS cnt
    FROM "platformRevenueSources"
    WHERE "sourceId" IS NOT NULL
    GROUP BY 1,2
    HAVING COUNT(*) > 1
  ) t
), report_dups AS (
  SELECT COUNT(*)::int AS groups, COALESCE(SUM(cnt - 1), 0)::int AS extra_rows
  FROM (
    SELECT "reportDate", COALESCE("organizationType"::text, '__NULL__') AS org_key, COUNT(*) AS cnt
    FROM "platformRevenueReports"
    GROUP BY 1,2
    HAVING COUNT(*) > 1
  ) t
), snapshot_dups AS (
  SELECT COUNT(*)::int AS groups, COALESCE(SUM(cnt - 1), 0)::int AS extra_rows
  FROM (
    SELECT "periodStart", "periodEnd", "periodType", COALESCE("organizationId", '00000000-0000-0000-0000-000000000000') AS org_key, COUNT(*) AS cnt
    FROM "platformFinancialSnapshots"
    GROUP BY 1,2,3,4
    HAVING COUNT(*) > 1
  ) t
), automated_cost_dups AS (
  SELECT COUNT(*)::int AS groups, COALESCE(SUM(cnt - 1), 0)::int AS extra_rows
  FROM (
    SELECT "categoryId", COALESCE("organizationId", '00000000-0000-0000-0000-000000000000') AS org_key, "sourceReference", "effectiveDate", COUNT(*) AS cnt
    FROM "platformCostEntries"
    WHERE COALESCE("isAutomated", false) = true
      AND "sourceReference" IS NOT NULL
    GROUP BY 1,2,3,4
    HAVING COUNT(*) > 1
  ) t
), manual_cost_dups AS (
  SELECT COUNT(*)::int AS groups, COALESCE(SUM(cnt - 1), 0)::int AS extra_rows
  FROM (
    SELECT
      "categoryId",
      COALESCE("organizationId", '00000000-0000-0000-0000-000000000000') AS org_key,
      TRIM("description") AS description_key,
      "amount",
      "currency",
      "normalizedAmountZAR",
      "recurrence",
      "effectiveDate",
      COALESCE("endDate"::text, '') AS end_key,
      COALESCE("createdBy", '') AS created_by_key,
      COALESCE("metadata"::text, '') AS metadata_key,
      COUNT(*) AS cnt
    FROM "platformCostEntries"
    WHERE COALESCE("isAutomated", false) = false
    GROUP BY 1,2,3,4,5,6,7,8,9,10,11
    HAVING COUNT(*) > 1
  ) t
), category_dups AS (
  SELECT COUNT(*)::int AS groups, COALESCE(SUM(cnt - 1), 0)::int AS extra_rows
  FROM (
    SELECT LOWER(TRIM("name")) AS name_key, LOWER(TRIM("type")) AS type_key, COUNT(*) AS cnt
    FROM "platformCostCategories"
    GROUP BY 1,2
    HAVING COUNT(*) > 1
  ) t
), category_type_dups AS (
  SELECT COUNT(*)::int AS groups, COALESCE(SUM(cnt - 1), 0)::int AS extra_rows
  FROM (
    SELECT LOWER(TRIM("name")) AS name_key, COUNT(*) AS cnt
    FROM "platformCostCategoryTypes"
    GROUP BY 1
    HAVING COUNT(*) > 1
  ) t
)
SELECT 'platformRevenueSources_by_sourceType_sourceId' AS check_name, groups, extra_rows FROM revenue_dups
UNION ALL
SELECT 'platformRevenueReports_by_reportDate_orgType', groups, extra_rows FROM report_dups
UNION ALL
SELECT 'platformFinancialSnapshots_by_period_org', groups, extra_rows FROM snapshot_dups
UNION ALL
SELECT 'platformCostEntries_automated_by_sourceReference', groups, extra_rows FROM automated_cost_dups
UNION ALL
SELECT 'platformCostEntries_manual_exact', groups, extra_rows FROM manual_cost_dups
UNION ALL
SELECT 'platformCostCategories_by_name_type', groups, extra_rows FROM category_dups
UNION ALL
SELECT 'platformCostCategoryTypes_by_name', groups, extra_rows FROM category_type_dups
ORDER BY check_name;
