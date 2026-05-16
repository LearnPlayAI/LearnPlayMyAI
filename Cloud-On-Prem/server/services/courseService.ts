import { db } from '../db';
import {
  courses,
  courseLessons,
  courseVersions,
  courseFrameworks,
  courseCategories,
  lessons,
  lessonQuizLinks,
  userCourseLessonProgress,
  userCourseEnrollments,
  coursePurchases,
  courseReviews,
  courseAssignments,
  organizations,
  organizationUnits,
  organizationSubUnits,
  userQuizProgress,
  brandingThemes,
  quizDrafts,
  translationSearchDocuments,
  type InsertCourse,
  type Course,
  type InsertCourseLesson,
  type CourseLesson,
  type CourseFramework,
  type Lesson,
} from '@shared/schema';
import { eq, and, or, desc, ilike, sql, inArray, asc, isNull, gt, isNotNull, count, exists } from 'drizzle-orm';
import { ObjectStorageService } from '../objectStorage';
import { CourseVisibilityService, type CourseVisibility } from './courseVisibilityService';
import type { SessionContext } from '../routes/shared';
import { JobQueueService } from './jobQueueService';
import { CourseContextService } from './courseContextService';
import { CourseVersionService } from './courseVersionService';
import { isFeatureEnabled } from '../featureFlags';
import { TranslationIndexService } from './translationIndexService';
import { TranslationAnalyticsService } from './translationAnalyticsService';
import { PublicOrganizationService } from './publicOrganizationService';
import { randomUUID } from 'crypto';

export interface CourseCloneOptions {
  targetOrganizationId?: string;
  newTitle?: string;
  preserveVisibility?: boolean;
  createdByUserId: string;
}

export interface CourseCloneResult {
  clonedCourse: Course;
  frameworkCloned: boolean;
  lessonsLinked: number;
  visibilityChanged: boolean;
  originalVisibility: CourseVisibility;
  newVisibility: CourseVisibility;
}

const objectStorageService = new ObjectStorageService();

export interface CourseWithLessons extends Course {
  lessons: Array<CourseLesson & { lesson: typeof lessons.$inferSelect }>;
  latestVersion?: typeof courseVersions.$inferSelect;
}

export interface CourseProgressResult {
  completedLessons: number;
  totalLessons: number;
  percentComplete: number;
  status: 'not_started' | 'in_progress' | 'completed';
}

