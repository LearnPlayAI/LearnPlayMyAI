// @ts-nocheck
import { db } from '../db';
import {
  courseVersions,
  courseVersionNotifications,
  userCourseEnrollments,
  coursePurchases,
  notificationPreferences,
  userNotifications,
  type CourseVersion,
  type CourseVersionNotification,
  type UserNotification,
} from '@shared/schema';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';

export interface CreateVersionInput {
  courseId: string;
  title: string;
  description: string;
  thumbnailUrl?: string | null;
  basePrice: number;
  baseCurrency: 'ZAR' | 'USD' | 'EUR';
  upgradePrice?: number | null;
  upgradeCurrency?: 'ZAR' | 'USD' | 'EUR' | null;
  previousVersionId?: string | null;
  organizationId: string; // For authorization check
}

export interface VersionUpgradeDiscount {
  originalPrice: number;
  upgradePrice: number;
  discountAmount: number;
  discountPercentage: number;
  currency: 'ZAR' | 'USD' | 'EUR';
}

export class CourseVersionService {
  /**
   * Get latest version for a course
   */
  static async getLatestVersion(courseId: string): Promise<CourseVersion | null> {
    const versions = await db
      .select()
      .from(courseVersions)
      .where(eq(courseVersions.courseId, courseId))
      .orderBy(desc(courseVersions.createdAt))
      .limit(1);

    return versions[0] || null;
  }

  /**
   * Get all versions for a course
   */
  static async getCourseVersions(courseId: string): Promise<CourseVersion[]> {
    return await db
      .select()
      .from(courseVersions)
      .where(eq(courseVersions.courseId, courseId))
      .orderBy(desc(courseVersions.createdAt));
  }

  /**
   * Get a specific version by ID
   */
  static async getVersionById(versionId: string): Promise<CourseVersion | null> {
    const version = await db
      .select()
      .from(courseVersions)
      .where(eq(courseVersions.id, versionId))
      .limit(1);

    return version[0] || null;
  }

  /**
   * Create a new course version
   * Automatically generates version number and calculates default upgrade pricing
   */
  static async createVersion(input: CreateVersionInput): Promise<CourseVersion> {
    // Get the latest version to determine new version number
    const latestVersion = await this.getLatestVersion(input.courseId);

    let versionNumber = '1.0';
    if (latestVersion) {
      const [major, minor] = latestVersion.versionNumber.split('.').map(Number);
      versionNumber = `${major}.${minor + 1}`;
    }

    // If no upgrade price specified, default to 50% of base price
    const upgradePrice = input.upgradePrice !== undefined && input.upgradePrice !== null
      ? input.upgradePrice
      : input.basePrice * 0.5;

    const upgradeCurrency = input.upgradeCurrency || input.baseCurrency;

    const newVersion = await db
      .insert(courseVersions)
      .values({
        courseId: input.courseId,
        versionNumber,
        title: input.title,
        description: input.description,
        thumbnailUrl: input.thumbnailUrl,
        basePrice: input.basePrice,
        baseCurrency: input.baseCurrency,
        upgradePrice,
        upgradeCurrency,
        previousVersionId: latestVersion?.id || null,
        isPublished: false,
      })
      .returning();

    console.log(`Course version created: ${versionNumber} for course ${input.courseId}`);

    return newVersion[0];
  }

