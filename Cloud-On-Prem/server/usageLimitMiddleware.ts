import { Request, Response, NextFunction } from 'express';
import { storage } from './storage';
import { seatPolicyService } from './services/seatPolicyService';
import { businessPackageService } from './services/businessPackageService';
import { resolveEffectiveOrganization, type RequestWithEffectiveOrg } from './middleware/sessionAuthMiddleware';

export interface UsageCheckResult {
  allowed: boolean;
  limitType?: 'quiz_creation' | 'ai_explanation' | 'concurrent_users' | 'trial_expired';
  message?: string;
  currentUsage?: number;
  limit?: number;
  isUnlimited?: boolean;
  trialExpired?: boolean;
}

interface PackageFeatureLimits {
  monthlyQuizCreations: number;
  monthlyAIExplanations: number;
  isUnlimited: boolean;
}

const DEFAULT_MONTHLY_QUIZ_LIMIT = 10;
const DEFAULT_MONTHLY_AI_EXPLANATION_LIMIT = 20;

async function getEffectiveOrgIdFromRequest(req: Request): Promise<string | null> {
  try {
    const effective = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
    const effectiveOrgId = String(effective.organizationId || '').trim();
    if (effectiveOrgId) {
      return effectiveOrgId;
    }
  } catch (error) {
    console.warn('[UsageLimitMiddleware] Failed to resolve effective org from session context:', error);
  }

  const userId = req.session?.userId;
  if (!userId) {
    return null;
  }

  const userRoles = await storage.getUserRoles(userId);
  if (userRoles.length === 0) {
    return null;
  }

  return userRoles[0].organizationId;
}

async function getOrganizationPackageLimits(organizationId: string): Promise<PackageFeatureLimits> {
  try {
    const effective = await businessPackageService.getEffectivePackageForOrg(organizationId);
    
    if (effective.source === 'default') {
      console.warn(`[UsageLimitMiddleware] No package or override found for org ${organizationId}, using defaults`);
      return {
        monthlyQuizCreations: DEFAULT_MONTHLY_QUIZ_LIMIT,
        monthlyAIExplanations: DEFAULT_MONTHLY_AI_EXPLANATION_LIMIT,
        isUnlimited: false,
      };
    }

    const monthlyCredits = effective.effectiveLimits.monthlyCredits;

    const monthlyQuizCreations = Math.max(10, Math.floor(monthlyCredits / 50));
    const monthlyAIExplanations = Math.max(20, Math.floor(monthlyCredits / 25));

    return {
      monthlyQuizCreations,
      monthlyAIExplanations,
      isUnlimited: false,
    };
  } catch (error) {
    console.error('[UsageLimitMiddleware] Error getting package limits:', error);
    return {
      monthlyQuizCreations: DEFAULT_MONTHLY_QUIZ_LIMIT,
      monthlyAIExplanations: DEFAULT_MONTHLY_AI_EXPLANATION_LIMIT,
      isUnlimited: false,
    };
  }
}

async function isOrgUnlimited(organizationId: string): Promise<boolean> {
  try {
    const trialStatus = await storage.checkTrialStatus(organizationId);
    if (trialStatus.isTrialActive) {
      return true;
    }

    const org = await storage.getOrganization(organizationId);
    if (org?.isDemo || org?.isGeneralOrg) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('[UsageLimitMiddleware] Error checking org unlimited status:', error);
    return false;
  }
}

export async function checkQuizCreationLimit(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return next();
    }

    const organizationId = await getEffectiveOrgIdFromRequest(req);
    if (!organizationId) {
      return next();
    }
    
    if (await isOrgUnlimited(organizationId)) {
      return next();
    }

    const packageLimits = await getOrganizationPackageLimits(organizationId);
    
    if (packageLimits.isUnlimited) {
      return next();
    }

    const usageLimits = await storage.getOrganizationUsageLimits(organizationId);
    const currentUsage = usageLimits?.dailyQuizCount ?? 0;
    const monthlyLimit = packageLimits.monthlyQuizCreations;

    if (currentUsage >= monthlyLimit) {
      return res.status(403).json({
        error: 'Quiz creation limit reached',
        limitType: 'quiz_creation',
        message: `Your organization has reached the monthly limit of ${monthlyLimit} quiz creation(s). Upgrade your package for more quiz creations.`,
        currentUsage,
        limit: monthlyLimit
      });
    }

    next();
  } catch (error) {
    console.error('Quiz creation limit check error:', error);
    next();
  }
}

