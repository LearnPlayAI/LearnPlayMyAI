import { AIService } from "../ai/aiService";
import { CourseTopic } from "@shared/schema";
import { 
  type GammaSlide, 
  type LearningAssetContract,
  deriveCourseModulesFromSlides,
  type CourseModuleFromSlides,
} from "@shared/contentParsers";

export interface GenerateTopicsParams {
  courseTitle: string;
  courseDescription: string;
  difficultyLevel: string;
  category: string;
  numberOfTopics?: number;
}

export interface GenerateTopicsFromContractParams {
  courseTitle: string;
  courseDescription: string;
  difficultyLevel: string;
  category: string;
  learningAssetContract: LearningAssetContract;
}

export interface RegenerateTopicDescriptionParams {
  courseTitle: string;
  courseDescription: string;
  difficultyLevel: string;
  topic: CourseTopic;
  siblingTopics: CourseTopic[];
}

export interface GeneratedTopic {
  name: string;
  description: string;
  isOverview: boolean;
  sourceSlidePosition?: number;
}

export class CourseTopicAIService {
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

  async generateTopicsWithDescriptions(params: GenerateTopicsParams): Promise<GeneratedTopic[]> {
    const ai = await this.getAIService();
    const numberOfTopics = params.numberOfTopics || 8;

    const systemPrompt = `You are an expert course curriculum designer. Generate a structured course outline with topics and descriptions.

COURSE INFORMATION:
- Title: ${params.courseTitle}
- Description: ${params.courseDescription}
- Difficulty Level: ${params.difficultyLevel}
- Category: ${params.category}

REQUIREMENTS:
1. Generate exactly ${numberOfTopics} topics for this course
2. The FIRST topic MUST be an "Overview" or "Introduction" that summarizes what the course will cover
3. Each topic needs a clear, descriptive name (3-8 words)
4. Each topic needs a 1-2 sentence description explaining what learners will cover
5. Topics should follow a logical learning progression (beginner concepts first, advanced later)
6. Make descriptions specific to the course content, not generic
7. Ensure topics align with the difficulty level specified

🔴 ZERO HALLUCINATION POLICY:
- Use ONLY the provided course title and description. Do not add any information not present in the source.
- Every statement must be traceable to the provided course information.
- If the source doesn't contain enough information, indicate gaps rather than filling with assumptions.
- DO NOT invent topics, features, or claims not derivable from the course title and description.

OUTPUT FORMAT (JSON array):
[
  {
    "name": "Course Overview and Learning Objectives",
    "description": "Get introduced to the course structure, understand what you'll learn, and set up your learning environment for success.",
    "isOverview": true
  },
  {
    "name": "Topic Name Here",
    "description": "A specific description of what this topic covers and what skills learners will gain.",
    "isOverview": false
  }
]

Generate exactly ${numberOfTopics} topics. The first must be an overview (isOverview: true), all others should have isOverview: false.
Return ONLY the JSON array, no additional text.`;

    try {
      const response = await this.callGeminiForTopics(ai, systemPrompt);
      const topics = this.parseTopicsResponse(response);
      
      if (topics.length === 0) {
        throw new Error("Failed to generate topics from AI response");
      }

      topics[0].isOverview = true;
      for (let i = 1; i < topics.length; i++) {
        topics[i].isOverview = false;
      }

      return topics;
    } catch (error) {
      console.error("[CourseTopicAIService] Error generating topics:", error);
      throw error;
    }
  }

  async generateTopicsFromContract(params: GenerateTopicsFromContractParams): Promise<GeneratedTopic[]> {
    const { learningAssetContract, courseTitle } = params;
    
    if (!learningAssetContract?.slides || learningAssetContract.slides.length < 2) {
      throw new Error("Learning asset contract must have at least 2 slides");
    }

    const modules = deriveCourseModulesFromSlides(learningAssetContract.slides, courseTitle);
    
    return modules.map(module => ({
      name: module.name,
      description: module.description,
      isOverview: module.isOverview,
      sourceSlidePosition: module.sourceSlidePosition,
    }));
  }

