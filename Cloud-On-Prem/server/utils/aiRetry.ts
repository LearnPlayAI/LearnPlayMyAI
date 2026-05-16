export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryableStatuses?: number[];
  onRetry?: (attempt: number, error: any, delayMs: number) => void;
  operationName?: string;
}

export type AIErrorType = 
  | 'rate_limit'
  | 'service_unavailable'
  | 'gateway_timeout'
  | 'connection_error'
  | 'quota_exceeded'
  | 'unknown';

export interface AIErrorMetrics {
  errorType: AIErrorType;
  timestamp: Date;
  operationName?: string;
  retryAttempt: number;
  totalRetries: number;
  delayMs: number;
  errorMessage: string;
}

const errorMetricsLog: AIErrorMetrics[] = [];
const MAX_METRICS_LOG = 100;

function logErrorMetrics(metrics: AIErrorMetrics): void {
  errorMetricsLog.push(metrics);
  if (errorMetricsLog.length > MAX_METRICS_LOG) {
    errorMetricsLog.shift();
  }
}

export function getRecentAIErrors(): AIErrorMetrics[] {
  return [...errorMetricsLog];
}

export function getAIErrorSummary(): { total: number; byType: Record<AIErrorType, number>; last5Minutes: number } {
  const now = Date.now();
  const fiveMinutesAgo = now - 5 * 60 * 1000;
  
  const summary: Record<AIErrorType, number> = {
    rate_limit: 0,
    service_unavailable: 0,
    gateway_timeout: 0,
    connection_error: 0,
    quota_exceeded: 0,
    unknown: 0,
  };
  
  let last5Minutes = 0;
  
  for (const m of errorMetricsLog) {
    summary[m.errorType]++;
    if (m.timestamp.getTime() >= fiveMinutesAgo) {
      last5Minutes++;
    }
  }
  
  return { total: errorMetricsLog.length, byType: summary, last5Minutes };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function classifyError(error: any): AIErrorType {
  const errorMessage = error.message?.toLowerCase() || '';
  const errorCode = error.status || error.code || error.statusCode;
  
  if (errorCode === 429 || errorMessage.includes('429') || errorMessage.includes('rate limit') || errorMessage.includes('ratelimit')) {
    return 'rate_limit';
  }
  if (errorCode === 503 || errorMessage.includes('503') || errorMessage.includes('service unavailable')) {
    return 'service_unavailable';
  }
  if (errorCode === 504 || errorMessage.includes('504') || errorMessage.includes('gateway timeout')) {
    return 'gateway_timeout';
  }
  if (errorMessage.includes('timeout') || errorMessage.includes('timed out') || 
      errorMessage.includes('econnreset') || errorMessage.includes('connection reset')) {
    return 'connection_error';
  }
  if (errorMessage.includes('quota')) {
    return 'quota_exceeded';
  }
  
  return 'unknown';
}

function isRetryableError(error: any, retryableStatuses: number[]): boolean {
  const errorCode = error.status || error.code || error.statusCode;
  
  if (typeof errorCode === 'number' && retryableStatuses.includes(errorCode)) {
    return true;
  }
  
  const errorType = classifyError(error);
  return errorType !== 'unknown';
}

export function getUserFriendlyErrorMessage(error: any): string {
  const errorType = classifyError(error);
  
  switch (errorType) {
    case 'rate_limit':
      return 'The AI service is currently busy. Please wait a moment and try again.';
    case 'service_unavailable':
      return 'The AI service is temporarily unavailable. This usually resolves within a few minutes. Please try again shortly.';
    case 'gateway_timeout':
      return 'The AI service took too long to respond. Please try again with a smaller request or wait a moment.';
    case 'connection_error':
      return 'Unable to connect to the AI service. Please check your connection and try again.';
    case 'quota_exceeded':
      return 'AI service usage limits have been reached. Please contact support or try again later.';
    default:
      return 'An unexpected error occurred with the AI service. Please try again.';
  }
}

export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    retryableStatuses = [429, 503, 504],
    onRetry,
    operationName = 'AI operation',
  } = options;
  
  let lastError: Error | null = null;
  const startTime = Date.now();
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      if (attempt > 0) {
        const totalDuration = Date.now() - startTime;
        console.log(`[AIRetry] ${operationName} succeeded after ${attempt} retries (total time: ${totalDuration}ms)`);
      }
      return result;
    } catch (error: any) {
      lastError = error;
      
      const errorType = classifyError(error);
      const isRetryable = isRetryableError(error, retryableStatuses);
      const isLastAttempt = attempt === maxRetries;
      
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
      const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
      const jitter = Math.random() * 500;
      const totalDelay = cappedDelay + jitter;
      
      const errorMessage = error.message || 'Unknown error';
      
      logErrorMetrics({
        errorType,
        timestamp: new Date(),
        operationName,
        retryAttempt: attempt + 1,
        totalRetries: maxRetries + 1,
        delayMs: Math.round(totalDelay),
        errorMessage,
      });
      
      const errorTypeLabel = errorType.replace(/_/g, ' ').toUpperCase();
      console.log(`[AIRetry] [${errorTypeLabel}] ${operationName} - Attempt ${attempt + 1}/${maxRetries + 1} failed`);
      console.log(`[AIRetry] Error: ${errorMessage}`);
      
      if (errorType === 'service_unavailable') {
        console.warn(`[AIRetry] ⚠️ Gemini API 503 detected - service temporarily unavailable`);
      }
      
      if (!isRetryable || isLastAttempt) {
        const totalDuration = Date.now() - startTime;
        console.error(`[AIRetry] ${operationName} FAILED after ${attempt + 1} attempts (total time: ${totalDuration}ms)`);
        console.error(`[AIRetry] Final error type: ${errorTypeLabel}`);
        
        const enhancedError = new AIRetryError(
          error,
          attempt + 1,
          errorType,
          getUserFriendlyErrorMessage(error)
        );
        throw enhancedError;
      }
      
      console.log(`[AIRetry] Retrying in ${Math.round(totalDelay)}ms...`);
      
      if (onRetry) {
        onRetry(attempt + 1, error, totalDelay);
      }
      
      await sleep(totalDelay);
    }
  }
  
  throw lastError || new Error('Retry failed - all attempts exhausted');
}

export class AIRetryError extends Error {
  public readonly attempts: number;
  public readonly lastError: Error;
  public readonly errorType: AIErrorType;
  public readonly userFriendlyMessage: string;
  public readonly status?: number;
  public readonly code?: string | number;
  public readonly statusCode?: number;
  
  constructor(
    originalError: Error, 
    attempts: number, 
    errorType: AIErrorType,
    userFriendlyMessage: string
  ) {
    super(originalError.message);
    this.name = 'AIRetryError';
    this.attempts = attempts;
    this.lastError = originalError;
    this.errorType = errorType;
    this.userFriendlyMessage = userFriendlyMessage;
    this.status = (originalError as any).status;
    this.code = (originalError as any).code;
    this.statusCode = (originalError as any).statusCode;
    this.stack = originalError.stack;
  }
}
