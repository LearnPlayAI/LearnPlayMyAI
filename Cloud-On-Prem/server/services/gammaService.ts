import { IntegrationConfigService } from "./integrationConfigService";

const GAMMA_API_BASE_URL = "https://public-api.gamma.app/v1.0";

export interface GammaImageOptions {
  source?: "aiGenerated" | "unsplash" | "noImages" | "webAllImages" | "webFreeToUse" | "pictographic" | "placeholder" | "themeAccent";
  model?: "imagen-4-pro" | "imagen-3" | "stable-diffusion-xl";
  style?: string;
}

export interface GammaTextOptions {
  amount?: "concise" | "balanced" | "detailed";
  tone?: string;
  audience?: string;
}

export interface GammaCardOptions {
  dimensions?: "fluid" | "16x9" | "4x3";
  headerFooter?: any;
}

export interface GammaGenerationParams {
  inputText: string;
  numCards?: number;
  textMode?: "generate" | "condense" | "preserve";
  format?: "presentation" | "document" | "social";
  themeId?: string;
  exportAs?: "pdf" | "pptx";
  imageOptions?: GammaImageOptions;
  textOptions?: GammaTextOptions;
  includeSpeakerNotes?: boolean;
  cardOptions?: GammaCardOptions;
  additionalInstructions?: string;
}

export interface GammaGenerationResponse {
  generationId: string;
  status: "pending" | "processing" | "completed" | "failed";
  gammaUrl?: string;
  exportUrl?: string; // Gamma API returns "exportUrl" for PPTX download
  pdfUrl?: string;
  credits?: {
    deducted: number;
    remaining: number;
  };
  errorMessage?: string;
}

export interface GammaTheme {
  id: string;
  name: string;
  description?: string;
  thumbnailUrl?: string;
  categories?: string[];
  tier?: string;
}

export class GammaService {
  private apiKey: string;
  private static readonly DEFAULT_ADDITIONAL_INSTRUCTIONS =
    "The text on each card should use the maximum available card space and not be cramped. Card text should not look cramped or be too small to read.\nWhen generating images, do NOT generate images containing text.";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  static async getApiKey(): Promise<string> {
    const managedValue = await IntegrationConfigService.getSecret("gamma", "apiKey");
    if (managedValue && !/^(your_|changeme|replace_me|example)/i.test(managedValue)) return managedValue;

    throw new Error(
      "Gamma API key not configured. Configure it in Integration Settings."
    );
  }

  static async getApiKeyStatus(): Promise<{ configured: boolean; source: string }> {
    try {
      const key = await GammaService.getApiKey();
      return { configured: !!key, source: "integration_settings" };
    } catch (_error) {
      return { configured: false, source: "missing" };
    }
  }

  static async getInstance(): Promise<GammaService> {
    const apiKey = await GammaService.getApiKey();
    return new GammaService(apiKey);
  }

