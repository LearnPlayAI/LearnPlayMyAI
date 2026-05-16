import { createHash } from 'crypto';
import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  courses,
  lessons,
  quizCollections,
  translationIndexEntityTypeEnum,
  translationIndexEventTypeEnum,
  translationIndexFailures,
  translationIndexJobs,
  translationSearchDocuments,
} from '@shared/schema';

type IndexEntityType = (typeof translationIndexEntityTypeEnum.enumValues)[number];
type IndexEventType = (typeof translationIndexEventTypeEnum.enumValues)[number];

type EnqueueInput = {
  organizationId: string;
  entityType: IndexEntityType;
  entityId: string;
  eventType: IndexEventType;
  languageCode?: string | null;
  contentGroupId?: string | null;
  payload?: Record<string, any>;
  dedupeSeed?: string;
};

type SearchDocumentSnapshot = {
  organizationId: string;
  entityType: IndexEntityType;
  entityId: string;
  languageCode: string;
  contentGroupId: string | null;
  sourceEntityId: string | null;
  title: string;
  summary: string;
  searchableText: string;
  variantUpdatedAt: Date | null;
  metadata: Record<string, any>;
};

const MAX_BATCH = 50;

function normalizeLang(code?: string | null): string | null {
  const value = String(code || '').trim().toLowerCase();
  return value || null;
}

function computeDedupeKey(input: EnqueueInput): string {
  const seed = input.dedupeSeed || '';
  const raw = [
    input.organizationId,
    input.entityType,
    input.entityId,
    input.eventType,
    normalizeLang(input.languageCode) || '',
    String(input.contentGroupId || ''),
    seed,
  ].join(':');
  return createHash('sha256').update(raw).digest('hex');
}

export class TranslationIndexService {
  static async requeueStaleProcessingJobs(maxAgeMs: number = 5 * 60 * 1000): Promise<number> {
    const staleBefore = new Date(Date.now() - maxAgeMs);
    const staleRows = await db
      .select({ id: translationIndexJobs.id })
      .from(translationIndexJobs)
      .where(and(
        eq(translationIndexJobs.status, 'processing'),
        lt(translationIndexJobs.updatedAt, staleBefore)
      ))
      .limit(MAX_BATCH);
    if (!staleRows.length) return 0;

    await db
      .update(translationIndexJobs)
      .set({
        status: 'failed',
        lastError: 'Recovered stale processing job after worker restart/interruption',
        nextRetryAt: new Date(),
        updatedAt: new Date(),
      })
      .where(inArray(translationIndexJobs.id, staleRows.map((row) => row.id)));

    return staleRows.length;
  }

  static async enqueue(input: EnqueueInput): Promise<{ jobId: string; deduped: boolean }> {
    const dedupeKey = computeDedupeKey(input);
    const [inserted] = await db
      .insert(translationIndexJobs)
      .values({
        organizationId: input.organizationId,
        entityType: input.entityType,
        entityId: input.entityId,
        eventType: input.eventType,
        languageCode: normalizeLang(input.languageCode),
        contentGroupId: input.contentGroupId || null,
        dedupeKey,
        status: 'pending',
        payload: input.payload || {},
        nextRetryAt: new Date(),
      })
      .onConflictDoNothing({ target: translationIndexJobs.dedupeKey })
      .returning({ id: translationIndexJobs.id });

    if (inserted?.id) {
      return { jobId: inserted.id, deduped: false };
    }

    const [existing] = await db
      .select({ id: translationIndexJobs.id })
      .from(translationIndexJobs)
      .where(eq(translationIndexJobs.dedupeKey, dedupeKey))
      .limit(1);

    if (!existing) {
      throw new Error('Failed to enqueue translation index job');
    }

    return { jobId: existing.id, deduped: true };
  }

