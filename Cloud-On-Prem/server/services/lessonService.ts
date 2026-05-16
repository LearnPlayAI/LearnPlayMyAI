// @ts-nocheck
import { db } from "../db";
import { 
  lessons, 
  type Lesson, 
  organizations,
  organizationUnits, 
  organizationSubUnits,
  lessonAssignments,
  lessonScopeAssignments,
  lessonQuizLinks,
  lessonProgress,
  quizCollectionAssignments,
  quizCollections,
  users,
  userOrganizationAssignments,
  unitSubjects,
  courseLessons,
  courses,
  courseFrameworks,
  lessonPresentationVersions,
  type LessonAssignment,
  type LessonQuizLink,
  type LessonProgress,
  type SelectLessonPresentationVersion
} from "@shared/schema";
import { eq, and, desc, sql, or, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ObjectStorageService, objectStorageClient, parseObjectPath } from "../objectStorage";
import { compressPPTX } from "../utils/pptxCompressor";
import { isOnPremMode } from '../featureFlags';
import { PptxHtmlConverterService } from './pptxHtmlConverterService';
import { getUploadDir } from "../utils/uploadPaths";
import { lessonPptxStorageKeyMatchesVersion } from "../utils/lessonStorageKeyValidation";
import { TranslationIndexService } from "./translationIndexService";
import { TranslationAnalyticsService } from "./translationAnalyticsService";
import { LessonVersioningService } from "./lessonVersioningService";
import {
  getPresentationVersionsToDeleteOnUpload,
  resolveActivePresentationVersion,
} from "./lessonPresentationVersionPolicy";
import fs from "fs";
import path from "path";
import os from "os";

interface LessonTopic {
  position: number;
  title: string;
  role: 'overview' | 'slide';
}

interface CreateLessonParams {
  title: string;
  description?: string;
  userId: string;
  organizationId: string;
  gradeLevel?: string;
  department?: string;
  subject?: string;
  unit?: string;
  generationMode: "gemini-topics" | "text-input" | "document-upload";
  topics?: LessonTopic[];
  mainTopic?: string;
  subtopic1?: string;
  subtopic2?: string;
  inputText?: string;
  themeId?: string;
  generateImages?: boolean;
  imageStyle?: string;
  relatedQuizId?: string;
}

interface CreateManualLessonParams {
  title: string;
  description?: string;
  userId: string;
  organizationId: string;
  gradeLevel?: string;
  department?: string;
  subject?: string;
  unit?: string;
  slideCount?: number;
}

interface UpdateLessonParams {
  title?: string;
  description?: string;
  gradeLevel?: string;
  department?: string;
  subject?: string;
  unit?: string;
  isPublished?: boolean;
  relatedQuizId?: string;
  metadata?: any;
}

function normalizeLessonLanguageCode(input: string | null | undefined): string {
  const normalized = String(input || "en").trim().toLowerCase();
  return normalized || "en";
}

interface LessonFilters {
  organizationId: string;
  userId?: string;
  gradeLevel?: string;
  department?: string;
  subject?: string;
  unit?: string;
  generationMode?: string;
  generationStatus?: string;
  isPublished?: boolean;
  isArchived?: boolean;
  relatedQuizId?: string;
  search?: string;
}

export interface LessonWithRelations extends Lesson {
  gradeLevelName?: string | null;
  departmentName?: string | null;
  subjectName?: string | null;
  unitName?: string | null;
}

export class LessonService {
  /**
   * Resolve effective lesson type across linked courses.
   * Prefers explicit courseLessons.lessonType and framework topic types.
   * Missing metadata defaults to content so artifact generation is never gated by
   * overview/key-takeaways workflows unless the lesson is explicitly structural.
   */
  static async getEffectiveCourseLessonType(lessonId: string): Promise<'overview' | 'content' | 'key_takeaways'> {
    const links = await db
      .select({
        courseId: courseLessons.courseId,
        topicId: courseLessons.topicId,
        topicOrder: courseLessons.topicOrder,
        lessonType: courseLessons.lessonType,
      })
      .from(courseLessons)
      .where(eq(courseLessons.lessonId, lessonId));

    if (links.length === 0) {
      return 'content';
    }

    if (links.some(l => l.lessonType === 'overview')) {
      return 'overview';
    }
    if (links.some(l => l.lessonType === 'key_takeaways')) {
      return 'key_takeaways';
    }
    if (links.some(l => l.lessonType === 'content')) {
      return 'content';
    }

    const courseIds = Array.from(new Set(links.map(l => l.courseId).filter(Boolean)));
    if (courseIds.length === 0) {
      return 'content';
    }

    const frameworks = await db.query.courseFrameworks.findMany({
      where: (frameworks, { inArray }) => inArray(frameworks.courseId, courseIds),
    });
    const frameworkTypeMatches: Array<'overview' | 'content' | 'key_takeaways'> = [];
    for (const framework of frameworks) {
      const topics = Array.isArray(framework.topics) ? (framework.topics as any[]) : [];
      for (const topic of topics) {
        const matchesLesson = String(topic?.lessonId || '') === lessonId;
        const matchesTopic = links.some((link) =>
          link.courseId === framework.courseId &&
          ((link.topicId && String(topic?.id || '') === String(link.topicId)) || Number(topic?.order) === Number(link.topicOrder))
        );
        if (!matchesLesson && !matchesTopic) continue;
        const topicType = String(topic?.lessonType || '').toLowerCase();
        if (topicType === 'overview' || topic?.isOverview === true) {
          frameworkTypeMatches.push('overview');
        } else if (topicType === 'key_takeaways') {
          frameworkTypeMatches.push('key_takeaways');
        } else if (topicType === 'content') {
          frameworkTypeMatches.push('content');
        }
      }
    }

    if (frameworkTypeMatches.includes('overview')) return 'overview';
    if (frameworkTypeMatches.includes('key_takeaways')) return 'key_takeaways';
    return 'content';
  }

  private static async resolveLatestPresentationState(lesson: Lesson): Promise<{ storageKey: string | null; version: number | null }> {
    const lessonLanguage = normalizeLessonLanguageCode(lesson.languageCode);
    const versionRows = await db
      .select({
        storageKey: lessonPresentationVersions.storageKey,
        version: lessonPresentationVersions.version,
      })
      .from(lessonPresentationVersions)
      .where(
        and(
          eq(lessonPresentationVersions.lessonId, lesson.id),
          sql`LOWER(COALESCE(${lessonPresentationVersions.languageCode}, 'en')) = ${lessonLanguage}`
        )
      )
      .orderBy(desc(lessonPresentationVersions.version));

    const activeVersion = resolveActivePresentationVersion(versionRows, lesson.currentSlideVersion || null);
    if (!activeVersion) {
      return {
        storageKey: lesson.storageKey || null,
        version: lesson.currentSlideVersion || null,
      };
    }

    const lessonStorageKey = lesson.storageKey || null;
    const lessonVersion = lesson.currentSlideVersion || null;
    const shouldMarkCompleted = !!activeVersion.storageKey && lesson.generationStatus !== "completed";
    if (lessonStorageKey !== activeVersion.storageKey || lessonVersion !== activeVersion.version || shouldMarkCompleted) {
      await db
        .update(lessons)
        .set({
          storageKey: activeVersion.storageKey,
          currentSlideVersion: activeVersion.version,
          generationStatus: shouldMarkCompleted ? "completed" : lesson.generationStatus,
          updatedAt: new Date(),
        })
        .where(eq(lessons.id, lesson.id));
    }

    return activeVersion;
  }

  /**
   * Create a new lesson draft
   * Does not start generation - call startGeneration separately
   */
  static async createLesson(params: CreateLessonParams): Promise<Lesson> {
    // Fetch organization type to normalize field names
    const [org] = await db
      .select({ type: organizations.type })
      .from(organizations)
      .where(eq(organizations.id, params.organizationId))
      .limit(1);

    const orgType = org?.type || 'education';

    // Normalize fields based on organization type
    // Frontend always uses gradeLevel/subject, but for business orgs we need department/unit
    let gradeLevel = params.gradeLevel || null;
    let department = params.department || null;
    let subject = params.subject || null;
    let unit = params.unit || null;

    if (orgType === 'business') {
      // For business orgs: gradeLevel → department, subject → unit
      if (params.gradeLevel && !params.department) {
        department = params.gradeLevel;
      }
      if (params.subject && !params.unit) {
        unit = params.subject;
      }
    } else {
      // For education orgs: department → gradeLevel, unit → subject
      if (params.department && !params.gradeLevel) {
        gradeLevel = params.department;
      }
      if (params.unit && !params.subject) {
        subject = params.unit;
      }
    }

    // Build gammaImageOptions JSONB if image generation parameters are provided
    const gammaImageOptions = (params.generateImages !== undefined || params.imageStyle) ? {
      generateImages: params.generateImages ?? true,
      imageStyle: params.imageStyle || 'photorealistic'
    } : null;

    const [lesson] = await db
      .insert(lessons)
      .values({
        title: params.title,
        description: params.description || null,
        createdBy: params.userId,
        organizationId: params.organizationId,
        gradeLevel,
        department,
        subject,
        unit,
        generationMode: params.generationMode,
        generationStatus: "pending",
        topics: params.topics || null,
        mainTopic: params.mainTopic || null,
        subtopic1: params.subtopic1 || null,
        subtopic2: params.subtopic2 || null,
        inputText: params.inputText || null,
        themeId: params.themeId || null,
        gammaImageOptions: gammaImageOptions as any,
        isPublished: false,
        isArchived: false,
        relatedQuizId: params.relatedQuizId || null,
      })
      .returning();

    await db.update(lessons).set({ contentGroupId: lesson.id }).where(eq(lessons.id, lesson.id));

    try {
      await TranslationIndexService.enqueueForLessonMutation({
        lessonId: lesson.id,
        organizationId: params.organizationId,
        eventType: 'create',
        dedupeSeed: `${lesson.id}:create`,
      });
    } catch (indexError: any) {
      console.error('[LessonService] Failed to enqueue translation index job on create:', indexError?.message || indexError);
    }

    console.log(
      `[LessonService] Created lesson ${lesson.id} for user ${params.userId} in org ${params.organizationId} (type: ${orgType})`
    );

    return { ...lesson, contentGroupId: lesson.id };
  }

