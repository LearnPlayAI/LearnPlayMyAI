import { db } from '../db';
import { 
  courses, 
  courseFrameworks, 
  courseLessons, 
  lessons, 
  lessonSlides, 
  lessonPresentationVersions, 
  quizCollections, 
  quizCards, 
  lessonQuizLinks,
  courseSourceDocuments,
  courseSourceAssets,
  courseSourceAssetLinks,
  type Course,
} from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { ObjectStorageService } from '../objectStorage';
import { randomUUID } from 'crypto';
import { buildCanonicalStorageKey, normalizeExtension } from '../utils/storageKeyManager';

interface CloneMapping {
  originalCourseId: string;
  lessonIdMap: Record<string, string>;
  quizIdMap: Record<string, string>;
  quizCardIdMap: Record<string, string>;
  courseLessonIdMap: Record<string, string>;
  sourceDocumentIdMap: Record<string, string>;
  sourceAssetIdMap: Record<string, string>;
  sourceAssetStorageKeyMap: Record<string, string>;
  filesMap: Array<{ original: string; cloned: string }>;
  clonedAt: string;
}

export class CourseVersioningService {
  private static buildClonedStorageKey(params: {
    scope?: 'private' | 'public';
    domain: string;
    sourceKey: string;
    lessonId: string;
    cloneLessonId?: string;
    userId: string;
    extraSeed?: string;
    fallbackExt?: string;
  }): string {
    const ext = normalizeExtension(pathExt(params.sourceKey)) || params.fallbackExt || '.bin';
    return buildCanonicalStorageKey({
      scope: params.scope || 'private',
      domain: params.domain,
      extension: ext,
      seed: [
        'course-draft-clone',
        params.lessonId,
        params.cloneLessonId || '',
        params.userId,
        params.sourceKey,
        params.extraSeed || '',
        randomUUID(),
      ].join(':'),
    });
  }

  private static rewriteSourceAssetsInMetadata(metadata: any, sourceAssetIdMap: Record<string, string>): any {
    if (!metadata || typeof metadata !== 'object') return metadata;
    const next = { ...metadata };
    if (Array.isArray(next.sourceAssets)) {
      next.sourceAssets = next.sourceAssets.map((ref: any) => {
        const assetId = String(ref?.assetId || '').trim();
        return assetId && sourceAssetIdMap[assetId]
          ? { ...ref, assetId: sourceAssetIdMap[assetId] }
          : ref;
      });
    }
    return next;
  }

  private static rewriteSourceAssetImageKey(imageKey: string | null | undefined, sourceAssetStorageKeyMap: Record<string, string>): string | null | undefined {
    if (!imageKey) return imageKey;
    return sourceAssetStorageKeyMap[imageKey] || imageKey;
  }

