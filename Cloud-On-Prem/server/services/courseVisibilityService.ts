import { db } from '../db';
import { courses, coursePurchases, userOrganizationRoles, organizations, userLicenses, userCourseEnrollments } from '@shared/schema';
import { eq, and, or, inArray, SQL, sql, isNull, notInArray } from 'drizzle-orm';
import type { SessionContext } from '../routes/shared';
import { isCourseVisibilityEnabled } from '../featureFlags';
import { resolveEffectiveOrganization, type RequestWithEffectiveOrg } from '../middleware/sessionAuthMiddleware';
import type { Request } from 'express';
import { getOrgTypePolicy, getOrgTypePolicyById, getRestrictedOrgTypes, type OrgType, type OrgTypePolicy } from './orgTypePolicy';

/**
 * ============================================================================
 * COURSE VISIBILITY ROLLBACK PROCEDURE
 * ============================================================================
 * 
 * Emergency rollback for the course visibility system. Follow these steps:
 * 
 * STEP 1: Disable the feature flag
 * --------------------------------
 * Set environment variable: COURSE_VISIBILITY_ENABLED=false
 * Then restart the application.
 * 
 * This immediately:
 * - Bypasses all visibility checks (all courses accessible to authenticated users)
 * - Hides visibility field from UI
 * - Returns 'public' as visibility in all access checks
 * 
 * STEP 2: Flush caches (if needed)
 * --------------------------------
 * Call: CourseVisibilityService.flushAllCaches()
 * This logs cache invalidation hints for frontend query keys.
 * 
 * STEP 3: Reset visibility values in database (optional - full rollback)
 * -----------------------------------------------------------------------
 * Run this SQL to reset all courses to 'public' visibility:
 * 
 *   UPDATE courses SET visibility = 'public', "updatedAt" = NOW();
 * 
 * STEP 4: Remove visibility column entirely (destructive - requires new migration)
 * ---------------------------------------------------------------------------------
 * Only if you want to completely remove the feature:
 * 
 *   ALTER TABLE courses DROP COLUMN IF EXISTS visibility;
 *   DROP TYPE IF EXISTS "courseVisibility";
 * 
 * ============================================================================
 */

export interface OrgTypeTransitionResult {
  organizationId: string;
  previousType: 'education' | 'business' | 'elearning';
  newType: 'education' | 'business' | 'elearning';
  coursesUpdated: number;
  courseIds: string[];
  cacheInvalidation: {
    shouldInvalidate: boolean;
    queryKeysToInvalidate: string[];
    reason: string;
  };
}

export type CourseVisibility = 'public' | 'org_only';

export interface CourseAccessResult {
  hasAccess: boolean;
  accessReason: 'owner' | 'org_member' | 'purchased' | 'public_free' | 'superadmin' | 'none';
  visibility: CourseVisibility;
  courseOrgId: string | null;
  courseOrgType: 'education' | 'business' | 'elearning' | null;
}

export interface VisibilityPolicy {
  canCreate: boolean;
  allowedVisibilities: CourseVisibility[];
  defaultVisibility: CourseVisibility;
  canChangeVisibility: boolean;
}

/**
 * ============================================================================
 * STANDARDIZED VISIBILITY HELPERS (Task 6)
 * ============================================================================
 * 
 * These helper functions provide a uniform API for checking content visibility
 * across the platform. Use these for consistent access control:
 * 
 * - getVisibilityContext(req): Extract visibility context from request
 * - canAccessContent(): Check if user can access content based on visibility
 * - buildVisibilityFilter(): Build SQL filter for visibility-aware queries
 */

/** Content visibility type - alias for CourseVisibility for broader content use */
export type ContentVisibility = 'public' | 'org_only';

/** Context for visibility decisions, extracted from request */
export interface VisibilityContext {
  effectiveOrgId: string | null;
  isSuperAdminNoImpersonation: boolean;
}

/**
 * Extract visibility context from an Express request.
 * Uses resolveEffectiveOrganization to handle impersonation correctly.
 * 
 * @param req - Express request object
 * @returns VisibilityContext with effectiveOrgId and superadmin status
 */
export async function getVisibilityContext(req: Request): Promise<VisibilityContext> {
  const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
  const isSuperAdminNoImpersonation = 
    req.session?.context?.effectiveRole === 'SuperAdmin' && 
    !req.session?.context?.impersonatedOrganization;
  
  return {
    effectiveOrgId: effectiveOrg?.organizationId || null,
    isSuperAdminNoImpersonation
  };
}