  async createPresentation(
    params: GammaGenerationParams
  ): Promise<GammaGenerationResponse> {
    // ENFORCE presentation format, tall (4x3) dimensions, and exactly 10 slides for all requests
    // ENFORCE: Always generate exactly 10 slides per lesson (not configurable)
    const ENFORCED_SLIDE_COUNT = 10;
    
    // Default image options: AI-generated contextual images with NO TEXT
    const defaultImageOptions: GammaImageOptions = {
      source: "aiGenerated",
      model: "imagen-4-pro",
      style: "photorealistic, clean imagery, no text, no words, no labels, no captions, no watermarks, no overlays, purely visual content"
    };
    
    const payload: any = {
      inputText: params.inputText,
      numCards: ENFORCED_SLIDE_COUNT, // ENFORCED: Always 10 slides per lesson
      textMode: params.textMode || "generate",
      format: "presentation", // Always enforce presentation format
      exportAs: params.exportAs || "pptx",
      cardOptions: {
        dimensions: "4x3", // Always enforce tall (4x3) format for presentations
      },
      // Always include imageOptions with no-text enforcement
      imageOptions: {
        ...defaultImageOptions,
        // Allow source override from params, but keep style enforcement
        ...(params.imageOptions?.source && { source: params.imageOptions.source }),
        ...(params.imageOptions?.model && { model: params.imageOptions.model }),
        // Merge user style with no-text enforcement (no-text always appended)
        style: params.imageOptions?.style 
          ? `${params.imageOptions.style}, no text, no words, no labels, no captions, no watermarks`
          : defaultImageOptions.style
      },
    };

    if (params.themeId) {
      payload.themeId = params.themeId;
    }

    if (params.textOptions) {
      payload.textOptions = params.textOptions;
    }

    payload.additionalInstructions = (params.additionalInstructions || GammaService.DEFAULT_ADDITIONAL_INSTRUCTIONS)
      .trim()
      .slice(0, 5000);

    // Enable speaker notes generation for PPTX exports
    if (params.includeSpeakerNotes !== undefined) {
      payload.includeSpeakerNotes = params.includeSpeakerNotes;
    } else if (params.exportAs === "pptx") {
      // Default to true for PPTX exports to support video walkthrough workflow
      payload.includeSpeakerNotes = true;
    }

    console.log("[GammaService] Creating presentation with payload (format=presentation, dimensions=4x3, 10 slides, no-text images enforced, additionalInstructions included):", JSON.stringify(payload, null, 2));

    try {
      const response = await fetch(`${GAMMA_API_BASE_URL}/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": this.apiKey,
          accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[GammaService] API Error: ${response.status} - ${errorText}`
        );
        throw new Error(
          `Gamma API error (${response.status}): ${errorText}`
        );
      }

      const data = await response.json();
      console.log("[GammaService] Presentation creation initiated:", data);

      return {
        generationId: data.generationId,
        status: data.status || "pending",
        credits: data.credits,
      };
    } catch (error) {
      console.error("[GammaService] Error creating presentation:", error);
      throw new Error(
        `Gamma API request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async checkGenerationStatus(
    generationId: string
  ): Promise<GammaGenerationResponse> {
    try {
      const response = await fetch(
        `${GAMMA_API_BASE_URL}/generations/${generationId}`,
        {
          method: "GET",
          headers: {
            "X-API-KEY": this.apiKey,
            accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Generation ${generationId} not found`);
        }
        const errorText = await response.text();
        throw new Error(
          `Gamma API error (${response.status}): ${errorText}`
        );
      }

      const data = await response.json();
      console.log(
        `[GammaService] Status check for ${generationId}:`,
        data.status
      );
      console.log(`[GammaService] Full response data:`, JSON.stringify(data, null, 2));

      return {
        generationId: data.generationId,
        status: data.status,
        gammaUrl: data.gammaUrl,
        exportUrl: data.exportUrl, // Gamma returns "exportUrl" for PPTX
        pdfUrl: data.pdfUrl,
        credits: data.credits,
        errorMessage: data.errorMessage,
      };
    } catch (error) {
      console.error(
        `[GammaService] Error checking status for ${generationId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Poll for generation completion status.
   * WARNING: This method performs synchronous polling with 5-second intervals.
   * DO NOT call this from HTTP request handlers - it will block for up to 5 minutes.
   * Use this ONLY in background job processors.
   * 
   * Note: Per Gamma API documentation, exportUrl appears "after an extra GET request"
   * once status shows "completed". This method will retry a few times after completion
   * to retrieve the exportUrl.
   */
  async pollUntilComplete(
    generationId: string,
    maxAttempts: number = 60,
    intervalMs: number = 5000,
    timeoutMs: number = 10000
  ): Promise<GammaGenerationResponse> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const statusPromise = this.checkGenerationStatus(generationId);
        const status = await Promise.race([
          statusPromise,
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("Status check timeout")),
              timeoutMs
            )
          ),
        ]);

        clearTimeout(timeoutId);

        if (status.status === "completed") {
          console.log(
            `[GammaService] Generation ${generationId} completed successfully`
          );
          
          // Per Gamma API documentation: exportUrl appears after an extra GET request
          // Retry a few times with short backoff to wait for exportUrl
          if (!status.exportUrl) {
            console.log(
              `[GammaService] Completion detected but exportUrl missing, retrying to retrieve it...`
            );
            
            const maxExportRetries = 5;
            const exportRetryDelay = 2000; // 2 seconds between retries
            
            for (let exportAttempt = 1; exportAttempt <= maxExportRetries; exportAttempt++) {
              await new Promise((resolve) => setTimeout(resolve, exportRetryDelay));
              
              const retryStatus = await this.checkGenerationStatus(generationId);
              
              if (retryStatus.exportUrl) {
                console.log(
                  `[GammaService] ✅ exportUrl retrieved after ${exportAttempt} extra request(s)`
                );
                return retryStatus;
              }
              
              console.log(
                `[GammaService] exportUrl still missing (attempt ${exportAttempt}/${maxExportRetries}), retrying...`
              );
            }
            
            // Return even without exportUrl - pollJob will handle retry
            console.warn(
              `[GammaService] ⚠️ exportUrl not available after ${maxExportRetries} retries, returning completion status anyway`
            );
          }
          
          return status;
        }

        if (status.status === "failed") {
          throw new Error(
            `Generation failed: ${status.errorMessage || "Unknown error"}`
          );
        }

        console.log(
          `[GammaService] Generation ${generationId} still ${status.status}, waiting ${intervalMs}ms... (attempt ${attempt + 1}/${maxAttempts})`
        );
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      } catch (error: any) {
        if (
          error.message === "Status check timeout" &&
          attempt < maxAttempts - 1
        ) {
          console.warn(
            `[GammaService] Status check timeout, retrying... (attempt ${attempt + 1}/${maxAttempts})`
          );
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
          continue;
        }
        throw error;
      }
    }

    throw new Error(
      `Generation ${generationId} timed out after ${maxAttempts * intervalMs}ms`
    );
  }

  async downloadPPTX(pptxUrl: string): Promise<Buffer> {
    try {
      console.log(`[GammaService] Downloading PPTX from: ${pptxUrl}`);
      
      const response = await fetch(pptxUrl);

      if (!response.ok) {
        throw new Error(
          `Failed to download PPTX: ${response.status} ${response.statusText}`
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      console.log(
        `[GammaService] Downloaded PPTX successfully (${buffer.length} bytes)`
      );
      return buffer;
    } catch (error) {
      console.error("[GammaService] Error downloading PPTX:", error);
      throw error;
    }
  }

  /**
   * Download presentation as PPTX after polling for completion.
   * WARNING: This method blocks for up to 5 minutes during polling.
   * Use ONLY in background job processors, NOT in HTTP request handlers.
   * 
   * @throws Error if PPTX URL is not available (known Gamma API issue)
   * @returns Buffer with PPTX data and Gamma URL for viewing
   */
  async downloadPresentationAsPPTX(
    generationId: string
  ): Promise<{ buffer: Buffer; gammaUrl: string }> {
    const status = await this.pollUntilComplete(generationId);

    if (!status.exportUrl) {
      const error = new Error(
        `PPTX export URL not provided by Gamma API for generation ${generationId}. ` +
        `This is a known Gamma API issue. Gamma URL: ${status.gammaUrl || 'not available'}`
      );
      console.error(`[GammaService] ${error.message}`);
      throw error;
    }

    const buffer = await this.downloadPPTX(status.exportUrl);
    
    if (buffer.length === 0) {
      throw new Error(
        `Downloaded PPTX file is empty for generation ${generationId}`
      );
    }

    return {
      buffer,
      gammaUrl: status.gammaUrl || "",
    };
  }

  /**
   * Test API connection without consuming credits
   * Returns basic API status info
   */
  async testConnection(): Promise<{ connected: boolean; message: string; themeCount?: number }> {
    try {
      const themes = await this.getAvailableThemes();
      return {
        connected: true,
        message: `API connection successful`,
        themeCount: themes.length
      };
    } catch (error: any) {
      console.error("[GammaService] Connection test failed:", error);
      return {
        connected: false,
        message: error.message || "Connection failed"
      };
    }
  }

  /**
   * Map Gamma API keywords to our category system
   */
  private mapKeywordsToCategories(colorKeywords: string[] = [], toneKeywords: string[] = []): string[] {
    const categories = new Set<string>();
    const allKeywords = [...colorKeywords, ...toneKeywords].map(k => k.toLowerCase());
    
    // Map color keywords to Dark/Light
    const darkKeywords = ['dark', 'black', 'navy', 'midnight', 'charcoal', 'slate'];
    const lightKeywords = ['light', 'white', 'bright', 'pastel', 'pale', 'cream', 'ivory'];
    
    // Map tone keywords to Professional/Colorful
    const professionalKeywords = ['professional', 'corporate', 'business', 'formal', 'elegant', 'sophisticated', 'clean', 'minimal', 'modern'];
    const colorfulKeywords = ['colorful', 'vibrant', 'playful', 'fun', 'creative', 'bold', 'bright', 'energetic'];
    
    for (const keyword of allKeywords) {
      if (darkKeywords.some(dk => keyword.includes(dk))) {
        categories.add('Dark');
      }
      if (lightKeywords.some(lk => keyword.includes(lk))) {
        categories.add('Light');
      }
      if (professionalKeywords.some(pk => keyword.includes(pk))) {
        categories.add('Professional');
      }
      if (colorfulKeywords.some(ck => keyword.includes(ck))) {
        categories.add('Colorful');
      }
    }
    
    return Array.from(categories);
  }

  /**
   * Fetch available themes from Gamma API
   * API docs: https://developers.gamma.app/reference/list-themes
   * Response format: { id, name, type, colorKeywords[], toneKeywords[] }
   */
  async getAvailableThemes(): Promise<GammaTheme[]> {
    try {
      console.log("[GammaService] Fetching available themes from Gamma API");
      
      let allThemes: GammaTheme[] = [];
      let nextCursor: string | null = null;
      let hasMore = true;
      
      // Fetch all themes with pagination
      while (hasMore) {
        const url = new URL(`${GAMMA_API_BASE_URL}/themes`);
        if (nextCursor) {
          url.searchParams.set('after', nextCursor);
        }
        url.searchParams.set('limit', '50'); // Max allowed by API
        
        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "X-API-KEY": this.apiKey,
            accept: "application/json",
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(
            `[GammaService] Themes API Error: ${response.status} - ${errorText}`
          );
          throw new Error(
            `Gamma Themes API error (${response.status}): ${errorText}`
          );
        }

        const responseData = await response.json();
        
        // Gamma API returns { data: [...], hasMore: boolean, nextCursor: string }
        // Each theme: { id, name, type, colorKeywords[], toneKeywords[] }
        const apiThemes = responseData.data || [];
        
        // Transform API response to our GammaTheme format
        const transformedThemes: GammaTheme[] = apiThemes.map((theme: any) => {
          const colorKeywords = theme.colorKeywords || [];
          const toneKeywords = theme.toneKeywords || [];
          const categories = this.mapKeywordsToCategories(colorKeywords, toneKeywords);
          
          // Build description from keywords
          const allKeywords = [...colorKeywords, ...toneKeywords];
          const description = allKeywords.length > 0 
            ? allKeywords.join(', ')
            : undefined;
          
          return {
            id: theme.id,
            name: theme.name,
            description,
            thumbnailUrl: null, // Gamma API doesn't provide thumbnails
            categories: categories.length > 0 ? categories : null,
            isActive: true,
            lastSyncedAt: new Date(),
            lastSyncError: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        });
        
        allThemes = allThemes.concat(transformedThemes);
        
        hasMore = responseData.hasMore || false;
        nextCursor = responseData.nextCursor || null;
        
        console.log(`[GammaService] Fetched ${apiThemes.length} themes (page), total: ${allThemes.length}, hasMore: ${hasMore}`);
      }
      
      console.log(`[GammaService] Successfully fetched ${allThemes.length} total themes from Gamma API`);
      return allThemes;
    } catch (error) {
      console.error("[GammaService] Error fetching themes:", error);
      throw error;
    }
  }

  async getProviderCreditBalance(): Promise<{
    available: boolean;
    creditsRemaining: number | null;
    note?: string;
    raw?: any;
  }> {
    const candidateEndpoints = [
      `${GAMMA_API_BASE_URL}/account`,
      `${GAMMA_API_BASE_URL}/billing`,
      `${GAMMA_API_BASE_URL}/credits`,
    ];

    const extractNumber = (obj: any): number | null => {
      if (!obj || typeof obj !== "object") return null;
      const directKeys = [
        "creditsRemaining",
        "remainingCredits",
        "currentBalance",
        "creditBalance",
        "balance",
      ];
      for (const key of directKeys) {
        if (typeof (obj as any)[key] === "number" && Number.isFinite((obj as any)[key])) {
          return Number((obj as any)[key]);
        }
      }
      if (obj.credits && typeof obj.credits === "object") {
        for (const key of ["remaining", "balance", "current", "left"]) {
          if (typeof obj.credits[key] === "number" && Number.isFinite(obj.credits[key])) {
            return Number(obj.credits[key]);
          }
        }
      }
      return null;
    };

    let lastError: string | undefined;
    for (const endpoint of candidateEndpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "GET",
          headers: {
            "X-API-KEY": this.apiKey,
            accept: "application/json",
          },
        });
        if (!response.ok) {
          lastError = `HTTP ${response.status}`;
          continue;
        }
        const data: any = await response.json();
        const creditsRemaining = extractNumber(data);
        if (typeof creditsRemaining === "number") {
          return {
            available: true,
            creditsRemaining,
            raw: data,
          };
        }
      } catch (error: any) {
        lastError = error?.message || String(error);
      }
    }

    return {
      available: false,
      creditsRemaining: null,
      note: lastError
        ? `Provider balance lookup unavailable (${lastError}).`
        : "Provider balance lookup unavailable.",
    };
  }
}
