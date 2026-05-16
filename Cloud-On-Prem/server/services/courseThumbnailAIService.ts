import { GoogleGenAI, Modality } from "@google/genai";
import sharp from 'sharp';
import { IntegrationConfigService } from "./integrationConfigService";

const RECOMMENDED_IMAGE_MODEL = "gemini-2.0-flash-preview-image-generation";

export class ThumbnailGenerationError extends Error {
  constructor(
    message: string,
    public readonly errorCode: 'ai_unavailable' | 'generation_failed' | 'timeout' | 'invalid_model',
    public readonly originalError?: string
  ) {
    super(message);
    this.name = 'ThumbnailGenerationError';
  }
}

interface ThumbnailGenerationResult {
  imageBuffer: Buffer;
  mimeType: string;
  promptUsed: string;
  modelUsed: string;
}

export interface BrandingContext {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  orgName?: string;
  logoBase64?: string; // Optional, for future use
}

function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

function sanitizePromptInput(title: string, description: string | null | undefined): {
  sanitizedTitle: string;
  sanitizedDescription: string;
} {
  const sanitizedTitle = truncateText(stripHtmlTags(title), 100);
  const sanitizedDescription = description 
    ? truncateText(stripHtmlTags(description), 500)
    : '';
  
  return { sanitizedTitle, sanitizedDescription };
}

