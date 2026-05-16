import { Request, Response, NextFunction } from "express";
import { storage, ALL_STAFF_ROLES } from "./storage";
import "./types"; // Import type extensions
import { isFeatureEnabled } from "./featureFlags";
import { getEffectiveOrganizationId } from "./routes/shared";

function normalizeOrgIdCandidate(value: unknown): string | null {
  if (Array.isArray(value)) {
    return normalizeOrgIdCandidate(value[0]);
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Check if user has access to organization (teacher, orgAdmin, or superAdmin)
export const hasOrgAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.session?.userId) {
      return res.status(401).json({ 
        error: "Authentication required" 
      });
    }

    // Get organizationId from params/body/query/session
    const organizationId = normalizeOrgIdCandidate(
      req.params.organizationId ||
      req.body.organizationId ||
      req.query.organizationId ||
      getEffectiveOrganizationId(req.session) ||
      req.session.organizationId
    );
    if (!organizationId) {
      return res.status(400).json({ 
        error: "Organization ID required" 
      });
    }
    req.session.organizationId = organizationId;

    // Fast path: Use session context if available
    if (isFeatureEnabled('SESSION_AUTH_ENABLED') && req.session.context) {
      const { effectiveRole, organizations, impersonatedOrganization } = req.session.context;
      const hasPlatformWideAccess = effectiveRole === 'SuperAdmin' || effectiveRole === 'CustSuper';

      // Strict impersonation behavior: impersonating platform admins are scoped to the impersonated org only.
      if (hasPlatformWideAccess && impersonatedOrganization) {
        if (impersonatedOrganization.orgId !== organizationId) {
          return res.status(403).json({
            error: "Access denied",
            message: "You are impersonating a different organization",
          });
        }
        const user = await storage.getUser(req.session.userId);
        req.user = user;
        return next();
      }

      if (hasPlatformWideAccess && !impersonatedOrganization) {
        const user = await storage.getUser(req.session.userId);
        req.user = user;
        return next();
      }

      // Check if user has access to the requested organization
      const hasAccess = organizations.some(org => org.orgId === organizationId);
      
      if (!hasAccess) {
        return res.status(403).json({ 
          error: "Access denied", 
          message: "You don't have permission to access this organization" 
        });
      }

      const user = await storage.getUser(req.session.userId);
      req.user = user;
      return next();
    }

    // Fallback: Database lookup
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ 
        error: "User not found" 
      });
    }

    // SuperAdmin has access to all organizations
    if (user.isSuperAdmin || user.isCustSuper) {
      req.user = user;
      return next();
    }

    // Check if user has a role in this organization
    const roles = await storage.getUserRoles(req.session.userId, organizationId);
    
    if (roles.length === 0) {
      return res.status(403).json({ 
        error: "Access denied", 
        message: "You don't have permission to access this organization" 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Org access check error:", error);
    res.status(500).json({ 
      error: "Internal server error" 
    });
  }
};

// Check if user is teacher or admin in organization
export const isTeacherOrAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.session?.userId) {
      return res.status(401).json({ 
        error: "Authentication required" 
      });
    }

    // SECURITY FIX: Get organizationId from params, body, query, OR derive from session context
    let organizationId = normalizeOrgIdCandidate(
      req.params.organizationId || req.body.organizationId || req.query.organizationId
    );
    
    // If not provided, derive from session context (for endpoints that populate org server-side)
    if (!organizationId && isFeatureEnabled('SESSION_AUTH_ENABLED') && req.session) {
      organizationId = getEffectiveOrganizationId(req.session);
    }
    if (!organizationId) {
      organizationId = normalizeOrgIdCandidate(req.session.organizationId);
    }
    
    // Allow platform-wide operations only for non-impersonating platform admins.
    if (!organizationId) {
      const user = await storage.getUser(req.session.userId);
      const isImpersonating = !!req.session.context?.impersonatedOrganization;
      if ((user?.isSuperAdmin || user?.isCustSuper) && !isImpersonating) {
        req.user = user;
        return next();
      }
      
      return res.status(400).json({ 
        error: "Organization ID required" 
      });
    }
    req.session.organizationId = organizationId;

    // Fast path: Use session context if available
    if (isFeatureEnabled('SESSION_AUTH_ENABLED') && req.session.context) {
      const { effectiveRole, organizations, impersonatedOrganization } = req.session.context;
      const hasPlatformWideAccess = effectiveRole === 'SuperAdmin' || effectiveRole === 'CustSuper';

      if (hasPlatformWideAccess && impersonatedOrganization) {
        if (impersonatedOrganization.orgId !== organizationId) {
          return res.status(403).json({
            error: "Access denied",
            message: "You are impersonating a different organization",
          });
        }
        const user = await storage.getUser(req.session.userId);
        req.user = user;
        return next();
      }

      if (hasPlatformWideAccess && !impersonatedOrganization) {
        const user = await storage.getUser(req.session.userId);
        req.user = user;
        return next();
      }

      // Find the specific organization and check for staff roles
      const org = organizations.find(o => o.orgId === organizationId);
      
      if (org) {
        // Check if any of the user's roles in this org are staff roles (snake_case format)
        const hasPermission = org.roles.some(role => 
          ALL_STAFF_ROLES.includes(role)
        );
        
        if (hasPermission) {
          const user = await storage.getUser(req.session.userId);
          req.user = user;
          return next();
        }
      }

      return res.status(403).json({ 
        error: "Access denied", 
        message: "You must be a teacher or administrator in this organization" 
      });
    }

    // Fallback: Database lookup
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ 
        error: "User not found" 
      });
    }

    // SuperAdmin has all permissions when not impersonating.
    if (user.isSuperAdmin && !req.session.context?.impersonatedOrganization) {
      req.user = user;
      return next();
    }

    // CRITICAL: Validate user has role in THIS specific organization to prevent cross-org access
    const roles = await storage.getUserRoles(req.session.userId, organizationId as string);
    
    const hasPermission = roles.some(role => 
      ALL_STAFF_ROLES.includes(role.role)
    );

    if (!hasPermission) {
      return res.status(403).json({ 
        error: "Access denied", 
        message: "You must be a teacher or administrator in this organization" 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Permission check error:", error);
    res.status(500).json({ 
      error: "Internal server error" 
    });
  }
};

// Specialized middleware for join request endpoints
// Fetches join request, validates org access, maintains data isolation
export const validateJoinRequestAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.session?.userId) {
      return res.status(401).json({ 
        error: "Authentication required" 
      });
    }

    // Get join request ID from params
    const joinRequestId = req.params.id;
    if (!joinRequestId) {
      return res.status(400).json({ 
        error: "Join request ID required" 
      });
    }

    // Fetch the join request (required regardless of session context)
    const joinRequest = await storage.getJoinRequest(joinRequestId);
    if (!joinRequest) {
      return res.status(404).json({ 
        error: "Join request not found" 
      });
    }

    // CRITICAL: Extract organizationId from join request for data isolation
    const organizationId = joinRequest.organizationId;

    // Fast path: Use session context if available
    if (isFeatureEnabled('SESSION_AUTH_ENABLED') && req.session.context) {
      const { effectiveRole, organizations, impersonatedOrganization } = req.session.context;
      const hasPlatformWideAccess = effectiveRole === 'SuperAdmin' || effectiveRole === 'CustSuper';

      if (hasPlatformWideAccess && impersonatedOrganization) {
        if (impersonatedOrganization.orgId !== organizationId) {
          return res.status(403).json({
            error: "Access denied",
            message: "You are impersonating a different organization",
          });
        }
        const user = await storage.getUser(req.session.userId);
        req.user = user;
        req.joinRequest = joinRequest;
        return next();
      }

      if (hasPlatformWideAccess && !impersonatedOrganization) {
        const user = await storage.getUser(req.session.userId);
        req.user = user;
        req.joinRequest = joinRequest;
        return next();
      }

      // Find the organization and check for staff roles
      const org = organizations.find(o => o.orgId === organizationId);
      
      if (org) {
        const hasPermission = org.roles.some(role => 
          ALL_STAFF_ROLES.includes(role)
        );
        
        if (hasPermission) {
          const user = await storage.getUser(req.session.userId);
          req.user = user;
          req.joinRequest = joinRequest;
          return next();
        }
      }

      return res.status(403).json({ 
        error: "Access denied", 
        message: "You don't have permission to manage join requests for this organization" 
      });
    }

    // Fallback: Database lookup
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ 
        error: "User not found" 
      });
    }

    // SuperAdmin has access to all join requests
    if (user.isSuperAdmin || user.isCustSuper) {
      req.user = user;
      req.joinRequest = joinRequest;
      return next();
    }

    // Validate user has teacher/admin role in THIS specific organization
    const roles = await storage.getUserRoles(req.session.userId, organizationId);
    
    const hasPermission = roles.some(role => 
      ALL_STAFF_ROLES.includes(role.role)
    );

    if (!hasPermission) {
      return res.status(403).json({ 
        error: "Access denied", 
        message: "You don't have permission to manage join requests for this organization" 
      });
    }

    // Attach join request to request object to avoid refetching
    req.user = user;
    req.joinRequest = joinRequest;
    next();
  } catch (error) {
    console.error("Join request access validation error:", error);
    res.status(500).json({ 
      error: "Internal server error" 
    });
  }
};
