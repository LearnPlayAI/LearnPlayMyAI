CREATE TABLE IF NOT EXISTS "organizationSourceIntelligenceProviders" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" varchar NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "provider" varchar NOT NULL,
  "enabled" boolean NOT NULL DEFAULT false,
  "authMode" varchar NOT NULL DEFAULT 'service_account_json',
  "projectNumber" varchar,
  "location" varchar NOT NULL DEFAULT 'global',
  "endpointLocation" varchar NOT NULL DEFAULT 'global-',
  "defaultNotebookTitle" varchar,
  "encryptedCredentials" text,
  "credentialSummary" jsonb,
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "connectionStatus" varchar NOT NULL DEFAULT 'not_configured',
  "lastTestedAt" timestamp,
  "lastError" text,
  "createdBy" varchar REFERENCES "users"("id"),
  "updatedBy" varchar REFERENCES "users"("id"),
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_org_source_intel_org"
  ON "organizationSourceIntelligenceProviders" ("organizationId");

DO $$ BEGIN
  ALTER TABLE "organizationSourceIntelligenceProviders"
    ADD CONSTRAINT "UNQ_org_source_intel_org_provider" UNIQUE ("organizationId", "provider");
EXCEPTION WHEN duplicate_object THEN null; END $$;
