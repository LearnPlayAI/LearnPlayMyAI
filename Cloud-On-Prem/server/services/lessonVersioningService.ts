/**
 * PHASE 1.3: Lesson Versioning Service
 * 
 * Manages lesson version history with append-only audit trail.
 * Supports creating version snapshots, listing version history, and restoring previous versions.
 * 
 * Service-Layer Invariants:
 * - versionNumber auto-increments per lesson (1, 2, 3, ...)
 * - Restoring a version creates TWO new versions: one saving current state, one with restored state
 * - All operations enforce organization isolation
 * - lessonSnapshot JSONB contains complete lesson state for lossless restore
 * - Diff computation helps UI display what changed between versions
 */

import { db } from "../db";
import { lessonVersions, lessons, type Lesson, type LessonVersion } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { ObjectStorageService } from "../objectStorage";
import { requireNonEmptyStorageKey } from "../utils/storageKeyManager";

export interface CreateVersionParams {
  lessonId: string;
  organizationId: string;
  editedBy: string;
  changeDescription?: string;
  currentLesson: Lesson; // Full lesson object to snapshot
}

export interface RestoreVersionParams {
  versionId: string;
  lessonId: string;
  organizationId: string;
  restoredBy: string;
}

export interface VersionWithDiff extends Omit<LessonVersion, 'diffSummary'> {
  changedFields: string[];
  diffSummary: LessonVersion['diffSummary'] | {
    modified: Record<string, { from: any; to: any }>;
  };
}

export class LessonVersioningService {
  private static resolveSnapshotStorageKey(currentLesson: Lesson, context: string): string {
    return requireNonEmptyStorageKey(
      currentLesson.storageKey || currentLesson.videoStorageKey,
      context,
    );
  }

  /**
   * Create a new version snapshot of a lesson
   * Auto-increments versionNumber for the lesson
   * Stores complete lesson state in lessonSnapshot JSONB
   */
  static async createVersion(params: CreateVersionParams): Promise<LessonVersion> {
    const { lessonId, organizationId, editedBy, changeDescription, currentLesson } = params;
    const storageKey = this.resolveSnapshotStorageKey(
      currentLesson,
      `LessonVersioningService.createVersion lessonId=${lessonId}`,
    );

    return await db.transaction(async (tx) => {
      // CRITICAL: Lock the parent lesson row to serialize version creation
      // This prevents race conditions even when no versions exist yet
      // (FOR UPDATE on empty result set acquires no lock)
      await tx
        .select()
        .from(lessons)
        .where(eq(lessons.id, lessonId))
        .for("update");

      // Get the next version number for this lesson
      const [maxVersion] = await tx
        .select({ max: sql<number>`COALESCE(MAX(${lessonVersions.versionNumber}), 0)` })
        .from(lessonVersions)
        .where(eq(lessonVersions.lessonId, lessonId));

      const nextVersionNumber = (maxVersion?.max || 0) + 1;

      // Create snapshot
      const [version] = await tx
        .insert(lessonVersions)
        .values({
          lessonId,
          organizationId,
          versionNumber: nextVersionNumber,
          
          // Queryable metadata
          title: currentLesson.title,
          description: currentLesson.description,
          gradeLevel: currentLesson.gradeLevel,
          department: currentLesson.department,
          subject: currentLesson.subject,
          unit: currentLesson.unit,
          generationMode: currentLesson.generationMode,
          generationStatus: currentLesson.generationStatus,
          themeId: currentLesson.themeId,
          slideCount: currentLesson.slideCount,
          creditsUsed: currentLesson.creditsUsed,
          relatedQuizId: currentLesson.relatedQuizId,
          isPublished: currentLesson.isPublished,
          isArchived: currentLesson.isArchived,
          publishedAt: currentLesson.publishedAt,
          publishedBy: currentLesson.publishedBy,
          viewCount: currentLesson.viewCount,
          completionCount: currentLesson.completionCount,
          languageCode: currentLesson.languageCode || 'en',
          
          // Complete snapshot for lossless restore
          lessonSnapshot: currentLesson as any, // Store complete lesson object
          
          // File versioning
          storageKey,
          fileSize: null, // TODO: Get from Object Storage if needed
          videoStorageKey: currentLesson.videoStorageKey,
          videoDurationSec: currentLesson.videoDurationSec,
          videoSizeBytes: currentLesson.videoSizeBytes,
          videoUploadedAt: currentLesson.videoUploadedAt,
          presenterNotesJson: currentLesson.presenterNotesJson,
          
          // Version metadata
          changeDescription: changeDescription || null,
          diffSummary: null, // Will be computed when comparing versions
          
          // Audit trail
          editedBy,
        })
        .returning();

      console.log(
        `[LessonVersioningService] Created version ${nextVersionNumber} for lesson ${lessonId} by user ${editedBy}`
      );

      return version;
    });
  }