/**
 * Check if a user can access content based on visibility settings.
 * 
 * Access rules:
 * 1. SuperAdmin without impersonation can access everything
 * 2. Public content (visibility='public') is accessible to all authenticated users
 * 3. Org-only content requires matching effectiveOrgId
 * 
 * @param contentOrgId - The organization ID that owns the content
 * @param contentVisibility - The visibility setting ('public' or 'org_only')
 * @param context - VisibilityContext from getVisibilityContext()
 * @returns boolean - true if user can access the content
 */
export function canAccessContent(
  contentOrgId: string,
  contentVisibility: ContentVisibility,
  context: VisibilityContext
): boolean {
  // SuperAdmin without impersonation can access everything
  if (context.isSuperAdminNoImpersonation) return true;
  
  // Public content is accessible to all authenticated users
  if (contentVisibility === 'public') return true;
  
  // Org-only content requires matching org
  return contentOrgId === context.effectiveOrgId;
}

/**
 * Build visibility filter info for query builders.
 * Returns null for SuperAdmin (no filter needed) or filter config for SQL.
 * 
 * Usage in Drizzle queries:
 * ```typescript
 * const filter = buildVisibilityFilter(context);
 * if (filter) {
 *   // Apply: visibility = 'public' OR organizationId = effectiveOrgId
 *   conditions.push(
 *     or(
 *       eq(courses.visibility, 'public'),
 *       filter.effectiveOrgId ? eq(courses.organizationId, filter.effectiveOrgId) : sql`FALSE`
 *     )
 *   );
 * }
 * // If filter is null (SuperAdmin), no visibility filter needed
 * ```
 * 
 * @param context - VisibilityContext from getVisibilityContext()
 * @returns Filter config or null if no filter needed
 */
export function buildVisibilityFilter(context: VisibilityContext): {
  publicOrOwnOrg: boolean;
  effectiveOrgId: string | null;
} | null {
  // SuperAdmin without impersonation: no filter needed
  if (context.isSuperAdminNoImpersonation) {
    return null;
  }
  
  // Return filter config for: visibility = 'public' OR organizationId = effectiveOrgId
  return {
    publicOrOwnOrg: true,
    effectiveOrgId: context.effectiveOrgId
  };
}

/**
 * Build SQL condition for visibility-aware queries.
 * Convenience method that returns a ready-to-use Drizzle SQL condition.
 * 
 * Org-type enforcement:
 * - Public courses are only shown from elearning orgs
 * - Courses from business/education orgs are excluded from public listings
 *   (they can only be org_only visibility)
 * 
 * @param context - VisibilityContext from getVisibilityContext()
 * @returns SQL condition or undefined if no filter needed
 */
export function buildVisibilitySqlCondition(context: VisibilityContext): SQL | undefined {
  const filter = buildVisibilityFilter(context);
  
  if (!filter) {
    // No filter needed (SuperAdmin)
    return undefined;
  }
  
  // Subquery to get org IDs that can show public courses (only elearning type)
  // Business/education orgs cannot have public courses in listings
  const publicCourseCondition = and(
    eq(courses.visibility, 'public'),
    sql`${courses.organizationId} IN (
      SELECT id FROM organizations WHERE type = 'elearning'
    )`
  );
  
  // Build: (visibility = 'public' AND org is elearning) OR organizationId = effectiveOrgId
  if (filter.effectiveOrgId) {
    return or(
      publicCourseCondition,
      eq(courses.organizationId, filter.effectiveOrgId)
    );
  }
  
  // No org context: only show public content from elearning orgs
  return publicCourseCondition;
}

export class CourseVisibilityService {
  /**
   * Check if course visibility enforcement is enabled.
   * When disabled, all visibility checks are bypassed.
   */
  static isEnabled(): boolean {
    return isCourseVisibilityEnabled();
  }

