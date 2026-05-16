import { describe, expect, test } from "@jest/globals";
import {
  buildSourceLessonMaterialV2,
  validateSourceLessonMaterialV2,
  type SourceLessonMaterialV2Asset,
} from "@shared/sourceLessonMaterialV2";

const chapter2Text = [
  "CHAPTER 2: PROVIDE FOR WHEELCHAIRS",
  "stairs ramp",
  "Figure 2",
  "2.1 Stairs and a ramp",
  "Nelson Mandela High School has a new community hall.",
  "Look at the picture on the previous page to see what a ramp is.",
  "The specifications for the staircase and wheelchair ramp are:",
  "• The stage is 400 mm high.",
  "• The ramp should be wide enough for one wheelchair - 1 000 mm.",
  "2.2 Isometric drawing",
  "There is an isometric drawing of a staircase in Chapter 1.",
  "Figure 4",
  "An isometric drawing of the wheelchair ramp",
  "2.3 The plan in orthographic drawings",
  "Sketch the staircase",
].join("\n");

const chapter2WithLeak = `${chapter2Text}\nChapter 3\nStructures, forces and materials\n3.1 Forces act in different places`;

const noisyChapter2Text = [
  "CHAPTER 2: PROVIDE FOR WHEELCHAIRS",
  "stairs ramp",
  "Figure 2",
  "2.1 Stairs and a ramp",
  "Nelson Mandela High School has a new community",
  "hall. A staircase and wheelchair ramp is needed for",
  "Look at the picture on the",
  "previous page to see what a",
  "ramp is.",
  "CHAPTER 2: PROVIDE FOR WHEELCHAIRS",
  "2.2 Isometric drawing",
  "There is an isometric drawing of a staircase in Chapter 1.",
  "Next week",
  "In the next chapter, you will learn more about different kinds of forces that may",
  "3.1 Forces act in different places .......................................................................................... 24",
  "3.2 Forces act in different ways ............................................................................................ 27",
].join("\n");

const assets: SourceLessonMaterialV2Asset[] = [
  {
    assetId: "asset-figure-2",
    assetType: "image",
    caption: "Figure 2",
    altText: "Mobile staircase and wheelchair ramp",
    pageOrSlide: 20,
    metadata: { sourceDocumentType: "pdf", textBefore: "stairs ramp", textAfter: "CHAPTER 2" },
  },
  {
    assetId: "asset-figure-4",
    assetType: "image",
    caption: "Figure 4",
    altText: "Slice of cake ramp sketch",
    pageOrSlide: 23,
    metadata: { sourceDocumentType: "pdf" },
  },
  {
    assetId: "asset-chapter-3",
    assetType: "image",
    caption: "Figure 1: This bridge cannot withstand the forces acting on it.",
    altText: "Bridge from Chapter 3",
    pageOrSlide: 26,
    metadata: { sourceDocumentType: "pdf" },
  },
];

