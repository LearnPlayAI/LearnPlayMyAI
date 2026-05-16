import { describe, expect, test } from "@jest/globals";
import { buildSourceLessonMaterialV2 } from "@shared/sourceLessonMaterialV2";
import { resolveViewerSourceLessonMaterial } from "../services/sourceLessonViewerMaterialService";

describe("source lesson material V2 viewer resolution", () => {
  test("returns stored V2 material when present", () => {
    const storedV2 = buildSourceLessonMaterialV2({
      lessonId: "lesson-1",
      title: "Provide for Wheelchairs",
      sourceDocumentId: "source-doc-1",
      sourceDocumentName: "Grade 9 Technology.pdf",
      sourceDocumentType: "pdf",
      sourceText: "CHAPTER 2: PROVIDE FOR WHEELCHAIRS\n2.1 Stairs and a ramp\nThe stage is 400 mm high.",
      sourceRange: { pageStart: 20, pageEnd: 25 },
    });

    const resolved = resolveViewerSourceLessonMaterial({
      lesson: {
        id: "lesson-1",
        title: "Provide for Wheelchairs",
        inputText: "raw text that should not be rebuilt when V2 exists",
        metadata: { sourceLessonContentV2: storedV2 },
      },
      sourceAssets: [],
    });

    expect(resolved?.version).toBe(2);
    expect(resolved).toEqual(storedV2);
  });

  test("falls back to V1 material when V2 is absent", () => {
    const resolved = resolveViewerSourceLessonMaterial({
      lesson: {
        id: "lesson-1",
        title: "Provide for Wheelchairs",
        inputText: "2.1 Stairs and a ramp\nThe stage is 400 mm high.",
        metadata: { objectives: ["Apply ramp specifications"] },
      },
      sourceAssets: [],
    });

    expect(resolved?.version).toBe(1);
    expect(resolved?.sections?.[0]?.title).toBe("Stairs and a ramp");
  });
});
