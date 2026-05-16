import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { buildReturnParams, getCourseReturnParams, resolveCourseBackTarget } from '../lib/courseBackNavigation';

describe('CourseBackLink helpers', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      location: {
        pathname: '/lessons/lesson-7',
        search: '',
      },
      history: {
        pushState: () => undefined,
      },
    };
  });

  afterEach(() => {
    delete (globalThis as any).window;
  });

  it('builds return params for course-scoped back navigation', () => {
    const result = buildReturnParams('course-123', 'Workplace Security');
    const params = new URLSearchParams(result);

    expect(params.get('returnTo')).toBe('/course-builder/course-123/lessons');
    expect(params.get('courseId')).toBe('course-123');
    expect(params.get('courseName')).toBe('Workplace Security');
  });

  it('reads the current viewer return params from the browser URL', () => {
    (globalThis as any).window.location.search = '?returnTo=%2Fcourse-builder%2Fcourse-123%2Flessons&courseId=course-123&courseName=Security%20Awareness&lessonId=lesson-7';

    expect(getCourseReturnParams((globalThis as any).window.location.search)).toEqual({
      returnTo: '/course-builder/course-123/lessons',
      courseId: 'course-123',
      courseName: 'Security Awareness',
      lessonId: 'lesson-7',
    });
  });

  it('resolves the back target from an explicit returnTo value', () => {
    expect(resolveCourseBackTarget('?returnTo=%2Fcourse-builder%2Fcourse-123%2Flessons&courseId=course-123&courseName=Security%20Awareness')).toEqual({
      returnTo: '/course-builder/course-123/lessons',
      courseId: 'course-123',
      courseName: 'Security Awareness',
      backUrl: '/course-builder/course-123/lessons',
    });
  });
});
