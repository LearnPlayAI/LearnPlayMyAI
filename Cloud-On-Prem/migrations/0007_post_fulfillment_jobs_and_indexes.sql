-- Migration: Add post-fulfillment background jobs table and payment intent index
-- Phase 1a & 1b: Purchase speed optimization

-- Create enum for post-fulfillment job types
DO $$ BEGIN
    CREATE TYPE "postFulfillmentJobType" AS ENUM ('receipt_generation', 'confirmation_email', 'receipt_and_email');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create enum for post-fulfillment job status
DO $$ BEGIN
    CREATE TYPE "postFulfillmentJobStatus" AS ENUM ('pending', 'claimed', 'completed', 'failed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create post-fulfillment jobs table for async receipt/email processing
CREATE TABLE IF NOT EXISTS "postFulfillmentJobs" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    "orderId" varchar NOT NULL REFERENCES "creditOrders"("id"),
    "jobType" "postFulfillmentJobType" NOT NULL,
    "status" "postFulfillmentJobStatus" NOT NULL DEFAULT 'pending',
    "retryCount" integer DEFAULT 0,
    "maxRetries" integer DEFAULT 3,
    "lastAttemptAt" timestamp,
    "nextRetryAt" timestamp,
    "claimedAt" timestamp,
    "completedAt" timestamp,
    "errorMessage" text,
    "resultData" jsonb,
    "metadata" jsonb,
    "createdAt" timestamp DEFAULT now(),
    "updatedAt" timestamp DEFAULT now()
);

-- Create indexes for post-fulfillment jobs
CREATE INDEX IF NOT EXISTS "IDX_post_fulfillment_jobs_order" ON "postFulfillmentJobs" ("orderId");
CREATE INDEX IF NOT EXISTS "IDX_post_fulfillment_jobs_status" ON "postFulfillmentJobs" ("status");
CREATE INDEX IF NOT EXISTS "IDX_post_fulfillment_jobs_type" ON "postFulfillmentJobs" ("jobType");
CREATE INDEX IF NOT EXISTS "IDX_post_fulfillment_jobs_next_retry" ON "postFulfillmentJobs" ("nextRetryAt");
CREATE INDEX IF NOT EXISTS "IDX_post_fulfillment_jobs_created" ON "postFulfillmentJobs" ("createdAt");

-- Unique constraint for idempotency: one job per order per type
CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_post_fulfillment_job_order_type" ON "postFulfillmentJobs" ("orderId", "jobType");

-- Phase 1b: Add index on creditOrders.paymentIntentId for faster fallback lookups
-- Using CONCURRENTLY to avoid locking the table during index creation
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_credit_orders_payment_intent" ON "creditOrders" ("paymentIntentId");

-- Log migration completion
DO $$ BEGIN
    RAISE NOTICE 'Migration 0007: Post-fulfillment jobs table and indexes created successfully';
END $$;
