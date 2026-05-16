import { db } from '../db';
import {
  coursePurchases,
  userCourseLessonProgress,
  userCourseEnrollments,
  courses,
  courseVersions,
  type InsertCoursePurchase,
  type CoursePurchase,
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { VersionService } from './versionService';

export class PurchaseService {
  /**
   * Resolve the best available version for a course
   * Prefers currentVersionId, falls back to latest version
   */
  private static async resolveVersionId(courseId: string): Promise<string | null> {
    // First try to get the course's currentVersionId
    const course = await db.query.courses.findFirst({
      where: eq(courses.id, courseId),
      columns: { currentVersionId: true },
    });

    if (course?.currentVersionId) {
      return course.currentVersionId;
    }

    // Fallback to latest version from VersionService
    const latestVersion = await VersionService.getLatestVersion(courseId);
    return latestVersion?.id || null;
  }

  /**
   * Create a purchase record for paid courses
   * Called from YOCO webhook or payment flow with full payment details
   * 
   * FX Rate Storage (Task 8):
   * - baseCurrency: The course's original pricing currency
   * - basePrice: The course's original price in baseCurrency
   * - purchaseCurrency: What the user actually paid in (charged currency)
   * - exchangeRateUsed: The FX rate used for conversion at purchase time
   */
  static async createPurchase(
    userId: string,
    courseId: string,
    purchasePrice: string,
    purchaseCurrency: string,
    checkoutId: string,
    platformCurrency: string = 'ZAR',
    exchangeRateUsed: string = '1.00000000',
    platformAmount?: string,
    commissionRate: string = '0.3000',
    commissionAmount?: string,
    creatorEarnings?: string,
    baseCurrency?: string, // Course's original pricing currency (nullable for backward compatibility)
    basePrice?: string // Course's original price (nullable for backward compatibility)
  ): Promise<CoursePurchase> {
    // Calculate defaults for optional monetary fields
    const effectivePlatformAmount = platformAmount || purchasePrice;
    const effectiveCommissionAmount = commissionAmount || '0.0000';
    const effectiveCreatorEarnings = creatorEarnings || purchasePrice;
    const versionId = await this.resolveVersionId(courseId);

    if (!versionId) {
      throw new Error('This course has no published version and cannot be purchased');
    }

    const existing = await db.query.coursePurchases.findFirst({
      where: and(
        eq(coursePurchases.userId, userId),
        eq(coursePurchases.courseId, courseId)
      ),
    });

    if (existing) {
      // Idempotent: Return existing purchase instead of throwing
      // This handles race conditions from duplicate webhooks
      console.log(`[PurchaseService] User ${userId} already owns course ${courseId}, returning existing purchase (idempotent)`);
      return existing;
    }

    const purchase = await db.insert(coursePurchases).values({
      userId,
      courseId,
      courseVersionId: versionId,
      checkoutId,
      status: 'completed',
      purchasePrice,
      purchaseCurrency: purchaseCurrency as any,
      platformCurrency: platformCurrency as any,
      exchangeRateUsed,
      platformAmount: effectivePlatformAmount,
      commissionRate,
      commissionAmount: effectiveCommissionAmount,
      creatorEarnings: effectiveCreatorEarnings,
      purchasedAt: new Date(),
      // FX rate storage for refund consistency (Task 8)
      baseCurrency: baseCurrency as any,
      basePrice: basePrice,
    }).returning();

    // Also create userCourseEnrollments record for consistency
    // Some parts of the system (progress tracking, etc.) check this table
    const existingEnrollment = await db.query.userCourseEnrollments.findFirst({
      where: and(
        eq(userCourseEnrollments.userId, userId),
        eq(userCourseEnrollments.courseId, courseId)
      ),
    });

    if (!existingEnrollment) {
      await db.insert(userCourseEnrollments).values({
        userId,
        courseId,
        courseVersionId: versionId,
        enrolledAt: new Date(),
      });
    }

    console.log(`[PurchaseService] Purchase created: User ${userId} -> Course ${courseId}`);
    return purchase[0];
  }

  /**
   * Grant access to a course (for free courses or manual grants)
   * Uses zero values for all monetary fields
   * Also creates userCourseEnrollments record for consistency with PaymentOrchestratorService
   * 
   * FX Rate Storage (Task 8):
   * - baseCurrency: The course's original pricing currency (optional)
   * - basePrice: The course's original price in baseCurrency (optional)
   */
  static async grantAccess(
    userId: string,
    courseId: string,
    grantedBy: string,
    baseCurrency?: string, // Course's original pricing currency (nullable for backward compatibility)
    basePrice?: string // Course's original price (nullable for backward compatibility)
  ): Promise<CoursePurchase> {
    const versionId = await this.resolveVersionId(courseId);

    if (!versionId) {
      throw new Error('This course has no published version and cannot be enrolled');
    }

    const existing = await db.query.coursePurchases.findFirst({
      where: and(
        eq(coursePurchases.userId, userId),
        eq(coursePurchases.courseId, courseId)
      ),
    });

    if (existing) {
      throw new Error('User already has access to this course');
    }

    // Create purchase record (primary enrollment tracking)
    const purchase = await db.insert(coursePurchases).values({
      userId,
      courseId,
      courseVersionId: versionId,
      checkoutId: `free_grant_by_${grantedBy}`,
      status: 'completed',
      purchasePrice: '0.0000',
      purchaseCurrency: 'ZAR',
      platformCurrency: 'ZAR',
      exchangeRateUsed: '1.00000000',
      platformAmount: '0.0000',
      commissionRate: '0.0000',
      commissionAmount: '0.0000',
      creatorEarnings: '0.0000',
      purchasedAt: new Date(),
      // FX rate storage for refund consistency (Task 8)
      baseCurrency: baseCurrency as any,
      basePrice: basePrice,
    }).returning();

    // Also create userCourseEnrollments record for consistency
    // Some parts of the system (progress tracking, etc.) check this table
    const existingEnrollment = await db.query.userCourseEnrollments.findFirst({
      where: and(
        eq(userCourseEnrollments.userId, userId),
        eq(userCourseEnrollments.courseId, courseId)
      ),
    });

    if (!existingEnrollment) {
      await db.insert(userCourseEnrollments).values({
        userId,
        courseId,
        courseVersionId: versionId,
        enrolledAt: new Date(),
      });
    }

    console.log(`[PurchaseService] Access granted: User ${userId} -> Course ${courseId}`);
    return purchase[0];
  }

  /**
   * Purchase an upgrade to the latest version
   */
  static async purchaseUpgrade(
    userId: string,
    courseId: string,
    upgradePricePaid: string,
    currency: string,
    checkoutId: string
  ): Promise<CoursePurchase> {
    const versionId = await this.resolveVersionId(courseId);

    if (!versionId) {
      throw new Error('No version found for course');
    }

    const existing = await db.query.coursePurchases.findFirst({
      where: and(
        eq(coursePurchases.userId, userId),
        eq(coursePurchases.courseId, courseId)
      ),
    });

    if (!existing) {
      throw new Error('User does not own this course');
    }

    if (existing.courseVersionId === versionId) {
      throw new Error('User already has the latest version');
    }

    const updated = await db.update(coursePurchases)
      .set({
        courseVersionId: versionId,
      })
      .where(eq(coursePurchases.id, existing.id))
      .returning();

    console.log(`[PurchaseService] Upgrade purchased: User ${userId} -> Course ${courseId}`);
    return updated[0];
  }

  /**
   * Get user's purchased courses
   */
  static async getUserPurchases(userId: string): Promise<CoursePurchase[]> {
    return await db.query.coursePurchases.findMany({
      where: eq(coursePurchases.userId, userId),
      with: {
        course: true,
        courseVersion: true,
      },
      orderBy: [desc(coursePurchases.purchasedAt)],
    });
  }

  /**
   * Check if user has purchased a course
   */
  static async hasPurchased(userId: string, courseId: string): Promise<boolean> {
    const purchase = await db.query.coursePurchases.findFirst({
      where: and(
        eq(coursePurchases.userId, userId),
        eq(coursePurchases.courseId, courseId)
      ),
    });

    return !!purchase;
  }

  /**
   * Get purchase details
   */
  static async getPurchaseDetails(
    userId: string,
    courseId: string
  ): Promise<CoursePurchase | null> {
    return await db.query.coursePurchases.findFirst({
      where: and(
        eq(coursePurchases.userId, userId),
        eq(coursePurchases.courseId, courseId)
      ),
      with: {
        course: true,
        courseVersion: true,
      },
    }) || null;
  }

  /**
   * Revoke course access (for refund handling)
   * Deletes purchase record
   */
  static async revokeAccess(userId: string, courseId: string): Promise<void> {
    const purchase = await db.query.coursePurchases.findFirst({
      where: and(
        eq(coursePurchases.userId, userId),
        eq(coursePurchases.courseId, courseId)
      ),
    });

    if (!purchase) {
      console.warn(`[PurchaseService] No purchase found to revoke: user ${userId}, course ${courseId}`);
      return;
    }

    // Delete the purchase record
    await db.delete(coursePurchases)
      .where(and(
        eq(coursePurchases.userId, userId),
        eq(coursePurchases.courseId, courseId)
      ));

    console.log(`[PurchaseService] Course access revoked: user ${userId}, course ${courseId}`);
  }
}
