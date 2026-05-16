-- Auto-generated from DEV runtime DB diff since last successful build
-- Scope: cloud
-- Previous schema hash: 47e0051875ec2b7832f142158f3d6de1907321da4a8a4c4da508678b38a01b80
-- Current schema hash: 7047083d64a863c333e060c14ae5ab3325128c10072a926aee6dca58385abd58
-- Generated at: 2026-04-29T13:46:54.156Z
-- Ordered defensively so the package baseline can repair runtimes where these tables are absent.
CREATE TABLE IF NOT EXISTS "courseSourceDocuments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" varchar NOT NULL REFERENCES "organizations"("id"),
  "createdBy" varchar NOT NULL REFERENCES "users"("id"),
  "draftId" varchar REFERENCES "courseDraftFrameworks"("id") ON DELETE set null,
  "draftDocumentId" varchar REFERENCES "courseDraftDocuments"("id") ON DELETE set null,
  "courseId" varchar REFERENCES "courses"("id") ON DELETE set null,
  "fileName" varchar NOT NULL,
  "mimeType" varchar NOT NULL,
  "fileSize" integer NOT NULL,
  "originalStoragePath" varchar NOT NULL,
  "checksum" varchar,
  "pageCount" integer,
  "slideCount" integer,
  "extractionStatus" "extractionStatus" DEFAULT 'pending',
  "extractionError" text,
  "extractedTextHash" varchar,
  "licenseMetadata" jsonb,
  "metadata" jsonb,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "courseSourceAssets" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "sourceDocumentId" varchar NOT NULL REFERENCES "courseSourceDocuments"("id") ON DELETE cascade,
  "organizationId" varchar NOT NULL REFERENCES "organizations"("id"),
  "assetType" varchar NOT NULL,
  "storageKey" varchar NOT NULL,
  "mimeType" varchar NOT NULL,
  "pageOrSlide" integer,
  "caption" text,
  "altText" text,
  "width" integer,
  "height" integer,
  "textBefore" text,
  "textAfter" text,
  "containsEmbeddedText" boolean DEFAULT false,
  "extractionMethod" varchar NOT NULL,
  "metadata" jsonb,
  "createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "courseSourceAssetLinks" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" varchar NOT NULL REFERENCES "organizations"("id"),
  "assetId" varchar NOT NULL REFERENCES "courseSourceAssets"("id") ON DELETE cascade,
  "linkedEntityType" varchar NOT NULL,
  "linkedEntityId" varchar NOT NULL,
  "recommendedUse" varchar NOT NULL DEFAULT 'reference',
  "sourceSegmentIds" jsonb,
  "createdBy" varchar REFERENCES "users"("id"),
  "createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_course_source_documents_org" ON "courseSourceDocuments" ("organizationId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_course_source_documents_draft" ON "courseSourceDocuments" ("draftId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_course_source_documents_draft_doc" ON "courseSourceDocuments" ("draftDocumentId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_course_source_documents_course" ON "courseSourceDocuments" ("courseId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_course_source_assets_document" ON "courseSourceAssets" ("sourceDocumentId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_course_source_assets_org" ON "courseSourceAssets" ("organizationId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_course_source_assets_page" ON "courseSourceAssets" ("sourceDocumentId", "pageOrSlide");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_course_source_asset_links_asset" ON "courseSourceAssetLinks" ("assetId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_course_source_asset_links_entity" ON "courseSourceAssetLinks" ("linkedEntityType", "linkedEntityId");
