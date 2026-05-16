/**
 * Session Context Service
 * 
 * Builds enriched session context from user data, organizations, roles, and subscriptions.
 * Used during login to populate session with cached authorization data.
 */

import { db } from '../db';
import { users, userOrganizationRoles, organizations, organizationLicenses } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import type { SessionContext, SessionOrganization, SessionSubscription, UserPreferences } from '../routes/shared';
import { trackContextBuild, trackContextRefresh } from '../monitoring/sessionHealthMonitor';
import { resolveEffectiveLocale } from '../utils/effectiveLocale';

export interface CanonicalOrganizationRole {
  organizationId: string;
  organizationName: string;
  organizationType: SessionOrganization['orgType'];
  role: string;
  isImpersonated?: boolean;
}

export interface CanonicalSessionScope {
  effectiveOrganizationId: string | null;
  effectiveOrganizationType: SessionOrganization['orgType'] | null;
  effectiveOrganizationName: string | null;
  isImpersonating: boolean;
  impersonatedOrganization: SessionOrganization | null;
  primaryRole: string | null;
  organizationRoles: CanonicalOrganizationRole[];
}

const MAX_ORGANIZATIONS_IN_SESSION = 10; // Limit to prevent session bloat
const SESSION_ADMIN_ROLES = new Set(['org_admin']);
const SESSION_INSTRUCTOR_ROLES = new Set(['teacher', 'team_lead', 'instructor']);

export function deriveEffectiveSessionRole(
  user: { isSuperAdmin?: boolean | null; isCustSuper?: boolean | null },
  roles: string[]
): string {
  if (user.isSuperAdmin) {
    return 'SuperAdmin';
  }
  if (user.isCustSuper) {
    return 'CustSuper';
  }
  if (roles.some((role) => SESSION_ADMIN_ROLES.has(role))) {
    return 'OrgAdmin';
  }
  if (roles.some((role) => SESSION_INSTRUCTOR_ROLES.has(role))) {
    return 'Teacher';
  }
  return 'Learner';
}

