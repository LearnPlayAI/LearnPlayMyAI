import { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { db } from "./db";
import { userOrganizationRoles } from "@shared/schema";
import { eq } from "drizzle-orm";
import { isFeatureEnabled } from "./featureFlags";
import { trackAuthQuery } from "./monitoring/authQueryTracker";

// Extend the Request interface to include user info
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// Middleware to check if user is authenticated and is an admin
export const isAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check if user is authenticated first
    if (!req.session?.userId) {
      return res.status(401).json({ 
        error: "Authentication required", 
        message: "You must be logged in to access this resource" 
      });
    }

    const startTime = Date.now();
    const onPremMode = isFeatureEnabled('ONPREM_MODE');

    // Fast path: Use session context if available (reduces DB queries)
    if (isFeatureEnabled('SESSION_AUTH_ENABLED') && req.session.context) {
      const { effectiveRole, primaryOrganization, impersonatedOrganization } = req.session.context;
      
      // Check if user has admin-level role from session context
      const isAdminRole = effectiveRole === 'SuperAdmin' || (onPremMode && effectiveRole === 'CustSuper') || effectiveRole === 'OrgAdmin';
      const hasOrgAdminRole = primaryOrganization?.roles?.includes('org_admin') || false;
      
      if (isAdminRole || hasOrgAdminRole) {
        // Get minimal user data for req.user (still needed by some routes)
        const user = await storage.getUser(req.session.userId);
        req.user = user;
        trackAuthQuery('fast_path', 'isAdmin', Date.now() - startTime);
        return next();
      }
      
      trackAuthQuery('fast_path', 'isAdmin:denied', Date.now() - startTime);
      return res.status(403).json({ 
        error: "Admin access required", 
        message: "You don't have permission to access this resource" 
      });
    }

    // Fallback: Get the user from database (legacy path)
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      trackAuthQuery('slow_path', 'isAdmin:no_user', Date.now() - startTime);
      return res.status(401).json({ 
        error: "User not found", 
        message: "Invalid session" 
      });
    }

    // Check if user is admin, superadmin, or custsuper (boolean flags)
    const hasAdminFlag = user.isAdmin || user.isSuperAdmin || (onPremMode && user.isCustSuper);
    
    // Also check if user has org_admin role in any organization
    let hasOrgAdminRole = false;
    if (!hasAdminFlag) {
      const orgRoles = await db
        .select()
        .from(userOrganizationRoles)
        .where(eq(userOrganizationRoles.userId, user.id));
      
      hasOrgAdminRole = orgRoles.some(r => r.role === 'org_admin');
    }
    
    if (!hasAdminFlag && !hasOrgAdminRole) {
      trackAuthQuery('slow_path', 'isAdmin:denied', Date.now() - startTime);
      return res.status(403).json({ 
        error: "Admin access required", 
        message: "You don't have permission to access this resource" 
      });
    }

    // Add user to request object for use in routes
    req.user = user;
    trackAuthQuery('slow_path', 'isAdmin', Date.now() - startTime);
    next();
  } catch (error) {
    console.error("Admin auth middleware error:", error);
    res.status(500).json({ 
      error: "Internal server error", 
      message: "Authentication check failed" 
    });
  }
};

// Middleware to check if user is authenticated (but not necessarily admin)
export const isAuthenticated = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.session?.userId) {
      return res.status(401).json({ 
        error: "Authentication required", 
        message: "You must be logged in to access this resource" 
      });
    }

    // Fast path: If session context exists, user is authenticated
    // Still need to fetch user for req.user compatibility
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ 
        error: "User not found", 
        message: "Invalid session" 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ 
      error: "Internal server error", 
      message: "Authentication check failed" 
    });
  }
};

// Middleware to check if user is authenticated and is a SuperAdmin
export const isSuperAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check if user is authenticated first
    if (!req.session?.userId) {
      return res.status(401).json({ 
        error: "Authentication required", 
        message: "You must be logged in to access this resource" 
      });
    }

    const startTime = Date.now();

    // Fast path: Use session context if available
    if (isFeatureEnabled('SESSION_AUTH_ENABLED') && req.session.context) {
      const { effectiveRole } = req.session.context;
      
      if (effectiveRole === 'SuperAdmin') {
        // Get minimal user data for req.user
        const user = await storage.getUser(req.session.userId);
        req.user = user;
        trackAuthQuery('fast_path', 'isSuperAdmin', Date.now() - startTime);
        return next();
      }

      // Impersonation can temporarily change effectiveRole while the underlying
      // account still has platform-wide SuperAdmin entitlement.
      const user = await storage.getUser(req.session.userId);
      if (user?.isSuperAdmin) {
        req.user = user;
        trackAuthQuery('fast_path', 'isSuperAdmin:entitlement', Date.now() - startTime);
        return next();
      }
      
      trackAuthQuery('fast_path', 'isSuperAdmin:denied', Date.now() - startTime);
      return res.status(403).json({ 
        error: "SuperAdmin access required", 
        message: "You don't have permission to access this resource" 
      });
    }

    // Fallback: Get the user from database
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      trackAuthQuery('slow_path', 'isSuperAdmin:no_user', Date.now() - startTime);
      return res.status(401).json({ 
        error: "User not found", 
        message: "Invalid session" 
      });
    }

    // Check if user is SuperAdmin
    if (!user.isSuperAdmin) {
      trackAuthQuery('slow_path', 'isSuperAdmin:denied', Date.now() - startTime);
      return res.status(403).json({ 
        error: "SuperAdmin access required", 
        message: "You don't have permission to access this resource" 
      });
    }

    // Add user to request object for use in routes
    req.user = user;
    trackAuthQuery('slow_path', 'isSuperAdmin', Date.now() - startTime);
    next();
  } catch (error) {
    console.error("SuperAdmin auth middleware error:", error);
    res.status(500).json({ 
      error: "Internal server error", 
      message: "Authentication check failed" 
    });
  }
};