  /**
   * Determine if a user can access a specific course based on:
   * - Course visibility (public vs org_only)
   * - User's organization membership
   * - Purchase status
   * - SuperAdmin status
   * 
   * When COURSE_VISIBILITY_ENABLED=false:
   * - All authenticated users can access all courses (legacy behavior)
   * - SuperAdmin and owner checks still apply
   * - Returns visibility as 'public' for consistency
   */
  static async checkCourseAccess(
    courseId: string,
    userId: string | null,
    sessionContext: SessionContext | null
  ): Promise<CourseAccessResult> {
    const course = await db.query.courses.findFirst({
      where: eq(courses.id, courseId),
      with: {
        organization: true,
      },
    });

    if (!course) {
      return {
        hasAccess: false,
        accessReason: 'none',
        visibility: 'org_only',
        courseOrgId: null,
        courseOrgType: null,
      };
    }

    const visibility = (course.visibility || 'org_only') as CourseVisibility;
    const courseOrgId = course.organizationId;
    const courseOrgType = course.organization?.type as 'education' | 'business' | 'elearning' | null;

    // Feature flag check: when disabled, bypass all visibility checks
    // This provides legacy behavior where all authenticated users can access all courses
    if (!isCourseVisibilityEnabled()) {
      // SuperAdmin still has special access
      if (sessionContext?.effectiveRole === 'SuperAdmin') {
        return {
          hasAccess: true,
          accessReason: 'superadmin',
          visibility: 'public', // Report as public when flag disabled
          courseOrgId,
          courseOrgType,
        };
      }

      // Owner check still applies
      if (userId && course.createdBy === userId) {
        return {
          hasAccess: true,
          accessReason: 'owner',
          visibility: 'public',
          courseOrgId,
          courseOrgType,
        };
      }

      // When flag is disabled, grant access to all authenticated users (legacy behavior)
      // Unauthenticated users still need public access
      if (userId) {
        return {
          hasAccess: true,
          accessReason: 'org_member', // Treat as org member for consistency
          visibility: 'public',
          courseOrgId,
          courseOrgType,
        };
      }

      // Unauthenticated users: check if free course
      const priceValue = course.price ? parseFloat(course.price) : 0;
      if (priceValue === 0) {
        return {
          hasAccess: true,
          accessReason: 'public_free',
          visibility: 'public',
          courseOrgId,
          courseOrgType,
        };
      }

      return {
        hasAccess: false,
        accessReason: 'none',
        visibility: 'public',
        courseOrgId,
        courseOrgType,
      };
    }

    // ========================================================================
    // VISIBILITY ENFORCEMENT ENABLED - Full access control logic below
    // ========================================================================

    // SuperAdmin has access to everything
    if (sessionContext?.effectiveRole === 'SuperAdmin') {
      return {
        hasAccess: true,
        accessReason: 'superadmin',
        visibility,
        courseOrgId,
        courseOrgType,
      };
    }

    // Check if user is the course creator/owner
    if (userId && course.createdBy === userId) {
      return {
        hasAccess: true,
        accessReason: 'owner',
        visibility,
        courseOrgId,
        courseOrgType,
      };
    }

    // Check organization membership for org_only courses
    if (visibility === 'org_only') {
      if (!userId) {
        return {
          hasAccess: false,
          accessReason: 'none',
          visibility,
          courseOrgId,
          courseOrgType,
        };
      }

      // Step 1: Check organization membership via comprehensive resolver
      // This checks: session context → userOrganizationRoles → userLicenses
      const isMember = await this.checkOrgMembership(userId, courseOrgId, sessionContext);
      if (isMember) {
        return {
          hasAccess: true,
          accessReason: 'org_member',
          visibility,
          courseOrgId,
          courseOrgType,
        };
      }

      // Step 2: Check enrollment records (coursePurchases or userCourseEnrollments)
      // This handles users who enrolled while they were org members but may have since left.
      // The enrollment check is protected at enrollment time via canUserEnrollInCourse,
      // which requires org membership. This design allows users to keep access to courses
      // they enrolled in while they were members, even if they later leave the org.
      const hasEnrollment = await this.hasEnrollmentRecord(userId, courseId);
      if (hasEnrollment) {
        return {
          hasAccess: true,
          accessReason: 'purchased',
          visibility,
          courseOrgId,
          courseOrgType,
        };
      }

      // User has no membership or enrollment - no access
      return {
        hasAccess: false,
        accessReason: 'none',
        visibility,
        courseOrgId,
        courseOrgType,
      };
    }

    // For public courses, check if purchased or free
    if (visibility === 'public') {
      // Free public courses are accessible to everyone
      // Note: price is a decimal field stored as string in DB
      const priceValue = course.price ? parseFloat(course.price) : 0;
      if (priceValue === 0) {
        return {
          hasAccess: true,
          accessReason: 'public_free',
          visibility,
          courseOrgId,
          courseOrgType,
        };
      }

      // Paid public courses require purchase - org membership does NOT grant free access
      if (userId) {
        // Check purchase status first - paid courses must be purchased by everyone
        const purchase = await db.query.coursePurchases.findFirst({
          where: and(
            eq(coursePurchases.userId, userId),
            eq(coursePurchases.courseId, courseId),
            eq(coursePurchases.status, 'completed')
          ),
        });

        if (purchase) {
          return {
            hasAccess: true,
            accessReason: 'purchased',
            visibility,
            courseOrgId,
            courseOrgType,
          };
        }

        // Check enrollment records (e.g. from course assignments that grant access)
        const enrollment = await db.query.userCourseEnrollments.findFirst({
          where: and(
            eq(userCourseEnrollments.userId, userId),
            eq(userCourseEnrollments.courseId, courseId)
          ),
        });

        if (enrollment) {
          return {
            hasAccess: true,
            accessReason: 'purchased',
            visibility,
            courseOrgId,
            courseOrgType,
          };
        }
      }

      // Public course but not purchased - no content access (can still browse details)
      return {
        hasAccess: false,
        accessReason: 'none',
        visibility,
        courseOrgId,
        courseOrgType,
      };
    }

    return {
      hasAccess: false,
      accessReason: 'none',
      visibility,
      courseOrgId,
      courseOrgType,
    };
  }

