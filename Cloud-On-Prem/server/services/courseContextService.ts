import { db } from "../db";
import { lessons, courseLessons, courses, courseFrameworks } from "@shared/schema";
import { eq, and, ne, asc } from "drizzle-orm";

export interface LessonSummary {
  lessonId: string;
  title: string;
  description: string | null;
  contentExcerpt: string;
  topicOrder: number;
  isOverview: boolean;
}

export interface CourseContextForOverview {
  courseId: string;
  courseTitle: string;
  courseDescription: string | null;
  targetAudience?: string | null;
  otherLessonsSummaries: LessonSummary[];
}

const CONTENT_EXCERPT_LENGTH = 400;

function truncateContent(content: string | null, maxLength: number = CONTENT_EXCERPT_LENGTH): string {
  if (!content) return '';
  const trimmed = content.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.substring(0, maxLength).replace(/\s+\S*$/, '') + '...';
}

export class CourseContextService {
  
  static async buildCourseLessonSummaries(
    courseId: string,
    excludeLessonId?: string
  ): Promise<CourseContextForOverview | null> {
    try {
      const course = await db.query.courses.findFirst({
        where: eq(courses.id, courseId),
      });

      if (!course) {
        console.log(`[CourseContext] Course not found: ${courseId}`);
        return null;
      }

      const courseLinks = await db
        .select({
          lessonId: courseLessons.lessonId,
          topicOrder: courseLessons.topicOrder,
          topicName: courseLessons.topicName,
        })
        .from(courseLessons)
        .where(eq(courseLessons.courseId, courseId))
        .orderBy(asc(courseLessons.topicOrder));

      if (courseLinks.length === 0) {
        console.log(`[CourseContext] No lessons linked to course: ${courseId}`);
        return {
          courseId,
          courseTitle: course.title,
          courseDescription: course.description,
          otherLessonsSummaries: [],
        };
      }

      const lessonIds = courseLinks
        .map(link => link.lessonId)
        .filter((id): id is string => id !== null);

      if (lessonIds.length === 0) {
        return {
          courseId,
          courseTitle: course.title,
          courseDescription: course.description,
          otherLessonsSummaries: [],
        };
      }

      const lessonRecords = await db.query.lessons.findMany({
        where: (lessons, { inArray }) => inArray(lessons.id, lessonIds),
      });

      const lessonMap = new Map(lessonRecords.map(l => [l.id, l]));

      const summaries: LessonSummary[] = [];
      
      for (const link of courseLinks) {
        if (!link.lessonId) continue;
        if (excludeLessonId && link.lessonId === excludeLessonId) continue;
        
        const lesson = lessonMap.get(link.lessonId);
        if (!lesson) continue;

        const isOverview = link.topicOrder === 0;
        
        const contentExcerpt = truncateContent(lesson.inputText);

        summaries.push({
          lessonId: lesson.id,
          title: lesson.title,
          description: lesson.description,
          contentExcerpt,
          topicOrder: link.topicOrder ?? 0,
          isOverview,
        });
      }

      console.log(`[CourseContext] Built summaries for ${summaries.length} lessons in course ${courseId}`);

      return {
        courseId,
        courseTitle: course.title,
        courseDescription: course.description,
        otherLessonsSummaries: summaries,
      };
    } catch (error) {
      console.error('[CourseContext] Error building lesson summaries:', error);
      return null;
    }
  }

  static async isOverviewLesson(lessonId: string, courseId?: string): Promise<boolean> {
    try {
      const link = await db.query.courseLessons.findFirst({
        where: courseId 
          ? and(
              eq(courseLessons.lessonId, lessonId),
              eq(courseLessons.courseId, courseId)
            )
          : eq(courseLessons.lessonId, lessonId),
      });

      if (!link) {
        return false;
      }

      return link.topicOrder === 0;
    } catch (error) {
      console.error('[CourseContext] Error checking overview status:', error);
      return false;
    }
  }

  static async getCourseIdForLesson(lessonId: string): Promise<string | null> {
    try {
      const link = await db.query.courseLessons.findFirst({
        where: eq(courseLessons.lessonId, lessonId),
      });

      return link?.courseId || null;
    } catch (error) {
      console.error('[CourseContext] Error getting course for lesson:', error);
      return null;
    }
  }

  static formatSummariesForPrompt(summaries: LessonSummary[]): string {
    if (summaries.length === 0) {
      return 'No other lessons in this course yet.';
    }

    const lines: string[] = ['## Other Lessons in This Course\n'];
    
    const sortedSummaries = [...summaries].sort((a, b) => a.topicOrder - b.topicOrder);
    
    for (const summary of sortedSummaries) {
      const lessonLabel = summary.isOverview ? '(Overview)' : `Lesson ${summary.topicOrder}`;
      lines.push(`### ${lessonLabel}: ${summary.title}`);
      
      if (summary.description) {
        lines.push(`Summary: ${summary.description}`);
      }
      
      if (summary.contentExcerpt) {
        lines.push(`Content Preview: ${summary.contentExcerpt}`);
      }
      
      lines.push('');
    }

    return lines.join('\n');
  }

  static formatSummariesForGamma(summaries: LessonSummary[]): string {
    if (summaries.length === 0) {
      return '';
    }

    const lines: string[] = ['## Course Outline\n'];
    lines.push('This course covers the following topics:\n');
    
    const sortedSummaries = [...summaries].sort((a, b) => a.topicOrder - b.topicOrder);
    
    for (const summary of sortedSummaries) {
      const lessonNum = summary.topicOrder;
      lines.push(`${lessonNum}. **${summary.title}**`);
      
      if (summary.description) {
        lines.push(`   ${truncateContent(summary.description, 200)}`);
      }
    }

    lines.push('');
    return lines.join('\n');
  }

