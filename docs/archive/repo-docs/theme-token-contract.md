# Theme Token Contract Documentation

## Overview

The LearnPlay platform implements a comprehensive **578-token theme system** for white-label branding. This system enables organizations to fully customize the appearance of their branded instances while maintaining consistency and accessibility across all UI components.

### Token Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TOKEN LIFECYCLE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. BASE TOKENS (18 inputs)           2. TOKEN EXPANSION                     │
│  ┌─────────────────────────┐          ┌─────────────────────────┐           │
│  │ primary                 │          │ buildFullTokens()       │           │
│  │ primaryForeground       │ ───────▶ │ Generates all 578       │           │
│  │ secondary               │          │ derived tokens          │           │
│  │ accent, background...   │          └──────────┬──────────────┘           │
│  └─────────────────────────┘                     │                          │
│                                                  ▼                          │
│  3. BACKEND STORAGE                   4. FRONTEND APPLICATION               │
│  ┌─────────────────────────┐          ┌─────────────────────────┐           │
│  │ expandTokensIfNeeded()  │          │ BrandingContext.tsx     │           │
│  │ Stores full 578 tokens  │ ───────▶ │ Applies to DOM as       │           │
│  │ in database             │          │ CSS custom properties   │           │
│  └─────────────────────────┘          └──────────┬──────────────┘           │
│                                                  │                          │
│                                                  ▼                          │
│  5. CONTRAST VALIDATION               6. RUNTIME APPLICATION                │
│  ┌─────────────────────────┐          ┌─────────────────────────┐           │
│  │ applyRuntimeContrast    │          │ CSS Variables on        │           │
│  │ Corrections()           │ ───────▶ │ document.documentElement│           │
│  │ WCAG 2.1 AA compliance  │          │ e.g. --primary: hsl()   │           │
│  └─────────────────────────┘          └─────────────────────────┘           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Token Categories

The 578 tokens are organized into logical categories for easier management:

### 1. Base Colors (~28 tokens)

Core semantic colors that define the brand identity:

| Token | Description |
|-------|-------------|
| `--primary` | Primary brand color |
| `--primary-foreground` | Text on primary backgrounds |
| `--secondary` | Secondary brand color |
| `--secondary-foreground` | Text on secondary backgrounds |
| `--accent` | Accent/highlight color |
| `--accent-foreground` | Text on accent backgrounds |
| `--background` | Main page background |
| `--foreground` | Main text color |
| `--card` | Card/surface background |
| `--card-foreground` | Text on cards |
| `--muted` | Muted/subdued backgrounds |
| `--muted-foreground` | Subdued text |
| `--border` | Border color |
| `--ring` | Focus ring color |
| `--destructive` | Error/danger color |
| `--destructive-foreground` | Text on destructive |
| `--success` | Success state color |
| `--success-foreground` | Text on success |
| `--warning` | Warning state color |
| `--warning-foreground` | Text on warning |

### 2. Button Tokens (~46 tokens)

Complete button styling for all variants and states:

```
--btn-primary-bg, --btn-primary-fg, --btn-primary-hover, --btn-primary-active
--btn-primary-focus-ring, --btn-primary-disabled-bg, --btn-primary-disabled-fg
--btn-secondary-*, --btn-ghost-*, --btn-outline-*
--btn-danger-*, --btn-success-*, --btn-warning-*
--btn-gradient-from, --btn-gradient-to, --btn-gradient-fg
```

### 3. Surface Tokens (~120+ tokens)

Cards, panels, modals, and container elements:

```
--card-bg, --card-fg, --card-border, --card-shadow
--card-hover-bg, --card-hover-border, --card-hover-shadow
--card-active-bg, --card-selected-bg, --card-disabled-bg/fg

--modal-bg, --modal-fg, --modal-border, --modal-overlay
--popover, --popover-foreground, --popover-hover-bg
--dropdown-bg, --dropdown-fg, --dropdown-border
--tooltip-bg, --tooltip-fg, --tooltip-border

--panel-bg, --panel-fg, --panel-border
--panel-header-bg, --panel-footer-bg

--feature-card-*, --glass-card-*, --stat-card-*
--pricing-card-*, --course-card-*, --profile-card-*
```

