-- Auto-generated from DEV runtime DB diff since last successful build
-- Scope: cloud
-- Previous schema hash: a867a651c67c95ed5009d47574bbd77b081341e819f1bec044b96a0b08ba6f5f
-- Current schema hash: 28a550374b36c18c107833fcf57a08bc67881c6b1a735eeed7400721000c6d02
-- Generated at: 2026-04-08T10:13:08.234Z
ALTER TABLE IF EXISTS "enterpriseSystems" ADD COLUMN IF NOT EXISTS "syncAuthMode" character varying DEFAULT 'shared'::character varying NOT NULL;
ALTER TABLE IF EXISTS "enterpriseSystems" ADD COLUMN IF NOT EXISTS "syncAuthRevokedAt" timestamp without time zone;
ALTER TABLE IF EXISTS "enterpriseSystems" ADD COLUMN IF NOT EXISTS "syncAuthSecretHash" character varying;
ALTER TABLE IF EXISTS "enterpriseSystems" ADD COLUMN IF NOT EXISTS "syncAuthVersion" integer DEFAULT 0 NOT NULL;
CREATE INDEX IF NOT EXISTS "IDX_enterprise_systems_sync_auth_mode" ON public."enterpriseSystems" USING btree ("enterpriseCustomerId", "syncAuthMode");
