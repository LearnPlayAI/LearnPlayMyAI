/**
 * PUBLIC ROUTES
 * 
 * Endpoints that don't require authentication.
 * These are accessed by anonymous users, guest sessions, and the public catalog.
 */

import type { Request, Response, Router } from "express";
import express from "express";
import { storage, LEARNER_ROLES } from "../storage";
import * as schema from "@shared/schema";
import { db } from "../db";
import { eq, and, asc, inArray, sql, desc } from "drizzle-orm";
import { optionalAuth } from "./shared";
import { withSessionAuthMiddleware } from "../middleware/sessionAuthMiddleware";
import { userOrganizationRoles, lessons, lessonQuizLinks, quizCollections } from "@shared/schema";
import { isFeatureEnabled, isQuizCreditChargingEnabled } from "../featureFlags";
import { CourseService } from "../services/courseService";
import { LessonService } from "../services/lessonService";
import { LessonPodcastService } from "../services/lessonPodcastService";
import { LessonDigestService } from "../services/lessonDigestService";
import { LessonStepGuideService, StepGuideVersionNotFoundError } from "../services/lessonStepGuideService";
import { ShowcaseCourseService } from "../services/showcaseCourseService";
import { ContentLanguageService } from "../services/contentLanguageService";
import { isResolvedShowcaseLessonEligible } from "../services/languageAccessPolicy";
import { ensurePlatformPricingSchemaCompatibilityOnce } from "../ensurePlatformPricing";

// ==================== RATE LIMITING ====================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const ipRateLimitStore = new Map<string, RateLimitEntry>();

const PUBLIC_RATE_LIMIT_MAX = 100; // requests per window
const PUBLIC_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

// Cleanup expired rate limit entries every minute
const publicRateLimitCleanupTimer = setInterval(() => {
  const now = Date.now();
  const entries = Array.from(ipRateLimitStore.entries());
  for (const [key, entry] of entries) {
    if (entry.resetAt <= now) {
      ipRateLimitStore.delete(key);
    }
  }
}, 60 * 1000);
if (typeof publicRateLimitCleanupTimer.unref === "function") {
  publicRateLimitCleanupTimer.unref();
}

function checkPublicRateLimit(ip: string | undefined): { allowed: boolean; retryAfter?: number } {
  const key = ip || 'unknown';
  const now = Date.now();
  
  const entry = ipRateLimitStore.get(key);
  
  if (!entry || entry.resetAt <= now) {
    ipRateLimitStore.set(key, {
      count: 1,
      resetAt: now + PUBLIC_RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true };
  }
  
  if (entry.count >= PUBLIC_RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }
  
  entry.count++;
  return { allowed: true };
}

function publicRateLimitMiddleware(req: Request, res: Response, next: any) {
  const ip = req.ip || req.connection.remoteAddress;
  const rateLimit = checkPublicRateLimit(ip);
  
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(rateLimit.retryAfter));
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  
  next();
}

function logPublicLanguageResolution(input: {
  route: string;
  resourceType: "course" | "lesson" | "browse";
  resourceId?: string | null;
  requestedLanguageCode?: string | null;
  languageResolution?: ReturnType<typeof ContentLanguageService.buildResolutionPayload>;
}) {
  console.log("[PublicLanguageResolution]", JSON.stringify({
    route: input.route,
    resourceType: input.resourceType,
    resourceId: input.resourceId || null,
    requestedLanguageCode: input.requestedLanguageCode || null,
    languageResolution: input.languageResolution || null,
    timestamp: new Date().toISOString(),
  }));
}

