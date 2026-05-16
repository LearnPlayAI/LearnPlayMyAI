--
-- PostgreSQL database dump
--


-- Dumped from database version 16.11 (df20cf9)
-- Dumped by pg_dump version 16.10


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: adjustmentStatus; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "adjustmentStatus" AS ENUM (
    'pending',
    'approved',
    'rejected'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: brandingThemeStatus; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "brandingThemeStatus" AS ENUM (
    'draft',
    'active'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: bulkJobStatus; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "bulkJobStatus" AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'failed',
    'partial'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: certificateType; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "certificateType" AS ENUM (
    'lesson',
    'course'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: costCategoryType; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "costCategoryType" AS ENUM (
    'platform_overhead',
    'ai_infrastructure',
    'marketing',
    'personnel',
    'third_party_service',
    'content_acquisition',
    'payment_processing',
    'other'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: costRecurrence; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "costRecurrence" AS ENUM (
    'one_time',
    'monthly',
    'quarterly',
    'annual'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseAssignmentAudience; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "courseAssignmentAudience" AS ENUM (
    'learner',
    'instructor'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseAssignmentScope; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "courseAssignmentScope" AS ENUM (
    'organization',
    'department',
    'unit',
    'team',
    'user'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseDraftStep; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "courseDraftStep" AS ENUM (
    'upload',
    'select_content',
    'generate',
    'review',
    'complete'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseProgressStatus; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "courseProgressStatus" AS ENUM (
    'not_started',
    'in_progress',
    'completed'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseRefundStatus; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "courseRefundStatus" AS ENUM (
    'pending',
    'approved',
    'declined',
    'paid'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseStatus; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "courseStatus" AS ENUM (
    'draft',
    'active',
    'inactive',
    'archived'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseVisibility; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "courseVisibility" AS ENUM (
    'public',
    'org_only'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: creditOrderStatus; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "creditOrderStatus" AS ENUM (
    'pending',
    'processing',
    'succeeded',
    'failed',
    'pending_receipt',
    'pending_retry',
    'cancelled',
    'refunded'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: creditPurchaseTarget; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "creditPurchaseTarget" AS ENUM (
    'user',
    'organization'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: currencyCode; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "currencyCode" AS ENUM (
    'ZAR',
    'USD',
    'EUR'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: difficultyLevel; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "difficultyLevel" AS ENUM (
    'beginner',
    'intermediate',
    'advanced'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: emailStatus; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "emailStatus" AS ENUM (
    'queued',
    'sent',
    'delivered',
    'failed',
    'bounced'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: extractionStatus; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "extractionStatus" AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: frameworkGenerationStatus; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "frameworkGenerationStatus" AS ENUM (
    'idle',
    'generating',
    'completed',
    'failed'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: fulfillmentStatus; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "fulfillmentStatus" AS ENUM (
    'pending',
    'succeeded',
    'failed'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: fulfillment_status_enum; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE fulfillment_status_enum AS ENUM (
    'pending',
    'succeeded',
    'failed'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: gammaEventType; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "gammaEventType" AS ENUM (
    'lesson_deduction',
    'top_up',
    'manual_correction',
    'snapshot_adjustment'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: invoiceStatus; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "invoiceStatus" AS ENUM (
    'pending',
    'paid',
    'failed',
    'cancelled'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonAssignmentAudience; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "lessonAssignmentAudience" AS ENUM (
    'learner',
    'instructor'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonProgressStatus; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "lessonProgressStatus" AS ENUM (
    'not_started',
    'in_progress',
    'completed'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: licenseStatus; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "licenseStatus" AS ENUM (
    'active',
    'inactive',
    'expired'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: licenseTier; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "licenseTier" AS ENUM (
    'blue',
    'red',
    'gold'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lpTransactionType; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "lpTransactionType" AS ENUM (
    'purchase',
    'deduction',
    'refund',
    'bonus',
    'adjustment',
    'subscription_topup',
    'trial_grant',
    'thumbnail_generation',
    'quiz_generation'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: notificationType; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "notificationType" AS ENUM (
    'course_purchase',
    'course_version_update',
    'payout_processed',
    'review_posted',
    'system_announcement'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: orgCreditActivityType; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "orgCreditActivityType" AS ENUM (
    'lesson_generation',
    'quiz_generation',
    'thumbnail_generation',
    'course_framework',
    'purchase',
    'refund',
    'adjustment',
    'trial_grant',
    'lesson_feedback',
    'ai_content_improvement',
    'topic_analysis',
    'content_translation'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationLicenseStatus; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "organizationLicenseStatus" AS ENUM (
    'pending',
    'active',
    'expired',
    'suspended'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationType; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "organizationType" AS ENUM (
    'education',
    'business',
    'elearning'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organization_license_status_enum; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE organization_license_status_enum AS ENUM (
    'pending',
    'active',
    'expired',
    'suspended'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: packageAssignmentStatus; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "packageAssignmentStatus" AS ENUM (
    'active',
    'grace',
    'past_due',
    'suspended',
    'cancelled'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: packageChangeType; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "packageChangeType" AS ENUM (
    'package_created',
    'package_updated',
    'package_deleted',
    'price_created',
    'price_updated',
    'price_deleted',
    'assignment_created',
    'assignment_upgraded',
    'assignment_downgraded',
    'assignment_cancelled',
    'payment_received'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: packageInterval; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "packageInterval" AS ENUM (
    'monthly',
    'annual'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: paymentIntentStatus; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "paymentIntentStatus" AS ENUM (
    'pending',
    'started',
    'processing',
    'succeeded',
    'failed',
    'cancelled'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: paymentIntentType; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "paymentIntentType" AS ENUM (
    'course',
    'credits',
    'subscription',
    'license'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: paymentStatus; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "paymentStatus" AS ENUM (
    'pending',
    'completed',
    'failed',
    'refunded'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: payoutStatus; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "payoutStatus" AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: postFulfillmentJobStatus; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "postFulfillmentJobStatus" AS ENUM (
    'pending',
    'claimed',
    'completed',
    'failed',
    'cancelled'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: postFulfillmentJobType; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "postFulfillmentJobType" AS ENUM (
    'receipt_generation',
    'confirmation_email',
    'receipt_and_email'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: purchaseStatus; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "purchaseStatus" AS ENUM (
    'pending',
    'completed',
    'refunded',
    'failed'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizQuestionTier; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "quizQuestionTier" AS ENUM (
    '10',
    '15',
    '20'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: rateSource; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "rateSource" AS ENUM (
    'auto',
    'manual'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: revenueSourceType; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "revenueSourceType" AS ENUM (
    'credit_purchase',
    'course_sale',
    'license_sale',
    'subscription',
    'marketplace',
    'commission',
    'refund',
    'chargeback',
    'course_purchase'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: reviewModerationAction; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "reviewModerationAction" AS ENUM (
    'hide',
    'unhide',
    'flag_spam',
    'approve'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: subscriptionCancellationSource; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "subscriptionCancellationSource" AS ENUM (
    'user',
    'admin',
    'system',
    'payment_failed'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: subscriptionInterval; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "subscriptionInterval" AS ENUM (
    'monthly',
    'annual'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: subscriptionPlanType; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "subscriptionPlanType" AS ENUM (
    'learner',
    'educator'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: subscriptionStatus; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "subscriptionStatus" AS ENUM (
    'active',
    'grace',
    'past_due',
    'suspended',
    'cancelled'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: subscriptionTargetType; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "subscriptionTargetType" AS ENUM (
    'organization',
    'user'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: thumbnailSource; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "thumbnailSource" AS ENUM (
    'upload',
    'ai'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: translationStatus; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "translationStatus" AS ENUM (
    'published',
    'draft'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userAllocationStatus; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "userAllocationStatus" AS ENUM (
    'active',
    'suspended',
    'archived'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: webhookSource; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "webhookSource" AS ENUM (
    'yoco',
    'mailersend'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: yocoMode; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
CREATE TYPE "yocoMode" AS ENUM (
    'test',
    'live'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;



--
-- Name: achievementCatalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "achievementCatalog" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    description text NOT NULL,
    category character varying NOT NULL,
    requirement character varying NOT NULL,
    "targetValue" integer NOT NULL,
    "coinReward" integer DEFAULT 0,
    "badgeUrl" character varying,
    "permanentBonus" jsonb,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: achievementUnlocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "achievementUnlocks" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "achievementId" character varying NOT NULL,
    progress integer DEFAULT 0,
    "isUnlocked" boolean DEFAULT false,
    "unlockedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: activeOneVOneGames; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "activeOneVOneGames" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "gameId" character varying NOT NULL,
    "collectionId" character varying NOT NULL,
    "player1Id" character varying NOT NULL,
    "player1Name" character varying NOT NULL,
    "player1SocketId" character varying,
    "player1Ready" boolean DEFAULT false,
    "player2Id" character varying NOT NULL,
    "player2Name" character varying NOT NULL,
    "player2SocketId" character varying,
    "player2Ready" boolean DEFAULT false,
    "currentTurn" character varying DEFAULT 'player1'::character varying NOT NULL,
    "gamePhase" character varying DEFAULT 'waiting'::character varying NOT NULL,
    "bothPlayersReady" boolean DEFAULT false,
    "roundTimeSeconds" integer DEFAULT 5 NOT NULL,
    "gameTimeSeconds" integer DEFAULT 120 NOT NULL,
    "gameStartedAt" timestamp without time zone,
    "lastActivityAt" timestamp without time zone DEFAULT now(),
    "createdAt" timestamp without time zone DEFAULT now(),
    "gameSeed" text,
    "roundNumber" integer DEFAULT 1,
    "player1Deck" text,
    "player2Deck" text,
    "player1WonCards" text,
    "player2WonCards" text,
    "tiedCards" text,
    "player1CurrentCard" text,
    "player2CurrentCard" text,
    "selectedStatTypeId" character varying,
    "roundWinner" character varying,
    "roundPhase" character varying DEFAULT 'selecting'::character varying,
    "isSpecialTieMode" boolean DEFAULT false,
    "tiedStats" text,
    "specialTieStatName" character varying,
    "player1RoundsWon" integer DEFAULT 0,
    "player2RoundsWon" integer DEFAULT 0
);


--
-- Name: activePowerUps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "activePowerUps" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "powerUpId" character varying NOT NULL,
    "activatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "expiresAt" timestamp without time zone NOT NULL,
    effect jsonb NOT NULL,
    "gameId" character varying,
    "usesRemaining" integer
);


--
-- Name: activeQuizGames; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "activeQuizGames" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "gameId" character varying NOT NULL,
    "collectionId" character varying NOT NULL,
    "gameMode" character varying NOT NULL,
    "player1Id" character varying NOT NULL,
    "player1Name" character varying NOT NULL,
    "player1SocketId" character varying,
    "player1Ready" boolean DEFAULT false,
    "player1CardCount" integer DEFAULT 0,
    "player1RoundsWon" integer DEFAULT 0,
    "player2Id" character varying,
    "player2Name" character varying,
    "player2SocketId" character varying,
    "player2Ready" boolean DEFAULT false,
    "player2CardCount" integer DEFAULT 0,
    "player2RoundsWon" integer DEFAULT 0,
    "gamePhase" character varying DEFAULT 'waiting'::character varying NOT NULL,
    "bothPlayersReady" boolean DEFAULT false,
    "roundTimeSeconds" integer DEFAULT 5 NOT NULL,
    "gameTimeSeconds" integer DEFAULT 120 NOT NULL,
    "gameStartedAt" timestamp without time zone,
    "lastActivityAt" timestamp without time zone DEFAULT now(),
    "createdAt" timestamp without time zone DEFAULT now(),
    "currentCardIndex" integer DEFAULT 0,
    "currentCard" jsonb,
    "player1Answer" jsonb,
    "player2Answer" jsonb,
    "player1AnswerTime" integer,
    "player2AnswerTime" integer,
    "roundNumber" integer DEFAULT 1,
    "shuffledCardIds" text[],
    "turnVersion" integer DEFAULT 0,
    "player1Correct" boolean,
    "player2Correct" boolean
);


--
-- Name: adminChallengeConfig; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "adminChallengeConfig" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying,
    "challengeType" character varying NOT NULL,
    title character varying NOT NULL,
    description text NOT NULL,
    "goalType" character varying NOT NULL,
    "goalTarget" integer NOT NULL,
    "coinReward" integer DEFAULT 0,
    "xpReward" integer DEFAULT 0,
    "powerUpReward" character varying,
    "isActive" boolean DEFAULT true,
    "createdBy" character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    scope character varying DEFAULT 'organization'::character varying NOT NULL
);


--
-- Name: aiConfig; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "aiConfig" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    provider character varying DEFAULT 'gemini'::character varying NOT NULL,
    "apiKey" character varying NOT NULL,
    "modelName" character varying NOT NULL,
    "isActive" boolean DEFAULT true,
    "createdBy" character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    purpose character varying(20) DEFAULT 'text'::character varying NOT NULL
);


--
-- Name: brandingThemes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "brandingThemes" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying,
    "orgName" text NOT NULL,
    status "brandingThemeStatus" DEFAULT 'draft'::"brandingThemeStatus" NOT NULL,
    tokens jsonb DEFAULT '{}'::jsonb NOT NULL,
    "logoUrl" text,
    "faviconUrl" text,
    "fontHeading" text DEFAULT 'Inter'::text,
    "fontBody" text DEFAULT 'Inter'::text,
    "supportUrl" text,
    "supportEmail" text,
    "termsUrl" text,
    "privacyUrl" text,
    "allowEmailBranding" boolean DEFAULT false,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "presetId" text,
    "gradientEnabled" boolean DEFAULT false,
    "gradientFrom" text,
    "gradientTo" text,
    "gradientAngle" text DEFAULT '135deg'::text,
    "customCopy" jsonb DEFAULT '{}'::jsonb,
    "enableContrastCorrections" boolean DEFAULT true
);


--
-- Name: bulkQuizGenerationJobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "bulkQuizGenerationJobs" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "courseId" character varying NOT NULL,
    "organizationId" character varying NOT NULL,
    "createdBy" character varying NOT NULL,
    status "bulkJobStatus" DEFAULT 'pending'::"bulkJobStatus",
    "totalLessons" integer NOT NULL,
    "completedLessons" integer DEFAULT 0,
    "failedLessons" integer DEFAULT 0,
    "jobResults" jsonb,
    "createdAt" timestamp without time zone DEFAULT now(),
    "completedAt" timestamp without time zone
);


--
-- Name: businessPackagePrices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "businessPackagePrices" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "packageId" character varying NOT NULL,
    currency "currencyCode" NOT NULL,
    "pricePerLearner" numeric(10,2) NOT NULL,
    "pricePerTeacher" numeric(10,2) NOT NULL,
    "pricePerOrgAdmin" numeric(10,2) NOT NULL,
    "isActive" boolean DEFAULT true,
    "effectiveFrom" timestamp without time zone DEFAULT now(),
    "createdBy" character varying,
    "updatedBy" character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: businessPackages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "businessPackages" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    tier character varying NOT NULL,
    "maxLearners" integer NOT NULL,
    "maxTeachers" integer NOT NULL,
    "maxOrgAdmins" integer NOT NULL,
    "monthlyCredits" integer NOT NULL,
    "annualDiscountPercent" numeric(5,2) DEFAULT 10.00,
    "valueProposition" text,
    features jsonb,
    badge character varying,
    "colorScheme" character varying,
    "isActive" boolean DEFAULT true,
    "displayOrder" integer NOT NULL,
    "createdBy" character varying,
    "updatedBy" character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: cardCollections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "cardCollections" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    description text,
    "totalCards" integer NOT NULL,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp without time zone DEFAULT now(),
    "imageKey" character varying
);


--
-- Name: cardStats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "cardStats" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "cardId" character varying NOT NULL,
    "statTypeId" character varying NOT NULL,
    value numeric(10,3) NOT NULL
);


--
-- Name: cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS cards (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "collectionId" character varying NOT NULL,
    name character varying NOT NULL,
    "imageKey" character varying,
    "displayOrder" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: certificates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS certificates (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "certificateId" character varying NOT NULL,
    "userId" character varying NOT NULL,
    "organizationId" character varying NOT NULL,
    "lessonId" character varying,
    "learnerName" character varying NOT NULL,
    "organizationName" character varying NOT NULL,
    "lessonTitle" character varying,
    "pdfFileUrl" character varying,
    "previewImageUrl" character varying,
    "completedAt" timestamp without time zone NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now(),
    "xpEarned" integer DEFAULT 0,
    "shareToken" character varying,
    "sharedPlatforms" jsonb,
    "pdfStoragePath" character varying,
    "certificateType" "certificateType" DEFAULT 'lesson'::"certificateType" NOT NULL,
    "courseId" character varying,
    "courseTitle" character varying
);


--
-- Name: challengeProgress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "challengeProgress" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "challengeId" character varying NOT NULL,
    "currentValue" integer DEFAULT 0,
    "isCompleted" boolean DEFAULT false,
    "isClaimed" boolean DEFAULT false,
    "completedAt" timestamp without time zone,
    "claimedAt" timestamp without time zone,
    "resetAt" timestamp without time zone NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: challengeTemplates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "challengeTemplates" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    description text NOT NULL,
    type character varying NOT NULL,
    requirement character varying NOT NULL,
    "targetValue" integer NOT NULL,
    "coinReward" integer NOT NULL,
    "xpReward" integer DEFAULT 0,
    "powerUpReward" character varying,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: coinAdjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "coinAdjustments" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "organizationId" character varying NOT NULL,
    amount integer NOT NULL,
    reason text NOT NULL,
    "adminId" character varying NOT NULL,
    "balanceBefore" integer NOT NULL,
    "balanceAfter" integer NOT NULL,
    "adjustedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: coinTransactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "coinTransactions" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    amount integer NOT NULL,
    balance integer NOT NULL,
    type character varying NOT NULL,
    description text,
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: collectionStatTypes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "collectionStatTypes" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "collectionId" character varying NOT NULL,
    "statName" character varying NOT NULL,
    "statUnit" character varying,
    "displayOrder" integer NOT NULL,
    "comparisonType" character varying DEFAULT 'highest'::character varying,
    "universalUnitId" character varying
);


--
-- Name: contentTranslationJobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "contentTranslationJobs" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying NOT NULL,
    "sourceCourseId" character varying NOT NULL,
    "targetLanguageCode" character varying(10) NOT NULL,
    "sourceLanguageCode" character varying(10) DEFAULT 'en'::character varying NOT NULL,
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    progress integer DEFAULT 0,
    "currentStage" character varying(50),
    "totalItems" integer DEFAULT 0,
    "completedItems" integer DEFAULT 0,
    "failedItems" integer DEFAULT 0,
    "translatedCourseId" character varying,
    "stageDetails" jsonb,
    "creditsCharged" integer DEFAULT 0,
    "creditCorrelationId" character varying,
    "errorMessage" text,
    "startedAt" timestamp without time zone,
    "completedAt" timestamp without time zone,
    "initiatedBy" character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: cosmeticCatalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "cosmeticCatalog" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    description text NOT NULL,
    type character varying NOT NULL,
    effect jsonb NOT NULL,
    "coinCost" integer NOT NULL,
    tier character varying DEFAULT 'common'::character varying,
    "isActive" boolean DEFAULT true,
    "previewUrl" character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "isSeasonPassExclusive" boolean DEFAULT false,
    "seasonNumber" integer
);


--
-- Name: cosmeticOwnership; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "cosmeticOwnership" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "cosmeticId" character varying NOT NULL,
    "purchasedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: courseAssignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "courseAssignments" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "courseId" character varying NOT NULL,
    "organizationId" character varying NOT NULL,
    "assignedBy" character varying NOT NULL,
    "userId" character varying,
    "unitId" character varying,
    "subUnitId" character varying,
    audience "courseAssignmentAudience" DEFAULT 'learner'::"courseAssignmentAudience" NOT NULL,
    "dueDate" timestamp without time zone,
    "assignedAt" timestamp without time zone DEFAULT now(),
    "createdAt" timestamp without time zone DEFAULT now(),
    mandatory boolean DEFAULT false NOT NULL,
    "assignmentScope" "courseAssignmentScope" DEFAULT 'user'::"courseAssignmentScope" NOT NULL,
    "teamId" character varying
);


--
-- Name: courseCategories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "courseCategories" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying NOT NULL,
    name character varying NOT NULL,
    description text,
    "iconName" character varying,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: courseDraftDocuments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "courseDraftDocuments" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "draftId" character varying NOT NULL,
    "fileName" character varying NOT NULL,
    "mimeType" character varying NOT NULL,
    "fileSize" integer NOT NULL,
    "storagePath" character varying NOT NULL,
    checksum character varying,
    "extractionStatus" "extractionStatus" DEFAULT 'pending'::"extractionStatus",
    "extractedContent" jsonb,
    "extractionError" text,
    "lessonIndex" integer,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: courseDraftFrameworks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "courseDraftFrameworks" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying NOT NULL,
    "createdBy" character varying NOT NULL,
    "courseDescription" text,
    "generatedTitle" character varying,
    "generatedDescription" text,
    "generatedLessons" jsonb,
    "recommendedLessons" jsonb,
    "currentStep" "courseDraftStep" DEFAULT 'upload'::"courseDraftStep",
    version integer DEFAULT 1 NOT NULL,
    "expiresAt" timestamp without time zone,
    "isPublished" boolean DEFAULT false,
    "publishedCourseId" character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "courseSettings" jsonb,
    "analyzedTopics" jsonb,
    "selectedTopics" jsonb,
    "customTopics" jsonb,
    "suggestedTitle" character varying,
    "generationStatus" "frameworkGenerationStatus" DEFAULT 'idle'::"frameworkGenerationStatus",
    "generationError" text,
    "generationStartedAt" timestamp without time zone,
    "generationCompletedAt" timestamp without time zone,
    "generationMetadata" jsonb
);


--
-- Name: courseDrafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "courseDrafts" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "originalCourseId" character varying NOT NULL,
    "organizationId" character varying NOT NULL,
    "createdBy" character varying NOT NULL,
    title character varying NOT NULL,
    description text,
    "thumbnailUrl" character varying,
    price numeric(19,4) DEFAULT '0'::numeric,
    currency "currencyCode" DEFAULT 'ZAR'::"currencyCode",
    "difficultyLevel" "difficultyLevel",
    "estimatedDuration" integer,
    visibility "courseVisibility" DEFAULT 'org_only'::"courseVisibility",
    category character varying,
    tags text[],
    "draftNotes" text,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: courseFrameworks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "courseFrameworks" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "courseId" character varying NOT NULL,
    "organizationId" character varying NOT NULL,
    topics jsonb NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "sourceMap" jsonb,
    "contentHealth" jsonb
);


--
-- Name: courseLessons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "courseLessons" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "courseId" character varying NOT NULL,
    "lessonId" character varying NOT NULL,
    "topicOrder" integer NOT NULL,
    "topicName" character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now(),
    "primaryQuizId" character varying,
    "topicId" character varying,
    "learningObjectives" text[],
    "lessonDetail" text,
    "realWorldExample" text,
    "lessonType" character varying,
    "contentHealth" jsonb
);


--
-- Name: coursePayoutLineItems; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "coursePayoutLineItems" (
    id integer NOT NULL,
    "payoutId" integer NOT NULL,
    "courseId" integer NOT NULL,
    "instructorId" character varying NOT NULL,
    "grossRevenue" numeric(10,2) NOT NULL,
    "platformFee" numeric(10,2) NOT NULL,
    "instructorPayout" numeric(10,2) NOT NULL,
    "enrollmentCount" integer DEFAULT 0 NOT NULL,
    currency character varying(3) DEFAULT 'ZAR'::character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: coursePayoutLineItems_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS "coursePayoutLineItems_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: coursePayoutLineItems_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "coursePayoutLineItems_id_seq" OWNED BY "coursePayoutLineItems".id;


--
-- Name: coursePriceHistory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "coursePriceHistory" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "courseId" character varying NOT NULL,
    "oldPrice" numeric(19,4),
    "newPrice" numeric(19,4) NOT NULL,
    currency "currencyCode" NOT NULL,
    "changedAt" timestamp without time zone DEFAULT now(),
    "changedBy" character varying NOT NULL
);


--
-- Name: courseProgress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "courseProgress" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "courseId" character varying NOT NULL,
    "userId" character varying NOT NULL,
    "organizationId" character varying NOT NULL,
    status "courseProgressStatus" DEFAULT 'not_started'::"courseProgressStatus" NOT NULL,
    "completedLessons" integer DEFAULT 0,
    "totalLessons" integer DEFAULT 0,
    "percentComplete" integer DEFAULT 0,
    "lastAccessedAt" timestamp without time zone,
    "startedAt" timestamp without time zone,
    "completedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: coursePurchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "coursePurchases" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "courseId" character varying NOT NULL,
    "courseVersionId" character varying NOT NULL,
    "userId" character varying NOT NULL,
    "purchasePrice" numeric(19,4) NOT NULL,
    "purchaseCurrency" "currencyCode" NOT NULL,
    "platformCurrency" "currencyCode" NOT NULL,
    "exchangeRateUsed" numeric(19,8) NOT NULL,
    "platformAmount" numeric(19,4) NOT NULL,
    "commissionRate" numeric(5,4) NOT NULL,
    "commissionAmount" numeric(19,4) NOT NULL,
    "creatorEarnings" numeric(19,4) NOT NULL,
    "purchasedAt" timestamp without time zone DEFAULT now(),
    "checkoutId" character varying,
    status "purchaseStatus" DEFAULT 'pending'::"purchaseStatus" NOT NULL,
    "refundedAt" timestamp without time zone,
    "baseCurrency" "currencyCode",
    "basePrice" numeric(19,4),
    "receiptPdfPath" character varying
);


--
-- Name: courseRatings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "courseRatings" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "courseId" character varying NOT NULL,
    "userId" character varying NOT NULL,
    rating numeric(3,1) NOT NULL,
    review text,
    "isHidden" boolean DEFAULT false,
    "isReported" boolean DEFAULT false,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: courseRefunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "courseRefunds" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "purchaseId" character varying NOT NULL,
    "courseId" character varying NOT NULL,
    "userId" character varying NOT NULL,
    "organizationId" character varying NOT NULL,
    status "courseRefundStatus" DEFAULT 'pending'::"courseRefundStatus" NOT NULL,
    "requestReason" text NOT NULL,
    "decisionReason" text,
    "decidedBy" character varying,
    "originalAmount" numeric(19,4) NOT NULL,
    "originalCurrency" "currencyCode" NOT NULL,
    "exchangeRateSnapshot" numeric(19,8) NOT NULL,
    "platformCommission" numeric(19,4) NOT NULL,
    "creatorRefundAmount" numeric(19,4) NOT NULL,
    "platformCurrency" "currencyCode" NOT NULL,
    "completionPercentage" numeric(5,2) DEFAULT 0.00,
    "eligibilityWindowDays" integer DEFAULT 14 NOT NULL,
    "requestedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "decidedAt" timestamp without time zone,
    "paidOutAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: courseReviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "courseReviews" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "courseId" character varying NOT NULL,
    "userId" character varying NOT NULL,
    rating numeric(3,1) NOT NULL,
    comment text,
    "displayName" character varying NOT NULL,
    "useRealName" boolean DEFAULT false,
    "isHidden" boolean DEFAULT false,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "isVisible" boolean DEFAULT true,
    "moderatedBy" character varying,
    "moderatedAt" timestamp without time zone,
    "reviewerDisplayName" character varying,
    "organizationId" character varying
);


--
-- Name: courseTags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "courseTags" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying NOT NULL,
    "courseId" character varying NOT NULL,
    "tagName" character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: courseUpgradeOrders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "courseUpgradeOrders" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "courseId" character varying NOT NULL,
    "versionId" character varying NOT NULL,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    "checkoutId" character varying,
    amount numeric(19,4),
    currency character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: courseVersionNotifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "courseVersionNotifications" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "courseId" character varying NOT NULL,
    "oldVersionId" character varying NOT NULL,
    "newVersionId" character varying NOT NULL,
    "notifiedAt" timestamp without time zone DEFAULT now(),
    "wasViewed" boolean DEFAULT false,
    "viewedAt" timestamp without time zone
);


--
-- Name: courseVersionUpgrades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "courseVersionUpgrades" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "courseId" character varying NOT NULL,
    "fromVersionId" character varying NOT NULL,
    "toVersionId" character varying NOT NULL,
    "upgradePrice" numeric(19,4) NOT NULL,
    "upgradeCurrency" "currencyCode" NOT NULL,
    "exchangeRateUsed" numeric(19,8) NOT NULL,
    "platformAmount" numeric(19,4) NOT NULL,
    "commissionAmount" numeric(19,4) NOT NULL,
    "creatorEarnings" numeric(19,4) NOT NULL,
    "purchasedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: courseVersions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "courseVersions" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "courseId" character varying NOT NULL,
    "versionNumber" character varying NOT NULL,
    title character varying NOT NULL,
    description text,
    "thumbnailUrl" character varying,
    "isPublished" boolean DEFAULT false,
    "publishedAt" timestamp without time zone,
    "previousVersionId" character varying,
    "upgradePrice" numeric(19,4),
    "upgradeCurrency" "currencyCode",
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "basePrice" numeric(19,4) DEFAULT 0 NOT NULL,
    "baseCurrency" "currencyCode" DEFAULT 'ZAR'::"currencyCode" NOT NULL
);


--
-- Name: courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS courses (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying NOT NULL,
    title character varying NOT NULL,
    description text,
    "thumbnailUrl" character varying,
    price numeric(19,4) NOT NULL,
    currency "currencyCode" NOT NULL,
    "categoryId" character varying,
    "difficultyLevel" "difficultyLevel",
    "estimatedDuration" integer,
    status "courseStatus" DEFAULT 'draft'::"courseStatus" NOT NULL,
    "currentVersionId" character varying,
    "createdBy" character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "averageRating" numeric(3,2) DEFAULT 0.00,
    "totalRatings" integer DEFAULT 0,
    visibility "courseVisibility" DEFAULT 'org_only'::"courseVisibility" NOT NULL,
    "thumbnailSource" "thumbnailSource",
    "thumbnailGeneratedAt" timestamp without time zone,
    "thumbnailPromptSummary" text,
    "unitId" character varying,
    "subUnitId" character varying,
    "teamId" character varying,
    "sourceVersionCourseId" character varying,
    "cloneMapping" jsonb,
    "languageCode" character varying(10) DEFAULT 'en'::character varying,
    "contentGroupId" character varying,
    "isDefaultLanguage" boolean DEFAULT true,
    "sourceLanguageVersion" integer,
    "translationStatus" character varying(20) DEFAULT 'published'::character varying
);


--
-- Name: creditAllocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "creditAllocations" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying NOT NULL,
    "planTier" character varying NOT NULL,
    "monthlyCredits" integer NOT NULL,
    "currentBalance" integer DEFAULT 0 NOT NULL,
    "resetDate" timestamp without time zone NOT NULL,
    "lastResetAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: creditOrders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "creditOrders" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "packageId" character varying NOT NULL,
    "purchaserId" character varying NOT NULL,
    "organizationId" character varying,
    "checkoutId" character varying,
    "paymentIntentId" character varying,
    "creditsAmount" integer NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency "currencyCode" NOT NULL,
    status "creditOrderStatus" DEFAULT 'pending'::"creditOrderStatus" NOT NULL,
    "receiptPdfPath" character varying,
    "fulfillmentAt" timestamp without time zone,
    metadata jsonb,
    "retryCount" integer DEFAULT 0,
    "lastRetryAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "purchaseTarget" "creditPurchaseTarget" DEFAULT 'user'::"creditPurchaseTarget" NOT NULL
);


--
-- Name: creditPurchasePackages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "creditPurchasePackages" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    "creditsAmount" integer NOT NULL,
    "priceAmount" numeric(10,2) NOT NULL,
    currency character varying DEFAULT 'ZAR'::character varying,
    badge character varying,
    features jsonb,
    "isActive" boolean DEFAULT true,
    "displayOrder" integer NOT NULL,
    "colorScheme" character varying,
    "createdBy" character varying,
    "updatedBy" character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: creditTransactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "creditTransactions" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "organizationId" character varying NOT NULL,
    amount integer NOT NULL,
    "balanceAfter" integer NOT NULL,
    "transactionType" character varying NOT NULL,
    description text,
    "lessonId" character varying,
    "adminUserId" character varying,
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now(),
    "allocationId" character varying,
    "correlationId" character varying,
    "gammaLedgerEntryId" character varying,
    "quizId" character varying,
    "questionTier" "quizQuestionTier"
);


--
-- Name: creditUsageLogs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "creditUsageLogs" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying NOT NULL,
    "lessonId" character varying,
    "creditsUsed" integer NOT NULL,
    "actionType" character varying NOT NULL,
    "userId" character varying,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: currencyConversionRates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "currencyConversionRates" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "baseCurrency" "currencyCode" NOT NULL,
    "targetCurrency" "currencyCode" NOT NULL,
    rate numeric(19,8) NOT NULL,
    source "rateSource" NOT NULL,
    "lastUpdated" timestamp without time zone DEFAULT now(),
    "updatedBy" character varying,
    "isActive" boolean DEFAULT true
);


--
-- Name: dailyStreaks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "dailyStreaks" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "organizationId" character varying NOT NULL,
    "currentStreak" integer DEFAULT 0,
    "bestStreak" integer DEFAULT 0,
    "lastCompletedDate" date,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: elearningSubscriptionPlans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "elearningSubscriptionPlans" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    "planType" "subscriptionPlanType" NOT NULL,
    "interval" "subscriptionInterval" DEFAULT 'monthly'::"subscriptionInterval" NOT NULL,
    "priceAmount" numeric(10,2) NOT NULL,
    currency "currencyCode" DEFAULT 'ZAR'::"currencyCode" NOT NULL,
    "learnerAllotment" integer,
    "creditAllotment" integer,
    features jsonb,
    badge character varying,
    "colorScheme" character varying,
    "isActive" boolean DEFAULT true,
    "displayOrder" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: emailLogs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "emailLogs" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "recipientEmail" character varying NOT NULL,
    "recipientName" character varying,
    subject character varying NOT NULL,
    "templateType" character varying,
    status "emailStatus" DEFAULT 'queued'::"emailStatus" NOT NULL,
    "mailersendId" character varying,
    "subscriptionId" character varying,
    "invoiceId" character varying,
    "attachmentPaths" jsonb,
    "errorMessage" text,
    "sentAt" timestamp without time zone,
    "deliveredAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "retryCount" integer DEFAULT 0
);


--
-- Name: equippedCosmetics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "equippedCosmetics" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "cosmeticId" character varying NOT NULL,
    slot character varying NOT NULL,
    "equippedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: exchangeRateHistory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "exchangeRateHistory" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "baseCurrency" "currencyCode" NOT NULL,
    "targetCurrency" "currencyCode" NOT NULL,
    rate numeric(19,8) NOT NULL,
    source "rateSource" NOT NULL,
    provider character varying,
    "recordedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: explanationTerms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "explanationTerms" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "explanationId" character varying NOT NULL,
    "termId" character varying NOT NULL,
    "termOccurrences" integer DEFAULT 1,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: financialAuditLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "financialAuditLog" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "eventType" character varying NOT NULL,
    "entityType" character varying NOT NULL,
    "entityId" character varying NOT NULL,
    "userId" character varying,
    "beforeState" jsonb,
    "afterState" jsonb,
    "ipAddress" character varying,
    "userAgent" text,
    "timestamp" timestamp without time zone DEFAULT now(),
    notes text
);


--
-- Name: gameResults; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "gameResults" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "collectionId" character varying NOT NULL,
    "winnerId" character varying,
    "playerIds" text[] NOT NULL,
    "totalRounds" integer NOT NULL,
    "gameStartedAt" timestamp without time zone NOT NULL,
    "gameEndedAt" timestamp without time zone NOT NULL,
    "gameRoomId" character varying,
    "gameMode" character varying NOT NULL,
    "gameDuration" integer,
    "isMultiplayer" boolean DEFAULT true,
    "playerXPChanges" jsonb
);


--
-- Name: gameRooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "gameRooms" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "hostPlayerId" character varying NOT NULL,
    "collectionId" character varying NOT NULL,
    "gameMode" character varying NOT NULL,
    "maxPlayers" integer NOT NULL,
    "currentPlayers" integer DEFAULT 1,
    "gameState" character varying DEFAULT 'waiting'::character varying,
    "gameData" jsonb,
    "joinCode" character varying NOT NULL,
    "gameStartedAt" timestamp without time zone,
    "gameEndedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "roundTimeSeconds" integer DEFAULT 5,
    "gameTimeSeconds" integer DEFAULT 120
);


--
-- Name: gamificationEconomyRules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "gamificationEconomyRules" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying,
    "actionType" character varying NOT NULL,
    "coinReward" integer DEFAULT 0,
    "xpReward" integer DEFAULT 0,
    description text,
    "isActive" boolean DEFAULT true,
    "createdBy" character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    scope character varying DEFAULT 'organization'::character varying NOT NULL
);


--
-- Name: gammaCreditLedger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "gammaCreditLedger" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "correlationId" character varying NOT NULL,
    "eventType" "gammaEventType" NOT NULL,
    "deltaCredits" integer NOT NULL,
    "runningBalance" integer NOT NULL,
    "gammaRequestId" character varying,
    "lessonId" character varying,
    "initiatedByUserId" character varying,
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: gammaCreditSnapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "gammaCreditSnapshots" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "capturedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "reportedBalance" integer NOT NULL,
    source character varying NOT NULL,
    "gammaRequestId" character varying,
    "ledgerRunningBalanceAtCapture" integer NOT NULL,
    "varianceFromLedger" integer NOT NULL,
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: gammaImageStyles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "gammaImageStyles" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "styleKey" character varying NOT NULL,
    "displayName" character varying NOT NULL,
    description text,
    "recommendedUseCases" jsonb,
    source character varying DEFAULT 'manual'::character varying NOT NULL,
    "isActive" boolean DEFAULT true,
    weight integer DEFAULT 0,
    "lastSyncedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "thumbnailUrl" character varying
);


--
-- Name: gammaThemes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "gammaThemes" (
    id character varying NOT NULL,
    name character varying NOT NULL,
    description text,
    "thumbnailUrl" character varying,
    categories jsonb,
    "isActive" boolean DEFAULT true,
    "lastSyncedAt" timestamp without time zone DEFAULT now(),
    "lastSyncError" text,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: guestSessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "guestSessions" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "sessionId" character varying NOT NULL,
    "guestName" character varying NOT NULL,
    "lastActiveAt" timestamp without time zone DEFAULT now(),
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: joinRequestApprovalTokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "joinRequestApprovalTokens" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    token character varying NOT NULL,
    "joinRequestId" character varying NOT NULL,
    "adminUserId" character varying NOT NULL,
    "expiresAt" timestamp without time zone NOT NULL,
    "usedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: joinRequests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "joinRequests" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "organizationId" character varying NOT NULL,
    "requestedUnitId" character varying,
    "requestedSubUnitId" character varying,
    "requestedSubjectIds" text[],
    "assignedUnitId" character varying,
    "assignedSubUnitId" character varying,
    "assignedSubjectIds" text[],
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    "denialReason" text,
    "reviewedBy" character varying,
    "reviewedAt" timestamp without time zone,
    "approvedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "approvalMethod" character varying,
    "requestedTeamId" character varying,
    "assignedTeamId" character varying
);


--
-- Name: leaderBoard; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "leaderBoard" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "gamerName" character varying NOT NULL,
    "avatarImageUrl" character varying,
    country character varying(3),
    "playerTitle" character varying DEFAULT 'Rookie'::character varying,
    "totalWins" integer DEFAULT 0,
    "totalGames" integer DEFAULT 0,
    "winPercentage" numeric(5,2) DEFAULT 0.00,
    "bestWinStreak" integer DEFAULT 0,
    "currentWinStreak" integer DEFAULT 0,
    "averageGameDuration" integer DEFAULT 0,
    "lastActiveAt" timestamp without time zone DEFAULT now(),
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    rank integer DEFAULT 0
);


--
-- Name: lessonAccessLogs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "lessonAccessLogs" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "lessonId" character varying NOT NULL,
    "userId" character varying NOT NULL,
    "organizationId" character varying NOT NULL,
    "actionType" character varying NOT NULL,
    "ipAddress" character varying,
    "userAgent" text,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: lessonAssignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "lessonAssignments" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "lessonId" character varying NOT NULL,
    "studentId" character varying NOT NULL,
    "organizationId" character varying NOT NULL,
    "assignedBy" character varying NOT NULL,
    "dueDate" timestamp without time zone,
    "assignedAt" timestamp without time zone DEFAULT now(),
    "createdAt" timestamp without time zone DEFAULT now(),
    "gradeLevel" character varying,
    "departmentId" character varying,
    "subjectId" character varying,
    "unitId" character varying
);


--
-- Name: lessonContentVersions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "lessonContentVersions" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "lessonId" character varying NOT NULL,
    "versionNumber" integer NOT NULL,
    source text NOT NULL,
    "changeDescription" text,
    "previousContent" text,
    "newContent" text,
    "previousTitle" text,
    "newTitle" text,
    "previousDescription" text,
    "newDescription" text,
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "createdBy" character varying
);


--
-- Name: lessonCreditPricingSettings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "lessonCreditPricingSettings" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "minimumProfitPercentage" numeric(5,2) DEFAULT 30.00 NOT NULL,
    "profitStepDecrease" numeric(5,2) DEFAULT 5.00 NOT NULL,
    "platformCostTiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "updatedBy" character varying,
    "updatedAt" timestamp without time zone DEFAULT now(),
    "createdAt" timestamp without time zone DEFAULT now(),
    "creditsPerLessonTextOnlyMin" integer DEFAULT 40 NOT NULL,
    "creditsPerLessonTextOnlyMax" integer DEFAULT 90 NOT NULL,
    "creditsPerLessonWithImagesMin" integer DEFAULT 140 NOT NULL,
    "creditsPerLessonWithImagesMax" integer DEFAULT 290 NOT NULL
);


--
-- Name: lessonPresentationVersions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "lessonPresentationVersions" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "lessonId" character varying NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "gammaCardId" character varying,
    "presentationUrl" character varying,
    "storageKey" character varying,
    "themeId" character varying,
    "gammaImageOptions" jsonb,
    "gammaTextOptions" jsonb,
    "creditsCharged" integer,
    "createdAt" timestamp without time zone DEFAULT now(),
    "createdBy" character varying,
    "isGenerated" boolean DEFAULT false,
    "isCompressed" boolean DEFAULT false,
    "languageCode" character varying DEFAULT 'en'::character varying
);


--
-- Name: lessonProgress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "lessonProgress" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "lessonId" character varying NOT NULL,
    "userId" character varying NOT NULL,
    "organizationId" character varying NOT NULL,
    status "lessonProgressStatus" DEFAULT 'not_started'::"lessonProgressStatus" NOT NULL,
    "percentComplete" integer DEFAULT 0,
    "secondsSpent" integer DEFAULT 0,
    "lastCheckpoint" character varying,
    "completedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "slidesViewedCount" integer DEFAULT 0,
    "totalSlides" integer DEFAULT 0
);


--
-- Name: lessonProgressSlides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "lessonProgressSlides" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "lessonProgressId" character varying NOT NULL,
    "slideIndex" integer NOT NULL,
    "viewedAt" timestamp without time zone DEFAULT now(),
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: lessonQuizLinks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "lessonQuizLinks" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "lessonId" character varying NOT NULL,
    "quizId" character varying NOT NULL,
    "isPrimary" boolean DEFAULT false,
    "createdAt" timestamp without time zone DEFAULT now(),
    "presentationVersionId" integer,
    "slideContentHash" character varying,
    "isOutdated" boolean DEFAULT false
);


--
-- Name: lessonScopeAssignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "lessonScopeAssignments" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "lessonId" character varying NOT NULL,
    "organizationId" character varying NOT NULL,
    "unitId" character varying,
    "subjectId" character varying,
    "assignedBy" character varying NOT NULL,
    "dueDate" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    audience "lessonAssignmentAudience" DEFAULT 'learner'::"lessonAssignmentAudience" NOT NULL
);


--
-- Name: lessonSlides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "lessonSlides" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "lessonId" character varying NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "slideIndex" integer NOT NULL,
    title character varying(200) NOT NULL,
    bullets text[] DEFAULT '{}'::text[] NOT NULL,
    "speakerNotes" text,
    "mediaPrompt" text,
    role character varying(20) DEFAULT 'slide'::character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: lessonTranslationJobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "lessonTranslationJobs" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "lessonId" character varying NOT NULL,
    "sourceLessonId" character varying NOT NULL,
    "organizationId" character varying NOT NULL,
    "targetLanguageCode" character varying(10) NOT NULL,
    "sourceLanguageCode" character varying(10) DEFAULT 'en'::character varying NOT NULL,
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    "currentStep" character varying(50),
    "creditsCharged" integer DEFAULT 0,
    "errorMessage" text,
    "initiatedBy" character varying NOT NULL,
    "completedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: lessonVersions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "lessonVersions" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "lessonId" character varying NOT NULL,
    "organizationId" character varying NOT NULL,
    "versionNumber" integer NOT NULL,
    title character varying NOT NULL,
    description text,
    "gradeLevel" character varying,
    department character varying,
    subject character varying,
    unit character varying,
    "generationMode" character varying,
    "generationStatus" character varying,
    "themeId" character varying,
    "slideCount" integer,
    "creditsUsed" integer,
    "relatedQuizId" character varying,
    "isPublished" boolean,
    "isArchived" boolean,
    "publishedAt" timestamp without time zone,
    "publishedBy" character varying,
    "viewCount" integer,
    "completionCount" integer,
    "lessonSnapshot" jsonb NOT NULL,
    "storageKey" character varying NOT NULL,
    "fileSize" integer,
    "changeDescription" text,
    "diffSummary" jsonb,
    "editedBy" character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "videoStorageKey" character varying,
    "videoDurationSec" integer,
    "videoSizeBytes" integer,
    "videoUploadedAt" timestamp without time zone,
    "presenterNotesJson" jsonb,
    "languageCode" character varying DEFAULT 'en'::character varying
);


--
-- Name: lessons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS lessons (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying NOT NULL,
    "createdBy" character varying NOT NULL,
    title character varying NOT NULL,
    description text,
    "gradeLevel" character varying,
    department character varying,
    subject character varying,
    unit character varying,
    "generationMode" character varying,
    "generationStatus" character varying DEFAULT 'pending'::character varying NOT NULL,
    "mainTopic" character varying,
    subtopic1 character varying,
    subtopic2 character varying,
    "inputText" text,
    "gammaCardId" character varying,
    "presentationUrl" character varying,
    "storageKey" character varying,
    "themeId" character varying,
    "slideCount" integer DEFAULT 10,
    "creditsUsed" integer,
    "isPublished" boolean DEFAULT false,
    "publishedAt" timestamp without time zone,
    "publishedBy" character varying,
    "isArchived" boolean DEFAULT false,
    "archivedAt" timestamp without time zone,
    "relatedQuizId" character varying,
    "viewCount" integer DEFAULT 0,
    "completionCount" integer DEFAULT 0,
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "generationParamsKey" character varying,
    "gammaImageOptions" jsonb,
    "gammaTextOptions" jsonb,
    "transcriptStatus" character varying,
    "transcriptKey" character varying,
    "sourceDocumentPath" character varying,
    "videoStorageKey" character varying,
    "videoDurationSec" integer,
    "videoSizeBytes" integer,
    "videoUploadedAt" timestamp without time zone,
    "presenterNotesJson" jsonb,
    topics jsonb,
    "learningAssetContract" jsonb,
    "currentSlideVersion" integer DEFAULT 0,
    "contentScore10" numeric(3,1),
    "previousScore10" numeric(3,1),
    "lastFeedbackAt" timestamp without time zone,
    "lastFeedbackHash" character varying,
    "feedbackReport" jsonb,
    detail text,
    "realWorldExample" text,
    "sourceMap" jsonb,
    "languageCode" character varying(10) DEFAULT 'en'::character varying,
    "contentGroupId" character varying,
    "isDefaultLanguage" boolean DEFAULT true,
    "sourceLanguageVersion" integer,
    "translationStatus" "translationStatus" DEFAULT 'published'::"translationStatus",
    "activeLessonVersionId" character varying,
    "feedbackStatus" character varying(20),
    "aiImproveStatus" character varying(20),
    "aiImproveResult" jsonb
);


--
-- Name: licenseFlagAudit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "licenseFlagAudit" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "flagKey" character varying NOT NULL,
    action character varying NOT NULL,
    "oldValue" jsonb,
    "newValue" jsonb,
    "changedBy" character varying NOT NULL,
    reason text,
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: licenseFlagOverrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "licenseFlagOverrides" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "flagKey" character varying NOT NULL,
    value boolean NOT NULL,
    description text,
    "setBy" character varying NOT NULL,
    "expiresAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: licensePayments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "licensePayments" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying NOT NULL,
    "paymentIntentId" character varying,
    "billingPeriodStart" timestamp without time zone NOT NULL,
    "billingPeriodEnd" timestamp without time zone NOT NULL,
    "seatsCount" integer NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency "currencyCode" DEFAULT 'ZAR'::"currencyCode" NOT NULL,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    "paidAt" timestamp without time zone,
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "fulfilledAt" timestamp without time zone,
    "fulfillmentStatus" "fulfillmentStatus" DEFAULT 'pending'::"fulfillmentStatus" NOT NULL,
    "errorMessage" text,
    "processedByWebhookId" character varying
);


--
-- Name: licenseRolloutBetaUsers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "licenseRolloutBetaUsers" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "addedBy" character varying NOT NULL,
    notes text,
    "createdAt" timestamp without time zone DEFAULT now(),
    "expiresAt" timestamp without time zone,
    "createdBy" character varying
);


--
-- Name: licenseRolloutOrganizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "licenseRolloutOrganizations" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying NOT NULL,
    "addedBy" character varying NOT NULL,
    notes text,
    "createdAt" timestamp without time zone DEFAULT now(),
    "expiresAt" timestamp without time zone,
    "createdBy" character varying
);


--
-- Name: loginStreaks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "loginStreaks" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "currentStreak" integer DEFAULT 0,
    "longestStreak" integer DEFAULT 0,
    "lastLoginDate" timestamp without time zone,
    "totalCoinsEarned" integer DEFAULT 0,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: lpCreditLedger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "lpCreditLedger" (
    id character varying DEFAULT (gen_random_uuid())::character varying NOT NULL,
    "userId" character varying NOT NULL,
    "organizationId" character varying,
    "transactionType" "lpTransactionType" NOT NULL,
    amount integer NOT NULL,
    "balanceAfter" integer NOT NULL,
    "correlationId" character varying NOT NULL,
    description text,
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: notificationPreferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "notificationPreferences" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "emailNotifications" boolean DEFAULT true,
    "inAppNotifications" boolean DEFAULT true,
    "coursePurchaseNotifications" boolean DEFAULT true,
    "courseVersionNotifications" boolean DEFAULT true,
    "payoutNotifications" boolean DEFAULT true,
    "reviewNotifications" boolean DEFAULT true,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: orgCreditLedger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "orgCreditLedger" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying NOT NULL,
    "actorUserId" character varying NOT NULL,
    "transactionType" "lpTransactionType" NOT NULL,
    "activityType" "orgCreditActivityType" NOT NULL,
    "activityId" character varying,
    amount integer NOT NULL,
    "balanceAfter" integer NOT NULL,
    "correlationId" character varying NOT NULL,
    description text,
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: organizationBankDetails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "organizationBankDetails" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying NOT NULL,
    "bankName" character varying,
    "accountNumber" character varying,
    "branchCode" character varying,
    "accountHolderName" character varying,
    "isVerified" boolean DEFAULT false,
    "verifiedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: organizationBankingDetails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "organizationBankingDetails" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying NOT NULL,
    "bankName" character varying NOT NULL,
    "accountHolderName" character varying NOT NULL,
    "accountNumber" text NOT NULL,
    "branchCode" character varying,
    "swiftCode" character varying,
    "accountType" character varying,
    "bankAddress" text,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "updatedBy" character varying
);


--
-- Name: organizationLicenseSettings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "organizationLicenseSettings" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying NOT NULL,
    "autoRenew" boolean DEFAULT true,
    "maxSeats" integer,
    "billingDay" integer DEFAULT 1,
    "trialEndsAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: organizationLicenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "organizationLicenses" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying NOT NULL,
    tier "licenseTier" NOT NULL,
    "totalSeats" integer NOT NULL,
    "seatsConsumed" integer DEFAULT 0 NOT NULL,
    "billingPeriodMonths" integer NOT NULL,
    "currentTermStart" timestamp without time zone NOT NULL,
    "currentTermEnd" timestamp without time zone NOT NULL,
    "autoRenew" boolean DEFAULT true NOT NULL,
    status "organizationLicenseStatus" DEFAULT 'pending'::"organizationLicenseStatus" NOT NULL,
    metadata jsonb,
    "fulfilledPaymentId" character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: organizationPackageAssignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "organizationPackageAssignments" (
    id character varying DEFAULT (gen_random_uuid())::text NOT NULL,
    "organizationId" character varying NOT NULL,
    "packageId" character varying NOT NULL,
    "interval" "packageInterval" DEFAULT 'monthly'::"packageInterval" NOT NULL,
    status "packageAssignmentStatus" DEFAULT 'active'::"packageAssignmentStatus" NOT NULL,
    currency "currencyCode" DEFAULT 'ZAR'::"currencyCode" NOT NULL,
    "currentPeriodStart" timestamp without time zone NOT NULL,
    "currentPeriodEnd" timestamp without time zone NOT NULL,
    "nextBillingDate" timestamp without time zone,
    "scheduledPackageId" character varying,
    "scheduledEffectiveDate" timestamp without time zone,
    "scheduledUserSelections" jsonb,
    "lastPaymentId" character varying,
    "lastPaymentDate" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: organizationSubUnits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "organizationSubUnits" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "unitId" character varying NOT NULL,
    name character varying NOT NULL,
    "displayOrder" integer NOT NULL,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp without time zone DEFAULT now(),
    "joinCode" character varying(50)
);


--
-- Name: organizationTeams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "organizationTeams" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "subUnitId" character varying NOT NULL,
    name character varying NOT NULL,
    "displayOrder" integer NOT NULL,
    "joinCode" character varying(50),
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: organizationUnits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "organizationUnits" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying NOT NULL,
    name character varying NOT NULL,
    "displayOrder" integer NOT NULL,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp without time zone DEFAULT now(),
    "joinCode" character varying(50),
    "isShowcaseDepartment" boolean DEFAULT false
);


--
-- Name: organizationUsageLimits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "organizationUsageLimits" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying NOT NULL,
    "concurrentUsers" integer DEFAULT 0,
    "dailyQuizCount" integer DEFAULT 0,
    "aiExplanationCount" integer DEFAULT 0,
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: organizationDomains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "organizationDomains" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying NOT NULL,
    domain text NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    "verificationToken" text NOT NULL,
    "verifiedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "isActive" boolean DEFAULT true NOT NULL
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS organizations (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    type character varying NOT NULL,
    "inviteCode" character varying NOT NULL,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "subscriptionStatus" character varying DEFAULT 'trial'::character varying,
    "trialStartDate" timestamp without time zone DEFAULT now(),
    "trialEndDate" timestamp without time zone,
    "subscriptionStartDate" timestamp without time zone,
    "billingEmail" character varying,
    "pricingTier" character varying DEFAULT 'starter'::character varying,
    "monthlyPrice" numeric(10,2) DEFAULT 0.00,
    curriculum character varying,
    "streetAddress" character varying,
    city character varying,
    province character varying,
    "postalCode" character varying,
    country character varying DEFAULT 'South Africa'::character varying,
    "contactPhone" character varying,
    "studentCount" integer DEFAULT 0,
    "howHeardAboutUs" character varying,
    "isDemo" boolean DEFAULT false,
    "lastCreditResetDate" timestamp without time zone,
    "bonusCredits" integer DEFAULT 0,
    "subscriptionPlanTier" character varying DEFAULT 'standard'::character varying,
    "monthlyLessonCredits" integer DEFAULT 10,
    "trialGammaUserId" text,
    "trialCreditsAwarded" boolean DEFAULT false,
    "orgCreditWallet" integer DEFAULT 0,
    timezone character varying,
    currency character varying,
    "commissionRate" numeric(5,4),
    "hasBankingDetails" boolean DEFAULT false,
    "licenseEnabled" boolean DEFAULT false,
    "licenseBillingStartDate" timestamp without time zone,
    "useOrgCreditWallet" boolean DEFAULT false,
    "allowTeachersToSpendCredits" boolean DEFAULT false,
    "isGeneralOrg" boolean DEFAULT false,
    "isShowcaseOrg" boolean DEFAULT false,
    "defaultLanguage" character varying(10) DEFAULT 'en'::character varying
);


--
-- Name: packageChangeEvents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "packageChangeEvents" (
    id character varying DEFAULT (gen_random_uuid())::text NOT NULL,
    "packageId" character varying,
    "organizationId" character varying,
    "changeType" "packageChangeType" NOT NULL,
    "previousValues" jsonb,
    "newValues" jsonb,
    "changedBy" character varying,
    "ipAddress" character varying,
    "userAgent" text,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: paymentFulfillments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "paymentFulfillments" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "paymentIntentId" character varying NOT NULL,
    "checkoutId" character varying NOT NULL,
    "intentType" "paymentIntentType" NOT NULL,
    "intentId" character varying NOT NULL,
    "invoiceId" character varying,
    "fulfilledBy" character varying NOT NULL,
    "fulfillmentData" jsonb,
    "fulfilledAt" timestamp without time zone DEFAULT now()
);


--
-- Name: paymentIntents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "paymentIntents" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "checkoutId" character varying,
    "intentType" "paymentIntentType" NOT NULL,
    "intentId" character varying NOT NULL,
    "invoiceId" character varying,
    "organizationId" character varying,
    "userId" character varying NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency "currencyCode" NOT NULL,
    "originalAmount" numeric(10,2),
    "originalCurrency" "currencyCode",
    status "paymentIntentStatus" DEFAULT 'pending'::"paymentIntentStatus" NOT NULL,
    metadata jsonb,
    "checkoutUrl" character varying,
    "successUrl" character varying,
    "cancelUrl" character varying,
    "failureUrl" character varying,
    "lastWebhookAt" timestamp without time zone,
    "reconciledAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: paymentTransactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "paymentTransactions" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying NOT NULL,
    "userId" character varying NOT NULL,
    "courseId" character varying,
    "courseVersionId" character varying,
    provider character varying DEFAULT 'yoco'::character varying,
    "checkoutId" character varying NOT NULL,
    amount numeric(19,4) NOT NULL,
    currency "currencyCode" NOT NULL,
    status "paymentStatus" DEFAULT 'pending'::"paymentStatus",
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now(),
    "completedAt" timestamp without time zone
);


--
-- Name: paymentWebhookEvents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "paymentWebhookEvents" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "eventId" character varying NOT NULL,
    "checkoutId" character varying NOT NULL,
    "eventType" character varying NOT NULL,
    "processedAt" timestamp without time zone DEFAULT now(),
    "processingDurationMs" integer,
    "fulfilledBy" character varying,
    success boolean DEFAULT true NOT NULL,
    "errorMessage" text,
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: payoutBatches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "payoutBatches" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying NOT NULL,
    "periodStart" timestamp without time zone NOT NULL,
    "periodEnd" timestamp without time zone NOT NULL,
    currency "currencyCode" NOT NULL,
    "totalRevenue" numeric(19,4) NOT NULL,
    "platformCommission" numeric(19,4) NOT NULL,
    "netPayout" numeric(19,4) NOT NULL,
    status "payoutStatus" DEFAULT 'pending'::"payoutStatus",
    "paidAt" timestamp without time zone,
    "paymentReference" character varying,
    "exchangeRateSnapshot" jsonb NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: payoutDisbursements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "payoutDisbursements" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying NOT NULL,
    "periodStart" timestamp without time zone NOT NULL,
    "periodEnd" timestamp without time zone NOT NULL,
    "originalCurrency" "currencyCode" NOT NULL,
    "originalAmount" numeric(19,4) NOT NULL,
    "convertedCurrency" "currencyCode" NOT NULL,
    "convertedAmount" numeric(19,4) NOT NULL,
    "exchangeRateSnapshot" jsonb NOT NULL,
    "totalSales" numeric(19,4) NOT NULL,
    "commissionRate" numeric(5,4) NOT NULL,
    "commissionAmount" numeric(19,4) NOT NULL,
    "netPayout" numeric(19,4) NOT NULL,
    "dueDate" timestamp without time zone NOT NULL,
    status "payoutStatus" DEFAULT 'pending'::"payoutStatus",
    "paidAt" timestamp without time zone,
    "paymentReference" character varying,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: payoutTransactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "payoutTransactions" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "payoutBatchId" character varying NOT NULL,
    "courseId" character varying NOT NULL,
    "salesCount" integer NOT NULL,
    revenue numeric(19,4) NOT NULL,
    commission numeric(19,4) NOT NULL,
    "netAmount" numeric(19,4) NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: pendingGammaJobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "pendingGammaJobs" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying NOT NULL,
    "lessonId" character varying NOT NULL,
    "gammaGenerationId" character varying,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    "retryCount" integer DEFAULT 0,
    "lastPolledAt" timestamp without time zone,
    "errorMessage" text,
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "firstPollingAt" timestamp without time zone
);


--
-- Name: platformConfiguration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "platformConfiguration" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    key character varying NOT NULL,
    value text NOT NULL,
    "dataType" character varying NOT NULL,
    description text,
    "isEditable" boolean DEFAULT true,
    "lastModifiedBy" character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: platformCostCategories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "platformCostCategories" (
    id character varying DEFAULT (gen_random_uuid())::character varying NOT NULL,
    name character varying NOT NULL,
    type character varying NOT NULL,
    description text,
    "isActive" boolean DEFAULT true,
    "displayOrder" integer DEFAULT 0,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: platformCostCategoryTypes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "platformCostCategoryTypes" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    label character varying NOT NULL,
    description text,
    "isActive" boolean DEFAULT true,
    "displayOrder" integer DEFAULT 0,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: platformCostEntries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "platformCostEntries" (
    id character varying DEFAULT (gen_random_uuid())::character varying NOT NULL,
    "categoryId" character varying,
    "organizationId" character varying,
    description character varying NOT NULL,
    amount numeric(18,4) NOT NULL,
    currency "currencyCode" NOT NULL,
    "exchangeRateUsed" numeric(12,8),
    "normalizedAmountZAR" numeric(18,4) NOT NULL,
    recurrence "costRecurrence" DEFAULT 'one_time'::"costRecurrence",
    "effectiveDate" date NOT NULL,
    "endDate" date,
    "isAutomated" boolean DEFAULT false,
    "sourceReference" character varying,
    metadata jsonb,
    "createdBy" character varying,
    "updatedBy" character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: platformPaymentSettings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "platformPaymentSettings" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "yocoMode" "yocoMode" DEFAULT 'test'::"yocoMode" NOT NULL,
    "updatedBy" character varying,
    "updatedAt" timestamp without time zone DEFAULT now(),
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: platformPricing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "platformPricing" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "learnerMonthlyCost" numeric(10,2) DEFAULT 8.99 NOT NULL,
    currency character varying DEFAULT 'ZAR'::character varying NOT NULL,
    "updatedBy" character varying,
    "updatedAt" timestamp without time zone DEFAULT now(),
    "createdAt" timestamp without time zone DEFAULT now(),
    "defaultCourseCommissionRate" numeric(5,4) DEFAULT 0.3000,
    "minCoursePrice" numeric(10,2) DEFAULT 50.00,
    "maxCoursePrice" numeric(10,2) DEFAULT 10000.00,
    "elearningLearnerMonthlyCost" numeric(10,2) DEFAULT 19.99 NOT NULL,
    "elearningLearnerDiscountPercent" numeric(5,2) DEFAULT 15.00 NOT NULL,
    "creditsPerThumbnailGeneration" integer DEFAULT 15 NOT NULL,
    "creditsPerHealthReport" integer DEFAULT 10 NOT NULL,
    "creditsPerTopicAnalysis" integer DEFAULT 5 NOT NULL,
    "creditsPerFrameworkGeneration" integer DEFAULT 20 NOT NULL,
    "creditsPerExplanationGeneration" integer DEFAULT 25 NOT NULL,
    "creditsPerAnswerCheck" integer DEFAULT 20 NOT NULL,
    "creditsPerLessonGeneration" integer DEFAULT 50 NOT NULL,
    "creditsPerAiFix" integer DEFAULT 10 NOT NULL,
    "creditsPerQuizGeneration" integer DEFAULT 15 NOT NULL,
    "creditsPerLessonTranslation" integer DEFAULT 10 NOT NULL,
    "creditsPerQuizTranslation" integer DEFAULT 5 NOT NULL,
    "creditsPerTranslatedPptxGeneration" integer DEFAULT 50 NOT NULL,
    "creditsPerCourseTranslation" integer DEFAULT 50 NOT NULL
);


--
-- Name: platformRevenueReports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "platformRevenueReports" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "reportDate" date NOT NULL,
    "organizationType" "organizationType",
    "totalRevenue" numeric(19,4) NOT NULL,
    "totalCommission" numeric(19,4) NOT NULL,
    "totalPayouts" numeric(19,4) NOT NULL,
    currency "currencyCode" NOT NULL,
    "reportData" jsonb,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: platformRevenueSources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "platformRevenueSources" (
    id character varying DEFAULT (gen_random_uuid())::character varying NOT NULL,
    "sourceType" "revenueSourceType" NOT NULL,
    "sourceId" character varying,
    "organizationId" character varying,
    "userId" character varying,
    "grossAmount" numeric(18,4) NOT NULL,
    "netAmount" numeric(18,4) NOT NULL,
    "platformCommission" numeric(18,4) DEFAULT '0'::numeric,
    "processingFee" numeric(18,4) DEFAULT '0'::numeric,
    currency "currencyCode" NOT NULL,
    "exchangeRateUsed" numeric(12,8),
    "normalizedAmountZAR" numeric(18,4) NOT NULL,
    metadata jsonb,
    "recordedAt" timestamp without time zone DEFAULT now(),
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: playerSeasonRewards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "playerSeasonRewards" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "seasonPassConfigId" character varying NOT NULL,
    tier integer NOT NULL,
    "isPremiumReward" boolean DEFAULT false,
    "rewardType" character varying NOT NULL,
    "rewardId" character varying,
    "rewardAmount" integer,
    "rewardSnapshot" jsonb,
    "claimedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: playerSessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "playerSessions" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "gameRoomId" character varying NOT NULL,
    "playerId" character varying,
    "playerName" character varying NOT NULL,
    "playerPosition" integer NOT NULL,
    "cardStack" text[] NOT NULL,
    "cardCount" integer NOT NULL,
    "isActive" boolean DEFAULT false,
    "isNPC" boolean DEFAULT false,
    "joinedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: playerStats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "playerStats" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "playerId" character varying NOT NULL,
    "gamerName" character varying NOT NULL,
    "currentXP" integer DEFAULT 0,
    "currentRank" character varying DEFAULT 'Rookie'::character varying,
    "totalGamesPlayed" integer DEFAULT 0,
    "totalWins" integer DEFAULT 0,
    "totalLosses" integer DEFAULT 0,
    "winPercentage" numeric(5,2) DEFAULT 0.00,
    "currentWinStreak" integer DEFAULT 0,
    "bestWinStreak" integer DEFAULT 0,
    "singlePlayerGames" integer DEFAULT 0,
    "singlePlayerWins" integer DEFAULT 0,
    "multiplayerGames" integer DEFAULT 0,
    "multiplayerWins" integer DEFAULT 0,
    "averageGameDuration" integer DEFAULT 0,
    "totalXPEarned" integer DEFAULT 0,
    "totalXPLost" integer DEFAULT 0,
    "lastGameAt" timestamp without time zone,
    "lastRankChangeAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "currentLevel" integer DEFAULT 1,
    "lastLevelChangeAt" timestamp without time zone,
    "certificatesEarned" integer DEFAULT 0
);


--
-- Name: postFulfillmentJobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "postFulfillmentJobs" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "orderId" character varying NOT NULL,
    "jobType" "postFulfillmentJobType" NOT NULL,
    status "postFulfillmentJobStatus" DEFAULT 'pending'::"postFulfillmentJobStatus" NOT NULL,
    "retryCount" integer DEFAULT 0,
    "maxRetries" integer DEFAULT 3,
    "lastAttemptAt" timestamp without time zone,
    "nextRetryAt" timestamp without time zone,
    "claimedAt" timestamp without time zone,
    "completedAt" timestamp without time zone,
    "errorMessage" text,
    "resultData" jsonb,
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: powerUpCatalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "powerUpCatalog" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    description text NOT NULL,
    type character varying NOT NULL,
    effect jsonb NOT NULL,
    "coinCost" integer NOT NULL,
    tier character varying DEFAULT 'common'::character varying,
    "isActive" boolean DEFAULT true,
    "iconUrl" character varying,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: powerUpInventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "powerUpInventory" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "powerUpId" character varying NOT NULL,
    quantity integer DEFAULT 0,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: quizCardExplanations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "quizCardExplanations" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "cardId" character varying NOT NULL,
    explanation text NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: quizCardVersions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "quizCardVersions" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "cardId" character varying NOT NULL,
    "collectionId" character varying NOT NULL,
    "versionNumber" integer NOT NULL,
    "questionType" character varying,
    question text,
    answer1 text,
    answer2 text,
    answer3 text,
    answer4 text,
    answer5 text,
    answer6 text,
    "correctAnswerIndex" integer,
    "matchPairs" jsonb,
    "correctAnswer" text,
    "cardSnapshot" jsonb NOT NULL,
    "changeDescription" text,
    "editedBy" character varying,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: quizCards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "quizCards" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "collectionId" character varying NOT NULL,
    question text NOT NULL,
    answer1 text,
    answer2 text,
    answer3 text,
    answer4 text,
    answer5 text,
    answer6 text,
    "correctAnswerIndex" integer,
    "imageKey" character varying,
    "displayOrder" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now(),
    "questionType" character varying DEFAULT 'multiple-choice'::character varying NOT NULL,
    "matchPairs" jsonb,
    "correctAnswer" text
);


--
-- Name: quizCollectionAssignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "quizCollectionAssignments" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "collectionId" character varying NOT NULL,
    "unitId" character varying,
    "subUnitId" character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "requiredPassPercentage" integer DEFAULT 70,
    "subjectId" character varying,
    "availableFrom" timestamp without time zone,
    "availableTo" timestamp without time zone
);


--
-- Name: quizCollectionVersions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "quizCollectionVersions" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "collectionId" character varying NOT NULL,
    "organizationId" character varying,
    "versionNumber" integer NOT NULL,
    name character varying,
    description text,
    "totalCards" integer,
    difficulty character varying(50),
    "passPercentage" integer,
    "collectionSnapshot" jsonb NOT NULL,
    "changeDescription" text,
    "diffSummary" jsonb,
    "editedBy" character varying,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: quizCollections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "quizCollections" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying,
    "createdBy" character varying,
    name character varying NOT NULL,
    description text,
    "totalCards" integer DEFAULT 0,
    "imageKey" character varying,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "isPublic" boolean DEFAULT false,
    difficulty character varying(50),
    "subjectId" character varying,
    "passPercentage" integer DEFAULT 70,
    "isDeleted" boolean DEFAULT false,
    "languageCode" character varying(10) DEFAULT 'en'::character varying,
    "contentGroupId" character varying,
    "isDefaultLanguage" boolean DEFAULT true,
    "sourceLanguageVersion" integer,
    "translationStatus" "translationStatus" DEFAULT 'published'::"translationStatus"
);


--
-- Name: quizCreditPricing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "quizCreditPricing" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying,
    "questionTier" "quizQuestionTier" NOT NULL,
    "creditCost" integer NOT NULL,
    "isActive" boolean DEFAULT true,
    "createdBy" character varying,
    "updatedBy" character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: quizDrafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "quizDrafts" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying NOT NULL,
    "createdBy" character varying NOT NULL,
    "gradeId" character varying,
    "subjectId" character varying,
    topic text,
    "numberOfQuestions" integer DEFAULT 10,
    difficulty character varying(50) DEFAULT 'medium'::character varying,
    name character varying,
    description text,
    "generatedQuestions" jsonb,
    "currentStep" integer DEFAULT 1,
    "isPublished" boolean DEFAULT false,
    "publishedCollectionId" character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "requiredPassPercentage" integer DEFAULT 70,
    "quizName" character varying,
    "quizDescription" text,
    "isPublic" boolean DEFAULT false,
    "passPercentage" integer DEFAULT 70,
    "questionTypeDistribution" jsonb,
    "primaryTopic" text,
    subtopic1 text,
    subtopic2 text,
    "lessonId" character varying
);


--
-- Name: quizGameProgress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "quizGameProgress" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "collectionId" character varying NOT NULL,
    "totalGamesPlayed" integer DEFAULT 0,
    "totalGamesWon" integer DEFAULT 0,
    "totalCorrectAnswers" integer DEFAULT 0,
    "totalAnswers" integer DEFAULT 0,
    "averageScore" numeric(5,2) DEFAULT 0.00,
    "bestScore" integer DEFAULT 0,
    "lastPlayedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "organizationId" character varying,
    "unitId" character varying,
    "subUnitId" character varying
);


--
-- Name: quizGameResults; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "quizGameResults" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "gameId" character varying NOT NULL,
    "collectionId" character varying NOT NULL,
    "gameMode" character varying NOT NULL,
    "player1Id" character varying NOT NULL,
    "player1Name" character varying NOT NULL,
    "player1Score" integer NOT NULL,
    "player1CorrectAnswers" integer NOT NULL,
    "player1TotalAnswers" integer NOT NULL,
    "player2Id" character varying,
    "player2Name" character varying,
    "player2Score" integer,
    "player2CorrectAnswers" integer,
    "player2TotalAnswers" integer,
    "winnerId" character varying,
    "gameDuration" integer,
    "gameStartedAt" timestamp without time zone NOT NULL,
    "gameEndedAt" timestamp without time zone NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now(),
    "courseId" character varying,
    "lessonId" character varying,
    "courseVersionId" character varying,
    "organizationId" character varying
);


--
-- Name: reviewModerationActions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "reviewModerationActions" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "reviewId" character varying NOT NULL,
    "moderatorId" character varying NOT NULL,
    action "reviewModerationAction" NOT NULL,
    reason text,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: salesInquiries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "salesInquiries" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    surname character varying NOT NULL,
    email character varying NOT NULL,
    phone character varying NOT NULL,
    "organizationName" character varying NOT NULL,
    "position" character varying NOT NULL,
    "positionOther" text,
    "studentCount" character varying NOT NULL,
    "hearAboutUs" character varying NOT NULL,
    "hearAboutUsOther" text,
    "customMessage" text,
    "createdAt" timestamp without time zone DEFAULT now(),
    status character varying DEFAULT 'Follow Up'::character varying NOT NULL,
    "statusUpdatedAt" timestamp without time zone DEFAULT now(),
    "statusUpdatedBy" character varying
);


--
-- Name: seasonPassConfig; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "seasonPassConfig" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying,
    "seasonNumber" integer NOT NULL,
    "seasonName" character varying NOT NULL,
    "tierDefinitions" jsonb NOT NULL,
    "startDate" timestamp without time zone NOT NULL,
    "endDate" timestamp without time zone NOT NULL,
    "isActive" boolean DEFAULT false,
    "createdBy" character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "coinPrice" integer DEFAULT 0,
    advantages text,
    scope character varying DEFAULT 'organization'::character varying NOT NULL,
    description text,
    "coinCost" integer DEFAULT 0,
    "coinMultiplier" numeric(4,2) DEFAULT 1.00,
    "xpMultiplier" numeric(4,2) DEFAULT 1.00,
    status character varying DEFAULT 'draft'::character varying NOT NULL,
    "activatedAt" timestamp without time zone,
    "expiredAt" timestamp without time zone
);


--
-- Name: seasonPassProgress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "seasonPassProgress" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "currentTier" integer DEFAULT 0,
    "seasonXP" integer DEFAULT 0,
    "unlockedTiers" text[] DEFAULT ARRAY[]::text[],
    "claimedTiers" text[] DEFAULT ARRAY[]::text[],
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "seasonPassConfigId" character varying NOT NULL
);


--
-- Name: seasonPassPurchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "seasonPassPurchases" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "seasonPassConfigId" character varying NOT NULL,
    "purchasedAt" timestamp without time zone DEFAULT now(),
    "expiresAt" timestamp without time zone NOT NULL,
    "coinsPaid" integer NOT NULL,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: seasonPassTiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "seasonPassTiers" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    tier integer NOT NULL,
    "xpRequired" integer NOT NULL,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp without time zone DEFAULT now(),
    "seasonPassConfigId" character varying NOT NULL,
    "freeRewardType" character varying,
    "freeRewardId" character varying,
    "freeRewardAmount" integer,
    "premiumRewardType" character varying,
    "premiumRewardId" character varying,
    "premiumRewardAmount" integer
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS sessions (
    sid character varying NOT NULL,
    sess jsonb NOT NULL,
    expire timestamp without time zone NOT NULL
);


--
-- Name: shopItemPricing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "shopItemPricing" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying,
    "itemType" character varying NOT NULL,
    "itemId" character varying NOT NULL,
    "coinCost" integer NOT NULL,
    "isAvailable" boolean DEFAULT true,
    "customDescription" text,
    "createdBy" character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    scope character varying DEFAULT 'organization'::character varying NOT NULL
);


--
-- Name: subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS subjects (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" character varying NOT NULL,
    "unitId" character varying,
    name character varying NOT NULL,
    description text,
    "createdBy" character varying NOT NULL,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "isDeleted" boolean DEFAULT false
);


--
-- Name: subscriptionEvents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "subscriptionEvents" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "subscriptionId" character varying NOT NULL,
    "eventType" character varying NOT NULL,
    "previousStatus" "subscriptionStatus",
    "newStatus" "subscriptionStatus",
    metadata jsonb,
    "initiatedBy" character varying,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: subscriptionInvoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "subscriptionInvoices" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "subscriptionId" character varying,
    "yocoCheckoutId" character varying,
    "checkoutUrl" character varying,
    "amountDue" numeric(10,2) NOT NULL,
    currency "currencyCode" DEFAULT 'ZAR'::"currencyCode" NOT NULL,
    status "invoiceStatus" DEFAULT 'pending'::"invoiceStatus" NOT NULL,
    "dueAt" timestamp without time zone NOT NULL,
    "paidAt" timestamp without time zone,
    "reminderSent" boolean DEFAULT false,
    "pdfStoragePath" character varying,
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "originalAmount" numeric(10,2),
    "originalCurrency" "currencyCode",
    "exchangeRate" numeric(12,6),
    "billingPeriodStart" timestamp without time zone,
    "billingPeriodEnd" timestamp without time zone
);


--
-- Name: subscriptionPlans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "subscriptionPlans" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    tier character varying NOT NULL,
    "monthlyCredits" integer NOT NULL,
    "pricePerTeacher" numeric(10,2) NOT NULL,
    currency character varying DEFAULT 'ZAR'::character varying,
    features jsonb,
    "isActive" boolean DEFAULT true,
    "displayOrder" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    badge character varying,
    "colorScheme" character varying
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS subscriptions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "planId" character varying NOT NULL,
    "targetType" "subscriptionTargetType" NOT NULL,
    "targetId" character varying NOT NULL,
    status "subscriptionStatus" DEFAULT 'active'::"subscriptionStatus" NOT NULL,
    "currentPeriodStart" timestamp without time zone NOT NULL,
    "currentPeriodEnd" timestamp without time zone NOT NULL,
    "nextBillingDate" timestamp without time zone NOT NULL,
    "graceUntil" timestamp without time zone,
    "autoRenew" boolean DEFAULT true,
    "cancelledAt" timestamp without time zone,
    "cancelReason" text,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "cancelAtPeriodEnd" boolean DEFAULT false,
    "cancelRequestedAt" timestamp without time zone,
    "cancellationSource" "subscriptionCancellationSource",
    "processedBy" character varying,
    "scheduledSeatReleaseAt" timestamp without time zone,
    "reactivatedAt" timestamp without time zone,
    "reactivationEligible" boolean DEFAULT true
);


--
-- Name: supportedLanguages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "supportedLanguages" (
    code character varying(10) NOT NULL,
    name character varying NOT NULL,
    "nativeName" character varying NOT NULL,
    region character varying,
    "isActive" boolean DEFAULT true,
    "sortOrder" integer DEFAULT 0,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: systemSettings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "systemSettings" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "settingKey" character varying NOT NULL,
    "settingValue" text NOT NULL,
    "dataType" character varying DEFAULT 'string'::character varying NOT NULL,
    description text,
    "updatedBy" character varying,
    "updatedAt" timestamp without time zone DEFAULT now(),
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: termDefinitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "termDefinitions" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    term character varying NOT NULL,
    definition text NOT NULL,
    "subjectId" character varying,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: unitSubjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "unitSubjects" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "unitId" character varying NOT NULL,
    "subjectId" character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: universalStatUnits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "universalStatUnits" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "unitName" character varying NOT NULL,
    "unitSymbol" character varying NOT NULL,
    description text,
    category character varying,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp without time zone DEFAULT now(),
    "isPredefined" boolean DEFAULT false,
    "createdBy" character varying
);


--
-- Name: userCosmeticLoadouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "userCosmeticLoadouts" (
    "userId" character varying NOT NULL,
    "equippedBorder" character varying,
    "equippedGlow" character varying,
    "equippedBadge" character varying,
    "equippedAnimation" character varying,
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: userCourseEnrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "userCourseEnrollments" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "courseId" character varying NOT NULL,
    "courseVersionId" character varying NOT NULL,
    "hasNewerVersion" boolean DEFAULT false,
    "latestVersionId" character varying,
    "enrolledAt" timestamp without time zone DEFAULT now()
);


--
-- Name: userCourseLessonProgress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "userCourseLessonProgress" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "courseId" character varying NOT NULL,
    "courseVersionId" character varying NOT NULL,
    "lessonId" character varying NOT NULL,
    status "lessonProgressStatus" DEFAULT 'not_started'::"lessonProgressStatus",
    "completedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: userCreditAdjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "userCreditAdjustments" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "allocationId" character varying NOT NULL,
    "requestedBy" character varying NOT NULL,
    "approvedBy" character varying,
    "amountChange" integer NOT NULL,
    reason text NOT NULL,
    status "adjustmentStatus" DEFAULT 'approved'::"adjustmentStatus" NOT NULL,
    "correlationId" character varying,
    "approvedAt" timestamp without time zone,
    "rejectedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: userCreditAllocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "userCreditAllocations" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "organizationId" character varying NOT NULL,
    "currentBalance" integer DEFAULT 0,
    "monthlyAllocation" integer NOT NULL,
    "lastResetDate" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    status "userAllocationStatus" DEFAULT 'active'::"userAllocationStatus" NOT NULL,
    "isTrialAllocation" boolean DEFAULT false
);


--
-- Name: userLicenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "userLicenses" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "organizationId" character varying NOT NULL,
    tier "licenseTier" NOT NULL,
    status "licenseStatus" DEFAULT 'active'::"licenseStatus" NOT NULL,
    "activatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "expiresAt" timestamp without time zone,
    "deactivatedAt" timestamp without time zone,
    "activatedBy" character varying,
    "deactivatedBy" character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: userNotifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "userNotifications" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    type "notificationType" NOT NULL,
    title character varying NOT NULL,
    message text NOT NULL,
    metadata jsonb,
    "isRead" boolean DEFAULT false,
    "readAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: userOrganizationAssignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "userOrganizationAssignments" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "organizationId" character varying NOT NULL,
    "unitId" character varying,
    "subUnitId" character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "subjectId" character varying,
    "teamId" character varying
);


