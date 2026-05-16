import { db } from '../db';
import { 
  users, organizations, courses, lessons, quizCollections, supportedLanguages,
  userOrganizationRoles, aiConfig,
  type SelectSupportedLanguage 
} from '@shared/schema';
import { eq, and, sql, inArray, desc } from 'drizzle-orm';
import { GoogleGenAI } from '@google/genai';

const PLATFORM_DEFAULT_LANGUAGE = 'en';
const CANONICAL_TRANSLATION_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', region: 'Global', sortOrder: 0 },
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans', region: 'Africa', sortOrder: 1 },
  { code: 'zu', name: 'isiZulu', nativeName: 'isiZulu', region: 'Africa', sortOrder: 2 },
  { code: 'xh', name: 'isiXhosa', nativeName: 'isiXhosa', region: 'Africa', sortOrder: 3 },
  { code: 'sw', name: 'Kiswahili', nativeName: 'Kiswahili', region: 'Africa', sortOrder: 4 },
  { code: 'ar', name: 'Arabic', nativeName: 'Arabic', region: 'Middle East', sortOrder: 5 },
  { code: 'fr', name: 'French', nativeName: 'Francais', region: 'Europe', sortOrder: 6 },
  { code: 'de', name: 'German', nativeName: 'Deutsch', region: 'Europe', sortOrder: 7 },
  { code: 'es', name: 'Spanish', nativeName: 'Espanol', region: 'Europe', sortOrder: 8 },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', region: 'Europe', sortOrder: 9 },
  { code: 'pt', name: 'Portuguese', nativeName: 'Portugues', region: 'Europe', sortOrder: 10 },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', region: 'Europe', sortOrder: 11 },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', region: 'Europe', sortOrder: 12 },
  { code: 'ro', name: 'Romanian', nativeName: 'Romana', region: 'Europe', sortOrder: 13 },
  { code: 'el', name: 'Greek', nativeName: 'Greek', region: 'Europe', sortOrder: 14 },
  { code: 'cs', name: 'Czech', nativeName: 'Cestina', region: 'Europe', sortOrder: 15 },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', region: 'Europe', sortOrder: 16 },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', region: 'Europe', sortOrder: 17 },
  { code: 'da', name: 'Danish', nativeName: 'Dansk', region: 'Europe', sortOrder: 18 },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi', region: 'Europe', sortOrder: 19 },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovencina', region: 'Europe', sortOrder: 20 },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Bulgarian', region: 'Europe', sortOrder: 21 },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski', region: 'Europe', sortOrder: 22 },
  { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuviu', region: 'Europe', sortOrder: 23 },
  { code: 'sl', name: 'Slovenian', nativeName: 'Slovenscina', region: 'Europe', sortOrder: 24 },
  { code: 'lv', name: 'Latvian', nativeName: 'Latviesu', region: 'Europe', sortOrder: 25 },
  { code: 'et', name: 'Estonian', nativeName: 'Eesti', region: 'Europe', sortOrder: 26 },
  { code: 'ga', name: 'Irish', nativeName: 'Gaeilge', region: 'Europe', sortOrder: 27 },
  { code: 'mt', name: 'Maltese', nativeName: 'Malti', region: 'Europe', sortOrder: 28 },
] as const;

export type LanguageResolutionReason =
  | 'requested_language'
  | 'course_preferred_language'
  | 'organization_default_language'
  | 'user_preferred_language'
  | 'source_language_default'
  | 'no_matching_variant';

export type LanguageResolution = {
  resolvedLanguage: string;
  reason: LanguageResolutionReason;
  attemptedChain: string[];
};

type VariantCandidate = {
  id: string;
  languageCode: string | null;
};

export type VariantResolution = {
  variantId: string | null;
  resolvedLanguage: string;
  reason: LanguageResolutionReason;
  attemptedChain: string[];
  availableLanguages: string[];
};

export type LanguageResolutionApiPayload = {
  requestedLanguageCode: string | null;
  resolvedLanguageCode: string;
  reasonCode: LanguageResolutionReason;
  attemptedChain: string[];
  availableLanguages: string[];
  isFallback: boolean;
  fallbackMessage: string | null;
};