// Middleware to check if user is authenticated and is a Customer Super Admin
// IMPORTANT: custSuper role is ONLY functional when ONPREM_MODE=true
export const isCustSuper = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isFeatureEnabled('ONPREM_MODE')) {
      return res.status(403).json({
        error: "Not available",
        message: "This feature is only available in on-premises deployments"
      });
    }

    if (!req.session?.userId) {
      return res.status(401).json({ 
        error: "Authentication required", 
        message: "You must be logged in to access this resource" 
      });
    }

    const startTime = Date.now();

    if (isFeatureEnabled('SESSION_AUTH_ENABLED') && req.session.context) {
      const { effectiveRole } = req.session.context;
      
      if (effectiveRole === 'CustSuper' || effectiveRole === 'SuperAdmin') {
        const user = await storage.getUser(req.session.userId);
        req.user = user;
        trackAuthQuery('fast_path', 'isCustSuper', Date.now() - startTime);
        return next();
      }
      
      trackAuthQuery('fast_path', 'isCustSuper:denied', Date.now() - startTime);
      return res.status(403).json({ 
        error: "Customer Super Admin access required", 
        message: "You don't have permission to access this resource" 
      });
    }

    const user = await storage.getUser(req.session.userId);
    if (!user) {
      trackAuthQuery('slow_path', 'isCustSuper:no_user', Date.now() - startTime);
      return res.status(401).json({ 
        error: "User not found", 
        message: "Invalid session" 
      });
    }

    if (!user.isCustSuper && !user.isSuperAdmin) {
      trackAuthQuery('slow_path', 'isCustSuper:denied', Date.now() - startTime);
      return res.status(403).json({ 
        error: "Customer Super Admin access required", 
        message: "You don't have permission to access this resource" 
      });
    }

    req.user = user;
    trackAuthQuery('slow_path', 'isCustSuper', Date.now() - startTime);
    next();
  } catch (error) {
    console.error("CustSuper auth middleware error:", error);
    res.status(500).json({ 
      error: "Internal server error", 
      message: "Authentication check failed" 
    });
  }
};

// Combined middleware: allows either SuperAdmin or CustSuper through
export const isSuperAdminOrCustSuper = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.session?.userId) {
      return res.status(401).json({ 
        error: "Authentication required", 
        message: "You must be logged in to access this resource" 
      });
    }

    const startTime = Date.now();
    const onPremMode = isFeatureEnabled('ONPREM_MODE');

    if (isFeatureEnabled('SESSION_AUTH_ENABLED') && req.session.context) {
      const { effectiveRole } = req.session.context;
      
      if (effectiveRole === 'SuperAdmin' || (onPremMode && effectiveRole === 'CustSuper')) {
        const user = await storage.getUser(req.session.userId);
        req.user = user;
        trackAuthQuery('fast_path', 'isSuperAdminOrCustSuper', Date.now() - startTime);
        return next();
      }

      // Keep platform-wide access available during impersonation when effectiveRole
      // is narrowed but underlying account still has SuperAdmin/CustSuper flags.
      const user = await storage.getUser(req.session.userId);
      if (user && (user.isSuperAdmin || (onPremMode && user.isCustSuper))) {
        req.user = user;
        trackAuthQuery('fast_path', 'isSuperAdminOrCustSuper:entitlement', Date.now() - startTime);
        return next();
      }
      
      trackAuthQuery('fast_path', 'isSuperAdminOrCustSuper:denied', Date.now() - startTime);
      return res.status(403).json({ 
        error: "SuperAdmin or Customer Super Admin access required", 
        message: "You don't have permission to access this resource" 
      });
    }

    const user = await storage.getUser(req.session.userId);
    if (!user) {
      trackAuthQuery('slow_path', 'isSuperAdminOrCustSuper:no_user', Date.now() - startTime);
      return res.status(401).json({ 
        error: "User not found", 
        message: "Invalid session" 
      });
    }

    if (!user.isSuperAdmin && !(onPremMode && user.isCustSuper)) {
      trackAuthQuery('slow_path', 'isSuperAdminOrCustSuper:denied', Date.now() - startTime);
      return res.status(403).json({ 
        error: "SuperAdmin or Customer Super Admin access required", 
        message: "You don't have permission to access this resource" 
      });
    }

    req.user = user;
    trackAuthQuery('slow_path', 'isSuperAdminOrCustSuper', Date.now() - startTime);
    next();
  } catch (error) {
    console.error("SuperAdminOrCustSuper auth middleware error:", error);
    res.status(500).json({ 
      error: "Internal server error", 
      message: "Authentication check failed" 
    });
  }
};

