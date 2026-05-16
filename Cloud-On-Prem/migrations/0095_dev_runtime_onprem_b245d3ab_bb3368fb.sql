-- Auto-generated from DEV runtime DB diff since last successful build
-- Scope: onprem
-- Previous schema hash: b245d3abacc02f04cac6283bac7ab5b903fd8728fbd8aa21895220ed92463e95
-- Current schema hash: bb3368fbe061e130ea8d1e4cb00e96c8d61e9987db1ffdc3cffb954d3408118d
-- Generated at: 2026-04-13T19:12:30.790Z
DO $$ BEGIN ALTER TABLE IF EXISTS "translationIndexFailures" ADD CONSTRAINT "translationIndexFailures_jobId_translationIndexJobs_id_fk" FOREIGN KEY ("jobId") REFERENCES "translationIndexJobs"(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "IDX_enterpriseSystems_sync_auth_mode" ON public."enterpriseSystems" USING btree ("enterpriseCustomerId", "syncAuthMode");
