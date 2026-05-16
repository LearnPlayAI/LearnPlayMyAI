-- Migration: Add framework generation status fields for background job queue
-- This enables framework generation to happen in the background with status polling

-- Create the enum type for framework generation status
DO $$ BEGIN
  CREATE TYPE "frameworkGenerationStatus" AS ENUM('idle', 'generating', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add generation status fields to courseDraftFrameworks table
ALTER TABLE "courseDraftFrameworks" 
ADD COLUMN IF NOT EXISTS "generationStatus" "frameworkGenerationStatus" DEFAULT 'idle';

ALTER TABLE "courseDraftFrameworks" 
ADD COLUMN IF NOT EXISTS "generationError" text;

ALTER TABLE "courseDraftFrameworks" 
ADD COLUMN IF NOT EXISTS "generationStartedAt" timestamp;

ALTER TABLE "courseDraftFrameworks" 
ADD COLUMN IF NOT EXISTS "generationCompletedAt" timestamp;

ALTER TABLE "courseDraftFrameworks" 
ADD COLUMN IF NOT EXISTS "generationMetadata" jsonb;

-- Add index for efficient querying of generating drafts
CREATE INDEX IF NOT EXISTS "IDX_course_draft_frameworks_generation_status" 
ON "courseDraftFrameworks" ("generationStatus");
