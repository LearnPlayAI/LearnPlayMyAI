import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest, queryClient, refreshBrandingCaches } from '@/lib/queryClient';
import { getContrastCorrectedTokens, getContrastWarnings, type ContrastWarning } from '@/utils/contrast';
import {
  buildDomainActionUrl,
  buildThemeEditorApiTargets,
  PLATFORM_THEME_ID,
} from '@/lib/themeEditorApi';
import { generatePaletteTokens, shouldProceedWithOrgSwitch } from '@/lib/themePaletteBuilder';
import { hasUnsavedThemeChanges, shouldHydrateFetchedTheme } from '@/lib/themeEditorStateSync';
import { 
  BrandEditorShell, 
  ControlRail, 
  PreviewTabs, 
  type BrandEditorState 
} from '@/components/brand-editor';
import { cn } from '@/lib/utils';
import { 
  Loader2, 
  Building2, 
  AlertTriangle, 
  RotateCcw, 
  Save, 
  Check,
  Copy,
  Trash2,
  Globe,
  RefreshCw,
  Info,
  Power,
  PanelLeft,
  LibraryBig,
  Edit3,
  ShieldCheck,
  Rocket,
  CheckCircle2
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface Organization {
  id: string;
  name: string;
  slug?: string;
}

type LocalizedString = string | Record<string, string>;

interface CustomCopy {
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

interface ThemeEditorMeta {
  retainedContrastTokenKeys?: string[];
}

const THEME_EDITOR_META_KEY = '__themeEditorMeta';

function getThemeEditorMeta(customCopy?: CustomCopy | null): ThemeEditorMeta {
  const raw = (customCopy as Record<string, unknown> | null | undefined)?.[THEME_EDITOR_META_KEY];
  if (!raw || typeof raw !== 'object') return {};
  const retained = (raw as ThemeEditorMeta).retainedContrastTokenKeys;
  if (!Array.isArray(retained)) return {};
  const validKeys = retained.filter((key): key is string => typeof key === 'string' && key.startsWith('--'));
  return { retainedContrastTokenKeys: validKeys };
}

function withThemeEditorMeta(customCopy: CustomCopy | undefined, meta: ThemeEditorMeta): CustomCopy {
  const merged = { ...(customCopy || {}) } as Record<string, unknown>;
  if (!meta.retainedContrastTokenKeys || meta.retainedContrastTokenKeys.length === 0) {
    delete merged[THEME_EDITOR_META_KEY];
    return merged as CustomCopy;
  }
  merged[THEME_EDITOR_META_KEY] = meta;
  return merged as CustomCopy;
}

interface BrandingTheme {
  id?: string;
  organizationId?: string;
  orgName: string;
  status: 'draft' | 'active';
  themeModeIntent?: 'light' | 'dark' | null;
  presetId?: string | null;
  tokens: Record<string, string>;
  tokensLight?: Record<string, string> | null;
  tokensDark?: Record<string, string> | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  fontHeading?: string;
  fontBody?: string;
  supportUrl?: string | null;
  supportEmail?: string | null;
  termsUrl?: string | null;
  privacyUrl?: string | null;
  allowEmailBranding?: boolean;
  enableContrastCorrections?: boolean;
  gradientEnabled?: boolean;
  gradientFrom?: string | null;
  gradientTo?: string | null;
  gradientAngle?: string | null;
  customCopy?: CustomCopy;
}

interface OrganizationDomain {
  id: string;
  organizationId: string;
  domain: string;
  verified: boolean;
  verificationToken: string;
  verifiedAt?: string | null;
  isActive?: boolean;
}

type WorkflowStage = 'palette' | 'customize' | 'accessibility' | 'publish';

function formatTokenLabel(tokenKey: string): string {
  return tokenKey
    .replace(/^--/, '')
    .split('-')
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function tokenGroupName(tokenKey: string): string {
  if (tokenKey.startsWith('--btn-')) return 'Buttons';
  if (tokenKey.startsWith('--input-') || tokenKey.startsWith('--select-') || tokenKey.startsWith('--label-') || tokenKey.startsWith('--helper-')) return 'Forms';
  if (tokenKey.startsWith('--table-')) return 'Tables';
  if (tokenKey.startsWith('--nav-') || tokenKey.startsWith('--sidebar-') || tokenKey.startsWith('--admin-')) return 'Navigation';
  if (tokenKey.startsWith('--toast-') || tokenKey.startsWith('--modal-') || tokenKey.startsWith('--tooltip-') || tokenKey.startsWith('--popover-')) return 'Overlays';
  if (tokenKey.startsWith('--badge-') || tokenKey.startsWith('--pill-') || tokenKey.startsWith('--tag-')) return 'Badges and Tags';
  if (tokenKey.startsWith('--hero-') || tokenKey.startsWith('--footer-') || tokenKey.startsWith('--features-') || tokenKey.startsWith('--pricing-')) return 'Marketing';
  if (tokenKey.startsWith('--answer-') || tokenKey.startsWith('--timer-') || tokenKey.startsWith('--leaderboard-')) return 'Game and Quiz';
  return 'Core Primitives';
}

function normalizeTokenColorValue(value: string | undefined | null): string {
  return String(value || '').trim().toLowerCase();
}

function defaultTokens(): Record<string, string> {
  return {
    '--primary': '#3b82f6',
    '--primary-foreground': '#ffffff',
    '--secondary': '#1e293b',
    '--secondary-foreground': '#ffffff',
    '--accent': '#60a5fa',
    '--accent-foreground': '#ffffff',
    '--background': '#09090b',
    '--foreground': '#fafafa',
    '--card': '#18181b',
    '--card-foreground': '#fafafa',
    '--muted': '#27272a',
    '--muted-foreground': '#a1a1aa',
    '--border': '#27272a',
    '--ring': '#3b82f6',
    '--gradient-primary-from': '#3b82f6',
    '--gradient-primary-to': '#3b82f6',
    '--game-primary': '#3b82f6',
    '--game-glow': 'rgba(59, 130, 246, 0.5)',
  };
}

function themeToEditorState(theme: BrandingTheme | null): BrandEditorState {
  if (!theme) {
    return {
      tokens: defaultTokens(),
      themeModeIntent: 'light',
      themeName: 'Custom Theme',
      brandName: 'LearnPlay',
      description: '',
      logoUrl: '',
      faviconUrl: '',
      headingFont: 'Inter',
      bodyFont: 'Inter',
      supportEmail: '',
      supportUrl: '',
      termsUrl: '',
      privacyUrl: '',
      allowEmailBranding: false,
      enableContrastCorrections: true,
      presetId: null,
      gradientEnabled: false,
      gradientFrom: '',
      gradientTo: '',
      gradientAngle: '135deg',
      customCopy: {},
    };
  }

  const themeModeIntent: 'light' | 'dark' = theme.themeModeIntent === 'dark' ? 'dark' : 'light';
  const modeTokens =
    themeModeIntent === 'dark'
      ? ((theme.tokensDark as Record<string, string> | null) || (theme.tokens as Record<string, string>) || defaultTokens())
      : ((theme.tokensLight as Record<string, string> | null) || (theme.tokens as Record<string, string>) || defaultTokens());
  return {
    tokens: modeTokens,
    themeModeIntent,
    themeName: 'Custom Theme',
    brandName: theme.orgName || 'LearnPlay',
    description: '',
    logoUrl: theme.logoUrl || '',
    faviconUrl: theme.faviconUrl || '',
    headingFont: theme.fontHeading || 'Inter',
    bodyFont: theme.fontBody || 'Inter',
    supportEmail: theme.supportEmail || '',
    supportUrl: theme.supportUrl || '',
    termsUrl: theme.termsUrl || '',
    privacyUrl: theme.privacyUrl || '',
    allowEmailBranding: theme.allowEmailBranding || false,
    enableContrastCorrections: theme.enableContrastCorrections !== false,
    presetId: theme.presetId || null,
    gradientEnabled: theme.gradientEnabled || false,
    gradientFrom: theme.gradientFrom || '',
    gradientTo: theme.gradientTo || '',
    gradientAngle: theme.gradientAngle || '135deg',
    customCopy: theme.customCopy || {},
  };
}

function DomainManager({ 
  domains, 
  isLoading,
  onAdd,
  onVerify,
  onRemove,
  onToggleActive,
  isAdding,
  isVerifying,
  verifyingDomainId,
}: {
  domains: OrganizationDomain[];
  isLoading: boolean;
  onAdd: (domain: string) => void;
  onVerify: (domainId: string) => void;
  onRemove: (domainId: string) => void;
  onToggleActive: (domainId: string, isActive: boolean) => void;
  isAdding: boolean;
  isVerifying: boolean;
  verifyingDomainId?: string | null;
}) {
  const [newDomain, setNewDomain] = useState('');
  const { toast } = useToast();

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied', description: 'Text copied to clipboard' });
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-card">
      <div className="flex items-center gap-2">
        <Globe className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Custom Domains</h3>
      </div>
      
      <p className="text-sm text-muted-foreground">
        Add custom domains to serve your branded experience. Users visiting these domains will see your branding.
      </p>

      <div className="flex gap-2">
        <Input
          placeholder="learn.yourcompany.com"
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          className="flex-1"
          data-testid="input-new-domain"
        />
        <Button onClick={() => { onAdd(newDomain); setNewDomain(''); }}
          disabled={!newDomain || isAdding}
          className="min-h-[44px] touch-manipulation"
          data-testid="button-add-domain"
        >
          {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : domains.length > 0 ? (
        <div className="space-y-3">
          {domains.map((domain) => {
            const isVerifyingThisDomain = isVerifying && verifyingDomainId === domain.id;
            
            return (
              <div 
                key={domain.id} 
                className={cn(
                  "p-4 rounded-lg border bg-background transition-colors",
                  domain.verified && domain.isActive !== false ? "border-[var(--success)]/30" : "",
                  domain.verified && domain.isActive === false ? "border-[var(--game-gold)]/30 bg-muted/40" : ""
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{domain.domain}</span>
                      {domain.verified ? (
                        <>
                          <Badge variant="default" >
                            <Check className="h-3 w-3 mr-1" />
                            Verified
                          </Badge>
                          {domain.isActive === false ? (
                            <Badge variant="secondary" className="text-glow-gold">
                              <Power className="h-3 w-3 mr-1" />
                              Inactive
                            </Badge>
                          ) : (
                            <Badge variant="secondary" >
                              Active
                            </Badge>
                          )}
                        </>
                      ) : (
                        <Badge variant="secondary" className="text-glow-gold">
                          Pending Verification
                        </Badge>
                      )}
                    </div>
                    
                    {!domain.verified && (
                      <div className="mt-3 space-y-2">
                        <Alert >
                          <Info className="h-4 w-4" />
                          <AlertDescription className="text-xs">
                            <strong>Step 1:</strong> Add a TXT record to your domain's DNS settings<br />
                            <strong>Step 2:</strong> Wait for DNS propagation (can take up to 48 hours)<br />
                            <strong>Step 3:</strong> Click "Verify" to confirm ownership
                          </AlertDescription>
                        </Alert>
                        
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground font-medium">DNS TXT Record Value:</p>
                          <div className="flex items-center gap-2 p-2 bg-muted rounded font-mono text-xs border">
                            <code className="truncate flex-1 select-all">{domain.verificationToken}</code>
                            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(domain.verificationToken)}
                              aria-label={`Copy verification token for ${domain.domain}`}
                              title="Copy DNS verification token"
                              className="shrink-0"
                              data-testid={`button-copy-token-${domain.id}`}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            Record Name: @ or _learnplay-verify • Type: TXT
                          </p>
                        </div>
                        
                        {isVerifyingThisDomain && (
                          <div className="flex items-center gap-2 text-xs text-primary">
                            <RefreshCw className="h-3 w-3 animate-spin" />
                            <span>Checking DNS records...</span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {domain.verified && (
                      <div className="mt-2 flex items-center gap-3">
                        <div className="flex items-center gap-2">
                        <Switch
                            id={`domain-active-${domain.id}`}
                            checked={domain.isActive !== false}
                            onCheckedChange={(checked) => onToggleActive(domain.id, checked)}
                            aria-label={`Toggle active domain for ${domain.domain}`}
                            data-testid={`switch-active-${domain.id}`}
                          />
                          <label 
                            htmlFor={`domain-active-${domain.id}`}
                            className="text-sm text-muted-foreground cursor-pointer"
                          >
                            {domain.isActive !== false ? 'Domain is serving branding' : 'Domain is temporarily disabled'}
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 shrink-0">
                    {!domain.verified && (
                      <Button variant="outline" size="sm" onClick={() => onVerify(domain.id)}
                        disabled={isVerifying}
                        className="min-h-[44px] touch-manipulation"
                        data-testid={`button-verify-${domain.id}`}
                      >
                        {isVerifyingThisDomain ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Check className="h-3 w-3 mr-1" />
                        )}
                        Verify
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => onRemove(domain.id)}
                      aria-label={`Remove domain ${domain.domain}`}
                      title="Remove domain"
                      className="min-h-[44px] touch-manipulation"
                      data-testid={`button-remove-${domain.id}`}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-6">
          <Globe className="h-10 w-10 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No custom domains configured</p>
          <p className="text-xs text-muted-foreground mt-1">Add a domain to serve your branded experience</p>
        </div>
      )}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '').trim();
  const full = normalized.length === 3 ? normalized.split('').map((v) => v + v).join('') : normalized;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHslString(r: number, g: number, b: number): string {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
  }
  h = Math.round((h * 60 + 360) % 360);
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return `hsl(${h}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

function getHueFromHex(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const hsl = rgbToHslString(r, g, b);
  const match = hsl.match(/hsl\((\d+)/i);
  return match ? Number(match[1]) : 210;
}

function parseColorToHex(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  const trimmed = color.trim();
  if (!trimmed) return fallback;

  const hexMatch = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    if (hexMatch[1].length === 3) {
      const [r, g, b] = hexMatch[1].split('');
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return `#${hexMatch[1].toLowerCase()}`;
  }

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*([0-9.]+)\s*(?:,\s*|\s+)([0-9.]+)\s*(?:,\s*|\s+)([0-9.]+)(?:\s*(?:\/|,)\s*[0-9.%]+)?\s*\)$/i
  );
  if (rgbMatch) {
    return rgbToHex(Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3]));
  }

  const hslMatch = trimmed.match(
    /^hsla?\(\s*([0-9.]+)(?:deg|rad|grad|turn)?\s*(?:,\s*|\s+)([0-9.]+)%\s*(?:,\s*|\s+)([0-9.]+)%(?:\s*(?:\/|,)\s*[0-9.%]+)?\s*\)$/i
  );
  if (hslMatch) {
    const h = ((Number(hslMatch[1]) % 360) + 360) % 360;
    const s = clamp(Number(hslMatch[2]), 0, 100) / 100;
    const l = clamp(Number(hslMatch[3]), 0, 100) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let rr = 0, gg = 0, bb = 0;
    if (h < 60) [rr, gg, bb] = [c, x, 0];
    else if (h < 120) [rr, gg, bb] = [x, c, 0];
    else if (h < 180) [rr, gg, bb] = [0, c, x];
    else if (h < 240) [rr, gg, bb] = [0, x, c];
    else if (h < 300) [rr, gg, bb] = [x, 0, c];
    else [rr, gg, bb] = [c, 0, x];
    return rgbToHex((rr + m) * 255, (gg + m) * 255, (bb + m) * 255);
  }

  return fallback;
}

function suggestedSecondaries(primaryHex: string): string[] {
  const hue = getHueFromHex(primaryHex);
  const hues = [hue + 24, hue + 150, hue + 210, hue + 330];
  return hues.map((h) => {
    const rad = ((h % 360) + 360) % 360;
    const sat = 58;
    const light = 38;
    const c = (1 - Math.abs((2 * light) / 100 - 1)) * (sat / 100);
    const x = c * (1 - Math.abs(((rad / 60) % 2) - 1));
    const m = light / 100 - c / 2;
    let rr = 0, gg = 0, bb = 0;
    if (rad < 60) [rr, gg, bb] = [c, x, 0];
    else if (rad < 120) [rr, gg, bb] = [x, c, 0];
    else if (rad < 180) [rr, gg, bb] = [0, c, x];
    else if (rad < 240) [rr, gg, bb] = [0, x, c];
    else if (rad < 300) [rr, gg, bb] = [x, 0, c];
    else [rr, gg, bb] = [c, 0, x];
    return rgbToHex((rr + m) * 255, (gg + m) * 255, (bb + m) * 255);
  });
}

function suggestedAccents(primaryHex: string, secondaryHex: string): string[] {
  const pHue = getHueFromHex(primaryHex);
  const sHue = getHueFromHex(secondaryHex);
  const midpoint = ((pHue + sHue) / 2 + 360) % 360;
  const hues = [midpoint + 170, midpoint + 210, midpoint + 40, midpoint + 320];
  return hues.map((h) => {
    const rad = ((h % 360) + 360) % 360;
    const sat = 78;
    const light = 48;
    const c = (1 - Math.abs((2 * light) / 100 - 1)) * (sat / 100);
    const x = c * (1 - Math.abs(((rad / 60) % 2) - 1));
    const m = light / 100 - c / 2;
    let rr = 0, gg = 0, bb = 0;
    if (rad < 60) [rr, gg, bb] = [c, x, 0];
    else if (rad < 120) [rr, gg, bb] = [x, c, 0];
    else if (rad < 180) [rr, gg, bb] = [0, c, x];
    else if (rad < 240) [rr, gg, bb] = [0, x, c];
    else if (rad < 300) [rr, gg, bb] = [x, 0, c];
    else [rr, gg, bb] = [c, 0, x];
    return rgbToHex((rr + m) * 255, (gg + m) * 255, (bb + m) * 255);
  });
}

type PaletteRecommendationItem = {
  hex: string;
  rationale: string;
  source: 'ai' | 'deterministic';
  score: number;
  accessibility: {
    criticalIssues: number;
    warningIssues: number;
  };
};

type PaletteContractRecommendation = {
  pair: string;
  fgToken: string;
  bgToken: string;
  ratio: number;
  required: number;
  priority: 'critical' | 'high' | 'medium';
  recommendedChange: string;
};

function normalizeRecommendationItems(
  raw: unknown,
  fallback: string[],
  fallbackRationale: string,
): PaletteRecommendationItem[] {
  if (!Array.isArray(raw)) {
    return fallback.map((hex) => ({
      hex,
      rationale: fallbackRationale,
      source: 'deterministic',
      score: 0,
      accessibility: { criticalIssues: 0, warningIssues: 0 },
    }));
  }

  const parsed = raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const hex = String(row.hex || '').trim().toLowerCase();
      if (!/^#([0-9a-f]{6})$/i.test(hex)) return null;
      const source = row.source === 'ai' ? 'ai' : 'deterministic';
      const score = Number.isFinite(Number(row.score)) ? Number(row.score) : 0;
      const accessibility = row.accessibility && typeof row.accessibility === 'object'
        ? (row.accessibility as Record<string, unknown>)
        : {};
      const criticalIssues = Number.isFinite(Number(accessibility.criticalIssues)) ? Number(accessibility.criticalIssues) : 0;
      const warningIssues = Number.isFinite(Number(accessibility.warningIssues)) ? Number(accessibility.warningIssues) : 0;
      return {
        hex,
        rationale: String(row.rationale || fallbackRationale),
        source,
        score,
        accessibility: {
          criticalIssues,
          warningIssues,
        },
      } as PaletteRecommendationItem;
    })
    .filter((item): item is PaletteRecommendationItem => !!item);

  if (parsed.length > 0) return parsed;

  return fallback.map((hex) => ({
    hex,
    rationale: fallbackRationale,
    source: 'deterministic',
    score: 0,
    accessibility: { criticalIssues: 0, warningIssues: 0 },
  }));
}

function PaletteBuilder({
  currentTokens,
  anchorSyncSeed,
  tone,
  recommendPaletteUrl,
  buildPaletteUrl,
  onToneChange,
  onApply,
}: {
  currentTokens: Record<string, string>;
  anchorSyncSeed: string;
  tone: 'light' | 'dark';
  recommendPaletteUrl: string;
  buildPaletteUrl: string;
  onToneChange: (tone: 'light' | 'dark', anchors: { primaryHex: string; secondaryHex: string; accentHex: string }) => void;
  onApply: (tokens: Record<string, string>, tone: 'light' | 'dark') => void;
}) {
  const { toast } = useToast();
  const [primaryHex, setPrimaryHex] = useState('#0a66c2');
  const [secondaryHex, setSecondaryHex] = useState('#124076');
  const [accentHex, setAccentHex] = useState('#16a3a5');
  const [secondaryRecommendations, setSecondaryRecommendations] = useState<PaletteRecommendationItem[]>([]);
  const [accentRecommendations, setAccentRecommendations] = useState<PaletteRecommendationItem[]>([]);
  const [loadingSecondaryRecommendations, setLoadingSecondaryRecommendations] = useState(false);
  const [loadingAccentRecommendations, setLoadingAccentRecommendations] = useState(false);
  const [isApplyingAiPalette, setIsApplyingAiPalette] = useState(false);
  const [aiModelProfile, setAiModelProfile] = useState<'fast' | 'thinking'>('fast');
  const aiModelProfileRef = useRef<'fast' | 'thinking'>('fast');
  const toneRef = useRef<'light' | 'dark'>(tone);
  const applyRequestIdRef = useRef(0);
  const anchorsRef = useRef<{ primaryHex: string; secondaryHex: string; accentHex: string }>({
    primaryHex: '#0a66c2',
    secondaryHex: '#124076',
    accentHex: '#16a3a5',
  });
  const [lastApplySource, setLastApplySource] = useState<'ai-assisted' | 'deterministic' | null>(null);
  const [contractRecommendations, setContractRecommendations] = useState<PaletteContractRecommendation[]>([]);
  const [lastAiDiagnostics, setLastAiDiagnostics] = useState<{
    aiModelProfile: 'fast' | 'thinking';
    aiModelResolved: string;
    strictAiOnly: boolean;
    autoFixContrast: boolean;
    tone: 'light' | 'dark';
    elapsedMs: number;
    aiCandidateCount: number;
    anchorPreserved: boolean;
  } | null>(null);

  useEffect(() => {
    toneRef.current = tone;
  }, [tone]);

  useEffect(() => {
    const nextPrimary = parseColorToHex(currentTokens['--primary'], '#0a66c2');
    const nextSecondary = parseColorToHex(currentTokens['--secondary'], '#124076');
    const nextAccent = parseColorToHex(currentTokens['--accent'], '#16a3a5');
    setPrimaryHex(nextPrimary);
    setSecondaryHex(nextSecondary);
    setAccentHex(nextAccent);
    anchorsRef.current = {
      primaryHex: nextPrimary,
      secondaryHex: nextSecondary,
      accentHex: nextAccent,
    };
  }, [anchorSyncSeed]);

  const updateAnchors = useCallback((next: Partial<{ primaryHex: string; secondaryHex: string; accentHex: string }>) => {
    const merged = {
      ...anchorsRef.current,
      ...next,
    };
    anchorsRef.current = merged;
    if (next.primaryHex !== undefined) setPrimaryHex(next.primaryHex);
    if (next.secondaryHex !== undefined) setSecondaryHex(next.secondaryHex);
    if (next.accentHex !== undefined) setAccentHex(next.accentHex);
  }, []);

  const secondaryFallbackSuggestions = useMemo(() => suggestedSecondaries(primaryHex), [primaryHex]);
  const accentFallbackSuggestions = useMemo(() => suggestedAccents(primaryHex, secondaryHex), [primaryHex, secondaryHex]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const debounce = window.setTimeout(() => {
      const loadSecondaryRecommendations = async () => {
        setLoadingSecondaryRecommendations(true);
        try {
          const response = await fetch(recommendPaletteUrl, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              mode: 'secondary',
              primaryHex,
              tone,
              count: 5,
              aiModelProfile,
            }),
          });
          if (!response.ok) throw new Error('secondary recommendation request failed');
          const payload = await response.json();
          if (!active) return;
          setSecondaryRecommendations(
            normalizeRecommendationItems(
              (payload as Record<string, unknown>)?.candidates,
              secondaryFallbackSuggestions,
              'Deterministic harmony candidate from selected primary color',
            ),
          );
        } catch (error: any) {
          if (!active) return;
          if (error?.name === 'AbortError') return;
          setSecondaryRecommendations(
            normalizeRecommendationItems(
              null,
              secondaryFallbackSuggestions,
              'Deterministic harmony candidate from selected primary color',
            ),
          );
        } finally {
          if (active) setLoadingSecondaryRecommendations(false);
        }
      };
      void loadSecondaryRecommendations();
    }, 350);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(debounce);
    };
  }, [aiModelProfile, primaryHex, tone, recommendPaletteUrl, secondaryFallbackSuggestions]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const debounce = window.setTimeout(() => {
      const loadAccentRecommendations = async () => {
        setLoadingAccentRecommendations(true);
        try {
          const response = await fetch(recommendPaletteUrl, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              mode: 'accent',
              primaryHex,
              secondaryHex,
              tone,
              count: 5,
              aiModelProfile,
            }),
          });
          if (!response.ok) throw new Error('accent recommendation request failed');
          const payload = await response.json();
          if (!active) return;
          setAccentRecommendations(
            normalizeRecommendationItems(
              (payload as Record<string, unknown>)?.candidates,
              accentFallbackSuggestions,
              'Deterministic harmony candidate from selected primary and secondary colors',
            ),
          );
        } catch (error: any) {
          if (!active) return;
          if (error?.name === 'AbortError') return;
          setAccentRecommendations(
            normalizeRecommendationItems(
              null,
              accentFallbackSuggestions,
              'Deterministic harmony candidate from selected primary and secondary colors',
            ),
          );
        } finally {
          if (active) setLoadingAccentRecommendations(false);
        }
      };
      void loadAccentRecommendations();
    }, 350);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(debounce);
    };
  }, [aiModelProfile, primaryHex, secondaryHex, tone, recommendPaletteUrl, accentFallbackSuggestions]);

  const selectedSecondaryRecommendation = useMemo(
    () => secondaryRecommendations.find((candidate) => candidate.hex === secondaryHex.toLowerCase()) || null,
    [secondaryRecommendations, secondaryHex],
  );
  const selectedAccentRecommendation = useMemo(
    () => accentRecommendations.find((candidate) => candidate.hex === accentHex.toLowerCase()) || null,
    [accentRecommendations, accentHex],
  );

  const previewTokens = useMemo(
    () =>
      generatePaletteTokens({
        primaryHex,
        secondaryHex,
        accentHex,
        tone,
        autoFix: true,
      }),
    [primaryHex, secondaryHex, accentHex, tone]
  );
  const previewWarnings = useMemo(() => getContrastWarnings(previewTokens), [previewTokens]);
  const previewCriticalCount = previewWarnings.filter((w) => w.level === 'error').length;

  const applyAiPalette = useCallback(async (options?: { autoFixContrast?: boolean }) => {
    const requestId = applyRequestIdRef.current + 1;
    applyRequestIdRef.current = requestId;
    setIsApplyingAiPalette(true);
    try {
      const requestedModelProfile = aiModelProfileRef.current;
      const requestedTone = toneRef.current;
      const anchors = anchorsRef.current;
      const response = await fetch(buildPaletteUrl, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryHex: anchors.primaryHex,
          secondaryHex: anchors.secondaryHex,
          accentHex: anchors.accentHex,
          tone: requestedTone,
          aiPreferred: true,
          strictAiOnly: true,
          autoFixContrast: options?.autoFixContrast === true,
          aiModelProfile: requestedModelProfile,
          allowAnchorAdjustments: false,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const recommendations = Array.isArray((data as any)?.recommendations)
          ? ((data as any).recommendations as PaletteContractRecommendation[])
          : [];
        throw Object.assign(new Error(String((data as any)?.error || 'AI palette build failed')), {
          recommendations,
        });
      }
      const payload = await response.json();
      if (requestId !== applyRequestIdRef.current) {
        return;
      }
      if (toneRef.current !== requestedTone) {
        toast({
          title: 'Tone changed during palette build',
          description: 'Discarded stale AI result to preserve your latest Light/Dark selection.',
        });
        return;
      }
      const source = (payload?.source === 'ai-assisted' ? 'ai-assisted' : 'deterministic') as 'ai-assisted' | 'deterministic';
      const tokens = payload?.tokens && typeof payload.tokens === 'object'
        ? (payload.tokens as Record<string, string>)
        : previewTokens;
      const diagnostics = payload?.diagnostics && typeof payload.diagnostics === 'object'
        ? (payload.diagnostics as {
            aiModelProfile: 'fast' | 'thinking';
            aiModelResolved: string;
            strictAiOnly: boolean;
            autoFixContrast: boolean;
            tone: 'light' | 'dark';
            elapsedMs: number;
            aiCandidateCount: number;
            anchorPreserved: boolean;
          })
        : null;
      setLastAiDiagnostics(diagnostics);
      setLastApplySource(source);
      setContractRecommendations(
        Array.isArray(payload?.recommendations)
          ? (payload.recommendations as PaletteContractRecommendation[])
          : [],
      );
      const finalCritical = Number((payload?.accessibility as any)?.finalCritical || 0);
      const finalWarnings = Number((payload?.accessibility as any)?.finalWarnings || 0);
      // Light/Dark is immutable user intent for this apply request.
      onApply(tokens, requestedTone);
      if (diagnostics && diagnostics.anchorPreserved === false) {
        toast({
          title: 'Anchor warning',
          description: 'AI output attempted to alter selected anchors. Selected primary, secondary, and accent were preserved.',
          variant: 'destructive',
        });
      }
      if (finalCritical > 0) {
        toast({
          title: 'Palette applied with remaining critical advisories',
          description: `${finalCritical} critical and ${finalWarnings} warning issue(s) remain. Use auto-fix or Accessibility remediation before activation.`,
          variant: 'destructive',
        });
      } else if (finalWarnings > 0) {
        toast({
          title: 'Palette applied',
          description: `${finalWarnings} warning issue(s) remain.`,
        });
      } else {
        toast({
          title: 'Palette applied',
          description: source === 'ai-assisted' ? 'AI-assisted synthesis succeeded with no remaining advisories.' : 'Deterministic synthesis succeeded with no remaining advisories.',
        });
      }
    } catch (error: any) {
      setLastApplySource(null);
      setLastAiDiagnostics(null);
      setContractRecommendations(
        Array.isArray(error?.recommendations)
          ? (error.recommendations as PaletteContractRecommendation[])
          : [],
      );
      toast({
        title: 'AI Palette Build Failed',
        description: String(error?.message || 'Unable to synthesize an acceptable AI palette right now.'),
        variant: 'destructive',
      });
    } finally {
      if (requestId === applyRequestIdRef.current) {
        setIsApplyingAiPalette(false);
      }
    }
  }, [buildPaletteUrl, onApply, previewTokens, toast]);

  return (
    <div className="mx-4 mt-3 rounded-lg border bg-card p-4 space-y-4" data-testid="palette-builder">
      <div>
        <h3 className="font-semibold">Palette Builder</h3>
        <p className="text-sm text-muted-foreground">
          Select your brand primary color, then choose recommended secondary and accent colors.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">Primary</span>
          <Input
            type="color"
            value={primaryHex}
            disabled={isApplyingAiPalette}
            onInput={(e) => updateAnchors({ primaryHex: (e.target as HTMLInputElement).value })}
            onChange={(e) => updateAnchors({ primaryHex: e.target.value })}
            className="h-10 p-1"
          />
        </label>
        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">Secondary</span>
          <Input
            type="color"
            value={secondaryHex}
            disabled={isApplyingAiPalette}
            onInput={(e) => updateAnchors({ secondaryHex: (e.target as HTMLInputElement).value })}
            onChange={(e) => updateAnchors({ secondaryHex: e.target.value })}
            className="h-10 p-1"
          />
        </label>
        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">Accent</span>
          <Input
            type="color"
            value={accentHex}
            disabled={isApplyingAiPalette}
            onInput={(e) => updateAnchors({ accentHex: (e.target as HTMLInputElement).value })}
            onChange={(e) => updateAnchors({ accentHex: e.target.value })}
            className="h-10 p-1"
          />
        </label>
        <div className="space-y-1">
          <span className="text-sm text-muted-foreground">Tone</span>
          <Select
            value={tone}
            disabled={isApplyingAiPalette}
            onValueChange={(nextTone: 'light' | 'dark') => {
              // Keep request tone in sync immediately to avoid stale tone during quick apply clicks.
              toneRef.current = nextTone;
              onToneChange(nextTone, anchorsRef.current);
            }}
          >
            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Recommended secondary colors {loadingSecondaryRecommendations ? '(loading...)' : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          {secondaryRecommendations.map((candidate) => (
            <button
              key={candidate.hex}
              type="button"
              disabled={isApplyingAiPalette}
              onClick={() => updateAnchors({ secondaryHex: candidate.hex })}
              className={cn('h-8 w-8 rounded border', secondaryHex === candidate.hex && 'ring-2 ring-primary')}
              style={{ backgroundColor: candidate.hex }}
              title={`${candidate.hex} • ${candidate.source}`}
            />
          ))}
        </div>
        {selectedSecondaryRecommendation && (
          <p className="text-[11px] text-muted-foreground">
            Secondary source: <span className="font-medium">{selectedSecondaryRecommendation.source === 'ai' ? 'AI' : 'Fallback'}</span>
            {' '}• {selectedSecondaryRecommendation.rationale}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Recommended accent colors {loadingAccentRecommendations ? '(loading...)' : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          {accentRecommendations.map((candidate) => (
            <button
              key={candidate.hex}
              type="button"
              disabled={isApplyingAiPalette}
              onClick={() => updateAnchors({ accentHex: candidate.hex })}
              className={cn('h-8 w-8 rounded border', accentHex === candidate.hex && 'ring-2 ring-primary')}
              style={{ backgroundColor: candidate.hex }}
              title={`${candidate.hex} • ${candidate.source}`}
            />
          ))}
        </div>
        {selectedAccentRecommendation && (
          <p className="text-[11px] text-muted-foreground">
            Accent source: <span className="font-medium">{selectedAccentRecommendation.source === 'ai' ? 'AI' : 'Fallback'}</span>
            {' '}• {selectedAccentRecommendation.rationale}
          </p>
        )}
      </div>
      {previewWarnings.length > 0 && (
        <Alert variant={previewCriticalCount > 0 ? 'destructive' : 'default'}>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Compiled palette preview has {previewWarnings.length} accessibility warning(s)
            {previewCriticalCount > 0 && <> including {previewCriticalCount} critical issue(s).</>}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
      <div className="w-full max-w-xs space-y-1">
        <p className="text-xs text-muted-foreground">
          Fast uses Gemini default text model. Thinking uses Gemini thinking script model.
        </p>
        <Select
          value={aiModelProfile}
          disabled={isApplyingAiPalette}
          onValueChange={(value: 'fast' | 'thinking') => {
            aiModelProfileRef.current = value;
            setAiModelProfile(value);
          }}
        >
          <SelectTrigger className="h-9" data-testid="select-ai-model">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fast">Fast (Default Text Model)</SelectItem>
            <SelectItem value="thinking">Thinking (Thinking Script Model)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="button" disabled={isApplyingAiPalette} onClick={() => { void applyAiPalette(); }}
      >
        {isApplyingAiPalette ? 'Applying AI Palette...' : 'Apply AI Palette'}
      </Button>
        {previewCriticalCount > 0 && (
          <Button type="button" variant="secondary" disabled={isApplyingAiPalette} onClick={() => { void applyAiPalette({ autoFixContrast: true }); }}
          >
            Apply + Auto-fix Contrast
          </Button>
        )}
        {lastApplySource && (
          <Badge variant="secondary">
            Applied via {lastApplySource === 'ai-assisted' ? 'AI-assisted anchor synthesis + deterministic compiler' : 'deterministic synthesis'}
          </Badge>
        )}
      </div>
      {lastAiDiagnostics && (
        <p className="text-xs text-muted-foreground">
          Model: <span className="font-medium">{lastAiDiagnostics.aiModelResolved}</span> ({lastAiDiagnostics.aiModelProfile}) •
          Tone: <span className="font-medium">{lastAiDiagnostics.tone}</span> •
          Time: <span className="font-medium">{Math.round(lastAiDiagnostics.elapsedMs)}ms</span> •
          Anchors preserved: <span className="font-medium">{lastAiDiagnostics.anchorPreserved ? 'yes' : 'no'}</span>
        </p>
      )}
      {contractRecommendations.length > 0 && (
        <Alert variant="default">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            AI contract-change recommendations:
            <div className="mt-2 space-y-1 text-xs">
              {contractRecommendations.slice(0, 5).map((recommendation, index) => (
                <p key={`${recommendation.pair}-${index}`}>
                  [{recommendation.priority}] {recommendation.recommendedChange}
                </p>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function WorkflowProgress({
  stage,
  onChange,
  canPublish,
}: {
  stage: WorkflowStage;
  onChange: (stage: WorkflowStage) => void;
  canPublish: boolean;
}) {
  const steps: Array<{
    id: WorkflowStage;
    label: string;
    hint: string;
    icon: JSX.Element;
    disabled?: boolean;
  }> = [
    { id: 'palette', label: 'Palette', hint: 'Select primary, secondary, accent', icon: <LibraryBig className="h-4 w-4" /> },
    { id: 'customize', label: 'Customize', hint: 'Tune colors, fonts, branding', icon: <Edit3 className="h-4 w-4" /> },
    { id: 'accessibility', label: 'Accessibility', hint: 'Review contrast advisories', icon: <ShieldCheck className="h-4 w-4" /> },
    { id: 'publish', label: 'Publish', hint: 'Save and activate', icon: <Rocket className="h-4 w-4" />, disabled: !canPublish },
  ];

  return (
    <div className="grid gap-2 md:grid-cols-4">
      {steps.map((step) => {
        const active = stage === step.id;
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => !step.disabled && onChange(step.id)}
            disabled={step.disabled}
            className={cn(
              "rounded-lg border px-3 py-2 text-left transition-colors",
              active ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted/50",
              step.disabled && "cursor-not-allowed border-border bg-muted/30 text-muted-foreground"
            )}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              {step.icon}
              {step.label}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{step.hint}</p>
          </button>
        );
      })}
    </div>
  );
}

function DesktopEditorLayout() {
  const [controlRailCollapsed, setControlRailCollapsed] = useState(false);
  
  return (
    <div className="h-full overflow-hidden flex flex-col">
      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
        <ResizablePanel 
          defaultSize={28} 
          minSize={20} 
          maxSize={40}
          collapsible
          collapsedSize={0}
          onCollapse={() => setControlRailCollapsed(true)}
          onExpand={() => setControlRailCollapsed(false)}
          className={cn(
            "bg-card/50 transition-all",
            controlRailCollapsed && "hidden"
          )}
        >
          <ScrollArea className="h-full">
            <ControlRail />
          </ScrollArea>
        </ResizablePanel>
        
        <ResizableHandle withHandle className="bg-border hover:bg-primary/20 transition-colors" />
        
        <ResizablePanel defaultSize={72} minSize={50}>
          <div className="h-full flex flex-col">
            {controlRailCollapsed && (
              <div className="shrink-0 px-2 py-1 border-b bg-muted/30">
                <Button variant="ghost" size="sm" onClick={() => setControlRailCollapsed(false)}
                  className="h-7 px-2"
                >
                  <PanelLeft className="h-4 w-4 mr-1" />
                  Show Controls
                </Button>
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-hidden">
              <PreviewTabs />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function MobileEditorLayout() {
  const [activePanel, setActivePanel] = useState<'controls' | 'preview'>('preview');
  
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 flex border-b bg-card/50">
        <button
          type="button"
          onClick={() => setActivePanel('controls')}
          aria-pressed={activePanel === 'controls'}
          aria-controls="brand-editor-controls-panel"
          className={cn(
            "flex-1 py-2.5 px-4 text-sm font-medium transition-colors",
            activePanel === 'controls' 
              ? "bg-primary text-primary-foreground" 
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          <PanelLeft className="h-4 w-4 inline-block mr-1.5" />
          Controls
        </button>
        <button
          type="button"
          onClick={() => setActivePanel('preview')}
          aria-pressed={activePanel === 'preview'}
          aria-controls="brand-editor-preview-panel"
          className={cn(
            "flex-1 py-2.5 px-4 text-sm font-medium transition-colors",
            activePanel === 'preview' 
              ? "bg-primary text-primary-foreground" 
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          <Info className="h-4 w-4 inline-block mr-1.5" />
          Preview
        </button>
      </div>
      
      <div className="flex-1 min-h-0 overflow-hidden">
        {activePanel === 'controls' ? (
          <ScrollArea className="h-full" id="brand-editor-controls-panel">
            <ControlRail />
          </ScrollArea>
        ) : (
          <div id="brand-editor-preview-panel" className="h-full">
            <PreviewTabs />
          </div>
        )}
      </div>
    </div>
  );
}

export default function ThemeEditor() {
  const { toast } = useToast();
  const {
    isImpersonating,
    isSuperAdmin,
    effectiveOrganizationId,
    runtimeContext,
  } = useAuth();
  const [workflowStage, setWorkflowStage] = useState<WorkflowStage>('palette');
  const [showAllSections, setShowAllSections] = useState(true);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<BrandEditorState | null>(null);
  const [initialState, setInitialState] = useState<BrandEditorState | null>(null);
  const editorStateRef = useRef<BrandEditorState | null>(null);
  const initialStateRef = useRef<BrandEditorState | null>(null);
  const lastHydratedEndpointRef = useRef<string | null>(null);
  const [contrastWarnings, setContrastWarnings] = useState<ContrastWarning[]>([]);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const hasOrganizationScope = runtimeContext.scopeMode === 'organization' && Boolean(effectiveOrganizationId);
  const canEditPlatformTheme = isSuperAdmin && runtimeContext.scopeMode === 'platform';
  const useSuperAdminEndpoints = isSuperAdmin;
  const apiTargets = useMemo(
    () => buildThemeEditorApiTargets({ selectedOrgId, useSuperAdminEndpoints }),
    [selectedOrgId, useSuperAdminEndpoints]
  );

  const { data: organizationsData, isLoading: orgsLoading } = useQuery<Organization[]>({
    queryKey: ['/api/admin/organizations'],
    enabled: useSuperAdminEndpoints,
  });

  const organizations = organizationsData || [];
  const previousImpersonatingRef = useRef<boolean>(false);

  useEffect(() => {
    if (selectedOrgId !== null) return;

    if (hasOrganizationScope && effectiveOrganizationId) {
      setSelectedOrgId(effectiveOrganizationId);
      return;
    }

    if (canEditPlatformTheme) {
      setSelectedOrgId(PLATFORM_THEME_ID);
    }
  }, [canEditPlatformTheme, effectiveOrganizationId, hasOrganizationScope, selectedOrgId]);

  useEffect(() => {
    if (!useSuperAdminEndpoints) return;
    if (hasOrganizationScope && effectiveOrganizationId && selectedOrgId !== effectiveOrganizationId) {
      setSelectedOrgId(effectiveOrganizationId);
    }
    if (previousImpersonatingRef.current && !isImpersonating && canEditPlatformTheme) {
      setSelectedOrgId(PLATFORM_THEME_ID);
    }
    previousImpersonatingRef.current = isImpersonating;
  }, [
    canEditPlatformTheme,
    effectiveOrganizationId,
    hasOrganizationScope,
    isImpersonating,
    selectedOrgId,
    useSuperAdminEndpoints,
  ]);

  const themeQueryKey = [apiTargets.fetchThemeUrl];
  const domainsQueryKey = [apiTargets.domainsUrl || '/api/domains-disabled'];

  const needsOrgContext = hasOrganizationScope && selectedOrgId === null;

  const { data: themeData, isLoading: themeLoading, error: themeError } = useQuery<{ theme: BrandingTheme | null }>({
    queryKey: themeQueryKey,
    queryFn: async () => {
      const response = await fetch(apiTargets.fetchThemeUrl, { credentials: 'include', cache: 'no-store' });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to fetch theme');
      }
      return response.json();
    },
    enabled: !needsOrgContext || organizations.length === 0 || selectedOrgId === PLATFORM_THEME_ID,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      if (error?.message?.includes('organization')) return false;
      return failureCount < 2;
    },
  });

  const { data: domainsData, isLoading: domainsLoading } = useQuery<{ domains: OrganizationDomain[] }>({
    queryKey: domainsQueryKey,
    queryFn: async () => {
      if (!apiTargets.domainsUrl) return { domains: [] };
      const response = await fetch(apiTargets.domainsUrl, { credentials: 'include', cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch domains');
      return response.json();
    },
    enabled: !!apiTargets.domainsUrl,
  });

  const [retainedSuggestionTokens, setRetainedSuggestionTokens] = useState<Record<string, string>>({});
  const hydrateRetainedSuggestions = useCallback((state: BrandEditorState | null) => {
    if (!state) {
      setRetainedSuggestionTokens({});
      return;
    }
    const retainedKeys = getThemeEditorMeta(state.customCopy).retainedContrastTokenKeys || [];
    const next: Record<string, string> = {};
    for (const tokenKey of retainedKeys) {
      const tokenValue = state.tokens[tokenKey];
      if (tokenValue) {
        next[tokenKey] = tokenValue;
      }
    }
    setRetainedSuggestionTokens(next);
  }, []);

  useEffect(() => {
    editorStateRef.current = editorState;
    initialStateRef.current = initialState;
  }, [editorState, initialState]);

  useEffect(() => {
    const currentEditorState = editorStateRef.current;
    const currentInitialState = initialStateRef.current;
    const isDirty = hasUnsavedThemeChanges(currentEditorState, currentInitialState);
    const shouldHydrate = shouldHydrateFetchedTheme({
      themeLoading,
      hasUnsavedChanges: isDirty,
      lastHydratedEndpoint: lastHydratedEndpointRef.current,
      nextEndpoint: apiTargets.fetchThemeUrl,
    });
    if (!shouldHydrate) return;

    const incoming = themeToEditorState(themeData?.theme || null);
    setEditorState(incoming);
    setInitialState(incoming);
    hydrateRetainedSuggestions(incoming);
    lastHydratedEndpointRef.current = apiTargets.fetchThemeUrl;
  }, [themeData, themeLoading, apiTargets.fetchThemeUrl, hydrateRetainedSuggestions]);

  useEffect(() => {
    if (editorState) {
      const warnings = getContrastWarnings(editorState.tokens);
      setContrastWarnings(warnings);
    }
  }, [editorState?.tokens]);

  const criticalContrastWarnings = useMemo(
    () => contrastWarnings.filter((warning) => warning.level === 'error'),
    [contrastWarnings]
  );
  const hasCriticalContrastIssues = criticalContrastWarnings.length > 0;
  const retainedSuggestionTokenKeys = useMemo(() => {
    if (!editorState) return [];
    return Object.entries(retainedSuggestionTokens)
      .filter(([tokenKey, retainedValue]) => editorState.tokens[tokenKey] === retainedValue)
      .map(([tokenKey]) => tokenKey);
  }, [editorState, retainedSuggestionTokens]);
  useEffect(() => {
    if (!editorState) return;
    setRetainedSuggestionTokens((prev) => {
      const next: Record<string, string> = {};
      for (const [tokenKey, retainedValue] of Object.entries(prev)) {
        if (editorState.tokens[tokenKey] === retainedValue) {
          next[tokenKey] = retainedValue;
        }
      }
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [editorState?.tokens]);
  const contrastRemediation = useMemo(() => {
    if (!editorState) {
      return { correctedTokens: {}, corrections: [], skippedKeys: [] };
    }
    return getContrastCorrectedTokens(editorState.tokens, {
      isDark: (editorState.themeModeIntent || 'light') === 'dark',
      skipKeys: retainedSuggestionTokenKeys,
    });
  }, [editorState, retainedSuggestionTokenKeys]);
  const actionableContrastCorrections = useMemo(() => {
    if (!editorState) return [];
    const filtered = contrastRemediation.corrections.filter(
      (correction) =>
        normalizeTokenColorValue(editorState.tokens[correction.tokenKey]) !==
        normalizeTokenColorValue(correction.correctedValue)
    );
    const uniqueByToken = new Map<string, (typeof filtered)[number]>();
    for (const correction of filtered) {
      const existing = uniqueByToken.get(correction.tokenKey);
      if (!existing || correction.newRatio > existing.newRatio) {
        uniqueByToken.set(correction.tokenKey, correction);
      }
    }
    return Array.from(uniqueByToken.values());
  }, [contrastRemediation.corrections, editorState]);
  const groupedContrastCorrections = useMemo(() => {
    const grouped = new Map<string, Array<(typeof contrastRemediation.corrections)[number]>>();
    for (const correction of actionableContrastCorrections) {
      const group = tokenGroupName(correction.tokenKey);
      const list = grouped.get(group) || [];
      list.push(correction);
      grouped.set(group, list);
    }
    return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [actionableContrastCorrections]);

  const saveMutation = useMutation({
    mutationFn: async (state: BrandEditorState) => {
      const retainedKeys = Object.entries(retainedSuggestionTokens)
        .filter(([tokenKey, retainedValue]) => state.tokens[tokenKey] === retainedValue)
        .map(([tokenKey]) => tokenKey);
      return apiRequest(apiTargets.saveThemeUrl, {
        method: 'POST',
        body: JSON.stringify({
          orgName: state.brandName,
          fontHeading: state.headingFont,
          fontBody: state.bodyFont,
          logoUrl: state.logoUrl || null,
          faviconUrl: state.faviconUrl || null,
          supportUrl: state.supportUrl || null,
          supportEmail: state.supportEmail || null,
          termsUrl: state.termsUrl || null,
          privacyUrl: state.privacyUrl || null,
          themeModeIntent: state.themeModeIntent || 'light',
          allowEmailBranding: state.allowEmailBranding,
          enableContrastCorrections: state.enableContrastCorrections !== false,
          tokens: state.tokens,
          presetId: state.presetId ?? null,
          gradientEnabled: state.gradientEnabled || false,
          gradientFrom: state.gradientFrom || null,
          gradientTo: state.gradientTo || null,
          gradientAngle: state.gradientAngle || '135deg',
          customCopy: withThemeEditorMeta(state.customCopy, { retainedContrastTokenKeys: retainedKeys }),
        }),
      });
    },
    onSuccess: async (data: any, savedState) => {
      queryClient.invalidateQueries({ queryKey: themeQueryKey });
      await refreshBrandingCaches();
      const persisted = data?.theme ? themeToEditorState(data.theme) : savedState;
      setEditorState(persisted);
      setInitialState(persisted);
      hydrateRetainedSuggestions(persisted);
      const isDraft = (data?.theme?.status || 'draft') !== 'active';
      toast({
        title: 'Theme saved',
        description: isDraft
          ? 'Changes are saved as draft. Activate to publish on runtime pages.'
          : 'Your branding changes are now live.',
      });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to save theme', variant: 'destructive' });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (payload?: { allowCriticalAdvisories?: boolean }) => {
      return apiRequest(apiTargets.activateThemeUrl, {
        method: 'POST',
        body: JSON.stringify({
          // Explicit-only override path; default activation enforces full contract readiness.
          allowCriticalAdvisories: payload?.allowCriticalAdvisories === true,
        }),
      });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: themeQueryKey });
      await refreshBrandingCaches();
      try {
        const response = await fetch(apiTargets.fetchThemeUrl, { credentials: 'include', cache: 'no-store' });
        if (response.ok) {
          const payload = await response.json();
          const activatedState = themeToEditorState(payload?.theme || null);
          setEditorState(activatedState);
          setInitialState(activatedState);
          hydrateRetainedSuggestions(activatedState);
        }
      } catch {
        // Best effort sync after activation; toast below still confirms activation.
      }
      toast({ title: 'Theme activated', description: 'Your branding is now live!' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to activate theme', variant: 'destructive' });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(apiTargets.resetThemeUrl, { method: 'POST' });
    },
    onSuccess: async (data: any) => {
      queryClient.invalidateQueries({ queryKey: themeQueryKey });
      await refreshBrandingCaches();

      let reloadedTheme: BrandingTheme | null = data?.theme || null;
      if (!reloadedTheme) {
        try {
          const response = await fetch(apiTargets.fetchThemeUrl, { credentials: 'include', cache: 'no-store' });
          if (response.ok) {
            const payload = await response.json();
            reloadedTheme = payload?.theme || null;
          }
        } catch {
          // Best effort, fall back to resolved theme hydration below.
        }
      }
      if (!reloadedTheme) {
        try {
          const resolvedResponse = await fetch('/api/theme/resolved', { credentials: 'include', cache: 'no-store' });
          if (resolvedResponse.ok) {
            const resolved = await resolvedResponse.json();
            reloadedTheme = {
              orgName: resolved?.orgName || editorState?.brandName || 'LearnPlay',
              status: 'draft',
              themeModeIntent: resolved?.themeModeIntent === 'dark' ? 'dark' : 'light',
              tokens: resolved?.tokens || editorState?.tokens || defaultTokens(),
              logoUrl: resolved?.logoUrl || editorState?.logoUrl || null,
              faviconUrl: resolved?.faviconUrl || editorState?.faviconUrl || null,
              fontHeading: resolved?.fontHeading || editorState?.headingFont || 'Inter',
              fontBody: resolved?.fontBody || editorState?.bodyFont || 'Inter',
              supportUrl: resolved?.supportUrl || null,
              supportEmail: resolved?.supportEmail || null,
              termsUrl: resolved?.termsUrl || null,
              privacyUrl: resolved?.privacyUrl || null,
              allowEmailBranding: !!resolved?.allowEmailBranding,
              enableContrastCorrections: resolved?.enableContrastCorrections !== false,
              customCopy: resolved?.customCopy || editorState?.customCopy || {},
            };
          }
        } catch {
          // Fall through to null fallback.
        }
      }

      const newState = themeToEditorState(reloadedTheme);
      setEditorState(newState);
      setInitialState(newState);
      hydrateRetainedSuggestions(newState);
      toast({
        title: 'Theme reset',
        description: 'Branding has been reset to platform defaults.',
      });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to reset theme', variant: 'destructive' });
    },
  });

  const addDomainMutation = useMutation({
    mutationFn: async (domain: string) => {
      if (!apiTargets.domainsUrl) {
        throw new Error('Domain management is not available in platform theme mode');
      }
      const url = apiTargets.domainsUrl;
      return apiRequest(url, {
        method: 'POST',
        body: JSON.stringify({ domain }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: domainsQueryKey });
      toast({ title: 'Domain added', description: 'Please add the DNS TXT record to verify ownership.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to add domain', variant: 'destructive' });
    },
  });

  const [verifyingDomainId, setVerifyingDomainId] = useState<string | null>(null);
  
  const verifyDomainMutation = useMutation({
    mutationFn: async (domainId: string) => {
      setVerifyingDomainId(domainId);
      const url = buildDomainActionUrl({
        domainsUrl: apiTargets.domainsUrl,
        actionPath: `/api/domains/${domainId}/verify`,
      });
      return apiRequest(url, { method: 'POST' });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: domainsQueryKey });
      setVerifyingDomainId(null);
      if (data.verified) {
        toast({ title: 'Domain verified', description: 'Your custom domain is now active.' });
      } else {
        toast({ 
          title: 'Verification pending', 
          description: data.message || 'DNS record not found. Please wait for propagation.',
          variant: 'destructive'
        });
      }
    },
    onError: (error: any) => {
      setVerifyingDomainId(null);
      toast({ title: 'Error', description: error.message || 'Failed to verify domain', variant: 'destructive' });
    },
  });

  const toggleDomainActiveMutation = useMutation({
    mutationFn: async ({ domainId, isActive }: { domainId: string; isActive: boolean }) => {
      const url = buildDomainActionUrl({
        domainsUrl: apiTargets.domainsUrl,
        actionPath: `/api/domains/${domainId}/toggle-active`,
      });
      return apiRequest(url, {
        method: 'POST',
        body: JSON.stringify({ isActive }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: domainsQueryKey });
      toast({ title: 'Domain updated', description: 'Domain status has been updated.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to update domain status', variant: 'destructive' });
    },
  });

  const removeDomainMutation = useMutation({
    mutationFn: async (domainId: string) => {
      const url = buildDomainActionUrl({
        domainsUrl: apiTargets.domainsUrl,
        actionPath: `/api/domains/${domainId}`,
      });
      return apiRequest(url, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: domainsQueryKey });
      toast({ title: 'Domain removed' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to remove domain', variant: 'destructive' });
    },
  });

  const handleOrgChange = (orgId: string) => {
    const hasUnsavedChanges = hasUnsavedThemeChanges(editorState, initialState);
    const shouldProceed = shouldProceedWithOrgSwitch(hasUnsavedChanges, (message) =>
      typeof window === 'undefined' ? true : window.confirm(message)
    );
    if (!shouldProceed) {
      return;
    }

    if (orgId === PLATFORM_THEME_ID) {
      setSelectedOrgId(PLATFORM_THEME_ID);
    } else {
      setSelectedOrgId(orgId);
    }
    setWorkflowStage('palette');
  };

  const isPlatformTheme = selectedOrgId === PLATFORM_THEME_ID;
  const showDomainManager = apiTargets.showDomainManager;

  const handleSave = async (state: BrandEditorState) => {
    const warnings = getContrastWarnings(state.tokens);
    const criticalWarnings = warnings.filter((warning) => warning.level === 'error');
    setContrastWarnings(warnings);
    setEditorState(state);
    await saveMutation.mutateAsync(state);
    if (criticalWarnings.length > 0) {
      toast({
        title: 'Saved with accessibility advisories',
        description: `${criticalWarnings.length} critical contrast warning(s) remain. Theme activation is still allowed.`,
        variant: 'default',
      });
    }
    setWorkflowStage('publish');
  };

  const handleRevert = () => {
    if (initialState) {
      setEditorState(initialState);
      hydrateRetainedSuggestions(initialState);
    }
  };

  const applySingleContrastFix = useCallback((tokenKey: string, value: string) => {
    const currentValue = editorState?.tokens?.[tokenKey];
    if (normalizeTokenColorValue(currentValue) === normalizeTokenColorValue(value)) {
      toast({
        title: 'Suggestion already applied',
        description: `${formatTokenLabel(tokenKey)} already matches the recommended value.`,
      });
      return;
    }
    setEditorState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tokens: {
          ...prev.tokens,
          [tokenKey]: value,
        },
      };
    });
    setRetainedSuggestionTokens((prev) => {
      if (!(tokenKey in prev)) return prev;
      const next = { ...prev };
      delete next[tokenKey];
      return next;
    });
    toast({
      title: 'Accessibility suggestion applied',
      description: `${formatTokenLabel(tokenKey)} updated.`,
    });
  }, [toast]);

  const retainCurrentContrastValue = useCallback((tokenKey: string) => {
    const currentValue = editorState?.tokens?.[tokenKey];
    if (!currentValue) return;
    setRetainedSuggestionTokens((prev) => {
      const next = { ...prev };
      next[tokenKey] = currentValue;
      return next;
    });
    toast({
      title: 'Current value retained',
      description: `${formatTokenLabel(tokenKey)} will be excluded from auto-suggestions until you change it.`,
    });
  }, [editorState?.tokens, toast]);

  const clearRetainedSuggestion = useCallback((tokenKey: string) => {
    setRetainedSuggestionTokens((prev) => {
      if (!(tokenKey in prev)) return prev;
      const next = { ...prev };
      delete next[tokenKey];
      return next;
    });
  }, []);

  const clearAllRetainedSuggestions = useCallback(() => {
    setRetainedSuggestionTokens({});
  }, []);

  const applyAllContrastFixes = useCallback(() => {
    if (actionableContrastCorrections.length === 0) return;
    setEditorState((prev) => {
      if (!prev) return prev;
      const nextTokens = { ...prev.tokens };
      for (const correction of actionableContrastCorrections) {
        nextTokens[correction.tokenKey] = correction.correctedValue;
      }
      return {
        ...prev,
        tokens: nextTokens,
      };
    });
    setRetainedSuggestionTokens({});
    setWorkflowStage('customize');
    toast({
      title: 'Applied accessibility remediations',
      description: `${actionableContrastCorrections.length} token suggestion(s) applied.`,
    });
  }, [actionableContrastCorrections, toast]);

  const hasChanges = useMemo(() => {
    return hasUnsavedThemeChanges(editorState, initialState);
  }, [editorState, initialState]);

  const canPublish = useMemo(() => !hasChanges, [hasChanges]);
  const [activateDialogOpen, setActivateDialogOpen] = useState(false);

  const forceScrollTop = useCallback(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    if (document.scrollingElement) {
      document.scrollingElement.scrollTop = 0;
      document.scrollingElement.scrollLeft = 0;
    }

    const selectors = [
      '[data-radix-scroll-area-viewport]',
      '[data-theme-editor-scroll-root]',
      '[data-scroll-container]',
      'main',
    ];
    for (const selector of selectors) {
      for (const node of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
        node.scrollTop = 0;
        node.scrollLeft = 0;
      }
    }
  }, []);

  useLayoutEffect(() => {
    forceScrollTop();
  }, [forceScrollTop, selectedOrgId, isPlatformTheme]);

  useEffect(() => {
    forceScrollTop();
    const t1 = window.setTimeout(forceScrollTop, 0);
    const t2 = window.setTimeout(forceScrollTop, 120);
    const t3 = window.setTimeout(forceScrollTop, 300);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [forceScrollTop, selectedOrgId, isPlatformTheme, themeLoading]);

  const publishReadinessLabel = useMemo(() => {
    if (hasCriticalContrastIssues) return 'Accessibility advisories detected (publish still allowed)';
    if (hasChanges) return 'Save your latest edits before publishing';
    return 'Ready to activate';
  }, [hasCriticalContrastIssues, hasChanges]);

  const handleWorkflowStageChange = useCallback((stage: WorkflowStage) => {
    setWorkflowStage(stage);
  }, []);

  useEffect(() => {
    if (!hasChanges) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);

  const theme = themeData?.theme;
  const domains = domainsData?.domains || [];

  const selectedOrgName = selectedOrgId 
    ? organizations.find(org => org.id === selectedOrgId)?.name 
    : null;
  const activationTargetLabel = isPlatformTheme ? 'Platform Default' : selectedOrgName || 'Organization Theme';
  const canConfirmActivation = !hasChanges && !hasCriticalContrastIssues;
  const showPaletteSection = showAllSections || workflowStage === 'palette';
  const showAccessibilitySection = showAllSections || workflowStage === 'accessibility';
  const showCustomizeSection = showAllSections || workflowStage === 'customize' || workflowStage === 'publish';

  const isLoadingOrgs = useSuperAdminEndpoints && orgsLoading;
  const superAdminNoOrgs = useSuperAdminEndpoints && !orgsLoading && organizations.length === 0;
  const superAdminNeedsOrgSelection = false;

  if (isLoadingOrgs) {
    return (
      <QuizAdminLayout title="Brand Editor" description="White-Label Branding">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4" data-testid="loading-organizations">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading organizations...</p>
        </div>
      </QuizAdminLayout>
    );
  }

  if (superAdminNoOrgs) {
    return (
      <QuizAdminLayout title="Brand Editor" description="White-Label Branding">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4" data-testid="no-organizations">
          <Building2 className="h-12 w-12 text-muted-foreground" />
          <div className="text-center">
            <h2 className="text-lg font-semibold">No Organizations Available</h2>
            <p className="text-sm text-muted-foreground mt-2">
              No organizations found. Please create an organization first to use the Brand Editor.
            </p>
          </div>
        </div>
      </QuizAdminLayout>
    );
  }

  if (superAdminNeedsOrgSelection) {
    return (
      <QuizAdminLayout title="Brand Editor" description="White-Label Branding">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4" data-testid="select-organization-prompt">
          <Building2 className="h-12 w-12 text-muted-foreground" />
          <div className="text-center">
            <h2 className="text-lg font-semibold">Select an Organization</h2>
            <p className="text-sm text-muted-foreground mt-2 mb-4">
              Please select an organization to edit its branding.
            </p>
            <Select value="" onValueChange={handleOrgChange} data-testid="select-organization-initial">
              <SelectTrigger className="w-[250px] min-h-[44px] touch-manipulation" data-testid="select-organization">
                <Building2 className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </QuizAdminLayout>
    );
  }

  if (themeError) {
    return (
      <QuizAdminLayout title="Brand Editor" description="White-Label Branding">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4" data-testid="theme-error">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <div className="text-center">
            <h2 className="text-lg font-semibold">Error Loading Theme</h2>
            <p className="text-sm text-muted-foreground mt-2">
              {(themeError as Error)?.message || 'Failed to load theme data. Please try again.'}
            </p>
            <Button variant="outline" className="mt-4" onClick={() => queryClient.invalidateQueries({ queryKey: themeQueryKey })}
              data-testid="button-retry-theme"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      </QuizAdminLayout>
    );
  }

  if (themeLoading || !editorState) {
    return (
      <QuizAdminLayout title="Brand Editor" description="White-Label Branding">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4" data-testid="loading-theme">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading theme...</p>
        </div>
      </QuizAdminLayout>
    );
  }

  return (
    <QuizAdminLayout 
      title="Brand Editor" 
      description={isPlatformTheme ? "Platform Default Theme" : selectedOrgName ? `Editing: ${selectedOrgName}` : "White-Label Branding"}
    >
      <div className="flex flex-col min-h-[calc(100vh-140px)] lg:min-h-[calc(100vh-120px)]">
        <div className="px-4 py-3 border-b border-border bg-card/50 rounded-t-lg shrink-0 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                {!hasChanges && (
                  <Badge >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Publish Ready
                  </Badge>
                )}
                {useSuperAdminEndpoints && (
                  <Badge variant="outline" className="font-medium">
                    Target: {isPlatformTheme ? 'Platform Default' : `Organization${selectedOrgName ? ` • ${selectedOrgName}` : ''}`}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{publishReadinessLabel}</p>
              {isPlatformTheme && (
                <p className="text-xs text-muted-foreground">
                  Platform default applies where no active organization-specific theme overrides it.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {isSuperAdmin && (
                <Select value={selectedOrgId || PLATFORM_THEME_ID} onValueChange={handleOrgChange} disabled={isImpersonating}>
                  <SelectTrigger className="w-[220px] min-h-[44px] touch-manipulation" data-testid="select-organization">
                    <Building2 className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Select organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {!isImpersonating && (
                      <SelectItem value={PLATFORM_THEME_ID}>
                        <span className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-primary" />
                          Platform Default
                        </span>
                      </SelectItem>
                    )}
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button variant="outline" size="sm" onClick={handleRevert} disabled={!hasChanges || saveMutation.isPending} data-testid="button-revert" >
                <RotateCcw className="h-4 w-4 mr-1" />
                Revert
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={resetMutation.isPending || saveMutation.isPending} data-testid="button-reset-to-default" >
                    {resetMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1" />
                    )}
                    Reset Theme
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset Theme Configuration?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will restore all theme tokens to the current platform defaults. Any customizations
                      you&apos;ve made will be lost. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-reset-cancel">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => resetMutation.mutate()}
                      data-testid="button-reset-confirm"
                    >
                      Reset Theme
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button size="sm" onClick={() => handleSave(editorState)}
                disabled={saveMutation.isPending}
                data-testid="button-save"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Save
              </Button>
              <AlertDialog open={activateDialogOpen} onOpenChange={setActivateDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="default" size="sm" disabled={!canPublish || activateMutation.isPending} data-testid="button-activate" >
                    {activateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-1" />
                    )}
                    Activate
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Activate Theme?</AlertDialogTitle>
                    <AlertDialogDescription>
                      You are about to activate this theme for <span className="font-semibold">{activationTargetLabel}</span>.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-2 text-sm">
                    <p>Unsaved changes: <span className="font-semibold">{hasChanges ? 'Yes' : 'No'}</span></p>
                    <p>Critical accessibility advisories: <span className="font-semibold">{criticalContrastWarnings.length}</span></p>
                    {hasCriticalContrastIssues && (
                      <p className="text-xs text-muted-foreground">
                        Activation is blocked until critical advisories are remediated.
                      </p>
                    )}
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={!canConfirmActivation}
                      onClick={() => {
                        activateMutation.mutate(undefined);
                      }}
                    >
                      Confirm Activate
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <WorkflowProgress
            stage={workflowStage}
            onChange={handleWorkflowStageChange}
            canPublish={canPublish}
          />
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setShowAllSections((prev) => !prev)}>
              {showAllSections ? 'Show Stage Only' : 'Show All Sections'}
            </Button>
          </div>
        </div>

        {workflowStage !== 'palette' && (
        <div className="mx-4 mt-3 grid gap-3 sm:grid-cols-3">
          <div className={cn("rounded-lg border p-3 bg-card", hasChanges ? "border-[var(--game-gold)]/40" : "border-[var(--success)]/40")}>
            <p className="text-xs text-muted-foreground">Unsaved Changes</p>
            <p className="mt-1 text-lg font-semibold">{hasChanges ? 'Pending' : 'None'}</p>
          </div>
          <div className={cn("rounded-lg border p-3 bg-card", hasCriticalContrastIssues ? "border-[var(--game-gold)]/45" : "border-[var(--success)]/40")}>
            <p className="text-xs text-muted-foreground">Accessibility Advisory</p>
            <p className="mt-1 text-lg font-semibold">{hasCriticalContrastIssues ? `${criticalContrastWarnings.length} Critical` : 'Clear'}</p>
          </div>
          <div className={cn("rounded-lg border p-3 bg-card", canPublish ? "border-[var(--success)]/40" : "border-border")}>
            <p className="text-xs text-muted-foreground">Publish Readiness</p>
            <p className="mt-1 text-lg font-semibold">{canPublish ? 'Ready' : 'Blocked'}</p>
          </div>
        </div>
        )}

        {showPaletteSection && <PaletteBuilder
          currentTokens={editorState.tokens}
          anchorSyncSeed={`${selectedOrgId || 'none'}:${theme?.id || 'new'}:${theme?.status || 'draft'}`}
          tone={editorState.themeModeIntent || 'light'}
          recommendPaletteUrl={apiTargets.recommendPaletteUrl}
          buildPaletteUrl={apiTargets.buildPaletteUrl}
          onToneChange={(tone, anchors) => {
            setEditorState((prev) => {
              if (!prev) return prev;
              const primaryHex = parseColorToHex(anchors.primaryHex || prev.tokens['--primary'], '#0a66c2');
              const secondaryHex = parseColorToHex(anchors.secondaryHex || prev.tokens['--secondary'], '#124076');
              const accentHex = parseColorToHex(anchors.accentHex || prev.tokens['--accent'], '#16a3a5');
              const generatedForTone = generatePaletteTokens({
                primaryHex,
                secondaryHex,
                accentHex,
                tone,
                autoFix: true,
              });
              return {
                ...prev,
                themeModeIntent: tone,
                // Tone switching must regenerate the full contract token set to
                // avoid mixed light/dark primitives across pages.
                tokens: {
                  ...prev.tokens,
                  ...generatedForTone,
                },
              };
            });
          }}
          onApply={(tokens, appliedTone) => {
            setEditorState((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                themeModeIntent: appliedTone,
                tokens,
                presetId: null,
              };
            });
            setWorkflowStage('customize');
          }}
        />
        }

        {showCustomizeSection && showDomainManager && (
          <div className="mx-4 mt-3">
            <DomainManager
              domains={domains}
              isLoading={domainsLoading}
              onAdd={(domain) => addDomainMutation.mutate(domain)}
              onVerify={(id) => verifyDomainMutation.mutate(id)}
              onRemove={(id) => removeDomainMutation.mutate(id)}
              onToggleActive={(id, isActive) => toggleDomainActiveMutation.mutate({ domainId: id, isActive })}
              isAdding={addDomainMutation.isPending}
              isVerifying={verifyDomainMutation.isPending}
              verifyingDomainId={verifyingDomainId}
            />
          </div>
        )}

        {showAccessibilitySection && contrastWarnings.length > 0 && (
          <Alert variant={hasCriticalContrastIssues ? 'destructive' : 'default'} className="mx-4 mt-3">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {contrastWarnings.length} color combination(s) have accessibility warnings.
              {hasCriticalContrastIssues && (
                <> {criticalContrastWarnings.length} are critical and should be reviewed.</>
              )}
              {actionableContrastCorrections.length > 0 && (
                <> {actionableContrastCorrections.length} remediations are available below.</>
              )}
            </AlertDescription>
          </Alert>
        )}

        {showAccessibilitySection && contrastWarnings.length > 0 && (
          <div className="mx-4 mt-3 rounded-lg border bg-card p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">Accessibility Remediation</h3>
                <p className="text-sm text-muted-foreground">
                  Review each failing primitive, then apply suggested colors individually or in bulk.
                </p>
              </div>
              {actionableContrastCorrections.length > 0 && (
                <Button size="sm" variant="secondary" onClick={applyAllContrastFixes}>
                  Apply All Suggestions
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Detected Issues</p>
              <div className="max-h-44 overflow-auto space-y-2 pr-1">
                {contrastWarnings.map((warning, index) => (
                  <div key={`${warning.pair}-${index}`} className="rounded-md border border-border p-2 flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{warning.pair}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        ratio {warning.ratio.toFixed(2)}:1 (needs {warning.required.toFixed(1)}:1)
                      </p>
                    </div>
                    <Badge variant={warning.level === 'error' ? 'destructive' : 'secondary'}>
                      {warning.level === 'error' ? 'Critical' : 'Warning'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {groupedContrastCorrections.length > 0 ? (
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Suggested Primitive Fixes</p>
                {groupedContrastCorrections.map(([groupName, corrections]) => (
                  <div key={groupName} className="rounded-md border border-border p-3 space-y-2">
                    <p className="text-sm font-semibold">{groupName}</p>
                    <div className="space-y-2">
                      {corrections.map((correction) => {
                        const backgroundValue =
                          editorState?.tokens?.[correction.backgroundKey] ||
                          editorState?.tokens?.['--surface-primary'] ||
                          editorState?.tokens?.['--background'] ||
                          'hsl(0, 0%, 100%)';
                        return (
                          <div key={`${groupName}-${correction.tokenKey}-${correction.backgroundKey}`} className="rounded-md border border-border/70 p-2 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{formatTokenLabel(correction.tokenKey)}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {correction.tokenKey} on {correction.backgroundKey} • {correction.originalRatio.toFixed(2)}:1 → {correction.newRatio.toFixed(2)}:1
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button size="sm" variant="ghost" onClick={() => retainCurrentContrastValue(correction.tokenKey)}
                                >
                                  Retain Current
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => applySingleContrastFix(correction.tokenKey, correction.correctedValue)}
                                >
                                  Apply Suggestion
                                </Button>
                              </div>
                            </div>
                            <div className="grid gap-2 md:grid-cols-2">
                              <div className="rounded-md border border-border/70 p-2">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Current</p>
                                <div className="rounded px-2 py-2 text-sm font-medium" style={{ backgroundColor: backgroundValue, color: correction.originalValue }}>
                                  Primitive Preview Aa
                                </div>
                              </div>
                              <div className="rounded-md border border-border/70 p-2">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">After Remediation</p>
                                <div className="rounded px-2 py-2 text-sm font-medium" style={{ backgroundColor: backgroundValue, color: correction.correctedValue }}>
                                  Primitive Preview Aa
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                No automatic primitive remediations are currently available for these warnings. Adjust tokens manually in Customize and re-check.
              </div>
            )}
            {Object.keys(retainedSuggestionTokens).length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Retained Suggestions</p>
                  <Button size="sm" variant="ghost" onClick={clearAllRetainedSuggestions}>
                    Re-enable All
                  </Button>
                </div>
                <div className="space-y-2">
                  {Object.keys(retainedSuggestionTokens).map((tokenKey) => (
                    <div key={`retained-${tokenKey}`} className="rounded-md border border-border/70 p-2 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{formatTokenLabel(tokenKey)}</p>
                        <p className="text-xs text-muted-foreground">{tokenKey}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => clearRetainedSuggestion(tokenKey)}>
                        Re-enable Suggestion
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main Content */}
        {showCustomizeSection && <div className="flex-1 min-h-[640px] flex flex-col">
          {editorState ? (
            <BrandEditorShell
              initialState={editorState}
              onSave={handleSave}
              onRevert={handleRevert}
              onStateChange={setEditorState}
              isSaving={saveMutation.isPending}
              hasChanges={hasChanges}
              className="flex-1 min-h-[640px]"
              isPlatform={isPlatformTheme}
            >
              {isMobile ? (
                <MobileEditorLayout />
              ) : (
                <DesktopEditorLayout />
              )}
            </BrandEditorShell>
          ) : (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>}
      </div>
    </QuizAdminLayout>
  );
}
