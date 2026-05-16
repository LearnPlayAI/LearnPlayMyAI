import { GoogleGenAI } from '@google/genai';
import { IntegrationConfigService } from './integrationConfigService';
import { buildFullTokens, type BaseTokens } from '../../shared/themeTokenBuilder';
import { type ThemeContrastIssue } from '../../shared/themeContrastGuard';
import { compileThemeTokens } from './themeCompilerService';

export type PaletteRecommendationMode = 'secondary' | 'accent';
export type ThemePaletteAiModelProfile = 'fast' | 'thinking';

export interface PaletteRecommendationInput {
  mode: PaletteRecommendationMode;
  primaryHex: string;
  secondaryHex?: string;
  tone?: 'light' | 'dark';
  count?: number;
  aiModelProfile?: ThemePaletteAiModelProfile;
}

export interface PaletteRecommendationCandidate {
  hex: string;
  rationale: string;
  source: 'ai' | 'deterministic';
  score: number;
  accessibility: {
    criticalIssues: number;
    warningIssues: number;
  };
}

export interface PaletteBuildInput {
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  tone?: 'light' | 'dark';
  aiPreferred?: boolean;
  strictAiOnly?: boolean;
  autoFixContrast?: boolean;
  aiModelProfile?: ThemePaletteAiModelProfile;
  allowAnchorAdjustments?: boolean;
}

export interface PaletteContractRecommendation {
  pair: string;
  fgToken: string;
  bgToken: string;
  ratio: number;
  required: number;
  priority: 'critical' | 'high' | 'medium';
  recommendedChange: string;
}

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const AI_RECOMMENDATION_TIMEOUT_MS = 9000;
const AI_RECOMMEND_CACHE_TTL_MS = 60_000;
const AI_BUILD_BUDGET_MS = 28_000;

const aiRecommendationCache = new Map<string, {
  expiresAt: number;
  candidates: Array<{ hex: string; rationale: string }>;
}>();
const aiRecommendationInflight = new Map<string, Promise<Array<{ hex: string; rationale: string }>>>();

async function getGeminiApiKeySafe(): Promise<string> {
  try {
    return String(await IntegrationConfigService.getSecret('gemini', 'apiKey') || '').trim();
  } catch (error) {
    console.warn('[ThemePalette] Unable to read Gemini API key; falling back to deterministic palette synthesis.', error);
    return '';
  }
}

async function resolvePaletteAiModel(profile?: ThemePaletteAiModelProfile): Promise<string> {
  const normalizedProfile: ThemePaletteAiModelProfile = profile === 'thinking' ? 'thinking' : 'fast';
  const defaultTextModel = await IntegrationConfigService.getSetting<string>('gemini', 'defaultTextModel');
  const thinkingModel = await IntegrationConfigService.getSetting<string>('gemini', 'thinkingScriptModel');

  if (normalizedProfile === 'thinking') {
    return thinkingModel || defaultTextModel || 'gemini-2.5-pro';
  }
  return defaultTextModel || thinkingModel || 'gemini-2.5-flash';
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeHex(input: string | undefined | null): string | null {
  const value = String(input || '').trim();
  if (!value) return null;
  const withHash = value.startsWith('#') ? value : `#${value}`;
  if (!HEX_COLOR.test(withHash)) return null;
  const normalized = withHash.toLowerCase();
  if (normalized.length === 4) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }
  return normalized;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '').trim();
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function colorDistance(aHex: string, bHex: string): number {
  const a = hexToRgb(aHex);
  const b = hexToRgb(bHex);
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
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

  h = (h * 60 + 360) % 360;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return {
    h,
    s: s * 100,
    l: l * 100,
  };
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 100) / 100;
  const light = clamp(l, 0, 100) / 100;

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  let rr = 0;
  let gg = 0;
  let bb = 0;

  if (hue < 60) [rr, gg, bb] = [c, x, 0];
  else if (hue < 120) [rr, gg, bb] = [x, c, 0];
  else if (hue < 180) [rr, gg, bb] = [0, c, x];
  else if (hue < 240) [rr, gg, bb] = [0, x, c];
  else if (hue < 300) [rr, gg, bb] = [x, 0, c];
  else [rr, gg, bb] = [c, 0, x];

  return rgbToHex((rr + m) * 255, (gg + m) * 255, (bb + m) * 255);
}

