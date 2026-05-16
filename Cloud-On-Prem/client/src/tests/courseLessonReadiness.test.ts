import { describe, expect, it } from "@jest/globals";
import { getContentLessonReadiness, hasNativeSourceLessonMaterial } from "../lib/courseLessonReadiness";

describe("course lesson readiness", () => {
  it("treats extracted source text as learner-viewable native lesson material", () => {
    const readiness = getContentLessonReadiness({
      inputText: "Orthographic drawing uses front, top, and side views.",
    });

    expect(readiness.hasNativeMaterial).toBe(true);
    expect(readiness.hasLessonContent).toBe(true);
    expect(readiness.digestKind).toBe("recommended");
    expect(readiness.presentationKind).toBe("recommended");
    expect(readiness.quizStatus).toBe("todo");
  });

  it("recognizes persisted source lesson content even when raw source text is not present", () => {
    expect(
      hasNativeSourceLessonMaterial({
        metadata: {
          sourceLessonContentV1: {
            summary: { sectionCount: 2, visualCount: 4 },
          },
        },
      })
    ).toBe(true);
  });

  it("keeps legacy document-only lessons on the stricter readiness path", () => {
    const readiness = getContentLessonReadiness({
      sourceDocumentPath: "uploads/source.docx",
    });

    expect(readiness.hasNativeMaterial).toBe(false);
    expect(readiness.hasLessonContent).toBe(true);
    expect(readiness.digestKind).toBe("required");
    expect(readiness.presentationKind).toBe("required");
    expect(readiness.quizStatus).toBe("todo");
  });
});
