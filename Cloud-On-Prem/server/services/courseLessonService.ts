import { db } from '../db';
import {
  courseLessons,
  courseFrameworks,
  lessons,
  courses,
  lessonQuizLinks,
  lessonScopeAssignments,
  quizCollections,
  type CourseLesson,
} from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';

interface ArchivedQuizLink {
  quizId: string;
  isPrimary: boolean;
}

interface ArchivedScopeAssignment {
  organizationId: string;
  unitId: string | null;
  subjectId: string | null;
  audience: string;
  assignedBy: string;
  dueDate: string | null;
}

interface UnlinkResult {
  success: boolean;
  lessonId: string;
  courseId: string;
  previousOrder: number;
  previousTopicName: string;
  quizLinksArchived: number;
  scopeAssignmentsArchived: number;
}

interface RelinkResult {
  success: boolean;
  lessonId: string;
  courseId: string;
  restoredOrder: number;
  quizLinksRestored: number;
  scopeAssignmentsRestored: number;
}

interface UnlinkedLesson {
  id: string;
  title: string;
  description: string | null;
  previousOrder: number;
  previousTopicName: string;
  unlinkedAt: Date;
  generationStatus: string;
}

export class CourseLessonService {
  /**
   * Unlink a lesson from a course without deleting the lesson
   * 
   * This is a transactional operation that:
   * 1. Stores previousOrder for future relink restoration
   * 2. Deletes the courseLessons entry
   * 3. Updates the course framework to remove the lessonId
   * 4. Archives quiz links in topic metadata for later restoration
   * 5. Archives scope assignments in topic metadata for later restoration
   * 6. Does NOT delete the lesson itself
   */
  static async unlinkLesson(
    courseId: string,
    lessonId: string,
    organizationId: string
  ): Promise<UnlinkResult> {
    console.log(`[CourseLessonService] Starting unlink: lesson ${lessonId} from course ${courseId}`);

    // Verify the course belongs to the organization (pre-transaction check)
    const course = await db.query.courses.findFirst({
      where: and(
        eq(courses.id, courseId),
        eq(courses.organizationId, organizationId)
      ),
    });

    if (!course) {
      throw new Error('Course not found or unauthorized');
    }

    // Find the existing course-lesson link (pre-transaction check)
    let existingLink = await db.query.courseLessons.findFirst({
      where: and(
        eq(courseLessons.courseId, courseId),
        eq(courseLessons.lessonId, lessonId)
      ),
    });

    if (!existingLink) {
      const framework = await db.query.courseFrameworks.findFirst({
        where: eq(courseFrameworks.courseId, courseId),
      });
      const topics = framework && Array.isArray(framework.topics) ? [...(framework.topics as any[])] : [];
      const matchingTopic = topics.find((topic: any) => String(topic?.lessonId || '') === lessonId);
      if (matchingTopic) {
        const topicType = String(matchingTopic?.lessonType || '').toLowerCase();
        const lessonType: 'overview' | 'content' | 'key_takeaways' =
          topicType === 'overview' || matchingTopic?.isOverview === true
            ? 'overview'
            : topicType === 'key_takeaways'
              ? 'key_takeaways'
              : 'content';
        const [repairedLink] = await db.insert(courseLessons).values({
          courseId,
          lessonId,
          topicId: matchingTopic.id || null,
          topicName: matchingTopic.name || '',
          topicOrder: Number(matchingTopic.order || 0),
          lessonType,
        }).returning();
        existingLink = repairedLink;
        console.log(`[CourseLessonService] Repaired missing courseLessons link for lesson ${lessonId} before unlink`);
      }
    }

    if (!existingLink) {
      throw new Error('Lesson is not linked to this course');
    }

    const previousOrder = existingLink.topicOrder;
    const previousTopicName = existingLink.topicName;

    // Execute all operations in a single transaction
    const result = await db.transaction(async (tx) => {
      // Step 1: Get quiz links to archive (store in metadata, not delete)
      const quizLinks = await tx
        .select({
          quizId: lessonQuizLinks.quizId,
          isPrimary: lessonQuizLinks.isPrimary,
        })
        .from(lessonQuizLinks)
        .where(eq(lessonQuizLinks.lessonId, lessonId));

      const archivedQuizLinks: ArchivedQuizLink[] = quizLinks.map(link => ({
        quizId: link.quizId,
        isPrimary: link.isPrimary || false,
      }));

      // Step 2: Get scope assignments to archive (store in metadata)
      const scopeAssignments = await tx
        .select({
          organizationId: lessonScopeAssignments.organizationId,
          unitId: lessonScopeAssignments.unitId,
          subjectId: lessonScopeAssignments.subjectId,
          audience: lessonScopeAssignments.audience,
          assignedBy: lessonScopeAssignments.assignedBy,
          dueDate: lessonScopeAssignments.dueDate,
        })
        .from(lessonScopeAssignments)
        .where(eq(lessonScopeAssignments.lessonId, lessonId));

      const archivedScopeAssignments: ArchivedScopeAssignment[] = scopeAssignments.map(assignment => ({
        organizationId: assignment.organizationId,
        unitId: assignment.unitId,
        subjectId: assignment.subjectId,
        audience: assignment.audience,
        assignedBy: assignment.assignedBy,
        dueDate: assignment.dueDate ? assignment.dueDate.toISOString() : null,
      }));

      // Step 3: Update course framework to remove lessonId and store archive data
      const framework = await tx.query.courseFrameworks.findFirst({
        where: eq(courseFrameworks.courseId, courseId),
      });

      if (framework) {
        const topics = (framework.topics as any[]) || [];
        const topicIndex = topics.findIndex((t: any) => t.order === previousOrder);
        
        if (topicIndex !== -1) {
          // Store all recovery data in the topic metadata
          topics[topicIndex].previousLessonId = lessonId;
          topics[topicIndex].previousTopicOrder = previousOrder;
          topics[topicIndex].previousTopicName = previousTopicName;
          topics[topicIndex].lessonId = null;
          topics[topicIndex].isHidden = true; // Hide deleted lessons from main course view
          topics[topicIndex].unlinkedAt = new Date().toISOString();
          topics[topicIndex].archivedQuizLinks = archivedQuizLinks;
          topics[topicIndex].archivedScopeAssignments = archivedScopeAssignments;
          
          await tx.update(courseFrameworks)
            .set({ topics: topics as any, updatedAt: new Date() })
            .where(eq(courseFrameworks.id, framework.id));
          
          console.log(`[CourseLessonService] Updated framework topic ${previousOrder} - archived ${archivedQuizLinks.length} quiz links and ${archivedScopeAssignments.length} scope assignments`);
        }
      }

      // Step 4: Delete the courseLessons entry
      await tx.delete(courseLessons)
        .where(and(
          eq(courseLessons.courseId, courseId),
          eq(courseLessons.lessonId, lessonId)
        ));

      console.log(`[CourseLessonService] Deleted courseLessons entry for lesson ${lessonId}`);

      // Step 5: Delete quiz links from the database (they are archived in topic metadata for restoration)
      if (archivedQuizLinks.length > 0) {
        await tx.delete(lessonQuizLinks)
          .where(eq(lessonQuizLinks.lessonId, lessonId));
        console.log(`[CourseLessonService] Deleted ${archivedQuizLinks.length} quiz links from database (archived in metadata)`);
      }

      // Step 6: Delete scope assignments from the database (they are archived in topic metadata for restoration)
      if (archivedScopeAssignments.length > 0) {
        await tx.delete(lessonScopeAssignments)
          .where(eq(lessonScopeAssignments.lessonId, lessonId));
        console.log(`[CourseLessonService] Deleted ${archivedScopeAssignments.length} scope assignments from database (archived in metadata)`);
      }

      // Step 7: Update lesson's availability status to 'unlinked' in metadata
      const lesson = await tx.query.lessons.findFirst({
        where: eq(lessons.id, lessonId),
      });
      
      if (lesson) {
        const currentMetadata = (lesson.metadata as Record<string, any>) || {};
        const updatedMetadata = {
          ...currentMetadata,
          availabilityStatus: 'unlinked',
          unlinkedFromCourseId: courseId,
          unlinkedAt: new Date().toISOString(),
        };
        
        await tx.update(lessons)
          .set({ metadata: updatedMetadata, updatedAt: new Date() })
          .where(eq(lessons.id, lessonId));
        
        console.log(`[CourseLessonService] Updated lesson ${lessonId} availability status to 'unlinked'`);
      }

      return {
        quizLinksArchived: archivedQuizLinks.length,
        scopeAssignmentsArchived: archivedScopeAssignments.length,
      };
    });

    console.log(`[CourseLessonService] Successfully unlinked lesson ${lessonId} from course ${courseId}`);

    return {
      success: true,
      lessonId,
      courseId,
      previousOrder,
      previousTopicName,
      quizLinksArchived: result.quizLinksArchived,
      scopeAssignmentsArchived: result.scopeAssignmentsArchived,
    };
  }

