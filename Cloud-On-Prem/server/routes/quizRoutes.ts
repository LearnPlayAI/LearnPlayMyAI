/**
 * Quiz Routes Module
 * 
 * Contains all quiz-related routes:
 * - /api/quiz-collections/* routes
 * - /api/quiz-cards/* routes
 * - /api/quiz/* routes
 * - /api/drafts/* routes (quiz drafts)
 * - /api/quizzes/* routes
 * 
 * Note: Does NOT include card-game collection routes (those are different from quiz collections)
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { storage, ADMIN_ROLES, INSTRUCTOR_ROLES, ALL_STAFF_ROLES } from '../storage';
import { quizPricingService } from '../services/quizPricingService';
import { AIService } from '../ai/aiService';
import { LessonService } from '../services/lessonService';
import { GoogleGenAI } from "@google/genai";
import { isFeatureEnabled } from '../featureFlags';
import { QUIZ_TIERS } from '@shared/creditConstants';
import { createHash } from 'crypto';
import { 
  insertQuizDraftSchema,
  quizCollections,
  quizCollectionAssignments,
  quizGameProgress,
  userQuizProgress,
  userOrganizationRoles,
  userOrganizationAssignments,
  organizationUnits,
  unitSubjects,
  lessonQuizLinks,
  lessons,
  lessonSlides,
  quizDrafts,
} from '@shared/schema';
import * as schema from '@shared/schema';
import { z } from 'zod';
import { eq, or, and, sql, inArray, desc } from 'drizzle-orm';
import {
  withSessionAuthMiddleware,
  resolveEffectiveOrganization,
  type RequestWithEffectiveOrg,
} from '../middleware/sessionAuthMiddleware';
import { optionalAuth } from './shared';
import { checkQuizCreationLimit } from '../usageLimitMiddleware';
import { HybridCreditService, InsufficientHybridCreditsError } from '../services/hybridCreditService';
import { ShowcaseCourseService } from '../services/showcaseCourseService';
import { randomUUID } from 'crypto';
import { QuizCourseLinkerService } from '../services/quizCourseLinkerService';
import { QuizVersioningService } from '../services/quizVersioningService';
import { courseLessons } from '@shared/schema';
import { ObjectStorageService } from '../objectStorage';

const router = Router();

function isCourseSourceAssetKey(imageKey?: string | null): boolean {
  return !!imageKey && (
    imageKey.includes('/source-asset/') ||
    imageKey.includes('/source-assets/') ||
    imageKey.startsWith('/private/')
  );
}

// ==================== QUIZ VERSIONING HELPERS ====================

/**
 * Calculate a hash of slide content for a given lesson version
 * Used to detect when slides have changed since quiz generation
 */
async function calculateSlideContentHash(lessonId: string, version: number): Promise<string | null> {
  const slides = await db
    .select({
      slideIndex: lessonSlides.slideIndex,
      title: lessonSlides.title,
      bullets: lessonSlides.bullets,
    })
    .from(lessonSlides)
    .where(
      and(
        eq(lessonSlides.lessonId, lessonId),
        eq(lessonSlides.version, version)
      )
    )
    .orderBy(lessonSlides.slideIndex);

  if (slides.length === 0) {
    return null;
  }

  const contentString = slides
    .map(s => `${s.slideIndex}:${s.title}:${(s.bullets || []).join('|')}`)
    .join('||');
  
  return createHash('sha256').update(contentString).digest('hex').substring(0, 16);
}

/**
 * Get the current versioning info for a lesson (currentSlideVersion and computed hash)
 */
async function getLessonVersioningInfo(lessonId: string): Promise<{
  presentationVersionId: number | null;
  slideContentHash: string | null;
}> {
  const [lesson] = await db
    .select({ currentSlideVersion: lessons.currentSlideVersion })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1);

  if (!lesson || !lesson.currentSlideVersion) {
    return { presentationVersionId: null, slideContentHash: null };
  }

  const hash = await calculateSlideContentHash(lessonId, lesson.currentSlideVersion);
  return {
    presentationVersionId: lesson.currentSlideVersion,
    slideContentHash: hash,
  };
}

/**
 * Check if a quiz is outdated by comparing stored hash with current slide content hash
 */
async function checkQuizOutdatedStatus(quizId: string): Promise<{
  isOutdated: boolean;
  currentHash: string | null;
  storedHash: string | null;
  presentationVersionId: number | null;
}> {
  const [link] = await db
    .select()
    .from(lessonQuizLinks)
    .where(eq(lessonQuizLinks.quizId, quizId))
    .limit(1);

  if (!link) {
    return { isOutdated: false, currentHash: null, storedHash: null, presentationVersionId: null };
  }

  const versioningInfo = await getLessonVersioningInfo(link.lessonId);
  const isOutdated = versioningInfo.slideContentHash !== link.slideContentHash;

  return {
    isOutdated,
    currentHash: versioningInfo.slideContentHash,
    storedHash: link.slideContentHash,
    presentationVersionId: link.presentationVersionId,
  };
}

/**
 * Mark all quizzes linked to a lesson as outdated
 * Called when slides are regenerated
 */
export async function markQuizzesAsOutdated(lessonId: string): Promise<number> {
  const result = await db
    .update(lessonQuizLinks)
    .set({ isOutdated: true })
    .where(eq(lessonQuizLinks.lessonId, lessonId))
    .returning();
  
  if (result.length > 0) {
    console.log(`[QuizVersioning] Marked ${result.length} quiz(es) as outdated for lesson ${lessonId}`);
  }
  
  return result.length;
}

// Helper function: Get user organization IDs from session or database
async function getUserOrganizationIds(userId: string, session?: any): Promise<string[]> {
  if (isFeatureEnabled('SESSION_AUTH_ENABLED') && session?.context) {
    const { effectiveRole, organizations, impersonatedOrganization } = session.context;
    const hasPlatformWideAccess = effectiveRole === 'SuperAdmin';

    if (hasPlatformWideAccess && impersonatedOrganization?.orgId) {
      return [impersonatedOrganization.orgId];
    }

    return organizations.map((org: any) => org.orgId);
  }
  
  const orgRoles = await storage.getUserRoles(userId);
  const orgIds = orgRoles.map((r: any) => r.organizationId);
  return Array.from(new Set(orgIds));
}

// Helper function: Check if user can access an organization
async function canAccessOrganization(
  userId: string,
  organizationId: string,
  session?: any,
  resolvedEffectiveOrgId?: string | null
): Promise<boolean> {
  if (isFeatureEnabled('SESSION_AUTH_ENABLED') && session?.context) {
    const { effectiveRole, organizations, impersonatedOrganization } = session.context;
    
    if (effectiveRole === 'SuperAdmin' && !impersonatedOrganization) {
      return true;
    }
    
    if (effectiveRole === 'SuperAdmin' && impersonatedOrganization) {
      return impersonatedOrganization.orgId === organizationId;
    }
    
    let effectiveOrgId = resolvedEffectiveOrgId;
    if (!effectiveOrgId) {
      const primaryOrg = session.context.primaryOrganization;
      effectiveOrgId = primaryOrg?.orgId || (organizations.length === 1 ? organizations[0].orgId : null);
    }
    
    if (!effectiveOrgId) {
      return false;
    }
    
    return organizationId === effectiveOrgId;
  }
  
  const user = await storage.getUser(userId);
  if (user?.isSuperAdmin) return true;
  
  const userRoles = await storage.getUserRoles(userId);
  if (userRoles.length === 0) return false;
  
  const effectiveOrgId = userRoles[0].organizationId;
  return organizationId === effectiveOrgId;
}

// Helper function: Load quiz for request and check access
async function loadQuizForRequest(req: Request, res: Response, quizId: string) {
  const [quiz] = await db
    .select()
    .from(quizCollections)
    .where(eq(quizCollections.id, quizId))
    .limit(1);

  if (!quiz) {
    res.status(404).json({ error: "Quiz not found" });
    return null;
  }

  if (quiz.organizationId) {
    const resolvedResult = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
    const resolvedEffectiveOrgId = resolvedResult?.organizationId || null;
    
    const hasAccess = await canAccessOrganization(req.session.userId!, quiz.organizationId, req.session, resolvedEffectiveOrgId);
    if (!hasAccess) {
      // Check if quiz belongs to a showcase course (accessible without enrollment)
      const isShowcase = await ShowcaseCourseService.isShowcaseQuiz(quizId);
      if (isShowcase) {
        // Showcase quizzes are accessible to all authenticated users
        return quiz;
      }

      res.status(403).json({ error: "Access denied: You cannot access quizzes from other organizations" });
      return null;
    }
  }

  return quiz;
}

// Middleware: Require quiz organization access (for routes with :quizId param)
async function requireQuizOrgAccess(req: Request, res: Response, next: any) {
  const quizId = req.params.quizId;
  if (!quizId) {
    return res.status(400).json({ error: "Quiz ID required" });
  }

  const quiz = await loadQuizForRequest(req, res, quizId);
  if (!quiz) {
    return;
  }

  (req as any).quiz = quiz;
  next();
}

// Middleware: Require organization access
async function requireOrgAccess(req: Request, res: Response, next: any) {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const resolvedResult = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
  const resolvedEffectiveOrgId = resolvedResult?.organizationId || null;
  const requestedOrgId = (req.query.organizationId as string) || req.body?.organizationId || resolvedEffectiveOrgId;
  if (!requestedOrgId) {
    return res.status(400).json({ error: "Organization ID required" });
  }
  
  const hasAccess = await canAccessOrganization(userId, requestedOrgId, req.session, resolvedEffectiveOrgId);
  if (!hasAccess) {
    return res.status(403).json({ error: "Access denied" });
  }

  // Make resolved org available to downstream handlers.
  (req as any).scopedOrganizationId = requestedOrgId;
  next();
}

function getScopedOrganizationId(req: Request): string | undefined {
  return (req as any).scopedOrganizationId ||
    (req.query.organizationId as string | undefined) ||
    req.body?.organizationId;
}

// ==================== QUIZ DRAFTS ROUTES ====================

router.get("/drafts", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const user = await storage.getUser(req.session.userId!);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    const organizationId = getScopedOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: "Organization ID required" });
    }

    if (!user.isSuperAdmin && !user.isCustSuper) {
      const roles = await storage.getUserRoles(user.id, organizationId);
      if (roles.length === 0) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const drafts = await storage.getQuizDrafts(organizationId, user.id);
    res.json(drafts);
  } catch (error) {
    console.error("Get drafts error:", error);
    res.status(500).json({ error: "Failed to get drafts" });
  }
});

