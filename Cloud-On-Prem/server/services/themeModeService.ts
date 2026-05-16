function parseHexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = String(hex || "").trim().replace("#", "");
  if (normalized.length === 3) {
    const [r, g, b] = normalized.split("");
    return {
      r: parseInt(`${r}${r}`, 16),
      g: parseInt(`${g}${g}`, 16),
      b: parseInt(`${b}${b}`, 16),
    };
  }
  if (normalized.length === 6) {
    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16),
    };
  }
  return null;
}

function parseHslToRgb(color: string): { r: number; g: number; b: number } | null {
  const match = String(color || "")
    .trim()
    .match(
      /^hsla?\(\s*([0-9.]+)(?:deg|rad|grad|turn)?\s*(?:,|\s)\s*([0-9.]+)%\s*(?:,|\s)\s*([0-9.]+)%/i
    );
  if (!match) return null;

  const h = ((Number(match[1]) % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, Number(match[2]))) / 100;
  const l = Math.max(0, Math.min(100, Number(match[3]))) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rr = 0;
  let gg = 0;
  let bb = 0;
  if (h < 60) [rr, gg, bb] = [c, x, 0];
  else if (h < 120) [rr, gg, bb] = [x, c, 0];
  else if (h < 180) [rr, gg, bb] = [0, c, x];
  else if (h < 240) [rr, gg, bb] = [0, x, c];
  else if (h < 300) [rr, gg, bb] = [x, 0, c];
  else [rr, gg, bb] = [c, 0, x];

  return {
    r: Math.round((rr + m) * 255),
    g: Math.round((gg + m) * 255),
    b: Math.round((bb + m) * 255),
  };
}

function parseRgbColor(color: string): { r: number; g: number; b: number } | null {
  const match = String(color || "")
    .trim()
    .match(
      /^rgba?\(\s*([0-9.]+)\s*(?:,|\s)\s*([0-9.]+)\s*(?:,|\s)\s*([0-9.]+)(?:\s*(?:,|\/)\s*[0-9.%]+)?\s*\)$/i
    );
  if (!match) return null;
  return {
    r: Math.max(0, Math.min(255, Number(match[1]))),
    g: Math.max(0, Math.min(255, Number(match[2]))),
    b: Math.max(0, Math.min(255, Number(match[3]))),
  };
}

function colorToRgb(color: string | undefined): { r: number; g: number; b: number } | null {
  const value = String(color || "").trim();
  if (!value) return null;
  if (value.startsWith("#")) return parseHexToRgb(value);
  if (value.toLowerCase().startsWith("hsl")) return parseHslToRgb(value);
  if (value.toLowerCase().startsWith("rgb")) return parseRgbColor(value);
  return null;
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const channel = (value: number): number => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

function inferDarkThemeFromTokens(tokens: Record<string, string> | null | undefined): boolean | null {
  if (!tokens) return null;
  const background = colorToRgb(tokens["--background"] || tokens["--card"] || tokens["--surface"]);
  const foreground = colorToRgb(tokens["--foreground"] || tokens["--card-foreground"] || tokens["--text-primary"]);

  if (!background && !foreground) return null;
  if (background) {
    const bgLuminance = relativeLuminance(background);
    if (bgLuminance < 0.4) return true;
    if (bgLuminance > 0.6) return false;
  }
  if (background && foreground) {
    return relativeLuminance(foreground) > relativeLuminance(background);
  }
  if (foreground) {
    return relativeLuminance(foreground) > 0.5;
  }
  return null;
}

export function resolveThemeModeIntent(params: {
  explicit?: unknown;
  tokens?: Record<string, string> | null;
  tokensLight?: Record<string, string> | null;
  tokensDark?: Record<string, string> | null;
}): "light" | "dark" {
  if (params.explicit === "light" || params.explicit === "dark") return params.explicit;

  if (params.tokensDark && !params.tokensLight) return "dark";
  if (params.tokensLight && !params.tokensDark) return "light";

  const inferredFromActive = inferDarkThemeFromTokens(params.tokens);
  if (inferredFromActive === true) return "dark";
  if (inferredFromActive === false) return "light";

  const inferredFromDarkSet = inferDarkThemeFromTokens(params.tokensDark);
  if (inferredFromDarkSet === true) return "dark";

  const inferredFromLightSet = inferDarkThemeFromTokens(params.tokensLight);
  if (inferredFromLightSet === false) return "light";

  return "light";
}