function hueDistance(a: number, b: number): number {
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
}

function seededDeterministicSecondary(primaryHex: string): string[] {
  const { h } = hexToHsl(primaryHex);
  const targets = [
    { delta: 18, s: 54, l: 40 },
    { delta: 34, s: 50, l: 38 },
    { delta: -24, s: 56, l: 36 },
    { delta: 52, s: 46, l: 42 },
    { delta: -40, s: 52, l: 34 },
  ];
  return targets.map((t) => hslToHex(h + t.delta, t.s, t.l));
}

function seededDeterministicAccent(primaryHex: string, secondaryHex: string): string[] {
  const primary = hexToHsl(primaryHex);
  const secondary = hexToHsl(secondaryHex);
  const midpoint = ((primary.h + secondary.h) / 2 + 360) % 360;
  const targets = [
    { delta: 38, s: 78, l: 48 },
    { delta: 62, s: 82, l: 46 },
    { delta: -34, s: 74, l: 50 },
    { delta: 88, s: 80, l: 47 },
    { delta: -58, s: 76, l: 49 },
  ];
  return targets.map((t) => hslToHex(midpoint + t.delta, t.s, t.l));
}

function bandScore(value: number, target: number, tolerance: number): number {
  const delta = Math.abs(value - target);
  return clamp(1 - delta / Math.max(1, tolerance), 0, 1);
}

function isHarmoniousCandidate(params: {
  mode: PaletteRecommendationMode;
  primaryHex: string;
  secondaryHex?: string;
  candidateHex: string;
}): boolean {
  const primaryHue = hexToHsl(params.primaryHex).h;
  const candidateHue = hexToHsl(params.candidateHex).h;
  const primaryDistance = hueDistance(candidateHue, primaryHue);

  if (params.mode === 'secondary') {
    // Secondary should stay visually related to primary, not opposite-wheel.
    return primaryDistance >= 8 && primaryDistance <= 95;
  }

  const secondaryHue = hexToHsl(params.secondaryHex || params.primaryHex).h;
  const secondaryDistance = hueDistance(candidateHue, secondaryHue);
  // Accent can be more expressive but still must harmonize with primary+secondary.
  return secondaryDistance >= 18 && secondaryDistance <= 135 && primaryDistance >= 15 && primaryDistance <= 150;
}

function buildBaseTokens(primaryHex: string, secondaryHex: string, accentHex: string, tone: 'light' | 'dark'): BaseTokens {
  const primaryHue = hexToHsl(primaryHex).h;
  const isDark = tone === 'dark';
  return {
    primary: primaryHex,
    primaryForeground: isDark ? 'hsl(0, 0%, 10%)' : 'hsl(0, 0%, 100%)',
    secondary: secondaryHex,
    secondaryForeground: 'hsl(0, 0%, 100%)',
    accent: accentHex,
    accentForeground: isDark ? 'hsl(0, 0%, 10%)' : 'hsl(0, 0%, 100%)',
    background: isDark ? `hsl(${Math.round(primaryHue)}, 20%, 8%)` : `hsl(${Math.round(primaryHue)}, 28%, 97%)`,
    foreground: isDark ? 'hsl(0, 0%, 95%)' : 'hsl(220, 18%, 12%)',
    card: isDark ? `hsl(${Math.round(primaryHue)}, 18%, 11%)` : 'hsl(0, 0%, 100%)',
    cardForeground: isDark ? 'hsl(0, 0%, 95%)' : 'hsl(220, 18%, 12%)',
    muted: isDark ? `hsl(${Math.round(primaryHue)}, 14%, 16%)` : `hsl(${Math.round(primaryHue)}, 18%, 92%)`,
    mutedForeground: isDark ? 'hsl(0, 0%, 65%)' : 'hsl(220, 12%, 42%)',
    border: isDark ? `hsl(${Math.round(primaryHue)}, 16%, 24%)` : `hsl(${Math.round(primaryHue)}, 18%, 84%)`,
    ring: primaryHex,
    gradientFrom: primaryHex,
    gradientTo: primaryHex,
    gamePrimary: accentHex,
    gameGlow: accentHex,
    isDark,
  };
}