router.post("/drafts", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const user = await storage.getUser(req.session.userId!);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    const lessonId = req.body?.lessonId;
    const organizationId = getScopedOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: "Organization ID required" });
    }

    if (!user.isSuperAdmin && !user.isCustSuper) {
      const roles = await storage.getUserRoles(user.id, organizationId);
      const hasPermission = roles.some((r: any) => 
        ALL_STAFF_ROLES.includes(r.role)
      );
      if (!hasPermission) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    // If lessonId is provided, verify the lesson is linked to a course
    // and warn if not (but don't block - users can still create standalone quizzes)
    let courseContext: { courseId: string; courseName: string } | null = null;
    if (lessonId) {
      const courseLessonLinks = await db
        .select({
          courseId: courseLessons.courseId,
        })
        .from(courseLessons)
        .where(eq(courseLessons.lessonId, lessonId))
        .limit(1);
      
      if (courseLessonLinks.length > 0) {
        courseContext = { courseId: courseLessonLinks[0].courseId, courseName: '' };
        console.log(`[QuizDraft] Creating draft for lesson ${lessonId} linked to course ${courseContext.courseId}`);
      } else {
        console.warn(`[QuizDraft] Creating draft for lesson ${lessonId} which is NOT linked to any course. Quiz may not appear in course validation.`);
      }
    }

    const data = insertQuizDraftSchema.parse({
      ...req.body,
      organizationId,
      createdBy: user.id
    });
    
    const draft = await storage.createQuizDraft(data);
    
    // Create provisional quiz-lesson link at draft creation time
    // This ensures the quiz appears in course validation even before publish
    if (lessonId && draft.id) {
      try {
        // Create a provisional quiz collection entry first (if needed for linking)
        // The actual link will use the draft's eventual published quiz ID
        console.log(`[QuizDraft] Draft ${draft.id} created with lessonId ${lessonId}. Provisional link will be created on publish.`);
        
        // Store the lessonId in the draft for later linking during publish
        // The actual lessonQuizLinks entry is created on publish since we need the quiz collection ID
      } catch (linkError) {
        console.error(`[QuizDraft] Failed to create provisional link for draft ${draft.id}:`, linkError);
        // Non-blocking - draft creation still succeeds
      }
    }
    
    res.json(draft);
  } catch (error: any) {
    console.error("Create draft error:", error);
    res.status(400).json({ error: error.message || "Failed to create draft" });
  }
});

router.get("/drafts/:id", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const user = await storage.getUser(req.session.userId!);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    const organizationId = getScopedOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: "Organization ID required" });
    }

    const draft = await storage.getQuizDraft(req.params.id, organizationId);
    if (!draft) {
      return res.status(404).json({ error: "Draft not found" });
    }

    res.json(draft);
  } catch (error) {
    console.error("Get draft error:", error);
    res.status(500).json({ error: "Failed to get draft" });
  }
});

// Partial schema for quiz draft updates - allows any subset of fields
const updateQuizDraftSchema = insertQuizDraftSchema.partial();

router.patch("/drafts/:id", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const user = await storage.getUser(req.session.userId!);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    const organizationId = getScopedOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: "Organization ID required" });
    }

    // Validate update payload with partial schema to ensure lessonId and other fields are preserved
    const validatedUpdates = updateQuizDraftSchema.parse(req.body);

    const draft = await storage.updateQuizDraft(req.params.id, organizationId, validatedUpdates);
    if (!draft) {
      return res.status(404).json({ error: "Draft not found" });
    }

    res.json(draft);
  } catch (error: any) {
    console.error("Update draft error:", error);
    res.status(400).json({ error: error.message || "Failed to update draft" });
  }
});

router.delete("/drafts/:id", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const user = await storage.getUser(req.session.userId!);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    const organizationId = getScopedOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: "Organization ID required" });
    }

    const deleted = await storage.deleteQuizDraft(req.params.id, organizationId);
    if (!deleted) {
      return res.status(404).json({ error: "Draft not found" });
    }

    res.json({ message: "Draft deleted successfully" });
  } catch (error) {
    console.error("Delete draft error:", error);
    res.status(500).json({ error: "Failed to delete draft" });
  }
});

router.post("/drafts/:id/publish", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const user = await storage.getUser(req.session.userId!);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    const organizationId = getScopedOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: "Organization ID required" });
    }

    if (!user.isSuperAdmin && !user.isCustSuper) {
      const roles = await storage.getUserRoles(user.id, organizationId);
      const hasPermission = roles.some((r: any) => 
        ALL_STAFF_ROLES.includes(r.role)
      );
      if (!hasPermission) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const draft = await storage.getQuizDraft(req.params.id, organizationId);
    if (!draft) {
      return res.status(404).json({ error: "Draft not found" });
    }

    let questions = draft.generatedQuestions;
    if (typeof questions === 'string') {
      questions = JSON.parse(questions);
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "No questions found in draft" });
    }

    const selectedQuestions = questions.filter((q: any) => q.selected !== false);
    if (selectedQuestions.length === 0) {
      return res.status(400).json({ error: "No questions selected for publishing" });
    }

    let collection;
    let oldCards: any[] = [];
    
    if (draft.publishedCollectionId) {
      collection = await storage.updateQuizCollection(draft.publishedCollectionId, {
        name: draft.quizName || draft.name || "Untitled Quiz",
        description: draft.quizDescription || draft.description || "",
        subjectId: draft.subjectId || null,
        passPercentage: draft.passPercentage || 70,
        isPublic: draft.isPublic || false,
        isActive: true,
      });
      
      oldCards = await storage.getQuizCards(draft.publishedCollectionId);
    } else {
      collection = await storage.createQuizCollection({
        name: draft.quizName || draft.name || "Untitled Quiz",
        description: draft.quizDescription || draft.description || "",
        organizationId: organizationId,
        subjectId: draft.subjectId || null,
        createdBy: user.id,
        passPercentage: draft.passPercentage || 70,
        isPublic: draft.isPublic || false,
        isActive: true,
      });
    }

    if (!collection) {
      throw new Error("Failed to create or update quiz collection");
    }

    let displayOrder = 1;
    const newCardIds: string[] = [];
    
    for (const q of selectedQuestions) {
      const questionType = q.questionType || 'multiple-choice';
      const cardData: any = {
        collectionId: collection.id,
        question: q.question,
        questionType: questionType,
        displayOrder: displayOrder++,
      };
      if (q.imageKey) {
        cardData.imageKey = q.imageKey;
      }

      if (questionType === 'multiple-choice' || questionType === 'true-false') {
        cardData.answer1 = q.answers?.[0] || "";
        cardData.answer2 = q.answers?.[1] || "";
        cardData.answer3 = q.answers?.[2] || "";
        cardData.answer4 = q.answers?.[3] || "";
        cardData.answer5 = q.answers?.[4] || "";
        cardData.answer6 = q.answers?.[5] || "";
        // AI returns correctIndex (0-based), database stores correctAnswerIndex (1-based)
        // Convert from 0-based to 1-based for storage
        cardData.correctAnswerIndex = (q.correctIndex !== undefined ? q.correctIndex : 0) + 1;
      } else if (questionType === 'fill-blank') {
        cardData.correctAnswer = q.correctAnswer || "";
      } else if (questionType === 'match') {
        cardData.matchPairs = q.matchPairs || [];
      }

      const card = await storage.createQuizCard(cardData);
      newCardIds.push(card.id);
    }

    if (oldCards.length > 0) {
      for (const oldCard of oldCards) {
        await storage.deleteQuizCard(oldCard.id);
      }
    }

    await storage.updateQuizCollectionTotalCards(collection.id, newCardIds.length);

    const sourceLessonId = draft.lessonId;
    if (sourceLessonId) {
      try {
        // Get lesson versioning info for quiz-slide tracking
        const versioningInfo = await getLessonVersioningInfo(sourceLessonId);
        
        const existingLink = await db.select()
          .from(lessonQuizLinks)
          .where(and(
            eq(lessonQuizLinks.lessonId, sourceLessonId),
            eq(lessonQuizLinks.quizId, collection.id)
          ))
          .limit(1);
        
        if (existingLink.length === 0) {
          await db.insert(lessonQuizLinks).values({
            lessonId: sourceLessonId,
            quizId: collection.id,
            isPrimary: true,
            presentationVersionId: versioningInfo.presentationVersionId,
            slideContentHash: versioningInfo.slideContentHash,
            isOutdated: false,
          });
          console.log(`[QuizPublish] Created lesson-quiz link with versioning: lesson ${sourceLessonId} -> quiz ${collection.id}, version=${versioningInfo.presentationVersionId}, hash=${versioningInfo.slideContentHash}`);
        } else {
          // Update existing link with new versioning info (quiz was republished)
          await db.update(lessonQuizLinks)
            .set({
              isPrimary: true,
              presentationVersionId: versioningInfo.presentationVersionId,
              slideContentHash: versioningInfo.slideContentHash,
              isOutdated: false,
            })
            .where(eq(lessonQuizLinks.id, existingLink[0].id));
          console.log(`[QuizPublish] Updated lesson-quiz link versioning: quiz ${collection.id}, version=${versioningInfo.presentationVersionId}, hash=${versioningInfo.slideContentHash}`);
        }

        const courseLessonsToUpdate = await db.select()
          .from(schema.courseLessons)
          .where(eq(schema.courseLessons.lessonId, sourceLessonId));
        
        if (courseLessonsToUpdate.length > 0) {
          await db.update(schema.courseLessons)
            .set({ primaryQuizId: collection.id })
            .where(eq(schema.courseLessons.lessonId, sourceLessonId));
          console.log(`Auto-linked quiz ${collection.id} to ${courseLessonsToUpdate.length} courseLessons row(s) for lesson ${sourceLessonId}`);
        }
      } catch (error) {
        console.error("Failed to auto-link quiz to lesson:", error);
      }
    }

    await storage.deleteQuizDraft(req.params.id, organizationId);

    res.json({ 
      message: "Quiz published successfully",
      collection 
    });
  } catch (error: any) {
    console.error("Publish draft error:", error);
    res.status(500).json({ error: error.message || "Failed to publish quiz" });
  }
});

