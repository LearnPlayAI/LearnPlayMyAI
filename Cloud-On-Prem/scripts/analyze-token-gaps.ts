#!/usr/bin/env tsx
import { REQUIRED_TOKEN_KEYS } from '../shared/brandingTokens';
import { buildFullTokens } from '../shared/themeTokenBuilder';

const testTokens = buildFullTokens({
  primary: 'hsl(215, 70%, 40%)',
  primaryForeground: 'hsl(0, 0%, 100%)',
  secondary: 'hsl(215, 55%, 30%)',
  secondaryForeground: 'hsl(0, 0%, 100%)',
  accent: 'hsl(45, 90%, 50%)',
  accentForeground: 'hsl(215, 70%, 15%)',
  background: 'hsl(215, 20%, 98%)',
  foreground: 'hsl(215, 25%, 15%)',
  card: 'hsl(0, 0%, 100%)',
  cardForeground: 'hsl(215, 25%, 15%)',
  muted: 'hsl(215, 15%, 94%)',
  mutedForeground: 'hsl(215, 12%, 50%)',
  border: 'hsl(215, 15%, 88%)',
  ring: 'hsl(215, 70%, 40%)',
  gradientFrom: 'hsl(215, 70%, 40%)',
  gradientTo: 'hsl(215, 55%, 30%)',
  gamePrimary: 'hsl(215, 70%, 40%)',
  gameGlow: 'hsla(215, 70%, 40%, 0.5)',
});

const generatedKeys = new Set(Object.keys(testTokens));
const requiredKeysArray: string[] = [...REQUIRED_TOKEN_KEYS];
const requiredKeys = new Set(requiredKeysArray);

const missing = requiredKeysArray.filter(key => !generatedKeys.has(key));
const extra = Object.keys(testTokens).filter(key => !requiredKeys.has(key));

console.log('=== TOKEN COVERAGE ANALYSIS ===');
console.log('Required tokens:', requiredKeysArray.length);
console.log('Generated tokens:', generatedKeys.size);
console.log('');
console.log('=== MISSING TOKENS (' + missing.length + ') ===');
missing.forEach(key => console.log('  -', key));
console.log('');
console.log('=== EXTRA TOKENS (' + extra.length + ') ===');
extra.forEach(key => console.log('  +', key));
