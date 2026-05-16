-- Add missing quizId and questionTier columns to creditTransactions table
-- These columns were defined in schema but missing from database

-- Create questionTier enum if it doesn't exist
DO $$ BEGIN
  CREATE TYPE "quizQuestionTier" AS ENUM('10', '15', '20');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add quizId column (nullable, references quizCollections)
ALTER TABLE "creditTransactions" 
ADD COLUMN IF NOT EXISTS "quizId" varchar REFERENCES "quizCollections"("id");

-- Add questionTier column (nullable)
ALTER TABLE "creditTransactions" 
ADD COLUMN IF NOT EXISTS "questionTier" "quizQuestionTier";

-- Add index on quizId for efficient lookups
CREATE INDEX IF NOT EXISTS "IDX_credit_transactions_quiz" ON "creditTransactions" ("quizId");