// Convert Published Quiz to Draft for Editing
router.post("/quiz-collections/:collectionId/to-draft", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await storage.getUser(req.session.userId!);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    const { collectionId } = req.params;
    const { organizationId } = req.body;

    if (!organizationId) {
      return res.status(400).json({ error: "Organization ID required" });
    }

    if (!user.isSuperAdmin) {
      const roles = await storage.getUserRoles(user.id, organizationId);
      const hasPermission = roles.some((r: any) => 
        ALL_STAFF_ROLES.includes(r.role)
      );
      if (!hasPermission) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const collection = await storage.getQuizCollection(collectionId);
    if (!collection) {
      return res.status(404).json({ error: "Quiz collection not found" });
    }

    if (collection.organizationId !== organizationId) {
      return res.status(403).json({ error: "Quiz collection does not belong to this organization" });
    }

    const cards = await storage.getQuizCards(collectionId);

    const generatedQuestions = cards.map((card: any, index: number) => {
      const questionType = card.questionType || 'multiple-choice';
      
      if (questionType === 'match') {
        return {
          question: card.question,
          questionType,
          matchPairs: card.matchPairs || [],
          selected: true,
          originalCardId: card.id,
        };
      } else if (questionType === 'fill-blank') {
        return {
          question: card.question,
          questionType,
          correctAnswer: card.correctAnswer || "",
          selected: true,
          originalCardId: card.id,
        };
      } else {
        return {
          question: card.question,
          questionType,
          answers: [
            card.answer1,
            card.answer2,
            card.answer3,
            card.answer4,
            card.answer5,
            card.answer6,
          ].filter(a => a && a.trim()),
          correctAnswerIndex: card.correctAnswerIndex,
          selected: true,
          originalCardId: card.id,
        };
      }
    });

    const draftData = {
      organizationId,
      createdBy: user.id,
      name: collection.name,
      quizName: collection.name,
      quizDescription: collection.description || "",
      subjectId: collection.subjectId,
      passPercentage: collection.passPercentage || 70,
      isPublic: collection.isPublic || false,
      generatedQuestions,
      publishedCollectionId: collectionId,
      status: 'generated' as const,
    };

    const draft = await storage.createQuizDraft(draftData);

    res.json({
      message: "Quiz converted to draft for editing",
      draft,
    });
  } catch (error: any) {
    console.error("Convert to draft error:", error);
    res.status(500).json({ error: error.message || "Failed to convert quiz to draft" });
  }
});

// ==================== QUIZ LEADERBOARD ====================

router.get("/quiz-leaderboard", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const unitId = req.query.unitId as string | undefined;
    const subUnitId = req.query.subUnitId as string | undefined;
    const subjectId = req.query.subjectId as string | undefined;
    const days = parseInt(req.query.days as string) || undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const collectionType = req.query.collectionType as 'public' | 'organization' | undefined;

    let organizationId: string | undefined = req.query.organizationId as string | undefined;
    
    if (!organizationId) {
      if (user.isSuperAdmin) {
        organizationId = undefined;
      } else {
        const orgRoles = await storage.getUserRoles(userId);
        if (orgRoles && orgRoles.length > 0) {
          organizationId = orgRoles[0].organizationId;
        }
      }
    }

    const leaderboard = await storage.getQuizLeaderboard({
      organizationId,
      unitId,
      subUnitId,
      subjectId,
      days,
      limit,
      collectionType
    });

    const parsedLeaderboard = leaderboard.map((player: any) => ({
      ...player,
      equippedCosmetics: player.equippedCosmetics 
        ? (typeof player.equippedCosmetics === 'string' 
            ? JSON.parse(player.equippedCosmetics) 
            : player.equippedCosmetics)
        : null
    }));

    res.json(parsedLeaderboard);
  } catch (error) {
    console.error("Get quiz leaderboard error:", error);
    res.status(500).json({ error: "Failed to get quiz leaderboard" });
  }
});

// ==================== QUIZ PRICING ====================

router.get("/quiz-pricing", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    let organizationId: string | null = null;
    
    if (req.query.organizationId) {
      organizationId = req.query.organizationId as string;
    } else if (req.session.context && req.session.context.organizations && req.session.context.organizations.length > 0) {
      organizationId = req.session.context.organizations[0].orgId;
    } else {
      const userOrgIds = await getUserOrganizationIds(userId, req.session);
      if (userOrgIds.length > 0) {
        organizationId = userOrgIds[0];
      }
    }
    
    const pricingResult = await quizPricingService.getEffectivePricing(organizationId);
    
    const enrichedTiers = pricingResult.tiers.map(tierPricing => ({
      tier: tierPricing.tier,
      creditCost: tierPricing.creditCost,
      questionCount: QUIZ_TIERS[tierPricing.tier].questionCount,
      label: QUIZ_TIERS[tierPricing.tier].label,
    }));
    
    res.json({
      tiers: enrichedTiers,
      organizationId: pricingResult.organizationId,
    });
  } catch (error) {
    console.error('Get quiz pricing error:', error);
    res.status(500).json({ error: "Failed to fetch quiz pricing" });
  }
});

// ==================== QUIZ COLLECTIONS ROUTES ====================

router.post("/admin/quiz-collections", withSessionAuthMiddleware, checkQuizCreationLimit, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    let organizationId = req.body.organizationId;
    
    if (!organizationId && !req.body.isPublic) {
      const userRoles = await db
        .select()
        .from(userOrganizationRoles)
        .where(eq(userOrganizationRoles.userId, userId));
      
      if (userRoles.length > 0) {
        organizationId = userRoles[0].organizationId;
      }
    }

    const collection = await storage.createQuizCollection({ 
      ...req.body, 
      organizationId,
      createdBy: userId 
    });
    res.json(collection);
  } catch (error) {
    console.error('Create quiz collection error:', error);
    res.status(500).json({ error: "Failed to create quiz collection" });
  }
});

router.get("/admin/quiz-collections", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { organizationId, page, pageSize } = req.query;
    
    if (!req.session.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    if (!organizationId) {
      return res.status(400).json({ error: "Organization ID required" });
    }
    
    await requireOrgAccess(req, res, () => {});
    if (res.headersSent) return;
    
    const pageNum = page ? parseInt(page as string, 10) : undefined;
    const pageSizeNum = pageSize ? parseInt(pageSize as string, 10) : undefined;
    
    const collections = await storage.getQuizCollections(
      organizationId as string,
      pageNum,
      pageSizeNum
    );
    res.json(collections);
  } catch (error) {
    console.error('Get admin quiz collections error:', error);
    res.status(500).json({ error: "Failed to fetch quiz collections" });
  }
});

router.get("/quiz-collections", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { organizationId } = req.query;
    
    const collections = await storage.getQuizCollectionsForUserAccess(
      userId,
      organizationId as string | undefined
    );
    res.json(collections);
  } catch (error) {
    console.error('Get quiz collections error:', error);
    res.status(500).json({ error: "Failed to fetch quiz collections" });
  }
});

router.get("/users/:userId/quiz-collections", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const requestingUserId = req.session.userId!;
    const targetUserId = req.params.userId;
    
    if (requestingUserId !== targetUserId) {
      const requestingUser = await storage.getUser(requestingUserId);
      
      if (!requestingUser?.isSuperAdmin) {
        const requestingUserRoles = await storage.getUserRoles(requestingUserId);
        const targetUserRoles = await storage.getUserRoles(targetUserId);
        
        const requestingUserOrgIds = requestingUserRoles
          .filter((r: any) => ALL_STAFF_ROLES.includes(r.role))
          .map((r: any) => r.organizationId);
        const targetUserOrgIds = targetUserRoles.map((r: any) => r.organizationId);
        
        const sharedOrgIds = requestingUserOrgIds.filter((orgId: string) => 
          targetUserOrgIds.includes(orgId)
        );
        
        if (sharedOrgIds.length === 0) {
          return res.status(403).json({ 
            error: "Access denied: You can only view quiz collections for users in your organization" 
          });
        }
      }
    }
    
    const collections = await storage.getQuizCollectionsForUserAccess(req.params.userId);
    res.json(collections);
  } catch (error) {
    console.error('Get user quiz collections error:', error);
    res.status(500).json({ error: "Failed to fetch quiz collections" });
  }
});

router.get("/quiz-collections/:id", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const collection = await storage.getQuizCollection(req.params.id);
    if (!collection) {
      return res.status(404).json({ error: "Quiz collection not found" });
    }
    
    if (collection.organizationId) {
      const canAccess = await canAccessOrganization(userId, collection.organizationId);
      if (!canAccess) {
        return res.status(403).json({ error: "Access denied: You cannot view quiz collections from other organizations" });
      }
    }
    
    res.json(collection);
  } catch (error) {
    console.error('Get quiz collection error:', error);
    res.status(500).json({ error: "Failed to fetch quiz collection" });
  }
});

router.put("/admin/quiz-collections/:id", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const collection = await storage.getQuizCollection(req.params.id);
    
    if (!collection) {
      return res.status(404).json({ error: "Quiz collection not found" });
    }
    
    if (collection.organizationId) {
      const canAccess = await canAccessOrganization(userId, collection.organizationId);
      if (!canAccess) {
        return res.status(403).json({ error: "Access denied: You cannot modify quiz collections from other organizations" });
      }
    }

    const contentFields = ['name', 'description', 'passPercentage', 'difficulty', 'totalCards'];
    const hasContentChange = contentFields.some(field => field in req.body && req.body[field] !== (collection as any)[field]);
    if (hasContentChange) {
      try {
        await QuizVersioningService.createVersion(req.params.id, {
          changeDescription: 'Collection settings updated',
          editedBy: userId,
          organizationId: collection.organizationId || undefined,
        });
      } catch (versionError) {
        console.error('[QuizVersioning] Failed to create version before collection update:', versionError);
      }
    }
    
    const updatedCollection = await storage.updateQuizCollection(req.params.id, req.body);
    res.json(updatedCollection);
  } catch (error) {
    console.error('Update quiz collection error:', error);
    res.status(500).json({ error: "Failed to update quiz collection" });
  }
});

router.delete("/admin/quiz-collections/:id", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    
    const collection = await storage.getQuizCollection(req.params.id);
    if (!collection) {
      return res.status(404).json({ error: "Quiz collection not found" });
    }

    console.log(`[DELETE quiz-collection] User ${userId} attempting to delete collection ${req.params.id}, orgId: ${collection.organizationId}`);

    if (collection.organizationId) {
      const canAccess = await canAccessOrganization(userId, collection.organizationId);
      console.log(`[DELETE quiz-collection] canAccessOrganization result: ${canAccess}`);
      if (!canAccess) {
        const userRoles = await storage.getUserRoles(userId);
        console.log(`[DELETE quiz-collection] User roles:`, userRoles);
        return res.status(403).json({ error: "You don't have permission to delete this quiz collection" });
      }
    } else {
      const user = await storage.getUser(userId);
      if (!user?.isSuperAdmin) {
        return res.status(403).json({ error: "Only SuperAdmins can delete public quiz collections" });
      }
    }

    await storage.deleteQuizCollection(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete quiz collection error:', error);
    res.status(500).json({ error: "Failed to delete quiz collection" });
  }
});

router.get("/quiz/collections/public", async (req: Request, res: Response) => {
  try {
    const allCollections = await storage.getQuizCollections();
    const publicCollections = allCollections
      .filter((c: any) => c.isPublic && c.isActive && !c.isDeleted)
      .map((c: any) => ({
        ...c,
        cardCount: c.totalCards || 0
      }));
    res.json(publicCollections);
  } catch (error) {
    console.error('Get public quiz collections error:', error);
    res.status(500).json({ error: "Failed to fetch public quiz collections" });
  }
});

