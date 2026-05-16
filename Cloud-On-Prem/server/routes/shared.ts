/**
 * Shared Middleware and Configuration
 * 
 * This module contains session configuration and common middleware used across all route modules.
 * Middleware chains are configured once here and reused by all domain routers.
 */

import type { Express } from "express";
import type { Request as ExpressRequest } from "express";
import type { Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool, sessionPool } from "../db";
import { projectLegacyOrganizationContext } from "../middleware/legacyOrgContext";

// Type for session with context - used by impersonation helper functions
type SessionWithContext = ExpressRequest['session'];

// Session context types for enriched session-based auth
export interface SessionOrganization {
  orgId: string;
  orgName: string;
  orgType: 'education' | 'business' | 'elearning';
  orgTimezone?: string | null;
  orgCurrency?: 'ZAR' | 'USD' | 'EUR' | null;
  roles: string[]; // ['Learner', 'OrgAdmin', etc.]
}

export interface SessionSubscription {
  tier: string | null; // 'Blue', 'Red', 'Gold'
  status: string | null; // 'active', 'expired', etc.
  expiresAt: Date | null;
  features: string[]; // Feature flags enabled for this subscription
}

export interface EffectiveLocale {
  timezone: string;
  currency: 'ZAR' | 'USD' | 'EUR';
  timezoneSource: 'user' | 'organization' | 'runtime_default';
  currencySource: 'user' | 'organization' | 'runtime_default';
}

export interface UserPreferences {
  preferredCurrency: string | null; // Effective currency for display, with source in effectiveLocale
  needsCurrencyOnboarding: boolean; // Show currency preference modal on first login
  timezone: string | null; // Effective timezone for display, with source in effectiveLocale
  preferredLanguage: string; // User's preferred language code (default 'en')
  effectiveLocale: EffectiveLocale;
}

export interface SessionContext {
  primaryOrganization: SessionOrganization | null;
  organizations: SessionOrganization[]; // Limited to 10 orgs max for payload size
  effectiveRole: string; // Highest privilege: 'SuperAdmin' > 'OrgAdmin' > 'Learner'
  subscription: SessionSubscription | null;
  sessionVersion: number; // Matches users.sessionVersion for invalidation
  userPreferences: UserPreferences; // User preferences for currency, timezone, etc.
  // SuperAdmin impersonation: allows SuperAdmins to select an org to act as OrgAdmin
  impersonatedOrganization?: SessionOrganization | null;
}

// Extend session types
declare module "express-session" {
  interface SessionData {
    userId?: string;
    user?: any;
    anonymousUserId?: string;
    organizationId?: string; // Current organization context for multi-tenant operations
    context?: SessionContext; // New: enriched session context
  }
}

/**
 * Configure Express session middleware
 * Uses PostgreSQL session store with dedicated connection pool
 * Returns sessionMiddleware for Socket.IO sharing
 */
