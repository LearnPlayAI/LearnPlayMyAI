-- Add royalty policy and expanded on-prem telemetry metrics for enterprise reporting.

ALTER TABLE "enterprise_customers"
  ADD COLUMN IF NOT EXISTS "royaltyPercentage" decimal(5, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE "enterprise_system_daily_telemetry"
  ADD COLUMN IF NOT EXISTS "totalOrgAdmins" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalTrainers" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalLearners" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalCustSupers" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalSuperAdmins" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalOrganizations" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalPublishedCourses" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalPublishedEnrollments" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalPaidCourseEnrollments" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalFreeCourseEnrollments" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalPaidEnrollmentValue" decimal(19, 4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalFreeEnrollmentValue" decimal(19, 4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalPublishedAssignments" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalPaidCourseCompletions" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalFreeCourseCompletions" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalPaidCompletionValue" decimal(19, 4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalFreeCourseCompletionsValue" decimal(19, 4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "activeUsers30Days" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "royaltyPercentageApplied" decimal(5, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "royaltyRevenueEnrollments" decimal(19, 4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "royaltyRevenueCompletions" decimal(19, 4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "royaltyRevenueTotal" decimal(19, 4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "metricCurrency" varchar,
  ADD COLUMN IF NOT EXISTS "metricsSchemaVersion" integer DEFAULT 1;

CREATE INDEX IF NOT EXISTS "IDX_enterprise_telemetry_customer_report"
  ON "enterprise_system_daily_telemetry" ("enterpriseCustomerId", "reportDate");

CREATE INDEX IF NOT EXISTS "IDX_enterprise_telemetry_customer_system_report"
  ON "enterprise_system_daily_telemetry" ("enterpriseCustomerId", "enterpriseSystemId", "reportDate");
