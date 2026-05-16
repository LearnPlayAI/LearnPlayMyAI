import { describe, expect, it } from "@jest/globals";
import { buildSourceLessonContent } from "../../../shared/sourceLessonContent";

describe("source lesson content builder", () => {
  it("builds learner-facing sections from source text and maps visuals by page", () => {
    const content = buildSourceLessonContent({
      lessonId: "lesson-1",
      title: "Structures, Forces and Materials",
      sourceText: [
        "Page 29",
        "CHAPTER 3: STRUCTURES, FORCES AND MATERIALS",
        "3.1 Forces act in different places",
        "When one object pushes against another object, we say that a force is exerted on the object.",
        "1. Work in pairs. Show your partner how the load acts on the structure.",
        "TECHNOLOGY GRADE 9 TERM 1",
        "3.2 Forces act in different ways",
        "A force can stretch, bend, twist or compress a material.",
      ].join("\n"),
      objectives: ["Apply forces to structures"],
      sourceAssets: [
        { assetId: "asset-29", caption: "Figure 4 presses down on the chair.", pageOrSlide: 29, signedUrl: "/a.png" },
        { assetId: "asset-30", caption: "Figure 7: Vehicles passing over a bridge", pageOrSlide: 30, signedUrl: "/b.png" },
      ],
    });

    expect(content.sections.map((section) => section.title)).toEqual([
      "Forces act in different places",
      "Forces act in different ways",
    ]);
    expect(content.sections[0].paragraphs[0]).toContain("force is exerted");
    expect(content.sections[0].activities[0].prompt).toContain("Work in pairs");
    expect(content.sections[0].visuals.map((visual) => visual.assetId)).toContain("asset-29");
    expect(content.sections[0].paragraphs.join(" ")).not.toContain("TECHNOLOGY GRADE 9 TERM 1");
    expect(content.summary.totalVisuals).toBe(2);
  });
});
