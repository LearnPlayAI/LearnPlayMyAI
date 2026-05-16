export const PLATFORM_THEME_ID = '__platform__';

export interface ThemeEditorApiTargets {
  fetchThemeUrl: string;
  saveThemeUrl: string;
  activateThemeUrl: string;
  resetThemeUrl: string;
  recommendPaletteUrl: string;
  buildPaletteUrl: string;
  domainsUrl: string | null;
  showDomainManager: boolean;
  isPlatformTheme: boolean;
}

export function buildActivationBlockedDescription(validation: unknown): string {
  const row = validation && typeof validation === 'object' ? (validation as Record<string, unknown>) : {};
  const criticalCount = Array.isArray(row.criticalIssues)
    ? row.criticalIssues.length
    : Number(row.criticalIssues || 0);
  const missingRequired = Array.isArray(row.missingRequiredTokens)
    ? row.missingRequiredTokens.length
    : 0;
  const missingContract = Array.isArray(row.missingContractTokens)
    ? row.missingContractTokens.length
    : 0;
  const warningCount = Array.isArray(row.warningIssues)
    ? row.warningIssues.length
    : Number(row.warningIssues || 0);
  return `${criticalCount} critical contrast issue(s), ${warningCount} warning issue(s), ${missingRequired} missing required token(s), ${missingContract} missing contract token(s).`;
}

export function buildDomainActionUrl(params: {
  domainsUrl: string | null;
  actionPath: string;
}): string {
  const { domainsUrl, actionPath } = params;
  const normalizedActionPath = actionPath.startsWith('/') ? actionPath : `/${actionPath}`;
  if (!domainsUrl) return normalizedActionPath;

  const queryIndex = domainsUrl.indexOf('?');
  if (queryIndex < 0) return normalizedActionPath;
  const query = domainsUrl.slice(queryIndex + 1);
  if (!query) return normalizedActionPath;
  return `${normalizedActionPath}?${query}`;
}

export function buildThemeEditorApiTargets(params: {
  selectedOrgId: string | null;
  useSuperAdminEndpoints: boolean;
}): ThemeEditorApiTargets {
  const { selectedOrgId, useSuperAdminEndpoints } = params;
  const isPlatformTheme = selectedOrgId === PLATFORM_THEME_ID;

  if (isPlatformTheme && useSuperAdminEndpoints) {
    return {
      fetchThemeUrl: '/api/superadmin/branding/platform',
      saveThemeUrl: '/api/superadmin/branding/platform',
      activateThemeUrl: '/api/superadmin/branding/platform/activate',
      resetThemeUrl: '/api/superadmin/branding/platform/reset',
      recommendPaletteUrl: '/api/superadmin/branding/palette/recommend',
      buildPaletteUrl: '/api/superadmin/branding/palette/build',
      domainsUrl: null,
      showDomainManager: false,
      isPlatformTheme: true,
    };
  }

  if (selectedOrgId) {
    if (useSuperAdminEndpoints) {
      return {
        fetchThemeUrl: `/api/superadmin/branding/org/${selectedOrgId}/theme`,
        saveThemeUrl: `/api/superadmin/branding/org/${selectedOrgId}/theme`,
        activateThemeUrl: `/api/theme/activate?orgId=${encodeURIComponent(selectedOrgId)}`,
        resetThemeUrl: `/api/theme/reset?orgId=${encodeURIComponent(selectedOrgId)}`,
        recommendPaletteUrl: '/api/superadmin/branding/palette/recommend',
        buildPaletteUrl: '/api/superadmin/branding/palette/build',
        domainsUrl: `/api/domains?orgId=${encodeURIComponent(selectedOrgId)}`,
        showDomainManager: true,
        isPlatformTheme: false,
      };
    }

    return {
      fetchThemeUrl: `/api/theme?orgId=${encodeURIComponent(selectedOrgId)}`,
      saveThemeUrl: `/api/theme?orgId=${encodeURIComponent(selectedOrgId)}`,
      activateThemeUrl: `/api/theme/activate?orgId=${encodeURIComponent(selectedOrgId)}`,
      resetThemeUrl: `/api/theme/reset?orgId=${encodeURIComponent(selectedOrgId)}`,
      recommendPaletteUrl: '/api/branding/palette/recommend',
      buildPaletteUrl: '/api/branding/palette/build',
      domainsUrl: `/api/domains?orgId=${encodeURIComponent(selectedOrgId)}`,
      showDomainManager: true,
      isPlatformTheme: false,
    };
  }

  return {
    fetchThemeUrl: '/api/theme',
    saveThemeUrl: '/api/theme',
    activateThemeUrl: '/api/theme/activate',
    resetThemeUrl: '/api/theme/reset',
    recommendPaletteUrl: '/api/branding/palette/recommend',
    buildPaletteUrl: '/api/branding/palette/build',
    domainsUrl: '/api/domains',
    showDomainManager: true,
    isPlatformTheme: false,
  };
}