### 4. Navigation Tokens (~30 tokens)

Headers, sidebars, breadcrumbs, and navigation elements:

```
--nav-bg, --nav-fg, --nav-border
--nav-hover, --nav-active, --nav-active-fg
--nav-link, --nav-link-hover, --nav-link-active, --nav-link-focus
--nav-disabled

--sidebar-background, --sidebar-foreground, --sidebar-border
--sidebar-item-active-bg, --sidebar-item-active-fg, --sidebar-item-hover-bg
--sidebar-primary, --sidebar-accent

--breadcrumb-fg, --breadcrumb-hover-fg, --breadcrumb-active-fg
--breadcrumb-separator-fg

--lesson-nav-bg, --lesson-nav-fg, --lesson-nav-active
```

### 5. Form Tokens (~56 tokens)

Inputs, selects, checkboxes, radios, switches, and sliders:

```
--input-bg, --input-fg, --input-border, --input-placeholder
--input-hover-border, --input-focus, --input-focus-border, --input-focus-ring
--input-disabled-bg, --input-disabled-fg, --input-disabled-border
--input-invalid-bg, --input-invalid-border, --input-invalid-focus-ring
--input-success-bg, --input-success-border

--select-bg, --select-fg, --select-border
--select-hover-border, --select-focus-border
--select-option-hover, --select-option-selected

--checkbox-bg, --checkbox-border, --checkbox-hover-border
--checkbox-checked-bg, --checkbox-checked-fg, --checkbox-disabled-bg

--radio-bg, --radio-border, --radio-checked-bg/fg

--switch-bg, --switch-hover-bg, --switch-checked-bg, --switch-thumb

--slider-track, --slider-range, --slider-thumb, --slider-focus-ring

--search-bg, --search-fg, --search-border, --search-focus-*
```

### 6. Table Tokens (~16 tokens)

Data tables and grids:

```
--table-header-bg, --table-header-fg, --table-header-border
--table-header-hover-bg
--table-row-bg, --table-row-fg, --table-row-alt-bg
--table-row-hover-bg, --table-row-hover-border
--table-row-selected-bg, --table-row-selected-fg
--table-row-active-bg
--table-cell-border
--table-sort-icon, --table-sort-icon-active
```

### 7. Typography Tokens (~15 tokens)

Text colors and font definitions:

```
--fg-strong, --fg-default, --fg-muted, --fg-subtle
--fg-on-card, --fg-on-card-muted
--fg-on-primary, --fg-on-secondary, --fg-on-accent, --fg-on-muted

--body-strong, --body-default, --body-muted
--body-on-card, --body-on-card-muted

--label-fg, --helper-fg
```

**Font Variables** (set separately from color tokens):
- `--font-heading`: Heading font family
- `--font-body`: Body text font family

### 8. Game/Quiz Tokens (~47 tokens)

Gamification elements, quiz interfaces, and leaderboards:

```
--game-primary, --game-glow, --game-gold, --game-gold-light
--game-particle, --game-success, --game-xp
--effect-glow

--arena-bg, --arena-surface
--game-card-face-bg, --game-card-face-fg, --game-card-face-border

--quiz-lobby-bg, --quiz-lobby-fg
--question-card-bg, --question-card-fg, --question-card-border

--answer-option-bg, --answer-option-fg, --answer-option-border
--answer-option-hover-bg, --answer-option-hover-border
--answer-option-selected-bg/fg/border
--answer-option-correct-bg/fg/border
--answer-option-incorrect-bg/fg/border
--answer-option-disabled-bg/fg

--timer-bg, --timer-fg, --timer-warning, --timer-critical

--leaderboard-row-bg, --leaderboard-row-alt-bg
--leaderboard-row-hover-bg, --leaderboard-row-highlight-bg

--score-badge-bg, --score-badge-fg
--energy-bar-bg, --energy-bar-fill
```

