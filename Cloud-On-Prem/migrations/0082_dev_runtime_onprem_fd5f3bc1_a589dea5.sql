-- Auto-generated from DEV runtime DB diff since last successful build
-- Scope: onprem
-- Previous schema hash: fd5f3bc1df41d4c100dd26e72f231626f3e88fb84ee11b36da407b9d0c1d0f19
-- Current schema hash: a589dea5d40db1d08d276533316810969f980e8582ab0e9d2e8a725ffac89c65
-- Generated at: 2026-04-07T12:40:54.612Z
ALTER TABLE IF EXISTS "organizations" ADD COLUMN IF NOT EXISTS "monthlyLessonCredits" integer DEFAULT 10;
ALTER TABLE IF EXISTS "organizations" ADD COLUMN IF NOT EXISTS "subscriptionPlanTier" character varying DEFAULT 'standard'::character varying;
