-- Auto-generated from DEV runtime DB diff since last successful build
-- Scope: onprem
-- Previous schema hash: 94100bb545f44f6292269f36940d89a3906ab0f03be5c72c80159817ffd8032e
-- Current schema hash: cc8a27f741100ee4ec854325fcf4c7365495a05454b49aabe55ead8f7884cf71
-- Generated at: 2026-04-06T08:44:28.502Z
DO $$ BEGIN CREATE TYPE "test_deploy_enum" AS ENUM ('test'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE SEQUENCE IF NOT EXISTS "test_table_id_seq"; EXCEPTION WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS "test_table" (
  "id" bigint DEFAULT nextval('test_table_id_seq'::regclass) NOT NULL,
  "test_col" test_deploy_enum DEFAULT 'test'::test_deploy_enum NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "test_table_pkey" PRIMARY KEY (id)
);
