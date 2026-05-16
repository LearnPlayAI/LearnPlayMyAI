#!/usr/bin/env tsx
import * as fs from 'fs';
import * as path from 'path';
import { REQUIRED_TOKEN_KEYS } from '../shared/brandingTokens';

const EXPECTED_TOKEN_COUNT = REQUIRED_TOKEN_KEYS.length;

const CRITICAL_TOKENS = [
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--destructive-foreground',
  '--border',
  '--input',
  '--ring',
  '--popover',
  '--popover-foreground',
];

interface Violation {
  file: string;
  line: number;
  column: number;
  code: string;
  match: string;
  type: 'hex' | 'tailwind' | 'hsl';
  suggestion?: string;
}

interface Report {
  violations: Violation[];
  filesScanned: number;
  filesWithViolations: number;
  totalViolations: number;
}

interface TokenValidationResult {
  tokenCount: number;
  expectedCount: number;
  missingTokens: string[];
  extraTokens: string[];
  invalidFormats: { token: string; value: string; reason: string }[];
  namingViolations: { token: string; reason: string }[];
  contrastWarnings: ContrastWarning[];
  criticalMissing: string[];
}

interface ContrastWarning {
  pair: string;
  foreground: string;
  background: string;
  ratio: number;
  required: number;
  level: 'error' | 'warning';
}

const TAILWIND_COLOR_PATTERNS = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime',
  'green', 'emerald', 'teal', 'cyan', 'sky',
  'blue', 'indigo', 'violet', 'purple', 'fuchsia',
  'pink', 'rose', 'white', 'black'
];

const TAILWIND_COLOR_PREFIXES = [
  'text-', 'bg-', 'border-', 'ring-', 'outline-',
  'divide-', 'placeholder-', 'from-', 'via-', 'to-',
  'accent-', 'caret-', 'fill-', 'stroke-', 'shadow-',
  'decoration-'
];