describe("source lesson material V2", () => {
  test("builds bounded PDF material and attaches figures by explicit and previous-page references", () => {
    const material = buildSourceLessonMaterialV2({
      lessonId: "lesson-2",
      title: "Provide for Wheelchairs",
      sourceDocumentId: "source-doc-1",
      sourceDocumentName: "Grade 9 Technology.pdf",
      sourceDocumentType: "pdf",
      sourceText: chapter2Text,
      objectives: ["Apply stairs and a ramp using the source material"],
      sourceAssets: assets,
      sourceRange: { pageStart: 20, pageEnd: 25 },
      nextBoundaryTitle: "Chapter 3",
    });

    expect(material.version).toBe(2);
    expect(material.sections.map((section) => section.title)).toEqual([
      "Provide for Wheelchairs",
      "Stairs and a ramp",
      "Isometric drawing",
      "The plan in orthographic drawings",
    ]);
    expect(JSON.stringify(material)).not.toContain("asset-chapter-3");
    expect(material.visualRegistry.map((visual) => visual.assetIds[0])).toEqual([
      "asset-figure-2",
      "asset-figure-4",
    ]);

    const firstSectionBlocks = material.sections[0].blocks;
    const openingVisual = firstSectionBlocks.find((block) => block.type === "figure");
    expect(openingVisual?.assetIds).toContain("asset-figure-2");

    const stairsSection = material.sections.find((section) => section.title === "Stairs and a ramp");
    const previousPageFigure = stairsSection?.blocks.find(
      (block) => block.type === "figure" && block.assetIds?.includes("asset-figure-2"),
    );
    expect(previousPageFigure).toBeDefined();
  });

  test("reports blocking contamination when next chapter text appears in a selected lesson", () => {
    const material = buildSourceLessonMaterialV2({
      lessonId: "lesson-2",
      title: "Provide for Wheelchairs",
      sourceDocumentId: "source-doc-1",
      sourceDocumentName: "Grade 9 Technology.pdf",
      sourceDocumentType: "pdf",
      sourceText: chapter2WithLeak,
      sourceAssets: assets,
      sourceRange: { pageStart: 20, pageEnd: 25 },
      nextBoundaryTitle: "Chapter 3",
    });

    const validation = validateSourceLessonMaterialV2(material);
    expect(validation.valid).toBe(false);
    expect(validation.blockingFindings.join("\n")).toContain("next boundary");
  });

  test("filters repeated headers, next-chapter preview, TOC entries, and far duplicate figure numbers", () => {
    const material = buildSourceLessonMaterialV2({
      lessonId: "lesson-2",
      title: "Provide for Wheelchairs",
      sourceDocumentId: "source-doc-1",
      sourceDocumentName: "Grade 9 Technology.pdf",
      sourceDocumentType: "pdf",
      sourceText: noisyChapter2Text,
      sourceAssets: [
        {
          assetId: "page-21-ramp",
          assetType: "image",
          caption: "Page 21",
          altText: "House entrance with ramp",
          pageOrSlide: 21,
          metadata: { sourceDocumentType: "pdf" },
        },
        {
          assetId: "far-figure-2",
          assetType: "image",
          caption: "Figure 2: If the house is not strong enough, the wind may break it apart.",
          altText: "Unrelated Chapter 3 figure",
          pageOrSlide: 27,
          metadata: { sourceDocumentType: "pdf" },
        },
      ],
      sourceRange: { pageStart: 21, pageEnd: 28 },
    });

    const serialized = JSON.stringify(material);
    expect(material.sections.map((section) => section.title)).toEqual([
      "Provide for Wheelchairs",
      "Stairs and a ramp",
      "Isometric drawing",
    ]);
    expect(serialized).not.toContain("Forces act in different places");
    expect(serialized).not.toContain("Next week");
    expect(serialized).not.toContain("far-figure-2");
    expect(
      material.sections.some((section) =>
        section.blocks.some((block) => block.type === "figure" && block.assetIds?.includes("page-21-ramp")),
      ),
    ).toBe(true);
  });

  test("attaches DOCX embedded images to nearby heading content", () => {
    const material = buildSourceLessonMaterialV2({
      lessonId: "docx-lesson",
      title: "Safe Workshop Tools",
      sourceDocumentId: "docx-source",
      sourceDocumentName: "tools.docx",
      sourceDocumentType: "docx",
      sourceText: "Safe Workshop Tools\nFigure 1: Wear goggles\nUse goggles when cutting materials.",
      sourceAssets: [
        {
          assetId: "docx-image-1",
          assetType: "image",
          caption: "Figure 1: Wear goggles",
          altText: "Learner wearing goggles",
          metadata: { sourceDocumentType: "docx", headingPath: ["Safe Workshop Tools"], documentOrdinal: 1 },
        },
      ],
      sourceRange: { pageStart: 1, pageEnd: 1 },
    });

    expect(material.sourceDocumentType).toBe("docx");
    expect(material.visualRegistry[0]?.assetIds).toContain("docx-image-1");
    expect(material.sections[0]?.blocks.some((block) => block.assetIds?.includes("docx-image-1"))).toBe(true);
  });

  test("attaches PPTX images to slide-derived sections", () => {
    const material = buildSourceLessonMaterialV2({
      lessonId: "pptx-lesson",
      title: "Bridge Forces",
      sourceDocumentId: "pptx-source",
      sourceDocumentName: "bridge.pptx",
      sourceDocumentType: "pptx",
      sourceText: "Slide 2: Bridge Forces\nCompression and tension act on bridges.",
      sourceAssets: [
        {
          assetId: "slide-image-2",
          assetType: "image",
          caption: "Slide 2 image",
          altText: "Bridge force diagram",
          pageOrSlide: 2,
          metadata: { sourceDocumentType: "pptx", slide: 2 },
        },
      ],
      sourceRange: { slideStart: 2, slideEnd: 2 },
    });

    expect(material.sourceDocumentType).toBe("pptx");
    expect(material.sections[0]?.sourceSlideStart).toBe(2);
    expect(material.sections[0]?.blocks.some((block) => block.assetIds?.includes("slide-image-2"))).toBe(true);
  });
});
