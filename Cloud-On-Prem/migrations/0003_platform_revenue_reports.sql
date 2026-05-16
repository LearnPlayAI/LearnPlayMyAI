-- Platform Revenue Reports Schema Migration
-- Adds comprehensive financial tracking for SuperAdmin analytics

-- Revenue source type enum
CREATE TYPE "revenueSourceType" AS ENUM ('course_purchase', 'credit_purchase', 'license_purchase', 'subscription_payment', 'yoco_settlement', 'chargeback', 'sponsorship', 'manual_entry');
--> statement-breakpoint

-- Cost category type enum
CREATE TYPE "costCategoryType" AS ENUM ('infrastructure', 'payment_processing', 'api_services', 'staffing', 'marketing', 'revenue_share', 'refund_payout', 'other');
--> statement-breakpoint

-- Cost recurrence enum
CREATE TYPE "costRecurrence" AS ENUM ('one_time', 'daily', 'weekly', 'monthly', 'quarterly', 'annual');
--> statement-breakpoint

-- Report status enum
CREATE TYPE "reportStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');
--> statement-breakpoint

-- Report format enum
CREATE TYPE "reportFormat" AS ENUM ('csv', 'pdf', 'json');
--> statement-breakpoint

-- Platform Cost Categories table
CREATE TABLE "platformCostCategories" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "name" varchar NOT NULL,
    "type" "costCategoryType" NOT NULL,
    "description" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "displayOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp DEFAULT now() NOT NULL,
    "updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Platform Revenue Sources table (raw revenue events)
CREATE TABLE "platformRevenueSources" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "sourceType" "revenueSourceType" NOT NULL,
    "sourceId" varchar,
    "organizationId" varchar,
    "userId" varchar,
    "grossAmount" numeric(18, 4) NOT NULL,
    "netAmount" numeric(18, 4) NOT NULL,
    "platformCommission" numeric(18, 4) DEFAULT '0' NOT NULL,
    "processingFee" numeric(18, 4) DEFAULT '0' NOT NULL,
    "currency" "currencyCode" NOT NULL,
    "exchangeRateUsed" numeric(12, 8),
    "normalizedAmountZAR" numeric(18, 4) NOT NULL,
    "metadata" jsonb,
    "recordedAt" timestamp DEFAULT now() NOT NULL,
    "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Platform Cost Entries table
CREATE TABLE "platformCostEntries" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "categoryId" varchar NOT NULL,
    "organizationId" varchar,
    "description" varchar NOT NULL,
    "amount" numeric(18, 4) NOT NULL,
    "currency" "currencyCode" NOT NULL,
    "exchangeRateUsed" numeric(12, 8),
    "normalizedAmountZAR" numeric(18, 4) NOT NULL,
    "recurrence" "costRecurrence" DEFAULT 'one_time' NOT NULL,
    "effectiveDate" date NOT NULL,
    "endDate" date,
    "isAutomated" boolean DEFAULT false NOT NULL,
    "sourceReference" varchar,
    "metadata" jsonb,
    "createdBy" varchar NOT NULL,
    "updatedBy" varchar,
    "createdAt" timestamp DEFAULT now() NOT NULL,
    "updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Platform Cost Allocations table (split costs across orgs)
CREATE TABLE "platformCostAllocations" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "costEntryId" varchar NOT NULL,
    "organizationId" varchar NOT NULL,
    "allocationPercentage" numeric(5, 2) NOT NULL,
    "allocatedAmountZAR" numeric(18, 4) NOT NULL,
    "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Platform Financial Snapshots table (aggregated period summaries)
