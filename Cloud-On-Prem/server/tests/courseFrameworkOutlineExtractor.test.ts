import { describe, expect, it } from "@jest/globals";
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow } from "docx";
import { CourseFrameworkExtractor } from "../services/courseFrameworkExtractor";
import type { ExtractedSection } from "@shared/courseFrameworkContracts";

function section(pageNumber: number, text: string): ExtractedSection {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  return {
    heading: lines[0] || `Page ${pageNumber}`,
    content: lines.slice(1).join("\n"),
    pageNumber,
    type: "paragraph",
  };
}

describe("CourseFrameworkExtractor document outline", () => {
  it("does not promote heading-styled DOCX table cells into document outline nodes", async () => {
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              text: "Investment Options",
              heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph("Choose the product option that fits your saving plan."),
            new Table({
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          text: "2024 Performance",
                          heading: HeadingLevel.HEADING_2,
                        }),
                      ],
                    }),
                    new TableCell({
                      children: [
                        new Paragraph({
                          text: "2 Year Fixed",
                          heading: HeadingLevel.HEADING_2,
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        },
      ],
    });
    const buffer = await Packer.toBuffer(doc);

    const extracted = await CourseFrameworkExtractor.extractFromDocx(buffer, "Teachers Building Society.docx");

    expect(extracted.documentOutline?.map((node) => node.title)).toEqual(["Investment Options"]);
    expect(extracted.sections.map((section) => section.heading)).toEqual(["Investment Options"]);
    expect(extracted.sections[0]?.content).toContain("| 2024 Performance | 2 Year Fixed |");
    expect(extracted.documentOutline?.[0]?.content).toContain("| 2024 Performance | 2 Year Fixed |");
    expect(extracted.rawText).toContain("2024 Performance");
    expect(extracted.rawText).toContain("2 Year Fixed");

    expect(extracted.tables).toEqual([
      expect.objectContaining({
        title: "Investment Options",
        order: 1,
        headers: ["2024 Performance", "2 Year Fixed"],
        rows: [],
        rowCount: 1,
        columnCount: 2,
        markdown: [
          "| 2024 Performance | 2 Year Fixed |",
          "| --- | --- |",
        ].join("\n"),
      }),
    ]);
  });

  it("builds a cascading hierarchy for Word heading levels", () => {
    const sections: Array<ExtractedSection & { metadata?: Record<string, unknown> }> = [
      {
        heading: "Overview: LearnPlay at a Glance",
        content: "LearnPlay is a modern learning platform.",
        type: "title",
        metadata: { outlineLevel: 1 },
      },
      {
        heading: "Why organisations pay attention to LearnPlay",
        content: "It accelerates course creation.",
        type: "heading",
        metadata: { outlineLevel: 2 },
      },
      {
        heading: "Business Value Summary",
        content: "LearnPlay helps teams move faster.",
        type: "heading",
        metadata: { outlineLevel: 2 },
      },
      {
        heading: "Lesson 1: Why Organisations Choose LearnPlay",
        content: "Organisations need better learning operations.",
        type: "title",
        metadata: { outlineLevel: 1 },
      },
      {
        heading: "The challenge most organisations face",
        content: "Training delivery does not keep up.",
        type: "heading",
        metadata: { outlineLevel: 2 },
      },
      {
        heading: "Operational friction",
        content: "Content teams rely on manual effort.",
        type: "heading",
        metadata: { outlineLevel: 3 },
      },
    ];

    const outline = CourseFrameworkExtractor.buildDocumentOutline({
      rawText: sections.map((s) => `${s.heading}\n${s.content}`).join("\n\n"),
      sections,
      fileName: "LearnPlay Company Profile Showcase Course.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const overview = outline.find((node) => node.title === "Overview: LearnPlay at a Glance");
    const businessValue = outline.find((node) => node.title === "Business Value Summary");
    const lesson1 = outline.find((node) => node.title === "Lesson 1: Why Organisations Choose LearnPlay");
    const challenge = outline.find((node) => node.title === "The challenge most organisations face");
    const friction = outline.find((node) => node.title === "Operational friction");

    expect(overview?.level).toBe("chapter");
    expect(businessValue?.parentId).toBe(overview?.id);
    expect(lesson1?.parentId).toBeNull();
    expect(challenge?.parentId).toBe(lesson1?.id);
    expect(friction?.parentId).toBe(challenge?.id);

    expect(overview?.content).toContain("LearnPlay is a modern learning platform.");
    expect(overview?.content).toContain("It accelerates course creation.");
    expect(overview?.content).toContain("LearnPlay helps teams move faster.");
    expect(overview?.content).not.toContain("Organisations need better learning operations.");

    expect(challenge?.content).toContain("Training delivery does not keep up.");
    expect(challenge?.content).toContain("Content teams rely on manual effort.");
  });

  it("builds a de-duplicated textbook hierarchy from repeated PDF page headers", () => {
    const pages = [
      "Grade 9 Technology\nLearner Book",
      "Contents\nTerm 1\nChapter 1 Week 1\nOrthographic drawing\nChapter 2 Week 3\nProvide for wheelchairs",
      "TECHNOLOGY GRADE 9 TERM 1\nCHAPTER 1: ORTHOGRAPHIC DRAWING\n1.1 About orthographic drawings\nLearners use drawings to show views.",
      "TECHNOLOGY GRADE 9 TERM 1\nCHAPTER 1: ORTHOGRAPHIC DRAWING\n1.2 First-angle projection\nProjection methods are used in technology drawings.",
      "TECHNOLOGY GRADE 9 TERM 1\nCHAPTER 2: PROVIDE FOR WHEELCHAIRS\n2.1 Stairs and a ramp\nA ramp can improve wheelchair access.",
      "TECHNOLOGY GRADE 9 TERM 1\nCHAPTER 2: PROVIDE FOR WHEELCHAIRS\n2.2 Design brief\nLearners investigate constraints and design options.",
    ];
    const sections = pages.map((text, index) => section(index + 1, text));
    const rawText = pages.join("\n\n");

    const outline = CourseFrameworkExtractor.buildDocumentOutline({
      rawText,
      sections,
      fileName: "Grade 9 Technology_Learner Book.pdf",
      mimeType: "application/pdf",
    });

    const titles = outline.map((node) => node.title);
    expect(titles).toContain("Technology Grade 9 Term 1");
    expect(titles).toContain("Chapter 1: Orthographic Drawing");
    expect(titles).toContain("Chapter 2: Provide for Wheelchairs");
    expect(titles).toContain("1.1 About orthographic drawings");
    expect(titles).toContain("2.2 Design brief");

    expect(titles.filter((title) => title === "Technology Grade 9 Term 1")).toHaveLength(1);
    expect(titles.filter((title) => title === "Chapter 1: Orthographic Drawing")).toHaveLength(1);
    expect(titles).not.toContain("TECHNOLOGY GRADE 9 TERM 1");

    const chapter1 = outline.find((node) => node.title === "Chapter 1: Orthographic Drawing");
    const subsection = outline.find((node) => node.title === "1.2 First-angle projection");
    expect(chapter1?.level).toBe("chapter");
    expect(subsection?.parentId).toBe(chapter1?.id);
    expect(chapter1?.pageStart).toBe(3);
    expect(chapter1?.pageEnd).toBe(4);
  });

  it("uses slide titles as deterministic outline nodes for presentations", () => {
    const sections: ExtractedSection[] = [
      { heading: "Safety Rules", content: "Wear eye protection.", pageNumber: 1, type: "heading" },
      { heading: "Tool Setup", content: "Set up the workbench.", pageNumber: 2, type: "heading" },
    ];

    const outline = CourseFrameworkExtractor.buildDocumentOutline({
      rawText: sections.map((s) => `${s.heading}\n${s.content}`).join("\n\n"),
      sections,
      fileName: "workshop.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });

    expect(outline.map((node) => node.level)).toEqual(["slide", "slide"]);
    expect(outline.map((node) => node.title)).toEqual(["Safety Rules", "Tool Setup"]);
  });

  it("derives usable PDF outline titles from page content instead of exposing page numbers", () => {
    const sections: ExtractedSection[] = [
      {
        heading: "Page 1",
        content: "1\nCopyright 2024 Example Training\nCourse introduction and legal notes.",
        pageNumber: 1,
        type: "paragraph",
      },
      {
        heading: "Page 2",
        content: "153 Unit 9: Downtime\nThis lesson explains downtime phases and recovery tasks.",
        pageNumber: 2,
        type: "paragraph",
      },
      {
        heading: "Page 3",
        content: "259 Unit 15: Exercises and Solutions\nPractice tasks and solutions are provided.",
        pageNumber: 3,
        type: "paragraph",
      },
    ];

    const outline = CourseFrameworkExtractor.buildDocumentOutline({
      rawText: sections.map((s) => `${s.heading}\n${s.content}`).join("\n\n"),
      sections,
      fileName: "ADM328_EN_Col24_Instructor_Guide_A4.pdf",
      mimeType: "application/pdf",
    });

    expect(outline.map((node) => node.title)).toContain("153 Unit 9: Downtime");
    expect(outline.map((node) => node.title)).toContain("259 Unit 15: Exercises and Solutions");
    expect(outline.map((node) => node.title)).not.toContain("Page 2");
    expect(outline.map((node) => node.title)).not.toContain("Page 3");
  });

  it("keeps textbook chapter ranges clean when chapter headings are split across lines", () => {
    const pages = [
      "Term 1: Structures\nChapter 1\nOrthographic drawing\nIn this chapter, you will learn how to make drawings.\n1.1 About orthographic drawings",
      "1.1 About orthographic drawing\nOrthographic drawings use top, front and side views.",
      "1.2 Do your first orthographic drawings\nUse grid paper to draw a staircase.",
      "Chapter 2\nProvide for wheelchairs\nIn this chapter, you will make accurate drawings.\n2.1 Stairs and a ramp",
      "2.1 Stairs and a ramp\nThe principal asked learners to design a ramp.",
      "Chapter 3\nStructures, forces and\nmaterials\nIn this chapter, you will learn about forces and materials.\n3.1 Forces act in different places",
      "3.1 Forces act in different places\nStatic and dynamic loads act on structures.",
      "3.2 Forces act in different ways\nForces can act as tension, torsion, compression, shear and bending.",
      "3.3 Different materials for different purposes\nMaterials differ in flexibility, stiffness and density.",
      "Next week\nNext week, you will start with your practical assessment task.",
      "Chapter 4 PAT\nA bridge to help the community\nOver the next six weeks, you will design and build a bridge.",
      "Term 2: Mechanical systems and control\nChapter 5\nHydraulics and pneumatics\nIn this chapter, you will revise moving objects with air and water.",
    ];
    const sections = pages.map((text, index) => section(index + 1, text));

    const outline = CourseFrameworkExtractor.buildDocumentOutline({
      rawText: pages.join("\n\n"),
      sections,
      fileName: "Grade 9 Technology_Learner Book.pdf",
      mimeType: "application/pdf",
    });

    const chapter1 = outline.find((node) => node.title === "Chapter 1: Orthographic Drawing");
    const chapter2 = outline.find((node) => node.title === "Chapter 2: Provide for Wheelchairs");
    const chapter3 = outline.find((node) => node.title === "Chapter 3: Structures, Forces and Materials");
    const chapter4 = outline.find((node) => node.title === "Chapter 4: PAT A Bridge to Help the Community");
    const chapter5 = outline.find((node) => node.title === "Chapter 5: Hydraulics and Pneumatics");

    expect(chapter1?.pageStart).toBe(1);
    expect(chapter1?.pageEnd).toBe(3);
    expect(chapter1?.content).toContain("In this chapter, you will learn how to make drawings.");
    expect(chapter2?.pageStart).toBe(4);
    expect(chapter2?.pageEnd).toBe(5);
    expect(chapter3?.pageStart).toBe(6);
    expect(chapter3?.pageEnd).toBe(10);
    expect(chapter3?.content).toContain("In this chapter, you will learn about forces and materials.");
    expect(chapter3?.content).toContain("Next week, you will start with your practical assessment task.");
    expect(chapter3?.content).not.toContain("Chapter 4 PAT");
    expect(chapter3?.content).not.toContain("Hydraulics and pneumatics");
    expect(chapter4?.pageStart).toBe(11);
    expect(chapter5?.pageStart).toBe(12);
  });
});
