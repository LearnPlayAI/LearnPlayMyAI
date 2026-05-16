import { db } from "../db";
import {
  courses,
  courseLessons,
  userQuizProgress,
  certificates,
  users,
  organizations,
  courseProgress,
  lessonQuizLinks,
  quizGameResults,
  lessonProgress,
  userCourseLessonProgress,
  courseVersions,
} from "@shared/schema";
import { eq, and, inArray, sql, count, isNotNull, ne, gt, or, asc, desc } from "drizzle-orm";
import { CourseService } from './courseService';

export interface CourseQuizProgress {
  courseId: string;
  courseName: string;
  totalQuizCount: number;
  passedQuizCount: number;
  allQuizzesPassed: boolean;
  isEligibleForCertificate: boolean;
  hasExistingCertificate: boolean;
  quizDetails: Array<{
    lessonId: string;
    quizId: string;
    topicName: string;
    isPassed: boolean;
    passedAt: Date | null;
  }>;
}

export interface CourseCertificateEligibility {
  isEligible: boolean;
  reason: string;
  progress?: CourseQuizProgress;
  existingCertificateId?: string;
}

export interface LessonStatus {
  lessonId: string;
  topicName: string;
  topicOrder: number;
  quizId: string | null;
  status: 'not_started' | 'in_progress' | 'completed';
  passedAt: Date | null;
}

export interface CourseCompletionResult {
  isComplete: boolean;
  lessonsCompleted: number;
  totalLessons: number;
  lessonStatuses: LessonStatus[];
}

/**
 * CourseCompletionService - Determines course completion based on quiz progress
 * A course is "completed" when the user has passed ALL quizzes linked to lessons in that course.
 * Only courses with at least one quiz-linked lesson are eligible for course completion certificates.
 */
export class CourseCompletionService {
  /**
   * Compute the quiz progress for a course for a specific user.
   * Returns detailed progress including which quizzes are passed/pending.
   */
  static async computeCourseQuizProgress(
    courseId: string,
    userId: string
  ): Promise<CourseQuizProgress | null> {
    console.log(`[COURSE-COMPLETION] Computing quiz progress for userId=${userId}, courseId=${courseId}`);
    
    // Fetch the course
    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course) {
      console.log(`[COURSE-COMPLETION] Course not found for courseId=${courseId}`);
      return null;
    }

    console.log(`[COURSE-COMPLETION] Course found: ${course.title}`);

    // First, let's see ALL lessons in this course (for debugging)
    const allCourseLessons = await db
      .select({
        lessonId: courseLessons.lessonId,
        topicName: courseLessons.topicName,
        topicOrder: courseLessons.topicOrder,
        primaryQuizId: courseLessons.primaryQuizId,
      })
      .from(courseLessons)
      .where(eq(courseLessons.courseId, courseId))
      .orderBy(courseLessons.topicOrder);

    console.log(`[COURSE-COMPLETION] All lessons in course (${allCourseLessons.length} total):`, 
      allCourseLessons.map(l => ({ 
        topicName: l.topicName, 
        topicOrder: l.topicOrder, 
        hasPrimaryQuizId: !!l.primaryQuizId,
        primaryQuizId: l.primaryQuizId
      })));

    // Fetch all course lessons that have a primaryQuizId (lessons with linked quizzes)
    // IMPORTANT: Exclude topicOrder = 0 (overview lesson) and "Key Takeaways" from quiz requirements
    // Only lessons with topicOrder > 0 AND not "Key Takeaways" should require quiz completion for course certificate
    // This ensures we count actual content lessons (Lesson 1, Lesson 2, etc.)
    const lessonsWithQuizzes = await db
      .select({
        lessonId: courseLessons.lessonId,
        quizId: courseLessons.primaryQuizId,
        topicName: courseLessons.topicName,
        topicOrder: courseLessons.topicOrder,
      })
      .from(courseLessons)
      .where(
        and(
          eq(courseLessons.courseId, courseId),
          isNotNull(courseLessons.primaryQuizId),
          gt(courseLessons.topicOrder, 0), // Exclude topicOrder = 0 (overview lesson)
          sql`${courseLessons.topicName} != 'Key Takeaways'` // Exclude Key Takeaways section
        )
      )
      .orderBy(courseLessons.topicOrder);

