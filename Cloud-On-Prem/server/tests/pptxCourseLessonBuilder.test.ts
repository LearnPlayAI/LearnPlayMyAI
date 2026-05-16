import { describe, expect, it } from "@jest/globals";
import {
  buildPptxDocumentLessons,
  cleanPptxLessonTitle,
  derivePptxCourseTitle,
  isPptxDraftDocument,
} from "../services/pptxCourseLessonBuilder";

describe("pptx course lesson builder", () => {
  it("detects PowerPoint documents by file name or mime type", () => {
    expect(isPptxDraftDocument({ fileName: "module.pptx", mimeType: "" })).toBe(true);
    expect(isPptxDraftDocument({ fileName: "module.bin", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" })).toBe(true);
    expect(isPptxDraftDocument({ fileName: "module.pdf", mimeType: "application/pdf" })).toBe(false);
  });

  it("derives readable lesson titles from numbered PowerPoint file names", () => {
    expect(cleanPptxLessonTitle("1-Maximizing-Workplace-Productivity-with-AI-Tools_AI-Powered-Communication-and-Writing-Tools_EN_v1.pptx"))
      .toBe("Maximizing Workplace Productivity with AI Tools AI Powered Communication and Writing Tools");
  });

  it("creates one source-grounded lesson per uploaded PowerPoint and keeps the deck storage path", () => {
    const lessons = buildPptxDocumentLessons([
      {
        id: "doc-1",
        fileName: "1-AI-Communication_EN_v1.pptx",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        storagePath: "/private/course-drafts/draft-1/doc-1.pptx",
        extractedContent: {
          rawText: "Prompt Writing\nWrite clear prompts.\nReview and improve responses.",
          metadata: { slideCount: 12 },
          sections: [
            { heading: "Prompt Writing", content: "Write clear prompts.", pageNumber: 1 },
            { heading: "Review Responses", content: "Review and improve responses.", pageNumber: 2 },
          ],
          sourceAssets: [{ id: "ignored-image", pageOrSlide: 1 }],
        },
      },
      {
        id: "doc-2",
        fileName: "2-AI-Data-Analysis_EN_v1.pptx",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        storagePath: "/private/course-drafts/draft-1/doc-2.pptx",
        extractedContent: {
          sections: [
            { heading: "Data Preparation", content: "Clean data before analysis.", pageNumber: 1 },
          ],
        },
      },
    ]);

    expect(lessons).toHaveLength(2);
    expect(lessons[0].title).toBe("AI Communication");
    expect(lessons[0].sourcePptxStoragePath).toBe("/private/course-drafts/draft-1/doc-1.pptx");
    expect(lessons[0].sourceDocumentType).toBe("pptx");
    expect(lessons[0].slideCount).toBe(12);
    expect(lessons[0].sourceContent).toContain("Write clear prompts");
    expect(lessons[0].sourceAssets).toEqual([]);
    expect(lessons[0].metadata.skipSourceImageExtraction).toBe(true);

    expect(lessons[1].title).toBe("AI Data Analysis");
    expect(lessons[1].sourceContent).toContain("Data Preparation");
  });

  it("derives a shared course title from a numbered PowerPoint bundle", () => {
    const docs = [
      { id: "doc-1", fileName: "1-Maximizing-Workplace-Productivity-with-AI-Tools_AI-Powered-Communication_EN_v1.pptx" },
      { id: "doc-2", fileName: "2-Maximizing-Workplace-Productivity-with-AI-Tools_AI-for-Data-Analysis_EN_v1.pptx" },
    ];
    const lessons = buildPptxDocumentLessons(docs as any);

    expect(derivePptxCourseTitle(docs as any, lessons)).toBe("Maximizing Workplace Productivity with AI Tools");
  });
});
