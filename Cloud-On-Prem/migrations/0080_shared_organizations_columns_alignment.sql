-- Shared schema alignment for organizations table across cloud + onprem.
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "subscriptionPlanTier" varchar DEFAULT 'standard';

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "monthlyLessonCredits" integer DEFAULT 10;
