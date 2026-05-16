export type SourceNormalizationStatus = 'normalized' | 'fallback_raw' | 'skipped';

export interface SourceNormalizationAsset {
  id: string;
  pageOrSlide?: number | null;
  caption?: string | null;
  altText?: string | null;
  containsEmbeddedText?: boolean | null;
}

export interface SourceNormalizationCitation {
  label?: string;
  quote?: string;
  pageOrSlide?: number | null;
}

export interface SourceNormalizationVisualRef {
  assetId: string;
  recommendedUse: 'lesson_visual' | 'reference';
  caption?: string | null;
  altText?: string | null;
  pageOrSlide?: number | null;
}

export interface SourceNormalizationInput {
  lessonTitle: string;
  lessonDescription?: string;
  rawSourceContent: string;
  sourceAssets?: SourceNormalizationAsset[];
  targetAudience?: string;
  modelName?: string;
  generate: (systemPrompt: string, userPrompt: string) => Promise<string>;
}

export interface SourceNormalizationResult {
  status: SourceNormalizationStatus;
  normalizedText: string;
  rawSourceContent: string;
  warnings: string[];
  citations: SourceNormalizationCitation[];
  visualRefs: SourceNormalizationVisualRef[];
  metadata: {
    provider: 'gemini';
    status: SourceNormalizationStatus;
    modelName?: string;
    normalizedAt: string;
    rawWordCount: number;
    normalizedWordCount: number;
    warningCount: number;
    citationCount: number;
    visualRefCount: number;
  };
}

interface ParsedSourceNormalizationResponse {
  normalizedText?: unknown;
  citations?: unknown;
  visualRefs?: unknown;
  warnings?: unknown;
}

export function extractSourceNormalizationJson(response: string): string {
  const fenced = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  const objectMatch = response.match(/\{[\s\S]*\}/);
  if (objectMatch) return objectMatch[0].trim();

  return response.trim();
}

export function buildSourceNormalizationPrompt(input: {
  lessonTitle: string;
  lessonDescription?: string;
  rawSourceContent: string;
  sourceAssets?: SourceNormalizationAsset[];
  targetAudience?: string;
}): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = [
    'You are LearnPlay source intelligence for course creation.',
    'Your job is to turn messy extracted source text into readable learner source material.',
    'Use only facts that appear in the provided source text. Do not add new facts, examples, dimensions, names, dates, or explanations.',
    'Keep all technical terms, numbers, product names, module names, and sequence-sensitive instructions exact.',
    'You may fix line breaks, join broken sentences, create plain-text headings, preserve lists, and place figure references near the relevant text.',
    'Do not use Markdown heading markers such as # or ##. Use the source heading text or numbered source headings as plain lines.',
    'If the source refers to a figure/table/slide and the matching asset is unclear, keep the reference in the text and add a warning instead of guessing.',
    'Return JSON only. No markdown fences.',
  ].join('\n');

  const assets = (input.sourceAssets || [])
    .slice(0, 60)
    .map((asset) => ({
      assetId: asset.id,
      pageOrSlide: asset.pageOrSlide ?? null,
      caption: asset.caption ?? null,
      altText: asset.altText ?? null,
      containsEmbeddedText: asset.containsEmbeddedText === true,
    }));

  const userPrompt = JSON.stringify({
    task: 'Normalize selected lesson source content for learner viewing and source DB storage.',
    lessonTitle: input.lessonTitle,
    lessonDescription: input.lessonDescription || '',
    targetAudience: input.targetAudience || 'intermediate',
    requiredJsonShape: {
      normalizedText: 'string. Clean learner-facing text with plain headings and bullet lines. Ground every statement in rawSourceContent.',
      citations: [
        {
          label: 'short source reference label',
          quote: 'short exact quote from rawSourceContent supporting important facts',
          pageOrSlide: 'number or null',
        },
      ],
      visualRefs: [
        {
          assetId: 'must match one provided assetId',
          recommendedUse: 'lesson_visual or reference',
          caption: 'caption from the source or null',
          altText: 'short accessible description from asset metadata/source text or null',
          pageOrSlide: 'number or null',
        },
      ],
      warnings: [
        'short warning for unclear figure links, missing context, or extraction issues',
      ],
    },
    sourceAssets: assets,
    rawSourceContent: input.rawSourceContent,
  });

  return { systemPrompt, userPrompt };
}

function countWords(text: string): number {
  return String(text || '').split(/\s+/).filter(Boolean).length;
}

