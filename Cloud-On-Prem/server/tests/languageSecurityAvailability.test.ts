import { describe, expect, it } from '@jest/globals';
import {
  isStaffScopedRole,
  isPublicCourseLanguageVariantAvailable,
  isPublicLessonLanguageVariantAvailable,
  resolveRequestedLanguageCodeFromQuery,
  isResolvedShowcaseLessonEligible,
} from '../services/languageAccessPolicy';

describe('language security and availability hardening', () => {
  describe('staff role scoping', () => {
    it('allows staff-scoped roles', () => {
      expect(isStaffScopedRole('org_admin')).toBe(true);
      expect(isStaffScopedRole('teacher')).toBe(true);
      expect(isStaffScopedRole('team_lead')).toBe(true);
      expect(isStaffScopedRole('admin')).toBe(true);
    });

    it('rejects non-staff roles', () => {
      expect(isStaffScopedRole('student')).toBe(false);
      expect(isStaffScopedRole('employee')).toBe(false);
      expect(isStaffScopedRole('learner')).toBe(false);
      expect(isStaffScopedRole(undefined)).toBe(false);
    });
  });

  describe('public language availability', () => {
    it('only exposes active + published/default course variants', () => {
      expect(isPublicCourseLanguageVariantAvailable({ status: 'active', isDefaultLanguage: true, translationStatus: 'draft' })).toBe(true);
      expect(isPublicCourseLanguageVariantAvailable({ status: 'active', isDefaultLanguage: false, translationStatus: 'published' })).toBe(true);
      expect(isPublicCourseLanguageVariantAvailable({ status: 'active', isDefaultLanguage: false, translationStatus: 'draft' })).toBe(false);
      expect(isPublicCourseLanguageVariantAvailable({ status: 'draft', isDefaultLanguage: true, translationStatus: 'published' })).toBe(false);
    });

    it('only exposes published/default lesson variants', () => {
      expect(isPublicLessonLanguageVariantAvailable({ isDefaultLanguage: true, translationStatus: 'draft' })).toBe(true);
      expect(isPublicLessonLanguageVariantAvailable({ isDefaultLanguage: false, translationStatus: 'published' })).toBe(true);
      expect(isPublicLessonLanguageVariantAvailable({ isDefaultLanguage: false, translationStatus: 'draft' })).toBe(false);
    });
  });

  describe('language query compatibility', () => {
    it('prefers languageCode and falls back to lang', () => {
      expect(resolveRequestedLanguageCodeFromQuery({ languageCode: 'FR', lang: 'zu' })).toBe('fr');
      expect(resolveRequestedLanguageCodeFromQuery({ lang: 'zu' })).toBe('zu');
      expect(resolveRequestedLanguageCodeFromQuery({ languageCode: '   ', lang: 'es' })).toBe('es');
      expect(resolveRequestedLanguageCodeFromQuery({})).toBeNull();
    });
  });

  describe('showcase viewer eligibility guard', () => {
    it('requires resolved lesson variant to remain showcase-eligible', () => {
      expect(isResolvedShowcaseLessonEligible(true)).toBe(true);
      expect(isResolvedShowcaseLessonEligible(false)).toBe(false);
    });
  });
});
