import { db } from '../db';
import { organizations } from '@shared/schema';
import { eq } from 'drizzle-orm';

export type OrgType = 'education' | 'business' | 'elearning';

export interface OrgTypePolicy {
  canSellCourses: boolean;
  allowedVisibilities: ('public' | 'org_only')[];
  defaultVisibility: 'public' | 'org_only';
  forceFreePrice: boolean;
  canShowPublicly: boolean;
}

export function getOrgTypePolicy(orgType: OrgType): OrgTypePolicy {
  if (orgType === 'elearning') {
    return {
      canSellCourses: true,
      allowedVisibilities: ['public', 'org_only'],
      defaultVisibility: 'public',
      forceFreePrice: false,
      canShowPublicly: true,
    };
  }
  return {
    canSellCourses: false,
    allowedVisibilities: ['org_only'],
    defaultVisibility: 'org_only',
    forceFreePrice: true,
    canShowPublicly: false,
  };
}

export async function getOrgTypePolicyById(organizationId: string): Promise<OrgTypePolicy | null> {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
    columns: { type: true },
  });

  if (!org || !org.type) {
    return null;
  }

  return getOrgTypePolicy(org.type as OrgType);
}

export function isOrgTypeRestricted(orgType: OrgType): boolean {
  return orgType === 'education' || orgType === 'business';
}

export function getRestrictedOrgTypes(): OrgType[] {
  return ['education', 'business'];
}
