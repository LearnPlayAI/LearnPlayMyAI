import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('Course builder add-lesson upload source content contract', () => {
  const uploadPage = readSource('client/src/pages/CourseBuilderUpload.tsx');
  const courseRoutes = readSource('server/routes/courseRoutes.ts');
  const documentExtractor = readSource('server/services/documentExtractor.ts');

  it('labels topic-based upload as adding lesson source material, not replacing a lesson', () => {
    expect(uploadPage).toContain('Add Lesson Source Material');
    expect(uploadPage).toContain('Upload source material for this new lesson.');
    expect(uploadPage).toContain('Add Source Material');
  });

  it('allows new lessons to start from PowerPoint, Word, PDF, or video where applicable', () => {
    expect(uploadPage).toContain("type FileType = 'pptx' | 'document' | 'video'");
    expect(uploadPage).toContain('Document (.doc, .docx, .pdf)');
    expect(uploadPage).toContain('.doc,.docx,.pdf');
    expect(uploadPage).toContain('/\\.(doc|docx|pdf)$/');
    expect(uploadPage).toContain('documentFile');
    expect(uploadPage).toContain('/api/lessons/source-document-upload');
  });

  it('extracts uploaded Word and PDF content into the new lesson Source DB without starting paid generation', () => {
    expect(courseRoutes).toContain('app.post("/api/lessons/source-document-upload"');
    expect(courseRoutes).toContain("documentUpload.single('documentFile')");
    expect(courseRoutes).toContain("source: 'document_upload'");
    expect(courseRoutes).toContain('newContent: extractedContent.text');
    expect(courseRoutes).toContain('syncLessonSourceContentToFrameworkTopics');
    expect(courseRoutes).not.toContain('source-document-upload",\n    withSessionAuthMiddleware,\n    (req: Request, res: Response, next: any) => {\n      pptxUpload');

    expect(courseRoutes).toContain("generationStatus: 'completed'");
    expect(courseRoutes).toContain("contentStatus: 'completed'");

    expect(documentExtractor).toContain("fileType: 'doc' | 'docx' | 'pdf'");
    expect(documentExtractor).toContain('extractTextFromLegacyDoc');
    expect(documentExtractor).toContain('extractTextFromPdf');
    expect(documentExtractor).toContain("'application/pdf'");
  });
});
