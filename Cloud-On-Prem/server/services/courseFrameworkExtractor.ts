import mammoth from 'mammoth';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { PptxExtractor, SlideContent } from './pptxExtractor';
import type { DocumentOutlineNode, ExtractedSection, ExtractedTable, ExtractedContent, StructuralHint } from '@shared/courseFrameworkContracts';
import { buildCanonicalStorageKey, normalizeExtension } from '../utils/storageKeyManager';

const execFileAsync = promisify(execFile);

export interface ExtractionOptions {
  organizationId: string;
  userId: string;
  maxFileSizeMB?: number;
}

export interface ExtractionMetadata {
  fileName: string;
  mimeType: string;
  fileSize: number;
  pageCount?: number;
  slideCount?: number;
  wordCount: number;
  extractedAt: string;
}

// Source mapping for zero-hallucination validation
export interface SourceSpan {
  sectionId: string;
  startOffset: number;
  endOffset: number;
  textSpan: string;
  confidence: number;
}

export interface SourceMap {
  documentId: string;
  documentName: string;
  rawTextHash: string;
  sections: SourceSpan[];
  extractedAt: string;
}

// New extraction result with raw text for AI analysis
export interface EnhancedExtractionResult {
  rawText: string;
  wordCount: number;
  structuredHints: StructuralHint[];
  sections: ExtractedSection[];
  tables?: ExtractedTable[];
  documentOutline?: DocumentOutlineNode[];
  structuredLessonHeadings?: Array<{
    index: number;
    rawHeading: string;
    normalizedTitle: string;
    lessonNumber: number | null;
    type: 'lesson' | 'module' | 'chapter' | 'section' | 'overview' | 'takeaways';
  }>;
  hasExplicitLessonStructure?: boolean;
  sourceMap: SourceMap;
  metadata: ExtractionMetadata;
}

// Legacy interface for backward compatibility
export interface ChunkedExtractionResult {
  sections: ExtractedSection[];
  metadata: ExtractionMetadata;
}

export interface DraftDocumentSegment {
  segmentIndex: number;
  segmentType: string;
  text: string;
  textHash: string;
  startOffset: number;
  endOffset: number;
  headingPath: string[];
  pageOrSlide: number | null;
  metadata?: Record<string, any>;
}

