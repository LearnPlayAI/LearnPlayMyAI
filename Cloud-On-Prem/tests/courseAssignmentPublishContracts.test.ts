import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('Course assignment publish contracts', () => {
  it('republishes normal availability assignments even when the course is already active', () => {
    const routes = readSource('server/routes/courseRoutes.ts');

    expect(routes).toContain('let shouldRepublishAfterAssignment = autoPublish;');
    expect(routes).toContain('shouldRepublishAfterAssignment = false;');
    expect(routes).toContain('if (shouldRepublishAfterAssignment) {');
    expect(routes).toContain('CourseService.publishCourse(courseId, organizationId, { skipAssignmentCheck: true })');
  });

  it('republishes cross-org availability assignments before partner assignment is created', () => {
    const routes = readSource('server/routes/courseRoutes.ts');
    const publishIndex = routes.indexOf('CourseService.publishCourse(courseId, course.organizationId, { skipAssignmentCheck: true })');
    const assignmentIndex = routes.indexOf('CourseAssignmentService.upsertCourseAssignment(parseResult.data)');

    expect(publishIndex).toBeGreaterThan(-1);
    expect(assignmentIndex).toBeGreaterThan(-1);
    expect(publishIndex).toBeLessThan(assignmentIndex);
  });

  it('publishing a course also publishes the currently linked lessons', () => {
    const service = readSource('server/services/courseService.ts');

    expect(service).toContain('const linkedLessons = await db');
    expect(service).toContain('eq(courseLessons.courseId, courseId)');
    expect(service).toContain('set({ isPublished: true');
    expect(service).toContain('where(inArray(lessons.id, lessonIds))');
  });

  it('syncs learner-facing lesson order from the builder framework before publishing and viewing', () => {
    const service = readSource('server/services/courseService.ts');
    const routes = readSource('server/routes/courseRoutes.ts');

    expect(service).toContain('syncCourseLessonOrderFromFramework(courseId');
    expect(service).toContain('patch.topicOrder = topicOrder');
    expect(service).toContain('await this.syncCourseLessonOrderFromFramework(courseId);');
    expect(service).toContain('await this.syncCourseLessonOrderFromFramework(effectiveCourseId);');
    expect(routes).toContain('await CourseService.syncCourseLessonOrderFromFramework(courseId);');
  });
});