  /**
   * Get version by ID with organization isolation
   */
  static async getVersion(versionId: string, organizationId: string): Promise<LessonVersion | null> {
    const [version] = await db
      .select()
      .from(lessonVersions)
      .where(
        and(
          eq(lessonVersions.id, versionId),
          eq(lessonVersions.organizationId, organizationId)
        )
      )
      .limit(1);

    return version || null;
  }

  /**
   * Get all versions for a lesson (newest first)
   * Includes organization isolation
   */
  static async getVersionHistory(
    lessonId: string,
    organizationId: string
  ): Promise<LessonVersion[]> {
    return await db
      .select()
      .from(lessonVersions)
      .where(
        and(
          eq(lessonVersions.lessonId, lessonId),
          eq(lessonVersions.organizationId, organizationId)
        )
      )
      .orderBy(desc(lessonVersions.versionNumber));
  }

  /**
   * Get a specific version by lessonId and versionNumber
   */
  static async getVersionByNumber(
    lessonId: string,
    versionNumber: number,
    organizationId: string
  ): Promise<LessonVersion | null> {
    const [version] = await db
      .select()
      .from(lessonVersions)
      .where(
        and(
          eq(lessonVersions.lessonId, lessonId),
          eq(lessonVersions.versionNumber, versionNumber),
          eq(lessonVersions.organizationId, organizationId)
        )
      )
      .limit(1);

    return version || null;
  }

