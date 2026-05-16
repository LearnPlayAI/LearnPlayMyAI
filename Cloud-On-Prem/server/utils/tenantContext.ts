/**
 * Tenant Context Utility
 * 
 * Provides explicit organization context for background tasks and webhooks
 * that don't have HTTP sessions. This enables org-scoped operations in
 * workers, scheduled jobs, and webhook handlers.
 */

export interface TenantContext {
  organizationId: string;
  userId?: string;
  isSystemContext?: boolean;
}

/**
 * Create tenant context for background jobs
 * @param organizationId - Required organization ID for tenant isolation
 * @param options - Optional user ID and system context flag
 */
export function createTenantContext(
  organizationId: string,
  options?: { userId?: string; isSystemContext?: boolean }
): TenantContext {
  if (!organizationId) {
    throw new Error('Organization ID is required for tenant context');
  }
  return {
    organizationId,
    userId: options?.userId,
    isSystemContext: options?.isSystemContext ?? false
  };
}

/**
 * Create system tenant context for scheduled tasks and automated processes
 * System contexts have no user association and are flagged for audit trails
 * @param organizationId - Required organization ID for tenant isolation
 */
export function createSystemTenantContext(organizationId: string): TenantContext {
  return createTenantContext(organizationId, { isSystemContext: true });
}

/**
 * Validate tenant context before use (type guard with assertion)
 * Throws if context is missing or invalid
 * @param context - TenantContext to validate
 */
export function validateTenantContext(
  context: TenantContext | undefined
): asserts context is TenantContext {
  if (!context || !context.organizationId) {
    throw new Error('Valid tenant context with organization ID is required');
  }
}

/**
 * Check if tenant context is valid without throwing
 * @param context - TenantContext to check
 */
export function isTenantContextValid(context: TenantContext | undefined | null): context is TenantContext {
  return !!context && !!context.organizationId;
}

/**
 * Extract tenant context from Express request (for hybrid scenarios)
 * Works with requests that have effectiveOrganization set by orgIsolationMiddleware
 * @param req - Express request object
 */
export function extractTenantContextFromRequest(req: any): TenantContext | null {
  const effectiveOrg = req.effectiveOrganization;
  if (!effectiveOrg?.organizationId) return null;
  
  return {
    organizationId: effectiveOrg.organizationId,
    userId: req.session?.userId,
    isSystemContext: false
  };
}

/**
 * Create tenant context from job metadata
 * Useful for workers that process jobs with embedded org/user info
 * @param metadata - Job metadata containing organizationId and optionally userId
 */
export function createTenantContextFromJobMetadata(
  metadata: { organizationId?: string; userId?: string } | undefined
): TenantContext | null {
  if (!metadata?.organizationId) return null;
  
  return {
    organizationId: metadata.organizationId,
    userId: metadata.userId,
    isSystemContext: !metadata.userId
  };
}