CREATE TABLE "platformFinancialSnapshots" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "periodStart" date NOT NULL,
    "periodEnd" date NOT NULL,
    "periodType" varchar NOT NULL,
    "organizationId" varchar,
    "grossRevenueZAR" numeric(18, 4) DEFAULT '0' NOT NULL,
    "netRevenueZAR" numeric(18, 4) DEFAULT '0' NOT NULL,
    "totalCostsZAR" numeric(18, 4) DEFAULT '0' NOT NULL,
    "netProfitZAR" numeric(18, 4) DEFAULT '0' NOT NULL,
    "profitMarginPercent" numeric(5, 2),
    "courseRevenue" numeric(18, 4) DEFAULT '0' NOT NULL,
    "creditRevenue" numeric(18, 4) DEFAULT '0' NOT NULL,
    "licenseRevenue" numeric(18, 4) DEFAULT '0' NOT NULL,
    "subscriptionRevenue" numeric(18, 4) DEFAULT '0' NOT NULL,
    "chargebackAmount" numeric(18, 4) DEFAULT '0' NOT NULL,
    "refundAmount" numeric(18, 4) DEFAULT '0' NOT NULL,
    "transactionCount" integer DEFAULT 0 NOT NULL,
    "metadata" jsonb,
    "generatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Platform Financial Audit Log table (immutable audit trail)
CREATE TABLE "platformFinancialAuditLog" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tableName" varchar NOT NULL,
    "recordId" varchar NOT NULL,
    "action" varchar NOT NULL,
    "beforeData" jsonb,
    "afterData" jsonb,
    "changedBy" varchar,
    "changedAt" timestamp DEFAULT now() NOT NULL,
    "ipAddress" varchar,
    "userAgent" text
);
--> statement-breakpoint

-- Platform Report Jobs table
CREATE TABLE "platformReportJobs" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "reportName" varchar NOT NULL,
    "reportType" varchar NOT NULL,
    "format" "reportFormat" NOT NULL,
    "status" "reportStatus" DEFAULT 'pending' NOT NULL,
    "parameters" jsonb,
    "filePath" varchar,
    "fileSize" integer,
    "generatedAt" timestamp,
    "expiresAt" timestamp,
    "errorMessage" text,
    "requestedBy" varchar NOT NULL,
    "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Platform Report Schedules table
CREATE TABLE "platformReportSchedules" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "reportName" varchar NOT NULL,
    "reportType" varchar NOT NULL,
    "format" "reportFormat" NOT NULL,
    "schedule" varchar NOT NULL,
    "parameters" jsonb,
    "recipients" text[],
    "isActive" boolean DEFAULT true NOT NULL,
    "lastRunAt" timestamp,
    "nextRunAt" timestamp,
    "createdBy" varchar NOT NULL,
    "createdAt" timestamp DEFAULT now() NOT NULL,
    "updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Create indexes for platformRevenueSources
CREATE INDEX "IDX_platform_revenue_recorded_type" ON "platformRevenueSources" USING btree ("recordedAt", "sourceType");
--> statement-breakpoint
CREATE INDEX "IDX_platform_revenue_org" ON "platformRevenueSources" USING btree ("organizationId");
--> statement-breakpoint
CREATE INDEX "IDX_platform_revenue_amount" ON "platformRevenueSources" USING btree ("normalizedAmountZAR");
--> statement-breakpoint

-- Create indexes for platformCostEntries
CREATE INDEX "IDX_platform_cost_effective_date" ON "platformCostEntries" USING btree ("effectiveDate");
--> statement-breakpoint
CREATE INDEX "IDX_platform_cost_category" ON "platformCostEntries" USING btree ("categoryId");
--> statement-breakpoint
CREATE INDEX "IDX_platform_cost_org" ON "platformCostEntries" USING btree ("organizationId");
--> statement-breakpoint

-- Create unique constraint for platformCostAllocations
CREATE UNIQUE INDEX "UNQ_cost_allocation_entry_org" ON "platformCostAllocations" USING btree ("costEntryId", "organizationId");
--> statement-breakpoint

