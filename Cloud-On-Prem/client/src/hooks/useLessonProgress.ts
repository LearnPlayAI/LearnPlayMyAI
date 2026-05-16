import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export interface LessonProgress {
  lessonId: string;
  userId: string;
  organizationId: string;
  status: "not_started" | "in_progress" | "completed";
  percentComplete: number;
  secondsSpent: number;
  lastCheckpoint: string | null;
  completedAt: string | null;
}

export interface DailyStreak {
  currentStreak: number;
  bestStreak: number;
  lastCompletedDate: string | null;
}

export interface CompletionResult {
  progress: LessonProgress;
  certificate: null;
  isFirstCompletion: boolean;
}

export function useLessonProgress(lessonId: string | undefined) {
  return useQuery<LessonProgress>({
    queryKey: ["/api/lessons", lessonId, "progress"],
    enabled: !!lessonId,
  });
}

export function useUpdateLessonProgress(lessonId: string) {
  return useMutation<
    LessonProgress,
    Error,
    {
      status?: "not_started" | "in_progress" | "completed";
      percentComplete?: number;
      secondsSpent?: number;
      lastCheckpoint?: string;
    }
  >({
    mutationFn: async (data) => {
      return apiRequest(`/api/lessons/${lessonId}/progress`, {
        method: "POST",
        body: JSON.stringify(data),
      }) as unknown as Promise<LessonProgress>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/lessons", lessonId, "progress"],
      });
    },
  });
}

export function useCompleteLesson(lessonId: string) {
  return useMutation<
    CompletionResult,
    Error,
    { secondsSpent?: number }
  >({
    mutationFn: async (data) => {
      return apiRequest(`/api/lessons/${lessonId}/complete`, {
        method: "POST",
        body: JSON.stringify(data),
      }) as unknown as Promise<CompletionResult>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/lessons", lessonId, "progress"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/lessons", lessonId, "linked-quizzes"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/streaks/me"],
        exact: false,
      });
      // Invalidate number bubble counters in quiz lobby
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/lessons/assigned");
        },
      });
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/lessons?");
        },
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/quiz/completion-status"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/student/progress-stats"],
      });
    },
  });
}

export function useUserStreak(organizationId: string | undefined) {
  return useQuery<DailyStreak>({
    queryKey: ["/api/streaks/me", organizationId],
    queryFn: async () => {
      if (!organizationId) throw new Error("Organization ID required");
      const res = await fetch(`/api/streaks/me?organizationId=${organizationId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(error.error || res.statusText);
      }
      return res.json();
    },
    enabled: !!organizationId,
  });
}
