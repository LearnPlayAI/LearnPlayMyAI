ALTER TABLE "enterpriseSystems"
  ADD COLUMN IF NOT EXISTS "syncAuthMode" varchar DEFAULT 'shared' NOT NULL,
  ADD COLUMN IF NOT EXISTS "syncAuthVersion" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "syncAuthSecretHash" varchar,
  ADD COLUMN IF NOT EXISTS "syncAuthRevokedAt" timestamp;

CREATE INDEX IF NOT EXISTS "IDX_enterprise_systems_sync_auth_mode"
  ON "enterpriseSystems" ("enterpriseCustomerId", "syncAuthMode");