  static async enqueueForCourseMutation(input: {
    courseId: string;
    organizationId: string;
    eventType: IndexEventType;
    dedupeSeed?: string;
  }): Promise<void> {
    const [course] = await db
      .select({ id: courses.id, languageCode: courses.languageCode, contentGroupId: courses.contentGroupId })
      .from(courses)
      .where(eq(courses.id, input.courseId))
      .limit(1);
    if (!course) return;

    await this.enqueue({
      organizationId: input.organizationId,
      entityType: 'course',
      entityId: input.courseId,
      eventType: input.eventType,
      languageCode: course.languageCode,
      contentGroupId: course.contentGroupId || null,
      dedupeSeed: input.dedupeSeed,
    });
  }

  static async enqueueForLessonMutation(input: {
    lessonId: string;
    organizationId: string;
    eventType: IndexEventType;
    dedupeSeed?: string;
  }): Promise<void> {
    const [lesson] = await db
      .select({ id: lessons.id, languageCode: lessons.languageCode, contentGroupId: lessons.contentGroupId })
      .from(lessons)
      .where(eq(lessons.id, input.lessonId))
      .limit(1);
    if (!lesson) return;

    await this.enqueue({
      organizationId: input.organizationId,
      entityType: 'lesson',
      entityId: input.lessonId,
      eventType: input.eventType,
      languageCode: lesson.languageCode,
      contentGroupId: lesson.contentGroupId || null,
      dedupeSeed: input.dedupeSeed,
    });
  }

  static async enqueueForQuizMutation(input: {
    quizId: string;
    organizationId: string;
    eventType: IndexEventType;
    dedupeSeed?: string;
  }): Promise<void> {
    const [quiz] = await db
      .select({ id: quizCollections.id, languageCode: quizCollections.languageCode, contentGroupId: quizCollections.contentGroupId })
      .from(quizCollections)
      .where(eq(quizCollections.id, input.quizId))
      .limit(1);
    if (!quiz) return;

    await this.enqueue({
      organizationId: input.organizationId,
      entityType: 'quiz',
      entityId: input.quizId,
      eventType: input.eventType,
      languageCode: quiz.languageCode,
      contentGroupId: quiz.contentGroupId || null,
      dedupeSeed: input.dedupeSeed,
    });
  }

  static async processQueue(limit: number = MAX_BATCH): Promise<{ processed: number; failed: number; deadLettered: number }> {
    const now = new Date();
    await this.requeueStaleProcessingJobs();
    const candidates = await db
      .select()
      .from(translationIndexJobs)
      .where(and(
        or(eq(translationIndexJobs.status, 'pending'), eq(translationIndexJobs.status, 'failed')),
        or(isNull(translationIndexJobs.nextRetryAt), lte(translationIndexJobs.nextRetryAt, now))
      ))
      .orderBy(asc(translationIndexJobs.createdAt))
      .limit(limit);

    let processed = 0;
    let failed = 0;
    let deadLettered = 0;

    for (const job of candidates) {
      const [claimed] = await db
        .update(translationIndexJobs)
        .set({ status: 'processing', updatedAt: new Date() })
        .where(and(
          eq(translationIndexJobs.id, job.id),
          or(eq(translationIndexJobs.status, 'pending'), eq(translationIndexJobs.status, 'failed'))
        ))
        .returning({ id: translationIndexJobs.id });
      if (!claimed?.id) continue;

      try {
        const snapshot = await this.buildSnapshot(job.entityType as IndexEntityType, job.entityId);

        if (!snapshot) {
          await db
            .delete(translationSearchDocuments)
            .where(and(
              eq(translationSearchDocuments.entityType, job.entityType as any),
              eq(translationSearchDocuments.entityId, job.entityId)
            ));
        } else {
          await db
            .insert(translationSearchDocuments)
            .values({
              organizationId: snapshot.organizationId,
              entityType: snapshot.entityType,
              entityId: snapshot.entityId,
              languageCode: snapshot.languageCode,
              contentGroupId: snapshot.contentGroupId,
              sourceEntityId: snapshot.sourceEntityId,
              title: snapshot.title,
              summary: snapshot.summary,
              searchableText: snapshot.searchableText,
              variantUpdatedAt: snapshot.variantUpdatedAt,
              indexedAt: new Date(),
              metadata: snapshot.metadata,
            })
            .onConflictDoUpdate({
              target: [translationSearchDocuments.entityType, translationSearchDocuments.entityId, translationSearchDocuments.languageCode],
              set: {
                title: snapshot.title,
                summary: snapshot.summary,
                searchableText: snapshot.searchableText,
                contentGroupId: snapshot.contentGroupId,
                sourceEntityId: snapshot.sourceEntityId,
                variantUpdatedAt: snapshot.variantUpdatedAt,
                indexedAt: new Date(),
                metadata: snapshot.metadata,
              },
            });
        }

        await db
          .update(translationIndexJobs)
          .set({ status: 'completed', processedAt: new Date(), updatedAt: new Date(), lastError: null })
          .where(eq(translationIndexJobs.id, job.id));
        processed += 1;
      } catch (error: any) {
        const nextAttempt = (job.attemptCount || 0) + 1;
        const exhausted = nextAttempt >= (job.maxAttempts || 5);
        const errorMessage = error?.message || 'Unknown translation index failure';

        await db.insert(translationIndexFailures).values({
          jobId: job.id,
          organizationId: job.organizationId,
          errorMessage,
          attemptCount: nextAttempt,
          deadLettered: exhausted,
          payload: job.payload as any,
        });

        await db
          .update(translationIndexJobs)
          .set({
            status: exhausted ? 'dead_letter' : 'failed',
            attemptCount: nextAttempt,
            lastError: errorMessage,
            nextRetryAt: exhausted ? null : new Date(Date.now() + Math.min(60_000 * Math.pow(2, nextAttempt), 30 * 60_000)),
            updatedAt: new Date(),
          })
          .where(eq(translationIndexJobs.id, job.id));

        if (exhausted) deadLettered += 1;
        failed += 1;
      }
    }

    return { processed, failed, deadLettered };
  }