-- Create unique constraint and indexes for platformFinancialSnapshots
CREATE UNIQUE INDEX "UNQ_financial_snapshot_period" ON "platformFinancialSnapshots" USING btree ("periodStart", "periodEnd", "periodType", "organizationId");
--> statement-breakpoint
CREATE INDEX "IDX_financial_snapshot_period" ON "platformFinancialSnapshots" USING btree ("periodStart", "periodType");
--> statement-breakpoint
CREATE INDEX "IDX_financial_snapshot_org" ON "platformFinancialSnapshots" USING btree ("organizationId");
--> statement-breakpoint

-- Create indexes for platformFinancialAuditLog
CREATE INDEX "IDX_audit_table_record" ON "platformFinancialAuditLog" USING btree ("tableName", "recordId");
--> statement-breakpoint
CREATE INDEX "IDX_audit_changed_at" ON "platformFinancialAuditLog" USING btree ("changedAt");
--> statement-breakpoint
CREATE INDEX "IDX_audit_changed_by" ON "platformFinancialAuditLog" USING btree ("changedBy");
--> statement-breakpoint

-- Create indexes for platformReportJobs
CREATE INDEX "IDX_report_jobs_status" ON "platformReportJobs" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "IDX_report_jobs_requested_by" ON "platformReportJobs" USING btree ("requestedBy");
--> statement-breakpoint
CREATE INDEX "IDX_report_jobs_created" ON "platformReportJobs" USING btree ("createdAt");
--> statement-breakpoint

-- Add foreign key constraints
ALTER TABLE "platformRevenueSources" ADD CONSTRAINT "platformRevenueSources_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "platformRevenueSources" ADD CONSTRAINT "platformRevenueSources_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "platformCostEntries" ADD CONSTRAINT "platformCostEntries_categoryId_platformCostCategories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."platformCostCategories"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "platformCostEntries" ADD CONSTRAINT "platformCostEntries_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "platformCostEntries" ADD CONSTRAINT "platformCostEntries_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "platformCostEntries" ADD CONSTRAINT "platformCostEntries_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "platformCostAllocations" ADD CONSTRAINT "platformCostAllocations_costEntryId_platformCostEntries_id_fk" FOREIGN KEY ("costEntryId") REFERENCES "public"."platformCostEntries"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "platformCostAllocations" ADD CONSTRAINT "platformCostAllocations_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "platformFinancialSnapshots" ADD CONSTRAINT "platformFinancialSnapshots_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "platformFinancialAuditLog" ADD CONSTRAINT "platformFinancialAuditLog_changedBy_users_id_fk" FOREIGN KEY ("changedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "platformReportJobs" ADD CONSTRAINT "platformReportJobs_requestedBy_users_id_fk" FOREIGN KEY ("requestedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "platformReportSchedules" ADD CONSTRAINT "platformReportSchedules_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- Seed default cost categories
INSERT INTO "platformCostCategories" ("id", "name", "type", "description", "displayOrder") VALUES
    (gen_random_uuid(), 'Server Infrastructure', 'infrastructure', 'Cloud hosting, databases, and computing resources', 1),
    (gen_random_uuid(), 'Payment Processing Fees', 'payment_processing', 'YOCO transaction fees and charges', 2),
    (gen_random_uuid(), 'AI API Costs', 'api_services', 'OpenAI, Gemini, and other AI service usage', 3),
    (gen_random_uuid(), 'Email Services', 'api_services', 'MailerSend and transactional email costs', 4),
    (gen_random_uuid(), 'Staff Salaries', 'staffing', 'Employee salaries and contractor payments', 5),
    (gen_random_uuid(), 'Marketing & Advertising', 'marketing', 'Paid ads, promotions, and marketing campaigns', 6),
    (gen_random_uuid(), 'Creator Revenue Share', 'revenue_share', 'Payouts to course creators', 7),
    (gen_random_uuid(), 'Customer Refunds', 'refund_payout', 'Refunded course purchases', 8),
    (gen_random_uuid(), 'Other Operating Costs', 'other', 'Miscellaneous business expenses', 9);
