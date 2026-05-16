/**
 * Session-Based Authentication Middleware
 * 
 * Dual-path middleware that uses cached session context when feature flag is enabled,
 * falls back to database lookups when disabled. Provides gradual rollout capability.
 */

import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { isFeatureEnabled } from '../featureFlags';
import { SessionInvalidationService } from '../services/sessionInvalidationService';
import { SessionContextService } from '../services/sessionContextService';
import { trackAuthQuery } from '../monitoring/authQueryTracker';
import { trackCacheEfficiency } from '../monitoring/sessionHealthMonitor';
import type { SessionContext, SessionOrganization } from '../routes/shared';

/**
 * Result of resolving the effective organization for a request
 */
export interface EffectiveOrganizationResult {
  organizationId: string | null;
  organization: SessionOrganization | null;
  isImpersonation: boolean;
  source: 'impersonation' | 'header' | 'primary' | 'fallback' | 'none';
}

/**
 * Extended Request type with effective organization cache
 */
export interface RequestWithEffectiveOrg extends Request {
  effectiveOrganization?: EffectiveOrganizationResult;
}

/**
 * Extended Request type with org context
 */
export interface RequestWithOrgContext extends Request {
  orgContext?: {
    organizationId: string;
    organizationName: string;
    organizationType: 'education' | 'business' | 'elearning';
    userRoles: string[];
    effectiveRole: string;
  };
  subscription?: {
    tier: string | null;
    status: string | null;
    features: string[];
  };
}

/**
 * Session payload monitoring middleware
 * Tracks session sizes and warns when approaching PostgreSQL limits
 */
export function sessionPayloadMonitoring(req: Request, res: Response, next: NextFunction) {
  if (!isFeatureEnabled('SESSION_PAYLOAD_MONITORING')) {
    return next();
  }

  if (req.session && req.session.context) {
    const sessionSize = JSON.stringify(req.session).length;
    const contextSize = JSON.stringify(req.session.context).length;

    // PostgreSQL session store recommended max: ~4KB per session
    // Warning threshold: 3KB, Error threshold: 8KB
    if (contextSize > 8000) {
      console.error(`[SessionMonitoring] CRITICAL: Session context size ${contextSize} bytes exceeds safe limit for user ${req.session.userId}`);
    } else if (contextSize > 3000) {
      console.warn(`[SessionMonitoring] WARNING: Session context size ${contextSize} bytes is large for user ${req.session.userId}`);
    }

    // Attach monitoring headers for debugging
    res.setHeader('X-Session-Size', sessionSize.toString());
    res.setHeader('X-Session-Context-Size', contextSize.toString());
  }

  next();
}

/**
 * Validate session version against database
 * Rejects stale sessions and forces re-authentication
 */
export async function validateSessionVersion(req: Request, res: Response, next: NextFunction) {
  if (!isFeatureEnabled('SESSION_AUTH_ENABLED')) {
    return next();
  }

  const userId = req.session.userId;
  const sessionContext = req.session.context;

  if (!userId || !sessionContext) {
    return next(); // Not a session-auth request, skip validation
  }

  try {
    // Check if session version is still valid
    const isValid = await SessionInvalidationService.isSessionValid(
      userId,
      sessionContext.sessionVersion
    );

    if (!isValid) {
      console.log(`[SessionValidation] Stale session detected for user ${userId}. Forcing re-authentication.`);
      
      // Clear session and force re-authentication
      req.session.destroy((err) => {
        if (err) {
          console.error('[SessionValidation] Error destroying stale session:', err);
        }
      });

      return res.status(401).json({
        error: 'Session expired',
        message: 'Your account settings have changed. Please log in again.',
        code: 'STALE_SESSION',
      });
    }

    // Session is valid, continue
    next();
  } catch (error) {
    console.error('[SessionValidation] Error validating session version:', error);
    // SECURITY: Fail closed - deny access on validation errors
    // This prevents unauthorized access if database or validation service is compromised
    return res.status(503).json({
      error: 'Service temporarily unavailable',
      message: 'Unable to validate session. Please try again.',
      code: 'SESSION_VALIDATION_ERROR',
    });
  }
}