  /**
   * Check organization membership without session context (database lookup)
   */
  static async isUserOrgMember(userId: string, organizationId: string): Promise<boolean> {
    const membership = await db.query.userOrganizationRoles.findFirst({
      where: and(
        eq(userOrganizationRoles.userId, userId),
        eq(userOrganizationRoles.organizationId, organizationId)
      ),
    });

    return !!membership;
  }

  /**
   * Comprehensive organization membership check using multiple data sources.
   * This resolves membership via:
   * 1. Session context (fast path)
   * 2. userOrganizationRoles table (database fallback)
   * 3. userLicenses table (for license-enabled organizations)
   * 
   * Used by both canUserEnrollInCourse and checkCourseAccess for consistency.
   */
  static async checkOrgMembership(
    userId: string,
    organizationId: string,
    sessionContext: SessionContext | null
  ): Promise<boolean> {
    // Step 1: Check via session context (fast path)
    if (sessionContext?.organizations) {
      const isMemberViaSession = sessionContext.organizations.some(
        org => org.orgId === organizationId
      );
      if (isMemberViaSession) {
        return true;
      }
    }

    // Step 2: Fallback to userOrganizationRoles table
    const orgRole = await db.query.userOrganizationRoles.findFirst({
      where: and(
        eq(userOrganizationRoles.userId, userId),
        eq(userOrganizationRoles.organizationId, organizationId)
      ),
    });
    if (orgRole) {
      return true;
    }

    // Step 3: Fallback to userLicenses table (for license-enabled organizations)
    const activeLicense = await db.query.userLicenses.findFirst({
      where: and(
        eq(userLicenses.userId, userId),
        eq(userLicenses.organizationId, organizationId),
        eq(userLicenses.status, 'active')
      ),
    });
    if (activeLicense) {
      return true;
    }

    return false;
  }

  /**
   * Check if user has an enrollment record (coursePurchases or userCourseEnrollments).
   * Used for content access verification independent of payment status.
   */
  static async hasEnrollmentRecord(userId: string, courseId: string): Promise<boolean> {
    // Check coursePurchases table (primary - used by PurchaseService)
    const purchase = await db.query.coursePurchases.findFirst({
      where: and(
        eq(coursePurchases.userId, userId),
        eq(coursePurchases.courseId, courseId)
      ),
    });
    if (purchase) {
      return true;
    }

    // Check userCourseEnrollments table (fallback - used by PaymentOrchestratorService)
    const enrollment = await db.query.userCourseEnrollments.findFirst({
      where: and(
        eq(userCourseEnrollments.userId, userId),
        eq(userCourseEnrollments.courseId, courseId)
      ),
    });
    if (enrollment) {
      return true;
    }

    return false;
  }

  /**
   * Get visibility policy for an organization type
   * Determines what visibility options are available when creating/editing courses
   * 
   * This method delegates to the centralized orgTypePolicy helper for consistency.
   */
  static getVisibilityPolicy(orgType: 'education' | 'business' | 'elearning'): VisibilityPolicy {
    const policy = getOrgTypePolicy(orgType);
    return {
      canCreate: true,
      allowedVisibilities: policy.allowedVisibilities,
      defaultVisibility: policy.defaultVisibility,
      canChangeVisibility: policy.allowedVisibilities.length > 1,
    };
  }

  /**
   * Get visibility policy for an organization by ID
   * Looks up the organization type and returns the appropriate visibility policy
   * 
   * @param organizationId - The organization ID to look up
   * @returns VisibilityPolicy or null if organization not found
   */
  static async getVisibilityPolicyForOrg(organizationId: string): Promise<VisibilityPolicy | null> {
    const orgTypePolicy = await getOrgTypePolicyById(organizationId);
    
    if (!orgTypePolicy) {
      return null;
    }

    return {
      canCreate: true,
      allowedVisibilities: orgTypePolicy.allowedVisibilities,
      defaultVisibility: orgTypePolicy.defaultVisibility,
      canChangeVisibility: orgTypePolicy.allowedVisibilities.length > 1,
    };
  }

