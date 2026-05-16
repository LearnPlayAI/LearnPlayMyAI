import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/hooks/use-user";

interface PresentationVersion {
  id: string;
  version: number;
  createdAt: string;
  themeId: string | null;
  creditsCharged: number | null;
  downloadUrl: string;
  filename: string;
  isGenerated: boolean;
}

interface PresentationVersionsResponse {
  versions: PresentationVersion[];
  currentVersion: number | null;
}

interface LessonVersion {
  id: string;
  lessonId: string;
  organizationId: string;
  versionNumber: number;
  title: string;
  description: string | null;
  gradeLevel: string | null;
  department: string | null;
  subject: string | null;
  unit: string | null;
  storageKey: string;
  changeDescription: string | null;
  editedBy: string | null;
  createdAt: string;
  changedFields: string[];
  diffSummary: {
    modified: Record<string, { from: any; to: any }>;
  } | null;
}

interface RestoreVersionResult {
  lesson: any;
  preRestoreVersionId: string;
  postRestoreVersionId: string;
  message: string;
}

/**
 * Hook to fetch version history for a lesson
 * Returns versions sorted by versionNumber (newest first) with computed diffs
 */
export function useLessonVersions(lessonId: string | undefined) {
  return useQuery<LessonVersion[]>({
    queryKey: ["/api/lessons", lessonId, "versions"],
    enabled: !!lessonId,
  });
}

/**
 * Hook to fetch a specific version by ID
 */
export function useLessonVersion(lessonId: string | undefined, versionId: string | undefined) {
  return useQuery<LessonVersion>({
    queryKey: ["/api/lessons", lessonId, "versions", versionId],
    enabled: !!lessonId && !!versionId,
  });
}

/**
 * Hook to create a version snapshot
 * Optionally accepts changeDescription to document what changed
 */
export function useCreateLessonVersion(lessonId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { changeDescription?: string }) => {
      return await apiRequest(`/api/lessons/${lessonId}/versions`, {
        method: "POST",
        body: JSON.stringify(params),
      });
    },
    onSuccess: () => {
      // Invalidate version history to show new version
      queryClient.invalidateQueries({ 
        queryKey: ["/api/lessons", lessonId, "versions"],
        exact: false,
      });
    },
  });
}

/**
 * Hook to restore a lesson to a previous version
 * Creates two new versions (pre-restore and post-restore) for audit trail
 */
export function useRestoreLessonVersion(lessonId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (versionId: string) => {
      return await apiRequest(
        `/api/lessons/${lessonId}/versions/${versionId}/restore`,
        {
          method: "POST",
        }
      ) as unknown as RestoreVersionResult;
    },
    onSuccess: () => {
      // Invalidate ALL lesson queries (including those with organizationId)
      // This ensures LessonViewer refreshes with the restored content
      queryClient.invalidateQueries({ 
        queryKey: ["/api/lessons", lessonId],
        exact: false, // Matches ["/api/lessons", lessonId, organizationId] too
      });
      
      // Invalidate version history (new versions created)
      queryClient.invalidateQueries({ 
        queryKey: ["/api/lessons", lessonId, "versions"],
        exact: false,
      });
    },
  });
}

/**
 * Hook to fetch all PPTX presentation versions for a lesson
 * Returns versions with download URLs, sorted by version number (newest first)
 */
export function usePresentationVersions(lessonId: string | undefined, organizationId: string | null | undefined) {
  return useQuery<PresentationVersionsResponse>({
    queryKey: [`/api/lessons/${lessonId}/presentation-versions?organizationId=${organizationId}`],
    enabled: !!lessonId && !!organizationId,
  });
}

/**
 * Hook to download a specific presentation version
 */
export function useDownloadPresentationVersion(lessonId: string, organizationId: string) {
  return useMutation({
    mutationFn: async (versionId: string) => {
      const response = await apiRequest(
        `/api/lessons/${lessonId}/presentation-versions/${versionId}/download?organizationId=${organizationId}`,
        { method: 'GET' }
      );
      return response as unknown as { downloadUrl: string; filename: string };
    },
  });
}

interface LinkedQuizStatus {
  quizId: string;
  isPrimary: boolean;
  isOutdated: boolean;
  generatedFromVersion: number | null;
}

interface QuizOutdatedStatusResponse {
  lessonId: string;
  totalLinkedQuizzes: number;
  outdatedQuizCount: number;
  hasOutdatedQuizzes: boolean;
  currentPresentationVersion: number | null;
  currentSlideHash: string | null;
  linkedQuizzes: LinkedQuizStatus[];
  regenerationRecommended: boolean;
  message: string | null;
}

/**
 * Hook to fetch quiz outdated status for a lesson
 * Returns whether any linked quizzes need regeneration after PPTX updates
 */
export function useQuizOutdatedStatus(lessonId: string | undefined, organizationId: string | null | undefined) {
  return useQuery<QuizOutdatedStatusResponse>({
    queryKey: ["/api/lessons", lessonId, "quiz-outdated-status", organizationId],
    queryFn: async () => {
      const response = await fetch(
        `/api/lessons/${lessonId}/quiz-outdated-status?organizationId=${organizationId}`,
        { credentials: 'include' }
      );
      if (!response.ok) {
        throw new Error('Failed to fetch quiz outdated status');
      }
      return response.json();
    },
    enabled: !!lessonId && !!organizationId,
    staleTime: 30000, // Cache for 30 seconds
  });
}

export type { PresentationVersion, PresentationVersionsResponse, QuizOutdatedStatusResponse, LinkedQuizStatus };
