import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../services/integrationConfigService', () => ({
  IntegrationConfigService: {
    getSecret: jest.fn(async () => null),
    getSetting: jest.fn(async () => null),
  },
}));

let mockedAiResponseText = '[]';
jest.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: jest.fn(async () => ({ text: mockedAiResponseText })),
    };
  },
}));

import { IntegrationConfigService } from '../services/integrationConfigService';
import {
  buildAiAssistedPaletteTokens,
  getDeterministicRecommendationsForTest,
  recommendPaletteCandidates,
} from '../services/themePaletteRecommendationService';

describe('theme palette recommendation service', () => {
  beforeEach(() => {
    mockedAiResponseText = '[]';
    (IntegrationConfigService.getSecret as any).mockResolvedValue(null);
    (IntegrationConfigService.getSetting as any).mockResolvedValue(null);
  });

  it('returns deterministic secondary recommendations for valid primary', () => {
    const recommendations = getDeterministicRecommendationsForTest({
      mode: 'secondary',
      primaryHex: '#0a66c2',
    });
    expect(recommendations.length).toBeGreaterThanOrEqual(5);
    for (const hex of recommendations) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('returns deterministic fallback candidates when AI secret is unavailable', async () => {
    const result = await recommendPaletteCandidates({
      mode: 'accent',
      primaryHex: '#0a66c2',
      secondaryHex: '#124076',
      tone: 'light',
      count: 5,
      aiModelProfile: 'fast',
    });

    expect(result.candidates).toHaveLength(5);
    expect(result.candidates.some((candidate) => candidate.source === 'deterministic')).toBe(true);
    for (const candidate of result.candidates) {
      expect(candidate.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(candidate.accessibility.criticalIssues).toBeGreaterThanOrEqual(0);
      expect(candidate.accessibility.warningIssues).toBeGreaterThanOrEqual(0);
    }
  });

  it('rejects accent mode without secondaryHex', async () => {
    await expect(
      recommendPaletteCandidates({
        mode: 'accent',
        primaryHex: '#0a66c2',
      }),
    ).rejects.toThrow('secondaryHex is required for accent recommendations');
  });

  it('builds deterministic full tokens when AI is unavailable', async () => {
    const result = await buildAiAssistedPaletteTokens({
      primaryHex: '#0a66c2',
      secondaryHex: '#124076',
      accentHex: '#16a3a5',
      tone: 'light',
      aiPreferred: false,
      aiModelProfile: 'thinking',
    });
    expect(result.source).toBe('deterministic');
    expect(typeof result.tokens['--primary']).toBe('string');
    expect(typeof result.tokens['--secondary']).toBe('string');
    expect(typeof result.tokens['--accent']).toBe('string');
    expect(result.accessibility.finalCritical).toBeGreaterThanOrEqual(0);
  });

  it('fails strict AI mode when AI key is unavailable', async () => {
    await expect(
      buildAiAssistedPaletteTokens({
        primaryHex: '#0a66c2',
        secondaryHex: '#124076',
        accentHex: '#16a3a5',
        tone: 'light',
        aiPreferred: true,
        strictAiOnly: true,
      }),
    ).rejects.toThrow('AI palette synthesis unavailable');
  });

  it('keeps AI provenance when AI returns a deterministic-overlap candidate', async () => {
    (IntegrationConfigService.getSecret as any).mockResolvedValue('test-gemini-key');
    const primaryHex = '#0a66c2';
    const [firstDeterministic] = getDeterministicRecommendationsForTest({
      mode: 'secondary',
      primaryHex,
    });
    mockedAiResponseText = JSON.stringify([
      { hex: firstDeterministic, rationale: 'AI confirms this candidate is strongest.' },
    ]);

    const result = await recommendPaletteCandidates({
      mode: 'secondary',
      primaryHex,
      tone: 'light',
      count: 5,
      aiModelProfile: 'fast',
    });

    expect(result.candidates.find((candidate) => candidate.hex === firstDeterministic)?.source).toBe('ai');
  });

  it('accepts strict AI mode when AI returns no anchor candidates but synthesis is valid', async () => {
    (IntegrationConfigService.getSecret as any).mockResolvedValue('test-gemini-key');
    mockedAiResponseText = '[]';

    const result = await buildAiAssistedPaletteTokens({
      primaryHex: '#0a66c2',
      secondaryHex: '#124076',
      accentHex: '#16a3a5',
      tone: 'light',
      aiPreferred: true,
      strictAiOnly: true,
    });

    expect(result.source).toBe('deterministic');
    expect(result.accessibility.finalCritical).toBeGreaterThanOrEqual(0);
  });

  it('preserves selected anchor tokens and diagnostics in AI-assisted builds', async () => {
    (IntegrationConfigService.getSecret as any).mockResolvedValue('test-gemini-key');
    const primaryHex = '#0a66c2';
    const secondaryHex = '#124076';
    const accentHex = '#16a3a5';
    mockedAiResponseText = '[]';

    const result = await buildAiAssistedPaletteTokens({
      primaryHex,
      secondaryHex,
      accentHex,
      tone: 'light',
      aiPreferred: true,
      strictAiOnly: false,
      autoFixContrast: true,
      aiModelProfile: 'thinking',
      allowAnchorAdjustments: false,
    });

    expect(result.tokens['--primary']).toBe(primaryHex);
    expect(result.tokens['--secondary']).toBe(secondaryHex);
    expect(result.tokens['--accent']).toBe(accentHex);
    expect(result.diagnostics.selectedAnchors).toEqual({ primaryHex, secondaryHex, accentHex });
    expect(result.diagnostics.appliedAnchors).toEqual({ primaryHex, secondaryHex, accentHex });
    expect(result.diagnostics.anchorPreserved).toBe(true);
    expect(result.diagnostics.aiModelProfile).toBe('thinking');
    expect(result.diagnostics.tone).toBe('light');
  });
});