  /**
   * Validate if a visibility setting is allowed for an organization
   */
  static isVisibilityAllowed(
    visibility: CourseVisibility,
    orgType: 'education' | 'business' | 'elearning'
  ): boolean {
    const policy = this.getVisibilityPolicy(orgType);
    return policy.allowedVisibilities.includes(visibility);
  }

  /**
   * Get default visibility for a new course based on organization type
   */
  static getDefaultVisibility(orgType: 'education' | 'business' | 'elearning'): CourseVisibility {
    const policy = this.getVisibilityPolicy(orgType);
    return policy.defaultVisibility;
  }

  /**
   * Check if a course can be purchased (only public courses can be purchased)
   * 
   * When COURSE_VISIBILITY_ENABLED=false:
   * - All courses can be purchased (visibility is ignored)
   * - This allows legacy behavior where visibility doesn't affect purchase flow
   */
  static canPurchase(visibility: CourseVisibility): boolean {
    // When flag is disabled, all courses can be purchased (legacy behavior)
    if (!isCourseVisibilityEnabled()) {
      return true;
    }
    return visibility === 'public';
  }

  /**
   * Check if a course should appear in the public marketplace
   * 
   * When COURSE_VISIBILITY_ENABLED=false:
   * - All active courses are marketplace visible (visibility is ignored)
   * - This allows legacy behavior where visibility doesn't affect marketplace
   */
  static isMarketplaceVisible(visibility: CourseVisibility, status: string): boolean {
    // When flag is disabled, all active courses are visible (ignore visibility)
    if (!isCourseVisibilityEnabled()) {
      return status === 'active';
    }
    return visibility === 'public' && status === 'active';
  }

  /**
   * Filter courses for marketplace browsing (only public active courses)
   * 
   * When COURSE_VISIBILITY_ENABLED=false:
   * - Returns only the active status filter (no visibility filter)
   * - All active courses appear in marketplace (legacy behavior)
   */
  static getMarketplaceFilter() {
    // When flag is disabled, show all active courses (ignore visibility)
    if (!isCourseVisibilityEnabled()) {
      return eq(courses.status, 'active');
    }
    return and(
      eq(courses.visibility, 'public'),
      eq(courses.status, 'active')
    );
  }

  /**
   * Build filter for "My Courses" - courses user has content access to
   * This matches the access rules in `checkCourseAccess`:
   * - SuperAdmin: all courses (returns undefined for no filter)
   * - Owner: courses user created
   * - Org member: courses from user's organizations
   * - Purchased: public courses user has bought
   * - Free public: courses with price = 0
   * 
   * Does NOT include paid public courses user hasn't purchased
   * 
   * When COURSE_VISIBILITY_ENABLED=false:
   * - Returns undefined (no filter) to show all courses (legacy behavior)
   * - Visibility is ignored, all courses are accessible to authenticated users
   */
  static async buildMyCoursesFilter(
    userId: string,
    sessionContext: SessionContext | null
  ): Promise<SQL | undefined> {
    // When flag is disabled, no visibility filter needed (show all courses)
    if (!isCourseVisibilityEnabled()) {
      return undefined;
    }

    // SuperAdmin has access to all courses - return undefined (no filter)
    if (sessionContext?.effectiveRole === 'SuperAdmin') {
      return undefined;
    }

    const conditions: SQL[] = [];

    // Courses user created (owner access)
    conditions.push(eq(courses.createdBy, userId));

    // Courses from organizations user belongs to (member access)
    const userOrgIds = sessionContext?.organizations.map(org => org.orgId) || [];
    if (userOrgIds.length > 0) {
      conditions.push(inArray(courses.organizationId, userOrgIds));
    }

    // Purchased courses - PURCHASER ACCESS OVERRIDE
    // Users who paid for a course retain access regardless of status/visibility changes
    // This protects buyer rights when course is set to inactive, archived, or visibility changed
    const purchases = await db.query.coursePurchases.findMany({
      where: eq(coursePurchases.userId, userId),
      columns: { courseId: true },
    });
    const purchasedCourseIds = purchases.map(p => p.courseId);
    if (purchasedCourseIds.length > 0) {
      // Include ALL purchased courses regardless of visibility or status
      conditions.push(inArray(courses.id, purchasedCourseIds));
    }

    // Free public courses - price is null or zero (matches parseFloat(price) || 0 === 0 in checkCourseAccess)
    // Use SQL CAST for proper numeric comparison
    conditions.push(
      and(
        eq(courses.visibility, 'public'),
        or(
          isNull(courses.price),
          sql`CAST(${courses.price} AS DECIMAL) = 0`
        )
      )!
    );

    return or(...conditions);
  }

