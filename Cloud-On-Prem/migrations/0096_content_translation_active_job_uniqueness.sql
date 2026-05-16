DO $$
BEGIN
  IF to_regclass('public."contentTranslationJobs"') IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM "contentTranslationJobs" t
  USING (
    SELECT ctid
    FROM (
      SELECT
        ctid,
        ROW_NUMBER() OVER (
          PARTITION BY "sourceCourseId", "targetLanguageCode"
          ORDER BY "updatedAt" DESC NULLS LAST, "createdAt" DESC NULLS LAST, id DESC
        ) AS rn
      FROM "contentTranslationJobs"
      WHERE "status" IN ('pending', 'in_progress')
    ) ranked
    WHERE ranked.rn > 1
  ) d
  WHERE t.ctid = d.ctid;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'UNQ_active_translation'
      AND conrelid = 'public."contentTranslationJobs"'::regclass
  ) THEN
    ALTER TABLE "contentTranslationJobs"
      DROP CONSTRAINT "UNQ_active_translation";
  END IF;

  DROP INDEX IF EXISTS "UNQ_active_translation";

  CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_active_translation"
    ON "contentTranslationJobs" ("sourceCourseId", "targetLanguageCode")
    WHERE "status" IN ('pending', 'in_progress');
END $$;