export class CourseService {
  private static normalizeTopicNameForDedup(topicName?: string | null): string {
    return String(topicName || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  private static getCourseLessonTopicDedupKey(link: { topicId?: string | null; topicOrder?: number | null; topicName?: string | null }): string {
    if (link.topicId) return `topic-id:${link.topicId}`;
    return `topic:${link.topicOrder ?? -1}:${this.normalizeTopicNameForDedup(link.topicName)}`;
  }

  static async createEmptyLessonTopic(params: {
    courseId: string;
    organizationId: string;
    userId: string;
    name: string;
    description?: string;
  }): Promise<{ topic: any; lesson: Lesson }> {
    const name = String(params.name || '').trim();
    const description = String(params.description || '').trim();
    const normalizedName = name.toLowerCase();

    if (!name) {
      throw new Error('Topic name is required');
    }
    if (normalizedName.includes('overview') || normalizedName.includes('takeaway')) {
      throw new Error('Overview and key takeaways are structural lessons and cannot be added manually');
    }

    const course = await db.query.courses.findFirst({
      where: and(
        eq(courses.id, params.courseId),
        eq(courses.organizationId, params.organizationId)
      ),
    });

    if (!course) {
      throw new Error('Course not found or unauthorized');
    }

    const framework = await db.query.courseFrameworks.findFirst({
      where: eq(courseFrameworks.courseId, params.courseId),
    });

    if (!framework) {
      throw new Error('Course framework not found');
    }

    const courseAssignment = await db.query.courseAssignments.findFirst({
      where: eq(courseAssignments.courseId, params.courseId),
    });
    const unit = courseAssignment?.unitId
      ? await db.query.organizationUnits.findFirst({ where: eq(organizationUnits.id, courseAssignment.unitId) })
      : null;
    const subUnit = courseAssignment?.subUnitId
      ? await db.query.organizationSubUnits.findFirst({ where: eq(organizationSubUnits.id, courseAssignment.subUnitId) })
      : null;

    const lessonId = randomUUID();
    const topicId = randomUUID();
    const topics = Array.isArray(framework.topics) ? ([...(framework.topics as any[])] as any[]) : [];
    topics.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

    const keyTakeawaysIndex = topics.findIndex((topic: any) => {
      const lessonType = String(topic.lessonType || '').toLowerCase();
      const topicName = String(topic.name || '').toLowerCase();
      return lessonType === 'key_takeaways' || topicName.includes('key takeaway');
    });
    const insertOrder = keyTakeawaysIndex >= 0 ? keyTakeawaysIndex : topics.length;

    const newTopic = {
      id: topicId,
      order: insertOrder,
      name,
      description,
      detailedSummary: '',
      isOverview: false,
      lessonType: 'content',
      userEditedName: true,
      userEditedDescription: description.length > 0,
      lessonId,
      learningObjectives: [],
      prerequisiteTopicIds: [],
      keyTerms: [],
      assessmentIdeas: [],
      estimatedDurationMinutes: undefined,
      sourceContent: '',
      sourceDocumentId: null,
      sourceSummary: '',
    };

    const reindexedTopics = topics.map((topic: any, idx: number) => {
      const baseTopic = { ...topic, order: idx };
      if (baseTopic.order >= insertOrder) {
        return { ...baseTopic, order: baseTopic.order + 1 };
      }
      return baseTopic;
    });
    reindexedTopics.push(newTopic);
    reindexedTopics.sort((a: any, b: any) => (Number(a.order) || 0) - (Number(b.order) || 0));

    let lesson: Lesson | undefined;
    await db.transaction(async (tx) => {
      const [createdLesson] = await tx.insert(lessons).values({
        id: lessonId,
        title: name,
        description: description || null,
        createdBy: params.userId,
        organizationId: params.organizationId,
        department: unit?.name || null,
        unit: subUnit?.name || null,
        generationMode: 'text-input',
        generationStatus: 'pending',
        inputText: null,
        isPublished: false,
        isArchived: false,
        contentGroupId: lessonId,
        languageCode: course.languageCode || null,
      }).returning();

      await tx.insert(courseLessons).values({
        courseId: params.courseId,
        lessonId,
        topicId,
        topicName: name,
        topicOrder: insertOrder,
        lessonType: 'content',
      });

      await tx.update(courseFrameworks)
        .set({ topics: reindexedTopics as any })
        .where(eq(courseFrameworks.id, framework.id));

      lesson = createdLesson;
    });

    if (!lesson) {
      throw new Error('Failed to create lesson');
    }

    try {
      await TranslationIndexService.enqueueForLessonMutation({
        lessonId: lesson.id,
        organizationId: params.organizationId,
        eventType: 'create',
        dedupeSeed: `${lesson.id}:empty-course-topic-create`,
      });
    } catch (indexError: any) {
      console.error('[CourseService] Failed to enqueue translation index job for empty lesson topic:', indexError?.message || indexError);
    }

    return { topic: newTopic, lesson };
  }

  private static getPodcastSignalScore(metadata: any): number {
    if (!metadata || typeof metadata !== "object") return 0;
    const podcast = metadata?.podcast;
    if (!podcast || typeof podcast !== "object") return 0;
    const versions = Array.isArray(podcast.versions) ? podcast.versions.length : 0;
    const scripts = Array.isArray(podcast.scripts) ? podcast.scripts.length : 0;
    const sources = Array.isArray(podcast.sourceMaterials) ? podcast.sourceMaterials.length : 0;
    const active = podcast.activeVersionId ? 1 : 0;
    return versions * 8 + scripts * 4 + sources * 2 + active * 6;
  }

  private static lessonContentScore(lesson: any): number {
    if (!lesson) return 0;
    let score = 0;
    if (lesson.storageKey) score += 40;
    if (lesson.videoStorageKey) score += 20;
    if (lesson.presentationUrl) score += 12;
    if (lesson.gammaCardId) score += 8;
    if (lesson.sourceDocumentPath) score += 8;
    if (lesson.transcriptKey) score += 8;
    if (String(lesson.inputText || "").trim().length >= 150) score += 14;
    if (String(lesson.generationStatus || "").toLowerCase() === "completed") score += 10;
    if (lesson.relatedQuizId) score += 6;
    if (!lesson.isArchived) score += 4;
    score += this.getPodcastSignalScore(lesson.metadata);
    return score;
  }

  private static mergePodcastMetadata(baseMetadata: any, donorMetadata: any): any {
    if (!donorMetadata || typeof donorMetadata !== "object") return baseMetadata;
    if (!baseMetadata || typeof baseMetadata !== "object") return donorMetadata;

    const base = { ...baseMetadata };
    const donor = { ...donorMetadata };
    const basePodcast = base.podcast && typeof base.podcast === "object" ? { ...base.podcast } : {};
    const donorPodcast = donor.podcast && typeof donor.podcast === "object" ? donor.podcast : null;
    if (!donorPodcast) return baseMetadata;

    const mergeById = (left: any[], right: any[]) => {
      const map = new Map<string, any>();
      for (const item of left || []) {
        if (item?.id) map.set(String(item.id), item);
      }
      for (const item of right || []) {
        if (item?.id && !map.has(String(item.id))) {
          map.set(String(item.id), item);
        }
      }
      return Array.from(map.values());
    };

    basePodcast.versions = mergeById(
      Array.isArray(basePodcast.versions) ? basePodcast.versions : [],
      Array.isArray(donorPodcast.versions) ? donorPodcast.versions : []
    );
    basePodcast.scripts = mergeById(
      Array.isArray(basePodcast.scripts) ? basePodcast.scripts : [],
      Array.isArray(donorPodcast.scripts) ? donorPodcast.scripts : []
    );
    basePodcast.sourceMaterials = mergeById(
      Array.isArray(basePodcast.sourceMaterials) ? basePodcast.sourceMaterials : [],
      Array.isArray(donorPodcast.sourceMaterials) ? donorPodcast.sourceMaterials : []
    );
    basePodcast.auditArtifacts = mergeById(
      Array.isArray(basePodcast.auditArtifacts) ? basePodcast.auditArtifacts : [],
      Array.isArray(donorPodcast.auditArtifacts) ? donorPodcast.auditArtifacts : []
    );

    if (!basePodcast.activeVersionId && donorPodcast.activeVersionId) {
      basePodcast.activeVersionId = donorPodcast.activeVersionId;
    }
    if (!basePodcast.currentJob && donorPodcast.currentJob) {
      basePodcast.currentJob = donorPodcast.currentJob;
    }
    if (!basePodcast.draft && donorPodcast.draft) {
      basePodcast.draft = donorPodcast.draft;
    }

    base.podcast = basePodcast;
    return base;
  }

  static async selfHealDuplicateCourseLessons(courseId: string): Promise<{ mergedGroups: number; removedLinks: number; archivedLessons: number }> {
    const courseLinks = await db
      .select({
        linkId: courseLessons.id,
        courseId: courseLessons.courseId,
        lessonId: courseLessons.lessonId,
        topicId: courseLessons.topicId,
        topicOrder: courseLessons.topicOrder,
        topicName: courseLessons.topicName,
        primaryQuizId: courseLessons.primaryQuizId,
        learningObjectives: courseLessons.learningObjectives,
        lessonDetail: courseLessons.lessonDetail,
        realWorldExample: courseLessons.realWorldExample,
        lessonType: courseLessons.lessonType,
        contentHealth: courseLessons.contentHealth,
        linkCreatedAt: courseLessons.createdAt,
        lesson: lessons,
      })
      .from(courseLessons)
      .innerJoin(lessons, eq(courseLessons.lessonId, lessons.id))
      .where(eq(courseLessons.courseId, courseId))
      .orderBy(asc(courseLessons.topicOrder), desc(courseLessons.createdAt));

    if (courseLinks.length < 2) {
      return { mergedGroups: 0, removedLinks: 0, archivedLessons: 0 };
    }

    const grouped = new Map<string, typeof courseLinks>();
    for (const link of courseLinks) {
      const key = this.getCourseLessonTopicDedupKey(link);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(link);
    }

    let frameworkNeedsSave = false;
    let mergedGroups = 0;
    const removeLinkIds: string[] = [];
    const donorLessonIds: string[] = [];

    const framework = await db.query.courseFrameworks.findFirst({
      where: eq(courseFrameworks.courseId, courseId),
    });
    const topics = Array.isArray(framework?.topics) ? ([...(framework!.topics as any[])] as any[]) : [];

    for (const [, links] of grouped.entries()) {
      if (links.length < 2) continue;

      const ranked = [...links].sort((a, b) => {
        const scoreDelta = this.lessonContentScore(b.lesson) - this.lessonContentScore(a.lesson);
        if (scoreDelta !== 0) return scoreDelta;
        const aTs = a.linkCreatedAt ? new Date(a.linkCreatedAt).getTime() : 0;
        const bTs = b.linkCreatedAt ? new Date(b.linkCreatedAt).getTime() : 0;
        return bTs - aTs;
      });

      const canonical = ranked[0];
      const donors = ranked.slice(1);
      if (donors.length === 0) continue;

      const canonicalLessonPatch: Record<string, any> = {};
      const canonicalLinkPatch: Record<string, any> = {};
      let canonicalMetadata: any = canonical.lesson?.metadata || null;

      for (const donor of donors) {
        const donorLesson = donor.lesson;
        if (!canonical.lesson.storageKey && donorLesson?.storageKey) canonicalLessonPatch.storageKey = donorLesson.storageKey;
        if (!canonical.lesson.videoStorageKey && donorLesson?.videoStorageKey) {
          canonicalLessonPatch.videoStorageKey = donorLesson.videoStorageKey;
          if (!canonical.lesson.videoDurationSec && donorLesson.videoDurationSec) canonicalLessonPatch.videoDurationSec = donorLesson.videoDurationSec;
          if (!canonical.lesson.videoSizeBytes && donorLesson.videoSizeBytes) canonicalLessonPatch.videoSizeBytes = donorLesson.videoSizeBytes;
          if (!canonical.lesson.videoUploadedAt && donorLesson.videoUploadedAt) canonicalLessonPatch.videoUploadedAt = donorLesson.videoUploadedAt;
        }
        if (!canonical.lesson.presentationUrl && donorLesson?.presentationUrl) canonicalLessonPatch.presentationUrl = donorLesson.presentationUrl;
        if (!canonical.lesson.gammaCardId && donorLesson?.gammaCardId) canonicalLessonPatch.gammaCardId = donorLesson.gammaCardId;
        if (!canonical.lesson.sourceDocumentPath && donorLesson?.sourceDocumentPath) canonicalLessonPatch.sourceDocumentPath = donorLesson.sourceDocumentPath;
        if (!canonical.lesson.transcriptKey && donorLesson?.transcriptKey) canonicalLessonPatch.transcriptKey = donorLesson.transcriptKey;
        if (!canonical.lesson.inputText && donorLesson?.inputText) canonicalLessonPatch.inputText = donorLesson.inputText;
        if (!canonical.lesson.relatedQuizId && donorLesson?.relatedQuizId) canonicalLessonPatch.relatedQuizId = donorLesson.relatedQuizId;
        if ((!canonical.lesson.generationStatus || canonical.lesson.generationStatus !== "completed") && donorLesson?.generationStatus === "completed") {
          canonicalLessonPatch.generationStatus = "completed";
        }

        canonicalMetadata = this.mergePodcastMetadata(canonicalMetadata, donorLesson?.metadata);
        if (!canonical.primaryQuizId && donor.primaryQuizId) canonicalLinkPatch.primaryQuizId = donor.primaryQuizId;
        if ((!canonical.learningObjectives || canonical.learningObjectives.length === 0) && donor.learningObjectives?.length) {
          canonicalLinkPatch.learningObjectives = donor.learningObjectives;
        }
        if (!canonical.lessonDetail && donor.lessonDetail) canonicalLinkPatch.lessonDetail = donor.lessonDetail;
        if (!canonical.realWorldExample && donor.realWorldExample) canonicalLinkPatch.realWorldExample = donor.realWorldExample;
        if (!canonical.lessonType && donor.lessonType) canonicalLinkPatch.lessonType = donor.lessonType;
        if (!canonical.contentHealth && donor.contentHealth) canonicalLinkPatch.contentHealth = donor.contentHealth;

        removeLinkIds.push(donor.linkId);
        if (donor.lessonId !== canonical.lessonId) donorLessonIds.push(donor.lessonId);

        for (const topic of topics) {
          if (topic?.lessonId && String(topic.lessonId) === String(donor.lessonId)) {
            topic.lessonId = canonical.lessonId;
            frameworkNeedsSave = true;
          }
        }
      }

      if (Object.keys(canonicalLessonPatch).length > 0 || canonicalMetadata) {
        const updatePayload: Record<string, any> = { ...canonicalLessonPatch };
        if (canonicalMetadata && JSON.stringify(canonicalMetadata) !== JSON.stringify(canonical.lesson?.metadata || null)) {
          updatePayload.metadata = canonicalMetadata;
        }
        if (Object.keys(updatePayload).length > 0) {
          await db.update(lessons).set(updatePayload).where(eq(lessons.id, canonical.lessonId));
        }
      }

      if (Object.keys(canonicalLinkPatch).length > 0) {
        await db.update(courseLessons).set(canonicalLinkPatch).where(eq(courseLessons.id, canonical.linkId));
      }

      mergedGroups += 1;
    }

    if (removeLinkIds.length > 0) {
      await db.delete(courseLessons).where(inArray(courseLessons.id, removeLinkIds));
    }

    if (framework && frameworkNeedsSave) {
      await db
        .update(courseFrameworks)
        .set({ topics: topics as any })
        .where(eq(courseFrameworks.id, framework.id));
    }

    let archivedLessons = 0;
    const uniqueDonorLessonIds = Array.from(new Set(donorLessonIds));
    if (uniqueDonorLessonIds.length > 0) {
      const stillLinkedRows = await db
        .select({ lessonId: courseLessons.lessonId })
        .from(courseLessons)
        .where(inArray(courseLessons.lessonId, uniqueDonorLessonIds));
      const stillLinked = new Set(stillLinkedRows.map((row) => row.lessonId));
      const archiveIds = uniqueDonorLessonIds.filter((id) => !stillLinked.has(id));
      if (archiveIds.length > 0) {
        await db
          .update(lessons)
          .set({ isArchived: true, archivedAt: new Date() })
          .where(and(inArray(lessons.id, archiveIds), eq(lessons.isArchived, false)));
        archivedLessons = archiveIds.length;
      }
    }

    if (mergedGroups > 0 || removeLinkIds.length > 0 || archivedLessons > 0) {
      console.log(
        `[CourseService] Self-healed duplicate course lessons for ${courseId}: groups=${mergedGroups}, removedLinks=${removeLinkIds.length}, archivedLessons=${archivedLessons}`
      );
    }

    return {
      mergedGroups,
      removedLinks: removeLinkIds.length,
      archivedLessons,
    };
  }

  /**
   * Keep learner-facing courseLessons ordering aligned with the builder framework.
   * The course framework is the source of truth after drag/drop reordering; public
   * course pages read courseLessons, so stale rows must be repaired before publish
   * and before course details are returned.
   */
  static async syncCourseLessonOrderFromFramework(courseId: string): Promise<{ updated: number; skipped: number }> {
    const framework = await db.query.courseFrameworks.findFirst({
      where: eq(courseFrameworks.courseId, courseId),
    });

    const topics = Array.isArray(framework?.topics) ? ([...(framework!.topics as any[])] as any[]) : [];
    if (!framework || topics.length === 0) {
      return { updated: 0, skipped: 0 };
    }

    const links = await db
      .select({
        id: courseLessons.id,
        lessonId: courseLessons.lessonId,
        topicId: courseLessons.topicId,
        topicOrder: courseLessons.topicOrder,
        topicName: courseLessons.topicName,
        lessonType: courseLessons.lessonType,
      })
      .from(courseLessons)
      .where(eq(courseLessons.courseId, courseId));

    const linkByLessonId = new Map(links.map((link) => [String(link.lessonId), link]));
    let updated = 0;
    let skipped = 0;

    for (const topic of topics) {
      const lessonId = String(topic?.lessonId || "").trim();
      if (!lessonId) {
        skipped++;
        continue;
      }

      const link = linkByLessonId.get(lessonId);
      if (!link) {
        skipped++;
        continue;
      }

      const topicOrder = Number(topic.order);
      if (!Number.isFinite(topicOrder)) {
        skipped++;
        continue;
      }

      const topicLessonType = String(topic.lessonType || "").toLowerCase();
      const lessonType: "overview" | "content" | "key_takeaways" =
        topicLessonType === "overview" || topic.isOverview === true
          ? "overview"
          : topicLessonType === "key_takeaways"
            ? "key_takeaways"
            : "content";
      const nextTopicId = topic.id ? String(topic.id) : null;
      const nextTopicName = String(topic.name || link.topicName || "").trim();

      const patch: Record<string, any> = {};
      if (link.topicOrder !== topicOrder) patch.topicOrder = topicOrder;
      if (nextTopicId && link.topicId !== nextTopicId) patch.topicId = nextTopicId;
      if (nextTopicName && link.topicName !== nextTopicName) patch.topicName = nextTopicName;
      if (link.lessonType !== lessonType) patch.lessonType = lessonType;

      if (Object.keys(patch).length === 0) continue;

      await db
        .update(courseLessons)
        .set(patch)
        .where(eq(courseLessons.id, link.id));
      updated++;
    }

    if (updated > 0) {
      console.log(`[CourseService] Synced ${updated} courseLessons row(s) from framework order for course ${courseId}`);
    }

    return { updated, skipped };
  }

  /**
   * Calculate course progress using dual-mechanism completion logic.
   * A lesson is considered completed if:
   * 1. Its linked quiz was passed (userQuizProgress.isPassed = true), OR
   * 2. It has NO linked quiz (auto-complete for overview/intro lessons with topicOrder = 0 or 1), OR
   * 3. It has a completion record with completedAt set (legacy fallback)
   * 
   * This is the canonical completion logic - use this instead of the cached courseProgress.completedLessons
   */
  static async calculateCourseProgress(
    courseId: string,
    userId: string,
    courseVersionId?: string
  ): Promise<CourseProgressResult> {
    // Resolve courseVersionId: use provided value, or get latest version for the course
    let resolvedVersionId = courseVersionId;
    if (!resolvedVersionId) {
      const latestVersion = await CourseVersionService.getLatestVersion(courseId);
      resolvedVersionId = latestVersion?.id;
    }

    // Get all linked lessons for this course
    // Note: courseLessons table does NOT have courseVersionId column, so we filter by courseId only
    const allLinkedLessons = await db.query.courseLessons.findMany({
      where: eq(courseLessons.courseId, courseId),
    });

    // Find the minimum topicOrder to identify the overview lesson
    const minTopicOrder = allLinkedLessons.length > 0 
      ? Math.min(...allLinkedLessons.map(cl => cl.topicOrder))
      : 0;

    // Exclude overview lessons (topicOrder = minTopicOrder) from progress calculation
    // Overview lessons never have quizzes and should be auto-completed, so we exclude them from the count
    const linkedLessons = allLinkedLessons.filter(cl => cl.topicOrder > minTopicOrder);

    const totalLessons = linkedLessons.length;
    if (totalLessons === 0) {
      // Course has only overview lesson or no lessons - consider it complete
      return { completedLessons: 0, totalLessons: 0, percentComplete: 100, status: 'completed' };
    }

    const lessonIds = linkedLessons.map(cl => cl.lessonId);

    // Query lessonQuizLinks to find which quiz is linked to each lesson
    const quizLinks = await db.query.lessonQuizLinks.findMany({
      where: inArray(lessonQuizLinks.lessonId, lessonIds),
    });

    // Build map of lessonId -> quizId (use primary quiz if multiple, otherwise first)
    const lessonToQuizMap = new Map<string, string>();
    for (const link of quizLinks) {
      if (!lessonToQuizMap.has(link.lessonId) || link.isPrimary) {
        lessonToQuizMap.set(link.lessonId, link.quizId);
      }
    }

    // Get all quiz IDs linked to lessons in this course
    const quizIds = Array.from(new Set(quizLinks.map(link => link.quizId)));

    // Query userQuizProgress to check which quizzes the user passed
    let passedQuizIds = new Set<string>();
    if (quizIds.length > 0) {
      const progressRecords = await db.query.userQuizProgress.findMany({
        where: and(
          eq(userQuizProgress.userId, userId),
          inArray(userQuizProgress.collectionId, quizIds),
          eq(userQuizProgress.isPassed, true)
        ),
      });
      passedQuizIds = new Set(progressRecords.map(p => p.collectionId));
    }

    // FALLBACK: Query userCourseLessonProgress for lessons without quizzes or as backup
    // Note: userCourseLessonProgress table DOES have courseVersionId column, so filter by it if available
    let completedLessonsFromProgress = new Set<string>();
    const progressQuery = resolvedVersionId
      ? and(
          eq(userCourseLessonProgress.userId, userId),
          eq(userCourseLessonProgress.courseId, courseId),
          eq(userCourseLessonProgress.courseVersionId, resolvedVersionId),
          inArray(userCourseLessonProgress.lessonId, lessonIds),
          isNotNull(userCourseLessonProgress.completedAt)
        )
      : and(
          eq(userCourseLessonProgress.userId, userId),
          eq(userCourseLessonProgress.courseId, courseId),
          inArray(userCourseLessonProgress.lessonId, lessonIds),
          isNotNull(userCourseLessonProgress.completedAt)
        );
    
    const lessonProgressRecords = await db.query.userCourseLessonProgress.findMany({
      where: progressQuery,
    });
    completedLessonsFromProgress = new Set(lessonProgressRecords.map(p => p.lessonId));

    // Count completed lessons using dual-mechanism:
    // 1. Quiz passed (PRIMARY for lessons with quizzes), OR
    // 2. Has completion record with completedAt set (for lessons without quizzes)
    // Note: Lessons without quizzes require explicit completion (user must view them)
    let completedCount = 0;
    for (const cl of linkedLessons) {
      const quizId = lessonToQuizMap.get(cl.lessonId);
      const quizPassed = quizId ? passedQuizIds.has(quizId) : false;
      const hasCompletionRecord = completedLessonsFromProgress.has(cl.lessonId);

      if (quizPassed || hasCompletionRecord) {
        completedCount++;
      }
    }

    const percentComplete = Math.round((completedCount / totalLessons) * 100);
    let status: 'not_started' | 'in_progress' | 'completed' = 'not_started';
    if (completedCount === totalLessons) {
      status = 'completed';
    } else if (completedCount > 0) {
      status = 'in_progress';
    }

    return { completedLessons: completedCount, totalLessons, percentComplete, status };
  }

  /**
   * Batch calculate course progress for multiple courses (optimized for My Courses page)
   * Uses the same dual-mechanism completion logic as calculateCourseProgress
   */
  static async calculateCourseProgressBatch(
    courseIds: string[],
    userId: string
  ): Promise<Map<string, CourseProgressResult>> {
    const resultMap = new Map<string, CourseProgressResult>();
    
    if (courseIds.length === 0) {
      return resultMap;
    }

    // Get all linked lessons for all courses
    const linkedLessons = await db.query.courseLessons.findMany({
      where: inArray(courseLessons.courseId, courseIds),
    });

    // Group lessons by courseId (all lessons for finding min topicOrder per course)
    const allLessonsByCourse = new Map<string, typeof linkedLessons>();
    for (const cl of linkedLessons) {
      if (!allLessonsByCourse.has(cl.courseId)) {
        allLessonsByCourse.set(cl.courseId, []);
      }
      allLessonsByCourse.get(cl.courseId)!.push(cl);
    }

    // Exclude overview lessons (minTopicOrder per course) from progress calculation
    // Build filtered lessons list per course
    type CourseLessonType = typeof linkedLessons[number];
    const lessonsByCourse = new Map<string, CourseLessonType[]>();
    const allLessonsByCourseEntries = Array.from(allLessonsByCourse.entries());
    for (const [cId, courseLessonsList] of allLessonsByCourseEntries) {
      if (courseLessonsList.length === 0) {
        lessonsByCourse.set(cId, []);
        continue;
      }
      const minTopicOrder = Math.min(...courseLessonsList.map((cl: CourseLessonType) => cl.topicOrder));
      // Exclude overview lesson (lesson with minTopicOrder)
      const nonOverviewLessons = courseLessonsList.filter((cl: CourseLessonType) => cl.topicOrder > minTopicOrder);
      lessonsByCourse.set(cId, nonOverviewLessons);
    }

    // Get all non-overview lesson IDs
    const allLessonIds: string[] = [];
    const lessonsByCourseValues = Array.from(lessonsByCourse.values());
    for (const lessons of lessonsByCourseValues) {
      allLessonIds.push(...lessons.map((cl: CourseLessonType) => cl.lessonId));
    }
    
    if (allLessonIds.length === 0) {
      // All courses have only overview lessons or no lessons - consider them complete
      for (const courseId of courseIds) {
        resultMap.set(courseId, { completedLessons: 0, totalLessons: 0, percentComplete: 100, status: 'completed' });
      }
      return resultMap;
    }

    // Query all quiz links for these lessons
    const quizLinks = await db.query.lessonQuizLinks.findMany({
      where: inArray(lessonQuizLinks.lessonId, allLessonIds),
    });

    // Build map of lessonId -> quizId
    const lessonToQuizMap = new Map<string, string>();
    for (const link of quizLinks) {
      if (!lessonToQuizMap.has(link.lessonId) || link.isPrimary) {
        lessonToQuizMap.set(link.lessonId, link.quizId);
      }
    }

    // Get all quiz IDs
    const quizIds = Array.from(new Set(quizLinks.map(link => link.quizId)));

    // Query userQuizProgress to check which quizzes the user passed
    let passedQuizIds = new Set<string>();
    if (quizIds.length > 0) {
      const progressRecords = await db.query.userQuizProgress.findMany({
        where: and(
          eq(userQuizProgress.userId, userId),
          inArray(userQuizProgress.collectionId, quizIds),
          eq(userQuizProgress.isPassed, true)
        ),
      });
      passedQuizIds = new Set(progressRecords.map(p => p.collectionId));
    }

    // Query userCourseLessonProgress for fallback
    const lessonProgressRecords = await db.query.userCourseLessonProgress.findMany({
      where: and(
        eq(userCourseLessonProgress.userId, userId),
        inArray(userCourseLessonProgress.courseId, courseIds),
        inArray(userCourseLessonProgress.lessonId, allLessonIds),
        isNotNull(userCourseLessonProgress.completedAt)
      ),
    });
    const completedLessonsFromProgress = new Set(lessonProgressRecords.map(p => p.lessonId));

    // Calculate progress for each course
    for (const courseId of courseIds) {
      const courseLessonsList = lessonsByCourse.get(courseId) || [];
      const totalLessons = courseLessonsList.length;

      if (totalLessons === 0) {
        // Course with only overview lesson = 100% complete (overview auto-completes)
        resultMap.set(courseId, { completedLessons: 0, totalLessons: 0, percentComplete: 100, status: 'completed' });
        continue;
      }

      let completedCount = 0;
      for (const cl of courseLessonsList) {
        const quizId = lessonToQuizMap.get(cl.lessonId);
        const quizPassed = quizId ? passedQuizIds.has(quizId) : false;
        const hasCompletionRecord = completedLessonsFromProgress.has(cl.lessonId);

        if (quizPassed || hasCompletionRecord) {
          completedCount++;
        }
      }

      // Handle divide-by-zero for courses with only overview lessons
      const percentComplete = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 100;
      let status: 'not_started' | 'in_progress' | 'completed' = 'not_started';
      if (totalLessons === 0 || completedCount === totalLessons) {
        // Course with only overview lesson OR all lessons complete = completed
        status = 'completed';
      } else if (completedCount > 0) {
        status = 'in_progress';
      }

      resultMap.set(courseId, { completedLessons: completedCount, totalLessons, percentComplete, status });
    }

    return resultMap;
  }

  /**
   * Create a new course with initial version 1.0
   * Note: Legacy scope fields (unitId, subUnitId, teamId) are not written - use courseAssignments instead
   */
  static async createCourse(data: InsertCourse, createdByUserId: string): Promise<Course> {
    // Omit legacy scope fields - scope is now managed via courseAssignments
    const { unitId, subUnitId, teamId, ...courseData } = data as any;
    const course = await db.insert(courses).values({
      ...courseData,
    }).returning();

    // Create initial version 1.0 with same price/currency as course
    await db.insert(courseVersions).values({
      courseId: course[0].id,
      versionNumber: '1.0',
      title: course[0].title,
      description: course[0].description || '',
      thumbnailUrl: course[0].thumbnailUrl,
      basePrice: data.price,
      baseCurrency: data.currency,
    });

    await db.update(courses).set({ contentGroupId: course[0].id }).where(eq(courses.id, course[0].id));

    // Create empty course framework for topic management
    await db.insert(courseFrameworks).values({
      courseId: course[0].id,
      organizationId: data.organizationId,
      topics: [],
    });

    try {
      await TranslationIndexService.enqueueForCourseMutation({
        courseId: course[0].id,
        organizationId: data.organizationId,
        eventType: 'create',
        dedupeSeed: `${course[0].id}:create`,
      });
    } catch (indexError: any) {
      console.error('[CourseService] Failed to enqueue translation index job on create:', indexError?.message || indexError);
    }

    console.log(`Course created: ${course[0].title} (${course[0].id})`);
    return { ...course[0], contentGroupId: course[0].id };
  }

  /**
   * Update course details (not prices - those are version-specific)
   */
  static async updateCourse(
    courseId: string,
    updates: Partial<InsertCourse>,
    organizationId: string
  ): Promise<Course> {
    // Strip legacy scope fields - scope is now managed via courseAssignments
    const { unitId, subUnitId, teamId, ...allowedUpdates } = updates as any;

    const updated = await db.update(courses)
      .set({
        ...allowedUpdates,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(courses.id, courseId),
          eq(courses.organizationId, organizationId)
        )
      )
      .returning();

    if (!updated.length) {
      throw new Error('Course not found or unauthorized');
    }

    try {
      await TranslationIndexService.enqueueForCourseMutation({
        courseId,
        organizationId,
        eventType: 'update',
        dedupeSeed: `${courseId}:${updated[0].updatedAt?.toISOString?.() || ''}:update`,
      });
    } catch (indexError: any) {
      console.error('[CourseService] Failed to enqueue translation index job on update:', indexError?.message || indexError);
    }

    console.log(`Course updated: ${courseId}`);
    return updated[0];
  }

  /**
   * Link a lesson to a course with ordering
   * Also inherits course department/unit settings to the lesson if not already set
   */
  static async linkLessonToCourse(
    courseId: string,
    lessonId: string,
    topicName: string,
    orderIndex: number,
    organizationId: string,
    replacePreviousLessonId?: string,
    topicId?: string
  ): Promise<CourseLesson> {
    const course = await db.query.courses.findFirst({
      where: and(
        eq(courses.id, courseId),
        eq(courses.organizationId, organizationId)
      ),
    });

    if (!course) {
      throw new Error('Course not found or unauthorized');
    }
    
    // Inherit course department/unit to lesson if lesson doesn't have them
    const lesson = await db.query.lessons.findFirst({
      where: and(
        eq(lessons.id, lessonId),
        eq(lessons.organizationId, organizationId)
      ),
    });
    
    if (lesson) {
      const lessonUpdate: Record<string, any> = {};
      
      // Get course scope from courseAssignments (single source of truth)
      const courseAssignment = await db.query.courseAssignments.findFirst({
        where: eq(courseAssignments.courseId, courseId),
      });
      
      // Fetch course unit name if lesson doesn't have department
      if (!lesson.department && courseAssignment?.unitId) {
        const unit = await db.query.organizationUnits.findFirst({
          where: eq(organizationUnits.id, courseAssignment.unitId),
        });
        if (unit) {
          lessonUpdate.department = unit.name;
        }
      }
      
      // Fetch course sub-unit name if lesson doesn't have unit
      if (!lesson.unit && courseAssignment?.subUnitId) {
        const subUnit = await db.query.organizationSubUnits.findFirst({
          where: eq(organizationSubUnits.id, courseAssignment.subUnitId),
        });
        if (subUnit) {
          lessonUpdate.unit = subUnit.name;
        }
      }
      
      // Apply inheritance if any updates
      if (Object.keys(lessonUpdate).length > 0) {
        await db.update(lessons)
          .set({ ...lessonUpdate, updatedAt: new Date() })
          .where(eq(lessons.id, lessonId));
        console.log(`[CourseService] Lesson ${lessonId} inherited course context:`, lessonUpdate);
      }
    }

    // STEP 1: Validate framework and find matching topic FIRST
    const framework = await db.query.courseFrameworks.findFirst({
      where: eq(courseFrameworks.courseId, courseId),
    });

    if (!framework) {
      throw new Error('FRAMEWORK_MISSING: Course framework not found. Please create course topics first.');
    }

    const topics = (framework.topics as any[]) || [];
    
    // Match topic by stable ID in strict mode to prevent cross-topic linkage.
    // Legacy fallback path remains available when strict mode is disabled.
    const strictTopicMatching = isFeatureEnabled('CF_V2_ASSIGNMENT_ENFORCED');
    let matchingTopicIndex = -1;
    
    if (topicId) {
      matchingTopicIndex = topics.findIndex((t: any) => t.id === topicId);
    }

    if (strictTopicMatching) {
      if (!topicId) {
        throw new Error('TOPIC_ID_REQUIRED: topicId is required for lesson linking in strict mode');
      }
      if (matchingTopicIndex === -1) {
        throw new Error(`TOPIC_NOT_FOUND: Topic id "${topicId}" not found in course framework`);
      }
    } else {
      if (matchingTopicIndex === -1 && topicName) {
        matchingTopicIndex = topics.findIndex((t: any) => t.name === topicName);
      }
      if (matchingTopicIndex === -1) {
        // Legacy fallback: match by order position
        matchingTopicIndex = topics.findIndex((t: any) => t.order === orderIndex);
      }
    }

    if (matchingTopicIndex === -1) {
      throw new Error(`TOPIC_NOT_FOUND: No topic found matching "${topicName}" (id: ${topicId || 'N/A'}, order: ${orderIndex}) in course framework`);
    }

    const matchingTopic = topics[matchingTopicIndex];
    const matchingTopicType = String((matchingTopic as any)?.lessonType || '').toLowerCase();
    const linkLessonType: 'overview' | 'content' | 'key_takeaways' =
      matchingTopicType === 'overview' || (matchingTopic as any)?.isOverview === true
        ? 'overview'
        : matchingTopicType === 'key_takeaways'
          ? 'key_takeaways'
          : 'content';

    // STEP 2: If replacing a previous lesson, remove its courseLessons entry first
    if (replacePreviousLessonId) {
      await db.delete(courseLessons)
        .where(and(
          eq(courseLessons.courseId, courseId),
          eq(courseLessons.lessonId, replacePreviousLessonId)
        ));
      console.log(`Removed previous lesson link: ${replacePreviousLessonId} from course ${courseId}`);
    }

    // STEP 3: Check for existing link
    const existing = await db.query.courseLessons.findFirst({
      where: and(
        eq(courseLessons.courseId, courseId),
        eq(courseLessons.lessonId, lessonId)
      ),
    });

    if (existing) {
      // Update framework even for existing links to close gap where JSON was empty
      if (matchingTopic.lessonId !== lessonId) {
        matchingTopic.lessonId = lessonId;
        await db.update(courseFrameworks)
          .set({ topics: topics as any })
          .where(eq(courseFrameworks.id, framework.id));
        console.log(`Updated framework for existing link: ${lessonId} → topic ${orderIndex}`);
      }
      return existing;
    }

    // STEP 3: Insert courseLessons row (safe now, validation passed)
    let linked: CourseLesson[] = [];
    try {
      linked = await db.insert(courseLessons).values({
        courseId,
        lessonId,
        topicId: matchingTopic.id, // Store topic ID for stable matching
        topicName: matchingTopic.name || topicName,
        topicOrder: matchingTopic.order ?? orderIndex,
        lessonType: linkLessonType,
      }).returning();

      // STEP 4: Update framework JSONB with lessonId
      matchingTopic.lessonId = lessonId;
      matchingTopic.lessonType = linkLessonType;
      matchingTopic.isOverview = linkLessonType === 'overview';
      await db.update(courseFrameworks)
        .set({ topics: topics as any })
        .where(eq(courseFrameworks.id, framework.id));

      console.log(`Lesson linked to course: ${courseId} → ${lessonId} (topic ${orderIndex}: ${topicName})`);
      return linked[0];
    } catch (error) {
      // Rollback: If framework update failed after insert, delete the inserted row
      if (linked.length > 0) {
        await db.delete(courseLessons)
          .where(eq(courseLessons.id, linked[0].id));
        console.error(`Rolled back courseLessons insert after framework update failure`);
      }
      throw error;
    }
  }

  /**
   * Get course with all its lessons ordered by topicName and orderIndex
   */
  static async getCourseWithLessons(courseId: string): Promise<CourseWithLessons | null> {
    const course = await db.query.courses.findFirst({
      where: eq(courses.id, courseId),
    });

    if (!course) {
      return null;
    }

    const linkedLessons = await db.query.courseLessons.findMany({
      where: eq(courseLessons.courseId, courseId),
      with: {
        lesson: true,
      },
      orderBy: [courseLessons.topicName, courseLessons.topicOrder],
    });

    const latestVersion = await db.query.courseVersions.findFirst({
      where: eq(courseVersions.courseId, courseId),
      orderBy: [desc(courseVersions.createdAt)],
    });

    return {
      ...course,
      lessons: linkedLessons as any,
      latestVersion,
    };
  }

  /**
   * Get course with full details for public display
   * - Includes lessons, version info, reviews summary
   * - Calculates user access using centralized CourseVisibilityService
   * - Used by CourseDetail page for both anonymous and authenticated users
   */
  static async getCourseWithDetails(
    courseId: string,
    userId?: string,
    sessionContext?: SessionContext | null
  ): Promise<{
    id: string;
    title: string;
    description: string;
    category: string;
    difficultyLevel: string;
    currency: string;
    price: string;
    isPaid: boolean;
    imageUrl?: string;
    thumbnailUrl?: string;
    averageRating: string;
    totalReviews: number;
    totalEnrollments: number;
    organizationId: string;
    organizationName?: string | null;
    organizationLogoUrl?: string | null;
    organizationType: 'education' | 'business' | 'elearning' | null;
    status: string;
    visibility: CourseVisibility;
    categoryId?: string | null;
    unitId?: string | null;
    subUnitId?: string | null;
    publishedAt?: Date;
    isPublished: boolean;
    latestVersion: {
      id: string;
      versionNumber: string;
      releaseNotes?: string;
    };
    lessons: Array<{
      id: string;
      lessonId: string;
      topicName: string;
      topicOrder: number;
      completed: boolean;
      lesson: {
        id: string;
        title: string;
        description?: string;
        isDemoLesson?: boolean;
        learningObjectives?: Array<{id: string; objective: string; bloomLevel: string}>;
        bloomLevels?: string[];
      };
    }>;
    hasAccess: boolean;
    hasPurchased: boolean;
    accessReason: 'owner' | 'org_member' | 'purchased' | 'public_free' | 'superadmin' | 'none';
    userProgress?: {
      completedLessons: number;
      totalLessons: number;
    };
  } | null> {
    await this.selfHealDuplicateCourseLessons(courseId);
    await this.syncCourseLessonOrderFromFramework(courseId);

    const course = await db.query.courses.findFirst({
      where: eq(courses.id, courseId),
    });

    if (!course) {
      return null;
    }

    // Get category name from courseCategories table
    let categoryName = 'General';
    if (course.categoryId) {
      const category = await db.query.courseCategories.findFirst({
        where: eq(courseCategories.id, course.categoryId),
      });
      if (category) {
        categoryName = category.name;
      }
    }

    // Get course scope from courseAssignments (single source of truth)
    const courseAssignment = await db.query.courseAssignments.findFirst({
      where: eq(courseAssignments.courseId, courseId),
    });

    // Get linked lessons with ordering
    const linkedLessons = await db.query.courseLessons.findMany({
      where: eq(courseLessons.courseId, courseId),
      with: {
        lesson: true,
      },
      orderBy: [asc(courseLessons.topicOrder)],
    });

    // Get latest version
    const latestVersion = await db.query.courseVersions.findFirst({
      where: eq(courseVersions.courseId, courseId),
      orderBy: [desc(courseVersions.createdAt)],
    });

    // Get course framework for learning objectives
    const framework = await db.query.courseFrameworks.findFirst({
      where: eq(courseFrameworks.courseId, courseId),
    });
    const frameworkTopics = (framework?.topics as any[]) || [];

    // Get review stats - batch-fetch to avoid N+1
    const reviewStats = await db
      .select({
        avgRating: sql<string>`coalesce(avg(${courseReviews.rating}::numeric), 0)::text`,
        totalReviews: sql<number>`count(*)::int`,
      })
      .from(courseReviews)
      .where(and(
        eq(courseReviews.courseId, courseId),
        eq(courseReviews.isVisible, true)
      ));

    const avgRating = reviewStats[0]?.avgRating || '0';
    const totalReviews = reviewStats[0]?.totalReviews || 0;

    // Determine if course is paid
    const isPaid = parseFloat(course.price || '0') > 0;

    // Use centralized visibility service to check access
    const accessResult = await CourseVisibilityService.checkCourseAccess(
      courseId,
      userId || null,
      sessionContext || null
    );

    const hasAccess = accessResult.hasAccess;
    const accessReason = accessResult.accessReason;
    const visibility = accessResult.visibility;

    // Build lesson completion map based on quiz passes with fallback to userCourseLessonProgress (only for authenticated users)
    const lessonCompletionMap = new Map<string, boolean>();
    let userProgress = undefined;
    
    if (userId && linkedLessons.length > 0) {
      // Get all lesson IDs in this course
      const lessonIds = linkedLessons.map(cl => cl.lessonId);
      
      // Query lessonQuizLinks to find which quiz is linked to each lesson
      const quizLinks = await db.query.lessonQuizLinks.findMany({
        where: inArray(lessonQuizLinks.lessonId, lessonIds),
      });
      
      // Build map of lessonId -> quizId (use primary quiz if multiple, otherwise first)
      const lessonToQuizMap = new Map<string, string>();
      for (const link of quizLinks) {
        // Prefer primary quiz, otherwise use first linked quiz
        if (!lessonToQuizMap.has(link.lessonId) || link.isPrimary) {
          lessonToQuizMap.set(link.lessonId, link.quizId);
        }
      }
      
      // Get all quiz IDs linked to lessons in this course
      const quizIds = Array.from(new Set(quizLinks.map(link => link.quizId)));
      
      // Query userQuizProgress to check which quizzes the user passed
      let passedQuizIds = new Set<string>();
      if (quizIds.length > 0) {
        const progressRecords = await db.query.userQuizProgress.findMany({
          where: and(
            eq(userQuizProgress.userId, userId),
            inArray(userQuizProgress.collectionId, quizIds),
            eq(userQuizProgress.isPassed, true)
          ),
        });
        passedQuizIds = new Set(progressRecords.map(p => p.collectionId));
      }
      
      // FALLBACK: Query userCourseLessonProgress for lessons without quizzes or as backup
      // Use latest course version for querying
      const latestCourseVersion = latestVersion?.id || '';
      let completedLessonsFromProgress = new Set<string>();
      if (latestCourseVersion) {
        const progressRecords = await db.query.userCourseLessonProgress.findMany({
          where: and(
            eq(userCourseLessonProgress.userId, userId),
            eq(userCourseLessonProgress.courseId, courseId),
            eq(userCourseLessonProgress.courseVersionId, latestCourseVersion),
            inArray(userCourseLessonProgress.lessonId, lessonIds),
            isNotNull(userCourseLessonProgress.completedAt) // Only lessons with completedAt set
          ),
        });
        completedLessonsFromProgress = new Set(progressRecords.map(p => p.lessonId));
      }
      
      // Build completion map: lesson is completed if EITHER:
      // 1. Its linked quiz was passed (PRIMARY for lessons with quizzes), OR
      // 2. It has a completion record with completedAt set (for lessons without quizzes)
      // Note: Lessons without quizzes require explicit completion (user must view them)
      for (const cl of linkedLessons) {
        const quizId = lessonToQuizMap.get(cl.lessonId);
        const quizPassed = quizId ? passedQuizIds.has(quizId) : false;
        const hasCompletionRecord = completedLessonsFromProgress.has(cl.lessonId);
        const isCompleted = quizPassed || hasCompletionRecord;
        lessonCompletionMap.set(cl.lessonId, isCompleted);
      }
      
      // Find the minimum topicOrder (overview lesson) to exclude from progress calculation
      // Overview lessons are informational and should not count toward completion requirements
      const minTopicOrder = linkedLessons.length > 0 
        ? Math.min(...linkedLessons.map(cl => cl.topicOrder))
        : 0;
      
      // Filter out overview lessons from progress calculation
      const nonOverviewLessons = linkedLessons.filter(cl => cl.topicOrder !== minTopicOrder);
      
      // Calculate progress from quiz passes OR completion records (excluding overview)
      const completedCount = nonOverviewLessons.filter(cl => 
        lessonCompletionMap.get(cl.lessonId) === true
      ).length;
      
      // Handle edge case: course with only overview lesson = 100% complete
      userProgress = {
        completedLessons: completedCount,
        totalLessons: nonOverviewLessons.length,
      };
    }

    // Mark first lesson as demo for non-owners, and add learning objectives from framework
    const formattedLessons = linkedLessons.map((cl, index) => {
      // Find matching topic from framework by topicId first, then lessonId fallback
      const matchingTopic = frameworkTopics.find((t: any) => 
        (cl.topicId && t.id === cl.topicId) || t.lessonId === cl.lessonId
      );
      
      // Extract learning objectives from the matching topic
      const learningObjectives = matchingTopic?.learningObjectives as Array<{id: string; objective: string; bloomLevel: string}> | undefined;
      
      // Extract unique bloom levels from learning objectives
      const bloomLevels = learningObjectives && learningObjectives.length > 0
        ? Array.from(new Set(learningObjectives.map((lo: any) => lo.bloomLevel)))
        : undefined;

      // Get completion status from the map (false for unauthenticated users)
      const completed = lessonCompletionMap.get(cl.lessonId) || false;

      return {
        id: cl.id,
        lessonId: cl.lessonId,
        topicName: cl.topicName,
        topicOrder: cl.topicOrder,
        completed,
        lesson: {
          id: cl.lesson.id,
          title: cl.lesson.title,
          description: cl.lesson.description || undefined,
          isDemoLesson: index === 0, // First lesson is always the demo
          learningObjectives: learningObjectives && learningObjectives.length > 0 ? learningObjectives : undefined,
          bloomLevels,
        },
      };
    });

    // Calculate total enrollments
    const enrollmentCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(userCourseEnrollments)
      .where(eq(userCourseEnrollments.courseId, courseId));
    const totalEnrollments = enrollmentCountResult[0]?.count || 0;

    // Get organization details and branding theme
    const [organization, brandingTheme] = await Promise.all([
      db.query.organizations.findFirst({
        where: eq(organizations.id, course.organizationId),
      }),
      db.query.brandingThemes.findFirst({
        where: eq(brandingThemes.organizationId, course.organizationId),
      }),
    ]);
    
    const organizationName = brandingTheme?.orgName || organization?.name || null;
    const organizationLogoUrl = brandingTheme?.logoUrl || null;

    return {
      id: course.id,
      title: course.title,
      description: course.description || '',
      category: categoryName,
      difficultyLevel: course.difficultyLevel || 'Intermediate',
      currency: course.currency,
      price: course.price || '0',
      isPaid,
      imageUrl: course.thumbnailUrl || undefined,
      thumbnailUrl: course.thumbnailUrl || undefined,
      averageRating: avgRating,
      totalReviews,
      totalEnrollments,
      organizationId: course.organizationId,
      organizationName,
      organizationLogoUrl,
      organizationType: accessResult.courseOrgType,
      status: course.status,
      visibility,
      categoryId: course.categoryId || null,
      unitId: courseAssignment?.unitId || null,
      subUnitId: courseAssignment?.subUnitId || null,
      publishedAt: latestVersion?.publishedAt || undefined,
      isPublished: course.status === 'active',
      latestVersion: latestVersion ? {
        id: latestVersion.id,
        versionNumber: latestVersion.versionNumber,
        releaseNotes: latestVersion.description || undefined,
      } : {
        id: '',
        versionNumber: '1.0',
        releaseNotes: undefined,
      },
      lessons: formattedLessons,
      hasAccess,
      hasPurchased: accessReason === 'purchased',
      accessReason,
      userProgress,
    };
  }

  /**
   * Search courses with filters (public courses only, or org-specific for admin)
   * PUBLIC ACCESS: Only published (active) courses from elearning organizations
   * ADMIN ACCESS: All courses within their organization
   * Returns enriched data with signed thumbnail URLs and purchase status
   */
  static async searchCourses(params: {
    searchQuery?: string;
    category?: string;
    difficultyLevel?: string;
    organizationId?: string;
    currency?: string;
    minPrice?: string;
    maxPrice?: string;
    status?: 'active' | 'inactive' | 'archived' | 'draft';
    visibility?: string;
    limit?: number;
    offset?: number;
    departmentId?: string;
    unitId?: string;
    teamId?: string;
    userPreferredLanguage?: string;
    orgDefaultLanguage?: string;
  }): Promise<{ courses: any[]; total: number }> {
    const {
      searchQuery,
      category,
      difficultyLevel,
      organizationId,
      status,
      visibility,
      limit = 20,
      offset = 0,
      departmentId,
      unitId,
      teamId,
      userPreferredLanguage,
      orgDefaultLanguage,
    } = params;

    const conditions = [];
    const isPublicAccess = !organizationId;

    if (organizationId) {
      conditions.push(eq(courses.organizationId, organizationId));
      if (status) {
        conditions.push(eq(courses.status, status));
      }
      if (visibility && visibility !== 'all') {
        conditions.push(eq(courses.visibility, visibility as 'public' | 'org_only'));
      }
    } else {
      // Public access: show public active courses from ANY organization (unified org model)
      // All orgs can now create public courses for the marketplace
      conditions.push(eq(courses.visibility, 'public'));
      conditions.push(eq(courses.status, 'active'));
    }

    if (searchQuery) {
      const lessonMatchSubquery = db
        .select({ courseId: courseLessons.courseId })
        .from(courseLessons)
        .innerJoin(lessons, eq(courseLessons.lessonId, lessons.id))
        .where(and(
          eq(courseLessons.courseId, courses.id),
          or(
            ilike(lessons.title, `%${searchQuery}%`),
            ilike(lessons.inputText, `%${searchQuery}%`)
          )
        ));

      conditions.push(
        or(
          ilike(courses.title, `%${searchQuery}%`),
          ilike(courses.description, `%${searchQuery}%`),
          exists(lessonMatchSubquery)
        )!
      );
    }

    if (category) {
      conditions.push(eq(courses.categoryId, category));
    }

    // Filter by scope using courseAssignments (single source of truth)
    // Use subqueries to get course IDs assigned to the scope
    if (departmentId) {
      const assignedCourseIds = db
        .select({ courseId: courseAssignments.courseId })
        .from(courseAssignments)
        .where(eq(courseAssignments.unitId, departmentId));
      conditions.push(inArray(courses.id, assignedCourseIds));
    }

    if (unitId) {
      const assignedCourseIds = db
        .select({ courseId: courseAssignments.courseId })
        .from(courseAssignments)
        .where(eq(courseAssignments.subUnitId, unitId));
      conditions.push(inArray(courses.id, assignedCourseIds));
    }

    if (teamId) {
      const assignedCourseIds = db
        .select({ courseId: courseAssignments.courseId })
        .from(courseAssignments)
        .where(eq(courseAssignments.teamId, teamId));
      conditions.push(inArray(courses.id, assignedCourseIds));
    }

    if (difficultyLevel) {
      conditions.push(eq(courses.difficultyLevel, difficultyLevel as any));
    }

    if (userPreferredLanguage || orgDefaultLanguage) {
      const effectiveStatus = status || (isPublicAccess ? 'active' : null);
      const statusFilter = effectiveStatus
        ? sql` AND c2."status" = ${effectiveStatus}`
        : sql``;

      const langPriority = sql`CASE 
        WHEN ${courses.languageCode} = ${userPreferredLanguage || 'en'} THEN 1
        WHEN ${courses.languageCode} = ${orgDefaultLanguage || 'en'} THEN 2
        WHEN ${courses.isDefaultLanguage} = true THEN 3
        ELSE 4
      END`;

      conditions.push(
        or(
          isNull(courses.contentGroupId),
          eq(
            langPriority,
            sql`(SELECT MIN(CASE 
              WHEN c2."languageCode" = ${userPreferredLanguage || 'en'} THEN 1
              WHEN c2."languageCode" = ${orgDefaultLanguage || 'en'} THEN 2
              WHEN c2."isDefaultLanguage" = true THEN 3
              ELSE 4
            END) FROM courses c2 WHERE c2."contentGroupId" = ${courses.contentGroupId}${statusFilter})`
          )
        )!
      );
    }

    // Fetch courses with organization type for proper display logic
    let foundCourses: (typeof courses.$inferSelect & { organizationType?: 'education' | 'business' | 'elearning'; organizationName?: string | null })[];
    if (isPublicAccess) {
      const results = await db
        .select({
          course: courses,
          orgType: organizations.type,
          orgName: organizations.name,
        })
        .from(courses)
        .innerJoin(organizations, eq(courses.organizationId, organizations.id))
        .where(and(...conditions))
        .orderBy(desc(courses.createdAt))
        .limit(limit)
        .offset(offset);
      
      foundCourses = results.map(r => ({
        ...r.course,
        organizationType: r.orgType as 'education' | 'business' | 'elearning',
        organizationName: r.orgName,
      }));
    } else {
      // For admin access, also join with organizations to get type
      const results = await db
        .select({
          course: courses,
          orgType: organizations.type,
          orgName: organizations.name,
        })
        .from(courses)
        .innerJoin(organizations, eq(courses.organizationId, organizations.id))
        .where(and(...conditions))
        .orderBy(desc(courses.createdAt))
        .limit(limit)
        .offset(offset);
      
      foundCourses = results.map(r => ({
        ...r.course,
        organizationType: r.orgType as 'education' | 'business' | 'elearning',
        organizationName: r.orgName,
      }));
    }

    // For count, also use join for public access
    let countResult;
    if (isPublicAccess) {
      countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(courses)
        .innerJoin(organizations, eq(courses.organizationId, organizations.id))
        .where(and(...conditions));
    } else {
      countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(courses)
        .where(and(...conditions));
    }

    // Batch-fetch purchase counts for all courses (N+1 prevention)
    const courseIds = foundCourses.map(c => c.id);
    const purchaseCounts = courseIds.length > 0 ? await db
      .select({
        courseId: coursePurchases.courseId,
        count: sql<number>`count(*)::int`,
      })
      .from(coursePurchases)
      .where(and(
        inArray(coursePurchases.courseId, courseIds),
        eq(coursePurchases.status, 'completed')
      ))
      .groupBy(coursePurchases.courseId) : [];

    const purchaseCountMap = new Map(purchaseCounts.map(p => [p.courseId, p.count]));

    // Enrich courses with signed thumbnail URLs and purchase status
    const enrichedCourses = await Promise.all(foundCourses.map(async (course) => {
      let thumbnailSignedUrl: string | undefined;
      
      // Generate signed URL for thumbnail if it exists
      if (course.thumbnailUrl) {
        try {
          thumbnailSignedUrl = await objectStorageService.getCourseThumbnailSignedURL(
            course.thumbnailUrl,
            3600 // 1 hour TTL
          );
        } catch (error) {
          console.error(`[CourseService] Failed to get signed URL for thumbnail: ${course.thumbnailUrl}`, error);
          thumbnailSignedUrl = undefined;
        }
      }

      const purchaseCount = purchaseCountMap.get(course.id) || 0;

      return {
        ...course,
        thumbnailSignedUrl,
        hasPurchases: purchaseCount > 0,
        purchaseCount,
      };
    }));

    return {
      courses: enrichedCourses,
      total: Number(countResult[0]?.count || 0),
    };
  }

  /**
   * Set course status (active/inactive/archived)
   */
  static async setCourseStatus(
    courseId: string,
    status: 'active' | 'inactive' | 'archived',
    organizationId: string
  ): Promise<Course> {
    const updated = await db.update(courses)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(courses.id, courseId),
          eq(courses.organizationId, organizationId)
        )
      )
      .returning();

    if (!updated.length) {
      throw new Error('Course not found or unauthorized');
    }

    console.log(`Course status updated: ${courseId} -> ${status}`);
    return updated[0];
  }

