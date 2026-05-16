DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'courseAssignmentScope'
      AND e.enumlabel = 'subject'
  ) THEN
    ALTER TYPE "courseAssignmentScope" ADD VALUE 'subject';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "courseAssignments"
  ADD COLUMN IF NOT EXISTS "subjectId" varchar REFERENCES "subjects"("id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_course_assignments_subject"
  ON "courseAssignments" ("subjectId");
--> statement-breakpoint
ALTER TABLE "courseAssignments"
  DROP CONSTRAINT IF EXISTS "UNQ_course_assignment_scope";
--> statement-breakpoint
ALTER TABLE "courseAssignments"
  ADD CONSTRAINT "UNQ_course_assignment_scope"
  UNIQUE NULLS NOT DISTINCT (
    "courseId",
    "organizationId",
    "audience",
    "unitId",
    "subjectId",
    "subUnitId",
    "teamId",
    "targetOrganizationId"
  );
