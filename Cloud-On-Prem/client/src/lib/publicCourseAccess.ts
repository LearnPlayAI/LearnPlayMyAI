export type PublicCourseAccessInput = {
  isShowcaseCourse?: boolean | null;
  visibility?: string | null;
  status?: string | null;
  isPaid?: boolean | null;
  price?: string | number | null;
};

export function isFreeCoursePrice(value: string | number | null | undefined): boolean {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value || '0'));
  return Number.isFinite(numeric) ? numeric <= 0 : false;
}

export function hasOpenPublicCourseAccess(input: PublicCourseAccessInput): boolean {
  if (input.isShowcaseCourse) {
    return true;
  }

  const isFree = input.isPaid === false || isFreeCoursePrice(input.price);
  return input.visibility === 'public' && input.status === 'active' && isFree;
}