interface ContractDebtSummary {
  interactiveCritical: number;
  interactiveWarning: number;
  weightedDeficit: number;
}

const INTERACTIVE_TOKEN_HINT =
  /(action|btn|button|nav|sidebar|tab|filter-pill|chip|badge|input|select|dropdown|menu|toggle|switch|pagination|admin|hero-cta|auth-cta|cta)/i;

function summarizeContractDebt(issues: ThemeContrastIssue[]): ContractDebtSummary {
  let interactiveCritical = 0;
  let interactiveWarning = 0;
  let weightedDeficit = 0;

  for (const issue of issues) {
    const deficit = Math.max(0, issue.required - issue.ratio);
    const tokenFootprint = `${issue.fgToken} ${issue.bgToken} ${issue.pair}`;
    const isInteractive = INTERACTIVE_TOKEN_HINT.test(tokenFootprint);
    const severityWeight = issue.level === 'error' ? 2 : 1;
    const scopeWeight = isInteractive ? 2.5 : 1;
    weightedDeficit += deficit * severityWeight * scopeWeight;

    if (!isInteractive) continue;
    if (issue.level === 'error') {
      interactiveCritical += 1;
    } else {
      interactiveWarning += 1;
    }
  }

  return { interactiveCritical, interactiveWarning, weightedDeficit };
}

function evaluateCandidate(
  mode: PaletteRecommendationMode,
  primaryHex: string,
  secondaryHex: string,
  accentHex: string,
  candidateHex: string,
  tone: 'light' | 'dark',
): {
  score: number;
  critical: number;
  warning: number;
  interactiveCritical: number;
  interactiveWarning: number;
  weightedDeficit: number;
} {
  const base = buildBaseTokens(primaryHex, secondaryHex, accentHex, tone);
  const compiled = compileThemeTokens(buildFullTokens(base), {
    modeIntent: tone,
    maxContrastPasses: 6,
  });
  const critical = compiled.criticalIssues.length;
  const warning = compiled.warningIssues.length;
  const debt = summarizeContractDebt(compiled.issues);

  const candidateHue = hexToHsl(candidateHex).h;
  const primaryHue = hexToHsl(primaryHex).h;
  const secondaryHue = hexToHsl(secondaryHex).h;

  const primaryDistance = hueDistance(candidateHue, primaryHue);
  const secondaryDistance = hueDistance(candidateHue, secondaryHue);

  const harmonyScore = mode === 'secondary'
    ? bandScore(primaryDistance, 42, 34)
    : (bandScore(secondaryDistance, 70, 42) * 0.65 + bandScore(primaryDistance, 86, 55) * 0.35);

  const baseScore = 100;
  const score =
    baseScore
    - critical * 18
    - warning * 2
    - debt.interactiveCritical * 10
    - debt.interactiveWarning * 2
    - debt.weightedDeficit * 1.5
    + harmonyScore * 22;

  return {
    score,
    critical,
    warning,
    interactiveCritical: debt.interactiveCritical,
    interactiveWarning: debt.interactiveWarning,
    weightedDeficit: debt.weightedDeficit,
  };
}

