import { describe, expect, it } from '@jest/globals';
import { buildTranslationRunState, selectPreferredTranslationJobForPolling } from '../services/translationRunStateService';

describe('buildTranslationRunState', () => {
  it('maps active translating job to processing phase', () => {
    const state = buildTranslationRunState({
      jobStatus: 'translating',
      currentStep: 'translating',
      normalizedAssetStatuses: { sourceDb: 'processing', quiz: 'queued' },
      blockingActionCount: 0,
    });

    expect(state.phase).toBe('processing');
    expect(state.isActive).toBe(true);
    expect(state.step).toBe('translate_content');
    expect(state.label).toBe('Processing');
  });

  it('maps completed settled run to completed phase', () => {
    const state = buildTranslationRunState({
      jobStatus: 'completed',
      currentStep: 'content_translated',
      normalizedAssetStatuses: { sourceDb: 'completed', quiz: 'completed' },
      blockingActionCount: 0,
    });

    expect(state.phase).toBe('completed');
    expect(state.requiresUserAction).toBe(false);
    expect(state.isTerminal).toBe(true);
  });

  it('maps completed run with blocking actions to awaiting_user', () => {
    const state = buildTranslationRunState({
      jobStatus: 'completed',
      currentStep: 'content_translated',
      normalizedAssetStatuses: { sourceDb: 'completed', pptx: 'completed' },
      blockingActionCount: 1,
    });

    expect(state.phase).toBe('awaiting_user');
    expect(state.requiresUserAction).toBe(true);
    expect(state.isTerminal).toBe(false);
  });

  it('maps partial failures to partial_failed phase', () => {
    const state = buildTranslationRunState({
      jobStatus: 'completed',
      currentStep: 'partial_failed',
      normalizedAssetStatuses: { sourceDb: 'completed', quiz: 'failed' },
      blockingActionCount: 1,
    });

    expect(state.phase).toBe('partial_failed');
    expect(state.failedArtifacts).toBe(1);
    expect(state.requiresUserAction).toBe(true);
  });

  it('maps failed status to failed phase', () => {
    const state = buildTranslationRunState({
      jobStatus: 'failed',
      currentStep: 'translating',
      normalizedAssetStatuses: { sourceDb: 'failed' },
      blockingActionCount: 0,
    });

    expect(state.phase).toBe('failed');
    expect(state.isTerminal).toBe(true);
    expect(state.label).toBe('Failed');
  });

  it('maps draft status to draft phase and inactive state', () => {
    const state = buildTranslationRunState({
      jobStatus: 'draft',
      currentStep: 'draft_created',
      normalizedAssetStatuses: {},
      blockingActionCount: 0,
    });

    expect(state.phase).toBe('draft');
    expect(state.isActive).toBe(false);
    expect(state.label).toBe('Draft');
  });

  it('normalizes non-numeric blocking action counts to zero', () => {
    const state = buildTranslationRunState({
      jobStatus: 'completed',
      currentStep: 'content_translated',
      normalizedAssetStatuses: { sourceDb: 'completed' },
      blockingActionCount: Number.NaN,
    });

    expect(state.blockingActions).toBe(0);
    expect(state.phase).toBe('completed');
  });
});

describe('selectPreferredTranslationJobForPolling', () => {
  it('prefers active jobs over newer inactive jobs', () => {
    const jobs = [
      { id: 'newest-inactive', status: 'completed', currentStep: 'content_translated' },
      { id: 'older-active', status: 'translating', currentStep: 'translating' },
    ];
    const selected = selectPreferredTranslationJobForPolling(jobs);
    expect(selected?.id).toBe('older-active');
  });

  it('falls back to first job when no active jobs exist', () => {
    const jobs = [
      { id: 'latest', status: 'completed', currentStep: 'content_translated' },
      { id: 'older', status: 'failed', currentStep: 'partial_failed' },
    ];
    const selected = selectPreferredTranslationJobForPolling(jobs);
    expect(selected?.id).toBe('latest');
  });
});
