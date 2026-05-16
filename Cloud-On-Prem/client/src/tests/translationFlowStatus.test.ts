import { describe, expect, it } from '@jest/globals';
import { normalizeArtifactStatusLabel, resolvePodcastAudioDisplayStatus } from '../lib/translationFlowStatus';

describe('translationFlowStatus helpers', () => {
  it('normalizes pending to queued', () => {
    expect(normalizeArtifactStatusLabel('pending')).toBe('queued');
    expect(normalizeArtifactStatusLabel('completed')).toBe('completed');
    expect(normalizeArtifactStatusLabel('deferred_optional')).toBe('pending optional step');
  });

  it('keeps non-completed podcast status unchanged', () => {
    expect(resolvePodcastAudioDisplayStatus({ rawStatus: 'failed' })).toBe('failed');
    expect(resolvePodcastAudioDisplayStatus({ rawStatus: 'processing' })).toBe('processing');
  });

  it('downgrades completed podcast audio to processing while job is still running', () => {
    expect(resolvePodcastAudioDisplayStatus({
      rawStatus: 'completed',
      podcastJobStatus: 'processing',
      hasCompletedTargetLanguageAudio: false,
    })).toBe('processing');
  });

  it('returns completed once translated audio actually exists', () => {
    expect(resolvePodcastAudioDisplayStatus({
      rawStatus: 'completed',
      podcastJobStatus: 'completed',
      hasCompletedTargetLanguageAudio: true,
    })).toBe('completed');
  });
});
