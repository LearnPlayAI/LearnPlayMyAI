ALTER TABLE "platformPricing"
  ADD COLUMN IF NOT EXISTS "podcastElevenSubscriptionUsdMonthly" numeric(12,6) NOT NULL DEFAULT 0.000000,
  ADD COLUMN IF NOT EXISTS "podcastElevenSubscriptionIncludedChars" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "podcastElevenTopupUsdPer1kChars" numeric(10,6) NOT NULL DEFAULT 0.300000,
  ADD COLUMN IF NOT EXISTS "podcastElevenExpectedMonthlyChars" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "podcastUsePackageFloorLpcValue" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "podcastEnforceNoLossFloor" boolean NOT NULL DEFAULT true;
