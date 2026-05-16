import { AIService } from "../ai/aiService";

export interface EnrichSlideContentParams {
  lessonTitle: string;
  slideTitle: string;
  slideIndex: number;
  role: 'overview' | 'slide';
  existingKeyPoints?: string[];
}

export interface EnrichedSlideContent {
  bullets: string[];
  speakerNotes: string;
  mediaPrompt?: string;
}

export interface SlideInput {
  title: string;
  keyPoints?: string[];
  role: 'overview' | 'slide';
}

export interface EnrichedSlide {
  slideIndex: number;
  title: string;
  bullets: string[];
  speakerNotes: string;
  mediaPrompt?: string;
  role: 'overview' | 'slide';
}

const MAX_BULLET_LENGTH = 280;
const MIN_BULLETS = 2;
const MAX_BULLETS = 5;
const REQUIRED_SLIDE_COUNT = 10;

export class AIEnrichmentService {
  private aiService: AIService | null = null;

  private async getAIService(): Promise<AIService> {
    if (!this.aiService) {
      const result = await AIService.getActiveConfigWithError('text');
      if (!result.success || !result.service) {
        const errorMessage = result.error?.message || "No active AI configuration found. Please configure AI settings.";
        throw new Error(errorMessage);
      }
      this.aiService = result.service;
    }
    return this.aiService;
  }

  private sanitizeBullet(bullet: string): string {
    let sanitized = bullet
      .trim()
      .replace(/^[-•*]\s*/, '')
      .replace(/^\d+[.)]\s*/, '')
      .trim();
    
    if (sanitized.length > MAX_BULLET_LENGTH) {
      sanitized = sanitized.substring(0, MAX_BULLET_LENGTH - 3) + '...';
    }
    