  /**
   * Get course by ID with org validation
   */
  static async getCourseById(courseId: string, organizationId?: string): Promise<Course | null> {
    const conditions = [eq(courses.id, courseId)];
    
    if (organizationId) {
      conditions.push(eq(courses.organizationId, organizationId));
    }

    return await db.query.courses.findFirst({
      where: and(...conditions),
    }) || null;
  }

  /**
   * Get all courses for an organization
   */
  static async getOrganizationCourses(organizationId: string): Promise<Course[]> {
    return await db.query.courses.findMany({
      where: eq(courses.organizationId, organizationId),
      orderBy: [desc(courses.createdAt)],
    });
  }

  /**
   * Delete a course (only if no enrollments)
   */
  static async deleteCourse(courseId: string, organizationId: string): Promise<void> {
    const course = await db.query.courses.findFirst({
      where: and(
        eq(courses.id, courseId),
        eq(courses.organizationId, organizationId)
      ),
    });

    if (!course) {
      throw new Error('Course not found or unauthorized');
    }

    // Check if course has active enrollments
    const enrollmentCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(userCourseEnrollments)
      .where(eq(userCourseEnrollments.courseId, courseId));
    const totalEnrollments = enrollmentCountResult[0]?.count || 0;

    if (totalEnrollments > 0) {
      throw new Error('Cannot delete course with active enrollments');
    }

    await db.delete(courseLessons).where(eq(courseLessons.courseId, courseId));
    await db.delete(courseVersions).where(eq(courseVersions.courseId, courseId));
    await db.delete(courses).where(eq(courses.id, courseId));

    console.log(`Course deleted: ${courseId}`);
  }

