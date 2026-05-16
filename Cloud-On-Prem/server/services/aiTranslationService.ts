import { AIService } from '../ai/aiService';
import { db } from '../db';
import { supportedLanguages } from '@shared/schema';
import { eq } from 'drizzle-orm';

const CHUNK_SIZE = 3000;
const MAX_RETRIES = 2;

const LANGUAGE_NAME_CACHE: Record<string, string> = {};

async function resolveLanguageName(codeOrName: string): Promise<string> {
  if (!codeOrName) return 'English';

  if (codeOrName.length > 3 && !codeOrName.includes('-')) {
    return codeOrName;
  }

  if (LANGUAGE_NAME_CACHE[codeOrName]) {
    return LANGUAGE_NAME_CACHE[codeOrName];
  }

  try {
    const [lang] = await db
      .select({ name: supportedLanguages.name })
      .from(supportedLanguages)
      .where(eq(supportedLanguages.code, codeOrName))
      .limit(1);

    if (lang?.name) {
      LANGUAGE_NAME_CACHE[codeOrName] = lang.name;
      return lang.name;
    }
  } catch (e) {
  }

  const fallbackMap: Record<string, string> = {
    en: 'English', fr: 'French', es: 'Spanish', de: 'German', it: 'Italian',
    pt: 'Portuguese', nl: 'Dutch', ru: 'Russian', zh: 'Chinese', ja: 'Japanese',
    ko: 'Korean', ar: 'Arabic', hi: 'Hindi', bn: 'Bengali', tr: 'Turkish',
    vi: 'Vietnamese', th: 'Thai', pl: 'Polish', uk: 'Ukrainian', ro: 'Romanian',
    sv: 'Swedish', da: 'Danish', fi: 'Finnish', no: 'Norwegian', cs: 'Czech',
    el: 'Greek', he: 'Hebrew', id: 'Indonesian', ms: 'Malay', tl: 'Filipino',
    sw: 'Swahili', zu: 'Zulu', af: 'Afrikaans', hu: 'Hungarian', bg: 'Bulgarian',
    hr: 'Croatian', sk: 'Slovak', sl: 'Slovenian', lt: 'Lithuanian', lv: 'Latvian',
    et: 'Estonian', ga: 'Irish', cy: 'Welsh', mt: 'Maltese', is: 'Icelandic',
    mk: 'Macedonian', sq: 'Albanian', sr: 'Serbian', bs: 'Bosnian', ka: 'Georgian',
    hy: 'Armenian', az: 'Azerbaijani', kk: 'Kazakh', uz: 'Uzbek', km: 'Khmer',
    lo: 'Lao', my: 'Burmese', ne: 'Nepali', si: 'Sinhala', ta: 'Tamil',
    te: 'Telugu', ml: 'Malayalam', kn: 'Kannada', mr: 'Marathi', gu: 'Gujarati',
    pa: 'Punjabi', ur: 'Urdu', fa: 'Persian', ps: 'Pashto', am: 'Amharic',
  };

  const name = fallbackMap[codeOrName] || codeOrName;
  LANGUAGE_NAME_CACHE[codeOrName] = name;
  return name;
}

export interface TranslatedLesson {
  title: string;
  description: string;
  inputText: string;
}

export interface TranslatedSlide {
  title: string;
  bullets: string[];
  speakerNotes: string | null;
}

export interface TranslatedQuizCard {
  question: string;
  answer1: string | null;
  answer2: string | null;
  answer3: string | null;
  answer4: string | null;
  answer5: string | null;
  answer6: string | null;
  matchPairs: Array<{ left: string; right: string }> | null;
  correctAnswer: string | null;
}

export interface TranslatedFrameworkTopic {
  id: string;
  name: string;
  order: number;
  lessonId: string | null;
}

export class AITranslationService {
  private aiService: AIService | null = null;

  private async getAIService(): Promise<AIService> {
    if (!this.aiService) {
      const result = await AIService.getActiveConfigWithError('text');
      if (!result.success || !result.service) {
        throw new Error(result.error?.message || 'No active AI configuration found for translation.');
      }
      this.aiService = result.service;
    }
    return this.aiService;
  }

  async translateText(
    text: string,
    targetLanguage: string,
    sourceLanguage: string = 'en',
    context?: string
  ): Promise<string> {
    if (!text || text.trim().length === 0) return text;

    if (text.length <= CHUNK_SIZE) {
      return this.translateChunk(text, targetLanguage, sourceLanguage, context);
    }

    const chunks = this.splitIntoChunks(text, CHUNK_SIZE);
    const translatedChunks: string[] = [];

    for (const chunk of chunks) {
      const translated = await this.translateChunk(chunk, targetLanguage, sourceLanguage, context);
      translatedChunks.push(translated);
    }

    return translatedChunks.join('\n\n');
  }

