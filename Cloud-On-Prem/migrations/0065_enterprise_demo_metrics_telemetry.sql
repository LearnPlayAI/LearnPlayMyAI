ALTER TABLE "enterprise_system_daily_telemetry"
  ADD COLUMN IF NOT EXISTS "totalDemoOrganizations" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalDemoUsers" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalDemoCourses" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalDemoPublishedCourses" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalDemoEnrollments" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalDemoCompletions" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalDemoPaidEnrollmentValue" numeric(19,4) DEFAULT '0',
  ADD COLUMN IF NOT EXISTS "totalDemoPaidCompletionValue" numeric(19,4) DEFAULT '0';
