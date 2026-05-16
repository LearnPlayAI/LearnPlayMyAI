-- Backward-compatible enterprise lifecycle schema upgrades.
-- Ensures older deployments can support on-prem check-in, renewals, telemetry and billing workflows.

-- enterprise_license_requests enhancements
ALTER TABLE "enterprise_license_requests"
  ADD COLUMN IF NOT EXISTS "requestType" varchar NOT NULL DEFAULT 'initial',
  ADD COLUMN IF NOT EXISTS "autoApproveRenewals" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "autoApproveDisabledAt" timestamp,
  ADD COLUMN IF NOT EXISTS "autoApproveDisabledBy" varchar,
  ADD COLUMN IF NOT EXISTS "autoApproveDisableReason" text,
  ADD COLUMN IF NOT EXISTS "graceDays" integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS "billingStatus" varchar NOT NULL DEFAULT 'due',
  ADD COLUMN IF NOT EXISTS "billingNotes" text,
  ADD COLUMN IF NOT EXISTS "lastCheckInAt" timestamp,
  ADD COLUMN IF NOT EXISTS "lastRenewedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "nextRenewalDueAt" timestamp,
  ADD COLUMN IF NOT EXISTS "reminder5SentAt" timestamp,
  ADD COLUMN IF NOT EXISTS "reminder3SentAt" timestamp,
  ADD COLUMN IF NOT EXISTS "reminder1SentAt" timestamp,
  ADD COLUMN IF NOT EXISTS "overdueNoticeSentAt" timestamp,
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT now();

CREATE INDEX IF NOT EXISTS "IDX_enterprise_license_requests_renewal"
  ON "enterprise_license_requests" ("enterpriseCustomerId", "autoApproveRenewals");

-- enterprise_license_keys enhancements
ALTER TABLE "enterprise_license_keys"
  ADD COLUMN IF NOT EXISTS "licenseId" varchar,
  ADD COLUMN IF NOT EXISTS "issuedReason" varchar NOT NULL DEFAULT 'initial',
  ADD COLUMN IF NOT EXISTS "renewalSequence" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "lastCheckInAt" timestamp,
  ADD COLUMN IF NOT EXISTS "checkInCount" integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_enterprise_license_keys_license_id_unique"
  ON "enterprise_license_keys" ("licenseId");
CREATE INDEX IF NOT EXISTS "IDX_enterprise_license_keys_license_id"
  ON "enterprise_license_keys" ("licenseId");

-- enterprise_systems enhancements
ALTER TABLE "enterprise_systems"
  ADD COLUMN IF NOT EXISTS "hardwareKey" varchar,
  ADD COLUMN IF NOT EXISTS "activeLicenseRequestId" varchar,
  ADD COLUMN IF NOT EXISTS "activeLicenseKeyId" varchar,
  ADD COLUMN IF NOT EXISTS "licenseStatus" varchar NOT NULL DEFAULT 'unlicensed',
  ADD COLUMN IF NOT EXISTS "licenseExpiresAt" timestamp,
  ADD COLUMN IF NOT EXISTS "lastCheckInAt" timestamp,
  ADD COLUMN IF NOT EXISTS "nextCheckInDueAt" timestamp,
  ADD COLUMN IF NOT EXISTS "lastTelemetryAt" timestamp,
  ADD COLUMN IF NOT EXISTS "alertEmails" text,
  ADD COLUMN IF NOT EXISTS "lastContactSyncAt" timestamp,
  ADD COLUMN IF NOT EXISTS "autoApproveRenewals" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "graceDays" integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS "billingStatus" varchar NOT NULL DEFAULT 'due',
  ADD COLUMN IF NOT EXISTS "monthlyFee" decimal(19, 4),
  ADD COLUMN IF NOT EXISTS "feeCurrency" varchar;

DO $$ BEGIN
  ALTER TABLE "enterprise_systems"
    ADD CONSTRAINT "enterprise_systems_activeLicenseRequestId_enterprise_license_requests_id_fk"
    FOREIGN KEY ("activeLicenseRequestId") REFERENCES "enterprise_license_requests"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "enterprise_systems"
    ADD CONSTRAINT "enterprise_systems_activeLicenseKeyId_enterprise_license_keys_id_fk"
    FOREIGN KEY ("activeLicenseKeyId") REFERENCES "enterprise_license_keys"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "IDX_enterprise_systems_license_status"
  ON "enterprise_systems" ("enterpriseCustomerId", "licenseStatus");

-- enterprise_system_daily_telemetry (for cloud-side telemetry intake)
CREATE TABLE IF NOT EXISTS "enterprise_system_daily_telemetry" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "enterpriseCustomerId" varchar NOT NULL REFERENCES "enterprise_customers"("id"),
  "enterpriseSystemId" varchar REFERENCES "enterprise_systems"("id"),
  "systemType" varchar,
  "serverBaseUrl" varchar,
  "hostname" varchar,
  "organizationId" varchar,
  "organizationName" varchar,
  "totalUsers" integer DEFAULT 0,
  "totalCourses" integer DEFAULT 0,
  "totalEnrollments" integer DEFAULT 0,
  "totalAssignments" integer DEFAULT 0,
  "reportDate" date NOT NULL DEFAULT CURRENT_DATE,
  "reportedAt" timestamp DEFAULT now(),
  "createdAt" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_enterprise_telemetry_customer"
  ON "enterprise_system_daily_telemetry" ("enterpriseCustomerId");
CREATE INDEX IF NOT EXISTS "IDX_enterprise_telemetry_system"
  ON "enterprise_system_daily_telemetry" ("enterpriseSystemId");
CREATE INDEX IF NOT EXISTS "IDX_enterprise_telemetry_report_date"
  ON "enterprise_system_daily_telemetry" ("reportDate");
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_enterprise_telemetry_unique_daily"
  ON "enterprise_system_daily_telemetry" ("enterpriseCustomerId", "enterpriseSystemId", "organizationId", "reportDate");
