import { PreviewFrame, ClickableElement } from '../PreviewFrame';
import { BookOpen, FileText, GraduationCap, MoreVertical, Globe } from 'lucide-react';

export function PreviewCourseBuilder() {
  return (
    <PreviewFrame className="min-h-[620px]" data-testid="preview-course-builder">
      <div className="space-y-4 p-4" style={{ backgroundColor: 'var(--surface-primary)' }}>
        <ClickableElement
          editKey="--panel-bg"
          className="rounded-xl border p-4"
          style={{ backgroundColor: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
          data-testid="course-builder-shell"
          aria-label="Edit course builder panel background"
        >
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2
                className="text-lg font-semibold"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}
              >
                Course Builder
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                Lesson workflow preview with artifact badges
              </p>
            </div>
            <button
              className="rounded-full border px-3 py-1 text-xs"
              style={{
                backgroundColor: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-fg)',
                borderColor: 'var(--btn-primary-bg)',
              }}
            >
              Publish
            </button>
          </div>

          {[1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="mb-3 rounded-lg border p-3"
              style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold"
                    style={{
                      backgroundColor: 'var(--badge-secondary-bg)',
                      color: 'var(--badge-secondary-fg)',
                    }}
                  >
                    {idx}
                  </span>
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Lesson {idx}: Applied AI in Practice
                  </h3>
                </div>
                <MoreVertical className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
              </div>

              <div className="mb-2 flex flex-wrap gap-2">
                <ClickableElement
                  editKey="--lesson-artifact-source-db-bg"
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    backgroundColor: 'var(--lesson-artifact-source-db-bg)',
                    color: 'var(--lesson-artifact-source-db-fg)',
                    borderColor: 'var(--lesson-artifact-source-db-border)',
                  }}
                  data-testid={`course-builder-badge-source-${idx}`}
                  aria-label="Edit source DB artifact badge"
                >
                  <FileText className="h-3 w-3" />
                  Source DB
                  <span className="opacity-80">EN</span>
                </ClickableElement>

                <ClickableElement
                  editKey="--lesson-artifact-objectives-bg"
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    backgroundColor: 'var(--lesson-artifact-objectives-bg)',
                    color: 'var(--lesson-artifact-objectives-fg)',
                    borderColor: 'var(--lesson-artifact-objectives-border)',
                  }}
                  data-testid={`course-builder-badge-objectives-${idx}`}
                  aria-label="Edit learning objectives artifact badge"
                >
                  <GraduationCap className="h-3 w-3" />
                  Learning Objectives
                  <span className="opacity-80">EN</span>
                </ClickableElement>

                <ClickableElement
                  editKey="--lesson-artifact-digest-bg"
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    backgroundColor: 'var(--lesson-artifact-digest-bg)',
                    color: 'var(--lesson-artifact-digest-fg)',
                    borderColor: 'var(--lesson-artifact-digest-border)',
                  }}
                  data-testid={`course-builder-badge-digest-${idx}`}
                  aria-label="Edit lesson digest artifact badge"
                >
                  <BookOpen className="h-3 w-3" />
                  Lesson Digest
                  <span className="opacity-80">EN</span>
                </ClickableElement>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                  style={{
                    backgroundColor: 'var(--btn-outline-bg)',
                    color: 'var(--btn-outline-fg)',
                    borderColor: 'var(--btn-outline-border)',
                  }}
                >
                  <Globe className="h-3 w-3" />
                  Translate
                </button>
                <button
                  className="rounded-md border px-2 py-1 text-xs"
                  style={{
                    backgroundColor: 'var(--btn-ghost-bg)',
                    color: 'var(--btn-ghost-fg)',
                    borderColor: 'var(--btn-ghost-border)',
                  }}
                >
                  Lesson Actions
                </button>
              </div>
            </div>
          ))}
        </ClickableElement>
      </div>
    </PreviewFrame>
  );
}

export default PreviewCourseBuilder;
