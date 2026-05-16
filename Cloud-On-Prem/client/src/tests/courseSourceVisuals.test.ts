import { describe, expect, it } from "@jest/globals";
import { cleanLessonSourceContent, groupSourceVisualsForLesson } from "../utils/courseSourceVisuals";

describe("course source visual grouping", () => {
  it("recommends visuals captured from the lesson page range before unrelated assets", () => {
    const lesson = {
      sourcePageStart: 20,
      sourcePageEnd: 28,
      sourceOutlineNodeId: "chapter-2",
      sourceAssets: [{ assetId: "manual" }],
    };
    const assets = [
      { id: "cover", assetType: "image", pageOrSlide: 1, caption: "Cover" },
      { id: "same-range", assetType: "image", pageOrSlide: 21, caption: "Figure 2" },
      { id: "manual", assetType: "image", pageOrSlide: 58, caption: "Manual pick" },
      { id: "same-node", assetType: "page_snapshot", pageOrSlide: 20, caption: "Page 20", metadata: { outlineNodeId: "chapter-2" } },
      { id: "other", assetType: "image", pageOrSlide: 35, caption: "Figure 3" },
    ];

    const groups = groupSourceVisualsForLesson(lesson, assets);

    expect(groups.linked.map((asset) => asset.id)).toEqual(["manual"]);
    expect(groups.recommended.map((asset) => asset.id)).toEqual(["same-node", "same-range"]);
    expect(groups.other.map((asset) => asset.id)).toEqual(["other", "cover"]);
  });

  it("keeps linked visuals visible while still showing other page-related candidates", () => {
    const lesson = {
      sourcePageStart: 10,
      sourcePageEnd: 12,
      sourceAssets: [{ assetId: "linked" }],
    };
    const assets = [
      { id: "linked", assetType: "image", pageOrSlide: 10 },
      { id: "unlinked", assetType: "image", pageOrSlide: 11 },
      { id: "unrelated", assetType: "image", pageOrSlide: 40 },
    ];

    const groups = groupSourceVisualsForLesson(lesson, assets);

    expect(groups.linked.map((asset) => asset.id)).toEqual(["linked"]);
    expect(groups.recommended.map((asset) => asset.id)).toEqual(["unlinked"]);
    expect(groups.other.map((asset) => asset.id)).toEqual(["unrelated"]);
  });
});

describe("lesson source content cleanup", () => {
  it("removes repeated structural noise without rewriting factual content", () => {
    const cleaned = cleanLessonSourceContent(`
      Figure 1
      CHAPTER 2: PROVIDE FOR WHEELCHAIRS
      TECHNOLOGY GRADE 9 TERM 1
      Isometric drawings
      An isometric drawing can help you to see more clearly what your idea would look like.
      Figure 2
      CHAPTER 2: PROVIDE FOR WHEELCHAIRS
      TECHNOLOGY GRADE 9 TERM 1
      2.2 Isometric drawing........................18
      18
    `);

    expect(cleaned).toContain("CHAPTER 2: PROVIDE FOR WHEELCHAIRS");
    expect(cleaned).toContain("An isometric drawing can help you to see more clearly");
    expect(cleaned.match(/CHAPTER 2/g)).toHaveLength(1);
    expect(cleaned).not.toContain("Figure 1");
    expect(cleaned).not.toContain("........................18");
  });

  it("joins wrapped source lines and stops before next-chapter preview noise", () => {
    const cleaned = cleanLessonSourceContent(`
      2.1 Stairs and a ramp
      Nelson Mandela High School has a new community
      hall. A staircase and wheelchair ramp is needed for
      the stage in the hall.
      Next week
      In the next chapter, you will learn more about forces.
      3.1 Forces act in different places .......................................................................................... 24
    `);

    expect(cleaned).toContain("Nelson Mandela High School has a new community hall.");
    expect(cleaned).not.toContain("Next week");
    expect(cleaned).not.toContain("Forces act in different places");
  });
});
