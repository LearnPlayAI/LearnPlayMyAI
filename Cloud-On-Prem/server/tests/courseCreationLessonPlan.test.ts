import { describe, expect, it } from "@jest/globals";
import { normalizeCourseCreationLessonPlan } from "../services/courseCreationLessonPlan";

describe("course creation lesson plan normalization", () => {
  it("keeps selected outline headings as content lessons even when their titles mention overview or key takeaways", () => {
    const normalized = normalizeCourseCreationLessonPlan([
      {
        title: "Overview: LearnPlay at a Glance",
        lessonType: "content",
        isOverview: false,
        sourceContent: "Overview source text",
      },
      {
        title: "Key Takeaways: Why Organisations Choose LearnPlay",
        lessonType: "content",
        isOverview: false,
        sourceContent: "Takeaways source text",
      },
    ]);

    expect(normalized.map((lesson) => lesson.title)).toEqual([
      "Overview",
      "Overview: LearnPlay at a Glance",
      "Key Takeaways: Why Organisations Choose LearnPlay",
      "Key Takeaways",
    ]);
    expect(normalized[0]).toMatchObject({ lessonType: "overview", sourceContent: "", contentStatus: "placeholder" });
    expect(normalized[1]).toMatchObject({ lessonType: "content", sourceContent: "Overview source text" });
    expect(normalized[2]).toMatchObject({ lessonType: "content", sourceContent: "Takeaways source text" });
    expect(normalized[3]).toMatchObject({ lessonType: "key_takeaways", sourceContent: "", contentStatus: "placeholder" });
  });
});