export class CourseFrameworkExtractor {
  private static readonly ALLOWED_MIME_TYPES = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
    'application/pdf', // .pdf
  ];

  static validateFile(mimeType: string, fileSize: number, maxFileSizeMB?: number): void {
    if (!this.ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new Error(
        `Unsupported file type: ${mimeType}. Allowed types: Word (.docx), PowerPoint (.pptx), and PDF (.pdf)`
      );
    }

    // No hard default size limit. Optional cap can still be provided by caller/env.
    if (maxFileSizeMB && maxFileSizeMB > 0) {
      const maxSize = maxFileSizeMB * 1024 * 1024;
      if (fileSize > maxSize) {
        const maxMB = maxSize / (1024 * 1024);
        const actualMB = (fileSize / (1024 * 1024)).toFixed(2);
        throw new Error(
          `File size (${actualMB} MB) exceeds maximum allowed size of ${maxMB} MB`
        );
      }
    }

    if (fileSize === 0) {
      throw new Error('File is empty');
    }
  }

  static generateStoragePath(organizationId: string, userId: string, fileName: string): string {
    const ext = normalizeExtension(path.extname(String(fileName || ""))) || ".bin";
    return buildCanonicalStorageKey({
      scope: "private",
      domain: "crs-draft",
      extension: ext,
      seed: `${organizationId}:${userId}:${fileName}:${Date.now()}`,
    });
  }

  static isAllowedMimeType(mimeType: string): boolean {
    return this.ALLOWED_MIME_TYPES.includes(mimeType);
  }

  static getAllowedMimeTypes(): string[] {
    return [...this.ALLOWED_MIME_TYPES];
  }

  private static generateDocumentId(): string {
    return crypto.randomUUID();
  }

  private static hashText(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
  }

  private static countWords(text: string): number {
    return String(text || '').split(/\s+/).filter((word) => word.length > 0).length;
  }

  private static normalizeOutlineTitle(title: string): string {
    const cleaned = String(title || '')
      .replace(/\s+/g, ' ')
      .replace(/\s+([:;,.!?])/g, '$1')
      .trim();
    if (!cleaned) return '';
    const chapter = cleaned.match(/^(Chapter\s+\d+\s*:\s*)(.+)$/i);
    if (chapter) {
      return `${chapter[1].replace(/^chapter/i, 'Chapter')}${this.toReadableChapterTitle(chapter[2])}`;
    }
    const letters = cleaned.replace(/[^A-Za-z]/g, '');
    const shouldTitleCase = letters.length > 0 && letters === letters.toUpperCase();
    if (!shouldTitleCase) return cleaned;
    return cleaned
      .toLowerCase()
      .replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
      .replace(/\bAnd\b/g, 'and')
      .replace(/\bFor\b/g, 'for')
      .replace(/\bThe\b/g, 'the')
      .replace(/\bOf\b/g, 'of')
      .replace(/\bIn\b/g, 'in')
      .replace(/\bA\b/g, 'a');
  }

  private static isGenericPageTitle(title: string): boolean {
    return /^page\s+\d+$/i.test(String(title || '').trim());
  }

  private static isWeakOutlineTitleCandidate(line: string): boolean {
    const normalized = String(line || '').trim().replace(/\s+/g, ' ');
    if (!normalized) return true;
    if (normalized.length < 5 || normalized.length > 120) return true;
    if (/^\d+$/.test(normalized)) return true;
    if (this.isGenericPageTitle(normalized)) return true;
    if (this.isPdfRunningHeader(normalized)) return true;
    if (/^table of contents$/i.test(normalized)) return true;
    if (/^copyright\b/i.test(normalized)) return true;
    if (/^©/.test(normalized)) return true;
    if (/^https?:\/\//i.test(normalized) || /^www\./i.test(normalized)) return true;
    if (/^[A-Z]$/.test(normalized)) return true;
    if (/^[,.;:!?-]+$/.test(normalized)) return true;
    return !/[A-Za-z]/.test(normalized);
  }

  private static inferOutlineTitleFromSection(section: ExtractedSection, fallbackTitle: string): string {
    const explicitTitle = this.normalizeOutlineTitle(section.heading || '');
    if (explicitTitle && !this.isGenericPageTitle(explicitTitle)) {
      return explicitTitle;
    }

    const lines = `${section.content || ''}`
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const candidate =
      lines.find((line) => {
        if (this.isWeakOutlineTitleCandidate(line)) return false;
        if (line.length <= 90 && !/[.!?]\s*$/.test(line)) return true;
        return /^(?:\d+\s+)?Unit\s+\d+\s*:/i.test(line) || /^Module\s+\d+\s*:/i.test(line);
      }) ||
      lines.find((line) => !this.isWeakOutlineTitleCandidate(line));

    return this.normalizeOutlineTitle(candidate || fallbackTitle);
  }

  private static toReadableChapterTitle(title: string): string {
    const cleaned = String(title || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';

    return cleaned
      .split(/(\s+|-)/)
      .map((part, index, parts) => {
        if (!part.trim() || part === '-') return part;
        const plain = part.replace(/[^A-Za-z]/g, '');
        if (!plain) return part;
        const previousWord = [...parts.slice(0, index)].reverse().find((candidate) => /[A-Za-z]/.test(candidate));
        const isFirstWord = !previousWord;
        const lower = part.toLowerCase();
        const wordOnly = lower.replace(/[^a-z]/g, '');
        const lowerWords = new Set(['and', 'for', 'the', 'of', 'in', 'to']);
        if (/^[A-Z]{2,4}$/.test(plain) && !lowerWords.has(wordOnly)) return part;

        const previousPlain = previousWord?.replace(/[^A-Za-z]/g, '') || '';
        const previousIsAcronym = Boolean(/^[A-Z]{2,4}$/.test(previousPlain) && !lowerWords.has(previousPlain.toLowerCase()));
        if (!isFirstWord && !previousIsAcronym && lowerWords.has(wordOnly)) {
          return lower;
        }

        return lower.replace(/[a-z]/, (letter) => letter.toUpperCase());
      })
      .join('');
  }

  private static makeOutlineId(level: DocumentOutlineNode['level'], title: string, order: number): string {
    const slug = String(title || level)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 80) || level;
    return `${level}-${order}-${slug}`;
  }

  private static isPdfRunningHeader(line: string): boolean {
    const normalized = String(line || '').trim().replace(/\s+/g, ' ');
    return /^TECHNOLOGY\s+GRADE\s+\d+\s+T\s*E\s*R\s*M\s+\d+$/i.test(normalized);
  }

  private static cleanOutlineContent(text: string): string {
    return String(text || '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !this.isPdfRunningHeader(line))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private static cleanPdfOutlineHeading(rawHeading: string): string {
    return String(rawHeading || '')
      .replace(/^\d+\s+TECHNOLOGY\s+GRADE\s+\d+\s+T\s*E\s*R\s*M\s+\d+\s*$/i, '')
      .replace(/\s+\d+\s+TECHNOLOGY\s+GRADE\s+\d+\s+T\s*E\s*R\s*M\s+\d+\s*$/i, '')
      .replace(/\.{3,}\s*\d{1,4}\s*$/, '')
      .replace(/\s+\d{1,4}\s*$/, '')
      .replace(/\.{3,}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static isLikelyTocChapterLine(line: string): boolean {
    return /^chapter\s+\d+\s+week\s+\d+/i.test(String(line || '').trim());
  }

  private static isLineLikelyPdfBodyBoundary(line: string): boolean {
    const normalized = String(line || '').trim().replace(/\s+/g, ' ');
    if (!normalized) return true;
    if (this.isPdfRunningHeader(normalized)) return true;
    if (/\bTECHNOLOGY\s+GRADE\s+\d+\s+T\s*E\s*R\s*M\s+\d+\b/i.test(normalized)) return true;
    if (/^figure\s+\d+/i.test(normalized)) return true;
    if (/^\d+\.\d+/.test(normalized)) return true;
    if (/^in this chapter\b/i.test(normalized)) return true;
    if (/^week\s+\d+/i.test(normalized)) return true;
    if (/^\d+\s*$/.test(normalized)) return true;
    if (/\.{3,}/.test(normalized)) return true;
    return false;
  }

  private static detectPdfChapterHeadingAt(lines: string[], lineIndex: number): { title: string; skipUntil: number } | null {
    const line = String(lines[lineIndex] || '').trim().replace(/\s+/g, ' ');
    if (!line || this.isLikelyTocChapterLine(line)) return null;
    const match = line.match(/^chapter\s+(\d+)(?:\s*:\s*|\s+)?(.*)$/i);
    if (!match) return null;

    const chapterNumber = match[1];
    const titleParts: string[] = [];
    let skipUntil = lineIndex;
    const firstPart = this.cleanPdfOutlineHeading(match[2] || '');
    if (firstPart && !/^week\s+\d+/i.test(firstPart)) {
      titleParts.push(firstPart);
      if (line.includes(':')) {
        return {
          title: `Chapter ${chapterNumber}: ${titleParts.join(' ')}`,
          skipUntil,
        };
      }
    }

    for (let lookahead = lineIndex + 1; lookahead < Math.min(lines.length, lineIndex + 4); lookahead++) {
      const candidate = this.cleanPdfOutlineHeading(lines[lookahead] || '');
      if (this.isLineLikelyPdfBodyBoundary(candidate)) break;
      if (/^chapter\s+\d+/i.test(candidate)) break;
      titleParts.push(candidate);
      skipUntil = lookahead;
      const combined = titleParts.join(' ');
      if (combined.length >= 28) break;
    }

    if (titleParts.length === 0) return null;
    return {
      title: `Chapter ${chapterNumber}: ${titleParts.join(' ')}`,
      skipUntil,
    };
  }

  private static inferOutlineLevelFromHeading(heading: string): DocumentOutlineNode['level'] {
    const normalized = String(heading || '').trim();
    if (/^term\s+\d+/i.test(normalized) || this.isPdfRunningHeader(normalized)) return 'term';
    if (/^chapter\s+\d+/i.test(normalized)) return 'chapter';
    if (/^\d+\.\d+\s+/.test(normalized)) return 'subsection';
    if (/^\d+\s+/.test(normalized)) return 'section';
    return 'section';
  }

  static buildDocumentOutline(input: {
    rawText: string;
    sections: ExtractedSection[];
    fileName: string;
    mimeType: string;
  }): DocumentOutlineNode[] {
    const sections = input.sections || [];
    if (input.mimeType.includes('presentationml') || input.fileName.toLowerCase().endsWith('.pptx')) {
      return sections.map((section, index) => {
        const title = this.normalizeOutlineTitle(section.heading || `Slide ${index + 1}`);
        const content = this.cleanOutlineContent(`${section.heading || ''}\n${section.content || ''}`);
        return {
          id: this.makeOutlineId('slide', title, index),
          title,
          level: 'slide',
          parentId: null,
          order: index,
          pageStart: section.pageNumber || index + 1,
          pageEnd: section.pageNumber || index + 1,
          wordCount: this.countWords(content),
          content,
          sourceSectionIndexes: [index],
          assetIds: [],
        };
      });
    }

    if (input.mimeType.includes('pdf') || input.fileName.toLowerCase().endsWith('.pdf')) {
      const pdfOutline = this.buildPdfDocumentOutline(sections);
      if (pdfOutline.length > 0) return pdfOutline;
    }

    if (
      input.mimeType.includes('wordprocessingml') ||
      input.fileName.toLowerCase().endsWith('.docx')
    ) {
      const docxOutline = this.buildDocxDocumentOutline(sections, input.fileName);
      if (docxOutline.length > 0) return docxOutline;
    }

    return this.buildGenericDocumentOutline(sections, input.fileName);
  }

  private static mapDocxHeadingLevelToOutlineLevel(headingLevel: number): DocumentOutlineNode['level'] {
    if (headingLevel <= 1) return 'chapter';
    if (headingLevel === 2) return 'section';
    return 'subsection';
  }

  private static getSectionOutlineLevel(section: ExtractedSection): number | null {
    const rawLevel = (section as any)?.metadata?.outlineLevel;
    const parsed = Number(rawLevel);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private static buildDocxDocumentOutline(sections: ExtractedSection[], fileName: string): DocumentOutlineNode[] {
    const headingSections = sections
      .map((section, index) => ({
        section,
        index,
        headingLevel: this.getSectionOutlineLevel(section),
      }))
      .filter((entry): entry is { section: ExtractedSection; index: number; headingLevel: number } =>
        entry.headingLevel !== null
      );

    if (headingSections.length === 0) return [];

    const nodes: DocumentOutlineNode[] = [];
    const sectionIndexToNode = new Map<number, DocumentOutlineNode>();
    const stack: Array<{ headingLevel: number; node: DocumentOutlineNode }> = [];

    for (const entry of headingSections) {
      while (stack.length > 0 && stack[stack.length - 1].headingLevel >= entry.headingLevel) {
        stack.pop();
      }

      const title = this.normalizeOutlineTitle(entry.section.heading || `Section ${entry.index + 1}`);
      const level = this.mapDocxHeadingLevelToOutlineLevel(entry.headingLevel);
      const parentId = stack[stack.length - 1]?.node.id || null;
      const node: DocumentOutlineNode = {
        id: this.makeOutlineId(level, title, entry.index),
        title,
        level,
        parentId,
        order: entry.index,
        pageStart: entry.section.pageNumber || entry.index + 1,
        pageEnd: entry.section.pageNumber || entry.index + 1,
        wordCount: 0,
        content: '',
        sourceSectionIndexes: [entry.index],
        assetIds: [],
        metadata: {
          sourceFileName: fileName,
          wordHeadingLevel: entry.headingLevel,
        },
      };

      nodes.push(node);
      sectionIndexToNode.set(entry.index, node);
      stack.push({ headingLevel: entry.headingLevel, node });
    }

    for (let headingIndex = 0; headingIndex < headingSections.length; headingIndex++) {
      const entry = headingSections[headingIndex];
      const node = sectionIndexToNode.get(entry.index);
      if (!node) continue;

      const nextBoundary = headingSections.find((candidate, candidateIndex) =>
        candidateIndex > headingIndex && candidate.headingLevel <= entry.headingLevel
      );
      const endSectionIndex = nextBoundary?.index ?? sections.length;
      const range = sections.slice(entry.index, endSectionIndex);
      const content = range
        .map((section) => `${section.heading || ''}\n${section.content || ''}`.trim())
        .filter(Boolean)
        .join('\n\n');
      const pageNumbers = range
        .map((section, offset) => section.pageNumber || entry.index + offset + 1)
        .filter((page): page is number => Number.isFinite(page) && page > 0);

      node.content = this.cleanOutlineContent(content);
      node.wordCount = this.countWords(node.content || '');
      node.sourceSectionIndexes = sections
        .map((_section, index) => index)
        .filter((index) => index >= entry.index && index < endSectionIndex);
      if (pageNumbers.length > 0) {
        node.pageStart = Math.min(...pageNumbers);
        node.pageEnd = Math.max(...pageNumbers);
      }
    }

    return nodes.filter((node) => node.wordCount > 0 || node.title.length > 0);
  }

  private static buildGenericDocumentOutline(sections: ExtractedSection[], fileName: string): DocumentOutlineNode[] {
    return sections
      .map((section, index) => {
        const title = this.inferOutlineTitleFromSection(section, section.heading || `Section ${index + 1}`) || `Section ${index + 1}`;
        const level = this.inferOutlineLevelFromHeading(title);
        const content = this.cleanOutlineContent(`${section.heading || ''}\n${section.content || ''}`);
        return {
          id: this.makeOutlineId(level, title, index),
          title,
          level,
          parentId: null,
          order: index,
          pageStart: section.pageNumber || null,
          pageEnd: section.pageNumber || null,
          wordCount: this.countWords(content),
          content,
          sourceSectionIndexes: [index],
          assetIds: [],
          metadata: { sourceFileName: fileName },
        };
      })
      .filter((node) => node.wordCount > 0 || node.title.length > 0);
  }

  private static buildPdfDocumentOutline(sections: ExtractedSection[]): DocumentOutlineNode[] {
    const nodes: DocumentOutlineNode[] = [];
    const byKey = new Map<string, DocumentOutlineNode>();
    let currentTermId: string | null = null;
    let currentChapterId: string | null = null;

    const addNode = (
      level: DocumentOutlineNode['level'],
      rawTitle: string,
      pageNumber: number | null,
      parentId: string | null,
      sourceSectionIndex: number,
      content?: string,
    ): DocumentOutlineNode => {
      const title = this.normalizeOutlineTitle(rawTitle);
      const key = `${level}:${parentId || 'root'}:${title.toLowerCase()}`;
      const existing = byKey.get(key);
      if (existing) {
        if (pageNumber) {
          existing.pageStart = existing.pageStart ? Math.min(existing.pageStart, pageNumber) : pageNumber;
          existing.pageEnd = existing.pageEnd ? Math.max(existing.pageEnd, pageNumber) : pageNumber;
        }
        existing.sourceSectionIndexes = Array.from(new Set([...(existing.sourceSectionIndexes || []), sourceSectionIndex]));
        if (content) {
          const nextContent = this.cleanOutlineContent(`${existing.content || ''}\n\n${content}`);
          existing.content = nextContent;
          existing.wordCount = this.countWords(nextContent);
        }
        return existing;
      }

      const order = nodes.length;
      const cleanContent = this.cleanOutlineContent(content || '');
      const node: DocumentOutlineNode = {
        id: this.makeOutlineId(level, title, order),
        title,
        level,
        parentId,
        order,
        pageStart: pageNumber,
        pageEnd: pageNumber,
        wordCount: this.countWords(cleanContent),
        content: cleanContent,
        sourceSectionIndexes: [sourceSectionIndex],
        assetIds: [],
      };
      nodes.push(node);
      byKey.set(key, node);
      return node;
    };

    const subsectionPattern = /^(\d+\.\d+(?:\.\d+)*)\s+(.{3,})$/;
    const numberedNoisePattern = /^\d+\s*$/;
    const firstContentIndex = sections.findIndex((section) => {
      const text = `${section.heading || ''}\n${section.content || ''}`;
      const lower = text.toLowerCase();
      if (lower.includes('table of contents')) return false;
      const hasChapterHeading = /(^|\n)\s*chapter\s+\d+(?!\s+week\s+\d+)/i.test(text);
      const hasInstructionalIntro = /(^|\n)\s*in this chapter\b/i.test(text);
      const hasRunningChapterFooter = /(^|\n)\s*chapter\s+\d+\s*:/i.test(text);
      return (hasChapterHeading && hasInstructionalIntro) || hasRunningChapterFooter;
    });
    const startIndex = firstContentIndex >= 0 ? firstContentIndex : 0;

    for (let index = startIndex; index < sections.length; index++) {
      const section = sections[index];
      const pageNumber = section.pageNumber || index + 1;
      const rawPageText = `${section.heading || ''}\n${section.content || ''}`;
      const pageText = this.cleanOutlineContent(rawPageText);
      const lines = rawPageText.split('\n').map((line) => line.trim()).filter(Boolean);
      let sawStructuralLine = false;

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        if (numberedNoisePattern.test(line)) continue;
        if (/^term\s+\d+/i.test(line)) {
          const termNode = addNode('term', line, pageNumber, null, index);
          currentTermId = termNode.id;
          continue;
        }
        if (this.isPdfRunningHeader(line)) {
          if (!currentTermId) {
            const termNode = addNode('term', line, pageNumber, null, index);
            currentTermId = termNode.id;
          }
          continue;
        }

        const chapterHeading = this.detectPdfChapterHeadingAt(lines, lineIndex);
        if (chapterHeading) {
          const currentChapter = currentChapterId ? nodes.find((node) => node.id === currentChapterId) : null;
          const currentChapterNumber = currentChapter?.title.match(/^Chapter\s+(\d+)/i)?.[1] || null;
          const nextChapterNumber = chapterHeading.title.match(/^Chapter\s+(\d+)/i)?.[1] || null;
          if (
            currentChapterNumber &&
            nextChapterNumber &&
            Number.parseInt(nextChapterNumber, 10) <= Number.parseInt(currentChapterNumber, 10)
          ) {
            lineIndex = Math.max(lineIndex, chapterHeading.skipUntil);
            continue;
          }
          const chapter = addNode('chapter', chapterHeading.title, pageNumber, currentTermId, index, pageText);
          currentChapterId = chapter.id;
          sawStructuralLine = true;
          lineIndex = Math.max(lineIndex, chapterHeading.skipUntil);
          continue;
        }

        const subsectionMatch = line.match(subsectionPattern);
        if (subsectionMatch && currentChapterId) {
          const chapterNumber = nodes.find((node) => node.id === currentChapterId)?.title.match(/^Chapter\s+(\d+)/i)?.[1] || null;
          const subsectionChapterNumber = subsectionMatch[1].split('.')[0];
          if (chapterNumber && subsectionChapterNumber !== chapterNumber) {
            continue;
          }
          const title = `${subsectionMatch[1]} ${this.cleanPdfOutlineHeading(subsectionMatch[2])}`;
          addNode('subsection', title, pageNumber, currentChapterId, index, pageText);
          sawStructuralLine = true;
        }
      }

      if (!sawStructuralLine && currentChapterId) {
        const chapter = nodes.find((node) => node.id === currentChapterId);
        if (chapter) {
          chapter.pageEnd = pageNumber;
          chapter.sourceSectionIndexes = Array.from(new Set([...(chapter.sourceSectionIndexes || []), index]));
          const nextContent = this.cleanOutlineContent(`${chapter.content || ''}\n\n${pageText}`);
          chapter.content = nextContent;
          chapter.wordCount = this.countWords(nextContent);
        }
      }
    }

    const sortedByStart = [...nodes].sort((a, b) => {
      const pageDiff = (a.pageStart || Number.MAX_SAFE_INTEGER) - (b.pageStart || Number.MAX_SAFE_INTEGER);
      return pageDiff || a.order - b.order;
    });
    for (let i = 0; i < sortedByStart.length; i++) {
      const node = sortedByStart[i];
      if (!node.pageStart) continue;
      const nextPeer = sortedByStart.find((candidate, candidateIndex) =>
        candidateIndex > i &&
        candidate.pageStart &&
        candidate.level === node.level &&
        candidate.parentId === node.parentId
      );
      if (nextPeer?.pageStart && nextPeer.pageStart > node.pageStart) {
        node.pageEnd = Math.max(node.pageStart, nextPeer.pageStart - 1);
      } else if (!node.pageEnd || node.pageEnd < node.pageStart) {
        node.pageEnd = node.pageStart;
      }
    }

    for (const node of nodes) {
      if (!node.pageStart || !node.pageEnd) continue;
      const rangeSections = sections
        .map((section, index) => ({ section, index }))
        .filter(({ section }) => {
          const page = section.pageNumber || null;
          return Boolean(page && node.pageStart && node.pageEnd && page >= node.pageStart && page <= node.pageEnd);
        });
      if (rangeSections.length === 0) continue;
      const content = rangeSections
        .map(({ section }) => `${section.heading || ''}\n${section.content || ''}`.trim())
        .filter(Boolean)
        .join('\n\n');
      node.content = this.cleanOutlineContent(content);
      node.wordCount = this.countWords(node.content || '');
      node.sourceSectionIndexes = rangeSections.map(({ index }) => index);
    }

    const termNodes = nodes.filter((node) => node.level === 'term');
    for (const term of termNodes) {
      const children = nodes.filter((node) => node.parentId === term.id);
      if (children.length === 0) continue;
      term.pageStart = Math.min(...children.map((node) => node.pageStart || Number.MAX_SAFE_INTEGER));
      term.pageEnd = Math.max(...children.map((node) => node.pageEnd || node.pageStart || 0));
      const content = sections
        .filter((section) => {
          const page = section.pageNumber || null;
          return Boolean(page && term.pageStart && term.pageEnd && page >= term.pageStart && page <= term.pageEnd);
        })
        .map((section) => `${section.heading || ''}\n${section.content || ''}`.trim())
        .filter(Boolean)
        .join('\n\n');
      term.content = this.cleanOutlineContent(content);
      term.wordCount = this.countWords(term.content || '');
    }

    const chapterNodes = nodes.filter((node) => node.level === 'chapter');
    for (const chapter of chapterNodes) {
      const children = nodes.filter((node) => node.parentId === chapter.id);
      if (children.length > 0) {
        chapter.pageEnd = Math.max(chapter.pageEnd || 0, ...children.map((node) => node.pageEnd || node.pageStart || 0));
        const content = sections
          .filter((section) => {
            const page = section.pageNumber || null;
            return Boolean(page && chapter.pageStart && chapter.pageEnd && page >= chapter.pageStart && page <= chapter.pageEnd);
          })
          .map((section) => `${section.heading || ''}\n${section.content || ''}`.trim())
          .filter(Boolean)
          .join('\n\n');
        chapter.content = this.cleanOutlineContent(content);
        chapter.wordCount = this.countWords(chapter.content || '');
        chapter.sourceSectionIndexes = sections
          .map((section, index) => ({ section, index }))
          .filter(({ section }) => {
            const page = section.pageNumber || null;
            return Boolean(page && chapter.pageStart && chapter.pageEnd && page >= chapter.pageStart && page <= chapter.pageEnd);
          })
          .map(({ index }) => index);
      }
    }

    return nodes.filter((node) => node.level !== 'section' || node.wordCount > 0);
  }

  private static buildSourceMap(
    rawText: string,
    sections: ExtractedSection[],
    fileName: string
  ): SourceMap {
    const documentId = this.generateDocumentId();
    const sourceSpans: SourceSpan[] = [];
    let currentOffset = 0;

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const sectionText = `${section.heading}\n${section.content}`.trim();
      
      // Find this section's text in the raw text
      let startOffset = rawText.indexOf(section.heading, currentOffset);
      if (startOffset === -1) {
        startOffset = currentOffset; // Fallback if heading not found exactly
      }
      
      const endOffset = Math.min(startOffset + sectionText.length, rawText.length);
      const textSpan = rawText.substring(startOffset, endOffset);
      
      sourceSpans.push({
        sectionId: `section-${i + 1}`,
        startOffset,
        endOffset,
        textSpan: textSpan.substring(0, 500), // Limit span preview to 500 chars
        confidence: 1.0, // From document extraction, high confidence
      });
      
      currentOffset = endOffset;
    }

    return {
      documentId,
      documentName: fileName,
      rawTextHash: this.hashText(rawText),
      sections: sourceSpans,
      extractedAt: new Date().toISOString(),
    };
  }

  static async extractFromDocx(buffer: Buffer, fileName: string): Promise<EnhancedExtractionResult> {
    try {
      const htmlResult = await mammoth.convertToHtml({ buffer });
      const textResult = await mammoth.extractRawText({ buffer });

      if (htmlResult.messages.length > 0) {
        console.warn('[CourseFrameworkExtractor] DOCX extraction warnings:', htmlResult.messages);
      }

      const rawText = textResult.value.trim();
      const wordCount = rawText.split(/\s+/).filter((w: string) => w.length > 0).length;
      const htmlWithoutTables = this.removeHtmlTables(htmlResult.value);
      const nonTableText = this.stripHtmlTags(htmlWithoutTables).trim();
      const docxStructured = this.extractStructuredLessonHeadingsFromText(nonTableText || rawText);
      const tables = this.extractTablesFromHtml(htmlResult.value);
      
      // Extract structural hints from HTML (bold, headings, numbered lists)
      const structuredHints = this.extractStructuralHints(htmlWithoutTables);
      for (const heading of docxStructured.headings) {
        structuredHints.push({
          text: heading.rawHeading,
          hintType: heading.lessonNumber !== null ? 'numbered' : 'heading',
          position: structuredHints.length,
        });
      }
      
      // Legacy sections for backward compatibility
      const sectionsWithoutTables = docxStructured.sections.length > 0
        ? docxStructured.sections
        : this.parseHtmlToSections(htmlResult.value);
      const sections = this.attachTablesToSections(sectionsWithoutTables, tables);
      const documentOutline = this.buildDocumentOutline({
        rawText,
        sections,
        fileName,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      
      // Build source map for zero-hallucination validation
      const sourceMap = this.buildSourceMap(rawText, sections, fileName);

      console.log(
        `[CourseFrameworkExtractor] DOCX extraction: ${wordCount} words, ${structuredHints.length} hints, ` +
        `${sections.length} sections, ${tables.length} tables, explicitStructure=${docxStructured.hasExplicitStructure}, ` +
        `${sourceMap.sections.length} source spans`
      );

      return {
        rawText,
        wordCount,
        structuredHints,
        sections,
        tables,
        documentOutline,
        structuredLessonHeadings: docxStructured.hasExplicitStructure ? docxStructured.headings : undefined,
        hasExplicitLessonStructure: docxStructured.hasExplicitStructure,
        sourceMap,
        metadata: {
          fileName,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileSize: buffer.length,
          wordCount,
          extractedAt: new Date().toISOString(),
        },
      };
    } catch (error: any) {
      console.error('[CourseFrameworkExtractor] DOCX extraction failed:', error);
      throw new Error(`Failed to extract content from Word document: ${error.message}`);
    }
  }

  private static classifyHeadingType(title: string): 'lesson' | 'module' | 'chapter' | 'section' | 'overview' | 'takeaways' {
    const normalized = (title || '').toLowerCase();
    if (/(^|\s)(overview|introduction|getting started)(\s|$)/i.test(normalized)) return 'overview';
    if (/(^|\s)(key\s+takeaways?|takeaways?|summary|conclusion|wrap[\s-]?up)(\s|$)/i.test(normalized)) return 'takeaways';
    if (/(^|\s)module(\s|$)/i.test(normalized)) return 'module';
    if (/(^|\s)chapter(\s|$)/i.test(normalized)) return 'chapter';
    if (/(^|\s)section(\s|$)/i.test(normalized)) return 'section';
    return 'lesson';
  }

  private static extractStructuredLessonHeadingsFromText(text: string): {
    headings: Array<{
      index: number;
      rawHeading: string;
      normalizedTitle: string;
      lessonNumber: number | null;
      type: 'lesson' | 'module' | 'chapter' | 'section' | 'overview' | 'takeaways';
      level: number;
      lineIndex: number;
    }>;
    sections: ExtractedSection[];
    hasExplicitStructure: boolean;
  } {
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    const headings: Array<{
      index: number;
      rawHeading: string;
      normalizedTitle: string;
      lessonNumber: number | null;
      type: 'lesson' | 'module' | 'chapter' | 'section' | 'overview' | 'takeaways';
      level: number;
      lineIndex: number;
    }> = [];

    const numberedHeadingPattern = /^(\d+(?:\.\d+)*)(?:\.)?\s+(.{3,})$/;
    lines.forEach((line, lineIndex) => {
      const numbered = line.match(numberedHeadingPattern);
      if (numbered) {
        const numbering = numbered[1];
        const title = numbered[2].trim();
        const level = numbering.split('.').length;
        const lessonNumber = Number.parseInt(numbering.split('.')[0], 10);
        headings.push({
          index: headings.length,
          rawHeading: line,
          normalizedTitle: title,
          lessonNumber: Number.isFinite(lessonNumber) ? lessonNumber : null,
          type: this.classifyHeadingType(title),
          level,
          lineIndex,
        });
      }
    });

    const topLevelHeadings = headings.filter((heading) => heading.level === 1);
    const sections: ExtractedSection[] = [];
    if (topLevelHeadings.length >= 2) {
      for (let i = 0; i < topLevelHeadings.length; i++) {
        const current = topLevelHeadings[i];
        const next = topLevelHeadings[i + 1];
        const startContent = current.lineIndex + 1;
        const endContent = next ? next.lineIndex : lines.length;
        const content = lines.slice(startContent, endContent).join('\n').trim();

        sections.push({
          heading: current.rawHeading,
          content: content || current.normalizedTitle,
          pageNumber: i + 1,
          type: current.type === 'overview' ? 'title' : 'heading',
        });
      }
    }

    // Build AI-facing structured headings from top-level numbered sections.
    const structuredHeadings = topLevelHeadings.map((heading, idx) => ({
      index: idx,
      rawHeading: heading.rawHeading,
      normalizedTitle: heading.normalizedTitle,
      lessonNumber: heading.lessonNumber,
      type: heading.type,
      level: heading.level,
      lineIndex: heading.lineIndex,
    }));
    const hasExplicitStructure = structuredHeadings.length >= 2;

    return {
      headings: structuredHeadings,
      sections,
      hasExplicitStructure,
    };
  }

  private static extractStructuralHints(html: string): StructuralHint[] {
    const hints: StructuralHint[] = [];
    let position = 0;

    // Extract headings (h1-h6)
    const headingPattern = /<(h[1-6])[^>]*>(.*?)<\/\1>/gi;
    let match;
    while ((match = headingPattern.exec(html)) !== null) {
      const text = this.stripHtmlTags(match[2]).trim();
      if (text.length > 0) {
        hints.push({ text, hintType: 'heading', position: position++ });
      }
    }

    // Extract bold text that looks like section headers (short bold phrases)
    const boldPattern = /<(strong|b)[^>]*>(.*?)<\/\1>/gi;
    while ((match = boldPattern.exec(html)) !== null) {
      const text = this.stripHtmlTags(match[2]).trim();
      // Only include bold text that looks like a header (3-100 chars, not a sentence)
      if (text.length >= 3 && text.length <= 100 && !text.includes('.')) {
        hints.push({ text, hintType: 'bold', position: position++ });
      }
    }

    // Detect ALL CAPS lines that could be section headers
    const plainText = this.stripHtmlTags(html);
    const lines = plainText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length >= 5 && trimmed.length <= 80 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) {
        hints.push({ text: trimmed, hintType: 'caps', position: position++ });
      }
    }

    // Detect numbered patterns (1., 2., etc. at start of lines)
    const numberedPattern = /^\s*(\d+[\.\)]\s+.{5,80})/gm;
    while ((match = numberedPattern.exec(plainText)) !== null) {
      hints.push({ text: match[1].trim(), hintType: 'numbered', position: position++ });
    }

    return hints;
  }

  private static parseHtmlToSections(html: string): ExtractedSection[] {
    const sections: ExtractedSection[] = [];
    
    if (!html || html.trim().length === 0) {
      return sections;
    }

    const contentHtml = this.removeHtmlTables(html);
    const headingPattern = /<(h[1-6])[^>]*>(.*?)<\/\1>/gi;
    const matches = Array.from(contentHtml.matchAll(headingPattern));

    if (matches.length === 0) {
      const textContent = this.stripHtmlTags(contentHtml).trim();
      if (textContent.length > 0) {
        sections.push({
          heading: 'Document Content',
          content: textContent,
          type: 'paragraph',
        });
      }
      return sections;
    }

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const headingTag = match[1].toLowerCase();
      const headingText = this.stripHtmlTags(match[2]).trim();
      const startIndex = match.index! + match[0].length;
      const endIndex = matches[i + 1]?.index ?? contentHtml.length;

      const sectionHtml = contentHtml.slice(startIndex, endIndex);
      const contentText = this.stripHtmlTags(sectionHtml).trim();

      const headingLevel = parseInt(headingTag.charAt(1));
      const type: ExtractedSection['type'] = headingLevel === 1 ? 'title' : 'heading';

      sections.push({
        heading: headingText || `Section ${i + 1}`,
        content: contentText,
        pageNumber: i + 1,
        type,
        metadata: { outlineLevel: headingLevel },
      });
    }

    const firstHeadingIndex = matches[0]?.index ?? 0;
    if (firstHeadingIndex > 0) {
      const preContent = this.stripHtmlTags(contentHtml.slice(0, firstHeadingIndex)).trim();
      if (preContent.length > 0) {
        sections.unshift({
          heading: 'Introduction',
          content: preContent,
          type: 'paragraph',
        });
      }
    }

    return sections.filter(s => s.content.length > 0 || s.heading.length > 0);
  }

  private static removeHtmlTables(html: string): string {
    return String(html || '').replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, '');
  }

  private static extractTablesFromHtml(html: string): ExtractedTable[] {
    const sourceHtml = String(html || '');
    const tableMatches = Array.from(sourceHtml.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi));

    return tableMatches
      .map((match, tableIndex): ExtractedTable | null => {
        const tableHtml = match[0] || '';
        const order = tableIndex + 1;
        const nearbyHeading = this.findNearestHeadingBeforeHtmlIndex(sourceHtml, match.index ?? 0);
        const theadEndIndex = tableHtml.search(/<\/thead>/i);
        const rows = Array.from(tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))
          .map((rowMatch, rowIndex) => {
            const rowIsInThead = theadEndIndex >= 0 && (rowMatch.index ?? 0) < theadEndIndex;
            const cells = Array.from(rowMatch[1].matchAll(/<(t[hd])\b([^>]*)>([\s\S]*?)<\/t[hd]>/gi))
              .map((cellMatch, columnIndex) => {
                const text = this.stripHtmlTags(cellMatch[3]).replace(/\s+/g, ' ').trim();
                const isHeader = cellMatch[1].toLowerCase() === 'th' || rowIsInThead;
                const rowSpan = this.parsePositiveHtmlIntegerAttribute(cellMatch[2], 'rowspan');
                const colSpan = this.parsePositiveHtmlIntegerAttribute(cellMatch[2], 'colspan');
                return {
                  text,
                  rowIndex,
                  columnIndex,
                  isHeader,
                  rowSpan,
                  colSpan,
                };
              })
              .filter((cell) => cell.text.length > 0);

            return cells;
          })
          .filter((row) => row.length > 0);

        if (rows.length === 0) return null;

        const firstRowIsHeader = rows[0].every((cell) => cell.isHeader) || rows.length === 1;
        const headers = firstRowIsHeader ? rows[0].map((cell) => cell.text) : [];
        const dataRows = (firstRowIsHeader ? rows.slice(1) : rows).map((row) => row.map((cell) => cell.text));
        const allRows = rows.map((row) => row.map((cell) => cell.text));
        const columnCount = Math.max(...allRows.map((row) => row.length), 0);
        const title = nearbyHeading || `Table ${order}`;

        return {
          id: this.makeOutlineId('section', `table-${order}-${title}`, order),
          title,
          order,
          headers,
          rows: dataRows,
          cells: rows.flat(),
          rowCount: rows.length,
          columnCount,
          nearbyHeading,
          markdown: this.tableToMarkdown(headers, dataRows, allRows),
          metadata: {
            extractionMethod: 'mammoth-html-table',
          },
        };
      })
      .filter((table): table is ExtractedTable => table !== null);
  }

  private static attachTablesToSections(sections: ExtractedSection[], tables: ExtractedTable[]): ExtractedSection[] {
    if (sections.length === 0 || tables.length === 0) return sections;

    return sections.map((section) => {
      const matchingTables = tables.filter((table) =>
        this.normalizeOutlineTitle(table.nearbyHeading || table.title) === this.normalizeOutlineTitle(section.heading)
      );
      if (matchingTables.length === 0) return section;

      const tableContent = matchingTables
        .map((table) => [`Table: ${table.title}`, table.markdown].filter(Boolean).join('\n'))
        .join('\n\n');

      return {
        ...section,
        content: [section.content, tableContent].filter(Boolean).join('\n\n'),
        metadata: {
          ...(section.metadata || {}),
          tableIds: [
            ...((Array.isArray((section.metadata as any)?.tableIds) ? (section.metadata as any).tableIds : []) as string[]),
            ...matchingTables.map((table) => table.id),
          ],
        },
      };
    });
  }

  private static findNearestHeadingBeforeHtmlIndex(html: string, index: number): string | null {
    const before = html.slice(0, Math.max(0, index));
    const headings = Array.from(before.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi))
      .map((match) => this.stripHtmlTags(match[1]).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    return headings[headings.length - 1] || null;
  }

  private static parsePositiveHtmlIntegerAttribute(attributes: string, name: string): number {
    const match = String(attributes || '').match(new RegExp(`${name}=["']?(\\d+)["']?`, 'i'));
    const parsed = match ? Number.parseInt(match[1], 10) : 1;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }

  private static tableToMarkdown(headers: string[], rows: string[][], allRows: string[][]): string {
    const effectiveHeaders = headers.length > 0
      ? headers
      : Array.from({ length: Math.max(...allRows.map((row) => row.length), 0) }, (_value, index) => `Column ${index + 1}`);
    const effectiveRows = headers.length > 0 ? rows : allRows;
    const width = Math.max(effectiveHeaders.length, ...effectiveRows.map((row) => row.length), 0);
    if (width === 0) return '';

    const normalizeRow = (row: string[]) => Array.from({ length: width }, (_value, index) =>
      this.escapeMarkdownTableCell(row[index] || '')
    );
    const headerRow = normalizeRow(effectiveHeaders);
    const dividerRow = Array.from({ length: width }, () => '---');
    const dataRows = effectiveRows.map(normalizeRow);

    return [headerRow, dividerRow, ...dataRows]
      .map((row) => `| ${row.join(' | ')} |`)
      .join('\n');
  }

  private static escapeMarkdownTableCell(value: string): string {
    return String(value || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
  }

  private static stripHtmlTags(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  static async extractFromPptx(buffer: Buffer, fileName: string): Promise<EnhancedExtractionResult> {
    try {
      const extractor = new PptxExtractor();
      const result = await extractor.extractFromBuffer(buffer);

      const sections: ExtractedSection[] = result.slides.map((slide: SlideContent) => {
        const contentParts = [slide.body, slide.notes].filter(Boolean);
        const content = contentParts.join('\n\n');

        return {
          heading: slide.title || `Slide ${slide.slideNumber}`,
          content,
          pageNumber: slide.slideNumber,
          type: 'heading' as const,
        };
      });

      // Combine all slide content into rawText
      const rawTextParts: string[] = [];
      const structuredHints: StructuralHint[] = [];
      
      result.slides.forEach((slide: SlideContent, index: number) => {
        if (slide.title) {
          structuredHints.push({ text: slide.title, hintType: 'heading', position: index });
          rawTextParts.push(`${slide.title}\n${slide.body || ''}`);
        } else {
          rawTextParts.push(slide.body || '');
        }
        if (slide.notes) {
          rawTextParts.push(slide.notes);
        }
      });

      const rawText = rawTextParts.join('\n\n').trim();
      const wordCount = rawText.split(/\s+/).filter(w => w.length > 0).length;
      const documentOutline = this.buildDocumentOutline({
        rawText,
        sections,
        fileName,
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
      
      // Build source map for zero-hallucination validation
      const sourceMap = this.buildSourceMap(rawText, sections, fileName);

      console.log(`[CourseFrameworkExtractor] PPTX extraction: ${result.totalSlides} slides, ${wordCount} words, ${sourceMap.sections.length} source spans`);

      return {
        rawText,
        wordCount,
        structuredHints,
        sections,
        documentOutline,
        sourceMap,
        metadata: {
          fileName,
          mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          fileSize: buffer.length,
          slideCount: result.totalSlides,
          wordCount,
          extractedAt: result.extractedAt,
        },
      };
    } catch (error: any) {
      console.error('[CourseFrameworkExtractor] PPTX extraction failed:', error);
      throw new Error(`Failed to extract content from PowerPoint: ${error.message}`);
    }
  }

  private static detectPdfHeading(line: string): { heading: string; number: number | null } | null {
    const trimmed = line.trim().replace(/\s+/g, ' ');
    if (!trimmed || trimmed.length < 3) return null;

    // Numbered section headings (e.g. "2.1 Hardware Requirements", "1 What Is...")
    const numbered = trimmed.match(/^((?:\d+\.)*\d+)\s+(.{3,})$/);
    if (numbered) {
      const heading = `${numbered[1]} ${numbered[2].trim()}`.trim();
      return { heading, number: null };
    }

    // Chapter-like heading with trailing page index in TOC text (e.g. "Planning the Installation 13")
    const tocLine = trimmed.match(/^(.{3,}?)\s+(?:\.{2,}\s*)?(\d{1,4})$/);
    if (tocLine) {
      return { heading: tocLine[1].trim(), number: Number.parseInt(tocLine[2], 10) || null };
    }

    return null;
  }

  private static extractPdfStructuralHints(fullText: string): StructuralHint[] {
    const hints: StructuralHint[] = [];
    let position = 0;
    const lines = fullText.split('\n').map((line) => line.trim()).filter(Boolean);

    for (const line of lines) {
      const heading = this.detectPdfHeading(line);
      if (heading) {
        hints.push({ text: heading.heading, hintType: 'numbered', position: position++ });
        continue;
      }

      if (/^[A-Z][A-Z0-9\s\-:]{4,80}$/.test(line)) {
        hints.push({ text: line, hintType: 'caps', position: position++ });
      }
    }

    return hints;
  }

  private static buildPdfSections(pages: string[]): ExtractedSection[] {
    const sections: ExtractedSection[] = [];
    const headingRegex = /^((?:\d+\.)*\d+)\s+(.{3,})$/;

    pages.forEach((pageText, pageIndex) => {
      const pageNumber = pageIndex + 1;
      const lines = pageText.split('\n').map((line) => line.trim()).filter(Boolean);
      if (lines.length === 0) {
        return;
      }

      const firstLine = lines[0];
      const detectedHeading = this.detectPdfHeading(firstLine);
      const sectionHeading = detectedHeading?.heading || `Page ${pageNumber}`;

      const bodyStart = detectedHeading ? 1 : 0;
      const content = lines.slice(bodyStart).join('\n').trim();

      sections.push({
        heading: sectionHeading,
        content: content || firstLine,
        pageNumber,
        type: headingRegex.test(firstLine) ? 'heading' : 'paragraph',
      });
    });

    return sections;
  }

  private static getNodeMajorVersion(): number {
    const raw = process.versions?.node || '0';
    const major = Number.parseInt(raw.split('.')[0], 10);
    return Number.isFinite(major) ? major : 0;
  }

  private static async extractPdfViaPdftotext(buffer: Buffer): Promise<{ pages: string[]; total: number }> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'learnplay-pdf-'));
    const inputPath = path.join(tempDir, 'input.pdf');
    const outputPath = path.join(tempDir, 'output.txt');

    try {
      await fs.writeFile(inputPath, buffer);
      // pdftotext writes a single text output and uses form-feed separators for pages.
      await execFileAsync('pdftotext', ['-enc', 'UTF-8', '-f', '1', '-l', '99999', inputPath, outputPath]);
      const fullText = await fs.readFile(outputPath, 'utf8');
      const pages = (fullText || '')
        .split('\f')
        .map((page) => page.trim())
        .filter(Boolean);
      return { pages, total: pages.length };
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        throw new Error(
          'PDF extraction requires `pdftotext` on this Node runtime. Install poppler-utils (pdftotext) or upgrade runtime to Node 20+.'
        );
      }
      throw error;
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  private static async extractPdfViaPdfParseNode(buffer: Buffer): Promise<{ pages: string[]; total: number }> {
    // pdf-parse exposes this subpath at runtime, but its package types do not
    // publish a matching declaration for ts-jest.
    // @ts-ignore
    const nodeModule = await import('pdf-parse/node').catch(() => null);
    let ParserCtor = (nodeModule as any)?.PDFParse;
    if (!ParserCtor) {
      const module = await import('pdf-parse');
      ParserCtor = (module as any).PDFParse;
    }
    if (!ParserCtor) {
      throw new Error('pdf-parse does not expose PDFParse');
    }
    const parser = new ParserCtor({ data: buffer });
    try {
      const textResult = await parser.getText();
      const pages = (textResult.pages || []).map((page: any) => (page?.text || '').trim());
      return { pages, total: textResult.total || pages.length };
    } finally {
      await parser.destroy();
    }
  }

  static async extractFromPdf(buffer: Buffer, fileName: string): Promise<EnhancedExtractionResult> {
    try {
      const nodeMajor = this.getNodeMajorVersion();
      let extractionResult: { pages: string[]; total: number };
      if (nodeMajor >= 20) {
        try {
          extractionResult = await this.extractPdfViaPdfParseNode(buffer);
        } catch (pdfParseError: any) {
          console.warn(
            `[CourseFrameworkExtractor] pdf-parse extraction failed, falling back to pdftotext: ${pdfParseError.message}`
          );
          extractionResult = await this.extractPdfViaPdftotext(buffer);
        }
      } else {
        extractionResult = await this.extractPdfViaPdftotext(buffer);
      }
      const cleanedPages = extractionResult.pages.map((page) => page.trim());
      const rawText = cleanedPages.filter(Boolean).join('\n\n').trim();
      if (!rawText) {
        throw new Error('No extractable text was found in the PDF. The document may be scanned/image-only.');
      }

      const wordCount = rawText.split(/\s+/).filter((w: string) => w.length > 0).length;
      const structuredHints = this.extractPdfStructuralHints(rawText);
      const sections = this.buildPdfSections(cleanedPages);
      const documentOutline = this.buildDocumentOutline({
        rawText,
        sections,
        fileName,
        mimeType: 'application/pdf',
      });
      const sourceMap = this.buildSourceMap(rawText, sections, fileName);

      console.log(
        `[CourseFrameworkExtractor] PDF extraction: ${extractionResult.total || cleanedPages.length} pages, ` +
        `${wordCount} words, ${structuredHints.length} hints, ${sourceMap.sections.length} source spans`
      );

      return {
        rawText,
        wordCount,
        structuredHints,
        sections,
        documentOutline,
        sourceMap,
        metadata: {
          fileName,
          mimeType: 'application/pdf',
          fileSize: buffer.length,
          pageCount: extractionResult.total || cleanedPages.length,
          wordCount,
          extractedAt: new Date().toISOString(),
        },
      };
    } catch (error: any) {
      console.error('[CourseFrameworkExtractor] PDF extraction failed:', error);
      throw new Error(`Failed to extract content from PDF: ${error.message}`);
    }
  }

  static async extract(
    buffer: Buffer, 
    fileName: string, 
    mimeType: string,
    options?: { maxFileSizeMB?: number }
  ): Promise<EnhancedExtractionResult> {
    this.validateFile(mimeType, buffer.length, options?.maxFileSizeMB);

    if (mimeType.includes('wordprocessingml')) {
      return this.extractFromDocx(buffer, fileName);
    } else if (mimeType.includes('presentationml')) {
      return this.extractFromPptx(buffer, fileName);
    } else if (mimeType === 'application/pdf' || mimeType.includes('pdf')) {
      return this.extractFromPdf(buffer, fileName);
    }

    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  // Convert enhanced result to ExtractedContent format for storage
  static toExtractedContent(result: EnhancedExtractionResult): ExtractedContent {
    const extracted: any = {
      rawText: result.rawText,
      wordCount: result.wordCount,
      structuredHints: result.structuredHints,
      sections: result.sections,
      documentOutline: result.documentOutline || [],
      sourceMap: result.sourceMap,
      metadata: {
        fileName: result.metadata.fileName,
        mimeType: result.metadata.mimeType,
        fileSize: result.metadata.fileSize,
        pageCount: result.metadata.pageCount,
        slideCount: result.metadata.slideCount,
        extractedAt: result.metadata.extractedAt,
      },
    };
    if (result.structuredLessonHeadings && result.structuredLessonHeadings.length > 0) {
      extracted.structuredLessonHeadings = result.structuredLessonHeadings;
      extracted.hasExplicitLessonStructure = result.hasExplicitLessonStructure === true;
    }
    return extracted as ExtractedContent;
  }

  static estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }

  static truncateToTokenLimit(sections: ExtractedSection[], maxTokens: number = 40000): ExtractedSection[] {
    const result: ExtractedSection[] = [];
    let currentTokens = 0;

    for (const section of sections) {
      const sectionText = `${section.heading}\n${section.content}`;
      const sectionTokens = this.estimateTokenCount(sectionText);

      if (currentTokens + sectionTokens > maxTokens) {
        const remainingTokens = maxTokens - currentTokens;
        if (remainingTokens > 100) {
          const maxChars = remainingTokens * 4;
          const truncatedContent = section.content.slice(0, maxChars - section.heading.length);
          result.push({
            ...section,
            content: truncatedContent + '...',
          });
        }
        break;
      }

      result.push(section);
      currentTokens += sectionTokens;
    }

    return result;
  }

  static toDraftSegments(result: EnhancedExtractionResult): DraftDocumentSegment[] {
    const segments: DraftDocumentSegment[] = [];
    const rawText = result.rawText || '';
    let segmentIndex = 0;
    let cursor = 0;

    const addSegment = (
      text: string,
      segmentType: string,
      headingPath: string[] = [],
      pageOrSlide: number | null = null,
      metadata?: Record<string, any>,
    ) => {
      const normalizedText = (text || '').trim();
      if (!normalizedText) return;
      let startOffset = rawText.indexOf(normalizedText, cursor);
      if (startOffset < 0) {
        startOffset = rawText.indexOf(normalizedText);
      }
      if (startOffset < 0) {
        startOffset = Math.max(0, cursor);
      }
      const endOffset = Math.min(rawText.length, startOffset + normalizedText.length);
      cursor = Math.max(cursor, endOffset);
      segments.push({
        segmentIndex,
        segmentType,
        text: normalizedText,
        textHash: this.hashText(normalizedText),
        startOffset,
        endOffset,
        headingPath,
        pageOrSlide,
        metadata,
      });
      segmentIndex += 1;
    };

    for (const section of result.sections || []) {
      const heading = (section.heading || '').trim();
      if (heading) {
        addSegment(
          heading,
          section.type === 'title' ? 'title' : 'heading',
          heading ? [heading] : [],
          section.pageNumber ?? null,
          { sectionType: section.type }
        );
      }

      const content = (section.content || '').trim();
      if (!content) continue;
      const paragraphs = content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
      if (paragraphs.length === 0) {
        addSegment(content, section.type || 'paragraph', heading ? [heading] : [], section.pageNumber ?? null);
        continue;
      }

      for (const paragraph of paragraphs) {
        addSegment(paragraph, 'paragraph', heading ? [heading] : [], section.pageNumber ?? null);
      }
    }

    // Fallback path if sections are unavailable or empty.
    if (segments.length === 0 && rawText.trim().length > 0) {
      const paragraphs = rawText.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
      for (const paragraph of paragraphs) {
        addSegment(paragraph, 'paragraph', [], null);
      }
    }

    return segments;
  }
}
