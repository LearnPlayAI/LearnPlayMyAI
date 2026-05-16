import { createContext, useContext, useEffect, useMemo, useCallback, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { REQUIRED_TOKEN_KEYS } from '@shared/brandingTokens';
import { getContrastRatio } from '@/utils/contrast';
import { resolveBrandingRuntimeOrgId } from '@/lib/brandingRuntimeScope';

export type BrandingTokens = Record<string, string>;

export type LocalizedString = string | Record<string, string>;

export interface CustomCopy {
  loginTitle?: LocalizedString;
  loginSubtitle?: LocalizedString;
  loginCta?: LocalizedString;
  loginHelper?: LocalizedString;
  signupTitle?: LocalizedString;
  signupSubtitle?: LocalizedString;
  signupCta?: LocalizedString;
  signupHelper?: LocalizedString;
  dashboardWelcome?: LocalizedString;
  footerText?: LocalizedString;
}

function resolveLocalizedValue(value: LocalizedString | undefined, lang: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return value[lang] ?? value['en'] ?? Object.values(value)[0] ?? undefined;
  }
  return undefined;
}

export interface BrandingData {
  isOrgDomain: boolean;
  orgName: string;
  themeModeIntent?: 'light' | 'dark';
  logoUrl: string | null;
  faviconUrl: string | null;
  tokens: BrandingTokens;
  fontHeading: string;
  fontBody: string;
  supportUrl: string | null;
  supportEmail: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  allowEmailBranding: boolean;
  enableContrastCorrections: boolean;
  customCopy?: CustomCopy;
}

interface BrandingContextType {
  branding: BrandingData | null;
  isLoading: boolean;
  isResolved: boolean;
  isOrgDomain: boolean;
  applyTokens: () => void;
}

const defaultBranding: BrandingData = {
  isOrgDomain: false,
  orgName: 'LearnPlay',
  themeModeIntent: 'light',
  logoUrl: null,
  faviconUrl: null,
  tokens: {},
  fontHeading: 'Inter',
  fontBody: 'Inter',
  supportUrl: null,
  supportEmail: null,
  termsUrl: null,
  privacyUrl: null,
  allowEmailBranding: false,
  enableContrastCorrections: true,
  customCopy: {},
};

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);
let previouslyAppliedTokenKeys = new Set<string>();

function validateTokenCoverage(tokens: BrandingTokens): { 
  present: number; 
  missing: string[]; 
  coverage: number 
} {
  const presentKeys = REQUIRED_TOKEN_KEYS.filter((key) => !!tokens[key]);
  const missing = REQUIRED_TOKEN_KEYS.filter(key => !tokens[key]);
  return {
    present: presentKeys.length,
    missing: missing.slice(0, 10),
    coverage: (presentKeys.length / REQUIRED_TOKEN_KEYS.length) * 100
  };
}

/**
 * Validates and logs button token contrast ratios to ensure buttons are visible
 * on their intended backgrounds. Minimum WCAG AA ratio is 4.5:1 for normal text.
 */
function validateButtonContrast(tokens: BrandingTokens): {
  issues: Array<{ pair: string; foreground: string; background: string; ratio: number }>;
  passCount: number;
} {
  const buttonPairs = [
    { name: 'Secondary Button', fg: '--btn-secondary-fg', bg: '--btn-secondary-bg' },
    { name: 'Primary Button', fg: '--btn-primary-fg', bg: '--btn-primary-bg' },
    { name: 'Danger Button', fg: '--btn-danger-fg', bg: '--btn-danger-bg' },
  ];

  const issues: Array<{ pair: string; foreground: string; background: string; ratio: number }> = [];
  let passCount = 0;

  for (const pair of buttonPairs) {
    const fgColor = tokens[pair.fg];
    const bgColor = tokens[pair.bg];

    if (fgColor && bgColor) {
      const ratio = getContrastRatio(fgColor, bgColor);
      const meetsWCAG = ratio >= 4.5;

      if (!meetsWCAG) {
        issues.push({
          pair: pair.name,
          foreground: fgColor,
          background: bgColor,
          ratio: Math.round(ratio * 100) / 100,
        });
      } else {
        passCount++;
      }
    }
  }

  const surfaces = [
    { name: 'Card', value: tokens['--card'] || '' },
    { name: 'Background', value: tokens['--background'] || '' },
  ].filter((surface) => !!surface.value);

  for (const surface of surfaces) {
    const checks = [
      { name: `Primary Button on ${surface.name}`, element: '--btn-primary-bg', minRatio: 3.0 },
      { name: `Secondary Button on ${surface.name}`, element: '--btn-secondary-bg', minRatio: 3.0 },
      { name: `Danger Button on ${surface.name}`, element: '--btn-danger-bg', minRatio: 3.0 },
      { name: `Ghost Button Text on ${surface.name}`, element: '--btn-ghost-fg', minRatio: 4.5 },
      { name: `Outline Button Text on ${surface.name}`, element: '--btn-outline-fg', minRatio: 4.5 },
      { name: `Outline Button Border on ${surface.name}`, element: '--btn-outline-border', minRatio: 2.0 },
    ];

    for (const check of checks) {
      const elementColor = tokens[check.element];
      const surfaceColor = surface.value;
      if (!elementColor || !surfaceColor) continue;

      const ratio = getContrastRatio(elementColor, surfaceColor);
      const meetsWCAG = ratio >= check.minRatio;

      if (!meetsWCAG) {
        issues.push({
          pair: check.name,
          foreground: elementColor,
          background: surfaceColor,
          ratio: Math.round(ratio * 100) / 100,
        });
      } else {
        passCount++;
      }
    }
  }

  return { issues, passCount };
}