  /**
   * Create a manual upload lesson
   * Inserts lesson with generationMode="manual-upload", generationStatus="completed", creditsUsed=0
   * Stores the uploaded PPTX file
   */
  static async createManualLesson(params: CreateManualLessonParams, pptxBuffer: Buffer): Promise<Lesson> {
    const [lesson] = await db
      .insert(lessons)
      .values({
        title: params.title,
        description: params.description || null,
        createdBy: params.userId,
        organizationId: params.organizationId,
        gradeLevel: params.gradeLevel || null,
        department: params.department || null,
        subject: params.subject || null,
        unit: params.unit || null,
        generationMode: "manual-upload",
        generationStatus: "completed",
        creditsUsed: 0,
        isPublished: false,
        isArchived: false,
        metadata: params.slideCount ? { slideCount: params.slideCount } : null,
      })
      .returning();

    await db.update(lessons).set({ contentGroupId: lesson.id }).where(eq(lessons.id, lesson.id));

    try {
      await TranslationIndexService.enqueueForLessonMutation({
        lessonId: lesson.id,
        organizationId: params.organizationId,
        eventType: 'create',
        dedupeSeed: `${lesson.id}:manual-create`,
      });
    } catch (indexError: any) {
      console.error('[LessonService] Failed to enqueue translation index job on manual create:', indexError?.message || indexError);
    }

    console.log(
      `[LessonService] Created manual upload lesson ${lesson.id} for user ${params.userId} in org ${params.organizationId}`
    );

    // Compress PPTX images before storing to reduce file size
    let finalBuffer = pptxBuffer;
    let wasCompressed = false;
    const originalSizeMB = (pptxBuffer.length / 1024 / 1024).toFixed(2);
    const MIN_VALID_COMPRESSED_SIZE = 100 * 1024; // 100KB minimum for valid compressed output
    
    try {
      const tempInputPath = path.join(os.tmpdir(), `manual-upload-${Date.now()}.pptx`);
      await fs.promises.writeFile(tempInputPath, pptxBuffer);
      
      const compressionResult = await compressPPTX(tempInputPath, {
        sizeThresholdMB: 25, // Compress files larger than 25MB - skip compression for smaller files
        imageQuality: 72,
        targetMaxSizeMB: 95,
      });
      
      if (compressionResult.compressed) {
        const compressedBuffer = await fs.promises.readFile(compressionResult.outputPath);
        const compressedSizeMB = (compressedBuffer.length / 1024 / 1024).toFixed(2);
        
        // Validate compression output - reject suspiciously small files (likely corrupted)
        if (compressedBuffer.length < MIN_VALID_COMPRESSED_SIZE) {
          console.warn(`[LessonService] Compression produced suspiciously small file (${compressedBuffer.length} bytes), using original`);
          finalBuffer = pptxBuffer;
          wasCompressed = false;
        } else {
          finalBuffer = compressedBuffer;
          wasCompressed = true;
          const savings = ((1 - compressionResult.compressionRatio) * 100).toFixed(1);
          console.log(`[LessonService] Manual PPTX compressed: ${originalSizeMB}MB → ${compressedSizeMB}MB (${savings}% savings)`);
        }
        await fs.promises.unlink(compressionResult.outputPath);
      } else {
        console.log(`[LessonService] Manual PPTX size OK (${originalSizeMB}MB) - no compression needed`);
      }
      
      await fs.promises.unlink(tempInputPath);
    } catch (compressionError) {
      console.error(`[LessonService] Manual PPTX compression failed, using original:`, compressionError);
      finalBuffer = pptxBuffer;
      wasCompressed = false;
    }

    const { lesson: updatedLesson } = await this.storePPTX(lesson.id, finalBuffer, params.userId, { isCompressed: wasCompressed, languageCode: lesson.languageCode || 'en' });

    return updatedLesson;
  }

