import { describe, expect, it } from '@jest/globals';
import {
  extractSourceNormalizationJson,
  normalizeLessonSourceContentWithAI,
} from '../services/courseSourceNormalizationService';

describe('course source normalization service', () => {
  const rawSource = [
    'CHAPTER 2: PROVIDE FOR WHEELCHAIRS',
    'stairs ramp',
    'Figure 2',
    '2.1 Stairs and a ramp',
    'Nelson Mandela High School has a new community hall.',
    'A staircase and wheelchair ramp is needed for the stage in the hall.',
    'The principal made a list of things that should be kept in mind when designing the staircase and wheelchair ramp.',
    'The stage is 400 mm high.',
    'The ramp should be wide enough for one wheelchair - 1 000 mm.',
  ].join('\n');

  it('extracts JSON from fenced AI responses', () => {
    expect(extractSourceNormalizationJson('```json\n{"normalizedText":"ok"}\n```')).toBe('{"normalizedText":"ok"}');
  });

  it('returns normalized grounded text, visual references, and raw audit metadata', async () => {
    const result = await normalizeLessonSourceContentWithAI({
      lessonTitle: 'Provide for Wheelchairs',
      rawSourceContent: rawSource,
      sourceAssets: [
        {
          id: 'asset-page-21',
          pageOrSlide: 21,
          caption: 'Figure 2',
          altText: 'House with stairs and ramp',
        },
      ],
      generate: async () => JSON.stringify({
        normalizedText: [
          '# Provide for Wheelchairs',
          '',
          '## Stairs and a ramp',
          '',
          'Nelson Mandela High School has a new community hall.',
          'A staircase and wheelchair ramp is needed for the stage in the hall.',
          '',
          '- The stage is 400 mm high.',
          '- The ramp should be wide enough for one wheelchair - 1 000 mm.',
        ].join('\n'),
        citations: [
          { label: 'Stage height', quote: 'The stage is 400 mm high.', pageOrSlide: 21 },
        ],
        visualRefs: [
          { assetId: 'asset-page-21', caption: 'Figure 2', pageOrSlide: 21, recommendedUse: 'lesson_visual' },
        ],
        warnings: [],
      }),
    });

    expect(result.status).toBe('normalized');
    expect(result.normalizedText).toContain('Stairs and a ramp');
    expect(result.normalizedText).not.toContain('##');
    expect(result.normalizedText).toContain('400 mm');
    expect(result.rawSourceContent).toBe(rawSource);
    expect(result.visualRefs).toEqual([
      { assetId: 'asset-page-21', caption: 'Figure 2', altText: null, pageOrSlide: 21, recommendedUse: 'lesson_visual' },
    ]);
    expect(result.metadata.provider).toBe('gemini');
    expect(result.metadata.rawWordCount).toBeGreaterThan(0);
    expect(result.metadata.normalizedWordCount).toBeGreaterThan(0);
  });

  it('falls back to raw source content when AI fails', async () => {
    const result = await normalizeLessonSourceContentWithAI({
      lessonTitle: 'Provide for Wheelchairs',
      rawSourceContent: rawSource,
      generate: async () => {
        throw new Error('AI unavailable');
      },
    });

    expect(result.status).toBe('fallback_raw');
    expect(result.normalizedText).toBe(rawSource);
    expect(result.rawSourceContent).toBe(rawSource);
    expect(result.warnings.join(' ')).toContain('AI unavailable');
  });

  it('rejects suspiciously short normalized text and keeps raw content', async () => {
    const result = await normalizeLessonSourceContentWithAI({
      lessonTitle: 'Provide for Wheelchairs',
      rawSourceContent: rawSource,
      generate: async () => JSON.stringify({
        normalizedText: 'Too short.',
        citations: [],
        visualRefs: [],
        warnings: [],
      }),
    });

    expect(result.status).toBe('fallback_raw');
    expect(result.normalizedText).toBe(rawSource);
    expect(result.warnings.join(' ')).toContain('too short');
  });
});