### 9. Hero/Landing Tokens (~41 tokens)

Landing page hero sections and marketing components:

```
--hero-bg
--hero-bg-gradient-from, --hero-bg-gradient-via, --hero-bg-gradient-to
--hero-headline-from, --hero-headline-via, --hero-headline-to
--hero-glow, --hero-glow-secondary

--hero-badge-bg, --hero-badge-fg, --hero-badge-border, --hero-badge-hover-bg
--hero-audience-pill-bg, --hero-audience-pill-fg, --hero-audience-pill-border

--hero-cta-primary-bg, --hero-cta-primary-fg
--hero-cta-primary-hover, --hero-cta-primary-active, --hero-cta-primary-focus-ring
--hero-cta-secondary-*, --hero-cta-outline-*

--hero-demo-card-bg, --hero-demo-card-fg, --hero-demo-card-border
--hero-demo-card-muted, --hero-demo-card-accent-*

--hero-indicator-active-bg, --hero-indicator-rest-bg, --hero-indicator-hover-bg
```

### 10. Additional Categories

**Alerts & Notifications (~28 tokens)**
```
--alert-info-bg/fg/border/icon
--alert-success-bg/fg/border/icon
--alert-warning-bg/fg/border/icon
--alert-error-bg/fg/border/icon

--toast-bg, --toast-fg, --toast-border
--toast-success-*, --toast-error-*, --toast-default-*
```

**Progress & Indicators (~8 tokens)**
```
--progress-bg, --progress-fill
--progress-bar-bg, --progress-bar-fill
--progress-success-fill, --progress-warning-fill, --progress-error-fill
--progress-label
```

**Certificates (~5 tokens)**
```
--cert-bg, --cert-title, --cert-body, --cert-border, --cert-accent
```

**Authentication (~8 tokens)**
```
--auth-bg, --auth-fg
--auth-form-bg, --auth-form-border, --auth-form-shadow
--auth-cta-bg, --auth-cta-fg, --auth-cta-hover
```

**Admin Surfaces (~13 tokens)**
```
--admin-header-bg, --admin-header-fg
--admin-sidebar-bg, --admin-sidebar-fg
--admin-sidebar-active-bg/fg, --admin-sidebar-item-hover-bg
--admin-table-header-bg, --admin-table-row-bg/hover-bg/selected-bg
```

**Email Templates (~17 tokens)**
```
--email-bg, --email-fg
--email-header-bg/fg, --email-content-bg/fg
--email-cta-bg/fg/hover
--email-footer-bg/fg
--email-link, --email-border, --email-muted
--email-success, --email-warning, --email-accent
```

**Gradients (~8 tokens)**
```
--gradient-primary-from, --gradient-primary-to
--gradient-accent-from, --gradient-accent-to
--cta-gradient-from, --cta-gradient-to
--cta-gradient-from-hover, --cta-gradient-to-hover
```

## Architecture

### File Structure

```
shared/
├── brandingTokens.ts      # Token contract definition (REQUIRED_TOKEN_KEYS)
├── themeTokenBuilder.ts   # buildFullTokens() expansion logic
└── tokenSectionMapping.ts # Maps tokens to editor sections

server/
└── brandingRoutes.ts      # expandTokensIfNeeded() on save, API endpoints

client/src/
├── contexts/BrandingContext.tsx  # Applies tokens to DOM
└── utils/contrast.ts             # ContrastGuard corrections
```

### Key Components

#### 1. Token Contract (`shared/brandingTokens.ts`)

Defines the authoritative list of all 578 required tokens:

```typescript
export const REQUIRED_TOKEN_KEYS = [
  '--accent',
  '--accent-foreground',
  // ... 578 total tokens
] as const;

export type TokenKey = typeof REQUIRED_TOKEN_KEYS[number];
export type TokenMap = Record<TokenKey, string>;
```

#### 2. Token Builder (`shared/themeTokenBuilder.ts`)

Expands 18 base tokens into all 578 tokens:

```typescript
export interface BaseTokens {
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  accent: string;
  accentForeground: string;
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  ring: string;
  gradientFrom: string;
  gradientTo: string;
  gamePrimary: string;
  gameGlow: string;
  isDark?: boolean;  // Controls dark/light mode generation
}

export function buildFullTokens(base: BaseTokens): Record<TokenKey, string>
```

**Helper Functions:**
- `withAlpha(hslColor, alpha)`: Adds transparency to HSL colors
- `adjustLightness(hslColor, delta)`: Lightens/darkens colors
- `getLightness(hslColor)`: Extracts lightness value
- `getContrastingForeground(bg, lightFg, darkFg)`: Picks appropriate foreground
- `hoverDelta(isDark)`: Returns hover adjustment (+8 dark, -8 light)
- `focusDelta(isDark)`: Returns focus adjustment (+12 dark, -12 light)
- `activeDelta(isDark)`: Returns active adjustment (+15 dark, -15 light)

#### 3. Backend Expansion (`server/brandingRoutes.ts`)

Expands tokens on save to ensure consistency:

```typescript
function expandTokensIfNeeded(tokens: Record<string, string>): Record<string, string> {
  // Skip if already expanded (>500 tokens)
  if (Object.keys(tokens).length > 500) {
    return tokens;
  }
  
  // Extract base tokens from input
  const baseTokens = {
    primary: tokens['--primary'] || 'hsl(262, 83%, 58%)',
    // ... extract all 18 base values
    isDark: getLightness(tokens['--background'] || 'hsl(0, 0%, 7%)') < 50,
  };
  
  return buildFullTokens(baseTokens);
}
```

#### 4. Frontend Application (`client/src/contexts/BrandingContext.tsx`)

Applies tokens to the DOM and handles dark mode:

```typescript
function applyBrandingToDOM(branding: BrandingData, isDark: boolean) {
  const root = document.documentElement;
  
  // Toggle dark class
  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  
  // Regenerate tokens for current mode
  const tokens = regenerateTokensForMode(branding.tokens, isDark);
  
  // Apply contrast corrections
  const correctedTokens = applyRuntimeContrastCorrections(tokens);
  
  // Set CSS custom properties
  Object.entries(correctedTokens).forEach(([key, value]) => {
    if (value && key.startsWith('--')) {
      root.style.setProperty(key, value);
    }
  });
}
```

## Dark Mode Support

### The isDark Flag

The `isDark` flag in `BaseTokens` controls how tokens are generated:

```typescript
buildFullTokens({
  ...baseTokens,
  isDark: true   // Generates dark mode tokens
});
```

### Mode-Specific Adjustments

The builder applies different adjustments based on mode:

| Adjustment | Light Mode | Dark Mode |
|------------|-----------|-----------|
| Hover delta | -8 (darker) | +8 (lighter) |
| Focus delta | -12 (darker) | +12 (lighter) |
| Active delta | -15 (darker) | +15 (lighter) |
| Background | `hsl(0, 0%, 100%)` | `hsl(0, 0%, 7%)` |
| Foreground | `hsl(0, 0%, 10%)` | `hsl(0, 0%, 95%)` |
| Card | `hsl(0, 0%, 100%)` | `hsl(0, 0%, 10%)` |

### Dark Mode Detection

Background lightness determines mode:
```typescript
const isDark = getLightness(tokens['--background']) < 50;
```

### Frontend Toggle

```typescript
const { isDark, toggleDarkMode, setDarkMode } = useBranding();

// Toggle
toggleDarkMode();

// Set explicitly
setDarkMode(true);
```

Theme preference is persisted to localStorage under `theme-mode`.

## Contrast System

### WCAG 2.1 AA Requirements

| Context | Minimum Ratio |
|---------|---------------|
| Normal text | 4.5:1 |
| Large text (18pt+) | 3:1 |
| UI components | 3:1 |

### ContrastGuard Validation

The `applyRuntimeContrastCorrections()` function checks foreground/background pairs:

```typescript
const FOREGROUND_BACKGROUND_PAIRS = [
  // Core semantic pairs
  { fg: '--primary-foreground', bg: '--primary' },
  { fg: '--secondary-foreground', bg: '--secondary' },
  { fg: '--foreground', bg: '--background' },
  { fg: '--card-foreground', bg: '--card' },
  
  // Buttons
  { fg: '--btn-primary-fg', bg: '--btn-primary-bg' },
  { fg: '--btn-secondary-fg', bg: '--btn-secondary-bg' },
  
  // Cards
  { fg: '--card-fg', bg: '--card-bg' },
  { fg: '--fg-on-card', bg: '--card' },
  
  // Navigation
  { fg: '--nav-fg', bg: '--nav-bg' },
  { fg: '--sidebar-fg', bg: '--sidebar-bg' },
  
  // Tables
  { fg: '--table-header-fg', bg: '--table-header-bg' },
  { fg: '--table-row-fg', bg: '--table-row-bg' },
  
  // Alerts
  { fg: '--alert-info-fg', bg: '--alert-info-bg' },
  { fg: '--alert-success-fg', bg: '--alert-success-bg' },
  
  // Quiz elements
  { fg: '--answer-option-fg', bg: '--answer-option-bg' },
  { fg: '--answer-option-correct-fg', bg: '--answer-option-correct-bg' },
  
  // ... 50+ pairs total
];
```

### Automatic Corrections

When contrast fails, ContrastGuard automatically suggests accessible foregrounds:

```typescript
function suggestAccessibleForeground(background: string): string {
  const luminance = getLuminance(rgb.r, rgb.g, rgb.b);
  return luminance > 0.5 ? '#000000' : '#ffffff';
}
```

Console output when corrections are applied:
```
[ContrastGuard] Applied 3 contrast corrections:
  --btn-primary-fg: 2.1:1 → fixed
  --card-fg: 3.2:1 → fixed
  --nav-link: 3.8:1 → fixed
```

### Contrast Utility Functions

```typescript
// Check contrast ratio
getContrastRatio(color1: string, color2: string): number

// Full contrast analysis
checkContrast(foreground: string, background: string): ContrastResult
// Returns: { ratio, aa, aaLarge, aaa, aaaLarge }

// Get contrast grade
getContrastGrade(ratio: number): 'fail' | 'aa-large' | 'aa' | 'aaa'

// Get all contrast warnings
getContrastWarnings(tokens: Record<string, string>): ContrastWarning[]
```

## Validation Tools

### CLI Validation (`scripts/check-theme-coverage.ts`)

Run validation checks from the command line:

```bash
# Basic validation
npx tsx scripts/check-theme-coverage.ts

# Show fix suggestions
npx tsx scripts/check-theme-coverage.ts --fix

# Validate token file
npx tsx scripts/check-theme-coverage.ts --validate-tokens --token-file theme.json

# Output as JSON
npx tsx scripts/check-theme-coverage.ts --json > report.json
```

**Checks performed:**
- Token count (exactly 578 expected)
- All tokens in HSL format
- WCAG contrast ratios for key pairs
- Critical tokens present
- Naming conventions (`--` prefix, kebab-case)

### Jest Test Suite (`client/src/tests/PreviewParity.test.tsx`)

Automated tests ensure token system integrity:

```bash
npm test -- --testPathPattern=PreviewParity
```

**Test Cases:**

1. **Token Count Parity**
   - `REQUIRED_TOKEN_KEYS` has exactly 578 tokens
   - No duplicate token keys

2. **buildFullTokens Coverage**
   - Returns exactly 578 tokens
   - Contains all required token keys
   - No extra tokens beyond contract

3. **Dark Mode Parity**
   - Same 578 tokens in both modes
   - Appropriate lightness values
   - Background lighter in light mode
   - Foreground contrast correct per mode

4. **Section Mapping**
   - All tokens mapped to sections
   - Valid section values

5. **Token Value Format**
   - Valid HSL format for color tokens
   - No empty or undefined values

