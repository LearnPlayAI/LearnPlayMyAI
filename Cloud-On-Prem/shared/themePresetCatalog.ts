import { buildFullTokens, BaseTokens } from "./themeTokenBuilder";

export type { BaseTokens };
export { buildFullTokens };

export interface ThemePreset {
  id: string;
  name: string;
  category:
    | "professional"
    | "energetic"
    | "natural"
    | "elegant"
    | "minimal";
  tags: string[];
  paletteFamily: string;
  tone: "light" | "dark";
  tokens: Record<string, string>;
}

const themeCategoriesInternal = [
  { id: "professional", name: "Professional" },
  { id: "energetic", name: "Energetic" },
  { id: "natural", name: "Natural" },
  { id: "elegant", name: "Elegant" },
  { id: "minimal", name: "Minimal" },
] as const;

type ThemeCategory = (typeof themeCategoriesInternal)[number]["id"];

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const hsl = (h: number, s: number, l: number): string => {
  const hue = ((Math.round(h) % 360) + 360) % 360;
  return `hsl(${hue}, ${clamp(Math.round(s), 0, 100)}%, ${clamp(
    Math.round(l),
    0,
    100
  )}%)`;
};

const hsla = (h: number, s: number, l: number, a: number): string => {
  const hue = ((Math.round(h) % 360) + 360) % 360;
  return `hsla(${hue}, ${clamp(Math.round(s), 0, 100)}%, ${clamp(
    Math.round(l),
    0,
    100
  )}%, ${Math.max(0, Math.min(1, a))})`;
};

const toSlug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

interface PaletteFamily {
  id: string;
  name: string;
  category: ThemeCategory;
  tags: string[];
  primaryHue: number;
  secondaryHue: number;
  accentHue: number;
}

const paletteFamilies: PaletteFamily[] = [
  {
    id: "ocean-tech",
    name: "Ocean Tech",
    category: "professional",
    tags: ["blue", "teal", "corporate", "trusted", "saas"],
    primaryHue: 212,
    secondaryHue: 193,
    accentHue: 173,
  },
  {
    id: "navy-gold",
    name: "Navy Gold",
    category: "professional",
    tags: ["navy", "gold", "executive", "finance", "premium"],
    primaryHue: 220,
    secondaryHue: 228,
    accentHue: 42,
  },
  {
    id: "indigo-cyan",
    name: "Indigo Cyan",
    category: "professional",
    tags: ["indigo", "cyan", "modern", "b2b", "clean"],
    primaryHue: 231,
    secondaryHue: 217,
    accentHue: 190,
  },
  {
    id: "emerald-slate",
    name: "Emerald Slate",
    category: "professional",
    tags: ["green", "slate", "sustainability", "operations"],
    primaryHue: 154,
    secondaryHue: 205,
    accentHue: 167,
  },
  {
    id: "royal-electric",
    name: "Royal Electric",
    category: "energetic",
    tags: ["purple", "blue", "bold", "startup", "innovation"],
    primaryHue: 259,
    secondaryHue: 224,
    accentHue: 297,
  },
  {
    id: "sunset-pop",
    name: "Sunset Pop",
    category: "energetic",
    tags: ["orange", "pink", "vibrant", "creative", "retail"],
    primaryHue: 19,
    secondaryHue: 345,
    accentHue: 38,
  },
  {
    id: "citrus-fresh",
    name: "Citrus Fresh",
    category: "energetic",
    tags: ["yellow", "green", "fresh", "wellness", "consumer"],
    primaryHue: 48,
    secondaryHue: 88,
    accentHue: 27,
  },
  {
    id: "berry-pulse",
    name: "Berry Pulse",
    category: "energetic",
    tags: ["magenta", "violet", "youthful", "brand", "digital"],
    primaryHue: 320,
    secondaryHue: 284,
    accentHue: 7,
  },
  {
    id: "forest-earth",
    name: "Forest Earth",
    category: "natural",
    tags: ["green", "brown", "earthy", "organic", "eco"],
    primaryHue: 126,
    secondaryHue: 32,
    accentHue: 148,
  },
  {
    id: "sage-stone",
    name: "Sage Stone",
    category: "natural",
    tags: ["sage", "neutral", "calm", "healthcare", "wellbeing"],
    primaryHue: 140,
    secondaryHue: 206,
    accentHue: 172,
  },
  {
    id: "terra-clay",
    name: "Terra Clay",
    category: "natural",
    tags: ["terracotta", "sand", "artisan", "lifestyle"],
    primaryHue: 17,
    secondaryHue: 35,
    accentHue: 80,
  },
  {
    id: "lagoon-mint",
    name: "Lagoon Mint",
    category: "natural",
    tags: ["teal", "mint", "coastal", "fresh", "spa"],
    primaryHue: 183,
    secondaryHue: 165,
    accentHue: 205,
  },
  {
    id: "charcoal-champagne",
    name: "Charcoal Champagne",
    category: "elegant",
    tags: ["charcoal", "champagne", "luxury", "premium", "hospitality"],
    primaryHue: 220,
    secondaryHue: 24,
    accentHue: 40,
  },
  {
    id: "plum-copper",
    name: "Plum Copper",
    category: "elegant",
    tags: ["plum", "copper", "boutique", "fashion", "editorial"],
    primaryHue: 287,
    secondaryHue: 18,
    accentHue: 330,
  },
  {
    id: "midnight-rose",
    name: "Midnight Rose",
    category: "elegant",
    tags: ["midnight", "rose", "refined", "high-end"],
    primaryHue: 244,
    secondaryHue: 332,
    accentHue: 10,
  },
  {
    id: "obsidian-emerald",
    name: "Obsidian Emerald",
    category: "elegant",
    tags: ["black", "emerald", "exclusive", "luxury", "club"],
    primaryHue: 156,
    secondaryHue: 218,
    accentHue: 44,
  },
  {
    id: "mono-steel",
    name: "Mono Steel",
    category: "minimal",
    tags: ["monochrome", "gray", "clean", "neutral", "enterprise"],
    primaryHue: 215,
    secondaryHue: 215,
    accentHue: 208,
  },
  {
    id: "mono-ink",
    name: "Mono Ink",
    category: "minimal",
    tags: ["black", "white", "editorial", "minimal"],
    primaryHue: 222,
    secondaryHue: 222,
    accentHue: 222,
  },
  {
    id: "ash-blue",
    name: "Ash Blue",
    category: "minimal",
    tags: ["muted", "blue-gray", "quiet", "calm", "workspace"],
    primaryHue: 214,
    secondaryHue: 203,
    accentHue: 229,
  },
  {
    id: "sand-ivory",
    name: "Sand Ivory",
    category: "minimal",
    tags: ["beige", "ivory", "soft", "neutral", "minimal"],
    primaryHue: 35,
    secondaryHue: 42,
    accentHue: 26,
  },
];

