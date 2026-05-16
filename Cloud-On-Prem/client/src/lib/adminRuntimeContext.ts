export type AdminScopeMode = "platform" | "organization";

export interface AdminRuntimeContextInput {
  isSuperAdmin?: boolean;
  isCustSuper?: boolean;
  isOrgAdmin?: boolean;
  isTeacher?: boolean;
  isImpersonating?: boolean;
  effectiveOrganizationId?: string | null;
  effectiveOrganizationName?: string | null;
}

export interface AdminRuntimeContext {
  scopeMode: AdminScopeMode;
  activeOrgId: string | null;
  activeOrgName: string | null;
  showActiveOrg: boolean;
  scopeLabel: string;
  roleBadgeLabel: string;
  landingPath: string;
}

export function deriveAdminRuntimeContext(input: AdminRuntimeContextInput): AdminRuntimeContext {
  const isPlatformAdmin = Boolean(input.isSuperAdmin);
  const activeOrgId = input.effectiveOrganizationId ?? null;
  const activeOrgName = input.effectiveOrganizationName ?? null;
  const hasOrgScope = Boolean(activeOrgId);
  const scopeMode: AdminScopeMode = isPlatformAdmin && !hasOrgScope ? "platform" : "organization";

  if (scopeMode === "platform") {
    return {
      scopeMode,
      activeOrgId: null,
      activeOrgName: null,
      showActiveOrg: false,
      scopeLabel: "Platform scope",
      roleBadgeLabel: "Platform Admin",
      landingPath: "/super-admin",
    };
  }

  if (input.isOrgAdmin || input.isCustSuper || (isPlatformAdmin && input.isImpersonating)) {
    return {
      scopeMode,
      activeOrgId,
      activeOrgName,
      showActiveOrg: Boolean(activeOrgName),
      scopeLabel: "Organization scope",
      roleBadgeLabel: "Org Admin",
      landingPath: "/org-management",
    };
  }

  if (input.isTeacher) {
    return {
      scopeMode,
      activeOrgId,
      activeOrgName,
      showActiveOrg: Boolean(activeOrgName),
      scopeLabel: "Organization scope",
      roleBadgeLabel: "Instructor",
      landingPath: "/course-builder",
    };
  }

  return {
    scopeMode,
    activeOrgId,
    activeOrgName,
    showActiveOrg: Boolean(activeOrgName),
    scopeLabel: "Organization scope",
    roleBadgeLabel: "Learner",
    landingPath: "/my-courses",
  };
}
