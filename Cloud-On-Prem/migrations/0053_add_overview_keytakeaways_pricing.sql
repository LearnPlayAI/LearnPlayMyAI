-- Add dedicated LP Credit pricing columns for Overview and Key Takeaways generation
ALTER TABLE "platformPricing" ADD COLUMN IF NOT EXISTS "creditsPerOverviewGeneration" integer NOT NULL DEFAULT 25;
ALTER TABLE "platformPricing" ADD COLUMN IF NOT EXISTS "creditsPerKeyTakeawaysGeneration" integer NOT NULL DEFAULT 25;
