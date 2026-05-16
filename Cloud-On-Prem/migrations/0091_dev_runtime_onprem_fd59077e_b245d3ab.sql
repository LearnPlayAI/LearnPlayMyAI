-- Auto-generated from DEV runtime DB diff since last successful build
-- Scope: onprem
-- Previous schema hash: fd59077e3865f1f08599454ce5b4dbff135083f52d3e557bea1e140b422065fa
-- Current schema hash: b245d3abacc02f04cac6283bac7ab5b903fd8728fbd8aa21895220ed92463e95
-- Generated at: 2026-04-08T14:29:59.138Z
DO $$ BEGIN ALTER TABLE IF EXISTS "brandingThemes" ADD CONSTRAINT "UNQ_brandingThemes_organizationId" UNIQUE ("organizationId"); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_brandingThemes_organizationId" ON public."brandingThemes" USING btree ("organizationId");