export function createPublicRouter(): Router {
  const router = express.Router();

  // Get public feature flags (no authentication required)
  // Exposes client-safe feature flags for frontend conditional rendering
  router.get('/feature-flags', async (req: Request, res: Response) => {
    try {
      res.json({
        ENABLE_QUIZ_CREDIT_CHARGING: isQuizCreditChargingEnabled(),
      });
    } catch (error: any) {
      console.error("[Public Feature Flags] Error fetching feature flags:", error);
      res.status(500).json({ error: "Failed to fetch feature flags" });
    }
  });

  // Get public platform pricing (no authentication required)
  router.get('/platform-pricing', async (req: Request, res: Response) => {
    try {
      await ensurePlatformPricingSchemaCompatibilityOnce();

      const [pricing] = await db
        .select()
        .from(schema.platformPricing)
        .orderBy(desc(schema.platformPricing.updatedAt), desc(schema.platformPricing.createdAt))
        .limit(1);

      res.json({ 
        learnerMonthlyCost: pricing?.learnerMonthlyCost || '8.99',
        currency: 'ZAR'
      });
    } catch (error: any) {
      console.error("[Public Pricing] Error fetching pricing:", error);
      res.status(500).json({ error: "Failed to fetch platform pricing" });
    }
  });

  // Get public subscription plans (educator monthly lesson credit tiers or learner monthly subscription)
  router.get('/subscription-plans', optionalAuth, async (req: Request, res: Response) => {
    try {
      const { planType, currency: queryCurrency } = req.query;
      const currency = (queryCurrency as string) || 'ZAR';
      
      // For educator plans: fetch from businessPackages table (SuperAdmin configured)
      // This replaces the old subscriptionPlans table to ensure prices match SuperAdmin settings
      if (!planType || planType === 'educator') {
        // Fetch active business packages ordered by displayOrder
        const packages = await db
          .select()
          .from(schema.businessPackages)
          .where(eq(schema.businessPackages.isActive, true))
          .orderBy(asc(schema.businessPackages.displayOrder));

        // Fetch prices for the requested currency for each package
        const subscriptionPlans = await Promise.all(
          packages.map(async (pkg) => {
            // Get the price for the requested currency
            const [price] = await db
              .select()
              .from(schema.businessPackagePrices)
              .where(
                and(
                  eq(schema.businessPackagePrices.packageId, pkg.id),
                  eq(schema.businessPackagePrices.currency, currency as any)
                )
              )
              .limit(1);

            // Map to the format expected by the frontend (SubscriptionPlan interface)
            return {
              id: pkg.id,
              name: pkg.name,
              tier: pkg.tier,
              monthlyCredits: pkg.monthlyCredits,
              // Use pricePerTeacher from businessPackagePrices for compatibility
              pricePerTeacher: price?.pricePerTeacher || '0',
              // Also include annualPrice if discount is set
              annualPrice: price?.pricePerTeacher && pkg.annualDiscountPercent 
                ? (parseFloat(price.pricePerTeacher) * 12 * (1 - parseFloat(pkg.annualDiscountPercent || '0') / 100)).toFixed(2)
                : undefined,
              currency: currency as 'ZAR' | 'USD' | 'EUR',
              badge: pkg.badge,
              features: pkg.features || [],
              colorScheme: pkg.colorScheme,
              isActive: pkg.isActive,
              displayOrder: pkg.displayOrder,
              // Additional fields from businessPackages
              maxLearners: pkg.maxLearners,
              maxTeachers: pkg.maxTeachers,
              maxOrgAdmins: pkg.maxOrgAdmins,
              // Include per-seat pricing for detailed display
              pricePerLearner: price?.pricePerLearner || '0',
              pricePerOrgAdmin: price?.pricePerOrgAdmin || '0',
              createdAt: pkg.createdAt?.toISOString(),
              updatedAt: pkg.updatedAt?.toISOString(),
            };
          })
        );

        res.json({ subscriptionPlans });
      } else if (planType === 'learner') {
        // For learner plans: return BOTH plans (full access + e-learning discount)
        const [pricing] = await db
          .select()
          .from(schema.platformPricing)
          .orderBy(desc(schema.platformPricing.updatedAt), desc(schema.platformPricing.createdAt))
          .limit(1);

        if (pricing) {
          const discountPercent = pricing.elearningLearnerDiscountPercent || '0';
          
          // Plan 1: Full platform access (Education/Business style)
          const fullAccessPlan = {
            id: 'learner-monthly-plan',
            name: 'Full Access Subscription',
            tier: 'learner',
            monthlyCredits: 0,
            pricePerTeacher: pricing.learnerMonthlyCost,
            currency: 'ZAR' as const,
            badge: 'Most Popular',
            features: [
              'Full platform access',
              'Join all courses',
              'Track your progress',
              'Earn XP and rewards'
            ],
            colorScheme: 'blue',
            isActive: true,
            displayOrder: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          // Plan 2: E-learning discount plan
          const discountPlan = {
            id: 'elearning-learner-monthly-plan',
            name: 'Course Discount Subscription',
            tier: 'learner',
            monthlyCredits: 0,
            pricePerTeacher: pricing.elearningLearnerMonthlyCost,
            currency: 'ZAR' as const,
            badge: 'Best Value',
            features: [
              `Get ${discountPercent}% off all e-learning course purchases`,
              'Access to purchased courses',
              'Track your progress',
              'Earn XP and rewards'
            ],
            colorScheme: 'purple',
            isActive: true,
            displayOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          res.json({ subscriptionPlans: [fullAccessPlan, discountPlan] });
        } else {
          res.json({ subscriptionPlans: [] });
        }
      } else {
        res.json({ subscriptionPlans: [] });
      }
    } catch (error: any) {
      console.error("[Public Plans] Error fetching subscription plans:", error);
      res.status(500).json({ error: "Failed to fetch subscription plans" });
    }
  });

  // Get explanation generation pricing (authenticated users only)
  router.get('/quiz-pricing/explanation', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const [pricing] = await db
        .select()
        .from(schema.platformPricing)
        .orderBy(desc(schema.platformPricing.updatedAt), desc(schema.platformPricing.createdAt))
        .limit(1);
      const creditCost = pricing?.creditsPerExplanationGeneration ?? 25;
      res.json({ creditCost });
    } catch (error: any) {
      console.error("[Quiz Pricing] Error fetching explanation pricing:", error);
      res.status(500).json({ error: "Failed to fetch explanation generation pricing" });
    }
  });

  // Get answer check pricing (authenticated users only)
  router.get('/quiz-pricing/answer-check', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const [pricing] = await db
        .select()
        .from(schema.platformPricing)
        .orderBy(desc(schema.platformPricing.updatedAt), desc(schema.platformPricing.createdAt))
        .limit(1);
      const creditCost = pricing?.creditsPerAnswerCheck ?? 20;
      res.json({ creditCost });
    } catch (error: any) {
      console.error("[Quiz Pricing] Error fetching answer check pricing:", error);
      res.status(500).json({ error: "Failed to fetch answer check pricing" });
    }
  });

  // Get top-rated courses for homepage (public, no auth required)
  router.get('/popular-courses', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 8;
      const courses = await CourseService.getTopRatedCourses(Math.min(limit, 20)); // Max 20 courses
      res.json({ courses });
    } catch (error: any) {
      console.error("[Public Popular Courses] Error fetching courses:", error);
      res.status(500).json({ error: "Failed to fetch popular courses" });
    }
  });

  // Browse all public courses - NO AUTH REQUIRED
  // This is the public marketplace where anyone can discover courses
  // Supports ?showcase=true to filter to only showcase courses (from showcase org + showcase department)
  router.get('/courses', publicRateLimitMiddleware, async (req: Request, res: Response) => {
    try {
      const { 
        categoryId, 
        search, 
        languageCode,
        sortBy = 'newest',
        difficultyLevel,
        page = '1',
        limit = '20',
        showcase
      } = req.query;

      const pageNum = Math.max(1, parseInt(page as string) || 1);
      const limitNum = Math.min(50, Math.max(1, parseInt(limit as string) || 20));
      const offset = (pageNum - 1) * limitNum;

      // If showcase=true, return courses suitable for the homepage showcase carousel:
      // explicit showcase courses plus active free public courses.
      let showcaseCourseIds: string[] | undefined;
      if (showcase === 'true') {
        showcaseCourseIds = await ShowcaseCourseService.getAnonymousPublicCourseIds();
        
        // If no showcase courses exist, return empty result
        if (showcaseCourseIds.length === 0) {
          return res.json({
            courses: [],
            total: 0,
            page: pageNum,
            limit: limitNum,
            totalPages: 0
          });
        }
      }

      const result = await CourseService.getPublicCourses({
        categoryId: categoryId as string | undefined,
        search: search as string | undefined,
        languageCode: languageCode ? String(languageCode).trim().toLowerCase() : undefined,
        sortBy: sortBy as 'newest' | 'popular' | 'rating' | 'price_low' | 'price_high',
        difficultyLevel: difficultyLevel as string | undefined,
        limit: limitNum,
        offset,
        courseIds: showcaseCourseIds
      });

      // Mark only true showcase courses; the homepage filter may also include
      // free public courses that should not receive showcase-only privileges.
      const allShowcaseCourseIds = await ShowcaseCourseService.getShowcaseCourseIds();
      const showcaseIdSet = new Set(allShowcaseCourseIds);

      // Add isShowcaseCourse flag to each course
      const coursesWithShowcaseFlag = result.courses.map((course: any) => ({
        ...course,
        isShowcaseCourse: showcaseIdSet.has(course.id)
      }));

      logPublicLanguageResolution({
        route: "/public/courses",
        resourceType: "browse",
        requestedLanguageCode: languageCode ? String(languageCode).trim().toLowerCase() : null,
      });

      res.json({
        courses: coursesWithShowcaseFlag,
        requestedLanguageCode: languageCode ? String(languageCode).trim().toLowerCase() : null,
        total: result.total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(result.total / limitNum)
      });
    } catch (error: any) {
      console.error("[Public Courses Browse] Error fetching public courses:", error);
      res.status(500).json({ error: "Failed to fetch public courses" });
    }
  });

  // Get single public course details - NO AUTH REQUIRED
  // For course preview page accessible without login
  router.get('/courses/:courseId', publicRateLimitMiddleware, async (req: Request, res: Response) => {
    try {
      const { courseId } = req.params;
      const requestedLanguageCode = req.query.languageCode ? String(req.query.languageCode).trim().toLowerCase() : null;
      let resolvedCourseId = courseId;

      const [courseLang] = await db
        .select({
          contentGroupId: schema.courses.contentGroupId,
          languageCode: schema.courses.languageCode,
          organizationId: schema.courses.organizationId,
        })
        .from(schema.courses)
        .where(eq(schema.courses.id, courseId))
        .limit(1);

      const languageResolution = courseLang?.contentGroupId
        ? await ContentLanguageService.resolveCourseVariantByFallback({
            contentGroupId: courseLang.contentGroupId,
            requestedLanguage: requestedLanguageCode,
            organizationId: courseLang.organizationId,
            sourceLanguage: courseLang.languageCode || undefined,
          })
        : null;
      if (languageResolution?.variantId) {
        resolvedCourseId = languageResolution.variantId;
      }

      const course = await CourseService.getPublicCourseDetails(resolvedCourseId);
      
      if (!course) {
        return res.status(404).json({ error: "Course not found or not public" });
      }

      const languageResolutionPayload = ContentLanguageService.buildResolutionPayload(
        languageResolution,
        requestedLanguageCode
      );
      logPublicLanguageResolution({
        route: "/public/courses/:courseId",
        resourceType: "course",
        resourceId: courseId,
        requestedLanguageCode,
        languageResolution: languageResolutionPayload,
      });

      res.json({
        course,
        languageResolution: languageResolutionPayload,
      });
    } catch (error: any) {
      console.error("[Public Course Details] Error fetching course:", error);
      res.status(500).json({ error: "Failed to fetch course details" });
    }
  });

  // ==================== ANONYMOUS PUBLIC CONTENT ROUTES ====================
  // These routes provide anonymous access to showcase content and active free public courses.

  // Get lesson viewer for anonymous public lessons - NO AUTH REQUIRED
  router.get('/lessons/:lessonId/viewer', publicRateLimitMiddleware, async (req: Request, res: Response) => {
    try {
      const { lessonId } = req.params;
      const digestVersionId = req.query.versionId ? String(req.query.versionId) : undefined;
      const digestLanguageCode = req.query.languageCode ? String(req.query.languageCode) : undefined;
      const stepGuideVersionId = req.query.stepGuideVersionId ? String(req.query.stepGuideVersionId) : undefined;
      const requestedLanguageCode = req.query.languageCode ? String(req.query.languageCode).trim().toLowerCase() : null;

      const hasAnonymousAccess = await ShowcaseCourseService.isAnonymousPublicLesson(lessonId);
      if (!hasAnonymousAccess) {
        return res.status(403).json({ error: "This lesson is not available for public access" });
      }

      // Get the lesson details
      const [baseLesson] = await db
        .select()
        .from(lessons)
        .where(eq(lessons.id, lessonId))
        .limit(1);

      if (!baseLesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }
      let lesson = baseLesson;
      const languageResolution = lesson.contentGroupId
        ? await ContentLanguageService.resolveLessonVariantByFallback({
            contentGroupId: lesson.contentGroupId,
            requestedLanguage: requestedLanguageCode,
            organizationId: lesson.organizationId,
            sourceLanguage: lesson.languageCode || undefined,
          })
        : null;
      if (languageResolution?.variantId && languageResolution.variantId !== lesson.id) {
        const resolvedVariantHasAnonymousAccess = await ShowcaseCourseService.isAnonymousPublicLesson(languageResolution.variantId);
        if (!isResolvedShowcaseLessonEligible(resolvedVariantHasAnonymousAccess)) {
          return res.status(403).json({ error: "Resolved lesson variant is not available for public access" });
        }

        const [resolvedLesson] = await db
          .select()
          .from(lessons)
          .where(eq(lessons.id, languageResolution.variantId))
          .limit(1);
        if (resolvedLesson) {
          lesson = resolvedLesson;
        }
      }
      const resolvedLessonId = lesson.id;

      let viewerUrl: string | null = null;
      let videoUrl: string | null = null;
      let pptxUrl: string | null = null;
      let isLocalPptx: boolean = false;
      let conversionPending: boolean = false;
      let conversionStatus: 'ready' | 'pending' | 'failed' | 'unsupported' | null = null;
      let conversionError: string | null = null;
      let slideImages: { slideCount: number; urls: string[] } | undefined;
      let podcast: any = null;
      let lessonDigest: any = null;
      let stepByStepGuide: any = null;
      
      const hasVideo = !!lesson.videoStorageKey;
      const hasPPTX = !!lesson.storageKey;
      const hasGammaSlides = !!lesson.gammaCardId;
      
      // Get video URL if available
      if (hasVideo) {
        try {
          videoUrl = await LessonService.getVideoUrl(resolvedLessonId, lesson.organizationId);
        } catch (err) {
          console.error("[Public Lesson Viewer] Failed to get video URL:", err);
        }
      }
      
      // Get PPTX viewer URL if available
      if (hasPPTX) {
        try {
          const viewerResult = await LessonService.getViewerUrl(resolvedLessonId, lesson.organizationId);
          viewerUrl = viewerResult.viewerUrl;
          pptxUrl = viewerResult.pptxUrl;
          isLocalPptx = viewerResult.isLocalPptx;
          conversionPending = viewerResult.conversionPending;
          conversionStatus = viewerResult.conversionStatus;
          conversionError = viewerResult.conversionError || null;
          slideImages = viewerResult.slideImages;
        } catch (err) {
          console.error("[Public Lesson Viewer] Failed to get viewer URL:", err);
        }
      }

      try {
        const podcastMeta = LessonPodcastService.getMetadata(lesson as any);
        const signed = await LessonPodcastService.getSignedUrlForVersion(lesson as any);
        podcast = {
          ...LessonPodcastService.getPublicSafeState(podcastMeta),
          activeUrl: signed.url,
          activeVersion: signed.version ? { ...signed.version, storageKey: undefined } : null,
        };
      } catch (err) {
        console.error("[Public Lesson Viewer] Failed to get podcast URL:", err);
      }
      try {
        lessonDigest = await LessonDigestService.getOrCreateDigest(lesson as any, {
          versionId: digestVersionId,
          languageCode: digestLanguageCode,
        });
      } catch (err) {
        console.error("[Public Lesson Viewer] Failed to get lesson digest:", err);
      }
      try {
        stepByStepGuide = await LessonStepGuideService.getGuide(lesson as any, {
          versionId: stepGuideVersionId,
          languageCode: digestLanguageCode,
        });
      } catch (err) {
        if (err instanceof StepGuideVersionNotFoundError) {
          return res.status(404).json({ error: err.message });
        }
        console.error("[Public Lesson Viewer] Failed to get step-by-step guide:", err);
      }

      const lessonLanguageResolutionPayload = ContentLanguageService.buildResolutionPayload(
        languageResolution,
        requestedLanguageCode
      );
      logPublicLanguageResolution({
        route: "/public/lessons/:lessonId/viewer",
        resourceType: "lesson",
        resourceId: lessonId,
        requestedLanguageCode,
        languageResolution: lessonLanguageResolutionPayload,
      });

      res.json({ 
        viewerUrl, 
        videoUrl,
        pptxUrl,
        isLocalPptx,
        conversionPending,
        conversionStatus,
        conversionError,
        slideImages,
        hasVideo,
        hasPPTX,
        hasGammaSlides,
        podcast,
        lessonDigest,
        stepByStepGuide,
        languageResolution: lessonLanguageResolutionPayload,
        lesson: {
          id: lesson.id,
          title: lesson.title,
          description: lesson.description,
          organizationId: lesson.organizationId,
          generationStatus: lesson.generationStatus,
          currentSlideVersion: lesson.currentSlideVersion,
          gammaCardId: lesson.gammaCardId,
          slideCount: lesson.slideCount,
          videoDurationSec: lesson.videoDurationSec,
        }
      });
    } catch (error: any) {
      console.error("[Public Lesson Viewer] Error:", error);
      res.status(500).json({ error: "Failed to get lesson viewer" });
    }
  });

  // Get linked quiz for anonymous public lessons - NO AUTH REQUIRED
  router.get('/lessons/:lessonId/quiz', publicRateLimitMiddleware, async (req: Request, res: Response) => {
    try {
      const { lessonId } = req.params;

      const hasAnonymousAccess = await ShowcaseCourseService.isAnonymousPublicLesson(lessonId);
      if (!hasAnonymousAccess) {
        return res.status(403).json({ error: "This lesson is not available for public access" });
      }

      // Get the linked quiz for this lesson (prefer primary)
      const quizLinks = await db
        .select({
          quizId: lessonQuizLinks.quizId,
          isPrimary: lessonQuizLinks.isPrimary,
          quizName: quizCollections.name,
          quizDescription: quizCollections.description,
        })
        .from(lessonQuizLinks)
        .innerJoin(quizCollections, eq(lessonQuizLinks.quizId, quizCollections.id))
        .where(eq(lessonQuizLinks.lessonId, lessonId))
        .orderBy(sql`${lessonQuizLinks.isPrimary} DESC`);

      if (quizLinks.length === 0) {
        return res.json({ quiz: null });
      }

      // Return the primary quiz or the first one
      const primaryQuiz = quizLinks[0];
      
      const isQuizPublic = await ShowcaseCourseService.isAnonymousPublicQuiz(primaryQuiz.quizId);
      if (!isQuizPublic) {
        return res.json({ quiz: null });
      }

      res.json({
        quiz: {
          id: primaryQuiz.quizId,
          name: primaryQuiz.quizName,
          description: primaryQuiz.quizDescription,
        }
      });
    } catch (error: any) {
      console.error("[Public Lesson Quiz] Error:", error);
      res.status(500).json({ error: "Failed to get lesson quiz" });
    }
  });

  // Get quiz cards for anonymous public quizzes - NO AUTH REQUIRED
  router.get('/quiz/:quizId/cards', publicRateLimitMiddleware, async (req: Request, res: Response) => {
    try {
      const { quizId } = req.params;

      const hasAnonymousAccess = await ShowcaseCourseService.isAnonymousPublicQuiz(quizId);
      if (!hasAnonymousAccess) {
        return res.status(403).json({ error: "This quiz is not available for public access" });
      }

      // Get quiz collection details
      const collection = await storage.getQuizCollection(quizId);
      if (!collection) {
        return res.status(404).json({ error: "Quiz not found" });
      }

      // Get quiz cards
      const cards = await storage.getQuizCards(quizId);

      res.json({
        collection: {
          id: collection.id,
          name: collection.name,
          description: collection.description,
          passPercentage: collection.passPercentage,
        },
        cards: cards.map((card: any) => ({
          id: card.id,
          question: card.question,
          questionType: card.questionType,
          answer1: card.answer1,
          answer2: card.answer2,
          answer3: card.answer3,
          answer4: card.answer4,
          answer5: card.answer5,
          answer6: card.answer6,
          correctAnswerIndex: card.correctAnswerIndex,
          matchPairs: card.matchPairs,
          correctAnswer: card.correctAnswer,
          displayOrder: card.displayOrder,
        }))
      });
    } catch (error: any) {
      console.error("[Public Quiz Cards] Error:", error);
      res.status(500).json({ error: "Failed to get quiz cards" });
    }
  });

  // Public quiz explanation endpoint for anonymous public quizzes - NO AUTH REQUIRED
  router.get('/quiz/cards/:cardId/explain', publicRateLimitMiddleware, async (req: Request, res: Response) => {
    try {
      const { cardId } = req.params;

      // Get the card to find its collection
      const card = await storage.getQuizCard(cardId);
      if (!card) {
        return res.status(404).json({ error: "Quiz card not found" });
      }

      const hasAnonymousAccess = await ShowcaseCourseService.isAnonymousPublicQuiz(card.collectionId);
      if (!hasAnonymousAccess) {
        return res.status(403).json({ error: "This quiz is not available for public access" });
      }

      // Check if explanation already exists (cached)
      let explanation = await storage.getQuizCardExplanation(cardId);
      
      if (explanation) {
        // Return cached explanation
        const terms = await storage.getExplanationTerms(explanation.id);
        return res.json({
          id: explanation.id,
          cardId: explanation.cardId,
          explanation: explanation.explanation,
          createdAt: explanation.createdAt,
          terms: terms.map((t: any) => ({ term: t.term, definition: t.definition })),
        });
      }

      // Generate explanation using AI
      const { AIService } = await import("../ai/aiService");
      const aiService = await AIService.getActiveConfig();
      if (!aiService) {
        return res.status(503).json({ error: "AI service not configured" });
      }

      const collection = await storage.getQuizCollection(card.collectionId);
      
      // Build correct answer based on 1-based correctAnswerIndex
      const correctAnswer = card.answer1 && card.correctAnswerIndex === 1 ? card.answer1 : 
                  card.answer2 && card.correctAnswerIndex === 2 ? card.answer2 :
                  card.answer3 && card.correctAnswerIndex === 3 ? card.answer3 :
                  card.answer4 && card.correctAnswerIndex === 4 ? card.answer4 :
                  card.answer5 && card.correctAnswerIndex === 5 ? card.answer5 :
                  card.answer6 && card.correctAnswerIndex === 6 ? card.answer6 : 
                  card.correctAnswer || 'Unknown';

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: (aiService as any).apiKey });
      
      const prompt = `You are a helpful tutor explaining a quiz question.

Question: ${card.question}
Correct Answer: ${correctAnswer}

Provide a CONCISE explanation (maximum 100 words) that:
1. Explains why the correct answer is right
2. Uses simple language for learners

Respond in JSON format:
{
  "explanation": "Brief explanation text here (max 100 words)",
  "keyTerms": [{"term": "term1", "definition": "definition1"}]
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
      });

      let explanationText = "Unable to generate explanation";
      let keyTerms: Array<{ term: string; definition: string }> = [];

      const rawResponse = response.text?.replace(/```json\n?|\n?```/g, '').trim() || '';
      
      try {
        const parsed = JSON.parse(rawResponse);
        explanationText = parsed.explanation || rawResponse;
        keyTerms = parsed.keyTerms || [];
      } catch {
        explanationText = rawResponse;
      }

      // Save the explanation
      explanation = await storage.createQuizCardExplanation({
        cardId,
        explanation: explanationText
      });

      // Create and link terms
      const termIds: string[] = [];
      for (const termData of keyTerms) {
        if (termData.term && termData.definition) {
          const term = await storage.createTermDefinition({
            term: termData.term,
            definition: termData.definition
          });
          termIds.push(term.id);
        }
      }
      
      if (termIds.length > 0 && explanation) {
        await storage.linkExplanationToTerms(explanation.id, termIds);
      }

      const terms = explanation ? await storage.getExplanationTerms(explanation.id) : [];

      res.json({
        id: explanation?.id,
        cardId: explanation?.cardId,
        explanation: explanation?.explanation,
        createdAt: explanation?.createdAt,
        terms: terms.map((t: any) => ({ term: t.term, definition: t.definition })),
      });
    } catch (error: any) {
      console.error("[Public Quiz Explanation] Error:", error);
      res.status(500).json({ error: "Failed to get explanation" });
    }
  });

  return router;
}

/**
 * Register standalone public routes (not under /public prefix)
 * These include the card catalog and user status endpoints
 */
export function registerPublicStandaloneRoutes(app: any) {
  // Card collections route (public catalog)
  app.get("/api/collections", async (req: Request, res: Response) => {
    try {
      const collections = await storage.getCardCollections();
      res.json(collections);
    } catch (error) {
      console.error("Get collections error:", error);
      res.status(500).json({ error: "Failed to get collections" });
    }
  });

  // Get current user status (works for both authenticated and anonymous users)
  app.get("/api/user-status", optionalAuth, async (req: Request, res: Response) => {
    try {
      if (req.session.userId) {
        // Authenticated user
        const user = await storage.getUser(req.session.userId);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }
        
        // Use session context if available (optimized path)
        let organizationId: string | null = null;
        let organizationName: string | null = null;
        let userRoles: any[] = [];
        let isDemo: boolean = false;
        
        if (isFeatureEnabled('SESSION_AUTH_ENABLED') && req.session.context) {
          // Fast path: use cached session context (with impersonation support)
          const effectiveOrg = req.session.context.impersonatedOrganization || req.session.context.primaryOrganization;
          if (effectiveOrg) {
            organizationId = effectiveOrg.orgId;
            organizationName = effectiveOrg.orgName;
          }
          userRoles = req.session.context.organizations.flatMap((org) => 
            org.roles.map((role) => ({
              organizationId: org.orgId,
              role: role
            }))
          );
        } else {
          // Fallback: database lookup
          userRoles = await storage.getUserRoles(req.session.userId);
          organizationId = userRoles.length > 0 ? userRoles[0].organizationId : null;
          
          if (organizationId) {
            const organization = await storage.getOrganization(organizationId);
            organizationName = organization?.name || null;
            isDemo = organization?.isDemo || false;
          }
        }
        
        // For session context path, also get isDemo
        if (isFeatureEnabled('SESSION_AUTH_ENABLED') && req.session.context && organizationId && !isDemo) {
          const org = await storage.getOrganization(organizationId);
          isDemo = org?.isDemo || false;
        }
        
        res.json({ 
          id: user.id, 
          gamerName: user.gamerName, 
          email: user.email,
          isAuthenticated: true,
          firstName: user.firstName,
          lastName: user.lastName,
          avatarImageUrl: user.avatarImageUrl,
          country: user.country,
          bio: user.bio,
          playerTitle: user.playerTitle,
          preferredGameModes: user.preferredGameModes,
          isStatsPublic: user.isStatsPublic,
          totalGamesPlayed: user.totalGamesPlayed,
          totalWins: user.totalWins,
          winPercentage: user.winPercentage,
          bestWinStreak: user.bestWinStreak,
          currentWinStreak: user.currentWinStreak,
          averageGameDuration: user.averageGameDuration,
          lastActiveAt: user.lastActiveAt,
          createdAt: user.createdAt,
          organizationId: organizationId,
          organizationName: organizationName,
          organizationRoles: userRoles,
          isDemo
        });
      } else {
        // Anonymous/guest user - get or create guest session
        const guestId = req.session.anonymousUserId;
        if (!guestId) {
          return res.status(401).json({ error: "Authentication required" });
        }
        const guestSession = await storage.getOrCreateGuestSession(guestId);
        
        res.json({ 
          id: guestId,
          gamerName: guestSession.guestName,
          email: null,
          isAuthenticated: false
        });
      }
    } catch (error) {
      console.error("Error fetching user status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Health check endpoint
  app.get("/api/health", async (req: Request, res: Response) => {
    res.json({ status: "ok" });
  });
}
