-- Auto-generated from DEV runtime DB diff since last successful build
-- Scope: cloud
-- Previous schema hash: 28a550374b36c18c107833fcf57a08bc67881c6b1a735eeed7400721000c6d02
-- Current schema hash: 89e0d858c4fea4cf5e8e0fb527ee2a1df8d5136c38ab33f40c6173a2aac90e25
-- Generated at: 2026-04-08T12:19:51.860Z
DO $$ BEGIN ALTER TABLE IF EXISTS "brandingThemes" ADD CONSTRAINT "UNQ_brandingThemes_organizationId" UNIQUE ("organizationId"); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_brandingThemes_organizationId" ON public."brandingThemes" USING btree ("organizationId");