export class ContentLanguageService {
  static getCanonicalTranslationLanguages(): SelectSupportedLanguage[] {
    const now = new Date();
    return CANONICAL_TRANSLATION_LANGUAGES.map((language) => ({
      ...language,
      isActive: true,
      createdAt: now,
    }));
  }

  static buildResolutionPayload(
    resolution: VariantResolution | null,
    requestedLanguageCode?: string | null
  ): LanguageResolutionApiPayload | null {
    if (!resolution) return null;
    const requested = String(requestedLanguageCode || "").trim().toLowerCase() || null;
    const isFallback = !!requested && resolution.resolvedLanguage !== requested;

    return {
      requestedLanguageCode: requested,
      resolvedLanguageCode: resolution.resolvedLanguage,
      reasonCode: resolution.reason,
      attemptedChain: resolution.attemptedChain,
      availableLanguages: resolution.availableLanguages,
      isFallback,
      fallbackMessage: isFallback
        ? `Requested language "${requested}" unavailable. Showing "${resolution.resolvedLanguage}" (${resolution.reason}).`
        : null,
    };
  }

  private static async getLanguageContext(input: {
    userId?: string | null;
    organizationId?: string | null;
  }): Promise<{ userPreferredLanguage: string | null; orgDefaultLanguage: string | null }> {
    let userPreferredLanguage: string | null = null;
    if (input.userId) {
      const [user] = await db
        .select({ preferredLanguage: users.preferredLanguage })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      userPreferredLanguage = user?.preferredLanguage || null;
    }

    let orgDefaultLanguage: string | null = null;
    if (input.organizationId) {
      const [org] = await db
        .select({ defaultLanguage: organizations.defaultLanguage })
        .from(organizations)
        .where(eq(organizations.id, input.organizationId))
        .limit(1);
      orgDefaultLanguage = org?.defaultLanguage || null;
    }

    return { userPreferredLanguage, orgDefaultLanguage };
  }

  static buildLanguageFallbackChain(input: {
    requestedLanguage?: string | null;
    coursePreferredLanguage?: string | null;
    orgDefaultLanguage?: string | null;
    userPreferredLanguage?: string | null;
    sourceLanguage?: string | null;
  }): Array<{ code: string; reason: LanguageResolutionReason }> {
    const candidates: Array<{ raw: string | null | undefined; reason: LanguageResolutionReason }> = [
      { raw: input.requestedLanguage, reason: 'requested_language' },
      { raw: input.coursePreferredLanguage, reason: 'course_preferred_language' },
      { raw: input.orgDefaultLanguage, reason: 'organization_default_language' },
      { raw: input.userPreferredLanguage, reason: 'user_preferred_language' },
      { raw: input.sourceLanguage || PLATFORM_DEFAULT_LANGUAGE, reason: 'source_language_default' },
    ];

    const dedup = new Set<string>();
    const chain: Array<{ code: string; reason: LanguageResolutionReason }> = [];
    for (const candidate of candidates) {
      const code = String(candidate.raw || '').trim().toLowerCase();
      if (!code || dedup.has(code)) continue;
      dedup.add(code);
      chain.push({ code, reason: candidate.reason });
    }
    return chain;
  }

  static async resolveLanguageForUserContext(input: {
    userId?: string | null;
    organizationId?: string | null;
    requestedLanguage?: string | null;
    coursePreferredLanguage?: string | null;
    sourceLanguage?: string | null;
  }): Promise<LanguageResolution> {
    const { userPreferredLanguage, orgDefaultLanguage } = await this.getLanguageContext({
      userId: input.userId,
      organizationId: input.organizationId,
    });

    const chain = this.buildLanguageFallbackChain({
      requestedLanguage: input.requestedLanguage,
      coursePreferredLanguage: input.coursePreferredLanguage,
      orgDefaultLanguage,
      userPreferredLanguage,
      sourceLanguage: input.sourceLanguage,
    });

    if (chain.length === 0) {
      return {
        resolvedLanguage: PLATFORM_DEFAULT_LANGUAGE,
        reason: 'source_language_default',
        attemptedChain: [PLATFORM_DEFAULT_LANGUAGE],
      };
    }

    return {
      resolvedLanguage: chain[0].code,
      reason: chain[0].reason,
      attemptedChain: chain.map((c) => c.code),
    };
  }

