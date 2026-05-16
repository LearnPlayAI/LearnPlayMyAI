-- Add course completion certificate support
-- Allows certificates to be issued for completing all quizzes in a course

-- Create the certificate type enum
DO $$ BEGIN
  CREATE TYPE "certificateType" AS ENUM('lesson', 'course');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add certificateType column with default 'lesson' for existing records
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "certificateType" "certificateType" NOT NULL DEFAULT 'lesson';

-- Add courseId column (nullable, for course completion certificates)
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "courseId" VARCHAR;

-- Add courseTitle column (nullable, for course completion certificates)
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "courseTitle" VARCHAR;

-- Make lessonId nullable (was NOT NULL, but course certificates won't have a lessonId)
ALTER TABLE "certificates" ALTER COLUMN "lessonId" DROP NOT NULL;

-- Make lessonTitle nullable (was NOT NULL, but course certificates won't have a lessonTitle)
ALTER TABLE "certificates" ALTER COLUMN "lessonTitle" DROP NOT NULL;

-- Add foreign key constraint for courseId
DO $$ BEGIN
  ALTER TABLE "certificates" ADD CONSTRAINT "certificates_courseId_fkey" 
    FOREIGN KEY ("courseId") REFERENCES "courses"("id");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add index for course-based lookups
CREATE INDEX IF NOT EXISTS "IDX_certificates_course" ON "certificates" ("courseId");

-- Add index for certificate type filtering
CREATE INDEX IF NOT EXISTS "IDX_certificates_type" ON "certificates" ("certificateType");

-- Add unique constraint for course certificates (one per user per course)
-- Note: Using partial unique index to only apply when courseId is not null
CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_user_course_cert" ON "certificates" ("userId", "courseId") 
  WHERE "courseId" IS NOT NULL;
