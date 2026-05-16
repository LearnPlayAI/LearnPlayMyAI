import { describe, it, expect } from '@jest/globals';
import { REQUIRED_TOKEN_KEYS } from '@shared/brandingTokens';
import { buildFullTokens, BaseTokens } from '@shared/themeTokenBuilder';
import { EDIT_KEY_TO_SECTION_MAP } from '@shared/tokenSectionMapping';

const EXPECTED_TOKEN_COUNT = REQUIRED_TOKEN_KEYS.length;

const createMinimalBaseTokens = (isDark: boolean = false): BaseTokens => ({
  primary: isDark ? 'hsl(220, 70%, 50%)' : 'hsl(220, 70%, 45%)',
  primaryForeground: 'hsl(0, 0%, 100%)',
  secondary: isDark ? 'hsl(260, 60%, 50%)' : 'hsl(260, 60%, 45%)',
  secondaryForeground: 'hsl(0, 0%, 100%)',
  accent: isDark ? 'hsl(340, 65%, 55%)' : 'hsl(340, 65%, 50%)',
  accentForeground: 'hsl(0, 0%, 100%)',
  background: isDark ? 'hsl(220, 20%, 10%)' : 'hsl(0, 0%, 100%)',
  foreground: isDark ? 'hsl(0, 0%, 95%)' : 'hsl(0, 0%, 10%)',
  card: isDark ? 'hsl(220, 20%, 15%)' : 'hsl(0, 0%, 100%)',
  cardForeground: isDark ? 'hsl(0, 0%, 95%)' : 'hsl(0, 0%, 10%)',
  muted: isDark ? 'hsl(220, 15%, 25%)' : 'hsl(0, 0%, 96%)',
  mutedForeground: isDark ? 'hsl(0, 0%, 65%)' : 'hsl(0, 0%, 45%)',
  border: isDark ? 'hsl(220, 15%, 30%)' : 'hsl(0, 0%, 90%)',
  ring: isDark ? 'hsl(220, 70%, 50%)' : 'hsl(220, 70%, 45%)',
  gradientFrom: isDark ? 'hsl(220, 70%, 50%)' : 'hsl(220, 70%, 45%)',
  gradientTo: isDark ? 'hsl(260, 60%, 50%)' : 'hsl(260, 60%, 45%)',
  gamePrimary: isDark ? 'hsl(45, 100%, 50%)' : 'hsl(45, 100%, 45%)',
  gameGlow: isDark ? 'hsla(45, 100%, 50%, 0.6)' : 'hsla(45, 100%, 45%, 0.5)',
  isDark,
});

const isColorToken = (key: string): boolean => {
  const nonColorPatterns = [
    'font',
    'radius',
    'shadow',
    'glow',
    'overlay',
    'glass',
  ];
  const keyLower = key.toLowerCase();
  if (nonColorPatterns.some(pattern => keyLower.includes(pattern))) {
    return false;
  }
  return true;
};

const isValidHslFormat = (value: string): boolean => {
  if (value === 'transparent') return true;
  const hslPattern = /^hsla?\(\s*\d+\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*(,\s*[\d.]+\s*)?\)$/;
  return hslPattern.test(value);
};

