export type TranslationRunPhase =
  | 'draft'
  | 'queued'
  | 'processing'
  | 'awaiting_user'
  | 'completed'
  | 'partial_failed'
  | 'failed'
  | 'cancelled'
  | 'unknown';

export type TranslationRunStep =
  | 'select_language'
  | 'translate_content'
  | 'review_edit'
  | 'podcast'
  | 'pptx'
  | 'complete';

export type TranslationRunState = {
  phase: TranslationRunPhase;
  label: string;
  step: TranslationRunStep;
  isActive: boolean;
  isTerminal: boolean;
  requiresUserAction: boolean;
  blockingActions: number;
  processingArtifacts: number;
  failedArtifacts: number;
};

const STEP_MAP: Record<string, TranslationRunStep> = {
  translating: 'translate_content',
  content_translated: 'review_edit',
  content_uploaded: 'review_edit',
  partial_failed: 'review_edit',
  draft_created: 'translate_content',
  pptx_uploaded: 'pptx',
  pptx_generating: 'pptx',
  pptx_generated: 'pptx',
  published: 'complete',
};

const ACTIVE_STEPS = new Set(['translating', 'pptx_generating']);

export function buildTranslationRunState(params: {
  jobStatus?: string | null;
  currentStep?: string | null;
  normalizedAssetStatuses?: Record<string, string>;
  blockingActionCount?: number;
}): TranslationRunState {
  const status = String(params.jobStatus || '').trim().toLowerCase();
  const stepRaw = String(params.currentStep || '').trim().toLowerCase();
  const step = STEP_MAP[stepRaw] || 'select_language';

  const statuses = Object.values(params.normalizedAssetStatuses || {}).map((value) => String(value || '').trim().toLowerCase());
  const parsedBlockingActions = Number(params.blockingActionCount ?? 0);
  const blockingActions = Number.isFinite(parsedBlockingActions) ? Math.max(0, parsedBlockingActions) : 0;

  const failedArtifacts = statuses.filter((value) => value === 'failed' || value === 'cancelled').length;
  const processingArtifacts = statuses.filter((value) => value === 'processing' || value === 'queued' || value === 'pending').length;
  const settledArtifacts = statuses.filter((value) => value === 'completed' || value === 'skipped' || value === 'deferred_optional').length;
  const allArtifactsSettled = statuses.length > 0 && settledArtifacts + failedArtifacts >= statuses.length;

  const isActive = status === 'pending'
    || status === 'translating'
    || ACTIVE_STEPS.has(stepRaw)
    || (processingArtifacts > 0 && status !== 'failed');

  let phase: TranslationRunPhase = 'unknown';
  if (status === 'failed') {
    phase = 'failed';
  } else if (status === 'cancelled') {
    phase = 'cancelled';
  } else if (status === 'draft' || stepRaw === 'draft_created') {
    phase = 'draft';
  } else if (stepRaw === 'partial_failed') {
    phase = 'partial_failed';
  } else if (stepRaw === 'published' || (status === 'completed' && failedArtifacts === 0 && allArtifactsSettled && blockingActions === 0)) {
    phase = 'completed';
  } else if ((blockingActions > 0 || failedArtifacts > 0) && !isActive) {
    phase = failedArtifacts > 0 ? 'partial_failed' : 'awaiting_user';
  } else if (isActive) {
    phase = processingArtifacts > 0 ? 'processing' : 'queued';
  } else if (status === 'completed') {
    phase = blockingActions > 0 ? 'awaiting_user' : 'completed';
  } else if (status === 'pending' || stepRaw === 'draft_created') {
    phase = 'queued';
  }

  const requiresUserAction = phase === 'awaiting_user' || phase === 'partial_failed' || phase === 'failed';
  const isTerminal = phase === 'completed' || phase === 'failed' || phase === 'cancelled' || phase === 'partial_failed';

  const labelByPhase: Record<TranslationRunPhase, string> = {
    draft: 'Draft',
    queued: 'Queued',
    processing: 'Processing',
    awaiting_user: 'Action required',
    completed: 'Completed',
    partial_failed: 'Partial failure',
    failed: 'Failed',
    cancelled: 'Cancelled',
    unknown: 'In progress',
  };

  return {
    phase,
    label: labelByPhase[phase],
    step,
    isActive,
    isTerminal,
    requiresUserAction,
    blockingActions,
    processingArtifacts,
    failedArtifacts,
  };
}

export function selectPreferredTranslationJobForPolling<T extends { status?: string | null; currentStep?: string | null }>(jobs: T[]): T | null {
  if (!Array.isArray(jobs) || jobs.length === 0) return null;
  const preferred = jobs.find((job) => {
    const status = String(job?.status || '').trim().toLowerCase();
    const step = String(job?.currentStep || '').trim().toLowerCase();
    return status === 'pending'
      || status === 'translating'
      || step === 'translating'
      || step === 'pptx_generating';
  });
  return preferred || jobs[0];
}