  static resolveVariantFromFallbackChain(
    variants: VariantCandidate[],
    chain: Array<{ code: string; reason: LanguageResolutionReason }>
  ): VariantResolution {
    const normalizedVariants = variants
      .map((variant) => ({
        id: String(variant.id),
        languageCode: String(variant.languageCode || "").trim().toLowerCase(),
      }))
      .filter((variant) => !!variant.id && !!variant.languageCode);
    normalizedVariants.sort((left, right) => {
      const byLanguage = String(left.languageCode).localeCompare(String(right.languageCode));
      if (byLanguage !== 0) return byLanguage;
      return String(left.id).localeCompare(String(right.id));
    });

    const availableLanguages = Array.from(new Set(normalizedVariants.map((variant) => variant.languageCode)));
    const attemptedChain = chain.map((item) => item.code);

    for (const item of chain) {
      const match = normalizedVariants.find((variant) => variant.languageCode === item.code);
      if (match) {
        return {
          variantId: match.id,
          resolvedLanguage: match.languageCode,
          reason: item.reason,
          attemptedChain,
          availableLanguages,
        };
      }
    }

    const fallbackVariant = normalizedVariants[0];
    if (fallbackVariant) {
      return {
        variantId: fallbackVariant.id,
        resolvedLanguage: fallbackVariant.languageCode,
        reason: "no_matching_variant",
        attemptedChain,
        availableLanguages,
      };
    }

    return {
      variantId: null,
      resolvedLanguage: PLATFORM_DEFAULT_LANGUAGE,
      reason: "no_matching_variant",
      attemptedChain,
      availableLanguages: [],
    };
  }

  static async resolveCourseVariantByFallback(input: {
    contentGroupId: string;
    requestedLanguage?: string | null;
    userId?: string | null;
    organizationId?: string | null;
    coursePreferredLanguage?: string | null;
    sourceLanguage?: string | null;
    includeUnpublishedVariants?: boolean;
  }): Promise<VariantResolution> {
    const { userPreferredLanguage, orgDefaultLanguage } = await this.getLanguageContext({
      userId: input.userId,
      organizationId: input.organizationId,
    });

    const chain = this.buildLanguageFallbackChain({
      requestedLanguage: input.requestedLanguage,
      coursePreferredLanguage: input.coursePreferredLanguage,
      orgDefaultLanguage,
      userPreferredLanguage,
      sourceLanguage: input.sourceLanguage,
    });

    const filters: any[] = [eq(courses.contentGroupId, input.contentGroupId)];
    if (!input.includeUnpublishedVariants) {
      filters.push(sql`(${courses.isDefaultLanguage} = true OR ${courses.translationStatus} = 'published')`);
    }
    if (input.organizationId) {
      filters.push(eq(courses.organizationId, input.organizationId));
    }

    const rows = await db
      .select({
        id: courses.id,
        languageCode: courses.languageCode,
      })
      .from(courses)
      .where(and(...filters));

    return this.resolveVariantFromFallbackChain(rows, chain.length ? chain : [{ code: PLATFORM_DEFAULT_LANGUAGE, reason: "source_language_default" }]);
  }