router.get("/quiz/collections/organization", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.json([]);
    }
    const collections = await storage.getQuizCollectionsForUserAccess(req.session.userId);
    const formattedCollections = collections.map((c: any) => ({
      ...c,
      cardCount: c.totalCards || 0
    }));
    res.json(formattedCollections);
  } catch (error) {
    console.error('Get organization quiz collections error:', error);
    res.status(500).json({ error: "Failed to fetch organization quiz collections" });
  }
});

router.get("/quiz/collections", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      const publicCollections = await storage.getQuizCollections();
      return res.json(publicCollections.filter((c: any) => c.isPublic));
    }
    
    const userRoles = await db
      .select()
      .from(userOrganizationRoles)
      .where(eq(userOrganizationRoles.userId, userId));
    
    const allCollections = await storage.getQuizCollections();
    
    if (userRoles.length === 0) {
      return res.json(allCollections.filter((c: any) => c.isPublic));
    }
    
    const orgId = userRoles[0].organizationId;
    
    const filteredCollections = allCollections.filter((c: any) => 
      c.isPublic || c.organizationId === orgId
    );
    
    res.json(filteredCollections);
  } catch (error) {
    console.error('Get quiz collections error:', error);
    res.status(500).json({ error: "Failed to fetch quiz collections" });
  }
});

// ==================== QUIZ CARDS ROUTES ====================

router.post("/admin/quiz-collections/:collectionId/cards", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    
    const collection = await storage.getQuizCollection(req.params.collectionId);
    if (!collection) {
      return res.status(404).json({ error: "Quiz collection not found" });
    }
    
    if (collection.organizationId) {
      const canAccess = await canAccessOrganization(userId, collection.organizationId);
      if (!canAccess) {
        return res.status(403).json({ error: "Access denied: You cannot add cards to quiz collections from other organizations" });
      }
    }
    
    const card = await storage.createQuizCard({ ...req.body, collectionId: req.params.collectionId });
    res.json(card);
  } catch (error) {
    console.error('Create quiz card error:', error);
    res.status(500).json({ error: "Failed to create quiz card" });
  }
});

router.post("/admin/quiz-collections/:collectionId/cards/bulk-csv", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { csvData } = req.body;
    
    if (!csvData || typeof csvData !== 'string') {
      return res.status(400).json({ error: "CSV data is required" });
    }
    
    const collection = await storage.getQuizCollection(req.params.collectionId);
    if (!collection) {
      return res.status(404).json({ error: "Quiz collection not found" });
    }
    
    if (collection.organizationId) {
      const canAccess = await canAccessOrganization(userId, collection.organizationId);
      if (!canAccess) {
        return res.status(403).json({ error: "Access denied: You cannot add cards to quiz collections from other organizations" });
      }
    }
    
    const lines = csvData.trim().split('\n');
    if (lines.length < 2) {
      return res.status(400).json({ error: "CSV must contain at least a header row and one data row" });
    }
    
    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const delimiter = semicolonCount > commaCount ? ';' : ',';
    
    const dataLines = lines.slice(1);
    const createdCards = [];
    const errors = [];
    
    const existingCards = await storage.getQuizCards(req.params.collectionId);
    let displayOrder = existingCards.length;
    
    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i].trim();
      if (!line) continue;
      
      try {
        const fields = [];
        let currentField = '';
        let inQuotes = false;
        
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === delimiter && !inQuotes) {
            fields.push(currentField.trim());
            currentField = '';
          } else {
            currentField += char;
          }
        }
        fields.push(currentField.trim());
        
        if (fields.length < 8) {
          const errorMsg = `Row ${i + 2}: Expected 8 fields (question, 6 answers, correct answer), got ${fields.length}. Fields: ${JSON.stringify(fields)}`;
          console.log(errorMsg);
          errors.push(errorMsg);
          continue;
        }
        
        const [question, answer1, answer2, answer3, answer4, answer5, answer6, correctAnswerStr] = fields;
        const correctAnswerIndex = parseInt(correctAnswerStr);
        
        console.log(`Row ${i + 2}: fields parsed - q:"${question}", a1:"${answer1}", a2:"${answer2}", a3:"${answer3}", a4:"${answer4}", a5:"${answer5}", a6:"${answer6}", correct:"${correctAnswerStr}"`);
        
        if (!question || question.trim() === '') {
          errors.push(`Row ${i + 2}: Question is required (got: "${question}")`);
          continue;
        }
        if (!answer1 || !answer2 || !answer3 || !answer4 || !answer5 || !answer6) {
          errors.push(`Row ${i + 2}: All 6 answers are required (missing: ${[!answer1&&'a1',!answer2&&'a2',!answer3&&'a3',!answer4&&'a4',!answer5&&'a5',!answer6&&'a6'].filter(Boolean).join(',')})`);
          continue;
        }
        if (isNaN(correctAnswerIndex) || correctAnswerIndex < 1 || correctAnswerIndex > 6) {
          errors.push(`Row ${i + 2}: Correct answer must be a number between 1 and 6 (got: "${correctAnswerStr}")`);
          continue;
        }
        
        const card = await storage.createQuizCard({
          collectionId: req.params.collectionId,
          question: question.replace(/^"|"$/g, ''),
          answer1: answer1.replace(/^"|"$/g, ''),
          answer2: answer2.replace(/^"|"$/g, ''),
          answer3: answer3.replace(/^"|"$/g, ''),
          answer4: answer4.replace(/^"|"$/g, ''),
          answer5: answer5.replace(/^"|"$/g, ''),
          answer6: answer6.replace(/^"|"$/g, ''),
          correctAnswerIndex,
          displayOrder: displayOrder++,
        });
        
        createdCards.push(card);
      } catch (error) {
        errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : 'Failed to create card'}`);
      }
    }
    
    res.json({
      success: true,
      created: createdCards.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully created ${createdCards.length} quiz cards${errors.length > 0 ? ` with ${errors.length} errors` : ''}`
    });
  } catch (error) {
    console.error('Bulk CSV upload error:', error);
    res.status(500).json({ error: "Failed to process CSV upload" });
  }
});

router.get("/quiz-collections/:collectionId/cards", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const cards = await storage.getQuizCards(req.params.collectionId);
    res.json(cards);
  } catch (error) {
    console.error('Get quiz cards error:', error);
    res.status(500).json({ error: "Failed to fetch quiz cards" });
  }
});

router.get("/quiz-cards/:id/image", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const card = await storage.getQuizCard(req.params.id);
    if (!card?.imageKey || !isCourseSourceAssetKey(card.imageKey)) {
      return res.status(404).json({ error: "Quiz card image not found" });
    }

    const objectStorageService = new ObjectStorageService();
    const signedUrl = await objectStorageService.getCourseSourceAssetSignedURL(card.imageKey, 900);
    return res.redirect(signedUrl);
  } catch (error) {
    console.error('Get quiz card image error:', error);
    res.status(500).json({ error: "Failed to fetch quiz card image" });
  }
});

router.get("/quiz-cards/:id", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const card = await storage.getQuizCard(req.params.id);
    if (!card) {
      return res.status(404).json({ error: "Quiz card not found" });
    }
    res.json(card);
  } catch (error) {
    console.error('Get quiz card error:', error);
    res.status(500).json({ error: "Failed to fetch quiz card" });
  }
});

router.get("/quiz-cards/:cardId/explanation", async (req: Request, res: Response) => {
  try {
    const { cardId } = req.params;
    
    let explanation = await storage.getQuizCardExplanation(cardId);
    
    if (!explanation) {
      // Require authentication for AI generation
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required for AI explanation generation" });
      }
      
      const userRoles = await storage.getUserRoles(req.session.userId);
      if (userRoles.length === 0) {
        return res.status(403).json({ error: "No organization membership found" });
      }
      
      // Note: Viewing explanations during quiz gameplay is FREE
      // Credits are only charged for bulk generation via the admin "Generate Explanations" button
      
      const card = await storage.getQuizCard(cardId);
      if (!card) {
        return res.status(404).json({ error: "Quiz card not found" });
      }
      
      const collection = await storage.getQuizCollection(card.collectionId);
      const quizLanguage = collection?.languageCode || 'en';
      
      const aiService = await AIService.getActiveConfig();
      if (!aiService) {
        return res.status(503).json({ error: "AI service not configured" });
      }
      
      let subjectName: string | undefined;
      let gradeName: string | undefined;
      if (collection?.subjectId) {
        const subject = await storage.getSubject(collection.subjectId);
        if (subject) {
          subjectName = subject.name;
          
          const unitSubjectsData = await db.select()
            .from(unitSubjects)
            .where(eq(unitSubjects.subjectId, collection.subjectId))
            .limit(1);
          
          if (unitSubjectsData.length > 0) {
            const unit = await storage.getOrganizationUnit(unitSubjectsData[0].unitId);
            if (unit) {
              gradeName = unit.name;
            }
          }
        }
      }
      
      const ai = new GoogleGenAI({ apiKey: (aiService as any).apiKey });
      
      const contextParts = [];
      if (subjectName) contextParts.push(`Subject: ${subjectName}`);
      if (gradeName) contextParts.push(`Grade: ${gradeName}`);
      if (collection?.name) contextParts.push(`Quiz: ${collection.name}`);
      
      const contextString = contextParts.length > 0 
        ? `Context: ${contextParts.join(', ')}\n\n` 
        : '';
      
      const correctAnswer = card.answer1 && card.correctAnswerIndex === 1 ? card.answer1 : 
                  card.answer2 && card.correctAnswerIndex === 2 ? card.answer2 :
                  card.answer3 && card.correctAnswerIndex === 3 ? card.answer3 :
                  card.answer4 && card.correctAnswerIndex === 4 ? card.answer4 :
                  card.answer5 && card.correctAnswerIndex === 5 ? card.answer5 :
                  card.answer6 && card.correctAnswerIndex === 6 ? card.answer6 : 'Unknown';

      const languageInstruction = quizLanguage !== 'en' ? `\nIMPORTANT: Respond ENTIRELY in ${quizLanguage} language. All text including the explanation and key term definitions must be in ${quizLanguage}.\n` : '';
      const prompt = `${contextString}You are a helpful tutor explaining a quiz question.${languageInstruction}

Question: ${card.question}
Correct Answer: ${correctAnswer}

Provide a CONCISE explanation (maximum 100 words) that:
1. Explains why the correct answer is right
2. Identifies 2-3 key terms from the question/answer with brief definitions

Format your response as JSON only (no markdown, no code blocks):
{
  "explanation": "Brief explanation text here (max 100 words)",
  "keyTerms": [
    { "term": "word1", "definition": "Short definition (10-15 words max)" },
    { "term": "word2", "definition": "Short definition (10-15 words max)" }
  ]
}`;

      const response = await ai.models.generateContent({
        model: (aiService as any).modelName || 'gemini-2.0-flash',
        contents: prompt
      });
      
      const rawResponse = response.text || "";
      
      let explanationText = "Unable to generate explanation";
      let keyTerms: Array<{ term: string; definition: string }> = [];
      
      try {
        // Clean up the response - remove markdown code blocks if present
        let jsonStr = rawResponse.trim();
        if (jsonStr.startsWith('```json')) {
          jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        
        const parsed = JSON.parse(jsonStr);
        explanationText = parsed.explanation || rawResponse;
        keyTerms = parsed.keyTerms || [];
      } catch (parseError) {
        console.warn('[QuizExplanation] Failed to parse JSON response, using raw text:', parseError);
        explanationText = rawResponse;
      }
      
      // Create the explanation record
      explanation = await storage.createQuizCardExplanation({
        cardId,
        explanation: explanationText,
      });
      
      // Create term definitions and link them to the explanation
      const termIds: string[] = [];
      for (const kt of keyTerms) {
        if (!kt.term || !kt.definition) continue;
        
        // Check if term already exists
        let termDef = await storage.getTermDefinition(kt.term, collection?.subjectId || undefined);
        
        if (!termDef) {
          // Create new term definition
          termDef = await storage.createTermDefinition({
            term: kt.term,
            definition: kt.definition,
            subjectId: collection?.subjectId || null,
          });
        }
        
        termIds.push(termDef.id);
      }
      
      // Link terms to explanation
      if (termIds.length > 0 && explanation) {
        await storage.linkExplanationToTerms(explanation.id, termIds);
      }
    }
    
    // Get linked terms for the explanation
    const terms = explanation ? await storage.getExplanationTerms(explanation.id) : [];
    
    // Return structured response with terms
    res.json({
      id: explanation?.id,
      cardId: explanation?.cardId,
      explanation: explanation?.explanation,
      createdAt: explanation?.createdAt,
      terms: terms.map(t => ({
        id: t.id,
        term: t.term,
        definition: t.definition
      }))
    });
  } catch (error) {
    console.error('Get quiz card explanation error:', error);
    res.status(500).json({ error: "Failed to get explanation" });
  }
});