    console.log(`[COURSE-COMPLETION] Filtered lessons (topicOrder > 1 with primaryQuizId) count: ${lessonsWithQuizzes.length}`,
      lessonsWithQuizzes.map(l => ({ topicName: l.topicName, topicOrder: l.topicOrder, quizId: l.quizId })));

    if (lessonsWithQuizzes.length === 0) {
      // No quizzes linked to this course - not eligible for course completion certificate
      console.log(`[COURSE-COMPLETION] No quizzes found - course not eligible for certificate`);
      return {
        courseId,
        courseName: course.title,
        totalQuizCount: 0,
        passedQuizCount: 0,
        allQuizzesPassed: false,
        isEligibleForCertificate: false,
        hasExistingCertificate: false,
        quizDetails: [],
      };
    }

    // Get the quiz IDs
    const quizIds = lessonsWithQuizzes.map((l) => l.quizId!);

    console.log(`[COURSE-COMPLETION] Quiz IDs to check (count=${quizIds.length}):`, quizIds);

    // Fetch user's quiz progress for these quizzes
    const progressRecords = await db
      .select()
      .from(userQuizProgress)
      .where(
        and(
          eq(userQuizProgress.userId, userId),
          inArray(userQuizProgress.collectionId, quizIds)
        )
      );

    console.log(`[COURSE-COMPLETION] User quiz progress records found (count=${progressRecords.length}):`,
      progressRecords.map(p => ({ 
        collectionId: p.collectionId, 
        isPassed: p.isPassed, 
        passedAt: p.passedAt 
      })));

    // Create a map for quick lookup
    const progressMap = new Map(
      progressRecords.map((p) => [p.collectionId, p])
    );

    // Build quiz details
    const quizDetails = lessonsWithQuizzes.map((lesson) => {
      const progress = progressMap.get(lesson.quizId!);
      return {
        lessonId: lesson.lessonId,
        quizId: lesson.quizId!,
        topicName: lesson.topicName,
        isPassed: progress?.isPassed ?? false,
        passedAt: progress?.passedAt ?? null,
      };
    });

    console.log(`[COURSE-COMPLETION] Quiz details:`,
      quizDetails.map(q => ({ 
        topicName: q.topicName, 
        quizId: q.quizId, 
        isPassed: q.isPassed 
      })));

    const passedQuizCount = quizDetails.filter((q) => q.isPassed).length;
    const allQuizzesPassed = passedQuizCount === quizDetails.length;

    console.log(`[COURSE-COMPLETION] Quiz summary - passed: ${passedQuizCount}/${quizDetails.length}, allPassed: ${allQuizzesPassed}`);

    // Check if user already has a course completion certificate
    const [existingCert] = await db
      .select({ id: certificates.id })
      .from(certificates)
      .where(
        and(
          eq(certificates.userId, userId),
          eq(certificates.courseId, courseId),
          eq(certificates.certificateType, "course")
        )
      )
      .limit(1);

    console.log(`[COURSE-COMPLETION] Existing certificate check:`, { hasExisting: !!existingCert });

