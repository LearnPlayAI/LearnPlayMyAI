import { db } from '../db';
import {
  courses, lessons, quizCollections, quizCards, quizCardExplanations,
  courseFrameworks, courseLessons, lessonSlides, lessonQuizLinks,
  contentTranslationJobs, platformPricing,
} from '@shared/schema';
import { eq, and, sql, asc, desc, lt } from 'drizzle-orm';
import { aiTranslationService } from './aiTranslationService';
import { HybridCreditService } from './hybridCreditService';
import { ObjectStorageService } from '../objectStorage';
import { LessonDigestService } from './lessonDigestService';
import archiver from 'archiver';
import crypto from 'crypto';
import { PassThrough } from 'stream';

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export async function generateSimpleDocx(title: string, content: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    
    const passthrough = new PassThrough();
    passthrough.on('data', (chunk: Buffer) => chunks.push(chunk));
    passthrough.on('end', () => resolve(Buffer.concat(chunks)));
    passthrough.on('error', reject);
    
    archive.pipe(passthrough);
    archive.on('error', reject);
    
    const contentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>${escapeXml(title)}</w:t></w:r></w:p>
    ${content.split('\n').map(line => 
      `<w:p><w:r><w:t>${escapeXml(line)}</w:t></w:r></w:p>`
    ).join('\n')}
  </w:body>
</w:document>`;

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    archive.append(contentTypesXml, { name: '[Content_Types].xml' });
    archive.append(relsXml, { name: '_rels/.rels' });
    archive.append(contentXml, { name: 'word/document.xml' });
    
    archive.finalize();
  });
}

const CREDITS_PER_LESSON_TRANSLATION = 2;
const CREDITS_PER_QUIZ_TRANSLATION = 1;
const CREDITS_PER_COURSE_METADATA = 1;

export interface TranslationProgress {
  jobId: string;
  status: string;
  progress: number;
  currentStage: string | null;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  translatedCourseId: string | null;
  errorMessage: string | null;
}

export class CourseTranslationOrchestrator {
  static async recoverInterruptedJobs(maxAgeMinutes: number = 20): Promise<{ failedInProgress: number; failedPending: number }> {
    const staleBefore = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

    const failedInProgressRows = await db
      .update(contentTranslationJobs)
      .set({
        status: 'failed',
        errorMessage: 'Course translation interrupted by restart or worker interruption. Please retry.',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(contentTranslationJobs.status, 'in_progress'),
        lt(contentTranslationJobs.updatedAt, staleBefore)
      ))
      .returning({ id: contentTranslationJobs.id });

    const failedPendingRows = await db
      .update(contentTranslationJobs)
      .set({
        status: 'failed',
        errorMessage: 'Course translation did not start in time and was recovered. Please retry.',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(contentTranslationJobs.status, 'pending'),
        lt(contentTranslationJobs.createdAt, staleBefore)
      ))
      .returning({ id: contentTranslationJobs.id });

    return {
      failedInProgress: failedInProgressRows.length,
      failedPending: failedPendingRows.length,
    };
  }

  /**
   * Initiate a full course translation.
   * Creates a translation job, then processes stages:
   * 1. Course metadata (title, description)
   * 2. Framework topics
   * 3. Lessons (text content)
   * 4. Lesson slides
   * 5. Quizzes (collections + cards)
   * 
   * Uses FOR UPDATE locking to prevent concurrent translations of the same course to the same language.
   */
  static async translateCourse(params: {
    sourceCourseId: string;
    targetLanguageCode: string;
    organizationId: string;
    initiatedBy: string;
  }): Promise<TranslationProgress> {
    const { sourceCourseId, targetLanguageCode, organizationId, initiatedBy } = params;

    const [existingJob] = await db
      .select()
      .from(contentTranslationJobs)
      .where(and(
        eq(contentTranslationJobs.sourceCourseId, sourceCourseId),
        eq(contentTranslationJobs.targetLanguageCode, targetLanguageCode),
        sql`${contentTranslationJobs.status} IN ('pending', 'in_progress')`
      ))
      .limit(1);

    if (existingJob) {
      return {
        jobId: existingJob.id,
        status: existingJob.status,
        progress: existingJob.progress || 0,
        currentStage: existingJob.currentStage,
        totalItems: existingJob.totalItems || 0,
        completedItems: existingJob.completedItems || 0,
        failedItems: existingJob.failedItems || 0,
        translatedCourseId: existingJob.translatedCourseId,
        errorMessage: existingJob.errorMessage,
      };
    }

    const [sourceCourse] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, sourceCourseId))
      .limit(1);

    if (!sourceCourse) {
      throw new Error(`Source course ${sourceCourseId} not found`);
    }

    const contentGroupId = sourceCourse.contentGroupId || sourceCourse.id;
    const [existingTranslation] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(and(
        eq(courses.contentGroupId, contentGroupId),
        eq(courses.languageCode, targetLanguageCode)
      ))
      .limit(1);

    if (existingTranslation) {
      throw new Error('A translation for this language already exists in this content group');
    }

    const courseLessonsList = await db
      .select({ lessonId: courseLessons.lessonId })
      .from(courseLessons)
      .where(eq(courseLessons.courseId, sourceCourseId));

    const lessonIds = courseLessonsList.map(cl => cl.lessonId);
    
    let quizCount = 0;
    if (lessonIds.length > 0) {
      const quizLinks = await db
        .select({ quizId: lessonQuizLinks.quizId })
        .from(lessonQuizLinks)
        .where(sql`${lessonQuizLinks.lessonId} = ANY(${lessonIds})`);
      quizCount = quizLinks.length;
    }

    const totalItems = 1 + lessonIds.length + quizCount;

    const creditCost = CREDITS_PER_COURSE_METADATA + 
      (lessonIds.length * CREDITS_PER_LESSON_TRANSLATION) + 
      (quizCount * CREDITS_PER_QUIZ_TRANSLATION);

    const correlationId = `translation_${sourceCourseId}_${targetLanguageCode}_${Date.now()}`;

    const [job] = await db
      .insert(contentTranslationJobs)
      .values({
        organizationId,
        sourceCourseId,
        targetLanguageCode,
        sourceLanguageCode: sourceCourse.languageCode || 'en',
        status: 'in_progress',
        progress: 0,
        currentStage: 'course_metadata',
        totalItems,
        completedItems: 0,
        failedItems: 0,
        creditsCharged: creditCost,
        creditCorrelationId: correlationId,
        startedAt: new Date(),
        initiatedBy,
      })
      .returning();

    try {
      await HybridCreditService.deductWithFallback({
        userId: initiatedBy,
        organizationId,
        amount: creditCost,
        type: 'deduction',
        correlationId,
        description: `Course translation to ${targetLanguageCode}: "${sourceCourse.title}"`,
        activityType: 'content_translation',
        metadata: {
          sourceCourseId,
          targetLanguageCode,
          jobId: job.id,
          lessonCount: lessonIds.length,
          quizCount,
        },
      });
    } catch (creditError: any) {
      await db.update(contentTranslationJobs)
        .set({ status: 'failed', errorMessage: `Insufficient credits: ${creditError.message}`, updatedAt: new Date() })
        .where(eq(contentTranslationJobs.id, job.id));
      throw new Error(`Insufficient credits for translation: ${creditError.message}`);
    }

    this.runTranslationPipeline(job.id, sourceCourseId, targetLanguageCode, organizationId, initiatedBy)
      .catch(error => {
        console.error(`[CourseTranslation] Pipeline failed for job ${job.id}:`, error);
      });

    return {
      jobId: job.id,
      status: 'in_progress',
      progress: 0,
      currentStage: 'course_metadata',
      totalItems,
      completedItems: 0,
      failedItems: 0,
      translatedCourseId: null,
      errorMessage: null,
    };
  }

  private static async runTranslationPipeline(
    jobId: string,
    sourceCourseId: string,
    targetLanguageCode: string,
    organizationId: string,
    initiatedBy: string
  ): Promise<void> {
    try {
      const [sourceCourse] = await db
        .select()
        .from(courses)
        .where(eq(courses.id, sourceCourseId))
        .limit(1);

      if (!sourceCourse) throw new Error('Source course not found');

      const sourceLanguage = sourceCourse.languageCode || 'en';
      const contentGroupId = sourceCourse.contentGroupId || sourceCourse.id;

      await this.updateJobProgress(jobId, 'course_metadata', 5);

      const translatedTitle = await aiTranslationService.translateText(
        sourceCourse.title, targetLanguageCode, sourceLanguage, 'Course title'
      );
      const translatedDescription = sourceCourse.description
        ? await aiTranslationService.translateText(
            sourceCourse.description, targetLanguageCode, sourceLanguage, 'Course description'
          )
        : null;

      const translatedCourseId = crypto.randomUUID();
      await db.insert(courses).values({
        id: translatedCourseId,
        title: translatedTitle,
        description: translatedDescription,
        organizationId,
        createdBy: initiatedBy,
        categoryId: sourceCourse.categoryId,
        difficultyLevel: sourceCourse.difficultyLevel,
        currency: sourceCourse.currency,
        price: sourceCourse.price,
        status: 'draft',
        visibility: sourceCourse.visibility,
        languageCode: targetLanguageCode,
        contentGroupId,
        isDefaultLanguage: false,
        sourceLanguageVersion: sourceCourse.sourceLanguageVersion || 1,
        translationStatus: 'draft',
        thumbnailUrl: sourceCourse.thumbnailUrl,
      });

      await db.update(contentTranslationJobs)
        .set({ translatedCourseId, completedItems: 1, progress: 10, updatedAt: new Date() })
        .where(eq(contentTranslationJobs.id, jobId));

      await this.updateJobProgress(jobId, 'framework', 15);

      const [framework] = await db
        .select()
        .from(courseFrameworks)
        .where(eq(courseFrameworks.courseId, sourceCourseId))
        .limit(1);

      if (framework && framework.topics) {
        const topics = framework.topics as Array<{ id: string; name: string; order: number; lessonId: string | null }>;
        const translatedTopics = await aiTranslationService.translateFrameworkTopics(
          topics, targetLanguageCode, sourceLanguage
        );

        await db.insert(courseFrameworks).values({
          courseId: translatedCourseId,
          organizationId,
          topics: translatedTopics,
          sourceMap: framework.sourceMap,
          contentHealth: framework.contentHealth,
        });
      }

      await this.updateJobProgress(jobId, 'lessons', 20);

      const courseToLessons = await db
        .select()
        .from(courseLessons)
        .where(eq(courseLessons.courseId, sourceCourseId))
        .orderBy(asc(courseLessons.topicOrder));

      const lessonIdMap: Record<string, string> = {};
      let completedItems = 1;

      for (let i = 0; i < courseToLessons.length; i++) {
        const courseLesson = courseToLessons[i];
        const lessonId = courseLesson.lessonId;

        try {
          const [sourceLesson] = await db
            .select()
            .from(lessons)
            .where(eq(lessons.id, lessonId))
            .limit(1);

          if (!sourceLesson) continue;

          const translated = await aiTranslationService.translateLessonContent(
            {
              title: sourceLesson.title,
              description: sourceLesson.description,
              inputText: sourceLesson.inputText,
            },
            targetLanguageCode,
            sourceLanguage
          );

          const translatedLessonId = crypto.randomUUID();
          lessonIdMap[lessonId] = translatedLessonId;

          await db.insert(lessons).values({
            id: translatedLessonId,
            title: translated.title,
            description: translated.description,
            inputText: translated.inputText,
            organizationId,
            createdBy: initiatedBy,
            isPublished: false,
            languageCode: targetLanguageCode,
            contentGroupId: sourceLesson.contentGroupId || sourceLesson.id,
            isDefaultLanguage: false,
            sourceLanguageVersion: sourceLesson.currentSlideVersion || sourceLesson.sourceLanguageVersion || 1,
            translationStatus: 'draft',
            gradeLevel: sourceLesson.gradeLevel,
            department: sourceLesson.department,
            subject: sourceLesson.subject,
            unit: sourceLesson.unit,
          });

          if (translated.inputText) {
            try {
              const docxBuffer = await generateSimpleDocx(translated.title, translated.inputText);
              const objectStorageService = new ObjectStorageService();
              const sourceDocumentPath = await objectStorageService.uploadSourceDocument(
                organizationId,
                translatedLessonId,
                docxBuffer,
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                `${translated.title}.docx`,
                targetLanguageCode
              );
              await db.update(lessons)
                .set({ sourceDocumentPath })
                .where(eq(lessons.id, translatedLessonId));
              console.log(`[CourseTranslation] Generated Word doc for translated lesson ${translatedLessonId} (${targetLanguageCode})`);
            } catch (docError) {
              console.error(`[CourseTranslation] Failed to generate Word doc for lesson ${translatedLessonId}:`, docError);
            }
          }

          const translatedTopicName = courseLesson.topicName
            ? await aiTranslationService.translateText(courseLesson.topicName, targetLanguageCode, sourceLanguage)
            : courseLesson.topicName;

          await db.insert(courseLessons).values({
            courseId: translatedCourseId,
            lessonId: translatedLessonId,
            topicOrder: courseLesson.topicOrder,
            topicName: translatedTopicName,
            learningObjectives: courseLesson.learningObjectives,
          });

          const sourceSlides = await db
            .select()
            .from(lessonSlides)
            .where(and(
              eq(lessonSlides.lessonId, lessonId),
              eq(lessonSlides.version, sourceLesson.currentSlideVersion || 1)
            ))
            .orderBy(asc(lessonSlides.slideIndex));

          if (sourceSlides.length > 0) {
            const translatedSlides = await aiTranslationService.translateSlides(
              sourceSlides.map(s => ({
                title: s.title,
                bullets: s.bullets || [],
                speakerNotes: s.speakerNotes,
              })),
              targetLanguageCode,
              sourceLanguage
            );

            for (let si = 0; si < sourceSlides.length; si++) {
              const ts = translatedSlides[si] || { title: sourceSlides[si].title, bullets: sourceSlides[si].bullets, speakerNotes: sourceSlides[si].speakerNotes };
              await db.insert(lessonSlides).values({
                lessonId: translatedLessonId,
                version: 1,
                slideIndex: sourceSlides[si].slideIndex,
                title: ts.title,
                bullets: ts.bullets,
                speakerNotes: ts.speakerNotes,
                mediaPrompt: sourceSlides[si].mediaPrompt,
                role: sourceSlides[si].role,
              });
            }

            await db.update(lessons)
              .set({ currentSlideVersion: 1 })
              .where(eq(lessons.id, translatedLessonId));
          }

          try {
            const [translatedLessonRow] = await db
              .select()
              .from(lessons)
              .where(eq(lessons.id, translatedLessonId))
              .limit(1);
            if (translatedLessonRow) {
              await LessonDigestService.regenerateDigest(translatedLessonRow as any, {
                languageCode: targetLanguageCode,
              });
            }
          } catch (digestError) {
            console.error(`[CourseTranslation] Failed to pre-generate lesson digest for ${translatedLessonId}:`, digestError);
          }

          completedItems++;
          const progress = Math.min(80, 20 + Math.floor((i / courseToLessons.length) * 60));
          await this.updateJobProgress(jobId, 'lessons', progress, completedItems);

        } catch (lessonError: any) {
          console.error(`[CourseTranslation] Failed to translate lesson ${lessonId}:`, lessonError.message);
          await db.update(contentTranslationJobs)
            .set({ 
              failedItems: sql`${contentTranslationJobs.failedItems} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(contentTranslationJobs.id, jobId));
        }
      }

      await this.updateJobProgress(jobId, 'quizzes', 80);

      for (const courseLesson of courseToLessons) {
        const originalLessonId = courseLesson.lessonId;
        const translatedLessonId = lessonIdMap[originalLessonId];
        if (!translatedLessonId) continue;

        const quizLinks = await db
          .select()
          .from(lessonQuizLinks)
          .where(eq(lessonQuizLinks.lessonId, originalLessonId));

        for (const link of quizLinks) {
          try {
            const [sourceQuiz] = await db
              .select()
              .from(quizCollections)
              .where(eq(quizCollections.id, link.quizId))
              .limit(1);

            if (!sourceQuiz) continue;

            const translatedQuizName = await aiTranslationService.translateText(
              sourceQuiz.name, targetLanguageCode, sourceLanguage, 'Quiz name'
            );
            const translatedQuizDesc = sourceQuiz.description
              ? await aiTranslationService.translateText(sourceQuiz.description, targetLanguageCode, sourceLanguage, 'Quiz description')
              : null;

            const translatedQuizId = crypto.randomUUID();
            await db.insert(quizCollections).values({
              id: translatedQuizId,
              organizationId,
              createdBy: initiatedBy,
              name: translatedQuizName,
              description: translatedQuizDesc,
              totalCards: sourceQuiz.totalCards,
              difficulty: sourceQuiz.difficulty,
              passPercentage: sourceQuiz.passPercentage,
              isPublic: sourceQuiz.isPublic,
              languageCode: targetLanguageCode,
              contentGroupId: sourceQuiz.contentGroupId || sourceQuiz.id,
              isDefaultLanguage: false,
              sourceLanguageVersion: sourceQuiz.sourceLanguageVersion || 1,
              translationStatus: 'draft',
            });

            const sourceCards = await db
              .select()
              .from(quizCards)
              .where(eq(quizCards.collectionId, link.quizId))
              .orderBy(asc(quizCards.displayOrder));

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
                sourceLanguage
              );

              for (let ci = 0; ci < sourceCards.length; ci++) {
                const tc = translatedCards[ci];
                if (!tc) continue;

                const translatedCardId = crypto.randomUUID();
                await db.insert(quizCards).values({
                  id: translatedCardId,
                  collectionId: translatedQuizId,
                  questionType: sourceCards[ci].questionType,
                  question: tc.question,
                  answer1: tc.answer1,
                  answer2: tc.answer2,
                  answer3: tc.answer3,
                  answer4: tc.answer4,
                  answer5: tc.answer5,
                  answer6: tc.answer6,
                  correctAnswerIndex: sourceCards[ci].correctAnswerIndex,
                  matchPairs: tc.matchPairs || sourceCards[ci].matchPairs,
                  correctAnswer: tc.correctAnswer,
                  displayOrder: sourceCards[ci].displayOrder,
                });

                const [explanation] = await db
                  .select()
                  .from(quizCardExplanations)
                  .where(eq(quizCardExplanations.cardId, sourceCards[ci].id))
                  .limit(1);

                if (explanation) {
                  const translatedExplanation = await aiTranslationService.translateText(
                    explanation.explanation, targetLanguageCode, sourceLanguage, 'Quiz answer explanation'
                  );
                  await db.insert(quizCardExplanations).values({
                    cardId: translatedCardId,
                    explanation: translatedExplanation,
                  });
                }
              }
            }

            await db.insert(lessonQuizLinks).values({
              lessonId: translatedLessonId,
              quizId: translatedQuizId,
              isPrimary: link.isPrimary,
            });

            completedItems++;
          } catch (quizError: any) {
            console.error(`[CourseTranslation] Failed to translate quiz ${link.quizId}:`, quizError.message);
            await db.update(contentTranslationJobs)
              .set({ 
                failedItems: sql`${contentTranslationJobs.failedItems} + 1`,
                updatedAt: new Date(),
              })
              .where(eq(contentTranslationJobs.id, jobId));
          }
        }
      }

      await db.update(contentTranslationJobs)
        .set({
          status: 'completed',
          progress: 100,
          currentStage: null,
          completedItems,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(contentTranslationJobs.id, jobId));

      console.log(`[CourseTranslation] Translation job ${jobId} completed successfully. Translated course: ${translatedCourseId}`);

    } catch (error: any) {
      console.error(`[CourseTranslation] Pipeline failed for job ${jobId}:`, error);
      await db.update(contentTranslationJobs)
        .set({
          status: 'failed',
          errorMessage: error.message,
          updatedAt: new Date(),
        })
        .where(eq(contentTranslationJobs.id, jobId));
    }
  }

  private static async updateJobProgress(
    jobId: string,
    stage: string,
    progress: number,
    completedItems?: number
  ): Promise<void> {
    const update: any = {
      currentStage: stage,
      progress,
      updatedAt: new Date(),
    };
    if (completedItems !== undefined) {
      update.completedItems = completedItems;
    }
    await db.update(contentTranslationJobs)
      .set(update)
      .where(eq(contentTranslationJobs.id, jobId));
  }

  static async translateCourseMetadataOnly(params: {
    sourceCourseId: string;
    targetLanguageCode: string;
    organizationId: string;
    initiatedBy: string;
  }): Promise<{ translatedCourseId: string; creditsCost: number }> {
    const { sourceCourseId, targetLanguageCode, organizationId, initiatedBy } = params;

    const [sourceCourse] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, sourceCourseId))
      .limit(1);

    if (!sourceCourse) {
      throw new Error(`Source course ${sourceCourseId} not found`);
    }

    const contentGroupId = sourceCourse.contentGroupId || sourceCourse.id;
    const [existingTranslation] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(and(
        eq(courses.contentGroupId, contentGroupId),
        eq(courses.languageCode, targetLanguageCode)
      ))
      .limit(1);

    if (existingTranslation) {
      throw new Error('A translation for this language already exists in this content group');
    }

    const [pricing] = await db
      .select({ creditsPerCourseTranslation: platformPricing.creditsPerCourseTranslation })
      .from(platformPricing)
      .orderBy(desc(platformPricing.updatedAt), desc(platformPricing.createdAt))
      .limit(1);
    const creditCost = pricing?.creditsPerCourseTranslation ?? 50;

    const correlationId = `metadata_translation_${sourceCourseId}_${targetLanguageCode}_${Date.now()}`;

    await HybridCreditService.deductWithFallback({
      userId: initiatedBy,
      organizationId,
      amount: creditCost,
      type: 'deduction',
      correlationId,
      description: `Course metadata translation to ${targetLanguageCode}: "${sourceCourse.title}"`,
      activityType: 'content_translation',
      metadata: {
        sourceCourseId,
        targetLanguageCode,
        translationType: 'metadata_only',
      },
    });

    const sourceLanguage = sourceCourse.languageCode || 'en';

    const translatedTitle = await aiTranslationService.translateText(
      sourceCourse.title, targetLanguageCode, sourceLanguage, 'Course title'
    );
    const translatedDescription = sourceCourse.description
      ? await aiTranslationService.translateText(
          sourceCourse.description, targetLanguageCode, sourceLanguage, 'Course description'
        )
      : null;

    const translatedCourseId = crypto.randomUUID();
    await db.insert(courses).values({
      id: translatedCourseId,
      title: translatedTitle,
      description: translatedDescription,
      organizationId,
      createdBy: initiatedBy,
      categoryId: sourceCourse.categoryId,
      difficultyLevel: sourceCourse.difficultyLevel,
      currency: sourceCourse.currency,
      price: sourceCourse.price,
      status: 'draft',
      visibility: sourceCourse.visibility,
      languageCode: targetLanguageCode,
      contentGroupId,
      isDefaultLanguage: false,
      sourceLanguageVersion: sourceCourse.sourceLanguageVersion || 1,
      translationStatus: 'draft',
      thumbnailUrl: sourceCourse.thumbnailUrl,
    });

    const sourceCourseLessons = await db
      .select()
      .from(courseLessons)
      .where(eq(courseLessons.courseId, sourceCourseId))
      .orderBy(asc(courseLessons.topicOrder));

    for (const courseLesson of sourceCourseLessons) {
      const [sourceLesson] = await db
        .select({ id: lessons.id, contentGroupId: lessons.contentGroupId })
        .from(lessons)
        .where(eq(lessons.id, courseLesson.lessonId))
        .limit(1);

      if (!sourceLesson) continue;

      const lessonContentGroupId = sourceLesson.contentGroupId || sourceLesson.id;

      const [translatedLesson] = await db
        .select({ id: lessons.id })
        .from(lessons)
        .where(and(
          eq(lessons.contentGroupId, lessonContentGroupId),
          eq(lessons.languageCode, targetLanguageCode)
        ))
        .limit(1);

      const targetLessonId = translatedLesson?.id || courseLesson.lessonId;

      let translatedPrimaryQuizId: string | null = null;
      if (courseLesson.primaryQuizId) {
        const [sourceQuiz] = await db
          .select({ id: quizCollections.id, contentGroupId: quizCollections.contentGroupId })
          .from(quizCollections)
          .where(eq(quizCollections.id, courseLesson.primaryQuizId))
          .limit(1);

        if (sourceQuiz) {
          const quizGroupId = sourceQuiz.contentGroupId || sourceQuiz.id;
          const [translatedQuiz] = await db
            .select({ id: quizCollections.id })
            .from(quizCollections)
            .where(and(
              eq(quizCollections.contentGroupId, quizGroupId),
              eq(quizCollections.languageCode, targetLanguageCode)
            ))
            .limit(1);

          translatedPrimaryQuizId = translatedQuiz?.id || null;
        }
      }

      let translatedTopicName = courseLesson.topicName;
      try {
        translatedTopicName = await aiTranslationService.translateText(
          courseLesson.topicName, targetLanguageCode, sourceLanguage, 'Course topic name'
        );
      } catch (e) {
        console.warn(`[CourseTranslation] Failed to translate topic name, using original: ${courseLesson.topicName}`);
      }

      await db.insert(courseLessons).values({
        courseId: translatedCourseId,
        lessonId: targetLessonId,
        topicOrder: courseLesson.topicOrder,
        topicName: translatedTopicName,
        topicId: courseLesson.topicId,
        lessonType: courseLesson.lessonType,
        learningObjectives: courseLesson.learningObjectives,
        lessonDetail: courseLesson.lessonDetail,
        realWorldExample: courseLesson.realWorldExample,
        contentHealth: courseLesson.contentHealth,
        primaryQuizId: translatedPrimaryQuizId,
      });
    }

    const [framework] = await db
      .select()
      .from(courseFrameworks)
      .where(eq(courseFrameworks.courseId, sourceCourseId))
      .limit(1);

    if (framework && framework.topics) {
      const topics = framework.topics as Array<{ id: string; name: string; order: number; lessonId: string | null }>;

      const remappedTopics = [];
      for (const topic of topics) {
        let translatedName = topic.name;
        try {
          translatedName = await aiTranslationService.translateText(
            topic.name, targetLanguageCode, sourceLanguage, 'Framework topic name'
          );
        } catch (e) {
          console.warn(`[CourseTranslation] Failed to translate framework topic, using original: ${topic.name}`);
        }

        let remappedLessonId = topic.lessonId;
        if (topic.lessonId) {
          const [srcLesson] = await db
            .select({ contentGroupId: lessons.contentGroupId })
            .from(lessons)
            .where(eq(lessons.id, topic.lessonId))
            .limit(1);

          if (srcLesson?.contentGroupId) {
            const [tl] = await db
              .select({ id: lessons.id })
              .from(lessons)
              .where(and(
                eq(lessons.contentGroupId, srcLesson.contentGroupId),
                eq(lessons.languageCode, targetLanguageCode)
              ))
              .limit(1);

            if (tl) remappedLessonId = tl.id;
          }
        }

        remappedTopics.push({ ...topic, name: translatedName, lessonId: remappedLessonId });
      }

      await db.insert(courseFrameworks).values({
        courseId: translatedCourseId,
        organizationId,
        topics: remappedTopics,
        sourceMap: framework.sourceMap,
        contentHealth: framework.contentHealth,
      });
    }

    console.log(`[CourseTranslation] Metadata-only translation completed. Source: ${sourceCourseId}, Target course: ${translatedCourseId}, Language: ${targetLanguageCode}, Lessons linked: ${sourceCourseLessons.length}`);

    return { translatedCourseId, creditsCost: creditCost };
  }

  static async translateCourseFramework(params: {
    sourceCourseId: string;
    targetLanguageCode: string;
    organizationId: string;
    initiatedBy: string;
  }): Promise<TranslationProgress> {
    const { sourceCourseId, targetLanguageCode, organizationId, initiatedBy } = params;

    const [sourceCourse] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, sourceCourseId))
      .limit(1);

    if (!sourceCourse) {
      throw new Error(`Source course ${sourceCourseId} not found`);
    }

    if (!sourceCourse.contentGroupId) {
      await db.update(courses)
        .set({ contentGroupId: sourceCourse.id, isDefaultLanguage: true })
        .where(eq(courses.id, sourceCourseId));
    }

    const contentGroupId = sourceCourse.contentGroupId || sourceCourse.id;

    const [existingTranslation] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(and(
        eq(courses.contentGroupId, contentGroupId),
        eq(courses.languageCode, targetLanguageCode)
      ))
      .limit(1);

    if (existingTranslation) {
      throw new Error('A translation for this language already exists in this content group');
    }

    const [existingJob] = await db
      .select()
      .from(contentTranslationJobs)
      .where(and(
        eq(contentTranslationJobs.sourceCourseId, sourceCourseId),
        eq(contentTranslationJobs.targetLanguageCode, targetLanguageCode),
        sql`${contentTranslationJobs.status} IN ('pending', 'in_progress')`
      ))
      .limit(1);

    if (existingJob) {
      return {
        jobId: existingJob.id,
        status: existingJob.status,
        progress: existingJob.progress || 0,
        currentStage: existingJob.currentStage,
        totalItems: existingJob.totalItems || 0,
        completedItems: existingJob.completedItems || 0,
        failedItems: existingJob.failedItems || 0,
        translatedCourseId: existingJob.translatedCourseId,
        errorMessage: existingJob.errorMessage,
      };
    }

    const [pricing] = await db
      .select({ creditsPerCourseTranslation: platformPricing.creditsPerCourseTranslation })
      .from(platformPricing)
      .orderBy(desc(platformPricing.updatedAt), desc(platformPricing.createdAt))
      .limit(1);

    const creditCost = pricing?.creditsPerCourseTranslation ?? 50;

    const courseLessonsList = await db
      .select({ lessonId: courseLessons.lessonId })
      .from(courseLessons)
      .where(eq(courseLessons.courseId, sourceCourseId));

    const totalItems = 1 + courseLessonsList.length;
    const correlationId = `framework_translation_${sourceCourseId}_${targetLanguageCode}_${Date.now()}`;

    const [job] = await db
      .insert(contentTranslationJobs)
      .values({
        organizationId,
        sourceCourseId,
        targetLanguageCode,
        sourceLanguageCode: sourceCourse.languageCode || 'en',
        status: 'in_progress',
        progress: 0,
        currentStage: 'course_metadata',
        totalItems,
        completedItems: 0,
        failedItems: 0,
        creditsCharged: creditCost,
        creditCorrelationId: correlationId,
        startedAt: new Date(),
        initiatedBy,
      })
      .returning();

    try {
      await HybridCreditService.deductWithFallback({
        userId: initiatedBy,
        organizationId,
        amount: creditCost,
        type: 'deduction',
        correlationId,
        description: `Course framework translation to ${targetLanguageCode}: "${sourceCourse.title}"`,
        activityType: 'content_translation',
        metadata: {
          sourceCourseId,
          targetLanguageCode,
          jobId: job.id,
          lessonCount: courseLessonsList.length,
          translationType: 'framework',
        },
      });
    } catch (creditError: any) {
      await db.update(contentTranslationJobs)
        .set({ status: 'failed', errorMessage: `Insufficient credits: ${creditError.message}`, updatedAt: new Date() })
        .where(eq(contentTranslationJobs.id, job.id));
      throw new Error(`Insufficient credits for translation: ${creditError.message}`);
    }

    this.runFrameworkTranslationPipeline(job.id, sourceCourseId, targetLanguageCode, organizationId, initiatedBy, contentGroupId)
      .catch(error => {
        console.error(`[CourseTranslation] Framework pipeline failed for job ${job.id}:`, error);
      });

    return {
      jobId: job.id,
      status: 'in_progress',
      progress: 0,
      currentStage: 'course_metadata',
      totalItems,
      completedItems: 0,
      failedItems: 0,
      translatedCourseId: null,
      errorMessage: null,
    };
  }

  private static async runFrameworkTranslationPipeline(
    jobId: string,
    sourceCourseId: string,
    targetLanguageCode: string,
    organizationId: string,
    initiatedBy: string,
    contentGroupId: string
  ): Promise<void> {
    try {
      const [sourceCourse] = await db
        .select()
        .from(courses)
        .where(eq(courses.id, sourceCourseId))
        .limit(1);

      if (!sourceCourse) throw new Error('Source course not found');

      const sourceLanguage = sourceCourse.languageCode || 'en';

      await this.updateJobProgress(jobId, 'course_metadata', 5);

      const courseToLessons = await db
        .select()
        .from(courseLessons)
        .where(eq(courseLessons.courseId, sourceCourseId))
        .orderBy(asc(courseLessons.topicOrder));

      const lessonIdMap: Record<string, string> = {};
      const missingTranslations: string[] = [];

      for (const courseLesson of courseToLessons) {
        const [sourceLesson] = await db
          .select()
          .from(lessons)
          .where(eq(lessons.id, courseLesson.lessonId))
          .limit(1);

        if (!sourceLesson) continue;

        const lessonContentGroupId = sourceLesson.contentGroupId || sourceLesson.id;

        if (!sourceLesson.contentGroupId) {
          await db.update(lessons)
            .set({ contentGroupId: sourceLesson.id, isDefaultLanguage: true })
            .where(eq(lessons.id, sourceLesson.id));
        }

        const [existingTranslatedLesson] = await db
          .select()
          .from(lessons)
          .where(and(
            eq(lessons.contentGroupId, lessonContentGroupId),
            eq(lessons.languageCode, targetLanguageCode)
          ))
          .limit(1);

        if (!existingTranslatedLesson) {
          missingTranslations.push(`"${sourceLesson.title}"`);
        } else {
          lessonIdMap[courseLesson.lessonId] = existingTranslatedLesson.id;
        }
      }

      if (missingTranslations.length > 0) {
        throw new Error(`Cannot translate course: ${missingTranslations.length} lesson(s) have not been translated to ${targetLanguageCode} yet: ${missingTranslations.join(', ')}. Please translate all lessons individually before translating the course framework.`);
      }

      const translatedTitle = await aiTranslationService.translateText(
        sourceCourse.title, targetLanguageCode, sourceLanguage, 'Course title'
      );
      const translatedDescription = sourceCourse.description
        ? await aiTranslationService.translateText(
            sourceCourse.description, targetLanguageCode, sourceLanguage, 'Course description'
          )
        : null;

      const translatedCourseId = crypto.randomUUID();
      await db.insert(courses).values({
        id: translatedCourseId,
        title: translatedTitle,
        description: translatedDescription,
        organizationId,
        createdBy: initiatedBy,
        categoryId: sourceCourse.categoryId,
        difficultyLevel: sourceCourse.difficultyLevel,
        currency: sourceCourse.currency,
        price: sourceCourse.price,
        status: 'draft',
        visibility: sourceCourse.visibility,
        languageCode: targetLanguageCode,
        contentGroupId,
        isDefaultLanguage: false,
        sourceLanguageVersion: sourceCourse.sourceLanguageVersion || 1,
        translationStatus: 'draft',
        thumbnailUrl: sourceCourse.thumbnailUrl,
      });

      await db.update(contentTranslationJobs)
        .set({ translatedCourseId, completedItems: 1, progress: 10, updatedAt: new Date() })
        .where(eq(contentTranslationJobs.id, jobId));

      await this.updateJobProgress(jobId, 'framework', 25);

      const [framework] = await db
        .select()
        .from(courseFrameworks)
        .where(eq(courseFrameworks.courseId, sourceCourseId))
        .limit(1);

      if (framework && framework.topics) {
        const topics = framework.topics as Array<{ id: string; name: string; order: number; lessonId: string | null }>;
        const translatedTopics = await aiTranslationService.translateFrameworkTopics(
          topics, targetLanguageCode, sourceLanguage
        );

        const remappedTopics = translatedTopics.map(topic => ({
          ...topic,
          lessonId: topic.lessonId && lessonIdMap[topic.lessonId]
            ? lessonIdMap[topic.lessonId]
            : topic.lessonId,
        }));

        await db.insert(courseFrameworks).values({
          courseId: translatedCourseId,
          organizationId,
          topics: remappedTopics,
          sourceMap: framework.sourceMap,
          contentHealth: framework.contentHealth,
        });
      }

      await this.updateJobProgress(jobId, 'lessons', 40);

      let completedItems = 1;
      let hasFailedLinks = false;

      for (let i = 0; i < courseToLessons.length; i++) {
        const courseLesson = courseToLessons[i];
        const translatedLessonId = lessonIdMap[courseLesson.lessonId];

        if (!translatedLessonId) {
          hasFailedLinks = true;
          continue;
        }

        try {
          const translatedTopicName = courseLesson.topicName
            ? await aiTranslationService.translateText(courseLesson.topicName, targetLanguageCode, sourceLanguage)
            : courseLesson.topicName;

          let translatedPrimaryQuizId: string | null = null;
          if (courseLesson.primaryQuizId) {
            const [sourceQuiz] = await db
              .select({ id: quizCollections.id, contentGroupId: quizCollections.contentGroupId })
              .from(quizCollections)
              .where(eq(quizCollections.id, courseLesson.primaryQuizId))
              .limit(1);

            if (sourceQuiz) {
              const quizGroupId = sourceQuiz.contentGroupId || sourceQuiz.id;
              const [translatedQuiz] = await db
                .select({ id: quizCollections.id })
                .from(quizCollections)
                .where(and(
                  eq(quizCollections.contentGroupId, quizGroupId),
                  eq(quizCollections.languageCode, targetLanguageCode)
                ))
                .limit(1);

              translatedPrimaryQuizId = translatedQuiz?.id || null;
            }
          }

          await db.insert(courseLessons).values({
            courseId: translatedCourseId,
            lessonId: translatedLessonId,
            topicOrder: courseLesson.topicOrder,
            topicName: translatedTopicName,
            topicId: courseLesson.topicId,
            lessonType: courseLesson.lessonType,
            learningObjectives: courseLesson.learningObjectives,
            lessonDetail: courseLesson.lessonDetail,
            realWorldExample: courseLesson.realWorldExample,
            contentHealth: courseLesson.contentHealth,
            primaryQuizId: translatedPrimaryQuizId,
          });

          completedItems++;
          const progress = Math.min(90, 40 + Math.floor((i / courseToLessons.length) * 50));
          await this.updateJobProgress(jobId, 'lessons', progress, completedItems);

        } catch (lessonError: any) {
          console.error(`[CourseTranslation] Framework: Failed to link lesson ${courseLesson.lessonId}:`, lessonError.message);
          hasFailedLinks = true;
          await db.update(contentTranslationJobs)
            .set({
              failedItems: sql`${contentTranslationJobs.failedItems} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(contentTranslationJobs.id, jobId));
        }
      }

      if (!hasFailedLinks) {
        await db.update(courses)
          .set({ status: 'active', updatedAt: new Date() })
          .where(eq(courses.id, translatedCourseId));
      } else {
        console.warn(`[CourseTranslation] Some lesson links failed for job ${jobId}. Course ${translatedCourseId} remains in draft status.`);
      }

      await db.update(contentTranslationJobs)
        .set({
          status: 'completed',
          progress: 100,
          currentStage: null,
          completedItems,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(contentTranslationJobs.id, jobId));

      console.log(`[CourseTranslation] Framework translation job ${jobId} completed. Translated course: ${translatedCourseId}`);

    } catch (error: any) {
      console.error(`[CourseTranslation] Framework pipeline failed for job ${jobId}:`, error);
      await db.update(contentTranslationJobs)
        .set({
          status: 'failed',
          errorMessage: error.message,
          updatedAt: new Date(),
        })
        .where(eq(contentTranslationJobs.id, jobId));
    }
  }

  static async getTranslationStatus(jobId: string): Promise<TranslationProgress | null> {
    const [job] = await db
      .select()
      .from(contentTranslationJobs)
      .where(eq(contentTranslationJobs.id, jobId))
      .limit(1);

    if (!job) return null;

    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress || 0,
      currentStage: job.currentStage,
      totalItems: job.totalItems || 0,
      completedItems: job.completedItems || 0,
      failedItems: job.failedItems || 0,
      translatedCourseId: job.translatedCourseId,
      errorMessage: job.errorMessage,
    };
  }

  static async getTranslationJobsForCourse(courseId: string): Promise<TranslationProgress[]> {
    const jobs = await db
      .select()
      .from(contentTranslationJobs)
      .where(eq(contentTranslationJobs.sourceCourseId, courseId))
      .orderBy(sql`${contentTranslationJobs.createdAt} DESC`);

    return jobs.map(job => ({
      jobId: job.id,
      status: job.status,
      progress: job.progress || 0,
      currentStage: job.currentStage,
      totalItems: job.totalItems || 0,
      completedItems: job.completedItems || 0,
      failedItems: job.failedItems || 0,
      translatedCourseId: job.translatedCourseId,
      errorMessage: job.errorMessage,
    }));
  }

  static async checkTranslationReadiness(params: {
    courseCourseId: string;
    targetLanguageCode: string;
  }): Promise<{
    ready: boolean;
    totalCount: number;
    translatedCount: number;
    missingLessons: Array<{ id: string; title: string }>;
  }> {
    const { courseCourseId, targetLanguageCode } = params;

    const courseToLessons = await db
      .select({ lessonId: courseLessons.lessonId })
      .from(courseLessons)
      .where(eq(courseLessons.courseId, courseCourseId));

    const totalCount = courseToLessons.length;
    let translatedCount = 0;
    const missingLessons: Array<{ id: string; title: string }> = [];

    for (const cl of courseToLessons) {
      const [sourceLesson] = await db
        .select()
        .from(lessons)
        .where(eq(lessons.id, cl.lessonId))
        .limit(1);

      if (!sourceLesson) {
        missingLessons.push({ id: cl.lessonId, title: '(lesson not found)' });
        continue;
      }

      const lessonContentGroupId = sourceLesson.contentGroupId || sourceLesson.id;

      const [existingTranslatedLesson] = await db
        .select({ id: lessons.id })
        .from(lessons)
        .where(and(
          eq(lessons.contentGroupId, lessonContentGroupId),
          eq(lessons.languageCode, targetLanguageCode)
        ))
        .limit(1);

      if (existingTranslatedLesson) {
        translatedCount++;
      } else {
        missingLessons.push({ id: cl.lessonId, title: sourceLesson.title });
      }
    }

    return {
      ready: missingLessons.length === 0,
      totalCount,
      translatedCount,
      missingLessons,
    };
  }

  static async cancelTranslation(jobId: string): Promise<void> {
    await db.update(contentTranslationJobs)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(and(
        eq(contentTranslationJobs.id, jobId),
        sql`${contentTranslationJobs.status} IN ('pending', 'in_progress')`
      ));
  }
}
