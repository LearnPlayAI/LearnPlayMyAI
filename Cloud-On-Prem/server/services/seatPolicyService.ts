import { db } from '../db';
import { eq } from 'drizzle-orm';
import { organizations } from '@shared/schema';
import { businessPackageService } from './businessPackageService';

export interface EffectiveSeatLimits {
  isUnlimited: boolean;
  reason: 'trial_active' | 'demo_org' | 'subscribed' | 'no_subscription' | 'trial_expired' | 'general_org';
  canLogin: boolean;
  learners: { current: number; max: number; remaining: number };
  teachers: { current: number; max: number; remaining: number };
  orgAdmins: { current: number; max: number; remaining: number };
  message?: string;
}

export interface LoginCheckResult {
  allowed: boolean;
  reason: string;
  isUnlimited: boolean;
  currentCount?: number;
  maxAllowed?: number;
}

class SeatPolicyService {
  async getEffectiveSeatLimits(organizationId: string): Promise<EffectiveSeatLimits> {
    try {
      const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
      
      if (!org) {
        return {
          isUnlimited: false,
          reason: 'no_subscription',
          canLogin: false,
          learners: { current: 0, max: 0, remaining: 0 },
          teachers: { current: 0, max: 0, remaining: 0 },
          orgAdmins: { current: 0, max: 0, remaining: 0 },
          message: 'Organization not found',
        };
      }

      const userCounts = await businessPackageService.getOrganizationUserCounts(organizationId);

      if (org.isDemo || org.isGeneralOrg) {
        return {
          isUnlimited: true,
          reason: org.isGeneralOrg ? 'general_org' : 'demo_org',
          canLogin: true,
          learners: { current: userCounts.learners, max: 999999, remaining: 999999 },
          teachers: { current: userCounts.teachers, max: 999999, remaining: 999999 },
          orgAdmins: { current: userCounts.orgAdmins, max: 999999, remaining: 999999 },
          message: org.isGeneralOrg ? 'General organization - unlimited seats' : 'Demo organization - unlimited seats',
        };
      }

      const now = new Date();
      const trialEndDate = org.trialEndDate;
      const isTrialActive = trialEndDate && trialEndDate > now;

      if (isTrialActive) {
        return {
          isUnlimited: true,
          reason: 'trial_active',
          canLogin: true,
          learners: { current: userCounts.learners, max: 999999, remaining: 999999 },
          teachers: { current: userCounts.teachers, max: 999999, remaining: 999999 },
          orgAdmins: { current: userCounts.orgAdmins, max: 999999, remaining: 999999 },
          message: 'Trial period - unlimited seats',
        };
      }

      const effective = await businessPackageService.getEffectivePackageForOrg(organizationId);

      if (!effective.package && effective.source === 'default') {
        return {
          isUnlimited: false,
          reason: 'trial_expired',
          canLogin: false,
          learners: { current: userCounts.learners, max: 0, remaining: 0 },
          teachers: { current: userCounts.teachers, max: 0, remaining: 0 },
          orgAdmins: { current: userCounts.orgAdmins, max: 0, remaining: 0 },
          message: 'Trial expired - please subscribe to continue',
        };
      }

      return {
        isUnlimited: false,
        reason: 'subscribed',
        canLogin: true,
        learners: {
          current: userCounts.learners,
          max: effective.effectiveLimits.maxLearners,
          remaining: Math.max(0, effective.effectiveLimits.maxLearners - userCounts.learners),
        },
        teachers: {
          current: userCounts.teachers,
          max: effective.effectiveLimits.maxTeachers,
          remaining: Math.max(0, effective.effectiveLimits.maxTeachers - userCounts.teachers),
        },
        orgAdmins: {
          current: userCounts.orgAdmins,
          max: effective.effectiveLimits.maxOrgAdmins,
          remaining: Math.max(0, effective.effectiveLimits.maxOrgAdmins - userCounts.orgAdmins),
        },
        message: effective.override 
          ? `Custom package for ${org.name}`
          : `Subscribed to ${effective.package?.name || 'Unknown Package'}`,
      };
    } catch (error: any) {
      console.error('[SeatPolicyService] Error getting effective seat limits:', error.message);
      return {
        isUnlimited: true,
        reason: 'trial_active',
        canLogin: true,
        learners: { current: 0, max: 999999, remaining: 999999 },
        teachers: { current: 0, max: 999999, remaining: 999999 },
        orgAdmins: { current: 0, max: 999999, remaining: 999999 },
        message: 'Error checking limits - allowing access',
      };
    }
  }