  /**
   * Get lesson by ID with organization isolation
   */
  static async getLessonById(
    lessonId: string,
    organizationId: string
  ): Promise<LessonWithRelations | null> {
    const gradeUnitAlias = alias(organizationUnits, 'grade_unit_alias');
    const departmentUnitAlias = alias(organizationUnits, 'department_unit_alias');
    const subjectSubUnitAlias = alias(organizationSubUnits, 'subject_subunit_alias');
    const unitSubUnitAlias = alias(organizationSubUnits, 'unit_subunit_alias');

    const [result] = await db
      .select({
        lesson: lessons,
        gradeLevelName: gradeUnitAlias.name,
        departmentName: departmentUnitAlias.name,
        subjectName: subjectSubUnitAlias.name,
        unitName: unitSubUnitAlias.name,
      })
      .from(lessons)
      .leftJoin(gradeUnitAlias, eq(lessons.gradeLevel, gradeUnitAlias.id))
      .leftJoin(departmentUnitAlias, eq(lessons.department, departmentUnitAlias.id))
      .leftJoin(subjectSubUnitAlias, eq(lessons.subject, subjectSubUnitAlias.id))
      .leftJoin(unitSubUnitAlias, eq(lessons.unit, unitSubUnitAlias.id))
      .where(
        and(
          eq(lessons.id, lessonId),
          eq(lessons.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!result) {
      return null;
    }

    return {
      ...result.lesson,
      gradeLevelName: result.gradeLevelName,
      departmentName: result.departmentName,
      subjectName: result.subjectName,
      unitName: result.unitName,
    };
  }

  /**
   * List lessons with filters and pagination
   */
  static async listLessons(
    filters: LessonFilters,
    limit = 50,
    offset = 0
  ): Promise<{ lessons: LessonWithRelations[]; total: number }> {
    const conditions = [eq(lessons.organizationId, filters.organizationId)];

    if (filters.userId) {
      conditions.push(eq(lessons.createdBy, filters.userId));
    }

    if (filters.gradeLevel) {
      conditions.push(eq(lessons.gradeLevel, filters.gradeLevel));
    }

    if (filters.department) {
      conditions.push(eq(lessons.department, filters.department));
    }

    if (filters.subject) {
      conditions.push(eq(lessons.subject, filters.subject));
    }

    if (filters.unit) {
      conditions.push(eq(lessons.unit, filters.unit));
    }

    if (filters.generationMode) {
      conditions.push(eq(lessons.generationMode, filters.generationMode as any));
    }

    if (filters.generationStatus) {
      conditions.push(eq(lessons.generationStatus, filters.generationStatus as any));
    }

    if (filters.isPublished !== undefined) {
      conditions.push(eq(lessons.isPublished, filters.isPublished));
    }

    if (filters.isArchived !== undefined) {
      conditions.push(eq(lessons.isArchived, filters.isArchived));
    } else {
      conditions.push(eq(lessons.isArchived, false));
    }

    if (filters.relatedQuizId) {
      conditions.push(eq(lessons.relatedQuizId, filters.relatedQuizId));
    }

    if (filters.search) {
      const searchPattern = `%${filters.search}%`;
      conditions.push(
        or(
          sql`${lessons.title} ILIKE ${searchPattern}`,
          sql`${lessons.description} ILIKE ${searchPattern}`
        )!
      );
    }

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(lessons)
      .where(and(...conditions));

    const total = Number(countResult.count);

    const gradeUnitAlias = alias(organizationUnits, 'grade_unit_alias');
    const departmentUnitAlias = alias(organizationUnits, 'department_unit_alias');
    const subjectSubUnitAlias = alias(organizationSubUnits, 'subject_subunit_alias');
    const unitSubUnitAlias = alias(organizationSubUnits, 'unit_subunit_alias');

    const rawResults = await db
      .select({
        lesson: lessons,
        gradeLevelName: gradeUnitAlias.name,
        departmentName: departmentUnitAlias.name,
        subjectName: subjectSubUnitAlias.name,
        unitName: unitSubUnitAlias.name,
      })
      .from(lessons)
      .leftJoin(gradeUnitAlias, eq(lessons.gradeLevel, gradeUnitAlias.id))
      .leftJoin(departmentUnitAlias, eq(lessons.department, departmentUnitAlias.id))
      .leftJoin(subjectSubUnitAlias, eq(lessons.subject, subjectSubUnitAlias.id))
      .leftJoin(unitSubUnitAlias, eq(lessons.unit, unitSubUnitAlias.id))
      .where(and(...conditions))
      .orderBy(desc(lessons.createdAt))
      .limit(limit)
      .offset(offset);

    const lessonsList: LessonWithRelations[] = rawResults.map(row => ({
      ...row.lesson,
      gradeLevelName: row.gradeLevelName,
      departmentName: row.departmentName,
      subjectName: row.subjectName,
      unitName: row.unitName,
    }));

    // Fetch linked quizzes and assignment counts for all lessons in this result set
    if (lessonsList.length > 0) {
      const lessonIds = lessonsList.map(l => l.id);
      
      const linkedQuizData = await db
        .select({
          lessonId: lessonQuizLinks.lessonId,
          quizId: lessonQuizLinks.quizId,
          quizName: quizCollections.name,
          isPrimary: lessonQuizLinks.isPrimary,
        })
        .from(lessonQuizLinks)
        .innerJoin(quizCollections, eq(lessonQuizLinks.quizId, quizCollections.id))
        .where(inArray(lessonQuizLinks.lessonId, lessonIds));

      // Fetch assignment counts for each lesson
      const assignmentCounts = await db
        .select({
          lessonId: lessonScopeAssignments.lessonId,
          count: sql<number>`count(*)::int`,
        })
        .from(lessonScopeAssignments)
        .where(inArray(lessonScopeAssignments.lessonId, lessonIds))
        .groupBy(lessonScopeAssignments.lessonId);

      // Create map of assignment counts by lesson
      const assignmentCountsByLesson = new Map<string, number>();
      for (const row of assignmentCounts) {
        assignmentCountsByLesson.set(row.lessonId, row.count);
      }

      // Group quizzes by lesson and attach to lessons
      const quizzesByLesson = new Map<string, Array<{ quizId: string; quizName: string; isPrimary: boolean }>>();
      
      for (const link of linkedQuizData) {
        if (!quizzesByLesson.has(link.lessonId)) {
          quizzesByLesson.set(link.lessonId, []);
        }
        quizzesByLesson.get(link.lessonId)!.push({
          quizId: link.quizId,
          quizName: link.quizName,
          isPrimary: link.isPrimary || false,
        });
      }

      // Attach linked quiz info and assignment count to each lesson
      for (const lesson of lessonsList) {
        const linkedQuizzes = quizzesByLesson.get(lesson.id) || [];
        
        // Find primary quiz or first quiz
        const primaryQuiz = linkedQuizzes.find(q => q.isPrimary);
        const displayQuiz = primaryQuiz || linkedQuizzes[0];
        
        (lesson as any).linkedQuizName = displayQuiz?.quizName || null;
        (lesson as any).linkedQuizId = displayQuiz?.quizId || null;
        (lesson as any).linkedQuizCount = linkedQuizzes.length;
        (lesson as any).assignmentCount = assignmentCountsByLesson.get(lesson.id) || 0;
      }
    }

    return {
      lessons: lessonsList,
      total,
    };
  }

  /**
   * Update lesson metadata
   * Cannot update generation-related fields
   */
  static async updateLesson(
    lessonId: string,
    organizationId: string,
    params: UpdateLessonParams
  ): Promise<Lesson> {
    const lesson = await this.getLessonById(lessonId, organizationId);
    
    if (!lesson) {
      throw new Error(`Lesson ${lessonId} not found`);
    }

    if (lesson.generationStatus === "processing") {
      throw new Error("Cannot update lesson while generation is in progress");
    }

    const updates: any = {
      updatedAt: new Date(),
    };

    if (params.title !== undefined) updates.title = params.title;
    if (params.description !== undefined) updates.description = params.description;
    if (params.gradeLevel !== undefined) updates.gradeLevel = params.gradeLevel;
    if (params.department !== undefined) updates.department = params.department;
    if (params.subject !== undefined) updates.subject = params.subject;
    if (params.unit !== undefined) updates.unit = params.unit;
    if (params.inputText !== undefined) updates.inputText = params.inputText;
    if (params.isPublished !== undefined) updates.isPublished = params.isPublished;
    if (params.relatedQuizId !== undefined) updates.relatedQuizId = params.relatedQuizId;
    
    if (params.metadata !== undefined) {
      updates.metadata = sql`COALESCE(${lessons.metadata}, '{}'::jsonb) || ${JSON.stringify(params.metadata || {})}::jsonb`;
    }

    const [updated] = await db
      .update(lessons)
      .set(updates)
      .where(
        and(
          eq(lessons.id, lessonId),
          eq(lessons.organizationId, organizationId)
        )
      )
      .returning();

    try {
      await TranslationIndexService.enqueueForLessonMutation({
        lessonId,
        organizationId,
        eventType: 'update',
        dedupeSeed: `${lessonId}:${updated?.updatedAt?.toISOString?.() || ''}:update`,
      });
    } catch (indexError: any) {
      console.error('[LessonService] Failed to enqueue translation index job on update:', indexError?.message || indexError);
    }

    console.log(`[LessonService] Updated lesson ${lessonId}`);

    return updated;
  }

  /**
   * Update generation status
   * Internal method used by job queue
   */
  static async updateGenerationStatus(
    lessonId: string,
    status: "pending" | "processing" | "completed" | "failed",
    error?: string,
    txClient?: any
  ): Promise<Lesson> {
    const dbConn = txClient || db;
    
    const updates: any = {
      generationStatus: status,
      updatedAt: new Date(),
    };

    if (error) {
      const currentLesson = await dbConn
        .select()
        .from(lessons)
        .where(eq(lessons.id, lessonId))
        .limit(1);

      if (currentLesson[0]) {
        updates.metadata = {
          ...(currentLesson[0].metadata || {}),
          error,
        };
      }
    }

    const [updated] = await dbConn
      .update(lessons)
      .set(updates)
      .where(eq(lessons.id, lessonId))
      .returning();

    console.log(`[LessonService] Updated lesson ${lessonId} status to ${status}`);

    return updated;
  }

  /**
   * Store Gamma generation results
   * Internal method used by job queue after successful generation
   */
  static async storeGammaResults(
    lessonId: string,
    gammaCardId: string,
    presentationUrl: string
  ): Promise<Lesson> {
    const [updated] = await db
      .update(lessons)
      .set({
        gammaCardId,
        presentationUrl,
        updatedAt: new Date(),
      })
      .where(eq(lessons.id, lessonId))
      .returning();

    console.log(`[LessonService] Stored Gamma results for lesson ${lessonId}`);

    return updated;
  }

  /**
   * Store PPTX file in Object Storage with versioning (max 2 versions)
   * Internal method used by job queue after downloading PPTX
   * 
   * Versioning strategy:
   * - Always keep max 2 versions (v1.pptx, v2.pptx)
   * - When saving a new version: delete oldest, upload new one
   * - Cycles between v1 and v2 to maintain exactly 2 versions
   * 
   * Note: viewerUrl is generated dynamically via getViewerUrl() to ensure fresh signed URLs
   */
  /**
   * Check if a lesson belongs to an AI course
   * AI course = lesson has gammaCardId OR lesson is part of a course with sourceDocumentId in its framework
   */
  private static async isAICourse(lessonId: string, lesson: any): Promise<boolean> {
    // Check if lesson itself was AI-generated via Gamma
    if (lesson.gammaCardId) {
      return true;
    }

    // Check if lesson is part of a course that has sourceDocumentId in its framework
    const [courseLink] = await db
      .select({ courseId: courseLessons.courseId })
      .from(courseLessons)
      .where(eq(courseLessons.lessonId, lessonId))
      .limit(1);

    if (courseLink) {
      const [framework] = await db
        .select({ sourceMap: courseFrameworks.sourceMap })
        .from(courseFrameworks)
        .where(eq(courseFrameworks.courseId, courseLink.courseId))
        .limit(1);

      // Check if framework has sourceMap with documentId (AI-generated course)
      const sourceMap = framework?.sourceMap as { documentId?: string } | null;
      if (sourceMap?.documentId) {
        return true;
      }
    }

    return false;
  }

  /**
   * Store PPTX to object storage and create version record.
   * This is the SINGLE SOURCE OF TRUTH for version creation - do not create
   * version records elsewhere to avoid version/storageKey mismatches.
   * 
   * @param lessonId - The lesson ID
   * @param pptxBuffer - The PPTX file buffer
   * @param userId - The user who triggered the upload (required for version tracking)
   * @param options - Additional options for version creation
   * @returns The updated lesson and version info
   */
  static async storePPTX(
    lessonId: string,
    pptxBuffer: Buffer,
    userId?: string,
    options: {
      isCompressed?: boolean;
      isGenerated?: boolean;  // true for AI-generated, false for user uploads
      creditsCharged?: number; // Gamma credits charged for AI generation
      languageCode?: string; // Language code for multi-language support (defaults to 'en')
      awaitSlidePreconvertMs?: number; // Optional bounded wait budget for user-facing upload flows
    } = {}
  ): Promise<{ lesson: Lesson; versionInfo: { version: number; storageKey: string } }> {
    const {
      isCompressed = false,
      isGenerated = false,
      creditsCharged = 0,
      languageCode = 'en',
      awaitSlidePreconvertMs = 0,
    } = options;
    const normalizedLanguageCode = normalizeLessonLanguageCode(languageCode);
    // Validate buffer size - reject suspiciously small files (likely corrupted)
    const MIN_VALID_PPTX_SIZE = 10 * 1024; // 10KB minimum
    if (pptxBuffer.length < MIN_VALID_PPTX_SIZE) {
      throw new Error(`PPTX file too small (${pptxBuffer.length} bytes). Minimum size is ${MIN_VALID_PPTX_SIZE} bytes. File may be corrupted.`);
    }

    const lesson = await db
      .select()
      .from(lessons)
      .where(eq(lessons.id, lessonId))
      .limit(1);

    if (!lesson[0]) {
      throw new Error(`Lesson ${lessonId} not found`);
    }

    const objectStorageService = new ObjectStorageService();
    
    // Determine if this is an AI course or manual course for retention policy
    const isAI = await this.isAICourse(lessonId, lesson[0]);
    
    console.log(`[LessonService] PPTX upload for lesson ${lessonId} - course type: ${isAI ? 'AI' : 'Manual'}`);

    // Get existing presentation versions from database
    const existingVersions = await db
      .select()
      .from(lessonPresentationVersions)
      .where(
        and(
          eq(lessonPresentationVersions.lessonId, lessonId),
          sql`LOWER(COALESCE(${lessonPresentationVersions.languageCode}, 'en')) = ${normalizedLanguageCode}`
        )
      )
      .orderBy(desc(lessonPresentationVersions.version));

    const versionsToDelete = getPresentationVersionsToDeleteOnUpload(existingVersions);

    // Calculate next version number
    const maxVersion = existingVersions.length > 0 ? Math.max(...existingVersions.map(v => v.version)) : 0;
    const nextVersion = maxVersion + 1;

    let storageKey: string | null = null;

    try {
      // Retained for defensive cleanup only. Normal uploads append a new active version
      // and keep all older versions selectable.
      for (const versionToDelete of versionsToDelete) {
        try {
          // Delete from object storage
          await objectStorageService.deleteLessonPPTX(versionToDelete.storageKey);
          console.log(`[LessonService] Deleted PPTX file: ${versionToDelete.storageKey}`);

          if (isOnPremMode()) {
            PptxHtmlConverterService.cleanupHtmlVersion(versionToDelete.storageKey).catch(() => {});
          }
          PptxHtmlConverterService.cleanupSlideImages(versionToDelete.storageKey).catch(() => {});
          
          // Delete from database
          await db
            .delete(lessonPresentationVersions)
            .where(eq(lessonPresentationVersions.id, versionToDelete.id));
          console.log(`[LessonService] Deleted version record: ${versionToDelete.id} (v${versionToDelete.version})`);
        } catch (deleteError) {
          console.error(`[LessonService] Failed to delete version ${versionToDelete.version}:`, deleteError);
          // Continue with other deletions - don't fail the entire upload
        }
      }

      // Upload new version to object storage
      const bufferSizeMB = (pptxBuffer.length / 1024 / 1024).toFixed(2);
      console.log(`[LessonService] Uploading PPTX to storage: ${bufferSizeMB}MB (lesson: ${lessonId}, v${nextVersion})`);
      
      storageKey = await objectStorageService.uploadLessonPPTX(
        lesson[0].organizationId,
        lessonId,
        nextVersion,
        pptxBuffer,
        normalizedLanguageCode
      );
      
      console.log(`[LessonService] PPTX stored successfully: ${storageKey} (${bufferSizeMB}MB)`);

      // Update lesson with new storage key
      const [updated] = await db
        .update(lessons)
        .set({
          storageKey,
          currentSlideVersion: nextVersion,
          updatedAt: new Date(),
        })
        .where(eq(lessons.id, lessonId))
        .returning();

      if (!updated) {
        throw new Error(`Failed to update lesson ${lessonId} with storage key`);
      }

      // Create presentation version record - SINGLE SOURCE OF TRUTH for version creation
      // Both AI-generated and user-uploaded versions are created here to prevent version/storageKey mismatches
      if (userId) {
        // Validate storageKey matches the intended version.
        // Supports both canonical hashed keys and legacy /v{n}.pptx paths.
        const storageKeyMatchesVersion = lessonPptxStorageKeyMatchesVersion({
          storageKey,
          organizationId: lesson[0].organizationId,
          lessonId,
          languageCode: normalizedLanguageCode,
          version: nextVersion,
        });
        if (!storageKeyMatchesVersion) {
          console.error(
            `[LessonService] CRITICAL: storageKey/version mismatch! lesson=${lessonId} org=${lesson[0].organizationId} ` +
            `lang=${normalizedLanguageCode} expectedVersion=${nextVersion} storageKey=${storageKey}`
          );
          throw new Error(`Storage key does not match version number. This would cause download failures.`);
        }

        await db
          .insert(lessonPresentationVersions)
          .values({
            lessonId,
            version: nextVersion,
            gammaCardId: lesson[0].gammaCardId || (isGenerated ? 'ai-generated' : 'manual-upload'),
            presentationUrl: lesson[0].presentationUrl || '',
            storageKey,
            themeId: lesson[0].themeId || null,
            gammaImageOptions: isGenerated ? lesson[0].gammaImageOptions : null,
            gammaTextOptions: isGenerated ? lesson[0].gammaTextOptions : null,
            creditsCharged,
            isGenerated, // true for AI-generated, false for user uploads
            isCompressed, // Track if file was compressed to prevent double-compression
            languageCode: normalizedLanguageCode,
            createdBy: userId,
          });
        console.log(`[LessonService] Created presentation version record v${nextVersion} (isGenerated=${isGenerated}, isCompressed=${isCompressed}, credits=${creditsCharged})`);
      }

      console.log(`[LessonService] Stored PPTX v${nextVersion} for lesson ${lessonId} (${pptxBuffer.length} bytes)`);

      // Trigger async transcript extraction (non-blocking)
      this.extractTranscriptAsync(lessonId, lesson[0].organizationId, pptxBuffer, nextVersion)
        .catch(error => {
          console.error(`[LessonService] Background transcript extraction failed for lesson ${lessonId}:`, error);
        });

      // Trigger slide image conversion for lesson viewer fallback.
      // For interactive uploads we can optionally wait a bounded time budget so first viewer open
      // is less likely to land on "Slides are being prepared".
      const slidePreconvertTask = PptxHtmlConverterService.convertPptxToSlides(storageKey)
        .then(result => {
          if (result.success) {
            console.log(`[LessonService] Pre-converted slide images for lesson ${lessonId} v${nextVersion}`);
          } else if (result.error === 'Conversion already in progress') {
            console.log(`[LessonService] Slide pre-conversion already in progress for lesson ${lessonId} v${nextVersion}`);
          } else {
            console.warn(`[LessonService] Slide pre-conversion skipped/failed for lesson ${lessonId} v${nextVersion}: ${result.error}`);
          }
          return result;
        })
        .catch(error => {
          console.error(`[LessonService] Slide pre-conversion error for lesson ${lessonId} v${nextVersion}:`, error);
          return { success: false as const, error: String((error as Error)?.message || error || 'unknown pre-conversion error') };
        });

      if (awaitSlidePreconvertMs > 0) {
        const timeoutResult = { success: false as const, error: "pre-conversion timeout" };
        const preconvertResult = await Promise.race([
          slidePreconvertTask,
          new Promise<typeof timeoutResult>((resolve) => setTimeout(() => resolve(timeoutResult), awaitSlidePreconvertMs)),
        ]);
        if (!preconvertResult.success) {
          console.warn(
            `[LessonService] Slide pre-conversion did not finish within ${awaitSlidePreconvertMs}ms for lesson ${lessonId} v${nextVersion}: ${preconvertResult.error}`
          );
        }
      }

      if (isOnPremMode() && storageKey) {
        PptxHtmlConverterService.convertPptxToHtml(storageKey)
          .then(result => {
            if (result.success) {
              console.log(`[LessonService] HTML conversion complete for lesson ${lessonId} v${nextVersion} (${result.durationMs}ms)`);
            } else {
              console.warn(`[LessonService] HTML conversion skipped for lesson ${lessonId}: ${result.error}`);
            }
          })
          .catch(error => {
            console.error(`[LessonService] Background HTML conversion failed for lesson ${lessonId}:`, error);
          });
      }

      return { 
        lesson: updated, 
        versionInfo: { version: nextVersion, storageKey } 
      };
    } catch (error) {
      // If database update failed after upload, clean up the newly uploaded file
      if (storageKey) {
        console.error(
          `[LessonService] Database update failed for lesson ${lessonId}. Cleaning up newly uploaded file at ${storageKey}`,
          error
        );
        try {
          await objectStorageService.deleteLessonPPTX(storageKey);
          console.log(`[LessonService] Successfully deleted orphaned file ${storageKey}`);
        } catch (cleanupError) {
          console.error(
            `[LessonService] CRITICAL: Failed to cleanup orphaned file ${storageKey}:`,
            cleanupError,
            "Manual cleanup required"
          );
        }
      }
      throw error;
    }
  }

  /**
   * Store video file (MP4) in Object Storage for lesson walkthrough
   * Replaces existing video if one already exists (deletes old video after successful upload)
   * Updates lesson record with video metadata
   */
  static async storeVideo(
    lessonId: string,
    videoBuffer: Buffer,
    videoSize: number,
    userId?: string
  ): Promise<Lesson> {
    const lesson = await db
      .select()
      .from(lessons)
      .where(eq(lessons.id, lessonId))
      .limit(1);

    if (!lesson[0]) {
      throw new Error(`Lesson ${lessonId} not found`);
    }

    const objectStorageService = new ObjectStorageService();

    try {
      const nextVideoVersion = Date.now();
      const videoStorageKey = await objectStorageService.uploadLessonVideo(
        lesson[0].organizationId,
        `${lessonId}/v${nextVideoVersion}`,
        videoBuffer,
        lesson[0].languageCode || 'en'
      );

      // Update database with video metadata
      const [updated] = await db
        .update(lessons)
        .set({
          videoStorageKey,
          videoSizeBytes: videoSize,
          videoUploadedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(lessons.id, lessonId))
        .returning();

      if (!updated) {
        throw new Error(`Failed to update lesson ${lessonId} with video metadata`);
      }

      let finalLesson = updated;
      if (userId) {
        try {
          const version = await LessonVersioningService.createVersion({
            lessonId,
            organizationId: updated.organizationId,
            editedBy: userId,
            changeDescription: 'Uploaded new active video version',
            currentLesson: updated,
          });
          const [activeLesson] = await db
            .update(lessons)
            .set({
              activeLessonVersionId: version.id,
              updatedAt: new Date(),
            })
            .where(eq(lessons.id, lessonId))
            .returning();
          finalLesson = activeLesson || updated;
        } catch (versionError) {
          console.error(`[LessonService] Failed to create video version snapshot for lesson ${lessonId}:`, versionError);
          throw versionError;
        }
      }

      console.log(`[LessonService] Stored video for lesson ${lessonId} (${videoSize} bytes)`);

      return finalLesson;
    } catch (error) {
      console.error(`[LessonService] Error storing video for lesson ${lessonId}:`, error);
      throw error;
    }
  }

  /**
   * Validate and resolve lesson scope for assignments
   * Handles education vs business org types, validates unitSubjects relationship
   * Supports partial scope (unitId only) or full scope (unitId + subjectId)
   * Returns null if no scope metadata is available
   */
  private static async validateLessonScope(
    lesson: Lesson,
    organizationId: string
  ): Promise<{ unitId: string; subjectId: string | null; orgType: 'education' | 'business' } | null> {
    // Fetch organization type
    const [org] = await db
      .select({ type: organizations.type })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const orgType = org?.type || 'education';
    
    // Resolve scope based on organization type
    const unitId = orgType === 'business' ? lesson.department : lesson.gradeLevel;
    const subjectId = orgType === 'business' ? lesson.unit : lesson.subject;
    
    // If no scope metadata at all, return null
    if (!unitId) {
      console.log(`[LessonService] Lesson ${lesson.id} has no scope metadata - skipping auto-assignment`);
      return null;
    }
    
    // Verify unit exists and belongs to organization
    const [unitExists] = await db
      .select({ id: organizationUnits.id })
      .from(organizationUnits)
      .where(
        and(
          eq(organizationUnits.id, unitId),
          eq(organizationUnits.organizationId, organizationId)
        )
      )
      .limit(1);
    
    if (!unitExists) {
      throw new Error(`Unit ${unitId} not found or does not belong to organization ${organizationId}`);
    }
    
    // If only unitId is provided (no subjectId), allow unit-wide assignment
    if (!subjectId) {
      console.log(`[LessonService] Lesson ${lesson.id} has unit-only scope (${unitId}) - creating unit-wide assignment`);
      return { unitId, subjectId: null, orgType };
    }
    
    // Verify subject exists and belongs to the unit via unitSubjects
    const [subjectUnitRelation] = await db
      .select({ id: unitSubjects.id })
      .from(unitSubjects)
      .where(
        and(
          eq(unitSubjects.unitId, unitId),
          eq(unitSubjects.subjectId, subjectId)
        )
      )
      .limit(1);
    
    if (!subjectUnitRelation) {
      throw new Error(
        `Subject ${subjectId} is not assigned to unit ${unitId}. ` +
        `Please assign the subject to the unit first via the organization settings.`
      );
    }
    
    console.log(`[LessonService] Validated lesson scope: unit ${unitId}, subject ${subjectId}`);
    return { unitId, subjectId, orgType };
  }

  /**
   * Publish a lesson (make it visible to learners)
   * Only completed lessons can be published
   * Creates scope-based assignment if lesson has metadata (department/subject or grade/subject)
   * Auto-assigns linked quizzes with the same scope
   */
  static async publishLesson(
    lessonId: string,
    organizationId: string,
    userId: string
  ): Promise<Lesson> {
    const lesson = await this.getLessonById(lessonId, organizationId);
    
    if (!lesson) {
      throw new Error(`Lesson ${lessonId} not found`);
    }

    if (lesson.generationStatus !== "completed") {
      throw new Error("Only completed lessons can be published");
    }

    if (!lesson.storageKey) {
      throw new Error("Lesson must have PPTX file before publishing");
    }

    // Validate and resolve lesson scope
    const scope = await this.validateLessonScope(lesson, organizationId);
    
    // Use transaction to ensure atomicity of publish + assignments
    return await db.transaction(async (tx) => {
      // 1. Update lesson to published status
      const [updated] = await tx
        .update(lessons)
        .set({
          isPublished: true,
          publishedAt: new Date(),
          publishedBy: userId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(lessons.id, lessonId),
            eq(lessons.organizationId, organizationId)
          )
        )
        .returning();

      console.log(`[LessonService] Published lesson ${lessonId} by user ${userId} (scope: ${scope ? `unit ${scope.unitId}${scope.subjectId ? ` + subject ${scope.subjectId}` : ''}` : 'none'})`);

      // 2. Create dual scope-based assignments if lesson has scope metadata
      if (scope) {
        // Create learner assignment (students/employees)
        const [learnerAssignment] = await tx
          .insert(lessonScopeAssignments)
          .values({
            lessonId: lessonId,
            organizationId: organizationId,
            unitId: scope.unitId,
            subjectId: scope.subjectId,
            audience: 'learner',
            assignedBy: userId,
            dueDate: null,
          })
          .onConflictDoUpdate({
            target: [
              lessonScopeAssignments.lessonId,
              lessonScopeAssignments.organizationId,
              lessonScopeAssignments.audience,
              lessonScopeAssignments.unitId,
              lessonScopeAssignments.subjectId,
            ],
            set: {
              assignedBy: userId,
              dueDate: null,
            }
          })
          .returning();

        console.log(`[LessonService] Created/updated learner assignment for unit ${scope.unitId}${scope.subjectId ? ` + subject ${scope.subjectId}` : ''}`);

        // Create instructor assignment (teachers/team_leads)
        const [instructorAssignment] = await tx
          .insert(lessonScopeAssignments)
          .values({
            lessonId: lessonId,
            organizationId: organizationId,
            unitId: scope.unitId,
            subjectId: scope.subjectId,
            audience: 'instructor',
            assignedBy: userId,
            dueDate: null,
          })
          .onConflictDoUpdate({
            target: [
              lessonScopeAssignments.lessonId,
              lessonScopeAssignments.organizationId,
              lessonScopeAssignments.audience,
              lessonScopeAssignments.unitId,
              lessonScopeAssignments.subjectId,
            ],
            set: {
              assignedBy: userId,
              dueDate: null,
            }
          })
          .returning();

        console.log(`[LessonService] Created/updated instructor assignment for unit ${scope.unitId}${scope.subjectId ? ` + subject ${scope.subjectId}` : ''}`);

        // 3. Auto-assign linked quizzes with the same scope
        const linkedQuizzes = await tx
          .select({ quizId: lessonQuizLinks.quizId })
          .from(lessonQuizLinks)
          .where(eq(lessonQuizLinks.lessonId, lessonId));

        if (linkedQuizzes.length > 0 && scope.subjectId) {
          // Quiz assignments require both unit and subject
          let quizScopeAssignmentCount = 0;

          for (const { quizId } of linkedQuizzes) {
            const [quizAssignment] = await tx
              .insert(quizCollectionAssignments)
              .values({
                collectionId: quizId,
                unitId: scope.unitId,
                subjectId: scope.subjectId,
                subUnitId: null,
                requiredPassPercentage: 70,
                availableFrom: null,
                availableTo: null,
              })
              .onConflictDoNothing()
              .returning();

            if (quizAssignment) {
              quizScopeAssignmentCount++;
            }
          }

          if (quizScopeAssignmentCount > 0) {
            console.log(`[LessonService] Auto-assigned ${quizScopeAssignmentCount} linked quiz assignments (unit ${scope.unitId} + subject ${scope.subjectId})`);
          }
        } else if (linkedQuizzes.length > 0) {
          console.log(`[LessonService] Skipping quiz auto-assignment - quizzes require both unit and subject (only unit ${scope.unitId} available)`);
        }
      } else {
        console.log(`[LessonService] Skipping auto-assignment - lesson has no scope metadata`);
      }

      try {
        await TranslationIndexService.enqueueForLessonMutation({
          lessonId,
          organizationId,
          eventType: 'publish',
          dedupeSeed: String(updated.updatedAt || new Date().toISOString()),
        });
        await TranslationAnalyticsService.trackEvent({
          organizationId,
          userId,
          eventType: 'translation_publish',
          resourceType: 'lesson',
          resourceId: lessonId,
          languageCode: updated.languageCode || 'en',
          variantId: updated.id,
          contentGroupId: updated.contentGroupId || null,
          metadata: { isPublished: updated.isPublished, translationStatus: updated.translationStatus || null },
          dedupeSeed: `${lessonId}:publish:${updated.updatedAt?.toISOString?.() || ''}`,
        });
      } catch (indexError: any) {
        console.error('[LessonService] Failed to enqueue translation index/analytics on publish:', indexError?.message || indexError);
      }

      return updated;
    });
  }

  /**
   * Unpublish a lesson (hide from learners)
   */
  static async unpublishLesson(
    lessonId: string,
    organizationId: string
  ): Promise<Lesson> {
    const [updated] = await db
      .update(lessons)
      .set({
        isPublished: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lessons.id, lessonId),
          eq(lessons.organizationId, organizationId)
        )
      )
      .returning();

    console.log(`[LessonService] Unpublished lesson ${lessonId}`);

    try {
      await TranslationIndexService.enqueueForLessonMutation({
        lessonId,
        organizationId,
        eventType: 'unpublish',
        dedupeSeed: String(updated?.updatedAt || new Date().toISOString()),
      });
      await TranslationAnalyticsService.trackEvent({
        organizationId,
        userId: null,
        eventType: 'publish_action',
        resourceType: 'lesson',
        resourceId: lessonId,
        languageCode: updated?.languageCode || 'en',
        variantId: updated?.id || lessonId,
        contentGroupId: updated?.contentGroupId || null,
        metadata: { isPublished: false, source: 'lesson_unpublish' },
        dedupeSeed: `${lessonId}:unpublish:${updated?.updatedAt?.toISOString?.() || ''}`,
      });
    } catch (indexError: any) {
      console.error('[LessonService] Failed to enqueue translation index/analytics on unpublish:', indexError?.message || indexError);
    }

    return updated;
  }

  /**
   * Archive a lesson (soft delete)
   * Also cancels any active generation jobs and refunds credits
   */
  static async archiveLesson(
    lessonId: string,
    organizationId: string,
    deleteFiles: boolean = false
  ): Promise<Lesson> {
    // Cancel any active generation jobs and refund credits
    const { JobQueueService } = await import("./jobQueueService");
    await JobQueueService.cancelJob(lessonId);

    // Get lesson to check for files to clean up (only if deleteFiles is true)
    let lesson: Lesson[] = [];
    if (deleteFiles) {
      lesson = await db
        .select()
        .from(lessons)
        .where(
          and(
            eq(lessons.id, lessonId),
            eq(lessons.organizationId, organizationId)
          )
        )
        .limit(1);
    }

    const [updated] = await db
      .update(lessons)
      .set({
        isArchived: true,
        archivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lessons.id, lessonId),
          eq(lessons.organizationId, organizationId)
        )
      )
      .returning();

    // Only clean up storage files if explicitly requested (e.g., during lesson replacement)
    // This preserves files for normal archive operations (soft delete with restore capability)
    if (deleteFiles && lesson[0]) {
      const objectStorageService = new ObjectStorageService();
      
      // Delete PPTX file if it exists
      if (lesson[0].storageKey) {
        try {
          await objectStorageService.deleteLessonPPTX(lesson[0].storageKey);
          console.log(`[LessonService] Deleted PPTX for archived lesson ${lessonId}: ${lesson[0].storageKey}`);
        } catch (error) {
          console.error(`[LessonService] Failed to delete PPTX for archived lesson ${lessonId}:`, error);
        }
      }
      
      // Delete video file if it exists
      if (lesson[0].videoStorageKey) {
        try {
          await objectStorageService.deleteLessonVideo(lesson[0].videoStorageKey);
          console.log(`[LessonService] Deleted video for archived lesson ${lessonId}: ${lesson[0].videoStorageKey}`);
        } catch (error) {
          console.error(`[LessonService] Failed to delete video for archived lesson ${lessonId}:`, error);
        }
      }
    }

    console.log(`[LessonService] Archived lesson ${lessonId}${deleteFiles ? ' (with file cleanup)' : ''}`);

    return updated;
  }

  /**
   * Restore an archived lesson
   */
  static async restoreLesson(
    lessonId: string,
    organizationId: string
  ): Promise<Lesson> {
    const [updated] = await db
      .update(lessons)
      .set({
        isArchived: false,
        archivedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lessons.id, lessonId),
          eq(lessons.organizationId, organizationId)
        )
      )
      .returning();

    console.log(`[LessonService] Restored lesson ${lessonId}`);

    return updated;
  }