/**
 * Require session context middleware
 * Ensures user has valid session context or builds it
 */
export async function requireSessionContext(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!isFeatureEnabled('SESSION_AUTH_ENABLED')) {
    return next(); // Feature disabled, skip session context requirement
  }

  // If session context doesn't exist, build it
  if (!req.session.context) {
    try {
      console.log(`[SessionContext] Building session context for user ${req.session.userId}`);
      const context = await SessionContextService.buildSessionContext(req.session.userId);
      req.session.context = context;
    } catch (error) {
      console.error('[SessionContext] Failed to build session context:', error);
      return res.status(500).json({ error: 'Failed to initialize session' });
    }
  }

  next();
}

/**
 * Organization context middleware
 * Populates req.orgContext with organization data from session or database
 * Supports X-Organization-Context header for multi-org switching
 */
export async function withOrgContext(req: RequestWithOrgContext, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const userId = req.session.userId;
  const startTime = Date.now();
  
  if (isFeatureEnabled('SESSION_AUTH_ENABLED') && req.session.context) {
    // Use session context (fast path) - CACHE HIT
    trackCacheEfficiency(true, 'withOrgContext');
    
    const { primaryOrganization, organizations, effectiveRole, subscription, impersonatedOrganization } = req.session.context;

    // SuperAdmin impersonation: use impersonated org if set
    let selectedOrg = impersonatedOrganization || primaryOrganization;
    
    // Check if user requested specific organization via header (for regular multi-org users)
    const requestedOrgId = req.headers['x-organization-context'] as string;
    if (requestedOrgId && isFeatureEnabled('ENABLE_MULTI_ORG_SWITCHING') && !impersonatedOrganization) {
      const requestedOrg = organizations.find(org => org.orgId === requestedOrgId);
      if (requestedOrg) {
        selectedOrg = requestedOrg;
      } else {
        console.warn(`[OrgContext] User ${userId} requested org ${requestedOrgId} but doesn't have access`);
      }
    }

    // SuperAdmin bypass: allow SuperAdmins without org context to proceed
    // They'll have null orgContext but can still access SuperAdmin-only routes
    if (!selectedOrg && (effectiveRole === 'SuperAdmin' || effectiveRole === 'CustSuper')) {
      req.orgContext = undefined; // No org context for SuperAdmin without impersonation
      req.subscription = undefined;
      trackAuthQuery('fast_path', 'withOrgContext:superadmin_no_org', Date.now() - startTime);
      return next();
    }

    if (!selectedOrg) {
      trackAuthQuery('fast_path', 'withOrgContext:no_org', Date.now() - startTime);
      return res.status(403).json({ error: 'No organization access' });
    }

    // When SuperAdmin is impersonating, use OrgAdmin role for the impersonated org
    const effectiveOrgRole = impersonatedOrganization && effectiveRole === 'SuperAdmin' 
      ? 'OrgAdmin' 
      : effectiveRole;

    req.orgContext = {
      organizationId: selectedOrg.orgId,
      organizationName: selectedOrg.orgName,
      organizationType: selectedOrg.orgType,
      userRoles: impersonatedOrganization ? ['org_admin'] : selectedOrg.roles,
      effectiveRole: effectiveOrgRole,
    };

    req.subscription = subscription || undefined;
    trackAuthQuery('fast_path', 'withOrgContext', Date.now() - startTime);
  } else {
    // Fallback to database lookup (slow path) - CACHE MISS
    trackCacheEfficiency(false, 'withOrgContext');
    
    const userRoles = await storage.getUserRoles(userId);
    if (userRoles.length === 0) {
      const user = await storage.getUser(userId);
      if (user?.isSuperAdmin) {
        req.orgContext = undefined;
        req.subscription = undefined;
        trackAuthQuery('slow_path', 'withOrgContext:superadmin_no_org', Date.now() - startTime);
        return next();
      }
      trackAuthQuery('slow_path', 'withOrgContext:no_roles', Date.now() - startTime);
      return res.status(403).json({ error: 'No organization access' });
    }

    const primaryRole = userRoles[0];
    req.orgContext = {
      organizationId: primaryRole.organizationId,
      organizationName: 'Unknown', // Not available from role table
      organizationType: 'education', // Default, would need additional query
      userRoles: userRoles.map(r => r.role),
      effectiveRole: userRoles[0].role,
    };
    trackAuthQuery('slow_path', 'withOrgContext', Date.now() - startTime);
  }

  next();
}