// Middleware to check if user is an Organization Admin for their current organization
export const isOrgAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.session?.userId) {
      return res.status(401).json({ 
        error: "Authentication required", 
        message: "You must be logged in to access this resource" 
      });
    }

    const startTime = Date.now();
    const onPremMode = isFeatureEnabled('ONPREM_MODE');

    // Fast path: Use session context if available
    if (isFeatureEnabled('SESSION_AUTH_ENABLED') && req.session.context) {
      const { effectiveRole, primaryOrganization, impersonatedOrganization } = req.session.context;
      
      // SuperAdmin and CustSuper can access any org
      if (effectiveRole === 'SuperAdmin' || (onPremMode && effectiveRole === 'CustSuper')) {
        const user = await storage.getUser(req.session.userId);
        req.user = user;
        // When impersonating, org-scoped admin routes must resolve to the impersonated organization.
        const resolvedOrgId = impersonatedOrganization?.orgId || primaryOrganization?.orgId;
        if (resolvedOrgId) {
          (req as any).resolvedOrganizationId = resolvedOrgId;
        }
        trackAuthQuery('fast_path', 'isOrgAdmin:superadmin', Date.now() - startTime);
        return next();
      }
      
      // Check if user has org_admin role in their primary organization
      const hasOrgAdminRole = primaryOrganization?.roles?.includes('org_admin') || false;
      
      if (hasOrgAdminRole) {
        const user = await storage.getUser(req.session.userId);
        req.user = user;
        if (primaryOrganization?.orgId) {
          (req as any).resolvedOrganizationId = primaryOrganization.orgId;
        }
        trackAuthQuery('fast_path', 'isOrgAdmin', Date.now() - startTime);
        return next();
      }
      
      trackAuthQuery('fast_path', 'isOrgAdmin:denied', Date.now() - startTime);
      return res.status(403).json({ 
        error: "Organization Admin access required", 
        message: "You don't have permission to manage this organization's branding" 
      });
    }

    // Fallback: Get user from database
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      trackAuthQuery('slow_path', 'isOrgAdmin:no_user', Date.now() - startTime);
      return res.status(401).json({ 
        error: "User not found", 
        message: "Invalid session" 
      });
    }

    // SuperAdmin / CustSuper bypass
    if (user.isSuperAdmin || (onPremMode && user.isCustSuper)) {
      req.user = user;
      trackAuthQuery('slow_path', 'isOrgAdmin:superadmin', Date.now() - startTime);
      return next();
    }

    // Check org_admin role - try session org first, fall back to DB lookup
    let organizationId = req.session.organizationId;
    
    const orgRoles = await db
      .select()
      .from(userOrganizationRoles)
      .where(eq(userOrganizationRoles.userId, user.id));
    
    if (!organizationId) {
      // No org in session - find the user's org_admin role from DB
      const adminRole = orgRoles.find(r => r.role === 'org_admin');
      if (adminRole) {
        organizationId = adminRole.organizationId;
      }
    }
    
    if (!organizationId) {
      trackAuthQuery('slow_path', 'isOrgAdmin:no_org', Date.now() - startTime);
      return res.status(400).json({ 
        error: "Organization context required", 
        message: "Please select an organization first" 
      });
    }

    const hasOrgAdminRole = orgRoles.some(r => 
      r.organizationId === organizationId && r.role === 'org_admin'
    );

    if (!hasOrgAdminRole) {
      trackAuthQuery('slow_path', 'isOrgAdmin:denied', Date.now() - startTime);
      return res.status(403).json({ 
        error: "Organization Admin access required", 
        message: "You don't have permission to manage this organization's branding" 
      });
    }

    req.user = user;
    (req as any).resolvedOrganizationId = organizationId;
    trackAuthQuery('slow_path', 'isOrgAdmin', Date.now() - startTime);
    next();
  } catch (error) {
    console.error("OrgAdmin auth middleware error:", error);
    res.status(500).json({ 
      error: "Internal server error", 
      message: "Authentication check failed" 
    });
  }
};