// Bulk generate explanations for all cards in a collection
router.post("/quiz-collections/:collectionId/generate-all-explanations", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { collectionId } = req.params;
    
    const collection = await storage.getQuizCollection(collectionId);
    if (!collection) {
      return res.status(404).json({ error: "Quiz collection not found" });
    }
    
    // Get organization ID for credit deduction
    const organizationId = collection.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: "Collection must belong to an organization for bulk generation" });
    }
    
    const canAccess = await canAccessOrganization(userId, organizationId);
    if (!canAccess) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const cards = await storage.getQuizCards(collectionId);
    
    // Count cards that need explanation generation
    let cardsNeedingGeneration = 0;
    for (const card of cards) {
      const existingExplanation = await storage.getQuizCardExplanation(card.id);
      if (!existingExplanation) {
        cardsNeedingGeneration++;
      }
    }
    
    if (cardsNeedingGeneration === 0) {
      return res.json({
        total: cards.length,
        generated: 0,
        alreadyExisted: cards.length,
        failed: 0,
        errors: [],
        creditsDeducted: 0
      });
    }
    
    // Get pricing and calculate total cost
    const [pricing] = await db
      .select()
      .from(schema.platformPricing)
      .orderBy(desc(schema.platformPricing.updatedAt), desc(schema.platformPricing.createdAt))
      .limit(1);
    const creditPerExplanation = pricing?.creditsPerExplanationGeneration ?? 25;
    const totalCreditCost = creditPerExplanation * cardsNeedingGeneration;
    
    // Deduct credits upfront using hybrid service
    const correlationId = `bulk_explanation_${collectionId}_${randomUUID()}`;
    try {
      await HybridCreditService.deductWithFallback({
        userId,
        organizationId,
        amount: totalCreditCost,
        type: 'deduction',
        correlationId,
        description: `Bulk quiz explanation generation for ${cardsNeedingGeneration} cards in "${collection.name}"`,
        activityType: 'quiz_generation',
        metadata: { collectionId, cardCount: cardsNeedingGeneration, feature: 'bulk_explanation_generation' }
      });
      console.log(`[BulkQuizExplanation] Deducted ${totalCreditCost} credits for ${cardsNeedingGeneration} explanations (collection: ${collectionId})`);
    } catch (creditError) {
      if (creditError instanceof InsufficientHybridCreditsError) {
        return res.status(402).json({
          error: 'Insufficient credits',
          message: `You need ${totalCreditCost} credits to generate explanations for ${cardsNeedingGeneration} cards. Please purchase more credits.`,
          required: totalCreditCost,
          cardsNeedingGeneration,
          costPerCard: creditPerExplanation,
          userBalance: creditError.userBalance,
          orgBalance: creditError.orgBalance
        });
      }
      throw creditError;
    }
    
    const results = {
      total: cards.length,
      generated: 0,
      alreadyExisted: 0,
      failed: 0,
      errors: [] as Array<{ cardId: string; question: string; error: string }>,
      creditsDeducted: totalCreditCost
    };
    
    for (const card of cards) {
      try {
        const existingExplanation = await storage.getQuizCardExplanation(card.id);
        
        if (existingExplanation) {
          results.alreadyExisted++;
          continue;
        }
        
        const aiService = await AIService.getActiveConfig();
        if (!aiService) {
          throw new Error("AI service not configured");
        }
        
        let subjectName: string | undefined;
        let gradeName: string | undefined;
        if (collection?.subjectId) {
          const subject = await storage.getSubject(collection.subjectId);
          if (subject) {
            subjectName = subject.name;
            if ((subject as any).unitId) {
              const unit = await storage.getOrganizationUnit((subject as any).unitId);
              if (unit) {
                gradeName = unit.name;
              }
            }
          }
        }
        
        const questionType = card.questionType || 'multiple-choice';
        
        let explanationData: {
          correctAnswer?: string;
          allAnswers?: string[];
          matchPairs?: Array<{ left: string; right: string }>;
        } = {};
        
        if (questionType === 'match') {
          explanationData.matchPairs = card.matchPairs as Array<{ left: string; right: string }> | undefined;
        } else if (questionType === 'fill-blank') {
          explanationData.correctAnswer = card.correctAnswer || undefined;
        } else {
          const allAnswersRaw = [
            card.answer1,
            card.answer2,
            card.answer3,
            card.answer4,
            card.answer5,
            card.answer6
          ];
          explanationData.correctAnswer = allAnswersRaw[(card.correctAnswerIndex ?? 1) - 1] || undefined;
          explanationData.allAnswers = allAnswersRaw.filter((a): a is string => a !== null && a !== undefined && a.trim() !== '');
        }
        
        const bulkQuizLanguage = collection?.languageCode || 'en';
        const aiResponse = await (aiService as any).generateExplanation(
          card.question,
          questionType,
          explanationData,
          {
            difficulty: (collection as any)?.difficulty || undefined,
            subject: subjectName || undefined,
            grade: gradeName || undefined,
            languageCode: bulkQuizLanguage
          }
        );
        
        const explanation = await storage.createQuizCardExplanation({
          cardId: card.id,
          explanation: aiResponse.explanation
        });
        
        const termIds: string[] = [];
        for (const termData of aiResponse.terms) {
          let term = await storage.getTermDefinition(termData.term, collection?.subjectId ?? undefined);
          if (!term) {
            term = await storage.createTermDefinition({
              term: termData.term,
              definition: termData.definition,
              subjectId: collection?.subjectId ?? undefined
            });
          }
          termIds.push(term.id);
        }
        
        if (termIds.length > 0) {
          await storage.linkExplanationToTerms(explanation.id, termIds);
        }
        
        results.generated++;
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          cardId: card.id,
          question: card.question.substring(0, 100),
          error: error.message || "Unknown error"
        });
      }
    }
    
    res.json(results);
  } catch (error) {
    console.error('Generate all explanations error:', error);
    res.status(500).json({ error: "Failed to generate explanations" });
  }
});

