/**
 * PHASE 1.2: Lesson Progress Service
 * 
 * Handles learner lesson completion tracking and daily streak management.
 * 
 * Service-Layer Invariants:
 * - completedAt MUST be set when status = "completed"
 * - Streak updates use normalized date comparison (ignoring time) to avoid timezone drift
 * - Progress updates must respect organization isolation
 * - percentComplete must be 100 when status = "completed"
 */

import { db } from "../db";
import { lessonProgress, lessonProgressSlides, dailyStreaks, lessons, users, organizations, courseLessons, userQuizProgress } from "../../shared/schema";
import { eq, and, sql, inArray, asc } from "drizzle-orm";
import { CourseCompletionService } from "./courseCompletionService";

export class LessonProgressService {
  /**
   * Check if user has passed the quiz linked to a lesson in a course context
   * Returns: { requiresQuiz: boolean, quizPassed: boolean, isFirstLesson: boolean }
   */
  static async checkQuizRequirementForLesson(params: {
    lessonId: string;
    userId: string;
    organizationId: string;
  }): Promise<{
    requiresQuiz: boolean;
    quizPassed: boolean;
    isFirstLesson: boolean;
    courseId: string | null;
    quizId: string | null;
  }> {
    const { lessonId, userId, organizationId } = params;

    // Evaluate all course lesson contexts deterministically (a lesson can be linked into multiple courses).
    const courseLessonData = await db
      .select({
        courseId: courseLessons.courseId,
        topicOrder: courseLessons.topicOrder,
        primaryQuizId: courseLessons.primaryQuizId,
      })
      .from(courseLessons)
      .where(eq(courseLessons.lessonId, lessonId))
      .orderBy(asc(courseLessons.topicOrder), asc(courseLessons.courseId));

    // If lesson is not part of any course, no quiz requirement
    if (courseLessonData.length === 0) {
      return { requiresQuiz: false, quizPassed: false, isFirstLesson: false, courseId: null, quizId: null };
    }

    const primaryContext = courseLessonData[0];
    const candidateQuizIds = Array.from(
      new Set(
        courseLessonData
          .filter((row) => Number(row.topicOrder || 0) !== 1 && !!row.primaryQuizId)
          .map((row) => String(row.primaryQuizId))
      )
    );
    if (candidateQuizIds.length === 0) {
      return {
        requiresQuiz: false,
        quizPassed: false,
        isFirstLesson: Number(primaryContext.topicOrder || 0) === 1,
        courseId: primaryContext.courseId,
        quizId: primaryContext.primaryQuizId || null,
      };
    }

    const quizProgressData = await db
      .select({
        collectionId: userQuizProgress.collectionId,
        passedAt: userQuizProgress.passedAt,
        completionStatus: userQuizProgress.completionStatus,
      })
      .from(userQuizProgress)
      .where(
        and(
          inArray(userQuizProgress.collectionId, candidateQuizIds),
          eq(userQuizProgress.userId, userId),
          eq(userQuizProgress.organizationId, organizationId)
        )
      );

    const passedQuizIds = new Set(
      quizProgressData
        .filter((row) => row.passedAt !== null || row.completionStatus === "completed_passed")
        .map((row) => String(row.collectionId))
    );

    const blockingContext = courseLessonData.find((row) =>
      Number(row.topicOrder || 0) !== 1 &&
      !!row.primaryQuizId &&
      !passedQuizIds.has(String(row.primaryQuizId))
    );

    if (blockingContext) {
      return {
        requiresQuiz: true,
        quizPassed: false,
        isFirstLesson: false,
        courseId: blockingContext.courseId,
        quizId: blockingContext.primaryQuizId || null,
      };
    }

    return {
      requiresQuiz: true,
      quizPassed: true,
      isFirstLesson: false,
      courseId: primaryContext.courseId,
      quizId: primaryContext.primaryQuizId || null,
    };
  }