  /**
   * Build filter for marketplace browsing (discovery)
   * Shows all public active courses regardless of purchase status
   * Users can browse course details but cannot access content without purchase
   * 
   * When COURSE_VISIBILITY_ENABLED=false:
   * - Returns only the active status filter (no visibility filter)
   * - All active courses appear in marketplace (legacy behavior)
   */
  static buildMarketplaceBrowsingFilter(): SQL {
    // When flag is disabled, show all active courses (ignore visibility)
    if (!isCourseVisibilityEnabled()) {
      return eq(courses.status, 'active');
    }
    return and(
      eq(courses.visibility, 'public'),
      eq(courses.status, 'active')
    )!;
  }

  /**
   * Build filter for org-internal course browsing
   * Shows org_only courses for organization members
   */
  static buildOrgCoursesFilter(
    sessionContext: SessionContext | null
  ): SQL | undefined {
    const userOrgIds = sessionContext?.organizations.map(org => org.orgId) || [];
    if (userOrgIds.length === 0) {
      return undefined;
    }
    return inArray(courses.organizationId, userOrgIds);
  }

  /**
   * Build combined filter for all courses a user can see (browsing + owned + org)
   * Use for general course listing that includes both marketplace and org courses
   * 
   * When COURSE_VISIBILITY_ENABLED=false:
   * - Returns undefined (no filter) to show all courses
   * - Visibility is ignored, all courses are accessible (legacy behavior)
   */
  static buildAllVisibleCoursesFilter(
    userId: string | null,
    sessionContext: SessionContext | null
  ): SQL | undefined {
    // When flag is disabled, no visibility filter needed (show all courses)
    if (!isCourseVisibilityEnabled()) {
      return undefined;
    }

    const conditions: SQL[] = [];

    // Public active courses are visible to everyone for browsing
    const publicFilter = and(
      eq(courses.visibility, 'public'),
      eq(courses.status, 'active')
    );
    if (publicFilter) {
      conditions.push(publicFilter);
    }

    // For authenticated users, add owned and org courses
    if (userId) {
      conditions.push(eq(courses.createdBy, userId));

      const userOrgIds = sessionContext?.organizations.map(org => org.orgId) || [];
      if (userOrgIds.length > 0) {
        conditions.push(inArray(courses.organizationId, userOrgIds));
      }
    }

    if (conditions.length === 0) {
      return undefined;
    }

    return conditions.length === 1 ? conditions[0] : or(...conditions);
  }

  /**
   * Get user's purchased course IDs for filtering
   */
  static async getUserPurchasedCourseIds(userId: string): Promise<string[]> {
    const purchases = await db.query.coursePurchases.findMany({
      where: eq(coursePurchases.userId, userId),
      columns: { courseId: true },
    });
    return purchases.map(p => p.courseId);
  }

  /**
   * Check if user has full content access to a course (vs just browsing)
   * Content access = can view lessons, download materials, etc.
   */
  static async hasContentAccess(
    courseId: string,
    userId: string | null,
    sessionContext: SessionContext | null
  ): Promise<boolean> {
    const access = await this.checkCourseAccess(courseId, userId, sessionContext);
    
    // Full content access: owner, org member, purchased, superadmin, or free public
    return access.hasAccess && access.accessReason !== 'none';
  }

