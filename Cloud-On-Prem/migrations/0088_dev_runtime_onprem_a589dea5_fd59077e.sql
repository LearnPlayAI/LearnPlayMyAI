-- Auto-generated from DEV runtime DB diff since last successful build
-- Scope: onprem
-- Previous schema hash: a589dea5d40db1d08d276533316810969f980e8582ab0e9d2e8a725ffac89c65
-- Current schema hash: fd59077e3865f1f08599454ce5b4dbff135083f52d3e557bea1e140b422065fa
-- Generated at: 2026-04-08T11:04:11.822Z
ALTER TABLE IF EXISTS "enterpriseSystems" ADD COLUMN IF NOT EXISTS "syncAuthMode" character varying DEFAULT 'shared'::character varying NOT NULL;
ALTER TABLE IF EXISTS "enterpriseSystems" ADD COLUMN IF NOT EXISTS "syncAuthRevokedAt" timestamp without time zone;
ALTER TABLE IF EXISTS "enterpriseSystems" ADD COLUMN IF NOT EXISTS "syncAuthSecretHash" character varying;
ALTER TABLE IF EXISTS "enterpriseSystems" ADD COLUMN IF NOT EXISTS "syncAuthVersion" integer DEFAULT 0 NOT NULL;
CREATE INDEX IF NOT EXISTS "IDX_enterprise_systems_sync_auth_mode" ON public."enterpriseSystems" USING btree ("enterpriseCustomerId", "syncAuthMode");
