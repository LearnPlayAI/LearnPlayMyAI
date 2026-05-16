-- Auto-generated from DEV runtime DB diff since last successful build
-- Scope: cloud
-- Previous schema hash: f7c9e12e50ce001a061e4916baa459f91c17984da3462e3aec46b15d02dd844c
-- Current schema hash: a867a651c67c95ed5009d47574bbd77b081341e819f1bec044b96a0b08ba6f5f
-- Generated at: 2026-04-07T13:23:08.154Z
DO $$ BEGIN ALTER TABLE IF EXISTS "sessions" ADD CONSTRAINT "sessions_pkey" PRIMARY KEY (sid); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON public.sessions USING btree (expire);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_pkey ON public.sessions USING btree (sid);
