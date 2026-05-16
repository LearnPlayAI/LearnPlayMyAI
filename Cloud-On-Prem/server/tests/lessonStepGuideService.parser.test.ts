import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../db", () => ({
  db: {
    select: jest.fn(),
    update: jest.fn(),
  },
}));

import { stepGuideParserTestUtils } from "../services/lessonStepGuideService";

describe("LessonStepGuideService parser grouping", () => {
  it("keeps same-block step text and image together", () => {
    const html = [
      '<p>1. Open terminal <img src="/uploads/public/guide-step-1.png" /></p>',
      "<p>npm install</p>",
      "<p>2. Start the app</p>",
      '<p><img src="/uploads/public/guide-step-2.png" /></p>',
    ].join("");

    const steps = stepGuideParserTestUtils.buildStepsFromHtml(html);

    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps[0].content).toContain("Open terminal");
    expect(steps[0].imageUrls).toContain("/uploads/public/guide-step-1.png");
    expect(steps[0].commands).toContain("npm install");
  });

  it("maps table rows into logically grouped steps", () => {
    const html = `
      <table>
        <tr><th>Step</th><th>Command</th><th>Image</th></tr>
        <tr>
          <td>1. Prepare repo</td>
          <td><pre><code>git status</code></pre></td>
          <td><img src="/uploads/public/row-1.png" /></td>
        </tr>
        <tr>
          <td>2. Install deps</td>
          <td><pre><code>npm ci</code></pre></td>
          <td><img src="/uploads/public/row-2.png" /></td>
        </tr>
      </table>
    `;

    const steps = stepGuideParserTestUtils.buildStepsFromHtml(html);

    expect(steps.length).toBe(2);
    expect(steps[0].content).toContain("Prepare repo");
    expect(steps[0].commands).toContain("git status");
    expect(steps[0].imageUrls).toContain("/uploads/public/row-1.png");
    expect(steps[1].content).toContain("Install deps");
    expect(steps[1].commands).toContain("npm ci");
    expect(steps[1].imageUrls).toContain("/uploads/public/row-2.png");
  });

  it("does not evenly spread unmatched fallback images across unrelated text chunks", () => {
    const rawText = "1. First step\nDo the first thing.\n\n2. Second step\nDo the second thing.";
    const imageUrls = ["/uploads/public/a.png", "/uploads/public/b.png"];

    const steps = stepGuideParserTestUtils.buildSteps(rawText, imageUrls);

    expect(steps.length).toBe(2);
    expect(steps[0].imageUrls).toEqual(["/uploads/public/a.png", "/uploads/public/b.png"]);
    expect(steps[1].imageUrls).toEqual([]);
  });
});