  /**
   * Repair orphaned lesson links in course framework
   * This fixes lessons that were generated but not properly linked due to the linking bug
   * Matches courseLessons entries to framework topics and updates topic.lessonId
   * 
   * Matching strategy (priority order):
   * 1. topicId match (most reliable - stable identifier)
   * 2. topicName match (lesson title vs topic name)
   * 3. topicOrder match (position-based fallback)
   * 
   * Edge cases handled:
   * - Skips archived lessons
   * - Skips topics with previousLessonId (intentionally unlinked)
   * - Prefers most recent completed lesson if multiple matches (by updatedAt desc)
   * - Logs conflicts when multiple lessons match a topic
   */
  static async repairOrphanedLessonLinks(courseId: string): Promise<{ repaired: number; skipped: number; unresolved: number }> {
    const framework = await db.query.courseFrameworks.findFirst({
      where: eq(courseFrameworks.courseId, courseId),
    });

    if (!framework) {
      return { repaired: 0, skipped: 0, unresolved: 0 };
    }

    const topics = (framework.topics || []) as Array<{
      id?: string;
      name?: string;
      order?: number;
      lessonId?: string | null;
      previousLessonId?: string | null;
      [key: string]: any;
    }>;

    // Get all courseLessons entries for this course with their lesson details
    // Include topicId for stable matching and createdAt for conflict resolution
    const courseLinkedLessons = await db
      .select({
        id: courseLessons.id,
        lessonId: courseLessons.lessonId,
        topicId: courseLessons.topicId, // Stable identifier for matching
        topicName: courseLessons.topicName,
        topicOrder: courseLessons.topicOrder,
        lessonTitle: lessons.title,
        lessonStatus: lessons.generationStatus,
        lessonArchived: lessons.isArchived,
        linkCreatedAt: courseLessons.createdAt,
      })
      .from(courseLessons)
      .innerJoin(lessons, eq(courseLessons.lessonId, lessons.id))
      .where(eq(courseLessons.courseId, courseId));

    // Filter to only completed, non-archived lessons and sort by link createdAt desc
    // This ensures we prefer the most recently linked lesson in case of conflicts
    const eligibleLessons = courseLinkedLessons
      .filter(cl => !cl.lessonArchived)
      .filter(cl => cl.lessonStatus === 'completed')
      .sort((a, b) => {
        const aDate = a.linkCreatedAt ? new Date(a.linkCreatedAt).getTime() : 0;
        const bDate = b.linkCreatedAt ? new Date(b.linkCreatedAt).getTime() : 0;
        return bDate - aDate; // Most recently linked first
      });

    // Track which lessonIds have already been used to prevent double-linking
    const usedLessonIds = new Set<string>();
    
    let repaired = 0;
    let skipped = 0;
    let unresolved = 0;
    let needsUpdate = false;

    for (const topic of topics) {
      // Skip if topic already has a lessonId
      if (topic.lessonId) {
        usedLessonIds.add(topic.lessonId);
        continue;
      }

      // Skip if topic was intentionally unlinked (has previousLessonId marker)
      if (topic.previousLessonId) {
        skipped++;
        continue;
      }

      // Find all matching courseLesson entries using priority matching
      // Exclude lessons that have already been used
      const available = eligibleLessons.filter(cl => !usedLessonIds.has(cl.lessonId));

      // Priority 1: Match by topicId (most stable - survives name changes and reordering)
      let matches = topic.id 
        ? available.filter(cl => cl.topicId && cl.topicId === topic.id)
        : [];
      let matchMethod = 'topicId';

      // Priority 2: Exact match by topicName (for legacy records without topicId)
      if (matches.length === 0 && topic.name) {
        matches = available.filter(cl => cl.topicName && cl.topicName === topic.name);
        matchMethod = 'topicName';
      }

      // Priority 3: Match by lessonTitle (lesson title vs topic name)
      if (matches.length === 0 && topic.name) {
        matches = available.filter(cl => cl.lessonTitle && cl.lessonTitle === topic.name);
        matchMethod = 'lessonTitle';
      }

      // Priority 4: Fallback to order position - BUT only if names don't conflict
      // This guards against mis-linking after topic reordering
      if (matches.length === 0 && topic.order !== null && topic.order !== undefined) {
        const orderMatches = available.filter(cl => 
          cl.topicOrder !== null && cl.topicOrder !== undefined && cl.topicOrder === topic.order
        );
        // Only use order match if the lesson's topicName is also unmatched elsewhere
        // (i.e., no other topic has claimed this lesson by name)
        if (orderMatches.length === 1) {
          const candidate = orderMatches[0];
          const candidateNameClaimedByOtherTopic = topics.some(t => 
            t !== topic && 
            !t.lessonId && 
            t.name && 
            (t.name === candidate.topicName || t.name === candidate.lessonTitle)
          );
          if (!candidateNameClaimedByOtherTopic) {
            matches = orderMatches;
            matchMethod = 'order';
          } else {
            console.log(`[RepairLinks] Skipping order match for topic "${topic.name}" - lesson "${candidate.lessonTitle}" may belong to different topic by name`);
            unresolved++;
          }
        } else if (orderMatches.length > 1) {
          console.log(`[RepairLinks] Skipping order match for topic "${topic.name}" - multiple order conflicts (${orderMatches.length})`);
          unresolved++;
        }
      }

      // Log conflicts if multiple matches found
      if (matches.length > 1) {
        console.log(`[RepairLinks] Multiple matches (${matches.length}) for topic "${topic.name}" (order: ${topic.order}). Using most recently linked: ${matches[0].lessonId}`);
      }

      // Use the first match (most recently linked due to sorting)
      if (matches.length > 0) {
        const matchingLesson = matches[0];
        topic.lessonId = matchingLesson.lessonId;
        usedLessonIds.add(matchingLesson.lessonId);
        repaired++;
        needsUpdate = true;
        
        // Backfill topicId on the courseLessons row if missing (stabilizes legacy records)
        if (!matchingLesson.topicId && topic.id) {
          await db.update(courseLessons)
            .set({ topicId: topic.id })
            .where(eq(courseLessons.id, matchingLesson.id));
          console.log(`[RepairLinks] Backfilled topicId ${topic.id} for courseLesson ${matchingLesson.id}`);
        }
        
        console.log(`[RepairLinks] Linked lesson ${matchingLesson.lessonId} to topic "${topic.name}" (matched by: ${matchMethod})`);
      }
    }

    // Save updated framework if any repairs were made
    if (needsUpdate) {
      await db.update(courseFrameworks)
        .set({ topics: topics as any })
        .where(eq(courseFrameworks.id, framework.id));
      console.log(`[RepairLinks] Repaired ${repaired} orphaned lesson links for course ${courseId}`);
    }

    return { repaired, skipped, unresolved };
  }