  /**
   * Handle organization type transitions that affect course visibility.
   * When an org changes from 'elearning' to 'education' or 'business':
   * - All public courses must be migrated to org_only
   * - Education/business orgs cannot have public marketplace courses
   * 
   * This method should be called BEFORE the org type is updated.
   * 
   * @param organizationId - The organization being updated
   * @param previousType - The current org type
   * @param newType - The target org type
   * @returns Result with count and IDs of migrated courses
   */
  static async handleOrgTypeTransition(
    organizationId: string,
    previousType: 'education' | 'business' | 'elearning',
    newType: 'education' | 'business' | 'elearning'
  ): Promise<OrgTypeTransitionResult> {
    const result: OrgTypeTransitionResult = {
      organizationId,
      previousType,
      newType,
      coursesUpdated: 0,
      courseIds: [],
      cacheInvalidation: {
        shouldInvalidate: false,
        queryKeysToInvalidate: [],
        reason: '',
      },
    };

    // Only migrate if transitioning FROM elearning TO education/business
    // elearning orgs can have public courses; education/business cannot
    if (previousType === 'elearning' && (newType === 'education' || newType === 'business')) {
      // Find all public courses for this organization
      const publicCourses = await db.query.courses.findMany({
        where: and(
          eq(courses.organizationId, organizationId),
          eq(courses.visibility, 'public')
        ),
        columns: { id: true, title: true },
      });

      if (publicCourses.length > 0) {
        const courseIds = publicCourses.map(c => c.id);

        // Update all public courses to org_only
        await db.update(courses)
          .set({
            visibility: 'org_only',
            updatedAt: new Date(),
          })
          .where(inArray(courses.id, courseIds));

        result.coursesUpdated = courseIds.length;
        result.courseIds = courseIds;

        // Set cache invalidation hints for frontend
        result.cacheInvalidation = {
          shouldInvalidate: true,
          queryKeysToInvalidate: [
            '/api/courses',
            '/api/courses/browse',
            '/api/courses/marketplace',
            '/api/courses/public',
            ...courseIds.map(id => `/api/courses/${id}`),
          ],
          reason: `Migrated ${courseIds.length} public courses to org_only visibility`,
        };

        console.log(
          `[OrgTypeTransition] Migrated ${courseIds.length} public courses to org_only ` +
          `for org ${organizationId} (${previousType} → ${newType})`
        );
      }
    }

    // Transitioning to elearning doesn't auto-change visibility
    // Courses stay org_only; admins can manually make them public if desired
    if ((previousType === 'education' || previousType === 'business') && newType === 'elearning') {
      console.log(
        `[OrgTypeTransition] Org ${organizationId} transitioning to elearning. ` +
        `Existing courses remain org_only; admins can make them public manually.`
      );
    }

    return result;
  }

  /**
   * Check if an org type transition would affect course visibility
   * Use this for showing warnings before confirming the transition
   */
  static async previewOrgTypeTransition(
    organizationId: string,
    previousType: 'education' | 'business' | 'elearning',
    newType: 'education' | 'business' | 'elearning'
  ): Promise<{ wouldMigrate: boolean; courseCount: number; courseIds: string[] }> {
    if (previousType === 'elearning' && (newType === 'education' || newType === 'business')) {
      const publicCourses = await db.query.courses.findMany({
        where: and(
          eq(courses.organizationId, organizationId),
          eq(courses.visibility, 'public')
        ),
        columns: { id: true },
      });

      return {
        wouldMigrate: publicCourses.length > 0,
        courseCount: publicCourses.length,
        courseIds: publicCourses.map(c => c.id),
      };
    }

    return { wouldMigrate: false, courseCount: 0, courseIds: [] };
  }

  /**
   * Determine visibility for a cloned course based on target organization type.
   * 
   * Rules:
   * 1. If cloning to same org: preserve original visibility if allowed, else use default
   * 2. If cloning to different org:
   *    - If target is elearning: preserve visibility (both public and org_only allowed)
   *    - If target is education/business: force org_only (public not allowed)
   * 
   * @param originalVisibility - Visibility of the source course
   * @param targetOrgType - Type of the organization receiving the clone
   * @returns The appropriate visibility for the cloned course
   */
  static getClonedCourseVisibility(
    originalVisibility: CourseVisibility,
    targetOrgType: 'education' | 'business' | 'elearning'
  ): CourseVisibility {
    const policy = this.getVisibilityPolicy(targetOrgType);

    // If original visibility is allowed in target org, preserve it
    if (policy.allowedVisibilities.includes(originalVisibility)) {
      return originalVisibility;
    }

    // Otherwise, use the default for the target org type
    return policy.defaultVisibility;
  }

  /**
   * ============================================================================
   * CACHE FLUSH UTILITY
   * ============================================================================
   * 
   * Flushes all course-related caches. Use during emergency rollback or after
   * bulk visibility changes.
   * 
   * Usage:
   *   import { CourseVisibilityService } from './services/courseVisibilityService';
   *   const result = CourseVisibilityService.flushAllCaches();
   *   console.log(result.message);
   * 
   * This is a utility method that logs cache invalidation hints for frontend
   * TanStack Query caches. The actual cache invalidation should be triggered
   * by the frontend via queryClient.invalidateQueries().
   * 
   * For server-side caches (if any are added in the future), this method
   * will also handle clearing them.
   */
  static flushAllCaches(): {
    success: boolean;
    message: string;
    queryKeysToInvalidate: string[];
    timestamp: Date;
  } {
    const queryKeysToInvalidate = [
      '/api/courses',
      '/api/courses/browse',
      '/api/courses/marketplace',
      '/api/courses/public',
      '/api/courses/my',
      '/api/courses/org',
      '/api/feature-flags',
    ];

    const timestamp = new Date();

    console.log('[CourseVisibility] Cache flush triggered');
    console.log('[CourseVisibility] Feature flag status:', isCourseVisibilityEnabled() ? 'ENABLED' : 'DISABLED');
    console.log('[CourseVisibility] Query keys to invalidate on frontend:');
    queryKeysToInvalidate.forEach(key => console.log(`  - ${key}`));
    console.log('[CourseVisibility] Flush timestamp:', timestamp.toISOString());

    return {
      success: true,
      message: `Cache flush completed. ${queryKeysToInvalidate.length} query keys should be invalidated on the frontend.`,
      queryKeysToInvalidate,
      timestamp,
    };
  }

