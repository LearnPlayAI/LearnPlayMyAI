import { describe, expect, test } from "@jest/globals";
import {
  generatedLessonSchema,
  sourceAssetRefSchema,
  sourceAssetSchema,
} from "../shared/courseFrameworkContracts";
import {
  courseSourceAssetLinks,
  courseSourceAssets,
  courseSourceDocuments,
} from "../shared/schema";

describe("source asset contracts", () => {
  test("accepts extracted PDF image asset metadata", () => {
    const parsed = sourceAssetSchema.parse({
      id: "asset-1",
      sourceDocumentId: "doc-1",
      assetType: "image",
      storageKey: "/private/source-assets/org/course/doc/page-7-figure-1.png",
      mimeType: "image/png",
      pageOrSlide: 7,
      caption: "Figure 1",
      altText: "Orthographic drawing example",
      width: 900,
      height: 650,
      extractionMethod: "pdfimages",
      containsEmbeddedText: false,
    });

    expect(parsed.pageOrSlide).toBe(7);
  });

  test("allows generated lessons to carry source asset references", () => {
    const parsed = generatedLessonSchema.parse({
      title: "Orthographic drawing",
      description: "Learn top, side, and front views.",
      objectives: ["Identify top, side, and front views"],
      sourceAssets: [
        {
          assetId: "asset-1",
          recommendedUse: "lesson_visual",
          caption: "Figure 1",
          pageOrSlide: 7,
        },
      ],
    });

    expect(parsed.sourceAssets?.[0]?.recommendedUse).toBe("lesson_visual");
  });

  test("rejects invalid source asset usage labels", () => {
    expect(() =>
      sourceAssetRefSchema.parse({
        assetId: "asset-1",
        recommendedUse: "translate_image",
      }),
    ).toThrow();
  });

  test("source document tables expose expected columns", () => {
    expect(courseSourceDocuments.organizationId).toBeDefined();
    expect(courseSourceDocuments.originalStoragePath).toBeDefined();
    expect(courseSourceAssets.storageKey).toBeDefined();
    expect(courseSourceAssets.pageOrSlide).toBeDefined();
    expect(courseSourceAssetLinks.linkedEntityType).toBeDefined();
  });
});
