CREATE TABLE IF NOT EXISTS "systemChangeEvents" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "domain" varchar NOT NULL,
  "action" varchar NOT NULL,
  "key" varchar NOT NULL,
  "provider" varchar,
  "isSecret" boolean DEFAULT false,
  "beforeValue" text,
  "afterValue" text,
  "actorUserId" varchar,
  "actorRole" varchar,
  "organizationId" varchar,
  "ipAddress" varchar,
  "userAgent" text,
  "correlationId" varchar,
  "metadata" jsonb,
  "createdAt" timestamp DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "systemChangeEvents" ADD CONSTRAINT "systemChangeEvents_actorUserId_users_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "systemChangeEvents" ADD CONSTRAINT "systemChangeEvents_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "IDX_system_change_events_domain_created" ON "systemChangeEvents" ("domain", "createdAt");
CREATE INDEX IF NOT EXISTS "IDX_system_change_events_provider_created" ON "systemChangeEvents" ("provider", "createdAt");
CREATE INDEX IF NOT EXISTS "IDX_system_change_events_actor_created" ON "systemChangeEvents" ("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "IDX_system_change_events_key_created" ON "systemChangeEvents" ("key", "createdAt");

CREATE TABLE IF NOT EXISTS "integrationEvents" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider" varchar NOT NULL,
  "operation" varchar NOT NULL,
  "status" varchar NOT NULL,
  "severity" varchar NOT NULL DEFAULT 'info',
  "message" text,
  "requestSummary" jsonb,
  "responseSummary" jsonb,
  "errorCode" varchar,
  "durationMs" integer,
  "actorUserId" varchar,
  "organizationId" varchar,
  "correlationId" varchar,
  "metadata" jsonb,
  "createdAt" timestamp DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "integrationEvents" ADD CONSTRAINT "integrationEvents_actorUserId_users_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "integrationEvents" ADD CONSTRAINT "integrationEvents_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "IDX_integration_events_provider_created" ON "integrationEvents" ("provider", "createdAt");
CREATE INDEX IF NOT EXISTS "IDX_integration_events_status_created" ON "integrationEvents" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "IDX_integration_events_org_created" ON "integrationEvents" ("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "IDX_integration_events_actor_created" ON "integrationEvents" ("actorUserId", "createdAt");
