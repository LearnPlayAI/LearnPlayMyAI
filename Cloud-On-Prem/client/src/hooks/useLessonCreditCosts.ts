import { useQuery } from '@tanstack/react-query';

export interface LessonCreditCosts {
  creditsPerLessonTextOnlyMin: number;
  creditsPerLessonTextOnlyMax: number;
  creditsPerLessonWithImagesMin: number;
  creditsPerLessonWithImagesMax: number;
}

const DEFAULT_COSTS: LessonCreditCosts = {
  creditsPerLessonTextOnlyMin: 40,
  creditsPerLessonTextOnlyMax: 90,
  creditsPerLessonWithImagesMin: 140,
  creditsPerLessonWithImagesMax: 290,
};

export function useLessonCreditCosts() {
  // Use public endpoint for broader access (no auth required)
  const { data, isLoading, error, refetch } = useQuery<LessonCreditCosts>({
    queryKey: ['/api/public/lesson-credit-costs'],
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  const costs: LessonCreditCosts = data ?? DEFAULT_COSTS;

  const calculateLessonsForCredits = (totalCredits: number) => {
    if (totalCredits <= 0) {
      return {
        textOnly: { min: 0, max: 0 },
        withImages: { min: 0, max: 0 },
      };
    }

    return {
      textOnly: {
        min: Math.floor(totalCredits / costs.creditsPerLessonTextOnlyMax),
        max: Math.floor(totalCredits / costs.creditsPerLessonTextOnlyMin),
      },
      withImages: {
        min: Math.floor(totalCredits / costs.creditsPerLessonWithImagesMax),
        max: Math.floor(totalCredits / costs.creditsPerLessonWithImagesMin),
      },
    };
  };

  const getCreditsForLessons = (lessonCount: number, withImages: boolean) => {
    if (lessonCount <= 0) {
      return { min: 0, max: 0 };
    }

    if (withImages) {
      return {
        min: lessonCount * costs.creditsPerLessonWithImagesMin,
        max: lessonCount * costs.creditsPerLessonWithImagesMax,
      };
    }

    return {
      min: lessonCount * costs.creditsPerLessonTextOnlyMin,
      max: lessonCount * costs.creditsPerLessonTextOnlyMax,
    };
  };

  const getAverageCreditsPerLesson = (withImages: boolean) => {
    if (withImages) {
      return Math.round((costs.creditsPerLessonWithImagesMin + costs.creditsPerLessonWithImagesMax) / 2);
    }
    return Math.round((costs.creditsPerLessonTextOnlyMin + costs.creditsPerLessonTextOnlyMax) / 2);
  };

  const formatLessonRange = (totalCredits: number, withImages: boolean = false) => {
    const lessons = calculateLessonsForCredits(totalCredits);
    const range = withImages ? lessons.withImages : lessons.textOnly;
    
    if (range.min === range.max) {
      return `${range.min}`;
    }
    return `${range.min}-${range.max}`;
  };

  return {
    costs,
    isLoading,
    error,
    refetch,
    calculateLessonsForCredits,
    getCreditsForLessons,
    getAverageCreditsPerLesson,
    formatLessonRange,
    defaults: DEFAULT_COSTS,
  };
}
