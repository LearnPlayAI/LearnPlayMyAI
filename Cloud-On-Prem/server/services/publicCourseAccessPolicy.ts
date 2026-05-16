export type AnonymousPublicLessonAccessInput = {
  isShowcaseCourse: boolean;
  courseVisibility: string | null | undefined;
  courseStatus: string | null | undefined;
  coursePrice: string | number | null | undefined;
};

export function isFreeCoursePrice(value: string | number | null | undefined): boolean {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value || '0'));
  return Number.isFinite(numeric) ? numeric <= 0 : false;
}

export function isAnonymousPublicLessonAccessAllowed(input: AnonymousPublicLessonAccessInput): boolean {
  return isOpenPublicLessonAccessAllowed(input);
}

export function isOpenPublicLessonAccessAllowed(input: AnonymousPublicLessonAccessInput): boolean {
  if (input.isShowcaseCourse) {
    return true;
  }

  return (
    input.courseVisibility === 'public'
    && input.courseStatus === 'active'
    && isFreeCoursePrice(input.coursePrice)
  );
}
