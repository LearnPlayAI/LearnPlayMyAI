-- Remove lesson certificate support and keep course certificates only
BEGIN;

-- Remove legacy lesson certificates before tightening schema constraints.
DELETE FROM "certificates"
WHERE "certificateType" = 'lesson'
   OR "courseId" IS NULL;

-- Drop lesson-specific relational structure.
DROP INDEX IF EXISTS "IDX_certificates_lesson";
ALTER TABLE "certificates" DROP CONSTRAINT IF EXISTS "UNQ_user_lesson_cert";
ALTER TABLE "certificates" DROP COLUMN IF EXISTS "lessonId";
ALTER TABLE "certificates" DROP COLUMN IF EXISTS "lessonTitle";

-- Normalize remaining records as course certificates.
UPDATE "certificates" AS cert
SET "certificateType" = 'course'
WHERE cert."certificateType" <> 'course';

UPDATE "certificates" AS cert
SET "courseTitle" = COALESCE(cert."courseTitle", c."title")
FROM "courses" c
WHERE cert."courseId" = c."id"
  AND cert."courseTitle" IS NULL;

UPDATE "certificates"
SET "courseTitle" = 'Course Completion'
WHERE "courseTitle" IS NULL;

ALTER TABLE "certificates" ALTER COLUMN "courseId" SET NOT NULL;
ALTER TABLE "certificates" ALTER COLUMN "courseTitle" SET NOT NULL;
ALTER TABLE "certificates" ALTER COLUMN "certificateType" SET DEFAULT 'course';

-- Rebuild enum to remove the legacy lesson value.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'certificateType') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'certificateType_new') THEN
      CREATE TYPE "certificateType_new" AS ENUM ('course');
    END IF;

    -- Defaults referencing the old enum type block type conversion.
    ALTER TABLE "certificates" ALTER COLUMN "certificateType" DROP DEFAULT;

    ALTER TABLE "certificates"
      ALTER COLUMN "certificateType" TYPE "certificateType_new"
      USING 'course'::"certificateType_new";

    DROP TYPE "certificateType";
    ALTER TYPE "certificateType_new" RENAME TO "certificateType";
    ALTER TABLE "certificates" ALTER COLUMN "certificateType" SET DEFAULT 'course'::"certificateType";
  END IF;
END $$;

COMMIT;
