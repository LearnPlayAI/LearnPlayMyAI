import { describe, expect, test } from "@jest/globals";
import { SourceAssetService } from "../services/sourceAssetService";

describe("SourceAssetService", () => {
  test("builds source asset refs for a draft lesson", () => {
    const refs = SourceAssetService.toLessonSourceAssetRefs(
      [
        {
          id: "asset-1",
          sourceDocumentId: "doc-1",
          caption: "Figure 1",
          altText: "Cube drawing",
          pageOrSlide: 7,
        } as any,
      ],
      "lesson_visual",
    );

    expect(refs).toEqual([
      {
        assetId: "asset-1",
        recommendedUse: "lesson_visual",
        caption: "Figure 1",
        altText: "Cube drawing",
        pageOrSlide: 7,
      },
    ]);
  });

  test("ignores empty asset ids when building lesson refs", () => {
    const refs = SourceAssetService.toLessonSourceAssetRefs(
      [
        { id: "", caption: "Empty" } as any,
        { id: "asset-2", pageOrSlide: null } as any,
      ],
      "quiz_stimulus",
    );

    expect(refs).toEqual([
      {
        assetId: "asset-2",
        recommendedUse: "quiz_stimulus",
        caption: null,
        altText: null,
        pageOrSlide: null,
      },
    ]);
  });
});
