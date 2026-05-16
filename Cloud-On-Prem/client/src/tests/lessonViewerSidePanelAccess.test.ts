import { describe, expect, it } from "@jest/globals";
import fs from "fs";
import path from "path";

describe("LessonViewer side panel access", () => {
  it("exposes a mobile accessible trigger for the lesson side panel", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/pages/LessonViewer.tsx"),
      "utf8",
    );

    expect(source).toContain('data-testid="button-open-lesson-side-panel"');
    expect(source).toContain('aria-label="Open lesson side panel"');
    expect(source).toContain('data-testid="lesson-side-panel-mobile"');
  });
});
