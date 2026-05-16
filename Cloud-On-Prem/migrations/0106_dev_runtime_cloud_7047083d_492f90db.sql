-- Auto-generated from DEV runtime DB diff since last successful build
-- Scope: cloud
-- Previous schema hash: 7047083d64a863c333e060c14ae5ab3325128c10072a926aee6dca58385abd58
-- Current schema hash: 492f90db5ca61227f94163cbb6d11300d42abb4c3649754e8755f7002c604da0
-- Generated at: 2026-04-30T12:18:04.379Z
CREATE TABLE IF NOT EXISTS "organizationSourceIntelligenceProviders" (
  "id" character varying DEFAULT gen_random_uuid() NOT NULL,
  "organizationId" character varying NOT NULL,
  "provider" character varying NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "authMode" character varying DEFAULT 'service_account_json'::character varying NOT NULL,
  "projectNumber" character varying,
  "location" character varying DEFAULT 'global'::character varying NOT NULL,
  "endpointLocation" character varying DEFAULT 'global-'::character varying NOT NULL,
  "defaultNotebookTitle" character varying,
  "encryptedCredentials" text,
  "credentialSummary" jsonb,
  "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "connectionStatus" character varying DEFAULT 'not_configured'::character varying NOT NULL,
  "lastTestedAt" timestamp without time zone,
  "lastError" text,
  "createdBy" character varying,
  "updatedBy" character varying,
  "createdAt" timestamp without time zone DEFAULT now(),
  "updatedAt" timestamp without time zone DEFAULT now(),
  CONSTRAINT "organizationSourceIntelligenceProviders_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES users(id),
  CONSTRAINT "organizationSourceIntelligenceProviders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT "organizationSourceIntelligenceProviders_pkey" PRIMARY KEY (id),
  CONSTRAINT "organizationSourceIntelligenceProviders_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES users(id),
  CONSTRAINT "UNQ_org_source_intel_org_provider" UNIQUE ("organizationId", provider)
);
CREATE INDEX IF NOT EXISTS "IDX_org_source_intel_org" ON public."organizationSourceIntelligenceProviders" USING btree ("organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_org_source_intel_org_provider" ON public."organizationSourceIntelligenceProviders" USING btree ("organizationId", provider);