  /**
   * Repair duplicate lesson links - detects when a topic links to a pending placeholder
   * but a completed lesson with the same title exists (orphaned).
   * Updates framework and courseLessons to point to the completed lesson.
   * 
   * This fixes issues where lesson generation created new records instead of 
   * updating existing placeholders.
   */
  static async repairDuplicateLessonLinks(courseId: string): Promise<{ repaired: number; skipped: number }> {
    const framework = await db.query.courseFrameworks.findFirst({
      where: eq(courseFrameworks.courseId, courseId),
    });

    if (!framework) {
      return { repaired: 0, skipped: 0 };
    }

    const course = await db.query.courses.findFirst({
      where: eq(courses.id, courseId),
    });
    if (!course) {
      return { repaired: 0, skipped: 0 };
    }

    const topics = (framework.topics || []) as Array<{
      id?: string;
      name?: string;
      order?: number;
      lessonId?: string | null;
      [key: string]: any;
    }>;

    // Get all courseLessons for this course with lesson details
    const courseLinksWithLessons = await db
      .select({
        linkId: courseLessons.id,
        lessonId: courseLessons.lessonId,
        topicId: courseLessons.topicId,
        topicName: courseLessons.topicName,
        topicOrder: courseLessons.topicOrder,
        lessonTitle: lessons.title,
        lessonStatus: lessons.generationStatus,
        lessonArchived: lessons.isArchived,
        lessonHasPresentation: lessons.presentationUrl,
      })
      .from(courseLessons)
      .innerJoin(lessons, eq(courseLessons.lessonId, lessons.id))
      .where(eq(courseLessons.courseId, courseId));

    // Build lookup map for linked lessons in THIS course
    const courseLinkByLessonId = new Map(courseLinksWithLessons.map(cl => [cl.lessonId, cl]));

    // Get ALL lessons linked to ANY course in the entire courseLessons table
    const allLinkedLessons = await db
      .select({ lessonId: courseLessons.lessonId })
      .from(courseLessons);
    const allLinkedLessonIds = new Set(allLinkedLessons.map(l => l.lessonId));

    // Get all lessons in same organization to find orphaned completed lessons
    const allOrgLessons = await db.query.lessons.findMany({
      where: eq(lessons.organizationId, course.organizationId),
    });

    // Build map of orphaned completed lessons by title (not linked to ANY course)
    const orphanedByTitle = new Map<string, typeof allOrgLessons>();
    for (const lesson of allOrgLessons) {
      if (lesson.generationStatus !== 'completed') continue;
      if (lesson.isArchived) continue;
      if (!lesson.presentationUrl) continue;
      if (allLinkedLessonIds.has(lesson.id)) continue; // Already linked to some course
      
      const existing = orphanedByTitle.get(lesson.title) || [];
      existing.push(lesson);
      orphanedByTitle.set(lesson.title, existing);
    }

    let repaired = 0;
    let skipped = 0;
    let needsUpdate = false;

    for (const topic of topics) {
      if (!topic.lessonId) {
        continue; // No lesson linked, skip
      }

      const linkedInfo = courseLinkByLessonId.get(topic.lessonId);
      if (!linkedInfo) {
        continue; // This lesson isn't in courseLessons for this course
      }

      // Only fix pending/failed lessons - completed ones are fine
      if (linkedInfo.lessonStatus === 'completed') {
        continue;
      }

      // Look for an orphaned completed lesson with the same title
      const orphanedMatches = orphanedByTitle.get(linkedInfo.lessonTitle || '') || [];

      // Skip if no matches or ambiguous (multiple orphaned completed lessons with same title)
      if (orphanedMatches.length === 0) {
        skipped++;
        continue;
      }
      
      if (orphanedMatches.length > 1) {
        console.log(`[RepairDuplicates] Skipping topic "${topic.name}" - ${orphanedMatches.length} ambiguous orphaned completed lessons with same title`);
        skipped++;
        continue;
      }

      const completedMatch = orphanedMatches[0];
      console.log(`[RepairDuplicates] Found orphaned completed lesson for topic "${topic.name}": pending=${topic.lessonId}, completed=${completedMatch.id}`);

      // Update the framework to point to the completed lesson
      topic.lessonId = completedMatch.id;
      needsUpdate = true;

      // Update the courseLessons table entry to point to the completed lesson
      await db.update(courseLessons)
        .set({ 
          lessonId: completedMatch.id,
          topicId: topic.id, // Ensure topicId is set for stable matching
        })
        .where(eq(courseLessons.id, linkedInfo.linkId));
      console.log(`[RepairDuplicates] Updated courseLesson ${linkedInfo.linkId} to point to completed lesson ${completedMatch.id}`);

      // Archive the orphaned pending lesson
      await db.update(lessons)
        .set({ isArchived: true })
        .where(eq(lessons.id, linkedInfo.lessonId));
      console.log(`[RepairDuplicates] Archived orphaned pending lesson ${linkedInfo.lessonId}`);

      // Mark the completed lesson as used so it won't match other topics
      allLinkedLessonIds.add(completedMatch.id);

      repaired++;
    }

    // Save updated framework
    if (needsUpdate) {
      await db.update(courseFrameworks)
        .set({ topics: topics as any })
        .where(eq(courseFrameworks.id, framework.id));
      console.log(`[RepairDuplicates] Repaired ${repaired} duplicate lesson links for course ${courseId}`);
    }

    return { repaired, skipped };
  }

  /**
   * Backfill placeholder lessons with topic.sourceContent
   * This copies the full extracted document content from framework topics 
   * to lesson.inputText for lessons that have empty inputText.
   * 
   * This runs automatically during getCourseFramework() to fix existing data.
   */
  static async backfillLessonInputText(courseId: string): Promise<{ updated: number; skipped: number }> {
    const framework = await db.query.courseFrameworks.findFirst({
      where: eq(courseFrameworks.courseId, courseId),
    });

    if (!framework) {
      return { updated: 0, skipped: 0 };
    }

    const topics = (framework.topics || []) as Array<{
      id?: string;
      name?: string;
      lessonId?: string | null;
      sourceContent?: string;
      detailedSummary?: string;
      description?: string;
      [key: string]: any;
    }>;

    let updated = 0;
    let skipped = 0;

    for (const topic of topics) {
      if (!topic.lessonId) {
        continue; // No lesson linked
      }

      // Get the topic's content (sourceContent is preferred, fall back to others)
      const rawTopicContent = topic.sourceContent || topic.detailedSummary || '';
      const topicContent = this.sanitizeGeneratedTopicSourceContent(rawTopicContent);
      if (!topicContent) {
        skipped++;
        continue; // No content to copy
      }

      // Check if lesson is a placeholder that needs backfill
      const lesson = await db.query.lessons.findFirst({
        where: eq(lessons.id, topic.lessonId),
      });

      if (!lesson) {
        skipped++;
        continue;
      }

      // SAFETY: Only backfill placeholder lessons (pending/failed status)
      // Never overwrite completed lessons or lessons with existing user content
      const isPlaceholder = lesson.generationStatus === 'pending' || lesson.generationStatus === 'failed';
      if (!isPlaceholder) {
        skipped++; // Skip completed/processing lessons
        continue;
      }

      // LENGTH-DIFFERENCE HEURISTIC (aligned with LessonWizard):
      // Update if topic sourceContent is significantly longer (500+ chars more) than lesson inputText
      // This handles placeholder lessons with short descriptions (~200 chars)
      // while preserving any substantial user-edited content
      const existingInputText = lesson.inputText || '';
      const topicHasMoreContent = topicContent.length > existingInputText.length + 500;
      
      console.log(`[BackfillInputText] Lesson ${topic.lessonId}: inputText=${existingInputText.length} chars, topicContent=${topicContent.length} chars, hasMore=${topicHasMoreContent}`);
      
      if (topicHasMoreContent) {
        await db.update(lessons)
          .set({ inputText: topicContent })
          .where(eq(lessons.id, topic.lessonId));
        updated++;
        console.log(`[BackfillInputText] Updated placeholder lesson ${topic.lessonId} with ${topicContent.length} chars of content`);
      } else {
        skipped++;
      }
    }

    if (updated > 0) {
      console.log(`[BackfillInputText] Updated ${updated} lessons with topic content for course ${courseId}`);
    }

    return { updated, skipped };
  }

  /**
   * Repair framework topics whose lessonId still points at a source-system or
   * otherwise stale lesson while courseLessons already points at the local row.
   */
  static async repairStaleFrameworkLessonIds(courseId: string): Promise<{ repaired: number; skipped: number }> {
    const framework = await db.query.courseFrameworks.findFirst({
      where: eq(courseFrameworks.courseId, courseId),
    });

    const topics = Array.isArray(framework?.topics) ? ([...(framework!.topics as any[])] as any[]) : [];
    if (!framework || topics.length === 0) {
      return { repaired: 0, skipped: 0 };
    }

    const links = await db
      .select({
        lessonId: courseLessons.lessonId,
        topicId: courseLessons.topicId,
        topicOrder: courseLessons.topicOrder,
        topicName: courseLessons.topicName,
        lessonTitle: lessons.title,
      })
      .from(courseLessons)
      .innerJoin(lessons, eq(courseLessons.lessonId, lessons.id))
      .where(eq(courseLessons.courseId, courseId))
      .orderBy(asc(courseLessons.topicOrder));

    if (!links.length) {
      return { repaired: 0, skipped: topics.filter((topic) => !!topic?.lessonId).length };
    }

    const normalizeLabel = (value: unknown) =>
      String(value || "")
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const linkedLessonIds = new Set(links.map((link) => String(link.lessonId)));
    const byTopicId = new Map(links.filter((link) => link.topicId).map((link) => [String(link.topicId), link]));
    const byOrder = new Map(links.map((link) => [Number(link.topicOrder), link]));
    const byName = new Map<string, (typeof links)[number]>();
    for (const link of links) {
      const labels = [link.topicName, link.lessonTitle].map(normalizeLabel).filter(Boolean);
      for (const label of labels) {
        if (!byName.has(label)) byName.set(label, link);
      }
    }

    let repaired = 0;
    let skipped = 0;
    const nextTopics = topics.map((topic) => {
      if (!topic || typeof topic !== "object" || !topic.lessonId) return topic;

      const currentLessonId = String(topic.lessonId);
      if (linkedLessonIds.has(currentLessonId)) return topic;

      const topicOrder = Number(topic.order);
      const topicName = normalizeLabel(topic.name || topic.title);
      const match =
        byTopicId.get(String(topic.id || "")) ||
        (Number.isFinite(topicOrder) ? byOrder.get(topicOrder) : undefined) ||
        byName.get(topicName);

      if (!match?.lessonId) {
        skipped++;
        return topic;
      }

      repaired++;
      return {
        ...topic,
        lessonId: match.lessonId,
      };
    });

    if (repaired > 0) {
      await db
        .update(courseFrameworks)
        .set({
          topics: nextTopics as any,
          updatedAt: new Date(),
        })
        .where(eq(courseFrameworks.id, framework.id));
      console.log(`[CourseService] Repaired ${repaired} stale framework lessonId reference(s) for course ${courseId}`);
    }

    return { repaired, skipped };
  }

