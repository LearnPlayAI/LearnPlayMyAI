DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'translationIndexJobStatus') THEN
    CREATE TYPE "translationIndexJobStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'dead_letter');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'translationIndexEventType') THEN
    CREATE TYPE "translationIndexEventType" AS ENUM ('create', 'update', 'translate', 'publish', 'unpublish', 'set_current', 'set_active');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'translationIndexEntityType') THEN
    CREATE TYPE "translationIndexEntityType" AS ENUM ('course', 'lesson', 'quiz', 'podcast');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'translationAnalyticsEventType') THEN
    CREATE TYPE "translationAnalyticsEventType" AS ENUM (
      'content_view',
      'quiz_attempt',
      'quiz_review',
      'podcast_play',
      'podcast_download',
      'podcast_set_active',
      'translation_start',
      'translation_retry',
      'translation_fail',
      'translation_success',
      'translation_publish',
      'publish_readiness_check',
      'publish_action'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "translationIndexJobs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" varchar NOT NULL REFERENCES "organizations"("id"),
  "entityType" "translationIndexEntityType" NOT NULL,
  "entityId" varchar NOT NULL,
  "eventType" "translationIndexEventType" NOT NULL,
  "languageCode" varchar(10),
  "contentGroupId" varchar,
  "dedupeKey" varchar NOT NULL,
  "status" "translationIndexJobStatus" NOT NULL DEFAULT 'pending',
  "attemptCount" integer NOT NULL DEFAULT 0,
  "maxAttempts" integer NOT NULL DEFAULT 5,
  "nextRetryAt" timestamp,
  "processedAt" timestamp,
  "lastError" text,
  "payload" jsonb,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_translation_index_jobs_dedupe" ON "translationIndexJobs" ("dedupeKey");
CREATE INDEX IF NOT EXISTS "IDX_translation_index_jobs_status" ON "translationIndexJobs" ("status");
CREATE INDEX IF NOT EXISTS "IDX_translation_index_jobs_next_retry" ON "translationIndexJobs" ("nextRetryAt");
CREATE INDEX IF NOT EXISTS "IDX_translation_index_jobs_entity" ON "translationIndexJobs" ("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "IDX_translation_index_jobs_org" ON "translationIndexJobs" ("organizationId");

CREATE TABLE IF NOT EXISTS "translationIndexFailures" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "jobId" varchar NOT NULL REFERENCES "translationIndexJobs"("id") ON DELETE cascade,
  "organizationId" varchar NOT NULL REFERENCES "organizations"("id"),
  "errorMessage" text NOT NULL,
  "attemptCount" integer NOT NULL,
  "deadLettered" boolean NOT NULL DEFAULT false,
  "payload" jsonb,
  "createdAt" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_translation_index_failures_job" ON "translationIndexFailures" ("jobId");
CREATE INDEX IF NOT EXISTS "IDX_translation_index_failures_org" ON "translationIndexFailures" ("organizationId");
CREATE INDEX IF NOT EXISTS "IDX_translation_index_failures_deadletter" ON "translationIndexFailures" ("deadLettered");

CREATE TABLE IF NOT EXISTS "translationSearchDocuments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" varchar NOT NULL REFERENCES "organizations"("id"),
  "entityType" "translationIndexEntityType" NOT NULL,
  "entityId" varchar NOT NULL,
  "languageCode" varchar(10) NOT NULL DEFAULT 'en',
  "contentGroupId" varchar,
  "sourceEntityId" varchar,
  "title" text,
  "summary" text,
  "searchableText" text NOT NULL,
  "variantUpdatedAt" timestamp,
  "indexedAt" timestamp DEFAULT now(),
  "metadata" jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_translation_search_docs_entity_lang" ON "translationSearchDocuments" ("entityType", "entityId", "languageCode");
CREATE INDEX IF NOT EXISTS "IDX_translation_search_docs_org" ON "translationSearchDocuments" ("organizationId");
CREATE INDEX IF NOT EXISTS "IDX_translation_search_docs_group_lang" ON "translationSearchDocuments" ("contentGroupId", "languageCode");
CREATE INDEX IF NOT EXISTS "IDX_translation_search_docs_entity" ON "translationSearchDocuments" ("entityType", "entityId");

CREATE TABLE IF NOT EXISTS "translationAnalyticsEvents" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" varchar NOT NULL REFERENCES "organizations"("id"),
  "userId" varchar REFERENCES "users"("id"),
  "eventType" "translationAnalyticsEventType" NOT NULL,
  "resourceType" "translationIndexEntityType" NOT NULL,
  "resourceId" varchar NOT NULL,
  "languageCode" varchar(10),
  "variantId" varchar,
  "contentGroupId" varchar,
  "canonicalGroupId" varchar,
  "dedupeKey" varchar,
  "metadata" jsonb,
  "occurredAt" timestamp DEFAULT now(),
  "createdAt" timestamp DEFAULT now()
);

DROP INDEX IF EXISTS "UNQ_translation_analytics_dedupe";
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'UNQ_translation_analytics_dedupe'
  ) THEN
    ALTER TABLE "translationAnalyticsEvents"
      ADD CONSTRAINT "UNQ_translation_analytics_dedupe" UNIQUE ("dedupeKey");
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "IDX_translation_analytics_org" ON "translationAnalyticsEvents" ("organizationId");
CREATE INDEX IF NOT EXISTS "IDX_translation_analytics_event" ON "translationAnalyticsEvents" ("eventType");
CREATE INDEX IF NOT EXISTS "IDX_translation_analytics_lang" ON "translationAnalyticsEvents" ("languageCode");
CREATE INDEX IF NOT EXISTS "IDX_translation_analytics_variant" ON "translationAnalyticsEvents" ("variantId");
CREATE INDEX IF NOT EXISTS "IDX_translation_analytics_occurred" ON "translationAnalyticsEvents" ("occurredAt");