const toneVariants: Array<{
  id: string;
  tone: "light" | "dark";
  saturationShift: number;
  lightnessShift: number;
}> = [
  { id: "light-a", tone: "light", saturationShift: 0, lightnessShift: 0 },
  { id: "light-b", tone: "light", saturationShift: 4, lightnessShift: -2 },
  { id: "light-c", tone: "light", saturationShift: -5, lightnessShift: 2 },
  { id: "light-d", tone: "light", saturationShift: 8, lightnessShift: -4 },
  { id: "light-e", tone: "light", saturationShift: -2, lightnessShift: 3 },
];

function buildSeedTokens(
  family: PaletteFamily,
  variantIndex: number,
  toneVariant: (typeof toneVariants)[number]
): BaseTokens {
  const satBump = toneVariant.saturationShift + (variantIndex % 3) * 2;
  const litBump = toneVariant.lightnessShift + (variantIndex % 2 === 0 ? 1 : -1);

  const primarySatBase = toneVariant.tone === "dark" ? 62 : 68;
  const secondarySatBase = toneVariant.tone === "dark" ? 48 : 56;
  const accentSatBase = toneVariant.tone === "dark" ? 70 : 74;

  const primaryLightBase = toneVariant.tone === "dark" ? 56 : 43;
  const secondaryLightBase = toneVariant.tone === "dark" ? 39 : 34;
  const accentLightBase = toneVariant.tone === "dark" ? 62 : 47;

  const primarySat = clamp(primarySatBase + satBump, 38, 92);
  const secondarySat = clamp(secondarySatBase + satBump / 2, 30, 85);
  const accentSat = clamp(accentSatBase + satBump, 45, 96);

  const primaryLight = clamp(primaryLightBase + litBump, 32, 74);
  const secondaryLight = clamp(secondaryLightBase + litBump / 2, 22, 64);
  const accentLight = clamp(accentLightBase + litBump, 30, 78);

  const bgLight = toneVariant.tone === "dark" ? 7 + (variantIndex % 3) : 98 - (variantIndex % 3);
  const bgSat = toneVariant.tone === "dark" ? 18 : 24;
  const fgLight = toneVariant.tone === "dark" ? 95 : 12;

  return {
    primary: hsl(family.primaryHue, primarySat, primaryLight),
    primaryForeground: primaryLight >= 56 ? hsl(family.primaryHue, 65, 10) : hsl(0, 0, 100),
    secondary: hsl(family.secondaryHue, secondarySat, secondaryLight),
    secondaryForeground: secondaryLight >= 56 ? hsl(family.secondaryHue, 65, 10) : hsl(0, 0, 100),
    accent: hsl(family.accentHue, accentSat, accentLight),
    accentForeground: accentLight >= 56 ? hsl(family.accentHue, 65, 10) : hsl(0, 0, 100),
    background: hsl(family.primaryHue, bgSat, bgLight),
    foreground: hsl(family.primaryHue, toneVariant.tone === "dark" ? 12 : 28, fgLight),
    card: hsl(family.primaryHue, toneVariant.tone === "dark" ? 16 : 30, toneVariant.tone === "dark" ? 10 + (variantIndex % 2) : 100),
    cardForeground: hsl(family.primaryHue, toneVariant.tone === "dark" ? 10 : 26, fgLight),
    muted: hsl(
      family.primaryHue,
      toneVariant.tone === "dark" ? 14 : 20,
      toneVariant.tone === "dark" ? 16 : 92 - (variantIndex % 2)
    ),
    mutedForeground: hsl(family.primaryHue, 10, toneVariant.tone === "dark" ? 63 : 45),
    border: hsl(
      family.primaryHue,
      toneVariant.tone === "dark" ? 18 : 24,
      toneVariant.tone === "dark" ? 22 : 84
    ),
    ring: hsl(family.primaryHue, primarySat, primaryLight),
    gradientFrom: hsl(family.primaryHue, primarySat, primaryLight),
    gradientTo: hsl(family.primaryHue, primarySat, primaryLight),
    gamePrimary: hsl((family.primaryHue + 24) % 360, clamp(primarySat + 10, 45, 98), clamp(primaryLight + 4, 38, 76)),
    gameGlow: hsla((family.primaryHue + 24) % 360, clamp(primarySat + 10, 45, 98), clamp(primaryLight + 4, 38, 76), 0.55),
    isDark: toneVariant.tone === "dark",
  };
}