// Verify answers by comparing correct answers with AI-generated explanations
router.post("/quiz-collections/:collectionId/verify-answers", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { collectionId } = req.params;
    
    console.log(`[VerifyAnswers] Starting verification for collection: ${collectionId}`);
    
    const collection = await storage.getQuizCollection(collectionId);
    if (!collection) {
      return res.status(404).json({ error: "Quiz collection not found" });
    }
    
    // Get organization ID for credit deduction
    const organizationId = collection.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: "Collection must belong to an organization for answer verification" });
    }
    
    const canAccess = await canAccessOrganization(userId, organizationId);
    if (!canAccess) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const cards = await storage.getQuizCards(collectionId);
    console.log(`[VerifyAnswers] Found ${cards.length} cards to verify`);
    
    // Count cards that have explanations (only these will be verified with AI)
    let cardsWithExplanations = 0;
    for (const card of cards) {
      const explanation = await storage.getQuizCardExplanation(card.id);
      if (explanation) {
        cardsWithExplanations++;
      }
    }
    
    if (cardsWithExplanations === 0) {
      return res.json({
        total: cards.length,
        verified: 0,
        mismatches: [],
        noExplanation: cards.map(c => ({ cardId: c.id, question: c.question.substring(0, 100) })),
        errors: [],
        creditsDeducted: 0,
        message: 'No cards have explanations to verify against. Generate explanations first.'
      });
    }
    
    // Get pricing and calculate total cost
    const [pricing] = await db
      .select()
      .from(schema.platformPricing)
      .orderBy(desc(schema.platformPricing.updatedAt), desc(schema.platformPricing.createdAt))
      .limit(1);
    const creditPerAnswerCheck = pricing?.creditsPerAnswerCheck ?? 20;
    const totalCreditCost = creditPerAnswerCheck * cardsWithExplanations;
    
    // Deduct credits upfront using hybrid service
    const correlationId = `verify_answers_${collectionId}_${randomUUID()}`;
    try {
      await HybridCreditService.deductWithFallback({
        userId,
        organizationId,
        amount: totalCreditCost,
        type: 'deduction',
        correlationId,
        description: `Quiz answer verification for ${cardsWithExplanations} cards in "${collection.name}"`,
        activityType: 'quiz_generation',
        metadata: { collectionId, cardCount: cardsWithExplanations, feature: 'answer_verification' }
      });
      console.log(`[VerifyAnswers] Deducted ${totalCreditCost} credits for ${cardsWithExplanations} verifications (collection: ${collectionId})`);
    } catch (creditError) {
      if (creditError instanceof InsufficientHybridCreditsError) {
        return res.status(402).json({
          error: 'Insufficient credits',
          message: `You need ${totalCreditCost} credits to verify answers for ${cardsWithExplanations} cards. Please purchase more credits.`,
          required: totalCreditCost,
          cardsToVerify: cardsWithExplanations,
          costPerCard: creditPerAnswerCheck,
          userBalance: creditError.userBalance,
          orgBalance: creditError.orgBalance
        });
      }
      throw creditError;
    }
    
    const results = {
      total: cards.length,
      verified: 0,
      mismatches: [] as Array<{
        cardId: string;
        question: string;
        questionType: string;
        currentCorrectAnswer: string;
        suggestedCorrectAnswer: string;
        currentCorrectIndex?: number;
        suggestedCorrectIndex?: number;
        explanation: string;
        allAnswers?: string[];
      }>,
      noExplanation: [] as Array<{ cardId: string; question: string }>,
      errors: [] as Array<{ cardId: string; question: string; error: string }>,
      creditsDeducted: totalCreditCost
    };
    
    const aiService = await AIService.getActiveConfig();
    if (!aiService) {
      return res.status(503).json({ error: "AI service not configured" });
    }
    
    for (const card of cards) {
      try {
        console.log(`[VerifyAnswers] Processing card ${card.id}: ${card.question.substring(0, 50)}...`);
        
        const explanation = await storage.getQuizCardExplanation(card.id);
        
        if (!explanation) {
          console.log(`[VerifyAnswers] No explanation found for card ${card.id}`);
          results.noExplanation.push({
            cardId: card.id,
            question: card.question.substring(0, 100)
          });
          continue;
        }
        
        console.log(`[VerifyAnswers] Found explanation for card ${card.id}`);
        const questionType = card.questionType || 'multiple-choice';
        console.log(`[VerifyAnswers] Question type: ${questionType}`);
        
        if (questionType === 'match') {
          const matchPairs = card.matchPairs as Array<{ left: string; right: string }> | undefined;
          if (!matchPairs || matchPairs.length === 0) {
            results.errors.push({
              cardId: card.id,
              question: card.question.substring(0, 100),
              error: 'No match pairs found'
            });
            continue;
          }
          
          const verifyPrompt = `Given this matching question and its explanation, are the match pairs correct?

Question: ${card.question}

Match Pairs:
${matchPairs.map((p, i) => `${i + 1}. ${p.left} → ${p.right}`).join('\n')}

Explanation: ${explanation.explanation}

Respond with "CORRECT" if the match pairs align with the explanation, or "INCORRECT: [brief reason]" if they don't.`;
          
          const ai = new GoogleGenAI({ apiKey: (aiService as any)['apiKey'] });
          const response = await ai.models.generateContent({
            model: (aiService as any)['modelName'],
            contents: verifyPrompt
          });
          
          const verifyResponse = response.text?.trim() || '';
          if (verifyResponse.toUpperCase().startsWith('CORRECT')) {
            results.verified++;
          } else {
            results.mismatches.push({
              cardId: card.id,
              question: card.question,
              questionType,
              currentCorrectAnswer: matchPairs.map((p, i) => `${i + 1}. ${p.left} → ${p.right}`).join('; '),
              suggestedCorrectAnswer: verifyResponse.replace(/^INCORRECT:\s*/i, ''),
              explanation: explanation.explanation
            });
          }
          continue;
        } else if (questionType === 'fill-blank') {
          const currentCorrectAnswer = card.correctAnswer || '';
          
          const verifyPrompt = `Given this fill-in-the-blank question and its explanation, is the answer correct?

Question: ${card.question}

Current Answer: "${currentCorrectAnswer}"

Explanation: ${explanation.explanation}

Respond with "CORRECT" if the answer aligns with the explanation, or provide the correct answer if it doesn't.`;
          
          const ai = new GoogleGenAI({ apiKey: (aiService as any)['apiKey'] });
          const response = await ai.models.generateContent({
            model: (aiService as any)['modelName'],
            contents: verifyPrompt
          });
          
          const verifyResponse = response.text?.trim() || '';
          if (verifyResponse.toUpperCase().startsWith('CORRECT')) {
            results.verified++;
          } else {
            results.mismatches.push({
              cardId: card.id,
              question: card.question,
              questionType,
              currentCorrectAnswer,
              suggestedCorrectAnswer: verifyResponse.replace(/^INCORRECT:\s*/i, ''),
              explanation: explanation.explanation
            });
          }
          continue;
        }
        
        const allAnswersRaw = [
          card.answer1,
          card.answer2,
          card.answer3,
          card.answer4,
          card.answer5,
          card.answer6
        ];
        const allAnswers = allAnswersRaw.filter(a => a && a.trim());
        const currentCorrectAnswer = allAnswersRaw[(card.correctAnswerIndex ?? 1) - 1] || '';
        
        const verifyPrompt = `Given this question and its explanation, which answer option is correct?

Question: ${card.question}

Answer Options:
${allAnswers.map((a, i) => `${i + 1}. ${a}`).join('\n')}

Explanation: ${explanation.explanation}

Respond with ONLY the number (1-${allAnswers.length}) of the correct answer option based on the explanation.`;
        
        const ai = new GoogleGenAI({ apiKey: (aiService as any)['apiKey'] });
        const response = await ai.models.generateContent({
          model: (aiService as any)['modelName'],
          contents: verifyPrompt
        });
        
        const suggestedIndexRaw = response.text?.trim();
        const suggestedIndex = parseInt(suggestedIndexRaw || '0');
        
        if (isNaN(suggestedIndex) || suggestedIndex < 1 || suggestedIndex > allAnswers.length) {
          results.errors.push({
            cardId: card.id,
            question: card.question.substring(0, 100),
            error: `Invalid AI response: ${suggestedIndexRaw}`
          });
          continue;
        }
        
        let actualSuggestedIndex = 0;
        let foundCount = 0;
        for (let i = 0; i < allAnswersRaw.length; i++) {
          if (allAnswersRaw[i] && allAnswersRaw[i]!.trim()) {
            foundCount++;
            if (foundCount === suggestedIndex) {
              actualSuggestedIndex = i + 1;
              break;
            }
          }
        }
        
        const suggestedCorrectAnswer = allAnswersRaw[actualSuggestedIndex - 1] || '';
        
        if (card.correctAnswerIndex !== actualSuggestedIndex) {
          results.mismatches.push({
            cardId: card.id,
            question: card.question,
            questionType,
            currentCorrectAnswer,
            suggestedCorrectAnswer,
            currentCorrectIndex: card.correctAnswerIndex ?? undefined,
            suggestedCorrectIndex: actualSuggestedIndex,
            explanation: explanation.explanation,
            allAnswers
          });
        } else {
          results.verified++;
        }
      } catch (error: any) {
        console.error(`[VerifyAnswers] Error processing card ${card.id}:`, error.message || error);
        results.errors.push({
          cardId: card.id,
          question: card.question.substring(0, 100),
          error: error.message || "Unknown error"
        });
      }
    }
    
    console.log(`[VerifyAnswers] Verification complete. Results:`, {
      total: results.total,
      verified: results.verified,
      mismatches: results.mismatches.length,
      noExplanation: results.noExplanation.length,
      errors: results.errors.length
    });
    
    res.json(results);
  } catch (error) {
    console.error('Verify answers error:', error);
    res.status(500).json({ error: "Failed to verify answers" });
  }
});

router.put("/admin/quiz-cards/:id", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const card = await storage.getQuizCard(req.params.id);
    
    if (!card) {
      return res.status(404).json({ error: "Quiz card not found" });
    }
    
    const collection = await storage.getQuizCollection(card.collectionId);
    if (collection?.organizationId) {
      const canAccess = await canAccessOrganization(userId, collection.organizationId);
      if (!canAccess) {
        return res.status(403).json({ error: "Access denied: You cannot modify quiz cards from other organizations" });
      }
    }

    try {
      await QuizVersioningService.createVersion(card.collectionId, {
        changeDescription: 'Quiz card updated',
        editedBy: userId,
        organizationId: collection?.organizationId || undefined,
      });
    } catch (versionError) {
      console.error('[QuizVersioning] Failed to create version before card update:', versionError);
    }
    
    const updatedCard = await storage.updateQuizCard(req.params.id, req.body);
    res.json(updatedCard);
  } catch (error) {
    console.error('Update quiz card error:', error);
    res.status(500).json({ error: "Failed to update quiz card" });
  }
});

router.delete("/admin/quiz-cards/:id", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const card = await storage.getQuizCard(req.params.id);
    
    if (!card) {
      return res.status(404).json({ error: "Quiz card not found" });
    }
    
    const collection = await storage.getQuizCollection(card.collectionId);
    if (collection?.organizationId) {
      const canAccess = await canAccessOrganization(userId, collection.organizationId);
      if (!canAccess) {
        return res.status(403).json({ error: "Access denied: You cannot delete quiz cards from other organizations" });
      }
    }
    
    await storage.deleteQuizCard(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete quiz card error:', error);
    res.status(500).json({ error: "Failed to delete quiz card" });
  }
});

router.patch("/quiz-cards/:cardId/correct-answer", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { cardId } = req.params;
    const { correctAnswerIndex } = req.body;
    
    if (typeof correctAnswerIndex !== 'number' || correctAnswerIndex < 1 || correctAnswerIndex > 6) {
      return res.status(400).json({ error: "Invalid correct answer index. Must be between 1 and 6." });
    }
    
    const card = await storage.getQuizCard(cardId);
    if (!card) {
      return res.status(404).json({ error: "Quiz card not found" });
    }
    
    const collection = await storage.getQuizCollection(card.collectionId);
    if (collection?.organizationId) {
      const canAccess = await canAccessOrganization(userId, collection.organizationId);
      if (!canAccess) {
        return res.status(403).json({ error: "Access denied: You cannot modify quiz cards from other organizations" });
      }
    }
    
    try {
      await QuizVersioningService.createVersion(card.collectionId, {
        changeDescription: 'Correct answer updated',
        editedBy: userId,
        organizationId: collection?.organizationId || undefined,
      });
    } catch (versionError) {
      console.error('[QuizVersioning] Failed to create version before correct answer update:', versionError);
    }

    const updatedCard = await storage.updateQuizCard(cardId, { correctAnswerIndex });
    
    console.log(`[CorrectAnswer] User ${userId} updated card ${cardId} correct answer to index ${correctAnswerIndex}`);
    
    res.json({ success: true, card: updatedCard });
  } catch (error) {
    console.error('Update correct answer error:', error);
    res.status(500).json({ error: "Failed to update correct answer" });
  }
});

// ==================== QUIZ ASSIGNMENTS ROUTES ====================

router.get("/quiz/assignments", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.json([]);
    }
    
    const userRoles = await storage.getUserRoles(req.session.userId);
    if (!userRoles || userRoles.length === 0) {
      return res.json([]);
    }

    const organizationId = userRoles[0].organizationId;
    if (!organizationId) {
      return res.json([]);
    }

    const assignments = await storage.getOrganizationQuizAssignments(organizationId);
    res.json(assignments);
  } catch (error) {
    console.error('Get quiz assignments error:', error);
    res.status(500).json({ error: "Failed to fetch quiz assignments" });
  }
});