  async enhanceTopicsFromContract(params: GenerateTopicsFromContractParams): Promise<GeneratedTopic[]> {
    const ai = await this.getAIService();
    const { learningAssetContract, courseTitle, courseDescription, difficultyLevel, category } = params;
    
    if (!learningAssetContract?.slides || learningAssetContract.slides.length < 2) {
      throw new Error("Learning asset contract must have at least 2 slides");
    }

    const slidesContext = learningAssetContract.slides.map((slide, index) => {
      const keyPointsText = slide.keyPoints.length > 0 
        ? `\n   Key points: ${slide.keyPoints.join('; ')}`
        : '';
      return `${index + 1}. ${slide.title} (${slide.role})${keyPointsText}`;
    }).join('\n');

    const systemPrompt = `You are an expert course curriculum designer. Enhance existing lesson topics into a comprehensive course framework.

COURSE INFORMATION:
- Title: ${courseTitle}
- Description: ${courseDescription}
- Difficulty Level: ${difficultyLevel}
- Category: ${category}

EXISTING LESSON SLIDES:
${slidesContext}

TASK:
For each slide above, generate an enhanced topic description suitable for a course module.
Keep the topic names aligned with the slide titles but make descriptions more detailed.
Ensure the first topic is marked as overview.

🔴 ZERO HALLUCINATION POLICY:
- Use ONLY the provided slide content. Do not add any information not present in the source.
- Every statement must be traceable to the existing lesson slides.
- If the source doesn't contain enough information, indicate gaps rather than filling with assumptions.
- DO NOT invent topics, features, or claims not present in the slide content.

OUTPUT FORMAT (JSON array):
[
  {
    "name": "Topic Name (aligned with slide title)",
    "description": "Enhanced 2-3 sentence description for this course module.",
    "isOverview": true/false,
    "sourceSlidePosition": 1
  }
]

Generate exactly ${learningAssetContract.slides.length} topics, one for each slide.
Return ONLY the JSON array, no additional text.`;

    try {
      const response = await this.callGeminiForTopics(ai, systemPrompt);
      const topics = this.parseTopicsResponse(response);
      
      if (topics.length === 0) {
        console.warn("[CourseTopicAIService] AI enhancement failed, falling back to basic conversion");
        return this.generateTopicsFromContract(params);
      }

      topics[0].isOverview = true;
      for (let i = 1; i < topics.length; i++) {
        topics[i].isOverview = false;
      }

      return topics.map((topic, index) => ({
        ...topic,
        sourceSlidePosition: learningAssetContract.slides[index]?.position || index + 1,
      }));
    } catch (error) {
      console.error("[CourseTopicAIService] Error enhancing topics:", error);
      return this.generateTopicsFromContract(params);
    }
  }

  async regenerateOverviewDescription(
    courseTitle: string,
    courseDescription: string,
    difficultyLevel: string,
    allTopics: CourseTopic[]
  ): Promise<string> {
    const ai = await this.getAIService();
    
    const topicsContext = allTopics
      .filter(t => !t.isOverview)
      .map(t => `- ${t.name}: ${t.description || '(no description)'}`)
      .join('\n');

    const systemPrompt = `You are an expert course curriculum designer. Generate an engaging overview description for the first lesson of a course.

COURSE INFORMATION:
- Title: ${courseTitle}
- Description: ${courseDescription}
- Difficulty Level: ${difficultyLevel}

COURSE TOPICS COVERED:
${topicsContext}

TASK:
Write a compelling 2-3 sentence description for the course overview/introduction lesson. This description should:
1. Welcome learners and set expectations
2. Briefly mention what the course covers (referencing the topics above)
3. Explain the learning journey ahead
4. Be specific to this course, not generic

🔴 ZERO HALLUCINATION POLICY:
- Use ONLY the provided course information and topics. Do not add any information not present in the source.
- Every statement must be traceable to the provided course context.
- If the source doesn't contain enough information, indicate gaps rather than filling with assumptions.

Return ONLY the description text, no quotes or additional formatting.`;

    try {
      const description = await this.callGeminiForText(ai, systemPrompt);
      return description.trim();
    } catch (error) {
      console.error("[CourseTopicAIService] Error regenerating overview:", error);
      throw error;
    }
  }

  async regenerateSingleTopicDescription(params: RegenerateTopicDescriptionParams): Promise<string> {
    const ai = await this.getAIService();
    
    const siblingContext = params.siblingTopics
      .filter(t => t.name !== params.topic.name)
      .map(t => `- ${t.name}${t.description ? `: ${t.description}` : ''}`)
      .join('\n');

    const systemPrompt = `You are an expert course curriculum designer. Generate a description for a specific course topic.

COURSE CONTEXT:
- Course Title: ${params.courseTitle}
- Course Description: ${params.courseDescription}
- Difficulty Level: ${params.difficultyLevel}

OTHER TOPICS IN THIS COURSE:
${siblingContext}

TARGET TOPIC:
Name: ${params.topic.name}
${params.topic.isOverview ? 'This is the overview/introduction lesson.' : ''}

TASK:
Write a clear, specific 1-2 sentence description for this topic. The description should:
1. Explain what learners will learn in this specific topic
2. Be relevant to the overall course theme
3. Avoid duplicating content from other topics
4. Match the difficulty level specified
5. Be actionable and engaging

🔴 ZERO HALLUCINATION POLICY:
- Use ONLY the provided course and topic information. Do not add any information not present in the source.
- Every statement must be traceable to the provided course context.
- If the source doesn't contain enough information, indicate gaps rather than filling with assumptions.

Return ONLY the description text, no quotes or additional formatting.`;

    try {
      const description = await this.callGeminiForText(ai, systemPrompt);
      return description.trim();
    } catch (error) {
      console.error("[CourseTopicAIService] Error regenerating topic description:", error);
      throw error;
    }
  }