  /**
   * Upsert lesson progress for a user using atomic ON CONFLICT
   * Creates or updates progress record based on unique constraint (lessonId, userId)
   * Automatically calculates slidesViewedCount from percentComplete and totalSlides
   */
  static async upsertProgress(params: {
    lessonId: string;
    userId: string;
    organizationId: string;
    status?: "not_started" | "in_progress" | "completed";
    percentComplete?: number;
    secondsSpent?: number;
    lastCheckpoint?: string;
  }) {
    const {
      lessonId,
      userId,
      organizationId,
      status,
      percentComplete,
      secondsSpent,
      lastCheckpoint,
    } = params;

    // Validate bounds
    if (percentComplete !== undefined && (percentComplete < 0 || percentComplete > 100)) {
      throw new Error("percentComplete must be between 0 and 100");
    }
    if (secondsSpent !== undefined && secondsSpent < 0) {
      throw new Error("secondsSpent must be non-negative");
    }

    // Get lesson metadata to determine totalSlides
    const lessonData = await db
      .select({
        id: lessons.id,
        metadata: lessons.metadata,
      })
      .from(lessons)
      .where(
        and(
          eq(lessons.id, lessonId),
          eq(lessons.organizationId, organizationId)
        )
      )
      .limit(1);

    const totalSlides = lessonData.length > 0 ? 
      ((lessonData[0].metadata as any)?.numCards || (lessonData[0].metadata as any)?.slideCount || 0) : 0;

    // Calculate slidesViewedCount from percentComplete
    let slidesViewedCount: number | undefined;
    if (percentComplete !== undefined && totalSlides > 0) {
      slidesViewedCount = Math.floor((percentComplete / 100) * totalSlides);
    }

    // Atomic upsert using ON CONFLICT with org isolation
    const [result] = await db
      .insert(lessonProgress)
      .values({
        lessonId,
        userId,
        organizationId,
        status: status || "not_started",
        percentComplete: percentComplete || 0,
        secondsSpent: secondsSpent || 0,
        lastCheckpoint,
        totalSlides,
        slidesViewedCount: slidesViewedCount || 0,
      })
      .onConflictDoUpdate({
        target: [lessonProgress.lessonId, lessonProgress.userId, lessonProgress.organizationId],
        set: {
          ...(status !== undefined && { status }),
          ...(percentComplete !== undefined && { percentComplete }),
          ...(secondsSpent !== undefined && { secondsSpent }),
          ...(lastCheckpoint !== undefined && { lastCheckpoint }),
          ...(slidesViewedCount !== undefined && { slidesViewedCount }),
          totalSlides,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result;
  }

  /**
   * Track a slide view for a user's lesson progress
   * - Creates progress record if it doesn't exist (with totalSlides from lesson metadata)
   * - Inserts slide view record (idempotent via unique constraint)
   * - Increments slidesViewedCount atomically
   * - Recalculates percentComplete
   * - Auto-updates status (not_started → in_progress → completed)
   * - Returns updated progress with slide count
   */
  static async trackSlideView(params: {
    lessonId: string;
    userId: string;
    organizationId: string;
    slideIndex: number;
  }) {
    const { lessonId, userId, organizationId, slideIndex } = params;

    // Get lesson metadata to determine totalSlides
    const lessonData = await db
      .select({
        id: lessons.id,
        metadata: lessons.metadata,
      })
      .from(lessons)
      .where(
        and(
          eq(lessons.id, lessonId),
          eq(lessons.organizationId, organizationId)
        )
      )
      .limit(1);

    if (lessonData.length === 0) {
      throw new Error("Lesson not found");
    }

    const totalSlides = (lessonData[0].metadata as any)?.numCards || (lessonData[0].metadata as any)?.slideCount || 0;

    // Execute in transaction for atomicity
    return await db.transaction(async (tx) => {
      // Ensure progress record exists with totalSlides initialized
      const [progressRecord] = await tx
        .insert(lessonProgress)
        .values({
          lessonId,
          userId,
          organizationId,
          status: "not_started",
          totalSlides,
          slidesViewedCount: 0,
          percentComplete: 0,
        })
        .onConflictDoUpdate({
          target: [lessonProgress.lessonId, lessonProgress.userId, lessonProgress.organizationId],
          set: {
            // Update totalSlides in case lesson was modified
            totalSlides,
            updatedAt: new Date(),
          },
        })
        .returning();

      // Try to insert slide view record (idempotent via unique constraint)
      try {
        await tx
          .insert(lessonProgressSlides)
          .values({
            lessonProgressId: progressRecord.id,
            slideIndex,
          })
          .onConflictDoNothing(); // Ignore if already viewed
      } catch (error) {
        // Slide already viewed, continue
      }

      // Count unique slides viewed
      const slideCount = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(lessonProgressSlides)
        .where(eq(lessonProgressSlides.lessonProgressId, progressRecord.id));

      const slidesViewedCount = slideCount[0]?.count || 0;

      // Calculate percent complete
      const percentComplete = totalSlides > 0 ? Math.round((slidesViewedCount / totalSlides) * 100) : 0;

      // Determine status
      let newStatus: "not_started" | "in_progress" | "completed" = "not_started";
      if (slidesViewedCount > 0 && slidesViewedCount < totalSlides) {
        newStatus = "in_progress";
      } else if (slidesViewedCount >= totalSlides && progressRecord.status === "completed") {
        // Keep completed status if already completed
        newStatus = "completed";
      } else if (slidesViewedCount >= totalSlides) {
        // All slides viewed but not explicitly marked complete
        newStatus = "in_progress";
      }

      // Update progress with new counts and status
      const [updatedProgress] = await tx
        .update(lessonProgress)
        .set({
          slidesViewedCount,
          percentComplete,
          status: newStatus,
          lastCheckpoint: slideIndex.toString(),
          updatedAt: new Date(),
        })
        .where(eq(lessonProgress.id, progressRecord.id))
        .returning();

      return updatedProgress;
    });
  }

  /**
   * Finalize lesson completion with full transaction support
   * - Checks quiz pass requirement (if lesson has linked quiz and is not first lesson)
   * - Sets status to "completed", percentComplete to 100
   * - Updates daily streak with normalized date logic
   * - Increments completion count only on first completion
   * - Updates course progress (completedLessons count)
   * - All operations within transaction for atomicity
   */
  static async finalizeCompletion(params: {
    lessonId: string;
    userId: string;
    organizationId: string;
    secondsSpent?: number;
  }) {
    const { lessonId, userId, organizationId, secondsSpent } = params;

    // Verify lesson exists and belongs to organization
    const lessonData = await db
      .select()
      .from(lessons)
      .where(
        and(
          eq(lessons.id, lessonId),
          eq(lessons.organizationId, organizationId)
        )
      )
      .limit(1);

    if (lessonData.length === 0) {
      throw new Error("Lesson not found or does not belong to this organization");
    }
    const lessonMetadata = (lessonData[0].metadata as any) || {};
    const lessonTotalSlides = Number(lessonMetadata?.numCards || lessonMetadata?.slideCount || 0) || 0;

    // Check quiz requirement for this lesson
    const quizRequirement = await this.checkQuizRequirementForLesson({
      lessonId,
      userId,
      organizationId,
    });

    // If quiz is required (lesson has quiz and is not first lesson), verify pass
    if (quizRequirement.requiresQuiz && !quizRequirement.quizPassed) {
      throw new Error(
        `Cannot complete lesson: quiz ${quizRequirement.quizId} must be passed first. ` +
        `This lesson requires passing the linked quiz before it can be marked as complete.`
      );
    }

    console.log(
      `[LessonProgressService] Finalizing completion for lesson ${lessonId}: ` +
      `requiresQuiz=${quizRequirement.requiresQuiz}, quizPassed=${quizRequirement.quizPassed}, ` +
      `isFirstLesson=${quizRequirement.isFirstLesson}, courseId=${quizRequirement.courseId}`
    );

    // Execute completion in transaction with advisory lock to prevent concurrent races
    return await db.transaction(async (tx) => {
      // Acquire advisory lock using composite key (lessonId + userId + organizationId)
      // Ensures org isolation and prevents lock contention on unrelated completions
      await tx.execute(sql`SELECT pg_advisory_xact_lock(
        hashtext(${lessonId}::text || ${userId}::text || ${organizationId}::text)
      )`);

      // Check current progress state under lock with org isolation
      const existing = await tx
        .select()
        .from(lessonProgress)
        .where(
          and(
            eq(lessonProgress.lessonId, lessonId),
            eq(lessonProgress.userId, userId),
            eq(lessonProgress.organizationId, organizationId)
          )
        )
        .limit(1);

      const wasAlreadyCompleted = existing.length > 0 && existing[0].status === "completed";
      const wasFirstCompletion = !wasAlreadyCompleted;

      // Validate that all slides have been viewed before allowing completion
      {
        const cachedSlidesViewedCount = Number(existing[0]?.slidesViewedCount || 0);
        const totalSlides = Number(existing[0]?.totalSlides || lessonTotalSlides || 0);
        let slidesViewedCount = cachedSlidesViewedCount;

        // Reconcile stale cached counts with the actual slide-view table when possible.
        if (totalSlides > 0 && cachedSlidesViewedCount < totalSlides && existing[0]?.id) {
          const actualSlideViewCount = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(lessonProgressSlides)
            .where(eq(lessonProgressSlides.lessonProgressId, existing[0].id))
            .limit(1);
          slidesViewedCount = Number(actualSlideViewCount[0]?.count || 0);
        }

        if (totalSlides > 0 && slidesViewedCount < totalSlides) {
          throw new Error(`Cannot complete lesson: only ${slidesViewedCount}/${totalSlides} slides viewed`);
        }
      }

      // Upsert progress to completed state with org isolation
      const [progressData] = await tx
        .insert(lessonProgress)
        .values({
          lessonId,
          userId,
          organizationId,
          status: "completed",
          percentComplete: 100,
          secondsSpent: secondsSpent || 0,
          totalSlides: lessonTotalSlides,
          slidesViewedCount: lessonTotalSlides,
          completedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [lessonProgress.lessonId, lessonProgress.userId, lessonProgress.organizationId],
          set: {
            status: "completed",
            percentComplete: 100,
              ...(secondsSpent !== undefined && { secondsSpent }),
              totalSlides: lessonTotalSlides,
              slidesViewedCount: lessonTotalSlides,
              updatedAt: new Date(),
            // Preserve original completedAt if this was already completed
            ...(wasAlreadyCompleted && existing[0].completedAt && { completedAt: existing[0].completedAt }),
          },
        })
        .returning();

      // Increment lesson completion count only on first completion
      if (wasFirstCompletion) {
        await tx
          .update(lessons)
          .set({ completionCount: sql`${lessons.completionCount} + 1` })
          .where(eq(lessons.id, lessonId));
      }

      return {
        progress: progressData,
        isFirstCompletion: wasFirstCompletion,
      };
    }).then(async (result) => {
      // After transaction commits successfully, update streak and course progress
      // NOTE: Certificate issuance moved to quiz pass flow (see QuizProgressService)
      
      // Update daily streak asynchronously (non-critical)
      setImmediate(() => {
        this.updateDailyStreak(userId, organizationId).catch(err => {
          console.error("[LessonProgressService] Streak update failed:", err);
        });
      });

      // Update course progress if this lesson is part of a course (only on first completion)
      if (result.isFirstCompletion && quizRequirement.courseId) {
        try {
          await this.updateCourseProgressForLesson({
            courseId: quizRequirement.courseId,
            userId,
            organizationId,
          });
          console.log(
            `[LessonProgressService] Updated course progress for course ${quizRequirement.courseId}`
          );
        } catch (err) {
          console.error("[LessonProgressService] Course progress update failed:", err);
        }
      }

      // Update challenge progress for lesson_completions (only on first completion)
      if (result.isFirstCompletion) {
        setImmediate(async () => {
          try {
            const { gamificationService } = await import("../gamificationService");
            const { CHALLENGE_GOAL_TYPES } = await import("../../shared/challengeConstants");
            
            // Ensure challenge progress exists before querying
            await gamificationService.ensureChallengeProgress(userId);
            const userChallenges = await gamificationService.getUserChallengeProgress(userId);
            for (const challenge of userChallenges) {
              if ((challenge as any).goalType === CHALLENGE_GOAL_TYPES.LESSON_COMPLETIONS && !challenge.isCompleted && !challenge.isClaimed) {
                await gamificationService.updateChallengeProgress(userId, challenge.challengeId, 1);
                console.log(`🎯 Updated challenge progress: ${(challenge as any).title} (lesson_completions)`);
              }
            }
          } catch (err) {
            console.error("[LessonProgressService] Challenge progress update failed:", err);
          }
        });
      }

      return {
        ...result,
        certificate: null, // Certificates now issued only after passing linked quiz
        courseId: quizRequirement.courseId,
      };
    });
  }

  /**
   * Update course progress when a lesson is completed
   * Uses recalculateAndUpdateCourseProgress() for accurate dual-mechanism calculation
   * that considers quiz passes, auto-complete lessons, and legacy completion records.
   */
  private static async updateCourseProgressForLesson(params: {
    courseId: string;
    userId: string;
    organizationId: string;
  }) {
    const { courseId, userId, organizationId } = params;

    // Use the centralized recalculation method from CourseCompletionService
    // This ensures consistent progress calculation using dual-mechanism logic
    await CourseCompletionService.recalculateAndUpdateCourseProgress(
      userId,
      courseId,
      organizationId
    );

    console.log(
      `[LessonProgressService] Triggered course progress recalculation for course ${courseId}`
    );
  }

  /**
   * Update daily streak with normalized date logic
   * Compares dates at midnight UTC to avoid timezone drift
   */
  private static async updateDailyStreak(userId: string, organizationId: string) {
    // Get today's date normalized to midnight UTC
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

    // Get existing streak record
    const existing = await db
      .select()
      .from(dailyStreaks)
      .where(
        and(
          eq(dailyStreaks.userId, userId),
          eq(dailyStreaks.organizationId, organizationId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      // Create first streak record
      await db.insert(dailyStreaks).values({
        userId,
        organizationId,
        currentStreak: 1,
        bestStreak: 1,
        lastCompletedDate: todayStr,
      });
      return;
    }

    const streak = existing[0];
    const lastDate = streak.lastCompletedDate ? new Date(streak.lastCompletedDate + 'T00:00:00Z') : null;

    if (!lastDate) {
      // First completion after creation
      await db
        .update(dailyStreaks)
        .set({
          currentStreak: 1,
          bestStreak: Math.max(1, streak.bestStreak || 0),
          lastCompletedDate: todayStr,
          updatedAt: new Date(),
        })
        .where(eq(dailyStreaks.id, streak.id));
      return;
    }

    // Calculate day difference (normalized)
    const daysDiff = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff === 0) {
      // Already completed today, no update needed
      return;
    } else if (daysDiff === 1) {
      // Consecutive day - increment streak
      const newStreak = (streak.currentStreak || 0) + 1;
      await db
        .update(dailyStreaks)
        .set({
          currentStreak: newStreak,
          bestStreak: Math.max(newStreak, streak.bestStreak || 0),
          lastCompletedDate: todayStr,
          updatedAt: new Date(),
        })
        .where(eq(dailyStreaks.id, streak.id));
    } else {
      // Streak broken - reset to 1
      await db
        .update(dailyStreaks)
        .set({
          currentStreak: 1,
          lastCompletedDate: todayStr,
          updatedAt: new Date(),
        })
        .where(eq(dailyStreaks.id, streak.id));
    }
  }

  /**
   * Get lesson progress for a user (org-scoped)
   */
  static async getProgress(lessonId: string, userId: string, organizationId: string) {
    const [progress] = await db
      .select()
      .from(lessonProgress)
      .where(
        and(
          eq(lessonProgress.lessonId, lessonId),
          eq(lessonProgress.userId, userId),
          eq(lessonProgress.organizationId, organizationId)
        )
      )
      .limit(1);

    return progress || null;
  }

  /**
   * Get user's current streak
   */
  static async getUserStreak(userId: string, organizationId: string) {
    const [streak] = await db
      .select()
      .from(dailyStreaks)
      .where(
        and(
          eq(dailyStreaks.userId, userId),
          eq(dailyStreaks.organizationId, organizationId)
        )
      )
      .limit(1);

    return streak || null;
  }

  /**
   * Get all completed lessons for a user
   */
  static async getCompletedLessons(userId: string, organizationId: string) {
    return await db
      .select()
      .from(lessonProgress)
      .where(
        and(
          eq(lessonProgress.userId, userId),
          eq(lessonProgress.organizationId, organizationId),
          eq(lessonProgress.status, "completed")
        )
      )
      .orderBy(sql`${lessonProgress.completedAt} DESC`);
  }
}
