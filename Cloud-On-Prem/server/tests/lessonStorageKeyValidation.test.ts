import { describe, expect, test } from "@jest/globals";
import { buildCanonicalStorageKey } from "../utils/storageKeyManager";
import { lessonPptxStorageKeyMatchesVersion } from "../utils/lessonStorageKeyValidation";

describe("lessonStorageKeyValidation", () => {
  const base = {
    organizationId: "org-1",
    lessonId: "lesson-1",
    languageCode: "en",
    version: 3,
  };

  test("accepts canonical key that matches lesson/version/language seed", () => {
    const storageKey = buildCanonicalStorageKey({
      scope: "private",
      domain: "lsn-pptx",
      extension: ".pptx",
      seed: "lesson-pptx:org-1:lesson-1:en:v3",
    });

    expect(
      lessonPptxStorageKeyMatchesVersion({
        ...base,
        storageKey,
      })
    ).toBe(true);
  });

  test("rejects canonical key for different version", () => {
    const storageKey = buildCanonicalStorageKey({
      scope: "private",
      domain: "lsn-pptx",
      extension: ".pptx",
      seed: "lesson-pptx:org-1:lesson-1:en:v2",
    });

    expect(
      lessonPptxStorageKeyMatchesVersion({
        ...base,
        storageKey,
      })
    ).toBe(false);
  });

  test("accepts legacy versioned path", () => {
    expect(
      lessonPptxStorageKeyMatchesVersion({
        ...base,
        storageKey: "/private/lessons/org-1/lesson-1/en/v3.pptx",
      })
    ).toBe(true);
  });

  test("rejects legacy path with wrong version", () => {
    expect(
      lessonPptxStorageKeyMatchesVersion({
        ...base,
        storageKey: "/private/lessons/org-1/lesson-1/en/v9.pptx",
      })
    ).toBe(false);
  });
});