  private static async cloneCourseSourceRecords(params: {
    tx: any;
    sourceCourseId: string;
    draftCourseId: string;
    userId: string;
    objectStorage: InstanceType<typeof ObjectStorageService>;
    cloneMapping: CloneMapping;
  }): Promise<void> {
    const sourceDocs = await db.query.courseSourceDocuments.findMany({
      where: eq(courseSourceDocuments.courseId, params.sourceCourseId),
    });
    if (sourceDocs.length === 0) return;

    const sourceDocIds = sourceDocs.map((doc) => doc.id);
    const sourceAssets = await db.query.courseSourceAssets.findMany({
      where: inArray(courseSourceAssets.sourceDocumentId, sourceDocIds),
    });

    for (const sourceDoc of sourceDocs) {
      let clonedOriginalStoragePath = sourceDoc.originalStoragePath;
      if (sourceDoc.originalStoragePath) {
        const clonedKey = this.buildClonedStorageKey({
          domain: 'srcdoc',
          sourceKey: sourceDoc.originalStoragePath,
          lessonId: sourceDoc.id,
          userId: params.userId,
          fallbackExt: pathExt(sourceDoc.fileName) || '.bin',
        });
        const copied = await params.objectStorage.copyObject(sourceDoc.originalStoragePath, clonedKey);
        if (copied) {
          clonedOriginalStoragePath = clonedKey;
          params.cloneMapping.filesMap.push({ original: sourceDoc.originalStoragePath, cloned: clonedKey });
        }
      }

      const [clonedDoc] = await params.tx.insert(courseSourceDocuments).values({
        organizationId: sourceDoc.organizationId,
        createdBy: params.userId,
        draftId: null,
        draftDocumentId: null,
        courseId: params.draftCourseId,
        fileName: sourceDoc.fileName,
        mimeType: sourceDoc.mimeType,
        fileSize: sourceDoc.fileSize,
        originalStoragePath: clonedOriginalStoragePath,
        checksum: sourceDoc.checksum,
        pageCount: sourceDoc.pageCount,
        slideCount: sourceDoc.slideCount,
        extractionStatus: sourceDoc.extractionStatus,
        extractionError: sourceDoc.extractionError,
        extractedTextHash: sourceDoc.extractedTextHash,
        licenseMetadata: sourceDoc.licenseMetadata,
        metadata: sourceDoc.metadata,
      }).returning();
      params.cloneMapping.sourceDocumentIdMap[sourceDoc.id] = clonedDoc.id;
    }

    for (const sourceAsset of sourceAssets) {
      const clonedSourceDocumentId = params.cloneMapping.sourceDocumentIdMap[sourceAsset.sourceDocumentId];
      if (!clonedSourceDocumentId) continue;

      let clonedStorageKey = sourceAsset.storageKey;
      if (sourceAsset.storageKey) {
        const clonedKey = this.buildClonedStorageKey({
          domain: 'source-asset',
          sourceKey: sourceAsset.storageKey,
          lessonId: sourceAsset.id,
          userId: params.userId,
          fallbackExt: pathExt(sourceAsset.storageKey) || '.bin',
        });
        const copied = await params.objectStorage.copyObject(sourceAsset.storageKey, clonedKey);
        if (copied) {
          clonedStorageKey = clonedKey;
          params.cloneMapping.filesMap.push({ original: sourceAsset.storageKey, cloned: clonedKey });
        }
      }

      const [clonedAsset] = await params.tx.insert(courseSourceAssets).values({
        sourceDocumentId: clonedSourceDocumentId,
        organizationId: sourceAsset.organizationId,
        assetType: sourceAsset.assetType,
        storageKey: clonedStorageKey,
        mimeType: sourceAsset.mimeType,
        pageOrSlide: sourceAsset.pageOrSlide,
        caption: sourceAsset.caption,
        altText: sourceAsset.altText,
        width: sourceAsset.width,
        height: sourceAsset.height,
        textBefore: sourceAsset.textBefore,
        textAfter: sourceAsset.textAfter,
        containsEmbeddedText: sourceAsset.containsEmbeddedText,
        extractionMethod: sourceAsset.extractionMethod,
        metadata: sourceAsset.metadata,
      }).returning();

      params.cloneMapping.sourceAssetIdMap[sourceAsset.id] = clonedAsset.id;
      params.cloneMapping.sourceAssetStorageKeyMap[sourceAsset.storageKey] = clonedStorageKey;
    }
  }

  private static async cloneCourseSourceAssetLinks(params: {
    tx: any;
    draftCourseId: string;
    userId: string;
    cloneMapping: CloneMapping;
  }): Promise<void> {
    const sourceAssetIds = Object.keys(params.cloneMapping.sourceAssetIdMap);
    if (sourceAssetIds.length === 0) return;

    const originalLinks = await db.query.courseSourceAssetLinks.findMany({
      where: inArray(courseSourceAssetLinks.assetId, sourceAssetIds),
    });

    const linkedEntityMap: Record<string, string> = {
      [params.cloneMapping.originalCourseId]: params.draftCourseId,
      ...params.cloneMapping.lessonIdMap,
      ...params.cloneMapping.quizIdMap,
      ...params.cloneMapping.quizCardIdMap,
    };

    const values = originalLinks
      .map((link) => {
        const clonedAssetId = params.cloneMapping.sourceAssetIdMap[link.assetId];
        const clonedEntityId = linkedEntityMap[link.linkedEntityId];
        if (!clonedAssetId || !clonedEntityId) return null;
        return {
          organizationId: link.organizationId,
          assetId: clonedAssetId,
          linkedEntityType: link.linkedEntityType,
          linkedEntityId: clonedEntityId,
          recommendedUse: link.recommendedUse,
          sourceSegmentIds: link.sourceSegmentIds,
          createdBy: params.userId,
        };
      })
      .filter(Boolean);

    if (values.length > 0) {
      await params.tx.insert(courseSourceAssetLinks).values(values);
    }
  }

