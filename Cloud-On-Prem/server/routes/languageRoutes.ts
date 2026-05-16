import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { eq, inArray, and, or, sql } from 'drizzle-orm';

import { db } from '../db';
import { courses, lessons, lessonVersions, lessonQuizLinks, lessonPresentationVersions, quizCollections, userOrganizationRoles, supportedLanguages, contentTranslationJobs } from '@shared/schema';
import { ContentLanguageService } from '../services/contentLanguageService';
import { CourseTranslationOrchestrator, generateSimpleDocx } from '../services/courseTranslationOrchestrator';
import { QuizVersioningService } from '../services/quizVersioningService';
import { ObjectStorageService } from '../objectStorage';
import { isSuperAdmin } from '../adminAuth';
import { withSessionAuthMiddleware } from './sharedResources';
import { isNull, isNotNull } from 'drizzle-orm';
import { summarizePodcastArtifacts } from '../services/languageArtifactService';
import { summarizeStepGuideArtifacts } from '../services/lessonStepGuideService';
import {
  isStaffScopedRole,
  isPublicCourseLanguageVariantAvailable,
  isPublicLessonLanguageVariantAvailable,
} from '../services/languageAccessPolicy';

export function registerLanguageRoutes(app: Express): void {
  async function getCourseOrganizationId(courseId: string): Promise<string | null> {
    const [course] = await db
      .select({ organizationId: courses.organizationId })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);
    return course?.organizationId || null;
  }

  async function hasStaffScopeForOrganization(req: Request, organizationId: string): Promise<boolean> {
    const userId = String(req.session?.userId || "").trim();
    if (!userId) return false;

    const sessionContext = req.session?.context as any;
    if (sessionContext) {
      const effectiveRole = String(sessionContext.effectiveRole || "").trim();
      const impersonatedOrganization = sessionContext.impersonatedOrganization || null;
      const organizations = Array.isArray(sessionContext.organizations) ? sessionContext.organizations : [];
      const isTopAdmin = effectiveRole === "SuperAdmin" || effectiveRole === "CustSuper";

      if (isTopAdmin && !impersonatedOrganization) {
        return true;
      }
      if (isTopAdmin && impersonatedOrganization) {
        return String(impersonatedOrganization.orgId || "") === organizationId;
      }

      const organizationEntry = organizations.find((org: any) => String(org?.orgId || "") === organizationId);
      if (organizationEntry && Array.isArray(organizationEntry.roles)) {
        return organizationEntry.roles.some((role: string) => isStaffScopedRole(role));
      }
    }

    const roles = await db
      .select({ role: userOrganizationRoles.role })
      .from(userOrganizationRoles)
      .where(and(
        eq(userOrganizationRoles.userId, userId),
        eq(userOrganizationRoles.organizationId, organizationId)
      ));
    return roles.some((row) => isStaffScopedRole(row.role));
  }

  const hasLearningObjectives = (metadata: unknown): boolean => {
    const root = metadata && typeof metadata === 'object' ? (metadata as Record<string, any>) : {};
    return !!String(root.learningObjectivesLastSavedAt || '').trim()
      || !!String(root.learningObjectivesLastGeneratedAt || '').trim()
      || (root.learningObjectivesLastSavedSource && typeof root.learningObjectivesLastSavedSource === 'object')
      || (root.learningObjectivesLastGeneratedSource && typeof root.learningObjectivesLastGeneratedSource === 'object');
  };

  const hasDigestSectionsForLanguage = (metadata: unknown, languageCode?: string | null): boolean => {
    const byKey = (metadata as any)?.lessonDigestV1?.byKey;
    if (!byKey || typeof byKey !== 'object') return false;
    const normalizedLanguageCode = String(languageCode || '').trim().toLowerCase();
    const entries = Object.values(byKey) as any[];
    if (!normalizedLanguageCode) {
      return entries.some((entry) => Array.isArray(entry?.sections) && entry.sections.length > 0);
    }
    return entries.some((entry) =>
      String(entry?.languageCode || '').trim().toLowerCase() === normalizedLanguageCode &&
      Array.isArray(entry?.sections) &&
      entry.sections.length > 0
    );
  };

  const withPrimaryQuizId = (quizIds: string[] | undefined, relatedQuizId: string | null | undefined): string[] => {
    const normalized = Array.isArray(quizIds)
      ? quizIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    const related = String(relatedQuizId || '').trim();
    if (related && !normalized.includes(related)) normalized.unshift(related);
    return normalized;
  };

  app.get('/api/languages', async (req: Request, res: Response) => {
    try {
      const languages = await ContentLanguageService.getSupportedLanguages();
      res.json(languages);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch('/api/users/language', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });

      const { languageCode } = z.object({ languageCode: z.string().min(2).max(10) }).parse(req.body);

      const isSupported = await ContentLanguageService.isLanguageSupported(languageCode);
      if (!isSupported) return res.status(400).json({ error: 'Unsupported language' });

      await ContentLanguageService.updateUserLanguage(userId, languageCode);
      res.json({ success: true, languageCode });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch('/api/organizations/:orgId/language', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });

      const { orgId } = req.params;
      const { languageCode } = z.object({ languageCode: z.string().min(2).max(10) }).parse(req.body);

      const hasScope = await hasStaffScopeForOrganization(req, orgId);
      if (!hasScope) return res.status(403).json({ error: 'Access denied to organization language settings' });

      const isSupported = await ContentLanguageService.isLanguageSupported(languageCode);
      if (!isSupported) return res.status(400).json({ error: 'Unsupported language' });

      await ContentLanguageService.updateOrgLanguage(orgId, languageCode);
      res.json({ success: true, languageCode });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/courses/:id/translation-readiness', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });

      const { id: courseId } = req.params;
      const { targetLanguageCode } = z.object({ targetLanguageCode: z.string().min(2).max(10) }).parse(req.query);

      const organizationId = await getCourseOrganizationId(courseId);
      if (!organizationId) return res.status(404).json({ error: 'Course not found' });
      const hasScope = await hasStaffScopeForOrganization(req, organizationId);
      if (!hasScope) return res.status(403).json({ error: 'Access denied to course translation readiness' });

      const readiness = await CourseTranslationOrchestrator.checkTranslationReadiness({
        courseCourseId: courseId,
        targetLanguageCode,
      });

      res.json({
        ready: readiness.ready,
        totalCount: readiness.totalCount,
        translatedCount: readiness.translatedCount,
        missingLessons: readiness.missingLessons,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  app.post('/api/courses/:id/translate-metadata', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });

      const { id: courseId } = req.params;
      const { targetLanguageCode } = z.object({ targetLanguageCode: z.string().min(2).max(10) }).parse(req.body);

      const isSupported = await ContentLanguageService.isLanguageSupported(targetLanguageCode);
      if (!isSupported) return res.status(400).json({ error: 'Unsupported language' });

      const organizationId = await getCourseOrganizationId(courseId);
      if (!organizationId) return res.status(404).json({ error: 'Course not found' });
      const hasScope = await hasStaffScopeForOrganization(req, organizationId);
      if (!hasScope) return res.status(403).json({ error: 'Access denied to course translation' });

      const result = await CourseTranslationOrchestrator.translateCourseMetadataOnly({
        sourceCourseId: courseId,
        targetLanguageCode,
        organizationId,
        initiatedBy: userId,
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/courses/:id/translation-credit-cost', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      res.json({ creditCost: 1, description: 'Translate course title and description' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/courses/:id/translation-status', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });

      const { id: courseId } = req.params;
      const organizationId = await getCourseOrganizationId(courseId);
      if (!organizationId) return res.status(404).json({ error: 'Course not found' });
      const hasScope = await hasStaffScopeForOrganization(req, organizationId);
      if (!hasScope) return res.status(403).json({ error: 'Access denied to course translation jobs' });

      const jobs = await CourseTranslationOrchestrator.getTranslationJobsForCourse(courseId);
      res.json(jobs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/translation-jobs/:jobId/cancel', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });

      const { jobId } = req.params;
      const [job] = await db
        .select({ organizationId: contentTranslationJobs.organizationId })
        .from(contentTranslationJobs)
        .where(eq(contentTranslationJobs.id, jobId))
        .limit(1);
      if (!job) return res.status(404).json({ error: 'Translation job not found' });

      const hasScope = await hasStaffScopeForOrganization(req, job.organizationId);
      if (!hasScope) return res.status(403).json({ error: 'Access denied to translation job' });

      await CourseTranslationOrchestrator.cancelTranslation(jobId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/courses/:id/languages', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.session?.userId ? String(req.session.userId) : null;

      // Query the course to get its contentGroupId
      const [course] = await db
        .select({
          contentGroupId: courses.contentGroupId,
          languageCode: courses.languageCode,
          organizationId: courses.organizationId,
          status: courses.status,
          isDefaultLanguage: courses.isDefaultLanguage,
          translationStatus: courses.translationStatus,
        })
        .from(courses)
        .where(eq(courses.id, id))
        .limit(1);

      if (!course) return res.status(404).json({ error: 'Course not found' });
      const includeDraftVariantsForStaff =
        !!userId && !!course.organizationId
          ? await hasStaffScopeForOrganization(req, course.organizationId)
          : false;
      if (!includeDraftVariantsForStaff && !isPublicCourseLanguageVariantAvailable(course)) {
        return res.json([]);
      }

      if (!course.contentGroupId) {
        return res.json([]);
      }

      // Find all course variants with the same contentGroupId
      const variants = await db
        .select({
          id: courses.id,
          languageCode: courses.languageCode,
          status: courses.status,
          isDefaultLanguage: courses.isDefaultLanguage,
          translationStatus: courses.translationStatus,
        })
        .from(courses)
        .where(and(
          eq(courses.contentGroupId, course.contentGroupId),
          eq(courses.status, 'active')
        ));

      // Enrich variant data with language names from supportedLanguages
      const result = variants
        .filter((v) => includeDraftVariantsForStaff || isPublicCourseLanguageVariantAvailable(v))
        .filter(v => v.languageCode)
        .map(async (v) => {
          const [lang] = await db
            .select({ name: supportedLanguages.name, nativeName: supportedLanguages.nativeName })
            .from(supportedLanguages)
            .where(eq(supportedLanguages.code, v.languageCode!))
            .limit(1);

          return {
            code: v.languageCode!,
            name: lang?.name || v.languageCode!, // Fallback to code if language not found
            nativeName: lang?.nativeName || v.languageCode!, // Fallback to code if language not found
            courseId: v.id,
          };
        });

      // Wait for all async operations to complete
      const enrichedVariants = await Promise.all(result);

      res.json(enrichedVariants);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Public endpoint: Course language availability is non-sensitive metadata needed for course cards
  app.post('/api/courses/batch-languages', async (req: Request, res: Response) => {
    try {
      const { courseIds } = req.body;
      if (!courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
        return res.json({});
      }

      const limitedIds = courseIds.slice(0, 100);
      
      const coursesWithGroups = await db
        .select({
          id: courses.id,
          contentGroupId: courses.contentGroupId,
          languageCode: courses.languageCode,
          isDefaultLanguage: courses.isDefaultLanguage,
          status: courses.status,
          translationStatus: courses.translationStatus,
        })
        .from(courses)
        .where(inArray(courses.id, limitedIds));

      const publiclyAvailableCourses = coursesWithGroups.filter((row) => isPublicCourseLanguageVariantAvailable(row));

      const contentGroupIds = Array.from(new Set(
        publiclyAvailableCourses
          .filter(c => c.contentGroupId)
          .map(c => c.contentGroupId!)
      ));

      if (contentGroupIds.length === 0) {
        return res.json({});
      }

      const allVariants = await db
        .select({
          id: courses.id,
          contentGroupId: courses.contentGroupId,
          languageCode: courses.languageCode,
          isDefaultLanguage: courses.isDefaultLanguage,
          status: courses.status,
          translationStatus: courses.translationStatus,
        })
        .from(courses)
        .where(inArray(courses.contentGroupId, contentGroupIds));

      const result: Record<string, { languages: Array<{ code: string; courseId: string; isDefault: boolean }> }> = {};
      
      for (const c of publiclyAvailableCourses) {
        const variants = allVariants
          .filter(v => v.contentGroupId === c.contentGroupId)
          .filter((v) => isPublicCourseLanguageVariantAvailable(v))
          .filter(v => v.languageCode)
          .map(v => ({
            code: String(v.languageCode!),
            courseId: String(v.id),
            isDefault: !!v.isDefaultLanguage,
          }))
          .sort((a, b) => {
            if (a.isDefault && !b.isDefault) return -1;
            if (!a.isDefault && b.isDefault) return 1;
            return a.code.localeCompare(b.code);
          });
        const langs = variants;
        result[c.id] = { languages: langs };
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/lessons/batch-languages', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { lessonIds } = req.body;
      if (!lessonIds || !Array.isArray(lessonIds) || lessonIds.length === 0) {
        return res.json({});
      }

      const sourceLessons = await db
        .select({ 
          id: lessons.id, 
          contentGroupId: lessons.contentGroupId,
          updatedAt: lessons.updatedAt,
          storageKey: lessons.storageKey,
          gammaCardId: lessons.gammaCardId,
          videoStorageKey: lessons.videoStorageKey,
          sourceDocumentPath: lessons.sourceDocumentPath,
          languageCode: lessons.languageCode,
          relatedQuizId: lessons.relatedQuizId,
          metadata: lessons.metadata,
          inputText: lessons.inputText,
        })
        .from(lessons)
        .where(inArray(lessons.id, lessonIds));

      const resolveSourceGroupId = (lesson: { id: string; contentGroupId: string | null }) =>
        String(lesson.contentGroupId || lesson.id);

      const allLessonIds = sourceLessons.map(l => l.id);
      const quizLinksForSource = allLessonIds.length > 0
        ? await db.select({ lessonId: lessonQuizLinks.lessonId, quizId: lessonQuizLinks.quizId }).from(lessonQuizLinks).where(inArray(lessonQuizLinks.lessonId, allLessonIds))
        : [];
      const sourceLessonHasQuiz = new Set(quizLinksForSource.map(q => q.lessonId));
      const sourceQuizIdsByLesson = new Map<string, string[]>();
      for (const row of quizLinksForSource) {
        const list = sourceQuizIdsByLesson.get(row.lessonId) || [];
        list.push(String(row.quizId));
        sourceQuizIdsByLesson.set(row.lessonId, list);
      }
      for (const sourceLesson of sourceLessons) {
        if (!sourceLesson.relatedQuizId) continue;
        const list = sourceQuizIdsByLesson.get(sourceLesson.id) || [];
        list.push(String(sourceLesson.relatedQuizId));
        sourceQuizIdsByLesson.set(sourceLesson.id, Array.from(new Set(list)));
      }

      const sourceQuizIds = Array.from(new Set(Array.from(sourceQuizIdsByLesson.values()).flat().filter(Boolean)));
      const sourceQuizRows = sourceQuizIds.length > 0
        ? await db
            .select({
              id: quizCollections.id,
              contentGroupId: quizCollections.contentGroupId,
              languageCode: quizCollections.languageCode,
              organizationId: quizCollections.organizationId,
            })
            .from(quizCollections)
            .where(inArray(quizCollections.id, sourceQuizIds))
        : [];
      const quizGroupIds = Array.from(new Set(sourceQuizRows.map((quiz) => String(quiz.contentGroupId || quiz.id)).filter(Boolean)));
      const quizFamilyRows = quizGroupIds.length > 0
        ? await db
            .select({
              id: quizCollections.id,
              contentGroupId: quizCollections.contentGroupId,
              languageCode: quizCollections.languageCode,
              organizationId: quizCollections.organizationId,
            })
            .from(quizCollections)
            .where(inArray(quizCollections.contentGroupId, quizGroupIds))
        : [];
      const quizRowsByGroupId = new Map<string, Array<{ id: string; contentGroupId: string | null; languageCode: string | null; organizationId: string | null }>>();
      for (const quiz of [...sourceQuizRows, ...quizFamilyRows]) {
        const groupId = String(quiz.contentGroupId || quiz.id || "").trim();
        if (!groupId) continue;
        const list = quizRowsByGroupId.get(groupId) || [];
        if (!list.some((existing) => String(existing.id) === String(quiz.id))) {
          list.push(quiz);
        }
        quizRowsByGroupId.set(groupId, list);
      }
      const quizLanguagesByLessonId = new Map<string, Map<string, string[]>>();
      for (const [lessonId, quizIds] of sourceQuizIdsByLesson.entries()) {
        const languages = quizLanguagesByLessonId.get(lessonId) || new Map<string, string[]>();
        for (const quizId of quizIds) {
          const sourceQuiz = sourceQuizRows.find((quiz) => String(quiz.id) === String(quizId));
          if (!sourceQuiz) continue;
          const groupId = String(sourceQuiz.contentGroupId || sourceQuiz.id || "").trim();
          for (const familyQuiz of quizRowsByGroupId.get(groupId) || []) {
            const languageCode = String(familyQuiz.languageCode || sourceQuiz.languageCode || "en").trim().toLowerCase() || "en";
            const list = languages.get(languageCode) || [];
            list.push(String(familyQuiz.id));
            languages.set(languageCode, Array.from(new Set(list)));
          }
        }
        quizLanguagesByLessonId.set(lessonId, languages);
      }

      const mergeQuizLanguageState = (params: {
        lessonId: string;
        sourceLessonId: string;
        sourceLanguageCode?: string | null;
        currentLanguages: Array<any>;
      }): Array<any> => {
        const quizLanguages = quizLanguagesByLessonId.get(params.sourceLessonId);
        if (!quizLanguages || quizLanguages.size === 0) return params.currentLanguages;

        const next = [...params.currentLanguages];
        const sourceLanguageCode = String(params.sourceLanguageCode || "en").trim().toLowerCase() || "en";
        for (const [languageCode, quizIds] of quizLanguages.entries()) {
          if (languageCode === sourceLanguageCode) {
            continue;
          }
          const existing = next.find((entry) => String(entry.code || "").trim().toLowerCase() === languageCode);
          if (existing) {
            existing.hasQuiz = existing.hasQuiz || quizIds.length > 0;
            existing.quizIds = Array.from(new Set([...(existing.quizIds || []), ...quizIds]));
            continue;
          }
          next.push({
            lessonId: params.lessonId,
            code: languageCode,
            status: "published",
            isStale: false,
            hasPptx: false,
            hasVideo: false,
            hasQuiz: quizIds.length > 0,
            hasWordDoc: false,
            hasContent: false,
            hasObjectives: false,
            hasDigest: false,
            quizIds,
            hasPodcast: false,
            hasPodcastScript: false,
            activePodcastVersionId: null,
            hasStepGuide: false,
            activeStepGuideVersionId: null,
            generationStatus: null,
            feedbackStatus: null,
          });
        }
        return next;
      };

      const contentGroupIds = sourceLessons
        .map((lesson) => resolveSourceGroupId(lesson));

      if (contentGroupIds.length === 0) {
        const result: Record<string, { languages: any[]; defaultLanguage?: { lessonId: string; code: string; hasPptx: boolean; hasVideo: boolean; hasQuiz: boolean; hasWordDoc: boolean; hasContent: boolean; hasObjectives: boolean; hasDigest: boolean; quizIds: string[]; hasPodcast: boolean; hasPodcastScript: boolean; activePodcastVersionId: string | null; hasStepGuide: boolean; activeStepGuideVersionId: string | null } }> = {};
        lessonIds.forEach((id: string) => { 
          const sl = sourceLessons.find(s => s.id === id);
          const podcastSummary = summarizePodcastArtifacts(sl?.metadata, sl?.languageCode || null);
          const stepGuideSummary = summarizeStepGuideArtifacts(sl?.metadata, sl?.languageCode || null);
          result[id] = { 
            languages: [],
            defaultLanguage: sl ? {
              lessonId: sl.id,
              code: sl.languageCode || 'en',
              hasPptx: !!sl.storageKey || !!sl.gammaCardId,
              hasVideo: !!sl.videoStorageKey,
              hasQuiz: sourceLessonHasQuiz.has(sl.id) || !!sl.relatedQuizId,
              hasWordDoc: !!sl.sourceDocumentPath,
              hasContent: !!String(sl.inputText || '').trim(),
              hasObjectives: hasLearningObjectives(sl.metadata),
              hasDigest: hasDigestSectionsForLanguage(sl.metadata, sl.languageCode || null),
              quizIds: withPrimaryQuizId(sourceQuizIdsByLesson.get(sl.id) || [], sl.relatedQuizId),
              hasPodcast: podcastSummary.hasPodcast,
              hasPodcastScript: podcastSummary.hasPodcastScript,
              activePodcastVersionId: podcastSummary.activePodcastVersionId,
              hasStepGuide: stepGuideSummary.hasStepGuide,
              activeStepGuideVersionId: stepGuideSummary.activeStepGuideVersionId,
            } : undefined,
          };
        });
        return res.json(result);
      }

      const allVariants = await db
        .select({
          id: lessons.id,
          contentGroupId: lessons.contentGroupId,
          languageCode: lessons.languageCode,
          translationStatus: lessons.translationStatus,
          isDefaultLanguage: lessons.isDefaultLanguage,
          updatedAt: lessons.updatedAt,
          storageKey: lessons.storageKey,
          gammaCardId: lessons.gammaCardId,
          videoStorageKey: lessons.videoStorageKey,
          sourceDocumentPath: lessons.sourceDocumentPath,
          relatedQuizId: lessons.relatedQuizId,
          generationStatus: lessons.generationStatus,
          feedbackStatus: lessons.feedbackStatus,
          metadata: lessons.metadata,
          inputText: lessons.inputText,
        })
        .from(lessons)
        .where(and(
          inArray(lessons.contentGroupId, contentGroupIds),
          or(eq(lessons.isDefaultLanguage, false), isNull(lessons.isDefaultLanguage))
        ));

      const sourceLessonIdSet = new Set(sourceLessons.map((lesson) => String(lesson.id)));

      const variantIds = allVariants.map(v => v.id);
      const quizLinksForVariants = variantIds.length > 0
        ? await db.select({ lessonId: lessonQuizLinks.lessonId, quizId: lessonQuizLinks.quizId }).from(lessonQuizLinks).where(inArray(lessonQuizLinks.lessonId, variantIds))
        : [];
      const variantHasQuiz = new Set(quizLinksForVariants.map(q => q.lessonId));
      const variantQuizIdsByLesson = new Map<string, string[]>();
      for (const row of quizLinksForVariants) {
        const list = variantQuizIdsByLesson.get(row.lessonId) || [];
        list.push(String(row.quizId));
        variantQuizIdsByLesson.set(row.lessonId, list);
      }

      const defaultVariants = await db
        .select({
          id: lessons.id,
          contentGroupId: lessons.contentGroupId,
          updatedAt: lessons.updatedAt,
          storageKey: lessons.storageKey,
          gammaCardId: lessons.gammaCardId,
          videoStorageKey: lessons.videoStorageKey,
          sourceDocumentPath: lessons.sourceDocumentPath,
          languageCode: lessons.languageCode,
          relatedQuizId: lessons.relatedQuizId,
          metadata: lessons.metadata,
          inputText: lessons.inputText,
        })
        .from(lessons)
        .where(and(
          inArray(lessons.contentGroupId, contentGroupIds),
          eq(lessons.isDefaultLanguage, true)
        ));

      const defaultIds = defaultVariants.map(dv => dv.id);
      const quizLinksForDefaults = defaultIds.length > 0
        ? await db.select({ lessonId: lessonQuizLinks.lessonId, quizId: lessonQuizLinks.quizId }).from(lessonQuizLinks).where(inArray(lessonQuizLinks.lessonId, defaultIds))
        : [];
      const defaultHasQuiz = new Set(quizLinksForDefaults.map(q => q.lessonId));
      const defaultQuizIdsByLesson = new Map<string, string[]>();
      for (const row of quizLinksForDefaults) {
        const list = defaultQuizIdsByLesson.get(row.lessonId) || [];
        list.push(String(row.quizId));
        defaultQuizIdsByLesson.set(row.lessonId, list);
      }

      const defaultUpdatedMap = new Map<string, Date>();
      const setDefaultUpdatedAt = (groupId: string, updatedAt: Date) => {
        const existing = defaultUpdatedMap.get(groupId);
        if (!existing || updatedAt.getTime() > existing.getTime()) {
          defaultUpdatedMap.set(groupId, updatedAt);
        }
      };
      for (const sourceLesson of sourceLessons) {
        const sourceGroupId = resolveSourceGroupId(sourceLesson);
        if (!sourceGroupId || !sourceLesson.updatedAt) continue;
        setDefaultUpdatedAt(sourceGroupId, new Date(sourceLesson.updatedAt));
      }
      for (const dv of defaultVariants) {
        if (dv.contentGroupId && dv.updatedAt) {
          setDefaultUpdatedAt(dv.contentGroupId, new Date(dv.updatedAt));
        }
      }

      const defaultInfoMap = new Map<string, { 
        lessonId: string;
        code: string; 
        hasPptx: boolean; 
        hasVideo: boolean; 
        hasQuiz: boolean; 
        hasWordDoc: boolean;
        hasContent: boolean;
        hasObjectives: boolean;
        hasDigest: boolean;
        quizIds: string[];
        hasPodcast: boolean;
        hasPodcastScript: boolean;
        activePodcastVersionId: string | null;
        hasStepGuide: boolean;
        activeStepGuideVersionId: string | null;
      }>();
      for (const sourceLesson of sourceLessons) {
        const sourceGroupId = resolveSourceGroupId(sourceLesson);
        const podcastSummary = summarizePodcastArtifacts(sourceLesson.metadata, sourceLesson.languageCode || null);
        const stepGuideSummary = summarizeStepGuideArtifacts(sourceLesson.metadata, sourceLesson.languageCode || null);
        defaultInfoMap.set(sourceGroupId, {
          lessonId: sourceLesson.id,
          code: sourceLesson.languageCode || 'en',
          hasPptx: !!sourceLesson.storageKey || !!sourceLesson.gammaCardId,
          hasVideo: !!sourceLesson.videoStorageKey,
          hasQuiz: sourceLessonHasQuiz.has(sourceLesson.id) || !!sourceLesson.relatedQuizId,
          hasWordDoc: !!sourceLesson.sourceDocumentPath,
          hasContent: !!String(sourceLesson.inputText || '').trim(),
          hasObjectives: hasLearningObjectives(sourceLesson.metadata),
          hasDigest: hasDigestSectionsForLanguage(sourceLesson.metadata, sourceLesson.languageCode || null),
          quizIds: withPrimaryQuizId(sourceQuizIdsByLesson.get(sourceLesson.id) || [], sourceLesson.relatedQuizId),
          hasPodcast: podcastSummary.hasPodcast,
          hasPodcastScript: podcastSummary.hasPodcastScript,
          activePodcastVersionId: podcastSummary.activePodcastVersionId,
          hasStepGuide: stepGuideSummary.hasStepGuide,
          activeStepGuideVersionId: stepGuideSummary.activeStepGuideVersionId,
        });
      }
      for (const dv of defaultVariants) {
        if (dv.contentGroupId) {
          const podcastSummary = summarizePodcastArtifacts(dv.metadata, dv.languageCode || null);
          const stepGuideSummary = summarizeStepGuideArtifacts(dv.metadata, dv.languageCode || null);
          defaultInfoMap.set(dv.contentGroupId, {
            lessonId: dv.id,
            code: dv.languageCode || 'en',
            hasPptx: !!dv.storageKey || !!dv.gammaCardId,
            hasVideo: !!dv.videoStorageKey,
            hasQuiz: defaultHasQuiz.has(dv.id) || !!dv.relatedQuizId,
            hasWordDoc: !!dv.sourceDocumentPath,
            hasContent: !!String(dv.inputText || '').trim(),
            hasObjectives: hasLearningObjectives(dv.metadata),
            hasDigest: hasDigestSectionsForLanguage(dv.metadata, dv.languageCode || null),
            quizIds: withPrimaryQuizId(defaultQuizIdsByLesson.get(dv.id) || [], dv.relatedQuizId),
            hasPodcast: podcastSummary.hasPodcast,
            hasPodcastScript: podcastSummary.hasPodcastScript,
            activePodcastVersionId: podcastSummary.activePodcastVersionId,
            hasStepGuide: stepGuideSummary.hasStepGuide,
            activeStepGuideVersionId: stepGuideSummary.activeStepGuideVersionId,
          });
        }
      }

      const groupToLanguages = new Map<string, Array<{ lessonId: string; code: string; status: string; isStale: boolean; hasPptx: boolean; hasVideo: boolean; hasQuiz: boolean; hasWordDoc: boolean; hasContent: boolean; hasObjectives: boolean; hasDigest: boolean; quizIds: string[]; hasPodcast: boolean; hasPodcastScript: boolean; activePodcastVersionId: string | null; hasStepGuide: boolean; activeStepGuideVersionId: string | null; generationStatus: string | null; feedbackStatus: string | null }>>();
      for (const v of allVariants) {
        if (!v.contentGroupId || !v.languageCode) continue;
        if (sourceLessonIdSet.has(String(v.id))) continue;
        const existing = groupToLanguages.get(v.contentGroupId) || [];
        // Staleness detection using updatedAt comparison:
        // Translation is stale if source (default language) was modified after the translation was created/updated.
        // This works because when source content is edited, its updatedAt is bumped, and when a translation is
        // created/updated, its updatedAt is set. So if source.updatedAt > translation.updatedAt, the translation
        // was made before the latest source edit.
        const isStale = v.contentGroupId && v.updatedAt
          ? (defaultUpdatedMap.get(v.contentGroupId)?.getTime() || 0) > new Date(v.updatedAt).getTime()
          : false;
        const podcastSummary = summarizePodcastArtifacts(v.metadata, v.languageCode || null);
        const stepGuideSummary = summarizeStepGuideArtifacts(v.metadata, v.languageCode || null);
        existing.push({ 
          lessonId: v.id,
          code: v.languageCode, 
          status: v.translationStatus || 'draft', 
          isStale,
          hasPptx: !!v.storageKey || !!v.gammaCardId,
          hasVideo: !!v.videoStorageKey,
          hasQuiz: variantHasQuiz.has(v.id) || !!v.relatedQuizId,
          hasWordDoc: !!v.sourceDocumentPath,
          hasContent: !!String(v.inputText || '').trim(),
          hasObjectives: hasLearningObjectives(v.metadata),
          hasDigest: hasDigestSectionsForLanguage(v.metadata, v.languageCode || null),
          quizIds: withPrimaryQuizId(variantQuizIdsByLesson.get(v.id) || [], v.relatedQuizId),
          hasPodcast: podcastSummary.hasPodcast,
          hasPodcastScript: podcastSummary.hasPodcastScript,
          activePodcastVersionId: podcastSummary.activePodcastVersionId,
          hasStepGuide: stepGuideSummary.hasStepGuide,
          activeStepGuideVersionId: stepGuideSummary.activeStepGuideVersionId,
          generationStatus: v.generationStatus || null,
          feedbackStatus: v.feedbackStatus || null,
        });
        groupToLanguages.set(v.contentGroupId, existing);
      }

      const result: Record<string, { languages: any[]; defaultLanguage?: { lessonId: string; code: string; hasPptx: boolean; hasVideo: boolean; hasQuiz: boolean; hasWordDoc: boolean; hasContent: boolean; hasObjectives: boolean; hasDigest: boolean; quizIds: string[]; hasPodcast: boolean; hasPodcastScript: boolean; activePodcastVersionId: string | null; hasStepGuide: boolean; activeStepGuideVersionId: string | null } }> = {};
      for (const sl of sourceLessons) {
        const sourceGroupId = resolveSourceGroupId(sl);
        const defaultInfo = defaultInfoMap.get(sourceGroupId);
        const languages = mergeQuizLanguageState({
          lessonId: sl.id,
          sourceLessonId: sl.id,
          sourceLanguageCode: sl.languageCode,
          currentLanguages: groupToLanguages.get(sourceGroupId) || [],
        });
        if (groupToLanguages.has(sourceGroupId)) {
          result[sl.id] = { 
            languages,
            defaultLanguage: defaultInfo,
          };
        } else {
          result[sl.id] = { 
            languages,
            defaultLanguage: defaultInfo,
          };
        }
      }
      for (const id of lessonIds) {
        if (!result[id]) result[id] = { languages: [] };
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/quizzes/:id/versions', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const history = await QuizVersioningService.getVersionHistory(id);
      res.json(history);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/quizzes/:id/versions/:version', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { id, version } = req.params;
      const snapshot = await QuizVersioningService.getVersionSnapshot(id, parseInt(version, 10));
      if (!snapshot) return res.status(404).json({ error: 'Version not found' });
      res.json(snapshot);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Public endpoint: Language availability is non-sensitive metadata needed for learner language selection
  // (includes showcase/anonymous users who need to see available languages)
  app.get('/api/lessons/:id/languages', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const includeDetails = req.query.details === 'true';
      const userId = req.session?.userId ? String(req.session.userId) : null;

      const [lesson] = await db
        .select({ 
          contentGroupId: lessons.contentGroupId, 
          languageCode: lessons.languageCode, 
          organizationId: lessons.organizationId,
          isDefaultLanguage: lessons.isDefaultLanguage,
          translationStatus: lessons.translationStatus,
          storageKey: lessons.storageKey,
          gammaCardId: lessons.gammaCardId,
          generationStatus: lessons.generationStatus,
          sourceDocumentPath: lessons.sourceDocumentPath,
          inputText: lessons.inputText,
          relatedQuizId: lessons.relatedQuizId,
          metadata: lessons.metadata,
        })
        .from(lessons)
        .where(eq(lessons.id, id))
        .limit(1);

      let includeDraftVariantsForStaff = false;
      if (userId && lesson?.organizationId) {
        includeDraftVariantsForStaff = await hasStaffScopeForOrganization(req, lesson.organizationId);
      }

      const effectiveContentGroupId = String(lesson?.contentGroupId || id);
      const variants = await db
        .select({ 
          id: lessons.id, 
          languageCode: lessons.languageCode, 
          isDefaultLanguage: lessons.isDefaultLanguage,
          translationStatus: lessons.translationStatus,
          storageKey: lessons.storageKey,
          gammaCardId: lessons.gammaCardId,
          generationStatus: lessons.generationStatus,
          sourceDocumentPath: lessons.sourceDocumentPath,
          inputText: lessons.inputText,
          relatedQuizId: lessons.relatedQuizId,
          metadata: lessons.metadata,
        })
        .from(lessons)
        .where(
          lesson?.contentGroupId
            ? eq(lessons.contentGroupId, lesson.contentGroupId)
            : or(
                eq(lessons.id, id),
                eq(lessons.contentGroupId, effectiveContentGroupId)
              )
        );

      if (variants.length === 0 && lesson) {
        const langCode = lesson.languageCode || 'en';
        const [langInfo] = await db
          .select({ name: supportedLanguages.name, nativeName: supportedLanguages.nativeName })
          .from(supportedLanguages)
          .where(eq(supportedLanguages.code, langCode))
          .limit(1);
        const quizLinksForSingle = includeDetails
          ? await db.select({ quizId: lessonQuizLinks.quizId }).from(lessonQuizLinks).where(eq(lessonQuizLinks.lessonId, id))
          : [];
        const hasSinglePptxVersion = includeDetails
          ? (await db
              .select({ id: lessonPresentationVersions.id })
              .from(lessonPresentationVersions)
              .where(eq(lessonPresentationVersions.lessonId, id))
              .limit(1)).length > 0
          : false;

        return res.json([{
          code: langCode,
          name: langInfo?.name || langCode,
          nativeName: langInfo?.nativeName || langCode,
          lessonId: id,
          isDefault: true,
          ...(includeDetails ? {
            hasPptx: !!lesson.storageKey || hasSinglePptxVersion,
            generationStatus: lesson.generationStatus || null,
            hasWordDoc: !!lesson.sourceDocumentPath,
            hasContent: !!(lesson.inputText && lesson.inputText.trim().length > 0),
            quizIds: withPrimaryQuizId(quizLinksForSingle.map(l => l.quizId), lesson.relatedQuizId),
            hasStepGuide: summarizeStepGuideArtifacts(lesson.metadata, langCode).hasStepGuide,
          } : {}),
        }]);
      }

      const variantIds = variants.map(v => v.id);
      const pptxVersionRows = includeDetails && variantIds.length > 0
        ? await db
            .select({ lessonId: lessonPresentationVersions.lessonId })
            .from(lessonPresentationVersions)
            .where(inArray(lessonPresentationVersions.lessonId, variantIds))
        : [];
      const lessonIdsWithPptxVersions = new Set(pptxVersionRows.map((row) => row.lessonId));
      const allQuizLinks = includeDetails && variantIds.length > 0
        ? await db.select({ lessonId: lessonQuizLinks.lessonId, quizId: lessonQuizLinks.quizId })
            .from(lessonQuizLinks)
            .where(inArray(lessonQuizLinks.lessonId, variantIds))
        : [];

      const result = [];
      for (const v of variants) {
        if (!includeDraftVariantsForStaff && !isPublicLessonLanguageVariantAvailable(v)) continue;
        if (!v.languageCode) continue;
        const [lang] = await db
          .select({ name: supportedLanguages.name, nativeName: supportedLanguages.nativeName })
          .from(supportedLanguages)
          .where(eq(supportedLanguages.code, v.languageCode))
          .limit(1);

        result.push({
          code: v.languageCode,
          name: lang?.name || v.languageCode,
          nativeName: lang?.nativeName || v.languageCode,
          lessonId: v.id,
          isDefault: v.isDefaultLanguage || false,
          ...(includeDetails ? {
            hasPptx: !!v.storageKey || lessonIdsWithPptxVersions.has(v.id),
            generationStatus: v.generationStatus || null,
            hasWordDoc: !!v.sourceDocumentPath,
            hasContent: !!(v.inputText && v.inputText.trim().length > 0),
            quizIds: withPrimaryQuizId(allQuizLinks.filter(l => l.lessonId === v.id).map(l => l.quizId), v.relatedQuizId),
            hasStepGuide: summarizeStepGuideArtifacts(v.metadata, v.languageCode || null).hasStepGuide,
          } : {}),
        });
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/quizzes/:id/versions/:version/restore', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      const { id, version } = req.params;
      const result = await QuizVersioningService.restoreVersion(
        id,
        parseInt(version, 10),
        { editedBy: userId }
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/lessons/:id/all-versions', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const [lesson] = await db
        .select({ contentGroupId: lessons.contentGroupId, languageCode: lessons.languageCode, organizationId: lessons.organizationId })
        .from(lessons)
        .where(eq(lessons.id, id))
        .limit(1);

      if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });

      const sessionContext = req.session?.context as any;
      if (sessionContext?.effectiveRole !== 'SuperAdmin') {
      const userRoles = await db
        .select({ role: userOrganizationRoles.role })
        .from(userOrganizationRoles)
        .where(and(
          eq(userOrganizationRoles.userId, userId),
          eq(userOrganizationRoles.organizationId, lesson.organizationId)
        ));

      if (userRoles.length === 0) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const hasAdminAccess = userRoles.some((r) => isStaffScopedRole(r.role));

      if (!hasAdminAccess) {
        return res.status(403).json({ error: 'Only teachers and admins can manage versions' });
      }
      }

      const effectiveContentGroupId = String(lesson.contentGroupId || id);
      const variants = await db
        .select({
          id: lessons.id,
          title: lessons.title,
          languageCode: lessons.languageCode,
          isDefaultLanguage: lessons.isDefaultLanguage,
          activeLessonVersionId: lessons.activeLessonVersionId,
          updatedAt: lessons.updatedAt,
          storageKey: lessons.storageKey,
          gammaCardId: lessons.gammaCardId,
          videoStorageKey: lessons.videoStorageKey,
          sourceDocumentPath: lessons.sourceDocumentPath,
        })
        .from(lessons)
        .where(
          lesson.contentGroupId
            ? eq(lessons.contentGroupId, lesson.contentGroupId)
            : or(
                eq(lessons.id, id),
                eq(lessons.contentGroupId, effectiveContentGroupId)
              )
        );

      const variantIds = variants.map(v => v.id);

      const versions = variantIds.length > 0
        ? await db
            .select({
              id: lessonVersions.id,
              lessonId: lessonVersions.lessonId,
              versionNumber: lessonVersions.versionNumber,
              title: lessonVersions.title,
              languageCode: lessonVersions.languageCode,
              changeDescription: lessonVersions.changeDescription,
              createdAt: lessonVersions.createdAt,
              editedBy: lessonVersions.editedBy,
              slideCount: lessonVersions.slideCount,
            })
            .from(lessonVersions)
            .where(inArray(lessonVersions.lessonId, variantIds))
            .orderBy(lessonVersions.createdAt)
        : [];

      const result = variants.map(variant => ({
        lessonId: variant.id,
        languageCode: variant.languageCode || 'en',
        isDefaultLanguage: variant.isDefaultLanguage,
        activeLessonVersionId: variant.activeLessonVersionId,
        currentTitle: variant.title,
        updatedAt: variant.updatedAt,
        hasPptx: !!variant.storageKey || !!variant.gammaCardId,
        hasVideo: !!variant.videoStorageKey,
        hasWordDoc: !!variant.sourceDocumentPath,
        versions: [
          { id: null, versionNumber: 0, title: variant.title, languageCode: variant.languageCode || 'en', changeDescription: 'Current version', createdAt: variant.updatedAt, isCurrentState: true },
          ...versions
            .filter(v => v.lessonId === variant.id)
            .map(v => ({ ...v, isCurrentState: false })),
        ],
      }));

      res.json({ organizationId: lesson.organizationId, variants: result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/lessons/:id/active-version', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });

      const { id: lessonId } = req.params;
      const { versionId } = z.object({ versionId: z.string().nullable() }).parse(req.body);

      const [lesson] = await db
        .select({ id: lessons.id, organizationId: lessons.organizationId })
        .from(lessons)
        .where(eq(lessons.id, lessonId))
        .limit(1);

      if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

      const userRoles = await db
        .select({ role: userOrganizationRoles.role })
        .from(userOrganizationRoles)
        .where(and(
          eq(userOrganizationRoles.userId, userId),
          eq(userOrganizationRoles.organizationId, lesson.organizationId)
        ));

      if (userRoles.length === 0) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const hasAdminAccess = userRoles.some(r => 
        ['owner', 'admin', 'teacher', 'org_admin'].includes(r.role || '')
      );

      if (!hasAdminAccess) {
        return res.status(403).json({ error: 'Only teachers and admins can manage versions' });
      }

      if (versionId) {
        const [version] = await db
          .select({ id: lessonVersions.id })
          .from(lessonVersions)
          .where(and(
            eq(lessonVersions.id, versionId),
            eq(lessonVersions.lessonId, lessonId)
          ))
          .limit(1);

        if (!version) return res.status(404).json({ error: 'Version not found for this lesson' });
      }

      await db
        .update(lessons)
        .set({ activeLessonVersionId: versionId })
        .where(eq(lessons.id, lessonId));

      res.json({ success: true, activeLessonVersionId: versionId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/lessons/:id/regenerate-doc', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });

      const { id } = req.params;

      const [lesson] = await db
        .select({
          id: lessons.id,
          title: lessons.title,
          inputText: lessons.inputText,
          sourceDocumentPath: lessons.sourceDocumentPath,
          organizationId: lessons.organizationId,
          languageCode: lessons.languageCode,
        })
        .from(lessons)
        .where(eq(lessons.id, id))
        .limit(1);

      if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

      if (!lesson.inputText) {
        return res.status(400).json({ error: 'Lesson has no inputText content to generate a document from' });
      }

      if (lesson.sourceDocumentPath) {
        return res.status(400).json({ error: 'Lesson already has a sourceDocumentPath' });
      }

      const docxBuffer = await generateSimpleDocx(lesson.title, lesson.inputText);
      const objectStorageService = new ObjectStorageService();
      const sourceDocumentPath = await objectStorageService.uploadSourceDocument(
        lesson.organizationId,
        lesson.id,
        docxBuffer,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        `${lesson.title}.docx`,
        lesson.languageCode || 'en'
      );

      await db.update(lessons)
        .set({ sourceDocumentPath })
        .where(eq(lessons.id, lesson.id));

      console.log(`[RepairDoc] Regenerated Word doc for lesson ${lesson.id} (${lesson.languageCode})`);
      res.json({ success: true, sourceDocumentPath });
    } catch (error: any) {
      console.error('[RepairDoc] Failed to regenerate doc:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/repair-translated-docs', withSessionAuthMiddleware, isSuperAdmin, async (req: Request, res: Response) => {
    try {
      const affectedLessons = await db
        .select({
          id: lessons.id,
          title: lessons.title,
          inputText: lessons.inputText,
          organizationId: lessons.organizationId,
          languageCode: lessons.languageCode,
        })
        .from(lessons)
        .where(and(
          eq(lessons.isDefaultLanguage, false),
          isNotNull(lessons.inputText),
          isNull(lessons.sourceDocumentPath)
        ));

      let repairedCount = 0;
      const errors: Array<{ lessonId: string; error: string }> = [];

      for (const lesson of affectedLessons) {
        try {
          if (!lesson.inputText) continue;

          const docxBuffer = await generateSimpleDocx(lesson.title, lesson.inputText);
          const objectStorageService = new ObjectStorageService();
          const sourceDocumentPath = await objectStorageService.uploadSourceDocument(
            lesson.organizationId,
            lesson.id,
            docxBuffer,
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            `${lesson.title}.docx`,
            lesson.languageCode || 'en'
          );

          await db.update(lessons)
            .set({ sourceDocumentPath })
            .where(eq(lessons.id, lesson.id));

          console.log(`[RepairDoc] Batch-repaired Word doc for lesson ${lesson.id} (${lesson.languageCode})`);
          repairedCount++;
        } catch (lessonError: any) {
          console.error(`[RepairDoc] Failed to repair lesson ${lesson.id}:`, lessonError.message);
          errors.push({ lessonId: lesson.id, error: lessonError.message });
        }
      }

      res.json({
        success: true,
        totalFound: affectedLessons.length,
        repairedCount,
        errors,
      });
    } catch (error: any) {
      console.error('[RepairDoc] Batch repair failed:', error);
      res.status(500).json({ error: error.message });
    }
  });
}
