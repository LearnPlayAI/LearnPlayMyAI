import { db } from '../db';
import {
  courseReviews,
  userCourseLessonProgress,
  courseLessons,
  courses,
  userQuizProgress,
  type InsertCourseReview,
  type CourseReview,
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export class ReviewService {
  /**
   * Create a course review (validates all lessons completed)
   * organizationId is stored for org-scoped review filtering (org_only courses)
   */
  static async createReview(
    userId: string,
    courseId: string,
    rating: string,
    comment: string,
    reviewerDisplayName: string,
    organizationId?: string // Reviewer's org for org-isolation
  ): Promise<CourseReview> {
    const existing = await db.query.courseReviews.findFirst({
      where: and(
        eq(courseReviews.userId, userId),
        eq(courseReviews.courseId, courseId)
      ),
    });

    if (existing) {
      throw new Error('User has already reviewed this course');
    }

    const allLessonsCompleted = await this.checkAllLessonsCompleted(userId, courseId);
    
    if (!allLessonsCompleted) {
      throw new Error('Cannot review course until all lessons are completed');
    }

    const review = await db.insert(courseReviews).values({
      userId,
      courseId,
      organizationId: organizationId || null, // Store reviewer's org for scoping
      rating,
      comment,
      displayName: reviewerDisplayName,
      reviewerDisplayName,
      isVisible: true,
    }).returning();

    await this.updateCourseRating(courseId);

    console.log(`Review created: User ${userId} rated course ${courseId} - ${rating} stars (org: ${organizationId || 'none'})`);
    return review[0];
  }

  /**
   * Update a review (only allows higher ratings)
   */
  static async updateReview(
    reviewId: string,
    userId: string,
    newRating: string,
    newComment: string
  ): Promise<CourseReview> {
    const existing = await db.query.courseReviews.findFirst({
      where: and(
        eq(courseReviews.id, reviewId),
        eq(courseReviews.userId, userId)
      ),
    });

    if (!existing) {
      throw new Error('Review not found or unauthorized');
    }

    const existingRating = parseFloat(existing.rating);
    const updatedRating = parseFloat(newRating);

    if (updatedRating < existingRating) {
      throw new Error('Can only update to a higher rating');
    }

    const updated = await db.update(courseReviews)
      .set({
        rating: newRating,
        comment: newComment,
      })
      .where(eq(courseReviews.id, reviewId))
      .returning();

    await this.updateCourseRating(existing.courseId);

    console.log(`Review updated: ${reviewId} - new rating ${newRating}`);
    return updated[0];
  }

  /**
   * Moderate a review (SuperAdmin/Org Admin)
   */
  static async moderateReview(
    reviewId: string,
    isVisible: boolean,
    moderatedBy: string
  ): Promise<CourseReview> {
    const existing = await db.query.courseReviews.findFirst({
      where: eq(courseReviews.id, reviewId),
    });

    if (!existing) {
      throw new Error('Review not found');
    }

    const updated = await db.update(courseReviews)
      .set({
        isVisible,
        moderatedBy,
        moderatedAt: new Date(),
      })
      .where(eq(courseReviews.id, reviewId))
      .returning();

    await this.updateCourseRating(existing.courseId);

    console.log(`Review moderated: ${reviewId} - visible: ${isVisible}`);
    return updated[0];
  }

  /**
   * Check if user has completed all lessons in a course
   * Uses quiz-based completion: checks if all quizzes linked to lessons are passed
   * For courses without quizzes, checks lesson progress table
   */
  private static async checkAllLessonsCompleted(
    userId: string,
    courseId: string
  ): Promise<boolean> {
    const course = await db.query.courses.findFirst({
      where: eq(courses.id, courseId),
    });

    if (!course) {
      return false;
    }

    // Get all lessons with primaryQuizId from courseLessons
    const lessons = await db.query.courseLessons.findMany({
      where: eq(courseLessons.courseId, courseId),
    });

    if (lessons.length === 0) {
      return true; // No lessons = completed
    }

    // Get quizIds from lessons that have primaryQuizId set
    const quizIds = lessons
      .filter(l => l.primaryQuizId)
      .map(l => l.primaryQuizId as string);

    if (quizIds.length === 0) {
      // No quizzes - use lesson progress check as fallback
      const completedLessons = await db
        .select({ count: sql<number>`count(*)` })
        .from(userCourseLessonProgress)
        .where(
          and(
            eq(userCourseLessonProgress.userId, userId),
            eq(userCourseLessonProgress.courseId, courseId),
            eq(userCourseLessonProgress.status, 'completed')
          )
        );

      const completed = Number(completedLessons[0]?.count || 0);
      return completed >= lessons.length;
    }

    // Check quiz-based completion - user must have passed all quizzes
    const passedQuizzes = await db.query.userQuizProgress.findMany({
      where: and(
        eq(userQuizProgress.userId, userId),
        eq(userQuizProgress.isPassed, true)
      ),
    });

    const passedQuizIds = new Set(passedQuizzes.map(q => q.collectionId));
    const allQuizzesPassed = quizIds.every(quizId => passedQuizIds.has(quizId));

    return allQuizzesPassed;
  }

  /**
   * Recalculate and update course average rating
   */
  private static async updateCourseRating(courseId: string): Promise<void> {
    const reviews = await db.query.courseReviews.findMany({
      where: and(
        eq(courseReviews.courseId, courseId),
        eq(courseReviews.isVisible, true)
      ),
    });

    const totalRatings = reviews.length;
    
    if (totalRatings === 0) {
      await db.update(courses)
        .set({
          averageRating: '0.00',
          totalRatings: 0,
        })
        .where(eq(courses.id, courseId));
      return;
    }

    const sumRatings = reviews.reduce((sum, r) => sum + parseFloat(r.rating), 0);
    const averageRating = (sumRatings / totalRatings).toFixed(2);

    await db.update(courses)
      .set({
        averageRating,
        totalRatings,
      })
      .where(eq(courses.id, courseId));

    console.log(`Course ${courseId} rating updated: ${averageRating} (${totalRatings} reviews)`);
  }

  /**
   * Get reviews for a course with visibility-aware filtering
   * - Public courses: show all visible reviews (global audience)
   * - Org_only courses: show only reviews from the same organization
   */
  static async getCourseReviews(
    courseId: string,
    options: {
      includeHidden?: boolean;
      courseVisibility?: 'public' | 'org_only';
      viewerOrganizationId?: string;
    } = {}
  ): Promise<CourseReview[]> {
    const { includeHidden = false, courseVisibility, viewerOrganizationId } = options;
    
    const conditions = [eq(courseReviews.courseId, courseId)];
    
    if (!includeHidden) {
      conditions.push(eq(courseReviews.isVisible, true));
    }
    
    // Org-scoped filtering for org_only courses
    // Public courses = show all reviews (global)
    // Org_only courses = show only reviews from same org
    if (courseVisibility === 'org_only' && viewerOrganizationId) {
      conditions.push(eq(courseReviews.organizationId, viewerOrganizationId));
    }

    return await db.query.courseReviews.findMany({
      where: and(...conditions),
      orderBy: [desc(courseReviews.createdAt)],
    });
  }

  /**
   * Check if user can review a course
   */
  static async canReview(userId: string, courseId: string): Promise<{
    canReview: boolean;
    reason?: string;
  }> {
    const existing = await db.query.courseReviews.findFirst({
      where: and(
        eq(courseReviews.userId, userId),
        eq(courseReviews.courseId, courseId)
      ),
    });

    if (existing) {
      return { canReview: false, reason: 'Already reviewed this course' };
    }

    const allCompleted = await this.checkAllLessonsCompleted(userId, courseId);
    
    if (!allCompleted) {
      return { canReview: false, reason: 'Must complete all lessons first' };
    }

    return { canReview: true };
  }

  /**
   * Get rating distribution for a course
   */
  static async getRatingDistribution(courseId: string): Promise<Record<string, number>> {
    const reviews = await db.query.courseReviews.findMany({
      where: and(
        eq(courseReviews.courseId, courseId),
        eq(courseReviews.isVisible, true)
      ),
    });

    const distribution: Record<string, number> = {
      '5.0': 0,
      '4.5': 0,
      '4.0': 0,
      '3.5': 0,
      '3.0': 0,
      '2.5': 0,
      '2.0': 0,
      '1.5': 0,
      '1.0': 0,
      '0.5': 0,
    };

    reviews.forEach(review => {
      const rating = parseFloat(review.rating).toFixed(1);
      if (distribution[rating] !== undefined) {
        distribution[rating]++;
      }
    });

    return distribution;
  }
}