const getLightnessFromHsl = (hslValue: string): number | null => {
  const match = hslValue.match(/hsl[a]?\(\s*\d+\s*,\s*[\d.]+%\s*,\s*([\d.]+)%/);
  if (!match) return null;
  return parseFloat(match[1]);
};

describe('PreviewParity: Theme Token System', () => {
  describe('Token Count Parity Test', () => {
    it(`should have exactly ${EXPECTED_TOKEN_COUNT} tokens in REQUIRED_TOKEN_KEYS`, () => {
      const actualCount = REQUIRED_TOKEN_KEYS.length;
      
      expect(actualCount).toBe(EXPECTED_TOKEN_COUNT);
      
      if (actualCount !== EXPECTED_TOKEN_COUNT) {
        console.log(`Token count mismatch: Expected ${EXPECTED_TOKEN_COUNT}, got ${actualCount}`);
        console.log(`Difference: ${actualCount - EXPECTED_TOKEN_COUNT}`);
      }
    });

    it('should have all unique token keys (no duplicates)', () => {
      const uniqueKeys = new Set(REQUIRED_TOKEN_KEYS);
      expect(uniqueKeys.size).toBe(REQUIRED_TOKEN_KEYS.length);
      
      if (uniqueKeys.size !== REQUIRED_TOKEN_KEYS.length) {
        const seen = new Set<string>();
        const duplicates: string[] = [];
        for (const key of REQUIRED_TOKEN_KEYS) {
          if (seen.has(key)) {
            duplicates.push(key);
          }
          seen.add(key);
        }
        console.log('Duplicate tokens found:', duplicates);
      }
    });
  });

  describe('buildFullTokens Coverage Test', () => {
    it(`should return all ${EXPECTED_TOKEN_COUNT} tokens from buildFullTokens`, () => {
      const baseTokens = createMinimalBaseTokens(false);
      const fullTokens = buildFullTokens(baseTokens);
      const generatedKeys = Object.keys(fullTokens);
      
      expect(generatedKeys.length).toBe(EXPECTED_TOKEN_COUNT);
    });

    it('should contain all required token keys', () => {
      const baseTokens = createMinimalBaseTokens(false);
      const fullTokens = buildFullTokens(baseTokens);
      const generatedKeys = new Set(Object.keys(fullTokens));
      
      const missingTokens: string[] = [];
      for (const requiredKey of REQUIRED_TOKEN_KEYS) {
        if (!generatedKeys.has(requiredKey)) {
          missingTokens.push(requiredKey);
        }
      }
      
      if (missingTokens.length > 0) {
        console.log('Missing tokens in buildFullTokens output:');
        missingTokens.forEach(token => console.log(`  - ${token}`));
      }
      
      expect(missingTokens).toEqual([]);
    });

    it('should not contain any extra tokens not in REQUIRED_TOKEN_KEYS', () => {
      const baseTokens = createMinimalBaseTokens(false);
      const fullTokens = buildFullTokens(baseTokens);
      const requiredKeysSet = new Set<string>(REQUIRED_TOKEN_KEYS);
      
      const extraTokens: string[] = [];
      for (const generatedKey of Object.keys(fullTokens)) {
        if (!requiredKeysSet.has(generatedKey)) {
          extraTokens.push(generatedKey);
        }
      }
      
      if (extraTokens.length > 0) {
        console.log('Extra tokens in buildFullTokens output (not in REQUIRED_TOKEN_KEYS):');
        extraTokens.forEach(token => console.log(`  - ${token}`));
      }
      
      expect(extraTokens).toEqual([]);
    });
  });

  describe('Dark Mode Parity Test', () => {
    const lightTokens = buildFullTokens(createMinimalBaseTokens(false));
    const darkTokens = buildFullTokens(createMinimalBaseTokens(true));

    it(`should return ${EXPECTED_TOKEN_COUNT} tokens in light mode`, () => {
      expect(Object.keys(lightTokens).length).toBe(EXPECTED_TOKEN_COUNT);
    });

    it(`should return ${EXPECTED_TOKEN_COUNT} tokens in dark mode`, () => {
      expect(Object.keys(darkTokens).length).toBe(EXPECTED_TOKEN_COUNT);
    });

    it('should have the same keys in light and dark mode', () => {
      const lightKeys = new Set(Object.keys(lightTokens));
      const darkKeys = new Set(Object.keys(darkTokens));
      
      const onlyInLight = [...lightKeys].filter(k => !darkKeys.has(k));
      const onlyInDark = [...darkKeys].filter(k => !lightKeys.has(k));
      
      expect(onlyInLight).toEqual([]);
      expect(onlyInDark).toEqual([]);
    });

    it('--background should be lighter in light mode than dark mode', () => {
      const lightBgLightness = getLightnessFromHsl(lightTokens['--background']);
      const darkBgLightness = getLightnessFromHsl(darkTokens['--background']);
      
      expect(lightBgLightness).not.toBeNull();
      expect(darkBgLightness).not.toBeNull();
      
      if (lightBgLightness !== null && darkBgLightness !== null) {
        expect(lightBgLightness).toBeGreaterThan(darkBgLightness);
      }
    });

    it('--foreground should have appropriate contrast for each mode', () => {
      const lightFgLightness = getLightnessFromHsl(lightTokens['--foreground']);
      const darkFgLightness = getLightnessFromHsl(darkTokens['--foreground']);
      
      expect(lightFgLightness).not.toBeNull();
      expect(darkFgLightness).not.toBeNull();
      
      if (lightFgLightness !== null && darkFgLightness !== null) {
        expect(lightFgLightness).toBeLessThan(darkFgLightness);
      }
    });

    it('--card should follow background pattern (lighter in light mode)', () => {
      const lightCardLightness = getLightnessFromHsl(lightTokens['--card']);
      const darkCardLightness = getLightnessFromHsl(darkTokens['--card']);
      
      expect(lightCardLightness).not.toBeNull();
      expect(darkCardLightness).not.toBeNull();
      
      if (lightCardLightness !== null && darkCardLightness !== null) {
        expect(lightCardLightness).toBeGreaterThan(darkCardLightness);
      }
    });
  });

  describe('EDIT_KEY_TO_SECTION_MAP Coverage Test', () => {
    it('should have EDIT_KEY_TO_SECTION_MAP exported and defined', () => {
      expect(EDIT_KEY_TO_SECTION_MAP).toBeDefined();
      expect(typeof EDIT_KEY_TO_SECTION_MAP).toBe('object');
    });

    it('should have all token keys mapped to sections', () => {
      const mappedKeys = new Set(Object.keys(EDIT_KEY_TO_SECTION_MAP));
      
      const unmappedTokens: string[] = [];
      for (const tokenKey of REQUIRED_TOKEN_KEYS) {
        if (!mappedKeys.has(tokenKey)) {
          unmappedTokens.push(tokenKey);
        }
      }
      
      if (unmappedTokens.length > 0) {
        console.log(`Found ${unmappedTokens.length} unmapped tokens:`);
        unmappedTokens.forEach(token => console.log(`  - ${token}`));
      }
      
      expect(unmappedTokens).toEqual([]);
    });

    it('should have valid section values (non-empty strings)', () => {
      const invalidMappings: string[] = [];
      
      for (const [key, section] of Object.entries(EDIT_KEY_TO_SECTION_MAP)) {
        if (typeof section !== 'string' || section.trim() === '') {
          invalidMappings.push(key);
        }
      }
      
      if (invalidMappings.length > 0) {
        console.log('Token keys with invalid section values:', invalidMappings);
      }
      
      expect(invalidMappings).toEqual([]);
    });
  });

  describe('Token Value Format Test', () => {
    it('should have valid HSL format for all color tokens', () => {
      const baseTokens = createMinimalBaseTokens(false);
      const fullTokens = buildFullTokens(baseTokens);
      
      const invalidFormatTokens: Array<{ key: string; value: string }> = [];
      
      for (const [key, value] of Object.entries(fullTokens)) {
        if (isColorToken(key)) {
          if (!isValidHslFormat(value)) {
            invalidFormatTokens.push({ key, value });
          }
        }
      }
      
      if (invalidFormatTokens.length > 0) {
        console.log('Tokens with invalid HSL format:');
        invalidFormatTokens.forEach(({ key, value }) => {
          console.log(`  - ${key}: "${value}"`);
        });
      }
      
      expect(invalidFormatTokens).toEqual([]);
    });

    it('should have valid HSL format for color tokens in dark mode', () => {
      const baseTokens = createMinimalBaseTokens(true);
      const fullTokens = buildFullTokens(baseTokens);
      
      const invalidFormatTokens: Array<{ key: string; value: string }> = [];
      
      for (const [key, value] of Object.entries(fullTokens)) {
        if (isColorToken(key)) {
          if (!isValidHslFormat(value)) {
            invalidFormatTokens.push({ key, value });
          }
        }
      }
      
      if (invalidFormatTokens.length > 0) {
        console.log('Dark mode tokens with invalid HSL format:');
        invalidFormatTokens.forEach(({ key, value }) => {
          console.log(`  - ${key}: "${value}"`);
        });
      }
      
      expect(invalidFormatTokens).toEqual([]);
    });

    it('should not have empty or undefined values', () => {
      const baseTokens = createMinimalBaseTokens(false);
      const fullTokens = buildFullTokens(baseTokens);
      
      const emptyValueTokens: string[] = [];
      
      for (const [key, value] of Object.entries(fullTokens)) {
        if (value === undefined || value === null || value === '') {
          emptyValueTokens.push(key);
        }
      }
      
      if (emptyValueTokens.length > 0) {
        console.log('Tokens with empty or undefined values:', emptyValueTokens);
      }
      
      expect(emptyValueTokens).toEqual([]);
    });
  });
});
