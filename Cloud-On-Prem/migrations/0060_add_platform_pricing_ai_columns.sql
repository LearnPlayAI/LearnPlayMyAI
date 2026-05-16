ALTER TABLE "platformPricing" ADD COLUMN IF NOT EXISTS "creditsPerHealthReport" integer NOT NULL DEFAULT 10;
ALTER TABLE "platformPricing" ADD COLUMN IF NOT EXISTS "creditsPerTopicAnalysis" integer NOT NULL DEFAULT 5;
ALTER TABLE "platformPricing" ADD COLUMN IF NOT EXISTS "creditsPerFrameworkGeneration" integer NOT NULL DEFAULT 20;
ALTER TABLE "platformPricing" ADD COLUMN IF NOT EXISTS "creditsPerExplanationGeneration" integer NOT NULL DEFAULT 25;
ALTER TABLE "platformPricing" ADD COLUMN IF NOT EXISTS "creditsPerAnswerCheck" integer NOT NULL DEFAULT 20;
