import { describe, expect, it } from "@jest/globals";
import { ContentLanguageService } from "../services/contentLanguageService";

describe("ContentLanguageService fallback chain", () => {
  it("builds canonical fallback order with dedupe", () => {
    const chain = ContentLanguageService.buildLanguageFallbackChain({
      requestedLanguage: "nl",
      coursePreferredLanguage: "en",
      orgDefaultLanguage: "en",
      userPreferredLanguage: "fr",
      sourceLanguage: "en",
    });

    expect(chain.map((item) => item.code)).toEqual(["nl", "en", "fr"]);
    expect(chain[0]?.reason).toBe("requested_language");
    expect(chain[1]?.reason).toBe("course_preferred_language");
  });

  it("resolves matching variant with reason code", () => {
    const resolution = ContentLanguageService.resolveVariantFromFallbackChain(
      [
        { id: "lesson-en", languageCode: "en" },
        { id: "lesson-fr", languageCode: "fr" },
      ],
      [
        { code: "nl", reason: "requested_language" },
        { code: "fr", reason: "user_preferred_language" },
        { code: "en", reason: "source_language_default" },
      ]
    );

    expect(resolution.variantId).toBe("lesson-fr");
    expect(resolution.resolvedLanguage).toBe("fr");
    expect(resolution.reason).toBe("user_preferred_language");
    expect(resolution.attemptedChain).toEqual(["nl", "fr", "en"]);
  });

  it("returns no_matching_variant when no language in chain exists", () => {
    const resolution = ContentLanguageService.resolveVariantFromFallbackChain(
      [{ id: "lesson-en", languageCode: "en" }],
      [{ code: "de", reason: "requested_language" }]
    );

    expect(resolution.variantId).toBe("lesson-en");
    expect(resolution.reason).toBe("no_matching_variant");
    expect(resolution.availableLanguages).toEqual(["en"]);
  });

  it("builds API payload with explicit fallback message", () => {
    const resolution = ContentLanguageService.resolveVariantFromFallbackChain(
      [{ id: "lesson-en", languageCode: "en" }],
      [{ code: "nl", reason: "requested_language" }]
    );

    const payload = ContentLanguageService.buildResolutionPayload(resolution, "nl");
    expect(payload).not.toBeNull();
    expect(payload?.requestedLanguageCode).toBe("nl");
    expect(payload?.resolvedLanguageCode).toBe("en");
    expect(payload?.reasonCode).toBe("no_matching_variant");
    expect(payload?.isFallback).toBe(true);
    expect(payload?.fallbackMessage).toContain("Requested language");
  });
});
