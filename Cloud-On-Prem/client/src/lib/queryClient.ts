import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Read body once to avoid "body stream already read" errors.
    const rawBody = await res.text();
    let errorData: any = null;
    if (rawBody && rawBody.trim() !== "") {
      try {
        errorData = JSON.parse(rawBody);
      } catch {
        throw new Error(`${res.status}: ${rawBody || res.statusText}`);
      }
    }
    if (!errorData || typeof errorData !== "object") {
      throw new Error(`${res.status}: ${rawBody || res.statusText}`);
    }
    
    // Create an error object that preserves ALL backend error fields
    const error: any = new Error(errorData.message || errorData.error || res.statusText);
    error.statusCode = res.status; // HTTP status code
    error.message = errorData.message || errorData.error || res.statusText;
    
    // Preserve all custom fields from backend error response
    // This ensures frontend can access errorType, suggestLogin, attemptsRemaining, etc.
    error.response = errorData;
    
    // Also spread all error data fields directly on error object for backward compatibility
    Object.keys(errorData).forEach(key => {
      if (key !== 'message' && key !== 'error') {
        error[key] = errorData[key];
      }
    });
    
    throw error;
  }
}

export async function apiRequest<T = any>(
  url: string,
  options?: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
  }
): Promise<T> {
  const res = await fetch(url, {
    method: options?.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    body: options?.body,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  
  // Safely handle empty or non-JSON responses
  const contentType = res.headers.get('content-type');
  const contentLength = res.headers.get('content-length');
  
  // Return null for empty responses (204 No Content or empty body)
  if (res.status === 204 || contentLength === '0') {
    return null as T;
  }
  
  // Only parse JSON if content-type indicates JSON
  if (contentType && contentType.includes('application/json')) {
    return res.json() as Promise<T>;
  }
  
  // For non-JSON responses, try to parse as JSON anyway (some servers don't set content-type)
  // but wrap in try-catch to avoid parse errors
  try {
    const text = await res.text();
    if (!text || text.trim() === '') {
      return null as T;
    }
    return JSON.parse(text) as T;
  } catch {
    // If parsing fails, return null rather than throwing
    return null as T;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";

/**
 * Build URL from queryKey, handling objects as query parameters
 * Objects in the queryKey are serialized to URL query params, strings are joined with "/"
 */
function buildUrlFromQueryKey(queryKey: readonly unknown[]): string {
  const pathParts: string[] = [];
  let queryParams: Record<string, string> = {};
  
  for (const part of queryKey) {
    if (typeof part === 'object' && part !== null && !Array.isArray(part)) {
      // Serialize object to query params, filtering out undefined/null/'all' values
      for (const [key, value] of Object.entries(part)) {
        if (value !== undefined && value !== null && value !== '' && value !== 'all') {
          queryParams[key] = String(value);
        }
      }
    } else if (part !== undefined && part !== null) {
      pathParts.push(String(part));
    }
  }
  
  const basePath = pathParts.join('/');
  const queryString = Object.keys(queryParams).length > 0 
    ? '?' + new URLSearchParams(queryParams).toString()
    : '';
  
  return basePath + queryString;
}

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = buildUrlFromQueryKey(queryKey);
    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnMount: 'always',
      refetchOnWindowFocus: false,
      staleTime: 0,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * Centralized cache invalidation for organization structure changes.
 * Department/unit/team mutations feed course publishing, course assignments,
 * learner reports, and hierarchy management, so keep all consumers coherent.
 */
export function invalidateOrgStructureCaches(options?: {
  organizationId?: string | null;
}) {
  const organizationId = options?.organizationId;

  if (organizationId) {
    queryClient.invalidateQueries({ queryKey: ['/api/organization/hierarchy', organizationId] });
    queryClient.invalidateQueries({ queryKey: ['/api/organization', organizationId, 'hierarchy'] });
    queryClient.invalidateQueries({ queryKey: ['/api/organization', organizationId], exact: false });
    queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'units'] });
    queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'sub-units'] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', organizationId, 'units'] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', organizationId, 'sub-units'] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', organizationId, 'courses'] });
  } else {
    queryClient.invalidateQueries({ queryKey: ['/api/organization/hierarchy'], exact: false });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'], exact: false });
    queryClient.invalidateQueries({ queryKey: ['/api/organizations'], exact: false });
  }

  queryClient.invalidateQueries({ queryKey: ['/api/organization/units'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/organization/sub-units'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/organization/teams'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/reports/learner-analytics'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/course-assignments'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/courses'], exact: false });
}

/**
 * Centralized cache invalidation for wallet/LP Credit queries only
 * Call this after any credit operation (purchase, deduction, refund, adjustment)
 */
export function invalidateWalletCaches() {
  queryClient.invalidateQueries({ queryKey: ['/api/wallet/balance'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/wallet/transactions'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/org-wallet'], exact: false });
}

/**
 * Centralized cache invalidation for all purchase-related queries
 * Call this after any successful purchase to ensure UI reflects latest data
 */
export function invalidatePurchaseCaches() {
  invalidateWalletCaches();
  queryClient.invalidateQueries({ queryKey: ['/api/invoices'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/purchases'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/credit-packages'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/gamification/dashboard'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/user-status'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/user/roles'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/courses'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/my-courses'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/learner/subscriptions'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/licenses'], exact: false });
}

/**
 * Centralized cache invalidation for all lesson-related queries
 * Call this after any lesson operation (create, update, delete, archive, regenerate, etc.)
 * 
 * @param options - Configuration for which caches to invalidate
 * @param options.lessonId - Specific lesson ID to invalidate
 * @param options.courseId - Course ID to invalidate course-related lesson caches
 * @param options.includeQuizLobby - Whether to invalidate quiz collection caches
 * @param options.includeDashboard - Whether to invalidate dashboard caches
 */
export function invalidateLessonCaches(options?: {
  lessonId?: string;
  courseId?: string;
  includeQuizLobby?: boolean;
  includeDashboard?: boolean;
}) {
  // Invalidate lesson-specific caches
  if (options?.lessonId) {
    queryClient.invalidateQueries({ queryKey: ['/api/lessons', options.lessonId] });
    // Invalidate presentation versions cache (uses URL-style query key)
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.includes(`/api/lessons/${options.lessonId}/presentation-versions`);
      }
    });
    // Invalidate lesson versions cache
    queryClient.invalidateQueries({ queryKey: ['/api/lessons', options.lessonId, 'versions'] });
  }
  
  // Invalidate course-related caches for a specific course
  if (options?.courseId) {
    queryClient.invalidateQueries({ queryKey: ['/api/courses', options.courseId] });
    queryClient.invalidateQueries({ queryKey: ['/api/courses', options.courseId, 'lessons'] });
    queryClient.invalidateQueries({ queryKey: ['/api/courses', options.courseId, 'framework'] });
    queryClient.invalidateQueries({ queryKey: ['/api/courses', options.courseId, 'lesson-details'] });
    queryClient.invalidateQueries({ queryKey: ['/api/courses', options.courseId, 'relinkable-lessons'] });
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        return Array.isArray(key) && key[0] === `/api/courses/${options.courseId}`;
      },
    });
  }
  
  // Invalidate general lesson queries (with partial matching for filtered queries)
  queryClient.invalidateQueries({ queryKey: ['/api/lessons'], exact: false });
  
  // Always invalidate ALL course lesson-details queries across all courses
  // This ensures that when a lesson status changes, any page showing that lesson will refresh
  // Uses predicate to match any query key containing 'lesson-details'
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      return Array.isArray(key) && 
             key.length >= 3 && 
             key[0] === '/api/courses' && 
             key[2] === 'lesson-details';
    }
  });
  
  // Optionally invalidate quiz lobby
  if (options?.includeQuizLobby) {
    queryClient.invalidateQueries({ queryKey: ['/api/quiz-collections'], exact: false });
  }
  
  // Optionally invalidate dashboard
  if (options?.includeDashboard) {
    queryClient.invalidateQueries({ queryKey: ['/api/dashboard'], exact: false });
  }
}