/**
 * Require specific roles middleware
 * Rejects requests if user doesn't have required role
 */
export function requireRole(allowedRoles: string[]) {
  return async (req: RequestWithOrgContext, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userId = req.session.userId;
    const startTime = Date.now();
    
    if (isFeatureEnabled('SESSION_AUTH_ENABLED') && req.session.context) {
      // Use session context (fast path) - CACHE HIT
      trackCacheEfficiency(true, 'requireRole');
      
      const { effectiveRole, primaryOrganization } = req.session.context;
      
      // SuperAdmin bypass
      if (effectiveRole === 'SuperAdmin') {
        trackAuthQuery('fast_path', 'requireRole:superadmin', Date.now() - startTime);
        return next();
      }

      // Check if user has any of the allowed roles
      const userRoles = primaryOrganization?.roles || [];
      const hasPermission = allowedRoles.some(role => 
        userRoles.includes(role) || effectiveRole === role
      );

      if (!hasPermission) {
        trackAuthQuery('fast_path', 'requireRole:denied', Date.now() - startTime);
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: allowedRoles,
          current: effectiveRole,
        });
      }
      
      trackAuthQuery('fast_path', 'requireRole', Date.now() - startTime);
    } else {
      // Fallback to database lookup (slow path) - CACHE MISS
      trackCacheEfficiency(false, 'requireRole');
      
      const userRoles = await storage.getUserRoles(userId);
      const roleTypes = userRoles.map(r => r.role);
      
      const hasPermission = allowedRoles.some(role => roleTypes.includes(role));
      
      if (!hasPermission) {
        trackAuthQuery('slow_path', 'requireRole:denied', Date.now() - startTime);
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: allowedRoles,
        });
      }
      
      trackAuthQuery('slow_path', 'requireRole', Date.now() - startTime);
    }

    next();
  };
}

/**
 * Require subscription tier middleware
 * Rejects requests if organization doesn't have required subscription tier
 */
export function requireSubscription(requiredFeatures: string[]) {
  return async (req: RequestWithOrgContext, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const startTime = Date.now();
    
    if (isFeatureEnabled('SESSION_AUTH_ENABLED') && req.session.context) {
      // Use session context (fast path) - CACHE HIT
      trackCacheEfficiency(true, 'requireSubscription');
      
      const { subscription } = req.session.context;
      
      if (!subscription || subscription.status !== 'active') {
        trackAuthQuery('fast_path', 'requireSubscription:inactive', Date.now() - startTime);
        return res.status(403).json({
          error: 'Active subscription required',
          required: requiredFeatures,
        });
      }

      // Check if subscription has all required features
      const hasAllFeatures = requiredFeatures.every(feature =>
        subscription.features.includes(feature)
      );

      if (!hasAllFeatures) {
        trackAuthQuery('fast_path', 'requireSubscription:insufficient', Date.now() - startTime);
        return res.status(403).json({
          error: 'Subscription tier insufficient',
          required: requiredFeatures,
          current: subscription.tier,
        });
      }
      
      trackAuthQuery('fast_path', 'requireSubscription', Date.now() - startTime);
    } else {
      // Fallback: would need to query organizationLicenses table - CACHE MISS
      trackCacheEfficiency(false, 'requireSubscription');
      
      // For now, allow through (feature flag disabled means old behavior)
      console.warn('[SubscriptionCheck] Feature flag disabled, skipping subscription check');
      trackAuthQuery('slow_path', 'requireSubscription:skipped', Date.now() - startTime);
    }

    next();
  };
}