function applyBrandingToDOM(branding: BrandingData) {
  const root = document.documentElement;
  const rawTokens = branding.tokens || {};
  const tokens: BrandingTokens = { ...rawTokens };

  const validation = validateTokenCoverage(tokens);
  console.log(
    `[BrandingContext] Token coverage: ${validation.present}/${REQUIRED_TOKEN_KEYS.length} (${validation.coverage.toFixed(1)}%)`
  );
  
  if (validation.coverage < 90 && Object.keys(rawTokens).length > 0) {
    console.warn(
      `[BrandingContext] Low token coverage (${validation.coverage.toFixed(1)}%). Missing tokens (first 10):`,
      validation.missing
    );
  }

  const buttonContrast = validateButtonContrast(tokens);
  if (buttonContrast.issues.length > 0) {
    console.warn(`[BrandingContext] Button contrast issues remaining after token resolution: ${buttonContrast.issues.map(i => i.pair).join(', ')}`);
  } else if (buttonContrast.passCount > 0) {
    console.log(`[BrandingContext] Button contrast validation passed (${buttonContrast.passCount}/${buttonContrast.passCount})`);
  }
  
  let appliedCount = 0;
  const fallbackCount = 0;
  
  const nextTokenKeys = new Set<string>();

  Object.entries(tokens).forEach(([key, value]) => {
    if (value && key.startsWith('--')) {
      nextTokenKeys.add(key);
      root.style.setProperty(key, value);
      appliedCount++;
    }
  });

  for (const tokenKey of previouslyAppliedTokenKeys) {
    if (!nextTokenKeys.has(tokenKey)) {
      root.style.removeProperty(tokenKey);
    }
  }
  previouslyAppliedTokenKeys = nextTokenKeys;
  
  console.log(
    `[BrandingContext] Applied ${appliedCount} CSS variables, ${fallbackCount} fallbacks`
  );

  if (branding.themeModeIntent === 'light' || branding.themeModeIntent === 'dark') {
    root.setAttribute('data-theme-intent', branding.themeModeIntent);
    if (branding.themeModeIntent === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  } else {
    root.removeAttribute('data-theme-intent');
    root.classList.remove('dark');
  }

  if (branding.fontHeading) {
    root.style.setProperty('--font-heading', branding.fontHeading);
  }
  if (branding.fontBody) {
    root.style.setProperty('--font-body', branding.fontBody);
  }

  if (branding.faviconUrl) {
    const faviconSelectors = [
      "link[rel='icon'][sizes='32x32']",
      "link[rel='icon'][sizes='16x16']",
      "link[rel='icon']",
    ];
    let updatedAny = false;
    for (const selector of faviconSelectors) {
      const el = document.querySelector(selector) as HTMLLinkElement;
      if (el) {
        el.href = branding.faviconUrl;
        updatedAny = true;
      }
    }
    if (!updatedAny) {
      const favicon = document.createElement('link');
      favicon.rel = 'icon';
      favicon.href = branding.faviconUrl;
      document.head.appendChild(favicon);
    }

    const appleTouchIcon = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement;
    if (appleTouchIcon) {
      appleTouchIcon.href = branding.faviconUrl;
    }

    const updateOrCreateMeta = (property: string, content: string) => {
      let meta = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement;
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('property', property);
        document.head.appendChild(meta);
      }
      meta.content = content;
    };
    updateOrCreateMeta('og:image', branding.faviconUrl);
  }

  const manifestLink = document.querySelector("link[rel='manifest']") as HTMLLinkElement;
  if (manifestLink && !manifestLink.href.endsWith('/api/branding/manifest')) {
    manifestLink.href = '/api/branding/manifest';
  }

  if (branding.orgName) {
    document.title = branding.orgName;
    
    const updateOrCreateMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.content = content;
    };
    
    updateOrCreateMeta('property', 'og:title', branding.orgName);
    updateOrCreateMeta('property', 'og:site_name', branding.orgName);
    updateOrCreateMeta('name', 'apple-mobile-web-app-title', branding.orgName);
  }

  const primaryColor = tokens['--primary'] || rawTokens['--primary'];
  if (primaryColor) {
    let themeColorMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement;
    if (!themeColorMeta) {
      themeColorMeta = document.createElement('meta');
      themeColorMeta.setAttribute('name', 'theme-color');
      document.head.appendChild(themeColorMeta);
    }
    themeColorMeta.content = primaryColor;
  }

  if (branding.fontHeading && branding.fontHeading !== 'Inter') {
    loadGoogleFont(branding.fontHeading);
  }
  if (branding.fontBody && branding.fontBody !== 'Inter' && branding.fontBody !== branding.fontHeading) {
    loadGoogleFont(branding.fontBody);
  }
}