  /**
   * Relink a previously unlinked lesson back to a course
   * 
   * This is a transactional operation that:
   * 1. Finds the topic that previously had this lesson
   * 2. Creates a new courseLessons entry
   * 3. Updates the course framework to restore the lessonId
   * 4. Restores quiz links from archived metadata
   * 5. Restores scope assignments from archived metadata
   * 6. Clears archived data from topic metadata
   */
  static async relinkLesson(
    courseId: string,
    lessonId: string,
    organizationId: string,
    orderOverride?: number
  ): Promise<RelinkResult> {
    console.log(`[CourseLessonService] Starting relink: lesson ${lessonId} to course ${courseId}`);

    // Verify the course belongs to the organization (pre-transaction check)
    const course = await db.query.courses.findFirst({
      where: and(
        eq(courses.id, courseId),
        eq(courses.organizationId, organizationId)
      ),
    });

    if (!course) {
      throw new Error('Course not found or unauthorized');
    }

    // Verify the lesson exists and belongs to the same organization
    const lesson = await db.query.lessons.findFirst({
      where: and(
        eq(lessons.id, lessonId),
        eq(lessons.organizationId, organizationId)
      ),
    });

    if (!lesson) {
      throw new Error('Lesson not found or unauthorized');
    }

    // Check if already linked
    const existingLink = await db.query.courseLessons.findFirst({
      where: and(
        eq(courseLessons.courseId, courseId),
        eq(courseLessons.lessonId, lessonId)
      ),
    });

    if (existingLink) {
      throw new Error('Lesson is already linked to this course');
    }

    // Get framework to find previous order or determine new order
    const framework = await db.query.courseFrameworks.findFirst({
      where: eq(courseFrameworks.courseId, courseId),
    });

    if (!framework) {
      throw new Error('Course framework not found');
    }

    const topics = (framework.topics as any[]) || [];
    
    let targetTopicIndex: number;
    let restoredOrder: number;
    let topicName: string;
    let archivedQuizLinks: ArchivedQuizLink[] = [];
    let archivedScopeAssignments: ArchivedScopeAssignment[] = [];
    let originalTopicIndex: number = -1; // Track original topic for clearing metadata when using orderOverride

    // Check orderOverride first (explicit user choice takes precedence)
    if (orderOverride !== undefined) {
      // Use override order if provided
      targetTopicIndex = topics.findIndex((t: any) => t.order === orderOverride && !t.lessonId);
      if (targetTopicIndex === -1) {
        throw new Error(`No available topic at position ${orderOverride}`);
      }
      restoredOrder = orderOverride;
      topicName = topics[targetTopicIndex].name;
      
      // Also look for archived data from the original topic (where the lesson was unlinked from)
      originalTopicIndex = topics.findIndex((t: any) => t.previousLessonId === lessonId);
      if (originalTopicIndex !== -1) {
        const originalTopic = topics[originalTopicIndex];
        archivedQuizLinks = originalTopic.archivedQuizLinks || [];
        archivedScopeAssignments = originalTopic.archivedScopeAssignments || [];
      }
    } else {
      // Find topic that previously had this lesson
      targetTopicIndex = topics.findIndex((t: any) => t.previousLessonId === lessonId);
      
      if (targetTopicIndex !== -1) {
        // Found previous topic - use its order and get archived data
        const topic = topics[targetTopicIndex];
        restoredOrder = topic.previousTopicOrder ?? topic.order;
        topicName = topic.previousTopicName ?? topic.name;
        archivedQuizLinks = topic.archivedQuizLinks || [];
        archivedScopeAssignments = topic.archivedScopeAssignments || [];
      } else {
        // Find first topic without a lesson
        targetTopicIndex = topics.findIndex((t: any) => !t.lessonId);
        if (targetTopicIndex === -1) {
          throw new Error('No available topic slots in course framework');
        }
        restoredOrder = topics[targetTopicIndex].order;
        topicName = topics[targetTopicIndex].name;
      }
    }

    // Execute all operations in a single transaction
    const result = await db.transaction(async (tx) => {
      // Step 1: Create courseLessons entry
      await tx.insert(courseLessons).values({
        courseId,
        lessonId,
        topicId: topics[targetTopicIndex].id || null,
        topicName,
        topicOrder: restoredOrder,
        lessonType: 'content',
      });

      console.log(`[CourseLessonService] Created courseLessons entry for lesson ${lessonId}`);

      // Step 2: Update framework topic - restore lessonId and clear archived data
      topics[targetTopicIndex].lessonId = lessonId;
      topics[targetTopicIndex].lessonType = 'content';
      topics[targetTopicIndex].isOverview = false;
      topics[targetTopicIndex].previousLessonId = null;
      topics[targetTopicIndex].previousTopicOrder = null;
      topics[targetTopicIndex].previousTopicName = null;
      topics[targetTopicIndex].isHidden = false; // Unhide restored lesson
      topics[targetTopicIndex].unlinkedAt = null;
      topics[targetTopicIndex].archivedQuizLinks = null;
      topics[targetTopicIndex].archivedScopeAssignments = null;

      // If using orderOverride, also clear the original topic's previousLessonId metadata
      if (originalTopicIndex !== -1 && originalTopicIndex !== targetTopicIndex) {
        topics[originalTopicIndex].previousLessonId = null;
        topics[originalTopicIndex].previousTopicOrder = null;
        topics[originalTopicIndex].previousTopicName = null;
        topics[originalTopicIndex].isHidden = false; // Unhide original topic slot
        topics[originalTopicIndex].unlinkedAt = null;
        topics[originalTopicIndex].archivedQuizLinks = null;
        topics[originalTopicIndex].archivedScopeAssignments = null;
        console.log(`[CourseLessonService] Cleared archived metadata from original topic ${originalTopicIndex}`);
      }

      await tx.update(courseFrameworks)
        .set({ topics: topics as any, updatedAt: new Date() })
        .where(eq(courseFrameworks.id, framework.id));

      console.log(`[CourseLessonService] Updated framework topic ${restoredOrder} with lessonId`);

      // Step 3: Restore quiz links from archived metadata
      let quizLinksRestored = 0;
      if (archivedQuizLinks.length > 0) {
        for (const quizLink of archivedQuizLinks) {
          // Verify quiz still exists before attempting to restore (prevents FK constraint transaction abort)
          const quizExists = await tx.query.quizCollections.findFirst({
            where: eq(quizCollections.id, quizLink.quizId),
            columns: { id: true },
          });
          
          if (!quizExists) {
            console.log(`[CourseLessonService] Skipping quiz link ${quizLink.quizId} - quiz no longer exists`);
            continue;
          }
          
          try {
            await tx.insert(lessonQuizLinks).values({
              lessonId,
              quizId: quizLink.quizId,
              isPrimary: quizLink.isPrimary,
            });
            quizLinksRestored++;
          } catch (error) {
            // Fallback catch for any other insert errors
            console.log(`[CourseLessonService] Could not restore quiz link ${quizLink.quizId}`);
          }
        }
        console.log(`[CourseLessonService] Restored ${quizLinksRestored}/${archivedQuizLinks.length} quiz links for lesson ${lessonId}`);
      }

      // Step 4: Restore scope assignments from archived metadata
      let scopeAssignmentsRestored = 0;
      if (archivedScopeAssignments.length > 0) {
        for (const scopeAssignment of archivedScopeAssignments) {
          try {
            await tx.insert(lessonScopeAssignments).values({
              lessonId,
              organizationId: scopeAssignment.organizationId,
              unitId: scopeAssignment.unitId,
              subjectId: scopeAssignment.subjectId,
              audience: scopeAssignment.audience as 'learner' | 'instructor',
              assignedBy: scopeAssignment.assignedBy,
              dueDate: scopeAssignment.dueDate ? new Date(scopeAssignment.dueDate) : null,
            });
            scopeAssignmentsRestored++;
          } catch (error) {
            // Scope assignment may conflict or referenced entities deleted - skip silently
            console.log(`[CourseLessonService] Could not restore scope assignment - entity may have been deleted or conflict exists`);
          }
        }
        console.log(`[CourseLessonService] Restored ${scopeAssignmentsRestored}/${archivedScopeAssignments.length} scope assignments for lesson ${lessonId}`);
      }

      // Step 5: Reset lesson's availability status to 'active' in metadata
      const lesson = await tx.query.lessons.findFirst({
        where: eq(lessons.id, lessonId),
      });
      
      if (lesson) {
        const currentMetadata = (lesson.metadata as Record<string, any>) || {};
        // Remove unlink-related fields and set status to active
        const { unlinkedFromCourseId, unlinkedAt, ...restMetadata } = currentMetadata;
        const updatedMetadata = {
          ...restMetadata,
          availabilityStatus: 'active',
          relinkedToCourseId: courseId,
          relinkedAt: new Date().toISOString(),
        };
        
        await tx.update(lessons)
          .set({ metadata: updatedMetadata, updatedAt: new Date() })
          .where(eq(lessons.id, lessonId));
        
        console.log(`[CourseLessonService] Reset lesson ${lessonId} availability status to 'active'`);
      }

      return {
        quizLinksRestored,
        scopeAssignmentsRestored,
      };
    });

    console.log(`[CourseLessonService] Successfully relinked lesson ${lessonId} to course ${courseId}`);

    return {
      success: true,
      lessonId,
      courseId,
      restoredOrder,
      quizLinksRestored: result.quizLinksRestored,
      scopeAssignmentsRestored: result.scopeAssignmentsRestored,
    };
  }