function extractHexCandidatesFromAiText(text: string): Array<{ hex: string; rationale: string }> {
  const cleaned = String(text || '').trim();
  if (!cleaned) return [];

  const jsonBlock = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonBlock) return [];

  try {
    const parsed = JSON.parse(jsonBlock[0]);
    if (!Array.isArray(parsed)) return [];
    const results: Array<{ hex: string; rationale: string }> = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const hex = normalizeHex(String(row.hex || ''));
      const rationale = String(row.rationale || row.reason || '').trim();
      if (!hex) continue;
      results.push({
        hex,
        rationale: rationale || 'AI-recommended brand-compatible color',
      });
    }
    return results;
  } catch {
    return [];
  }
}

async function fetchAiCandidates(input: {
  mode: PaletteRecommendationMode;
  primaryHex: string;
  secondaryHex?: string;
  tone?: 'light' | 'dark';
  count: number;
  aiModelProfile?: ThemePaletteAiModelProfile;
}): Promise<Array<{ hex: string; rationale: string }>> {
  let apiKey = '';
  try {
    apiKey = await getGeminiApiKeySafe();
  } catch {
    apiKey = '';
  }
  if (!apiKey) return [];

  const cacheKey = JSON.stringify({
    mode: input.mode,
    primaryHex: input.primaryHex,
    secondaryHex: input.secondaryHex || null,
    tone: input.tone || 'light',
    count: input.count,
    aiModelProfile: input.aiModelProfile || 'fast',
  });
  const now = Date.now();
  const cached = aiRecommendationCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.candidates;
  }
  const inflight = aiRecommendationInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const model = await resolvePaletteAiModel(input.aiModelProfile);

  const ai = new GoogleGenAI({ apiKey });

  const modeInstruction = input.mode === 'secondary'
    ? `Propose ${input.count} secondary brand colors from the primary color.`
    : `Propose ${input.count} accent brand colors from the selected secondary color, with awareness of the primary color context.`;

  const prompt = [
    'You are a senior accessibility-first brand palette designer.',
    modeInstruction,
    `Theme tone: ${(input.tone === 'dark' ? 'dark' : 'light')}.`,
    `Primary color: ${input.primaryHex}.`,
    input.secondaryHex ? `Selected secondary color: ${input.secondaryHex}.` : '',
    'Return ONLY a JSON array. No markdown. No explanation outside JSON.',
    'Each entry must be: {"hex":"#RRGGBB","rationale":"short rationale"}.',
    'Rules:',
    '- Keep colors visually distinct but brand-harmonized.',
    input.mode === 'secondary'
      ? '- Secondary must remain stylistically cohesive with primary (analogous/split-analogous/monochromatic direction); avoid opposite-wheel complements.'
      : '- Accent must harmonize with both primary and secondary, with noticeable emphasis but no jarring clash.',
    '- Avoid muddy low-chroma colors.',
    '- Prioritize candidates likely to work in UI accessibility contexts.',
  ].filter(Boolean).join('\n');

  const requestPromise = (async () => {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            temperature: 0.25,
          },
        }),
        AI_RECOMMENDATION_TIMEOUT_MS,
        'AI palette recommendation',
      );
      const candidates = extractHexCandidatesFromAiText(String(response.text || ''));
      aiRecommendationCache.set(cacheKey, {
        expiresAt: Date.now() + AI_RECOMMEND_CACHE_TTL_MS,
        candidates,
      });
      return candidates;
    } catch (error) {
      console.warn('[ThemePaletteRecommendation] AI recommendation failed:', (error as Error)?.message || error);
      return [];
    } finally {
      aiRecommendationInflight.delete(cacheKey);
    }
  })();

  aiRecommendationInflight.set(cacheKey, requestPromise);
  return requestPromise;
}