--
-- Name: userOrganizationRoles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "userOrganizationRoles" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "organizationId" character varying NOT NULL,
    role character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: userQuizProgress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "userQuizProgress" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "userId" character varying NOT NULL,
    "collectionId" character varying NOT NULL,
    "assignmentId" character varying,
    "attemptsCount" integer DEFAULT 0,
    "bestScore" integer DEFAULT 0,
    "bestPercentage" numeric(5,2) DEFAULT 0.00,
    "isPassed" boolean DEFAULT false,
    "completionStatus" character varying DEFAULT 'outstanding'::character varying,
    "lastAttemptAt" timestamp without time zone,
    "passedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "organizationId" character varying,
    "unitId" character varying,
    "subUnitId" character varying
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "gamerName" character varying NOT NULL,
    email character varying NOT NULL,
    "firstName" character varying,
    "lastName" character varying,
    "profileImageUrl" character varying,
    "avatarImageUrl" character varying,
    "totalGamesPlayed" integer DEFAULT 0,
    "totalWins" integer DEFAULT 0,
    "winPercentage" numeric(5,2) DEFAULT 0.00,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    password character varying NOT NULL,
    "isAdmin" boolean DEFAULT false,
    country character varying(3),
    bio text,
    "playerTitle" character varying DEFAULT 'Rookie'::character varying,
    "preferredGameModes" jsonb,
    "isStatsPublic" boolean DEFAULT true,
    "bestWinStreak" integer DEFAULT 0,
    "currentWinStreak" integer DEFAULT 0,
    "averageGameDuration" integer DEFAULT 0,
    "lastActiveAt" timestamp without time zone DEFAULT now(),
    "isSuperAdmin" boolean DEFAULT false,
    "isLocked" boolean DEFAULT false,
    "passwordResetToken" character varying,
    "passwordResetExpires" timestamp without time zone,
    "positionAtOrg" character varying,
    "failedLoginAttempts" integer DEFAULT 0,
    "lockedUntil" timestamp without time zone,
    timezone character varying,
    "preferredCurrency" character varying DEFAULT 'ZAR'::character varying,
    "sessionVersion" integer DEFAULT 1 NOT NULL,
    "emailVerified" boolean DEFAULT false,
    "emailVerificationToken" character varying,
    "emailVerificationExpiry" timestamp without time zone,
    "needsCurrencyOnboarding" boolean DEFAULT true,
    "lpCreditBalance" integer DEFAULT 0 NOT NULL,
    "isDisabled" boolean DEFAULT false,
    "preferredLanguage" character varying(10) DEFAULT 'en'::character varying,
    "isCustSuper" boolean DEFAULT false
);