  static async resolveLessonVariantByFallback(input: {
    contentGroupId: string;
    requestedLanguage?: string | null;
    userId?: string | null;
    organizationId?: string | null;
    coursePreferredLanguage?: string | null;
    sourceLanguage?: string | null;
    includeUnpublishedVariants?: boolean;
  }): Promise<VariantResolution> {
    const { userPreferredLanguage, orgDefaultLanguage } = await this.getLanguageContext({
      userId: input.userId,
      organizationId: input.organizationId,
    });

    const chain = this.buildLanguageFallbackChain({
      requestedLanguage: input.requestedLanguage,
      coursePreferredLanguage: input.coursePreferredLanguage,
      orgDefaultLanguage,
      userPreferredLanguage,
      sourceLanguage: input.sourceLanguage,
    });

    const filters: any[] = [eq(lessons.contentGroupId, input.contentGroupId)];
    if (!input.includeUnpublishedVariants) {
      filters.push(sql`(${lessons.isDefaultLanguage} = true OR ${lessons.translationStatus} = 'published')`);
    }
    if (input.organizationId) {
      filters.push(eq(lessons.organizationId, input.organizationId));
    }

    const rows = await db
      .select({
        id: lessons.id,
        languageCode: lessons.languageCode,
      })
      .from(lessons)
      .where(and(...filters));

    return this.resolveVariantFromFallbackChain(rows, chain.length ? chain : [{ code: PLATFORM_DEFAULT_LANGUAGE, reason: "source_language_default" }]);
  }
  /**
   * Resolve the effective language for a user:
   * 1. User's preferredLanguage (if set and not null)
   * 2. Organization's defaultLanguage (if user belongs to an org)
   * 3. Platform default: 'en'
   */
  static async resolveLanguage(userId: string, organizationId?: string | null): Promise<string> {
    // Step 1: Check user preference
    const [user] = await db
      .select({ preferredLanguage: users.preferredLanguage })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    
    if (user?.preferredLanguage) {
      return user.preferredLanguage;
    }
    
    // Step 2: Check org default
    let orgId = organizationId;
    if (!orgId) {
      const [role] = await db
        .select({ organizationId: userOrganizationRoles.organizationId })
        .from(userOrganizationRoles)
        .where(eq(userOrganizationRoles.userId, userId))
        .limit(1);
      orgId = role?.organizationId;
    }
    
    if (orgId) {
      const [org] = await db
        .select({ defaultLanguage: organizations.defaultLanguage })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);
      
      if (org?.defaultLanguage) {
        return org.defaultLanguage;
      }
    }
    
