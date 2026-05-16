-- Course Draft Framework Generator Migration
-- Creates tables for AI-assisted course creation wizard

-- Create extraction status enum
DO $$ BEGIN
  CREATE TYPE "extractionStatus" AS ENUM('pending', 'processing', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create course draft step enum
DO $$ BEGIN
  CREATE TYPE "courseDraftStep" AS ENUM('upload', 'select_content', 'generate', 'review', 'complete');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create course draft frameworks table
CREATE TABLE IF NOT EXISTS "courseDraftFrameworks" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organizationId" varchar NOT NULL,
  "createdBy" varchar NOT NULL,
  "courseDescription" text,
  "generatedTitle" varchar,
  "generatedDescription" text,
  "generatedLessons" jsonb,
  "recommendedLessons" jsonb,
  "currentStep" "courseDraftStep" DEFAULT 'upload',
  "version" integer DEFAULT 1 NOT NULL,
  "expiresAt" timestamp,
  "isPublished" boolean DEFAULT false,
  "publishedCourseId" varchar,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);

-- Create course draft documents table
CREATE TABLE IF NOT EXISTS "courseDraftDocuments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "draftId" varchar NOT NULL,
  "fileName" varchar NOT NULL,
  "mimeType" varchar NOT NULL,
  "fileSize" integer NOT NULL,
  "storagePath" varchar NOT NULL,
  "checksum" varchar,
  "extractionStatus" "extractionStatus" DEFAULT 'pending',
  "extractedContent" jsonb,
  "extractionError" text,
  "lessonIndex" integer,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);

-- Add foreign key constraints
DO $$ BEGIN
  ALTER TABLE "courseDraftFrameworks" ADD CONSTRAINT "courseDraftFrameworks_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "courseDraftFrameworks" ADD CONSTRAINT "courseDraftFrameworks_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "courseDraftFrameworks" ADD CONSTRAINT "courseDraftFrameworks_publishedCourseId_courses_id_fk" FOREIGN KEY ("publishedCourseId") REFERENCES "courses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "courseDraftDocuments" ADD CONSTRAINT "courseDraftDocuments_draftId_courseDraftFrameworks_id_fk" FOREIGN KEY ("draftId") REFERENCES "courseDraftFrameworks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create indexes for query performance
CREATE INDEX IF NOT EXISTS "IDX_course_draft_frameworks_org" ON "courseDraftFrameworks" ("organizationId");
CREATE INDEX IF NOT EXISTS "IDX_course_draft_frameworks_creator" ON "courseDraftFrameworks" ("createdBy");
CREATE INDEX IF NOT EXISTS "IDX_course_draft_frameworks_expires" ON "courseDraftFrameworks" ("expiresAt");
CREATE INDEX IF NOT EXISTS "IDX_course_draft_documents_draft" ON "courseDraftDocuments" ("draftId");
CREATE INDEX IF NOT EXISTS "IDX_course_draft_documents_status" ON "courseDraftDocuments" ("extractionStatus");
