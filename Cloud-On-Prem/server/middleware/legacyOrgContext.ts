import type { SessionData } from "express-session";

export function projectLegacyOrganizationContext(session: SessionData | undefined): string | null {
  const impersonatedOrgId = session?.context?.impersonatedOrganization?.orgId?.trim() || null;
  const primaryOrgId = session?.context?.primaryOrganization?.orgId?.trim() || null;
  const firstOrganizationOrgId = session?.context?.organizations?.[0]?.orgId?.trim() || null;
  const effectiveOrgId = impersonatedOrgId || primaryOrgId || firstOrganizationOrgId;

  if (!session) {
    return effectiveOrgId;
  }

  if (!effectiveOrgId) {
    delete session.organizationId;
    if (session.user && typeof session.user === "object") {
      const legacyUser = session.user as { organizationId?: string };
      delete legacyUser.organizationId;
    }
    return null;
  }

  if (session.organizationId !== effectiveOrgId) {
    session.organizationId = effectiveOrgId;
  }

  if (session?.user && typeof session.user === "object") {
    const legacyUser = session.user as { organizationId?: string };
    if (legacyUser.organizationId !== effectiveOrgId) {
      legacyUser.organizationId = effectiveOrgId;
    }
  }

  return effectiveOrgId;
}
