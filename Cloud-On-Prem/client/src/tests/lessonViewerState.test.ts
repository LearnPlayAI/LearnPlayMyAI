import { describe, expect, it } from "@jest/globals";
import {
  buildLessonLanguageOptions,
  hasRenderableLessonContent,
} from "../lib/lessonViewerState";

describe("lesson viewer state", () => {
  it("keeps a source language switch option when the language list only contains the selected variant", () => {
    const result = buildLessonLanguageOptions({
      availableLanguages: [
        {
          code: "af",
          name: "Afrikaans",
          nativeName: "Afrikaans",
          lessonId: "lesson-af",
          isDefault: false,
        },
      ],
      artifactResolution: {
        sourceLanguageCode: "en",
        pptx: {
          resolvedLessonId: "lesson-en",
          isFallback: true,
        },
      },
    });

    expect(result).toEqual([
      {
        code: "af",
        name: "Afrikaans",
        nativeName: "Afrikaans",
        lessonId: "lesson-af",
        isDefault: false,
      },
      {
        code: "en",
        name: "EN",
        nativeName: "EN",
        lessonId: "lesson-en",
        isDefault: true,
      },
    ]);
  });

  it("treats a pending pptx conversion as renderable lesson content", () => {
    expect(
      hasRenderableLessonContent({
        hasPPTX: true,
        isLocalPptx: true,
        conversionStatus: "pending",
      })
    ).toBe(true);
  });

  it("treats native source lesson content as renderable without a pptx", () => {
    expect(
      hasRenderableLessonContent({
        sourceLessonSectionCount: 3,
        sourceLessonVisualCount: 8,
      })
    ).toBe(true);
  });
});