export function configureSession(app: Express) {
  const PgSession = connectPgSimple(session);
  
  const sessionTtl = 4 * 60 * 60; // 4 hours in seconds
  
  const isProduction = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
  const isSecureHTTPS = process.env.COOKIE_SECURE === 'true';
  
  // SECURITY: Require SESSION_SECRET in production - fail closed
  if (!process.env.SESSION_SECRET) {
    if (isProduction) {
      throw new Error('[SECURITY] SESSION_SECRET environment variable is required in production. Server cannot start without it.');
    }
    console.warn('[SECURITY] SESSION_SECRET not set - using development fallback. Set SESSION_SECRET for production!');
  }
  
  const sessionSecret = process.env.SESSION_SECRET || 'dev-only-insecure-secret-do-not-use-in-production';
  const deploymentMode = ((process.env.DEPLOYMENT_MODE || '').trim().toLowerCase() === 'onprem' || process.env.ONPREM_MODE === 'true')
    ? 'onprem'
    : 'cloud';
  const defaultCookieName = deploymentMode === 'onprem' ? 'lp_onprem.sid' : 'lp_cloud.sid';
  const sessionCookieName = process.env.SESSION_COOKIE_NAME || defaultCookieName;
  const sessionCookieDomain = process.env.SESSION_COOKIE_DOMAIN?.trim() || undefined;
  const rawSameSite = (process.env.SESSION_COOKIE_SAMESITE || '').trim().toLowerCase();
  const sessionCookieSameSite: 'lax' | 'none' | 'strict' =
    rawSameSite === 'none' || rawSameSite === 'strict' || rawSameSite === 'lax'
      ? (rawSameSite as 'lax' | 'none' | 'strict')
      : 'lax';
  
  console.log('Session config:', {
    NODE_ENV: process.env.NODE_ENV,
    isSecureHTTPS,
    secretConfigured: !!process.env.SESSION_SECRET,
    deploymentMode,
    sessionCookieName,
    sessionCookieDomain: sessionCookieDomain || '(host-only)',
    sessionCookieSameSite,
  });

  const sessionMiddleware = session({
    store: new PgSession({
      pool: sessionPool,
      tableName: 'sessions', // Fixed: Match schema table name (plural)
      createTableIfMissing: false,
      ttl: sessionTtl, // Session TTL in seconds
      pruneSessionInterval: 600, // Cleanup expired sessions every 10 minutes (reduced frequency)
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    name: sessionCookieName,
    cookie: {
      // Use "auto" in secure mode so reverse-proxy TLS detection controls
      // secure cookies. This prevents silent auth breakage when proxy headers
      // are imperfect while still emitting secure cookies on HTTPS requests.
      secure: isSecureHTTPS ? 'auto' : false,
      httpOnly: true,
      maxAge: sessionTtl * 1000, // 4 hours in milliseconds
      sameSite: sessionCookieSameSite,
      domain: sessionCookieDomain,
    },
  });
  
  app.use(sessionMiddleware);
  app.use(syncLegacyOrganizationContext);
  return sessionMiddleware; // Return middleware for Socket.IO sharing
}

/**
 * Export common middleware dependencies
 * These are used by various route modules
 */
export { isAdmin, isAuthenticated, isSuperAdmin } from "../adminAuth";
export { isTeacherOrAdmin, validateJoinRequestAccess } from "../tenantMiddleware";
export { 
  checkQuizCreationLimit, 
  checkAIExplanationLimit, 
  checkConcurrentUserLimit, 
  trackUserLogin, 
  trackUserLogout, 
  resetDailyLimitsForAllOrgs 
} from "../usageLimitMiddleware";
export {
  resolveEffectiveOrganization, 
  type EffectiveOrganizationResult,
  type RequestWithEffectiveOrg
} from "../middleware/sessionAuthMiddleware";

export function syncLegacyOrganizationContext(req: Request, _res: Response, next: NextFunction) {
  projectLegacyOrganizationContext(req.session);
  next();
}

/**
 * Optional authentication middleware
 * Allows both authenticated and anonymous users to access the endpoint
 * Creates anonymous session if neither exists and populates req.user
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  // Set user info if authenticated, otherwise create/maintain anonymous session
  if (req.session.userId) {
    req.user = { id: req.session.userId, isAuthenticated: true };
  } else {
    // Create session-only anonymous user ID (no database creation)
    if (!req.session.anonymousUserId) {
      const utcTimestamp = Date.now(); 
      const anonymousId = `guest_${utcTimestamp}_${Math.random().toString(36).substr(2, 9)}`;
      req.session.anonymousUserId = anonymousId;
      console.log(`🎭 Created session-only guest user: ${anonymousId}`);
    }
    req.user = { id: req.session.anonymousUserId, isAuthenticated: false };
  }
  next();
}

/**
 * Required authentication middleware
 * Rejects unauthenticated requests with 401
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

/**
 * Get the effective organization ID from session context.
 * This helper considers SuperAdmin impersonation and returns the correct org ID
 * for data filtering purposes.
 * 
 * Priority:
 * 1. impersonatedOrganization (when SuperAdmin is impersonating)
 * 2. primaryOrganization (user's normal primary org)
 * 3. First organization in the list (fallback)
 * 
 * @param session - Express session with context
 * @returns Organization ID string or null if no org context
 */
export function getEffectiveOrganizationId(session: SessionWithContext): string | null {
  const context = session.context;
  if (!context) {
    return session.organizationId || null;
  }
  
  // Priority 1: Impersonated organization (SuperAdmin acting as OrgAdmin)
  if (context.impersonatedOrganization?.orgId) {
    return context.impersonatedOrganization.orgId;
  }
  
  // Priority 2: Primary organization
  if (context.primaryOrganization?.orgId) {
    return context.primaryOrganization.orgId;
  }
  
  // Priority 3: First organization in list (fallback)
  if (context.organizations?.length > 0) {
    return context.organizations[0].orgId;
  }
  
  return session.organizationId || null;
}

/**
 * Get the effective organization from session context.
 * Returns the full organization object (not just ID) considering impersonation.
 * 
 * @param session - Express session with context
 * @returns SessionOrganization object or null
 */
export function getEffectiveOrganization(session: SessionWithContext): SessionOrganization | null {
  const context = session.context;
  if (!context) {
    return null;
  }
  
  // Priority 1: Impersonated organization
  if (context.impersonatedOrganization) {
    return context.impersonatedOrganization;
  }
  
  // Priority 2: Primary organization
  if (context.primaryOrganization) {
    return context.primaryOrganization;
  }
  
  // Priority 3: First organization in list
  if (context.organizations?.length > 0) {
    return context.organizations[0];
  }
  
  return null;
}

/**
 * Check if the current session is an impersonation session.
 * 
 * @param session - Express session with context
 * @returns true if SuperAdmin is impersonating an organization
 */
export function isImpersonating(session: SessionWithContext): boolean {
  return !!session.context?.impersonatedOrganization;
}
