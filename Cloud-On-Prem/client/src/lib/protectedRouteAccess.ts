import type { AdminRuntimeContext } from './adminRuntimeContext';

export type UserRole = 'superadmin' | 'custsuper' | 'orgadmin' | 'teacher' | 'authenticated';

export interface RouteAccessContext {
  runtimeContext: AdminRuntimeContext;
  isSuperAdmin: boolean;
  isCustSuper: boolean;
  isOrgAdmin: boolean;
  isTeacher: boolean;
  isAuthenticated: boolean;
}

export function checkRouteAccess(
  allowedRoles: UserRole[],
  context: RouteAccessContext
): boolean {
  const effectiveSuperAdmin = context.isSuperAdmin && context.runtimeContext.scopeMode === 'platform';
  const organizationAdminCapability =
    context.runtimeContext.scopeMode === 'organization' &&
    (context.isCustSuper || context.isOrgAdmin || context.runtimeContext.roleBadgeLabel === 'Org Admin');
  const teacherCapability = context.isTeacher || organizationAdminCapability;

  return allowedRoles.some((role) => {
    switch (role) {
      case 'superadmin':
        return effectiveSuperAdmin;
      case 'custsuper':
        return context.isCustSuper || effectiveSuperAdmin;
      case 'orgadmin':
        return organizationAdminCapability;
      case 'teacher':
        return teacherCapability;
      case 'authenticated':
        return context.isAuthenticated;
      default:
        return false;
    }
  });
}