function makePresetName(
  family: PaletteFamily,
  tone: "light" | "dark",
  variantIndex: number
): string {
  const label = tone === "dark" ? "Night" : "Day";
  return `${family.name} ${label} ${String(variantIndex + 1).padStart(2, "0")}`;
}

function generateThemePresets(): ThemePreset[] {
  const presets: ThemePreset[] = [];

  for (const family of paletteFamilies) {
    for (let i = 0; i < toneVariants.length; i += 1) {
      const toneVariant = toneVariants[i];
      const seed = buildSeedTokens(family, i, toneVariant);
      const guardedTokens = buildFullTokens(seed);
      const name = makePresetName(family, toneVariant.tone, i);
      presets.push({
        id: `${toSlug(family.category)}-${toSlug(family.id)}-${toneVariant.id}`,
        name,
        category: family.category,
        paletteFamily: family.name,
        tone: toneVariant.tone,
        tags: Array.from(new Set([...family.tags, toneVariant.tone])),
        tokens: guardedTokens,
      });
    }
  }

  return presets;
}

export const themePresets: ThemePreset[] = generateThemePresets();

export const getPresetById = (id: string): ThemePreset | undefined =>
  themePresets.find((preset) => preset.id === id);

export const getPresetsByCategory = (
  category: ThemePreset["category"]
): ThemePreset[] => themePresets.filter((preset) => preset.category === category);

export const themeCategories = [...themeCategoriesInternal];

const allTags = Array.from(new Set(themePresets.flatMap((preset) => preset.tags)));
export const themeTags: Record<ThemeCategory, string[]> = {
  professional: allTags.filter((tag) =>
    themePresets.some(
      (preset) => preset.category === "professional" && preset.tags.includes(tag)
    )
  ),
  energetic: allTags.filter((tag) =>
    themePresets.some(
      (preset) => preset.category === "energetic" && preset.tags.includes(tag)
    )
  ),
  natural: allTags.filter((tag) =>
    themePresets.some(
      (preset) => preset.category === "natural" && preset.tags.includes(tag)
    )
  ),
  elegant: allTags.filter((tag) =>
    themePresets.some(
      (preset) => preset.category === "elegant" && preset.tags.includes(tag)
    )
  ),
  minimal: allTags.filter((tag) =>
    themePresets.some(
      (preset) => preset.category === "minimal" && preset.tags.includes(tag)
    )
  ),
};
