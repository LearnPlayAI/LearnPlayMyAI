-- Migration: Inter-Org Course Assignment Rules
-- Adds support for cross-organization course assignments (on-prem only)

-- 1. Create inter-org course assignment rules table
CREATE TABLE IF NOT EXISTS "interOrgCourseAssignmentRules" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "sourceOrganizationId" varchar NOT NULL REFERENCES "organizations"("id"),
  "targetOrganizationId" varchar NOT NULL REFERENCES "organizations"("id"),
  "enabled" boolean NOT NULL DEFAULT true,
  "createdBy" varchar NOT NULL REFERENCES "users"("id"),
  "createdAt" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_interorg_rules_source" ON "interOrgCourseAssignmentRules" ("sourceOrganizationId");
CREATE INDEX IF NOT EXISTS "IDX_interorg_rules_target" ON "interOrgCourseAssignmentRules" ("targetOrganizationId");

DO $$ BEGIN
  ALTER TABLE "interOrgCourseAssignmentRules"
    ADD CONSTRAINT "UNQ_interorg_rule_pair" UNIQUE ("sourceOrganizationId", "targetOrganizationId");
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

-- 2. Add targetOrganizationId column to courseAssignments
ALTER TABLE "courseAssignments" ADD COLUMN IF NOT EXISTS "targetOrganizationId" varchar REFERENCES "organizations"("id");

CREATE INDEX IF NOT EXISTS "IDX_course_assignments_target_org" ON "courseAssignments" ("targetOrganizationId");

-- 3. Update uniqueness constraints to include targetOrganizationId
-- Drop old constraints and recreate with targetOrganizationId
DO $$ BEGIN
  ALTER TABLE "courseAssignments" DROP CONSTRAINT IF EXISTS "UNQ_course_assignment_user";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "courseAssignments" DROP CONSTRAINT IF EXISTS "UNQ_course_assignment_scope";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "courseAssignments"
    ADD CONSTRAINT "UNQ_course_assignment_user" UNIQUE NULLS NOT DISTINCT ("courseId", "userId", "organizationId", "targetOrganizationId");
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "courseAssignments"
    ADD CONSTRAINT "UNQ_course_assignment_scope" UNIQUE NULLS NOT DISTINCT ("courseId", "organizationId", "audience", "unitId", "subUnitId", "teamId", "targetOrganizationId");
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;