  async regenerateAllDescriptions(
    courseTitle: string,
    courseDescription: string,
    difficultyLevel: string,
    topics: CourseTopic[]
  ): Promise<Map<string, string>> {
    const ai = await this.getAIService();
    
    const topicsContext = topics
      .map(t => `${t.order + 1}. ${t.name}${t.isOverview ? ' (Overview)' : ''}`)
      .join('\n');

    const systemPrompt = `You are an expert course curriculum designer. Generate descriptions for all topics in a course.

COURSE INFORMATION:
- Title: ${courseTitle}
- Description: ${courseDescription}
- Difficulty Level: ${difficultyLevel}

TOPICS TO DESCRIBE:
${topicsContext}

TASK:
For each topic, write a clear, specific 1-2 sentence description. Each description should:
1. Explain what learners will learn in that specific topic
2. Be relevant to the overall course theme
3. Not duplicate content from other topics
4. Match the difficulty level specified
5. The first topic (Overview) should welcome learners and set expectations

🔴 ZERO HALLUCINATION POLICY:
- Use ONLY the provided course and topic information. Do not add any information not present in the source.
- Every statement must be traceable to the provided course context.
- If the source doesn't contain enough information, indicate gaps rather than filling with assumptions.

OUTPUT FORMAT (JSON object with topic names as keys):
{
  "Topic Name 1": "Description for topic 1...",
  "Topic Name 2": "Description for topic 2..."
}

Return ONLY the JSON object, no additional text.`;

    try {
      const response = await this.callGeminiForText(ai, systemPrompt);
      const descriptions = this.parseDescriptionsResponse(response);
      return descriptions;
    } catch (error) {
      console.error("[CourseTopicAIService] Error regenerating all descriptions:", error);
      throw error;
    }
  }

  private async callGeminiForTopics(ai: AIService, systemPrompt: string): Promise<string> {
    const { GoogleGenAI } = await import("@google/genai");
    const genAI = new GoogleGenAI({ apiKey: (ai as any).apiKey });
    
    const response = await genAI.models.generateContent({
      model: (ai as any).modelName || "gemini-2.0-flash",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
      },
      contents: "Generate the course topics as specified in the system instructions."
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from AI model");
    }
    return text;
  }

  private async callGeminiForText(ai: AIService, systemPrompt: string): Promise<string> {
    const { GoogleGenAI } = await import("@google/genai");
    const genAI = new GoogleGenAI({ apiKey: (ai as any).apiKey });
    
    const response = await genAI.models.generateContent({
      model: (ai as any).modelName || "gemini-2.0-flash",
      config: {
        systemInstruction: systemPrompt,
      },
      contents: "Generate the content as specified in the system instructions."
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from AI model");
    }
    return text;
  }

  private parseTopicsResponse(response: string): GeneratedTopic[] {
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error("[CourseTopicAIService] No JSON array found in response");
        return [];
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) {
        console.error("[CourseTopicAIService] Parsed response is not an array");
        return [];
      }

      return parsed.map((item: any) => ({
        name: String(item.name || "Untitled Topic"),
        description: String(item.description || ""),
        isOverview: Boolean(item.isOverview),
      }));
    } catch (error) {
      console.error("[CourseTopicAIService] Failed to parse topics response:", error);
      return [];
    }
  }

  private parseDescriptionsResponse(response: string): Map<string, string> {
    const descriptions = new Map<string, string>();
    
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("[CourseTopicAIService] No JSON object found in response");
        return descriptions;
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        console.error("[CourseTopicAIService] Parsed response is not an object");
        return descriptions;
      }

      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') {
          descriptions.set(key, value);
        }
      }
    } catch (error) {
      console.error("[CourseTopicAIService] Failed to parse descriptions response:", error);
    }

    return descriptions;
  }
}

export const courseTopicAIService = new CourseTopicAIService();