/**
 * Invalidate language-scoped content queries after language switches or translation mutations.
 * This prevents mixed-language stale UI across lesson viewer, digest/quiz/podcast, and course cards.
 */
export function invalidateLanguageAwareContentCaches(options?: {
  lessonId?: string;
  courseId?: string;
  languageCode?: string | null;
}) {
  invalidateLessonCaches({
    lessonId: options?.lessonId,
    courseId: options?.courseId,
    includeQuizLobby: true,
    includeDashboard: false,
  });

  // Language-sensitive course surfaces.
  queryClient.invalidateQueries({ queryKey: ["/api/courses"], exact: false });
  queryClient.invalidateQueries({ queryKey: ["/api/my-assigned-courses"], exact: false });
  queryClient.invalidateQueries({ queryKey: ["/api/public/courses"], exact: false });

  // Language-sensitive lesson/content surfaces.
  queryClient.invalidateQueries({ queryKey: ["/api/lessons"], exact: false });
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      if (!Array.isArray(key)) return false;
      return key.some((part) => typeof part === "string" && part.includes("podcast"))
        || key.some((part) => typeof part === "string" && part.includes("digest"))
        || key.some((part) => typeof part === "string" && part.includes("viewer"));
    },
  });

  // Any query key object carrying language code should be invalidated.
  if (options?.languageCode) {
    const normalized = String(options.languageCode).trim().toLowerCase();
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        if (!Array.isArray(key)) return false;
        return key.some((part) => {
          if (!part || typeof part !== "object" || Array.isArray(part)) return false;
          const value = (part as any).languageCode;
          return value && String(value).trim().toLowerCase() === normalized;
        });
      },
    });
  }
}

