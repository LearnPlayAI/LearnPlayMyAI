-- Course refund status enum
CREATE TYPE "courseRefundStatus" AS ENUM ('pending', 'approved', 'declined', 'paid');
--> statement-breakpoint
-- Subscription cancellation source enum
CREATE TYPE "subscriptionCancellationSource" AS ENUM ('user', 'admin', 'system', 'payment_failed');
--> statement-breakpoint
-- Course refund requests table
CREATE TABLE "courseRefunds" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchaseId" varchar NOT NULL,
	"courseId" varchar NOT NULL,
	"userId" varchar NOT NULL,
	"organizationId" varchar NOT NULL,
	"status" "courseRefundStatus" DEFAULT 'pending' NOT NULL,
	"requestReason" text NOT NULL,
	"decisionReason" text,
	"decidedBy" varchar,
	"originalAmount" numeric(19, 4) NOT NULL,
	"originalCurrency" "currencyCode" NOT NULL,
	"exchangeRateSnapshot" numeric(19, 8) NOT NULL,
	"platformCommission" numeric(19, 4) NOT NULL,
	"creatorRefundAmount" numeric(19, 4) NOT NULL,
	"platformCurrency" "currencyCode" NOT NULL,
	"completionPercentage" numeric(5, 2) DEFAULT '0.00',
	"eligibilityWindowDays" integer DEFAULT 14 NOT NULL,
	"requestedAt" timestamp DEFAULT now() NOT NULL,
	"decidedAt" timestamp,
	"paidOutAt" timestamp,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
-- Add subscription cancellation fields
ALTER TABLE "subscriptions" ADD COLUMN "cancelAtPeriodEnd" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cancelRequestedAt" timestamp;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cancellationSource" "subscriptionCancellationSource";
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "processedBy" varchar;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "scheduledSeatReleaseAt" timestamp;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "reactivatedAt" timestamp;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "reactivationEligible" boolean DEFAULT true;
--> statement-breakpoint
-- Create indexes for courseRefunds
CREATE INDEX "IDX_course_refunds_purchase" ON "courseRefunds" USING btree ("purchaseId");
--> statement-breakpoint
CREATE INDEX "IDX_course_refunds_course" ON "courseRefunds" USING btree ("courseId");
--> statement-breakpoint
CREATE INDEX "IDX_course_refunds_user" ON "courseRefunds" USING btree ("userId");
--> statement-breakpoint
CREATE INDEX "IDX_course_refunds_org" ON "courseRefunds" USING btree ("organizationId");
--> statement-breakpoint
CREATE INDEX "IDX_course_refunds_status" ON "courseRefunds" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "IDX_course_refunds_requested" ON "courseRefunds" USING btree ("requestedAt");
--> statement-breakpoint
-- Create indexes for subscription cancellation
CREATE INDEX "IDX_subscriptions_cancel_at_period_end" ON "subscriptions" USING btree ("cancelAtPeriodEnd");
--> statement-breakpoint
CREATE INDEX "IDX_subscriptions_scheduled_seat_release" ON "subscriptions" USING btree ("scheduledSeatReleaseAt");
--> statement-breakpoint
-- Add foreign key constraints for courseRefunds
ALTER TABLE "courseRefunds" ADD CONSTRAINT "courseRefunds_purchaseId_coursePurchases_id_fk" FOREIGN KEY ("purchaseId") REFERENCES "public"."coursePurchases"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "courseRefunds" ADD CONSTRAINT "courseRefunds_courseId_courses_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "courseRefunds" ADD CONSTRAINT "courseRefunds_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "courseRefunds" ADD CONSTRAINT "courseRefunds_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "courseRefunds" ADD CONSTRAINT "courseRefunds_decidedBy_users_id_fk" FOREIGN KEY ("decidedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Add foreign key constraint for subscriptions processedBy
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_processedBy_users_id_fk" FOREIGN KEY ("processedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
