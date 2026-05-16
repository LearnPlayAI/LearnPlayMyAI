import unzipper from "unzipper";
import { XMLParser } from "fast-xml-parser";
import { Readable } from "stream";

export interface SlideContent {
  slideNumber: number;
  title: string;
  body: string;
  notes: string;
}

export interface TranscriptResult {
  slides: SlideContent[];
  totalSlides: number;
  extractedAt: string;
}

/**
 * PPTX Text Extraction Service
 * Extracts text content from PowerPoint files for AI quiz generation
 */
export class PptxExtractor {
  private parser: XMLParser;

  constructor() {
    // Configure XML parser
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      parseAttributeValue: true,
      trimValues: true,
    });
  }

  /**
   * Extract text content from PPTX buffer
   * PPTX files are ZIP archives containing XML files
   */
  async extractFromBuffer(pptxBuffer: Buffer): Promise<TranscriptResult> {
    const slides: SlideContent[] = [];
    const slideFiles: { [key: string]: Buffer } = {};
    const notesFiles: { [key: string]: Buffer } = {};

    try {
      // Create readable stream from buffer
      const stream = Readable.from(pptxBuffer);

      // Unzip and collect slide/notes files
      await stream
        .pipe(unzipper.Parse())
        .on("entry", async (entry: any) => {
          const fileName = entry.path;

          // Extract slide content files (ppt/slides/slide*.xml)
          if (fileName.match(/ppt\/slides\/slide\d+\.xml$/)) {
            const chunks: Buffer[] = [];
            for await (const chunk of entry) {
              chunks.push(Buffer.from(chunk));
            }
            slideFiles[fileName] = Buffer.concat(chunks);
          }
          // Extract notes files (ppt/notesSlides/notesSlide*.xml)
          else if (fileName.match(/ppt\/notesSlides\/notesSlide\d+\.xml$/)) {
            const chunks: Buffer[] = [];
            for await (const chunk of entry) {
              chunks.push(Buffer.from(chunk));
            }
            notesFiles[fileName] = Buffer.concat(chunks);
          } else {
            entry.autodrain();
          }
        })
        .promise();

      // Parse each slide file
      const slideKeys = Object.keys(slideFiles).sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)\.xml$/)?.[1] || "0");
        const numB = parseInt(b.match(/slide(\d+)\.xml$/)?.[1] || "0");
        return numA - numB;
      });

      for (const slideKey of slideKeys) {
        const slideNumber = parseInt(slideKey.match(/slide(\d+)\.xml$/)?.[1] || "0");
        const slideContent = slideFiles[slideKey];
        const notesKey = `ppt/notesSlides/notesSlide${slideNumber}.xml`;
        const notesContent = notesFiles[notesKey];

        const slideData = await this.parseSlide(slideContent, notesContent, slideNumber);
        slides.push(slideData);
      }

      return {
        slides,
        totalSlides: slides.length,
        extractedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("[PptxExtractor] Extraction failed:", error);
      throw new Error(`Failed to extract PPTX content: ${error}`);
    }
  }

  /**
   * Parse a single slide XML and extract text
   */
  private async parseSlide(
    slideBuffer: Buffer,
    notesBuffer: Buffer | undefined,
    slideNumber: number
  ): Promise<SlideContent> {
    try {
      const xml = slideBuffer.toString("utf-8");
      const parsed = this.parser.parse(xml);

      // Extract title and body text
      const { title, body } = this.extractSlideText(parsed);

      // Extract notes if available
      let notes = "";
      if (notesBuffer) {
        const notesXml = notesBuffer.toString("utf-8");
        const notesParsed = this.parser.parse(notesXml);
        notes = this.extractNotesText(notesParsed);
      }

      return {
        slideNumber,
        title: title.trim(),
        body: body.trim(),
        notes: notes.trim(),
      };
    } catch (error) {
      console.error(`[PptxExtractor] Failed to parse slide ${slideNumber}:`, error);
      return {
        slideNumber,
        title: "",
        body: "",
        notes: "",
      };
    }
  }

  /**
   * Extract text from slide XML structure
   * Traverses the XML tree to find text nodes
   */
  private extractSlideText(parsed: any): { title: string; body: string } {
    let title = "";
    const bodyParts: string[] = [];

    try {
      // Navigate to slide shapes
      const slide = parsed?.["p:sld"];
      const shapes = slide?.["p:cSld"]?.["p:spTree"]?.["p:sp"];

      if (!shapes) {
        return { title: "", body: "" };
      }

      // Process each shape
      const shapeArray = Array.isArray(shapes) ? shapes : [shapes];
      let isFirstTextShape = true;

      for (const shape of shapeArray) {
        const textBody = shape?.["p:txBody"];
        if (!textBody) continue;

        const paragraphs = textBody?.["a:p"];
        if (!paragraphs) continue;

        const paragraphArray = Array.isArray(paragraphs) ? paragraphs : [paragraphs];
        const shapeText = this.extractParagraphsText(paragraphArray);

        if (shapeText) {
          // First text shape is usually the title
          if (isFirstTextShape && !title) {
            title = shapeText;
            isFirstTextShape = false;
          } else {
            bodyParts.push(shapeText);
          }
        }
      }
    } catch (error) {
      console.error("[PptxExtractor] Error extracting slide text:", error);
    }

    return {
      title,
      body: bodyParts.join("\n\n"),
    };
  }

  /**
   * Extract text from notes XML
   */
  private extractNotesText(parsed: any): string {
    try {
      const notes = parsed?.["p:notes"];
      const shapes = notes?.["p:cSld"]?.["p:spTree"]?.["p:sp"];

      if (!shapes) return "";

      const shapeArray = Array.isArray(shapes) ? shapes : [shapes];
      const textParts: string[] = [];

      for (const shape of shapeArray) {
        const textBody = shape?.["p:txBody"];
        if (!textBody) continue;

        const paragraphs = textBody?.["a:p"];
        if (!paragraphs) continue;

        const paragraphArray = Array.isArray(paragraphs) ? paragraphs : [paragraphs];
        const text = this.extractParagraphsText(paragraphArray);

        if (text) {
          textParts.push(text);
        }
      }

      return textParts.join("\n\n");
    } catch (error) {
      console.error("[PptxExtractor] Error extracting notes text:", error);
      return "";
    }
  }

  /**
   * Extract text from paragraph elements
   */
  private extractParagraphsText(paragraphs: any[]): string {
    const textParts: string[] = [];

    for (const para of paragraphs) {
      if (!para) continue;

      const runs = para["a:r"];
      if (!runs) continue;

      const runArray = Array.isArray(runs) ? runs : [runs];

      for (const run of runArray) {
        const text = run?.["a:t"];
        if (text) {
          const textValue = typeof text === "string" ? text : text["#text"] || "";
          if (textValue.trim()) {
            textParts.push(textValue.trim());
          }
        }
      }
    }

    return textParts.join(" ");
  }

  /**
   * Select top N slides for quiz generation (token-aware)
   * Prioritizes slides with more content
   */
  static selectTopSlides(slides: SlideContent[], maxSlides: number = 8): SlideContent[] {
    // Score slides by content richness
    const scoredSlides = slides.map(slide => ({
      slide,
      score: 
        (slide.title.length * 2) + // Title is important
        slide.body.length +
        (slide.notes.length * 0.5), // Notes are supplementary
    }));

    // Sort by score and take top N
    return scoredSlides
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSlides)
      .map(item => item.slide)
      .sort((a, b) => a.slideNumber - b.slideNumber); // Restore original order
  }

  /**
   * Format slides for AI prompt with token awareness
   * Chunks content to respect token limits
   */
  static formatForPrompt(slides: SlideContent[], maxTokens: number = 2000): string {
    const parts: string[] = [];
    let currentTokens = 0;

    for (const slide of slides) {
      const slideText = [
        `Slide ${slide.slideNumber}: ${slide.title}`,
        slide.body,
        slide.notes ? `(Notes: ${slide.notes})` : "",
      ]
        .filter(Boolean)
        .join("\n");

      // Rough token estimate: ~4 chars per token
      const estimatedTokens = Math.ceil(slideText.length / 4);

      if (currentTokens + estimatedTokens > maxTokens) {
        break; // Stop if we'd exceed limit
      }

      parts.push(slideText);
      currentTokens += estimatedTokens;
    }

    return parts.join("\n\n---\n\n");
  }
}