  /**
   * Publish a course version
   * Generates notifications for all users who own previous versions
   */
  static async publishVersion(
    versionId: string,
    courseId: string,
    organizationId: string
  ): Promise<CourseVersion> {
    const version = await this.getVersionById(versionId);

    if (!version) {
      throw new Error('Version not found');
    }

    if (version.courseId !== courseId) {
      throw new Error('Version does not belong to this course');
    }

    // AUTHORIZATION CHECK: Verify org owns this course
    const { courses } = await import('@shared/schema');
    const course = await db
      .select()
      .from(courses)
      .where(
        and(
          eq(courses.id, courseId),
          eq(courses.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!course.length) {
      throw new Error('Unauthorized: Organization does not own this course');
    }

    // Update version to published
    const published = await db
      .update(courseVersions)
      .set({
        isPublished: true,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(courseVersions.id, versionId))
      .returning();

    // Record price history for audit trail
    const { RevenueTrackingService } = await import('./revenueTrackingService');
    await RevenueTrackingService.recordPriceHistory(
      courseId,
      parseFloat(published[0].basePrice.toString()),
      published[0].baseCurrency,
      `Version ${published[0].versionNumber} published`
    );

    // Generate notifications for existing course owners
    await this.notifyExistingUsers(versionId, courseId, version.previousVersionId);

    console.log(`Version ${version.versionNumber} published for course ${courseId}`);

    return published[0];
  }

  /**
   * Calculate upgrade discount information
   */
  static async calculateUpgradeDiscount(
    fromVersionId: string,
    toVersionId: string
  ): Promise<VersionUpgradeDiscount> {
    const fromVersion = await this.getVersionById(fromVersionId);
    const toVersion = await this.getVersionById(toVersionId);

    if (!fromVersion || !toVersion) {
      throw new Error('Invalid version IDs');
    }

    if (fromVersion.courseId !== toVersion.courseId) {
      throw new Error('Versions must belong to the same course');
    }

    const originalPrice = toVersion.basePrice;
    const upgradePrice = toVersion.upgradePrice || 0;
    const discountAmount = originalPrice - upgradePrice;
    const discountPercentage = (discountAmount / originalPrice) * 100;

    return {
      originalPrice,
      upgradePrice,
      discountAmount,
      discountPercentage: Math.round(discountPercentage * 100) / 100,
      currency: toVersion.baseCurrency,
    };
  }

  /**
   * Check if a user owns a specific version
   */
  static async userOwnsVersion(
    userId: string,
    versionId: string
  ): Promise<boolean> {
    const version = await this.getVersionById(versionId);
    if (!version) return false;

    // Check if user has an active enrollment or purchase for this course
    const enrollment = await db
      .select()
      .from(userCourseEnrollments)
      .where(
        and(
          eq(userCourseEnrollments.userId, userId),
          eq(userCourseEnrollments.courseId, version.courseId)
        )
      )
      .limit(1);

    return enrollment.length > 0;
  }

  /**
   * Get version history for a course with upgrade path
   */
  static async getVersionHistory(courseId: string): Promise<Array<{
    version: CourseVersion;
    previousVersion: CourseVersion | null;
    upgradeDiscount: VersionUpgradeDiscount | null;
  }>> {
    const versions = await this.getCourseVersions(courseId);

    const history = await Promise.all(
      versions.map(async (version) => {
        let previousVersion: CourseVersion | null = null;
        let upgradeDiscount: VersionUpgradeDiscount | null = null;

        if (version.previousVersionId) {
          previousVersion = await this.getVersionById(version.previousVersionId);

          if (previousVersion) {
            upgradeDiscount = await this.calculateUpgradeDiscount(
              previousVersion.id,
              version.id
            );
          }
        }

        return {
          version,
          previousVersion,
          upgradeDiscount,
        };
      })
    );

    return history;
  }

  /**
   * Notify existing course owners about new version
   * Creates both in-app and email notifications based on preferences
   */
  static async notifyExistingUsers(
    newVersionId: string,
    courseId: string,
    oldVersionId: string | null
  ): Promise<void> {
    const newVersion = await this.getVersionById(newVersionId);
    if (!newVersion) return;

    // Get all users who own this course
    const enrollments = await db
      .select()
      .from(userCourseEnrollments)
      .where(eq(userCourseEnrollments.courseId, courseId));

    if (enrollments.length === 0) {
      console.log(`No existing users to notify for course ${courseId}`);
      return;
    }

    const userIds = enrollments.map((e) => e.userId);

    // Get notification preferences for these users
    const preferences = await db
      .select()
      .from(notificationPreferences)
      .where(inArray(notificationPreferences.userId, userIds));

    const prefsMap = new Map(preferences.map((p) => [p.userId, p]));

    // Create notification records and in-app notifications
    const notifications: Array<typeof courseVersionNotifications.$inferInsert> = [];
    const inAppNotifications: Array<typeof userNotifications.$inferInsert> = [];

    for (const enrollment of enrollments) {
      const userPrefs = prefsMap.get(enrollment.userId);

      // Always create version notification record
      notifications.push({
        userId: enrollment.userId,
        courseId,
        oldVersionId,
        newVersionId,
        wasViewed: false,
      });

      // Create in-app notification if user has it enabled (default true)
      if (!userPrefs || userPrefs.inAppNotifications) {
        inAppNotifications.push({
          userId: enrollment.userId,
          type: 'course_update',
          title: 'New Course Version Available',
          message: `A new version (${newVersion.versionNumber}) of "${newVersion.title}" is now available. Upgrade at a discounted price!`,
          isRead: false,
          relatedEntityId: courseId,
          relatedEntityType: 'course',
        });
      }
    }

    // Bulk insert notifications
    if (notifications.length > 0) {
      await db.insert(courseVersionNotifications).values(notifications);
      console.log(`Created ${notifications.length} version notification records`);
    }

    if (inAppNotifications.length > 0) {
      await db.insert(userNotifications).values(inAppNotifications);
      console.log(`Created ${inAppNotifications.length} in-app notifications`);
    }

    // Email notifications handled by NotificationService (Task 6)
    // TODO: Queue email notifications for users with email preferences enabled
  }

  /**
   * Mark version notification as viewed
   */
  static async markNotificationViewed(
    userId: string,
    notificationId: string
  ): Promise<void> {
    await db
      .update(courseVersionNotifications)
      .set({
        wasViewed: true,
        viewedAt: new Date(),
      })
      .where(
        and(
          eq(courseVersionNotifications.id, notificationId),
          eq(courseVersionNotifications.userId, userId)
        )
      );
  }

  /**
   * Get unviewed version notifications for a user
   */
  static async getUnviewedNotifications(
    userId: string
  ): Promise<CourseVersionNotification[]> {
    return await db
      .select()
      .from(courseVersionNotifications)
      .where(
        and(
          eq(courseVersionNotifications.userId, userId),
          eq(courseVersionNotifications.wasViewed, false)
        )
      )
      .orderBy(desc(courseVersionNotifications.notifiedAt));
  }

  /**
   * Get user's current version for a course
   */
  static async getUserCurrentVersion(
    userId: string,
    courseId: string
  ): Promise<CourseVersion | null> {
    // Check user's enrollment for version info
    const enrollment = await db
      .select()
      .from(userCourseEnrollments)
      .where(
        and(
          eq(userCourseEnrollments.userId, userId),
          eq(userCourseEnrollments.courseId, courseId)
        )
      )
      .limit(1);

    if (!enrollment.length) return null;

    // For now, return the latest version they purchased
    // In full implementation, track version per enrollment
    return await this.getLatestVersion(courseId);
  }

  /**
   * Delete a version (only if not published and no users own it)
   */
  static async deleteVersion(
    versionId: string,
    organizationId: string
  ): Promise<void> {
    const version = await this.getVersionById(versionId);

    if (!version) {
      throw new Error('Version not found');
    }

    if (version.isPublished) {
      throw new Error('Cannot delete published version');
    }

    // Check if any users own this version
    const enrollments = await db
      .select()
      .from(userCourseEnrollments)
      .where(eq(userCourseEnrollments.courseId, version.courseId))
      .limit(1);

    if (enrollments.length > 0) {
      throw new Error('Cannot delete version - users have purchased this course');
    }

    await db.delete(courseVersions).where(eq(courseVersions.id, versionId));

    console.log(`Deleted version ${versionId}`);
  }

  /**
   * List all versions for a course (API wrapper for getCourseVersions)
   */
  static async listVersions(courseId: string): Promise<CourseVersion[]> {
    return this.getCourseVersions(courseId);
  }
}
