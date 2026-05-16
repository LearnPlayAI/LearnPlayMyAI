import { describe, expect, it } from "@jest/globals";
import {
  buildLessonVariantSearchParams,
  getPreferredPodcastVersionId,
  resolveLessonViewerBackTarget,
  resolvePodcastSelection,
} from "../lib/lessonNavigationState";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("lesson viewer navigation helpers", () => {
  it("builds language-switch query params with languageCode and returnTo preserved", () => {
    const result = buildLessonVariantSearchParams({
      courseId: "course-123",
      returnTo: "/course-builder/course-123/lessons",
      languageCode: "NL",
    });

    const params = new URLSearchParams(result);
    expect(params.get("courseId")).toBe("course-123");
    expect(params.get("returnTo")).toBe("/course-builder/course-123/lessons");
    expect(params.get("languageCode")).toBe("nl");
    expect(params.has("lang")).toBe(false);
  });

  it("prefers returnTo for lesson viewer back navigation and falls back to course or browse", () => {
    expect(
      resolveLessonViewerBackTarget({
        returnTo: "/course-builder/course-123/lessons",
        courseId: "course-123",
        courseUrl: "/courses/course-123",
        defaultUrl: "/browse-courses",
      })
    ).toBe("/course-builder/course-123/lessons");

    expect(
      resolveLessonViewerBackTarget({
        returnTo: null,
        courseId: "course-123",
        courseUrl: "/courses/course-123",
        defaultUrl: "/browse-courses",
      })
    ).toBe("/courses/course-123");

    expect(
      resolveLessonViewerBackTarget({
        returnTo: null,
        courseId: null,
        courseUrl: null,
        defaultUrl: "/browse-courses",
      })
    ).toBe("/browse-courses");
  });

  it("prefers the active podcast version for the selected language", () => {
    expect(
      getPreferredPodcastVersionId({
        podcastVersions: [
          { id: "v-nl-1", languageCode: "nl", status: "completed", createdAt: "2025-01-01T00:00:00.000Z" },
          { id: "v-nl-2", languageCode: "nl", status: "completed", createdAt: "2025-01-02T00:00:00.000Z", isActive: true },
          { id: "v-en-1", languageCode: "en", status: "completed", createdAt: "2025-01-03T00:00:00.000Z" },
        ],
        languageCode: "nl",
        activePodcastVersionId: "v-nl-2",
      })
    ).toBe("v-nl-2");

    expect(
      getPreferredPodcastVersionId({
        podcastVersions: [
          { id: "v-nl-1", languageCode: "nl", status: "completed", createdAt: "2025-01-01T00:00:00.000Z" },
          { id: "v-nl-2", languageCode: "nl", status: "completed", createdAt: "2025-01-02T00:00:00.000Z" },
          { id: "v-nl-3", languageCode: "nl", status: "completed", createdAt: "2025-01-03T00:00:00.000Z" },
        ],
        languageCode: "nl",
        activePodcastVersionId: null,
      })
    ).toBe("v-nl-3");
  });

  it("keeps podcast selection aligned to the requested or active version", () => {
    expect(
      resolvePodcastSelection({
        podcastVersions: [
          { id: "v-en-1", languageCode: "en", status: "completed", createdAt: "2025-01-01T00:00:00.000Z" },
          { id: "v-nl-1", languageCode: "nl", status: "completed", createdAt: "2025-01-02T00:00:00.000Z", isActive: true },
          { id: "v-nl-2", languageCode: "nl", status: "completed", createdAt: "2025-01-03T00:00:00.000Z" },
        ],
        requestedLanguageCode: "nl",
        requestedPodcastVersionId: null,
        activePodcastLanguageCode: "nl",
        activePodcastVersionId: "v-nl-1",
      })
    ).toEqual({
      selectedPodcastLanguage: "nl",
      selectedPodcastVersionId: "v-nl-1",
    });

    expect(
      resolvePodcastSelection({
        podcastVersions: [
          { id: "v-en-1", languageCode: "en", status: "completed", createdAt: "2025-01-01T00:00:00.000Z" },
          { id: "v-nl-1", languageCode: "nl", status: "completed", createdAt: "2025-01-02T00:00:00.000Z" },
        ],
        requestedLanguageCode: "en",
        requestedPodcastVersionId: "v-nl-1",
        activePodcastLanguageCode: "en",
        activePodcastVersionId: "v-en-1",
      })
    ).toEqual({
      selectedPodcastLanguage: "nl",
      selectedPodcastVersionId: "v-nl-1",
    });
  });

  it("places podcast playback in public fullscreen and authenticated desktop lesson headers", () => {
    const source = readSource("client/src/pages/LessonViewer.tsx");

    expect(source).toContain("renderCompactPodcastPlayer");
    expect(source).toContain('data-testid={`${dataTestId}-container`}');
    expect(source).toContain('audio-showcase-lesson-podcast-fullscreen');
    expect(source).toContain('audio-authenticated-lesson-podcast-topbar');
    expect(source).toContain('audio-authenticated-lesson-podcast-fullscreen');
    expect(source).toContain('button-authenticated-media-fullscreen-desktop');
    expect(source).toContain('${hasPlayablePodcast ? "xl:hidden" : ""}');
    expect(source).toContain('lesson_viewer_authenticated_topbar');
    expect(source).toContain('lesson_viewer_showcase_fullscreen');
    expect(source).toContain('lesson_viewer_authenticated_fullscreen');
  });

  it("frames authenticated guided lesson text as a panel below the media", () => {
    const source = readSource("client/src/pages/LessonViewer.tsx");

    expect(source).toContain("Guided Lesson Text - Below player");
    expect(source).toContain("mx-[var(--space-md)] my-[var(--space-md)] max-w-6xl rounded-lg border border-border bg-card");
    expect(source).toContain("View source chunks");
  });

  it("keeps the authenticated top bar compact around the podcast player", () => {
    const source = readSource("client/src/pages/LessonViewer.tsx");

    expect(source).toContain("flex-[0_1_18rem]");
    expect(source).toContain("${isUsingCachedContent ? 'top-10' : 'top-0'}");
    expect(source).toContain("${isUsingCachedContent ? 'pt-28' : 'pt-20'}");
    expect(source).toContain("audio-authenticated-lesson-podcast-topbar");
    expect(source).toContain("button-authenticated-media-fullscreen-desktop");
    expect(source).not.toContain('data-testid="button-download"');
    expect(source).not.toContain("LessonVersionHistory");
  });

  it("keeps authenticated lesson media from covering the guided text panel", () => {
    const source = readSource("client/src/pages/LessonViewer.tsx");

    expect(source).toContain("max-w-[min(100%,calc((100vh-10rem)*1.777))]");
    expect(source).toContain("max-h-[calc(100vh-10rem)]");
    expect(source).toContain("mx-[var(--space-md)] my-[var(--space-md)] max-w-6xl");
    expect(source).toContain("button-collapse-lesson-side-panel");
    expect(source).toContain("button-expand-lesson-side-panel");
  });
});
