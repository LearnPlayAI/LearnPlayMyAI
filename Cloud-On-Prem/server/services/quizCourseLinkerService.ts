import { db } from '../db';
import {
  lessonQuizLinks,
  courseLessons,
  quizCollections,
  lessons,
  bulkQuizGenerationJobs,
  type LessonQuizLink,
  type BulkQuizGenerationJob,
} from '@shared/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { CreditService, InsufficientCreditsError } from './creditService';
import { quizPricingService } from './quizPricingService';
import { isQuizCreditChargingEnabled } from '../featureFlags';
import type { QuizTier } from '@shared/creditConstants';

export interface LinkQuizInput {
  lessonId: string;
  quizId: string;
  isPrimary?: boolean;
  presentationVersionId?: number;
  slideContentHash?: string;
}

export interface BulkQuizJobStatus {
  job: BulkQuizGenerationJob;
  progress: number;
  estimatedTimeRemaining: number | null;
  failedLessons: Array<{
    lessonId: string;
    error: string;
  }>;
}

export class QuizCourseLinkerService {
  /**
   * Link a quiz to a course lesson
   */
  static async linkQuizToLesson(input: LinkQuizInput): Promise<LessonQuizLink> {
    // Check if link already exists
    const existing = await db
      .select()
      .from(lessonQuizLinks)
      .where(
        and(
          eq(lessonQuizLinks.lessonId, input.lessonId),
          eq(lessonQuizLinks.quizId, input.quizId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing link instead of throwing error
      const [updated] = await db
        .update(lessonQuizLinks)
        .set({
          isPrimary: input.isPrimary ?? existing[0].isPrimary,
          presentationVersionId: input.presentationVersionId ?? existing[0].presentationVersionId,
          slideContentHash: input.slideContentHash ?? existing[0].slideContentHash,
          isOutdated: false,
        })
        .where(eq(lessonQuizLinks.id, existing[0].id))
        .returning();
      console.log(`[QuizCourseLinker] Updated existing quiz link: quiz ${input.quizId} -> lesson ${input.lessonId}`);
      return updated;
    }

    const link = await db
      .insert(lessonQuizLinks)
      .values({
        lessonId: input.lessonId,
        quizId: input.quizId,
        isPrimary: input.isPrimary ?? false,
        presentationVersionId: input.presentationVersionId,
        slideContentHash: input.slideContentHash,
        isOutdated: false,
      })
      .returning();

    console.log(`[QuizCourseLinker] Quiz ${input.quizId} linked to lesson ${input.lessonId}`);

    // Also update courseLessons.primaryQuizId if this is primary or no primary exists
    await this.updateCourseLessonPrimaryQuiz(input.lessonId, input.quizId, input.isPrimary);

    return link[0];
  }

  /**
   * Update courseLessons.primaryQuizId when a quiz is linked
   */
  static async updateCourseLessonPrimaryQuiz(lessonId: string, quizId: string, isPrimary?: boolean): Promise<void> {
    try {
      // Get all courseLessons entries for this lesson
      const courseLessonRows = await db
        .select()
        .from(courseLessons)
        .where(eq(courseLessons.lessonId, lessonId));

      if (courseLessonRows.length === 0) {
        console.log(`[QuizCourseLinker] Lesson ${lessonId} not linked to any course, skipping primaryQuizId update`);
        return;
      }

      // Update primaryQuizId if: it's explicitly primary, OR no primary quiz exists yet
      for (const cl of courseLessonRows) {
        if (isPrimary || !cl.primaryQuizId) {
          await db
            .update(courseLessons)
            .set({ primaryQuizId: quizId })
            .where(eq(courseLessons.id, cl.id));
          console.log(`[QuizCourseLinker] Updated courseLessons.primaryQuizId for course ${cl.courseId}, lesson ${lessonId} -> quiz ${quizId}`);
        }
      }
    } catch (error) {
      console.error(`[QuizCourseLinker] Error updating courseLessons.primaryQuizId:`, error);
    }
  }

  /**
   * Ensure quiz-lesson link exists (idempotent upsert)
   * Called when quiz draft is created with lessonId to establish provisional link
   */
  static async ensureQuizLessonLink(lessonId: string, quizId: string, isPrimary: boolean = false): Promise<LessonQuizLink> {
    return this.linkQuizToLesson({
      lessonId,
      quizId,
      isPrimary,
    });
  }

  /**
   * Get quizzes for a lesson
   */
  static async getLessonQuizzes(lessonId: string): Promise<Array<{
    link: LessonQuizLink;
    quiz: typeof quizCollections.$inferSelect;
  }>> {
    const links = await db
      .select({
        link: lessonQuizLinks,
        quiz: quizCollections,
      })
      .from(lessonQuizLinks)
      .innerJoin(quizCollections, eq(lessonQuizLinks.quizId, quizCollections.id))
      .where(eq(lessonQuizLinks.lessonId, lessonId));

    return links;
  }

  /**
   * Get quizzes for all lessons in a course
   */
  static async getCourseQuizzes(courseId: string): Promise<Record<string, Array<{
    link: LessonQuizLink;
    quiz: typeof quizCollections.$inferSelect;
  }>>> {
    // Get all course lessons
    const courseLessonsList = await db
      .select()
      .from(courseLessons)
      .where(eq(courseLessons.courseId, courseId));

    const lessonIds = courseLessonsList.map((cl) => cl.lessonId);

    if (lessonIds.length === 0) {
      return {};
    }

    // Get all quiz links for these lessons
    const links = await db
      .select({
        link: lessonQuizLinks,
        quiz: quizCollections,
      })
      .from(lessonQuizLinks)
      .innerJoin(quizCollections, eq(lessonQuizLinks.quizId, quizCollections.id))
      .where(inArray(lessonQuizLinks.lessonId, lessonIds));

    // Group by lesson
    const quizzesByLesson: Record<string, Array<{
      link: LessonQuizLink;
      quiz: typeof quizCollections.$inferSelect;
    }>> = {};

    for (const lessonId of lessonIds) {
      quizzesByLesson[lessonId] = links.filter((l) => l.link.lessonId === lessonId);
    }

    return quizzesByLesson;
  }

  /**
   * Unlink quiz from lesson
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

    console.log(`[QuizCourseLinker] Quiz ${quizId} unlinked from lesson ${lessonId}`);
  }

  /**
   * Create bulk quiz generation job for a course
   */
  static async createBulkQuizJob(
    courseId: string,
    organizationId: string,
    createdBy: string
  ): Promise<BulkQuizGenerationJob> {
    // Get all lessons for this course and keep only content lessons.
    const allCourseLessons = await db
      .select()
      .from(courseLessons)
      .where(eq(courseLessons.courseId, courseId));

    if (allCourseLessons.length === 0) {
      throw new Error('No lessons found for this course');
    }

    const minTopicOrder = Math.min(...allCourseLessons.map((cl) => cl.topicOrder));
    const maxTopicOrder = Math.max(...allCourseLessons.map((cl) => cl.topicOrder));
    const contentLessons = allCourseLessons.filter((cl) => {
      const effectiveType =
        cl.lessonType ||
        (cl.topicOrder === minTopicOrder
          ? 'overview'
          : cl.topicOrder === maxTopicOrder
            ? 'key_takeaways'
            : 'content');
      return effectiveType === 'content';
    });

    if (contentLessons.length === 0) {
      throw new Error('No content lessons found for this course');
    }

    const job = await db
      .insert(bulkQuizGenerationJobs)
      .values({
        courseId,
        organizationId,
        createdBy,
        status: 'pending',
        totalLessons: contentLessons.length,
        completedLessons: 0,
        failedLessons: 0,
        jobResults: {},
      })
      .returning();

    console.log(`Bulk quiz generation job created for course ${courseId}: ${job[0].id}`);

    return job[0];
  }

  /**
   * Update bulk quiz job progress
   */
  static async updateBulkQuizJob(
    jobId: string,
    updates: {
      status?: 'pending' | 'in_progress' | 'completed' | 'failed';
      completedLessons?: number;
      failedLessons?: number;
      jobResults?: any;
    }
  ): Promise<BulkQuizGenerationJob> {
    const updated = await db
      .update(bulkQuizGenerationJobs)
      .set({
        ...updates,
        completedAt: updates.status === 'completed' || updates.status === 'failed' ? new Date() : undefined,
      })
      .where(eq(bulkQuizGenerationJobs.id, jobId))
      .returning();

    return updated[0];
  }

  /**
   * Get bulk quiz job status
   */
  static async getBulkQuizJobStatus(jobId: string): Promise<BulkQuizJobStatus> {
    const job = await db
      .select()
      .from(bulkQuizGenerationJobs)
      .where(eq(bulkQuizGenerationJobs.id, jobId))
      .limit(1);

    if (!job.length) {
      throw new Error('Bulk quiz job not found');
    }

    const totalLessons = Number(job[0].totalLessons || 0);
    const completedLessons = Number(job[0].completedLessons || 0);
    const progress = totalLessons > 0
      ? (completedLessons / totalLessons) * 100
      : 0;

    // Estimate time remaining (assuming 30 seconds per lesson)
    const remainingLessons = totalLessons - completedLessons;
    const estimatedTimeRemaining = job[0].status === 'in_progress' ? remainingLessons * 30 : null;

    // Extract failed lessons from job results
    const failedLessons = (job[0].jobResults as any)?.failures || [];

    return {
      job: job[0],
      progress,
      estimatedTimeRemaining,
      failedLessons,
    };
  }

  /**
   * Get all bulk quiz jobs for a course
   */
  static async getCourseBulkQuizJobs(courseId: string): Promise<BulkQuizGenerationJob[]> {
    return await db
      .select()
      .from(bulkQuizGenerationJobs)
      .where(eq(bulkQuizGenerationJobs.courseId, courseId))
      .orderBy(desc(bulkQuizGenerationJobs.createdAt));
  }

  /**
   * Check if lesson has quiz completion (for progress tracking)
   */
  static async checkLessonQuizCompletion(
    userId: string,
    lessonId: string
  ): Promise<boolean> {
    // Get all quizzes for this lesson
    const quizzes = await this.getLessonQuizzes(lessonId);

    if (quizzes.length === 0) {
      // No quizzes required, consider complete
      return true;
    }

    // Check if user has completed all required quizzes
    // This would integrate with existing quiz progress tracking
    // For now, return false as placeholder
    // TODO: Integrate with userQuizProgress table

    return false;
  }

  /**
   * Generate quizzes for all lessons in a course (API wrapper)
   * This creates a bulk quiz generation job that can be tracked
   * If credit charging is enabled, verifies user has sufficient credits
   */
  static async generateBulkQuizzes(
    courseId: string,
    organizationId: string,
    createdBy?: string,
    userId?: string
  ): Promise<BulkQuizGenerationJob> {
    // Use the first admin user if createdBy not provided
    const creator = createdBy || 'system';
    const effectiveUserId = userId || creator;
    
    // Get lesson count to estimate credit cost (content lessons only).
    const allCourseLessons = await db
      .select()
      .from(courseLessons)
      .where(eq(courseLessons.courseId, courseId));

    if (allCourseLessons.length === 0) {
      throw new Error('No lessons found for this course');
    }

    const minTopicOrder = Math.min(...allCourseLessons.map((cl) => cl.topicOrder));
    const maxTopicOrder = Math.max(...allCourseLessons.map((cl) => cl.topicOrder));
    const lessonCount = allCourseLessons.filter((cl) => {
      const effectiveType =
        cl.lessonType ||
        (cl.topicOrder === minTopicOrder
          ? 'overview'
          : cl.topicOrder === maxTopicOrder
            ? 'key_takeaways'
            : 'content');
      return effectiveType === 'content';
    }).length;

    if (lessonCount === 0) {
      throw new Error('No content lessons found for this course');
    }
    
    // Credit verification for bulk quiz generation (if feature flag enabled)
    if (isQuizCreditChargingEnabled() && effectiveUserId !== 'system') {
      try {
        // Default to tier "10" for bulk generation (10 questions per quiz)
        const defaultTier: QuizTier = '10';
        const creditPerQuiz = await quizPricingService.getTierCreditCost(organizationId, defaultTier);
        const totalCreditsRequired = creditPerQuiz * lessonCount;
        
        // Verify user has sufficient credits for all quizzes
        const { balance: creditBalance } = await CreditService.getCreditBalance(effectiveUserId, organizationId);
        
        console.log(
          `[Bulk Quiz Generation] Credit verification: User ${effectiveUserId}, Org ${organizationId}, ` +
          `Lessons: ${lessonCount}, Cost per quiz: ${creditPerQuiz}, Total required: ${totalCreditsRequired}, ` +
          `Available: ${creditBalance}`
        );
        
        if (creditBalance < totalCreditsRequired) {
          console.log(
            `[Bulk Quiz Generation] Insufficient credits for user ${effectiveUserId}. ` +
            `Required: ${totalCreditsRequired}, Available: ${creditBalance}`
          );
          throw new InsufficientCreditsError(creditBalance, totalCreditsRequired);
        }
        
        console.log(
          `[Bulk Quiz Generation] Credit verification passed. User has ${creditBalance} credits, ` +
          `${totalCreditsRequired} required for ${lessonCount} quizzes`
        );
      } catch (creditError) {
        if (creditError instanceof InsufficientCreditsError) {
          throw creditError;
        }
        console.error('[Bulk Quiz Generation] Credit verification error:', creditError);
        throw creditError;
      }
    } else {
      console.log(`[Bulk Quiz Generation] Credit charging disabled - creating job without credit verification`);
    }
    
    const job = await this.createBulkQuizJob(courseId, organizationId, creator);
    
    // Trigger async quiz generation (would be handled by background worker in production)
    // For now, we just return the job - the frontend can poll for status
    // Note: Actual credit deduction happens when each quiz is generated by the worker
    console.log(`Bulk quiz generation initiated for course ${courseId}, job ${job.id}`);
    
    return job;
  }

  /**
   * Get job status (API wrapper for getBulkQuizJobStatus)
   */
  static async getJobStatus(jobId: string): Promise<BulkQuizJobStatus> {
    return this.getBulkQuizJobStatus(jobId);
  }
}