  /**
   * Get lessons that can be relinked to a course
   * These are lessons that were previously linked and then unlinked
   */
  static async getRelinkableLessons(
    courseId: string,
    organizationId: string
  ): Promise<UnlinkedLesson[]> {
    // Get the course framework
    const framework = await db.query.courseFrameworks.findFirst({
      where: eq(courseFrameworks.courseId, courseId),
    });

    if (!framework) {
      return [];
    }

    const topics = (framework.topics as any[]) || [];
    
    // Find topics with previousLessonId (unlinked lessons)
    const unlinkedTopics = topics.filter((t: any) => t.previousLessonId && !t.lessonId);
    
    if (unlinkedTopics.length === 0) {
      return [];
    }

    // Fetch lesson details for each unlinked lesson
    const lessonIds = unlinkedTopics.map((t: any) => t.previousLessonId);
    const lessonsData = await db.query.lessons.findMany({
      where: and(
        eq(lessons.organizationId, organizationId),
        inArray(lessons.id, lessonIds)
      ),
    });

    // Create a map for quick lookup
    const lessonMap = new Map(lessonsData.map(l => [l.id, l]));

    // Build result with topic information
    return unlinkedTopics
      .map((topic: any) => {
        const lesson = lessonMap.get(topic.previousLessonId);
        if (!lesson) return null;

        return {
          id: lesson.id,
          title: lesson.title,
          description: lesson.description,
          previousOrder: topic.previousTopicOrder ?? topic.order,
          previousTopicName: topic.previousTopicName ?? topic.name,
          unlinkedAt: topic.unlinkedAt ? new Date(topic.unlinkedAt) : new Date(),
          generationStatus: lesson.generationStatus,
        };
      })
      .filter((l): l is UnlinkedLesson => l !== null);
  }

  /**
   * Get all lessons linked to a course
   */
  static async getCourseLessons(courseId: string): Promise<CourseLesson[]> {
    return db.query.courseLessons.findMany({
      where: eq(courseLessons.courseId, courseId),
      orderBy: [courseLessons.topicOrder],
    });
  }

  /**
   * Check if a lesson is linked to a specific course
   */
  static async isLessonLinkedToCourse(courseId: string, lessonId: string): Promise<boolean> {
    const link = await db.query.courseLessons.findFirst({
      where: and(
        eq(courseLessons.courseId, courseId),
        eq(courseLessons.lessonId, lessonId)
      ),
    });
    return !!link;
  }
}