    return {
      courseId,
      courseName: course.title,
      totalQuizCount: quizDetails.length,
      passedQuizCount,
      allQuizzesPassed,
      isEligibleForCertificate: allQuizzesPassed && quizDetails.length > 0,
      hasExistingCertificate: !!existingCert,
      quizDetails,
    };
  }

  /**
   * Check if a user is eligible for a course completion certificate.
   * Returns eligibility status with reason.
   * 
   * Requirements for eligibility:
   * 1. All required quizzes must be passed (excludes topicOrder = 1 overview lesson)
   * 2. If a courseProgress record exists, status must be "completed"
   * 3. User must not already have a course certificate
   */
  static async checkCertificateEligibility(
    courseId: string,
    userId: string
  ): Promise<CourseCertificateEligibility> {
    const progress = await this.computeCourseQuizProgress(courseId, userId);

    if (!progress) {
      return {
        isEligible: false,
        reason: "Course not found",
      };
    }

    if (progress.totalQuizCount === 0) {
      return {
        isEligible: false,
        reason: "This course has no quiz-linked lessons and is not eligible for a completion certificate",
        progress,
      };
    }

    if (progress.hasExistingCertificate) {
      // Find the existing certificate ID
      const [existingCert] = await db
        .select({ certificateId: certificates.certificateId })
        .from(certificates)
        .where(
          and(
            eq(certificates.userId, userId),
            eq(certificates.courseId, courseId),
            eq(certificates.certificateType, "course")
          )
        )
        .limit(1);

      return {
        isEligible: false,
        reason: "You have already earned a certificate for this course",
        progress,
        existingCertificateId: existingCert?.certificateId,
      };
    }

    if (!progress.allQuizzesPassed) {
      const remaining = progress.totalQuizCount - progress.passedQuizCount;
      return {
        isEligible: false,
        reason: `You need to pass ${remaining} more quiz${remaining > 1 ? "zes" : ""} to complete this course`,
        progress,
      };
    }

    // If all quizzes are passed, the user is eligible for a certificate
    // Note: We rely on quiz completion as the source of truth for course completion
    // The courseProgress table may be updated asynchronously or used for other purposes
    console.log(`[COURSE-COMPLETION] User is eligible for certificate - all quizzes passed`);

    return {
      isEligible: true,
      reason: "Congratulations! You have passed all quizzes and are eligible for your course completion certificate",
      progress,
    };
  }

  /**
   * Get all courses where the user is eligible for a certificate but hasn't claimed it yet.
   * Useful for showing "unclaimed certificates" notifications.
   */
  static async getUnclaimedCertificateCourses(
    userId: string
  ): Promise<Array<{ courseId: string; courseName: string; totalQuizzes: number }>> {
    // This is a more complex query - we need to find courses where:
    // 1. User has passed ALL quizzes linked to the course
    // 2. User does NOT have a course certificate for that course

    // Get all course certificates the user already has
    const existingCourseCerts = await db
      .select({ courseId: certificates.courseId })
      .from(certificates)
      .where(
        and(
          eq(certificates.userId, userId),
          eq(certificates.certificateType, "course"),
          isNotNull(certificates.courseId)
        )
      );

    const certifiedCourseIds = new Set(
      existingCourseCerts.map((c) => c.courseId).filter(Boolean)
    );

    // Get all courses with quiz-linked lessons (excluding topicOrder = 0 overview and Key Takeaways)
    const coursesWithQuizzes = await db
      .select({
        courseId: courseLessons.courseId,
        courseTitle: courses.title,
        quizId: courseLessons.primaryQuizId,
      })
      .from(courseLessons)
      .innerJoin(courses, eq(courses.id, courseLessons.courseId))
      .where(
        and(
          isNotNull(courseLessons.primaryQuizId),
          gt(courseLessons.topicOrder, 0), // Exclude topicOrder = 0 (overview)
          sql`${courseLessons.topicName} != 'Key Takeaways'` // Exclude Key Takeaways section
        )
      );

    // Group by course
    const courseQuizMap = new Map<string, { title: string; quizIds: string[] }>();
    for (const row of coursesWithQuizzes) {
      if (!courseQuizMap.has(row.courseId)) {
        courseQuizMap.set(row.courseId, { title: row.courseTitle, quizIds: [] });
      }
      if (row.quizId) {
        courseQuizMap.get(row.courseId)!.quizIds.push(row.quizId);
      }
    }

    // Check each course for completion
    const unclaimedCourses: Array<{ courseId: string; courseName: string; totalQuizzes: number }> = [];

    for (const [courseId, data] of Array.from(courseQuizMap.entries())) {
      // Skip if already certified
      if (certifiedCourseIds.has(courseId)) continue;

      // Check if user passed all quizzes
      const passedQuizzes = await db
        .select({ count: count() })
        .from(userQuizProgress)
        .where(
          and(
            eq(userQuizProgress.userId, userId),
            inArray(userQuizProgress.collectionId, data.quizIds),
            eq(userQuizProgress.isPassed, true)
          )
        );

      const passedCount = passedQuizzes[0]?.count ?? 0;

      if (passedCount === data.quizIds.length) {
        unclaimedCourses.push({
          courseId,
          courseName: data.title,
          totalQuizzes: data.quizIds.length,
        });
      }
    }

    return unclaimedCourses;
  }

  /**
   * Check if completing a quiz triggers eligibility for any course certificates.
   * Should be called after a quiz is passed.
   * Returns courses that became eligible after this quiz completion.
   */
  static async checkQuizCompletionTrigger(
    userId: string,
    quizId: string
  ): Promise<Array<{ courseId: string; courseName: string }>> {
    // Find all courses that include this quiz
    const coursesWithQuiz = await db
      .select({
        courseId: courseLessons.courseId,
        courseTitle: courses.title,
      })
      .from(courseLessons)
      .innerJoin(courses, eq(courses.id, courseLessons.courseId))
      .where(eq(courseLessons.primaryQuizId, quizId));

    const eligibleCourses: Array<{ courseId: string; courseName: string }> = [];

    for (const course of coursesWithQuiz) {
      const eligibility = await this.checkCertificateEligibility(
        course.courseId,
        userId
      );

      if (eligibility.isEligible) {
        eligibleCourses.push({
          courseId: course.courseId,
          courseName: course.courseTitle,
        });
      }
    }

    return eligibleCourses;
  }

  /**
   * Check if a user has completed a course.
   * A course is complete when ALL lesson quizzes are passed, EXCLUDING position 0 (overview lesson).
   * Uses quizGameResults to determine pass status.
   */
  static async checkCourseCompletion(
    userId: string,
    courseId: string,
    courseVersionId: string,
    organizationId: string
  ): Promise<CourseCompletionResult> {
    // Get all course lessons excluding position 0 (overview)
    const lessonsInCourse = await db
      .select({
        lessonId: courseLessons.lessonId,
        topicName: courseLessons.topicName,
        topicOrder: courseLessons.topicOrder,
        primaryQuizId: courseLessons.primaryQuizId,
      })
      .from(courseLessons)
      .where(
        and(
          eq(courseLessons.courseId, courseId),
          gt(courseLessons.topicOrder, 0) // Exclude position 0 (course overview)
        )
      )
      .orderBy(asc(courseLessons.topicOrder));

    if (lessonsInCourse.length === 0) {
      return {
        isComplete: false,
        lessonsCompleted: 0,
        totalLessons: 0,
        lessonStatuses: [],
      };
    }

    // Get all quiz IDs from lessons (includes primary quiz and lessonQuizLinks)
    const lessonIds = lessonsInCourse.map((l) => l.lessonId);

    // Check lessonQuizLinks for additional quiz mappings
    const quizLinks = await db
      .select({
        lessonId: lessonQuizLinks.lessonId,
        quizId: lessonQuizLinks.quizId,
        isPrimary: lessonQuizLinks.isPrimary,
      })
      .from(lessonQuizLinks)
      .where(inArray(lessonQuizLinks.lessonId, lessonIds));

    // Build a map of lessonId -> primary quizId (prioritize primaryQuizId from courseLessons, then isPrimary from links)
    const lessonQuizMap = new Map<string, string | null>();

    for (const lesson of lessonsInCourse) {
      // First use primaryQuizId from courseLessons
      if (lesson.primaryQuizId) {
        lessonQuizMap.set(lesson.lessonId, lesson.primaryQuizId);
      }
    }

    // Then check lessonQuizLinks for any primary marked quizzes
    for (const link of quizLinks) {
      if (link.isPrimary && !lessonQuizMap.has(link.lessonId)) {
        lessonQuizMap.set(link.lessonId, link.quizId);
      }
    }

    // Get all quiz IDs that need to be checked
    const quizIdsToCheck = Array.from(lessonQuizMap.values()).filter(Boolean) as string[];

    // Check quiz results - user passed if player1Score > 0 AND (winnerId equals userId OR solo mode)
    const passedQuizzes = new Map<string, Date>();

    if (quizIdsToCheck.length > 0) {
      const quizResults = await db
        .select({
          collectionId: quizGameResults.collectionId,
          gameEndedAt: quizGameResults.gameEndedAt,
          player1Score: quizGameResults.player1Score,
          winnerId: quizGameResults.winnerId,
          gameMode: quizGameResults.gameMode,
          player1Id: quizGameResults.player1Id,
        })
        .from(quizGameResults)
        .where(
          and(
            eq(quizGameResults.player1Id, userId),
            inArray(quizGameResults.collectionId, quizIdsToCheck),
            gt(quizGameResults.player1Score, 0)
          )
        )
        .orderBy(desc(quizGameResults.gameEndedAt));

      for (const result of quizResults) {
        // Check if user passed: score > 0 AND (winnerId matches OR solo mode)
        const isSoloMode = result.gameMode === "quiz_single";
        const isWinner = result.winnerId === userId;

        if (result.player1Score > 0 && (isSoloMode || isWinner)) {
          // Only keep the earliest pass date
          if (!passedQuizzes.has(result.collectionId)) {
            passedQuizzes.set(result.collectionId, result.gameEndedAt);
          }
        }
      }
    }

    // Build lesson statuses
    const lessonStatuses: LessonStatus[] = [];
    let lessonsCompleted = 0;

    for (const lesson of lessonsInCourse) {
      const quizId = lessonQuizMap.get(lesson.lessonId) || null;
      let status: 'not_started' | 'in_progress' | 'completed' = 'not_started';
      let passedAt: Date | null = null;

      if (quizId && passedQuizzes.has(quizId)) {
        status = 'completed';
        passedAt = passedQuizzes.get(quizId) || null;
        lessonsCompleted++;
      }

      lessonStatuses.push({
        lessonId: lesson.lessonId,
        topicName: lesson.topicName,
        topicOrder: lesson.topicOrder,
        quizId,
        status,
        passedAt,
      });
    }

    const isComplete = lessonsCompleted === lessonsInCourse.length && lessonsInCourse.length > 0;

    return {
      isComplete,
      lessonsCompleted,
      totalLessons: lessonsInCourse.length,
      lessonStatuses,
    };
  }

  /**
   * Called when a quiz is passed - updates lesson progress and checks course completion.
   * Updates lessonProgress, userCourseLessonProgress, and courseProgress tables.
   */
  static async onQuizPassed(
    userId: string,
    quizId: string,
    courseContext?: {
      courseId: string;
      lessonId: string;
      courseVersionId: string;
      organizationId: string;
    }
  ): Promise<void> {
    // Find all lessons linked to this quiz
    const linkedLessons = await db
      .select({
        lessonId: lessonQuizLinks.lessonId,
      })
      .from(lessonQuizLinks)
      .where(eq(lessonQuizLinks.quizId, quizId));

    // Also check courseLessons for primaryQuizId
    const courseLessonsWithQuiz = await db
      .select({
        lessonId: courseLessons.lessonId,
        courseId: courseLessons.courseId,
      })
      .from(courseLessons)
      .where(eq(courseLessons.primaryQuizId, quizId));

    // Combine all lesson IDs
    const lessonIds = new Set<string>([
      ...linkedLessons.map((l) => l.lessonId),
      ...courseLessonsWithQuiz.map((l) => l.lessonId),
    ]);

    // If courseContext provided, ensure the lesson is included
    if (courseContext?.lessonId) {
      lessonIds.add(courseContext.lessonId);
    }

    const now = new Date();

    // Update lesson progress for each linked lesson
    for (const lessonId of Array.from(lessonIds)) {
      // Update lessonProgress table
      if (courseContext?.organizationId) {
        await db
          .insert(lessonProgress)
          .values({
            lessonId,
            userId,
            organizationId: courseContext.organizationId,
            status: "completed",
            percentComplete: 100,
            completedAt: now,
          })
          .onConflictDoUpdate({
            target: [lessonProgress.lessonId, lessonProgress.userId, lessonProgress.organizationId],
            set: {
              status: "completed",
              percentComplete: 100,
              completedAt: now,
              updatedAt: now,
            },
          });
      }
    }

    // If course context is provided, update userCourseLessonProgress
    if (courseContext) {
      const { courseId, lessonId, courseVersionId, organizationId } = courseContext;

      // Update userCourseLessonProgress
      const existing = await db
        .select({ id: userCourseLessonProgress.id })
        .from(userCourseLessonProgress)
        .where(
          and(
            eq(userCourseLessonProgress.userId, userId),
            eq(userCourseLessonProgress.courseId, courseId),
            eq(userCourseLessonProgress.lessonId, lessonId),
            eq(userCourseLessonProgress.courseVersionId, courseVersionId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(userCourseLessonProgress)
          .set({
            status: "completed",
            completedAt: now,
            updatedAt: now,
          })
          .where(eq(userCourseLessonProgress.id, existing[0].id));
      } else {
        await db.insert(userCourseLessonProgress).values({
          userId,
          courseId,
          lessonId,
          courseVersionId,
          status: "completed",
          completedAt: now,
        });
      }

      // Always recalculate and update courseProgress with dual-mechanism logic
      // This ensures the courseProgress table reflects accurate completion status
      // for both partial progress AND full completion (used by My Courses and Analytics)
      await this.recalculateAndUpdateCourseProgress(userId, courseId, organizationId);
    }
  }

  /**
   * Get lesson completion status based on quiz results.
   * A lesson is complete when its primary linked quiz is passed.
   */
  static async getLessonCompletionStatus(
    userId: string,
    lessonId: string
  ): Promise<'not_started' | 'in_progress' | 'completed'> {
    // Get primary quiz for this lesson from lessonQuizLinks
    const primaryLink = await db
      .select({ quizId: lessonQuizLinks.quizId })
      .from(lessonQuizLinks)
      .where(
        and(
          eq(lessonQuizLinks.lessonId, lessonId),
          eq(lessonQuizLinks.isPrimary, true)
        )
      )
      .limit(1);

    // Also check courseLessons for primaryQuizId
    const courseLessonLink = await db
      .select({ primaryQuizId: courseLessons.primaryQuizId })
      .from(courseLessons)
      .where(eq(courseLessons.lessonId, lessonId))
      .limit(1);

    const quizId = primaryLink[0]?.quizId || courseLessonLink[0]?.primaryQuizId;

    if (!quizId) {
      // No quiz linked, check lessonProgress directly
      const progress = await db
        .select({ status: lessonProgress.status })
        .from(lessonProgress)
        .where(
          and(
            eq(lessonProgress.lessonId, lessonId),
            eq(lessonProgress.userId, userId)
          )
        )
        .limit(1);

      return (progress[0]?.status as 'not_started' | 'in_progress' | 'completed') || 'not_started';
    }

    // Check if user passed the quiz
    const passedResult = await db
      .select({
        id: quizGameResults.id,
        player1Score: quizGameResults.player1Score,
        winnerId: quizGameResults.winnerId,
        gameMode: quizGameResults.gameMode,
      })
      .from(quizGameResults)
      .where(
        and(
          eq(quizGameResults.player1Id, userId),
          eq(quizGameResults.collectionId, quizId),
          gt(quizGameResults.player1Score, 0)
        )
      )
      .limit(1);

    if (passedResult.length > 0) {
      const result = passedResult[0];
      const isSoloMode = result.gameMode === "quiz_single";
      const isWinner = result.winnerId === userId;

      if (result.player1Score > 0 && (isSoloMode || isWinner)) {
        return 'completed';
      }
    }

    // Check if there's any quiz attempt (in progress)
    const anyAttempt = await db
      .select({ id: quizGameResults.id })
      .from(quizGameResults)
      .where(
        and(
          eq(quizGameResults.player1Id, userId),
          eq(quizGameResults.collectionId, quizId)
        )
      )
      .limit(1);

    if (anyAttempt.length > 0) {
      return 'in_progress';
    }

    return 'not_started';
  }

  /**
   * Update courseProgress table when course is completed.
   * Sets status to 'completed' and records completedAt timestamp.
   */
  static async updateCourseProgress(
    userId: string,
    courseId: string,
    organizationId: string
  ): Promise<void> {
    const now = new Date();

    // Get the latest course version
    const [latestVersion] = await db
      .select({ id: courseVersions.id })
      .from(courseVersions)
      .where(eq(courseVersions.courseId, courseId))
      .orderBy(desc(courseVersions.createdAt))
      .limit(1);

    // Calculate total lessons (excluding position 0)
    const [lessonCount] = await db
      .select({ count: count() })
      .from(courseLessons)
      .where(
        and(
          eq(courseLessons.courseId, courseId),
          gt(courseLessons.topicOrder, 0)
        )
      );

    const totalLessons = lessonCount?.count || 0;

    // Upsert courseProgress
    const existing = await db
      .select({ id: courseProgress.id })
      .from(courseProgress)
      .where(
        and(
          eq(courseProgress.userId, userId),
          eq(courseProgress.courseId, courseId),
          eq(courseProgress.organizationId, organizationId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(courseProgress)
        .set({
          status: "completed",
          completedLessons: totalLessons,
          totalLessons: totalLessons,
          percentComplete: 100,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(courseProgress.id, existing[0].id));
    } else {
      await db.insert(courseProgress).values({
        userId,
        courseId,
        organizationId,
        status: "completed",
        completedLessons: totalLessons,
        totalLessons: totalLessons,
        percentComplete: 100,
        startedAt: now,
        completedAt: now,
      });
    }

    console.log(`Course ${courseId} marked as completed for user ${userId}`);
  }

  /**
   * Recalculate and update courseProgress using dual-mechanism completion logic.
   * This method should be called when a quiz is passed or lesson progress changes.
   * 
   * Uses the same completion logic as getCourseWithDetails():
   * - Lesson completed if linked quiz was passed (userQuizProgress.isPassed = true)
   * - OR lesson has NO linked quiz (auto-complete for overview/intro lessons)
   * - OR lesson has completion record (userCourseLessonProgress.completedAt)
   */
  static async recalculateAndUpdateCourseProgress(
    userId: string,
    courseId: string,
    organizationId: string
  ): Promise<void> {
    const now = new Date();

    // Use the centralized dual-mechanism calculation
    const calculatedProgress = await CourseService.calculateCourseProgress(courseId, userId);

    // Upsert courseProgress with calculated values
    const existing = await db
      .select({ id: courseProgress.id, startedAt: courseProgress.startedAt })
      .from(courseProgress)
      .where(
        and(
          eq(courseProgress.userId, userId),
          eq(courseProgress.courseId, courseId),
          eq(courseProgress.organizationId, organizationId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const updates: any = {
        completedLessons: calculatedProgress.completedLessons,
        totalLessons: calculatedProgress.totalLessons,
        percentComplete: calculatedProgress.percentComplete,
        status: calculatedProgress.status,
        updatedAt: now,
        lastAccessedAt: now,
      };

      // Only set completedAt if the course is now completed and wasn't already
      if (calculatedProgress.status === 'completed') {
        updates.completedAt = now;
      }

      await db
        .update(courseProgress)
        .set(updates)
        .where(eq(courseProgress.id, existing[0].id));

      console.log(`[CourseCompletionService] Updated progress for course ${courseId}: ${calculatedProgress.completedLessons}/${calculatedProgress.totalLessons} (${calculatedProgress.status})`);
    } else {
      // Create new record
      await db.insert(courseProgress).values({
        userId,
        courseId,
        organizationId,
        status: calculatedProgress.status,
        completedLessons: calculatedProgress.completedLessons,
        totalLessons: calculatedProgress.totalLessons,
        percentComplete: calculatedProgress.percentComplete,
        startedAt: now,
        lastAccessedAt: now,
        completedAt: calculatedProgress.status === 'completed' ? now : null,
      });

      console.log(`[CourseCompletionService] Created progress for course ${courseId}: ${calculatedProgress.completedLessons}/${calculatedProgress.totalLessons} (${calculatedProgress.status})`);
    }
  }
}

// Export singleton instance
export const courseCompletionService = new CourseCompletionService();