export async function checkAIExplanationLimit(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return next();
    }

    const organizationId = await getEffectiveOrgIdFromRequest(req);
    if (!organizationId) {
      return next();
    }
    
    if (await isOrgUnlimited(organizationId)) {
      return next();
    }

    const packageLimits = await getOrganizationPackageLimits(organizationId);
    
    if (packageLimits.isUnlimited) {
      return next();
    }

    const usageLimits = await storage.getOrganizationUsageLimits(organizationId);
    const currentUsage = usageLimits?.aiExplanationCount ?? 0;
    const monthlyLimit = packageLimits.monthlyAIExplanations;

    if (currentUsage >= monthlyLimit) {
      return res.status(403).json({
        error: 'AI explanation limit reached',
        limitType: 'ai_explanation',
        message: `Your organization has reached the monthly limit of ${monthlyLimit} AI explanations. Upgrade your package for more AI explanations.`,
        currentUsage,
        limit: monthlyLimit
      });
    }

    next();
  } catch (error) {
    console.error('AI explanation limit check error:', error);
    next();
  }
}

export async function incrementQuizCreationCount(userId: string) {
  try {
    const userRoles = await storage.getUserRoles(userId);
    if (userRoles.length === 0) return;

    const organizationId = userRoles[0].organizationId;
    
    if (await isOrgUnlimited(organizationId)) {
      return;
    }
    
    await storage.incrementDailyQuizCount(organizationId);
  } catch (error) {
    console.error('Increment quiz count error:', error);
  }
}

export async function incrementAIExplanationCount(userId: string) {
  try {
    const userRoles = await storage.getUserRoles(userId);
    if (userRoles.length === 0) return;

    const organizationId = userRoles[0].organizationId;
    
    if (await isOrgUnlimited(organizationId)) {
      return;
    }
    
    await storage.incrementAIExplanationCount(organizationId);
  } catch (error) {
    console.error('Increment AI count error:', error);
  }
}

export async function checkConcurrentUserLimit(organizationId: string, userRole?: string): Promise<UsageCheckResult> {
  try {
    const loginCheck = await seatPolicyService.checkLoginAllowed(organizationId, userRole);
    
    if (loginCheck.allowed) {
      return { 
        allowed: true,
        isUnlimited: loginCheck.isUnlimited,
      };
    }

    const limits = await seatPolicyService.getEffectiveSeatLimits(organizationId);
    
    if (limits.reason === 'trial_expired') {
      return {
        allowed: false,
        limitType: 'trial_expired',
        message: 'Your organization\'s trial has expired. Please contact your administrator to subscribe.',
        trialExpired: true,
      };
    }

    return {
      allowed: false,
      limitType: 'concurrent_users',
      message: loginCheck.reason,
      currentUsage: loginCheck.currentCount,
      limit: loginCheck.maxAllowed,
    };
  } catch (error) {
    console.error('Concurrent user limit check error:', error);
    return { allowed: true, isUnlimited: true };
  }
}

export async function trackUserLogin(organizationId: string) {
  try {
    const usageLimits = await storage.getOrganizationUsageLimits(organizationId);
    if (usageLimits) {
      await storage.updateConcurrentUsers(organizationId, (usageLimits.concurrentUsers || 0) + 1);
    }
  } catch (error) {
    console.error('Track user login error:', error);
  }
}

export async function trackUserLogout(organizationId: string) {
  try {
    const usageLimits = await storage.getOrganizationUsageLimits(organizationId);
    if (usageLimits && usageLimits.concurrentUsers > 0) {
      await storage.updateConcurrentUsers(organizationId, usageLimits.concurrentUsers - 1);
    }
  } catch (error) {
    console.error('Track user logout error:', error);
  }
}

export async function resetMonthlyLimitsForAllOrgs() {
  try {
    const organizations = await storage.getAllOrganizations();
    
    const BATCH_SIZE = 3;
    let processedCount = 0;
    
    for (let i = 0; i < organizations.length; i += BATCH_SIZE) {
      const batch = organizations.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(org => storage.resetDailyLimits(org.id))
      );
      processedCount += batch.length;
    }
    
    console.log(`✅ Reset monthly limits for ${processedCount} organizations`);
  } catch (error) {
    console.error('Reset monthly limits error:', error);
    throw error;
  }
}

export async function resetDailyLimitsForAllOrgs() {
  return resetMonthlyLimitsForAllOrgs();
}