  async translateLessonContent(
    lesson: { title: string; description: string | null; inputText: string | null },
    targetLanguage: string,
    sourceLanguage: string = 'en'
  ): Promise<TranslatedLesson> {
    const [title, description, inputText] = await Promise.all([
      this.translateText(lesson.title, targetLanguage, sourceLanguage, 'This is a lesson title'),
      lesson.description 
        ? this.translateText(lesson.description, targetLanguage, sourceLanguage, 'This is a lesson description')
        : Promise.resolve(''),
      lesson.inputText
        ? this.translateText(lesson.inputText, targetLanguage, sourceLanguage, 'This is educational lesson content')
        : Promise.resolve(''),
    ]);

    return { title, description, inputText };
  }

  async translateSlides(
    slides: Array<{ title: string; bullets: string[]; speakerNotes: string | null }>,
    targetLanguage: string,
    sourceLanguage: string = 'en'
  ): Promise<TranslatedSlide[]> {
    const ai = await this.getAIService();
    const { GoogleGenAI } = await import('@google/genai');
    const genAI = new GoogleGenAI({ apiKey: (ai as any).apiKey });

    const [sourceLanguageName, targetLanguageName] = await Promise.all([
      resolveLanguageName(sourceLanguage),
      resolveLanguageName(targetLanguage),
    ]);

    const slidesData = slides.map(s => ({
      title: s.title,
      bullets: s.bullets,
      speakerNotes: s.speakerNotes || '',
    }));

    const prompt = `Translate the following lesson presentation slides from ${sourceLanguageName} to ${targetLanguageName}.

CRITICAL RULES:
- Translate ALL text content accurately and naturally
- Preserve the exact same number of slides (${slides.length} slides)
- Preserve the exact same number of bullet points per slide
- Maintain the educational tone and clarity
- Do not add or remove any content
- Keep technical terms that are commonly used in their original form if they are standard in ${targetLanguageName}
- Handle text direction appropriately for the target language

INPUT SLIDES:
${JSON.stringify(slidesData, null, 2)}

Return a JSON array of translated slides with the same structure.`;

    const response = await genAI.models.generateContent({
      model: (ai as any).modelName,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              bullets: { type: "array", items: { type: "string" } },
              speakerNotes: { type: "string" },
            },
            required: ["title", "bullets", "speakerNotes"],
          },
        },
      },
      contents: prompt,
    });

    const rawJson = response.text;
    if (!rawJson) throw new Error('Empty response from AI for slide translation');

    const translated: TranslatedSlide[] = JSON.parse(rawJson);

    if (translated.length !== slides.length) {
      console.warn(`[AITranslation] Slide count mismatch: expected ${slides.length}, got ${translated.length}`);
    }

    return translated;
  }

  async translateTextBatch(
    texts: string[],
    targetLanguage: string,
    sourceLanguage: string = 'en',
    context: string = 'PPTX text content'
  ): Promise<string[]> {
    if (!texts.length) return [];

    const ai = await this.getAIService();
    const { GoogleGenAI } = await import('@google/genai');
    const genAI = new GoogleGenAI({ apiKey: (ai as any).apiKey });

    const [sourceLanguageName, targetLanguageName] = await Promise.all([
      resolveLanguageName(sourceLanguage),
      resolveLanguageName(targetLanguage),
    ]);

    const CHUNK_SIZE = 40;
    const translated: string[] = [];

    for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
      const chunk = texts.slice(i, i + CHUNK_SIZE);

      const prompt = `Translate the following ordered text entries from ${sourceLanguageName} to ${targetLanguageName}.

Context: ${context}

CRITICAL RULES:
- Return exactly ${chunk.length} translated entries in the same order.
- Do not merge, split, remove, or add entries.
- Preserve technical meaning and educational tone.
- Keep standard technical terms in original form when appropriate for ${targetLanguageName}.
- Output ONLY a JSON array of strings.

INPUT:
${JSON.stringify(chunk, null, 2)}`;

      const response = await genAI.models.generateContent({
        model: (ai as any).modelName,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "array",
            items: { type: "string" },
          },
        },
        contents: prompt,
      });

      const rawJson = response.text;
      if (!rawJson) {
        throw new Error('Empty response from AI for batch translation');
      }

      const parsed = JSON.parse(rawJson) as string[];
      if (!Array.isArray(parsed) || parsed.length !== chunk.length) {
        throw new Error(
          `Invalid batch translation response length: expected ${chunk.length}, got ${Array.isArray(parsed) ? parsed.length : 'non-array'}`
        );
      }

      translated.push(...parsed);
    }

    return translated;
  }

  async translateQuizCards(
    cards: Array<{
      question: string;
      questionType: string;
      answer1: string | null;
      answer2: string | null;
      answer3: string | null;
      answer4: string | null;
      answer5: string | null;
      answer6: string | null;
      matchPairs: any | null;
      correctAnswer: string | null;
    }>,
    targetLanguage: string,
    sourceLanguage: string = 'en'
  ): Promise<TranslatedQuizCard[]> {
    const ai = await this.getAIService();
    const { GoogleGenAI } = await import('@google/genai');
    const genAI = new GoogleGenAI({ apiKey: (ai as any).apiKey });

    const [sourceLanguageName, targetLanguageName] = await Promise.all([
      resolveLanguageName(sourceLanguage),
      resolveLanguageName(targetLanguage),
    ]);

    const cardsData = cards.map(c => ({
      question: c.question,
      questionType: c.questionType,
      answers: [c.answer1, c.answer2, c.answer3, c.answer4, c.answer5, c.answer6].filter(Boolean),
      matchPairs: c.matchPairs,
      correctAnswer: c.correctAnswer,
    }));

    const prompt = `Translate the following quiz questions and answers from ${sourceLanguageName} to ${targetLanguageName}.

CRITICAL RULES:
- Translate ALL question text, answer options, match pairs, and correct answers
- Preserve the EXACT same number of questions (${cards.length})
- Preserve the EXACT same number of answer options per question
- For match questions: translate both left and right sides of pairs, keeping pairs correctly matched
- Keep the same question types
- Do not change correctness of answers — only translate the text
- Keep technical terms that don't translate well in their original form
- Handle text direction appropriately for the target language

INPUT QUESTIONS:
${JSON.stringify(cardsData, null, 2)}

Return a JSON array with translated questions.`;

    const response = await genAI.models.generateContent({
      model: (ai as any).modelName,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              answer1: { type: "string" },
              answer2: { type: "string" },
              answer3: { type: "string" },
              answer4: { type: "string" },
              answer5: { type: "string" },
              answer6: { type: "string" },
              matchPairs: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    left: { type: "string" },
                    right: { type: "string" },
                  },
                  required: ["left", "right"],
                },
              },
              correctAnswer: { type: "string" },
            },
            required: ["question"],
          },
        },
      },
      contents: prompt,
    });

    const rawJson = response.text;
    if (!rawJson) throw new Error('Empty response from AI for quiz translation');

    return JSON.parse(rawJson);
  }

  async translateFrameworkTopics(
    topics: Array<{ id: string; name: string; order: number; lessonId: string | null }>,
    targetLanguage: string,
    sourceLanguage: string = 'en'
  ): Promise<TranslatedFrameworkTopic[]> {
    const ai = await this.getAIService();
    const { GoogleGenAI } = await import('@google/genai');
    const genAI = new GoogleGenAI({ apiKey: (ai as any).apiKey });

    const [sourceLanguageName, targetLanguageName] = await Promise.all([
      resolveLanguageName(sourceLanguage),
      resolveLanguageName(targetLanguage),
    ]);

    const prompt = `Translate the following course framework topic names from ${sourceLanguageName} to ${targetLanguageName}.

CRITICAL RULES:
- Translate ONLY the topic names
- Preserve the exact same number of topics (${topics.length})
- Preserve the id, order, and lessonId fields exactly as-is
- Keep topic names concise and educational

INPUT:
${JSON.stringify(topics, null, 2)}

Return a JSON array with translated topics (same structure, only name translated).`;

    const response = await genAI.models.generateContent({
      model: (ai as any).modelName,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              order: { type: "number" },
              lessonId: { type: "string" },
            },
            required: ["id", "name", "order"],
          },
        },
      },
      contents: prompt,
    });

    const rawJson = response.text;
    if (!rawJson) throw new Error('Empty response from AI for framework translation');

    return JSON.parse(rawJson);
  }

  private async translateChunk(
    text: string,
    targetLanguage: string,
    sourceLanguage: string,
    context?: string
  ): Promise<string> {
    const ai = await this.getAIService();
    const { GoogleGenAI } = await import('@google/genai');
    const genAI = new GoogleGenAI({ apiKey: (ai as any).apiKey });

    const [sourceLanguageName, targetLanguageName] = await Promise.all([
      resolveLanguageName(sourceLanguage),
      resolveLanguageName(targetLanguage),
    ]);

    const contextNote = context ? `\nContext: ${context}` : '';

    const prompt = `Translate the following text from ${sourceLanguageName} to ${targetLanguageName}.${contextNote}

RULES:
- Translate accurately and naturally
- Preserve all formatting (markdown, bullet points, headings, line breaks)
- Keep technical terms that are standard in both languages
- Maintain the educational/professional tone
- Do not add explanations or commentary — only translate
- Handle text direction appropriately for the target language

TEXT TO TRANSLATE:
${text}`;

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await genAI.models.generateContent({
          model: (ai as any).modelName,
          contents: prompt,
        });

        const translated = response.text?.trim();
        if (!translated) throw new Error('Empty translation response');
        return translated;
      } catch (error: any) {
        lastError = error;
        if (attempt < MAX_RETRIES) {
          console.warn(`[AITranslation] Retry ${attempt + 1} for chunk translation: ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    throw lastError || new Error('Translation failed after retries');
  }

  private splitIntoChunks(text: string, maxChunkSize: number): string[] {
    const paragraphs = text.split(/\n\n+/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length + 2 > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.length > 0 ? chunks : [text];
  }
}

export const aiTranslationService = new AITranslationService();