  /**
   * Create a draft copy of a course for editing (FULL CLONE approach)
   * Creates a new course record with status='draft' and clones ALL content:
   * - Course metadata
   * - Course framework (topics, sourceMap, contentHealth)
   * - All lessons and their slides
   * - All presentation versions
   * - All quiz collections and cards
   * - All object storage files (PPTX, videos)
   * 
   * WRAPPED IN TRANSACTION: All database operations are atomic.
   * If any operation fails, the entire clone is rolled back.
   */
  static async createDraft(params: {
    courseId: string;
    userId: string;
    notes?: string;
  }): Promise<Course> {
    const { courseId, userId, notes } = params;
    const objectStorage = new ObjectStorageService();

    const existingDraft = await this.getDraft(courseId);
    if (existingDraft) {
      throw new Error('A draft already exists for this course');
    }

    const course = await db.query.courses.findFirst({
      where: eq(courses.id, courseId),
    });

    if (!course) {
      throw new Error('Course not found');
    }

    const cloneMapping: CloneMapping = {
      originalCourseId: courseId,
      lessonIdMap: {},
      quizIdMap: {},
      quizCardIdMap: {},
      courseLessonIdMap: {},
      sourceDocumentIdMap: {},
      sourceAssetIdMap: {},
      sourceAssetStorageKeyMap: {},
      filesMap: [],
      clonedAt: new Date().toISOString(),
    };

    console.log(`[CourseVersioningService] Starting full clone for course ${courseId}`);

    try {
      const updatedDraftCourse = await db.transaction(async (tx) => {
        // 1. Create the draft course record
        const [draftCourse] = await tx.insert(courses).values({
          organizationId: course.organizationId,
          title: `[DRAFT] ${course.title}`,
          description: course.description,
          thumbnailUrl: course.thumbnailUrl,
          thumbnailSource: course.thumbnailSource,
          price: course.price,
          currency: course.currency,
          categoryId: course.categoryId,
          difficultyLevel: course.difficultyLevel,
          estimatedDuration: course.estimatedDuration,
          status: 'draft',
          visibility: course.visibility,
          languageCode: course.languageCode,
          unitId: course.unitId,
          subUnitId: course.subUnitId,
          teamId: course.teamId,
          createdBy: userId,
          sourceVersionCourseId: courseId,
        }).returning();

        await tx.update(courses).set({ contentGroupId: draftCourse.id }).where(eq(courses.id, draftCourse.id));

        console.log(`[CourseVersioningService] Created draft course ${draftCourse.id}`);

        await this.cloneCourseSourceRecords({
          tx,
          sourceCourseId: courseId,
          draftCourseId: draftCourse.id,
          userId,
          objectStorage,
          cloneMapping,
        });

        // 2. Clone course framework
        const framework = await db.query.courseFrameworks.findFirst({
          where: eq(courseFrameworks.courseId, courseId),
        });

        if (framework) {
          await tx.insert(courseFrameworks).values({
            courseId: draftCourse.id,
            organizationId: framework.organizationId,
            topics: framework.topics,
            sourceMap: framework.sourceMap,
            contentHealth: framework.contentHealth,
          });
          console.log(`[CourseVersioningService] Cloned course framework`);
        }

        // 3. Get all course lessons with their linked lessons
        const originalCourseLessons = await db.query.courseLessons.findMany({
          where: eq(courseLessons.courseId, courseId),
        });

        for (const courseLesson of originalCourseLessons) {
          // 3a. Clone the linked lesson
          const originalLesson = await db.query.lessons.findFirst({
            where: eq(lessons.id, courseLesson.lessonId),
          });

          if (!originalLesson) {
            console.warn(`[CourseVersioningService] Lesson ${courseLesson.lessonId} not found, skipping`);
            continue;
          }

          // Create new storage keys for cloned files
          let newStorageKey: string | null = null;
          let newVideoStorageKey: string | null = null;
          let newSourceDocumentPath: string | null = originalLesson.sourceDocumentPath || null;
          let newTranscriptKey: string | null = originalLesson.transcriptKey || null;
          let newGenerationParamsKey: string | null = originalLesson.generationParamsKey || null;

          // Copy PPTX file if exists
          if (originalLesson.storageKey) {
            newStorageKey = this.buildClonedStorageKey({
              domain: 'lpv',
              sourceKey: originalLesson.storageKey,
              lessonId: originalLesson.id,
              userId,
              fallbackExt: '.pptx',
            });
            const copied = await objectStorage.copyObject(originalLesson.storageKey, newStorageKey);
            if (copied) {
              cloneMapping.filesMap.push({ original: originalLesson.storageKey, cloned: newStorageKey });
            } else {
              newStorageKey = null;
            }
          }

          // Copy video file if exists
          if (originalLesson.videoStorageKey) {
            newVideoStorageKey = this.buildClonedStorageKey({
              domain: 'lvd',
              sourceKey: originalLesson.videoStorageKey,
              lessonId: originalLesson.id,
              userId,
              fallbackExt: '.mp4',
            });
            const copied = await objectStorage.copyObject(originalLesson.videoStorageKey, newVideoStorageKey);
            if (copied) {
              cloneMapping.filesMap.push({ original: originalLesson.videoStorageKey, cloned: newVideoStorageKey });
            } else {
              newVideoStorageKey = null;
            }
          }

          if (originalLesson.sourceDocumentPath) {
            const candidate = this.buildClonedStorageKey({
              domain: 'src',
              sourceKey: originalLesson.sourceDocumentPath,
              lessonId: originalLesson.id,
              userId,
              fallbackExt: '.docx',
            });
            const copied = await objectStorage.copyObject(originalLesson.sourceDocumentPath, candidate);
            if (copied) {
              newSourceDocumentPath = candidate;
              cloneMapping.filesMap.push({ original: originalLesson.sourceDocumentPath, cloned: candidate });
            }
          }

          if (originalLesson.transcriptKey) {
            const candidate = this.buildClonedStorageKey({
              domain: 'trn',
              sourceKey: originalLesson.transcriptKey,
              lessonId: originalLesson.id,
              userId,
              fallbackExt: '.txt',
            });
            const copied = await objectStorage.copyObject(originalLesson.transcriptKey, candidate);
            if (copied) {
              newTranscriptKey = candidate;
              cloneMapping.filesMap.push({ original: originalLesson.transcriptKey, cloned: candidate });
            }
          }

          if (originalLesson.generationParamsKey) {
            const candidate = this.buildClonedStorageKey({
              domain: 'lpr',
              sourceKey: originalLesson.generationParamsKey,
              lessonId: originalLesson.id,
              userId,
              fallbackExt: '.json',
            });
            const copied = await objectStorage.copyObject(originalLesson.generationParamsKey, candidate);
            if (copied) {
              newGenerationParamsKey = candidate;
              cloneMapping.filesMap.push({ original: originalLesson.generationParamsKey, cloned: candidate });
            }
          }

          // Insert cloned lesson
          const [clonedLesson] = await tx.insert(lessons).values({
            organizationId: originalLesson.organizationId,
            createdBy: userId,
            title: originalLesson.title,
            description: originalLesson.description,
            gradeLevel: originalLesson.gradeLevel,
            department: originalLesson.department,
            subject: originalLesson.subject,
            unit: originalLesson.unit,
            generationMode: originalLesson.generationMode,
            generationStatus: originalLesson.generationStatus,
            transcriptStatus: originalLesson.transcriptStatus,
            transcriptKey: newTranscriptKey,
            learningAssetContract: originalLesson.learningAssetContract,
            topics: originalLesson.topics,
            mainTopic: originalLesson.mainTopic,
            subtopic1: originalLesson.subtopic1,
            subtopic2: originalLesson.subtopic2,
            inputText: originalLesson.inputText,
            gammaCardId: originalLesson.gammaCardId,
            presentationUrl: originalLesson.presentationUrl,
            storageKey: newStorageKey,
            sourceDocumentPath: newSourceDocumentPath,
            generationParamsKey: newGenerationParamsKey,
            videoStorageKey: newVideoStorageKey,
            videoDurationSec: originalLesson.videoDurationSec,
            videoSizeBytes: originalLesson.videoSizeBytes,
            videoUploadedAt: originalLesson.videoUploadedAt,
            presenterNotesJson: originalLesson.presenterNotesJson,
            themeId: originalLesson.themeId,
            gammaImageOptions: originalLesson.gammaImageOptions,
            gammaTextOptions: originalLesson.gammaTextOptions,
            slideCount: originalLesson.slideCount,
            creditsUsed: originalLesson.creditsUsed,
            currentSlideVersion: originalLesson.currentSlideVersion,
            isPublished: false,
            isArchived: false,
            viewCount: 0,
            completionCount: 0,
            languageCode: originalLesson.languageCode,
            metadata: this.rewriteSourceAssetsInMetadata(originalLesson.metadata, cloneMapping.sourceAssetIdMap),
            contentScore10: originalLesson.contentScore10,
            previousScore10: originalLesson.previousScore10,
            feedbackReport: originalLesson.feedbackReport,
            detail: originalLesson.detail,
            realWorldExample: originalLesson.realWorldExample,
            sourceMap: originalLesson.sourceMap,
          }).returning();

          await tx.update(lessons).set({ contentGroupId: clonedLesson.id }).where(eq(lessons.id, clonedLesson.id));

          cloneMapping.lessonIdMap[originalLesson.id] = clonedLesson.id;
          console.log(`[CourseVersioningService] Cloned lesson ${originalLesson.id} -> ${clonedLesson.id}`);

          // 3b. Clone lesson slides
          const originalSlides = await db.query.lessonSlides.findMany({
            where: eq(lessonSlides.lessonId, originalLesson.id),
          });

          for (const slide of originalSlides) {
            await tx.insert(lessonSlides).values({
              lessonId: clonedLesson.id,
              version: slide.version,
              slideIndex: slide.slideIndex,
              title: slide.title,
              bullets: slide.bullets,
              speakerNotes: slide.speakerNotes,
              mediaPrompt: slide.mediaPrompt,
              role: slide.role,
            });
          }
          console.log(`[CourseVersioningService] Cloned ${originalSlides.length} slides for lesson ${clonedLesson.id}`);

          // 3c. Clone lesson presentation versions
          const originalPresentationVersions = await db.query.lessonPresentationVersions.findMany({
            where: eq(lessonPresentationVersions.lessonId, originalLesson.id),
          });

          for (const pv of originalPresentationVersions) {
            let newPvStorageKey = pv.storageKey;
            
            // Copy presentation version file if exists
            if (pv.storageKey) {
              newPvStorageKey = this.buildClonedStorageKey({
                domain: 'lpv',
                sourceKey: pv.storageKey,
                lessonId: originalLesson.id,
                userId,
                extraSeed: pv.id,
                fallbackExt: '.pptx',
              });
              const copied = await objectStorage.copyObject(pv.storageKey, newPvStorageKey);
              if (copied) {
                cloneMapping.filesMap.push({ original: pv.storageKey, cloned: newPvStorageKey });
              } else {
                newPvStorageKey = pv.storageKey; // Keep original if copy fails
              }
            }

            await tx.insert(lessonPresentationVersions).values({
              lessonId: clonedLesson.id,
              version: pv.version,
              gammaCardId: pv.gammaCardId,
              presentationUrl: pv.presentationUrl,
              storageKey: newPvStorageKey,
              themeId: pv.themeId,
              gammaImageOptions: pv.gammaImageOptions,
              gammaTextOptions: pv.gammaTextOptions,
              creditsCharged: pv.creditsCharged,
              isGenerated: pv.isGenerated,
              createdBy: userId,
            });
          }
          console.log(`[CourseVersioningService] Cloned ${originalPresentationVersions.length} presentation versions`);

          // 3d. Clone quiz collections linked to this lesson
          const originalQuizLinks = await db.query.lessonQuizLinks.findMany({
            where: eq(lessonQuizLinks.lessonId, originalLesson.id),
          });

          let clonedPrimaryQuizId: string | null = null;

          for (const quizLink of originalQuizLinks) {
            // Check if we already cloned this quiz
            if (cloneMapping.quizIdMap[quizLink.quizId]) {
              // Create link to already cloned quiz
              await tx.insert(lessonQuizLinks).values({
                lessonId: clonedLesson.id,
                quizId: cloneMapping.quizIdMap[quizLink.quizId],
                isPrimary: quizLink.isPrimary,
                presentationVersionId: quizLink.presentationVersionId,
                slideContentHash: quizLink.slideContentHash,
                isOutdated: quizLink.isOutdated,
              });
              if (quizLink.isPrimary) {
                clonedPrimaryQuizId = cloneMapping.quizIdMap[quizLink.quizId];
              }
              continue;
            }

            // Clone the quiz collection
            const originalQuiz = await db.query.quizCollections.findFirst({
              where: eq(quizCollections.id, quizLink.quizId),
            });

            if (!originalQuiz) {
              console.warn(`[CourseVersioningService] Quiz ${quizLink.quizId} not found, skipping`);
              continue;
            }

            const [clonedQuiz] = await tx.insert(quizCollections).values({
              organizationId: originalQuiz.organizationId,
              subjectId: originalQuiz.subjectId,
              createdBy: userId,
              name: originalQuiz.name,
              description: originalQuiz.description,
              totalCards: originalQuiz.totalCards,
              imageKey: this.rewriteSourceAssetImageKey(originalQuiz.imageKey, cloneMapping.sourceAssetStorageKeyMap),
              isActive: originalQuiz.isActive,
              isPublic: false,
              isDeleted: false,
              difficulty: originalQuiz.difficulty,
              passPercentage: originalQuiz.passPercentage,
              languageCode: originalQuiz.languageCode,
            }).returning();

            await tx.update(quizCollections).set({ contentGroupId: clonedQuiz.id }).where(eq(quizCollections.id, clonedQuiz.id));

            cloneMapping.quizIdMap[originalQuiz.id] = clonedQuiz.id;
            console.log(`[CourseVersioningService] Cloned quiz ${originalQuiz.id} -> ${clonedQuiz.id}`);

            // Clone quiz cards
            const originalCards = await db.query.quizCards.findMany({
              where: eq(quizCards.collectionId, originalQuiz.id),
            });

            for (const card of originalCards) {
              const [clonedCard] = await tx.insert(quizCards).values({
                collectionId: clonedQuiz.id,
                questionType: card.questionType,
                question: card.question,
                answer1: card.answer1,
                answer2: card.answer2,
                answer3: card.answer3,
                answer4: card.answer4,
                answer5: card.answer5,
                answer6: card.answer6,
                correctAnswerIndex: card.correctAnswerIndex,
                matchPairs: card.matchPairs,
                correctAnswer: card.correctAnswer,
                imageKey: this.rewriteSourceAssetImageKey(card.imageKey, cloneMapping.sourceAssetStorageKeyMap),
                displayOrder: card.displayOrder,
              }).returning();

              cloneMapping.quizCardIdMap[card.id] = clonedCard.id;
            }
            console.log(`[CourseVersioningService] Cloned ${originalCards.length} quiz cards`);

            // Create lesson quiz link
            await tx.insert(lessonQuizLinks).values({
              lessonId: clonedLesson.id,
              quizId: clonedQuiz.id,
              isPrimary: quizLink.isPrimary,
              presentationVersionId: quizLink.presentationVersionId,
              slideContentHash: quizLink.slideContentHash,
              isOutdated: quizLink.isOutdated,
            });

            if (quizLink.isPrimary) {
              clonedPrimaryQuizId = clonedQuiz.id;
            }
          }

          // 3e. Create new courseLesson record
          const [clonedCourseLesson] = await tx.insert(courseLessons).values({
            courseId: draftCourse.id,
            lessonId: clonedLesson.id,
            topicId: courseLesson.topicId,
            topicOrder: courseLesson.topicOrder,
            topicName: courseLesson.topicName,
            primaryQuizId: clonedPrimaryQuizId,
            learningObjectives: courseLesson.learningObjectives,
            lessonDetail: courseLesson.lessonDetail,
            realWorldExample: courseLesson.realWorldExample,
            lessonType: courseLesson.lessonType,
            contentHealth: courseLesson.contentHealth,
          }).returning();

          cloneMapping.courseLessonIdMap[courseLesson.id] = clonedCourseLesson.id;
        }

        await this.cloneCourseSourceAssetLinks({
          tx,
          draftCourseId: draftCourse.id,
          userId,
          cloneMapping,
        });

        // 4. Update draft course with clone mapping
        const [result] = await tx.update(courses)
          .set({
            cloneMapping: cloneMapping,
          })
          .where(eq(courses.id, draftCourse.id))
          .returning();

        console.log(`[CourseVersioningService] Full clone completed for course ${courseId} -> draft ${draftCourse.id}`);
        console.log(`[CourseVersioningService] Clone stats: ${Object.keys(cloneMapping.lessonIdMap).length} lessons, ${Object.keys(cloneMapping.quizIdMap).length} quizzes, ${cloneMapping.filesMap.length} files`);

        return result;
      });

      return updatedDraftCourse;
    } catch (error) {
      console.error(`[CourseVersioningService] Transaction failed, rolling back. Error:`, error);
      
      // Clean up any object storage files that were copied before the transaction failed
      if (cloneMapping.filesMap.length > 0) {
        console.log(`[CourseVersioningService] Cleaning up ${cloneMapping.filesMap.length} orphaned files after failed transaction`);
        await this.cleanupFiles(cloneMapping.filesMap.map(f => f.cloned));
      }
      
      throw error;
    }
  }

