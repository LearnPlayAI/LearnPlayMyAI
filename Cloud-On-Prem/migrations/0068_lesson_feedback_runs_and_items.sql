DO $$ BEGIN
    CREATE TYPE "lessonFeedbackCategory" AS ENUM('on_topic', 'possibly_off_topic', 'off_topic');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "lessonFeedbackDecision" AS ENUM('pending', 'accepted', 'rejected', 'ignored', 'applied', 'stale');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "lessonFeedbackRuns" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    "lessonId" varchar NOT NULL REFERENCES "lessons"("id") ON DELETE cascade,
    "organizationId" varchar NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
    "languageCode" varchar(10) DEFAULT 'en',
    "contentVersionRef" varchar NOT NULL,
    "contentHash" varchar(64) NOT NULL,
    "feedbackMode" varchar(20) NOT NULL DEFAULT 'quick',
    "score10" numeric(3, 1),
    "summary" text,
    "actionable" jsonb,
    "report" jsonb,
    "generatedAt" timestamp NOT NULL DEFAULT now(),
    "generatedBy" varchar REFERENCES "users"("id"),
    "appliedAt" timestamp,
    "appliedBy" varchar REFERENCES "users"("id"),
    "metadata" jsonb,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "lessonFeedbackItems" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    "runId" varchar NOT NULL REFERENCES "lessonFeedbackRuns"("id") ON DELETE cascade,
    "lessonId" varchar NOT NULL REFERENCES "lessons"("id") ON DELETE cascade,
    "organizationId" varchar NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
    "languageCode" varchar(10) DEFAULT 'en',
    "itemIndex" integer NOT NULL DEFAULT 0,
    "itemHash" varchar(64) NOT NULL,
    "category" "lessonFeedbackCategory" NOT NULL DEFAULT 'possibly_off_topic',
    "confidence" numeric(5, 4) NOT NULL DEFAULT 0.5000,
    "title" text NOT NULL,
    "reason" text,
    "excerpt" text,
    "spanStart" integer,
    "spanEnd" integer,
    "suggestedAction" text,
    "replacementText" text,
    "defaultSelected" boolean NOT NULL DEFAULT false,
    "userDecision" "lessonFeedbackDecision" NOT NULL DEFAULT 'pending',
    "decisionReason" text,
    "decidedAt" timestamp,
    "decidedBy" varchar REFERENCES "users"("id"),
    "appliedAt" timestamp,
    "appliedBy" varchar REFERENCES "users"("id"),
    "metadata" jsonb,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_lesson_feedback_runs_lesson" ON "lessonFeedbackRuns" ("lessonId");
CREATE INDEX IF NOT EXISTS "IDX_lesson_feedback_runs_org" ON "lessonFeedbackRuns" ("organizationId");
CREATE INDEX IF NOT EXISTS "IDX_lesson_feedback_runs_generated" ON "lessonFeedbackRuns" ("generatedAt");
CREATE INDEX IF NOT EXISTS "IDX_lesson_feedback_runs_version" ON "lessonFeedbackRuns" ("contentVersionRef");

CREATE INDEX IF NOT EXISTS "IDX_lesson_feedback_items_run" ON "lessonFeedbackItems" ("runId");
CREATE INDEX IF NOT EXISTS "IDX_lesson_feedback_items_lesson" ON "lessonFeedbackItems" ("lessonId");
CREATE INDEX IF NOT EXISTS "IDX_lesson_feedback_items_org" ON "lessonFeedbackItems" ("organizationId");
CREATE INDEX IF NOT EXISTS "IDX_lesson_feedback_items_hash" ON "lessonFeedbackItems" ("itemHash");
