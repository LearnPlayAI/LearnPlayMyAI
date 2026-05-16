import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    transaction: jest.fn(),
    execute: jest.fn(),
  },
}));

jest.mock('../services/courseCompletionService', () => ({
  CourseCompletionService: {
    recalculateAndUpdateCourseProgress: jest.fn(),
  },
}));

import { db } from '../db';
import { LessonProgressService } from '../services/lessonProgressService';

const dbMock = db as unknown as {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  transaction: jest.Mock;
  execute: jest.Mock;
};

function createQueryBuilder(result: any, terminal: "where" | "limit" | "orderBy" = "limit") {
  const builder: any = {};
  builder.from = jest.fn(() => builder);
  builder.where = terminal === "where" ? jest.fn(async () => result) : jest.fn(() => builder);
  builder.orderBy = terminal === "orderBy" ? jest.fn(async () => result) : jest.fn(() => builder);
  builder.limit = terminal === "limit" ? jest.fn(async () => result) : jest.fn(() => builder);
  builder.values = jest.fn(() => builder);
  builder.onConflictDoUpdate = jest.fn(() => builder);
  builder.returning = jest.fn(async () => result);
  builder.set = jest.fn(() => builder);
  builder.execute = jest.fn(async () => undefined);
  return builder;
}

function createInsertBuilder(result: any) {
  const builder: any = {};
  builder.values = jest.fn(() => builder);
  builder.onConflictDoUpdate = jest.fn(() => builder);
  builder.returning = jest.fn(async () => result);
  return builder;
}

function createUpdateBuilder() {
  const builder: any = {};
  builder.set = jest.fn(() => builder);
  builder.where = jest.fn(async () => undefined);
  return builder;
}

describe('LessonProgressService viewer guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dbMock.select.mockImplementation(() => createQueryBuilder([]));
    jest.spyOn(global, 'setImmediate').mockImplementation(() => 0 as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('blocks completion until every linked quiz context has been passed', async () => {
    const courseLessonRows = [
      { courseId: 'course-a', topicOrder: 2, primaryQuizId: 'quiz-a' },
      { courseId: 'course-b', topicOrder: 3, primaryQuizId: 'quiz-b' },
    ];
    const quizProgressRows = [
      { collectionId: 'quiz-a', passedAt: new Date().toISOString(), completionStatus: 'completed_passed' },
    ];

    dbMock.select
      .mockReturnValueOnce(createQueryBuilder(courseLessonRows, 'orderBy'))
      .mockReturnValueOnce(createQueryBuilder(quizProgressRows, 'where'));

    const result = await LessonProgressService.checkQuizRequirementForLesson({
      lessonId: 'lesson-1',
      userId: 'user-1',
      organizationId: 'org-1',
    });

    expect(result).toEqual({
      requiresQuiz: true,
      quizPassed: false,
      isFirstLesson: false,
      courseId: 'course-b',
      quizId: 'quiz-b',
    });
  });

  it('refuses to complete a lesson when not all slides have been viewed', async () => {
    jest.spyOn(LessonProgressService, 'checkQuizRequirementForLesson').mockResolvedValue({
      requiresQuiz: false,
      quizPassed: false,
      isFirstLesson: false,
      courseId: null,
      quizId: null,
    });

    const lessonRows = [{ id: 'lesson-1', metadata: { numCards: 5 } }];
    const existingProgressRows = [{ id: 'progress-1', status: 'in_progress', slidesViewedCount: 2, totalSlides: 5 }];
    const txSelectBuilder = createQueryBuilder(existingProgressRows);
    const txSlideCountBuilder = createQueryBuilder([{ count: 2 }]);
    const tx = {
      select: jest.fn()
        .mockReturnValueOnce(txSelectBuilder)
        .mockReturnValueOnce(txSlideCountBuilder),
      insert: jest.fn(),
      update: jest.fn(),
      execute: jest.fn(),
    } as any;

    dbMock.select.mockReturnValueOnce(createQueryBuilder(lessonRows));
    dbMock.transaction.mockImplementation(async (callback: any) => callback(tx));

    await expect(LessonProgressService.finalizeCompletion({
      lessonId: 'lesson-1',
      userId: 'user-1',
      organizationId: 'org-1',
      secondsSpent: 42,
    })).rejects.toThrow('Cannot complete lesson: only 2/5 slides viewed');

    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('reconciles stale cached slide counts against the slide-view table before completing', async () => {
    jest.spyOn(LessonProgressService, 'checkQuizRequirementForLesson').mockResolvedValue({
      requiresQuiz: false,
      quizPassed: false,
      isFirstLesson: false,
      courseId: null,
      quizId: null,
    });

    const lessonRows = [{ id: 'lesson-1', metadata: { numCards: 3 } }];
    const existingProgressRows = [{
      id: 'progress-1',
      status: 'completed',
      slidesViewedCount: 1,
      totalSlides: 3,
      completedAt: new Date().toISOString(),
    }];
    const txSelectBuilder = createQueryBuilder(existingProgressRows);
    const txSlideCountBuilder = createQueryBuilder([{ count: 3 }]);
    const tx = {
      select: jest.fn()
        .mockReturnValueOnce(txSelectBuilder)
        .mockReturnValueOnce(txSlideCountBuilder),
      insert: jest.fn(() => createInsertBuilder([{ id: 'progress-1', status: 'completed' }])),
      update: jest.fn(() => createUpdateBuilder()),
      execute: jest.fn(),
    } as any;

    dbMock.select.mockReturnValueOnce(createQueryBuilder(lessonRows));
    dbMock.transaction.mockImplementation(async (callback: any) => callback(tx));

    const result = await LessonProgressService.finalizeCompletion({
      lessonId: 'lesson-1',
      userId: 'user-1',
      organizationId: 'org-1',
      secondsSpent: 42,
    });

    expect(result.isFirstCompletion).toBe(false);
    expect(result.progress).toEqual({ id: 'progress-1', status: 'completed' });
    expect(tx.insert).toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });
});
