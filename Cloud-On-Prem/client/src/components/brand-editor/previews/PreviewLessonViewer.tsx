import { PreviewFrame, ClickableElement } from '../PreviewFrame';
import { useBrandEditor } from '../BrandEditorShell';
import { useState } from 'react';

export function PreviewLessonViewer() {
  const { state } = useBrandEditor();
  const brandName = state.brandName || 'LearnPlay';
  const [activeTab, setActiveTab] = useState<'content' | 'transcript' | 'resources'>('content');

  const lessons = [
    { title: 'Introduction', duration: '5:30', completed: true },
    { title: 'Setting Up Your Environment', duration: '12:45', completed: true },
    { title: 'Variables and Data Types', duration: '18:20', completed: false, current: true },
    { title: 'Control Flow', duration: '22:10', completed: false },
    { title: 'Functions', duration: '25:00', completed: false },
  ];

  const resources = [
    { name: 'Lesson Notes.pdf', type: 'pdf', size: '1.2 MB' },
    { name: 'Code Examples.zip', type: 'zip', size: '856 KB' },
    { name: 'Cheat Sheet.pdf', type: 'pdf', size: '320 KB' },
  ];

  const quizQuestion = {
    question: 'What is the output of print(type(42))?',
    options: [
      { label: 'A', text: '<class \'int\'>', correct: true },
      { label: 'B', text: '<class \'str\'>' },
      { label: 'C', text: '<class \'float\'>' },
      { label: 'D', text: '<class \'number\'>' },
    ],
  };

  const currentLessonIndex = lessons.findIndex(l => l.current);
  const completedCount = lessons.filter(l => l.completed).length;
  const progressPercent = Math.round((completedCount / lessons.length) * 100);

  return (
    <PreviewFrame className="min-h-[700px]" data-testid="preview-lesson">
      <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--surface-primary)' }}>
        <ClickableElement
          editKey="--nav-bg"
          className="border-b px-4 py-3"
          style={{ 
            backgroundColor: 'var(--nav-bg)', 
            borderColor: 'var(--stroke-default)' 
          }}
          data-testid="preview-lesson-header"
          aria-label="Edit header style"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ClickableElement
                editKey="--btn-ghost-bg"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                style={{ 
                  backgroundColor: 'var(--btn-ghost-bg)', 
                  color: 'var(--btn-ghost-fg)',
                  border: '1px solid var(--btn-ghost-border)'
                }}
                data-testid="preview-lesson-back-button"
                aria-label="Edit back button style"
              >
                ←
              </ClickableElement>
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }} data-testid="preview-lesson-course-name">
                  Python for Beginners
                </p>
                <ClickableElement
                  editKey="--foreground"
                  as="h1"
                  className="text-lg font-bold"
                  style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}
                  data-testid="preview-lesson-title"
                  aria-label="Edit title color"
                >
                  Lesson {currentLessonIndex + 1}: Variables and Data Types
                </ClickableElement>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ClickableElement
                editKey="--accent"
                className="px-3 py-1 rounded-full text-xs font-medium"
                style={{ 
                  backgroundColor: 'var(--action-accent)', 
                  color: 'var(--action-accent-fg)' 
                }}
                data-testid="preview-lesson-status-badge"
                aria-label="Edit status badge"
              >
                In Progress
              </ClickableElement>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {completedCount}/{lessons.length} complete
              </div>
            </div>
          </div>
          <ClickableElement
            editKey="--progress-bar-fill"
            className="mt-3 h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--progress-bar-bg)' }}
            data-testid="preview-lesson-course-progress"
            aria-label="Edit progress bar"
          >
            <div
              className="h-full rounded-full transition-all"
              style={{ backgroundColor: 'var(--progress-bar-fill)', width: `${progressPercent}%` }}
            />
          </ClickableElement>
        </ClickableElement>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col overflow-y-auto" data-testid="preview-lesson-main">
            <ClickableElement
              editKey="--muted"
              className="relative aspect-video flex items-center justify-center"
              style={{ backgroundColor: 'var(--surface-muted)' }}
              data-testid="preview-lesson-video-player"
              aria-label="Edit video player background"
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <ClickableElement
                  editKey="--primary"
                  className="w-16 h-16 rounded-full flex items-center justify-center shadow-elevated cursor-pointer hover:scale-105 transition-transform"
                  style={{ backgroundColor: 'var(--action-primary)' }}
                  data-testid="preview-lesson-play-button"
                  aria-label="Edit play button"
                >
                  <span className="text-2xl ml-1" style={{ color: 'var(--action-primary-fg)' }}>▶</span>
                </ClickableElement>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4" style={{ background: 'linear-gradient(transparent, color-mix(in srgb, var(--text-primary) 70%, transparent))' }}>
                <div className="flex items-center gap-3 text-primary-foreground text-sm">
                  <span>0:00</span>
                  <ClickableElement
                    editKey="--primary"
                    className="flex-1 h-1 rounded-full overflow-hidden"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--action-primary-fg) 30%, transparent)' }}
                    data-testid="preview-lesson-video-progress"
                    aria-label="Edit video progress bar"
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ backgroundColor: 'var(--action-primary)', width: '35%' }}
                    />
                  </ClickableElement>
                  <span>18:20</span>
                </div>
              </div>
              <div className="absolute top-4 right-4">
                <ClickableElement
                  editKey="--badge-bg"
                  className="px-2 py-1 rounded text-xs font-medium"
                  style={{ 
                    backgroundColor: 'var(--badge-bg)', 
                    color: 'var(--badge-fg)' 
                  }}
                  data-testid="preview-lesson-duration-badge"
                  aria-label="Edit duration badge"
                >
                  18:20
                </ClickableElement>
              </div>
            </ClickableElement>

            <div className="p-4 space-y-4" data-testid="preview-lesson-content-area">
              <ClickableElement
                editKey="--tab-bg"
                className="flex rounded-lg p-1"
                style={{ backgroundColor: 'var(--surface-muted)' }}
                data-testid="preview-lesson-tabs"
                aria-label="Edit tab container"
              >
                {(['content', 'transcript', 'resources'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all"
                    style={{
                      backgroundColor: activeTab === tab ? 'var(--tab-active-bg)' : 'var(--tab-bg)',
                      color: activeTab === tab ? 'var(--tab-active-fg)' : 'var(--tab-fg)',
                    }}
                    data-testid={`preview-lesson-tab-${tab}`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </ClickableElement>

              {activeTab === 'content' && (
                <ClickableElement
                  editKey="--card"
                  className="p-4 rounded-xl space-y-4"
                  style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--stroke-default)' }}
                  data-testid="preview-lesson-content-card"
                  aria-label="Edit content card"
                >
                  <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
                    About This Lesson
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                    In this lesson, we'll explore the fundamental building blocks of Python programming:
                    variables and data types. You'll learn how to store and manipulate different kinds of data
                    including integers, floats, strings, and booleans.
                  </p>
                  <div className="pt-2 border-t" style={{ borderColor: 'var(--stroke-default)' }}>
                    <h4 className="font-medium text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                      Learning Objectives
                    </h4>
                    <ul className="text-sm space-y-1" style={{ color: 'var(--text-muted)' }}>
                      <li>• Understand what variables are and how to use them</li>
                      <li>• Learn about Python's basic data types</li>
                      <li>• Practice type conversion between data types</li>
                    </ul>
                  </div>
                </ClickableElement>
              )}

              {activeTab === 'transcript' && (
                <ClickableElement
                  editKey="--card"
                  className="p-4 rounded-xl space-y-3"
                  style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--stroke-default)' }}
                  data-testid="preview-lesson-transcript-card"
                  aria-label="Edit transcript card"
                >
                  <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
                    Transcript
                  </h3>
                  <div className="space-y-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                    <p><span className="font-medium" style={{ color: 'var(--text-primary)' }}>0:00</span> - Welcome back to Python for Beginners!</p>
                    <p><span className="font-medium" style={{ color: 'var(--text-primary)' }}>0:15</span> - In this lesson, we'll be covering variables and data types...</p>
                    <p><span className="font-medium" style={{ color: 'var(--text-primary)' }}>1:30</span> - A variable is like a container that holds a value...</p>
                    <p className="text-xs italic">Scroll for more...</p>
                  </div>
                </ClickableElement>
              )}

              {activeTab === 'resources' && (
                <ClickableElement
                  editKey="--card"
                  className="p-4 rounded-xl space-y-3"
                  style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--stroke-default)' }}
                  data-testid="preview-lesson-resources-card"
                  aria-label="Edit resources card"
                >
                  <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
                    Downloadable Resources
                  </h3>
                  <div className="space-y-2">
                    {resources.map((resource, i) => (
                      <ClickableElement
                        key={i}
                        editKey="--muted"
                        className="flex items-center justify-between p-3 rounded-lg"
                        style={{ backgroundColor: 'var(--surface-muted)' }}
                        data-testid={`preview-lesson-resource-${i}`}
                        aria-label="Edit resource item"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold uppercase"
                            style={{
                              backgroundColor: resource.type === 'pdf' ? 'var(--destructive)' : 'var(--action-primary)',
                              color: resource.type === 'pdf' ? 'var(--destructive-foreground)' : 'var(--action-primary-fg)',
                            }}
                          >
                            {resource.type}
                          </div>
                          <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                              {resource.name}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              {resource.size}
                            </p>
                          </div>
                        </div>
                        <ClickableElement
                          editKey="--btn-outline-bg"
                          className="px-3 py-1.5 rounded text-xs font-medium"
                          style={{
                            backgroundColor: 'var(--btn-outline-bg)',
                            color: 'var(--btn-outline-fg)',
                            border: '1px solid var(--btn-outline-border)',
                          }}
                          data-testid={`preview-lesson-download-${i}`}
                          aria-label="Edit download button"
                        >
                          Download
                        </ClickableElement>
                      </ClickableElement>
                    ))}
                  </div>
                </ClickableElement>
              )}

              <ClickableElement
                editKey="--question-card-bg"
                className="p-4 rounded-xl space-y-4"
                style={{ 
                  backgroundColor: 'var(--question-card-bg)', 
                  border: '1px solid var(--question-card-border)' 
                }}
                data-testid="preview-lesson-quiz-section"
                aria-label="Edit quiz card"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-base" style={{ color: 'var(--question-card-fg)', fontFamily: 'var(--font-heading)' }}>
                    Quick Check
                  </h3>
                  <span className="text-xs px-2 py-1 rounded" style={{ 
                    backgroundColor: 'var(--action-accent)', 
                    color: 'var(--action-accent-fg)' 
                  }}>
                    1 of 3
                  </span>
                </div>
                <p className="text-sm font-medium" style={{ color: 'var(--question-card-fg)' }}>
                  {quizQuestion.question}
                </p>
                <div className="space-y-2">
                  {quizQuestion.options.map((option, i) => (
                    <ClickableElement
                      key={i}
                      editKey={option.correct ? '--answer-option-correct-bg' : '--answer-option-bg'}
                      className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all"
                      style={{
                        backgroundColor: option.correct ? 'var(--answer-option-correct-bg)' : 'var(--answer-option-bg)',
                        border: `1px solid ${option.correct ? 'var(--answer-option-correct-border)' : 'var(--answer-option-border)'}`,
                        color: option.correct ? 'var(--answer-option-correct-fg)' : 'var(--answer-option-fg)',
                      }}
                      data-testid={`preview-lesson-quiz-option-${i}`}
                      aria-label="Edit answer option"
                    >
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{
                          backgroundColor: option.correct ? 'var(--answer-option-correct-fg)' : 'var(--surface-muted)',
                          color: option.correct ? 'var(--answer-option-correct-bg)' : 'var(--text-muted)',
                        }}
                      >
                        {option.label}
                      </span>
                      <span className="text-sm">{option.text}</span>
                      {option.correct && (
                        <span className="ml-auto text-sm">✓</span>
                      )}
                    </ClickableElement>
                  ))}
                </div>
              </ClickableElement>

              <div className="flex gap-3" data-testid="preview-lesson-actions">
                <ClickableElement
                  editKey="--btn-primary-bg"
                  className="flex-1 py-3 rounded-lg text-center font-medium transition-all"
                  style={{ 
                    backgroundColor: 'var(--btn-primary-bg)', 
                    color: 'var(--btn-primary-fg)' 
                  }}
                  data-testid="preview-lesson-complete-button"
                  aria-label="Edit complete button"
                >
                  ✓ Mark Complete
                </ClickableElement>
                <ClickableElement
                  editKey="--btn-secondary-bg"
                  className="flex-1 py-3 rounded-lg text-center font-medium transition-all"
                  style={{ 
                    backgroundColor: 'var(--btn-secondary-bg)', 
                    color: 'var(--btn-secondary-fg)' 
                  }}
                  data-testid="preview-lesson-next-button"
                  aria-label="Edit next lesson button"
                >
                  Next Lesson →
                </ClickableElement>
              </div>

              <ClickableElement
                editKey="--success"
                className="p-4 rounded-xl flex items-center gap-4"
                style={{ 
                  backgroundColor: 'var(--alert-success-bg)', 
                  border: '1px solid var(--success)' 
                }}
                data-testid="preview-lesson-certificate-cta"
                aria-label="Edit certificate section"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
                  style={{ backgroundColor: 'var(--success)', color: 'var(--success-foreground)' }}
                >
                  🏆
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                    Complete the course to earn your certificate!
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {lessons.length - completedCount} lessons remaining
                  </p>
                </div>
                <ClickableElement
                  editKey="--btn-success-bg"
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ 
                    backgroundColor: 'var(--btn-success-bg)', 
                    color: 'var(--btn-success-fg)' 
                  }}
                  data-testid="preview-lesson-view-certificate"
                  aria-label="Edit view certificate button"
                >
                  Preview
                </ClickableElement>
              </ClickableElement>
            </div>
          </div>

          <ClickableElement
            editKey="--card"
            className="w-64 shrink-0 border-l flex flex-col"
            style={{ backgroundColor: 'var(--surface-raised)', borderColor: 'var(--stroke-default)' }}
            data-testid="preview-lesson-sidebar"
            aria-label="Edit sidebar style"
          >
            <div className="p-4 border-b" style={{ borderColor: 'var(--stroke-default)' }}>
              <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                Course Content
              </h2>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {progressPercent}% complete
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="divide-y" style={{ borderColor: 'var(--stroke-default)' }}>
                {lessons.map((lesson, i) => (
                  <ClickableElement
                    key={i}
                    editKey={lesson.current ? '--lesson-nav-active' : '--lesson-nav-bg'}
                    className="p-3 flex items-center gap-3 cursor-pointer transition-all"
                    style={{ 
                      backgroundColor: lesson.current ? 'var(--surface-muted)' : 'transparent',
                    }}
                    data-testid={`preview-lesson-list-item-${i}`}
                    aria-label="Edit lesson list item"
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 font-medium"
                      style={{
                        backgroundColor: lesson.completed 
                          ? 'var(--success)' 
                          : lesson.current 
                            ? 'var(--action-primary)' 
                            : 'var(--surface-muted)',
                        color: lesson.completed 
                          ? 'var(--success-foreground)' 
                          : lesson.current 
                            ? 'var(--action-primary-fg)' 
                            : 'var(--text-muted)',
                      }}
                      data-testid={`preview-lesson-list-status-${i}`}
                    >
                      {lesson.completed ? '✓' : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-medium truncate"
                        style={{ 
                          color: lesson.current 
                            ? 'var(--action-primary)' 
                            : lesson.completed 
                              ? 'var(--text-primary)' 
                              : 'var(--text-muted)' 
                        }}
                        data-testid={`preview-lesson-list-title-${i}`}
                      >
                        {lesson.title}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {lesson.duration}
                      </p>
                    </div>
                    {lesson.current && (
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: 'var(--action-primary)' }}
                      />
                    )}
                  </ClickableElement>
                ))}
              </div>
            </div>
            <div className="p-4 border-t" style={{ borderColor: 'var(--stroke-default)' }}>
              <ClickableElement
                editKey="--btn-outline-bg"
                className="w-full py-2 rounded-lg text-center text-sm font-medium"
                style={{
                  backgroundColor: 'var(--btn-outline-bg)',
                  color: 'var(--btn-outline-fg)',
                  border: '1px solid var(--btn-outline-border)',
                }}
                data-testid="preview-lesson-take-quiz-button"
                aria-label="Edit take quiz button"
              >
                Take Quiz
              </ClickableElement>
            </div>
          </ClickableElement>
        </div>
      </div>
    </PreviewFrame>
  );
}

export default PreviewLessonViewer;
