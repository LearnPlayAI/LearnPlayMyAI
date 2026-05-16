const STAFF_SCOPED_ROLES = new Set([
  'owner',
  'admin',
  'org_admin',
  'teacher',
  'team_lead',
  'staff',
]);

export function isStaffScopedRole(role: string | null | undefined): boolean {
  return STAFF_SCOPED_ROLES.has(String(role || '').trim().toLowerCase());
}

export function isPublicCourseLanguageVariantAvailable(input: {
  status?: string | null;
  isDefaultLanguage?: boolean | null;
  translationStatus?: string | null;
}): boolean {
  const status = String(input.status || '').trim().toLowerCase();
  const translationStatus = String(input.translationStatus || '').trim().toLowerCase();
  const isDefault = !!input.isDefaultLanguage;
  return status === 'active' && (isDefault || translationStatus === 'published');
}

export function isPublicLessonLanguageVariantAvailable(input: {
  isDefaultLanguage?: boolean | null;
  translationStatus?: string | null;
}): boolean {
  const translationStatus = String(input.translationStatus || '').trim().toLowerCase();
  const isDefault = !!input.isDefaultLanguage;
  return isDefault || translationStatus === 'published';
}

export function resolveRequestedLanguageCodeFromQuery(query: Record<string, unknown>): string | null {
  const normalize = (value: unknown): string | null => {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized || null;
  };

  const languageCode = normalize(query.languageCode);
  if (languageCode) return languageCode;

  return normalize(query.lang);
}

export function isResolvedShowcaseLessonEligible(isShowcase: boolean): boolean {
  return isShowcase;
}