function loadGoogleFont(fontName: string) {
  const fontId = `google-font-${fontName.replace(/\s+/g, '-').toLowerCase()}`;
  if (document.getElementById(fontId)) {
    return;
  }
  
  const link = document.createElement('link');
  link.id = fontId;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { data: userInfo } = useQuery<{ 
    id: string; 
    organizationId?: string | null;
    isSuperAdmin?: boolean;
    isCustSuper?: boolean;
    isImpersonating?: boolean;
    impersonatedOrganization?: { id: string };
    organization?: { id: string };
  } | null>({
    queryKey: ['/api/auth/user'],
    retry: false,
    queryFn: async () => {
      const res = await fetch('/api/auth/user', { credentials: 'include' });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error('Failed to fetch user');
      return res.json();
    },
  });

  const { data: userRoles } = useQuery<{
    defaultOrganizationId?: string;
    organizations?: Array<{ id: string }>;
  }>({
    queryKey: ['/api/user/roles'],
    enabled: !!userInfo,
    retry: false,
  });

  const currentOrgId = useMemo(
    () => resolveBrandingRuntimeOrgId({ userInfo, userRoles }),
    [userInfo, userRoles]
  );

  const { data: branding, isLoading, isError } = useQuery<BrandingData>({
    queryKey: ['/api/theme/resolved', currentOrgId || 'none', userInfo?.isImpersonating ? (userInfo?.impersonatedOrganization?.id || 'impersonating') : 'not-impersonating'],
    queryFn: async () => {
      const headers: HeadersInit = {};
      if (currentOrgId) {
        headers['X-Organization-Context'] = currentOrgId;
      }
      const response = await fetch('/api/theme/resolved', {
        credentials: 'include',
        headers,
      });
      if (!response.ok) {
        throw new Error('Failed to fetch resolved theme');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  const resolvedBranding = branding || defaultBranding;
  const isResolved = !isLoading && (!!branding || isError);

  useEffect(() => {
    if (isResolved && resolvedBranding) {
      applyBrandingToDOM(resolvedBranding);
    }
  }, [isResolved, resolvedBranding]);

  const applyTokens = useCallback(() => {
    if (resolvedBranding) {
      applyBrandingToDOM(resolvedBranding);
    }
  }, [resolvedBranding]);

  const value = useMemo(() => ({
    branding: resolvedBranding,
    isLoading,
    isResolved,
    isOrgDomain: resolvedBranding?.isOrgDomain || false,
    applyTokens,
  }), [resolvedBranding, isLoading, isResolved, applyTokens]);

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (context === undefined) {
    throw new Error('useBranding must be used within a BrandingProvider');
  }
  return context;
}

export function useBrandingLogo() {
  const { branding, isResolved } = useBranding();
  return {
    logoUrl: branding?.logoUrl,
    orgName: branding?.orgName || 'LearnPlay',
    isResolved,
  };
}

export function useBrandingLinks() {
  const { branding } = useBranding();
  return {
    supportUrl: branding?.supportUrl,
    supportEmail: branding?.supportEmail,
    termsUrl: branding?.termsUrl,
    privacyUrl: branding?.privacyUrl,
  };
}

export function useBrandingCopy(languageCode?: string) {
  const { branding, isResolved } = useBranding();
  const customCopy = branding?.customCopy || {};
  const orgName = branding?.orgName || 'LearnPlay';
  const lang = languageCode || navigator.language?.split('-')[0] || 'en';
  
  return {
    loginTitle: resolveLocalizedValue(customCopy.loginTitle, lang) || `Welcome to ${orgName}`,
    loginSubtitle: resolveLocalizedValue(customCopy.loginSubtitle, lang) || 'Sign in to continue your learning journey',
    loginCta: resolveLocalizedValue(customCopy.loginCta, lang) || 'Sign In',
    loginHelper: resolveLocalizedValue(customCopy.loginHelper, lang) || "Don't have an account?",
    signupTitle: resolveLocalizedValue(customCopy.signupTitle, lang) || `Join ${orgName}`,
    signupSubtitle: resolveLocalizedValue(customCopy.signupSubtitle, lang) || 'Create your account to start learning',
    signupCta: resolveLocalizedValue(customCopy.signupCta, lang) || 'Create Account',
    signupHelper: resolveLocalizedValue(customCopy.signupHelper, lang) || 'Already have an account?',
    dashboardWelcome: resolveLocalizedValue(customCopy.dashboardWelcome, lang) || `Welcome back to ${orgName}!`,
    footerText: resolveLocalizedValue(customCopy.footerText, lang) || '',
    isResolved,
    orgName,
  };
}
