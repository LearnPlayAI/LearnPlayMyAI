import { describe, expect, test } from "@jest/globals";
import { buildFinalizedSourceLessonMaterialV2 } from "../services/sourceLessonMaterialV2Service";

describe("source lesson material V2 finalization", () => {
  test("builds V2 while preserving raw Source DB text", () => {
    const rawSource = [
      "CHAPTER 2: PROVIDE FOR WHEELCHAIRS",
      "Figure 2",
      "2.1 Stairs and a ramp",
      "The stage is 400 mm high.",
    ].join("\n");

    const result = buildFinalizedSourceLessonMaterialV2({
      lessonData: {
        title: "Provide for Wheelchairs",
        sourcePageStart: 20,
        sourcePageEnd: 25,
        sourceDocumentName: "Grade 9 Technology.pdf",
      },
      lessonInputText: rawSource,
      lessonSourceAssets: [
        {
          assetId: "figure-2",
          assetType: "image",
          caption: "Figure 2",
          pageOrSlide: 20,
          metadata: { sourceDocumentType: "pdf" },
        },
      ],
      sourceDocumentId: "source-doc-1",
      nextBoundaryTitle: "Chapter 3",
    });

    expect(result.rawInputText).toBe(rawSource);
    expect(result.sourceLessonContentV2?.version).toBe(2);
    expect(result.sourceLessonContentV2?.sourceDocumentType).toBe("pdf");
    expect(result.sourceLessonContentV2?.visualRegistry[0]?.assetIds).toContain("figure-2");
  });

  test("flags finalized material that includes next-chapter contamination", () => {
    const result = buildFinalizedSourceLessonMaterialV2({
      lessonData: {
        title: "Provide for Wheelchairs",
        sourcePageStart: 20,
        sourcePageEnd: 25,
        sourceDocumentName: "Grade 9 Technology.pdf",
      },
      lessonInputText: "CHAPTER 2: PROVIDE FOR WHEELCHAIRS\n2.1 Stairs and a ramp\nChapter 3\nStructures, forces and materials",
      lessonSourceAssets: [],
      sourceDocumentId: "source-doc-1",
      nextBoundaryTitle: "Chapter 3",
    });

    expect(result.sourceLessonContentV2?.quality.valid).toBe(false);
    expect(result.sourceLessonContentV2?.quality.blockingFindings.join("\n")).toContain("next boundary");
  });

  test("restricts source visuals to the selected source range", () => {
    const result = buildFinalizedSourceLessonMaterialV2({
      lessonData: {
        title: "Provide for Wheelchairs",
        sourcePageStart: 20,
        sourcePageEnd: 25,
        sourceDocumentName: "Grade 9 Technology.pdf",
      },
      lessonInputText: "CHAPTER 2: PROVIDE FOR WHEELCHAIRS\nFigure 2\n2.1 Stairs and a ramp",
      lessonSourceAssets: [
        { assetId: "figure-2", assetType: "image", caption: "Figure 2", pageOrSlide: 20, metadata: { sourceDocumentType: "pdf" } },
        { assetId: "chapter-3-bridge", assetType: "image", caption: "Figure 1: Bridge", pageOrSlide: 26, metadata: { sourceDocumentType: "pdf" } },
      ],
      sourceDocumentId: "source-doc-1",
      nextBoundaryTitle: "Chapter 3",
    });

    expect(JSON.stringify(result.sourceLessonContentV2)).toContain("figure-2");
    expect(JSON.stringify(result.sourceLessonContentV2)).not.toContain("chapter-3-bridge");
  });
});
