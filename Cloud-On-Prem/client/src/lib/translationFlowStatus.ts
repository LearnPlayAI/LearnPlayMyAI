export type ArtifactStatus = 'queued' | 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'skipped' | 'deferred_optional';

export function normalizeArtifactStatusLabel(rawStatus: string): string {
  if (rawStatus === 'pending') return 'queued';
  if (rawStatus === 'deferred_optional') return 'pending optional step';
  if (rawStatus === 'cancelled') return 'cancelled';
  return rawStatus;
}

export function resolvePodcastAudioDisplayStatus(params: {
  rawStatus: string;
  targetLanguageCode?: string;
  podcastJobStatus?: string;
  hasCompletedTargetLanguageAudio?: boolean;
}): ArtifactStatus | string {
  const { rawStatus, podcastJobStatus, hasCompletedTargetLanguageAudio } = params;

  if (rawStatus !== 'completed') return rawStatus;

  // A completed translation artifact may only mean generation was queued.
  // If the translated audio is not completed yet, show processing for clearer UX.
  if (podcastJobStatus === 'processing' || hasCompletedTargetLanguageAudio === false) {
    return 'processing';
  }

  return rawStatus;
}
