import fs from 'fs';
import path from 'path';
import { and, eq } from 'drizzle-orm';

import { db } from '../server/db';
import * as schema from '../shared/schema';
import { CourseTransferService } from '../server/services/courseTransferService';
import { resolveStoragePath } from '../server/utils/uploadPaths';

const SOURCE_ORG_NAME = 'LearnPlay';
const TARGET_ORG_NAME = 'TechSpecIT';
const COURSE_TITLE = 'Defending the Digital Perimeter: Workplace Security';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureOrg(name: string): Promise<{ id: string; name: string }> {
  const [existing] = await db
    .select({ id: schema.organizations.id, name: schema.organizations.name })
    .from(schema.organizations)
    .where(eq(schema.organizations.name, name))
    .limit(1);
  if (existing) return existing;

  const inviteCode = `${name.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()}-${Date.now().toString().slice(-6)}`;
  const [created] = await db
    .insert(schema.organizations)
    .values({
      name,
      type: 'business',
      inviteCode,
    })
    .returning({ id: schema.organizations.id, name: schema.organizations.name });
  return created;
}

async function ensureUser(email: string): Promise<{ id: string; email: string }> {
  const [existing] = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(schema.users)
    .values({
      email,
      password: 'dev-password-not-used',
      gamerName: email.split('@')[0],
      firstName: 'Course',
      lastName: 'Transfer',
      sessionVersion: 1,
    } as any)
    .returning({ id: schema.users.id, email: schema.users.email });
  return created;
}

async function writeStorageFile(storagePath: string, data: Buffer | string) {
  const abs = resolveStoragePath(storagePath);
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, data);
}