  /**
   * Delete a lesson permanently
   * Only archived lessons can be deleted
   */
  static async deleteLesson(
    lessonId: string,
    organizationId: string
  ): Promise<void> {
    const lesson = await this.getLessonById(lessonId, organizationId);
    
    if (!lesson) {
      throw new Error(`Lesson ${lessonId} not found`);
    }

    if (!lesson.isArchived) {
      throw new Error("Only archived lessons can be permanently deleted");
    }

    if (lesson.storageKey) {
      try {
        const objectStorageService = new ObjectStorageService();
        await objectStorageService.deleteLessonPPTX(lesson.storageKey);
      } catch (error) {
        console.error(`[LessonService] Failed to delete PPTX file ${lesson.storageKey}:`, error);
      }
    }

    await db
      .delete(lessons)
      .where(
        and(
          eq(lessons.id, lessonId),
          eq(lessons.organizationId, organizationId)
        )
      );

    console.log(`[LessonService] Permanently deleted lesson ${lessonId}`);
  }

  /**
   * Get signed download URL for lesson PPTX with filename
   */
  static async getDownloadUrl(
    lessonId: string,
    organizationId: string,
    preferredFilename?: string
  ): Promise<{ downloadUrl: string; filename: string }> {
    const lesson = await this.getLessonById(lessonId, organizationId);
    
    if (!lesson) {
      throw new Error(`Lesson ${lessonId} not found`);
    }

    const latestPresentation = await this.resolveLatestPresentationState(lesson);
    if (!latestPresentation.storageKey) {
      throw new Error("Lesson has no PPTX file available");
    }

    const objectStorageService = new ObjectStorageService();
    const sanitizedTitle = (lesson.title || 'lesson')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 100);
    const filename = preferredFilename || `${sanitizedTitle}.pptx`;
    const signedUrl = await objectStorageService.getLessonPPTXSignedURL(
      latestPresentation.storageKey,
      900,
      { downloadFilename: filename }
    );

