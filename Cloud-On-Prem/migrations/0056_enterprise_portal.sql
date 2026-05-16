-- Migration: Enterprise Customer Portal & On-Prem Licensing
-- Adds enterprise customer accounts, documents, build versions, license management, and revenue sync

-- 1. Enterprise Customers
CREATE TABLE IF NOT EXISTS "enterprise_customers" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" varchar NOT NULL UNIQUE,
  "passwordHash" varchar NOT NULL,
  "companyName" varchar NOT NULL,
  "contactPersonName" varchar NOT NULL,
  "contactEmail" varchar NOT NULL,
  "contactMobile" varchar,
  "companyAddress" text,
  "country" varchar,
  "status" varchar DEFAULT 'pending',
  "emailVerified" boolean DEFAULT false,
  "emailVerificationToken" varchar,
  "emailVerificationExpiry" timestamp,
  "accountActivatedAt" timestamp,
  "parentEnterpriseId" varchar,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_enterprise_customers_email" ON "enterprise_customers" ("email");
CREATE INDEX IF NOT EXISTS "IDX_enterprise_customers_parent" ON "enterprise_customers" ("parentEnterpriseId");

-- Self-referencing FK for parent enterprise
DO $$ BEGIN
  ALTER TABLE "enterprise_customers"
    ADD CONSTRAINT "FK_enterprise_customers_parent" FOREIGN KEY ("parentEnterpriseId") REFERENCES "enterprise_customers"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Enterprise Documents
CREATE TABLE IF NOT EXISTS "enterprise_documents" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "enterpriseCustomerId" varchar NOT NULL REFERENCES "enterprise_customers"("id"),
  "documentType" varchar NOT NULL,
  "fileName" varchar NOT NULL,
  "filePath" varchar NOT NULL,
  "fileSize" integer,
  "mimeType" varchar,
  "status" varchar DEFAULT 'uploaded',
  "rejectionReason" text,
  "verifiedBy" varchar,
  "verifiedAt" timestamp,
  "createdAt" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_enterprise_documents_customer" ON "enterprise_documents" ("enterpriseCustomerId");
CREATE INDEX IF NOT EXISTS "IDX_enterprise_documents_type" ON "enterprise_documents" ("documentType");

-- 3. Build Versions
CREATE TABLE IF NOT EXISTS "build_versions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "versionNumber" varchar NOT NULL UNIQUE,
  "releaseNotes" text,
  "fileName" varchar NOT NULL,
  "filePath" varchar NOT NULL,
  "fileSize" integer,
  "uploadedBy" varchar NOT NULL,
  "isActive" boolean DEFAULT true,
  "createdAt" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_build_versions_version" ON "build_versions" ("versionNumber");
CREATE INDEX IF NOT EXISTS "IDX_build_versions_active" ON "build_versions" ("isActive");

-- 4. Enterprise License Requests
CREATE TABLE IF NOT EXISTS "enterprise_license_requests" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "enterpriseCustomerId" varchar NOT NULL REFERENCES "enterprise_customers"("id"),
  "requestData" text NOT NULL,
  "hardwareKey" varchar,
  "hostname" varchar,
  "serverBaseUrl" varchar,
  "systemType" varchar NOT NULL,
  "status" varchar DEFAULT 'pending',
  "denialReason" text,
  "monthlyFee" decimal(19, 4),
  "feeCurrency" varchar,
  "reviewedBy" varchar,
  "reviewedAt" timestamp,
  "createdAt" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_enterprise_license_requests_customer" ON "enterprise_license_requests" ("enterpriseCustomerId");
CREATE INDEX IF NOT EXISTS "IDX_enterprise_license_requests_status" ON "enterprise_license_requests" ("status");

-- 5. Enterprise License Keys
CREATE TABLE IF NOT EXISTS "enterprise_license_keys" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "licenseRequestId" varchar NOT NULL REFERENCES "enterprise_license_requests"("id"),
  "enterpriseCustomerId" varchar NOT NULL REFERENCES "enterprise_customers"("id"),
  "encryptedKeyData" text NOT NULL,
  "systemType" varchar NOT NULL,
  "issuedAt" timestamp DEFAULT now(),
  "expiresAt" timestamp NOT NULL,
  "downloadedAt" timestamp,
  "isRevoked" boolean DEFAULT false,
  "revokedAt" timestamp,
  "revokedReason" text,
  "createdAt" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_enterprise_license_keys_request" ON "enterprise_license_keys" ("licenseRequestId");
CREATE INDEX IF NOT EXISTS "IDX_enterprise_license_keys_customer" ON "enterprise_license_keys" ("enterpriseCustomerId");
CREATE INDEX IF NOT EXISTS "IDX_enterprise_license_keys_system_type" ON "enterprise_license_keys" ("systemType");

-- 6. On-Prem License State
CREATE TABLE IF NOT EXISTS "onprem_license_state" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "licenseKeyData" text NOT NULL,
  "hardwareKey" varchar NOT NULL,
  "hostname" varchar NOT NULL,
  "serverBaseUrl" varchar NOT NULL,
  "systemType" varchar NOT NULL,
  "installedAt" timestamp DEFAULT now(),
  "expiresAt" timestamp,
  "isValid" boolean DEFAULT true,
  "lastValidatedAt" timestamp,
  "createdAt" timestamp DEFAULT now()
);

-- 7. Enterprise Revenue Sync
CREATE TABLE IF NOT EXISTS "enterprise_revenue_sync" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "enterpriseCustomerId" varchar NOT NULL REFERENCES "enterprise_customers"("id"),
  "licenseKeyId" varchar REFERENCES "enterprise_license_keys"("id"),
  "orgName" varchar NOT NULL,
  "orgId" varchar,
  "systemBaseUrl" varchar,
  "systemType" varchar,
  "totalUsers" integer DEFAULT 0,
  "totalLearners" integer DEFAULT 0,
  "totalInstructors" integer DEFAULT 0,
  "totalAdmins" integer DEFAULT 0,
  "totalCourses" integer DEFAULT 0,
  "totalEnrollments" integer DEFAULT 0,
  "totalRevenueLocal" decimal(19, 4) DEFAULT 0,
  "revenueCurrency" varchar,
  "commissionPercentage" decimal(5, 2),
  "commissionValue" decimal(19, 4),
  "syncPeriodStart" timestamp,
  "syncPeriodEnd" timestamp,
  "syncedAt" timestamp DEFAULT now(),
  "createdAt" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_enterprise_revenue_sync_customer" ON "enterprise_revenue_sync" ("enterpriseCustomerId");
CREATE INDEX IF NOT EXISTS "IDX_enterprise_revenue_sync_license" ON "enterprise_revenue_sync" ("licenseKeyId");
CREATE INDEX IF NOT EXISTS "IDX_enterprise_revenue_sync_synced" ON "enterprise_revenue_sync" ("syncedAt");

-- 8. Enterprise Agreement Templates
CREATE TABLE IF NOT EXISTS "enterprise_agreement_templates" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "templateName" varchar NOT NULL,
  "templateType" varchar NOT NULL,
  "filePath" varchar NOT NULL,
  "fileName" varchar NOT NULL,
  "version" varchar,
  "uploadedBy" varchar NOT NULL,
  "isActive" boolean DEFAULT true,
  "createdAt" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_enterprise_agreement_templates_type" ON "enterprise_agreement_templates" ("templateType");
CREATE INDEX IF NOT EXISTS "IDX_enterprise_agreement_templates_active" ON "enterprise_agreement_templates" ("isActive");
