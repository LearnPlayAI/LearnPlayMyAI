import mammoth from 'mammoth';
import { Buffer } from 'buffer';
import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface DocumentSection {
  id: string;
  heading: string;
  content: string;
  startOffset: number;
  endOffset: number;
  wordCount: number;
}

export interface StructuredLessonHeading {
  index: number;
  rawHeading: string;
  normalizedTitle: string;
  lessonNumber: number | null;
  type: 'lesson' | 'module' | 'chapter' | 'section' | 'overview' | 'takeaways';
}

export interface ExtractedDocumentContent {
  text: string;
  wordCount: number;
  fileType: 'doc' | 'docx' | 'pdf';
  sections?: DocumentSection[];
  structuredLessonHeadings?: StructuredLessonHeading[];
  hasExplicitLessonStructure?: boolean;
  extractionMetadata?: {
    extractedAt: string;
    originalCharCount: number;
    sectionCount: number;
    detectedLessonCount?: number;
  };
}

export class DocumentExtractorService {
  private static readonly MAX_TEXT_LENGTH = 500000; // 500k characters - raised from 100k
  private static readonly MIN_SECTION_LENGTH = 50; // Minimum characters for a section

  private static parseIntoSections(text: string): DocumentSection[] {
    const sections: DocumentSection[] = [];
    const headingPattern = /^(?:#{1,6}\s+|(?:[A-Z][^a-z]*:?\s*$)|(?:\d+\.\s+[A-Z]))/gm;
    
    const lines = text.split('\n');
    let currentSection: { heading: string; content: string[]; startOffset: number } | null = null;
    let currentOffset = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();
      const lineLength = line.length + 1;
      
      const isHeading = (
        /^#{1,6}\s+/.test(trimmedLine) ||
        (/^[A-Z][A-Z\s]+:?\s*$/.test(trimmedLine) && trimmedLine.length < 100) ||
        /^\d+\.\s+[A-Z]/.test(trimmedLine)
      );

      if (isHeading && trimmedLine.length > 0) {
        if (currentSection && currentSection.content.length > 0) {
          const content = currentSection.content.join('\n').trim();
          if (content.length >= this.MIN_SECTION_LENGTH) {
            sections.push({
              id: crypto.randomUUID(),
              heading: currentSection.heading,
              content,
              startOffset: currentSection.startOffset,
              endOffset: currentOffset,
              wordCount: content.split(/\s+/).filter(w => w.length > 0).length,
            });
          }
        }
        currentSection = {
          heading: trimmedLine.replace(/^#{1,6}\s+/, '').replace(/:\s*$/, ''),
          content: [],
          startOffset: currentOffset,
        };
      } else if (currentSection) {
        currentSection.content.push(line);
      } else if (trimmedLine.length > 0) {
        currentSection = {
          heading: 'Introduction',
          content: [line],
          startOffset: currentOffset,
        };
      }

      currentOffset += lineLength;
    }

    if (currentSection && currentSection.content.length > 0) {
      const content = currentSection.content.join('\n').trim();
      if (content.length >= this.MIN_SECTION_LENGTH) {
        sections.push({
          id: crypto.randomUUID(),
          heading: currentSection.heading,
          content,
          startOffset: currentSection.startOffset,
          endOffset: currentOffset,
          wordCount: content.split(/\s+/).filter(w => w.length > 0).length,
        });
      }
    }

    if (sections.length === 0 && text.trim().length >= this.MIN_SECTION_LENGTH) {
      sections.push({
        id: crypto.randomUUID(),
        heading: 'Document Content',
        content: text.trim(),
        startOffset: 0,
        endOffset: text.length,
        wordCount: text.split(/\s+/).filter(w => w.length > 0).length,
      });
    }

    return sections;
  }

  /**
   * Detects explicit lesson structure from document text.
   * Looks for patterns like "Lesson 1:", "Lesson 2 -", "Module 3:", "Chapter 1", etc.
   * Also detects overview/introduction and key takeaways sections.
   */
  private static extractStructuredLessonHeadings(text: string): {
    headings: StructuredLessonHeading[];
    hasExplicitStructure: boolean;
  } {
    const headings: StructuredLessonHeading[] = [];
    const lines = text.split('\n');
    
    // Patterns for explicit lesson structure
    const lessonPatterns = [
      // "Lesson 1:", "Lesson 1 -", "Lesson 1 :", "Lesson One:"
      /^(?:#{0,6}\s*)?(?:\d+\.?\s+)?Lesson\s+(\d+|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)\s*[:\-–—]?\s*(.*)$/i,
      // "Module 1:", "Module 1 -"
      /^(?:#{0,6}\s*)?(?:\d+\.?\s+)?Module\s+(\d+|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)\s*[:\-–—]?\s*(.*)$/i,
      // "Chapter 1:", "Chapter 1 -"
      /^(?:#{0,6}\s*)?(?:\d+\.?\s+)?Chapter\s+(\d+|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)\s*[:\-–—]?\s*(.*)$/i,
      // "Unit 1:", "Unit 1 -"
      /^(?:#{0,6}\s*)?(?:\d+\.?\s+)?Unit\s+(\d+|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)\s*[:\-–—]?\s*(.*)$/i,
    ];
    
    // Patterns for overview/introduction
    const overviewPatterns = [
      /^(?:#{0,6}\s*)?(?:\d+\.?\s+)?(?:Course\s+)?(?:Overview|Introduction|Getting Started)\s*[:\-–—]?\s*(.*)$/i,
    ];
    
    // Patterns for key takeaways/conclusion
    const takeawaysPatterns = [
      /^(?:#{0,6}\s*)?(?:\d+\.?\s+)?(?:Key\s+)?(?:Takeaways?|Conclusions?|Summary|Wrap[\s-]?Up)\s*[:\-–—]?\s*(.*)$/i,
    ];
    
    // Word to number mapping
    const wordToNumber: Record<string, number> = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    };
    
    let index = 0;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.length > 200) continue;
      
      // Check for lesson patterns
      for (const pattern of lessonPatterns) {
        const match = trimmedLine.match(pattern);
        if (match) {
          const numStr = match[1].toLowerCase();
          const lessonNumber = wordToNumber[numStr] ?? parseInt(numStr, 10);
          const title = match[2]?.trim() || '';
          const type = pattern.source.includes('Module') ? 'module' :
                       pattern.source.includes('Chapter') ? 'chapter' :
                       pattern.source.includes('Unit') ? 'section' : 'lesson';
          
          headings.push({
            index: index++,
            rawHeading: trimmedLine,
            normalizedTitle: title || `${type.charAt(0).toUpperCase() + type.slice(1)} ${lessonNumber}`,
            lessonNumber: isNaN(lessonNumber) ? null : lessonNumber,
            type,
          });
          break;
        }
      }
      
      // Check for overview patterns
      for (const pattern of overviewPatterns) {
        const match = trimmedLine.match(pattern);
        if (match) {
          headings.push({
            index: index++,
            rawHeading: trimmedLine,
            normalizedTitle: match[1]?.trim() || 'Course Overview',
            lessonNumber: null,
            type: 'overview',
          });
          break;
        }
      }
      
      // Check for takeaways patterns
      for (const pattern of takeawaysPatterns) {
        const match = trimmedLine.match(pattern);
        if (match) {
          headings.push({
            index: index++,
            rawHeading: trimmedLine,
            normalizedTitle: match[1]?.trim() || 'Key Takeaways',
            lessonNumber: null,
            type: 'takeaways',
          });
          break;
        }
      }
    }
    
    // Sort by lesson number, with overview first and takeaways last
    headings.sort((a, b) => {
      if (a.type === 'overview') return -1;
      if (b.type === 'overview') return 1;
      if (a.type === 'takeaways') return 1;
      if (b.type === 'takeaways') return -1;
      if (a.lessonNumber !== null && b.lessonNumber !== null) {
        return a.lessonNumber - b.lessonNumber;
      }
      return a.index - b.index;
    });
    
    // Re-index after sorting
    headings.forEach((h, i) => h.index = i);
    
    // Count actual content lessons (not overview or takeaways)
    const contentLessons = headings.filter(h => 
      h.type !== 'overview' && h.type !== 'takeaways'
    );
    
    // We consider it "explicit structure" if we have at least 2 numbered lessons
    const hasExplicitStructure = contentLessons.length >= 2 && 
      contentLessons.some(h => h.lessonNumber !== null);
    
    if (hasExplicitStructure) {
      console.log(`[DocumentExtractor] Detected explicit lesson structure: ${contentLessons.length} content lessons, ${headings.length} total headings`);
      console.log(`[DocumentExtractor] Lesson headings: ${headings.map(h => h.rawHeading.substring(0, 50)).join(' | ')}`);
    }
    
    return { headings, hasExplicitStructure };
  }

  static async extractTextFromDocx(buffer: Buffer): Promise<ExtractedDocumentContent> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      
      const text = result.value.trim();
      if (!text || text.length === 0) {
        throw new Error('Word document appears to be empty or contains no extractable text');
      }

      const originalCharCount = text.length;
      
      if (text.length > this.MAX_TEXT_LENGTH) {
        console.warn(`[DocumentExtractor] Document exceeds ${this.MAX_TEXT_LENGTH} chars (${text.length}). Content will be truncated for processing but full text is stored.`);
      }

      const wordCount = text.split(/\s+/).filter((word: string) => word.length > 0).length;
      const sections = this.parseIntoSections(text);
      
      // Extract structured lesson headings for zero-hallucination topic grounding
      const { headings: structuredLessonHeadings, hasExplicitStructure } = this.extractStructuredLessonHeadings(text);
      const contentLessons = structuredLessonHeadings.filter(h => h.type !== 'overview' && h.type !== 'takeaways');

      if (result.messages.length > 0) {
        console.warn('[DocumentExtractor] Extraction warnings:', result.messages);
      }

      console.log(`[DocumentExtractor] DOCX extraction successful: ${wordCount} words, ${text.length} characters, ${sections.length} sections, ${hasExplicitStructure ? contentLessons.length + ' detected lessons' : 'no explicit lesson structure'}`);

      return {
        text,
        wordCount,
        fileType: 'docx',
        sections,
        structuredLessonHeadings: hasExplicitStructure ? structuredLessonHeadings : undefined,
        hasExplicitLessonStructure: hasExplicitStructure,
        extractionMetadata: {
          extractedAt: new Date().toISOString(),
          originalCharCount,
          sectionCount: sections.length,
          detectedLessonCount: hasExplicitStructure ? contentLessons.length : undefined,
        },
      };
    } catch (error: any) {
      console.error('[DocumentExtractor] DOCX extraction failed:', error);
      throw new Error(`Failed to extract text from Word document: ${error.message}`);
    }
  }

  static async extractTextFromLegacyDoc(buffer: Buffer): Promise<ExtractedDocumentContent> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'learnplay-doc-'));
    const inputPath = path.join(tempDir, 'input.doc');
    const outputPath = path.join(tempDir, 'input.docx');