router.post("/quiz/assign", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    const userRoles = await db
      .select()
      .from(userOrganizationRoles)
      .where(eq(userOrganizationRoles.userId, userId));
    
    const hasPermission = userRoles.some(r => ['teacher', 'team_lead', 'org_admin'].includes(r.role));
    if (!hasPermission) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { collectionId, unitId, subUnitId, requiredPassPercentage } = req.body;
    const assignment = await storage.assignQuizCollection(collectionId, unitId, subUnitId, requiredPassPercentage);
    res.json(assignment);
  } catch (error) {
    console.error('Create quiz assignment error:', error);
    res.status(500).json({ error: "Failed to create quiz assignment" });
  }
});

router.delete("/quiz/assign/:id", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    const userRoles = await db
      .select()
      .from(userOrganizationRoles)
      .where(eq(userOrganizationRoles.userId, userId));
    
    const hasPermission = userRoles.some(r => ['teacher', 'team_lead', 'org_admin'].includes(r.role));
    if (!hasPermission) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    await storage.removeQuizCollectionAssignment(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete quiz assignment error:', error);
    res.status(500).json({ error: "Failed to delete quiz assignment" });
  }
});

router.get("/quiz/assigned", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.json([]);
    }
    
    const userAssignments = await db
      .select()
      .from(userOrganizationAssignments)
      .where(eq(userOrganizationAssignments.userId, userId));
    
    if (userAssignments.length === 0) {
      return res.json([]);
    }

    const unitIds = userAssignments.map(a => a.unitId).filter((id): id is string => Boolean(id));
    const subUnitIds = userAssignments.filter(a => a.subUnitId).map(a => a.subUnitId!).filter((id): id is string => Boolean(id));
    
    if (unitIds.length === 0 && subUnitIds.length === 0) {
      return res.json([]);
    }
    
    let whereCondition;
    if (unitIds.length > 0 && subUnitIds.length > 0) {
      whereCondition = or(
        inArray(quizCollectionAssignments.unitId, unitIds as string[]),
        inArray(quizCollectionAssignments.subUnitId, subUnitIds as string[])
      );
    } else if (unitIds.length > 0) {
      whereCondition = inArray(quizCollectionAssignments.unitId, unitIds as string[]);
    } else {
      whereCondition = inArray(quizCollectionAssignments.subUnitId, subUnitIds as string[]);
    }
    
    const assignments = await db
      .select({
        collectionId: quizCollectionAssignments.collectionId,
      })
      .from(quizCollectionAssignments)
      .where(whereCondition);
    
    if (assignments.length === 0) {
      return res.json([]);
    }
    
    const collectionIds = Array.from(new Set(assignments.map(a => a.collectionId)));
    const allCollections = await storage.getQuizCollections();
    const assignedQuizzes = allCollections.filter((c: any) => collectionIds.includes(c.id));
    
    res.json(assignedQuizzes);
  } catch (error) {
    console.error('Get assigned quizzes error:', error);
    res.status(500).json({ error: "Failed to fetch assigned quizzes" });
  }
});

router.get("/quiz/my-progress", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.json([]);
    }
    
    const progress = await db
      .select()
      .from(quizGameProgress)
      .where(eq(quizGameProgress.userId, userId));
    
    if (progress.length === 0) {
      return res.json([]);
    }
    
    const collectionIds = Array.from(new Set(progress.map((p: any) => p.collectionId)));
    const allCollections = await db
      .select({ id: quizCollections.id, name: quizCollections.name, totalCards: quizCollections.totalCards })
      .from(quizCollections)
      .where(inArray(quizCollections.id, collectionIds));
    
    const collectionsMap = new Map(allCollections.map(c => [c.id, c]));
    
    const formattedProgress = progress.map((p: any) => {
      const collection = collectionsMap.get(p.collectionId);
      const totalCards = collection?.totalCards || 0;
      const questionsAnswered = p.questionsAnswered || 0;
      return {
        collectionId: p.collectionId,
        collectionName: collection?.name || 'Unknown',
        questionsAnswered,
        totalQuestions: totalCards,
        attempts: p.totalAttempts || 0,
        averageScore: p.averageScore || 0,
        completionRate: totalCards > 0 ? Math.round((questionsAnswered / totalCards) * 100) : 0,
      };
    });
    
    res.json(formattedProgress);
  } catch (error) {
    console.error('Get student progress error:', error);
    res.status(500).json({ error: "Failed to fetch student progress" });
  }
});

router.get("/quiz/completion-status", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.json([]);
    }
    
    const completionData = await db
      .select()
      .from(userQuizProgress)
      .where(eq(userQuizProgress.userId, userId));
    
    const formattedStatus = completionData.map((progress: any) => ({
      collectionId: progress.collectionId,
      attempts: progress.attemptsCount || 0,
      bestScore: progress.bestScore || 0,
      bestPercentage: progress.bestPercentage || 0,
      passed: progress.isPassed || false,
      completionStatus: progress.completionStatus || 'outstanding',
      lastAttemptAt: progress.lastAttemptAt,
    }));
    
    res.json(formattedStatus);
  } catch (error) {
    console.error('Get quiz completion status error:', error);
    res.status(500).json({ error: "Failed to fetch completion status" });
  }
});

// ==================== ADMIN QUIZ ASSIGNMENTS ROUTES ====================

router.post("/admin/quiz-collections/:collectionId/assignments", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { unitId, subUnitId, subjectId, requiredPassPercentage, availableFrom, availableTo } = req.body;
    
    const collection = await storage.getQuizCollection(req.params.collectionId);
    if (!collection) {
      return res.status(404).json({ error: "Quiz collection not found" });
    }
    
    const cardCount = collection.totalCards || 0;
    if (cardCount < 5) {
      return res.status(400).json({ 
        error: `Cannot assign quiz: This quiz collection needs at least 5 questions but currently has only ${cardCount}. Please add more questions before assigning.`
      });
    }
    
    if (collection.organizationId) {
      const canAccessCollection = await canAccessOrganization(userId, collection.organizationId);
      if (!canAccessCollection) {
        return res.status(403).json({ error: "Access denied: You cannot assign quiz collections from other organizations" });
      }
    }
    
    if (subjectId) {
      const subject = await storage.getSubject(subjectId);
      if (!subject) {
        return res.status(404).json({ error: "Subject not found" });
      }
      
      const canAccessSubject = await canAccessOrganization(userId, subject.organizationId);
      if (!canAccessSubject) {
        return res.status(403).json({ error: "Access denied: You cannot assign to subjects from other organizations" });
      }
      
      const subjectUnits = await db.select({
        unitId: unitSubjects.unitId
      }).from(unitSubjects).where(eq(unitSubjects.subjectId, subjectId));
      
      if (subjectUnits.length === 0) {
        return res.status(400).json({ error: "Subject is not assigned to any units/grades. Please assign the subject to units first." });
      }
      
      const createdAssignments = [];
      for (const su of subjectUnits) {
        const assignment = await storage.assignQuizCollection(
          req.params.collectionId, 
          su.unitId, 
          undefined, 
          requiredPassPercentage,
          subjectId,
          availableFrom,
          availableTo
        );
        createdAssignments.push(assignment);
      }
      
      return res.json({ 
        success: true, 
        assignments: createdAssignments,
        message: `Quiz assigned to ${createdAssignments.length} units for subject`
      });
    }
    
    if (!unitId) {
      return res.status(400).json({ error: "Unit ID or Subject ID is required" });
    }
    
    const unit = await storage.getOrganizationUnit(unitId);
    if (!unit) {
      return res.status(404).json({ error: "Unit not found" });
    }
    
    const canAccessUnit = await canAccessOrganization(userId, unit.organizationId);
    if (!canAccessUnit) {
      return res.status(403).json({ error: "Access denied: You cannot assign to units from other organizations" });
    }
    
    const assignment = await storage.assignQuizCollection(
      req.params.collectionId, 
      unitId, 
      subUnitId, 
      requiredPassPercentage,
      undefined,
      availableFrom,
      availableTo
    );
    res.json(assignment);
  } catch (error) {
    console.error('Create quiz assignment error:', error);
    res.status(500).json({ error: "Failed to create quiz assignment" });
  }
});

router.get("/quiz-collections/:collectionId/assignments", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { collectionId } = req.params;
    
    const collection = await storage.getQuizCollection(collectionId);
    if (!collection) {
      return res.status(404).json({ error: "Quiz collection not found" });
    }
    
    if (collection.organizationId) {
      const canAccess = await canAccessOrganization(userId, collection.organizationId);
      if (!canAccess) {
        return res.status(403).json({ error: "Access denied" });
      }
    }
    
    const assignments = await storage.getQuizCollectionAssignments(collectionId);
    
    const enrichedAssignments = await Promise.all(assignments.map(async (a: any) => {
      let unitName = null;
      let subUnitName = null;
      let subjectName = null;
      
      if (a.unitId) {
        const unit = await storage.getOrganizationUnit(a.unitId);
        unitName = unit?.name || null;
      }
      if (a.subUnitId) {
        const subUnit = await storage.getOrganizationSubUnit(a.subUnitId);
        subUnitName = subUnit?.name || null;
      }
      if (a.subjectId) {
        const subject = await storage.getSubject(a.subjectId);
        subjectName = subject?.name || null;
      }
      
      return {
        ...a,
        unitName,
        subUnitName,
        subjectName,
      };
    }));
    
    res.json(enrichedAssignments);
  } catch (error) {
    console.error('Get quiz assignments error:', error);
    res.status(500).json({ error: "Failed to fetch quiz assignments" });
  }
});

router.patch("/admin/quiz-assignments/:id/availability", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { availableFrom, availableTo } = req.body;
    
    const assignment = await storage.getQuizCollectionAssignment(req.params.id);
    
    if (!assignment) {
      return res.status(404).json({ error: "Quiz assignment not found" });
    }
    
    const collection = await storage.getQuizCollection(assignment.collectionId);
    if (collection?.organizationId) {
      const canAccess = await canAccessOrganization(userId, collection.organizationId);
      if (!canAccess) {
        return res.status(403).json({ error: "Access denied: You cannot update quiz assignments from other organizations" });
      }
    }
    
    await storage.updateQuizAssignmentAvailability(assignment.id, availableFrom, availableTo);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Update assignment availability error:', error);
    return res.status(500).json({ error: "Failed to update assignment availability" });
  }
});

router.delete("/admin/quiz-assignments/:id", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const assignment = await storage.getQuizCollectionAssignment(req.params.id);
    
    if (!assignment) {
      return res.status(404).json({ error: "Quiz assignment not found" });
    }
    
    const collection = await storage.getQuizCollection(assignment.collectionId);
    if (collection?.organizationId) {
      const canAccess = await canAccessOrganization(userId, collection.organizationId);
      if (!canAccess) {
        return res.status(403).json({ error: "Access denied: You cannot remove quiz assignments from other organizations" });
      }
    }
    
    await storage.removeQuizCollectionAssignment(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete quiz assignment error:', error);
    res.status(500).json({ error: "Failed to delete quiz assignment" });
  }
});

// ==================== QUIZ MATCHMAKING ====================