### Token Section Mapping

The `EDIT_KEY_TO_SECTION_MAP` organizes tokens for the brand editor:

| Section | Description | Example Tokens |
|---------|-------------|----------------|
| `base-colors` | Core brand colors | `--primary`, `--accent`, `--destructive` |
| `surfaces` | Cards, panels, modals | `--card`, `--modal-bg`, `--popover` |
| `navigation` | Nav bars, sidebars | `--nav-bg`, `--sidebar-*` |
| `forms` | Inputs, selects | `--input-*`, `--select-*` |
| `typography` | Text colors | `--fg-*`, `--body-*` |
| `tables` | Data tables | `--table-*` |
| `notifications` | Alerts, toasts | `--alert-*`, `--toast-*` |
| `hero` | Landing page hero | `--hero-*` |
| `gradients` | Gradient colors | `--gradient-*`, `--cta-gradient-*` |
| `gamification` | Quiz/game elements | `--game-*`, `--arena-*`, `--answer-*` |
| `progress` | Progress bars | `--progress-*` |
| `certificates` | Certificate styling | `--cert-*` |
| `authentication` | Auth forms | `--auth-*` |
| `admin-surfaces` | Admin panel | `--admin-*` |
| `email-templates` | Email branding | `--email-*` |

## Usage Examples

### Creating a Custom Theme

```typescript
import { buildFullTokens, BaseTokens } from '@shared/themeTokenBuilder';

const myBrand: BaseTokens = {
  primary: 'hsl(220, 70%, 50%)',
  primaryForeground: 'hsl(0, 0%, 100%)',
  secondary: 'hsl(260, 60%, 50%)',
  secondaryForeground: 'hsl(0, 0%, 100%)',
  accent: 'hsl(340, 65%, 55%)',
  accentForeground: 'hsl(0, 0%, 100%)',
  background: 'hsl(220, 20%, 10%)',
  foreground: 'hsl(0, 0%, 95%)',
  card: 'hsl(220, 20%, 15%)',
  cardForeground: 'hsl(0, 0%, 95%)',
  muted: 'hsl(220, 15%, 25%)',
  mutedForeground: 'hsl(0, 0%, 65%)',
  border: 'hsl(220, 15%, 30%)',
  ring: 'hsl(220, 70%, 50%)',
  gradientFrom: 'hsl(220, 70%, 50%)',
  gradientTo: 'hsl(260, 60%, 50%)',
  gamePrimary: 'hsl(45, 100%, 50%)',
  gameGlow: 'hsla(45, 100%, 50%, 0.6)',
  isDark: true,
};

const fullTokens = buildFullTokens(myBrand);
// Returns all 578 tokens ready for storage
```

### Applying Tokens in Components

```typescript
// Use CSS custom properties
<button style={{ 
  backgroundColor: 'var(--btn-primary-bg)',
  color: 'var(--btn-primary-fg)',
}}>
  Click Me
</button>

// Or with Tailwind (configured to use CSS variables)
<button className="bg-primary text-primary-foreground hover:bg-primary/90">
  Click Me
</button>
```

### Checking Contrast Programmatically

```typescript
import { getContrastRatio, meetsWCAG } from '@/utils/contrast';

const ratio = getContrastRatio('hsl(262, 83%, 58%)', 'hsl(0, 0%, 100%)');
const passesAA = meetsWCAG(ratio, 'AA');
const passesAALarge = meetsWCAG(ratio, 'AA', true);

console.log(`Contrast: ${ratio.toFixed(2)}:1, AA: ${passesAA}, AA Large: ${passesAALarge}`);
```

## Best Practices

1. **Always use HSL format** for color values to enable consistent lightness adjustments
2. **Test both modes** when creating custom themes
3. **Validate contrast** before deploying themes to production
4. **Use the brand editor** UI for visual feedback during customization
5. **Run validation scripts** as part of CI/CD pipelines
6. **Preserve the 578-token contract** - do not add or remove tokens without updating all related files
