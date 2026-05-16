/**
 * Integration tests for course-lesson unlink/relink workflow
 * 
 * Tests the complete unlink → relink workflow including:
 * - Quiz link archival and restoration
 * - Scope assignment archival and restoration
 * - Lesson metadata status updates
 * - Course framework topic metadata updates
 * - Edge cases (already unlinked/linked, deleted entities)
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import { db } from '../db';
import { 
  users, 
  organizations, 
  userOrganizationRoles, 
  courses,
  courseFrameworks,
  courseLessons,
  lessons,
  lessonQuizLinks,
  lessonScopeAssignments,
  quizCollections,
  organizationLicenses
} from '@shared/schema';
import bcrypt from 'bcrypt';
import { eq, and } from 'drizzle-orm';
import { CourseLessonService } from '../services/courseLessonService';

describe('Course-Lesson Unlink/Relink Workflow', () => {
  let consoleLogSpy: ReturnType<typeof jest.spyOn>;
  let consoleWarnSpy: ReturnType<typeof jest.spyOn>;
  let testUser: any;
  let testOrg: any;
  let testCourse: any;
  let testLesson: any;
  let testQuiz1: any;
  let testQuiz2: any;
  let testFramework: any;
  let sessionCookie: string;

  beforeAll(() => {
    // Suppress high-volume service logs in integration runs to keep Jest memory stable.
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  const createTestData = async () => {
    const hashedPassword = await bcrypt.hash('testpass123', 10);
    const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    
    [testUser] = await db.insert(users).values({
      gamerName: `CourseTestUser_${uniqueId}`,
      email: `coursetest_${uniqueId}@test.com`,
      password: hashedPassword,
      firstName: 'Course',
      lastName: 'Tester',
      sessionVersion: 1,
    }).returning();

    [testOrg] = await db.insert(organizations).values({
      name: 'Test Course Org',
      inviteCode: `TESTCOURSEORG_${uniqueId}`,
      type: 'education',
    }).returning();

    await db.insert(userOrganizationRoles).values({
      userId: testUser.id,
      organizationId: testOrg.id,
      role: 'org_admin',
    });

    const now = new Date();
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(organizationLicenses).values({
      organizationId: testOrg.id,
      tier: 'gold',
      status: 'active',
      totalSeats: 100,
      seatsConsumed: 0,
      billingPeriodMonths: 1,
      currentTermStart: now,
      currentTermEnd: thirtyDaysLater,
    });

    [testCourse] = await db.insert(courses).values({
      organizationId: testOrg.id,
      title: 'Test Course for Unlink/Relink',
      description: 'A test course',
      price: '0.00',
      currency: 'ZAR',
      status: 'draft',
      createdBy: testUser.id,
    }).returning();

    [testLesson] = await db.insert(lessons).values({
      organizationId: testOrg.id,
      createdBy: testUser.id,
      title: 'Test Lesson',
      description: 'A test lesson for unlink/relink testing',
      generationStatus: 'completed',
      metadata: { availabilityStatus: 'active' },
    }).returning();

    [testQuiz1] = await db.insert(quizCollections).values({
      organizationId: testOrg.id,
      createdBy: testUser.id,
      name: 'Quiz 1 for Lesson',
      description: 'Primary quiz',
    }).returning();

    [testQuiz2] = await db.insert(quizCollections).values({
      organizationId: testOrg.id,
      createdBy: testUser.id,
      name: 'Quiz 2 for Lesson',
      description: 'Secondary quiz',
    }).returning();

    [testFramework] = await db.insert(courseFrameworks).values({
      courseId: testCourse.id,
      organizationId: testOrg.id,
      topics: [
        { id: 'topic-1', order: 1, name: 'Overview', lessonType: 'overview', lessonId: null },
        { id: 'topic-2', order: 2, name: 'Topic 2', lessonType: 'content', lessonId: testLesson.id },
        { id: 'topic-3', order: 3, name: 'Key Takeaways', lessonType: 'key_takeaways', lessonId: null },
      ],
    }).returning();

    await db.insert(courseLessons).values({
      courseId: testCourse.id,
      lessonId: testLesson.id,
      topicName: 'Topic 2',
      topicOrder: 2,
    });

    await db.insert(lessonQuizLinks).values([
      { lessonId: testLesson.id, quizId: testQuiz1.id, isPrimary: true },
      { lessonId: testLesson.id, quizId: testQuiz2.id, isPrimary: false },
    ]);

    await db.insert(lessonScopeAssignments).values({
      lessonId: testLesson.id,
      organizationId: testOrg.id,
      unitId: null,
      subjectId: null,
      audience: 'learner',
      assignedBy: testUser.id,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  };

  const cleanupTestData = async () => {
    try {
      if (testLesson?.id) {
        await db.delete(lessonScopeAssignments).where(eq(lessonScopeAssignments.lessonId, testLesson.id));
        await db.delete(lessonQuizLinks).where(eq(lessonQuizLinks.lessonId, testLesson.id));
      }
      if (testCourse?.id) {
        await db.delete(courseLessons).where(eq(courseLessons.courseId, testCourse.id));
        await db.delete(courseFrameworks).where(eq(courseFrameworks.courseId, testCourse.id));
        await db.delete(courses).where(eq(courses.id, testCourse.id));
      }
      if (testOrg?.id) {
        await db.delete(lessons).where(eq(lessons.organizationId, testOrg.id));
        await db.delete(quizCollections).where(eq(quizCollections.organizationId, testOrg.id));
        await db.delete(userOrganizationRoles).where(eq(userOrganizationRoles.organizationId, testOrg.id));
        await db.delete(organizationLicenses).where(eq(organizationLicenses.organizationId, testOrg.id));
        await db.delete(organizations).where(eq(organizations.id, testOrg.id));
      }
      if (testUser?.id) {
        await db.delete(users).where(eq(users.id, testUser.id));
      }
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  };

  beforeEach(async () => {
    await cleanupTestData();
    await createTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('Direct Service Tests (CourseLessonService)', () => {
    describe('unlinkLesson', () => {
      it('should unlink a lesson and archive quiz links and scope assignments', async () => {
        const result = await CourseLessonService.unlinkLesson(
          testCourse.id,
          testLesson.id,
          testOrg.id
        );

        expect(result.success).toBe(true);
        expect(result.lessonId).toBe(testLesson.id);
        expect(result.courseId).toBe(testCourse.id);
        expect(result.previousOrder).toBe(2);
        expect(result.previousTopicName).toBe('Topic 2');
        expect(result.quizLinksArchived).toBe(2);
        expect(result.scopeAssignmentsArchived).toBe(1);

        const courseLessonEntry = await db.query.courseLessons.findFirst({
          where: and(
            eq(courseLessons.courseId, testCourse.id),
            eq(courseLessons.lessonId, testLesson.id)
          ),
        });
        expect(courseLessonEntry).toBeUndefined();

        const updatedLesson = await db.query.lessons.findFirst({
          where: eq(lessons.id, testLesson.id),
        });
        const metadata = updatedLesson?.metadata as any;
        expect(metadata?.availabilityStatus).toBe('unlinked');
        expect(metadata?.unlinkedFromCourseId).toBe(testCourse.id);
        expect(metadata?.unlinkedAt).toBeDefined();

        const quizLinks = await db.query.lessonQuizLinks.findMany({
          where: eq(lessonQuizLinks.lessonId, testLesson.id),
        });
        expect(quizLinks.length).toBe(0);

        const scopeAssignments = await db.query.lessonScopeAssignments.findMany({
          where: eq(lessonScopeAssignments.lessonId, testLesson.id),
        });
        expect(scopeAssignments.length).toBe(0);

        const updatedFramework = await db.query.courseFrameworks.findFirst({
          where: eq(courseFrameworks.courseId, testCourse.id),
        });
        const topics = updatedFramework?.topics as any[];
        const topic1 = topics.find((t: any) => t.order === 2);
        
        expect(topic1.lessonId).toBeNull();
        expect(topic1.previousLessonId).toBe(testLesson.id);
        expect(topic1.previousTopicOrder).toBe(2);
        expect(topic1.previousTopicName).toBe('Topic 2');
        expect(topic1.unlinkedAt).toBeDefined();
        expect(topic1.archivedQuizLinks).toHaveLength(2);
        expect(topic1.archivedScopeAssignments).toHaveLength(1);
      });

      it('should throw error when lesson is not linked to course', async () => {
        const [newLesson] = await db.insert(lessons).values({
          organizationId: testOrg.id,
          createdBy: testUser.id,
          title: 'Unlinked Lesson',
          generationStatus: 'completed',
        }).returning();

        await expect(
          CourseLessonService.unlinkLesson(testCourse.id, newLesson.id, testOrg.id)
        ).rejects.toThrow('Lesson is not linked to this course');

        await db.delete(lessons).where(eq(lessons.id, newLesson.id));
      });

      it('should throw error when course not found or unauthorized', async () => {
        await expect(
          CourseLessonService.unlinkLesson('non-existent-uuid-0000', testLesson.id, testOrg.id)
        ).rejects.toThrow('Course not found or unauthorized');
      });
    });

    describe('relinkLesson', () => {
      it('should relink a previously unlinked lesson and restore quiz links and scope assignments', async () => {
        await CourseLessonService.unlinkLesson(testCourse.id, testLesson.id, testOrg.id);

        const result = await CourseLessonService.relinkLesson(
          testCourse.id,
          testLesson.id,
          testOrg.id
        );

        expect(result.success).toBe(true);
        expect(result.lessonId).toBe(testLesson.id);
        expect(result.courseId).toBe(testCourse.id);
        expect(result.restoredOrder).toBe(2);
        expect(result.quizLinksRestored).toBe(2);
        expect(result.scopeAssignmentsRestored).toBe(1);

        const courseLessonEntry = await db.query.courseLessons.findFirst({
          where: and(
            eq(courseLessons.courseId, testCourse.id),
            eq(courseLessons.lessonId, testLesson.id)
          ),
        });
        expect(courseLessonEntry).toBeDefined();
        expect(courseLessonEntry?.topicOrder).toBe(2);
        expect(courseLessonEntry?.topicName).toBe('Topic 2');

        const updatedLesson = await db.query.lessons.findFirst({
          where: eq(lessons.id, testLesson.id),
        });
        const metadata = updatedLesson?.metadata as any;
        expect(metadata?.availabilityStatus).toBe('active');
        expect(metadata?.relinkedToCourseId).toBe(testCourse.id);
        expect(metadata?.relinkedAt).toBeDefined();

        const quizLinks = await db.query.lessonQuizLinks.findMany({
          where: eq(lessonQuizLinks.lessonId, testLesson.id),
        });
        expect(quizLinks.length).toBe(2);
        const primaryQuiz = quizLinks.find((l: any) => l.isPrimary);
        expect(primaryQuiz?.quizId).toBe(testQuiz1.id);

        const scopeAssignments = await db.query.lessonScopeAssignments.findMany({
          where: eq(lessonScopeAssignments.lessonId, testLesson.id),
        });
        expect(scopeAssignments.length).toBe(1);

        const updatedFramework = await db.query.courseFrameworks.findFirst({
          where: eq(courseFrameworks.courseId, testCourse.id),
        });
        const topics = updatedFramework?.topics as any[];
        const topic1 = topics.find((t: any) => t.order === 2);
        
        expect(topic1.lessonId).toBe(testLesson.id);
        expect(topic1.previousLessonId).toBeNull();
        expect(topic1.archivedQuizLinks).toBeNull();
        expect(topic1.archivedScopeAssignments).toBeNull();
      });

      it('should throw error when lesson is already linked', async () => {
        await expect(
          CourseLessonService.relinkLesson(testCourse.id, testLesson.id, testOrg.id)
        ).rejects.toThrow('Lesson is already linked to this course');
      });

      it('should handle relink with orderOverride to a different topic', async () => {
        await CourseLessonService.unlinkLesson(testCourse.id, testLesson.id, testOrg.id);

        const result = await CourseLessonService.relinkLesson(
          testCourse.id,
          testLesson.id,
          testOrg.id,
          1
        );

        expect(result.success).toBe(true);
        expect(result.restoredOrder).toBe(1);
        expect(result.quizLinksRestored).toBe(2);
        expect(result.scopeAssignmentsRestored).toBe(1);

        const courseLessonEntry = await db.query.courseLessons.findFirst({
          where: and(
            eq(courseLessons.courseId, testCourse.id),
            eq(courseLessons.lessonId, testLesson.id)
          ),
        });
        expect(courseLessonEntry?.topicOrder).toBe(1);
        
        const updatedFramework = await db.query.courseFrameworks.findFirst({
          where: eq(courseFrameworks.courseId, testCourse.id),
        });
        const topics = updatedFramework?.topics as any[];
        const originalTopic = topics.find((t: any) => t.order === 2);
        expect(originalTopic.previousLessonId).toBeNull();
      });

      it('should throw error when orderOverride position has a lesson', async () => {
        const [lesson2] = await db.insert(lessons).values({
          organizationId: testOrg.id,
          createdBy: testUser.id,
          title: 'Lesson 2',
          generationStatus: 'completed',
        }).returning();

        await db.insert(courseLessons).values({
          courseId: testCourse.id,
          lessonId: lesson2.id,
          topicName: 'Topic 2',
          topicOrder: 2,
        });

        await db.update(courseFrameworks)
          .set({
            topics: [
              { id: 'topic-1', order: 1, name: 'Overview', lessonType: 'overview', lessonId: null },
              { id: 'topic-2', order: 2, name: 'Topic 2', lessonType: 'content', lessonId: testLesson.id },
              { id: 'topic-3', order: 3, name: 'Key Takeaways', lessonType: 'key_takeaways', lessonId: lesson2.id },
            ],
          })
          .where(eq(courseFrameworks.courseId, testCourse.id));

        await CourseLessonService.unlinkLesson(testCourse.id, testLesson.id, testOrg.id);

        await expect(
          CourseLessonService.relinkLesson(testCourse.id, testLesson.id, testOrg.id, 3)
        ).rejects.toThrow('No available topic at position 3');

        await db.delete(courseLessons).where(eq(courseLessons.lessonId, lesson2.id));
        await db.delete(lessons).where(eq(lessons.id, lesson2.id));
      });

      it('should handle deleted quiz gracefully during restore', async () => {
        const unlinkResult = await CourseLessonService.unlinkLesson(testCourse.id, testLesson.id, testOrg.id);
        expect(unlinkResult.success).toBe(true);

        await db.delete(quizCollections).where(eq(quizCollections.id, testQuiz2.id));
        testQuiz2 = null;

        const result = await CourseLessonService.relinkLesson(
          testCourse.id,
          testLesson.id,
          testOrg.id
        );

        expect(result.success).toBe(true);
        expect(result.quizLinksRestored).toBe(1);

        const quizLinks = await db.query.lessonQuizLinks.findMany({
          where: eq(lessonQuizLinks.lessonId, testLesson.id),
        });
        expect(quizLinks.length).toBe(1);
        expect(quizLinks[0].quizId).toBe(testQuiz1.id);
      });
    });

    describe('getRelinkableLessons', () => {
      it('should return unlinked lessons for a course', async () => {
        await CourseLessonService.unlinkLesson(testCourse.id, testLesson.id, testOrg.id);

        const relinkableLessons = await CourseLessonService.getRelinkableLessons(
          testCourse.id,
          testOrg.id
        );

        expect(relinkableLessons.length).toBe(1);
        expect(relinkableLessons[0].id).toBe(testLesson.id);
        expect(relinkableLessons[0].title).toBe('Test Lesson');
        expect(relinkableLessons[0].previousOrder).toBe(2);
        expect(relinkableLessons[0].previousTopicName).toBe('Topic 2');
      });

      it('should return empty array when no unlinked lessons exist', async () => {
        const relinkableLessons = await CourseLessonService.getRelinkableLessons(
          testCourse.id,
          testOrg.id
        );

        expect(relinkableLessons.length).toBe(0);
      });

      it('should return empty array when course framework does not exist', async () => {
        await db.delete(courseFrameworks).where(eq(courseFrameworks.courseId, testCourse.id));

        const relinkableLessons = await CourseLessonService.getRelinkableLessons(
          testCourse.id,
          testOrg.id
        );

        expect(relinkableLessons.length).toBe(0);
      });
    });

    describe('isLessonLinkedToCourse', () => {
      it('should return true when lesson is linked', async () => {
        const isLinked = await CourseLessonService.isLessonLinkedToCourse(
          testCourse.id,
          testLesson.id
        );
        expect(isLinked).toBe(true);
      });

      it('should return false when lesson is not linked', async () => {
        await CourseLessonService.unlinkLesson(testCourse.id, testLesson.id, testOrg.id);

        const isLinked = await CourseLessonService.isLessonLinkedToCourse(
          testCourse.id,
          testLesson.id
        );
        expect(isLinked).toBe(false);
      });
    });
  });

  describe('Complete Unlink-Relink Workflow', () => {

    it('should complete full unlink and relink cycle preserving all data', async () => {
      const originalQuizLinks = await db.query.lessonQuizLinks.findMany({
        where: eq(lessonQuizLinks.lessonId, testLesson.id),
      });
      const originalScopeAssignments = await db.query.lessonScopeAssignments.findMany({
        where: eq(lessonScopeAssignments.lessonId, testLesson.id),
      });

      expect(originalQuizLinks.length).toBe(2);
      expect(originalScopeAssignments.length).toBe(1);

      const unlinkResult = await CourseLessonService.unlinkLesson(
        testCourse.id,
        testLesson.id,
        testOrg.id
      );
      expect(unlinkResult.success).toBe(true);
      expect(unlinkResult.quizLinksArchived).toBe(2);
      expect(unlinkResult.scopeAssignmentsArchived).toBe(1);

      const midQuizLinks = await db.query.lessonQuizLinks.findMany({
        where: eq(lessonQuizLinks.lessonId, testLesson.id),
      });
      const midScopeAssignments = await db.query.lessonScopeAssignments.findMany({
        where: eq(lessonScopeAssignments.lessonId, testLesson.id),
      });
      expect(midQuizLinks.length).toBe(0);
      expect(midScopeAssignments.length).toBe(0);

      const relinkResult = await CourseLessonService.relinkLesson(
        testCourse.id,
        testLesson.id,
        testOrg.id
      );
      expect(relinkResult.success).toBe(true);
      expect(relinkResult.quizLinksRestored).toBe(2);
      expect(relinkResult.scopeAssignmentsRestored).toBe(1);

      const finalQuizLinks = await db.query.lessonQuizLinks.findMany({
        where: eq(lessonQuizLinks.lessonId, testLesson.id),
      });
      const finalScopeAssignments = await db.query.lessonScopeAssignments.findMany({
        where: eq(lessonScopeAssignments.lessonId, testLesson.id),
      });

      expect(finalQuizLinks.length).toBe(2);
      expect(finalScopeAssignments.length).toBe(1);

      const primaryQuizRestored = finalQuizLinks.find((l: any) => l.quizId === testQuiz1.id);
      expect(primaryQuizRestored?.isPrimary).toBe(true);
    });

    it('should handle multiple unlink-relink cycles', async () => {
      for (let cycle = 1; cycle <= 3; cycle++) {
        const unlinkResult = await CourseLessonService.unlinkLesson(
          testCourse.id,
          testLesson.id,
          testOrg.id
        );
        expect(unlinkResult.success).toBe(true);

        const relinkResult = await CourseLessonService.relinkLesson(
          testCourse.id,
          testLesson.id,
          testOrg.id
        );
        expect(relinkResult.success).toBe(true);

        const isLinked = await CourseLessonService.isLessonLinkedToCourse(
          testCourse.id,
          testLesson.id
        );
        expect(isLinked).toBe(true);
      }

      const quizLinks = await db.query.lessonQuizLinks.findMany({
        where: eq(lessonQuizLinks.lessonId, testLesson.id),
      });
      expect(quizLinks.length).toBe(2);
    });
  });

  describe('Edge Cases', () => {

    it('should handle unlink when lesson has no quiz links', async () => {
      await db.delete(lessonQuizLinks).where(eq(lessonQuizLinks.lessonId, testLesson.id));

      const result = await CourseLessonService.unlinkLesson(
        testCourse.id,
        testLesson.id,
        testOrg.id
      );

      expect(result.success).toBe(true);
      expect(result.quizLinksArchived).toBe(0);
      expect(result.scopeAssignmentsArchived).toBe(1);
    });

    it('should handle unlink when lesson has no scope assignments', async () => {
      await db.delete(lessonScopeAssignments).where(eq(lessonScopeAssignments.lessonId, testLesson.id));

      const result = await CourseLessonService.unlinkLesson(
        testCourse.id,
        testLesson.id,
        testOrg.id
      );

      expect(result.success).toBe(true);
      expect(result.quizLinksArchived).toBe(2);
      expect(result.scopeAssignmentsArchived).toBe(0);
    });

    it('should handle relink when original topic slot is taken by another lesson', async () => {
      await CourseLessonService.unlinkLesson(testCourse.id, testLesson.id, testOrg.id);

      const [newLesson] = await db.insert(lessons).values({
        organizationId: testOrg.id,
        createdBy: testUser.id,
        title: 'New Lesson Taking Slot',
        generationStatus: 'completed',
      }).returning();

      await db.update(courseFrameworks)
        .set({
          topics: [
            { id: 'topic-1', order: 1, name: 'Overview', lessonType: 'overview', lessonId: null },
            { id: 'topic-2', order: 2, name: 'Topic 2', lessonType: 'content', lessonId: newLesson.id, previousLessonId: testLesson.id },
            { id: 'topic-3', order: 3, name: 'Key Takeaways', lessonType: 'key_takeaways', lessonId: null },
          ],
        })
        .where(eq(courseFrameworks.courseId, testCourse.id));

      await db.insert(courseLessons).values({
        courseId: testCourse.id,
        lessonId: newLesson.id,
        topicName: 'Topic 2',
        topicOrder: 2,
      });

      const result = await CourseLessonService.relinkLesson(
        testCourse.id,
        testLesson.id,
        testOrg.id,
        1
      );

      expect(result.success).toBe(true);
      expect(result.restoredOrder).toBe(1);

      await db.delete(courseLessons).where(eq(courseLessons.lessonId, newLesson.id));
      await db.delete(lessons).where(eq(lessons.id, newLesson.id));
    });

    it('should preserve lesson content through unlink-relink', async () => {
      const originalLesson = await db.query.lessons.findFirst({
        where: eq(lessons.id, testLesson.id),
      });

      await CourseLessonService.unlinkLesson(testCourse.id, testLesson.id, testOrg.id);

      const unlinkedLesson = await db.query.lessons.findFirst({
        where: eq(lessons.id, testLesson.id),
      });
      expect(unlinkedLesson).toBeDefined();
      expect(unlinkedLesson?.title).toBe(originalLesson?.title);
      expect(unlinkedLesson?.description).toBe(originalLesson?.description);

      await CourseLessonService.relinkLesson(testCourse.id, testLesson.id, testOrg.id);

      const relinkedLesson = await db.query.lessons.findFirst({
        where: eq(lessons.id, testLesson.id),
      });
      expect(relinkedLesson?.title).toBe(originalLesson?.title);
      expect(relinkedLesson?.description).toBe(originalLesson?.description);
    });

    it('should correctly handle framework without matching topic for lesson order', async () => {
      await db.update(courseFrameworks)
        .set({
          topics: [
            { id: 'topic-1', order: 10, name: 'Topic 10', lessonType: 'content', lessonId: testLesson.id },
            { id: 'topic-2', order: 20, name: 'Topic 20', lessonType: 'content', lessonId: null },
          ],
        })
        .where(eq(courseFrameworks.courseId, testCourse.id));

      await db.update(courseLessons)
        .set({ topicOrder: 10, topicName: 'Topic 10' })
        .where(and(
          eq(courseLessons.courseId, testCourse.id),
          eq(courseLessons.lessonId, testLesson.id)
        ));

      const result = await CourseLessonService.unlinkLesson(
        testCourse.id,
        testLesson.id,
        testOrg.id
      );

      expect(result.success).toBe(true);
      expect(result.previousOrder).toBe(10);
      expect(result.previousTopicName).toBe('Topic 10');
    });
  });
});
