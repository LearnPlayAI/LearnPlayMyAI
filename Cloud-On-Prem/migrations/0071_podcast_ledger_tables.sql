CREATE TABLE IF NOT EXISTS podcast_provider_cost_ledger (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "correlationId" varchar NOT NULL UNIQUE,
  "lessonId" varchar NOT NULL,
  "organizationId" varchar NOT NULL,
  "versionId" varchar NOT NULL,
  "userId" varchar,
  "usageUnit" varchar NOT NULL DEFAULT 'character',
  "usageAmount" integer NOT NULL DEFAULT 0,
  "providerCostUsd" numeric(14,6) NOT NULL DEFAULT 0,
  "providerCurrency" varchar NOT NULL DEFAULT 'USD',
  "providerUnitPriceUsd" numeric(14,6),
  "fxRateUsdToLocal" numeric(16,8),
  "localCurrency" varchar NOT NULL DEFAULT 'ZAR',
  "providerCostLocal" numeric(14,6),
  "pricingConfigVersion" varchar,
  metadata jsonb,
  "createdAt" timestamp DEFAULT now()
);

ALTER TABLE podcast_provider_cost_ledger
  ADD COLUMN IF NOT EXISTS "correlationId" varchar,
  ADD COLUMN IF NOT EXISTS "lessonId" varchar,
  ADD COLUMN IF NOT EXISTS "organizationId" varchar,
  ADD COLUMN IF NOT EXISTS "versionId" varchar,
  ADD COLUMN IF NOT EXISTS "userId" varchar,
  ADD COLUMN IF NOT EXISTS "usageUnit" varchar DEFAULT 'character',
  ADD COLUMN IF NOT EXISTS "usageAmount" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "providerCostUsd" numeric(14,6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "providerCurrency" varchar DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS "providerUnitPriceUsd" numeric(14,6),
  ADD COLUMN IF NOT EXISTS "fxRateUsdToLocal" numeric(16,8),
  ADD COLUMN IF NOT EXISTS "localCurrency" varchar DEFAULT 'ZAR',
  ADD COLUMN IF NOT EXISTS "providerCostLocal" numeric(14,6),
  ADD COLUMN IF NOT EXISTS "pricingConfigVersion" varchar,
  ADD COLUMN IF NOT EXISTS metadata jsonb,
  ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT now();

ALTER TABLE podcast_provider_cost_ledger DROP CONSTRAINT IF EXISTS podcast_provider_cost_ledger_lessonId_fkey;
ALTER TABLE podcast_provider_cost_ledger DROP CONSTRAINT IF EXISTS podcast_provider_cost_ledger_organizationId_fkey;
ALTER TABLE podcast_provider_cost_ledger DROP CONSTRAINT IF EXISTS podcast_provider_cost_ledger_userId_fkey;

DROP INDEX IF EXISTS "UNQ_podcast_provider_cost_correlation";
DROP INDEX IF EXISTS "IDX_podcast_provider_cost_lesson";
DROP INDEX IF EXISTS "IDX_podcast_provider_cost_org";
DROP INDEX IF EXISTS "IDX_podcast_provider_cost_version";
DROP INDEX IF EXISTS "IDX_podcast_provider_cost_created";

CREATE INDEX IF NOT EXISTS idx_podcast_provider_cost_lesson ON podcast_provider_cost_ledger ("lessonId");
CREATE INDEX IF NOT EXISTS idx_podcast_provider_cost_org ON podcast_provider_cost_ledger ("organizationId");
CREATE INDEX IF NOT EXISTS idx_podcast_provider_cost_version ON podcast_provider_cost_ledger ("versionId");
CREATE INDEX IF NOT EXISTS idx_podcast_provider_cost_created ON podcast_provider_cost_ledger ("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS unq_podcast_provider_cost_correlation_runtime ON podcast_provider_cost_ledger ("correlationId");

CREATE TABLE IF NOT EXISTS podcast_settlement_ledger (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "correlationId" varchar NOT NULL UNIQUE,
  "lessonId" varchar NOT NULL,
  "organizationId" varchar NOT NULL,
  "versionId" varchar NOT NULL UNIQUE,
  "userId" varchar,
  "estimateCharacters" integer NOT NULL DEFAULT 0,
  "estimatedLpcCost" integer NOT NULL DEFAULT 0,
  "settledLpcCost" integer NOT NULL DEFAULT 0,
  "estimateToFinalLpcDelta" integer NOT NULL DEFAULT 0,
  "settlementReason" varchar NOT NULL DEFAULT 'provider_cost_based',
  "targetMarginPercent" numeric(6,2),
  "localCurrencyPerLpc" numeric(14,6),
  "settlementGuardrailPct" numeric(6,2),
  "pricingConfigVersion" varchar,
  "userLedgerTransactionId" varchar,
  "orgLedgerTransactionId" varchar,
  metadata jsonb,
  "createdAt" timestamp DEFAULT now()
);

ALTER TABLE podcast_settlement_ledger
  ADD COLUMN IF NOT EXISTS "correlationId" varchar,
  ADD COLUMN IF NOT EXISTS "lessonId" varchar,
  ADD COLUMN IF NOT EXISTS "organizationId" varchar,
  ADD COLUMN IF NOT EXISTS "versionId" varchar,
  ADD COLUMN IF NOT EXISTS "userId" varchar,
  ADD COLUMN IF NOT EXISTS "estimateCharacters" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "estimatedLpcCost" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "settledLpcCost" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "estimateToFinalLpcDelta" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "settlementReason" varchar DEFAULT 'provider_cost_based',
  ADD COLUMN IF NOT EXISTS "targetMarginPercent" numeric(6,2),
  ADD COLUMN IF NOT EXISTS "localCurrencyPerLpc" numeric(14,6),
  ADD COLUMN IF NOT EXISTS "settlementGuardrailPct" numeric(6,2),
  ADD COLUMN IF NOT EXISTS "pricingConfigVersion" varchar,
  ADD COLUMN IF NOT EXISTS "userLedgerTransactionId" varchar,
  ADD COLUMN IF NOT EXISTS "orgLedgerTransactionId" varchar,
  ADD COLUMN IF NOT EXISTS metadata jsonb,
  ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT now();

DROP INDEX IF EXISTS "UNQ_podcast_settlement_correlation";
DROP INDEX IF EXISTS "UNQ_podcast_settlement_version";
DROP INDEX IF EXISTS "IDX_podcast_settlement_lesson";
DROP INDEX IF EXISTS "IDX_podcast_settlement_org";
DROP INDEX IF EXISTS "IDX_podcast_settlement_version";
DROP INDEX IF EXISTS "IDX_podcast_settlement_created";

CREATE INDEX IF NOT EXISTS idx_podcast_settlement_lesson ON podcast_settlement_ledger ("lessonId");
CREATE INDEX IF NOT EXISTS idx_podcast_settlement_org ON podcast_settlement_ledger ("organizationId");
CREATE INDEX IF NOT EXISTS idx_podcast_settlement_version ON podcast_settlement_ledger ("versionId");
CREATE INDEX IF NOT EXISTS idx_podcast_settlement_created ON podcast_settlement_ledger ("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS unq_podcast_settlement_correlation_runtime ON podcast_settlement_ledger ("correlationId");
CREATE UNIQUE INDEX IF NOT EXISTS unq_podcast_settlement_version_runtime ON podcast_settlement_ledger ("versionId");
