import { describe, expect, test } from "@jest/globals";
import archiver from "archiver";
import PDFDocument from "pdfkit";
import { PassThrough } from "stream";
import { SourceMediaExtractor } from "../services/sourceMediaExtractor";

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function createZipBuffer(entries: Record<string, Buffer | string>): Promise<Buffer> {
  const archive = archiver("zip");
  const out = new PassThrough();
  const result = streamToBuffer(out);
  archive.pipe(out);
  for (const [name, content] of Object.entries(entries)) {
    archive.append(content, { name });
  }
  await archive.finalize();
  return result;
}

async function createPdfBuffer(): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4" });
  const out = new PassThrough();
  const result = streamToBuffer(out);
  doc.pipe(out);
  doc.fontSize(18).text("Figure 1 Orthographic drawing", 72, 72);
  doc.rect(72, 130, 180, 120).stroke();
  doc.end();
  return result;
}

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

describe("SourceMediaExtractor", () => {
  test("extracts PDF page snapshots", async () => {
    const result = await SourceMediaExtractor.extractMedia({
      buffer: await createPdfBuffer(),
      fileName: "pdf-with-figure.pdf",
      mimeType: "application/pdf",
      organizationId: "org-1",
      sourceDocumentId: "doc-1",
      pageTexts: ["Figure 1 Orthographic drawing"],
    });

    expect(result.assets.length).toBeGreaterThan(0);
    expect(result.assets[0].assetType).toBe("page_snapshot");
    expect(result.assets[0].pageOrSlide).toBe(1);
    expect(result.assets[0].caption).toContain("Figure 1");
    expect(result.assets[0].metadata?.sourceDocumentType).toBe("pdf");
    expect(result.assets[0].textBefore).toContain("Figure 1");
    expect(result.assets[0].textAfter).toContain("Orthographic drawing");
  });

  test("extracts DOCX inline images", async () => {
    const buffer = await createZipBuffer({
      "[Content_Types].xml": "<Types></Types>",
      "word/media/image1.png": tinyPng,
    });

    const result = await SourceMediaExtractor.extractMedia({
      buffer,
      fileName: "docx-with-image.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      organizationId: "org-1",
      sourceDocumentId: "doc-1",
    });

    expect(result.assets.some((asset) => asset.assetType === "image")).toBe(true);
    expect(result.assets[0].storageKey).toContain("/private/");
    expect(result.assets[0].metadata?.sourceDocumentType).toBe("docx");
    expect(result.assets[0].metadata?.packagePath).toBe("word/media/image1.png");
    expect(result.assets[0].metadata?.documentOrdinal).toBe(1);
    expect(result.assets[0].metadata?.contextConfidence).toBe("low");
  });

  test("extracts PPTX embedded slide images", async () => {
    const buffer = await createZipBuffer({
      "[Content_Types].xml": "<Types></Types>",
      "ppt/media/image1.png": tinyPng,
      "ppt/slides/slide1.xml": "<p:sld></p:sld>",
    });

    const result = await SourceMediaExtractor.extractMedia({
      buffer,
      fileName: "pptx-with-image.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      organizationId: "org-1",
      sourceDocumentId: "doc-1",
    });

    expect(result.assets.length).toBeGreaterThan(0);
    expect(result.assets[0].pageOrSlide).toBe(1);
    expect(result.assets[0].metadata?.sourceDocumentType).toBe("pptx");
    expect(result.assets[0].metadata?.slide).toBe(1);
    expect(result.assets[0].metadata?.packagePath).toBe("ppt/media/image1.png");
  });
});
