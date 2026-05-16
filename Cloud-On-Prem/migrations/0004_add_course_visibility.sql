-- Add course visibility enum and column for controlling course access
-- Visibility: 'public' for marketplace courses (elearning orgs), 'org_only' for internal courses (edu/business orgs)

-- Create the visibility enum type
DO $$ BEGIN
  CREATE TYPE "courseVisibility" AS ENUM('public', 'org_only');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add visibility column to courses table with default 'org_only' for safety
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "visibility" "courseVisibility" NOT NULL DEFAULT 'org_only';

-- Add index for visibility-based filtering
CREATE INDEX IF NOT EXISTS "IDX_courses_visibility" ON "courses" ("visibility");

-- Add composite index for marketplace browsing (active public courses)
CREATE INDEX IF NOT EXISTS "IDX_courses_status_visibility" ON "courses" ("status", "visibility");

-- Backfill existing courses based on organization type
-- E-learning orgs: set to 'public' (marketplace courses)
-- Education/Business orgs: keep as 'org_only' (internal courses)
UPDATE courses c
SET visibility = 'public'
FROM organizations o
WHERE c."organizationId" = o.id
  AND o.type = 'elearning'
  AND c.visibility = 'org_only';