    // Step 3: Platform default
    return PLATFORM_DEFAULT_LANGUAGE;
  }

  /**
   * Get all supported languages
   */
  static async getSupportedLanguages(): Promise<SelectSupportedLanguage[]> {
    const rows = await db
      .select()
      .from(supportedLanguages)
      .where(eq(supportedLanguages.isActive, true))
      .orderBy(supportedLanguages.sortOrder);

    // Defensive dedupe: if a target DB has bad historical rows, keep first code occurrence.
    const byCode = new Map<string, SelectSupportedLanguage>();
    for (const row of rows) {
      const code = String(row.code || '').trim().toLowerCase();
      if (!code) continue;
      if (!byCode.has(code)) {
        byCode.set(code, row);
      }
    }
    if (byCode.size <= 1) {
      return this.getCanonicalTranslationLanguages();
    }
    return Array.from(byCode.values()).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  }

  /**
   * Find a course in the preferred language, falling back to default language
   * Uses a single optimized query with CASE priority ordering
   */
  static async resolveCourseByLanguage(
    contentGroupId: string,
    preferredLanguage: string,
    options?: { organizationId?: string | null }
  ): Promise<{ id: string; languageCode: string | null } | null> {
    const orgFilter = options?.organizationId
      ? sql` AND ${courses.organizationId} = ${options.organizationId}`
      : sql``;
    const results = await db
      .select({ 
        id: courses.id, 
        languageCode: courses.languageCode,
        isDefault: courses.isDefaultLanguage,
      })
      .from(courses)
      .where(and(
        eq(courses.contentGroupId, contentGroupId),
        sql`(${courses.isDefaultLanguage} = true OR ${courses.translationStatus} = 'published') ${orgFilter}`
      ))
      .orderBy(
        sql`CASE 
          WHEN ${courses.languageCode} = ${preferredLanguage} THEN 1
          WHEN ${courses.isDefaultLanguage} = true THEN 2
          WHEN ${courses.languageCode} = ${PLATFORM_DEFAULT_LANGUAGE} THEN 3
          ELSE 4
        END`
      )
      .limit(1);
    
    return results[0] || null;
  }

  /**
   * Find a lesson in the preferred language, falling back to default language
   */
  static async resolveLessonByLanguage(
    contentGroupId: string,
    preferredLanguage: string,
    options?: { organizationId?: string | null }
  ): Promise<{ id: string; languageCode: string | null } | null> {
    const orgFilter = options?.organizationId
      ? sql` AND ${lessons.organizationId} = ${options.organizationId}`
      : sql``;
    const results = await db
      .select({ 
        id: lessons.id, 
        languageCode: lessons.languageCode,
      })
      .from(lessons)
      .where(and(
        eq(lessons.contentGroupId, contentGroupId),
        sql`(${lessons.isDefaultLanguage} = true OR ${lessons.translationStatus} = 'published') ${orgFilter}`
      ))
      .orderBy(
        sql`CASE 
          WHEN ${lessons.languageCode} = ${preferredLanguage} THEN 1
          WHEN ${lessons.isDefaultLanguage} = true THEN 2
          WHEN ${lessons.languageCode} = ${PLATFORM_DEFAULT_LANGUAGE} THEN 3
          ELSE 4
        END`
      )
      .limit(1);
    
    return results[0] || null;
  }

  /**
   * Find a quiz collection in the preferred language
   */
  static async resolveQuizByLanguage(
    contentGroupId: string,
    preferredLanguage: string,
    options?: { organizationId?: string | null }
  ): Promise<{ id: string; languageCode: string | null } | null> {
    const orgFilter = options?.organizationId
      ? sql` AND ${quizCollections.organizationId} = ${options.organizationId}`
      : sql``;
    const results = await db
      .select({ 
        id: quizCollections.id, 
        languageCode: quizCollections.languageCode,
      })
      .from(quizCollections)
      .where(and(
        eq(quizCollections.contentGroupId, contentGroupId),
        sql`(${quizCollections.isDefaultLanguage} = true OR ${quizCollections.translationStatus} = 'published') ${orgFilter}`
      ))
      .orderBy(
        sql`CASE 
          WHEN ${quizCollections.languageCode} = ${preferredLanguage} THEN 1
          WHEN ${quizCollections.isDefaultLanguage} = true THEN 2
          WHEN ${quizCollections.languageCode} = ${PLATFORM_DEFAULT_LANGUAGE} THEN 3
          ELSE 4
        END`
      )
      .limit(1);
    
    return results[0] || null;
  }

  /**
   * Get all available languages for a content group (course/lesson/quiz)
   */
  static async getAvailableLanguagesForCourse(contentGroupId: string): Promise<string[]> {
    const results = await db
      .select({ languageCode: courses.languageCode })
      .from(courses)
      .where(and(
        eq(courses.contentGroupId, contentGroupId),
        sql`(${courses.isDefaultLanguage} = true OR ${courses.translationStatus} = 'published')`
      ));

    return Array.from(new Set(
      results
        .map((r) => String(r.languageCode || '').trim().toLowerCase())
        .filter((lc): lc is string => !!lc)
    )).sort();
  }

  static async getAvailableLanguagesForLesson(contentGroupId: string): Promise<string[]> {
    const results = await db
      .select({ languageCode: lessons.languageCode })
      .from(lessons)
      .where(and(
        eq(lessons.contentGroupId, contentGroupId),
        sql`(${lessons.isDefaultLanguage} = true OR ${lessons.translationStatus} = 'published')`
      ));

    return Array.from(new Set(
      results
        .map((r) => String(r.languageCode || '').trim().toLowerCase())
        .filter((lc): lc is string => !!lc)
    )).sort();
  }

  /**
   * Check if translations are stale (source content has been updated since translation)
   * Returns list of language codes that are potentially stale
   */
  static async checkTranslationStaleness(
    contentGroupId: string,
    contentType: 'course' | 'lesson' | 'quiz'
  ): Promise<Array<{ languageCode: string; isStale: boolean; sourceVersionWhenTranslated: number | null }>> {
    let table: any;
    if (contentType === 'course') table = courses;
    else if (contentType === 'lesson') table = lessons;
    else table = quizCollections;

    const variants = await db
      .select({
        languageCode: table.languageCode,
        isDefaultLanguage: table.isDefaultLanguage,
        sourceLanguageVersion: table.sourceLanguageVersion,
        updatedAt: table.updatedAt,
      })
      .from(table)
      .where(eq(table.contentGroupId, contentGroupId));

    const defaultVariant = variants.find((v: any) => v.isDefaultLanguage);

    if (!defaultVariant) {
      return variants
        .filter((v: any) => !v.isDefaultLanguage)
        .map((v: any) => ({
          languageCode: v.languageCode || 'unknown',
          isStale: false,
          sourceVersionWhenTranslated: v.sourceLanguageVersion,
        }));
    }

    return variants
      .filter((v: any) => !v.isDefaultLanguage)
      .map((v: any) => {
        // Staleness detection using updatedAt comparison:
        // Translation is stale if source (default language) was modified after the translation was created/updated.
        // When source content is edited, its updatedAt is bumped. When a translation is created/updated, its updatedAt is set.
        // So if source.updatedAt > translation.updatedAt, the translation was made before the latest source edit.
        // Note: sourceLanguageVersion is not reliably set by all flows, so updatedAt serves as a practical heuristic.
        const isStale = defaultVariant.updatedAt && v.updatedAt 
          ? new Date(defaultVariant.updatedAt) > new Date(v.updatedAt)
          : false;
        
        return {
          languageCode: v.languageCode || 'unknown',
          isStale,
          sourceVersionWhenTranslated: v.sourceLanguageVersion,
        };
      });
  }

  /**
   * Update user's preferred language
   */
  static async updateUserLanguage(userId: string, languageCode: string): Promise<void> {
    await db
      .update(users)
      .set({ preferredLanguage: languageCode, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  /**
   * Update organization's default language
   */
  static async updateOrgLanguage(organizationId: string, languageCode: string): Promise<void> {
    await db
      .update(organizations)
      .set({ defaultLanguage: languageCode, updatedAt: new Date() })
      .where(eq(organizations.id, organizationId));
  }

  /**
   * Validate that a language code is supported
   */
  static async isLanguageSupported(code: string): Promise<boolean> {
    const normalized = String(code || "").trim().toLowerCase();
    if (!normalized) return false;
    const supported = await this.getSupportedLanguages();
    return supported.some((lang) => String(lang.code || "").trim().toLowerCase() === normalized);
  }

  /**
   * Get language display info (name + native name) for a code
   */
  static async getLanguageInfo(code: string): Promise<{ name: string; nativeName: string } | null> {
    const [lang] = await db
      .select({ name: supportedLanguages.name, nativeName: supportedLanguages.nativeName })
      .from(supportedLanguages)
      .where(eq(supportedLanguages.code, code))
      .limit(1);
    
    return lang || null;
  }

  static async detectDocumentLanguage(text: string): Promise<string> {
    try {
      const sample = text.substring(0, 500);

      if (!sample.trim()) {
        return PLATFORM_DEFAULT_LANGUAGE;
      }

      const activeConfigs = await db
        .select()
        .from(aiConfig)
        .where(and(eq(aiConfig.isActive, true), eq(aiConfig.purpose, 'text')))
        .orderBy(desc(aiConfig.updatedAt))
        .limit(1);

      if (activeConfigs.length === 0) {
        console.warn('[ContentLanguageService] No active AI config, defaulting to en');
        return PLATFORM_DEFAULT_LANGUAGE;
      }

      const config = activeConfigs[0];
      const ai = new GoogleGenAI({ apiKey: config.apiKey });

      const prompt = `Analyze the following text and identify its language. Return ONLY the ISO 639-1 two-letter language code (e.g., 'en' for English, 'fr' for French, 'zu' for Zulu, 'ar' for Arabic, etc.). If you cannot determine the language, return 'en'.

Text to analyze:
"""
${sample}
"""

Language code:`;

      const response = await ai.models.generateContent({
        model: config.modelName,
        contents: prompt,
      });

      const responseText = response.text || '';
      const detectedCode = responseText.trim().toLowerCase().replace(/[^a-z]/g, '').substring(0, 2);

      if (!detectedCode || detectedCode.length !== 2) {
        return PLATFORM_DEFAULT_LANGUAGE;
      }

      const isSupported = await ContentLanguageService.isLanguageSupported(detectedCode);
      if (!isSupported) {
        console.log(`[ContentLanguageService] Detected language '${detectedCode}' is not supported, defaulting to en`);
        return PLATFORM_DEFAULT_LANGUAGE;
      }

      console.log(`[ContentLanguageService] Detected document language: ${detectedCode}`);
      return detectedCode;
    } catch (error) {
      console.error('[ContentLanguageService] Language detection failed:', error);
      return PLATFORM_DEFAULT_LANGUAGE;
    }
  }
}
