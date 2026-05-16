/**
 * Organization Isolation Middleware
 * 
 * Prevents parameter tampering by validating that any org ID in request
 * params/body/query matches the user's effective organization ID.
 * This blocks cross-org access attempts for multi-tenant security.
 */

import type { Request, Response, NextFunction } from 'express';
import { resolveEffectiveOrganization, type RequestWithEffectiveOrg } from './sessionAuthMiddleware';

const ORG_ID_FIELDS = ['organizationId', 'orgId'];

export interface OrgIsolationOptions {
  skipIfSuperAdminNoImpersonation?: boolean;
  fieldNames?: string[];
  sanitizeBody?: boolean;
}

export function enforceOrgIsolation(options?: OrgIsolationOptions) {
  const fieldNames = options?.fieldNames || ORG_ID_FIELDS;
  const sanitizeBody = options?.sanitizeBody ?? true;
  
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
    // Cache effective org on request for downstream use
    (req as any).effectiveOrganization = effectiveOrg;
    const isSuperAdmin = req.session?.context?.effectiveRole === 'SuperAdmin' || req.session?.context?.effectiveRole === 'CustSuper';
    const isImpersonating = !!req.session?.context?.impersonatedOrganization;

    if (!effectiveOrg.organizationId && !isSuperAdmin) {
      return res.status(403).json({ error: 'No organization context' });
    }
    
    if (options?.skipIfSuperAdminNoImpersonation && isSuperAdmin && !isImpersonating) {
      return next();
    }
    
    const effectiveOrgId = effectiveOrg.organizationId;
    
    for (const field of fieldNames) {
      const paramValue = req.params[field];
      const bodyValue = req.body?.[field];
      const queryValue = req.query[field] as string | undefined;
      
      const valuesToCheck = [paramValue, bodyValue, queryValue].filter(Boolean);
      
      for (const value of valuesToCheck) {
        if (value && value !== effectiveOrgId) {
          console.warn(
            `[OrgIsolation] Blocked cross-org access: ` +
            `user=${req.session.userId}, effectiveOrg=${effectiveOrgId}, ` +
            `requestedOrg=${value}, field=${field}, path=${req.path}`
          );
          return res.status(403).json({ 
            error: 'Access denied',
            message: 'You cannot access resources from a different organization'
          });
        }
      }
    }
    
    if (sanitizeBody && req.body && effectiveOrgId) {
      for (const field of fieldNames) {
        if (req.body[field] !== undefined) {
          req.body[field] = effectiveOrgId;
        }
      }
    }
    
    next();
  };
}

export function enforceOrgIsolationStrict() {
  return enforceOrgIsolation({ skipIfSuperAdminNoImpersonation: false });
}

export function enforceOrgIsolationWithSuperAdminBypass() {
  return enforceOrgIsolation({ skipIfSuperAdminNoImpersonation: true });
}