  static async replayDeadLetters(limit = 20): Promise<number> {
    const rows = await db
      .select({ id: translationIndexJobs.id })
      .from(translationIndexJobs)
      .where(eq(translationIndexJobs.status, 'dead_letter'))
      .orderBy(asc(translationIndexJobs.updatedAt))
      .limit(limit);

    if (!rows.length) return 0;

    await db
      .update(translationIndexJobs)
      .set({ status: 'pending', nextRetryAt: new Date(), updatedAt: new Date() })
      .where(inArray(translationIndexJobs.id, rows.map((r) => r.id)));

    return rows.length;
  }

  private static async buildSnapshot(entityType: IndexEntityType, entityId: string): Promise<SearchDocumentSnapshot | null> {
    if (entityType === 'course') {
      const [course] = await db
        .select({
          id: courses.id,
          organizationId: courses.organizationId,
          title: courses.title,
          description: courses.description,
          languageCode: courses.languageCode,
          contentGroupId: courses.contentGroupId,
          updatedAt: courses.updatedAt,
          visibility: courses.visibility,
          status: courses.status,
        })
        .from(courses)
        .where(eq(courses.id, entityId))
        .limit(1);

      if (!course) return null;

      return {
        organizationId: course.organizationId,
        entityType,
        entityId,
        languageCode: normalizeLang(course.languageCode) || 'en',
        contentGroupId: course.contentGroupId || null,
        sourceEntityId: course.contentGroupId || null,
        title: String(course.title || ''),
        summary: String(course.description || ''),
        searchableText: `${course.title || ''}\n${course.description || ''}`.trim(),
        variantUpdatedAt: course.updatedAt || null,
        metadata: {
          visibility: course.visibility,
          status: course.status,
        },
      };
    }

    if (entityType === 'lesson') {
      const [lesson] = await db
        .select({
          id: lessons.id,
          organizationId: lessons.organizationId,
          title: lessons.title,
          description: lessons.description,
          inputText: lessons.inputText,
          languageCode: lessons.languageCode,
          contentGroupId: lessons.contentGroupId,
          updatedAt: lessons.updatedAt,
          isPublished: lessons.isPublished,
          translationStatus: lessons.translationStatus,
        })
        .from(lessons)
        .where(eq(lessons.id, entityId))
        .limit(1);

      if (!lesson) return null;

      return {
        organizationId: lesson.organizationId,
        entityType,
        entityId,
        languageCode: normalizeLang(lesson.languageCode) || 'en',
        contentGroupId: lesson.contentGroupId || null,
        sourceEntityId: lesson.contentGroupId || null,
        title: String(lesson.title || ''),
        summary: String(lesson.description || ''),
        searchableText: `${lesson.title || ''}\n${lesson.description || ''}\n${lesson.inputText || ''}`.trim(),
        variantUpdatedAt: lesson.updatedAt || null,
        metadata: {
          isPublished: lesson.isPublished,
          translationStatus: lesson.translationStatus,
        },
      };
    }

    if (entityType === 'quiz') {
      const [quiz] = await db
        .select({
          id: quizCollections.id,
          organizationId: quizCollections.organizationId,
          name: quizCollections.name,
          description: quizCollections.description,
          languageCode: quizCollections.languageCode,
          contentGroupId: quizCollections.contentGroupId,
          updatedAt: quizCollections.updatedAt,
          totalCards: quizCollections.totalCards,
        })
        .from(quizCollections)
        .where(eq(quizCollections.id, entityId))
        .limit(1);

      if (!quiz || !quiz.organizationId) return null;

      return {
        organizationId: quiz.organizationId,
        entityType,
        entityId,
        languageCode: normalizeLang(quiz.languageCode) || 'en',
        contentGroupId: quiz.contentGroupId || null,
        sourceEntityId: quiz.contentGroupId || null,
        title: String(quiz.name || ''),
        summary: String(quiz.description || ''),
        searchableText: `${quiz.name || ''}\n${quiz.description || ''}`.trim(),
        variantUpdatedAt: quiz.updatedAt || null,
        metadata: {
          totalCards: quiz.totalCards,
        },
      };
    }

    if (entityType === 'podcast') {
      const [lesson] = await db
        .select({
          id: lessons.id,
          organizationId: lessons.organizationId,
          title: lessons.title,
          languageCode: lessons.languageCode,
          contentGroupId: lessons.contentGroupId,
          metadata: lessons.metadata,
          updatedAt: lessons.updatedAt,
        })
        .from(lessons)
        .where(eq(lessons.id, entityId))
        .limit(1);

      if (!lesson) return null;

      const podcast = (lesson.metadata as any)?.podcast || {};
      const versions = Array.isArray(podcast.versions) ? podcast.versions : [];
      const activeVersionId = podcast.activeVersionId || null;
      const active = versions.find((v: any) => v?.id === activeVersionId) || versions[0] || null;
      const script = String(active?.scriptText || active?.sourceScript || '').trim();

      return {
        organizationId: lesson.organizationId,
        entityType,
        entityId,
        languageCode: normalizeLang(active?.languageCode || lesson.languageCode) || 'en',
        contentGroupId: lesson.contentGroupId || null,
        sourceEntityId: lesson.contentGroupId || null,
        title: String(lesson.title || ''),
        summary: String(active?.title || 'Lesson podcast'),
        searchableText: `${lesson.title || ''}\n${active?.title || ''}\n${script}`.trim(),
        variantUpdatedAt: lesson.updatedAt || null,
        metadata: {
          activeVersionId,
          versionCount: versions.length,
        },
      };
    }

    return null;
  }

  static async getFailureSummary(organizationId: string): Promise<{ failed: number; deadLetter: number }> {
    const rows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE status = 'dead_letter')::int AS dead_letter
      FROM "translationIndexJobs"
      WHERE "organizationId" = ${organizationId}
    `);

    const data: any = (rows as any)?.rows?.[0] || (Array.isArray(rows) ? (rows as any[])[0] : rows) || {};
    return {
      failed: Number(data.failed || 0),
      deadLetter: Number(data.dead_letter || 0),
    };
  }
}