/**
 * Centralized cache invalidation for currency preference changes
 * Call this after user updates their currency preference to ensure all price displays refresh
 * Uses exact: false to catch nested query keys like ['/api/courses', id]
 * Uses refetchQueries for auth to force immediate update (staleTime: Infinity bypass)
 */
export function invalidateCurrencyPreferenceCaches() {
  // Auth query uses staleTime: Infinity, so we must refetch (not just invalidate)
  // to ensure currency preference updates immediately across all pages
  queryClient.refetchQueries({ queryKey: ['/api/auth/user'], type: 'active' });
  queryClient.invalidateQueries({ queryKey: ['/api/user/preferences'] });
  
  // Currency rates (most important - triggers recalculation)
  queryClient.invalidateQueries({ queryKey: ['/api/currency/rates'] });
  queryClient.invalidateQueries({ queryKey: ['/api/superadmin/currency/rates'] });
  
  // Course-related queries (includes course detail, purchase, marketplace)
  queryClient.invalidateQueries({ queryKey: ['/api/courses'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/my-courses'], exact: false });
  
  // Credit and billing queries
  queryClient.invalidateQueries({ queryKey: ['/api/credit-packages'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/subscription-plans'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/public/subscription-plans'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/billing'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/invoices'], exact: false });
  
  // Lesson credit queries
  queryClient.invalidateQueries({ queryKey: ['/api/public/lesson-credit-costs'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/admin/lesson-credits'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/admin/gamma/status'], exact: false });
  
  // License queries
  queryClient.invalidateQueries({ queryKey: ['/api/license'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/licenses'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/organization/license/tiers'], exact: false });
  
  // Marketplace and revenue queries
  queryClient.invalidateQueries({ queryKey: ['/api/marketplace'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-revenue'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-pricing'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/admin/revenue-analytics'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/admin/e-learning-revenue'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/admin/subscription-console'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/superadmin/analytics/dashboard'], exact: false });
  
  // Payout and refund queries
  queryClient.invalidateQueries({ queryKey: ['/api/payouts'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/refunds'], exact: false });
}

/**
 * Centralized cache invalidation for organization context changes
 * Call this after switching organizations (via OrgSwitcher or SuperAdmin impersonation)
 * Clears all org-scoped caches to ensure fresh data is loaded for the new organization
 */
export function invalidateOrgContextCaches() {
  // Auth and user context (must refetch due to staleTime: Infinity)
  queryClient.refetchQueries({ queryKey: ['/api/auth/user'], type: 'active' });
  queryClient.invalidateQueries({ queryKey: ['/api/admin/check'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/user/roles'], exact: false });
  
  // Trial status (org-scoped) - REQUIRED
  queryClient.invalidateQueries({ queryKey: ['/api/trial-status'], exact: false });
  
  // Credits (org-scoped) - REQUIRED
  queryClient.invalidateQueries({ queryKey: ['/api/credits'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/credit'], exact: false });
  
  // License and subscription caches (org-scoped)
  queryClient.invalidateQueries({ queryKey: ['/api/license'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/licenses'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/organization/license'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/learner/subscriptions'], exact: false });
  
  // Course and lesson caches (org-scoped content)
  queryClient.invalidateQueries({ queryKey: ['/api/courses'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/my-courses'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/lessons'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/quiz-collections'], exact: false });
  
  // Organization and admin context caches - REQUIRED
  queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/my-organization'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/organizations'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/organizations/current'], exact: false });
  
  // User management caches (org-scoped)
  queryClient.invalidateQueries({ queryKey: ['/api/users'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/admin/users'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/organization'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/organization/users'], exact: false });
  
  // Admin collections and content (org-scoped)
  queryClient.invalidateQueries({ queryKey: ['/api/admin/collections'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/admin/courses'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/admin/units'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/admin/subjects'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/admin/quiz-collections'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/admin/quiz-collections-all'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/organization/units'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/organization/sub-units'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/organization/unit-subjects'], exact: false });
  
  // Dashboard and analytics caches (org-scoped)
  queryClient.invalidateQueries({ queryKey: ['/api/dashboard'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/gamification/dashboard'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/admin/analytics'], exact: false });
  
  // Admin gamification caches (org-scoped)
  queryClient.invalidateQueries({ queryKey: ['/api/admin/gamification/challenges'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/admin/gamification/economy'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/admin/gamification/student-balances'], exact: false });
  
  // Lesson assignments and credits (org-scoped)
  queryClient.invalidateQueries({ queryKey: ['/api/admin/lesson-assignments'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/admin/lesson-credits'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/admin/lesson-credit-pricing-settings'], exact: false });
  
  // Billing and credits (org-scoped)
  queryClient.invalidateQueries({ queryKey: ['/api/wallet'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/org-wallet'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/admin/org-credits'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/billing'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/invoices'], exact: false });
  
  // Branding and theming (org-scoped)
  queryClient.invalidateQueries({ queryKey: ['/api/branding'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/admin/branding'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/theme'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/theme/resolved'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/domains'], exact: false });
  queryClient.refetchQueries({ queryKey: ['/api/theme/resolved'], type: 'active' });
  
  // SuperAdmin organization-scoped queries - REQUIRED
  queryClient.invalidateQueries({ queryKey: ['/api/superadmin/organizations'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/superadmin/metrics'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/superadmin/join-requests'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/superadmin/license-settings'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/superadmin/subscriptions'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/superadmin/payouts'], exact: false });
  queryClient.invalidateQueries({ queryKey: ['/api/superadmin/analytics'], exact: false });
  
  console.log('[QueryClient] Invalidated all org-scoped caches for organization switch');
}

/**
 * Refresh branding/theme-related caches after theme save/activate/reset flows.
 * This keeps live runtime theming in sync across current org context and platform context.
 */
export async function refreshBrandingCaches() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['/api/theme'], exact: false }),
    queryClient.invalidateQueries({ queryKey: ['/api/theme/resolved'], exact: false }),
    queryClient.invalidateQueries({ queryKey: ['/api/branding'], exact: false }),
    queryClient.invalidateQueries({ queryKey: ['/api/admin/branding'], exact: false }),
    queryClient.invalidateQueries({ queryKey: ['/api/domains'], exact: false }),
    queryClient.invalidateQueries({ queryKey: ['/api/auth/user'], exact: false }),
    queryClient.invalidateQueries({ queryKey: ['/api/user/roles'], exact: false }),
    queryClient.invalidateQueries({ queryKey: ['/api/organizations/current'], exact: false }),
    queryClient.invalidateQueries({ queryKey: ['/api/my-organization'], exact: false }),
  ]);

  await queryClient.refetchQueries({ queryKey: ['/api/theme/resolved'], type: 'all' });
  console.log('[QueryClient] Refreshed branding caches');
}

/**
 * Centralized cache invalidation for course scope/assignment changes
 * Call this after any course assignment operation (create, update, delete, reassign)
 * or when course department/unit/team scope changes in CourseEdit
 * 
 * @param options - Configuration for which caches to invalidate
 * @param options.organizationId - Organization ID to target specific org queries
 * @param options.courseId - Specific course ID to invalidate course-specific caches
 */
export function invalidateCourseScopeCaches(options?: {
  organizationId?: string;
  courseId?: string;
}) {
  // Invalidate org hierarchy course queries (used by OrgManagementHub)
  // This uses a predicate to match all hierarchy/courses queries for any scope
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      if (!Array.isArray(key)) return false;
      
      // Match: ['/api/organization', orgId, 'hierarchy', scopeType, scopeId, 'courses']
      if (key.length >= 3 && key[0] === '/api/organization' && key[2] === 'hierarchy') {
        // If organizationId provided, only invalidate for that org
        if (options?.organizationId && key[1] !== options.organizationId) {
          return false;
        }
        return true;
      }
      return false;
    }
  });
  
  // Invalidate course assignment queries
  queryClient.invalidateQueries({ queryKey: ['/api/course-assignments'], exact: false });
  
  // Invalidate specific course if provided
  if (options?.courseId) {
    queryClient.invalidateQueries({ queryKey: ['/api/course-assignments/course', options.courseId] });
    queryClient.invalidateQueries({ queryKey: ['/api/courses', options.courseId] });
  }
  
  // Invalidate general course queries
  queryClient.invalidateQueries({ queryKey: ['/api/courses'], exact: false });
  
  // Invalidate my-assigned-courses and my-courses queries (used by MyCourses page)
  queryClient.invalidateQueries({ queryKey: ['/api/my-assigned-courses'] });
  queryClient.invalidateQueries({ queryKey: ['/api/my-courses'], exact: false });
  
  // Invalidate organization search queries (includes course search)
  // Always invalidate all org search queries to ensure course search is fresh
  queryClient.invalidateQueries({ 
    predicate: (query) => {
      const key = query.queryKey;
      if (!Array.isArray(key)) return false;
      // Match: ['/api/organization', orgId, 'search', ...]
      if (key.length >= 3 && key[0] === '/api/organization' && key[2] === 'search') {
        if (options?.organizationId && key[1] !== options.organizationId) {
          return false;
        }
        return true;
      }
      return false;
    }
  });
  
  console.log('[QueryClient] Invalidated course scope caches', options);
}