const KNOWN_EXCEPTIONS = [
  { pattern: /yellow-400/, context: 'star rating', files: ['*'] },
  { pattern: /yellow-500/, context: 'star rating', files: ['*'] },
  { pattern: /fill="[^"]*"/, context: 'recharts', files: ['**/chart*.tsx', '**/Chart*.tsx'] },
  { pattern: /stroke="[^"]*"/, context: 'recharts', files: ['**/chart*.tsx', '**/Chart*.tsx'] },
  { pattern: /\.recharts/, context: 'recharts styling', files: ['*'] },
  { pattern: /chart-\d/, context: 'chart colors', files: ['*'] },
  { pattern: /--chart-/, context: 'chart CSS variables', files: ['*'] },
  { pattern: /green-400|green-500|green-600/, context: 'success states', files: ['*'] },
  { pattern: /red-300|red-400|red-500|red-600/, context: 'error/destructive states', files: ['*'] },
  { pattern: /yellow-200|yellow-300/, context: 'warning states', files: ['*'] },
  { pattern: /orange-500|orange-600|orange-700/, context: 'warning/caution states', files: ['*'] },
  { pattern: /orange-400/, context: 'exit/warning action buttons', files: ['*'] },
  { pattern: /amber-100|amber-200|amber-400|amber-500|amber-600/, context: 'warning/accent/bronze medal states', files: ['*'] },
  { pattern: /#ffd700|#ff6b6b|#4ecdc4|#45b7d1|#96ceb4|#feca57/, context: 'confetti animation colors', files: ['*'] },
  { pattern: /Confetti|confetti/, context: 'confetti component', files: ['*'] },
  { pattern: /gray-300/, context: 'silver medal color', files: ['**/Leaderboard*.tsx', '**/QuizLeaderboard*.tsx'] },
  { pattern: /#1f2937|#374151|#4b5563/, context: 'Uppy library styling overrides', files: ['**/ObjectUploader*.tsx'] },
  { pattern: /#667eea|#764ba2|#ffffff/, context: 'avatar cosmetics dynamic effect colors', files: ['**/QuizLeaderboard*.tsx', '**/PlayerAvatar*.tsx'] },
  { pattern: /hsl\(270/, context: 'LPCreditIcon SVG gradient colors', files: ['**/LPCreditIcon*.tsx'] },
  { pattern: /hsl\(43/, context: 'LPCreditIcon coin gold accent', files: ['**/LPCreditIcon*.tsx'] },
  { pattern: /yellow-900|orange-900/, context: 'leaderboard top 3 highlight gradients', files: ['**/QuizLeaderboard*.tsx'] },
  { pattern: /blue-400|blue-500/, context: 'info/link semantic color', files: ['*'] },
  { pattern: /red-200/, context: 'error alert text on dark background', files: ['*'] },
  { pattern: /hsl\(/, context: 'theme definition source colors', files: ['**/BrandingContext*.tsx', '**/defaultTheme*.ts', '**/themeToken*.ts', '**/ThemeGallery*.tsx', '**/ColorPicker*.tsx', '**/ThemeEditor*.tsx'] },
  { pattern: /#[a-fA-F0-9]{6}/, context: 'brand editor preview example colors', files: ['**/Preview*.tsx', '**/brand-editor/**'] },
  { pattern: /gray-\d+|slate-\d+/, context: 'brand editor preview UI examples', files: ['**/Preview*.tsx', '**/brand-editor/**'] },
  { pattern: /PlayerAvatar/, context: 'avatar component with dynamic cosmetic colors', files: ['**/PlayerAvatar*.jsx'] },
  { pattern: /#[a-fA-F0-9]{3,8}/, context: 'dynamic avatar/cosmetic effect colors', files: ['**/PlayerAvatar*.jsx', '**/WalletInventory*.tsx'] },
  { pattern: /hsl\(/, context: 'brand editor preview colors', files: ['**/Preview*.tsx', '**/brand-editor/**'] },
  { pattern: /hsl\(/, context: 'chart/analytics colors', files: ['**/*Analytics*.tsx', '**/*Revenue*.tsx', '**/*Dashboard*.tsx'] },
  { pattern: /.test\.tsx?$/, context: 'test files', files: ['**/*.test.tsx', '**/*.test.ts'] },
  { pattern: /hsl\(142/, context: 'success/confetti colors', files: ['**/verify-email*.tsx', '**/LessonViewer*.tsx'] },
  { pattern: /#[a-fA-F0-9]{6}/, context: 'confetti animation colors', files: ['**/LessonViewer*.tsx'] },
  { pattern: /#[a-fA-F0-9]{6}/, context: 'theme editor default token source colors', files: ['**/ThemeEditor*.tsx'] },
  { pattern: /hsl\(/, context: 'landing page theme example swatches', files: ['**/landing.jsx'] },
  { pattern: /hsla?\(/, context: 'test file theme values', files: ['**/*.test.tsx', '**/*.test.ts'] },
];

const COLOR_VARIABLE_SUGGESTIONS: Record<string, string> = {
  '#fff': 'var(--foreground) or var(--background)',
  '#ffffff': 'var(--foreground) or var(--background)',
  '#000': 'var(--background) or var(--foreground)',
  '#000000': 'var(--background) or var(--foreground)',
  'purple': 'var(--primary)',
  'violet': 'var(--primary)',
  'slate': 'var(--muted) or var(--card)',
  'gray': 'var(--muted) or var(--muted-foreground)',
  'zinc': 'var(--muted) or var(--card)',
  'amber': 'var(--accent)',
  'yellow': 'var(--accent)',
  'red': 'var(--destructive)',
  'green': 'var(--success) or hsl(142, 76%, 36%)',
  'blue': 'var(--primary) or var(--ring)',
};

function parseArgs(): { 
  fix: boolean; 
  ignoreFiles: string[]; 
  outputFormat: 'console' | 'json'; 
  help: boolean;
  validateTokens: boolean;
  tokenFile?: string;
} {
  const args = process.argv.slice(2);
  const result = {
    fix: false,
    ignoreFiles: [] as string[],
    outputFormat: 'console' as 'console' | 'json',
    help: false,
    validateTokens: false,
    tokenFile: undefined as string | undefined,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--fix') {
      result.fix = true;
    } else if (arg === '--ignore-file' && args[i + 1]) {
      result.ignoreFiles.push(args[++i]);
    } else if (arg === '--json') {
      result.outputFormat = 'json';
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--validate-tokens') {
      result.validateTokens = true;
    } else if (arg === '--token-file' && args[i + 1]) {
      result.tokenFile = args[++i];
    }
  }

  return result;
}

function showHelp(): void {
  console.log(`
🎨 Theme Coverage Checker

Usage: tsx scripts/check-theme-coverage.ts [options]

Options:
  --fix              Show suggested replacements for hardcoded colors
  --ignore-file      Skip specific files (can be used multiple times)
  --json             Output results in JSON format
  --validate-tokens  Validate theme tokens from a JSON file or CSS file
  --token-file       Path to JSON/CSS file containing tokens to validate
  --help, -h         Show this help message

Examples:
  tsx scripts/check-theme-coverage.ts
  tsx scripts/check-theme-coverage.ts --fix
  tsx scripts/check-theme-coverage.ts --ignore-file "src/legacy/**"
  tsx scripts/check-theme-coverage.ts --json > report.json
  tsx scripts/check-theme-coverage.ts --validate-tokens --token-file theme.json

Token Validation Checks:
  - Token count: Verifies exactly ${EXPECTED_TOKEN_COUNT} tokens are present
  - HSL format: Validates all color values are valid HSL format
  - Contrast: Checks WCAG 2.1 AA contrast ratios for key pairs
  - Critical tokens: Ensures mandatory tokens are present
  - Naming: Verifies tokens start with '--' and use kebab-case

Detected Patterns:
  - Hardcoded hex colors (#fff, #000, #a855f7, etc.)
  - Hardcoded Tailwind colors (text-purple-500, bg-slate-800, etc.)
  - Inline HSL without var() (hsl(262, 83%, 58%))

Known Exceptions (automatically ignored):
  - yellow-400/yellow-500 for star ratings
  - Chart colors in recharts components
  - chart-* CSS variable references
  - Status colors: green-400/500/600 (success), red-300/400/500/600 (error)
  - Warning colors: yellow-200/300, orange-500/600/700, amber-100/200/400/500
  - Confetti animation colors (hex colors in confetti components)
`);
}

function getAllTsxFiles(dir: string, ignorePatterns: string[] = []): string[] {
  const files: string[] = [];

  function walkDir(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(dir, fullPath);

      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        walkDir(fullPath);
      } else if (entry.isFile() && /\.(tsx|jsx)$/.test(entry.name)) {
        const shouldIgnore = ignorePatterns.some(pattern => {
          if (pattern.includes('*')) {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            return regex.test(relativePath);
          }
          return relativePath.includes(pattern);
        });

        if (!shouldIgnore) {
          files.push(fullPath);
        }
      }
    }
  }

  walkDir(dir);
  return files;
}

function isException(match: string, filePath: string, lineContent: string): boolean {
  for (const exception of KNOWN_EXCEPTIONS) {
    if (exception.pattern.test(match) || exception.pattern.test(lineContent)) {
      const fileMatches = exception.files.some(filePattern => {
        if (filePattern === '*') return true;
        const regex = new RegExp(filePattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
        return regex.test(filePath);
      });
      if (fileMatches) return true;
    }
  }

  if (lineContent.includes('recharts') || lineContent.includes('Recharts')) return true;
  if (lineContent.includes('ResponsiveContainer')) return true;
  if (/fill=\{/.test(lineContent) && /chart/i.test(filePath)) return true;
  if (/stroke=\{/.test(lineContent) && /chart/i.test(filePath)) return true;
  if (/var\(--chart-\d\)/.test(lineContent)) return true;
  if (/StarIcon|star.*rating|rating.*star/i.test(lineContent)) return true;

  return false;
}

function getSuggestion(match: string, type: 'hex' | 'tailwind' | 'hsl'): string | undefined {
  if (type === 'hex') {
    const lowerMatch = match.toLowerCase();
    if (COLOR_VARIABLE_SUGGESTIONS[lowerMatch]) {
      return COLOR_VARIABLE_SUGGESTIONS[lowerMatch];
    }
    if (/^#[0-9a-f]{3,6}$/i.test(match)) {
      return 'Consider using a CSS variable from index.css';
    }
  }

  if (type === 'tailwind') {
    for (const [color, suggestion] of Object.entries(COLOR_VARIABLE_SUGGESTIONS)) {
      if (match.includes(color)) {
        return `Use Tailwind theme utilities or ${suggestion}`;
      }
    }
    return 'Consider using theme-aware utilities (e.g., bg-primary, text-foreground)';
  }

  if (type === 'hsl') {
    return 'Wrap in var() or use a CSS variable (e.g., var(--primary))';
  }

  return undefined;
}

function checkFile(filePath: string, showFix: boolean): Violation[] {
  const violations: Violation[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const relativePath = path.relative(process.cwd(), filePath);

  const hexPattern = /#([0-9a-fA-F]{3,8})\b/g;
  const tailwindColorPattern = new RegExp(
    `(${TAILWIND_COLOR_PREFIXES.join('|')})(${TAILWIND_COLOR_PATTERNS.join('|')})-(\\d{2,3}|50)`,
    'g'
  );
  const hslPattern = /(?<!var\()hsl\(\s*\d+\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*\)/g;
  const hslaPattern = /(?<!var\()hsla?\(\s*\d+\s*,?\s*[\d.]+%?\s*,?\s*[\d.]+%?\s*(?:,?\s*[\d.]+)?\s*\)/g;

  lines.forEach((line, lineIndex) => {
    const lineNumber = lineIndex + 1;

    if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('/*')) {
      return;
    }

    let match: RegExpExecArray | null;

    hexPattern.lastIndex = 0;
    while ((match = hexPattern.exec(line)) !== null) {
      const fullMatch = match[0];

      if (isException(fullMatch, relativePath, line)) continue;
      if (/className=.*\{.*\}/.test(line) && line.includes('var(')) continue;
      if (line.includes('style=') && line.includes('var(')) continue;

      violations.push({
        file: relativePath,
        line: lineNumber,
        column: match.index + 1,
        code: line.trim(),
        match: fullMatch,
        type: 'hex',
        suggestion: showFix ? getSuggestion(fullMatch, 'hex') : undefined
      });
    }

    tailwindColorPattern.lastIndex = 0;
    while ((match = tailwindColorPattern.exec(line)) !== null) {
      const fullMatch = match[0];

      if (isException(fullMatch, relativePath, line)) continue;

      violations.push({
        file: relativePath,
        line: lineNumber,
        column: match.index + 1,
        code: line.trim(),
        match: fullMatch,
        type: 'tailwind',
        suggestion: showFix ? getSuggestion(fullMatch, 'tailwind') : undefined
      });
    }

    hslaPattern.lastIndex = 0;
    while ((match = hslaPattern.exec(line)) !== null) {
      const fullMatch = match[0];

      if (isException(fullMatch, relativePath, line)) continue;
      if (line.includes('var(') && line.indexOf('var(') < match.index) continue;

      violations.push({
        file: relativePath,
        line: lineNumber,
        column: match.index + 1,
        code: line.trim(),
        match: fullMatch,
        type: 'hsl',
        suggestion: showFix ? getSuggestion(fullMatch, 'hsl') : undefined
      });
    }
  });

  return violations;
}

function formatConsoleOutput(report: Report, showFix: boolean): void {
  console.log('\n🎨 Theme Coverage Report\n');
  console.log('═'.repeat(60));

  if (report.violations.length === 0) {
    console.log('\n✅ No hardcoded colors found! Your theme coverage is complete.\n');
    return;
  }

  const byFile = new Map<string, Violation[]>();
  for (const v of report.violations) {
    if (!byFile.has(v.file)) byFile.set(v.file, []);
    byFile.get(v.file)!.push(v);
  }

  for (const [file, violations] of Array.from(byFile.entries())) {
    console.log(`\n📁 ${file}`);
    console.log('─'.repeat(60));

    for (const v of violations) {
      const typeIcon = v.type === 'hex' ? '🔴' : v.type === 'tailwind' ? '🟣' : '🟡';
      console.log(`  ${typeIcon} Line ${v.line}:${v.column} - ${v.match}`);
      console.log(`     ${v.code.substring(0, 80)}${v.code.length > 80 ? '...' : ''}`);
      if (showFix && v.suggestion) {
        console.log(`     💡 Suggestion: ${v.suggestion}`);
      }
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('\n📊 Summary');
  console.log(`   Files scanned: ${report.filesScanned}`);
  console.log(`   Files with violations: ${report.filesWithViolations}`);
  console.log(`   Total violations: ${report.totalViolations}`);

  const hexCount = report.violations.filter(v => v.type === 'hex').length;
  const tailwindCount = report.violations.filter(v => v.type === 'tailwind').length;
  const hslCount = report.violations.filter(v => v.type === 'hsl').length;

  console.log(`\n   By type:`);
  console.log(`     🔴 Hex colors: ${hexCount}`);
  console.log(`     🟣 Tailwind colors: ${tailwindCount}`);
  console.log(`     🟡 Inline HSL: ${hslCount}`);

  console.log('\n💡 To see fix suggestions, run with --fix flag');
  console.log('');
}

function isValidHSLFormat(value: string): { valid: boolean; reason?: string } {
  const hslRegex = /^hsl\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)$/i;
  const match = value.trim().match(hslRegex);
  
  if (!match) {
    if (value.includes('hsl') || value.includes('hsla')) {
      return { valid: false, reason: 'Invalid HSL syntax. Expected: hsl(H, S%, L%)' };
    }
    if (value.startsWith('#')) {
      return { valid: false, reason: 'Hex color detected. Use HSL format: hsl(H, S%, L%)' };
    }
    if (value.includes('rgb')) {
      return { valid: false, reason: 'RGB color detected. Use HSL format: hsl(H, S%, L%)' };
    }
    if (value === 'transparent' || value === 'inherit' || value === 'currentColor') {
      return { valid: true };
    }
    return { valid: false, reason: 'Invalid color format. Expected: hsl(H, S%, L%)' };
  }

  const h = parseFloat(match[1]);
  const s = parseFloat(match[2]);
  const l = parseFloat(match[3]);

  if (h < 0 || h > 360) {
    return { valid: false, reason: `Hue value ${h} out of range (0-360)` };
  }
  if (s < 0 || s > 100) {
    return { valid: false, reason: `Saturation value ${s}% out of range (0-100%)` };
  }
  if (l < 0 || l > 100) {
    return { valid: false, reason: `Lightness value ${l}% out of range (0-100%)` };
  }

  return { valid: true };
}

function isValidTokenName(name: string): { valid: boolean; reason?: string } {
  if (!name.startsWith('--')) {
    return { valid: false, reason: 'Token must start with "--"' };
  }

  const tokenName = name.slice(2);
  
  if (tokenName.length === 0) {
    return { valid: false, reason: 'Token name cannot be empty' };
  }

  const kebabCaseRegex = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
  if (!kebabCaseRegex.test(tokenName)) {
    if (/[A-Z]/.test(tokenName)) {
      return { valid: false, reason: 'Token name must be kebab-case (no uppercase letters)' };
    }
    if (/_/.test(tokenName)) {
      return { valid: false, reason: 'Token name must use hyphens, not underscores' };
    }
    if (/--/.test(tokenName)) {
      return { valid: false, reason: 'Token name should not have consecutive hyphens' };
    }
    return { valid: false, reason: 'Token name must be valid kebab-case' };
  }

  return { valid: true };
}

function colorToRGB(color: string): { r: number; g: number; b: number } | null {
  const trimmed = color.trim();
  
  const hslMatch = trimmed.match(/hsl\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)/i);
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]);
    const s = parseFloat(hslMatch[2]) / 100;
    const l = parseFloat(hslMatch[3]) / 100;
    
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;

    let r = 0, g = 0, b = 0;

    if (0 <= h && h < 60) { r = c; g = x; b = 0; }
    else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
    else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
    else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
    else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
    else if (300 <= h && h < 360) { r = c; g = 0; b = x; }

    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255),
    };
  }
  
  return null;
}

function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(color1: string, color2: string): number {
  const rgb1 = colorToRGB(color1);
  const rgb2 = colorToRGB(color2);
  
  if (!rgb1 || !rgb2) {
    return 1;
  }
  
  const l1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
  
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  
  return (lighter + 0.05) / (darker + 0.05);
}

function getContrastWarnings(tokens: Record<string, string>): ContrastWarning[] {
  const warnings: ContrastWarning[] = [];
  
  const pairs = [
    { name: 'Primary on Background', fg: '--primary', bg: '--background' },
    { name: 'Primary Foreground on Primary', fg: '--primary-foreground', bg: '--primary' },
    { name: 'Secondary Foreground on Secondary', fg: '--secondary-foreground', bg: '--secondary' },
    { name: 'Accent Foreground on Accent', fg: '--accent-foreground', bg: '--accent' },
    { name: 'Foreground on Background', fg: '--foreground', bg: '--background' },
    { name: 'Card Foreground on Card', fg: '--card-foreground', bg: '--card' },
    { name: 'Muted Foreground on Background', fg: '--muted-foreground', bg: '--background' },
    { name: 'Muted Foreground on Muted', fg: '--muted-foreground', bg: '--muted' },
    { name: 'Destructive Foreground on Destructive', fg: '--destructive-foreground', bg: '--destructive' },
    { name: 'Popover Foreground on Popover', fg: '--popover-foreground', bg: '--popover' },
    { name: 'Button Primary FG on Button Primary BG', fg: '--btn-primary-fg', bg: '--btn-primary-bg' },
    { name: 'Button Secondary FG on Button Secondary BG', fg: '--btn-secondary-fg', bg: '--btn-secondary-bg' },
    { name: 'Button Danger FG on Button Danger BG', fg: '--btn-danger-fg', bg: '--btn-danger-bg' },
    { name: 'Input FG on Input BG', fg: '--input-fg', bg: '--input-bg' },
    { name: 'Nav FG on Nav BG', fg: '--nav-fg', bg: '--nav-bg' },
    { name: 'Modal FG on Modal BG', fg: '--modal-fg', bg: '--modal-bg' },
  ];
  
  for (const pair of pairs) {
    const fg = tokens[pair.fg];
    const bg = tokens[pair.bg];
    
    if (fg && bg) {
      const ratio = getContrastRatio(fg, bg);
      
      if (ratio < 4.5) {
        warnings.push({
          pair: pair.name,
          foreground: fg,
          background: bg,
          ratio: Math.round(ratio * 100) / 100,
          required: 4.5,
          level: ratio < 3 ? 'error' : 'warning',
        });
      }
    }
  }
  
  return warnings;
}

function parseTokensFromJSON(content: string): Record<string, string> {
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === 'object' && parsed !== null) {
      if (parsed.tokens && typeof parsed.tokens === 'object') {
        return parsed.tokens;
      }
      return parsed;
    }
  } catch (e) {
    throw new Error('Invalid JSON format');
  }
  return {};
}

function parseTokensFromCSS(content: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  const varRegex = /(--[\w-]+)\s*:\s*([^;]+);/g;
  
  let match;
  while ((match = varRegex.exec(content)) !== null) {
    tokens[match[1]] = match[2].trim();
  }
  
  return tokens;
}

function validateTokens(tokens: Record<string, string>): TokenValidationResult {
  const tokenKeys = Object.keys(tokens);
  const requiredSet = new Set(REQUIRED_TOKEN_KEYS as readonly string[]);
  const providedSet = new Set(tokenKeys);

  const missingTokens = REQUIRED_TOKEN_KEYS.filter(key => !providedSet.has(key));
  const extraTokens = tokenKeys.filter(key => !requiredSet.has(key));

  const criticalMissing = CRITICAL_TOKENS.filter(token => !providedSet.has(token));

  const invalidFormats: { token: string; value: string; reason: string }[] = [];
  const namingViolations: { token: string; reason: string }[] = [];

  for (const [token, value] of Object.entries(tokens)) {
    const nameResult = isValidTokenName(token);
    if (!nameResult.valid && nameResult.reason) {
      namingViolations.push({ token, reason: nameResult.reason });
    }

    const formatResult = isValidHSLFormat(value);
    if (!formatResult.valid && formatResult.reason) {
      invalidFormats.push({ token, value, reason: formatResult.reason });
    }
  }

  const contrastWarnings = getContrastWarnings(tokens);

  return {
    tokenCount: tokenKeys.length,
    expectedCount: EXPECTED_TOKEN_COUNT,
    missingTokens,
    extraTokens,
    invalidFormats,
    namingViolations,
    contrastWarnings,
    criticalMissing,
  };
}

function formatTokenValidationOutput(result: TokenValidationResult, outputFormat: 'console' | 'json'): void {
  if (outputFormat === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('\n🎨 Theme Token Validation Report\n');
  console.log('═'.repeat(60));

  console.log('\n📊 Token Count');
  console.log('─'.repeat(60));
  const countStatus = result.tokenCount === result.expectedCount ? '✅' : '⚠️';
  console.log(`  ${countStatus} Found: ${result.tokenCount} / Expected: ${result.expectedCount}`);
  if (result.tokenCount !== result.expectedCount) {
    const diff = result.tokenCount - result.expectedCount;
    console.log(`     ${diff > 0 ? `+${diff} extra` : `${diff} missing`} tokens`);
  }

  if (result.criticalMissing.length > 0) {
    console.log('\n🚨 Critical Missing Tokens');
    console.log('─'.repeat(60));
    for (const token of result.criticalMissing) {
      console.log(`  ❌ ${token}`);
    }
  } else {
    console.log('\n✅ All critical tokens present');
  }

  if (result.missingTokens.length > 0) {
    console.log(`\n⚠️  Missing Tokens (${result.missingTokens.length})`);
    console.log('─'.repeat(60));
    for (const token of result.missingTokens.slice(0, 20)) {
      console.log(`  - ${token}`);
    }
    if (result.missingTokens.length > 20) {
      console.log(`  ... and ${result.missingTokens.length - 20} more`);
    }
  }

  if (result.extraTokens.length > 0) {
    console.log(`\n📝 Extra Tokens (${result.extraTokens.length})`);
    console.log('─'.repeat(60));
    for (const token of result.extraTokens.slice(0, 10)) {
      console.log(`  + ${token}`);
    }
    if (result.extraTokens.length > 10) {
      console.log(`  ... and ${result.extraTokens.length - 10} more`);
    }
  }

  if (result.namingViolations.length > 0) {
    console.log(`\n📛 Naming Violations (${result.namingViolations.length})`);
    console.log('─'.repeat(60));
    for (const violation of result.namingViolations.slice(0, 10)) {
      console.log(`  ❌ ${violation.token}: ${violation.reason}`);
    }
    if (result.namingViolations.length > 10) {
      console.log(`  ... and ${result.namingViolations.length - 10} more`);
    }
  }

  if (result.invalidFormats.length > 0) {
    console.log(`\n🎨 Invalid Color Formats (${result.invalidFormats.length})`);
    console.log('─'.repeat(60));
    for (const invalid of result.invalidFormats.slice(0, 10)) {
      console.log(`  ❌ ${invalid.token}: "${invalid.value}"`);
      console.log(`     ${invalid.reason}`);
    }
    if (result.invalidFormats.length > 10) {
      console.log(`  ... and ${result.invalidFormats.length - 10} more`);
    }
  }

  if (result.contrastWarnings.length > 0) {
    console.log(`\n🔍 Contrast Issues (${result.contrastWarnings.length})`);
    console.log('─'.repeat(60));
    for (const warning of result.contrastWarnings) {
      const icon = warning.level === 'error' ? '🔴' : '🟡';
      console.log(`  ${icon} ${warning.pair}`);
      console.log(`     Ratio: ${warning.ratio}:1 (Required: ${warning.required}:1)`);
    }
  } else {
    console.log('\n✅ All contrast ratios pass WCAG 2.1 AA');
  }

  console.log('\n' + '═'.repeat(60));
  console.log('\n📋 Summary');
  
  const hasErrors = 
    result.criticalMissing.length > 0 || 
    result.contrastWarnings.some(w => w.level === 'error') ||
    result.namingViolations.length > 0;
  
  const hasWarnings = 
    result.missingTokens.length > 0 || 
    result.extraTokens.length > 0 || 
    result.invalidFormats.length > 0 ||
    result.contrastWarnings.some(w => w.level === 'warning');

  if (!hasErrors && !hasWarnings) {
    console.log('   ✅ All validation checks passed!\n');
  } else {
    if (hasErrors) {
      console.log('   ❌ Validation failed with errors');
    }
    if (hasWarnings) {
      console.log('   ⚠️  Validation completed with warnings');
    }
    console.log('');
  }
}

function main(): void {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (args.validateTokens) {
    if (!args.tokenFile) {
      console.log('🔍 Validating REQUIRED_TOKEN_KEYS contract...\n');
      
      const dummyTokens: Record<string, string> = {};
      for (const key of REQUIRED_TOKEN_KEYS) {
        dummyTokens[key] = 'hsl(0, 0%, 50%)';
      }
      
      const result = validateTokens(dummyTokens);
      
      console.log(`\n📊 Token Contract Summary`);
      console.log('═'.repeat(60));
      console.log(`   Expected tokens: ${EXPECTED_TOKEN_COUNT}`);
      console.log(`   Defined tokens: ${REQUIRED_TOKEN_KEYS.length}`);
      console.log(`   Critical tokens: ${CRITICAL_TOKENS.length}`);
      
      if (REQUIRED_TOKEN_KEYS.length !== EXPECTED_TOKEN_COUNT) {
        console.log(`\n⚠️  Token count mismatch!`);
        console.log(`   Expected: ${EXPECTED_TOKEN_COUNT}, Found: ${REQUIRED_TOKEN_KEYS.length}`);
      } else {
        console.log(`\n✅ Token contract is valid`);
      }
      
      console.log('\n💡 To validate a theme file, use: --token-file <path>');
      console.log('');
      process.exit(0);
    }

    const tokenFilePath = path.resolve(process.cwd(), args.tokenFile);
    
    if (!fs.existsSync(tokenFilePath)) {
      console.error(`❌ Token file not found: ${tokenFilePath}`);
      process.exit(1);
    }

    const content = fs.readFileSync(tokenFilePath, 'utf-8');
    let tokens: Record<string, string>;

    try {
      if (tokenFilePath.endsWith('.json')) {
        tokens = parseTokensFromJSON(content);
      } else if (tokenFilePath.endsWith('.css')) {
        tokens = parseTokensFromCSS(content);
      } else {
        try {
          tokens = parseTokensFromJSON(content);
        } catch {
          tokens = parseTokensFromCSS(content);
        }
      }
    } catch (error) {
      console.error(`❌ Failed to parse token file: ${error}`);
      process.exit(1);
    }

    const result = validateTokens(tokens);
    formatTokenValidationOutput(result, args.outputFormat);

    const hasErrors = 
      result.criticalMissing.length > 0 || 
      result.contrastWarnings.some(w => w.level === 'error') ||
      result.namingViolations.length > 0;

    if (hasErrors) {
      process.exit(1);
    }
    process.exit(0);
  }

  const clientSrcPath = path.join(process.cwd(), 'client', 'src');

  if (!fs.existsSync(clientSrcPath)) {
    console.error('❌ client/src directory not found');
    process.exit(1);
  }

  console.log('🔍 Scanning for hardcoded colors...\n');

  const files = getAllTsxFiles(clientSrcPath, args.ignoreFiles);
  const allViolations: Violation[] = [];
  const filesWithViolations = new Set<string>();

  for (const file of files) {
    const violations = checkFile(file, args.fix);
    if (violations.length > 0) {
      allViolations.push(...violations);
      filesWithViolations.add(file);
    }
  }

  const report: Report = {
    violations: allViolations,
    filesScanned: files.length,
    filesWithViolations: filesWithViolations.size,
    totalViolations: allViolations.length
  };

  if (args.outputFormat === 'json') {
    console.log(JSON.stringify(report, null, 2));
  } else {
    formatConsoleOutput(report, args.fix);
  }

  if (report.totalViolations > 0) {
    process.exit(1);
  }
}

main();