--
-- Name: webhookEvents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "webhookEvents" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    source "webhookSource" NOT NULL,
    "eventId" character varying NOT NULL,
    signature character varying NOT NULL,
    "receivedAt" timestamp without time zone DEFAULT now(),
    "expiresAt" timestamp without time zone NOT NULL,
    processed boolean DEFAULT true
);


--
-- Name: webhookRegistrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "webhookRegistrations" (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    "webhookId" character varying NOT NULL,
    mode "yocoMode" NOT NULL,
    "webhookUrl" character varying NOT NULL,
    "isActive" boolean DEFAULT true,
    "registeredBy" character varying NOT NULL,
    "registeredAt" timestamp without time zone DEFAULT now()
);


--
-- Name: coursePayoutLineItems id; Type: DEFAULT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "coursePayoutLineItems" ALTER COLUMN id SET DEFAULT nextval('"coursePayoutLineItems_id_seq"'::regclass);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: creditOrders UNQ_credit_order_checkout; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "creditOrders"
    ADD CONSTRAINT "UNQ_credit_order_checkout" UNIQUE ("checkoutId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonAssignments UNQ_lesson_assignment_scope; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonAssignments"
    ADD CONSTRAINT "UNQ_lesson_assignment_scope" UNIQUE ("lessonId", "studentId", "organizationId", "gradeLevel", "departmentId", "subjectId", "unitId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonPresentationVersions UNQ_lesson_presentation_version; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonPresentationVersions"
    ADD CONSTRAINT "UNQ_lesson_presentation_version" UNIQUE ("lessonId", version);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonSlides UNQ_lesson_slide_position; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonSlides"
    ADD CONSTRAINT "UNQ_lesson_slide_position" UNIQUE ("lessonId", version, "slideIndex");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonProgress UNQ_lesson_user_org_progress; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonProgress"
    ADD CONSTRAINT "UNQ_lesson_user_org_progress" UNIQUE ("lessonId", "userId", "organizationId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonVersions UNQ_lesson_version; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonVersions"
    ADD CONSTRAINT "UNQ_lesson_version" UNIQUE ("lessonId", "versionNumber");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lpCreditLedger UNQ_lp_ledger_correlation; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lpCreditLedger"
    ADD CONSTRAINT "UNQ_lp_ledger_correlation" UNIQUE ("correlationId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: notificationPreferences UNQ_notification_preferences_user; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "notificationPreferences"
    ADD CONSTRAINT "UNQ_notification_preferences_user" UNIQUE ("userId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: orgCreditLedger UNQ_org_ledger_correlation; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "orgCreditLedger"
    ADD CONSTRAINT "UNQ_org_ledger_correlation" UNIQUE ("correlationId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: businessPackagePrices UNQ_package_currency; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "businessPackagePrices"
    ADD CONSTRAINT "UNQ_package_currency" UNIQUE ("packageId", currency);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: paymentFulfillments UNQ_payment_fulfillment_once; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "paymentFulfillments"
    ADD CONSTRAINT "UNQ_payment_fulfillment_once" UNIQUE ("checkoutId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: paymentIntents UNQ_payment_intent_composite; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "paymentIntents"
    ADD CONSTRAINT "UNQ_payment_intent_composite" UNIQUE ("intentType", "intentId", "invoiceId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseVersionNotifications UNQ_user_course_version_notification; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseVersionNotifications"
    ADD CONSTRAINT "UNQ_user_course_version_notification" UNIQUE ("userId", "courseId", "newVersionId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: certificates UNQ_user_lesson_cert; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY certificates
    ADD CONSTRAINT "UNQ_user_lesson_cert" UNIQUE ("userId", "lessonId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userCreditAllocations UNQ_user_org_credits; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userCreditAllocations"
    ADD CONSTRAINT "UNQ_user_org_credits" UNIQUE ("userId", "organizationId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: dailyStreaks UNQ_user_org_streak; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "dailyStreaks"
    ADD CONSTRAINT "UNQ_user_org_streak" UNIQUE ("userId", "organizationId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: seasonPassPurchases UNQ_user_season_pass; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "seasonPassPurchases"
    ADD CONSTRAINT "UNQ_user_season_pass" UNIQUE ("userId", "seasonPassConfigId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: webhookRegistrations UNQ_webhook_mode_active; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "webhookRegistrations"
    ADD CONSTRAINT "UNQ_webhook_mode_active" UNIQUE (mode, "isActive");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseRatings UQ_course_ratings_user_course; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseRatings"
    ADD CONSTRAINT "UQ_course_ratings_user_course" UNIQUE ("userId", "courseId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: achievementCatalog achievementCatalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "achievementCatalog"
    ADD CONSTRAINT "achievementCatalog_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: achievementUnlocks achievementUnlocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "achievementUnlocks"
    ADD CONSTRAINT "achievementUnlocks_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activeOneVOneGames activeOneVOneGames_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "activeOneVOneGames"
    ADD CONSTRAINT "activeOneVOneGames_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activePowerUps activePowerUps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "activePowerUps"
    ADD CONSTRAINT "activePowerUps_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activeQuizGames activeQuizGames_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "activeQuizGames"
    ADD CONSTRAINT "activeQuizGames_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: adminChallengeConfig adminChallengeConfig_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "adminChallengeConfig"
    ADD CONSTRAINT "adminChallengeConfig_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: aiConfig aiConfig_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "aiConfig"
    ADD CONSTRAINT "aiConfig_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: brandingThemes brandingThemes_organizationId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "brandingThemes"
    ADD CONSTRAINT "brandingThemes_organizationId_key" UNIQUE ("organizationId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: brandingThemes brandingThemes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "brandingThemes"
    ADD CONSTRAINT "brandingThemes_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: bulkQuizGenerationJobs bulkQuizGenerationJobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "bulkQuizGenerationJobs"
    ADD CONSTRAINT "bulkQuizGenerationJobs_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: businessPackagePrices businessPackagePrices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "businessPackagePrices"
    ADD CONSTRAINT "businessPackagePrices_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: businessPackages businessPackages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "businessPackages"
    ADD CONSTRAINT "businessPackages_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: businessPackages businessPackages_tier_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "businessPackages"
    ADD CONSTRAINT "businessPackages_tier_key" UNIQUE (tier);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: cardCollections cardCollections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "cardCollections"
    ADD CONSTRAINT "cardCollections_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: cardStats cardStats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "cardStats"
    ADD CONSTRAINT "cardStats_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: cards cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY cards
    ADD CONSTRAINT cards_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: certificates certificates_certificateId_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY certificates
    ADD CONSTRAINT "certificates_certificateId_unique" UNIQUE ("certificateId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: certificates certificates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY certificates
    ADD CONSTRAINT certificates_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: challengeProgress challengeProgress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "challengeProgress"
    ADD CONSTRAINT "challengeProgress_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: challengeTemplates challengeTemplates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "challengeTemplates"
    ADD CONSTRAINT "challengeTemplates_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: coinAdjustments coinAdjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "coinAdjustments"
    ADD CONSTRAINT "coinAdjustments_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: coinTransactions coinTransactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "coinTransactions"
    ADD CONSTRAINT "coinTransactions_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: collectionStatTypes collectionStatTypes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "collectionStatTypes"
    ADD CONSTRAINT "collectionStatTypes_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contentTranslationJobs contentTranslationJobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "contentTranslationJobs"
    ADD CONSTRAINT "contentTranslationJobs_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: cosmeticCatalog cosmeticCatalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "cosmeticCatalog"
    ADD CONSTRAINT "cosmeticCatalog_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: cosmeticOwnership cosmeticOwnership_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "cosmeticOwnership"
    ADD CONSTRAINT "cosmeticOwnership_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseAssignments courseAssignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseAssignments"
    ADD CONSTRAINT "courseAssignments_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseCategories courseCategories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseCategories"
    ADD CONSTRAINT "courseCategories_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseDraftDocuments courseDraftDocuments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseDraftDocuments"
    ADD CONSTRAINT "courseDraftDocuments_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseDraftFrameworks courseDraftFrameworks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseDraftFrameworks"
    ADD CONSTRAINT "courseDraftFrameworks_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseDrafts courseDrafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseDrafts"
    ADD CONSTRAINT "courseDrafts_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseFrameworks courseFrameworks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseFrameworks"
    ADD CONSTRAINT "courseFrameworks_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseLessons courseLessons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseLessons"
    ADD CONSTRAINT "courseLessons_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: coursePayoutLineItems coursePayoutLineItems_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "coursePayoutLineItems"
    ADD CONSTRAINT "coursePayoutLineItems_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: coursePriceHistory coursePriceHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "coursePriceHistory"
    ADD CONSTRAINT "coursePriceHistory_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseProgress courseProgress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseProgress"
    ADD CONSTRAINT "courseProgress_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: coursePurchases coursePurchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "coursePurchases"
    ADD CONSTRAINT "coursePurchases_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseRatings courseRatings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseRatings"
    ADD CONSTRAINT "courseRatings_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseRefunds courseRefunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseRefunds"
    ADD CONSTRAINT "courseRefunds_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseReviews courseReviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseReviews"
    ADD CONSTRAINT "courseReviews_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseTags courseTags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseTags"
    ADD CONSTRAINT "courseTags_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseUpgradeOrders courseUpgradeOrders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseUpgradeOrders"
    ADD CONSTRAINT "courseUpgradeOrders_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseVersionNotifications courseVersionNotifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseVersionNotifications"
    ADD CONSTRAINT "courseVersionNotifications_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseVersionUpgrades courseVersionUpgrades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseVersionUpgrades"
    ADD CONSTRAINT "courseVersionUpgrades_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseVersions courseVersions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseVersions"
    ADD CONSTRAINT "courseVersions_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courses courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY courses
    ADD CONSTRAINT courses_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: creditAllocations creditAllocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "creditAllocations"
    ADD CONSTRAINT "creditAllocations_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: creditOrders creditOrders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "creditOrders"
    ADD CONSTRAINT "creditOrders_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: creditPurchasePackages creditPurchasePackages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "creditPurchasePackages"
    ADD CONSTRAINT "creditPurchasePackages_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: creditTransactions creditTransactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "creditTransactions"
    ADD CONSTRAINT "creditTransactions_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: creditUsageLogs creditUsageLogs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "creditUsageLogs"
    ADD CONSTRAINT "creditUsageLogs_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: currencyConversionRates currencyConversionRates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "currencyConversionRates"
    ADD CONSTRAINT "currencyConversionRates_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: dailyStreaks dailyStreaks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "dailyStreaks"
    ADD CONSTRAINT "dailyStreaks_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: elearningSubscriptionPlans elearningSubscriptionPlans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "elearningSubscriptionPlans"
    ADD CONSTRAINT "elearningSubscriptionPlans_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: emailLogs emailLogs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "emailLogs"
    ADD CONSTRAINT "emailLogs_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: equippedCosmetics equippedCosmetics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "equippedCosmetics"
    ADD CONSTRAINT "equippedCosmetics_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: exchangeRateHistory exchangeRateHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "exchangeRateHistory"
    ADD CONSTRAINT "exchangeRateHistory_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: explanationTerms explanationTerms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "explanationTerms"
    ADD CONSTRAINT "explanationTerms_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: financialAuditLog financialAuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "financialAuditLog"
    ADD CONSTRAINT "financialAuditLog_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: gameResults gameResults_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "gameResults"
    ADD CONSTRAINT "gameResults_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: gameRooms gameRooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "gameRooms"
    ADD CONSTRAINT "gameRooms_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: gamificationEconomyRules gamificationEconomyRules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "gamificationEconomyRules"
    ADD CONSTRAINT "gamificationEconomyRules_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: gammaCreditLedger gammaCreditLedger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "gammaCreditLedger"
    ADD CONSTRAINT "gammaCreditLedger_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: gammaCreditSnapshots gammaCreditSnapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "gammaCreditSnapshots"
    ADD CONSTRAINT "gammaCreditSnapshots_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: gammaImageStyles gammaImageStyles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "gammaImageStyles"
    ADD CONSTRAINT "gammaImageStyles_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: gammaImageStyles gammaImageStyles_styleKey_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "gammaImageStyles"
    ADD CONSTRAINT "gammaImageStyles_styleKey_key" UNIQUE ("styleKey");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: gammaThemes gammaThemes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "gammaThemes"
    ADD CONSTRAINT "gammaThemes_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: guestSessions guestSessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "guestSessions"
    ADD CONSTRAINT "guestSessions_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: joinRequestApprovalTokens joinRequestApprovalTokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "joinRequestApprovalTokens"
    ADD CONSTRAINT "joinRequestApprovalTokens_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: joinRequestApprovalTokens joinRequestApprovalTokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "joinRequestApprovalTokens"
    ADD CONSTRAINT "joinRequestApprovalTokens_token_key" UNIQUE (token);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: joinRequests joinRequests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "joinRequests"
    ADD CONSTRAINT "joinRequests_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: leaderBoard leaderBoard_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "leaderBoard"
    ADD CONSTRAINT "leaderBoard_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonAccessLogs lessonAccessLogs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonAccessLogs"
    ADD CONSTRAINT "lessonAccessLogs_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonAssignments lessonAssignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonAssignments"
    ADD CONSTRAINT "lessonAssignments_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonContentVersions lessonContentVersions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonContentVersions"
    ADD CONSTRAINT "lessonContentVersions_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonCreditPricingSettings lessonCreditPricingSettings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonCreditPricingSettings"
    ADD CONSTRAINT "lessonCreditPricingSettings_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonPresentationVersions lessonPresentationVersions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonPresentationVersions"
    ADD CONSTRAINT "lessonPresentationVersions_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonProgressSlides lessonProgressSlides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonProgressSlides"
    ADD CONSTRAINT "lessonProgressSlides_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonProgress lessonProgress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonProgress"
    ADD CONSTRAINT "lessonProgress_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonQuizLinks lessonQuizLinks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonQuizLinks"
    ADD CONSTRAINT "lessonQuizLinks_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonScopeAssignments lessonScopeAssignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonScopeAssignments"
    ADD CONSTRAINT "lessonScopeAssignments_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonSlides lessonSlides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonSlides"
    ADD CONSTRAINT "lessonSlides_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonTranslationJobs lessonTranslationJobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonTranslationJobs"
    ADD CONSTRAINT "lessonTranslationJobs_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonVersions lessonVersions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonVersions"
    ADD CONSTRAINT "lessonVersions_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessons lessons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY lessons
    ADD CONSTRAINT lessons_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: licenseFlagAudit licenseFlagAudit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "licenseFlagAudit"
    ADD CONSTRAINT "licenseFlagAudit_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: licenseFlagOverrides licenseFlagOverrides_flagKey_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "licenseFlagOverrides"
    ADD CONSTRAINT "licenseFlagOverrides_flagKey_key" UNIQUE ("flagKey");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: licenseFlagOverrides licenseFlagOverrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "licenseFlagOverrides"
    ADD CONSTRAINT "licenseFlagOverrides_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: licensePayments licensePayments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "licensePayments"
    ADD CONSTRAINT "licensePayments_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: licenseRolloutBetaUsers licenseRolloutBetaUsers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "licenseRolloutBetaUsers"
    ADD CONSTRAINT "licenseRolloutBetaUsers_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: licenseRolloutBetaUsers licenseRolloutBetaUsers_userId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "licenseRolloutBetaUsers"
    ADD CONSTRAINT "licenseRolloutBetaUsers_userId_key" UNIQUE ("userId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: licenseRolloutOrganizations licenseRolloutOrganizations_organizationId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "licenseRolloutOrganizations"
    ADD CONSTRAINT "licenseRolloutOrganizations_organizationId_key" UNIQUE ("organizationId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: licenseRolloutOrganizations licenseRolloutOrganizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "licenseRolloutOrganizations"
    ADD CONSTRAINT "licenseRolloutOrganizations_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: loginStreaks loginStreaks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "loginStreaks"
    ADD CONSTRAINT "loginStreaks_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lpCreditLedger lpCreditLedger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lpCreditLedger"
    ADD CONSTRAINT "lpCreditLedger_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: notificationPreferences notificationPreferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "notificationPreferences"
    ADD CONSTRAINT "notificationPreferences_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: orgCreditLedger orgCreditLedger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "orgCreditLedger"
    ADD CONSTRAINT "orgCreditLedger_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationBankDetails organizationBankDetails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationBankDetails"
    ADD CONSTRAINT "organizationBankDetails_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationBankingDetails organizationBankingDetails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationBankingDetails"
    ADD CONSTRAINT "organizationBankingDetails_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationLicenseSettings organizationLicenseSettings_organizationId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationLicenseSettings"
    ADD CONSTRAINT "organizationLicenseSettings_organizationId_key" UNIQUE ("organizationId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationLicenseSettings organizationLicenseSettings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationLicenseSettings"
    ADD CONSTRAINT "organizationLicenseSettings_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationLicenses organizationLicenses_organizationId_tier_currentTermStart_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationLicenses"
    ADD CONSTRAINT "organizationLicenses_organizationId_tier_currentTermStart_key" UNIQUE ("organizationId", tier, "currentTermStart");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationLicenses organizationLicenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationLicenses"
    ADD CONSTRAINT "organizationLicenses_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationPackageAssignments organizationPackageAssignments_organizationId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationPackageAssignments"
    ADD CONSTRAINT "organizationPackageAssignments_organizationId_key" UNIQUE ("organizationId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationPackageAssignments organizationPackageAssignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationPackageAssignments"
    ADD CONSTRAINT "organizationPackageAssignments_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationSubUnits organizationSubUnits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationSubUnits"
    ADD CONSTRAINT "organizationSubUnits_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationTeams organizationTeams_joinCode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationTeams"
    ADD CONSTRAINT "organizationTeams_joinCode_key" UNIQUE ("joinCode");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationTeams organizationTeams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationTeams"
    ADD CONSTRAINT "organizationTeams_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationUnits organizationUnits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationUnits"
    ADD CONSTRAINT "organizationUnits_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationUsageLimits organizationUsageLimits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationUsageLimits"
    ADD CONSTRAINT "organizationUsageLimits_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationDomains organizationDomains_domain_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationDomains"
    ADD CONSTRAINT "organizationDomains_domain_key" UNIQUE (domain);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationDomains organizationDomains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationDomains"
    ADD CONSTRAINT "organizationDomains_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: packageChangeEvents packageChangeEvents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "packageChangeEvents"
    ADD CONSTRAINT "packageChangeEvents_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: paymentFulfillments paymentFulfillments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "paymentFulfillments"
    ADD CONSTRAINT "paymentFulfillments_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: paymentIntents paymentIntents_checkoutId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "paymentIntents"
    ADD CONSTRAINT "paymentIntents_checkoutId_key" UNIQUE ("checkoutId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: paymentIntents paymentIntents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "paymentIntents"
    ADD CONSTRAINT "paymentIntents_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: paymentTransactions paymentTransactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "paymentTransactions"
    ADD CONSTRAINT "paymentTransactions_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: paymentWebhookEvents paymentWebhookEvents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "paymentWebhookEvents"
    ADD CONSTRAINT "paymentWebhookEvents_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: payoutBatches payoutBatches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "payoutBatches"
    ADD CONSTRAINT "payoutBatches_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: payoutDisbursements payoutDisbursements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "payoutDisbursements"
    ADD CONSTRAINT "payoutDisbursements_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: payoutTransactions payoutTransactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "payoutTransactions"
    ADD CONSTRAINT "payoutTransactions_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: pendingGammaJobs pendingGammaJobs_gammaGenerationId_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "pendingGammaJobs"
    ADD CONSTRAINT "pendingGammaJobs_gammaGenerationId_unique" UNIQUE ("gammaGenerationId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: pendingGammaJobs pendingGammaJobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "pendingGammaJobs"
    ADD CONSTRAINT "pendingGammaJobs_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: platformConfiguration platformConfiguration_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "platformConfiguration"
    ADD CONSTRAINT "platformConfiguration_key_key" UNIQUE (key);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: platformConfiguration platformConfiguration_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "platformConfiguration"
    ADD CONSTRAINT "platformConfiguration_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: platformCostCategories platformCostCategories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "platformCostCategories"
    ADD CONSTRAINT "platformCostCategories_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: platformCostCategoryTypes platformCostCategoryTypes_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "platformCostCategoryTypes"
    ADD CONSTRAINT "platformCostCategoryTypes_name_key" UNIQUE (name);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: platformCostCategoryTypes platformCostCategoryTypes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "platformCostCategoryTypes"
    ADD CONSTRAINT "platformCostCategoryTypes_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: platformCostEntries platformCostEntries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "platformCostEntries"
    ADD CONSTRAINT "platformCostEntries_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: platformPaymentSettings platformPaymentSettings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "platformPaymentSettings"
    ADD CONSTRAINT "platformPaymentSettings_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: platformPricing platformPricing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "platformPricing"
    ADD CONSTRAINT "platformPricing_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: platformRevenueReports platformRevenueReports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "platformRevenueReports"
    ADD CONSTRAINT "platformRevenueReports_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: platformRevenueSources platformRevenueSources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "platformRevenueSources"
    ADD CONSTRAINT "platformRevenueSources_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: playerSeasonRewards playerSeasonRewards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "playerSeasonRewards"
    ADD CONSTRAINT "playerSeasonRewards_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: playerSessions playerSessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "playerSessions"
    ADD CONSTRAINT "playerSessions_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: playerStats playerStats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "playerStats"
    ADD CONSTRAINT "playerStats_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: postFulfillmentJobs postFulfillmentJobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "postFulfillmentJobs"
    ADD CONSTRAINT "postFulfillmentJobs_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: powerUpCatalog powerUpCatalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "powerUpCatalog"
    ADD CONSTRAINT "powerUpCatalog_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: powerUpInventory powerUpInventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "powerUpInventory"
    ADD CONSTRAINT "powerUpInventory_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCardExplanations quizCardExplanations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCardExplanations"
    ADD CONSTRAINT "quizCardExplanations_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCardVersions quizCardVersions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCardVersions"
    ADD CONSTRAINT "quizCardVersions_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCards quizCards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCards"
    ADD CONSTRAINT "quizCards_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCollectionAssignments quizCollectionAssignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCollectionAssignments"
    ADD CONSTRAINT "quizCollectionAssignments_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCollectionVersions quizCollectionVersions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCollectionVersions"
    ADD CONSTRAINT "quizCollectionVersions_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCollections quizCollections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCollections"
    ADD CONSTRAINT "quizCollections_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCreditPricing quizCreditPricing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCreditPricing"
    ADD CONSTRAINT "quizCreditPricing_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizDrafts quizDrafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizDrafts"
    ADD CONSTRAINT "quizDrafts_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizGameProgress quizGameProgress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizGameProgress"
    ADD CONSTRAINT "quizGameProgress_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizGameResults quizGameResults_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizGameResults"
    ADD CONSTRAINT "quizGameResults_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: reviewModerationActions reviewModerationActions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "reviewModerationActions"
    ADD CONSTRAINT "reviewModerationActions_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: salesInquiries salesInquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "salesInquiries"
    ADD CONSTRAINT "salesInquiries_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: seasonPassConfig seasonPassConfig_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "seasonPassConfig"
    ADD CONSTRAINT "seasonPassConfig_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: seasonPassProgress seasonPassProgress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "seasonPassProgress"
    ADD CONSTRAINT "seasonPassProgress_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: seasonPassPurchases seasonPassPurchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "seasonPassPurchases"
    ADD CONSTRAINT "seasonPassPurchases_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: seasonPassTiers seasonPassTiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "seasonPassTiers"
    ADD CONSTRAINT "seasonPassTiers_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (sid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: shopItemPricing shopItemPricing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "shopItemPricing"
    ADD CONSTRAINT "shopItemPricing_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: subjects subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY subjects
    ADD CONSTRAINT subjects_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: subscriptionEvents subscriptionEvents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "subscriptionEvents"
    ADD CONSTRAINT "subscriptionEvents_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: subscriptionInvoices subscriptionInvoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "subscriptionInvoices"
    ADD CONSTRAINT "subscriptionInvoices_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: subscriptionPlans subscriptionPlans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "subscriptionPlans"
    ADD CONSTRAINT "subscriptionPlans_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: subscriptionPlans subscriptionPlans_tier_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "subscriptionPlans"
    ADD CONSTRAINT "subscriptionPlans_tier_unique" UNIQUE (tier);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: supportedLanguages supportedLanguages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "supportedLanguages"
    ADD CONSTRAINT "supportedLanguages_pkey" PRIMARY KEY (code);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: systemSettings systemSettings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "systemSettings"
    ADD CONSTRAINT "systemSettings_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: systemSettings systemSettings_settingKey_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "systemSettings"
    ADD CONSTRAINT "systemSettings_settingKey_unique" UNIQUE ("settingKey");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: termDefinitions termDefinitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "termDefinitions"
    ADD CONSTRAINT "termDefinitions_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: unitSubjects unitSubjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "unitSubjects"
    ADD CONSTRAINT "unitSubjects_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: unitSubjects unitsubjects_unit_subject_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "unitSubjects"
    ADD CONSTRAINT unitsubjects_unit_subject_unique UNIQUE ("unitId", "subjectId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: universalStatUnits universalStatUnits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "universalStatUnits"
    ADD CONSTRAINT "universalStatUnits_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userCosmeticLoadouts userCosmeticLoadouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userCosmeticLoadouts"
    ADD CONSTRAINT "userCosmeticLoadouts_pkey" PRIMARY KEY ("userId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userCourseEnrollments userCourseEnrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userCourseEnrollments"
    ADD CONSTRAINT "userCourseEnrollments_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userCourseLessonProgress userCourseLessonProgress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userCourseLessonProgress"
    ADD CONSTRAINT "userCourseLessonProgress_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userCreditAdjustments userCreditAdjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userCreditAdjustments"
    ADD CONSTRAINT "userCreditAdjustments_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userCreditAllocations userCreditAllocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userCreditAllocations"
    ADD CONSTRAINT "userCreditAllocations_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userLicenses userLicenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userLicenses"
    ADD CONSTRAINT "userLicenses_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userNotifications userNotifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userNotifications"
    ADD CONSTRAINT "userNotifications_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userOrganizationAssignments userOrganizationAssignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userOrganizationAssignments"
    ADD CONSTRAINT "userOrganizationAssignments_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userOrganizationRoles userOrganizationRoles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userOrganizationRoles"
    ADD CONSTRAINT "userOrganizationRoles_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userQuizProgress userQuizProgress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userQuizProgress"
    ADD CONSTRAINT "userQuizProgress_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY users
    ADD CONSTRAINT users_email_unique UNIQUE (email);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: users users_gamerName_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY users
    ADD CONSTRAINT "users_gamerName_unique" UNIQUE ("gamerName");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: webhookEvents webhookEvents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "webhookEvents"
    ADD CONSTRAINT "webhookEvents_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: webhookRegistrations webhookRegistrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "webhookRegistrations"
    ADD CONSTRAINT "webhookRegistrations_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: IDX_achievement_unlocks_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_achievement_unlocks_user" ON "achievementUnlocks" USING btree ("userId");


--
-- Name: IDX_active_games_game_phase; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_active_games_game_phase" ON "activeOneVOneGames" USING btree ("gamePhase");


--
-- Name: IDX_active_games_last_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_active_games_last_activity" ON "activeOneVOneGames" USING btree ("lastActivityAt");


--
-- Name: IDX_active_powerups_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_active_powerups_expires" ON "activePowerUps" USING btree ("expiresAt");


--
-- Name: IDX_active_powerups_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_active_powerups_user" ON "activePowerUps" USING btree ("userId");


--
-- Name: IDX_active_quiz_games_phase; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_active_quiz_games_phase" ON "activeQuizGames" USING btree ("gamePhase");


--
-- Name: IDX_admin_challenge_config_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_admin_challenge_config_org" ON "adminChallengeConfig" USING btree ("organizationId");


--
-- Name: IDX_admin_challenge_config_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_admin_challenge_config_scope" ON "adminChallengeConfig" USING btree (scope);


--
-- Name: IDX_bulk_quiz_jobs_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_bulk_quiz_jobs_course" ON "bulkQuizGenerationJobs" USING btree ("courseId");


--
-- Name: IDX_bulk_quiz_jobs_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_bulk_quiz_jobs_org" ON "bulkQuizGenerationJobs" USING btree ("organizationId");


--
-- Name: IDX_bulk_quiz_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_bulk_quiz_jobs_status" ON "bulkQuizGenerationJobs" USING btree (status);


--
-- Name: IDX_business_package_prices_currency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_business_package_prices_currency" ON "businessPackagePrices" USING btree (currency);


--
-- Name: IDX_business_package_prices_package; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_business_package_prices_package" ON "businessPackagePrices" USING btree ("packageId");


--
-- Name: IDX_business_packages_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_business_packages_active" ON "businessPackages" USING btree ("isActive");


--
-- Name: IDX_business_packages_display_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_business_packages_display_order" ON "businessPackages" USING btree ("displayOrder");


--
-- Name: IDX_business_packages_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_business_packages_tier" ON "businessPackages" USING btree (tier);


--
-- Name: IDX_certificates_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_certificates_course" ON certificates USING btree ("courseId");


--
-- Name: IDX_certificates_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_certificates_lesson" ON certificates USING btree ("lessonId");


--
-- Name: IDX_certificates_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_certificates_org" ON certificates USING btree ("organizationId");


--
-- Name: IDX_certificates_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_certificates_type" ON certificates USING btree ("certificateType");


--
-- Name: IDX_certificates_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_certificates_user" ON certificates USING btree ("userId");


--
-- Name: IDX_challenge_progress_reset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_challenge_progress_reset" ON "challengeProgress" USING btree ("resetAt");


--
-- Name: IDX_challenge_progress_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_challenge_progress_user" ON "challengeProgress" USING btree ("userId");


--
-- Name: IDX_coin_transactions_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_coin_transactions_created" ON "coinTransactions" USING btree ("createdAt");


--
-- Name: IDX_coin_transactions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_coin_transactions_user" ON "coinTransactions" USING btree ("userId");


--
-- Name: IDX_content_translation_jobs_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_content_translation_jobs_org" ON "contentTranslationJobs" USING btree ("organizationId");


--
-- Name: IDX_content_translation_jobs_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_content_translation_jobs_source" ON "contentTranslationJobs" USING btree ("sourceCourseId");


--
-- Name: IDX_content_translation_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_content_translation_jobs_status" ON "contentTranslationJobs" USING btree (status);


--
-- Name: IDX_cosmetic_ownership_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_cosmetic_ownership_user" ON "cosmeticOwnership" USING btree ("userId");


--
-- Name: IDX_course_assignments_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_assignments_course" ON "courseAssignments" USING btree ("courseId");


--
-- Name: IDX_course_assignments_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_assignments_org" ON "courseAssignments" USING btree ("organizationId");


--
-- Name: IDX_course_assignments_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_assignments_scope" ON "courseAssignments" USING btree ("assignmentScope");


--
-- Name: IDX_course_assignments_subunit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_assignments_subunit" ON "courseAssignments" USING btree ("subUnitId");


--
-- Name: IDX_course_assignments_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_assignments_team" ON "courseAssignments" USING btree ("teamId");


--
-- Name: IDX_course_assignments_unit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_assignments_unit" ON "courseAssignments" USING btree ("unitId");


--
-- Name: IDX_course_assignments_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_assignments_user" ON "courseAssignments" USING btree ("userId");


--
-- Name: IDX_course_categories_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_categories_org" ON "courseCategories" USING btree ("organizationId");


--
-- Name: IDX_course_draft_documents_draft; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_draft_documents_draft" ON "courseDraftDocuments" USING btree ("draftId");


--
-- Name: IDX_course_draft_documents_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_draft_documents_status" ON "courseDraftDocuments" USING btree ("extractionStatus");


--
-- Name: IDX_course_draft_frameworks_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_draft_frameworks_creator" ON "courseDraftFrameworks" USING btree ("createdBy");


--
-- Name: IDX_course_draft_frameworks_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_draft_frameworks_expires" ON "courseDraftFrameworks" USING btree ("expiresAt");


--
-- Name: IDX_course_draft_frameworks_generation_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_draft_frameworks_generation_status" ON "courseDraftFrameworks" USING btree ("generationStatus");


--
-- Name: IDX_course_draft_frameworks_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_draft_frameworks_org" ON "courseDraftFrameworks" USING btree ("organizationId");


--
-- Name: IDX_course_drafts_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_drafts_org" ON "courseDrafts" USING btree ("organizationId");


--
-- Name: IDX_course_drafts_original; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_drafts_original" ON "courseDrafts" USING btree ("originalCourseId");


--
-- Name: IDX_course_frameworks_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_frameworks_course" ON "courseFrameworks" USING btree ("courseId");


--
-- Name: IDX_course_lessons_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_lessons_course" ON "courseLessons" USING btree ("courseId");


--
-- Name: IDX_course_lessons_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_lessons_lesson" ON "courseLessons" USING btree ("lessonId");


--
-- Name: IDX_course_lessons_quiz; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_lessons_quiz" ON "courseLessons" USING btree ("primaryQuizId");


--
-- Name: IDX_course_price_history_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_price_history_course" ON "coursePriceHistory" USING btree ("courseId");


--
-- Name: IDX_course_progress_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_progress_course" ON "courseProgress" USING btree ("courseId");


--
-- Name: IDX_course_progress_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_progress_org" ON "courseProgress" USING btree ("organizationId");


--
-- Name: IDX_course_progress_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_progress_status" ON "courseProgress" USING btree (status);


--
-- Name: IDX_course_progress_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_progress_user" ON "courseProgress" USING btree ("userId");


--
-- Name: IDX_course_purchases_checkout; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_purchases_checkout" ON "coursePurchases" USING btree ("checkoutId");


--
-- Name: IDX_course_purchases_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_purchases_course" ON "coursePurchases" USING btree ("courseId");


--
-- Name: IDX_course_purchases_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_purchases_status" ON "coursePurchases" USING btree (status);


--
-- Name: IDX_course_purchases_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_purchases_user" ON "coursePurchases" USING btree ("userId");


--
-- Name: IDX_course_ratings_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_ratings_course" ON "courseRatings" USING btree ("courseId");


--
-- Name: IDX_course_ratings_rating; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_ratings_rating" ON "courseRatings" USING btree (rating);


--
-- Name: IDX_course_ratings_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_ratings_user" ON "courseRatings" USING btree ("userId");


--
-- Name: IDX_course_refunds_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_refunds_course" ON "courseRefunds" USING btree ("courseId");


--
-- Name: IDX_course_refunds_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_refunds_org" ON "courseRefunds" USING btree ("organizationId");


--
-- Name: IDX_course_refunds_purchase; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_refunds_purchase" ON "courseRefunds" USING btree ("purchaseId");


--
-- Name: IDX_course_refunds_requested; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_refunds_requested" ON "courseRefunds" USING btree ("requestedAt");


--
-- Name: IDX_course_refunds_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_refunds_status" ON "courseRefunds" USING btree (status);


--
-- Name: IDX_course_refunds_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_refunds_user" ON "courseRefunds" USING btree ("userId");


--
-- Name: IDX_course_reviews_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_reviews_course" ON "courseReviews" USING btree ("courseId");


--
-- Name: IDX_course_reviews_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_reviews_org" ON "courseReviews" USING btree ("organizationId");


--
-- Name: IDX_course_reviews_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_reviews_user" ON "courseReviews" USING btree ("userId");


--
-- Name: IDX_course_tags_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_tags_course" ON "courseTags" USING btree ("courseId");


--
-- Name: IDX_course_tags_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_tags_name" ON "courseTags" USING btree ("tagName");


--
-- Name: IDX_course_upgrade_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_upgrade_orders_status" ON "courseUpgradeOrders" USING btree (status);


--
-- Name: IDX_course_upgrade_orders_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_upgrade_orders_user" ON "courseUpgradeOrders" USING btree ("userId");


--
-- Name: IDX_course_upgrade_orders_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_upgrade_orders_version" ON "courseUpgradeOrders" USING btree ("versionId");


--
-- Name: IDX_course_version_notifications_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_version_notifications_course" ON "courseVersionNotifications" USING btree ("courseId");


--
-- Name: IDX_course_version_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_version_notifications_user" ON "courseVersionNotifications" USING btree ("userId");


--
-- Name: IDX_course_version_upgrades_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_version_upgrades_course" ON "courseVersionUpgrades" USING btree ("courseId");


--
-- Name: IDX_course_version_upgrades_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_version_upgrades_user" ON "courseVersionUpgrades" USING btree ("userId");


--
-- Name: IDX_course_versions_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_versions_course" ON "courseVersions" USING btree ("courseId");


--
-- Name: IDX_course_versions_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_course_versions_published" ON "courseVersions" USING btree ("isPublished");


--
-- Name: IDX_courses_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_courses_category" ON courses USING btree ("categoryId");


--
-- Name: IDX_courses_content_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_courses_content_group" ON courses USING btree ("contentGroupId", "languageCode");


--
-- Name: IDX_courses_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_courses_language" ON courses USING btree ("languageCode");


--
-- Name: IDX_courses_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_courses_org" ON courses USING btree ("organizationId");


--
-- Name: IDX_courses_source_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_courses_source_version" ON courses USING btree ("sourceVersionCourseId");


--
-- Name: IDX_courses_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_courses_status" ON courses USING btree (status);


--
-- Name: IDX_courses_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_courses_status_created" ON courses USING btree (status, "createdAt");


--
-- Name: IDX_courses_status_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_courses_status_visibility" ON courses USING btree (status, visibility);


--
-- Name: IDX_courses_title; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_courses_title" ON courses USING btree (title);


--
-- Name: IDX_courses_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_courses_visibility" ON courses USING btree (visibility);


--
-- Name: IDX_credit_allocations_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_credit_allocations_org" ON "creditAllocations" USING btree ("organizationId");


--
-- Name: IDX_credit_orders_checkout; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_credit_orders_checkout" ON "creditOrders" USING btree ("checkoutId");


--
-- Name: IDX_credit_orders_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_credit_orders_created" ON "creditOrders" USING btree ("createdAt");


--
-- Name: IDX_credit_orders_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_credit_orders_org" ON "creditOrders" USING btree ("organizationId");


--
-- Name: IDX_credit_orders_package; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_credit_orders_package" ON "creditOrders" USING btree ("packageId");


--
-- Name: IDX_credit_orders_payment_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_credit_orders_payment_intent" ON "creditOrders" USING btree ("paymentIntentId");


--
-- Name: IDX_credit_orders_purchaser; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_credit_orders_purchaser" ON "creditOrders" USING btree ("purchaserId");


--
-- Name: IDX_credit_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_credit_orders_status" ON "creditOrders" USING btree (status);


--
-- Name: IDX_credit_packages_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_credit_packages_active" ON "creditPurchasePackages" USING btree ("isActive");


--
-- Name: IDX_credit_packages_display_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_credit_packages_display_order" ON "creditPurchasePackages" USING btree ("displayOrder");


--
-- Name: IDX_credit_transactions_allocation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_credit_transactions_allocation" ON "creditTransactions" USING btree ("allocationId");


--
-- Name: IDX_credit_transactions_correlation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_credit_transactions_correlation" ON "creditTransactions" USING btree ("correlationId");


--
-- Name: IDX_credit_transactions_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_credit_transactions_created" ON "creditTransactions" USING btree ("createdAt");


--
-- Name: IDX_credit_transactions_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_credit_transactions_org" ON "creditTransactions" USING btree ("organizationId");


--
-- Name: IDX_credit_transactions_quiz; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_credit_transactions_quiz" ON "creditTransactions" USING btree ("quizId");


--
-- Name: IDX_credit_usage_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_credit_usage_created" ON "creditUsageLogs" USING btree ("createdAt");


--
-- Name: IDX_credit_usage_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_credit_usage_lesson" ON "creditUsageLogs" USING btree ("lessonId");


--
-- Name: IDX_credit_usage_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_credit_usage_org" ON "creditUsageLogs" USING btree ("organizationId");


--
-- Name: IDX_currency_rates_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_currency_rates_active" ON "currencyConversionRates" USING btree ("isActive");


--
-- Name: IDX_currency_rates_base_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_currency_rates_base_target" ON "currencyConversionRates" USING btree ("baseCurrency", "targetCurrency");


--
-- Name: IDX_daily_streaks_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_daily_streaks_org" ON "dailyStreaks" USING btree ("organizationId");


--
-- Name: IDX_daily_streaks_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_daily_streaks_user" ON "dailyStreaks" USING btree ("userId");


--
-- Name: IDX_economy_rules_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_economy_rules_org" ON "gamificationEconomyRules" USING btree ("organizationId");


--
-- Name: IDX_economy_rules_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_economy_rules_scope" ON "gamificationEconomyRules" USING btree (scope);


--
-- Name: IDX_elearning_plans_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_elearning_plans_active" ON "elearningSubscriptionPlans" USING btree ("isActive");


--
-- Name: IDX_elearning_plans_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_elearning_plans_type" ON "elearningSubscriptionPlans" USING btree ("planType");


--
-- Name: IDX_email_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_email_logs_created" ON "emailLogs" USING btree ("createdAt");


--
-- Name: IDX_email_logs_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_email_logs_invoice" ON "emailLogs" USING btree ("invoiceId");


--
-- Name: IDX_email_logs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_email_logs_status" ON "emailLogs" USING btree (status);


--
-- Name: IDX_email_logs_subscription; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_email_logs_subscription" ON "emailLogs" USING btree ("subscriptionId");


--
-- Name: IDX_equipped_cosmetics_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_equipped_cosmetics_user" ON "equippedCosmetics" USING btree ("userId");


--
-- Name: IDX_exchange_rate_history_currencies; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_exchange_rate_history_currencies" ON "exchangeRateHistory" USING btree ("baseCurrency", "targetCurrency");


--
-- Name: IDX_exchange_rate_history_recorded; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_exchange_rate_history_recorded" ON "exchangeRateHistory" USING btree ("recordedAt");


--
-- Name: IDX_explanation_terms; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_explanation_terms" ON "explanationTerms" USING btree ("explanationId", "termId");


--
-- Name: IDX_financial_audit_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_financial_audit_entity" ON "financialAuditLog" USING btree ("entityType", "entityId");


--
-- Name: IDX_financial_audit_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_financial_audit_timestamp" ON "financialAuditLog" USING btree ("timestamp");


--
-- Name: IDX_game_results_player_ids; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_game_results_player_ids" ON "gameResults" USING gin ("playerIds");


--
-- Name: IDX_game_results_winner_ended; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_game_results_winner_ended" ON "gameResults" USING btree ("winnerId", "gameEndedAt");


--
-- Name: IDX_gamma_image_styles_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_gamma_image_styles_active" ON "gammaImageStyles" USING btree ("isActive");


--
-- Name: IDX_gamma_image_styles_weight; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_gamma_image_styles_weight" ON "gammaImageStyles" USING btree (weight);


--
-- Name: IDX_gamma_jobs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_gamma_jobs_created" ON "pendingGammaJobs" USING btree ("createdAt");


--
-- Name: IDX_gamma_jobs_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_gamma_jobs_lesson" ON "pendingGammaJobs" USING btree ("lessonId");


--
-- Name: IDX_gamma_jobs_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_gamma_jobs_org" ON "pendingGammaJobs" USING btree ("organizationId");


--
-- Name: IDX_gamma_jobs_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_gamma_jobs_org_status" ON "pendingGammaJobs" USING btree ("organizationId", status);


--
-- Name: IDX_gamma_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_gamma_jobs_status" ON "pendingGammaJobs" USING btree (status);


--
-- Name: IDX_gamma_ledger_correlation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_gamma_ledger_correlation" ON "gammaCreditLedger" USING btree ("correlationId");


--
-- Name: IDX_gamma_ledger_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_gamma_ledger_created" ON "gammaCreditLedger" USING btree ("createdAt");


--
-- Name: IDX_gamma_ledger_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_gamma_ledger_event_type" ON "gammaCreditLedger" USING btree ("eventType");


--
-- Name: IDX_gamma_ledger_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_gamma_ledger_lesson" ON "gammaCreditLedger" USING btree ("lessonId");


--
-- Name: IDX_gamma_snapshots_captured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_gamma_snapshots_captured" ON "gammaCreditSnapshots" USING btree ("capturedAt");


--
-- Name: IDX_gamma_snapshots_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_gamma_snapshots_source" ON "gammaCreditSnapshots" USING btree (source);


--
-- Name: IDX_gamma_snapshots_variance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_gamma_snapshots_variance" ON "gammaCreditSnapshots" USING btree ("varianceFromLedger");


--
-- Name: IDX_gamma_themes_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_gamma_themes_active" ON "gammaThemes" USING btree ("isActive");


--
-- Name: IDX_gamma_themes_synced; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_gamma_themes_synced" ON "gammaThemes" USING btree ("lastSyncedAt");


--
-- Name: IDX_invoices_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_invoices_due_date" ON "subscriptionInvoices" USING btree ("dueAt");


--
-- Name: IDX_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_invoices_status" ON "subscriptionInvoices" USING btree (status);


--
-- Name: IDX_invoices_subscription; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_invoices_subscription" ON "subscriptionInvoices" USING btree ("subscriptionId");


--
-- Name: IDX_invoices_yoco; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_invoices_yoco" ON "subscriptionInvoices" USING btree ("yocoCheckoutId");


--
-- Name: IDX_join_approval_tokens_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_join_approval_tokens_request" ON "joinRequestApprovalTokens" USING btree ("joinRequestId");


--
-- Name: IDX_join_approval_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_join_approval_tokens_token" ON "joinRequestApprovalTokens" USING btree (token);


--
-- Name: IDX_join_requests_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_join_requests_org" ON "joinRequests" USING btree ("organizationId");


--
-- Name: IDX_join_requests_org_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_join_requests_org_status_created" ON "joinRequests" USING btree ("organizationId", status, "createdAt");


--
-- Name: IDX_join_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_join_requests_status" ON "joinRequests" USING btree (status);


--
-- Name: IDX_join_requests_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_join_requests_user" ON "joinRequests" USING btree ("userId");


--
-- Name: IDX_lesson_assignments_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_assignments_lesson" ON "lessonAssignments" USING btree ("lessonId");


--
-- Name: IDX_lesson_assignments_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_assignments_org" ON "lessonAssignments" USING btree ("organizationId");


--
-- Name: IDX_lesson_assignments_org_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_assignments_org_student" ON "lessonAssignments" USING btree ("organizationId", "studentId");


--
-- Name: IDX_lesson_assignments_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_assignments_student" ON "lessonAssignments" USING btree ("studentId");


--
-- Name: IDX_lesson_content_versions_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_content_versions_created" ON "lessonContentVersions" USING btree ("createdAt");


--
-- Name: IDX_lesson_content_versions_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_content_versions_lesson" ON "lessonContentVersions" USING btree ("lessonId");


--
-- Name: IDX_lesson_content_versions_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_content_versions_source" ON "lessonContentVersions" USING btree (source);


--
-- Name: IDX_lesson_presentation_versions_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_presentation_versions_created" ON "lessonPresentationVersions" USING btree ("createdAt");


--
-- Name: IDX_lesson_presentation_versions_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_presentation_versions_lesson" ON "lessonPresentationVersions" USING btree ("lessonId");


--
-- Name: IDX_lesson_progress_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_progress_lesson" ON "lessonProgress" USING btree ("lessonId");


--
-- Name: IDX_lesson_progress_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_progress_org" ON "lessonProgress" USING btree ("organizationId");


--
-- Name: IDX_lesson_progress_org_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_progress_org_user" ON "lessonProgress" USING btree ("organizationId", "userId");


--
-- Name: IDX_lesson_progress_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_progress_status" ON "lessonProgress" USING btree (status);


--
-- Name: IDX_lesson_progress_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_progress_user" ON "lessonProgress" USING btree ("userId");


--
-- Name: IDX_lesson_quiz_links_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_quiz_links_lesson" ON "lessonQuizLinks" USING btree ("lessonId");


--
-- Name: IDX_lesson_quiz_links_quiz; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_quiz_links_quiz" ON "lessonQuizLinks" USING btree ("quizId");


--
-- Name: IDX_lesson_scope_assignments_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_scope_assignments_lesson" ON "lessonScopeAssignments" USING btree ("lessonId");


--
-- Name: IDX_lesson_scope_assignments_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_scope_assignments_org" ON "lessonScopeAssignments" USING btree ("organizationId");


--
-- Name: IDX_lesson_scope_assignments_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_scope_assignments_subject" ON "lessonScopeAssignments" USING btree ("subjectId");


--
-- Name: IDX_lesson_scope_assignments_unit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_scope_assignments_unit" ON "lessonScopeAssignments" USING btree ("unitId");


--
-- Name: IDX_lesson_slides_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_slides_lesson" ON "lessonSlides" USING btree ("lessonId");


--
-- Name: IDX_lesson_slides_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_slides_version" ON "lessonSlides" USING btree ("lessonId", version);


--
-- Name: IDX_lesson_translation_jobs_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_translation_jobs_lesson" ON "lessonTranslationJobs" USING btree ("lessonId");


--
-- Name: IDX_lesson_translation_jobs_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_translation_jobs_org" ON "lessonTranslationJobs" USING btree ("organizationId");


--
-- Name: IDX_lesson_translation_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_translation_jobs_status" ON "lessonTranslationJobs" USING btree (status);


--
-- Name: IDX_lesson_versions_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_versions_created" ON "lessonVersions" USING btree ("createdAt");


--
-- Name: IDX_lesson_versions_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_versions_lesson" ON "lessonVersions" USING btree ("lessonId");


--
-- Name: IDX_lesson_versions_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lesson_versions_org" ON "lessonVersions" USING btree ("organizationId");


--
-- Name: IDX_lessons_active_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lessons_active_version" ON lessons USING btree ("activeLessonVersionId");


--
-- Name: IDX_lessons_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lessons_archived" ON lessons USING btree ("isArchived");


--
-- Name: IDX_lessons_content_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lessons_content_group" ON lessons USING btree ("contentGroupId", "languageCode");


--
-- Name: IDX_lessons_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lessons_created" ON lessons USING btree ("createdAt");


--
-- Name: IDX_lessons_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lessons_creator" ON lessons USING btree ("createdBy");


--
-- Name: IDX_lessons_generation_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lessons_generation_status" ON lessons USING btree ("generationStatus");


--
-- Name: IDX_lessons_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lessons_language" ON lessons USING btree ("languageCode");


--
-- Name: IDX_lessons_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lessons_org" ON lessons USING btree ("organizationId");


--
-- Name: IDX_lessons_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lessons_published" ON lessons USING btree ("isPublished");


--
-- Name: IDX_lessons_quiz; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lessons_quiz" ON lessons USING btree ("relatedQuizId");


--
-- Name: IDX_license_flag_audit_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_license_flag_audit_created" ON "licenseFlagAudit" USING btree ("createdAt");


--
-- Name: IDX_license_flag_audit_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_license_flag_audit_key" ON "licenseFlagAudit" USING btree ("flagKey");


--
-- Name: IDX_license_flag_audit_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_license_flag_audit_user" ON "licenseFlagAudit" USING btree ("changedBy");


--
-- Name: IDX_license_flag_overrides_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_license_flag_overrides_expires" ON "licenseFlagOverrides" USING btree ("expiresAt");


--
-- Name: IDX_license_flag_overrides_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_license_flag_overrides_key" ON "licenseFlagOverrides" USING btree ("flagKey");


--
-- Name: IDX_license_payments_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_license_payments_intent" ON "licensePayments" USING btree ("paymentIntentId");


--
-- Name: IDX_license_payments_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_license_payments_org" ON "licensePayments" USING btree ("organizationId");


--
-- Name: IDX_license_payments_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_license_payments_period" ON "licensePayments" USING btree ("billingPeriodStart");


--
-- Name: IDX_license_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_license_payments_status" ON "licensePayments" USING btree (status);


--
-- Name: IDX_license_rollout_beta_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_license_rollout_beta_user" ON "licenseRolloutBetaUsers" USING btree ("userId");


--
-- Name: IDX_license_rollout_orgs_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_license_rollout_orgs_org" ON "licenseRolloutOrganizations" USING btree ("organizationId");


--
-- Name: IDX_login_streaks_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_login_streaks_user" ON "loginStreaks" USING btree ("userId");


--
-- Name: IDX_lp_ledger_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lp_ledger_created" ON "lpCreditLedger" USING btree ("createdAt");


--
-- Name: IDX_lp_ledger_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lp_ledger_org" ON "lpCreditLedger" USING btree ("organizationId");


--
-- Name: IDX_lp_ledger_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lp_ledger_type" ON "lpCreditLedger" USING btree ("transactionType");


--
-- Name: IDX_lp_ledger_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_lp_ledger_user_created" ON "lpCreditLedger" USING btree ("userId", "createdAt");


--
-- Name: IDX_org_bank_details_org; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_org_bank_details_org" ON "organizationBankDetails" USING btree ("organizationId");


--
-- Name: IDX_org_ledger_activity_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_org_ledger_activity_type" ON "orgCreditLedger" USING btree ("activityType");


--
-- Name: IDX_org_ledger_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_org_ledger_actor" ON "orgCreditLedger" USING btree ("actorUserId");


--
-- Name: IDX_org_ledger_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_org_ledger_created" ON "orgCreditLedger" USING btree ("createdAt");


--
-- Name: IDX_org_ledger_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_org_ledger_org_created" ON "orgCreditLedger" USING btree ("organizationId", "createdAt");


--
-- Name: IDX_org_ledger_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_org_ledger_type" ON "orgCreditLedger" USING btree ("transactionType");


--
-- Name: IDX_org_license_settings_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_org_license_settings_org" ON "organizationLicenseSettings" USING btree ("organizationId");


--
-- Name: IDX_org_license_settings_trial; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_org_license_settings_trial" ON "organizationLicenseSettings" USING btree ("trialEndsAt");


--
-- Name: IDX_org_licenses_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_org_licenses_org" ON "organizationLicenses" USING btree ("organizationId");


--
-- Name: IDX_org_licenses_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_org_licenses_status" ON "organizationLicenses" USING btree (status);


--
-- Name: IDX_org_licenses_term_end; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_org_licenses_term_end" ON "organizationLicenses" USING btree ("currentTermEnd");


--
-- Name: IDX_org_licenses_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_org_licenses_tier" ON "organizationLicenses" USING btree (tier);


--
-- Name: IDX_org_package_next_billing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_org_package_next_billing" ON "organizationPackageAssignments" USING btree ("nextBillingDate");


--
-- Name: IDX_org_package_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_org_package_org" ON "organizationPackageAssignments" USING btree ("organizationId");


--
-- Name: IDX_org_package_package; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_org_package_package" ON "organizationPackageAssignments" USING btree ("packageId");


--
-- Name: IDX_org_package_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_org_package_status" ON "organizationPackageAssignments" USING btree (status);


--
-- Name: IDX_org_usage_limits; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_org_usage_limits" ON "organizationUsageLimits" USING btree ("organizationId");


--
-- Name: IDX_organization_subunit_join_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_organization_subunit_join_code" ON "organizationSubUnits" USING btree ("joinCode");


--
-- Name: IDX_organization_team_join_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_organization_team_join_code" ON "organizationTeams" USING btree ("joinCode");


--
-- Name: IDX_organization_team_subunit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_organization_team_subunit" ON "organizationTeams" USING btree ("subUnitId");


--
-- Name: IDX_organization_unit_join_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_organization_unit_join_code" ON "organizationUnits" USING btree ("joinCode");


--
-- Name: IDX_package_events_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_package_events_date" ON "packageChangeEvents" USING btree ("createdAt");


--
-- Name: IDX_package_events_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_package_events_org" ON "packageChangeEvents" USING btree ("organizationId");


--
-- Name: IDX_package_events_package; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_package_events_package" ON "packageChangeEvents" USING btree ("packageId");


--
-- Name: IDX_package_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_package_events_type" ON "packageChangeEvents" USING btree ("changeType");


--
-- Name: IDX_payment_fulfillments_checkout; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_payment_fulfillments_checkout" ON "paymentFulfillments" USING btree ("checkoutId");


--
-- Name: IDX_payment_fulfillments_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_payment_fulfillments_intent" ON "paymentFulfillments" USING btree ("paymentIntentId");


--
-- Name: IDX_payment_fulfillments_type_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_payment_fulfillments_type_intent" ON "paymentFulfillments" USING btree ("intentType", "intentId");


--
-- Name: IDX_payment_intents_checkout; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_payment_intents_checkout" ON "paymentIntents" USING btree ("checkoutId");


--
-- Name: IDX_payment_intents_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_payment_intents_created" ON "paymentIntents" USING btree ("createdAt");


--
-- Name: IDX_payment_intents_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_payment_intents_intent" ON "paymentIntents" USING btree ("intentId");


--
-- Name: IDX_payment_intents_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_payment_intents_status" ON "paymentIntents" USING btree (status);


--
-- Name: IDX_payment_intents_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_payment_intents_type" ON "paymentIntents" USING btree ("intentType");


--
-- Name: IDX_payment_intents_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_payment_intents_user" ON "paymentIntents" USING btree ("userId");


--
-- Name: IDX_payment_transactions_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_payment_transactions_course" ON "paymentTransactions" USING btree ("courseId");


--
-- Name: IDX_payment_transactions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_payment_transactions_status" ON "paymentTransactions" USING btree (status);


--
-- Name: IDX_payment_transactions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_payment_transactions_user" ON "paymentTransactions" USING btree ("userId");


--
-- Name: IDX_payout_batches_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_payout_batches_org" ON "payoutBatches" USING btree ("organizationId");


--
-- Name: IDX_payout_batches_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_payout_batches_period" ON "payoutBatches" USING btree ("periodEnd");


--
-- Name: IDX_payout_batches_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_payout_batches_status" ON "payoutBatches" USING btree (status);


--
-- Name: IDX_payout_disbursements_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_payout_disbursements_org" ON "payoutDisbursements" USING btree ("organizationId");


--
-- Name: IDX_payout_disbursements_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_payout_disbursements_period" ON "payoutDisbursements" USING btree ("periodEnd");


--
-- Name: IDX_payout_disbursements_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_payout_disbursements_status" ON "payoutDisbursements" USING btree (status);


--
-- Name: IDX_payout_transactions_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_payout_transactions_batch" ON "payoutTransactions" USING btree ("payoutBatchId");


--
-- Name: IDX_payout_transactions_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_payout_transactions_course" ON "payoutTransactions" USING btree ("courseId");


--
-- Name: IDX_platform_config_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_platform_config_key" ON "platformConfiguration" USING btree (key);


--
-- Name: IDX_platform_revenue_reports_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_platform_revenue_reports_date" ON "platformRevenueReports" USING btree ("reportDate");


--
-- Name: IDX_platform_revenue_reports_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_platform_revenue_reports_type" ON "platformRevenueReports" USING btree ("organizationType");


--
-- Name: IDX_player_season_rewards_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_player_season_rewards_config" ON "playerSeasonRewards" USING btree ("seasonPassConfigId");


--
-- Name: IDX_player_season_rewards_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_player_season_rewards_user" ON "playerSeasonRewards" USING btree ("userId");


--
-- Name: IDX_post_fulfillment_jobs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_post_fulfillment_jobs_created" ON "postFulfillmentJobs" USING btree ("createdAt");


--
-- Name: IDX_post_fulfillment_jobs_next_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_post_fulfillment_jobs_next_retry" ON "postFulfillmentJobs" USING btree ("nextRetryAt");


--
-- Name: IDX_post_fulfillment_jobs_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_post_fulfillment_jobs_order" ON "postFulfillmentJobs" USING btree ("orderId");


--
-- Name: IDX_post_fulfillment_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_post_fulfillment_jobs_status" ON "postFulfillmentJobs" USING btree (status);


--
-- Name: IDX_post_fulfillment_jobs_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_post_fulfillment_jobs_type" ON "postFulfillmentJobs" USING btree ("jobType");


--
-- Name: IDX_powerup_inventory_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_powerup_inventory_user" ON "powerUpInventory" USING btree ("userId");


--
-- Name: IDX_quiz_assignments; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_quiz_assignments" ON "quizCollectionAssignments" USING btree ("collectionId");


--
-- Name: IDX_quiz_card_explanations_card; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_quiz_card_explanations_card" ON "quizCardExplanations" USING btree ("cardId");


--
-- Name: IDX_quiz_card_versions_card; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_quiz_card_versions_card" ON "quizCardVersions" USING btree ("cardId");


--
-- Name: IDX_quiz_card_versions_collection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_quiz_card_versions_collection" ON "quizCardVersions" USING btree ("collectionId");


--
-- Name: IDX_quiz_card_versions_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_quiz_card_versions_number" ON "quizCardVersions" USING btree ("cardId", "versionNumber");


--
-- Name: IDX_quiz_collection_versions_collection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_quiz_collection_versions_collection" ON "quizCollectionVersions" USING btree ("collectionId");


--
-- Name: IDX_quiz_collection_versions_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_quiz_collection_versions_number" ON "quizCollectionVersions" USING btree ("collectionId", "versionNumber");


--
-- Name: IDX_quiz_collection_versions_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_quiz_collection_versions_org" ON "quizCollectionVersions" USING btree ("organizationId");


--
-- Name: IDX_quiz_collections_content_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_quiz_collections_content_group" ON "quizCollections" USING btree ("contentGroupId", "languageCode");


--
-- Name: IDX_quiz_collections_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_quiz_collections_language" ON "quizCollections" USING btree ("languageCode");


--
-- Name: IDX_quiz_collections_org_deleted_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_quiz_collections_org_deleted_created" ON "quizCollections" USING btree ("organizationId", "isDeleted", "createdAt");


--
-- Name: IDX_quiz_drafts_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_quiz_drafts_creator" ON "quizDrafts" USING btree ("createdBy");


--
-- Name: IDX_quiz_drafts_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_quiz_drafts_lesson" ON "quizDrafts" USING btree ("lessonId");


--
-- Name: IDX_quiz_drafts_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_quiz_drafts_org" ON "quizDrafts" USING btree ("organizationId");


--
-- Name: IDX_quiz_progress; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_quiz_progress" ON "quizGameProgress" USING btree ("userId", "collectionId");


--
-- Name: IDX_quiz_results_collection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_quiz_results_collection" ON "quizGameResults" USING btree ("collectionId");


--
-- Name: IDX_quiz_results_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_quiz_results_player" ON "quizGameResults" USING btree ("player1Id");


--
-- Name: IDX_review_moderation_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_review_moderation_created" ON "reviewModerationActions" USING btree ("createdAt");


--
-- Name: IDX_review_moderation_moderator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_review_moderation_moderator" ON "reviewModerationActions" USING btree ("moderatorId");


--
-- Name: IDX_review_moderation_review; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_review_moderation_review" ON "reviewModerationActions" USING btree ("reviewId");


--
-- Name: IDX_sales_inquiries_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_sales_inquiries_created" ON "salesInquiries" USING btree ("createdAt");


--
-- Name: IDX_season_config_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_season_config_active" ON "seasonPassConfig" USING btree (scope, "organizationId", "isActive");


--
-- Name: IDX_season_config_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_season_config_org" ON "seasonPassConfig" USING btree ("organizationId");


--
-- Name: IDX_season_config_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_season_config_scope" ON "seasonPassConfig" USING btree (scope);


--
-- Name: IDX_season_config_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_season_config_status" ON "seasonPassConfig" USING btree (status);


--
-- Name: IDX_season_pass_purchases_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_season_pass_purchases_active" ON "seasonPassPurchases" USING btree ("isActive");


--
-- Name: IDX_season_pass_purchases_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_season_pass_purchases_config" ON "seasonPassPurchases" USING btree ("seasonPassConfigId");


--
-- Name: IDX_season_pass_purchases_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_season_pass_purchases_user" ON "seasonPassPurchases" USING btree ("userId");


--
-- Name: IDX_season_progress_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_season_progress_config" ON "seasonPassProgress" USING btree ("seasonPassConfigId");


--
-- Name: IDX_season_progress_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_season_progress_user" ON "seasonPassProgress" USING btree ("userId");


--
-- Name: IDX_season_tiers_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_season_tiers_config" ON "seasonPassTiers" USING btree ("seasonPassConfigId", tier);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions USING btree (expire);


--
-- Name: IDX_shop_pricing_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_shop_pricing_org" ON "shopItemPricing" USING btree ("organizationId");


--
-- Name: IDX_shop_pricing_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_shop_pricing_scope" ON "shopItemPricing" USING btree (scope);


--
-- Name: IDX_sub_events_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_sub_events_created" ON "subscriptionEvents" USING btree ("createdAt");


--
-- Name: IDX_sub_events_subscription; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_sub_events_subscription" ON "subscriptionEvents" USING btree ("subscriptionId");


--
-- Name: IDX_sub_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_sub_events_type" ON "subscriptionEvents" USING btree ("eventType");


--
-- Name: IDX_subjects_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_subjects_org" ON subjects USING btree ("organizationId");


--
-- Name: IDX_subscriptions_cancel_at_period_end; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_subscriptions_cancel_at_period_end" ON subscriptions USING btree ("cancelAtPeriodEnd");


--
-- Name: IDX_subscriptions_next_billing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_subscriptions_next_billing" ON subscriptions USING btree ("nextBillingDate");


--
-- Name: IDX_subscriptions_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_subscriptions_plan" ON subscriptions USING btree ("planId");


--
-- Name: IDX_subscriptions_scheduled_seat_release; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_subscriptions_scheduled_seat_release" ON subscriptions USING btree ("scheduledSeatReleaseAt");


--
-- Name: IDX_subscriptions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_subscriptions_status" ON subscriptions USING btree (status);


--
-- Name: IDX_subscriptions_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_subscriptions_target" ON subscriptions USING btree ("targetType", "targetId");


--
-- Name: IDX_term_definitions_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_term_definitions_subject" ON "termDefinitions" USING btree ("subjectId");


--
-- Name: IDX_term_definitions_term; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_term_definitions_term" ON "termDefinitions" USING btree (term);


--
-- Name: IDX_unit_subjects; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_unit_subjects" ON "unitSubjects" USING btree ("unitId", "subjectId");


--
-- Name: IDX_user_adjustments_allocation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_user_adjustments_allocation" ON "userCreditAdjustments" USING btree ("allocationId");


--
-- Name: IDX_user_adjustments_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_user_adjustments_created" ON "userCreditAdjustments" USING btree ("createdAt");


--
-- Name: IDX_user_adjustments_requested; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_user_adjustments_requested" ON "userCreditAdjustments" USING btree ("requestedBy");


--
-- Name: IDX_user_adjustments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_user_adjustments_status" ON "userCreditAdjustments" USING btree (status);


--
-- Name: IDX_user_cosmetic_loadouts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_user_cosmetic_loadouts_user" ON "userCosmeticLoadouts" USING btree ("userId");


--
-- Name: IDX_user_course_enrollments_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_user_course_enrollments_course" ON "userCourseEnrollments" USING btree ("courseId");


--
-- Name: IDX_user_course_enrollments_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_user_course_enrollments_user" ON "userCourseEnrollments" USING btree ("userId");


--
-- Name: IDX_user_course_lesson_progress_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_user_course_lesson_progress_course" ON "userCourseLessonProgress" USING btree ("courseId");


--
-- Name: IDX_user_course_lesson_progress_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_user_course_lesson_progress_lesson" ON "userCourseLessonProgress" USING btree ("lessonId");


--
-- Name: IDX_user_course_lesson_progress_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_user_course_lesson_progress_user" ON "userCourseLessonProgress" USING btree ("userId");


--
-- Name: IDX_user_credits_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_user_credits_status" ON "userCreditAllocations" USING btree (status);


--
-- Name: IDX_user_licenses_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_user_licenses_expires" ON "userLicenses" USING btree ("expiresAt");


--
-- Name: IDX_user_licenses_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_user_licenses_org" ON "userLicenses" USING btree ("organizationId");


--
-- Name: IDX_user_licenses_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_user_licenses_status" ON "userLicenses" USING btree (status);


--
-- Name: IDX_user_licenses_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_user_licenses_user" ON "userLicenses" USING btree ("userId");


--
-- Name: IDX_user_notifications_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_user_notifications_created" ON "userNotifications" USING btree ("createdAt");


--
-- Name: IDX_user_notifications_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_user_notifications_read" ON "userNotifications" USING btree ("isRead");


--
-- Name: IDX_user_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_user_notifications_user" ON "userNotifications" USING btree ("userId");


--
-- Name: IDX_user_org_assignments; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_user_org_assignments" ON "userOrganizationAssignments" USING btree ("userId", "organizationId");


--
-- Name: IDX_user_org_assignments_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_user_org_assignments_team" ON "userOrganizationAssignments" USING btree ("teamId");


--
-- Name: IDX_user_org_roles; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_user_org_roles" ON "userOrganizationRoles" USING btree ("userId", "organizationId");


--
-- Name: IDX_user_quiz_progress; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_user_quiz_progress" ON "userQuizProgress" USING btree ("userId", "collectionId");


--
-- Name: IDX_webhook_events_checkout; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_webhook_events_checkout" ON "paymentWebhookEvents" USING btree ("checkoutId");


--
-- Name: IDX_webhook_events_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_webhook_events_created" ON "paymentWebhookEvents" USING btree ("createdAt");


--
-- Name: IDX_webhook_events_expiresAt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_webhook_events_expiresAt" ON "webhookEvents" USING btree ("expiresAt");


--
-- Name: IDX_webhook_events_processed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_webhook_events_processed" ON "paymentWebhookEvents" USING btree ("processedAt");


--
-- Name: IDX_webhook_events_received; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_webhook_events_received" ON "webhookEvents" USING btree ("receivedAt");


--
-- Name: IDX_webhook_events_source_eventId; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_webhook_events_source_eventId" ON "webhookEvents" USING btree (source, "eventId");


--
-- Name: IDX_webhook_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_webhook_events_type" ON "paymentWebhookEvents" USING btree ("eventType");


--
-- Name: IDX_webhook_registrations_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_webhook_registrations_active" ON "webhookRegistrations" USING btree ("isActive");


--
-- Name: IDX_webhook_registrations_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "IDX_webhook_registrations_mode" ON "webhookRegistrations" USING btree (mode);


--
-- Name: UNQ_active_job_per_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_active_job_per_lesson" ON "pendingGammaJobs" USING btree ("lessonId") WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'claimed'::character varying, 'polling'::character varying])::text[]));


--
-- Name: UNQ_course_draft_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_course_draft_active" ON "courseDrafts" USING btree ("originalCourseId");


--
-- Name: UNQ_course_framework; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_course_framework" ON "courseFrameworks" USING btree ("courseId");


--
-- Name: UNQ_course_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_course_lesson" ON "courseLessons" USING btree ("courseId", "lessonId");


--
-- Name: UNQ_course_progress_user_course; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_course_progress_user_course" ON "courseProgress" USING btree ("userId", "courseId", "organizationId");


--
-- Name: UNQ_lesson_quiz_link; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_lesson_quiz_link" ON "lessonQuizLinks" USING btree ("lessonId", "quizId");


--
-- Name: UNQ_lesson_scope_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_lesson_scope_assignment" ON "lessonScopeAssignments" USING btree ("lessonId", "organizationId", audience, "unitId", "subjectId") NULLS NOT DISTINCT;


--
-- Name: UNQ_lesson_student_org_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_lesson_student_org_assignment" ON "lessonAssignments" USING btree ("lessonId", "studentId", "organizationId");


--
-- Name: UNQ_license_payment_period; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_license_payment_period" ON "licensePayments" USING btree ("organizationId", "billingPeriodStart");


--
-- Name: UNQ_org_banking; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_org_banking" ON "organizationBankingDetails" USING btree ("organizationId");


--
-- Name: UNQ_org_credit_allocation; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_org_credit_allocation" ON "creditAllocations" USING btree ("organizationId");


--
-- Name: UNQ_payment_checkout; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_payment_checkout" ON "paymentTransactions" USING btree ("checkoutId");


--
-- Name: UNQ_post_fulfillment_job_order_type; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_post_fulfillment_job_order_type" ON "postFulfillmentJobs" USING btree ("orderId", "jobType");


--
-- Name: UNQ_quiz_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_quiz_assignment" ON "quizCollectionAssignments" USING btree ("collectionId", "unitId", "subUnitId", "subjectId");


--
-- Name: UNQ_cosmeticCatalog_name_type; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_cosmeticCatalog_name_type" ON "cosmeticCatalog" USING btree (name, type);


--
-- Name: UNQ_powerUpCatalog_name_type; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_powerUpCatalog_name_type" ON "powerUpCatalog" USING btree (name, type);


--
-- Name: UNQ_user_course_cert; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_user_course_cert" ON certificates USING btree ("userId", "courseId") WHERE ("courseId" IS NOT NULL);


--
-- Name: UNQ_user_course_purchase; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_user_course_purchase" ON "coursePurchases" USING btree ("userId", "courseId");


--
-- Name: UNQ_user_course_review; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_user_course_review" ON "courseReviews" USING btree ("courseId", "userId");


--
-- Name: UNQ_user_org_license; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_user_org_license" ON "userLicenses" USING btree ("userId", "organizationId");


--
-- Name: UNQ_user_version_upgrade; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_user_version_upgrade" ON "courseVersionUpgrades" USING btree ("userId", "courseId", "toVersionId");


--
-- Name: UNQ_webhook_event; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "UNQ_webhook_event" ON "paymentWebhookEvents" USING btree ("eventId");


--
-- Name: subscriptionInvoices_subscriptionId_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS "subscriptionInvoices_subscriptionId_unique" ON "subscriptionInvoices" USING btree ("subscriptionId") WHERE ("subscriptionId" IS NOT NULL);


--
-- Name: unique_active_per_purpose; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_per_purpose ON "aiConfig" USING btree (purpose) WHERE ("isActive" = true);


--
-- Name: unique_lesson_progress_slide; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS unique_lesson_progress_slide ON "lessonProgressSlides" USING btree ("lessonProgressId", "slideIndex");


--
-- Name: activeOneVOneGames activeOneVOneGames_collectionId_cardCollections_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "activeOneVOneGames"
    ADD CONSTRAINT "activeOneVOneGames_collectionId_cardCollections_id_fk" FOREIGN KEY ("collectionId") REFERENCES "cardCollections"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activeQuizGames activeQuizGames_collectionId_quizCollections_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "activeQuizGames"
    ADD CONSTRAINT "activeQuizGames_collectionId_quizCollections_id_fk" FOREIGN KEY ("collectionId") REFERENCES "quizCollections"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: aiConfig aiConfig_createdBy_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "aiConfig"
    ADD CONSTRAINT "aiConfig_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: brandingThemes brandingThemes_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "brandingThemes"
    ADD CONSTRAINT "brandingThemes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: bulkQuizGenerationJobs bulkQuizGenerationJobs_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "bulkQuizGenerationJobs"
    ADD CONSTRAINT "bulkQuizGenerationJobs_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES courses(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: bulkQuizGenerationJobs bulkQuizGenerationJobs_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "bulkQuizGenerationJobs"
    ADD CONSTRAINT "bulkQuizGenerationJobs_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: bulkQuizGenerationJobs bulkQuizGenerationJobs_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "bulkQuizGenerationJobs"
    ADD CONSTRAINT "bulkQuizGenerationJobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: businessPackagePrices businessPackagePrices_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "businessPackagePrices"
    ADD CONSTRAINT "businessPackagePrices_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: businessPackagePrices businessPackagePrices_packageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "businessPackagePrices"
    ADD CONSTRAINT "businessPackagePrices_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "businessPackages"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: businessPackagePrices businessPackagePrices_updatedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "businessPackagePrices"
    ADD CONSTRAINT "businessPackagePrices_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: businessPackages businessPackages_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "businessPackages"
    ADD CONSTRAINT "businessPackages_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: businessPackages businessPackages_updatedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "businessPackages"
    ADD CONSTRAINT "businessPackages_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: cardStats cardStats_cardId_cards_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "cardStats"
    ADD CONSTRAINT "cardStats_cardId_cards_id_fk" FOREIGN KEY ("cardId") REFERENCES cards(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: cardStats cardStats_statTypeId_collectionStatTypes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "cardStats"
    ADD CONSTRAINT "cardStats_statTypeId_collectionStatTypes_id_fk" FOREIGN KEY ("statTypeId") REFERENCES "collectionStatTypes"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: cards cards_collectionId_cardCollections_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY cards
    ADD CONSTRAINT "cards_collectionId_cardCollections_id_fk" FOREIGN KEY ("collectionId") REFERENCES "cardCollections"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: certificates certificates_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY certificates
    ADD CONSTRAINT "certificates_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES courses(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: challengeProgress challengeProgress_userId_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "challengeProgress"
    ADD CONSTRAINT "challengeProgress_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: challengeTemplates challengeTemplates_powerUpReward_powerUpCatalog_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "challengeTemplates"
    ADD CONSTRAINT "challengeTemplates_powerUpReward_powerUpCatalog_id_fk" FOREIGN KEY ("powerUpReward") REFERENCES "powerUpCatalog"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: coinTransactions coinTransactions_userId_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "coinTransactions"
    ADD CONSTRAINT "coinTransactions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: collectionStatTypes collectionStatTypes_collectionId_cardCollections_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "collectionStatTypes"
    ADD CONSTRAINT "collectionStatTypes_collectionId_cardCollections_id_fk" FOREIGN KEY ("collectionId") REFERENCES "cardCollections"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: collectionStatTypes collectionStatTypes_universalUnitId_universalStatUnits_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "collectionStatTypes"
    ADD CONSTRAINT "collectionStatTypes_universalUnitId_universalStatUnits_id_fk" FOREIGN KEY ("universalUnitId") REFERENCES "universalStatUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contentTranslationJobs contentTranslationJobs_initiatedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "contentTranslationJobs"
    ADD CONSTRAINT "contentTranslationJobs_initiatedBy_fkey" FOREIGN KEY ("initiatedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contentTranslationJobs contentTranslationJobs_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "contentTranslationJobs"
    ADD CONSTRAINT "contentTranslationJobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contentTranslationJobs contentTranslationJobs_sourceCourseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "contentTranslationJobs"
    ADD CONSTRAINT "contentTranslationJobs_sourceCourseId_fkey" FOREIGN KEY ("sourceCourseId") REFERENCES courses(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contentTranslationJobs contentTranslationJobs_translatedCourseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "contentTranslationJobs"
    ADD CONSTRAINT "contentTranslationJobs_translatedCourseId_fkey" FOREIGN KEY ("translatedCourseId") REFERENCES courses(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseAssignments courseAssignments_assignedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseAssignments"
    ADD CONSTRAINT "courseAssignments_assignedBy_fkey" FOREIGN KEY ("assignedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseAssignments courseAssignments_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseAssignments"
    ADD CONSTRAINT "courseAssignments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES courses(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseAssignments courseAssignments_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseAssignments"
    ADD CONSTRAINT "courseAssignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseAssignments courseAssignments_subUnitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseAssignments"
    ADD CONSTRAINT "courseAssignments_subUnitId_fkey" FOREIGN KEY ("subUnitId") REFERENCES "organizationSubUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseAssignments courseAssignments_teamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseAssignments"
    ADD CONSTRAINT "courseAssignments_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "organizationTeams"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseAssignments courseAssignments_unitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseAssignments"
    ADD CONSTRAINT "courseAssignments_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "organizationUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseAssignments courseAssignments_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseAssignments"
    ADD CONSTRAINT "courseAssignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseCategories courseCategories_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseCategories"
    ADD CONSTRAINT "courseCategories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseDraftDocuments courseDraftDocuments_draftId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseDraftDocuments"
    ADD CONSTRAINT "courseDraftDocuments_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "courseDraftFrameworks"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseDraftFrameworks courseDraftFrameworks_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseDraftFrameworks"
    ADD CONSTRAINT "courseDraftFrameworks_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseDraftFrameworks courseDraftFrameworks_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseDraftFrameworks"
    ADD CONSTRAINT "courseDraftFrameworks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseDraftFrameworks courseDraftFrameworks_publishedCourseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseDraftFrameworks"
    ADD CONSTRAINT "courseDraftFrameworks_publishedCourseId_fkey" FOREIGN KEY ("publishedCourseId") REFERENCES courses(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseDrafts courseDrafts_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseDrafts"
    ADD CONSTRAINT "courseDrafts_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseDrafts courseDrafts_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseDrafts"
    ADD CONSTRAINT "courseDrafts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseDrafts courseDrafts_originalCourseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseDrafts"
    ADD CONSTRAINT "courseDrafts_originalCourseId_fkey" FOREIGN KEY ("originalCourseId") REFERENCES courses(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseFrameworks courseFrameworks_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseFrameworks"
    ADD CONSTRAINT "courseFrameworks_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES courses(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseFrameworks courseFrameworks_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseFrameworks"
    ADD CONSTRAINT "courseFrameworks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseLessons courseLessons_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseLessons"
    ADD CONSTRAINT "courseLessons_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES courses(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseLessons courseLessons_lessonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseLessons"
    ADD CONSTRAINT "courseLessons_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES lessons(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseLessons courseLessons_primaryQuizId_quizCollections_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseLessons"
    ADD CONSTRAINT "courseLessons_primaryQuizId_quizCollections_id_fk" FOREIGN KEY ("primaryQuizId") REFERENCES "quizCollections"(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: coursePriceHistory coursePriceHistory_changedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "coursePriceHistory"
    ADD CONSTRAINT "coursePriceHistory_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: coursePriceHistory coursePriceHistory_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "coursePriceHistory"
    ADD CONSTRAINT "coursePriceHistory_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES courses(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseProgress courseProgress_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseProgress"
    ADD CONSTRAINT "courseProgress_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES courses(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseProgress courseProgress_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseProgress"
    ADD CONSTRAINT "courseProgress_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseProgress courseProgress_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseProgress"
    ADD CONSTRAINT "courseProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: coursePurchases coursePurchases_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "coursePurchases"
    ADD CONSTRAINT "coursePurchases_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES courses(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: coursePurchases coursePurchases_courseVersionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "coursePurchases"
    ADD CONSTRAINT "coursePurchases_courseVersionId_fkey" FOREIGN KEY ("courseVersionId") REFERENCES "courseVersions"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: coursePurchases coursePurchases_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "coursePurchases"
    ADD CONSTRAINT "coursePurchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseRatings courseRatings_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseRatings"
    ADD CONSTRAINT "courseRatings_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES courses(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseRatings courseRatings_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseRatings"
    ADD CONSTRAINT "courseRatings_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseRefunds courseRefunds_courseId_courses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseRefunds"
    ADD CONSTRAINT "courseRefunds_courseId_courses_id_fk" FOREIGN KEY ("courseId") REFERENCES courses(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseRefunds courseRefunds_decidedBy_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseRefunds"
    ADD CONSTRAINT "courseRefunds_decidedBy_users_id_fk" FOREIGN KEY ("decidedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseRefunds courseRefunds_organizationId_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseRefunds"
    ADD CONSTRAINT "courseRefunds_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseRefunds courseRefunds_purchaseId_coursePurchases_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseRefunds"
    ADD CONSTRAINT "courseRefunds_purchaseId_coursePurchases_id_fk" FOREIGN KEY ("purchaseId") REFERENCES "coursePurchases"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseRefunds courseRefunds_userId_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseRefunds"
    ADD CONSTRAINT "courseRefunds_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseReviews courseReviews_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseReviews"
    ADD CONSTRAINT "courseReviews_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES courses(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseReviews courseReviews_moderatedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseReviews"
    ADD CONSTRAINT "courseReviews_moderatedBy_fkey" FOREIGN KEY ("moderatedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseReviews courseReviews_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseReviews"
    ADD CONSTRAINT "courseReviews_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseReviews courseReviews_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseReviews"
    ADD CONSTRAINT "courseReviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseTags courseTags_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseTags"
    ADD CONSTRAINT "courseTags_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES courses(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseTags courseTags_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseTags"
    ADD CONSTRAINT "courseTags_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseUpgradeOrders courseUpgradeOrders_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseUpgradeOrders"
    ADD CONSTRAINT "courseUpgradeOrders_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES courses(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseUpgradeOrders courseUpgradeOrders_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseUpgradeOrders"
    ADD CONSTRAINT "courseUpgradeOrders_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseUpgradeOrders courseUpgradeOrders_versionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseUpgradeOrders"
    ADD CONSTRAINT "courseUpgradeOrders_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "courseVersions"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseVersionNotifications courseVersionNotifications_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseVersionNotifications"
    ADD CONSTRAINT "courseVersionNotifications_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES courses(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseVersionNotifications courseVersionNotifications_newVersionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseVersionNotifications"
    ADD CONSTRAINT "courseVersionNotifications_newVersionId_fkey" FOREIGN KEY ("newVersionId") REFERENCES "courseVersions"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseVersionNotifications courseVersionNotifications_oldVersionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseVersionNotifications"
    ADD CONSTRAINT "courseVersionNotifications_oldVersionId_fkey" FOREIGN KEY ("oldVersionId") REFERENCES "courseVersions"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseVersionNotifications courseVersionNotifications_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseVersionNotifications"
    ADD CONSTRAINT "courseVersionNotifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseVersionUpgrades courseVersionUpgrades_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseVersionUpgrades"
    ADD CONSTRAINT "courseVersionUpgrades_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES courses(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseVersionUpgrades courseVersionUpgrades_fromVersionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseVersionUpgrades"
    ADD CONSTRAINT "courseVersionUpgrades_fromVersionId_fkey" FOREIGN KEY ("fromVersionId") REFERENCES "courseVersions"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseVersionUpgrades courseVersionUpgrades_toVersionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseVersionUpgrades"
    ADD CONSTRAINT "courseVersionUpgrades_toVersionId_fkey" FOREIGN KEY ("toVersionId") REFERENCES "courseVersions"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseVersionUpgrades courseVersionUpgrades_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseVersionUpgrades"
    ADD CONSTRAINT "courseVersionUpgrades_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courseVersions courseVersions_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "courseVersions"
    ADD CONSTRAINT "courseVersions_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES courses(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courses courses_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY courses
    ADD CONSTRAINT "courses_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courses courses_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY courses
    ADD CONSTRAINT "courses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courses courses_subUnitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY courses
    ADD CONSTRAINT "courses_subUnitId_fkey" FOREIGN KEY ("subUnitId") REFERENCES "organizationSubUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courses courses_teamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY courses
    ADD CONSTRAINT "courses_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "organizationTeams"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: courses courses_unitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY courses
    ADD CONSTRAINT "courses_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "organizationUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: creditAllocations creditAllocations_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "creditAllocations"
    ADD CONSTRAINT "creditAllocations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: creditOrders creditOrders_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "creditOrders"
    ADD CONSTRAINT "creditOrders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: creditOrders creditOrders_packageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "creditOrders"
    ADD CONSTRAINT "creditOrders_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "creditPurchasePackages"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: creditOrders creditOrders_paymentIntentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "creditOrders"
    ADD CONSTRAINT "creditOrders_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "paymentIntents"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: creditOrders creditOrders_purchaserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "creditOrders"
    ADD CONSTRAINT "creditOrders_purchaserId_fkey" FOREIGN KEY ("purchaserId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: creditPurchasePackages creditPurchasePackages_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "creditPurchasePackages"
    ADD CONSTRAINT "creditPurchasePackages_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: creditPurchasePackages creditPurchasePackages_updatedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "creditPurchasePackages"
    ADD CONSTRAINT "creditPurchasePackages_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: creditTransactions creditTransactions_quizId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "creditTransactions"
    ADD CONSTRAINT "creditTransactions_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizCollections"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: creditUsageLogs creditUsageLogs_lessonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "creditUsageLogs"
    ADD CONSTRAINT "creditUsageLogs_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES lessons(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: creditUsageLogs creditUsageLogs_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "creditUsageLogs"
    ADD CONSTRAINT "creditUsageLogs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: creditUsageLogs creditUsageLogs_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "creditUsageLogs"
    ADD CONSTRAINT "creditUsageLogs_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: currencyConversionRates currencyConversionRates_updatedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "currencyConversionRates"
    ADD CONSTRAINT "currencyConversionRates_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: dailyStreaks dailyStreaks_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "dailyStreaks"
    ADD CONSTRAINT "dailyStreaks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: dailyStreaks dailyStreaks_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "dailyStreaks"
    ADD CONSTRAINT "dailyStreaks_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: emailLogs emailLogs_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "emailLogs"
    ADD CONSTRAINT "emailLogs_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "subscriptionInvoices"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: emailLogs emailLogs_subscriptionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "emailLogs"
    ADD CONSTRAINT "emailLogs_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES subscriptions(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: explanationTerms explanationTerms_explanationId_quizCardExplanations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "explanationTerms"
    ADD CONSTRAINT "explanationTerms_explanationId_quizCardExplanations_id_fk" FOREIGN KEY ("explanationId") REFERENCES "quizCardExplanations"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: explanationTerms explanationTerms_termId_termDefinitions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "explanationTerms"
    ADD CONSTRAINT "explanationTerms_termId_termDefinitions_id_fk" FOREIGN KEY ("termId") REFERENCES "termDefinitions"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: financialAuditLog financialAuditLog_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "financialAuditLog"
    ADD CONSTRAINT "financialAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: creditTransactions fk_creditTransactions_allocationId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "creditTransactions"
    ADD CONSTRAINT "fk_creditTransactions_allocationId" FOREIGN KEY ("allocationId") REFERENCES "userCreditAllocations"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: gameResults gameResults_collectionId_cardCollections_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "gameResults"
    ADD CONSTRAINT "gameResults_collectionId_cardCollections_id_fk" FOREIGN KEY ("collectionId") REFERENCES "cardCollections"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: gameResults gameResults_gameRoomId_gameRooms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "gameResults"
    ADD CONSTRAINT "gameResults_gameRoomId_gameRooms_id_fk" FOREIGN KEY ("gameRoomId") REFERENCES "gameRooms"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: gameResults gameResults_winnerId_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "gameResults"
    ADD CONSTRAINT "gameResults_winnerId_users_id_fk" FOREIGN KEY ("winnerId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: gameRooms gameRooms_collectionId_cardCollections_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "gameRooms"
    ADD CONSTRAINT "gameRooms_collectionId_cardCollections_id_fk" FOREIGN KEY ("collectionId") REFERENCES "cardCollections"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: gameRooms gameRooms_hostPlayerId_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "gameRooms"
    ADD CONSTRAINT "gameRooms_hostPlayerId_users_id_fk" FOREIGN KEY ("hostPlayerId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: gammaCreditLedger gammaCreditLedger_initiatedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "gammaCreditLedger"
    ADD CONSTRAINT "gammaCreditLedger_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: gammaCreditLedger gammaCreditLedger_lessonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "gammaCreditLedger"
    ADD CONSTRAINT "gammaCreditLedger_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES lessons(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: joinRequestApprovalTokens joinRequestApprovalTokens_adminUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "joinRequestApprovalTokens"
    ADD CONSTRAINT "joinRequestApprovalTokens_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: joinRequestApprovalTokens joinRequestApprovalTokens_joinRequestId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "joinRequestApprovalTokens"
    ADD CONSTRAINT "joinRequestApprovalTokens_joinRequestId_fkey" FOREIGN KEY ("joinRequestId") REFERENCES "joinRequests"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: joinRequests joinRequests_assignedSubUnitId_organizationSubUnits_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "joinRequests"
    ADD CONSTRAINT "joinRequests_assignedSubUnitId_organizationSubUnits_id_fk" FOREIGN KEY ("assignedSubUnitId") REFERENCES "organizationSubUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: joinRequests joinRequests_assignedTeamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "joinRequests"
    ADD CONSTRAINT "joinRequests_assignedTeamId_fkey" FOREIGN KEY ("assignedTeamId") REFERENCES "organizationTeams"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: joinRequests joinRequests_assignedUnitId_organizationUnits_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "joinRequests"
    ADD CONSTRAINT "joinRequests_assignedUnitId_organizationUnits_id_fk" FOREIGN KEY ("assignedUnitId") REFERENCES "organizationUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: joinRequests joinRequests_organizationId_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "joinRequests"
    ADD CONSTRAINT "joinRequests_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: joinRequests joinRequests_requestedSubUnitId_organizationSubUnits_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "joinRequests"
    ADD CONSTRAINT "joinRequests_requestedSubUnitId_organizationSubUnits_id_fk" FOREIGN KEY ("requestedSubUnitId") REFERENCES "organizationSubUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: joinRequests joinRequests_requestedTeamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "joinRequests"
    ADD CONSTRAINT "joinRequests_requestedTeamId_fkey" FOREIGN KEY ("requestedTeamId") REFERENCES "organizationTeams"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: joinRequests joinRequests_requestedUnitId_organizationUnits_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "joinRequests"
    ADD CONSTRAINT "joinRequests_requestedUnitId_organizationUnits_id_fk" FOREIGN KEY ("requestedUnitId") REFERENCES "organizationUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: joinRequests joinRequests_reviewedBy_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "joinRequests"
    ADD CONSTRAINT "joinRequests_reviewedBy_users_id_fk" FOREIGN KEY ("reviewedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: joinRequests joinRequests_userId_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "joinRequests"
    ADD CONSTRAINT "joinRequests_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonAssignments lessonAssignments_assignedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonAssignments"
    ADD CONSTRAINT "lessonAssignments_assignedBy_fkey" FOREIGN KEY ("assignedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonAssignments lessonAssignments_departmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonAssignments"
    ADD CONSTRAINT "lessonAssignments_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "organizationUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonAssignments lessonAssignments_gradeLevel_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonAssignments"
    ADD CONSTRAINT "lessonAssignments_gradeLevel_fkey" FOREIGN KEY ("gradeLevel") REFERENCES "organizationUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonAssignments lessonAssignments_lessonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonAssignments"
    ADD CONSTRAINT "lessonAssignments_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES lessons(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonAssignments lessonAssignments_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonAssignments"
    ADD CONSTRAINT "lessonAssignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonAssignments lessonAssignments_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonAssignments"
    ADD CONSTRAINT "lessonAssignments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonAssignments lessonAssignments_subjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonAssignments"
    ADD CONSTRAINT "lessonAssignments_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "organizationSubUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonAssignments lessonAssignments_unitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonAssignments"
    ADD CONSTRAINT "lessonAssignments_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "organizationSubUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonContentVersions lessonContentVersions_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonContentVersions"
    ADD CONSTRAINT "lessonContentVersions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonContentVersions lessonContentVersions_lessonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonContentVersions"
    ADD CONSTRAINT "lessonContentVersions_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES lessons(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonCreditPricingSettings lessonCreditPricingSettings_updatedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonCreditPricingSettings"
    ADD CONSTRAINT "lessonCreditPricingSettings_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonPresentationVersions lessonPresentationVersions_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonPresentationVersions"
    ADD CONSTRAINT "lessonPresentationVersions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonPresentationVersions lessonPresentationVersions_lessonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonPresentationVersions"
    ADD CONSTRAINT "lessonPresentationVersions_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES lessons(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonProgressSlides lessonProgressSlides_lessonProgressId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonProgressSlides"
    ADD CONSTRAINT "lessonProgressSlides_lessonProgressId_fkey" FOREIGN KEY ("lessonProgressId") REFERENCES "lessonProgress"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonProgress lessonProgress_lessonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonProgress"
    ADD CONSTRAINT "lessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES lessons(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonProgress lessonProgress_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonProgress"
    ADD CONSTRAINT "lessonProgress_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonProgress lessonProgress_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonProgress"
    ADD CONSTRAINT "lessonProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonQuizLinks lessonQuizLinks_lessonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonQuizLinks"
    ADD CONSTRAINT "lessonQuizLinks_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES lessons(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonQuizLinks lessonQuizLinks_quizId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonQuizLinks"
    ADD CONSTRAINT "lessonQuizLinks_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizCollections"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonScopeAssignments lessonScopeAssignments_assignedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonScopeAssignments"
    ADD CONSTRAINT "lessonScopeAssignments_assignedBy_fkey" FOREIGN KEY ("assignedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonScopeAssignments lessonScopeAssignments_lessonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonScopeAssignments"
    ADD CONSTRAINT "lessonScopeAssignments_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES lessons(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonScopeAssignments lessonScopeAssignments_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonScopeAssignments"
    ADD CONSTRAINT "lessonScopeAssignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonScopeAssignments lessonScopeAssignments_subjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonScopeAssignments"
    ADD CONSTRAINT "lessonScopeAssignments_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "organizationSubUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonScopeAssignments lessonScopeAssignments_unitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonScopeAssignments"
    ADD CONSTRAINT "lessonScopeAssignments_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "organizationUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonSlides lessonSlides_lessonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonSlides"
    ADD CONSTRAINT "lessonSlides_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES lessons(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonTranslationJobs lessonTranslationJobs_initiatedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonTranslationJobs"
    ADD CONSTRAINT "lessonTranslationJobs_initiatedBy_fkey" FOREIGN KEY ("initiatedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonTranslationJobs lessonTranslationJobs_lessonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonTranslationJobs"
    ADD CONSTRAINT "lessonTranslationJobs_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES lessons(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonTranslationJobs lessonTranslationJobs_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonTranslationJobs"
    ADD CONSTRAINT "lessonTranslationJobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonTranslationJobs lessonTranslationJobs_sourceLessonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonTranslationJobs"
    ADD CONSTRAINT "lessonTranslationJobs_sourceLessonId_fkey" FOREIGN KEY ("sourceLessonId") REFERENCES lessons(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonVersions lessonVersions_editedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonVersions"
    ADD CONSTRAINT "lessonVersions_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonVersions lessonVersions_lessonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonVersions"
    ADD CONSTRAINT "lessonVersions_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES lessons(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessonVersions lessonVersions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lessonVersions"
    ADD CONSTRAINT "lessonVersions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lessons lessons_activeLessonVersionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY lessons
    ADD CONSTRAINT "lessons_activeLessonVersionId_fkey" FOREIGN KEY ("activeLessonVersionId") REFERENCES "lessonVersions"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: licenseFlagAudit licenseFlagAudit_changedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "licenseFlagAudit"
    ADD CONSTRAINT "licenseFlagAudit_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: licenseFlagOverrides licenseFlagOverrides_setBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "licenseFlagOverrides"
    ADD CONSTRAINT "licenseFlagOverrides_setBy_fkey" FOREIGN KEY ("setBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: licensePayments licensePayments_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "licensePayments"
    ADD CONSTRAINT "licensePayments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: licensePayments licensePayments_paymentIntentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "licensePayments"
    ADD CONSTRAINT "licensePayments_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "paymentIntents"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: licensePayments licensePayments_processedByWebhookId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "licensePayments"
    ADD CONSTRAINT "licensePayments_processedByWebhookId_fkey" FOREIGN KEY ("processedByWebhookId") REFERENCES "webhookEvents"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: licenseRolloutBetaUsers licenseRolloutBetaUsers_addedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "licenseRolloutBetaUsers"
    ADD CONSTRAINT "licenseRolloutBetaUsers_addedBy_fkey" FOREIGN KEY ("addedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: licenseRolloutBetaUsers licenseRolloutBetaUsers_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "licenseRolloutBetaUsers"
    ADD CONSTRAINT "licenseRolloutBetaUsers_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: licenseRolloutOrganizations licenseRolloutOrganizations_addedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "licenseRolloutOrganizations"
    ADD CONSTRAINT "licenseRolloutOrganizations_addedBy_fkey" FOREIGN KEY ("addedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: licenseRolloutOrganizations licenseRolloutOrganizations_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "licenseRolloutOrganizations"
    ADD CONSTRAINT "licenseRolloutOrganizations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lpCreditLedger lpCreditLedger_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lpCreditLedger"
    ADD CONSTRAINT "lpCreditLedger_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lpCreditLedger lpCreditLedger_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "lpCreditLedger"
    ADD CONSTRAINT "lpCreditLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: notificationPreferences notificationPreferences_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "notificationPreferences"
    ADD CONSTRAINT "notificationPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: orgCreditLedger orgCreditLedger_actorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "orgCreditLedger"
    ADD CONSTRAINT "orgCreditLedger_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: orgCreditLedger orgCreditLedger_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "orgCreditLedger"
    ADD CONSTRAINT "orgCreditLedger_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationBankDetails organizationBankDetails_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationBankDetails"
    ADD CONSTRAINT "organizationBankDetails_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationBankingDetails organizationBankingDetails_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationBankingDetails"
    ADD CONSTRAINT "organizationBankingDetails_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationBankingDetails organizationBankingDetails_updatedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationBankingDetails"
    ADD CONSTRAINT "organizationBankingDetails_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationLicenseSettings organizationLicenseSettings_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationLicenseSettings"
    ADD CONSTRAINT "organizationLicenseSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationLicenses organizationLicenses_fulfilledPaymentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationLicenses"
    ADD CONSTRAINT "organizationLicenses_fulfilledPaymentId_fkey" FOREIGN KEY ("fulfilledPaymentId") REFERENCES "licensePayments"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationLicenses organizationLicenses_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationLicenses"
    ADD CONSTRAINT "organizationLicenses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationPackageAssignments organizationPackageAssignments_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationPackageAssignments"
    ADD CONSTRAINT "organizationPackageAssignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationPackageAssignments organizationPackageAssignments_packageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationPackageAssignments"
    ADD CONSTRAINT "organizationPackageAssignments_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "businessPackages"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationPackageAssignments organizationPackageAssignments_scheduledPackageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationPackageAssignments"
    ADD CONSTRAINT "organizationPackageAssignments_scheduledPackageId_fkey" FOREIGN KEY ("scheduledPackageId") REFERENCES "businessPackages"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationSubUnits organizationSubUnits_unitId_organizationUnits_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationSubUnits"
    ADD CONSTRAINT "organizationSubUnits_unitId_organizationUnits_id_fk" FOREIGN KEY ("unitId") REFERENCES "organizationUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationTeams organizationTeams_subUnitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationTeams"
    ADD CONSTRAINT "organizationTeams_subUnitId_fkey" FOREIGN KEY ("subUnitId") REFERENCES "organizationSubUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationUnits organizationUnits_organizationId_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationUnits"
    ADD CONSTRAINT "organizationUnits_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationUsageLimits organizationUsageLimits_organizationId_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationUsageLimits"
    ADD CONSTRAINT "organizationUsageLimits_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: organizationDomains organizationDomains_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "organizationDomains"
    ADD CONSTRAINT "organizationDomains_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: packageChangeEvents packageChangeEvents_changedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "packageChangeEvents"
    ADD CONSTRAINT "packageChangeEvents_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: packageChangeEvents packageChangeEvents_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "packageChangeEvents"
    ADD CONSTRAINT "packageChangeEvents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: packageChangeEvents packageChangeEvents_packageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "packageChangeEvents"
    ADD CONSTRAINT "packageChangeEvents_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "businessPackages"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: paymentFulfillments paymentFulfillments_paymentIntentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "paymentFulfillments"
    ADD CONSTRAINT "paymentFulfillments_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "paymentIntents"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: paymentIntents paymentIntents_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "paymentIntents"
    ADD CONSTRAINT "paymentIntents_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: paymentTransactions paymentTransactions_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "paymentTransactions"
    ADD CONSTRAINT "paymentTransactions_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES courses(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: paymentTransactions paymentTransactions_courseVersionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "paymentTransactions"
    ADD CONSTRAINT "paymentTransactions_courseVersionId_fkey" FOREIGN KEY ("courseVersionId") REFERENCES "courseVersions"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: paymentTransactions paymentTransactions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "paymentTransactions"
    ADD CONSTRAINT "paymentTransactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: paymentTransactions paymentTransactions_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "paymentTransactions"
    ADD CONSTRAINT "paymentTransactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: payoutBatches payoutBatches_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "payoutBatches"
    ADD CONSTRAINT "payoutBatches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: payoutDisbursements payoutDisbursements_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "payoutDisbursements"
    ADD CONSTRAINT "payoutDisbursements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: payoutTransactions payoutTransactions_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "payoutTransactions"
    ADD CONSTRAINT "payoutTransactions_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES courses(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: payoutTransactions payoutTransactions_payoutBatchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "payoutTransactions"
    ADD CONSTRAINT "payoutTransactions_payoutBatchId_fkey" FOREIGN KEY ("payoutBatchId") REFERENCES "payoutBatches"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: platformConfiguration platformConfiguration_lastModifiedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "platformConfiguration"
    ADD CONSTRAINT "platformConfiguration_lastModifiedBy_fkey" FOREIGN KEY ("lastModifiedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: platformCostEntries platformCostEntries_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "platformCostEntries"
    ADD CONSTRAINT "platformCostEntries_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "platformCostCategories"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: platformCostEntries platformCostEntries_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "platformCostEntries"
    ADD CONSTRAINT "platformCostEntries_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: platformCostEntries platformCostEntries_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "platformCostEntries"
    ADD CONSTRAINT "platformCostEntries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: platformCostEntries platformCostEntries_updatedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "platformCostEntries"
    ADD CONSTRAINT "platformCostEntries_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: platformPaymentSettings platformPaymentSettings_updatedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "platformPaymentSettings"
    ADD CONSTRAINT "platformPaymentSettings_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: platformPricing platformPricing_updatedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "platformPricing"
    ADD CONSTRAINT "platformPricing_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: platformRevenueSources platformRevenueSources_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "platformRevenueSources"
    ADD CONSTRAINT "platformRevenueSources_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: platformRevenueSources platformRevenueSources_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "platformRevenueSources"
    ADD CONSTRAINT "platformRevenueSources_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: playerSessions playerSessions_gameRoomId_gameRooms_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "playerSessions"
    ADD CONSTRAINT "playerSessions_gameRoomId_gameRooms_id_fk" FOREIGN KEY ("gameRoomId") REFERENCES "gameRooms"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: playerSessions playerSessions_playerId_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "playerSessions"
    ADD CONSTRAINT "playerSessions_playerId_users_id_fk" FOREIGN KEY ("playerId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: playerStats playerStats_playerId_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "playerStats"
    ADD CONSTRAINT "playerStats_playerId_users_id_fk" FOREIGN KEY ("playerId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: postFulfillmentJobs postFulfillmentJobs_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "postFulfillmentJobs"
    ADD CONSTRAINT "postFulfillmentJobs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "creditOrders"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: powerUpInventory powerUpInventory_powerUpId_powerUpCatalog_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "powerUpInventory"
    ADD CONSTRAINT "powerUpInventory_powerUpId_powerUpCatalog_id_fk" FOREIGN KEY ("powerUpId") REFERENCES "powerUpCatalog"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: powerUpInventory powerUpInventory_userId_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "powerUpInventory"
    ADD CONSTRAINT "powerUpInventory_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCardExplanations quizCardExplanations_cardId_quizCards_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCardExplanations"
    ADD CONSTRAINT "quizCardExplanations_cardId_quizCards_id_fk" FOREIGN KEY ("cardId") REFERENCES "quizCards"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCardVersions quizCardVersions_cardId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCardVersions"
    ADD CONSTRAINT "quizCardVersions_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "quizCards"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCardVersions quizCardVersions_collectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCardVersions"
    ADD CONSTRAINT "quizCardVersions_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "quizCollections"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCardVersions quizCardVersions_editedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCardVersions"
    ADD CONSTRAINT "quizCardVersions_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCards quizCards_collectionId_quizCollections_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCards"
    ADD CONSTRAINT "quizCards_collectionId_quizCollections_id_fk" FOREIGN KEY ("collectionId") REFERENCES "quizCollections"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCollectionAssignments quizCollectionAssignments_collectionId_quizCollections_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCollectionAssignments"
    ADD CONSTRAINT "quizCollectionAssignments_collectionId_quizCollections_id_fk" FOREIGN KEY ("collectionId") REFERENCES "quizCollections"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCollectionAssignments quizCollectionAssignments_subUnitId_organizationSubUnits_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCollectionAssignments"
    ADD CONSTRAINT "quizCollectionAssignments_subUnitId_organizationSubUnits_id_fk" FOREIGN KEY ("subUnitId") REFERENCES "organizationSubUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCollectionAssignments quizCollectionAssignments_subjectId_subjects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCollectionAssignments"
    ADD CONSTRAINT "quizCollectionAssignments_subjectId_subjects_id_fk" FOREIGN KEY ("subjectId") REFERENCES subjects(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCollectionAssignments quizCollectionAssignments_unitId_organizationUnits_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCollectionAssignments"
    ADD CONSTRAINT "quizCollectionAssignments_unitId_organizationUnits_id_fk" FOREIGN KEY ("unitId") REFERENCES "organizationUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCollectionVersions quizCollectionVersions_collectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCollectionVersions"
    ADD CONSTRAINT "quizCollectionVersions_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "quizCollections"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCollectionVersions quizCollectionVersions_editedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCollectionVersions"
    ADD CONSTRAINT "quizCollectionVersions_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCollectionVersions quizCollectionVersions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCollectionVersions"
    ADD CONSTRAINT "quizCollectionVersions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCollections quizCollections_createdBy_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCollections"
    ADD CONSTRAINT "quizCollections_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCollections quizCollections_organizationId_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCollections"
    ADD CONSTRAINT "quizCollections_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCollections quizCollections_subjectId_subjects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCollections"
    ADD CONSTRAINT "quizCollections_subjectId_subjects_id_fk" FOREIGN KEY ("subjectId") REFERENCES subjects(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCreditPricing quizCreditPricing_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCreditPricing"
    ADD CONSTRAINT "quizCreditPricing_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCreditPricing quizCreditPricing_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCreditPricing"
    ADD CONSTRAINT "quizCreditPricing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizCreditPricing quizCreditPricing_updatedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizCreditPricing"
    ADD CONSTRAINT "quizCreditPricing_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizDrafts quizDrafts_createdBy_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizDrafts"
    ADD CONSTRAINT "quizDrafts_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizDrafts quizDrafts_gradeId_organizationUnits_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizDrafts"
    ADD CONSTRAINT "quizDrafts_gradeId_organizationUnits_id_fk" FOREIGN KEY ("gradeId") REFERENCES "organizationUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizDrafts quizDrafts_lessonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizDrafts"
    ADD CONSTRAINT "quizDrafts_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES lessons(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizDrafts quizDrafts_organizationId_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizDrafts"
    ADD CONSTRAINT "quizDrafts_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizDrafts quizDrafts_publishedCollectionId_quizCollections_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizDrafts"
    ADD CONSTRAINT "quizDrafts_publishedCollectionId_quizCollections_id_fk" FOREIGN KEY ("publishedCollectionId") REFERENCES "quizCollections"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizDrafts quizDrafts_subjectId_subjects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizDrafts"
    ADD CONSTRAINT "quizDrafts_subjectId_subjects_id_fk" FOREIGN KEY ("subjectId") REFERENCES subjects(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizGameProgress quizGameProgress_collectionId_quizCollections_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizGameProgress"
    ADD CONSTRAINT "quizGameProgress_collectionId_quizCollections_id_fk" FOREIGN KEY ("collectionId") REFERENCES "quizCollections"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizGameProgress quizGameProgress_organizationId_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizGameProgress"
    ADD CONSTRAINT "quizGameProgress_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizGameProgress quizGameProgress_subUnitId_organizationSubUnits_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizGameProgress"
    ADD CONSTRAINT "quizGameProgress_subUnitId_organizationSubUnits_id_fk" FOREIGN KEY ("subUnitId") REFERENCES "organizationSubUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizGameProgress quizGameProgress_unitId_organizationUnits_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizGameProgress"
    ADD CONSTRAINT "quizGameProgress_unitId_organizationUnits_id_fk" FOREIGN KEY ("unitId") REFERENCES "organizationUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizGameProgress quizGameProgress_userId_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizGameProgress"
    ADD CONSTRAINT "quizGameProgress_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizGameResults quizGameResults_collectionId_quizCollections_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizGameResults"
    ADD CONSTRAINT "quizGameResults_collectionId_quizCollections_id_fk" FOREIGN KEY ("collectionId") REFERENCES "quizCollections"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizGameResults quizGameResults_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizGameResults"
    ADD CONSTRAINT "quizGameResults_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES courses(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizGameResults quizGameResults_courseVersionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizGameResults"
    ADD CONSTRAINT "quizGameResults_courseVersionId_fkey" FOREIGN KEY ("courseVersionId") REFERENCES "courseVersions"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizGameResults quizGameResults_lessonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizGameResults"
    ADD CONSTRAINT "quizGameResults_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES lessons(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quizGameResults quizGameResults_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "quizGameResults"
    ADD CONSTRAINT "quizGameResults_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: reviewModerationActions reviewModerationActions_moderatorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "reviewModerationActions"
    ADD CONSTRAINT "reviewModerationActions_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: reviewModerationActions reviewModerationActions_reviewId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "reviewModerationActions"
    ADD CONSTRAINT "reviewModerationActions_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "courseReviews"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: salesInquiries salesInquiries_statusUpdatedBy_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "salesInquiries"
    ADD CONSTRAINT "salesInquiries_statusUpdatedBy_users_id_fk" FOREIGN KEY ("statusUpdatedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: subjects subjects_createdBy_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY subjects
    ADD CONSTRAINT "subjects_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: subjects subjects_organizationId_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY subjects
    ADD CONSTRAINT "subjects_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: subjects subjects_unitId_organizationUnits_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY subjects
    ADD CONSTRAINT "subjects_unitId_organizationUnits_id_fk" FOREIGN KEY ("unitId") REFERENCES "organizationUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: subscriptionEvents subscriptionEvents_initiatedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "subscriptionEvents"
    ADD CONSTRAINT "subscriptionEvents_initiatedBy_fkey" FOREIGN KEY ("initiatedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: subscriptionEvents subscriptionEvents_subscriptionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "subscriptionEvents"
    ADD CONSTRAINT "subscriptionEvents_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES subscriptions(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: subscriptionInvoices subscriptionInvoices_subscriptionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "subscriptionInvoices"
    ADD CONSTRAINT "subscriptionInvoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES subscriptions(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: subscriptions subscriptions_planId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY subscriptions
    ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "elearningSubscriptionPlans"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: subscriptions subscriptions_processedBy_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY subscriptions
    ADD CONSTRAINT "subscriptions_processedBy_users_id_fk" FOREIGN KEY ("processedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: termDefinitions termDefinitions_subjectId_subjects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "termDefinitions"
    ADD CONSTRAINT "termDefinitions_subjectId_subjects_id_fk" FOREIGN KEY ("subjectId") REFERENCES subjects(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: unitSubjects unitSubjects_subjectId_subjects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "unitSubjects"
    ADD CONSTRAINT "unitSubjects_subjectId_subjects_id_fk" FOREIGN KEY ("subjectId") REFERENCES subjects(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: unitSubjects unitSubjects_unitId_organizationUnits_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "unitSubjects"
    ADD CONSTRAINT "unitSubjects_unitId_organizationUnits_id_fk" FOREIGN KEY ("unitId") REFERENCES "organizationUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: universalStatUnits universalStatUnits_createdBy_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "universalStatUnits"
    ADD CONSTRAINT "universalStatUnits_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userCourseEnrollments userCourseEnrollments_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userCourseEnrollments"
    ADD CONSTRAINT "userCourseEnrollments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES courses(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userCourseEnrollments userCourseEnrollments_courseVersionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userCourseEnrollments"
    ADD CONSTRAINT "userCourseEnrollments_courseVersionId_fkey" FOREIGN KEY ("courseVersionId") REFERENCES "courseVersions"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userCourseEnrollments userCourseEnrollments_latestVersionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userCourseEnrollments"
    ADD CONSTRAINT "userCourseEnrollments_latestVersionId_fkey" FOREIGN KEY ("latestVersionId") REFERENCES "courseVersions"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userCourseEnrollments userCourseEnrollments_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userCourseEnrollments"
    ADD CONSTRAINT "userCourseEnrollments_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userCourseLessonProgress userCourseLessonProgress_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userCourseLessonProgress"
    ADD CONSTRAINT "userCourseLessonProgress_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES courses(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userCourseLessonProgress userCourseLessonProgress_courseVersionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userCourseLessonProgress"
    ADD CONSTRAINT "userCourseLessonProgress_courseVersionId_fkey" FOREIGN KEY ("courseVersionId") REFERENCES "courseVersions"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userCourseLessonProgress userCourseLessonProgress_lessonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userCourseLessonProgress"
    ADD CONSTRAINT "userCourseLessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES lessons(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userCourseLessonProgress userCourseLessonProgress_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userCourseLessonProgress"
    ADD CONSTRAINT "userCourseLessonProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userCreditAdjustments userCreditAdjustments_allocationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userCreditAdjustments"
    ADD CONSTRAINT "userCreditAdjustments_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "userCreditAllocations"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userCreditAdjustments userCreditAdjustments_approvedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userCreditAdjustments"
    ADD CONSTRAINT "userCreditAdjustments_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userCreditAdjustments userCreditAdjustments_requestedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userCreditAdjustments"
    ADD CONSTRAINT "userCreditAdjustments_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userLicenses userLicenses_activatedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userLicenses"
    ADD CONSTRAINT "userLicenses_activatedBy_fkey" FOREIGN KEY ("activatedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userLicenses userLicenses_deactivatedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userLicenses"
    ADD CONSTRAINT "userLicenses_deactivatedBy_fkey" FOREIGN KEY ("deactivatedBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userLicenses userLicenses_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userLicenses"
    ADD CONSTRAINT "userLicenses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userLicenses userLicenses_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userLicenses"
    ADD CONSTRAINT "userLicenses_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userNotifications userNotifications_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userNotifications"
    ADD CONSTRAINT "userNotifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userOrganizationAssignments userOrganizationAssignments_organizationId_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userOrganizationAssignments"
    ADD CONSTRAINT "userOrganizationAssignments_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userOrganizationAssignments userOrganizationAssignments_subUnitId_organizationSubUnits_id_f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userOrganizationAssignments"
    ADD CONSTRAINT "userOrganizationAssignments_subUnitId_organizationSubUnits_id_f" FOREIGN KEY ("subUnitId") REFERENCES "organizationSubUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userOrganizationAssignments userOrganizationAssignments_subjectId_subjects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userOrganizationAssignments"
    ADD CONSTRAINT "userOrganizationAssignments_subjectId_subjects_id_fk" FOREIGN KEY ("subjectId") REFERENCES subjects(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userOrganizationAssignments userOrganizationAssignments_teamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userOrganizationAssignments"
    ADD CONSTRAINT "userOrganizationAssignments_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "organizationTeams"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userOrganizationAssignments userOrganizationAssignments_unitId_organizationUnits_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userOrganizationAssignments"
    ADD CONSTRAINT "userOrganizationAssignments_unitId_organizationUnits_id_fk" FOREIGN KEY ("unitId") REFERENCES "organizationUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userOrganizationAssignments userOrganizationAssignments_userId_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userOrganizationAssignments"
    ADD CONSTRAINT "userOrganizationAssignments_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userOrganizationRoles userOrganizationRoles_organizationId_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userOrganizationRoles"
    ADD CONSTRAINT "userOrganizationRoles_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userOrganizationRoles userOrganizationRoles_userId_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userOrganizationRoles"
    ADD CONSTRAINT "userOrganizationRoles_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userQuizProgress userQuizProgress_assignmentId_quizCollectionAssignments_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userQuizProgress"
    ADD CONSTRAINT "userQuizProgress_assignmentId_quizCollectionAssignments_id_fk" FOREIGN KEY ("assignmentId") REFERENCES "quizCollectionAssignments"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userQuizProgress userQuizProgress_collectionId_quizCollections_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userQuizProgress"
    ADD CONSTRAINT "userQuizProgress_collectionId_quizCollections_id_fk" FOREIGN KEY ("collectionId") REFERENCES "quizCollections"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userQuizProgress userQuizProgress_organizationId_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userQuizProgress"
    ADD CONSTRAINT "userQuizProgress_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userQuizProgress userQuizProgress_subUnitId_organizationSubUnits_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userQuizProgress"
    ADD CONSTRAINT "userQuizProgress_subUnitId_organizationSubUnits_id_fk" FOREIGN KEY ("subUnitId") REFERENCES "organizationSubUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userQuizProgress userQuizProgress_unitId_organizationUnits_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userQuizProgress"
    ADD CONSTRAINT "userQuizProgress_unitId_organizationUnits_id_fk" FOREIGN KEY ("unitId") REFERENCES "organizationUnits"(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: userQuizProgress userQuizProgress_userId_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "userQuizProgress"
    ADD CONSTRAINT "userQuizProgress_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: webhookRegistrations webhookRegistrations_registeredBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY "webhookRegistrations"
    ADD CONSTRAINT "webhookRegistrations_registeredBy_fkey" FOREIGN KEY ("registeredBy") REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- PostgreSQL database dump complete
--
