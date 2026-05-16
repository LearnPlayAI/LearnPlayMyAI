import { describe, expect, it } from "@jest/globals";
import fs from "fs";
import path from "path";

function readSource(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

describe("LessonViewer mobile media layout", () => {
  it("keeps showcase fullscreen controls outside the media frame and uses a landscape theater shell", () => {
    const source = readSource("client/src/pages/LessonViewer.tsx");

    expect(source).toContain('data-testid="showcase-media-fullscreen-shell"');
    expect(source).toContain("supports-[height:100dvh]:h-[100dvh]");
    expect(source).toContain("landscape:flex-row");
    expect(source).toContain('data-testid="button-showcase-media-fullscreen-floating"');
    expect(source).toContain('aria-label="View media fullscreen"');
    expect(source).not.toContain("absolute right-3 bottom-3 z-30 min-h-[44px]");
  });

  it("lets slide images fill available fullscreen height without forcing nested rounded frames", () => {
    const source = readSource("client/src/components/SlideImageViewer.tsx");

    expect(source).toContain("fillMode?: boolean");
    expect(source).toContain("fillMode ? \"h-full\"");
    expect(source).toContain("fillMode ? \"h-full rounded-none\"");
  });

  it("gives authenticated mobile learners a dedicated media fullscreen action and theater overlay", () => {
    const source = readSource("client/src/pages/LessonViewer.tsx");

    expect(source).toContain('data-testid="button-authenticated-media-fullscreen-mobile"');
    expect(source).toContain('data-testid="button-authenticated-media-fullscreen-desktop"');
    expect(source).toContain('aria-label="View lesson media fullscreen"');
    expect(source).toContain('data-testid="authenticated-media-fullscreen"');
    expect(source).toContain('data-testid="authenticated-media-fullscreen-shell"');
    expect(source).toContain("isMediaFullscreen ? 'hidden' : 'xl:hidden'");
  });
});