function buildContractRecommendations(issues: ThemeContrastIssue[]): PaletteContractRecommendation[] {
  const ordered = [...issues]
    .sort((a, b) => (b.required - b.ratio) - (a.required - a.ratio))
    .slice(0, 10);

  return ordered.map((issue) => {
    const deficit = Math.max(0, issue.required - issue.ratio);
    const priority: 'critical' | 'high' | 'medium' =
      issue.level === 'error' && deficit >= 2 ? 'critical'
      : issue.level === 'error' ? 'high'
      : 'medium';
    return {
      pair: issue.pair,
      fgToken: issue.fgToken,
      bgToken: issue.bgToken,
      ratio: issue.ratio,
      required: issue.required,
      priority,
      recommendedChange:
        `Split ${issue.fgToken}/${issue.bgToken} into tone-aware contract tokens and allow independent foreground adjustment for this pair (current ${issue.ratio.toFixed(2)} < required ${issue.required.toFixed(2)}).`,
    };
  });
}

export async function recommendPaletteCandidates(
  input: PaletteRecommendationInput,
): Promise<{
  mode: PaletteRecommendationMode;
  primaryHex: string;
  secondaryHex?: string;
  tone: 'light' | 'dark';
  candidates: PaletteRecommendationCandidate[];
}> {
  const mode = input.mode;
  const tone = input.tone === 'dark' ? 'dark' : 'light';
  const count = clamp(input.count ?? 5, 3, 8);

  const primaryHex = normalizeHex(input.primaryHex);
  if (!primaryHex) {
    throw new Error('Invalid primaryHex');
  }

  const normalizedSecondary = normalizeHex(input.secondaryHex || '');
  if (mode === 'accent' && !normalizedSecondary) {
    throw new Error('secondaryHex is required for accent recommendations');
  }

  const deterministic = mode === 'secondary'
    ? seededDeterministicSecondary(primaryHex)
    : seededDeterministicAccent(primaryHex, normalizedSecondary!);

  const aiCandidates = await fetchAiCandidates({
    mode,
    primaryHex,
    secondaryHex: normalizedSecondary || undefined,
    tone,
    count,
    aiModelProfile: input.aiModelProfile === 'thinking' ? 'thinking' : 'fast',
  });

  const mergedMap = new Map<string, { rationale: string; source: 'ai' | 'deterministic' }>();

  for (const candidate of deterministic) {
    mergedMap.set(candidate, {
      rationale: mode === 'secondary'
        ? 'Deterministic harmony candidate from selected primary color'
        : 'Deterministic harmony candidate from selected secondary color',
      source: 'deterministic',
    });
  }

  for (const candidate of aiCandidates) {
    const existing = mergedMap.get(candidate.hex);
    if (!existing) {
      mergedMap.set(candidate.hex, {
        rationale: candidate.rationale,
        source: 'ai',
      });
      continue;
    }

    // If AI selects a color that is also present in deterministic seeds,
    // preserve the AI provenance so strict AI mode can recognize valid AI
    // participation even when anchors are unchanged.
    mergedMap.set(candidate.hex, {
      rationale: candidate.rationale || existing.rationale,
      source: 'ai',
    });
  }

  const evaluated: PaletteRecommendationCandidate[] = [];
  const defaultSecondary = normalizedSecondary || deterministic[0] || '#124076';
  const fallbackAccent = mode === 'accent' ? deterministic[0] || '#16a3a5' : '#16a3a5';

  for (const [hex, meta] of mergedMap.entries()) {
    if (!isHarmoniousCandidate({
      mode,
      primaryHex,
      secondaryHex: normalizedSecondary || undefined,
      candidateHex: hex,
    })) {
      continue;
    }
    const evalResult = mode === 'secondary'
      ? evaluateCandidate(mode, primaryHex, hex, fallbackAccent, hex, tone)
      : evaluateCandidate(mode, primaryHex, defaultSecondary, hex, hex, tone);

    evaluated.push({
      hex,
      rationale: meta.rationale,
      source: meta.source,
      score: Number(evalResult.score.toFixed(2)),
      accessibility: {
        criticalIssues: evalResult.critical,
        warningIssues: evalResult.warning,
      },
    });
  }

  evaluated.sort((a, b) => b.score - a.score);

  if (evaluated.length === 0) {
    const deterministicFallback = deterministic
      .filter((hex) => isHarmoniousCandidate({
        mode,
        primaryHex,
        secondaryHex: normalizedSecondary || undefined,
        candidateHex: hex,
      }))
      .slice(0, count)
      .map((hex) => ({
        hex,
        rationale: mode === 'secondary'
          ? 'Deterministic harmonious candidate from selected primary color'
          : 'Deterministic harmonious candidate from selected secondary color',
        source: 'deterministic' as const,
        score: 0,
        accessibility: {
          criticalIssues: 0,
          warningIssues: 0,
        },
      }));
    return {
      mode,
      primaryHex,
      secondaryHex: normalizedSecondary || undefined,
      tone,
      candidates: deterministicFallback,
    };
  }

  return {
    mode,
    primaryHex,
    secondaryHex: normalizedSecondary || undefined,
    tone,
    candidates: evaluated.slice(0, count),
  };
}