async function ensureCourseFixture(params: { sourceOrgId: string; userId: string }): Promise<{ courseId: string }> {
  const [existing] = await db
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .where(and(eq(schema.courses.organizationId, params.sourceOrgId), eq(schema.courses.title, COURSE_TITLE)))
    .limit(1);

  if (existing) {
    return { courseId: existing.id };
  }

  const basePath = `/private/course-transfer-fixture/${Date.now()}`;
  const courseThumb = `${basePath}/thumbnail.png`;
  const lessonDeck = `${basePath}/lesson.pptx`;
  const sourceDoc = `${basePath}/source.docx`;
  const genParams = `${basePath}/params.json`;
  const video = `${basePath}/video.mp4`;
  const transcript = `${basePath}/transcript.json`;
  const lessonVersionDeck = `${basePath}/lesson-version.pptx`;
  const lessonVersionVideo = `${basePath}/lesson-version-video.mp4`;
  const presentationDeck = `${basePath}/presentation-v1.pptx`;
  const quizImage = `${basePath}/quiz-image.png`;

  await writeStorageFile(courseThumb, Buffer.from('thumb'));
  await writeStorageFile(lessonDeck, Buffer.from('pptx'));
  await writeStorageFile(sourceDoc, Buffer.from('docx'));
  await writeStorageFile(genParams, JSON.stringify({ temperature: 0.2 }));
  await writeStorageFile(video, Buffer.from('video-content'));
  await writeStorageFile(transcript, JSON.stringify({ transcript: 'Security training transcript' }));
  await writeStorageFile(lessonVersionDeck, Buffer.from('version-pptx'));
  await writeStorageFile(lessonVersionVideo, Buffer.from('version-video'));
  await writeStorageFile(presentationDeck, Buffer.from('presentation-version'));
  await writeStorageFile(quizImage, Buffer.from('quiz-image'));

  const [course] = await db
    .insert(schema.courses)
    .values({
      organizationId: params.sourceOrgId,
      title: COURSE_TITLE,
      description: 'Protect people, devices, and data at work.',
      thumbnailUrl: courseThumb,
      price: '0',
      currency: 'ZAR',
      createdBy: params.userId,
      status: 'active',
      visibility: 'org_only',
      languageCode: 'en',
    })
    .returning({ id: schema.courses.id });

  await db.update(schema.courses).set({ contentGroupId: course.id }).where(eq(schema.courses.id, course.id));

  const [quizCollection] = await db
    .insert(schema.quizCollections)
    .values({
      organizationId: params.sourceOrgId,
      createdBy: params.userId,
      name: `${COURSE_TITLE} Quiz`,
      description: 'Quiz for perimeter defense',
      totalCards: 1,
      imageKey: quizImage,
      isActive: true,
      isDeleted: false,
      passPercentage: 70,
      languageCode: 'en',
    })
    .returning({ id: schema.quizCollections.id });

  const [quizCard] = await db
    .insert(schema.quizCards)
    .values({
      collectionId: quizCollection.id,
      questionType: 'multiple-choice',
      question: 'What is the strongest first line of defense?',
      answer1: 'Strong passwords',
      answer2: 'Ignoring updates',
      answer3: 'Sharing credentials',
      answer4: 'Disabling MFA',
      correctAnswerIndex: 0,
      imageKey: quizImage,
      displayOrder: 0,
    })
    .returning({ id: schema.quizCards.id });

  const [lesson] = await db
    .insert(schema.lessons)
    .values({
      organizationId: params.sourceOrgId,
      createdBy: params.userId,
      title: 'Identify and Defend the Perimeter',
      description: 'How to defend endpoint, identity, and network perimeters.',
      generationMode: 'manual-upload',
      generationStatus: 'completed',
      transcriptStatus: 'completed',
      transcriptKey: transcript,
      inputText: 'Perimeter defense requires layered controls and strong identity hygiene.',
      storageKey: lessonDeck,
      sourceDocumentPath: sourceDoc,
      generationParamsKey: genParams,
      videoStorageKey: video,
      videoDurationSec: 120,
      videoSizeBytes: 1000,
      relatedQuizId: quizCollection.id,
      isPublished: true,
      contentGroupId: undefined as any,
      languageCode: 'en',
    } as any)
    .returning({ id: schema.lessons.id });

  await db.update(schema.lessons).set({ contentGroupId: lesson.id }).where(eq(schema.lessons.id, lesson.id));

  await db.insert(schema.courseFrameworks).values({
    courseId: course.id,
    organizationId: params.sourceOrgId,
    topics: [
      { id: 'topic-1', order: 1, name: 'Perimeter Defense', lessonId: lesson.id },
    ],
  } as any);

  const [courseLesson] = await db
    .insert(schema.courseLessons)
    .values({
      courseId: course.id,
      lessonId: lesson.id,
      topicOrder: 1,
      topicName: 'Perimeter Defense',
      primaryQuizId: quizCollection.id,
      lessonType: 'content',
    } as any)
    .returning({ id: schema.courseLessons.id });

  await db.insert(schema.lessonSlides).values({
    lessonId: lesson.id,
    version: 1,
    slideIndex: 0,
    title: 'Perimeter Fundamentals',
    bullets: ['Use MFA', 'Patch endpoints', 'Limit privilege'],
    role: 'overview',
  } as any);

  await db.insert(schema.lessonPresentationVersions).values({
    lessonId: lesson.id,
    version: 1,
    gammaCardId: 'gamma-demo-card',
    presentationUrl: 'https://example.com/presentation',
    storageKey: presentationDeck,
    isGenerated: false,
    createdBy: params.userId,
  } as any);

  await db.insert(schema.lessonContentVersions).values({
    lessonId: lesson.id,
    versionNumber: 1,
    source: 'manual_edit',
    changeDescription: 'Initial content',
    previousContent: null,
    newContent: 'Initial perimeter defense content',
    createdBy: params.userId,
  } as any);

  await db.insert(schema.lessonVersions).values({
    lessonId: lesson.id,
    organizationId: params.sourceOrgId,
    versionNumber: 1,
    title: 'Version 1',
    generationStatus: 'completed',
    storageKey: lessonVersionDeck,
    fileSize: 100,
    videoStorageKey: lessonVersionVideo,
    videoDurationSec: 120,
    videoSizeBytes: 1000,
    lessonSnapshot: {
      id: lesson.id,
      title: lesson.title,
      storageKey: lessonDeck,
      sourceDocumentPath: sourceDoc,
    },
    editedBy: params.userId,
  } as any);

  await db.insert(schema.lessonQuizLinks).values({
    lessonId: lesson.id,
    quizId: quizCollection.id,
    isPrimary: true,
  } as any);

  await db.insert(schema.quizCollectionVersions).values({
    collectionId: quizCollection.id,
    organizationId: params.sourceOrgId,
    versionNumber: 1,
    name: 'Version 1',
    collectionSnapshot: {
      id: quizCollection.id,
      name: `${COURSE_TITLE} Quiz`,
      imageKey: quizImage,
    },
    editedBy: params.userId,
  } as any);

  await db.insert(schema.quizCardVersions).values({
    cardId: quizCard.id,
    collectionId: quizCollection.id,
    versionNumber: 1,
    question: 'What is the strongest first line of defense?',
    cardSnapshot: {
      id: quizCard.id,
      question: 'What is the strongest first line of defense?',
      imageKey: quizImage,
    },
    editedBy: params.userId,
  } as any);

  await db.insert(schema.courseVersions).values({
    courseId: course.id,
    versionNumber: '1.0',
    title: COURSE_TITLE,
    description: 'Initial publish',
    thumbnailUrl: courseThumb,
    basePrice: '0',
    baseCurrency: 'ZAR',
    isPublished: true,
  } as any);

  await db.insert(schema.courseTags).values({
    organizationId: params.sourceOrgId,
    courseId: course.id,
    tagName: 'security',
  } as any);

  console.log('[verify] Created fixture course', { courseId: course.id, courseLessonId: courseLesson.id, lessonId: lesson.id, quizId: quizCollection.id });

  return { courseId: course.id };
}

