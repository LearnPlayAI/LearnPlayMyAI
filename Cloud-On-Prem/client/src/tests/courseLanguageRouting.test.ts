import { describe, expect, it } from "@jest/globals";
import {
  buildCourseHref,
  buildCourseLessonsHref,
  buildMyCoursesUrl,
  getRequestedLanguageCodeFromSearch,
} from "../lib/courseLanguageRouting";

describe("course language routing helpers", () => {
  it("reads languageCode and falls back to legacy lang", () => {
    expect(getRequestedLanguageCodeFromSearch("?languageCode=NL&lang=fr")).toBe("nl");
    expect(getRequestedLanguageCodeFromSearch("?lang=FR")).toBe("fr");
    expect(getRequestedLanguageCodeFromSearch("")).toBeNull();
  });

  it("builds course hrefs with canonical languageCode query", () => {
    expect(buildCourseHref("course-1", "PT")).toBe("/courses/course-1?languageCode=pt");
    expect(buildCourseHref("course-1", null)).toBe("/courses/course-1");
  });

  it("builds lesson hrefs with explicit languageCode when provided", () => {
    expect(
      buildCourseLessonsHref({
        lessonId: "lesson-1",
        courseId: "course-1",
        languageCode: "NL",
      })
    ).toBe("/lessons/lesson-1?courseId=course-1&languageCode=nl");

    expect(
      buildCourseLessonsHref({
        lessonId: "lesson-1",
        courseId: "course-1",
        languageCode: "en",
        demo: true,
      })
    ).toBe("/lessons/lesson-1?courseId=course-1&demo=true&languageCode=en");
  });

  it("builds /api/my-courses URL with limit and offset pagination", () => {
    expect(buildMyCoursesUrl(1, 20)).toBe("/api/my-courses?limit=20&offset=0");
    expect(buildMyCoursesUrl(3, 20)).toBe("/api/my-courses?limit=20&offset=40");
  });
});