export class SessionContextService {
  /**
   * Build complete session context for a user
   * Fetches organizations, roles, and subscription in a single optimized query
   */
  static async buildSessionContext(userId: string): Promise<SessionContext> {
    const startTime = Date.now();
    let success = false;
    let organizationCount = 0;
    let contextSizeBytes = 0;
    
    try {
      // Parallelize user and org/roles queries (they don't depend on each other)
      const [userResult, userOrgRoles] = await Promise.all([
        // Query 1: Fetch user's session version and preferences
        db.select({ 
          sessionVersion: users.sessionVersion, 
          isSuperAdmin: users.isSuperAdmin,
          isCustSuper: users.isCustSuper,
          preferredCurrency: users.preferredCurrency,
          needsCurrencyOnboarding: users.needsCurrencyOnboarding,
          timezone: users.timezone,
          preferredLanguage: users.preferredLanguage,
        })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1),
        
        // Query 2: Fetch user's organizations and roles in one query
        db.select({
          orgId: organizations.id,
          orgName: organizations.name,
          orgType: organizations.type,
          orgTimezone: organizations.timezone,
          orgCurrency: organizations.currency,
          role: userOrganizationRoles.role,
          createdAt: userOrganizationRoles.createdAt,
        })
        .from(userOrganizationRoles)
        .innerJoin(organizations, eq(userOrganizationRoles.organizationId, organizations.id))
        .where(eq(userOrganizationRoles.userId, userId))
        .orderBy(
          desc(userOrganizationRoles.createdAt), // Most recently joined org first
          organizations.id // Tie-breaker for consistency
        )
        .limit(MAX_ORGANIZATIONS_IN_SESSION + 1) // +1 to detect if we're over limit
      ]);

      const user = userResult[0];
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      if (userOrgRoles.length > MAX_ORGANIZATIONS_IN_SESSION) {
        console.warn(`[SessionContext] User ${userId} has ${userOrgRoles.length} organizations, limiting to ${MAX_ORGANIZATIONS_IN_SESSION}`);
      }

      // Group roles by organization
      const orgMap = new Map<string, SessionOrganization>();
      userOrgRoles.slice(0, MAX_ORGANIZATIONS_IN_SESSION).forEach(row => {
        if (!orgMap.has(row.orgId)) {
            orgMap.set(row.orgId, {
              orgId: row.orgId,
              orgName: row.orgName,
              orgType: row.orgType as 'education' | 'business' | 'elearning',
              orgTimezone: row.orgTimezone ?? null,
              orgCurrency: row.orgCurrency ?? null,
              roles: [],
            });
        }
        orgMap.get(row.orgId)!.roles.push(row.role);
      });

      const userOrganizations = Array.from(orgMap.values());

      // Determine primary organization (first one)
      const primaryOrganization = userOrganizations.length > 0 ? userOrganizations[0] : null;

      // Determine effective role (highest privilege) from semantic role groups.
      const effectiveRole = deriveEffectiveSessionRole(user, userOrganizations.flatMap(org => org.roles));

      // Fetch subscription info for primary organization (depends on org result, so sequential)
      // Deterministic ordering: active licenses first, then by longest term (currentTermEnd DESC)
      let subscription: SessionSubscription | null = null;
      if (primaryOrganization) {
        const [license] = await db
          .select({
            tier: organizationLicenses.tier,
            status: organizationLicenses.status,
            currentTermEnd: organizationLicenses.currentTermEnd,
          })
          .from(organizationLicenses)
          .where(eq(organizationLicenses.organizationId, primaryOrganization.orgId))
          .orderBy(
            desc(organizationLicenses.currentTermEnd) // Longest/most recent license first
          )
          .limit(1);

        if (license) {
          // Determine features based on tier
          const features = this.getFeaturesForTier(license.tier);
          
          subscription = {
            tier: license.tier,
            status: license.status,
            expiresAt: license.currentTermEnd,
            features,
          };
        }
      }

      // Build user preferences
      const effectiveLocale = resolveEffectiveLocale({
        userTimezone: user.timezone,
        organizationTimezone: primaryOrganization?.orgTimezone ?? null,
        userCurrency: user.preferredCurrency,
        organizationCurrency: primaryOrganization?.orgCurrency ?? null,
      });

      const userPreferences: UserPreferences = {
        preferredCurrency: effectiveLocale.currency,
        needsCurrencyOnboarding: user.needsCurrencyOnboarding ?? true,
        timezone: effectiveLocale.timezone,
        preferredLanguage: user.preferredLanguage ?? 'en',
        effectiveLocale,
      };

      const context: SessionContext = {
        primaryOrganization,
        organizations: userOrganizations,
        effectiveRole,
        subscription,
        sessionVersion: user.sessionVersion,
        userPreferences,
      };

      // Log session context size for monitoring
      contextSizeBytes = JSON.stringify(context).length;
      organizationCount = userOrganizations.length;
      console.log(`[SessionContext] Built session context for user ${userId}: ${contextSizeBytes} bytes, ${organizationCount} orgs, role: ${effectiveRole}`);

      if (contextSizeBytes > 4000) { // PostgreSQL session storage warning threshold
        console.warn(`[SessionContext] Session context size (${contextSizeBytes} bytes) is large - may impact performance`);
      }

      success = true;
      return context;
    } catch (error) {
      console.error('[SessionContext] Failed to build session context:', error);
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      trackContextBuild(userId, duration, success, organizationCount, contextSizeBytes);
    }
  }

  /**
   * Get feature flags enabled for a subscription tier
   */
  private static getFeaturesForTier(tier: string): string[] {
    const features: string[] = [];
    
    switch (tier) {
      case 'Gold':
        features.push('ai_quiz_generation', 'ai_lesson_generation', 'advanced_analytics', 'custom_branding', 'priority_support');
        break;
      case 'Red':
        features.push('ai_quiz_generation', 'basic_analytics');
        break;
      case 'Blue':
        features.push('basic_features');
        break;
      default:
        features.push('free_tier');
    }

    return features;
  }

  /**
   * Refresh session context (used by /api/auth/refresh endpoint)
   */
  static getCanonicalOrganizationRoles(context?: SessionContext | null): CanonicalOrganizationRole[] {
    if (!context) {
      return [];
    }

    const organizationRoles: CanonicalOrganizationRole[] = context.organizations.flatMap((org): CanonicalOrganizationRole[] => {
      const roles = org.roles.length > 0 ? org.roles : ['Learner'];
      return roles.map((role) => ({
        organizationId: org.orgId,
        organizationName: org.orgName,
        organizationType: org.orgType,
        role,
      }));
    });

    if (context.impersonatedOrganization && (context.effectiveRole === 'SuperAdmin' || context.effectiveRole === 'CustSuper')) {
      organizationRoles.push({
        organizationId: context.impersonatedOrganization.orgId,
        organizationName: context.impersonatedOrganization.orgName,
        organizationType: context.impersonatedOrganization.orgType,
        role: 'org_admin',
        isImpersonated: true,
      });
    }

    return organizationRoles;
  }

  static getCanonicalSessionScope(context?: SessionContext | null): CanonicalSessionScope {
    const impersonatedOrganization = context?.impersonatedOrganization ?? null;
    const selectedOrganization = impersonatedOrganization ?? context?.primaryOrganization ?? context?.organizations?.[0] ?? null;
    const organizationRoles = this.getCanonicalOrganizationRoles(context);

    let primaryRole: string | null = null;
    if (impersonatedOrganization && (context?.effectiveRole === 'SuperAdmin' || context?.effectiveRole === 'CustSuper')) {
      primaryRole = 'OrgAdmin';
    } else if (selectedOrganization?.roles?.length) {
      primaryRole = selectedOrganization.roles[0];
    } else if (context?.effectiveRole) {
      primaryRole = context.effectiveRole;
    }

    return {
      effectiveOrganizationId: selectedOrganization?.orgId ?? null,
      effectiveOrganizationType: selectedOrganization?.orgType ?? null,
      effectiveOrganizationName: selectedOrganization?.orgName ?? null,
      isImpersonating: !!impersonatedOrganization,
      impersonatedOrganization,
      primaryRole,
      organizationRoles,
    };
  }

  static async refreshSessionContext(userId: string, currentSessionVersion: number): Promise<SessionContext | null> {
    try {
      // Check if session version is still valid
      const [user] = await db
        .select({ sessionVersion: users.sessionVersion })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        console.warn(`[SessionContext] User ${userId} not found during refresh`);
        trackContextRefresh(userId, false, 'user_not_found');
        return null;
      }

      if (user.sessionVersion !== currentSessionVersion) {
        console.log(`[SessionContext] Session version mismatch for user ${userId}. DB: ${user.sessionVersion}, Session: ${currentSessionVersion}. Session invalidated.`);
        trackContextRefresh(userId, false, 'version_mismatch');
        return null;
      }

      // Session version matches, rebuild context
      const context = await this.buildSessionContext(userId);
      trackContextRefresh(userId, true, 'version_valid');
      return context;
    } catch (error) {
      console.error('[SessionContext] Failed to refresh session context:', error);
      trackContextRefresh(userId, false, 'error');
      return null;
    }
  }
}