    return { downloadUrl: signedUrl, filename };
  }

  /**
   * Get all presentation versions for a lesson with download URLs
   */
  static async getPresentationVersions(
    lessonId: string,
    organizationId: string
  ): Promise<{
    versions: Array<{
      id: string;
      version: number;
      createdAt: Date;
      themeId: string | null;
      creditsCharged: number | null;
      downloadUrl: string;
      filename: string;
      isGenerated: boolean;
    }>;
    currentVersion: number | null;
  }> {
    const lesson = await this.getLessonById(lessonId, organizationId);
    
    if (!lesson) {
      throw new Error(`Lesson ${lessonId} not found`);
    }

    const lessonLanguage = normalizeLessonLanguageCode(lesson.languageCode);
    const versions = await db
      .select()
      .from(lessonPresentationVersions)
      .where(
        and(
          eq(lessonPresentationVersions.lessonId, lessonId),
          sql`LOWER(COALESCE(${lessonPresentationVersions.languageCode}, 'en')) = ${lessonLanguage}`
        )
      )
      .orderBy(desc(lessonPresentationVersions.version));

    const objectStorageService = new ObjectStorageService();
    const sanitizedTitle = (lesson.title || 'lesson')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 100);

    const versionsWithUrls = await Promise.all(
      versions.map(async (v) => {
        let downloadUrl = '';
        const filename = `${sanitizedTitle}-v${v.version}.pptx`;
        try {
          downloadUrl = await objectStorageService.getLessonPPTXSignedURL(
            v.storageKey,
            900,
            { downloadFilename: filename }
          );
        } catch (error) {
          console.error(`Failed to get download URL for version ${v.version}:`, error);
        }

        return {
          id: v.id,
          version: v.version,
          createdAt: v.createdAt!,
          themeId: v.themeId,
          creditsCharged: v.creditsCharged,
          downloadUrl,
          filename,
          isGenerated: v.isGenerated ?? false,
          isActive: Number(v.version) === Number(lesson.currentSlideVersion || 0),
        };
      })
    );

    return {
      versions: versionsWithUrls,
      currentVersion: lesson.currentSlideVersion || (versions.length > 0 ? versions[0].version : null),
    };
  }

  static async setActivePresentationVersion(
    lessonId: string,
    versionId: string,
    organizationId: string
  ): Promise<{ lesson: Lesson; version: SelectLessonPresentationVersion }> {
    const lesson = await this.getLessonById(lessonId, organizationId);

    if (!lesson) {
      throw new Error(`Lesson ${lessonId} not found`);
    }

    const lessonLanguage = normalizeLessonLanguageCode(lesson.languageCode);
    const [version] = await db
      .select()
      .from(lessonPresentationVersions)
      .where(
        and(
          eq(lessonPresentationVersions.id, versionId),
          eq(lessonPresentationVersions.lessonId, lessonId),
          sql`LOWER(COALESCE(${lessonPresentationVersions.languageCode}, 'en')) = ${lessonLanguage}`
        )
      )
      .limit(1);

    if (!version) {
      throw new Error(`Version ${versionId} not found for lesson ${lessonId}`);
    }

    const [updated] = await db
      .update(lessons)
      .set({
        storageKey: version.storageKey,
        currentSlideVersion: version.version,
        generationStatus: 'completed',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lessons.id, lessonId),
          eq(lessons.organizationId, organizationId)
        )
      )
      .returning();

    if (!updated) {
      throw new Error(`Failed to activate presentation version ${versionId}`);
    }

    const slideCheck = await PptxHtmlConverterService.slideImagesExist(version.storageKey);
    if (!slideCheck.exists || slideCheck.slideCount === 0) {
      PptxHtmlConverterService.convertPptxToSlides(version.storageKey)
        .then((result) => {
          if (result.success) {
            console.log(`[LessonService] Pre-converted slide images for activated lesson ${lessonId} v${version.version}`);
          } else if (result.error !== 'Conversion already in progress') {
            console.warn(`[LessonService] Slide conversion for activated lesson ${lessonId} v${version.version} failed: ${result.error}`);
          }
        })
        .catch((error) => {
          console.error(`[LessonService] Slide conversion error for activated lesson ${lessonId} v${version.version}:`, error);
        });
    }

    return { lesson: updated, version };
  }

  /**
   * Get download URL for a specific presentation version
   */
  static async getVersionDownloadUrl(
    lessonId: string,
    versionId: string,
    organizationId: string,
    preferredFilename?: string
  ): Promise<{ downloadUrl: string; filename: string }> {
    const lesson = await this.getLessonById(lessonId, organizationId);
    
    if (!lesson) {
      throw new Error(`Lesson ${lessonId} not found`);
    }

    const lessonLanguage = normalizeLessonLanguageCode(lesson.languageCode);
    const [version] = await db
      .select()
      .from(lessonPresentationVersions)
      .where(
        and(
          eq(lessonPresentationVersions.id, versionId),
          eq(lessonPresentationVersions.lessonId, lessonId),
          sql`LOWER(COALESCE(${lessonPresentationVersions.languageCode}, 'en')) = ${lessonLanguage}`
        )
      );

    if (!version) {
      throw new Error(`Version ${versionId} not found for lesson ${lessonId}`);
    }

    const objectStorageService = new ObjectStorageService();
    const sanitizedTitle = (lesson.title || 'lesson')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 100);
    const filename = preferredFilename || `${sanitizedTitle}-v${version.version}.pptx`;
    const signedUrl = await objectStorageService.getLessonPPTXSignedURL(
      version.storageKey,
      900,
      { downloadFilename: filename }
    );

    return { downloadUrl: signedUrl, filename };
  }

  /**
   * Get viewer URL for Office Online iframe
   */
  static async getViewerUrl(
    lessonId: string,
    organizationId: string,
    options?: { storageKeyOverride?: string | null }
  ): Promise<{
    viewerUrl: string;
    pptxUrl: string | null;
    isLocalPptx: boolean;
    conversionPending: boolean;
    conversionStatus: 'ready' | 'pending' | 'failed' | 'unsupported';
    conversionError?: string;
    slideImages?: { slideCount: number; urls: string[] };
  }> {
    const lesson = await this.getLessonById(lessonId, organizationId);
    
    if (!lesson) {
      throw new Error(`Lesson ${lessonId} not found`);
    }

    const latestPresentation = await this.resolveLatestPresentationState(lesson);
    const effectiveStorageKey = options?.storageKeyOverride || latestPresentation.storageKey;
    if (!effectiveStorageKey) {
      throw new Error("Lesson has no PPTX file available");
    }

    const objectStorageService = new ObjectStorageService();
    const signedUrl = await objectStorageService.getLessonPPTXSignedURL(
      effectiveStorageKey,
      900
    );

    const slideCheck = await PptxHtmlConverterService.slideImagesExist(effectiveStorageKey);
    if (slideCheck.exists && slideCheck.slideCount > 0) {
      const slidesDir = PptxHtmlConverterService.getSlidesDir(effectiveStorageKey);
      const slideUrls: string[] = [];
      const uploadDir = path.resolve(getUploadDir());
      for (let i = 1; i <= slideCheck.slideCount; i++) {
        const absoluteSlidePath = path.join(slidesDir, `slide-${i}.png`);
        const slideRelative = path.relative(uploadDir, absoluteSlidePath).replace(/\\/g, '/');
        const encoded = Buffer.from(slideRelative, 'utf-8').toString('base64url');
        slideUrls.push(`/api/files/${encoded}`);
      }
      return {
        viewerUrl: signedUrl,
        pptxUrl: signedUrl,
        isLocalPptx: true,
        conversionPending: false,
        conversionStatus: 'ready',
        slideImages: {
          slideCount: slideCheck.slideCount,
          urls: slideUrls,
        },
      };
    }

    const conversionSupport = await PptxHtmlConverterService.checkSlideImageConversionAvailable();
    if (conversionSupport.available) {
      PptxHtmlConverterService.convertPptxToSlides(effectiveStorageKey).then(result => {
        if (result.success) {
          console.log(`[OnDemand] Slide conversion completed for ${effectiveStorageKey}`);
        } else if (result.error === 'Conversion already in progress') {
          console.log(`[OnDemand] Slide conversion already in progress for ${effectiveStorageKey}`);
        } else {
          console.warn(`[OnDemand] Slide conversion failed for ${effectiveStorageKey}: ${result.error}`);
        }
      }).catch(err => {
        console.error(`[OnDemand] Slide conversion error for ${effectiveStorageKey}:`, err);
      });
      return {
        viewerUrl: signedUrl,
        pptxUrl: signedUrl,
        isLocalPptx: true,
        conversionPending: true,
        conversionStatus: 'pending',
      };
    }

    return {
      viewerUrl: signedUrl,
      pptxUrl: signedUrl,
      isLocalPptx: true,
      conversionPending: false,
      conversionStatus: 'unsupported',
      conversionError: conversionSupport.reason || 'Slide conversion dependencies are unavailable',
    };
  }

  /**
   * Get video URL if lesson has uploaded video
   */
  static async getVideoUrl(
    lessonId: string,
    organizationId: string,
    preferredFilename?: string
  ): Promise<string | null> {
    const lesson = await this.getLessonById(lessonId, organizationId);
    
    if (!lesson) {
      throw new Error(`Lesson ${lessonId} not found`);
    }

    if (!lesson.videoStorageKey) {
      return null;
    }

    const objectStorageService = new ObjectStorageService();
    const signedUrl = await objectStorageService.getLessonVideoSignedURL(
      lesson.videoStorageKey,
      3600,
      { downloadFilename: preferredFilename }
    );

    return signedUrl;
  }

  /**
   * Get lessons linked to a quiz
   * Filters out unlinked lessons (availabilityStatus='unlinked') for learner safety
   */
  static async getLessonsForQuiz(
    quizId: string,
    organizationId: string
  ): Promise<Lesson[]> {
    const lessonsList = await db
      .select()
      .from(lessons)
      .where(
        and(
          eq(lessons.relatedQuizId, quizId),
          eq(lessons.organizationId, organizationId),
          eq(lessons.isArchived, false),
          // Exclude unlinked lessons - include null, undefined, or 'active' availability status
          or(
            sql`${lessons.metadata}->>'availabilityStatus' IS NULL`,
            sql`${lessons.metadata}->>'availabilityStatus' != 'unlinked'`
          )
        )
      )
      .orderBy(desc(lessons.createdAt));

    return lessonsList;
  }

  /**
   * Link lesson to quiz
   */
  /**
   * CRITICAL FIX #4: Link lesson to quiz with cross-org authorization check
   * Validates that both lesson and quiz belong to the same organization
   */
  static async linkToQuiz(
    lessonId: string,
    quizId: string,
    organizationId: string
  ): Promise<Lesson> {
    // CRITICAL FIX #4: Validate BOTH lesson and quiz belong to organization
    
    // 1. Verify lesson exists and belongs to organization
    const lesson = await this.getLessonById(lessonId, organizationId);
    if (!lesson) {
      const error = new Error("LESSON_NOT_FOUND") as any;
      error.statusCode = 404;
      error.message = `Lesson ${lessonId} not found in organization ${organizationId}`;
      throw error;
    }

    const lessonType = await this.getEffectiveCourseLessonType(lessonId);
    if (lessonType === 'overview') {
      const error = new Error("QUIZ_NOT_ALLOWED_FOR_STRUCTURAL_LESSON") as any;
      error.statusCode = 400;
      error.message = "Quizzes are not allowed for overview lessons";
      throw error;
    }

    // 2. Verify quiz exists and belongs to SAME organization
    const { storage } = await import("../storage");
    const quiz = await storage.getQuizCollection(quizId);

    if (!quiz) {
      const error = new Error("QUIZ_NOT_FOUND") as any;
      error.statusCode = 404;
      error.message = "Quiz not found";
      throw error;
    }

    // 3. Verify quiz belongs to the same organization as the lesson
    if (quiz.organizationId !== organizationId) {
      const error = new Error("QUIZ_ORG_MISMATCH") as any;
      error.statusCode = 403;
      error.message = `Cannot link lesson to quiz from different organization. Lesson belongs to ${organizationId}, quiz belongs to ${quiz.organizationId}`;
      throw error;
    }

    // 4. Perform the link update (we know lesson exists in org from step 1)
    const [updated] = await db
      .update(lessons)
      .set({
        relatedQuizId: quizId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lessons.id, lessonId),
          eq(lessons.organizationId, organizationId)
        )
      )
      .returning();

    if (!updated) {
      // This should never happen since we verified lesson exists
      const error = new Error("UPDATE_FAILED") as any;
      error.statusCode = 500;
      error.message = "Failed to update lesson";
      throw error;
    }

    console.log(
      `[LessonService] Linked lesson ${lessonId} to quiz ${quizId} (both in org ${organizationId})`
    );

    return updated;
  }

  /**
   * Unlink lesson from quiz
   */
  static async unlinkFromQuiz(
    lessonId: string,
    organizationId: string
  ): Promise<Lesson> {
    const [updated] = await db
      .update(lessons)
      .set({
        relatedQuizId: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lessons.id, lessonId),
          eq(lessons.organizationId, organizationId)
        )
      )
      .returning();

    console.log(`[LessonService] Unlinked lesson ${lessonId} from quiz`);

    return updated;
  }

  /**
   * Save generation parameters to object storage
   * This creates a backup that can be used for regeneration
   */
  static async saveGenerationParams(
    lessonId: string,
    organizationId: string,
    params: {
      inputText?: string;
      mainTopic?: string;
      subtopic1?: string;
      subtopic2?: string;
      themeId?: string;
      numCards?: number;
      generationMode?: string;
      sourceDocumentPath?: string;
      generateImages?: boolean;
      imageStyle?: string;
      additionalInstructions?: string;
    }
  ): Promise<string> {
    console.log(`[LessonService] Saving generation params for lesson ${lessonId}`);
    const objectStorage = new ObjectStorageService();
    return await objectStorage.uploadLessonParams(organizationId, lessonId, params);
  }

  /**
   * Retrieve generation parameters from object storage
   * Returns the params that were used for the original generation
   */
  static async getGenerationParams(
    storageKey: string
  ): Promise<{
    inputText?: string;
    mainTopic?: string;
    subtopic1?: string;
    subtopic2?: string;
    themeId?: string;
    numCards?: number;
    generationMode?: string;
    sourceDocumentPath?: string;
    generateImages?: boolean;
    imageStyle?: string;
    additionalInstructions?: string;
  } | null> {
    console.log(`[LessonService] Retrieving generation params from ${storageKey}`);
    const objectStorage = new ObjectStorageService();
    return await objectStorage.downloadLessonParams(storageKey);
  }

  /**
   * Assign lessons to students with automatic quiz assignment and auto-publish
   * Uses transaction to ensure atomicity
   * Validates that all lessons belong to the specified organization
   * Automatically publishes lessons when assigned to ensure learner visibility
   */
  static async assignLessons(
    lessonIds: string[],
    studentIds: string[],
    organizationId: string,
    assignedBy: string,
    dueDate?: Date,
    scope?: {
      gradeLevel?: string | null;
      departmentId?: string | null;
      subjectId?: string | null;
      unitId?: string | null;
    }
  ): Promise<{ lessonAssignments: LessonAssignment[]; quizAssignments: number }> {
    console.log(`[LessonService] Assigning ${lessonIds.length} lessons to ${studentIds.length} students with scope:`, scope);

    // SECURITY: Validate that all lessons belong to the organization
    const lessonRecords = await db
      .select({ id: lessons.id, organizationId: lessons.organizationId })
      .from(lessons)
      .where(inArray(lessons.id, lessonIds));

    if (lessonRecords.length !== lessonIds.length) {
      throw new Error("One or more lessons not found");
    }

    const invalidLessons = lessonRecords.filter(l => l.organizationId !== organizationId);
    if (invalidLessons.length > 0) {
      throw new Error(`Cannot assign lessons from other organizations. Invalid lessons: ${invalidLessons.map(l => l.id).join(", ")}`);
    }

    return await db.transaction(async (tx) => {
      // Auto-publish lessons when assigned (so learners can see them)
      for (const lessonId of lessonIds) {
        await tx
          .update(lessons)
          .set({ isPublished: true })
          .where(eq(lessons.id, lessonId));
      }
      console.log(`[LessonService] Auto-published ${lessonIds.length} lessons`);

      // Create lesson assignments with scope information
      const lessonAssignmentRecords: LessonAssignment[] = [];
      for (const lessonId of lessonIds) {
        for (const studentId of studentIds) {
          const [assignment] = await tx
            .insert(lessonAssignments)
            .values({
              lessonId,
              studentId,
              organizationId,
              assignedBy,
              dueDate: dueDate || null,
              gradeLevel: scope?.gradeLevel || null,
              departmentId: scope?.departmentId || null,
              subjectId: scope?.subjectId || null,
              unitId: scope?.unitId || null,
            })
            .onConflictDoNothing() // Idempotent - skip if already assigned with same scope
            .returning();
          
          if (assignment) {
            lessonAssignmentRecords.push(assignment);
          }
        }
      }

      // Auto-assign linked quizzes
      let quizAssignmentsCount = 0;
      for (const lessonId of lessonIds) {
        // Get all quizzes linked to this lesson
        const linkedQuizzes = await tx
          .select({ quizId: lessonQuizLinks.quizId })
          .from(lessonQuizLinks)
          .where(eq(lessonQuizLinks.lessonId, lessonId));

        // Assign each linked quiz to each student
        for (const { quizId } of linkedQuizzes) {
          for (const studentId of studentIds) {
            const [quizAssignment] = await tx
              .insert(quizCollectionAssignments)
              .values({
                collectionId: quizId,
                userId: studentId,
                organizationId,
                assignedBy,
                assignedAt: new Date(),
              })
              .onConflictDoNothing() // Idempotent - skip if already assigned
              .returning();
            
            if (quizAssignment) {
              quizAssignmentsCount++;
            }
          }
        }
      }

      console.log(`[LessonService] Created ${lessonAssignmentRecords.length} lesson assignments and ${quizAssignmentsCount} quiz assignments`);
      return { lessonAssignments: lessonAssignmentRecords, quizAssignments: quizAssignmentsCount };
    });
  }

  /**
   * Get lessons assigned to a student with progress information (SCOPE-BASED)
   * Queries lessonScopeAssignments and matches against user's unit/subject enrollments
   * Similar to how quiz collections work - auto-applies when user is assigned to unit/subject
   * Returns published, non-archived lessons that match the user's department/subject scopes
   */
  static async getAssignedLessons(
    studentId: string,
    organizationId: string
  ): Promise<Array<LessonWithRelations & { 
    assignedAt: Date; 
    dueDate: Date | null;
    progress?: LessonProgress | null;
  }>> {
    // Step 1: Get user's unit/subject assignments
    const userAssignments = await db
      .select({
        unitId: userOrganizationAssignments.unitId,
        subjectId: userOrganizationAssignments.subjectId,
      })
      .from(userOrganizationAssignments)
      .where(
        and(
          eq(userOrganizationAssignments.userId, studentId),
          eq(userOrganizationAssignments.organizationId, organizationId)
        )
      );

    // Step 1.5: Get the "General" department unitId (all users should have access to General lessons)
    const generalUnit = await db
      .select({ id: organizationUnits.id })
      .from(organizationUnits)
      .where(
        and(
          eq(organizationUnits.organizationId, organizationId),
          eq(organizationUnits.name, 'General')
        )
      )
      .limit(1);
    
    const generalUnitId = generalUnit[0]?.id || null;
    console.log('[getAssignedLessons] General department unitId:', generalUnitId);

    if (userAssignments.length === 0) {
      // User has no department/subject enrollments - only return organization-wide lessons
      // (where BOTH unitId and subjectId are NULL, visible to ALL users in the org)
      // PLUS General department lessons (accessible to ALL users)
      const orgWideLessons = await db
        .select({
          lesson: lessons,
          assignedAt: lessonScopeAssignments.createdAt,
          dueDate: lessonScopeAssignments.dueDate,
          progress: lessonProgress,
          unitId: lessonScopeAssignments.unitId,
          subjectId: lessonScopeAssignments.subjectId,
        })
        .from(lessonScopeAssignments)
        .innerJoin(lessons, eq(lessonScopeAssignments.lessonId, lessons.id))
        .leftJoin(
          lessonProgress,
          and(
            eq(lessonProgress.lessonId, lessons.id),
            eq(lessonProgress.userId, studentId)
          )
        )
        .where(
          and(
            eq(lessonScopeAssignments.organizationId, organizationId),
            eq(lessonScopeAssignments.audience, 'learner'), // Only show learner assignments
            or(
              // Organization-wide lessons (NULL unitId AND NULL subjectId)
              and(
                sql`${lessonScopeAssignments.unitId} IS NULL`,
                sql`${lessonScopeAssignments.subjectId} IS NULL`
              ),
              // General department lessons (accessible to ALL users)
              generalUnitId ? and(
                eq(lessonScopeAssignments.unitId, generalUnitId),
                sql`${lessonScopeAssignments.subjectId} IS NULL`
              ) : sql`false`
            ),
            eq(lessons.isPublished, true),
            eq(lessons.isArchived, false),
            // Exclude unlinked lessons - include null, undefined, or 'active' availability status
            or(
              sql`${lessons.metadata}->>'availabilityStatus' IS NULL`,
              sql`${lessons.metadata}->>'availabilityStatus' != 'unlinked'`
            )
          )
        );

      return orgWideLessons.map(r => ({
        ...r.lesson,
        assignedAt: r.assignedAt!,
        dueDate: r.dueDate,
        organizationUnitId: r.unitId, // For QuizLobby filters
        unitId: r.unitId, // For QuizLobby filters
        subjectId: r.subjectId, // For QuizLobby filters
        progress: r.progress ? {
          ...r.progress,
          isCompleted: r.progress.status === 'completed',
          completionPercentage: r.progress.percentComplete || 0,
          currentSlide: r.progress.slidesViewedCount || 0,
        } : null,
      }));
    }

    // Step 2: Build OR conditions for user's scopes
    // Extract unique unitIds and subjectIds for matching
    const userUnitIds = Array.from(new Set(userAssignments.map(a => a.unitId).filter((id): id is string => id !== null)));
    const userSubjectIds = Array.from(new Set(userAssignments.map(a => a.subjectId).filter((id): id is string => id !== null)));
    
    // Get subject-unit pairs for validation (subjects that belong to user's departments)
    const validSubjects = userAssignments
      .filter(a => a.unitId && a.subjectId)
      .map(a => a.subjectId!);
    const uniqueValidSubjects = Array.from(new Set(validSubjects));
    
    console.log('[getAssignedLessons] userId:', studentId, 'userAssignments:', userAssignments);
    console.log('[getAssignedLessons] userUnitIds:', userUnitIds, 'uniqueValidSubjects:', uniqueValidSubjects);
    
    const scopeConditions = [];
    
    // SECURE LOGIC: Support all assignment patterns with proper access control
    // Pattern 1: Exact match - lessons assigned to user's specific unit+subject combinations
    for (const assignment of userAssignments) {
      if (assignment.unitId && assignment.subjectId) {
        scopeConditions.push(
          and(
            eq(lessonScopeAssignments.unitId, assignment.unitId),
            eq(lessonScopeAssignments.subjectId, assignment.subjectId)
          )
        );
      }
    }
    
    // Pattern 2: Department-wide lessons - user has department, lesson has no subject restriction
    // These lessons are available to ALL users in the department regardless of their subject assignments
    if (userUnitIds.length > 0) {
      scopeConditions.push(
        and(
          inArray(lessonScopeAssignments.unitId, userUnitIds),
          sql`${lessonScopeAssignments.subjectId} IS NULL`
        )
      );
    }
    
    // Pattern 2.5: General department lessons - accessible to ALL users regardless of their assignments
    if (generalUnitId) {
      scopeConditions.push(
        and(
          eq(lessonScopeAssignments.unitId, generalUnitId),
          sql`${lessonScopeAssignments.subjectId} IS NULL`
        )
      );
    }
    
    // Pattern 3: Subject-only lessons - CONSTRAINED to subjects in user's departments
    // Only show subject-only lessons if the subject is part of user's department-subject enrollments
    if (uniqueValidSubjects.length > 0) {
      scopeConditions.push(
        and(
          sql`${lessonScopeAssignments.unitId} IS NULL`,
          inArray(lessonScopeAssignments.subjectId, uniqueValidSubjects)
        )
      );
    }

    // Step 3: Query lessons that match user's scopes OR are organization-wide (NULL unitId/subjectId)
    const scopedLessons = await db
      .select({
        lesson: lessons,
        assignedAt: lessonScopeAssignments.createdAt,
        dueDate: lessonScopeAssignments.dueDate,
        progress: lessonProgress,
        unitId: lessonScopeAssignments.unitId,
        subjectId: lessonScopeAssignments.subjectId,
      })
      .from(lessonScopeAssignments)
      .innerJoin(lessons, eq(lessonScopeAssignments.lessonId, lessons.id))
      .leftJoin(
        lessonProgress,
        and(
          eq(lessonProgress.lessonId, lessons.id),
          eq(lessonProgress.userId, studentId)
        )
      )
      .where(
        and(
          eq(lessonScopeAssignments.organizationId, organizationId),
          eq(lessonScopeAssignments.audience, 'learner'), // Only show learner assignments
          or(
            // Match user's specific unit/subject scopes
            ...scopeConditions,
            // OR organization-wide lessons (NULL scope)
            and(
              sql`${lessonScopeAssignments.unitId} IS NULL`,
              sql`${lessonScopeAssignments.subjectId} IS NULL`
            )
          ),
          eq(lessons.isPublished, true),
          eq(lessons.isArchived, false),
          // Exclude unlinked lessons - include null, undefined, or 'active' availability status
          or(
            sql`${lessons.metadata}->>'availabilityStatus' IS NULL`,
            sql`${lessons.metadata}->>'availabilityStatus' != 'unlinked'`
          )
        )
      );

    // Step 4: Deduplicate lessons (in case a lesson is assigned to multiple scopes the user has)
    const uniqueLessons = new Map<string, typeof scopedLessons[0]>();
    for (const record of scopedLessons) {
      if (!uniqueLessons.has(record.lesson.id)) {
        uniqueLessons.set(record.lesson.id, record);
      }
    }

    console.log('[getAssignedLessons] scopeConditions count:', scopeConditions.length);
    console.log('[getAssignedLessons] scopedLessons found:', scopedLessons.length);
    console.log('[getAssignedLessons] unique lessons after dedup:', uniqueLessons.size);
    
    // Step 5: Sort by assignedAt descending and transform
    const results = Array.from(uniqueLessons.values())
      .sort((a, b) => {
        const dateA = a.assignedAt instanceof Date ? a.assignedAt.getTime() : 0;
        const dateB = b.assignedAt instanceof Date ? b.assignedAt.getTime() : 0;
        return dateB - dateA;
      })
      .map(r => ({
        ...r.lesson,
        assignedAt: r.assignedAt!,
        dueDate: r.dueDate,
        organizationUnitId: r.unitId, // For QuizLobby filters
        unitId: r.unitId, // For QuizLobby filters
        subjectId: r.subjectId, // For QuizLobby filters
        progress: r.progress ? {
          ...r.progress,
          isCompleted: r.progress.status === 'completed',
          completionPercentage: r.progress.percentComplete || 0,
          currentSlide: r.progress.slidesViewedCount || 0,
        } : null,
      }));

    console.log(`[LessonService] Found ${results.length} scope-based lesson assignments for user ${studentId} in org ${organizationId}`);
    return results;
  }

  /**
   * Get all lesson scope assignments for an organization (admin/teacher view)
   * Returns scope-based lesson assignments (similar to quiz assignments)
   */
  static async getOrganizationLessonAssignments(
    organizationId: string
  ): Promise<Array<{
    id: string;
    lessonId: string;
    lessonTitle: string;
    unitId: string | null;
    subjectId: string | null;
    unitName: string | null;
    subjectName: string | null;
    audience: 'learner' | 'instructor';
    dueDate: Date | null;
    createdAt: Date;
    assignedByName: string | null;
  }>> {
    // Query scope-based assignments
    const scopeAssignments = await db
      .select({
        id: lessonScopeAssignments.id,
        lessonId: lessonScopeAssignments.lessonId,
        unitId: lessonScopeAssignments.unitId,
        subjectId: lessonScopeAssignments.subjectId,
        audience: lessonScopeAssignments.audience,
        dueDate: lessonScopeAssignments.dueDate,
        createdAt: lessonScopeAssignments.createdAt,
        assignedBy: lessonScopeAssignments.assignedBy,
        lessonTitle: lessons.title,
      })
      .from(lessonScopeAssignments)
      .innerJoin(lessons, eq(lessonScopeAssignments.lessonId, lessons.id))
      .where(eq(lessonScopeAssignments.organizationId, organizationId))
      .orderBy(desc(lessonScopeAssignments.createdAt));

    if (scopeAssignments.length === 0) {
      return [];
    }

    // Collect unique IDs for batch fetching
    const unitIds = [...new Set(scopeAssignments.map(a => a.unitId).filter(Boolean))] as string[];
    const subjectIds = [...new Set(scopeAssignments.map(a => a.subjectId).filter(Boolean))] as string[];
    const assignedByIds = [...new Set(scopeAssignments.map(a => a.assignedBy).filter(Boolean))] as string[];

    // Fetch names in parallel
    const [units, subjects, assignedByUsers] = await Promise.all([
      unitIds.length > 0 
        ? db.select().from(organizationUnits).where(inArray(organizationUnits.id, unitIds))
        : Promise.resolve([]),
      subjectIds.length > 0 
        ? db.select().from(organizationSubUnits).where(inArray(organizationSubUnits.id, subjectIds))
        : Promise.resolve([]),
      assignedByIds.length > 0
        ? db.select().from(users).where(inArray(users.id, assignedByIds))
        : Promise.resolve([]),
    ]);

    // Create lookup maps
    const unitMap = new Map(units.map(u => [u.id, u.name]));
    const subjectMap = new Map(subjects.map(s => [s.id, s.name]));
    const assignedByMap = new Map(assignedByUsers.map(u => [u.id, u.gamerName]));

    // Map results with names
    return scopeAssignments.map(assignment => ({
      id: assignment.id,
      lessonId: assignment.lessonId,
      lessonTitle: assignment.lessonTitle,
      unitId: assignment.unitId,
      subjectId: assignment.subjectId,
      unitName: assignment.unitId ? (unitMap.get(assignment.unitId) || 'Unknown Department') : null,
      subjectName: assignment.subjectId ? (subjectMap.get(assignment.subjectId) || 'Unknown Unit') : null,
      audience: assignment.audience,
      dueDate: assignment.dueDate,
      createdAt: assignment.createdAt,
      assignedByName: assignment.assignedBy ? (assignedByMap.get(assignment.assignedBy) || 'Unknown Assigner') : null,
    }));
  }

  /**
   * Get quizzes linked to a lesson
   */
  static async getLinkedQuizzes(lessonId: string): Promise<LessonQuizLink[]> {
    return await db
      .select()
      .from(lessonQuizLinks)
      .where(eq(lessonQuizLinks.lessonId, lessonId))
      .orderBy(desc(lessonQuizLinks.isPrimary), desc(lessonQuizLinks.createdAt));
  }

  /**
   * Get course associations for multiple lessons (batched for performance)
   * Returns a map of lessonId -> array of course summaries
   */
  static async getCoursesForLessons(lessonIds: string[]): Promise<Map<string, Array<{ id: string; title: string; topicOrder: number }>>> {
    if (lessonIds.length === 0) {
      return new Map();
    }

    const courseLinks = await db
      .select({
        lessonId: courseLessons.lessonId,
        courseId: courseLessons.courseId,
        topicOrder: courseLessons.topicOrder,
        courseTitle: courses.title,
        courseStatus: courses.status,
      })
      .from(courseLessons)
      .innerJoin(courses, eq(courseLessons.courseId, courses.id))
      .where(
        and(
          inArray(courseLessons.lessonId, lessonIds),
          eq(courses.status, 'active')
        )
      )
      .orderBy(courseLessons.topicOrder);

    const courseMap = new Map<string, Array<{ id: string; title: string; topicOrder: number }>>();
    
    for (const link of courseLinks) {
      const existing = courseMap.get(link.lessonId) || [];
      existing.push({
        id: link.courseId,
        title: link.courseTitle,
        topicOrder: link.topicOrder,
      });
      courseMap.set(link.lessonId, existing);
    }

    return courseMap;
  }

  /**
   * Link a quiz to a lesson
   * Replaces the old relatedQuizId pattern with many-to-many relationship
   */
  static async linkQuizToLesson(
    lessonId: string,
    quizId: string,
    isPrimary: boolean = false
  ): Promise<LessonQuizLink> {
    const [link] = await db
      .insert(lessonQuizLinks)
      .values({
        lessonId,
        quizId,
        isPrimary,
      })
      .onConflictDoNothing()
      .returning();
    
    console.log(`[LessonService] Linked quiz ${quizId} to lesson ${lessonId} (primary: ${isPrimary})`);
    return link;
  }

  /**
   * Unlink a quiz from a lesson
   */
  static async unlinkQuizFromLesson(lessonId: string, quizId: string): Promise<void> {
    await db
      .delete(lessonQuizLinks)
      .where(
        and(
          eq(lessonQuizLinks.lessonId, lessonId),
          eq(lessonQuizLinks.quizId, quizId)
        )
      );
    
    console.log(`[LessonService] Unlinked quiz ${quizId} from lesson ${lessonId}`);
  }

  /**
   * Extract transcript from PPTX buffer asynchronously
   * Called after PPTX is stored in object storage
   */
  private static async extractTranscriptAsync(
    lessonId: string,
    organizationId: string,
    pptxBuffer: Buffer,
    version: number
  ): Promise<void> {
    console.log(`[LessonService] Starting transcript extraction for lesson ${lessonId} v${version}`);

    try {
      // Mark as processing
      await db
        .update(lessons)
        .set({
          transcriptStatus: "processing",
          updatedAt: new Date(),
        })
        .where(eq(lessons.id, lessonId));

      // Extract text from PPTX
      const { PptxExtractor } = await import("./pptxExtractor");
      const extractor = new PptxExtractor();
      const transcript = await extractor.extractFromBuffer(pptxBuffer);

      // Store transcript JSON in object storage
      const objectStorageService = new ObjectStorageService();
      const transcriptKey = await objectStorageService.uploadLessonTranscript(
        organizationId,
        lessonId,
        version,
        JSON.stringify(transcript, null, 2)
      );

      // Update lesson with success status
      await db
        .update(lessons)
        .set({
          transcriptStatus: "completed",
          transcriptKey,
          updatedAt: new Date(),
        })
        .where(eq(lessons.id, lessonId));

      console.log(
        `[LessonService] Transcript extraction completed for lesson ${lessonId}. ` +
        `Extracted ${transcript.slides.length} slides, stored at ${transcriptKey}`
      );
    } catch (error: any) {
      console.error(`[LessonService] Transcript extraction failed for lesson ${lessonId}:`, error);

      // Update lesson with failure status
      await db
        .update(lessons)
        .set({
          transcriptStatus: "failed",
          metadata: sql`
            COALESCE(metadata, '{}'::jsonb) || 
            jsonb_build_object(
              'transcriptError', ${error.message},
              'transcriptErrorTime', ${new Date().toISOString()}
            )
          `,
          updatedAt: new Date(),
        })
        .where(eq(lessons.id, lessonId));

      // TODO: Enqueue retry via JobQueueService with exponential backoff
      // For now, just log the failure
      console.log(`[LessonService] Transcript extraction will be retried in background`);
    }
  }

  /**
   * Get transcript for a lesson from object storage
   * Used by quiz generation to access lesson content
   */
  static async getLessonTranscript(lessonId: string, organizationId: string): Promise<any | null> {
    const lesson = await this.getLessonById(lessonId, organizationId);

    if (!lesson || !lesson.transcriptKey || lesson.transcriptStatus !== "completed") {
      console.log(
        `[LessonService] No transcript available for lesson ${lessonId} ` +
        `(status: ${lesson?.transcriptStatus || "none"})`
      );
      return null;
    }

    try {
      const objectStorageService = new ObjectStorageService();
      const transcriptJson = await objectStorageService.downloadLessonTranscript(
        lesson.transcriptKey
      );

      return JSON.parse(transcriptJson);
    } catch (error) {
      console.error(`[LessonService] Failed to fetch transcript for lesson ${lessonId}:`, error);
      return null;
    }
  }

  /**
   * Get or extract transcript for a lesson (synchronous)
   * Returns existing transcript if available, otherwise triggers extraction and returns result
   * Used for manual quiz creation where we need the content immediately
   */
  static async getOrExtractTranscript(lessonId: string, organizationId: string): Promise<{
    transcript: any | null;
    status: "completed" | "extracted" | "no_pptx" | "failed";
    message: string;
  }> {
    const lesson = await this.getLessonById(lessonId, organizationId);

    if (!lesson) {
      return {
        transcript: null,
        status: "failed",
        message: "Lesson not found"
      };
    }

    // If transcript already exists and is complete, return it
    if (lesson.transcriptKey && lesson.transcriptStatus === "completed") {
      try {
        const objectStorageService = new ObjectStorageService();
        const transcriptJson = await objectStorageService.downloadLessonTranscript(
          lesson.transcriptKey
        );
        return {
          transcript: JSON.parse(transcriptJson),
          status: "completed",
          message: "Transcript retrieved from storage"
        };
      } catch (error) {
        console.error(`[LessonService] Failed to fetch existing transcript:`, error);
        // Fall through to re-extract
      }
    }

    // Resolve PPTX storage key with legacy/canonical fallbacks before failing.
    let resolvedStorageKey = String(lesson.storageKey || "").trim();
    if (!resolvedStorageKey) {
      const objectStorageService = new ObjectStorageService();
      const privateDir = objectStorageService.getPrivateObjectDir();
      const languageCode = String(lesson.languageCode || "en").trim() || "en";
      const version = Number(lesson.currentSlideVersion || 1) > 0 ? Number(lesson.currentSlideVersion) : 1;
      const candidates = [
        // current canonical path
        path.join(privateDir, "lessons", organizationId, lessonId, languageCode, `v${version}.pptx`),
        // legacy path without language segment
        path.join(privateDir, "lessons", organizationId, lessonId, `v${version}.pptx`),
      ];

      for (const candidate of candidates) {
        try {
          await objectStorageService.downloadLessonPPTXBuffer(candidate);
          resolvedStorageKey = candidate;
          await db
            .update(lessons)
            .set({
              storageKey: candidate,
              updatedAt: new Date(),
            })
            .where(eq(lessons.id, lessonId));
          break;
        } catch {
          // Try next candidate
        }
      }
    }

    if (!resolvedStorageKey) {
      return {
        transcript: null,
        status: "no_pptx",
        message: "Lesson has no PPTX file uploaded"
      };
    }

    // If transcript is currently processing, wait briefly and check again
    if (lesson.transcriptStatus === "processing") {
      // Wait up to 10 seconds for processing to complete
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const refreshedLesson = await this.getLessonById(lessonId, organizationId);
        if (refreshedLesson?.transcriptStatus === "completed" && refreshedLesson.transcriptKey) {
          try {
            const objectStorageService = new ObjectStorageService();
            const transcriptJson = await objectStorageService.downloadLessonTranscript(
              refreshedLesson.transcriptKey
            );
            return {
              transcript: JSON.parse(transcriptJson),
              status: "completed",
              message: "Transcript retrieved after processing completed"
            };
          } catch (error) {
            break; // Fall through to re-extract
          }
        }
        if (refreshedLesson?.transcriptStatus === "failed") {
          break; // Fall through to re-extract
        }
      }
    }

    // Extract transcript synchronously
    console.log(`[LessonService] Extracting transcript for lesson ${lessonId}`);

    try {
      // Mark as processing
      await db
        .update(lessons)
        .set({
          transcriptStatus: "processing",
          updatedAt: new Date(),
        })
        .where(eq(lessons.id, lessonId));

      // Download PPTX from object storage
      const objectStorageService = new ObjectStorageService();
      const pptxBuffer = await objectStorageService.downloadLessonPPTXBuffer(resolvedStorageKey);

      // Extract text from PPTX
      const { PptxExtractor } = await import("./pptxExtractor");
      const extractor = new PptxExtractor();
      const transcript = await extractor.extractFromBuffer(pptxBuffer);

      // Store transcript JSON in object storage
      const version = lesson.currentSlideVersion || 1;
      const transcriptKey = await objectStorageService.uploadLessonTranscript(
        organizationId,
        lessonId,
        version,
        JSON.stringify(transcript, null, 2)
      );

      // Update lesson with success status
      await db
        .update(lessons)
        .set({
          transcriptStatus: "completed",
          transcriptKey,
          updatedAt: new Date(),
        })
        .where(eq(lessons.id, lessonId));

      console.log(
        `[LessonService] Transcript extraction completed for lesson ${lessonId}. ` +
        `Extracted ${transcript.slides.length} slides, stored at ${transcriptKey}`
      );

      return {
        transcript,
        status: "extracted",
        message: `Successfully extracted ${transcript.slides.length} slides`
      };
    } catch (error: any) {
      console.error(`[LessonService] Transcript extraction failed for lesson ${lessonId}:`, error);

      // Update lesson with failure status
      await db
        .update(lessons)
        .set({
          transcriptStatus: "failed",
          metadata: sql`
            COALESCE(metadata, '{}'::jsonb) || 
            jsonb_build_object(
              'transcriptError', ${error.message},
              'transcriptErrorTime', ${new Date().toISOString()}
            )
          `,
          updatedAt: new Date(),
        })
        .where(eq(lessons.id, lessonId));

      return {
        transcript: null,
        status: "failed",
        message: `Extraction failed: ${error.message}`
      };
    }
  }
}
