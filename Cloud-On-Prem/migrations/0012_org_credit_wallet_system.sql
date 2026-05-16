-- Migration: Organization Credit Wallet System
-- This migration adds support for organization-level LP credits

-- ==================== NEW ENUMS ====================

-- Credit purchase target enum
DO $$ BEGIN
    CREATE TYPE "creditPurchaseTarget" AS ENUM ('user', 'organization');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Organization credit activity type enum
DO $$ BEGIN
    CREATE TYPE "orgCreditActivityType" AS ENUM (
        'lesson_generation',
        'quiz_generation',
        'thumbnail_generation',
        'course_framework',
        'purchase',
        'refund',
        'adjustment',
        'trial_grant'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==================== ORGANIZATIONS TABLE UPDATES ====================

-- Add useOrgCreditWallet feature flag
ALTER TABLE "organizations" 
ADD COLUMN IF NOT EXISTS "useOrgCreditWallet" BOOLEAN DEFAULT false;

-- Add allowTeachersToSpendCredits setting
ALTER TABLE "organizations" 
ADD COLUMN IF NOT EXISTS "allowTeachersToSpendCredits" BOOLEAN DEFAULT false;

-- ==================== CREDIT ORDERS TABLE UPDATE ====================

-- Add purchaseTarget column to credit orders
ALTER TABLE "creditOrders" 
ADD COLUMN IF NOT EXISTS "purchaseTarget" "creditPurchaseTarget" NOT NULL DEFAULT 'user';

-- ==================== ORGANIZATION CREDIT LEDGER TABLE ====================

-- Create organization credit ledger table
CREATE TABLE IF NOT EXISTS "orgCreditLedger" (
    "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    "organizationId" VARCHAR NOT NULL REFERENCES "organizations"("id"),
    "actorUserId" VARCHAR NOT NULL REFERENCES "users"("id"),
    "transactionType" "lpTransactionType" NOT NULL,
    "activityType" "orgCreditActivityType" NOT NULL,
    "activityId" VARCHAR,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "correlationId" VARCHAR NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Add indexes for the organization credit ledger
CREATE INDEX IF NOT EXISTS "IDX_org_ledger_org_created" ON "orgCreditLedger" ("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "IDX_org_ledger_actor" ON "orgCreditLedger" ("actorUserId");
CREATE INDEX IF NOT EXISTS "IDX_org_ledger_activity_type" ON "orgCreditLedger" ("activityType");
CREATE INDEX IF NOT EXISTS "IDX_org_ledger_type" ON "orgCreditLedger" ("transactionType");
CREATE INDEX IF NOT EXISTS "IDX_org_ledger_created" ON "orgCreditLedger" ("createdAt");

-- Add unique constraint for idempotency
DO $$ BEGIN
    ALTER TABLE "orgCreditLedger" ADD CONSTRAINT "UNQ_org_ledger_correlation" UNIQUE ("correlationId");
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==================== COMMENTS ====================

COMMENT ON COLUMN "organizations"."useOrgCreditWallet" IS 'Feature flag: when true, org admins use org wallet instead of personal credits';
COMMENT ON COLUMN "organizations"."allowTeachersToSpendCredits" IS 'When true, teachers can also spend org credits';
COMMENT ON COLUMN "creditOrders"."purchaseTarget" IS 'Who receives credits: user (personal wallet) or organization (org wallet)';
COMMENT ON TABLE "orgCreditLedger" IS 'Organization-level credit ledger for tracking org wallet transactions with actor audit trail';