  /**
   * Get feature flag status and cache information for debugging.
   * Useful for admin dashboards or health checks.
   */
  static getSystemStatus(): {
    visibilityEnabled: boolean;
    flagSource: string;
    cacheHints: string[];
    rollbackInstructions: string;
  } {
    return {
      visibilityEnabled: isCourseVisibilityEnabled(),
      flagSource: 'COURSE_VISIBILITY_ENABLED environment variable (default: true)',
      cacheHints: [
        'Frontend: queryClient.invalidateQueries({ queryKey: ["/api/courses"] })',
        'Server: CourseVisibilityService.flushAllCaches()',
      ],
      rollbackInstructions: 
        'To disable visibility enforcement: Set COURSE_VISIBILITY_ENABLED=false and restart. ' +
        'See rollback documentation in courseVisibilityService.ts header comments.',
    };
  }

  /**
   * Check if a user can enroll/purchase a course based on visibility and org membership.
   * This is the centralized method for enrollment eligibility checks.
   * 
   * Access rules:
   * 1. When COURSE_VISIBILITY_ENABLED=false: all authenticated users can enroll (legacy)
   * 2. SuperAdmin: can enroll in any course
   * 3. Public courses: anyone can enroll
   * 4. Org-only courses: only organization members can enroll
   *    - Checked via session context (fast path)
   *    - Fallback to userOrganizationRoles table
   *    - Fallback to userLicenses table (for license-enabled orgs)
   * 
   * @param courseId - The course ID to check enrollment eligibility for
   * @param userId - The user ID attempting to enroll
   * @param sessionContext - Optional session context for fast org membership check
   * @returns Object with canEnroll flag and reason
   */
  static async canUserEnrollInCourse(
    courseId: string,
    userId: string,
    sessionContext: SessionContext | null
  ): Promise<{
    canEnroll: boolean;
    reason: 'allowed' | 'public_course' | 'org_member' | 'superadmin' | 'legacy_mode' | 'not_org_member' | 'course_not_found';
    courseOrgId?: string;
  }> {
    // Get course with organization details
    const course = await db.query.courses.findFirst({
      where: eq(courses.id, courseId),
      with: {
        organization: true,
      },
    });

    if (!course) {
      return { canEnroll: false, reason: 'course_not_found' };
    }

    const visibility = (course.visibility || 'org_only') as CourseVisibility;
    const courseOrgId = course.organizationId;

    // When feature flag is disabled, allow all authenticated users (legacy behavior)
    if (!isCourseVisibilityEnabled()) {
      return { canEnroll: true, reason: 'legacy_mode', courseOrgId };
    }

    // SuperAdmin can enroll in any course
    if (sessionContext?.effectiveRole === 'SuperAdmin') {
      return { canEnroll: true, reason: 'superadmin', courseOrgId };
    }

    // Public courses can be enrolled by anyone
    if (visibility === 'public') {
      return { canEnroll: true, reason: 'public_course', courseOrgId };
    }

    // Org-only courses: check organization membership using shared resolver
    // This checks: session context → userOrganizationRoles → userLicenses
    const isMember = await this.checkOrgMembership(userId, courseOrgId, sessionContext);
    if (isMember) {
      return { canEnroll: true, reason: 'org_member', courseOrgId };
    }

    // User is not a member of the course's organization
    return { canEnroll: false, reason: 'not_org_member', courseOrgId };
  }

  /**
   * Check if a user has an active license in an organization
   * Used as additional membership check for license-enabled orgs
   */
  static async hasActiveLicense(userId: string, organizationId: string): Promise<boolean> {
    const license = await db.query.userLicenses.findFirst({
      where: and(
        eq(userLicenses.userId, userId),
        eq(userLicenses.organizationId, organizationId),
        eq(userLicenses.status, 'active')
      ),
    });
    return !!license;
  }
}