  /**
   * Get the active draft for a course (if any)
   * Now looks for a course with sourceVersionCourseId pointing to the original
   */
  static async getDraft(courseId: string): Promise<Course | null> {
    const draft = await db.query.courses.findFirst({
      where: and(
        eq(courses.sourceVersionCourseId, courseId),
        eq(courses.status, 'draft')
      ),
    });
    return draft || null;
  }

  /**
   * Check if a course has an active draft
   */
  static async hasDraft(courseId: string): Promise<boolean> {
    const draft = await this.getDraft(courseId);
    return draft !== null;
  }

  /**
   * Update draft fields
   * Now updates the draft course record directly
   */
  static async updateDraft(draftId: string, data: Partial<Omit<Course, 'id' | 'createdAt' | 'sourceVersionCourseId' | 'cloneMapping'>>): Promise<Course> {
    const [updated] = await db.update(courses)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(
        eq(courses.id, draftId),
        eq(courses.status, 'draft')
      ))
      .returning();

    if (!updated) {
      throw new Error('Draft not found');
    }

    console.log(`[CourseVersioningService] Draft ${draftId} updated`);
    return updated;
  }

  /**
   * Publish draft - copies draft content back to original course
   * This is a complex operation that reconciles all changes
   */
  static async publishDraft(params: {
    draftId: string;
    userId: string;
  }): Promise<{ course: Course; message: string }> {
    const { draftId, userId } = params;

    const draft = await db.query.courses.findFirst({
      where: and(
        eq(courses.id, draftId),
        eq(courses.status, 'draft')
      ),
    });

    if (!draft) {
      throw new Error('Draft not found');
    }

    if (!draft.sourceVersionCourseId) {
      throw new Error('Draft has no source course reference');
    }

    // For now, we'll update the original course with draft metadata
    // and then delete the draft. A full implementation would need to
    // reconcile all the cloned content back to the original.
    const [updatedCourse] = await db.update(courses)
      .set({
        title: draft.title.replace('[DRAFT] ', ''),
        description: draft.description,
        thumbnailUrl: draft.thumbnailUrl,
        price: draft.price,
        currency: draft.currency,
        difficultyLevel: draft.difficultyLevel,
        estimatedDuration: draft.estimatedDuration,
        visibility: draft.visibility,
        categoryId: draft.categoryId,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(courses.id, draft.sourceVersionCourseId))
      .returning();

    if (!updatedCourse) {
      throw new Error('Failed to update original course');
    }

    // Delete the draft course (cascades to all related records)
    await db.delete(courses).where(eq(courses.id, draftId));

    console.log(`[CourseVersioningService] Draft ${draftId} published to course ${draft.sourceVersionCourseId} by user ${userId}`);

    return {
      course: updatedCourse,
      message: 'Draft published successfully',
    };
  }

  /**
   * Discard/delete a draft without publishing
   * Deleting the draft course cascades to all cloned content
   */
  static async discardDraft(draftId: string): Promise<void> {
    const draft = await db.query.courses.findFirst({
      where: and(
        eq(courses.id, draftId),
        eq(courses.status, 'draft')
      ),
    });

    if (!draft) {
      throw new Error('Draft not found');
    }

    // Clean up cloned object storage files using cloneMapping.filesMap
    const cloneMapping = draft.cloneMapping as CloneMapping | null;
    if (cloneMapping?.filesMap?.length) {
      console.log(`[CourseVersioningService] Cleaning up ${cloneMapping.filesMap.length} cloned files`);
      await this.cleanupFiles(cloneMapping.filesMap.map(f => f.cloned));
    }

    // Delete the draft course (cascades to all related records)
    await db.delete(courses).where(eq(courses.id, draftId));

    console.log(`[CourseVersioningService] Draft ${draftId} discarded`);
  }

  /**
   * Clean up object storage files after publishing
   * Deletes the ORIGINAL course's files since we're now using the cloned versions
   * 
   * @param cloneMapping - The mapping from the draft course
   * @returns Count of successfully deleted files
   */
  static async cleanupOriginalFilesAfterPublish(cloneMapping: CloneMapping | null): Promise<number> {
    if (!cloneMapping?.filesMap?.length) {
      console.log(`[CourseVersioningService] No files to clean up after publish`);
      return 0;
    }

    // After publishing, the draft becomes the active course, so we delete the ORIGINAL files
    const filesToDelete = cloneMapping.filesMap.map(f => f.original);
    console.log(`[CourseVersioningService] Cleaning up ${filesToDelete.length} original files after publish`);
    
    return await this.cleanupFiles(filesToDelete);
  }

  /**
   * Helper method to delete a list of object storage files
   * Logs errors but continues processing to ensure best-effort cleanup
   * 
   * @param fileKeys - Array of object storage keys to delete
   * @returns Count of successfully deleted files
   */
  static async cleanupFiles(fileKeys: string[]): Promise<number> {
    if (!fileKeys.length) {
      return 0;
    }

    const objectStorage = new ObjectStorageService();
    let successCount = 0;

    for (const fileKey of fileKeys) {
      try {
        const deleted = await objectStorage.deleteObject(fileKey);
        if (deleted) {
          successCount++;
          console.log(`[CourseVersioningService] Deleted file: ${fileKey}`);
        } else {
          console.warn(`[CourseVersioningService] File not found or already deleted: ${fileKey}`);
        }
      } catch (error) {
        console.error(`[CourseVersioningService] Failed to delete file ${fileKey}:`, error);
      }
    }

    console.log(`[CourseVersioningService] Cleanup complete: ${successCount}/${fileKeys.length} files deleted`);
    return successCount;
  }
}

function pathExt(input: string | null | undefined): string {
  const value = String(input || "").trim();
  const match = value.match(/\.([a-z0-9]+)(?:[?#].*)?$/i);
  return match ? `.${match[1]}` : "";
}
