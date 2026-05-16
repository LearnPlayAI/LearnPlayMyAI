import { db } from "../db";
import { eq, and, lt, desc, sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import { aiTranslationService } from "../services/aiTranslationService";
import { HybridCreditService } from "../services/hybridCreditService";
import { PptxExtractor } from "../services/pptxExtractor";
import { ObjectStorageService } from "../objectStorage";
import { LessonPodcastService } from "../services/lessonPodcastService";
import { LessonService } from "../services/lessonService";
import { PptxTextTranslationService } from "../services/pptxTextTranslationService";
import { JobQueueService } from "../services/jobQueueService";
import { LessonDigestService } from "../services/lessonDigestService";
import { LessonStepGuideService } from "../services/lessonStepGuideService";
import { TranslationAnalyticsService } from "../services/translationAnalyticsService";

const objectStorage = new ObjectStorageService();
const pptxExtractor = new PptxExtractor();

type AssetStatusValue = "queued" | "pending" | "processing" | "completed" | "failed" | "cancelled" | "skipped" | "deferred_optional";

interface TranslationPackageOptions {
  includeSourceDb?: boolean;
  includeWordDocs?: boolean;
  includeQuiz?: boolean;
  includePodcastScript?: boolean;
  includePodcastAudio?: boolean;
  includePptx?: boolean;
  includeObjectives?: boolean;
  includeDigest?: boolean;
  includeStepGuide?: boolean;
  pptxMode?: "translate_source" | "generate_new";
  selectedSourceContentVersionId?: string;
  selectedWordDocVersionId?: string;
  selectedPptxVersionId?: string;
  selectedPptxStorageKey?: string | null;
  selectedQuizIds?: string[];
  selectedPodcastScriptVersionId?: string | null;
  selectedPodcastAudioVersionId?: string | null;
  selectedSourceDbText?: string;
  selectedSourceDbHash?: string | null;
  targetLanguageByArtifact?: Record<string, string>;
}

interface TranslationPackageConfig {
  sourceLessonId?: string;
  sourceLanguageCode?: string;
  targetLanguageCode?: string;
  options?: TranslationPackageOptions;
  podcastConfig?: {
    sourceType?: "sourcedb" | "word" | "pptx";
    sourceMaterialId?: string;
    voiceId?: string;
    guestVoiceId?: string;
    format?: "bulletin" | "conversation";
    duration?: "short" | "default" | "long";
    hostDisplayName?: string;
    guestDisplayName?: string;
  };
  assets?: Record<string, AssetStatusValue>;
  errors?: Record<string, string>;
  translatedArtifacts?: Record<string, {
    translatedAt: string;
    languageCode: string;
    sourceVersionHash?: string | null;
    selectedVersionId?: string | null;
  }>;
  sourceContracts?: Record<string, {
    selectedVersionId?: string | null;
    sourceVersionHash?: string | null;
    sourceTimestamp?: string;
    sourceLanguageCode?: string;
  }>;
  chargeCorrelationId?: string;
  lastUpdatedAt?: string;
}

export class TranslationWorker {
  private static intervalId: NodeJS.Timeout | null = null;
  private static readonly INTERVAL_MS = 5000;
  private static isRunning = false;
  private static readonly STALE_TIMEOUT_MS = 10 * 60 * 1000;
  private static readonly ASYNC_HANDOFF_ASSETS = new Set(["podcastAudio"]);

  private static async tryLockJob(jobId: string): Promise<boolean> {
    const lockResult = await db.execute(sql<{ acquired: boolean }>`
      SELECT pg_try_advisory_lock(hashtext(${`lesson_translation_job:${jobId}`})) AS acquired
    `);
    return Boolean(lockResult.rows?.[0]?.acquired);
  }

  private static async unlockJob(jobId: string): Promise<void> {
    await db.execute(sql`
      SELECT pg_advisory_unlock(hashtext(${`lesson_translation_job:${jobId}`}))
    `);
  }

  static start(): void {
    if (this.intervalId) {
      console.log("[TranslationWorker] Already running");
      return;
    }
    console.log("[TranslationWorker] Starting worker...");
    this.processQueue();
    this.intervalId = setInterval(() => {
      this.processQueue();
    }, this.INTERVAL_MS);
    console.log(`[TranslationWorker] Started with ${this.INTERVAL_MS}ms interval`);
  }

  static stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[TranslationWorker] Stopped");
    }
  }

  private static async processQueue(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const tenMinutesAgo = new Date(Date.now() - this.STALE_TIMEOUT_MS);
      const stuckJobs = await db
        .select()
        .from(schema.lessonTranslationJobs)
        .where(
          and(
            eq(schema.lessonTranslationJobs.status, 'translating'),
            lt(schema.lessonTranslationJobs.updatedAt, tenMinutesAgo)
          )
        );

      for (const stuckJob of stuckJobs) {
        const locked = await this.tryLockJob(stuckJob.id);
        if (!locked) continue;
        try {
          const [fresh] = await db
            .select()
            .from(schema.lessonTranslationJobs)
            .where(eq(schema.lessonTranslationJobs.id, stuckJob.id))
            .limit(1);
          if (!fresh) continue;
          const isStillStale =
            fresh.status === 'translating'
            && !!fresh.updatedAt
            && new Date(fresh.updatedAt).getTime() < tenMinutesAgo.getTime();
          if (!isStillStale) continue;
          if (await this.isAsyncHandoffOnlyJob(fresh.lessonId)) {
            continue;
          }
          console.warn(`[TranslationWorker] Job ${stuckJob.id} stuck for >10 minutes, marking as failed`);
          await this.failJob(fresh, 'Translation timed out after 10 minutes');
        } finally {
          await this.unlockJob(stuckJob.id);
        }
      }

      const candidates = await db
        .select()
        .from(schema.lessonTranslationJobs)
        .where(eq(schema.lessonTranslationJobs.status, 'translating'))
        .orderBy(schema.lessonTranslationJobs.createdAt)
        .limit(10);
      if (!candidates.length) return;

      for (const job of candidates) {
        const locked = await this.tryLockJob(job.id);
        if (!locked) continue;
        try {
          const [fresh] = await db
            .select()
            .from(schema.lessonTranslationJobs)
            .where(and(
              eq(schema.lessonTranslationJobs.id, job.id),
              eq(schema.lessonTranslationJobs.status, 'translating'),
            ))
            .limit(1);
          if (!fresh) continue;
          if (await this.isAsyncHandoffOnlyJob(fresh.lessonId)) {
            continue;
          }

          console.log(`[TranslationWorker] Processing translation job ${fresh.id} for lesson ${fresh.lessonId}`);
          try {
            await this.processTranslationJob(fresh);
          } catch (error) {
            console.error(`[TranslationWorker] Job ${fresh.id} failed:`, error);
            await this.failJob(fresh, error instanceof Error ? error.message : 'Unknown error');
          }
          return;
        } finally {
          await this.unlockJob(job.id);
        }
      }
    } catch (error) {
      console.error("[TranslationWorker] Error processing queue:", error);
    } finally {
      this.isRunning = false;
    }
  }

  private static isAsyncHandoffAsset(asset: string, pkg?: TranslationPackageConfig): boolean {
    if (this.ASYNC_HANDOFF_ASSETS.has(asset)) return true;
    if (asset === "pptx") {
      return (pkg?.options?.pptxMode || "translate_source") === "generate_new";
    }
    return false;
  }

  private static async isAsyncHandoffOnlyJob(lessonId: string): Promise<boolean> {
    const [lesson] = await db
      .select({ metadata: schema.lessons.metadata })
      .from(schema.lessons)
      .where(eq(schema.lessons.id, lessonId))
      .limit(1);
    const pkg = lesson?.metadata && typeof lesson.metadata === "object"
      ? (lesson.metadata as any).translationPackage
      : null;
    const assets = pkg?.assets && typeof pkg.assets === "object" ? pkg.assets : null;
    if (!assets) return false;
    const pendingAssets = Object.entries(assets)
      .filter(([, value]) => !["completed", "skipped", "failed", "cancelled", "deferred_optional"].includes(String(value)))
      .map(([key]) => key);
    return pendingAssets.length > 0 && pendingAssets.every((key) => this.isAsyncHandoffAsset(String(key), pkg));
  }

  private static getTranslationPackage(lesson: typeof schema.lessons.$inferSelect): TranslationPackageConfig {
    const metadata = lesson.metadata && typeof lesson.metadata === "object" ? lesson.metadata as any : {};
    const pkg = metadata.translationPackage && typeof metadata.translationPackage === "object"
      ? metadata.translationPackage as TranslationPackageConfig
      : {};
    const options = pkg.options || {};
    return {
      ...pkg,
      options: {
        includeSourceDb: options.includeSourceDb !== false,
        includeWordDocs: options.includeWordDocs !== false,
        includeQuiz: options.includeQuiz !== false,
        includePodcastScript: options.includePodcastScript === true,
        includePodcastAudio: options.includePodcastAudio === true,
        includePptx: options.includePptx === true,
        includeObjectives: options.includeObjectives === true,
        includeDigest: options.includeDigest === true,
        includeStepGuide: options.includeStepGuide ?? (options.includeDigest === true),
        pptxMode: options.pptxMode === "generate_new" ? "generate_new" : "translate_source",
        selectedSourceContentVersionId: options.selectedSourceContentVersionId || "current",
        selectedWordDocVersionId: options.selectedWordDocVersionId || "current",
        selectedPptxVersionId: options.selectedPptxVersionId || "current",
        selectedPptxStorageKey: options.selectedPptxStorageKey || null,
        selectedQuizIds: Array.isArray(options.selectedQuizIds) ? options.selectedQuizIds.map((id: any) => String(id)) : [],
        selectedPodcastScriptVersionId: options.selectedPodcastScriptVersionId || null,
        selectedPodcastAudioVersionId: options.selectedPodcastAudioVersionId || null,
        selectedSourceDbText: options.selectedSourceDbText || undefined,
        selectedSourceDbHash: options.selectedSourceDbHash || null,
        targetLanguageByArtifact: options.targetLanguageByArtifact && typeof options.targetLanguageByArtifact === "object"
          ? options.targetLanguageByArtifact
          : {},
      },
      assets: pkg.assets && typeof pkg.assets === "object" ? { ...pkg.assets } : {},
      errors: pkg.errors && typeof pkg.errors === "object" ? { ...pkg.errors } : {},
      sourceContracts: pkg.sourceContracts && typeof pkg.sourceContracts === "object" ? { ...pkg.sourceContracts } : {},
      translatedArtifacts: pkg.translatedArtifacts && typeof pkg.translatedArtifacts === "object" ? { ...pkg.translatedArtifacts } : {},
    };
  }

  private static async persistTranslationPackage(
    lesson: typeof schema.lessons.$inferSelect,
    pkg: TranslationPackageConfig
  ): Promise<typeof schema.lessons.$inferSelect> {
    const freshLesson = await this.reloadLesson(lesson.id);
    const baseLesson = freshLesson || lesson;
    const metadata = baseLesson.metadata && typeof baseLesson.metadata === "object" ? { ...(baseLesson.metadata as any) } : {};
    metadata.translationPackage = {
      ...pkg,
      lastUpdatedAt: new Date().toISOString(),
    };
    const [updated] = await db.update(schema.lessons)
      .set({ metadata, updatedAt: new Date() })
      .where(eq(schema.lessons.id, baseLesson.id))
      .returning();
    return updated || baseLesson;
  }

  private static async reloadLesson(lessonId: string): Promise<typeof schema.lessons.$inferSelect | null> {
    const [lesson] = await db
      .select()
      .from(schema.lessons)
      .where(eq(schema.lessons.id, lessonId))
      .limit(1);
    return lesson || null;
  }

  private static async setAssetStatus(
    lesson: typeof schema.lessons.$inferSelect,
    pkg: TranslationPackageConfig,
    asset: string,
    status: AssetStatusValue,
    errorMessage?: string
  ): Promise<{ lesson: typeof schema.lessons.$inferSelect; pkg: TranslationPackageConfig }> {
    pkg.assets = pkg.assets || {};
    pkg.errors = pkg.errors || {};
    pkg.translatedArtifacts = pkg.translatedArtifacts || {};
    pkg.sourceContracts = pkg.sourceContracts || {};
    pkg.assets[asset] = status;
    if (errorMessage) {
      pkg.errors[asset] = errorMessage;
    } else {
      delete pkg.errors[asset];
    }
    if (status === "completed" || status === "failed" || status === "cancelled" || status === "skipped") {
      pkg.translatedArtifacts[asset] = {
        translatedAt: new Date().toISOString(),
        languageCode: pkg.targetLanguageCode || "en",
        sourceVersionHash: pkg.sourceContracts?.[asset]?.sourceVersionHash || null,
        selectedVersionId: pkg.sourceContracts?.[asset]?.selectedVersionId || null,
      };
    }
    const updatedLesson = await this.persistTranslationPackage(lesson, pkg);
    return { lesson: updatedLesson, pkg };
  }

  private static async processTranslationJob(job: typeof schema.lessonTranslationJobs.$inferSelect): Promise<void> {
    const { lessonId, sourceLessonId, targetLanguageCode, sourceLanguageCode } = job;

    let [translatedLesson] = await db
      .select()
      .from(schema.lessons)
      .where(eq(schema.lessons.id, lessonId))
      .limit(1);

    if (!translatedLesson) {
      throw new Error(`Translated lesson ${lessonId} not found`);
    }

    const [sourceLesson] = await db
      .select()
      .from(schema.lessons)
      .where(eq(schema.lessons.id, sourceLessonId))
      .limit(1);

    if (!sourceLesson) {
      throw new Error(`Source lesson ${sourceLessonId} not found`);
    }

    let translationPackage = this.getTranslationPackage(translatedLesson);
    const options = translationPackage.options || {};
    const effectiveSourceLanguage = translationPackage.sourceLanguageCode || sourceLanguageCode || sourceLesson.languageCode || 'en';
    const translationCorrelationId = String(translationPackage.chargeCorrelationId || "").trim() || null;
    console.log("[TranslationWorkerOrchestration]", JSON.stringify({
      stage: "job_processing_started",
      jobId: job.id,
      sourceLessonId,
      translatedLessonId: lessonId,
      organizationId: job.organizationId,
      targetLanguageCode,
      sourceLanguageCode: effectiveSourceLanguage,
      translationCorrelationId,
    }));

    let translated: { title: string; description: string; inputText: string } = {
      title: translatedLesson.title,
      description: translatedLesson.description || "",
      inputText: translatedLesson.inputText || "",
    };

    if (options.includeSourceDb) {
      ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
        translatedLesson,
        translationPackage,
        "sourceDb",
        "processing",
      ));

      let contentToTranslate = options.selectedSourceDbText || sourceLesson.inputText;
      if (!contentToTranslate || contentToTranslate.trim().length === 0) {
        if (sourceLesson.storageKey) {
          console.log(`[TranslationWorker] Job ${job.id}: No inputText found, extracting text from PPTX (storageKey: ${sourceLesson.storageKey})`);
          try {
            const pptxBuffer = await objectStorage.downloadLessonPPTXBuffer(sourceLesson.storageKey);
            const extractResult = await pptxExtractor.extractFromBuffer(pptxBuffer);

            if (extractResult.slides.length === 0) {
              throw new Error('PPTX file contains no extractable text content');
            }

            contentToTranslate = extractResult.slides
              .map(slide => {
                const parts: string[] = [];
                if (slide.title) parts.push(`## ${slide.title}`);
                if (slide.body) parts.push(slide.body);
                if (slide.notes) parts.push(`Speaker Notes: ${slide.notes}`);
                return parts.join('\n');
              })
              .join('\n\n---\n\n');
          } catch (extractError) {
            throw new Error(`Failed to extract content from PPTX: ${extractError instanceof Error ? extractError.message : 'Unknown error'}`);
          }
        } else {
          throw new Error('No content available to translate: lesson has no text content and no PPTX file');
        }
      }

      translated = await aiTranslationService.translateLessonContent(
        {
          title: sourceLesson.title,
          description: sourceLesson.description,
          inputText: contentToTranslate,
        },
        targetLanguageCode,
        effectiveSourceLanguage
      );

      const [updatedTranslatedLesson] = await db.update(schema.lessons)
        .set({
          title: translated.title,
          description: translated.description || sourceLesson.description,
          inputText: translated.inputText || contentToTranslate,
          generationStatus: 'completed',
          updatedAt: new Date(),
        })
        .where(eq(schema.lessons.id, lessonId))
        .returning();

      if (updatedTranslatedLesson) {
        await this.createSourceDbTranslationVersion({
          lessonId,
          previousLesson: translatedLesson,
          currentLesson: updatedTranslatedLesson,
          targetLanguageCode,
          sourceLanguageCode: effectiveSourceLanguage,
          userId: job.initiatedBy,
          jobId: job.id,
        });
        translatedLesson = updatedTranslatedLesson;
      }

      ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
        translatedLesson,
        translationPackage,
        "sourceDb",
        "completed",
      ));
    }

    if (options.includeWordDocs) {
      ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
        translatedLesson,
        translationPackage,
        "wordDocs",
        "processing",
      ));
      try {
        const translatedContent = translated.inputText || translatedLesson.inputText || sourceLesson.inputText || "";
        if (translatedContent && translatedContent.trim().length > 0) {
          const { generateSimpleDocx } = await import('../services/courseTranslationOrchestrator');
          const docxBuffer = await generateSimpleDocx(
            translated.title || translatedLesson.title || sourceLesson.title,
            translatedContent
          );
          const sourceDocumentPath = await objectStorage.uploadSourceDocument(
            job.organizationId || '',
            lessonId,
            docxBuffer,
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            `${translated.title || translatedLesson.title || sourceLesson.title}.docx`,
            targetLanguageCode
          );
          const [updated] = await db.update(schema.lessons)
            .set({ sourceDocumentPath, updatedAt: new Date() })
            .where(eq(schema.lessons.id, lessonId))
            .returning();
          if (updated) translatedLesson = updated;
          console.log(`[TranslationWorker] Generated Word doc for translated lesson ${lessonId} at ${sourceDocumentPath}`);
        }
        ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
          translatedLesson,
          translationPackage,
          "wordDocs",
          "completed",
        ));
      } catch (docError: any) {
        console.warn(`[TranslationWorker] Word doc generation failed for job ${job.id}, continuing:`, docError);
        ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
          translatedLesson,
          translationPackage,
          "wordDocs",
          "failed",
          String(docError?.message || "Word document translation failed")
        ));
      }
    }

    if (options.includePptx) {
      ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
        translatedLesson,
        translationPackage,
        "pptx",
        "processing",
      ));
      try {
        if (options.pptxMode === "translate_source") {
          const selectedPptxStorageKey = options.selectedPptxStorageKey || sourceLesson.storageKey;
          if (selectedPptxStorageKey) {
            const sourcePptxBuffer = await objectStorage.downloadLessonPPTXBuffer(selectedPptxStorageKey);
            const translatedPptx = await PptxTextTranslationService.translatePptxText(
              sourcePptxBuffer,
              targetLanguageCode,
              effectiveSourceLanguage,
            );

            await LessonService.storePPTX(lessonId, translatedPptx.buffer, job.initiatedBy, {
              isGenerated: false,
              isCompressed: false,
              languageCode: targetLanguageCode,
            });
          } else {
            const sourceSlides = await db
              .select()
              .from(schema.lessonSlides)
              .where(
                and(
                  eq(schema.lessonSlides.lessonId, sourceLessonId),
                  eq(schema.lessonSlides.version, sourceLesson.currentSlideVersion || 1)
                )
              )
              .orderBy(schema.lessonSlides.slideIndex);

            if (sourceSlides.length > 0) {
              const translatedSlides = await aiTranslationService.translateSlides(
                sourceSlides.map(s => ({
                  title: s.title,
                  bullets: (s.bullets as string[]) || [],
                  speakerNotes: s.speakerNotes,
                })),
                targetLanguageCode,
                effectiveSourceLanguage
              );

              for (let i = 0; i < translatedSlides.length; i++) {
                const sourceSlide = sourceSlides[i];
                const ts = translatedSlides[i];
                await db.insert(schema.lessonSlides).values({
                  lessonId: lessonId,
                  slideIndex: sourceSlide.slideIndex,
                  version: 1,
                  title: ts.title || sourceSlide.title,
                  bullets: ts.bullets || sourceSlide.bullets,
                  speakerNotes: ts.speakerNotes || sourceSlide.speakerNotes,
                  mediaPrompt: sourceSlide.mediaPrompt,
                  role: sourceSlide.role,
                });
              }

              const [updatedSlidesLesson] = await db.update(schema.lessons)
                .set({ currentSlideVersion: 1, updatedAt: new Date() })
                .where(eq(schema.lessons.id, lessonId))
                .returning();
              if (updatedSlidesLesson) translatedLesson = updatedSlidesLesson;
            } else {
              throw new Error("No source PPTX or source slides available to translate.");
            }
          }
        } else {
          if (!String(translatedLesson.inputText || "").trim()) {
            throw new Error("Translated lesson has no content for generate_new PPTX mode.");
          }

          await db.update(schema.lessons)
            .set({ generationStatus: "pending", updatedAt: new Date() })
            .where(eq(schema.lessons.id, lessonId));

          const [pricing] = await db
            .select()
            .from(schema.platformPricing)
            .orderBy(desc(schema.platformPricing.updatedAt), desc(schema.platformPricing.createdAt))
            .limit(1);
          const creditsRequired = pricing?.creditsPerTranslatedPptxGeneration ?? 50;

          await HybridCreditService.deductWithFallback({
            userId: job.initiatedBy,
            organizationId: job.organizationId,
            amount: creditsRequired,
            type: 'deduction',
            activityType: 'content_translation' as const,
            correlationId: `translated-pptx-gen-${lessonId}-from-worker`,
            description: `Translated PPTX generation for lesson ${lessonId}`,
            metadata: { lessonId, isTranslatedPptx: true, triggeredBy: 'translation_worker' },
          });

          await JobQueueService.createJobWithCleanup({
            organizationId: job.organizationId,
            lessonId,
            metadata: {
              inputText: translatedLesson.inputText,
              themeId: translatedLesson.themeId || 'default-light',
              numCards: 10,
              generateImages: true,
              imageStyle: 'photorealistic',
              userId: job.initiatedBy,
              isRegeneration: true,
              isTranslatedPptx: true,
            },
          });
        }

        ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
          translatedLesson,
          translationPackage,
          "pptx",
          options.pptxMode === "generate_new" ? "processing" : "completed",
        ));
      } catch (pptxError: any) {
        console.warn(`[TranslationWorker] PPTX translation failed for job ${job.id}, continuing:`, pptxError);
        ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
          translatedLesson,
          translationPackage,
          "pptx",
          "failed",
          String(pptxError?.message || "PPTX translation failed")
        ));
      }
    }

    const quizLinks = await db
      .select()
      .from(schema.lessonQuizLinks)
      .where(eq(schema.lessonQuizLinks.lessonId, sourceLessonId));
    const selectedQuizIdSet = new Set((options.selectedQuizIds || []).map((id) => String(id)));
    const effectiveQuizLinks = selectedQuizIdSet.size > 0
      ? quizLinks.filter((link) => selectedQuizIdSet.has(String(link.quizId)))
      : quizLinks;

    if (options.includeQuiz) {
      ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
        translatedLesson,
        translationPackage,
        "quiz",
        "processing",
      ));
    }

    for (const link of (options.includeQuiz ? effectiveQuizLinks : [])) {
      try {
        const [sourceQuiz] = await db
          .select()
          .from(schema.quizCollections)
          .where(eq(schema.quizCollections.id, link.quizId))
          .limit(1);

        if (!sourceQuiz) continue;

        const contentGroupId = sourceQuiz.contentGroupId || sourceQuiz.id;

        let [translatedQuiz] = await db
          .select()
          .from(schema.quizCollections)
          .where(and(
            eq(schema.quizCollections.contentGroupId, contentGroupId),
            eq(schema.quizCollections.languageCode, targetLanguageCode)
          ))
          .limit(1);

        if (!translatedQuiz) {
          const [newQuiz] = await db.insert(schema.quizCollections).values({
            name: sourceQuiz.name,
            description: sourceQuiz.description,
            organizationId: sourceQuiz.organizationId,
            createdBy: sourceQuiz.createdBy,
            contentGroupId: contentGroupId,
            languageCode: targetLanguageCode,
            isDefaultLanguage: false,
            translationStatus: "draft",
            sourceLanguageVersion: sourceQuiz.sourceLanguageVersion || 1,
            totalCards: sourceQuiz.totalCards,
            difficulty: sourceQuiz.difficulty,
            passPercentage: sourceQuiz.passPercentage,
            isPublic: sourceQuiz.isPublic,
            subjectId: sourceQuiz.subjectId,
          }).returning();
          translatedQuiz = newQuiz;

          const sourceCardsForCopy = await db
            .select()
            .from(schema.quizCards)
            .where(eq(schema.quizCards.collectionId, sourceQuiz.id))
            .orderBy(schema.quizCards.displayOrder);

          for (const card of sourceCardsForCopy) {
            await db.insert(schema.quizCards).values({
              collectionId: translatedQuiz.id,
              question: card.question,
              questionType: card.questionType,
              answer1: card.answer1,
              answer2: card.answer2,
              answer3: card.answer3,
              answer4: card.answer4,
              answer5: card.answer5,
              answer6: card.answer6,
              correctAnswerIndex: card.correctAnswerIndex,
              matchPairs: card.matchPairs,
              correctAnswer: card.correctAnswer,
              displayOrder: card.displayOrder,
            });
          }
        }

        const sourceCards = await db
          .select()
          .from(schema.quizCards)
          .where(eq(schema.quizCards.collectionId, sourceQuiz.id))
          .orderBy(schema.quizCards.displayOrder);

        const [translatedName, translatedDescription] = await Promise.all([
          aiTranslationService.translateText(sourceQuiz.name, targetLanguageCode, effectiveSourceLanguage),
          sourceQuiz.description
            ? aiTranslationService.translateText(sourceQuiz.description, targetLanguageCode, effectiveSourceLanguage)
            : Promise.resolve(null),
        ]);

        await db.update(schema.quizCollections)
          .set({
            name: translatedName,
            description: translatedDescription,
          })
          .where(eq(schema.quizCollections.id, translatedQuiz.id));

        if (sourceCards.length > 0) {
          const translatedCards = await aiTranslationService.translateQuizCards(
            sourceCards.map(c => ({
              question: c.question,
              questionType: c.questionType,
              answer1: c.answer1,
              answer2: c.answer2,
              answer3: c.answer3,
              answer4: c.answer4,
              answer5: c.answer5,
              answer6: c.answer6,
              matchPairs: c.matchPairs,
              correctAnswer: c.correctAnswer,
            })),
            targetLanguageCode,
            effectiveSourceLanguage
          );

          const existingTranslatedCards = await db
            .select()
            .from(schema.quizCards)
            .where(eq(schema.quizCards.collectionId, translatedQuiz.id))
            .orderBy(schema.quizCards.displayOrder);

          for (let i = 0; i < existingTranslatedCards.length && i < translatedCards.length; i++) {
            await db.update(schema.quizCards)
              .set({
                question: translatedCards[i].question,
                answer1: translatedCards[i].answer1 ?? existingTranslatedCards[i].answer1,
                answer2: translatedCards[i].answer2 ?? existingTranslatedCards[i].answer2,
                answer3: translatedCards[i].answer3 ?? existingTranslatedCards[i].answer3,
                answer4: translatedCards[i].answer4 ?? existingTranslatedCards[i].answer4,
                answer5: translatedCards[i].answer5 ?? null,
                answer6: translatedCards[i].answer6 ?? null,
                matchPairs: translatedCards[i].matchPairs ?? existingTranslatedCards[i].matchPairs,
                correctAnswer: translatedCards[i].correctAnswer ?? existingTranslatedCards[i].correctAnswer,
              })
              .where(eq(schema.quizCards.id, existingTranslatedCards[i].id));
          }
        }

        await db.insert(schema.lessonQuizLinks).values({
          lessonId: lessonId,
          quizId: translatedQuiz.id,
          isPrimary: link.isPrimary,
        }).onConflictDoNothing();

      } catch (quizError) {
        console.warn(`[TranslationWorker] Quiz translation failed for link ${link.id}, continuing:`, quizError);
        if (options.includeQuiz) {
          ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
            translatedLesson,
            translationPackage,
            "quiz",
            "failed",
            String((quizError as any)?.message || "Quiz translation failed")
          ));
        }
      }
    }

    if (options.includeQuiz && (translationPackage.assets?.quiz !== "failed")) {
      ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
        translatedLesson,
        translationPackage,
        "quiz",
        "completed",
      ));
    }

    if (options.includePodcastScript || options.includePodcastAudio) {
      ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
        translatedLesson,
        translationPackage,
        "podcastScript",
        options.includePodcastScript ? "processing" : "skipped",
      ));
      if (options.includePodcastAudio) {
        ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
          translatedLesson,
          translationPackage,
          "podcastAudio",
          "processing",
        ));
      }

      try {
        const sourcePodcastMeta = LessonPodcastService.getMetadata(sourceLesson);
        const sourceScripts = Array.isArray((sourcePodcastMeta as any)?.scripts) ? (sourcePodcastMeta as any).scripts : [];
        const sourceVersions = LessonPodcastService.getCompletedVersions(sourcePodcastMeta);
        const sourceScript = (options.selectedPodcastScriptVersionId
          ? sourceScripts.find((script: any) => String(script?.id || "") === String(options.selectedPodcastScriptVersionId))
          : null)
          || sourceScripts.find((script: any) => String(script?.languageCode || "en").toLowerCase() === String(effectiveSourceLanguage).toLowerCase())
          || sourceScripts[0];

        if (!sourceScript?.text) {
          throw new Error("No source podcast script found for translation.");
        }

        const translatedScriptText = await aiTranslationService.translateText(
          String(sourceScript.text),
          targetLanguageCode,
          effectiveSourceLanguage,
          "Podcast script translation"
        );

        const podcastConfig = translationPackage.podcastConfig || {};
        const activeSourceVersion = (options.selectedPodcastAudioVersionId
          ? sourceVersions.find((v: any) => String(v?.id || "") === String(options.selectedPodcastAudioVersionId))
          : null)
          || sourceVersions.find((v: any) => v.id === sourcePodcastMeta.activeVersionId)
          || sourceVersions[0];
        const fallbackVoiceId = podcastConfig.voiceId || activeSourceVersion?.voiceId;
        const fallbackFormat = (podcastConfig.format as any) || activeSourceVersion?.format || "bulletin";
        const fallbackDuration = (podcastConfig.duration as any) || activeSourceVersion?.duration || "default";
        const fallbackGuestVoiceId = podcastConfig.guestVoiceId || activeSourceVersion?.guestVoiceId;

        if (!fallbackVoiceId) {
          throw new Error("Podcast host voice is required to prepare translated podcast script/audio.");
        }

        const built = await LessonPodcastService.buildScriptDraft({
          lesson: translatedLesson,
          sourceType: (podcastConfig.sourceType as any) || sourceScript.sourceType || "sourcedb",
          sourceMaterialId: podcastConfig.sourceMaterialId || sourceScript.sourceMaterialId,
          format: fallbackFormat,
          duration: fallbackDuration,
          focusTopic: translatedLesson.title || sourceScript.focusTopic,
          voiceId: fallbackVoiceId,
          guestVoiceId: fallbackGuestVoiceId,
          hostDisplayName: podcastConfig.hostDisplayName || sourceScript.hostDisplayName,
          guestDisplayName: podcastConfig.guestDisplayName || sourceScript.guestDisplayName,
          languageCode: targetLanguageCode,
          sourceScriptId: sourceScript.id,
          scriptTextOverride: translatedScriptText,
        });

        ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
          translatedLesson,
          translationPackage,
          "podcastScript",
          options.includePodcastScript ? "completed" : "skipped",
        ));

        if (options.includePodcastAudio) {
          const generation = await LessonPodcastService.beginGeneration({
            lesson: translatedLesson,
            requestedBy: job.initiatedBy,
            sourceType: (podcastConfig.sourceType as any) || built.script.sourceType || "sourcedb",
            sourceMaterialId: podcastConfig.sourceMaterialId || built.script.sourceMaterialId,
            format: fallbackFormat,
            duration: fallbackDuration,
            focusTopic: translatedLesson.title,
            scriptId: built.script.id,
            scriptText: built.script.text,
            voiceId: fallbackVoiceId,
            guestVoiceId: fallbackGuestVoiceId,
            hostDisplayName: podcastConfig.hostDisplayName || built.script.hostDisplayName,
            guestDisplayName: podcastConfig.guestDisplayName || built.script.guestDisplayName,
            title: `${translatedLesson.title} (${targetLanguageCode})`,
            notes: `translation_worker_job:${job.id};translation_correlation:${translationCorrelationId || "n/a"}`,
            languageCode: targetLanguageCode,
          });
          console.log("[TranslationWorkerOrchestration]", JSON.stringify({
            stage: "podcast_generation_started",
            jobId: job.id,
            sourceLessonId,
            translatedLessonId: lessonId,
            organizationId: job.organizationId,
            targetLanguageCode,
            translationCorrelationId,
            podcastVersionId: generation?.versionId || null,
          }));

          ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
            translatedLesson,
            translationPackage,
            "podcastAudio",
            "processing",
          ));
        }
      } catch (podcastError: any) {
        const message = String(podcastError?.message || "Podcast translation failed");
        if (options.includePodcastScript) {
          ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
            translatedLesson,
            translationPackage,
            "podcastScript",
            "failed",
            message,
          ));
        }
        if (options.includePodcastAudio) {
          ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
            translatedLesson,
            translationPackage,
            "podcastAudio",
            "failed",
            message,
          ));
        }
      }
    }

    if (options.includeObjectives) {
      ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
        translatedLesson,
        translationPackage,
        "objectives",
        "processing",
      ));
      try {
        const sourceCourseLinks = await db
          .select()
          .from(schema.courseLessons)
          .where(eq(schema.courseLessons.lessonId, sourceLessonId));
        const translatedCourseLinks = await db
          .select()
          .from(schema.courseLessons)
          .where(eq(schema.courseLessons.lessonId, lessonId));

        for (const translatedLink of translatedCourseLinks) {
          const sourceLink = sourceCourseLinks.find((link) =>
            String(link.topicId || "") === String(translatedLink.topicId || "") ||
            Number(link.topicOrder || -1) === Number(translatedLink.topicOrder || -2)
          );
          if (!sourceLink) continue;
          const sourceObjectives = Array.isArray(sourceLink.learningObjectives) ? sourceLink.learningObjectives : [];
          const translatedObjectives: string[] = [];
          for (const objective of sourceObjectives) {
            const text = String(objective || "").trim();
            if (!text) continue;
            translatedObjectives.push(
              await aiTranslationService.translateText(text, targetLanguageCode, effectiveSourceLanguage, "Bloom objective translation")
            );
          }
          await db.update(schema.courseLessons)
            .set({ learningObjectives: translatedObjectives } as any)
            .where(eq(schema.courseLessons.id, translatedLink.id));
        }

        ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
          translatedLesson,
          translationPackage,
          "objectives",
          "completed",
        ));
      } catch (objectiveError: any) {
        ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
          translatedLesson,
          translationPackage,
          "objectives",
          "failed",
          String(objectiveError?.message || "Objectives translation failed"),
        ));
      }
    }

    if (options.includeDigest) {
      ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
        translatedLesson,
        translationPackage,
        "digest",
        "processing",
      ));
      try {
        await LessonDigestService.regenerateDigest(translatedLesson as any, {
          languageCode: targetLanguageCode,
        });
        ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
          translatedLesson,
          translationPackage,
          "digest",
          "completed",
        ));
      } catch (digestError: any) {
        ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
          translatedLesson,
          translationPackage,
          "digest",
          "failed",
          String(digestError?.message || "Lesson digest translation failed"),
        ));
      }
    } else {
      ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
        translatedLesson,
        translationPackage,
        "digest",
        "skipped",
      ));
    }

    if (options.includeStepGuide) {
      ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
        translatedLesson,
        translationPackage,
        "stepGuide",
        "processing",
      ));
      try {
        const sourceGuide = await LessonStepGuideService.getGuide(sourceLesson as any, {
          languageCode: effectiveSourceLanguage,
        });

        if (sourceGuide && Array.isArray(sourceGuide.steps) && sourceGuide.steps.length > 0) {
          const translatedSteps = [] as Array<{
            id: string;
            title: string;
            content: string;
            commands: string[];
            imageUrls: string[];
          }>;

          for (const step of sourceGuide.steps) {
            const sourceTitle = String(step?.title || "").trim();
            const sourceContent = String(step?.content || "").trim();
            const translatedTitle = sourceTitle
              ? await aiTranslationService.translateText(sourceTitle, targetLanguageCode, effectiveSourceLanguage, "Step-by-step guide title translation")
              : `Step ${translatedSteps.length + 1}`;
            const translatedContent = sourceContent
              ? await aiTranslationService.translateText(sourceContent, targetLanguageCode, effectiveSourceLanguage, "Step-by-step guide content translation")
              : "";
            translatedSteps.push({
              id: String(step?.id || `step-${translatedSteps.length + 1}`),
              title: translatedTitle || sourceTitle || `Step ${translatedSteps.length + 1}`,
              content: translatedContent || sourceContent,
              commands: Array.isArray(step?.commands) ? step.commands.map((command: any) => String(command || "")).filter(Boolean) : [],
              imageUrls: Array.isArray(step?.imageUrls) ? step.imageUrls.map((url: any) => String(url || "")).filter(Boolean) : [],
            });
          }

          await LessonStepGuideService.saveTranslatedGuide({
            lesson: translatedLesson as any,
            languageCode: targetLanguageCode,
            sourceFilename: sourceGuide.sourceFilename,
            steps: translatedSteps,
            translatedFromLanguageCode: effectiveSourceLanguage,
          });

          const [refreshedLesson] = await db
            .select()
            .from(schema.lessons)
            .where(eq(schema.lessons.id, lessonId))
            .limit(1);
          if (refreshedLesson) {
            translatedLesson = refreshedLesson;
          }

          ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
            translatedLesson,
            translationPackage,
            "stepGuide",
            "completed",
          ));
        } else {
          ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
            translatedLesson,
            translationPackage,
            "stepGuide",
            "skipped",
          ));
        }
      } catch (stepGuideError: any) {
        ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
          translatedLesson,
          translationPackage,
          "stepGuide",
          "failed",
          String(stepGuideError?.message || "Step-by-step guide translation failed"),
        ));
      }
    } else {
      ({ lesson: translatedLesson, pkg: translationPackage } = await this.setAssetStatus(
        translatedLesson,
        translationPackage,
        "stepGuide",
        "skipped",
      ));
    }

    const assetEntries = Object.entries(translationPackage.assets || {});
    const assetValues = assetEntries.map(([, value]) => value);
    const hasAssetFailure = assetValues.includes("failed");
    const pendingAssetKeys = assetEntries
      .filter(([, value]) => !(value === "completed" || value === "skipped" || value === "failed" || value === "cancelled" || value === "deferred_optional"))
      .map(([key]) => key);
    const allSettled = pendingAssetKeys.length === 0 || pendingAssetKeys.every((key) => this.isAsyncHandoffAsset(String(key), translationPackage));
    const completedStep = hasAssetFailure ? "partial_failed" : "content_translated";

    await db.update(schema.lessons)
      .set({ translationStatus: 'draft', updatedAt: new Date() })
      .where(eq(schema.lessons.id, lessonId));

    await db.update(schema.lessonTranslationJobs)
      .set({
        status: allSettled ? 'completed' : 'translating',
        currentStep: completedStep,
        completedAt: allSettled ? new Date() : null,
        updatedAt: new Date(),
        errorMessage: hasAssetFailure ? JSON.stringify(translationPackage.errors || {}) : null,
      })
      .where(eq(schema.lessonTranslationJobs.id, job.id));

    translatedLesson = await this.persistTranslationPackage(translatedLesson, translationPackage);
    await TranslationAnalyticsService.trackEvent({
      organizationId: job.organizationId,
      userId: job.initiatedBy,
      eventType: hasAssetFailure ? "translation_fail" : "translation_success",
      resourceType: "lesson",
      resourceId: lessonId,
      languageCode: targetLanguageCode || null,
      variantId: lessonId,
      contentGroupId: sourceLesson.contentGroupId || sourceLesson.id,
      metadata: {
        source: "translation_worker",
        jobId: job.id,
        sourceLessonId,
        translationCorrelationId,
        completedStep,
        includePodcastScript: options.includePodcastScript === true,
        includePodcastAudio: options.includePodcastAudio === true,
        assets: translationPackage.assets || {},
        errors: translationPackage.errors || {},
      },
      dedupeSeed: `translation-worker-finish:${job.id}`,
    });
    console.log(`[TranslationWorker] Job ${job.id} completed with step=${completedStep}`);
  }

  private static async createSourceDbTranslationVersion(params: {
    lessonId: string;
    previousLesson: typeof schema.lessons.$inferSelect;
    currentLesson: typeof schema.lessons.$inferSelect;
    targetLanguageCode: string;
    sourceLanguageCode: string;
    userId: string;
    jobId: string;
  }): Promise<void> {
    const [maxVersion] = await db
      .select({ max: sql<number>`COALESCE(MAX(${schema.lessonContentVersions.versionNumber}), 0)` })
      .from(schema.lessonContentVersions)
      .where(eq(schema.lessonContentVersions.lessonId, params.lessonId));
    const nextVersionNumber = (maxVersion?.max || 0) + 1;

    await db.insert(schema.lessonContentVersions).values({
      lessonId: params.lessonId,
      versionNumber: nextVersionNumber,
      source: "ai_translation",
      changeDescription: `AI translated Source DB content to ${params.targetLanguageCode}`,
      previousContent: params.previousLesson.inputText || null,
      newContent: params.currentLesson.inputText || null,
      previousTitle: params.previousLesson.title || null,
      newTitle: params.currentLesson.title || null,
      previousDescription: params.previousLesson.description || null,
      newDescription: params.currentLesson.description || null,
      metadata: {
        jobId: params.jobId,
        artifact: "sourceDb",
        sourceLanguageCode: params.sourceLanguageCode,
        targetLanguageCode: params.targetLanguageCode,
        translatedAt: new Date().toISOString(),
      },
      createdBy: params.userId,
    } as any);
  }

  private static async failJob(job: typeof schema.lessonTranslationJobs.$inferSelect, errorMessage: string): Promise<void> {
    await db.update(schema.lessonTranslationJobs)
      .set({
        status: 'failed',
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(schema.lessonTranslationJobs.id, job.id));

    await db.update(schema.lessons)
      .set({ generationStatus: 'failed', updatedAt: new Date() })
      .where(eq(schema.lessons.id, job.lessonId));

    if (job.creditsCharged && job.creditsCharged > 0) {
      try {
        const [lesson] = await db
          .select({ metadata: schema.lessons.metadata })
          .from(schema.lessons)
          .where(eq(schema.lessons.id, job.lessonId))
          .limit(1);
        const pkg = lesson?.metadata && typeof lesson.metadata === "object"
          ? (lesson.metadata as any).translationPackage
          : null;
        const originalCorrelationId = String(pkg?.chargeCorrelationId || "").trim();
        if (!originalCorrelationId) {
          console.warn(`[TranslationWorker] Missing charge correlation ID for failed job ${job.id}; skipping automatic refund.`);
          return;
        }

        await HybridCreditService.refundWithFallback({
          userId: job.initiatedBy,
          organizationId: job.organizationId,
          originalCorrelationId,
          refundCorrelationId: `translation-refund-${job.id}`,
          reason: `Translation failed: ${errorMessage}`,
          metadata: { translationJobId: job.id, errorMessage },
        });
        console.log(`[TranslationWorker] Refunded credits for failed job ${job.id} using correlation ${originalCorrelationId}`);
      } catch (refundError) {
        console.error(`[TranslationWorker] Failed to refund credits for job ${job.id}:`, refundError);
      }
    }
    try {
      await TranslationAnalyticsService.trackEvent({
        organizationId: job.organizationId,
        userId: job.initiatedBy,
        eventType: "translation_fail",
        resourceType: "lesson",
        resourceId: job.lessonId,
        languageCode: job.targetLanguageCode || null,
        variantId: job.lessonId,
        contentGroupId: job.sourceLessonId || job.lessonId,
        metadata: {
          source: "translation_worker_fail_job",
          jobId: job.id,
          sourceLessonId: job.sourceLessonId,
          errorMessage,
        },
        dedupeSeed: `translation-worker-fail:${job.id}`,
      });
    } catch (analyticsError: any) {
      console.error(`[TranslationWorker] Failed to persist failure analytics for job ${job.id}:`, analyticsError?.message || analyticsError);
    }
  }
}
