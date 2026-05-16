// @ts-nocheck
import { db } from '../db';
import { courseVersions, type InsertCourseVersion, type CourseVersion } from '@shared/schema';
import { eq, desc, and } from 'drizzle-orm';

export class VersionService {
  /**
   * Create a new version of a course
   */
  static async createNewVersion(
    courseId: string,
    versionNumber: string,
    priceZar: string,
    priceUsd: string,
    priceEur: string,
    createdBy: string,
    upgradeNotes?: string
  ): Promise<CourseVersion> {
    const version = await db.insert(courseVersions).values({
      courseId,
      versionNumber,
      priceZar,
      priceUsd,
      priceEur,
      createdBy,
      upgradeNotes: upgradeNotes || null,
    }).returning();

    console.log(`Course version created: ${courseId} v${versionNumber}`);
    return version[0];
  }

  /**
   * Get version history for a course
   */
  static async getVersionHistory(courseId: string): Promise<CourseVersion[]> {
    return await db.query.courseVersions.findMany({
      where: eq(courseVersions.courseId, courseId),
      orderBy: [desc(courseVersions.createdAt)],
    });
  }

  /**
   * Get latest version for a course
   */
  static async getLatestVersion(courseId: string): Promise<CourseVersion | null> {
    return await db.query.courseVersions.findFirst({
      where: eq(courseVersions.courseId, courseId),
      orderBy: [desc(courseVersions.createdAt)],
    }) || null;
  }

  /**
   * Check if user has a specific version of the course
   */
  static async checkUserVersion(
    userId: string,
    courseId: string
  ): Promise<{ hasAccess: boolean; currentVersion: string | null; latestVersion: string }> {
    const { coursePurchases } = await import('@shared/schema');
    
    const userPurchase = await db.query.coursePurchases.findFirst({
      where: and(
        eq(coursePurchases.userId, userId),
        eq(coursePurchases.courseId, courseId)
      ),
      with: {
        courseVersion: true,
      },
    });

    const latestVersion = await this.getLatestVersion(courseId);

    return {
      hasAccess: !!userPurchase,
      currentVersion: userPurchase?.courseVersion?.versionNumber || null,
      latestVersion: latestVersion?.versionNumber || '1.0',
    };
  }

  /**
   * Check if upgrade is available for user
   */
  static async checkUpgradeAvailable(
    userId: string,
    courseId: string
  ): Promise<{ upgradeAvailable: boolean; currentVersion?: string; latestVersion?: string }> {
    const versionInfo = await this.checkUserVersion(userId, courseId);

    if (!versionInfo.hasAccess) {
      return { upgradeAvailable: false };
    }

    const upgradeAvailable = versionInfo.currentVersion !== versionInfo.latestVersion;

    return {
      upgradeAvailable,
      currentVersion: versionInfo.currentVersion || undefined,
      latestVersion: versionInfo.latestVersion,
    };
  }
}
