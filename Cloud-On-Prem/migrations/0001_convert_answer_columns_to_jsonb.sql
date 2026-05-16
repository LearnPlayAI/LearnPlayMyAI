-- Migration: Convert player answer columns from integer to jsonb
-- This migration is required when deploying to production for the first time
-- or when upgrading from the old integer-based answer system

-- Step 1: Convert player1Answer from integer to jsonb
ALTER TABLE "activeQuizGames" 
ALTER COLUMN "player1Answer" TYPE jsonb 
USING CASE 
  WHEN "player1Answer" IS NULL THEN NULL 
  ELSE to_jsonb("player1Answer") 
END;

-- Step 2: Convert player2Answer from integer to jsonb
ALTER TABLE "activeQuizGames" 
ALTER COLUMN "player2Answer" TYPE jsonb 
USING CASE 
  WHEN "player2Answer" IS NULL THEN NULL 
  ELSE to_jsonb("player2Answer") 
END;

-- Note: This converts existing integer answer values to jsonb numbers
-- For example: integer 2 becomes jsonb 2
-- This maintains backward compatibility with existing data
