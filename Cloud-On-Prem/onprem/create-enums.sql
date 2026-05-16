-- ============================================
-- LearnPlay PostgreSQL Enum Types
-- Safe to re-run: uses IF NOT EXISTS pattern
-- ============================================

DO $$ BEGIN
  CREATE TYPE "organizationType" AS ENUM ('education', 'business', 'elearning');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "currencyCode" AS ENUM ('ZAR', 'USD', 'EUR');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "courseStatus" AS ENUM ('draft', 'active', 'inactive', 'archived');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "courseVisibility" AS ENUM ('public', 'org_only');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "payoutStatus" AS ENUM ('pending', 'paid', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "paymentStatus" AS ENUM ('pending', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "rateSource" AS ENUM ('auto', 'manual');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "difficultyLevel" AS ENUM ('beginner', 'intermediate', 'advanced');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "lessonProgressStatus" AS ENUM ('not_started', 'in_progress', 'completed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "yocoMode" AS ENUM ('test', 'live');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "webhookSource" AS ENUM ('yoco', 'mailersend');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "subscriptionStatus" AS ENUM ('active', 'grace', 'past_due', 'suspended', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "subscriptionInterval" AS ENUM ('monthly', 'annual');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "subscriptionPlanType" AS ENUM ('learner', 'educator');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "subscriptionTargetType" AS ENUM ('organization', 'user');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "invoiceStatus" AS ENUM ('pending', 'paid', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "emailStatus" AS ENUM ('queued', 'sent', 'delivered', 'failed', 'bounced');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "licenseTier" AS ENUM ('blue', 'red', 'gold');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "licenseStatus" AS ENUM ('active', 'inactive', 'expired');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "fulfillmentStatus" AS ENUM ('pending', 'succeeded', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "organizationLicenseStatus" AS ENUM ('pending', 'active', 'expired', 'suspended');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "notificationType" AS ENUM ('course_purchase', 'course_version_update', 'payout_processed', 'review_posted', 'system_announcement');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "bulkJobStatus" AS ENUM ('pending', 'in_progress', 'completed', 'failed', 'partial');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "reviewModerationAction" AS ENUM ('hide', 'unhide', 'flag_spam', 'approve');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "courseRefundStatus" AS ENUM ('pending', 'approved', 'declined', 'paid');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "subscriptionCancellationSource" AS ENUM ('user', 'admin', 'system', 'payment_failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "certificateType" AS ENUM ('lesson', 'course');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "revenueSourceType" AS ENUM ('course_purchase', 'credit_purchase', 'license_purchase', 'subscription_payment', 'yoco_settlement', 'chargeback', 'sponsorship', 'manual_entry');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "costCategoryType" AS ENUM ('infrastructure', 'payment_processing', 'api_services', 'staffing', 'marketing', 'revenue_share', 'refund_payout', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "costRecurrence" AS ENUM ('one_time', 'daily', 'weekly', 'monthly', 'quarterly', 'annual');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "reportStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "reportFormat" AS ENUM ('csv', 'pdf', 'json');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "translationStatus" AS ENUM ('published', 'draft');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "userAllocationStatus" AS ENUM ('active', 'suspended', 'archived');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "gammaEventType" AS ENUM ('lesson_deduction', 'quiz_deduction', 'top_up', 'manual_correction', 'snapshot_adjustment');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "quizQuestionTier" AS ENUM ('10', '15', '20');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "adjustmentStatus" AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "lpTransactionType" AS ENUM ('purchase', 'deduction', 'refund', 'bonus', 'adjustment', 'subscription_topup', 'trial_grant', 'thumbnail_generation', 'quiz_generation');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "creditPurchaseTarget" AS ENUM ('user', 'organization');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "orgCreditActivityType" AS ENUM ('lesson_generation', 'quiz_generation', 'thumbnail_generation', 'course_framework', 'lesson_feedback', 'ai_content_improvement', 'topic_analysis', 'purchase', 'refund', 'adjustment', 'trial_grant', 'content_translation');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "thumbnailSource" AS ENUM ('upload', 'ai');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "lessonAssignmentAudience" AS ENUM ('learner', 'instructor');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "courseProgressStatus" AS ENUM ('not_started', 'in_progress', 'completed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "courseAssignmentAudience" AS ENUM ('learner', 'instructor');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "courseAssignmentScope" AS ENUM ('organization', 'department', 'unit', 'team', 'user');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "paymentIntentType" AS ENUM ('course', 'credits', 'subscription', 'license');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "paymentIntentStatus" AS ENUM ('pending', 'started', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "creditOrderStatus" AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'pending_receipt', 'pending_retry', 'cancelled', 'refunded');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "postFulfillmentJobType" AS ENUM ('receipt_generation', 'confirmation_email', 'receipt_and_email');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "postFulfillmentJobStatus" AS ENUM ('pending', 'claimed', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "purchaseStatus" AS ENUM ('pending', 'completed', 'refunded', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "extractionStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "courseDraftStep" AS ENUM ('upload', 'select_content', 'generate', 'review', 'complete');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "frameworkGenerationStatus" AS ENUM ('idle', 'generating', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "packageInterval" AS ENUM ('monthly', 'annual');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "packageAssignmentStatus" AS ENUM ('active', 'past_due', 'cancelled', 'scheduled_downgrade');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "packageChangeType" AS ENUM ('package_created', 'package_updated', 'package_deleted', 'price_created', 'price_updated', 'price_deleted', 'org_subscribed', 'org_upgraded', 'org_downgraded', 'org_cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "brandingThemeStatus" AS ENUM ('draft', 'active');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