function cleanNormalizedText(value: unknown): string {
  return String(value || '')
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/```$/i, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 20);
}

function normalizeCitations(value: unknown): SourceNormalizationCitation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return {
        label: String(record.label || '').trim() || undefined,
        quote: String(record.quote || '').trim() || undefined,
        pageOrSlide: typeof record.pageOrSlide === 'number' ? record.pageOrSlide : null,
      };
    })
    .filter((item) => item.label || item.quote)
    .slice(0, 20);
}

function normalizeVisualRefs(value: unknown, sourceAssets: SourceNormalizationAsset[] = []): SourceNormalizationVisualRef[] {
  if (!Array.isArray(value)) return [];
  const allowedAssetIds = new Set(sourceAssets.map((asset) => asset.id).filter(Boolean));
  const seen = new Set<string>();
  const refs: SourceNormalizationVisualRef[] = [];

  for (const item of value) {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const assetId = String(record.assetId || '').trim();
    if (!assetId || seen.has(assetId)) continue;
    if (allowedAssetIds.size > 0 && !allowedAssetIds.has(assetId)) continue;

    const recommendedUse = String(record.recommendedUse || '').trim() === 'reference'
      ? 'reference'
      : 'lesson_visual';
    refs.push({
      assetId,
      recommendedUse,
      caption: String(record.caption || '').trim() || null,
      altText: String(record.altText || '').trim() || null,
      pageOrSlide: typeof record.pageOrSlide === 'number' ? record.pageOrSlide : null,
    });
    seen.add(assetId);
    if (refs.length >= 20) break;
  }

  return refs;
}

function fallbackResult(params: {
  rawSourceContent: string;
  warnings: string[];
  modelName?: string;
  status?: SourceNormalizationStatus;
}): SourceNormalizationResult {
  const normalizedText = params.rawSourceContent.trim();
  const rawWordCount = countWords(params.rawSourceContent);
  return {
    status: params.status || 'fallback_raw',
    normalizedText,
    rawSourceContent: params.rawSourceContent,
    warnings: params.warnings,
    citations: [],
    visualRefs: [],
    metadata: {
      provider: 'gemini',
      status: params.status || 'fallback_raw',
      modelName: params.modelName,
      normalizedAt: new Date().toISOString(),
      rawWordCount,
      normalizedWordCount: countWords(normalizedText),
      warningCount: params.warnings.length,
      citationCount: 0,
      visualRefCount: 0,
    },
  };
}

export async function normalizeLessonSourceContentWithAI(
  input: SourceNormalizationInput
): Promise<SourceNormalizationResult> {
  const rawSourceContent = String(input.rawSourceContent || '').trim();
  const rawWordCount = countWords(rawSourceContent);

  if (rawWordCount < 20) {
    return fallbackResult({
      rawSourceContent,
      modelName: input.modelName,
      status: 'skipped',
      warnings: ['Source normalization skipped because the selected source content is too short.'],
    });
  }

  const { systemPrompt, userPrompt } = buildSourceNormalizationPrompt({
    lessonTitle: input.lessonTitle,
    lessonDescription: input.lessonDescription,
    rawSourceContent,
    sourceAssets: input.sourceAssets || [],
    targetAudience: input.targetAudience,
  });

  try {
    const aiResponse = await input.generate(systemPrompt, userPrompt);
    const parsed = JSON.parse(extractSourceNormalizationJson(aiResponse)) as ParsedSourceNormalizationResponse;
    const normalizedText = cleanNormalizedText(parsed.normalizedText);
    const normalizedWordCount = countWords(normalizedText);
    const minNormalizedWords = Math.min(80, Math.max(25, Math.floor(rawWordCount * 0.25)));

    if (normalizedWordCount < minNormalizedWords) {
      return fallbackResult({
        rawSourceContent,
        modelName: input.modelName,
        warnings: [
          `AI normalized source was too short (${normalizedWordCount}/${minNormalizedWords} words), so raw source was kept.`,
        ],
      });
    }

    if (normalizedWordCount > rawWordCount * 2.5) {
      return fallbackResult({
        rawSourceContent,
        modelName: input.modelName,
        warnings: [
          `AI normalized source expanded too much (${normalizedWordCount}/${rawWordCount} words), so raw source was kept.`,
        ],
      });
    }

    const citations = normalizeCitations(parsed.citations);
    const visualRefs = normalizeVisualRefs(parsed.visualRefs, input.sourceAssets || []);
    const warnings = toStringArray(parsed.warnings);

    return {
      status: 'normalized',
      normalizedText,
      rawSourceContent,
      warnings,
      citations,
      visualRefs,
      metadata: {
        provider: 'gemini',
        status: 'normalized',
        modelName: input.modelName,
        normalizedAt: new Date().toISOString(),
        rawWordCount,
        normalizedWordCount,
        warningCount: warnings.length,
        citationCount: citations.length,
        visualRefCount: visualRefs.length,
      },
    };
  } catch (error: any) {
    return fallbackResult({
      rawSourceContent,
      modelName: input.modelName,
      warnings: [
        `AI source normalization failed: ${error?.message || 'unknown error'}. Raw source content was kept.`,
      ],
    });
  }
}