  /**
   * Restore a lesson to a previous version
   * Creates TWO new versions for audit trail:
   * 1. Snapshot of current state (before restore)
   * 2. Snapshot of restored state (after restore)
   * 
   * This ensures we never lose history and can undo/redo
   * 
   * SECURITY: Validates that version belongs to specified lesson and organization
   */
  static async restoreVersion(params: RestoreVersionParams): Promise<{
    restoredLesson: Lesson;
    preRestoreVersion: LessonVersion;
    postRestoreVersion: LessonVersion;
  }> {
    const { versionId, lessonId, organizationId, restoredBy } = params;

    // Fetch the version to restore WITH VALIDATION
    const [versionToRestore] = await db
      .select()
      .from(lessonVersions)
      .where(
        and(
          eq(lessonVersions.id, versionId),
          eq(lessonVersions.lessonId, lessonId),
          eq(lessonVersions.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!versionToRestore) {
      throw new Error(
        `Version ${versionId} not found or does not belong to lesson ${lessonId} in organization ${organizationId}`
      );
    }

    // Extract lesson snapshot
    const snapshot = versionToRestore.lessonSnapshot as Lesson;
    if (!snapshot || !snapshot.id) {
      throw new Error(`Invalid lesson snapshot in version ${versionId}`);
    }

    return await db.transaction(async (tx) => {
      // 1. Get current lesson state
      const [currentLesson] = await tx
        .select()
        .from(lessons)
        .where(
          and(
            eq(lessons.id, versionToRestore.lessonId),
            eq(lessons.organizationId, versionToRestore.organizationId)
          )
        )
        .limit(1);

      if (!currentLesson) {
        throw new Error(`Lesson ${versionToRestore.lessonId} not found`);
      }

      // 2. Save current state as a new version (pre-restore snapshot)
      const preRestoreVersion = await this.createVersionInTransaction(
        {
          lessonId: currentLesson.id,
          organizationId: currentLesson.organizationId,
          editedBy: restoredBy,
          changeDescription: `Auto-save before restoring to version ${versionToRestore.versionNumber}`,
          currentLesson,
        },
        tx
      );

      // 3. Restore lesson to snapshot state
      const [restoredLesson] = await tx
        .update(lessons)
        .set({
          title: snapshot.title,
          description: snapshot.description,
          gradeLevel: snapshot.gradeLevel,
          department: snapshot.department,
          subject: snapshot.subject,
          unit: snapshot.unit,
          generationMode: snapshot.generationMode,
          generationStatus: snapshot.generationStatus,
          mainTopic: snapshot.mainTopic,
          subtopic1: snapshot.subtopic1,
          subtopic2: snapshot.subtopic2,
          inputText: snapshot.inputText,
          gammaCardId: snapshot.gammaCardId,
          presentationUrl: snapshot.presentationUrl,
          storageKey: snapshot.storageKey,
          videoStorageKey: snapshot.videoStorageKey,
          videoDurationSec: snapshot.videoDurationSec,
          videoSizeBytes: snapshot.videoSizeBytes,
          videoUploadedAt: snapshot.videoUploadedAt,
          presenterNotesJson: snapshot.presenterNotesJson,
          themeId: snapshot.themeId,
          slideCount: snapshot.slideCount,
          creditsUsed: snapshot.creditsUsed,
          isPublished: snapshot.isPublished,
          publishedAt: snapshot.publishedAt,
          publishedBy: snapshot.publishedBy,
          isArchived: snapshot.isArchived,
          archivedAt: snapshot.archivedAt,
          relatedQuizId: snapshot.relatedQuizId,
          viewCount: snapshot.viewCount,
          completionCount: snapshot.completionCount,
          languageCode: snapshot.languageCode || 'en',
          metadata: snapshot.metadata,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(lessons.id, currentLesson.id),
            eq(lessons.organizationId, currentLesson.organizationId)
          )
        )
        .returning();

      // 4. Save restored state as a new version (post-restore snapshot)
      const postRestoreVersion = await this.createVersionInTransaction(
        {
          lessonId: restoredLesson.id,
          organizationId: restoredLesson.organizationId,
          editedBy: restoredBy,
          changeDescription: `Restored from version ${versionToRestore.versionNumber}`,
          currentLesson: restoredLesson,
        },
        tx
      );

      const [activeRestoredLesson] = await tx
        .update(lessons)
        .set({
          activeLessonVersionId: postRestoreVersion.id,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(lessons.id, restoredLesson.id),
            eq(lessons.organizationId, restoredLesson.organizationId)
          )
        )
        .returning();

      console.log(
        `[LessonVersioningService] Restored lesson ${restoredLesson.id} to version ${versionToRestore.versionNumber} by user ${restoredBy}`
      );

      return {
        restoredLesson: activeRestoredLesson || restoredLesson,
        preRestoreVersion,
        postRestoreVersion,
      };
    });
  }

  /**
   * Helper: Create version within an existing transaction
   * Used during restore to ensure atomicity
   */
  private static async createVersionInTransaction(
    params: CreateVersionParams,
    tx: any
  ): Promise<LessonVersion> {
    const { lessonId, organizationId, editedBy, changeDescription, currentLesson } = params;
    const storageKey = this.resolveSnapshotStorageKey(
      currentLesson,
      `LessonVersioningService.createVersionInTransaction lessonId=${lessonId}`,
    );

    // CRITICAL: Lock the parent lesson row to serialize version creation
    await tx
      .select()
      .from(lessons)
      .where(eq(lessons.id, lessonId))
      .for("update");

    // Get the next version number
    const [maxVersion] = await tx
      .select({ max: sql<number>`COALESCE(MAX(${lessonVersions.versionNumber}), 0)` })
      .from(lessonVersions)
      .where(eq(lessonVersions.lessonId, lessonId));

    const nextVersionNumber = (maxVersion?.max || 0) + 1;

    // Create snapshot
    const [version] = await tx
      .insert(lessonVersions)
      .values({
        lessonId,
        organizationId,
        versionNumber: nextVersionNumber,
        
        // Queryable metadata
        title: currentLesson.title,
        description: currentLesson.description,
        gradeLevel: currentLesson.gradeLevel,
        department: currentLesson.department,
        subject: currentLesson.subject,
        unit: currentLesson.unit,
        generationMode: currentLesson.generationMode,
        generationStatus: currentLesson.generationStatus,
        themeId: currentLesson.themeId,
        slideCount: currentLesson.slideCount,
        creditsUsed: currentLesson.creditsUsed,
        relatedQuizId: currentLesson.relatedQuizId,
        isPublished: currentLesson.isPublished,
        isArchived: currentLesson.isArchived,
        publishedAt: currentLesson.publishedAt,
        publishedBy: currentLesson.publishedBy,
        viewCount: currentLesson.viewCount,
        completionCount: currentLesson.completionCount,
        languageCode: currentLesson.languageCode || 'en',
        
        // Complete snapshot
        lessonSnapshot: currentLesson as any,
        
        // File versioning
        storageKey,
        fileSize: null,
        videoStorageKey: currentLesson.videoStorageKey,
        videoDurationSec: currentLesson.videoDurationSec,
        videoSizeBytes: currentLesson.videoSizeBytes,
        videoUploadedAt: currentLesson.videoUploadedAt,
        presenterNotesJson: currentLesson.presenterNotesJson,
        
        // Version metadata
        changeDescription: changeDescription || null,
        diffSummary: null,
        
        // Audit trail
        editedBy,
      })
      .returning();

    return version;
  }

  /**
   * Compute diff between two versions for UI display
   * Returns list of changed fields and structured diff
   */
  static computeDiff(
    olderVersion: LessonVersion,
    newerVersion: LessonVersion
  ): {
    changedFields: string[];
    diffSummary: {
      modified: Record<string, { from: any; to: any }>;
    };
  } {
    const changedFields: string[] = [];
    const modified: Record<string, { from: any; to: any }> = {};

    // Compare queryable fields
    const fieldsToCompare: (keyof LessonVersion)[] = [
      "title",
      "description",
      "gradeLevel",
      "department",
      "subject",
      "unit",
      "generationMode",
      "generationStatus",
      "themeId",
      "slideCount",
      "creditsUsed",
      "relatedQuizId",
      "isPublished",
      "isArchived",
      "storageKey",
      "languageCode",
    ];

    for (const field of fieldsToCompare) {
      const oldValue = olderVersion[field];
      const newValue = newerVersion[field];

      if (oldValue !== newValue) {
        changedFields.push(field);
        modified[field] = {
          from: oldValue,
          to: newValue,
        };
      }
    }

    return {
      changedFields,
      diffSummary: { modified },
    };
  }

  /**
   * Get version history with diffs
   * Each version includes what changed compared to the previous version
   */
  static async getVersionHistoryWithDiffs(
    lessonId: string,
    organizationId: string
  ): Promise<VersionWithDiff[]> {
    const versions = await this.getVersionHistory(lessonId, organizationId);
    
    if (versions.length === 0) {
      return [];
    }

    const versionsWithDiffs: VersionWithDiff[] = [];

    for (let i = 0; i < versions.length; i++) {
      const currentVersion = versions[i];
      const previousVersion = versions[i + 1]; // Older version (array is sorted newest first)

      if (previousVersion) {
        const diff = this.computeDiff(previousVersion, currentVersion);
        versionsWithDiffs.push({
          ...currentVersion,
          changedFields: diff.changedFields,
          diffSummary: diff.diffSummary,
        });
      } else {
        // First version - no diff
        versionsWithDiffs.push({
          ...currentVersion,
          changedFields: [],
          diffSummary: null,
        });
      }
    }

    return versionsWithDiffs;
  }

  /**
   * Delete all versions for a lesson
   * Used when a lesson is permanently deleted
   */
  static async deleteVersionsForLesson(lessonId: string, organizationId: string): Promise<number> {
    const result = await db
      .delete(lessonVersions)
      .where(
        and(
          eq(lessonVersions.lessonId, lessonId),
          eq(lessonVersions.organizationId, organizationId)
        )
      );

    const deletedCount = result.rowCount || 0;
    console.log(
      `[LessonVersioningService] Deleted ${deletedCount} versions for lesson ${lessonId}`
    );

    return deletedCount;
  }
}