function buildImagePrompt(
  title: string, 
  description: string | null | undefined,
  brandingContext?: BrandingContext,
  courseTopics?: string[]
): string {
  const { sanitizedTitle, sanitizedDescription } = sanitizePromptInput(title, description);
  
  let basePrompt = `Create a professional, eye-catching course thumbnail image that uses abstract visual representation and symbolic imagery to convey the subject matter.

Course Title: "${sanitizedTitle}"`;

  // Add organization context if provided
  if (brandingContext?.orgName) {
    basePrompt += `\nOrganization: "${brandingContext.orgName}"`;
  }

  const descriptionSection = sanitizedDescription 
    ? `\nCourse Description: "${sanitizedDescription}"`
    : '';

  // Add course topics if provided for better content relevance
  let topicsSection = '';
  if (courseTopics && courseTopics.length > 0) {
    const sanitizedTopics = courseTopics.slice(0, 10).map(t => stripHtmlTags(t).substring(0, 50));
    topicsSection = `\nCourse Topics: ${sanitizedTopics.join(', ')}`;
  }

  // Build color palette instructions based on branding
  let colorGuidelines = '';
  const colors: string[] = [];
  
  if (brandingContext?.primaryColor) {
    colors.push(`primary color ${brandingContext.primaryColor}`);
  }
  if (brandingContext?.secondaryColor) {
    colors.push(`secondary color ${brandingContext.secondaryColor}`);
  }
  if (brandingContext?.accentColor) {
    colors.push(`accent color ${brandingContext.accentColor}`);
  }
  
  if (colors.length > 0) {
    colorGuidelines = `\n- Use a color palette inspired by: ${colors.join(', ')}`;
  }

  const styleGuidelines = `

Visual Approach:
- Use icons, symbols, abstract shapes, or conceptual imagery that represents the subject matter
- Create an abstract visual representation rather than literal depictions
- Focus on symbolic imagery that evokes the course theme

Style Guidelines:
- Professional and modern design suitable for an e-learning platform${colorGuidelines}
- Vibrant, engaging colors that stand out in a course catalog
- Clean, uncluttered composition with clear visual hierarchy
- High-quality, sharp imagery with good contrast
- Educational and inspiring mood

CRITICAL - NO TEXT REQUIREMENT:
Generate ONLY visual imagery. Do NOT include ANY text, words, letters, numbers, logos, watermarks, or typography in the image. The image must be purely visual/graphical with zero textual elements. Text will be added separately by the application.`;

  return basePrompt + descriptionSection + topicsSection + styleGuidelines;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function compressThumbnail(imageBuffer: Buffer): Promise<{ buffer: Buffer; mimeType: string }> {
  try {
    const originalSize = imageBuffer.length;
    
    const compressed = await sharp(imageBuffer)
      .resize({
        width: 1024,
        height: 1024,
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({ quality: 80, effort: 4 })
      .toBuffer();
    
    const compressionRatio = ((originalSize - compressed.length) / originalSize * 100).toFixed(1);
    console.log(`[CourseThumbnailAI] Compressed thumbnail from ${originalSize} to ${compressed.length} bytes (${compressionRatio}% reduction)`);
    
    return { buffer: compressed, mimeType: 'image/webp' };
  } catch (error) {
    console.warn('[CourseThumbnailAI] Compression failed, returning original buffer:', error);
    return { buffer: imageBuffer, mimeType: 'image/png' };
  }
}

async function overlayLogoOnThumbnail(
  imageBuffer: Buffer,
  logoBase64: string | undefined
): Promise<Buffer> {
  if (!logoBase64) {
    return imageBuffer;
  }
  
  try {
    const logoBuffer = Buffer.from(logoBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    
    const mainImage = sharp(imageBuffer);
    const metadata = await mainImage.metadata();
    const width = metadata.width || 1280;
    const height = metadata.height || 720;
    
    const maxLogoWidth = Math.floor(width * 0.15);
    const maxLogoHeight = Math.floor(height * 0.15);
    
    const resizedLogo = await sharp(logoBuffer)
      .resize(maxLogoWidth, maxLogoHeight, { fit: 'inside' })
      .toBuffer();
    
    const logoMeta = await sharp(resizedLogo).metadata();
    const logoW = logoMeta.width || maxLogoWidth;
    const logoH = logoMeta.height || maxLogoHeight;
    
    const padding = Math.floor(width * 0.03);
    const left = width - logoW - padding;
    const top = height - logoH - padding;
    
    const result = await mainImage
      .composite([{
        input: resizedLogo,
        left,
        top,
      }])
      .toBuffer();
    
    console.log(`[CourseThumbnailAI] Successfully overlaid logo on thumbnail (${logoW}x${logoH} logo at ${left},${top})`);
    return result;
  } catch (error) {
    console.warn('[CourseThumbnailAI] Failed to overlay logo, returning original image:', error);
    return imageBuffer;
  }
}

async function getActiveAIConfig(): Promise<{ apiKey: string; modelName: string } | null> {
  const apiKey = String((await IntegrationConfigService.getSecret("gemini", "apiKey")) || "").trim();
  const modelName = String((await IntegrationConfigService.getSetting<string>("gemini", "defaultImageModel")) || RECOMMENDED_IMAGE_MODEL).trim();

  if (!apiKey) {
    console.log("[CourseThumbnailAI] Gemini API key is not configured in Integration Settings.");
    return null;
  }

  return { apiKey, modelName };
}

interface GenerationContext {
  courseTitle?: string;
  attemptNumber: number;
  modelUsed: string;
  timestamp: string;
}

function logStructuredError(
  level: 'error' | 'warn' | 'info',
  message: string,
  context: Partial<GenerationContext> & { error?: any; errorCode?: string; originalError?: string }
) {
  const logEntry = {
    service: 'CourseThumbnailAI',
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
    error: context.error ? {
      name: context.error.name,
      message: context.error.message,
      code: context.error.code,
      status: context.error.status,
      statusText: context.error.statusText,
    } : undefined,
  };
  
  if (level === 'error') {
    console.error(`[CourseThumbnailAI] ${message}`, JSON.stringify(logEntry, null, 2));
  } else if (level === 'warn') {
    console.warn(`[CourseThumbnailAI] ${message}`, JSON.stringify(logEntry, null, 2));
  } else {
    console.log(`[CourseThumbnailAI] ${message}`, JSON.stringify(logEntry, null, 2));
  }
}

async function generateWithGeminiAPI(
  ai: GoogleGenAI,
  modelName: string,
  prompt: string,
  maxAttempts: number = 3,
  baseDelayMs: number = 2000,
  allowFallback: boolean = true
): Promise<ThumbnailGenerationResult> {
  let lastError: Error | null = null;
  let currentModel = modelName;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const context: GenerationContext = {
      attemptNumber: attempt,
      modelUsed: currentModel,
      timestamp: new Date().toISOString(),
    };
    
    try {
      logStructuredError('info', `Starting image generation attempt ${attempt}/${maxAttempts}`, context);
      
      const response = await ai.models.generateContent({
        model: currentModel,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseModalities: [Modality.TEXT, Modality.IMAGE],
        },
      });

      logStructuredError('info', 'Received response from Gemini API', context);

      const candidates = response.candidates;
      if (!candidates || candidates.length === 0) {
        logStructuredError('error', 'No candidates in API response', context);
        throw new Error("No candidates in response from Gemini API");
      }

      const content = candidates[0].content;
      if (!content || !content.parts) {
        logStructuredError('error', 'No content parts in candidate response', context);
        throw new Error("No content parts in response from Gemini API");
      }

      logStructuredError('info', `Response has ${content.parts.length} parts`, context);

      for (const part of content.parts) {
        if (part.text) {
          logStructuredError('info', `Text response: ${part.text.substring(0, 100)}...`, context);
        }
        if (part.inlineData && part.inlineData.data) {
          const imageData = Buffer.from(part.inlineData.data as string, "base64");
          const mimeType = part.inlineData.mimeType || 'image/png';

          logStructuredError('info', `Successfully generated thumbnail (${imageData.length} bytes, ${mimeType})`, context);

          return {
            imageBuffer: imageData,
            mimeType: mimeType,
            promptUsed: prompt,
            modelUsed: currentModel,
          };
        }
      }

      logStructuredError('error', 'No image data found in any response parts', context);
      throw new Error("No image data found in Gemini API response parts");
    } catch (error: any) {
      lastError = error;
      const errorMessage = error.message || JSON.stringify(error);
      
      logStructuredError('error', `Generation attempt ${attempt} failed`, {
        ...context,
        error,
        originalError: errorMessage,
      });
      
      if (errorMessage.includes('429') || errorMessage.includes('RATELIMIT') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        logStructuredError('warn', `Rate limited, waiting ${delayMs}ms before retry`, context);
        await delay(delayMs);
      } else if (errorMessage.includes('404') || errorMessage.includes('NOT_FOUND') || errorMessage.includes('not found') || errorMessage.includes('models/')) {
        logStructuredError('error', `Model ${currentModel} not found or unavailable for image generation`, {
          ...context,
          errorCode: 'invalid_model',
          originalError: errorMessage,
        });
        
        if (allowFallback && currentModel !== RECOMMENDED_IMAGE_MODEL) {
          logStructuredError('info', `Falling back to recommended model: ${RECOMMENDED_IMAGE_MODEL}`, context);
          currentModel = RECOMMENDED_IMAGE_MODEL;
          continue;
        }
        
        throw new ThumbnailGenerationError(
          `Model "${modelName}" is not available for image generation. Please update AI Settings to use "${RECOMMENDED_IMAGE_MODEL}".`,
          'invalid_model',
          errorMessage
        );
      } else if (errorMessage.includes('INVALID_ARGUMENT') || errorMessage.includes('responseModalities') || errorMessage.includes('does not support')) {
        logStructuredError('error', `Model ${currentModel} does not support image generation`, {
          ...context,
          errorCode: 'invalid_model',
          originalError: errorMessage,
        });
        
        if (allowFallback && currentModel !== RECOMMENDED_IMAGE_MODEL) {
          logStructuredError('info', `Falling back to recommended model: ${RECOMMENDED_IMAGE_MODEL}`, context);
          currentModel = RECOMMENDED_IMAGE_MODEL;
          continue;
        }
        
        throw new ThumbnailGenerationError(
          `Model "${modelName}" does not support image generation. Please update AI Settings to use "${RECOMMENDED_IMAGE_MODEL}".`,
          'invalid_model',
          errorMessage
        );
      } else if (attempt < maxAttempts) {
        const delayMs = baseDelayMs * attempt;
        logStructuredError('warn', `Waiting ${delayMs}ms before retry`, context);
        await delay(delayMs);
      }
    }
  }

  const errorMessage = lastError?.message || 'Unknown error during Gemini thumbnail generation';
  
  logStructuredError('error', `All ${maxAttempts} attempts failed`, {
    attemptNumber: maxAttempts,
    modelUsed: currentModel,
    timestamp: new Date().toISOString(),
    errorCode: 'generation_failed',
    originalError: errorMessage,
  });
  
  if (errorMessage.includes('429') || errorMessage.includes('RATELIMIT') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
    throw new ThumbnailGenerationError(
      'AI service is temporarily unavailable due to rate limiting. Please try again in a few minutes.',
      'ai_unavailable',
      errorMessage
    );
  }
  
  throw new ThumbnailGenerationError(
    `Failed to generate thumbnail after ${maxAttempts} attempts. Please try again.`,
    'generation_failed',
    errorMessage
  );
}

export class CourseThumbnailAIService {
  async generateThumbnail(
    courseTitle: string,
    courseDescription: string | null | undefined,
    brandingContext?: BrandingContext,
    courseTopics?: string[]
  ): Promise<ThumbnailGenerationResult> {
    console.log(`[CourseThumbnailAI] Starting thumbnail generation for: "${courseTitle}"${brandingContext?.orgName ? ` (org: ${brandingContext.orgName})` : ''}${courseTopics?.length ? ` with ${courseTopics.length} topics` : ''}`);
    
    const config = await getActiveAIConfig();
    
    if (!config) {
      throw new ThumbnailGenerationError(
        'AI integration is not configured. Please configure an AI provider with purpose="image" in the SuperAdmin AI Settings.',
        'ai_unavailable'
      );
    }

    if (!config.apiKey || !config.modelName) {
      throw new ThumbnailGenerationError(
        'AI configuration is incomplete. Please ensure API key and model name are configured in the admin settings.',
        'ai_unavailable'
      );
    }

    const modelName = config.modelName;
    console.log(`[CourseThumbnailAI] Using configured model: ${modelName}`);

    if (!modelName.toLowerCase().startsWith('gemini')) {
      throw new ThumbnailGenerationError(
        `Model "${modelName}" is not supported. Only Gemini models can be used for image generation. Please update your AI Settings to use "${RECOMMENDED_IMAGE_MODEL}".`,
        'invalid_model'
      );
    }

    const ai = new GoogleGenAI({ apiKey: config.apiKey });
    const prompt = buildImagePrompt(courseTitle, courseDescription, brandingContext, courseTopics);
    
    console.log(`[CourseThumbnailAI] Generating thumbnail for course: "${courseTitle}" using Gemini model: ${modelName}`);
    
    const result = await generateWithGeminiAPI(ai, modelName, prompt);
    
    let processedBuffer = result.imageBuffer;
    
    if (brandingContext?.logoBase64) {
      console.log(`[CourseThumbnailAI] Applying logo overlay for org: ${brandingContext.orgName || 'unknown'}`);
      processedBuffer = await overlayLogoOnThumbnail(result.imageBuffer, brandingContext.logoBase64);
    }
    
    console.log(`[CourseThumbnailAI] Applying webp compression to thumbnail`);
    const compressed = await compressThumbnail(processedBuffer);
    
    return {
      ...result,
      imageBuffer: compressed.buffer,
      mimeType: compressed.mimeType,
    };
  }

  getPromptSummary(courseTitle: string, courseDescription: string | null | undefined): string {
    const { sanitizedTitle, sanitizedDescription } = sanitizePromptInput(courseTitle, courseDescription);
    return sanitizedDescription 
      ? `Title: ${sanitizedTitle} | Description: ${sanitizedDescription.substring(0, 100)}...`
      : `Title: ${sanitizedTitle}`;
  }

  getRecommendedModels(): string[] {
    return [RECOMMENDED_IMAGE_MODEL];
  }
}

export const courseThumbnailAIService = new CourseThumbnailAIService();
