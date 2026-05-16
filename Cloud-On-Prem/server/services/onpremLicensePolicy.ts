import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../db';
import { users, userOrganizationRoles } from '@shared/schema';
import { getOnpremLicenseStatus, type OnpremSystemType } from './onpremLicenseStatus';

const LEARNER_ROLES = ['student', 'employee', 'learner'];
const INSTRUCTOR_ROLES = ['teacher', 'team_lead', 'instructor'];
const ORG_ADMIN_ROLES = ['org_admin'];

export class OnpremLicensePolicyError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 403) {
    super(message);
    this.name = 'OnpremLicensePolicyError';
    this.statusCode = statusCode;
  }
}

export interface OnpremRolePolicy {
  onpremMode: boolean;
  systemType: OnpremSystemType;
  hasValidLicense: boolean;
  maxOrganizations: number | null;
  maxPlatformSuperAdmins: number | null;
  maxCustSuperAdmins: number | null;
  maxOrgAdminsPerOrg: number | null;
  maxInstructorsPerOrg: number | null;
  maxLearnersPerOrg: number | null;
  learnerRolesAllowed: boolean;
}

interface EvaluateLearnerLoginAccessInput {
  onpremMode: boolean;
  systemType: OnpremSystemType;
  hasValidLicense: boolean;
  learnerRolesAllowed: boolean;
  hasLearnerRole: boolean;
  hasNonLearnerRole: boolean;
  isSuperAdmin: boolean;
  isCustSuper: boolean;
}

export interface OnpremLearnerLoginAccessDecision {
  allowed: boolean;
  errorMessage?: string;
}

export async function getOnpremRolePolicy(): Promise<OnpremRolePolicy> {
  if (process.env.ONPREM_MODE !== 'true') {
    return {
      onpremMode: false,
      systemType: 'production',
      hasValidLicense: false,
      maxOrganizations: null,
      maxPlatformSuperAdmins: null,
      maxCustSuperAdmins: null,
      maxOrgAdminsPerOrg: null,
      maxInstructorsPerOrg: null,
      maxLearnersPerOrg: null,
      learnerRolesAllowed: true,
    };
  }

  const ls = await getOnpremLicenseStatus();
  const systemType = ls.systemType || 'production';

  if (!ls.hasValidLicense) {
    return {
      onpremMode: true,
      systemType,
      hasValidLicense: false,
      maxOrganizations: 1,
      maxPlatformSuperAdmins: null,
      maxCustSuperAdmins: 1,
      maxOrgAdminsPerOrg: 2,
      maxInstructorsPerOrg: 2,
      maxLearnersPerOrg: 0,
      learnerRolesAllowed: false,
    };
  }

  if (systemType === 'development' || systemType === 'qa') {
    return {
      onpremMode: true,
      systemType,
      hasValidLicense: true,
      maxOrganizations: null,
      maxPlatformSuperAdmins: null,
      maxCustSuperAdmins: null,
      maxOrgAdminsPerOrg: null,
      maxInstructorsPerOrg: null,
      maxLearnersPerOrg: 0,
      learnerRolesAllowed: false,
    };
  }

  return {
    onpremMode: true,
    systemType: 'production',
    hasValidLicense: true,
    maxOrganizations: null,
    maxPlatformSuperAdmins: null,
    maxCustSuperAdmins: null,
    maxOrgAdminsPerOrg: null,
    maxInstructorsPerOrg: null,
    maxLearnersPerOrg: null,
    learnerRolesAllowed: true,
  };
}

export function evaluateOnpremLearnerLoginAccess(
  input: EvaluateLearnerLoginAccessInput,
): OnpremLearnerLoginAccessDecision {
  if (!input.onpremMode) {
    return { allowed: true };
  }

  if (input.isSuperAdmin || input.isCustSuper) {
    return { allowed: true };
  }

  if (!input.hasLearnerRole || input.hasNonLearnerRole) {
    return { allowed: true };
  }

  if (input.systemType === 'development' || input.systemType === 'qa') {
    return {
      allowed: false,
      errorMessage:
        `Learner login is disabled on on-prem ${input.systemType.toUpperCase()} systems. ` +
        'Learner users may only login on on-prem PRODUCTION systems.',
    };
  }

  if (!input.hasValidLicense || !input.learnerRolesAllowed) {
    return {
      allowed: false,
      errorMessage:
        'Learner login is disabled on unlicensed on-prem systems. Install and validate a production license to enable learner users.',
    };
  }

  return { allowed: true };
}

export async function enforceOrganizationCreatePolicy(currentOrganizationCount: number): Promise<void> {
  const policy = await getOnpremRolePolicy();
  if (!policy.onpremMode || policy.maxOrganizations === null) {
    return;
  }
  if (currentOrganizationCount >= policy.maxOrganizations) {
    throw new OnpremLicensePolicyError(
      `This on-prem system is limited to ${policy.maxOrganizations} organization while unlicensed. Install a valid license to create more organizations.`,
    );
  }
}

