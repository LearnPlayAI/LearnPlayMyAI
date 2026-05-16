-- Ensure enterprise customer business profile fields exist across cloud and onprem.
-- These fields are used by onprem Business Information (Cloud Sync) and cloud portal management.

ALTER TABLE "enterprise_customers"
  ADD COLUMN IF NOT EXISTS "businessRegistrationNumber" varchar,
  ADD COLUMN IF NOT EXISTS "countryCode" varchar,
  ADD COLUMN IF NOT EXISTS "vatNumber" varchar,
  ADD COLUMN IF NOT EXISTS "billingNotes" text;