export function getDeterministicRecommendationsForTest(input: PaletteRecommendationInput): string[] {
  const primaryHex = normalizeHex(input.primaryHex);
  if (!primaryHex) return [];
  if (input.mode === 'secondary') {
    return seededDeterministicSecondary(primaryHex);
  }
  const secondaryHex = normalizeHex(input.secondaryHex || '');
  if (!secondaryHex) return [];
  return seededDeterministicAccent(primaryHex, secondaryHex);
}

export async function buildAiAssistedPaletteTokens(input: PaletteBuildInput): Promise<{
  tone: 'light' | 'dark';
  tokens: Record<string, string>;
  source: 'ai-assisted' | 'deterministic';
  accessibility: {
    baselineCritical: number;
    baselineWarnings: number;
    finalCritical: number;
    finalWarnings: number;
  };
  recommendations?: PaletteContractRecommendation[];
  diagnostics: {
    aiModelProfile: ThemePaletteAiModelProfile;
    aiModelResolved: string;
    strictAiOnly: boolean;
    autoFixContrast: boolean;
    tone: 'light' | 'dark';
    elapsedMs: number;
    aiCandidateCount: number;
    selectedAnchors: { primaryHex: string; secondaryHex: string; accentHex: string };
    appliedAnchors: { primaryHex: string; secondaryHex: string; accentHex: string };
    anchorPreserved: boolean;
  };
}> {
  const tone = input.tone === 'dark' ? 'dark' : 'light';
  const strictAiOnly = input.strictAiOnly === true;
  const maxContrastPasses = input.autoFixContrast === true ? 24 : 12;
  const aiModelProfile: ThemePaletteAiModelProfile = input.aiModelProfile === 'thinking' ? 'thinking' : 'fast';
  const preserveSelectedAnchors = input.allowAnchorAdjustments !== true;
  const aiModelResolved = await resolvePaletteAiModel(aiModelProfile);
  const buildStartedAt = Date.now();
  const primaryHex = normalizeHex(input.primaryHex);
  const secondaryHex = normalizeHex(input.secondaryHex);
  const accentHex = normalizeHex(input.accentHex);
  if (!primaryHex || !secondaryHex || !accentHex) {
    throw new Error('Invalid palette anchors');
  }

  const base = buildBaseTokens(primaryHex, secondaryHex, accentHex, tone);
  const deterministicTokens = buildFullTokens(base);
  const baselineCompiled = compileThemeTokens(deterministicTokens, { modeIntent: tone, maxContrastPasses });
  const baselineCritical = baselineCompiled.criticalIssues.length;
  const baselineWarnings = baselineCompiled.warningIssues.length;

  if (input.aiPreferred === false) {
    const elapsedMs = Date.now() - buildStartedAt;
    return {
      tone,
      tokens: baselineCompiled.tokens,
      source: 'deterministic',
      accessibility: {
        baselineCritical,
        baselineWarnings,
        finalCritical: baselineCritical,
        finalWarnings: baselineWarnings,
      },
      recommendations: buildContractRecommendations(baselineCompiled.issues),
      diagnostics: {
        aiModelProfile,
        aiModelResolved,
        strictAiOnly,
        autoFixContrast: input.autoFixContrast === true,
        tone,
        elapsedMs,
        aiCandidateCount: 0,
        selectedAnchors: { primaryHex, secondaryHex, accentHex },
        appliedAnchors: { primaryHex, secondaryHex, accentHex },
        anchorPreserved: true,
      },
    };
  }

  const apiKey = await getGeminiApiKeySafe();
  if (!apiKey && strictAiOnly) {
    const err: any = new Error('AI palette synthesis unavailable: Gemini API key is not configured.');
    err.statusCode = 422;
    err.recommendations = buildContractRecommendations(baselineCompiled.issues);
    throw err;
  }

  type AnchorOption = {
    secondaryHex: string;
    accentHex: string;
    aiUsed: boolean;
    sourceLabel: string;
  };
  type EvaluatedOption = AnchorOption & {
    compiled: ReturnType<typeof compileThemeTokens>;
    distance: number;
    debt: ContractDebtSummary;
  };

  const anchorOptions: AnchorOption[] = [
    { secondaryHex, accentHex, aiUsed: false, sourceLabel: 'selected anchors' },
  ];

  let aiCandidateCount = 0;
  let secondaryCandidates: PaletteRecommendationCandidate[] = [];
  if (apiKey && (Date.now() - buildStartedAt) < AI_BUILD_BUDGET_MS) {
    const secondaryResult = await recommendPaletteCandidates({
      mode: 'secondary',
      primaryHex,
      tone,
      count: 3,
      aiModelProfile,
    });
    secondaryCandidates = secondaryResult.candidates;
    aiCandidateCount += secondaryCandidates.filter((candidate) => candidate.source === 'ai').length;
  }

  const seenAnchors = new Set<string>([`${secondaryHex}|${accentHex}`]);
  const selectedSecondaries = preserveSelectedAnchors
    ? [secondaryHex]
    : [secondaryHex, ...secondaryCandidates.slice(0, 1).map((candidate) => candidate.hex)];

  for (const candidateSecondary of selectedSecondaries) {
    let accentCandidates: PaletteRecommendationCandidate[] = [];
    if (apiKey && (Date.now() - buildStartedAt) < AI_BUILD_BUDGET_MS) {
      const accentResult = await recommendPaletteCandidates({
        mode: 'accent',
        primaryHex,
        secondaryHex: candidateSecondary,
        tone,
        count: 3,
        aiModelProfile,
      });
      accentCandidates = accentResult.candidates;
      aiCandidateCount += accentCandidates.filter((candidate) => candidate.source === 'ai').length;
    }

    const selectedAccents = preserveSelectedAnchors
      ? [accentHex]
      : [accentHex, ...accentCandidates.slice(0, 2).map((candidate) => candidate.hex)];
    const secondarySource = secondaryCandidates.find((candidate) => candidate.hex === candidateSecondary)?.source || 'deterministic';

    for (const candidateAccent of selectedAccents) {
      const key = `${candidateSecondary}|${candidateAccent}`;
      if (seenAnchors.has(key)) continue;
      seenAnchors.add(key);
      const accentSource = accentCandidates.find((candidate) => candidate.hex === candidateAccent)?.source || 'deterministic';
      anchorOptions.push({
        secondaryHex: candidateSecondary,
        accentHex: candidateAccent,
        aiUsed: secondarySource === 'ai' || accentSource === 'ai',
        sourceLabel: `${secondarySource}/${accentSource}`,
      });
    }
  }

  const evaluated = anchorOptions.map((option): EvaluatedOption => {
    const candidateTokens = buildFullTokens(buildBaseTokens(primaryHex, option.secondaryHex, option.accentHex, tone));
    const compiled = compileThemeTokens(candidateTokens, { modeIntent: tone, maxContrastPasses });
    const debt = summarizeContractDebt(compiled.issues);
    return {
      ...option,
      compiled,
      debt,
      distance:
        colorDistance(option.secondaryHex, secondaryHex)
        + colorDistance(option.accentHex, accentHex),
    };
  });

  evaluated.sort((a, b) => {
    if (a.debt.interactiveCritical !== b.debt.interactiveCritical) {
      return a.debt.interactiveCritical - b.debt.interactiveCritical;
    }
    if (a.debt.interactiveWarning !== b.debt.interactiveWarning) {
      return a.debt.interactiveWarning - b.debt.interactiveWarning;
    }
    if (a.compiled.criticalIssues.length !== b.compiled.criticalIssues.length) {
      return a.compiled.criticalIssues.length - b.compiled.criticalIssues.length;
    }
    if (a.compiled.warningIssues.length !== b.compiled.warningIssues.length) {
      return a.compiled.warningIssues.length - b.compiled.warningIssues.length;
    }
    if (a.debt.weightedDeficit !== b.debt.weightedDeficit) {
      return a.debt.weightedDeficit - b.debt.weightedDeficit;
    }
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }
    if (a.aiUsed !== b.aiUsed) {
      return a.aiUsed ? -1 : 1;
    }
    return 0;
  });

  const best = evaluated[0];
  if (!best) {
    const err: any = new Error('AI palette synthesis failed: no candidate anchors available.');
    err.statusCode = 422;
    err.recommendations = buildContractRecommendations(baselineCompiled.issues);
    throw err;
  }

  if (strictAiOnly && aiCandidateCount === 0) {
    console.warn('[ThemePaletteAI] Strict AI mode: no AI anchor candidates returned; accepting best synthesized palette.');
  }

  if (strictAiOnly && best.compiled.criticalIssues.length > 0) {
    const err: any = new Error('AI palette synthesis failed strict accessibility threshold (critical issues remain).');
    err.statusCode = 422;
    err.recommendations = buildContractRecommendations(best.compiled.issues);
    throw err;
  }

  if (input.autoFixContrast === true && best.compiled.criticalIssues.length > 0) {
    const err: any = new Error('AI palette synthesis failed auto-fix threshold (critical issues remain after remediation).');
    err.statusCode = 422;
    err.recommendations = buildContractRecommendations(best.compiled.issues);
    throw err;
  }

  const finalTokens = { ...best.compiled.tokens };
  if (preserveSelectedAnchors) {
    finalTokens['--primary'] = primaryHex;
    finalTokens['--secondary'] = secondaryHex;
    finalTokens['--accent'] = accentHex;
  }

  const elapsedMs = Date.now() - buildStartedAt;
  const appliedAnchors = {
    primaryHex: normalizeHex(finalTokens['--primary']) || primaryHex,
    secondaryHex: normalizeHex(finalTokens['--secondary']) || best.secondaryHex,
    accentHex: normalizeHex(finalTokens['--accent']) || best.accentHex,
  };
  const selectedAnchors = { primaryHex, secondaryHex, accentHex };
  const anchorPreserved =
    appliedAnchors.primaryHex === selectedAnchors.primaryHex
    && appliedAnchors.secondaryHex === selectedAnchors.secondaryHex
    && appliedAnchors.accentHex === selectedAnchors.accentHex;

  return {
    tone,
    tokens: finalTokens,
    source: (best.aiUsed || aiCandidateCount > 0) ? 'ai-assisted' : 'deterministic',
    accessibility: {
      baselineCritical,
      baselineWarnings,
      finalCritical: best.compiled.criticalIssues.length,
      finalWarnings: best.compiled.warningIssues.length,
    },
    recommendations: buildContractRecommendations(best.compiled.issues),
    diagnostics: {
      aiModelProfile,
      aiModelResolved,
      strictAiOnly,
      autoFixContrast: input.autoFixContrast === true,
      tone,
      elapsedMs,
      aiCandidateCount,
      selectedAnchors,
      appliedAnchors,
      anchorPreserved,
    },
  };
}
