import { db } from "./db";
import { sql } from "drizzle-orm";

export async function ensurePlatformPricingSchemaCompatibility(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "platformPricing"
      ADD COLUMN IF NOT EXISTS "creditsPerHealthReport" integer NOT NULL DEFAULT 10,
      ADD COLUMN IF NOT EXISTS "creditsPerTopicAnalysis" integer NOT NULL DEFAULT 5,
      ADD COLUMN IF NOT EXISTS "creditsPerFrameworkGeneration" integer NOT NULL DEFAULT 20,
      ADD COLUMN IF NOT EXISTS "creditsPerExplanationGeneration" integer NOT NULL DEFAULT 25,
      ADD COLUMN IF NOT EXISTS "creditsPerAnswerCheck" integer NOT NULL DEFAULT 20,
      ADD COLUMN IF NOT EXISTS "creditsPerOverviewGeneration" integer NOT NULL DEFAULT 25,
      ADD COLUMN IF NOT EXISTS "creditsPerKeyTakeawaysGeneration" integer NOT NULL DEFAULT 25,
      ADD COLUMN IF NOT EXISTS "podcastEstimateLpcPerCharacter" numeric(10,6) NOT NULL DEFAULT 0.060000,
      ADD COLUMN IF NOT EXISTS "podcastConversationMultiplier" numeric(10,4) NOT NULL DEFAULT 1.1500,
      ADD COLUMN IF NOT EXISTS "podcastMinLpc" integer NOT NULL DEFAULT 40,
      ADD COLUMN IF NOT EXISTS "podcastMaxLpc" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "podcastElevenUsdPer1kChars" numeric(10,6) NOT NULL DEFAULT 0.300000,
      ADD COLUMN IF NOT EXISTS "podcastElevenSubscriptionUsdMonthly" numeric(12,6) NOT NULL DEFAULT 0.000000,
      ADD COLUMN IF NOT EXISTS "podcastElevenSubscriptionIncludedChars" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "podcastElevenTopupUsdPer1kChars" numeric(10,6) NOT NULL DEFAULT 0.300000,
      ADD COLUMN IF NOT EXISTS "podcastElevenExpectedMonthlyChars" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "podcastUsePackageFloorLpcValue" boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "podcastEnforceNoLossFloor" boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "podcastUsdToLocalFxRate" numeric(12,6) NOT NULL DEFAULT 18.500000,
      ADD COLUMN IF NOT EXISTS "podcastTargetMarginPercent" numeric(5,2) NOT NULL DEFAULT 35.00,
      ADD COLUMN IF NOT EXISTS "podcastLocalCurrencyPerLpc" numeric(10,6) NOT NULL DEFAULT 1.000000,
      ADD COLUMN IF NOT EXISTS "podcastSettlementGuardrailPct" numeric(5,2) NOT NULL DEFAULT 20.00;
  `);

  await db.execute(sql`
    ALTER TABLE "platformPricing"
    ALTER COLUMN "podcastMaxLpc" SET DEFAULT 0;
  `);
}

let ensurePlatformPricingOncePromise: Promise<void> | null = null;

export async function ensurePlatformPricingSchemaCompatibilityOnce(): Promise<void> {
  if (!ensurePlatformPricingOncePromise) {
    ensurePlatformPricingOncePromise = ensurePlatformPricingSchemaCompatibility()
      .catch((error) => {
        ensurePlatformPricingOncePromise = null;
        throw error;
      });
  }
  await ensurePlatformPricingOncePromise;
}