async function waitForJob(jobId: string, expectedType: 'export' | 'import', timeoutMs = 120000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = CourseTransferService.getJob(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    if (job.type !== expectedType) throw new Error(`Unexpected job type: ${job.type}`);
    if (job.status === 'completed') return job;
    if (job.status === 'failed' || job.status === 'canceled') {
      throw new Error(`Job ${jobId} ${job.status}: ${job.error || 'unknown error'}`);
    }
    await wait(1000);
  }
  throw new Error(`Job timeout for ${jobId}`);
}

async function verifyImportedCourse(importedCourseId: string, targetOrgId: string) {
  const [course] = await db
    .select()
    .from(schema.courses)
    .where(and(eq(schema.courses.id, importedCourseId), eq(schema.courses.organizationId, targetOrgId)))
    .limit(1);

  if (!course) throw new Error('Imported course not found in target org');
  if (course.status !== 'draft') throw new Error(`Imported course status must be draft, got ${course.status}`);

  const lessons = await db
    .select({ id: schema.lessons.id, storageKey: schema.lessons.storageKey })
    .from(schema.lessons)
    .innerJoin(schema.courseLessons, eq(schema.courseLessons.lessonId, schema.lessons.id))
    .where(eq(schema.courseLessons.courseId, importedCourseId));

  if (!lessons.length) throw new Error('Imported course has no lessons');

  for (const lesson of lessons) {
    if (!lesson.storageKey || !String(lesson.storageKey).includes('/private/course-transfer-imports/')) {
      throw new Error(`Imported lesson storageKey not rewritten correctly: ${lesson.storageKey}`);
    }
    const abs = resolveStoragePath(String(lesson.storageKey));
    if (!fs.existsSync(abs)) {
      throw new Error(`Imported lesson file missing on disk: ${abs}`);
    }
  }

  const quizLinks = await db
    .select({ id: schema.lessonQuizLinks.id })
    .from(schema.lessonQuizLinks)
    .innerJoin(schema.courseLessons, eq(schema.courseLessons.lessonId, schema.lessonQuizLinks.lessonId))
    .where(eq(schema.courseLessons.courseId, importedCourseId));

  if (!quizLinks.length) throw new Error('Imported lesson-quiz links are missing');

  console.log('[verify] Imported course validation passed', {
    importedCourseId,
    lessons: lessons.length,
    quizLinks: quizLinks.length,
  });
}

async function main() {
  process.env.ONPREM_MODE = 'true';

  const sourceOrg = await ensureOrg(SOURCE_ORG_NAME);
  const targetOrg = await ensureOrg(TARGET_ORG_NAME);

  const sourceUser = await ensureUser('transfer-source@learnplay.local');
  const targetUser = await ensureUser('transfer-target@learnplay.local');

  const { courseId } = await ensureCourseFixture({ sourceOrgId: sourceOrg.id, userId: sourceUser.id });

  console.log('[verify] Starting export job', { courseId, sourceOrgId: sourceOrg.id });
  const exportJob = await CourseTransferService.startExportJob({
    courseId,
    organizationId: sourceOrg.id,
    userId: sourceUser.id,
  });
  const completedExport = await waitForJob(exportJob.id, 'export', 180000);
  if (!completedExport.downloadPath) {
    throw new Error('Export completed without downloadPath');
  }
  console.log('[verify] Export success', { exportJobId: completedExport.id, zipPath: completedExport.downloadPath });

  console.log('[verify] Starting import job', { targetOrgId: targetOrg.id });
  const importJob = await CourseTransferService.startImportJob({
    zipPath: String(completedExport.downloadPath),
    organizationId: targetOrg.id,
    userId: targetUser.id,
  });
  const completedImport = await waitForJob(importJob.id, 'import', 240000);
  const importedCourseId = String(completedImport.details?.importedCourseId || '');
  if (!importedCourseId) {
    throw new Error('Import completed but no importedCourseId returned');
  }

  await verifyImportedCourse(importedCourseId, targetOrg.id);

  console.log('SUCCESS: Course was exported from LearnPlay and imported into TechSpecIT', {
    sourceCourseId: courseId,
    importedCourseId,
    exportJobId: completedExport.id,
    importJobId: completedImport.id,
  });
}

main().catch((error) => {
  console.error('FAILED:', error);
  process.exit(1);
});
