import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { organizations, organizationUnits } from '@shared/schema';

export const PUBLIC_ORGANIZATION_NAME = 'Public Organization';
export const PUBLIC_ORGANIZATION_INVITE_CODE = 'PUBLIC';

export function getPublicLearnerRole(orgType: string | null | undefined): string {
  return orgType === 'education' ? 'student' : 'learner';
}

export class PublicOrganizationService {
  static async getOrCreatePublicOrganization() {
    const [existing] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, PUBLIC_ORGANIZATION_NAME))
      .limit(1);

    if (existing) {
      if (!existing.isActive || existing.type !== 'elearning' || !existing.isGeneralOrg) {
        const [updated] = await db
          .update(organizations)
          .set({
            type: 'elearning',
            isActive: true,
            isGeneralOrg: true,
            subscriptionStatus: 'active',
            updatedAt: new Date(),
          })
          .where(eq(organizations.id, existing.id))
          .returning();
        return updated || existing;
      }
      return existing;
    }

    const [created] = await db
      .insert(organizations)
      .values({
        name: PUBLIC_ORGANIZATION_NAME,
        inviteCode: PUBLIC_ORGANIZATION_INVITE_CODE,
        type: 'elearning',
        subscriptionStatus: 'active',
        isActive: true,
        isGeneralOrg: true,
        useOrgCreditWallet: true,
        allowTeachersToSpendCredits: true,
        timezone: 'Africa/Johannesburg',
        currency: 'ZAR',
      })
      .onConflictDoNothing({ target: organizations.inviteCode })
      .returning();

    if (created) {
      return created;
    }

    const [byInviteCode] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.inviteCode, PUBLIC_ORGANIZATION_INVITE_CODE))
      .limit(1);

    if (!byInviteCode) {
      throw new Error('Unable to create or find Public Organization');
    }

    return byInviteCode;
  }

  static async getOrCreatePublicDepartment(organizationId: string) {
    const [existing] = await db
      .select()
      .from(organizationUnits)
      .where(and(
        eq(organizationUnits.organizationId, organizationId),
        sql`LOWER(${organizationUnits.name}) = 'public'`
      ))
      .limit(1);

    if (existing) {
      if (!existing.isActive) {
        const [updated] = await db
          .update(organizationUnits)
          .set({ isActive: true })
          .where(eq(organizationUnits.id, existing.id))
          .returning();
        return updated || existing;
      }
      return existing;
    }

    const [maxOrderRow] = await db
      .select({ maxOrder: sql<number>`coalesce(max(${organizationUnits.displayOrder}), 0)::int` })
      .from(organizationUnits)
      .where(eq(organizationUnits.organizationId, organizationId));

    const [created] = await db
      .insert(organizationUnits)
      .values({
        organizationId,
        name: 'Public',
        displayOrder: Number(maxOrderRow?.maxOrder || 0) + 1,
        isActive: true,
      })
      .returning();

    return created;
  }
}
