export function sanitizeInternalReturnPath(path: string | null): string | null {
  const candidate = String(path || "").trim();
  if (!candidate) return null;
  if (!candidate.startsWith("/")) return null;
  if (candidate.startsWith("//")) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) return null;
  return candidate;
}

export function parseCourseReturnParams(search: string) {
  return new URLSearchParams(search);
}

export function resolveCourseBackTarget(search: string, courseTitle?: string) {
  const params = parseCourseReturnParams(search);
  const returnTo = sanitizeInternalReturnPath(params.get("returnTo"));
  const courseId = params.get("courseId");
  const courseName = params.get("courseName") || courseTitle;
  const backUrl = returnTo || (courseId ? `/course-builder/${courseId}/lessons` : null);

  return {
    returnTo,
    courseId,
    courseName,
    backUrl,
  };
}

export function getCourseReturnParams(search: string) {
  const params = parseCourseReturnParams(search);
  return {
    returnTo: params.get("returnTo"),
    courseId: params.get("courseId"),
    courseName: params.get("courseName"),
    lessonId: params.get("lessonId"),
  };
}

export function buildReturnParams(courseId?: string, courseName?: string): string {
  if (!courseId) return "";
  const params = new URLSearchParams();
  params.set("returnTo", `/course-builder/${courseId}/lessons`);
  params.set("courseId", courseId);
  if (courseName) params.set("courseName", courseName);
  return params.toString();
}
