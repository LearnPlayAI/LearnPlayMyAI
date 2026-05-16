import { describe, expect, it } from '@jest/globals';
import {
  buildActivationBlockedDescription,
  buildDomainActionUrl,
  buildThemeEditorApiTargets,
  PLATFORM_THEME_ID,
} from '../lib/themeEditorApi';

describe('theme editor api target resolver', () => {
  it('uses platform endpoints for platform theme mode', () => {
    const targets = buildThemeEditorApiTargets({
      selectedOrgId: PLATFORM_THEME_ID,
      useSuperAdminEndpoints: true,
    });

    expect(targets.fetchThemeUrl).toBe('/api/superadmin/branding/platform');
    expect(targets.saveThemeUrl).toBe('/api/superadmin/branding/platform');
    expect(targets.activateThemeUrl).toBe('/api/superadmin/branding/platform/activate');
    expect(targets.resetThemeUrl).toBe('/api/superadmin/branding/platform/reset');
    expect(targets.recommendPaletteUrl).toBe('/api/superadmin/branding/palette/recommend');
    expect(targets.buildPaletteUrl).toBe('/api/superadmin/branding/palette/build');
    expect(targets.domainsUrl).toBeNull();
    expect(targets.showDomainManager).toBe(false);
  });

  it('uses platform-admin org endpoints when an organization is selected', () => {
    const targets = buildThemeEditorApiTargets({
      selectedOrgId: 'org-123',
      useSuperAdminEndpoints: true,
    });

    expect(targets.fetchThemeUrl).toBe('/api/superadmin/branding/org/org-123/theme');
    expect(targets.saveThemeUrl).toBe('/api/superadmin/branding/org/org-123/theme');
    expect(targets.activateThemeUrl).toBe('/api/theme/activate?orgId=org-123');
    expect(targets.resetThemeUrl).toBe('/api/theme/reset?orgId=org-123');
    expect(targets.recommendPaletteUrl).toBe('/api/superadmin/branding/palette/recommend');
    expect(targets.buildPaletteUrl).toBe('/api/superadmin/branding/palette/build');
    expect(targets.domainsUrl).toBe('/api/domains?orgId=org-123');
    expect(targets.showDomainManager).toBe(true);
  });

  it('uses org-scoped endpoints for custsuper org context', () => {
    const targets = buildThemeEditorApiTargets({
      selectedOrgId: 'org-456',
      useSuperAdminEndpoints: false,
    });

    expect(targets.fetchThemeUrl).toBe('/api/theme?orgId=org-456');
    expect(targets.saveThemeUrl).toBe('/api/theme?orgId=org-456');
    expect(targets.activateThemeUrl).toBe('/api/theme/activate?orgId=org-456');
    expect(targets.resetThemeUrl).toBe('/api/theme/reset?orgId=org-456');
    expect(targets.recommendPaletteUrl).toBe('/api/branding/palette/recommend');
    expect(targets.buildPaletteUrl).toBe('/api/branding/palette/build');
    expect(targets.domainsUrl).toBe('/api/domains?orgId=org-456');
    expect(targets.isPlatformTheme).toBe(false);
  });

  it('keeps theme mutations org-scoped for impersonated superadmin sessions', () => {
    const targets = buildThemeEditorApiTargets({
      selectedOrgId: 'org/with special value',
      useSuperAdminEndpoints: true,
    });

    expect(targets.fetchThemeUrl).toBe('/api/superadmin/branding/org/org/with special value/theme');
    expect(targets.saveThemeUrl).toBe('/api/superadmin/branding/org/org/with special value/theme');
    expect(targets.activateThemeUrl).toBe('/api/theme/activate?orgId=org%2Fwith%20special%20value');
    expect(targets.resetThemeUrl).toBe('/api/theme/reset?orgId=org%2Fwith%20special%20value');
    expect(targets.domainsUrl).toBe('/api/domains?orgId=org%2Fwith%20special%20value');
    expect(targets.isPlatformTheme).toBe(false);
  });

  it('uses org admin defaults when not superadmin', () => {
    const targets = buildThemeEditorApiTargets({
      selectedOrgId: null,
      useSuperAdminEndpoints: false,
    });

    expect(targets.fetchThemeUrl).toBe('/api/theme');
    expect(targets.saveThemeUrl).toBe('/api/theme');
    expect(targets.activateThemeUrl).toBe('/api/theme/activate');
    expect(targets.resetThemeUrl).toBe('/api/theme/reset');
    expect(targets.recommendPaletteUrl).toBe('/api/branding/palette/recommend');
    expect(targets.buildPaletteUrl).toBe('/api/branding/palette/build');
    expect(targets.domainsUrl).toBe('/api/domains');
    expect(targets.showDomainManager).toBe(true);
  });

  it('propagates selected org query for domain action routes', () => {
    expect(
      buildDomainActionUrl({
        domainsUrl: '/api/domains?orgId=org-123',
        actionPath: '/api/domains/domain-1/verify',
      })
    ).toBe('/api/domains/domain-1/verify?orgId=org-123');

    expect(
      buildDomainActionUrl({
        domainsUrl: '/api/domains?orgId=org-123',
        actionPath: '/api/domains/domain-1/toggle-active',
      })
    ).toBe('/api/domains/domain-1/toggle-active?orgId=org-123');

    expect(
      buildDomainActionUrl({
        domainsUrl: '/api/domains?orgId=org-123',
        actionPath: '/api/domains/domain-1',
      })
    ).toBe('/api/domains/domain-1?orgId=org-123');
  });

  it('keeps action route unchanged when no org query context exists', () => {
    expect(
      buildDomainActionUrl({
        domainsUrl: '/api/domains',
        actionPath: '/api/domains/domain-1/verify',
      })
    ).toBe('/api/domains/domain-1/verify');
  });

  it('formats activation block details from array-based validation payloads', () => {
    expect(
      buildActivationBlockedDescription({
        criticalIssues: [{ pair: 'a' }, { pair: 'b' }],
        warningIssues: [{ pair: 'x' }],
        missingRequiredTokens: ['--background'],
        missingContractTokens: ['--tab-active-fg', '--btn-primary-bg'],
      })
    ).toBe(
      '2 critical contrast issue(s), 1 warning issue(s), 1 missing required token(s), 2 missing contract token(s).'
    );
  });

  it('formats activation block details from numeric validation payloads', () => {
    expect(
      buildActivationBlockedDescription({
        criticalIssues: 3,
        warningIssues: 4,
        missingRequiredTokens: [],
        missingContractTokens: [],
      })
    ).toBe(
      '3 critical contrast issue(s), 4 warning issue(s), 0 missing required token(s), 0 missing contract token(s).'
    );
  });
});
