import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('brand logo containment', () => {
  it('contains non-square brand logos in admin and marketplace brand marks', () => {
    const adminLayout = read('client/src/components/AdminLayout.tsx');
    const quizAdminLayout = read('client/src/components/QuizAdminLayout.tsx');
    const landing = read('client/src/pages/landing.jsx');
    const browseCourses = read('client/src/pages/BrowseCourses.tsx');
    const courseDetail = read('client/src/pages/CourseDetail.tsx');
    const myCourses = read('client/src/pages/MyCourses.tsx');
    const previewHomepage = read('client/src/components/brand-editor/previews/PreviewHomepage.tsx');

    expect(adminLayout).toContain('className="max-h-full max-w-full object-contain p-0.5"');
    expect(quizAdminLayout).toContain('className="max-h-full max-w-full object-contain p-0.5"');
    expect(landing).toContain('className="max-h-full max-w-full object-contain p-1"');
    expect(landing).toContain('className="w-10 h-10 rounded-lg object-contain bg-background p-0.5"');
    expect(browseCourses).toContain('className="h-8 w-8 rounded-full object-contain flex-shrink-0 border border-border bg-background p-0.5"');
    expect(courseDetail).toContain('className="h-8 w-8 rounded-full object-contain flex-shrink-0 border border-[var(--stroke-default)]/20 bg-background p-0.5"');
    expect(myCourses).toContain('className="h-5 w-5 rounded-full object-contain flex-shrink-0 bg-background p-px"');
    expect(previewHomepage).toContain('className="max-h-full max-w-full object-contain p-0.5"');
  });
});
