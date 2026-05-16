import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function expectInOrder(source: string, snippets: string[]) {
  let cursor = -1;
  for (const snippet of snippets) {
    const next = source.indexOf(snippet, cursor + 1);
    expect(next).toBeGreaterThan(cursor);
    cursor = next;
  }
}

describe('Course lessons action guidance contracts', () => {
  const courseLessons = readSource('client/src/pages/CourseLessons.tsx');
  const lessonActionsMenu = readSource('client/src/components/LessonActionsMenu.tsx');
  const courseRoutes = readSource('server/routes/courseRoutes.ts');
  const actionGuidanceStart = courseLessons.indexOf('const items: LessonActionItem[] = []');
  const actionGuidanceSource = courseLessons.slice(actionGuidanceStart);

  it('orders content lesson helper steps by objectives, digest, PPTX, quiz, podcast, then video', () => {
    const contentBlock = actionGuidanceSource.slice(
      actionGuidanceSource.indexOf("if (lessonType === 'content')"),
      actionGuidanceSource.indexOf("if (lessonType === 'key_takeaways')")
    );

    expectInOrder(contentBlock, [
      "id: 'content-objectives'",
      "id: 'content-digest'",
      "id: 'content-pptx'",
      "id: 'content-quiz'",
      "id: 'content-podcast'",
      "id: 'content-video'",
    ]);
  });

  it('orders key takeaways helper steps by source, objectives, digest, PPTX, quiz, podcast, then video', () => {
    const takeawaysStart = actionGuidanceSource.indexOf("if (lessonType === 'key_takeaways')");
    const takeawaysBlock = actionGuidanceSource.slice(
      takeawaysStart,
      actionGuidanceSource.indexOf("if (lessonType === 'overview')", takeawaysStart)
    );

    expectInOrder(takeawaysBlock, [
      "id: 'takeaways-content'",
      "id: 'takeaways-objectives'",
      "id: 'takeaways-digest'",
      "id: 'takeaways-pptx'",
      "id: 'takeaways-quiz'",
      "id: 'takeaways-podcast'",
      "id: 'takeaways-video'",
    ]);
  });

  it('orders overview helper steps by source, objectives, digest, PPTX, podcast, then video', () => {
    const overviewBlock = actionGuidanceSource.slice(
      actionGuidanceSource.indexOf("if (lessonType === 'overview')"),
      actionGuidanceSource.indexOf('return items;')
    );

    expectInOrder(overviewBlock, [
      "id: 'overview-content'",
      "id: 'overview-objectives'",
      "id: 'overview-digest'",
      "id: 'overview-pptx'",
      "id: 'overview-podcast'",
      "id: 'overview-video'",
    ]);
  });

  it('keeps structural lesson menus available before generated Source DB content exists', () => {
    expect(courseLessons).toContain('showUploadContent: true');
    expect(courseLessons).toContain('showUploadVideo: true');
    expect(courseLessons).not.toContain('return { hideMenu: true };');
    expect(lessonActionsMenu).toContain("{showUploadContent && (");
  });

  it('treats uploaded Word content as a selectable Source DB version', () => {
    expect(courseRoutes).toContain('sourceDbVersion: true');
    expect(courseRoutes).toContain('Source DB - Word Upload Version');
    expect(courseRoutes).not.toContain('!selectedVersionText || String(selectedVersion?.source || "") === "word_upload"');
    expect(courseRoutes).toContain('newContent: extractedContent.text');
  });
});
