import { IntegrationConfigService } from "./integrationConfigService";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

function isPlaceholderSecret(value?: string | null): boolean {
  const trimmed = String(value || "").trim();
  if (!trimmed) return true;
  return /^(your_|changeme|replace_me|example)/i.test(trimmed);
}

export interface ElevenVoice {
  voiceId: string;
  name: string;
  category?: string;
  previewUrl?: string | null;
  labels?: Record<string, string>;
}

export interface ElevenSubscriptionUsage {
  characterCount?: number;
  characterLimit?: number;
  canExtendCharacterLimit?: boolean;
  nextCharacterCountResetUnix?: number | null;
}

export class ElevenLabsApiError extends Error {
  status?: number;
  raw?: any;
  constructor(message: string, status?: number, raw?: any) {
    super(message);
    this.name = "ElevenLabsApiError";
    this.status = status;
    this.raw = raw;
  }
}

export class ElevenLabsService {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  static async getApiKey(): Promise<string> {
    const managedEleven = await IntegrationConfigService.getSecret("elevenlabs", "apiKey");
    if (!isPlaceholderSecret(managedEleven)) return managedEleven!;
    throw new Error("ElevenLabs API key is not configured.");
  }

  static async getInstance(): Promise<ElevenLabsService> {
    const apiKey = await ElevenLabsService.getApiKey();
    return new ElevenLabsService(apiKey);
  }

  private buildHeaders(json = true): Record<string, string> {
    const headers: Record<string, string> = {
      "xi-api-key": this.apiKey,
      accept: json ? "application/json" : "audio/mpeg",
    };
    if (json) headers["content-type"] = "application/json";
    return headers;
  }

  private async fetchSubscriptionUsageOrThrow(): Promise<ElevenSubscriptionUsage> {
    const response = await fetch(`${ELEVENLABS_API_BASE}/user/subscription`, {
      method: "GET",
      headers: this.buildHeaders(true),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new ElevenLabsApiError(
        `Failed to fetch ElevenLabs subscription usage (${response.status})`,
        response.status,
        text,
      );
    }

    const data: any = await response.json();
    return {
      characterCount: typeof data?.character_count === "number" ? data.character_count : undefined,
      characterLimit: typeof data?.character_limit === "number" ? data.character_limit : undefined,
      canExtendCharacterLimit: typeof data?.can_extend_character_limit === "boolean" ? data.can_extend_character_limit : undefined,
      nextCharacterCountResetUnix: typeof data?.next_character_count_reset_unix === "number" ? data.next_character_count_reset_unix : null,
    };
  }

  async listVoices(): Promise<ElevenVoice[]> {
    const response = await fetch(`${ELEVENLABS_API_BASE}/voices`, {
      method: "GET",
      headers: this.buildHeaders(true),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to list ElevenLabs voices (${response.status}): ${text}`);
    }

    const data: any = await response.json();
    const voices = Array.isArray(data?.voices) ? data.voices : [];
    return voices.map((voice: any) => ({
      voiceId: String(voice?.voice_id || ""),
      name: String(voice?.name || "Unnamed"),
      category: voice?.category ? String(voice.category) : undefined,
      previewUrl: voice?.preview_url ? String(voice.preview_url) : null,
      labels: voice?.labels && typeof voice.labels === "object" ? voice.labels : undefined,
    })).filter((v: ElevenVoice) => !!v.voiceId);
  }

  async getSubscriptionUsage(): Promise<ElevenSubscriptionUsage | null> {
    try {
      return await this.fetchSubscriptionUsageOrThrow();
    } catch {
      return null;
    }
  }

  async getSubscriptionUsageOrThrow(): Promise<ElevenSubscriptionUsage> {
    return this.fetchSubscriptionUsageOrThrow();
  }

  async generateSpeech(params: {
    text: string;
    voiceId: string;
    modelId?: string;
    stability?: number;
    similarityBoost?: number;
    style?: number;
    useSpeakerBoost?: boolean;
  }): Promise<Buffer> {
    const {
      text,
      voiceId,
      modelId = (await IntegrationConfigService.getSetting<string>("elevenlabs", "modelId")) || "eleven_multilingual_v2",
      stability = Number(await IntegrationConfigService.getSetting<number>("elevenlabs", "stability") ?? 0.5),
      similarityBoost = Number(await IntegrationConfigService.getSetting<number>("elevenlabs", "similarityBoost") ?? 0.75),
      style = Number(await IntegrationConfigService.getSetting<number>("elevenlabs", "style") ?? 0.0),
      useSpeakerBoost = Boolean(await IntegrationConfigService.getSetting<boolean>("elevenlabs", "useSpeakerBoost") ?? true),
    } = params;

    const response = await fetch(
      `${ELEVENLABS_API_BASE}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: this.buildHeaders(true),
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability,
            similarity_boost: similarityBoost,
            style,
            use_speaker_boost: useSpeakerBoost,
          },
        }),
      }
    );

    if (!response.ok) {
      const textBody = await response.text();
      throw new ElevenLabsApiError(`ElevenLabs generation failed (${response.status}): ${textBody}`, response.status, textBody);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

}
