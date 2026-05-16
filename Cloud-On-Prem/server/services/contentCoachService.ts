import { GoogleGenAI } from "@google/genai";
import { AIService } from "../ai/aiService";
import { db } from "../db";
import { lessons } from "@shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { CourseContextService, type CourseContextForOverview, type LessonSummary } from "./courseContextService";

// GAP 1 FIX: Multi-dimensional content quality rubric with 7 scoring dimensions
export interface QualityDimension {
  name: string;
  score: number; // 0-100
  feedback: string;
  suggestions: string[];
}

export interface ContentQualityRubric {
  structure: QualityDimension;
  depth: QualityDimension;
  bloomAlignment: QualityDimension;
  terminology: QualityDimension;
  examples: QualityDimension;
  engagement: QualityDimension;
  audienceFit: QualityDimension;
}

// GAP 4 FIX: Priority ranking system
export type Priority = 'critical' | 'important' | 'nice-to-have';

export interface ImprovementSuggestion {
  id: string;
  priority: Priority;
  category: keyof ContentQualityRubric;
  title: string;
  description: string;
  example?: string;
  estimatedEffort: 'quick' | 'medium' | 'significant';
  impactScore: number; // 1-10
}

export interface AbbreviationDetection {
  abbreviation: string;
  expandedForm: string;
  occurrences: number;
  alreadyDefined: boolean;
  confidence: number;
}

// GAP 2 FIX: Structured feedback schema
export interface ContentCoachFeedback {
  lessonId: string;
  lessonTitle: string;
  contentHash: string;
  generatedAt: string;
  overallScore: number; // 0-100
  qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  rubric: ContentQualityRubric;
  topImprovements: ImprovementSuggestion[]; // Top 3 prioritized
  allSuggestions: ImprovementSuggestion[];
  strengths: string[];
  wordCount: number;
  targetWordCount: number;
  bloomLevelsCovered: string[];
  missingBloomLevels: string[];
  abbreviations: AbbreviationDetection[];
}

// GAP 6 FIX: Feedback resolution tracking
export interface FeedbackResolution {
  suggestionId: string;
  status: 'pending' | 'addressed' | 'dismissed';
  resolvedAt?: string;
  notes?: string;
}

// GAP 5 FIX: Cached feedback entry
interface CachedFeedback {
  feedback: ContentCoachFeedback;
  cachedAt: string;
  expiresAt: string;
}

