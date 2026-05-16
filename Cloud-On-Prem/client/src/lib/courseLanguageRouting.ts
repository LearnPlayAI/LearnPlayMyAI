function normalizeLanguageCode(value: unknown): string | null {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
}

export function getRequestedLanguageCodeFromSearch(search: string): string | null {
  const params = new URLSearchParams(search || "");
  return normalizeLanguageCode(params.get("languageCode") || params.get("lang"));
}

export function buildCourseLanguageQuery(languageCode?: string | null): string {
  const normalized = normalizeLanguageCode(languageCode);
  if (!normalized) return "";
  return `?languageCode=${encodeURIComponent(normalized)}`;
}

export function buildCourseHref(courseId: string, languageCode?: string | null): string {
  return `/courses/${courseId}${buildCourseLanguageQuery(languageCode)}`;
}

export function buildCourseLessonsHref(params: {
  lessonId: string;
  courseId: string;
  languageCode?: string | null;
  demo?: boolean;
}): string {
  const query = new URLSearchParams();
  query.set("courseId", params.courseId);
  if (params.demo) query.set("demo", "true");
  const normalized = normalizeLanguageCode(params.languageCode);
  if (normalized) {
    query.set("languageCode", normalized);
  }
  return `/lessons/${params.lessonId}?${query.toString()}`;
}

export function buildMyCoursesUrl(page: number, pageSize: number): string {
  const safePage = Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1);
  const safePageSize = Math.max(1, Number.isFinite(pageSize) ? Math.floor(pageSize) : 20);
  const offset = (safePage - 1) * safePageSize;
  return `/api/my-courses?limit=${safePageSize}&offset=${offset}`;
}