  async checkLoginAllowed(organizationId: string, userRole?: string): Promise<LoginCheckResult> {
    try {
      const limits = await this.getEffectiveSeatLimits(organizationId);

      if (limits.isUnlimited) {
        return {
          allowed: true,
          reason: limits.message || 'Access granted',
          isUnlimited: true,
        };
      }

      if (!limits.canLogin) {
        return {
          allowed: false,
          reason: limits.reason === 'trial_expired' 
            ? 'Your organization\'s trial has expired. Please contact your administrator to subscribe.'
            : limits.message || 'Access denied',
          isUnlimited: false,
        };
      }

      if (userRole) {
        const normalizedRole = this.normalizeRole(userRole);
        let seatInfo: { current: number; max: number; remaining: number };
        let roleLabel: string;

        switch (normalizedRole) {
          case 'learner':
            seatInfo = limits.learners;
            roleLabel = 'learner';
            break;
          case 'teacher':
            seatInfo = limits.teachers;
            roleLabel = 'teacher';
            break;
          case 'org_admin':
            seatInfo = limits.orgAdmins;
            roleLabel = 'organization admin';
            break;
          default:
            return {
              allowed: true,
              reason: 'Subscription active',
              isUnlimited: false,
            };
        }

        if (seatInfo.current > seatInfo.max && seatInfo.max > 0) {
          return {
            allowed: false,
            reason: `${roleLabel.charAt(0).toUpperCase() + roleLabel.slice(1)} seat limit reached. Your organization has ${seatInfo.current} ${roleLabel}s but only ${seatInfo.max} ${roleLabel} seat(s) are included in your subscription.`,
            isUnlimited: false,
            currentCount: seatInfo.current,
            maxAllowed: seatInfo.max,
          };
        }
      }

      return {
        allowed: true,
        reason: 'Subscription active',
        isUnlimited: false,
      };
    } catch (error: any) {
      console.error('[SeatPolicyService] Error checking login:', error.message);
      return {
        allowed: true,
        reason: 'Error checking limits - allowing access',
        isUnlimited: true,
      };
    }
  }

  async canAddUser(organizationId: string, role: string): Promise<{
    canAdd: boolean;
    isUnlimited: boolean;
    currentCount: number;
    maxAllowed: number;
    message: string;
  }> {
    const limits = await this.getEffectiveSeatLimits(organizationId);

    if (limits.isUnlimited) {
      return {
        canAdd: true,
        isUnlimited: true,
        currentCount: 0,
        maxAllowed: 999999,
        message: limits.message || 'Unlimited seats available',
      };
    }

    const normalizedRole = this.normalizeRole(role);
    let seatInfo: { current: number; max: number; remaining: number };
    let roleLabel: string;

    switch (normalizedRole) {
      case 'learner':
        seatInfo = limits.learners;
        roleLabel = 'learner';
        break;
      case 'teacher':
        seatInfo = limits.teachers;
        roleLabel = 'teacher';
        break;
      case 'org_admin':
        seatInfo = limits.orgAdmins;
        roleLabel = 'organization admin';
        break;
      default:
        return {
          canAdd: false,
          isUnlimited: false,
          currentCount: 0,
          maxAllowed: 0,
          message: `Unknown role: ${role}`,
        };
    }

    const canAdd = seatInfo.remaining > 0;

    return {
      canAdd,
      isUnlimited: false,
      currentCount: seatInfo.current,
      maxAllowed: seatInfo.max,
      message: canAdd
        ? `Can add ${roleLabel}. ${seatInfo.remaining} seat(s) remaining.`
        : `Cannot add ${roleLabel}. All ${seatInfo.max} seat(s) are occupied.`,
    };
  }

  async getEffectiveMonthlyCredits(organizationId: string): Promise<number> {
    try {
      const effective = await businessPackageService.getEffectivePackageForOrg(organizationId);
      return effective.effectiveLimits.monthlyCredits;
    } catch (error: any) {
      console.error('[SeatPolicyService] Error getting effective monthly credits:', error.message);
      return 0;
    }
  }

  private normalizeRole(role: string): string {
    const roleMap: Record<string, string> = {
      'learner': 'learner',
      'student': 'learner',
      'teacher': 'teacher',
      'instructor': 'teacher',
      'org_admin': 'org_admin',
      'admin': 'org_admin',
      'team_lead': 'org_admin',
    };
    return roleMap[role.toLowerCase()] || role.toLowerCase();
  }
}

export const seatPolicyService = new SeatPolicyService();
