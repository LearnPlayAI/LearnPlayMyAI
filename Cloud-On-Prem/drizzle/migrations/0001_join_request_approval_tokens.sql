-- Migration: Add join request approval tokens table
-- Date: 2026-01-24
-- Purpose: Enable one-click email-based approval of join requests for org admins

-- Create the approval tokens table
CREATE TABLE IF NOT EXISTS "joinRequestApprovalTokens" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "token" varchar NOT NULL UNIQUE,
  "joinRequestId" varchar NOT NULL REFERENCES "joinRequests"("id"),
  "adminUserId" varchar NOT NULL REFERENCES "users"("id"),
  "expiresAt" timestamp NOT NULL,
  "usedAt" timestamp,
  "createdAt" timestamp DEFAULT now()
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS "IDX_join_approval_tokens_token" ON "joinRequestApprovalTokens"("token");
CREATE INDEX IF NOT EXISTS "IDX_join_approval_tokens_request" ON "joinRequestApprovalTokens"("joinRequestId");

-- Add approval method tracking to join requests
ALTER TABLE "joinRequests" ADD COLUMN IF NOT EXISTS "approvalMethod" varchar;

COMMENT ON COLUMN "joinRequests"."approvalMethod" IS 'How the request was approved: dashboard, email_link, auto';
COMMENT ON TABLE "joinRequestApprovalTokens" IS 'Tracks secure one-time tokens for email-based join request approval';