    try {
      await fs.writeFile(inputPath, buffer);
      await execFileAsync('libreoffice', [
        '--headless',
        '--convert-to',
        'docx',
        '--outdir',
        tempDir,
        inputPath,
      ], { timeout: 60_000 });

      const convertedBuffer = await fs.readFile(outputPath);
      const extracted = await this.extractTextFromDocx(convertedBuffer);

      return {
        ...extracted,
        fileType: 'doc',
      };
    } catch (error: any) {
      console.error('[DocumentExtractor] DOC extraction failed:', error);
      throw new Error(`Failed to extract text from Word .doc document: ${error.message}`);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  static async extractTextFromPdf(buffer: Buffer): Promise<ExtractedDocumentContent> {
    try {
      // pdf-parse exposes this Node-specific entrypoint in current runtime builds,
      // with a default package export as a fallback for older installs.
      // @ts-ignore - package subpath does not publish matching TypeScript declarations.
      const nodeModule = await import('pdf-parse/node').catch(() => null);
      let ParserCtor = (nodeModule as any)?.PDFParse;
      if (!ParserCtor) {
        const module = await import('pdf-parse');
        ParserCtor = (module as any).PDFParse;
      }
      if (!ParserCtor) {
        throw new Error('PDF parser is not available');
      }

      const parser = new ParserCtor({ data: buffer });
      try {
        const textResult = await parser.getText();
        const pages = (textResult.pages || [])
          .map((page: any) => String(page?.text || '').trim())
          .filter(Boolean);
        const text = pages.join('\n\n').trim();

        if (!text || text.length === 0) {
          throw new Error('PDF appears to be empty or contains no extractable text');
        }

        const originalCharCount = text.length;
        const wordCount = text.split(/\s+/).filter((word: string) => word.length > 0).length;
        const sections = this.parseIntoSections(text);
        const { headings: structuredLessonHeadings, hasExplicitStructure } = this.extractStructuredLessonHeadings(text);
        const contentLessons = structuredLessonHeadings.filter(h => h.type !== 'overview' && h.type !== 'takeaways');

        console.log(`[DocumentExtractor] PDF extraction successful: ${wordCount} words, ${text.length} characters, ${sections.length} sections`);

        return {
          text,
          wordCount,
          fileType: 'pdf',
          sections,
          structuredLessonHeadings: hasExplicitStructure ? structuredLessonHeadings : undefined,
          hasExplicitLessonStructure: hasExplicitStructure,
          extractionMetadata: {
            extractedAt: new Date().toISOString(),
            originalCharCount,
            sectionCount: sections.length,
            detectedLessonCount: hasExplicitStructure ? contentLessons.length : undefined,
          },
        };
      } finally {
        await parser.destroy();
      }
    } catch (error: any) {
      console.error('[DocumentExtractor] PDF extraction failed:', error);
      throw new Error(`Failed to extract text from PDF: ${error.message}`);
    }
  }

  static async extractText(buffer: Buffer, mimeType: string): Promise<ExtractedDocumentContent> {
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return this.extractTextFromDocx(buffer);
    } else if (mimeType === 'application/msword') {
      return this.extractTextFromLegacyDoc(buffer);
    } else if (mimeType === 'application/pdf' || mimeType.includes('pdf')) {
      return this.extractTextFromPdf(buffer);
    } else {
      throw new Error(`Unsupported file type: ${mimeType}. Please upload a Word document (.docx) or PDF (.pdf).`);
    }
  }

  static validateFileSize(size: number): void {
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (size > MAX_FILE_SIZE) {
      throw new Error(`File size (${(size / 1024 / 1024).toFixed(2)} MB) exceeds maximum allowed size of 10MB`);
    }
  }

  static validateMimeType(mimeType: string): void {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/pdf',
    ];
    
    if (!allowedTypes.includes(mimeType)) {
      throw new Error('Invalid file type. Please upload a Word document (.docx) or PDF (.pdf)');
    }
  }
}