router.get("/quiz/matchmaking/waiting-players", optionalAuth, async (req: Request, res: Response) => {
  try {
    res.json([]);
  } catch (error) {
    console.error('Error fetching waiting quiz players:', error);
    res.status(500).json({ error: 'Failed to fetch waiting quiz players' });
  }
});

// ==================== QUIZ-LESSON LINKS ====================

router.get("/quizzes/:quizId/lessons", requireQuizOrgAccess, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { quizId } = req.params;
    const { organizationId } = req.query;

    if (!organizationId || typeof organizationId !== "string") {
      return res.status(400).json({ error: "Organization ID required" });
    }

    const lessons = await LessonService.getLessonsForQuiz(quizId, organizationId);

    res.json(lessons);
  } catch (error) {
    console.error("Get quiz lessons error:", error);
    res.status(500).json({ error: "Failed to fetch quiz lessons" });
  }
});

// Get quiz version status - check if slides have changed since quiz was generated
router.get("/quizzes/:quizId/version-status", requireQuizOrgAccess, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { quizId } = req.params;
    
    const versionStatus = await checkQuizOutdatedStatus(quizId);

    res.json({
      presentationVersionId: versionStatus.presentationVersionId,
      slideContentHash: versionStatus.storedHash,
      isOutdated: versionStatus.isOutdated,
      currentSlideHash: versionStatus.currentHash,
    });
  } catch (error) {
    console.error("Get quiz version status error:", error);
    res.status(500).json({ error: "Failed to fetch quiz version status" });
  }
});

// Get lesson quiz outdated status - check if any linked quizzes need regeneration
// Returns aggregated status for all quizzes linked to a lesson
router.get("/lessons/:lessonId/quiz-outdated-status", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const { lessonId } = req.params;
    const organizationId = req.query.organizationId as string;

    // Verify lesson exists and belongs to the requested organization
    const lesson = await db
      .select({ id: lessons.id, organizationId: lessons.organizationId })
      .from(lessons)
      .where(eq(lessons.id, lessonId))
      .limit(1);

    if (!lesson.length || lesson[0].organizationId !== organizationId) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    // Get all linked quizzes for this lesson with their outdated status
    const linkedQuizzes = await db
      .select({
        quizId: lessonQuizLinks.quizId,
        isPrimary: lessonQuizLinks.isPrimary,
        isOutdated: lessonQuizLinks.isOutdated,
        presentationVersionId: lessonQuizLinks.presentationVersionId,
        slideContentHash: lessonQuizLinks.slideContentHash,
      })
      .from(lessonQuizLinks)
      .where(eq(lessonQuizLinks.lessonId, lessonId));

    // Get current versioning info for comparison
    const versioningInfo = await getLessonVersioningInfo(lessonId);

    // Count outdated quizzes
    const outdatedQuizzes = linkedQuizzes.filter(q => q.isOutdated);
    const hasOutdatedQuizzes = outdatedQuizzes.length > 0;

    res.json({
      lessonId,
      totalLinkedQuizzes: linkedQuizzes.length,
      outdatedQuizCount: outdatedQuizzes.length,
      hasOutdatedQuizzes,
      currentPresentationVersion: versioningInfo.presentationVersionId,
      currentSlideHash: versioningInfo.slideContentHash,
      linkedQuizzes: linkedQuizzes.map(q => ({
        quizId: q.quizId,
        isPrimary: q.isPrimary,
        isOutdated: q.isOutdated,
        generatedFromVersion: q.presentationVersionId,
      })),
      regenerationRecommended: hasOutdatedQuizzes,
      message: hasOutdatedQuizzes 
        ? "The presentation has been updated since this quiz was generated. Consider regenerating the quiz to reflect the latest content."
        : null,
    });
  } catch (error) {
    console.error("Get lesson quiz outdated status error:", error);
    res.status(500).json({ error: "Failed to fetch lesson quiz outdated status" });
  }
});

// ==================== ADMIN: BACKFILL CORRECT ANSWER INDEX ====================
// Fixes existing quizzes that have incorrect correctAnswerIndex values
// due to the bug where correctIndex from AI was not properly mapped to correctAnswerIndex

router.post("/admin/quiz-backfill-correct-answers", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    
    if (!user || !user.isSuperAdmin) {
      return res.status(403).json({ error: "Only SuperAdmin can run this backfill" });
    }
    
    const { dryRun = true, collectionId } = req.body;
    
    console.log(`[Backfill] Starting correctAnswerIndex backfill - dryRun: ${dryRun}, collectionId: ${collectionId || 'all'}`);
    
    // Get all published quiz drafts that have generatedQuestions with correctIndex
    // Build the where conditions as a single AND clause
    const baseConditions = and(
      eq(quizDrafts.isPublished, true),
      sql`${quizDrafts.publishedCollectionId} IS NOT NULL`,
      sql`${quizDrafts.generatedQuestions} IS NOT NULL`,
      // Conditionally add collection filter
      collectionId ? eq(quizDrafts.publishedCollectionId, collectionId) : undefined
    );
    
    const drafts = await db.select({
      id: quizDrafts.id,
      publishedCollectionId: quizDrafts.publishedCollectionId,
      generatedQuestions: quizDrafts.generatedQuestions,
    })
      .from(quizDrafts)
      .where(baseConditions);
    
    let totalFixed = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    let totalMatchedByAnswers = 0;
    const fixedDetails: Array<{ collectionId: string; cardId: string; oldIndex: number; newIndex: number; question: string; matchedBy: string }> = [];
    
    for (const draft of drafts) {
      if (!draft.publishedCollectionId || !draft.generatedQuestions) continue;
      
      const questions = draft.generatedQuestions as Array<{
        question: string;
        questionType?: string;
        answers?: string[];
        correctIndex?: number;
        selected?: boolean;
      }>;
      
      // Get cards for this collection
      const cards = await storage.getQuizCards(draft.publishedCollectionId);
      
      // Build maps for matching: question text -> correctIndex, and answer hash -> correctIndex
      const questionToCorrectIndex = new Map<string, number>();
      const answerHashToCorrectIndex = new Map<string, { correctIndex: number; question: string }>();
      
      for (const q of questions) {
        if (q.selected !== false && q.correctIndex !== undefined) {
          // Primary: normalize question text for matching
          const normalizedQ = q.question.trim().toLowerCase();
          questionToCorrectIndex.set(normalizedQ, q.correctIndex);
          
          // Secondary: hash answers for fallback matching (handles edited question text)
          if (q.answers && q.answers.length > 0) {
            const answerHash = q.answers.map(a => a.trim().toLowerCase()).sort().join('|');
            answerHashToCorrectIndex.set(answerHash, { correctIndex: q.correctIndex, question: q.question });
          }
        }
      }
      
      for (const card of cards) {
        if (card.questionType !== 'multiple-choice' && card.questionType !== 'true-false') continue;
        
        const normalizedQ = card.question.trim().toLowerCase();
        let originalCorrectIndex = questionToCorrectIndex.get(normalizedQ);
        let matchedBy = 'question';
        
        // Fallback: try matching by answer hash if question text doesn't match (handles edits)
        if (originalCorrectIndex === undefined) {
          const cardAnswers = [
            card.answer1, card.answer2, card.answer3, 
            card.answer4, card.answer5, card.answer6
          ].filter(Boolean).map(a => a!.trim().toLowerCase()).sort().join('|');
          
          const answerMatch = answerHashToCorrectIndex.get(cardAnswers);
          if (answerMatch) {
            originalCorrectIndex = answerMatch.correctIndex;
            matchedBy = 'answers';
            totalMatchedByAnswers++;
          }
        }
        
        if (originalCorrectIndex === undefined) {
          console.log(`[Backfill] Skipped card ${card.id}: no matching question or answers in draft`);
          totalSkipped++;
          continue;
        }
        
        // Convert 0-based correctIndex to 1-based correctAnswerIndex
        const expectedCorrectAnswerIndex = originalCorrectIndex + 1;
        
        if (card.correctAnswerIndex === expectedCorrectAnswerIndex) {
          totalSkipped++;
          continue;
        }
        
        fixedDetails.push({
          collectionId: draft.publishedCollectionId,
          cardId: card.id,
          oldIndex: card.correctAnswerIndex || 0,
          newIndex: expectedCorrectAnswerIndex,
          question: card.question.substring(0, 80),
          matchedBy,
        });
        
        if (!dryRun) {
          try {
            await storage.updateQuizCard(card.id, { correctAnswerIndex: expectedCorrectAnswerIndex });
            totalFixed++;
          } catch (error) {
            console.error(`[Backfill] Error updating card ${card.id}:`, error);
            totalErrors++;
          }
        } else {
          totalFixed++;
        }
      }
    }
    
    console.log(`[Backfill] Complete - Fixed: ${totalFixed}, Skipped: ${totalSkipped}, Errors: ${totalErrors}, MatchedByAnswers: ${totalMatchedByAnswers}, DryRun: ${dryRun}`);
    
    res.json({
      success: true,
      dryRun,
      draftsProcessed: drafts.length,
      cardsFixed: totalFixed,
      cardsSkipped: totalSkipped,
      cardsMatchedByAnswers: totalMatchedByAnswers,
      errors: totalErrors,
      fixedDetails: fixedDetails.slice(0, 100), // Limit details to first 100
      message: dryRun 
        ? `Dry run complete: Would fix ${totalFixed} cards (${totalMatchedByAnswers} matched by answers)` 
        : `Backfill complete: Fixed ${totalFixed} cards (${totalMatchedByAnswers} matched by answers)`,
    });
  } catch (error) {
    console.error('[Backfill] Error:', error);
    res.status(500).json({ error: "Failed to run backfill" });
  }
});

router.get("/quiz/collections/:collectionId/linked-lesson", withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { collectionId } = req.params;

    const linkedLessons = await db
      .select({
        lessonId: lessonQuizLinks.lessonId,
      })
      .from(lessonQuizLinks)
      .where(eq(lessonQuizLinks.quizId, collectionId));

    if (linkedLessons.length === 0) {
      return res.json({ lessonId: null, courseId: null });
    }

    const lessonId = linkedLessons[0].lessonId;

    const courseLinks = await db
      .select({
        courseId: schema.courseLessons.courseId,
      })
      .from(schema.courseLessons)
      .where(eq(schema.courseLessons.lessonId, lessonId))
      .limit(1);

    const courseId = courseLinks.length > 0 ? courseLinks[0].courseId : null;

    return res.json({ lessonId, courseId });
  } catch (error) {
    console.error('Get linked lesson error:', error);
    res.status(500).json({ error: "Failed to get linked lesson" });
  }
});

/**
 * Register quiz routes with the Express app
 * Routes are prefixed with /api
 */
export function registerQuizRoutes(app: any): void {
  app.use('/api', router);
  console.log('[QuizRoutes] Registered quiz routes');
}

export { router as quizRouter };