  /**
   * Check if a lesson is a Key Takeaways lesson
   * Detection criteria:
   * 1. Topic name contains "Key Takeaways" (case insensitive)
   * 2. OR it's the last lesson by topicOrder in the course
   */
  static async isKeyTakeawaysLesson(lessonId: string, courseId?: string): Promise<boolean> {
    try {
      const resolvedCourseId = courseId || await this.getCourseIdForLesson(lessonId);
      if (!resolvedCourseId) {
        return false;
      }

      const link = await db.query.courseLessons.findFirst({
        where: and(
          eq(courseLessons.lessonId, lessonId),
          eq(courseLessons.courseId, resolvedCourseId)
        ),
      });

      if (!link) {
        return false;
      }

      // Check if topic name contains "Key Takeaways" (case insensitive)
      if (link.topicName && link.topicName.toLowerCase().includes('key takeaways')) {
        return true;
      }

      // Check if it's the last lesson by topicOrder
      const allLinks = await db
        .select({ topicOrder: courseLessons.topicOrder })
        .from(courseLessons)
        .where(eq(courseLessons.courseId, resolvedCourseId))
        .orderBy(asc(courseLessons.topicOrder));

      if (allLinks.length === 0) {
        return false;
      }

      const maxTopicOrder = Math.max(...allLinks.map(l => l.topicOrder ?? 0));
      return (link.topicOrder ?? 0) === maxTopicOrder && maxTopicOrder > 0;
    } catch (error) {
      console.error('[CourseContext] Error checking Key Takeaways status:', error);
      return false;
    }
  }

  /**
   * Build full content context for Key Takeaways lessons (zero-hallucination grounding)
   * Returns full lesson content (not excerpts) with size limits to prevent token overflow
   */
  static async buildFullContentForKeyTakeaways(
    courseId: string,
    excludeLessonId: string,
    maxTotalChars: number = 50000
  ): Promise<{ courseTitle: string; courseDescription: string | null; fullLessonContents: Array<{ title: string; content: string; topicOrder: number }> } | null> {
    try {
      const course = await db.query.courses.findFirst({
        where: eq(courses.id, courseId),
      });

      if (!course) {
        console.log(`[CourseContext] Course not found for Key Takeaways: ${courseId}`);
        return null;
      }

      const courseLinks = await db
        .select({
          lessonId: courseLessons.lessonId,
          topicOrder: courseLessons.topicOrder,
          topicName: courseLessons.topicName,
        })
        .from(courseLessons)
        .where(eq(courseLessons.courseId, courseId))
        .orderBy(asc(courseLessons.topicOrder));

      const lessonIds = courseLinks
        .filter(link => link.lessonId && link.lessonId !== excludeLessonId)
        .map(link => link.lessonId as string);

      if (lessonIds.length === 0) {
        return {
          courseTitle: course.title,
          courseDescription: course.description,
          fullLessonContents: [],
        };
      }

      const lessonRecords = await db.query.lessons.findMany({
        where: (lessons, { inArray }) => inArray(lessons.id, lessonIds),
      });

      const lessonMap = new Map(lessonRecords.map(l => [l.id, l]));

      const fullContents: Array<{ title: string; content: string; topicOrder: number }> = [];
      let totalChars = 0;

      // Sort by topicOrder and collect full content
      const sortedLinks = courseLinks
        .filter(link => link.lessonId && link.lessonId !== excludeLessonId)
        .sort((a, b) => (a.topicOrder ?? 0) - (b.topicOrder ?? 0));

      for (const link of sortedLinks) {
        if (!link.lessonId) continue;
        
        const lesson = lessonMap.get(link.lessonId);
        if (!lesson || !lesson.inputText) continue;

        const content = lesson.inputText.trim();
        
        // Check if adding this lesson would exceed the limit
        if (totalChars + content.length > maxTotalChars) {
          // Truncate this lesson to fit
          const remaining = maxTotalChars - totalChars;
          if (remaining > 500) {
            fullContents.push({
              title: lesson.title,
              content: content.substring(0, remaining) + '... [truncated for length]',
              topicOrder: link.topicOrder ?? 0,
            });
          }
          console.log(`[CourseContext] Reached char limit (${maxTotalChars}) for Key Takeaways context`);
          break;
        }

        fullContents.push({
          title: lesson.title,
          content,
          topicOrder: link.topicOrder ?? 0,
        });
        totalChars += content.length;
      }

      console.log(`[CourseContext] Built full content for ${fullContents.length} lessons (${totalChars} chars) for Key Takeaways grounding`);

      return {
        courseTitle: course.title,
        courseDescription: course.description,
        fullLessonContents: fullContents,
      };
    } catch (error) {
      console.error('[CourseContext] Error building full content for Key Takeaways:', error);
      return null;
    }
  }

  /**
   * Format full lesson contents for zero-hallucination Key Takeaways prompt
   */
  static formatFullContentForKeyTakeaways(
    contents: Array<{ title: string; content: string; topicOrder: number }>
  ): string {
    if (contents.length === 0) {
      return 'No other lessons in this course.';
    }

    const lines: string[] = [];
    
    for (const lesson of contents) {
      lines.push(`━━━ LESSON ${lesson.topicOrder}: ${lesson.title} ━━━`);
      lines.push(lesson.content);
      lines.push('');
    }

    return lines.join('\n');
  }
}

export const courseContextService = new CourseContextService();