// In-memory cache for feedback (with content hash validation)
const feedbackCache = new Map<string, CachedFeedback>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export class ContentCoachService {
  private aiService: AIService | null = null;
  private modelName: string = 'gemini-2.0-flash';
  private apiKey: string = '';

  private async getAIService(): Promise<AIService> {
    if (!this.aiService) {
      const result = await AIService.getActiveConfigWithError('text');
      if (!result.success || !result.service) {
        throw new Error(result.error?.message || "No active AI configuration found.");
      }
      this.aiService = result.service;
      this.apiKey = (result.service as any).apiKey;
      this.modelName = (result.service as any).modelName || 'gemini-2.0-flash';
    }
    return this.aiService;
  }

  private async callGemini(systemPrompt: string, userContent: string): Promise<string> {
    await this.getAIService();
    
    const genAI = new GoogleGenAI({ apiKey: this.apiKey });
    
    const response = await genAI.models.generateContent({
      model: this.modelName,
      config: {
        systemInstruction: systemPrompt,
      },
      contents: userContent,
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from AI model");
    }
    return text;
  }

  // Generate content hash for cache invalidation
  private generateContentHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex').substring(0, 16);
  }

  // Check cache for existing feedback
  private getCachedFeedback(lessonId: string, contentHash: string): ContentCoachFeedback | null {
    const cacheKey = `${lessonId}:${contentHash}`;
    const cached = feedbackCache.get(cacheKey);
    
    if (cached && new Date(cached.expiresAt) > new Date()) {
      console.log(`[ContentCoach] Cache hit for lesson ${lessonId}`);
      return cached.feedback;
    }
    
    if (cached) {
      feedbackCache.delete(cacheKey);
    }
    return null;
  }

  // Store feedback in cache
  private cacheFeedback(feedback: ContentCoachFeedback): void {
    const cacheKey = `${feedback.lessonId}:${feedback.contentHash}`;
    const now = new Date();
    feedbackCache.set(cacheKey, {
      feedback,
      cachedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + CACHE_TTL_MS).toISOString(),
    });
    console.log(`[ContentCoach] Cached feedback for lesson ${feedback.lessonId}`);
  }

  // Main method to get AI-powered content coaching feedback
  async getContentFeedback(
    lessonId: string,
    options?: {
      forceRefresh?: boolean;
      targetAudience?: 'beginner' | 'intermediate' | 'advanced';
      courseContext?: { title: string; description?: string };
      overviewContext?: CourseContextForOverview;
    }
  ): Promise<ContentCoachFeedback> {
    // Fetch lesson from database
    const lesson = await db.query.lessons.findFirst({
      where: eq(lessons.id, lessonId),
    });

    if (!lesson) {
      throw new Error(`Lesson ${lessonId} not found`);
    }

    const content = lesson.inputText || lesson.description || '';
    const contentHash = this.generateContentHash(content);

    // Check cache unless force refresh
    if (!options?.forceRefresh) {
      const cached = this.getCachedFeedback(lessonId, contentHash);
      if (cached) {
        return cached;
      }
    }

    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;

    // If no content, return minimal feedback
    if (wordCount === 0) {
      return this.generateEmptyContentFeedback(lessonId, lesson.title, contentHash);
    }

    // Generate AI feedback
    const feedback = await this.generateAIFeedback(
      lessonId,
      lesson.title,
      content,
      contentHash,
      wordCount,
      options
    );

    // Cache the feedback
    this.cacheFeedback(feedback);

    return feedback;
  }

  private generateEmptyContentFeedback(
    lessonId: string,
    title: string,
    contentHash: string
  ): ContentCoachFeedback {
    const emptyDimension: QualityDimension = {
      name: '',
      score: 0,
      feedback: 'No content available to analyze.',
      suggestions: ['Add lesson content to receive expert feedback.'],
    };

    return {
      lessonId,
      lessonTitle: title,
      contentHash,
      generatedAt: new Date().toISOString(),
      overallScore: 0,
      qualityGrade: 'F',
      rubric: {
        structure: { ...emptyDimension, name: 'Structure & Organization' },
        depth: { ...emptyDimension, name: 'Content Depth' },
        bloomAlignment: { ...emptyDimension, name: "Bloom's Taxonomy Alignment" },
        terminology: { ...emptyDimension, name: 'Key Terminology' },
        examples: { ...emptyDimension, name: 'Examples & Applications' },
        engagement: { ...emptyDimension, name: 'Engagement & Clarity' },
        audienceFit: { ...emptyDimension, name: 'Audience Fit' },
      },
      topImprovements: [{
        id: crypto.randomUUID(),
        priority: 'critical',
        category: 'depth',
        title: 'Add Lesson Content',
        description: 'This lesson has no content. Add at least 200 words of educational material.',
        estimatedEffort: 'significant',
        impactScore: 10,
      }],
      allSuggestions: [],
      strengths: [],
      wordCount: 0,
      targetWordCount: 500,
      bloomLevelsCovered: [],
      missingBloomLevels: ['remember', 'understand', 'apply'],
      abbreviations: [],
    };
  }

  private async generateAIFeedback(
    lessonId: string,
    title: string,
    content: string,
    contentHash: string,
    wordCount: number,
    options?: {
      targetAudience?: 'beginner' | 'intermediate' | 'advanced';
      courseContext?: { title: string; description?: string };
      overviewContext?: CourseContextForOverview;
    }
  ): Promise<ContentCoachFeedback> {
    const audienceContext = options?.targetAudience 
      ? `Target Audience: ${options.targetAudience} level learners` 
      : 'Target Audience: General learners';
    
    const courseContextStr = options?.courseContext 
      ? `Course: ${options.courseContext.title}${options.courseContext.description ? ` - ${options.courseContext.description}` : ''}`
      : '';

    // Build overview-specific criteria if this is an overview lesson with course context
    let overviewCriteriaSection = '';
    if (options?.overviewContext) {
      overviewCriteriaSection = `
ADDITIONAL CRITERIA FOR OVERVIEW LESSONS:
This lesson is the course overview that introduces the entire learning journey.
Evaluate how well it:
- Introduces and previews all course topics
- Sets clear expectations for what learners will achieve
- Creates motivation and excitement for the content ahead
- Connects the various lessons into a coherent learning narrative

When scoring the "structure" dimension, consider whether the overview provides a clear roadmap.
When scoring the "depth" dimension, consider whether key concepts from each lesson are mentioned.
When scoring the "engagement" dimension, consider whether it creates excitement for the learning journey.
`;
    }

    const systemPrompt = `You are an expert instructional designer and content coach. Analyze educational lesson content and provide detailed, actionable feedback to help creators build world-class learning experiences.

${courseContextStr}
${audienceContext}
Lesson Title: ${title}
Word Count: ${wordCount}
${overviewCriteriaSection}
Analyze the content across 7 quality dimensions, each scored 0-100:

1. STRUCTURE & ORGANIZATION (structure)
   - Clear introduction, body, conclusion
   - Logical flow and progression
   - Appropriate use of headings/sections

2. CONTENT DEPTH & COMPREHENSIVENESS (depth)
   - Thorough coverage of the topic
   - Appropriate level of detail
   - No critical gaps in information

3. BLOOM'S TAXONOMY ALIGNMENT (bloomAlignment)
   - Covers multiple cognitive levels
   - Includes knowledge, comprehension, application
   - Higher-order thinking where appropriate

4. KEY TERMINOLOGY COVERAGE (terminology)
   - Defines important terms
   - Uses industry-standard vocabulary
   - Provides context for technical concepts

5. EXAMPLES & PRACTICAL APPLICATIONS (examples)
   - Real-world examples included
   - Practical exercises or applications
   - Case studies or scenarios

6. ENGAGEMENT & CLARITY (engagement)
   - Clear, accessible language
   - Engaging writing style
   - Appropriate for the medium

7. TARGET AUDIENCE FIT (audienceFit)
   - Appropriate complexity level
   - Relevant to audience needs
   - Prerequisites clearly assumed or explained

For each dimension, provide:
- Score (0-100)
- Brief feedback (1-2 sentences)
- 1-3 specific suggestions for improvement

Also identify:
- Top 3 priority improvements (critical/important/nice-to-have)
- Key strengths of the content
- Bloom's levels covered and missing

Also detect abbreviations and acronyms in the content:
- Find all abbreviations (2+ uppercase letters like "AI", "LMS", "CoT") and acronyms
- For each, determine its likely expanded form based on context
- Count how many times it appears in the content
- Check if it's already defined/explained in the text (e.g., "CoT (Chain-of-Thought)")
- Rate your confidence in the expanded form (0.0-1.0)
- EXCLUDE common abbreviations: e.g., etc., vs., i.e., Mr., Mrs., Dr., Inc., Ltd., USA, UK, US

Return as JSON with this EXACT structure:
{
  "overallScore": 75,
  "rubric": {
    "structure": {"score": 80, "feedback": "...", "suggestions": ["..."]},
    "depth": {"score": 70, "feedback": "...", "suggestions": ["..."]},
    "bloomAlignment": {"score": 65, "feedback": "...", "suggestions": ["..."]},
    "terminology": {"score": 75, "feedback": "...", "suggestions": ["..."]},
    "examples": {"score": 60, "feedback": "...", "suggestions": ["..."]},
    "engagement": {"score": 80, "feedback": "...", "suggestions": ["..."]},
    "audienceFit": {"score": 85, "feedback": "...", "suggestions": ["..."]}
  },
  "topImprovements": [
    {
      "priority": "critical",
      "category": "examples",
      "title": "Add practical examples",
      "description": "The content lacks real-world examples. Add 2-3 concrete scenarios.",
      "example": "For instance, when explaining X, you could add: 'In a typical workplace scenario...'",
      "estimatedEffort": "medium",
      "impactScore": 9
    }
  ],
  "strengths": ["Clear writing style", "Good topic coverage"],
  "bloomLevelsCovered": ["remember", "understand"],
  "missingBloomLevels": ["apply", "analyze"],
  "abbreviations": [
    {
      "abbreviation": "CoT",
      "expandedForm": "Chain-of-Thought",
      "occurrences": 3,
      "alreadyDefined": false,
      "confidence": 0.9
    }
  ]
}`;

    // Build course context section for overview lessons
    let courseContextSection = '';
    if (options?.overviewContext) {
      const formattedSummaries = this.formatLessonSummariesForPrompt(options.overviewContext.otherLessonsSummaries);
      courseContextSection = `
COURSE CONTEXT:
Course: ${options.overviewContext.courseTitle}
${options.overviewContext.courseDescription || 'No course description provided.'}
${options.overviewContext.targetAudience ? `Target Audience: ${options.overviewContext.targetAudience}` : ''}

OTHER LESSONS THIS OVERVIEW SHOULD INTRODUCE:
${formattedSummaries}

---
`;
    }

    const userPrompt = `Analyze this lesson content and provide expert coaching feedback:
${courseContextSection}
LESSON CONTENT:
---
${content.substring(0, 15000)}
---

Return ONLY valid JSON matching the specified structure.`;

    try {
      const response = await this.callGemini(systemPrompt, userPrompt);

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to extract JSON from AI response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Construct the full feedback object
      const feedback: ContentCoachFeedback = {
        lessonId,
        lessonTitle: title,
        contentHash,
        generatedAt: new Date().toISOString(),
        overallScore: parsed.overallScore || 50,
        qualityGrade: this.scoreToGrade(parsed.overallScore || 50),
        rubric: this.normalizeRubric(parsed.rubric),
        topImprovements: this.normalizeImprovements(parsed.topImprovements || []),
        allSuggestions: this.extractAllSuggestions(parsed.rubric),
        strengths: parsed.strengths || [],
        wordCount,
        targetWordCount: this.calculateTargetWordCount(wordCount),
        bloomLevelsCovered: parsed.bloomLevelsCovered || [],
        missingBloomLevels: parsed.missingBloomLevels || [],
        abbreviations: this.normalizeAbbreviations(parsed.abbreviations || []),
      };

      console.log(`[ContentCoach] Generated feedback for lesson ${lessonId}: score=${feedback.overallScore}`);
      return feedback;

    } catch (error: any) {
      console.error(`[ContentCoach] AI feedback generation failed:`, error);
      throw new Error(`Failed to generate content feedback: ${error.message}`);
    }
  }

  private scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  private calculateTargetWordCount(currentCount: number): number {
    if (currentCount < 200) return 500;
    if (currentCount < 500) return 800;
    if (currentCount < 1000) return 1200;
    return currentCount + 200; // Suggest slight expansion for longer content
  }

  private normalizeRubric(rubric: any): ContentQualityRubric {
    const defaultDimension = (name: string): QualityDimension => ({
      name,
      score: 50,
      feedback: 'Unable to fully analyze this dimension.',
      suggestions: [],
    });

    const dimensionNames: Record<keyof ContentQualityRubric, string> = {
      structure: 'Structure & Organization',
      depth: 'Content Depth',
      bloomAlignment: "Bloom's Taxonomy Alignment",
      terminology: 'Key Terminology',
      examples: 'Examples & Applications',
      engagement: 'Engagement & Clarity',
      audienceFit: 'Audience Fit',
    };

    const result: ContentQualityRubric = {} as ContentQualityRubric;
    
    for (const key of Object.keys(dimensionNames) as Array<keyof ContentQualityRubric>) {
      const dim = rubric?.[key];
      result[key] = {
        name: dimensionNames[key],
        score: dim?.score ?? 50,
        feedback: dim?.feedback || 'Analysis pending.',
        suggestions: Array.isArray(dim?.suggestions) ? dim.suggestions : [],
      };
    }

    return result;
  }

  private normalizeImprovements(improvements: any[]): ImprovementSuggestion[] {
    return improvements.slice(0, 3).map((imp, index) => ({
      id: crypto.randomUUID(),
      priority: (['critical', 'important', 'nice-to-have'] as Priority[])[index] || 'important',
      category: imp.category || 'depth',
      title: imp.title || 'Improvement needed',
      description: imp.description || '',
      example: imp.example,
      estimatedEffort: imp.estimatedEffort || 'medium',
      impactScore: imp.impactScore || 5,
    }));
  }

  // Format lesson summaries for AI prompt context
  private formatLessonSummariesForPrompt(summaries: LessonSummary[]): string {
    if (!summaries || summaries.length === 0) {
      return 'No other lessons in this course yet.';
    }

    const lines: string[] = [];
    const sortedSummaries = [...summaries].sort((a, b) => a.topicOrder - b.topicOrder);

    for (const summary of sortedSummaries) {
      const lessonLabel = summary.isOverview ? 'Overview' : `Lesson ${summary.topicOrder}`;
      lines.push(`${lessonLabel}: ${summary.title}`);
      if (summary.description) {
        lines.push(`  Summary: ${summary.description}`);
      }
      if (summary.contentExcerpt) {
        lines.push(`  Content Preview: ${summary.contentExcerpt.substring(0, 200)}${summary.contentExcerpt.length > 200 ? '...' : ''}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private normalizeAbbreviations(abbreviations: any[]): AbbreviationDetection[] {
    if (!Array.isArray(abbreviations)) return [];

    const commonAbbreviations = new Set([
      'e.g.', 'etc.', 'vs.', 'i.e.', 'mr.', 'mrs.', 'dr.', 'inc.', 'ltd.',
      'usa', 'uk', 'us', 'am', 'pm', 'ad', 'bc', 'no.', 'vol.',
    ]);

    return abbreviations
      .filter(a => a && a.abbreviation && a.expandedForm)
      .filter(a => !commonAbbreviations.has(a.abbreviation.toLowerCase()))
      .map(a => ({
        abbreviation: String(a.abbreviation),
        expandedForm: String(a.expandedForm),
        occurrences: Number(a.occurrences) || 1,
        alreadyDefined: Boolean(a.alreadyDefined),
        confidence: Math.min(1, Math.max(0, Number(a.confidence) || 0.5)),
      }));
  }

  private extractAllSuggestions(rubric: any): ImprovementSuggestion[] {
    const suggestions: ImprovementSuggestion[] = [];
    
    if (!rubric) return suggestions;

    const categories: Array<keyof ContentQualityRubric> = [
      'structure', 'depth', 'bloomAlignment', 'terminology', 
      'examples', 'engagement', 'audienceFit'
    ];

    for (const category of categories) {
      const dim = rubric[category];
      if (dim?.suggestions && Array.isArray(dim.suggestions)) {
        for (const suggestion of dim.suggestions) {
          if (typeof suggestion === 'string' && suggestion.trim()) {
            const score = dim.score || 50;
            suggestions.push({
              id: crypto.randomUUID(),
              priority: score < 50 ? 'critical' : score < 70 ? 'important' : 'nice-to-have',
              category,
              title: suggestion.substring(0, 60) + (suggestion.length > 60 ? '...' : ''),
              description: suggestion,
              estimatedEffort: 'medium',
              impactScore: Math.round((100 - score) / 10),
            });
          }
        }
      }
    }

    return suggestions;
  }

  // Get course-wide content analysis
  async getCourseContentAnalysis(courseId: string): Promise<{
    courseId: string;
    lessonsAnalyzed: number;
    averageScore: number;
    averageGrade: string;
    lessonFeedbacks: ContentCoachFeedback[];
    courseStrengths: string[];
    coursePriorities: ImprovementSuggestion[];
  }> {
    // This would be implemented to analyze all lessons in a course
    // For now, return a placeholder structure
    throw new Error('Course-wide analysis not yet implemented');
  }

  /**
   * Generate preview feedback for draft lesson content (without requiring a saved lesson ID)
   * Used in course framework wizard before lessons are persisted
   */
  async generatePreviewFeedback(
    lessonData: {
      title: string;
      description?: string;
      detail?: string;
      objectives?: string[];
      realWorldExample?: string;
    },
    options?: {
      targetAudience?: 'beginner' | 'intermediate' | 'advanced';
      courseContext?: { title: string; description?: string };
    }
  ): Promise<ContentCoachFeedback> {
    // Combine all available content fields
    const contentParts: string[] = [];
    
    if (lessonData.description) {
      contentParts.push(`Description: ${lessonData.description}`);
    }
    
    if (lessonData.detail) {
      contentParts.push(`Content: ${lessonData.detail}`);
    }
    
    if (lessonData.objectives && lessonData.objectives.length > 0) {
      contentParts.push(`Learning Objectives:\n${lessonData.objectives.map((o, i) => `${i + 1}. ${o}`).join('\n')}`);
    }
    
    if (lessonData.realWorldExample) {
      contentParts.push(`Real-World Example: ${lessonData.realWorldExample}`);
    }
    
    const content = contentParts.join('\n\n');
    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
    const contentHash = this.generateContentHash(content);
    
    // Use a preview ID format for draft lessons
    const previewId = `preview_${contentHash}`;
    
    if (wordCount === 0) {
      return this.generateEmptyContentFeedback(previewId, lessonData.title, contentHash);
    }
    
    // Generate AI feedback using the same method
    const feedback = await this.generateAIFeedback(
      previewId,
      lessonData.title,
      content,
      contentHash,
      wordCount,
      options
    );
    
    return feedback;
  }
}

export const contentCoachService = new ContentCoachService();