    return sanitized;
  }

  private validateBullets(bullets: string[]): string[] {
    const sanitized = bullets
      .map(b => this.sanitizeBullet(b))
      .filter(b => b.length > 0);
    
    if (sanitized.length < MIN_BULLETS) {
      console.warn(`[AIEnrichmentService] Only ${sanitized.length} valid bullets found, minimum is ${MIN_BULLETS}`);
    }
    
    return sanitized.slice(0, MAX_BULLETS);
  }

  private sanitizeSpeakerNotes(notes: string): string {
    return notes
      .trim()
      .replace(/\s+/g, ' ')
      .substring(0, 500);
  }

  private sanitizeMediaPrompt(prompt: string | undefined): string | undefined {
    if (!prompt) return undefined;
    return prompt.trim().substring(0, 300) || undefined;
  }

  private parseEnrichedContent(response: string): EnrichedSlideContent {
    const lines = response.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    const bullets: string[] = [];
    let speakerNotes = '';
    let mediaPrompt: string | undefined;
    
    let section: 'bullets' | 'speaker' | 'media' | 'unknown' = 'unknown';
    
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      
      if (lowerLine.startsWith('bullets:') || lowerLine.startsWith('key points:') || lowerLine.startsWith('bullet points:')) {
        section = 'bullets';
        continue;
      }
      if (lowerLine.startsWith('speaker notes:') || lowerLine.startsWith('speaker note:') || lowerLine.startsWith('notes:')) {
        section = 'speaker';
        continue;
      }
      if (lowerLine.startsWith('media prompt:') || lowerLine.startsWith('image prompt:') || lowerLine.startsWith('visual:')) {
        section = 'media';
        continue;
      }
      
      if (section === 'unknown' && (line.startsWith('-') || line.startsWith('•') || line.startsWith('*') || line.match(/^\d+[.)]/))) {
        section = 'bullets';
      }
      
      switch (section) {
        case 'bullets':
          if (line.startsWith('-') || line.startsWith('•') || line.startsWith('*') || line.match(/^\d+[.)]/)) {
            bullets.push(line);
          } else if (bullets.length > 0 && !lowerLine.includes('speaker') && !lowerLine.includes('media') && !lowerLine.includes('visual')) {
            bullets.push(line);
          }
          break;
        case 'speaker':
          if (speakerNotes) {
            speakerNotes += ' ' + line;
          } else {
            speakerNotes = line;
          }
          break;
        case 'media':
          if (!mediaPrompt) {
            mediaPrompt = line;
          }
          break;
      }
    }
    
    return {
      bullets: this.validateBullets(bullets),
      speakerNotes: this.sanitizeSpeakerNotes(speakerNotes),
      mediaPrompt: this.sanitizeMediaPrompt(mediaPrompt)
    };
  }

  async enrichSlideContent(params: EnrichSlideContentParams): Promise<EnrichedSlideContent> {
    const ai = await this.getAIService();
    const { lessonTitle, slideTitle, slideIndex, role, existingKeyPoints } = params;

    const isOverview = role === 'overview' || slideIndex === 0;
    
    const existingContext = existingKeyPoints && existingKeyPoints.length > 0
      ? `\n\nExisting key points to expand upon:\n${existingKeyPoints.map((kp, i) => `${i + 1}. ${kp}`).join('\n')}`
      : '';

    const roleInstructions = isOverview
      ? `This is the OVERVIEW slide (Slide 1). The bullets should:
- Summarize the main learning goals of the entire lesson
- Give learners a clear understanding of what they will achieve
- Set expectations for the lesson content
- Be inspiring and motivational`
      : `This is Slide ${slideIndex + 1}. The bullets should:
- Be informative and specific to the topic "${slideTitle}"
- Provide actionable insights learners can apply
- Build on previous slides in the lesson progression
- Include practical examples or applications where relevant`;

    const promptContent = `Generate enriched content for a presentation slide.

LESSON: "${lessonTitle}"
SLIDE TITLE: "${slideTitle}"
SLIDE POSITION: ${slideIndex + 1} of 10
ROLE: ${isOverview ? 'Overview/Introduction' : 'Content Slide'}
${existingContext}

${roleInstructions}

OUTPUT FORMAT (follow exactly):

Bullets:
- [Bullet point 1 - max 280 characters]
- [Bullet point 2 - max 280 characters]
- [Bullet point 3 - max 280 characters]
- [Bullet point 4 - optional, max 280 characters]

Speaker Notes:
[2-3 sentences explaining how to present this slide effectively. Include timing suggestions, emphasis points, and engagement tips.]

Media Prompt:
[A brief description of an image or visual that would complement this slide - max 100 characters]`;

    const systemPrompt = `You are an expert presentation content enrichment specialist. Your task is to generate high-quality bullet points and speaker notes for presentation slides.

CRITICAL REQUIREMENTS:
1. Generate 3-4 bullet points (minimum 2, maximum 5)
2. Each bullet must be max 280 characters
3. Bullets should be concise, clear, and impactful
4. Speaker notes should be 2-3 sentences with presentation guidance
5. Media prompt should suggest a relevant visual element
6. Use professional, educational language
7. Content must directly relate to the slide title and lesson topic
8. Do NOT use markdown formatting in bullets (no **, no ##, etc.)
9. Each bullet should stand alone as a complete thought

FORMAT YOUR RESPONSE EXACTLY AS:
Bullets:
- First bullet point
- Second bullet point
- Third bullet point

Speaker Notes:
Your 2-3 sentence guidance here.

Media Prompt:
Brief image description here.`;

    try {
      const response = await this.callGeminiForText(ai, systemPrompt, promptContent);
      const enrichedContent = this.parseEnrichedContent(response);
      
      if (enrichedContent.bullets.length < MIN_BULLETS) {
        enrichedContent.bullets = this.generateFallbackBullets(slideTitle, lessonTitle, isOverview);
      }
      
      if (!enrichedContent.speakerNotes || enrichedContent.speakerNotes.length < 20) {
        enrichedContent.speakerNotes = this.generateFallbackSpeakerNotes(slideTitle, isOverview);
      }
      
      return enrichedContent;
    } catch (error: any) {
      console.error("[AIEnrichmentService] Error enriching slide content:", error);
      
      if (error.message?.includes('quota') || error.message?.includes('429') || error.status === 429) {
        throw new Error("AI service quota exceeded. Please try again later or contact support.");
      }
      
      if (error.message?.includes('API key') || error.message?.includes('401') || error.status === 401) {
        throw new Error("AI service authentication failed. Please check the AI configuration.");
      }
      
      return {
        bullets: this.generateFallbackBullets(slideTitle, lessonTitle, isOverview),
        speakerNotes: this.generateFallbackSpeakerNotes(slideTitle, isOverview),
        mediaPrompt: `Professional illustration representing ${slideTitle.toLowerCase()}`
      };
    }
  }

  async enrichLessonSlides(
    lessonTitle: string, 
    slides: SlideInput[]
  ): Promise<EnrichedSlide[]> {
    if (slides.length !== REQUIRED_SLIDE_COUNT) {
      throw new Error(`Batch enrichment requires exactly ${REQUIRED_SLIDE_COUNT} slides. Received ${slides.length}.`);
    }

    const enrichedSlides: EnrichedSlide[] = [];
    
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const role = i === 0 ? 'overview' as const : (slide.role as 'overview' | 'slide') || 'slide' as const;
      
      try {
        const enrichedContent = await this.enrichSlideContent({
          lessonTitle,
          slideTitle: slide.title,
          slideIndex: i,
          role,
          existingKeyPoints: slide.keyPoints
        });
        
        enrichedSlides.push({
          slideIndex: i,
          title: slide.title.trim(),
          bullets: enrichedContent.bullets,
          speakerNotes: enrichedContent.speakerNotes,
          mediaPrompt: enrichedContent.mediaPrompt,
          role
        });
      } catch (error: any) {
        console.error(`[AIEnrichmentService] Failed to enrich slide ${i + 1}:`, error);
        
        enrichedSlides.push({
          slideIndex: i,
          title: slide.title.trim(),
          bullets: this.generateFallbackBullets(slide.title, lessonTitle, i === 0),
          speakerNotes: this.generateFallbackSpeakerNotes(slide.title, i === 0),
          mediaPrompt: `Visual representation of ${slide.title.toLowerCase()}`,
          role
        });
      }
    }
    
    return enrichedSlides;
  }

  private generateFallbackBullets(slideTitle: string, lessonTitle: string, isOverview: boolean): string[] {
    if (isOverview) {
      return [
        `Understand the core concepts of ${lessonTitle}`,
        `Learn practical skills you can apply immediately`,
        `Build a strong foundation for advanced topics`,
        `Discover best practices and industry insights`
      ];
    }
    
    return [
      `Key concepts and fundamentals of ${slideTitle.toLowerCase()}`,
      `Practical techniques and proven approaches`,
      `Common challenges and effective solutions`,
      `Best practices for real-world application`
    ];
  }

  private generateFallbackSpeakerNotes(slideTitle: string, isOverview: boolean): string {
    if (isOverview) {
      return `Begin by welcoming your audience and introducing the main learning objectives. Spend 2-3 minutes setting expectations and creating engagement. Encourage questions throughout the presentation.`;
    }
    
    return `Take 3-5 minutes on this slide. Start with the key concept, then provide examples. Engage the audience by asking if they have experience with ${slideTitle.toLowerCase()}. Summarize main takeaways before moving on.`;
  }

  private async callGeminiForText(ai: AIService, systemPrompt: string, userContent: string): Promise<string> {
    const { GoogleGenAI } = await import("@google/genai");
    const genAI = new GoogleGenAI({ apiKey: (ai as any).apiKey });
    
    const response = await genAI.models.generateContent({
      model: (ai as any).modelName || "gemini-2.0-flash",
      config: {
        systemInstruction: systemPrompt,
      },
      contents: userContent
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from AI model");
    }
    return text;
  }
}

export const aiEnrichmentService = new AIEnrichmentService();