/**
 * Combined session auth middleware for easy application to routes
 * Applies: sessionPayloadMonitoring + validateSessionVersion + requireSessionContext
 * Use this as a drop-in replacement for requireAuth when migrating endpoints
 * 
 * CRITICAL: Each step checks res.headersSent to prevent continuing if a response was already sent
 */
export async function withSessionAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Step 1: Session payload monitoring (sync)
    await new Promise<void>((resolve, reject) => {
      sessionPayloadMonitoring(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // CRITICAL: Check if response was sent (e.g., 401)
    if (res.headersSent) {
      return;
    }

    // Step 2: Validate session version (async)
    await new Promise<void>((resolve, reject) => {
      validateSessionVersion(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // CRITICAL: Check if response was sent (e.g., 401 for invalid session version)
    if (res.headersSent) {
      return;
    }

    // Step 3: Require session context (async)
    await new Promise<void>((resolve, reject) => {
      requireSessionContext(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // CRITICAL: Check if response was sent (e.g., 401 for missing session context)
    if (res.headersSent) {
      return;
    }

    next();
  } catch (error) {
    // Only call next with error if headers haven't been sent
    if (!res.headersSent) {
      next(error);
    }
  }
}

/**
 * Get session metrics for debugging and monitoring
 * Returns current session state and performance metrics
 */
export function getSessionMetrics(req: Request): object {
  const hasSession = !!req.session;
  const hasContext = !!req.session?.context;
  const sessionSize = hasSession ? JSON.stringify(req.session).length : 0;
  const contextSize = hasContext ? JSON.stringify(req.session.context).length : 0;
  
  return {
    hasSession,
    hasContext,
    sessionSize,
    contextSize,
    hasSubscription: !!req.session?.context?.subscription,
    organizationCount: req.session?.context?.organizations?.length || 0,
    effectiveRole: req.session?.context?.effectiveRole || 'None',
    sessionVersion: req.session?.context?.sessionVersion || 0,
    featureFlags: {
      SESSION_AUTH_ENABLED: isFeatureEnabled('SESSION_AUTH_ENABLED'),
      SESSION_PAYLOAD_MONITORING: isFeatureEnabled('SESSION_PAYLOAD_MONITORING'),
      ENABLE_MULTI_ORG_SWITCHING: isFeatureEnabled('ENABLE_MULTI_ORG_SWITCHING'),
    },
  };
}

/**
 * Resolves the effective organization for a request.
 * This is the centralized utility for all org-scoped operations.
 * 
 * Priority Order:
 * 1. SuperAdmin impersonation: use session.context.impersonatedOrganization
 * 2. Multi-org users: use X-Organization-Context header (if ENABLE_MULTI_ORG_SWITCHING enabled)
 * 3. Primary organization: session.context.primaryOrganization
 * 4. Single-org fallback: session.context.organizations[0]
 * 5. Database lookup: storage.getUserRoles (when session context unavailable)
 * 
 * Results are cached on req.effectiveOrganization to avoid repeated lookups.
 * 
 * @param req - Express request (must extend RequestWithEffectiveOrg for caching)
 * @returns Promise<EffectiveOrganizationResult> with organization details and source
 */
export async function resolveEffectiveOrganization(req: RequestWithEffectiveOrg): Promise<EffectiveOrganizationResult> {
  if ((req as RequestWithEffectiveOrg).effectiveOrganization) {
    return (req as RequestWithEffectiveOrg).effectiveOrganization!;
  }

  const noOrgResult: EffectiveOrganizationResult = {
    organizationId: null,
    organization: null,
    isImpersonation: false,
    source: 'none',
  };

  if (!req.session.userId) {
    (req as RequestWithEffectiveOrg).effectiveOrganization = noOrgResult;
    return noOrgResult;
  }

  const userId = req.session.userId;
  const persistSessionOrganizationId = (organizationId: string | null) => {
    if (!organizationId) return;
    if (req.session.organizationId !== organizationId) {
      req.session.organizationId = organizationId;
    }
  };
  const sessionOrganizationId =
    typeof req.session.organizationId === 'string' && req.session.organizationId.trim().length > 0
      ? req.session.organizationId.trim()
      : null;

  if (isFeatureEnabled('SESSION_AUTH_ENABLED') && req.session.context) {
    const { primaryOrganization, organizations, impersonatedOrganization } = req.session.context;

    if (impersonatedOrganization) {
      persistSessionOrganizationId(impersonatedOrganization.orgId);
      const result: EffectiveOrganizationResult = {
        organizationId: impersonatedOrganization.orgId,
        organization: impersonatedOrganization,
        isImpersonation: true,
        source: 'impersonation',
      };
      (req as RequestWithEffectiveOrg).effectiveOrganization = result;
      return result;
    }

    const requestedOrgId = req.headers['x-organization-context'] as string;
    if (requestedOrgId && isFeatureEnabled('ENABLE_MULTI_ORG_SWITCHING')) {
      const requestedOrg = organizations.find(org => org.orgId === requestedOrgId);
      if (requestedOrg) {
        persistSessionOrganizationId(requestedOrg.orgId);
        const result: EffectiveOrganizationResult = {
          organizationId: requestedOrg.orgId,
          organization: requestedOrg,
          isImpersonation: false,
          source: 'header',
        };
        (req as RequestWithEffectiveOrg).effectiveOrganization = result;
        return result;
      }
    }

    if (primaryOrganization) {
      persistSessionOrganizationId(primaryOrganization.orgId);
      const result: EffectiveOrganizationResult = {
        organizationId: primaryOrganization.orgId,
        organization: primaryOrganization,
        isImpersonation: false,
        source: 'primary',
      };
      (req as RequestWithEffectiveOrg).effectiveOrganization = result;
      return result;
    }

    if (organizations && organizations.length > 0) {
      persistSessionOrganizationId(organizations[0].orgId);
      const result: EffectiveOrganizationResult = {
        organizationId: organizations[0].orgId,
        organization: organizations[0],
        isImpersonation: false,
        source: 'primary',
      };
      (req as RequestWithEffectiveOrg).effectiveOrganization = result;
      return result;
    }

    if (sessionOrganizationId) {
      const sessionOrg = organizations.find(org => org.orgId === sessionOrganizationId) || null;
      if (sessionOrg) {
        persistSessionOrganizationId(sessionOrg.orgId);
        const result: EffectiveOrganizationResult = {
          organizationId: sessionOrg.orgId,
          organization: sessionOrg,
          isImpersonation: false,
          source: 'fallback',
        };
        (req as RequestWithEffectiveOrg).effectiveOrganization = result;
        return result;
      }
    }

    (req as RequestWithEffectiveOrg).effectiveOrganization = noOrgResult;
    return noOrgResult;
  }

  if (sessionOrganizationId) {
    persistSessionOrganizationId(sessionOrganizationId);
    const fallbackOrg: SessionOrganization = {
      orgId: sessionOrganizationId,
      orgName: 'Unknown',
      orgType: 'education',
      roles: [],
    };
    const result: EffectiveOrganizationResult = {
      organizationId: sessionOrganizationId,
      organization: fallbackOrg,
      isImpersonation: false,
      source: 'fallback',
    };
    (req as RequestWithEffectiveOrg).effectiveOrganization = result;
    return result;
  }

  try {
    const userRoles = await storage.getUserRoles(userId);
    if (userRoles.length > 0) {
      const primaryRole = userRoles[0];
      persistSessionOrganizationId(primaryRole.organizationId);
      const fallbackOrg: SessionOrganization = {
        orgId: primaryRole.organizationId,
        orgName: 'Unknown',
        orgType: 'education',
        roles: userRoles.map(r => r.role),
      };
      const result: EffectiveOrganizationResult = {
        organizationId: primaryRole.organizationId,
        organization: fallbackOrg,
        isImpersonation: false,
        source: 'fallback',
      };
      (req as RequestWithEffectiveOrg).effectiveOrganization = result;
      return result;
    }
  } catch (error) {
    console.error('[resolveEffectiveOrganization] Database lookup failed:', error);
  }

  (req as RequestWithEffectiveOrg).effectiveOrganization = noOrgResult;
  return noOrgResult;
}
