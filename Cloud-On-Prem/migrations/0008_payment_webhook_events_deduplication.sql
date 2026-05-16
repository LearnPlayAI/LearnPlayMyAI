-- Phase 3a: Payment Webhook Events for Deduplication
-- Prevents duplicate webhook processing by tracking unique event IDs

CREATE TABLE IF NOT EXISTS "paymentWebhookEvents" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "eventId" varchar NOT NULL,
  "checkoutId" varchar NOT NULL,
  "eventType" varchar NOT NULL,
  "processedAt" timestamp DEFAULT now(),
  "processingDurationMs" integer,
  "fulfilledBy" varchar,
  "success" boolean NOT NULL DEFAULT true,
  "errorMessage" text,
  "metadata" jsonb,
  "createdAt" timestamp DEFAULT now()
);

-- Primary deduplication key - ensures each webhook event is only processed once
CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_webhook_event" ON "paymentWebhookEvents" ("eventId");

-- Lookup indexes for analytics and reconciliation
CREATE INDEX IF NOT EXISTS "IDX_webhook_events_checkout" ON "paymentWebhookEvents" ("checkoutId");
CREATE INDEX IF NOT EXISTS "IDX_webhook_events_type" ON "paymentWebhookEvents" ("eventType");
CREATE INDEX IF NOT EXISTS "IDX_webhook_events_created" ON "paymentWebhookEvents" ("createdAt");
CREATE INDEX IF NOT EXISTS "IDX_webhook_events_processed" ON "paymentWebhookEvents" ("processedAt");

-- Add TTL cleanup comment - events older than 90 days can be purged
COMMENT ON TABLE "paymentWebhookEvents" IS 'Webhook deduplication tracking. Events older than 90 days can be safely purged for storage optimization.';
