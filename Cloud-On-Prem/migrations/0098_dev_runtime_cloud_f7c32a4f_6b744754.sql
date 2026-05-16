-- Auto-generated from DEV runtime DB diff since last successful build
-- Scope: cloud
-- Previous schema hash: f7c32a4f36778dafb33ce6f2e89eb860a5b7393b7aa0bab4ef5c7105625c3988
-- Current schema hash: 6b744754f51f510eb58fb4372921b85862947ed9696e7990090189e4e44c135b
-- Generated at: 2026-04-27T15:33:24.054Z
CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_lesson_user_org_progress" ON public."lessonProgress" USING btree ("lessonId", "userId", "organizationId");