async function countGlobalUsersByFlag(flag: 'isSuperAdmin' | 'isCustSuper', excludeUserId?: string): Promise<number> {
  const where = excludeUserId
    ? and(eq(users[flag], true), ne(users.id, excludeUserId))
    : eq(users[flag], true);
  const rows = await db.select({ value: sql<number>`count(*)::int` }).from(users).where(where);
  return rows[0]?.value ?? 0;
}

async function countDistinctOrgUsersByRoles(
  organizationId: string,
  roles: string[],
  excludeUserId?: string,
): Promise<number> {
  const where = excludeUserId
    ? and(
        eq(userOrganizationRoles.organizationId, organizationId),
        inArray(userOrganizationRoles.role, roles),
        ne(userOrganizationRoles.userId, excludeUserId),
      )
    : and(eq(userOrganizationRoles.organizationId, organizationId), inArray(userOrganizationRoles.role, roles));
  const rows = await db
    .select({ value: sql<number>`count(distinct ${userOrganizationRoles.userId})::int` })
    .from(userOrganizationRoles)
    .where(where);
  return rows[0]?.value ?? 0;
}

export async function enforcePlatformRolePolicy(params: {
  assignSuperAdmin?: boolean;
  assignCustSuper?: boolean;
  targetUserId?: string;
}): Promise<void> {
  const policy = await getOnpremRolePolicy();
  if (!policy.onpremMode || policy.hasValidLicense) {
    return;
  }

  if (params.assignSuperAdmin && policy.maxPlatformSuperAdmins !== null) {
    const current = await countGlobalUsersByFlag('isSuperAdmin', params.targetUserId);
    if (current >= policy.maxPlatformSuperAdmins) {
      throw new OnpremLicensePolicyError(
        `Unlicensed system limit reached: maximum ${policy.maxPlatformSuperAdmins} platform SuperAdmins.`,
      );
    }
  }

  if (params.assignCustSuper && policy.maxCustSuperAdmins !== null) {
    const current = await countGlobalUsersByFlag('isCustSuper', params.targetUserId);
    if (current >= policy.maxCustSuperAdmins) {
      throw new OnpremLicensePolicyError(
        `Unlicensed system limit reached: maximum ${policy.maxCustSuperAdmins} customer Super Admin.`,
      );
    }
  }
}

export async function enforceOrgRolePolicy(params: {
  organizationId: string;
  role: string;
  targetUserId?: string;
}): Promise<void> {
  const policy = await getOnpremRolePolicy();
  if (!policy.onpremMode) {
    return;
  }

  const role = params.role.toLowerCase();
  const isLearnerRole = LEARNER_ROLES.includes(role);
  const isInstructorRole = INSTRUCTOR_ROLES.includes(role);
  const isOrgAdminRole = ORG_ADMIN_ROLES.includes(role);

  if (isLearnerRole && !policy.learnerRolesAllowed) {
    if (policy.systemType === 'development' || policy.systemType === 'qa') {
      throw new OnpremLicensePolicyError(
        `Learner registrations are disabled on on-prem ${policy.systemType.toUpperCase()} systems, including when licensed.`,
      );
    }
    throw new OnpremLicensePolicyError(
      'Learner registrations are disabled on unlicensed on-prem systems. Install a valid license to enable learner users.',
    );
  }

  if (isOrgAdminRole && policy.maxOrgAdminsPerOrg !== null) {
    const current = await countDistinctOrgUsersByRoles(params.organizationId, ORG_ADMIN_ROLES, params.targetUserId);
    if (current >= policy.maxOrgAdminsPerOrg) {
      throw new OnpremLicensePolicyError(
        `Role limit reached for this organization: maximum ${policy.maxOrgAdminsPerOrg} Org Admin users in current license state.`,
      );
    }
  }

  if (isInstructorRole && policy.maxInstructorsPerOrg !== null) {
    const current = await countDistinctOrgUsersByRoles(params.organizationId, INSTRUCTOR_ROLES, params.targetUserId);
    if (current >= policy.maxInstructorsPerOrg) {
      throw new OnpremLicensePolicyError(
        `Role limit reached for this organization: maximum ${policy.maxInstructorsPerOrg} Trainer/Team Lead users in current license state.`,
      );
    }
  }

  if (isLearnerRole && policy.maxLearnersPerOrg !== null) {
    const current = await countDistinctOrgUsersByRoles(params.organizationId, LEARNER_ROLES, params.targetUserId);
    if (current >= policy.maxLearnersPerOrg) {
      throw new OnpremLicensePolicyError(
        `Role limit reached for this organization: maximum ${policy.maxLearnersPerOrg} learner users in current license state.`,
      );
    }
  }
}
