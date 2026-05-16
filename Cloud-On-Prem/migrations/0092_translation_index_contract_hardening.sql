DO $$
BEGIN
  IF to_regclass('public."translationIndexJobs"') IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM "translationIndexJobs" t
  USING (
    SELECT ctid
    FROM (
      SELECT
        ctid,
        ROW_NUMBER() OVER (
          PARTITION BY "dedupeKey"
          ORDER BY "updatedAt" DESC NULLS LAST, "createdAt" DESC NULLS LAST, id DESC
        ) AS rn
      FROM "translationIndexJobs"
      WHERE "dedupeKey" IS NOT NULL
    ) ranked
    WHERE ranked.rn > 1
  ) d
  WHERE t.ctid = d.ctid;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'translationIndexJobs_pkey'
      AND conrelid = 'public."translationIndexJobs"'::regclass
  ) THEN
    ALTER TABLE "translationIndexJobs"
      ADD CONSTRAINT "translationIndexJobs_pkey" PRIMARY KEY (id);
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_translation_index_jobs_dedupe"
    ON "translationIndexJobs" ("dedupeKey");
  CREATE INDEX IF NOT EXISTS "IDX_translation_index_jobs_status"
    ON "translationIndexJobs" ("status");
  CREATE INDEX IF NOT EXISTS "IDX_translation_index_jobs_next_retry"
    ON "translationIndexJobs" ("nextRetryAt");
  CREATE INDEX IF NOT EXISTS "IDX_translation_index_jobs_entity"
    ON "translationIndexJobs" ("entityType", "entityId");
  CREATE INDEX IF NOT EXISTS "IDX_translation_index_jobs_org"
    ON "translationIndexJobs" ("organizationId");
END $$;

DO $$
BEGIN
  IF to_regclass('public."translationIndexFailures"') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'translationIndexFailures_pkey'
      AND conrelid = 'public."translationIndexFailures"'::regclass
  ) THEN
    ALTER TABLE "translationIndexFailures"
      ADD CONSTRAINT "translationIndexFailures_pkey" PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'translationIndexFailures_jobId_translationIndexJobs_id_fk'
      AND conrelid = 'public."translationIndexFailures"'::regclass
  ) THEN
    ALTER TABLE "translationIndexFailures"
      ADD CONSTRAINT "translationIndexFailures_jobId_translationIndexJobs_id_fk"
      FOREIGN KEY ("jobId") REFERENCES "translationIndexJobs"(id)
      ON DELETE cascade;
  END IF;

  CREATE INDEX IF NOT EXISTS "IDX_translation_index_failures_job"
    ON "translationIndexFailures" ("jobId");
  CREATE INDEX IF NOT EXISTS "IDX_translation_index_failures_org"
    ON "translationIndexFailures" ("organizationId");
  CREATE INDEX IF NOT EXISTS "IDX_translation_index_failures_deadletter"
    ON "translationIndexFailures" ("deadLettered");
END $$;

DO $$
BEGIN
  IF to_regclass('public."translationSearchDocuments"') IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM "translationSearchDocuments" t
  USING (
    SELECT ctid
    FROM (
      SELECT
        ctid,
        ROW_NUMBER() OVER (
          PARTITION BY "entityType", "entityId", "languageCode"
          ORDER BY "indexedAt" DESC NULLS LAST, "variantUpdatedAt" DESC NULLS LAST, id DESC
        ) AS rn
      FROM "translationSearchDocuments"
    ) ranked
    WHERE ranked.rn > 1
  ) d
  WHERE t.ctid = d.ctid;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'translationSearchDocuments_pkey'
      AND conrelid = 'public."translationSearchDocuments"'::regclass
  ) THEN
    ALTER TABLE "translationSearchDocuments"
      ADD CONSTRAINT "translationSearchDocuments_pkey" PRIMARY KEY (id);
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_translation_search_docs_entity_lang"
    ON "translationSearchDocuments" ("entityType", "entityId", "languageCode");
  CREATE INDEX IF NOT EXISTS "IDX_translation_search_docs_org"
    ON "translationSearchDocuments" ("organizationId");
  CREATE INDEX IF NOT EXISTS "IDX_translation_search_docs_group_lang"
    ON "translationSearchDocuments" ("contentGroupId", "languageCode");
  CREATE INDEX IF NOT EXISTS "IDX_translation_search_docs_entity"
    ON "translationSearchDocuments" ("entityType", "entityId");
END $$;

DO $$
BEGIN
  IF to_regclass('public."translationAnalyticsEvents"') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'translationAnalyticsEvents_pkey'
      AND conrelid = 'public."translationAnalyticsEvents"'::regclass
  ) THEN
    ALTER TABLE "translationAnalyticsEvents"
      ADD CONSTRAINT "translationAnalyticsEvents_pkey" PRIMARY KEY (id);
  END IF;

  DELETE FROM "translationAnalyticsEvents" t
  USING (
    SELECT ctid
    FROM (
      SELECT
        ctid,
        ROW_NUMBER() OVER (
          PARTITION BY "dedupeKey"
          ORDER BY "occurredAt" DESC NULLS LAST, "createdAt" DESC NULLS LAST, id DESC
        ) AS rn
      FROM "translationAnalyticsEvents"
      WHERE "dedupeKey" IS NOT NULL
    ) ranked
    WHERE ranked.rn > 1
  ) d
  WHERE t.ctid = d.ctid;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'UNQ_translation_analytics_dedupe'
      AND conrelid = 'public."translationAnalyticsEvents"'::regclass
  ) THEN
    ALTER TABLE "translationAnalyticsEvents"
      ADD CONSTRAINT "UNQ_translation_analytics_dedupe" UNIQUE ("dedupeKey");
  END IF;

  CREATE INDEX IF NOT EXISTS "IDX_translation_analytics_org"
    ON "translationAnalyticsEvents" ("organizationId");
  CREATE INDEX IF NOT EXISTS "IDX_translation_analytics_event"
    ON "translationAnalyticsEvents" ("eventType");
  CREATE INDEX IF NOT EXISTS "IDX_translation_analytics_lang"
    ON "translationAnalyticsEvents" ("languageCode");
  CREATE INDEX IF NOT EXISTS "IDX_translation_analytics_variant"
    ON "translationAnalyticsEvents" ("variantId");
  CREATE INDEX IF NOT EXISTS "IDX_translation_analytics_occurred"
    ON "translationAnalyticsEvents" ("occurredAt");
END $$;
