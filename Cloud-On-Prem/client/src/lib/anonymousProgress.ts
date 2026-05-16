const LESSON_PROGRESS_KEY = 'showcase_lesson_progress';
const QUIZ_SCORES_KEY = 'showcase_quiz_scores';

export interface AnonymousLessonProgress {
  lessonId: string;
  viewedSlides: number[];
  lastViewedSlide: number;
  completedAt?: string;
  courseId?: string;
}

export interface AnonymousQuizScore {
  quizId: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  completedAt: string;
  lessonId?: string;
}

function getStorageItem<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setStorageItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('Failed to save to localStorage:', error);
  }
}

export function saveLessonProgress(progress: AnonymousLessonProgress): void {
  const allProgress = getStorageItem<Record<string, AnonymousLessonProgress>>(LESSON_PROGRESS_KEY, {});
  allProgress[progress.lessonId] = progress;
  setStorageItem(LESSON_PROGRESS_KEY, allProgress);
}

export function getLessonProgress(lessonId: string): AnonymousLessonProgress | null {
  const allProgress = getStorageItem<Record<string, AnonymousLessonProgress>>(LESSON_PROGRESS_KEY, {});
  return allProgress[lessonId] || null;
}

export function getAllLessonProgress(): AnonymousLessonProgress[] {
  const allProgress = getStorageItem<Record<string, AnonymousLessonProgress>>(LESSON_PROGRESS_KEY, {});
  return Object.values(allProgress);
}

export function saveQuizScore(score: AnonymousQuizScore): void {
  const allScores = getStorageItem<Record<string, AnonymousQuizScore>>(QUIZ_SCORES_KEY, {});
  allScores[score.quizId] = score;
  setStorageItem(QUIZ_SCORES_KEY, allScores);
}

export function getQuizScore(quizId: string): AnonymousQuizScore | null {
  const allScores = getStorageItem<Record<string, AnonymousQuizScore>>(QUIZ_SCORES_KEY, {});
  return allScores[quizId] || null;
}

export function getAllQuizScores(): AnonymousQuizScore[] {
  const allScores = getStorageItem<Record<string, AnonymousQuizScore>>(QUIZ_SCORES_KEY, {});
  return Object.values(allScores);
}

export function clearAllProgress(): void {
  try {
    localStorage.removeItem(LESSON_PROGRESS_KEY);
    localStorage.removeItem(QUIZ_SCORES_KEY);
  } catch (error) {
    console.warn('Failed to clear localStorage:', error);
  }
}
