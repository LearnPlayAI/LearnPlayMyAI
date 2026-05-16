import { db } from '../db';
import { eq, and, or, isNull, sql } from 'drizzle-orm';
import {
  courses,
  organizations,
  organizationUnits,
  courseAssignments,
  courseLessons,
  lessonQuizLinks,
} from '@shared/schema';
import { isAnonymousPublicLessonAccessAllowed } from './publicCourseAccessPolicy';

function isShowcaseDepartmentName(name: string | null | undefined): boolean {
  return String(name || '').trim().toLowerCase() === 'showcase';
}

export class ShowcaseCourseService {
  /**
   * Check if a course is a "showcase" course.
   * A showcase course meets ALL of these criteria:
   * - visibility = 'public'
   * - belongs to an organization with isShowcaseOrg = true
   * - is assigned to a showcase department, or assigned org-wide inside a showcase org
   */
  static async isShowcaseCourse(courseId: string): Promise<boolean> {
    const result = await db
      .select({
        courseId: courses.id,
        visibility: courses.visibility,
        isShowcaseOrg: organizations.isShowcaseOrg,
        isShowcaseDepartment: organizationUnits.isShowcaseDepartment,
        departmentName: organizationUnits.name,
      })
      .from(courses)
      .innerJoin(organizations, eq(courses.organizationId, organizations.id))
      .innerJoin(courseAssignments, eq(courseAssignments.courseId, courses.id))
      .leftJoin(organizationUnits, eq(courseAssignments.unitId, organizationUnits.id))
      .where(
        and(
          eq(courses.id, courseId),
          eq(courses.visibility, 'public'),
          eq(organizations.isShowcaseOrg, true),
          or(
            eq(organizationUnits.isShowcaseDepartment, true),
            sql`LOWER(${organizationUnits.name}) = 'showcase'`,
            and(
              eq(courseAssignments.assignmentScope, 'organization'),
              isNull(courseAssignments.unitId),
              isNull(courseAssignments.subUnitId),
              isNull(courseAssignments.teamId),
              isNull(courseAssignments.userId)
            )
          )
        )
      )
      .limit(1);

    return result.some((row) => row.isShowcaseDepartment === true || isShowcaseDepartmentName(row.departmentName) || !row.departmentName);
  }

  /**
   * Check if a lesson is a "showcase" lesson.
   * A showcase lesson is linked to at least one showcase course.
   */
  static async isShowcaseLesson(lessonId: string): Promise<boolean> {
    const linkedCourses = await db
      .select({ courseId: courseLessons.courseId })
      .from(courseLessons)
      .where(eq(courseLessons.lessonId, lessonId));

    for (const { courseId } of linkedCourses) {
      const isShowcase = await this.isShowcaseCourse(courseId);
      if (isShowcase) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a quiz is a "showcase" quiz.
   * A showcase quiz is linked to at least one showcase lesson.
   */
  static async isShowcaseQuiz(quizId: string): Promise<boolean> {
    const linkedLessons = await db
      .select({ lessonId: lessonQuizLinks.lessonId })
      .from(lessonQuizLinks)
      .where(eq(lessonQuizLinks.quizId, quizId));

    for (const { lessonId } of linkedLessons) {
      const isShowcase = await this.isShowcaseLesson(lessonId);
      if (isShowcase) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get showcase course IDs for filtering in course queries.
   * Returns array of course IDs that are showcase courses.
   */
  static async getShowcaseCourseIds(): Promise<string[]> {
    const results = await db
      .selectDistinct({
        courseId: courses.id,
        isShowcaseDepartment: organizationUnits.isShowcaseDepartment,
        departmentName: organizationUnits.name,
      })
      .from(courses)
      .innerJoin(organizations, eq(courses.organizationId, organizations.id))
      .innerJoin(courseAssignments, eq(courseAssignments.courseId, courses.id))
      .leftJoin(organizationUnits, eq(courseAssignments.unitId, organizationUnits.id))
      .where(
        and(
          eq(courses.visibility, 'public'),
          eq(organizations.isShowcaseOrg, true),
          or(
            eq(organizationUnits.isShowcaseDepartment, true),
            sql`LOWER(${organizationUnits.name}) = 'showcase'`,
            and(
              eq(courseAssignments.assignmentScope, 'organization'),
              isNull(courseAssignments.unitId),
              isNull(courseAssignments.subUnitId),
              isNull(courseAssignments.teamId),
              isNull(courseAssignments.userId)
            )
          )
        )
      );

    return results
      .filter((row) => row.isShowcaseDepartment === true || isShowcaseDepartmentName(row.departmentName) || !row.departmentName)
      .map(r => r.courseId);
  }

  /**
   * Get course IDs that may be promoted to anonymous visitors.
   * Showcase courses are always included; active free public courses are included
   * so the homepage carousel can demonstrate the platform without a login.
   */
  static async getAnonymousPublicCourseIds(): Promise<string[]> {
    const publicCourses = await db
      .select({
        courseId: courses.id,
        visibility: courses.visibility,
        status: courses.status,
        price: courses.price,
      })
      .from(courses)
      .where(eq(courses.visibility, 'public'));

    const showcaseIds = new Set(await this.getShowcaseCourseIds());
    return publicCourses
      .filter((course) => isAnonymousPublicLessonAccessAllowed({
        isShowcaseCourse: showcaseIds.has(course.courseId),
        courseVisibility: course.visibility,
        courseStatus: course.status,
        coursePrice: course.price,
      }))
      .map((course) => course.courseId);
  }

  /**
   * Check whether an anonymous visitor can open this lesson through the public
   * viewer. This includes showcase lessons and lessons in active free public courses.
   */
  static async isAnonymousPublicLesson(lessonId: string): Promise<boolean> {
    return this.isOpenPublicLesson(lessonId);
  }

  /**
   * Check whether a learner can open this lesson through open public access.
   * This applies to anonymous visitors and authenticated users from other orgs.
   */
  static async isOpenPublicLesson(lessonId: string): Promise<boolean> {
    const linkedCourses = await db
      .select({
        courseId: courses.id,
        visibility: courses.visibility,
        status: courses.status,
        price: courses.price,
      })
      .from(courseLessons)
      .innerJoin(courses, eq(courseLessons.courseId, courses.id))
      .where(eq(courseLessons.lessonId, lessonId));

    for (const course of linkedCourses) {
      const isShowcaseCourse = await this.isShowcaseCourse(course.courseId);
      if (isAnonymousPublicLessonAccessAllowed({
        isShowcaseCourse,
        courseVisibility: course.visibility,
        courseStatus: course.status,
        coursePrice: course.price,
      })) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check whether an anonymous visitor can open a quiz linked to public content.
   */
  static async isAnonymousPublicQuiz(quizId: string): Promise<boolean> {
    const linkedLessons = await db
      .select({ lessonId: lessonQuizLinks.lessonId })
      .from(lessonQuizLinks)
      .where(eq(lessonQuizLinks.quizId, quizId));

    for (const { lessonId } of linkedLessons) {
      if (await this.isAnonymousPublicLesson(lessonId)) {
        return true;
      }
    }

    return false;
  }
}