  /**
   * Remove known cross-lesson/curriculum-meta fragments from generated topic content.
   * This keeps lesson source text scoped to the selected lesson topic.
   */
  private static sanitizeGeneratedTopicSourceContent(content: string): string {
    if (!content) return '';

    const paragraphs = content
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(Boolean);

    const filtered = paragraphs.filter((paragraph) => {
      if (/^course title and description$/i.test(paragraph)) return false;
      if (/lesson\s+\d+\s+(addresses|deconstructs|delves|prepares|provides)/i.test(paragraph)) return false;
      if ((paragraph.match(/\blesson\s+\d+\b/gi) || []).length >= 2) return false;
      if (/the proposed e-learning curriculum is titled/i.test(paragraph)) return false;
      return true;
    });

    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const paragraph of filtered) {
      const normalized = paragraph.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      deduped.push(paragraph);
    }

    return deduped.join('\n\n').trim();
  }

  /**
   * Generate a lesson for a specific topic within a course framework.
   * Uses a database transaction to ensure atomic updates across:
   * - lessons table (update placeholder with generation params)
   * - courseLessons table (ensure link exists with topicId)
   * - courseFrameworks JSONB (verify topic.lessonId matches)
   * 
   * After the transaction commits, enqueues the async Gamma generation job.
   * 
   * @param params.courseId - The course containing the topic
   * @param params.topicId - The framework topic ID to generate content for
   * @param params.existingLessonId - The placeholder lesson ID (required)
   * @param params.userId - The user initiating generation
   * @param params.organizationId - The organization owning the course
   * @param params.inputText - Text content for generation
   * @param params.themeId - Gamma theme ID for styling
   * @param params.generateImages - Whether to generate images
   * @param params.imageStyle - Style for generated images
   * @returns The updated lesson record
   */
  static async generateLessonForTopic(params: {
    courseId: string;
    topicId: string;
    existingLessonId: string;
    userId: string;
    organizationId: string;
    inputText?: string;
    themeId?: string;
    generateImages?: boolean;
    imageStyle?: string;
  }): Promise<Lesson> {
    const {
      courseId,
      topicId,
      existingLessonId,
      userId,
      organizationId,
      inputText,
      themeId,
      generateImages,
      imageStyle,
    } = params;

    if (!existingLessonId) {
      throw new Error('MISSING_LESSON_ID: existingLessonId is required for topic-based generation');
    }

    const course = await db.query.courses.findFirst({
      where: and(
        eq(courses.id, courseId),
        eq(courses.organizationId, organizationId)
      ),
    });

    if (!course) {
      throw new Error('COURSE_NOT_FOUND: Course not found or unauthorized');
    }

    const framework = await db.query.courseFrameworks.findFirst({
      where: eq(courseFrameworks.courseId, courseId),
    });

    if (!framework) {
      throw new Error('FRAMEWORK_MISSING: Course framework not found');
    }

    const topics = (framework.topics as any[]) || [];
    const topicIndex = topics.findIndex((t: any) => t.id === topicId);

    if (topicIndex === -1) {
      throw new Error(`TOPIC_NOT_FOUND: Topic with id "${topicId}" not found in course framework`);
    }

    const topic = topics[topicIndex];

    const gammaImageOptions = (generateImages !== undefined || imageStyle) ? {
      generateImages: generateImages ?? true,
      imageStyle: imageStyle || 'photorealistic'
    } : null;

    // Get course scope from courseAssignments (single source of truth)
    const courseAssignment = await db.query.courseAssignments.findFirst({
      where: eq(courseAssignments.courseId, courseId),
    });
    
    // Fetch course unit/subunit names for lesson inheritance
    let courseUnitName: string | null = null;
    let courseSubUnitName: string | null = null;
    
    if (courseAssignment?.unitId) {
      const unit = await db.query.organizationUnits.findFirst({
        where: eq(organizationUnits.id, courseAssignment.unitId),
      });
      if (unit) {
        courseUnitName = unit.name;
      }
    }
    
    if (courseAssignment?.subUnitId) {
      const subUnit = await db.query.organizationSubUnits.findFirst({
        where: eq(organizationSubUnits.id, courseAssignment.subUnitId),
      });
      if (subUnit) {
        courseSubUnitName = subUnit.name;
      }
    }

    let updatedLesson: Lesson;

    await db.transaction(async (tx) => {
      const existingLesson = await tx.query.lessons.findFirst({
        where: and(
          eq(lessons.id, existingLessonId),
          eq(lessons.organizationId, organizationId)
        ),
      });

      if (!existingLesson) {
        throw new Error(`LESSON_NOT_FOUND: Lesson ${existingLessonId} not found or unauthorized`);
      }

      // Build lesson update with course context inheritance
      // Lesson inherits course department (from unitId) and unit (from subUnitId) if not already set
      const lessonUpdate: Record<string, any> = {
        inputText: inputText || existingLesson.inputText,
        themeId: themeId || existingLesson.themeId,
        gammaImageOptions: gammaImageOptions || existingLesson.gammaImageOptions,
        generationStatus: 'pending',
        generationMode: 'text-input',
        updatedAt: new Date(),
      };

      if (course.languageCode && !existingLesson.languageCode) {
        lessonUpdate.languageCode = course.languageCode;
      }
      
      // Inherit department from course unit if lesson doesn't have one
      if (!existingLesson.department && courseUnitName) {
        lessonUpdate.department = courseUnitName;
      }
      
      // Inherit unit from course sub-unit if lesson doesn't have one
      if (!existingLesson.unit && courseSubUnitName) {
        lessonUpdate.unit = courseSubUnitName;
      }

      const [updated] = await tx
        .update(lessons)
        .set(lessonUpdate)
        .where(eq(lessons.id, existingLessonId))
        .returning();

      updatedLesson = updated;

      // First check by (courseId, lessonId) - handles cases where topicId is NULL from legacy data
      const existingLinkByLesson = await tx.query.courseLessons.findFirst({
        where: and(
          eq(courseLessons.courseId, courseId),
          eq(courseLessons.lessonId, existingLessonId)
        ),
      });

      // Also check by (courseId, topicId) for cases where a different lesson is linked to this topic
      const existingLinkByTopic = await tx.query.courseLessons.findFirst({
        where: and(
          eq(courseLessons.courseId, courseId),
          eq(courseLessons.topicId, topicId)
        ),
      });

      if (existingLinkByLesson) {
        // Link exists for this lesson - update topicId if needed (handles legacy NULL topicId)
        if (existingLinkByLesson.topicId !== topicId) {
          await tx
            .update(courseLessons)
            .set({
              topicId,
              topicName: topic.name || existingLinkByLesson.topicName,
              topicOrder: topic.order ?? topicIndex,
            })
            .where(eq(courseLessons.id, existingLinkByLesson.id));
          console.log(`[generateLessonForTopic] Updated courseLessons ${existingLinkByLesson.id} topicId to ${topicId}`);
        }
      } else if (existingLinkByTopic) {
        // Link exists for this topic with different lesson - update lessonId
        if (existingLinkByTopic.lessonId !== existingLessonId) {
          await tx
            .update(courseLessons)
            .set({
              lessonId: existingLessonId,
            })
            .where(eq(courseLessons.id, existingLinkByTopic.id));
          console.log(`[generateLessonForTopic] Updated courseLessons ${existingLinkByTopic.id} to lessonId ${existingLessonId}`);
        }
      } else {
        // No existing link - create new
        await tx.insert(courseLessons).values({
          courseId,
          lessonId: existingLessonId,
          topicId,
          topicName: topic.name || '',
          topicOrder: topic.order ?? topicIndex,
          lessonType: 'content',
        });
        console.log(`[generateLessonForTopic] Created courseLessons for topicId ${topicId} → lessonId ${existingLessonId}`);
      }

      if (topic.lessonId !== existingLessonId) {
        topic.lessonId = existingLessonId;
        await tx
          .update(courseFrameworks)
          .set({ topics: topics as any })
          .where(eq(courseFrameworks.id, framework.id));
        console.log(`[generateLessonForTopic] Updated framework topic ${topicId} lessonId to ${existingLessonId}`);
      }
    });

    // Check if this is an overview lesson (topicOrder === 0)
    const topicOrder = topic.order ?? topicIndex;
    const isOverviewLesson = topicOrder === 0;
    
    // Build job metadata, including course summaries for overview lessons
    const jobMetadata: Record<string, any> = {
      userId,
      courseId,
      topicId,
      source: 'generateLessonForTopic',
      isOverview: isOverviewLesson,
    };

    // For overview lessons, fetch other lesson summaries to include course outline in the presentation
    if (isOverviewLesson && courseId) {
      try {
        const courseContext = await CourseContextService.buildCourseLessonSummaries(
          courseId,
          existingLessonId // Exclude this lesson from the summaries
        );
        
        if (courseContext && courseContext.otherLessonsSummaries && courseContext.otherLessonsSummaries.length > 0) {
          jobMetadata.otherLessonsSummaries = courseContext.otherLessonsSummaries;
          jobMetadata.courseTitle = courseContext.courseTitle;
          jobMetadata.courseDescription = courseContext.courseDescription;
          jobMetadata.targetAudience = courseContext.targetAudience;
          console.log(
            `[generateLessonForTopic] Attached ${courseContext.otherLessonsSummaries.length} lesson summaries for overview lesson ${existingLessonId}`
          );
        } else {
          console.log(`[generateLessonForTopic] No other lessons found for overview lesson ${existingLessonId} in course ${courseId}`);
        }
      } catch (contextError) {
        console.warn(`[generateLessonForTopic] Failed to fetch course context for overview lesson:`, contextError);
        // Continue without course context - don't block job creation
      }
    }

    await JobQueueService.createJob({
      organizationId,
      lessonId: existingLessonId,
      metadata: jobMetadata,
    });

    console.log(`[generateLessonForTopic] Enqueued generation job for lesson ${existingLessonId} (course: ${courseId}, topic: ${topicId}, isOverview: ${isOverviewLesson})`);

    return updatedLesson!;
  }

  /**
   * Get course framework (AI-generated topics structure)
   * Returns null if framework doesn't exist
   * Auto-repairs orphaned lesson links on fetch
   */
  static async getCourseFramework(courseId: string): Promise<CourseFramework | null> {
    // First, attempt to repair any orphaned lesson links
    // This fixes lessons that were generated before the linking bug was fixed
    await this.repairOrphanedLessonLinks(courseId);
    
    // Also repair duplicate lesson links (pending placeholder vs completed orphan)
    await this.repairDuplicateLessonLinks(courseId);

    // Enforce topic-level dedupe and merge content-bearing duplicates.
    await this.selfHealDuplicateCourseLessons(courseId);

    // Repair imported/legacy frameworks that still point at stale lesson IDs.
    await this.repairStaleFrameworkLessonIds(courseId);
    
    // Backfill placeholder lessons with topic content (for existing data without inputText)
    await this.backfillLessonInputText(courseId);

    const framework = await db.query.courseFrameworks.findFirst({
      where: eq(courseFrameworks.courseId, courseId),
    });

    if (!framework) {
      // Backward-compatible self-heal:
      // If legacy/demo data has courseLessons but missing framework JSON, synthesize and persist one.
      const [courseRecord] = await db
        .select({ organizationId: courses.organizationId })
        .from(courses)
        .where(eq(courses.id, courseId))
        .limit(1);

      const legacyLinks = await db
        .select({
          lessonId: courseLessons.lessonId,
          topicId: courseLessons.topicId,
          topicOrder: courseLessons.topicOrder,
          topicName: courseLessons.topicName,
          lessonType: courseLessons.lessonType,
          lessonTitle: lessons.title,
        })
        .from(courseLessons)
        .leftJoin(lessons, eq(courseLessons.lessonId, lessons.id))
        .where(eq(courseLessons.courseId, courseId))
        .orderBy(asc(courseLessons.topicOrder));

      if (courseRecord?.organizationId && legacyLinks.length > 0) {
        const synthesizedTopics = legacyLinks.map((link, idx) => {
          const fallbackOrder = Number(link.topicOrder || idx + 1);
          return {
            id: link.topicId || `topic-${fallbackOrder}`,
            order: fallbackOrder,
            name: link.topicName || link.lessonTitle || `Topic ${fallbackOrder}`,
            lessonType: link.lessonType || null,
            lessonId: link.lessonId,
          };
        });

        const [inserted] = await db
          .insert(courseFrameworks)
          .values({
            courseId,
            organizationId: courseRecord.organizationId,
            topics: synthesizedTopics as any,
            sourceMap: {
              extractedAt: new Date().toISOString(),
              sectionSpans: [],
            },
            contentHealth: {
              overallScore: 100,
              topicScores: synthesizedTopics.map((t) => ({
                topicId: t.id,
                score: 100,
                issues: [],
              })),
              hasOverview: synthesizedTopics.some((t) => t.lessonType === 'overview'),
              hasKeyTakeaways: synthesizedTopics.some((t) => t.lessonType === 'key_takeaways'),
              validatedAt: new Date().toISOString(),
            },
          })
          .returning();

        if (inserted) {
          console.log(`[CourseService] Synthesized missing framework for course ${courseId} from ${legacyLinks.length} courseLessons rows`);
          return inserted;
        }
      }

      console.log(`No framework found for course ${courseId}`);
      return null;
    }

    // Enrich topics with generationStatus from linked lessons
    // This enables the frontend to poll for status updates during async generation
    const topics = (framework.topics || []) as Array<{ lessonId?: string | null; [key: string]: any }>;
    const lessonIds = topics
      .filter(t => t.lessonId)
      .map(t => t.lessonId as string);

    if (lessonIds.length > 0) {
      const lessonRecords = await db
        .select({ id: lessons.id, generationStatus: lessons.generationStatus })
        .from(lessons)
        .where(inArray(lessons.id, lessonIds));

      const lessonStatusMap = new Map(lessonRecords.map(l => [l.id, l.generationStatus]));

      const courseLinks = await db
        .select({ lessonId: courseLessons.lessonId, lessonType: courseLessons.lessonType })
        .from(courseLessons)
        .where(eq(courseLessons.courseId, courseId));

      const lessonTypeMap = new Map(courseLinks.map(l => [l.lessonId, l.lessonType]));

      const enrichedTopics = topics.map(topic => ({
        ...topic,
        generationStatus: topic.lessonId ? (lessonStatusMap.get(topic.lessonId) || null) : null,
        lessonType: topic.lessonId ? (lessonTypeMap.get(topic.lessonId) || null) : null,
      }));

      return {
        ...framework,
        topics: enrichedTopics,
      };
    }

    return framework;
  }

  /**
   * Get demo lesson (first lesson) for a course
   * Returns the first lesson by topicOrder, or null if no lessons exist
   */
  static async getDemoLesson(courseId: string): Promise<typeof lessons.$inferSelect | null> {
    const firstCourseLesson = await db.query.courseLessons.findFirst({
      where: eq(courseLessons.courseId, courseId),
      orderBy: [asc(courseLessons.topicOrder)],
      with: {
        lesson: true,
      },
    });

    if (!firstCourseLesson) {
      console.log(`No lessons found for course ${courseId}`);
      return null;
    }

    return firstCourseLesson.lesson;
  }

  /**
   * Mark a lesson as completed for a user in a course
   * Updates or creates userCourseLessonProgress record
   */
  static async markLessonComplete(
    userId: string,
    courseId: string,
    lessonId: string
  ): Promise<void> {
    // Get the user's enrollment to find their course version
    const enrollment = await db.query.userCourseEnrollments.findFirst({
      where: and(
        eq(userCourseEnrollments.userId, userId),
        eq(userCourseEnrollments.courseId, courseId)
      ),
    });

    if (!enrollment) {
      throw new Error('User is not enrolled in this course');
    }

    const existing = await db.query.userCourseLessonProgress.findFirst({
      where: and(
        eq(userCourseLessonProgress.userId, userId),
        eq(userCourseLessonProgress.courseId, courseId),
        eq(userCourseLessonProgress.lessonId, lessonId)
      ),
    });

    if (existing) {
      if (existing.status === 'completed') {
        console.log(`Lesson ${lessonId} already completed for user ${userId} in course ${courseId}`);
        return;
      }

      await db.update(userCourseLessonProgress)
        .set({
          status: 'completed',
          completedAt: new Date(),
        })
        .where(
          and(
            eq(userCourseLessonProgress.userId, userId),
            eq(userCourseLessonProgress.courseId, courseId),
            eq(userCourseLessonProgress.lessonId, lessonId)
          )
        );
    } else {
      await db.insert(userCourseLessonProgress).values({
        userId,
        courseId,
        courseVersionId: enrollment.courseVersionId,
        lessonId,
        status: 'completed',
        completedAt: new Date(),
      });
    }

    console.log(`Lesson marked complete: ${lessonId} for user ${userId} in course ${courseId}`);
  }

  /**
   * Get top-rated courses for homepage display
   * Returns active public courses sorted by average rating (highest first)
   * Only includes courses with at least 1 rating from any organization
   * All org types can now create public courses (unified org model)
   */
  static async getTopRatedCourses(limit: number = 8): Promise<any[]> {
    // Get top rated public courses from ANY organization
    // All orgs can now create public courses (unified org model)
    const results = await db
      .select({
        course: courses,
      })
      .from(courses)
      .where(and(
        eq(courses.visibility, 'public'), // Only public courses in recommendations
        eq(courses.status, 'active'),
        gt(courses.totalRatings, 0) // Only courses with at least 1 rating
      ))
      .orderBy(desc(courses.averageRating), desc(courses.totalRatings))
      .limit(limit);

    const topCourses = results.map(r => r.course);

    // Enrich with signed thumbnail URLs
    const enrichedCourses = await Promise.all(topCourses.map(async (course) => {
      let thumbnailSignedUrl: string | undefined;
      
      if (course.thumbnailUrl) {
        try {
          thumbnailSignedUrl = await objectStorageService.getCourseThumbnailSignedURL(
            course.thumbnailUrl,
            3600 // 1 hour TTL
          );
        } catch (error) {
          console.error(`[CourseService] Failed to get signed URL for thumbnail: ${course.thumbnailUrl}`, error);
          thumbnailSignedUrl = undefined;
        }
      }

      return {
        id: course.id,
        title: course.title,
        description: course.description,
        thumbnailUrl: thumbnailSignedUrl || course.thumbnailUrl,
        price: course.price,
        currency: course.currency,
        difficultyLevel: course.difficultyLevel,
        averageRating: course.averageRating || '0.00',
        totalRatings: course.totalRatings || 0,
        estimatedDuration: course.estimatedDuration,
      };
    }));

    return enrichedCourses;
  }

  /**
   * Clone/duplicate a course to the same or different organization.
   * 
   * Visibility handling:
   * - If cloning to same org: preserves visibility if allowed
   * - If cloning to different org: adjusts visibility based on target org type
   *   - elearning orgs: can have public or org_only
   *   - education/business orgs: forced to org_only
   * 
   * Clones:
   * - Course metadata (title, description, etc.)
   * - Course framework (topics structure)
   * - Course-lesson links
   * 
   * Does NOT clone:
   * - Purchases, enrollments, progress (these are user-specific)
   * - Reviews and ratings (start fresh)
   * - Version history (starts at v1.0)
   * 
   * @param sourceCourseId - ID of the course to clone
   * @param options - Clone options including target org and new title
   * @returns Result with cloned course and metadata about what was cloned
   */
  static async cloneCourse(
    sourceCourseId: string,
    options: CourseCloneOptions
  ): Promise<CourseCloneResult> {
    // 1. Get source course with organization
    const sourceCourse = await db.query.courses.findFirst({
      where: eq(courses.id, sourceCourseId),
      with: {
        organization: true,
      },
    });

    if (!sourceCourse) {
      throw new Error('Source course not found');
    }

    // 2. Determine target organization
    const targetOrgId = options.targetOrganizationId || sourceCourse.organizationId;
    const isSameOrg = targetOrgId === sourceCourse.organizationId;

    // 3. Get target organization to determine allowed visibility
    const targetOrg = isSameOrg 
      ? sourceCourse.organization
      : await db.query.organizations.findFirst({
          where: eq(organizations.id, targetOrgId),
        });

    if (!targetOrg) {
      throw new Error('Target organization not found');
    }

    // 4. Determine visibility for cloned course
    const originalVisibility = (sourceCourse.visibility || 'org_only') as CourseVisibility;
    const targetOrgType = targetOrg.type as 'education' | 'business' | 'elearning';
    
    let newVisibility: CourseVisibility;
    if (options.preserveVisibility && isSameOrg) {
      // Preserve visibility only if staying in same org and explicitly requested
      newVisibility = originalVisibility;
    } else {
      // Use the visibility service to determine appropriate visibility
      newVisibility = CourseVisibilityService.getClonedCourseVisibility(
        originalVisibility,
        targetOrgType
      );
    }

    const visibilityChanged = newVisibility !== originalVisibility;

    // 5. Create the cloned course
    // Clone ALL course metadata from source, with intentional overrides for:
    // - id: auto-generated new ID
    // - organizationId: target org (may differ from source)
    // - title: optional custom title or "(Copy)" suffix
    // - status: ALWAYS 'draft' - cloned courses are never auto-published
    // - visibility: calculated based on target org type
    // - currentVersionId: null for new course (no versions yet)
    // - averageRating/totalRatings: reset to 0 (ratings don't transfer)
    // - createdBy: the user who initiated the clone
    // - createdAt/updatedAt: new timestamps
    const clonedTitle = options.newTitle || `${sourceCourse.title} (Copy)`;
    
    const [clonedCourse] = await db.insert(courses).values({
      // Core metadata from source course
      organizationId: targetOrgId,
      title: clonedTitle,
      description: sourceCourse.description,
      thumbnailUrl: sourceCourse.thumbnailUrl,
      price: sourceCourse.price,
      currency: sourceCourse.currency,
      categoryId: sourceCourse.categoryId,
      difficultyLevel: sourceCourse.difficultyLevel,
      estimatedDuration: sourceCourse.estimatedDuration,
      // Intentional overrides for cloned course
      status: 'draft', // Clones always start as draft, never published
      visibility: newVisibility,
      currentVersionId: undefined, // No version assigned yet
      averageRating: '0.00', // Reset - ratings don't transfer
      totalRatings: 0, // Reset - ratings don't transfer
      // Audit fields: set to cloning user
      createdBy: options.createdByUserId,
      // Note: updatedAt will default to now via DB default
    }).returning();

    await db.update(courses).set({ contentGroupId: clonedCourse.id }).where(eq(courses.id, clonedCourse.id));

    // 6. Create initial version 1.0 for cloned course
    await db.insert(courseVersions).values({
      courseId: clonedCourse.id,
      versionNumber: '1.0',
      title: clonedCourse.title,
      description: clonedCourse.description || '',
      thumbnailUrl: clonedCourse.thumbnailUrl,
      basePrice: sourceCourse.price,
      baseCurrency: sourceCourse.currency,
    });

    // 7. Clone course framework (topics structure)
    let frameworkCloned = false;
    const sourceFramework = await db.query.courseFrameworks.findFirst({
      where: eq(courseFrameworks.courseId, sourceCourseId),
    });

    if (sourceFramework) {
      // Clone topics but clear lessonIds - they'll be re-linked if needed
      const clonedTopics = (sourceFramework.topics as any[])?.map(topic => ({
        ...topic,
        id: undefined, // Let DB generate new IDs
        lessonId: null, // Clear lesson links - lessons belong to source org
      })) || [];

      await db.insert(courseFrameworks).values({
        courseId: clonedCourse.id,
        organizationId: targetOrgId,
        topics: clonedTopics,
      });
      frameworkCloned = true;
    } else {
      // Create empty framework if source didn't have one
      await db.insert(courseFrameworks).values({
        courseId: clonedCourse.id,
        organizationId: targetOrgId,
        topics: [],
      });
    }

    // 8. Clone course-lesson links (only if same org - lessons are org-specific)
    let lessonsLinked = 0;
    if (isSameOrg) {
      const sourceLinks = await db.query.courseLessons.findMany({
        where: eq(courseLessons.courseId, sourceCourseId),
      });

      if (sourceLinks.length > 0) {
        const clonedLinks = sourceLinks.map(link => ({
          courseId: clonedCourse.id,
          lessonId: link.lessonId,
          topicId: link.topicId, // Preserve topicId for stable matching
          topicName: link.topicName,
          topicOrder: link.topicOrder,
        }));

        await db.insert(courseLessons).values(clonedLinks);
        lessonsLinked = clonedLinks.length;

        // Update framework with lessonIds
        if (sourceFramework) {
          const updatedTopics = (sourceFramework.topics as any[])?.map(topic => {
            const matchingLink = sourceLinks.find(l => l.topicOrder === topic.order);
            return {
              ...topic,
              lessonId: matchingLink?.lessonId || null,
            };
          }) || [];

          await db.update(courseFrameworks)
            .set({ topics: updatedTopics as any })
            .where(eq(courseFrameworks.courseId, clonedCourse.id));
        }
      }
    }

    console.log(
      `[CourseClone] Cloned course ${sourceCourseId} → ${clonedCourse.id} ` +
      `(org: ${sourceCourse.organizationId} → ${targetOrgId}, ` +
      `visibility: ${originalVisibility} → ${newVisibility}, ` +
      `lessons: ${lessonsLinked})`
    );

    return {
      clonedCourse,
      frameworkCloned,
      lessonsLinked,
      visibilityChanged,
      originalVisibility,
      newVisibility,
    };
  }

  /**
   * Validate if a course is ready to be published
   * Checks:
   * 1. All content lessons have generated content (status = 'generated' or 'completed')
   * 2. All content lessons have linked quizzes (via lessonQuizLinks or primaryQuizId)
   * 3. Overview and key takeaway lessons do NOT require quizzes
   */
  static async validateCourseForPublish(courseId: string, options?: { skipAssignmentCheck?: boolean; targetLanguageCode?: string }): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
    lessonDetails: Array<{
      lessonId: string;
      lessonTitle: string;
      topicOrder: number;
      lessonType: string;
      generationStatus: string;
      hasQuiz: boolean;
      requiresQuiz: boolean;
      missingLanguageArtifacts?: string[];
    }>;
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const lessonDetails: Array<{
      lessonId: string;
      lessonTitle: string;
      topicOrder: number;
      lessonType: string;
      generationStatus: string;
      hasQuiz: boolean;
      requiresQuiz: boolean;
      missingLanguageArtifacts?: string[];
    }> = [];

    // Get the course
    const course = await db.query.courses.findFirst({
      where: eq(courses.id, courseId),
    });

    if (!course) {
      return {
        isValid: false,
        errors: ['Course not found'],
        warnings: [],
        lessonDetails: [],
      };
    }

    let effectiveCourseId = courseId;
    let effectiveCourse = course;
    const requestedLanguage = String(options?.targetLanguageCode || '').trim().toLowerCase();
    const contentGroupId = course.contentGroupId || course.id;
    const [defaultVariant] = await db
      .select({ languageCode: courses.languageCode })
      .from(courses)
      .where(
        and(
          eq(courses.contentGroupId, contentGroupId),
          eq(courses.isDefaultLanguage, true)
        )
      )
      .limit(1);
    const sourceLanguage = String(defaultVariant?.languageCode || course.languageCode || 'en').toLowerCase();

    if (requestedLanguage && requestedLanguage !== sourceLanguage) {
      const [variantCourse] = await db
        .select()
        .from(courses)
        .where(
          and(
            eq(courses.contentGroupId, contentGroupId),
            sql`LOWER(${courses.languageCode}) = ${requestedLanguage}`
          )
        )
        .limit(1);

      if (!variantCourse) {
        return {
          isValid: false,
          errors: [`No ${requestedLanguage.toUpperCase()} course variant exists for this course.`],
          warnings: [],
          lessonDetails: [],
        };
      }
      effectiveCourseId = variantCourse.id;
      effectiveCourse = variantCourse;
    }

    await this.syncCourseLessonOrderFromFramework(effectiveCourseId);

    // Get all course lessons with their linked lessons
    const courseWithLessons = await db
      .select({
        courseLesson: courseLessons,
        lesson: lessons,
      })
      .from(courseLessons)
      .innerJoin(lessons, eq(courseLessons.lessonId, lessons.id))
      .where(eq(courseLessons.courseId, effectiveCourseId))
      .orderBy(asc(courseLessons.topicOrder));

    if (courseWithLessons.length === 0) {
      errors.push('Course has no lessons linked. Please add lessons before publishing.');
      return { isValid: false, errors, warnings, lessonDetails };
    }

    // Get all quiz links for the lessons
    const lessonIds = courseWithLessons.map(cl => cl.courseLesson.lessonId);
    const quizLinks = await db
      .select({
        lessonId: lessonQuizLinks.lessonId,
        quizId: lessonQuizLinks.quizId,
        isPrimary: lessonQuizLinks.isPrimary,
      })
      .from(lessonQuizLinks)
      .where(inArray(lessonQuizLinks.lessonId, lessonIds));

    // Also check for unpublished quiz drafts (to provide better user feedback)
    const draftQuizzes = await db
      .select({
        lessonId: quizDrafts.lessonId,
        quizName: quizDrafts.quizName,
      })
      .from(quizDrafts)
      .where(
        and(
          inArray(quizDrafts.lessonId, lessonIds),
          isNotNull(quizDrafts.lessonId)
        )
      );
    
    // Create a set of lesson IDs that have unpublished drafts
    const lessonsWithDraftQuizzes = new Set<string>();
    for (const draft of draftQuizzes) {
      if (draft.lessonId) {
        lessonsWithDraftQuizzes.add(draft.lessonId);
      }
    }

    // Create a set of lesson IDs that have quizzes (from links or primaryQuizId)
    const lessonsWithQuizzes = new Set<string>();
    for (const link of quizLinks) {
      lessonsWithQuizzes.add(link.lessonId);
    }
    // Also check primaryQuizId on courseLessons
    for (const cl of courseWithLessons) {
      if (cl.courseLesson.primaryQuizId) {
        lessonsWithQuizzes.add(cl.courseLesson.lessonId);
      }
    }

    // Validate each lesson
    // Find the minimum and maximum topicOrder to identify overview and key_takeaways lessons
    const topicOrders = courseWithLessons.map(cl => cl.courseLesson.topicOrder);
    const minTopicOrder = Math.min(...topicOrders);
    const maxTopicOrder = Math.max(...topicOrders);
    
    for (const { courseLesson, lesson } of courseWithLessons) {
      const topicOrder = courseLesson.topicOrder;
      // Overview is the first lesson (lowest topicOrder), key_takeaways is the last (highest topicOrder)
      const lessonType = courseLesson.lessonType || 
        (topicOrder === minTopicOrder ? 'overview' : 
         topicOrder === maxTopicOrder ? 'key_takeaways' : 'content');
      
      // Check generation status - lesson needs to be generated
      // Also check for manual uploads: storageKey (PPTX), videoStorageKey (video), or gammaCardId (AI)
      const generationStatus = lesson.generationStatus || 'pending';
      const hasGeneratedStatus = ['generated', 'completed', 'refreshed'].includes(generationStatus);
      const hasContent = !!(lesson.storageKey || lesson.videoStorageKey || lesson.gammaCardId);
      const isGenerated = hasGeneratedStatus || hasContent;
      const hasQuiz = lessonsWithQuizzes.has(lesson.id);
      const hasSourceContent = !!String((lesson as any).inputText || '').trim() || !!(lesson as any).sourceDocumentPath;
      const validatesTranslatedLanguage = String(effectiveCourse.languageCode || 'en').toLowerCase() !== sourceLanguage;
      const missingLanguageArtifacts: string[] = [];
      
      // Only content lessons require quizzes.
      // Structural lessons (overview/key_takeaways) must not block publish on quiz presence.
      const isOverview = topicOrder === minTopicOrder || lessonType === 'overview';
      const isKeyTakeaways = topicOrder === maxTopicOrder || lessonType === 'key_takeaways';
      const requiresQuiz = !isOverview && !isKeyTakeaways;

      lessonDetails.push({
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        topicOrder,
        lessonType,
        generationStatus,
        hasQuiz,
        requiresQuiz,
        missingLanguageArtifacts,
      });

      // Validation: Check generation status
      if (!isGenerated) {
        errors.push(`Lesson "${lesson.title}" (Topic ${topicOrder}) has not been generated yet. Status: ${generationStatus}`);
      }

      if (!hasSourceContent) {
        missingLanguageArtifacts.push('Source content');
        errors.push(`Lesson "${lesson.title}" (Topic ${topicOrder}) is missing source content.`);
      }

      if (!hasContent) {
        missingLanguageArtifacts.push('PPTX/Video');
      }

      // Validation: Check quiz requirement
      if (requiresQuiz && !hasQuiz) {
        missingLanguageArtifacts.push('Quiz');
        // Check if there's an unpublished draft for this lesson
        const hasDraft = lessonsWithDraftQuizzes.has(lesson.id);
        if (hasDraft) {
          errors.push(`Lesson "${lesson.title}" (Topic ${topicOrder}) has an unpublished quiz draft. Please publish the quiz before publishing the course.`);
        } else {
          errors.push(`Lesson "${lesson.title}" (Topic ${topicOrder}) requires a linked quiz. Please generate or link a quiz.`);
        }
      }

      if (validatesTranslatedLanguage && String((lesson as any).translationStatus || '').toLowerCase() !== 'published') {
        missingLanguageArtifacts.push('Translation not published');
        errors.push(`Lesson "${lesson.title}" (Topic ${topicOrder}) translation is not published yet.`);
      }

      // Warning: Overview lesson with quiz is unusual but allowed
      if (isOverview && hasQuiz) {
        warnings.push(`Overview lesson "${lesson.title}" has a linked quiz. This is optional but unusual.`);
      }
    }

    // Check if course has a minimum number of lessons
    const contentLessons = courseWithLessons.filter(cl => cl.courseLesson.topicOrder > 1);
    if (contentLessons.length === 0) {
      warnings.push('Course only has an overview lesson. Consider adding content lessons before publishing.');
    }

    if (!options?.skipAssignmentCheck && effectiveCourse.visibility !== 'public') {
      const departmentAssignments = await db
        .select({ id: courseAssignments.id })
        .from(courseAssignments)
        .where(
          and(
            eq(courseAssignments.courseId, courseId),
            or(
              inArray(courseAssignments.assignmentScope, ['department', 'unit', 'team', 'organization']),
              isNotNull(courseAssignments.unitId)
            )
          )
        )
        .limit(1);

      if (departmentAssignments.length === 0) {
        errors.push('Course must be assigned to at least one department or the whole organization before publishing. Use the Course Assignment feature to assign this course.');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      lessonDetails,
    };
  }

  /**
   * Publish a course - validates and sets status to 'active'
   */
  static async publishCourse(courseId: string, organizationId: string, options?: { skipAssignmentCheck?: boolean }): Promise<{
    success: boolean;
    course?: Course;
    validation: {
      isValid: boolean;
      errors: string[];
      warnings: string[];
    };
  }> {
    await this.syncCourseLessonOrderFromFramework(courseId);

    const validation = await this.validateCourseForPublish(courseId, options);

    if (!validation.isValid) {
      return {
        success: false,
        validation: {
          isValid: validation.isValid,
          errors: validation.errors,
          warnings: validation.warnings,
        },
      };
    }

    // Update course status to 'active'
    const [updated] = await db
      .update(courses)
      .set({
        status: 'active',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(courses.id, courseId),
          eq(courses.organizationId, organizationId)
        )
      )
      .returning();

    if (!updated) {
      return {
        success: false,
        validation: {
          isValid: false,
          errors: ['Course not found or unauthorized'],
          warnings: [],
        },
      };
    }

    const linkedLessons = await db
      .select({ lessonId: courseLessons.lessonId })
      .from(courseLessons)
      .where(eq(courseLessons.courseId, courseId));

    if (linkedLessons.length > 0) {
      const lessonIds = linkedLessons.map((link) => link.lessonId).filter((id): id is string => !!id);
      if (lessonIds.length > 0) {
        await db
          .update(lessons)
          .set({ isPublished: true, updatedAt: new Date() })
          .where(inArray(lessons.id, lessonIds));
      }
    }

    console.log(`[CourseService] Published course ${courseId} for org ${organizationId}`);

    if (updated.visibility === 'public') {
      await this.ensurePublicOrganizationAssignment(updated, organizationId);
    }

    try {
      await TranslationIndexService.enqueueForCourseMutation({
        courseId,
        organizationId,
        eventType: 'publish',
        dedupeSeed: String(updated.updatedAt || new Date().toISOString()),
      });
      await TranslationAnalyticsService.trackEvent({
        organizationId,
        userId: null,
        eventType: 'publish_action',
        resourceType: 'course',
        resourceId: courseId,
        languageCode: updated.languageCode || 'en',
        variantId: updated.id,
        contentGroupId: updated.contentGroupId || null,
        metadata: { status: updated.status, source: 'course_publish' },
        dedupeSeed: `${courseId}:${updated.status}:${updated.updatedAt?.toISOString?.() || ''}`,
      });
    } catch (indexError: any) {
      console.error('[CourseService] Failed to enqueue translation index/analytics for publish:', indexError?.message || indexError);
    }

    return {
      success: true,
      course: updated,
      validation: {
        isValid: true,
        errors: [],
        warnings: validation.warnings,
      },
    };
  }

  /**
   * Public marketplace courses are also delivered through the system Public
   * Organization's Public department. This is a controlled cloud public-org
   * assignment, not the on-prem multi-org publishing UI.
   */
  private static async ensurePublicOrganizationAssignment(course: Course, sourceOrganizationId: string): Promise<void> {
    const publicOrg = await PublicOrganizationService.getOrCreatePublicOrganization();
    const publicDepartment = await PublicOrganizationService.getOrCreatePublicDepartment(publicOrg.id);

    const assignmentData = {
      courseId: course.id,
      organizationId: sourceOrganizationId,
      targetOrganizationId: publicOrg.id,
      assignedBy: course.createdBy,
      assignmentScope: 'department' as const,
      unitId: publicDepartment.id,
      audience: 'learner' as const,
      mandatory: false,
    };

    const [existing] = await db
      .select({ id: courseAssignments.id })
      .from(courseAssignments)
      .where(and(
        eq(courseAssignments.courseId, course.id),
        eq(courseAssignments.organizationId, sourceOrganizationId),
        eq(courseAssignments.targetOrganizationId, publicOrg.id),
        eq(courseAssignments.unitId, publicDepartment.id)
      ))
      .limit(1);

    if (existing) {
      await db
        .update(courseAssignments)
        .set(assignmentData)
        .where(eq(courseAssignments.id, existing.id));
      return;
    }

    await db.insert(courseAssignments).values(assignmentData);
  }

  /**
   * Get public courses for marketplace browsing
   * CRITICAL: Only returns courses with visibility='public'
   * Accessible without authentication
   */
  static async getPublicCourses(options: {
    categoryId?: string;
    search?: string;
    languageCode?: string;
    sortBy?: 'newest' | 'popular' | 'rating' | 'price_low' | 'price_high';
    difficultyLevel?: string;
    limit?: number;
    offset?: number;
    courseIds?: string[];
  }): Promise<{ courses: any[]; total: number }> {
    const { categoryId, search, languageCode, sortBy = 'newest', difficultyLevel, limit = 20, offset = 0, courseIds } = options;

    // Build conditions - ALWAYS include visibility='public' and status='active'
    const conditions: any[] = [
      eq(courses.visibility, 'public'),
      eq(courses.status, 'active'),
    ];

    // Filter by specific course IDs (used for showcase courses)
    if (courseIds && courseIds.length > 0) {
      conditions.push(inArray(courses.id, courseIds));
    }

    if (categoryId) {
      conditions.push(eq(courses.categoryId, categoryId));
    }

    if (difficultyLevel) {
      conditions.push(eq(courses.difficultyLevel, difficultyLevel as any));
    }

    const normalizedLanguageCode = String(languageCode || '').trim().toLowerCase();
    if (normalizedLanguageCode) {
      const langPriority = sql`CASE
        WHEN LOWER(${courses.languageCode}) = ${normalizedLanguageCode} THEN 1
        WHEN ${courses.isDefaultLanguage} = true THEN 2
        ELSE 3
      END`;
      conditions.push(
        or(
          isNull(courses.contentGroupId),
          eq(
            langPriority,
            sql`(
              SELECT MIN(
                CASE
                  WHEN LOWER(c2."languageCode") = ${normalizedLanguageCode} THEN 1
                  WHEN c2."isDefaultLanguage" = true THEN 2
                  ELSE 3
                END
              )
              FROM courses c2
              WHERE c2."contentGroupId" = ${courses.contentGroupId}
                AND c2."visibility" = 'public'
                AND c2."status" = 'active'
            )`
          )
        )!
      );
    }

    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        or(
          ilike(courses.title, searchPattern),
          ilike(courses.description, searchPattern),
          exists(
            db.select({ one: sql`1` })
              .from(translationSearchDocuments)
              .where(and(
                eq(translationSearchDocuments.entityType, 'course'),
                eq(translationSearchDocuments.entityId, courses.id),
                normalizedLanguageCode
                  ? sql`LOWER(${translationSearchDocuments.languageCode}) = ${normalizedLanguageCode}`
                  : undefined as any,
                or(
                  ilike(translationSearchDocuments.title, searchPattern),
                  ilike(translationSearchDocuments.summary, searchPattern),
                  ilike(translationSearchDocuments.searchableText, searchPattern),
                )
              ) as any)
          )
        )
      );
    }

    // Get total count
    const countResult = await db
      .select({ count: count() })
      .from(courses)
      .where(and(...conditions));
    const total = countResult[0]?.count || 0;

    // Build order by clause
    let orderByClause;
    switch (sortBy) {
      case 'popular':
        orderByClause = [desc(courses.totalRatings), desc(courses.averageRating)];
        break;
      case 'rating':
        orderByClause = [desc(courses.averageRating), desc(courses.totalRatings)];
        break;
      case 'price_low':
        orderByClause = [asc(courses.price)];
        break;
      case 'price_high':
        orderByClause = [desc(courses.price)];
        break;
      case 'newest':
      default:
        orderByClause = [desc(courses.createdAt)];
        break;
    }

    // Get courses with category and organization info
    const results = await db
      .select({
        course: courses,
        category: courseCategories,
        organization: organizations,
      })
      .from(courses)
      .leftJoin(courseCategories, eq(courses.categoryId, courseCategories.id))
      .innerJoin(organizations, eq(courses.organizationId, organizations.id))
      .where(and(...conditions))
      .orderBy(...orderByClause)
      .limit(limit)
      .offset(offset);

    // Batch fetch branding themes for all unique organization IDs
    const uniqueOrgIds = Array.from(new Set(results.map(r => r.course.organizationId)));
    const brandingThemeResults = uniqueOrgIds.length > 0
      ? await db.select().from(brandingThemes).where(inArray(brandingThemes.organizationId, uniqueOrgIds))
      : [];
    const brandingThemeMap = new Map(brandingThemeResults.map(theme => [theme.organizationId, theme]));

    // Enrich with signed thumbnail URLs and organization branding
    const enrichedCourses = await Promise.all(results.map(async (r) => {
      let thumbnailSignedUrl: string | undefined;
      
      if (r.course.thumbnailUrl) {
        try {
          thumbnailSignedUrl = await objectStorageService.getCourseThumbnailSignedURL(
            r.course.thumbnailUrl,
            3600 // 1 hour TTL
          );
        } catch (error) {
          console.error(`[CourseService] Failed to get signed URL for thumbnail: ${r.course.thumbnailUrl}`, error);
        }
      }

      // Get branding theme for organization (orgName and logoUrl)
      const brandingTheme = brandingThemeMap.get(r.course.organizationId);
      const organizationName = brandingTheme?.orgName || r.organization?.name || null;
      const organizationLogoUrl = brandingTheme?.logoUrl || null;

      return {
        id: r.course.id,
        title: r.course.title,
        description: r.course.description,
        thumbnailUrl: thumbnailSignedUrl || r.course.thumbnailUrl,
        price: r.course.price,
        currency: r.course.currency,
        isPaid: parseFloat(r.course.price || '0') > 0,
        visibility: r.course.visibility,
        categoryId: r.course.categoryId,
        category: r.category?.name || null,
        categoryName: r.category?.name || null,
        difficultyLevel: r.course.difficultyLevel,
        averageRating: r.course.averageRating || '0.00',
        totalRatings: r.course.totalRatings || 0,
        organizationId: r.course.organizationId,
        organizationName,
        organizationLogoUrl,
        organizationType: r.organization?.type || null,
        languageCode: r.course.languageCode || 'en',
        contentGroupId: r.course.contentGroupId || null,
        isLanguageFallback: !!normalizedLanguageCode && String(r.course.languageCode || 'en').toLowerCase() !== normalizedLanguageCode,
        estimatedDuration: r.course.estimatedDuration,
        createdAt: r.course.createdAt,
      };
    }));

    return { courses: enrichedCourses, total: Number(total) };
  }

  /**
   * Get public course details for preview page
   * CRITICAL: Only returns course if visibility='public'
   * Includes reviews, lessons outline (no content), and organization info
   */
  static async getPublicCourseDetails(courseId: string): Promise<any | null> {
    await this.selfHealDuplicateCourseLessons(courseId);
    await this.syncCourseLessonOrderFromFramework(courseId);

    // Get course with category - STRICT visibility check
    const result = await db
      .select({
        course: courses,
        category: courseCategories,
        organization: organizations,
      })
      .from(courses)
      .leftJoin(courseCategories, eq(courses.categoryId, courseCategories.id))
      .innerJoin(organizations, eq(courses.organizationId, organizations.id))
      .where(and(
        eq(courses.id, courseId),
        eq(courses.visibility, 'public'),
        eq(courses.status, 'active')
      ))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const { course, category, organization } = result[0];

    // Get lessons outline (titles only, no content for non-enrolled users)
    const lessonLinks = await db
      .select({
        lesson: lessons,
        courseLesson: courseLessons,
      })
      .from(courseLessons)
      .innerJoin(lessons, eq(courseLessons.lessonId, lessons.id))
      .where(eq(courseLessons.courseId, courseId))
      .orderBy(asc(courseLessons.topicOrder));

    // Get public reviews (all reviews for public courses are visible)
    const reviews = await db
      .select()
      .from(courseReviews)
      .where(and(
        eq(courseReviews.courseId, courseId),
        eq(courseReviews.isVisible, true)
      ))
      .orderBy(desc(courseReviews.createdAt))
      .limit(10);

    // Get signed thumbnail URL
    let thumbnailSignedUrl: string | undefined;
    if (course.thumbnailUrl) {
      try {
        thumbnailSignedUrl = await objectStorageService.getCourseThumbnailSignedURL(
          course.thumbnailUrl,
          3600
        );
      } catch (error) {
        console.error(`[CourseService] Failed to get signed URL for thumbnail: ${course.thumbnailUrl}`, error);
      }
    }

    return {
      id: course.id,
      title: course.title,
      description: course.description,
      thumbnailUrl: thumbnailSignedUrl || course.thumbnailUrl,
      price: course.price,
      currency: course.currency,
      visibility: course.visibility,
      categoryId: course.categoryId,
      categoryName: category?.name || null,
      difficultyLevel: course.difficultyLevel,
      estimatedDuration: course.estimatedDuration,
      averageRating: course.averageRating || '0.00',
      totalRatings: course.totalRatings || 0,
      organizationId: course.organizationId,
      createdAt: course.createdAt,
      organization: {
        id: organization.id,
        name: organization.name,
      },
      lessonsOutline: lessonLinks.map((l, idx) => ({
        order: idx + 1,
        title: l.lesson.title,
        topicOrder: l.courseLesson.topicOrder,
      })),
      reviews: reviews.map(r => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        displayName: r.reviewerDisplayName || r.displayName,
        createdAt: r.createdAt,
      })),
    };
  }
}
