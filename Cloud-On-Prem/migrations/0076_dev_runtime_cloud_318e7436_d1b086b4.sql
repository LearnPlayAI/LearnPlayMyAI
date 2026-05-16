-- Auto-generated from DEV runtime DB diff since last successful build
-- Scope: cloud
-- Previous schema hash: 318e74363d091a4e31156bf08130cee2827864d9bca7f18f409b11c19dd48999
-- Current schema hash: d1b086b4a996d660c73db33cfdf5b52917f48edb644fb2ff1540f07dcfd11770
-- Generated at: 2026-04-06T08:44:28.090Z
DO $$ BEGIN CREATE TYPE "test_deploy_enum" AS ENUM ('test'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE SEQUENCE IF NOT EXISTS "test_table_id_seq"; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS "test_table" (
  "id" bigint DEFAULT nextval('test_table_id_seq'::regclass) NOT NULL,
  "test_col" test_deploy_enum DEFAULT 'test'::test_deploy_enum NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "test_table_pkey" PRIMARY KEY (id)
);
