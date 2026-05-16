import { describe, expect, it } from "@jest/globals";
import {
  getLessonActionMenuResetState,
  resolvePodcastSelection,
} from "../lib/lessonNavigationState";

describe("lessonNavigationState", () => {
  it("resolves a requested podcast version to its own language", () => {
    const result = resolvePodcastSelection({
      podcastVersions: [
        { id: "v-en-1", languageCode: "en", status: "completed" },
        { id: "v-nl-1", languageCode: "nl", status: "completed" },
      ],
      requestedLanguageCode: "en",
      requestedPodcastVersionId: "v-nl-1",
      activePodcastLanguageCode: "en",
    });

    expect(result).toEqual({
      selectedPodcastLanguage: "nl",
      selectedPodcastVersionId: "v-nl-1",
    });
  });

  it("falls back to the active or first available language when the requested version is missing", () => {
    const result = resolvePodcastSelection({
      podcastVersions: [
        { id: "v-nl-2", languageCode: "nl", status: "completed" },
        { id: "v-fr-1", languageCode: "fr", status: "completed" },
      ],
      requestedLanguageCode: "de",
      requestedPodcastVersionId: "missing",
      activePodcastLanguageCode: "fr",
    });

    expect(result).toEqual({
      selectedPodcastLanguage: "fr",
      selectedPodcastVersionId: "v-fr-1",
    });
  });

  it("returns lesson-scoped reset defaults for the action menu", () => {
    expect(getLessonActionMenuResetState("lesson-123")).toEqual({
      viewContentLangLessonId: "lesson-123",
      sourceContentLangLessonId: "lesson-123",
      contentDiffLessonId: "lesson-123",
      uploadContentTargetLessonId: "lesson-123",
      selectedSourceVersion: "current",
      selectedDocVersion: "current",
      compareBaseVersionId: "current",
      compareTargetVersionId: "current",
      feedbackMode: "quick",
    });
  });
});
