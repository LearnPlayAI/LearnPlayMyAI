import { describe, expect, it } from '@jest/globals';
import {
  isAnonymousPublicLessonAccessAllowed,
  isOpenPublicLessonAccessAllowed,
} from '../services/publicCourseAccessPolicy';

describe('public course access policy', () => {
  it('allows anonymous learners to open lessons from free active public courses', () => {
    expect(
      isAnonymousPublicLessonAccessAllowed({
        isShowcaseCourse: false,
        courseVisibility: 'public',
        courseStatus: 'active',
        coursePrice: '0.00',
      }),
    ).toBe(true);
  });

  it('allows anonymous showcase lessons even when the course has a non-zero price', () => {
    expect(
      isAnonymousPublicLessonAccessAllowed({
        isShowcaseCourse: true,
        courseVisibility: 'public',
        courseStatus: 'active',
        coursePrice: '150.00',
      }),
    ).toBe(true);
  });

  it('blocks anonymous lessons from paid non-showcase public courses', () => {
    expect(
      isAnonymousPublicLessonAccessAllowed({
        isShowcaseCourse: false,
        courseVisibility: 'public',
        courseStatus: 'active',
        coursePrice: '150.00',
      }),
    ).toBe(false);
  });

  it('applies the same open public access policy to authenticated learners in another org', () => {
    expect(
      isOpenPublicLessonAccessAllowed({
        isShowcaseCourse: false,
        courseVisibility: 'public',
        courseStatus: 'active',
        coursePrice: '0.00',
      }),
    ).toBe(true);
  });
});
