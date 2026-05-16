import { describe, expect, it } from "@jest/globals";
import { sanitizeTranslationWizardState } from "../services/translationWizardStateService";

describe("sanitizeTranslationWizardState", () => {
  it("clamps podcast step and normalizes invalid enum values", () => {
    const state = sanitizeTranslationWizardState({
      input: {
        parentStep: "invalid",
        includePodcastTranslation: true,
        podcast: {
          subStep: 99,
          podcastFormat: "not_real",
          duration: "invalid",
        },
      },
      userId: "user-1",
      translatedLessonId: "lesson-1",
      fallbackTargetLanguageCode: "NL",
    });

    expect(state.parentStep).toBe("select_language");
    expect(state.version).toBe(1);
    expect(state.podcast.subStep).toBe(5);
    expect(state.podcast.podcastFormat).toBe("bulletin");
    expect(state.podcast.duration).toBe("default");
    expect(state.targetLanguageCode).toBe("nl");
  });

  it("preserves explicit valid state for resume scenarios", () => {
    const state = sanitizeTranslationWizardState({
      input: {
        parentStep: "podcast",
        includePodcastTranslation: true,
        targetLanguageCode: "fr",
        podcast: {
          subStep: 4,
          selectedSourceScriptId: "script-123",
          podcastFormat: "conversation",
          duration: "long",
          scriptText: "HOST: Bonjour",
          hasTriggeredGeneration: true,
        },
      },
      userId: "user-2",
      translatedLessonId: "lesson-2",
      fallbackTargetLanguageCode: "en",
    });

    expect(state.parentStep).toBe("podcast");
    expect(state.podcast.subStep).toBe(4);
    expect(state.podcast.podcastFormat).toBe("conversation");
    expect(state.podcast.duration).toBe("long");
    expect(state.podcast.selectedSourceScriptId).toBe("script-123");
    expect(state.podcast.scriptText).toContain("HOST");
    expect(state.podcast.hasTriggeredGeneration).toBe(true);
    expect(state.targetLanguageCode).toBe("fr");
  });

  it("keeps compatibility with older payloads missing version/session fields", () => {
    const state = sanitizeTranslationWizardState({
      input: {
        parentStep: "review_edit",
        podcast: {
          subStep: 2,
        },
      },
      userId: "user-3",
      translatedLessonId: "lesson-3",
      fallbackTargetLanguageCode: "de",
    });

    expect(state.version).toBe(1);
    expect(state.clientSessionId).toBeNull();
    expect(state.parentStep).toBe("review_edit");
    expect(state.targetLanguageCode).toBe("de");
    expect(state.podcast.subStep).toBe(2);
  });

  it("sanitizes long client session ids", () => {
    const longSessionId = "x".repeat(500);
    const state = sanitizeTranslationWizardState({
      input: {
        parentStep: "podcast",
        clientSessionId: longSessionId,
      },
      userId: "user-4",
      translatedLessonId: "lesson-4",
      fallbackTargetLanguageCode: "en",
    });

    expect(state.clientSessionId).toHaveLength(128);
  });
});
