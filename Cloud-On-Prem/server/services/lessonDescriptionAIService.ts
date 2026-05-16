import { AIService } from "../ai/aiService";
import type { BloomLevel, LearningObjective } from "@shared/courseFrameworkContracts";
import { CourseContextService, type LessonSummary } from "./courseContextService";

export interface LessonTopic {
  position: number;
  title: string;
  role: 'overview' | 'slide';
}

// Course context for enriched lesson generation
export interface CourseContext {
  title: string;
  description?: string;
  targetAudience?: 'beginner' | 'intermediate' | 'advanced';
  organizationType?: 'business' | 'education' | 'elearning' | 'other';
}

// Learning journey context for sequential lesson awareness
export interface LearningJourneyContext {
  lessonPosition: number;
  totalLessons: number;
  isOverview?: boolean;
  previousTopic?: {
    name: string;
    synopsis?: string;
  };
  nextTopic?: {
    name: string;
  };
  allTopicNames?: string[]; // For overview lessons to reference full scope
}

// Learning objectives with Bloom taxonomy levels
export interface LessonObjective {
  bloomLevel: BloomLevel;
  objective: string;
}

export interface GenerateLessonDescriptionParams {
  lessonTitle: string;
  topics?: LessonTopic[];
  mainTopic?: string;
  subtopic1?: string;
  subtopic2?: string;
  // Enhanced context parameters
  courseContext?: CourseContext;
  learningJourney?: LearningJourneyContext;
  learningObjectives?: LessonObjective[];
  keyTerms?: string[];
  // Course-aware overview support
  otherLessonsSummaries?: LessonSummary[];
}

export interface GenerateTopicsParams {
  lessonTitle: string;
  existingTopics?: string[];
  // Enhanced context parameters
  courseContext?: CourseContext;
}

export class LessonDescriptionAIService {
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

  // Helper to build Course Context section for prompts
  private buildCourseContextSection(courseContext?: CourseContext): string {
    if (!courseContext) return '';
    
    const lines = ['## COURSE CONTEXT'];
    lines.push(`Title: ${courseContext.title}`);
    
    if (courseContext.description) {
      lines.push(`Description: ${courseContext.description}`);
    }
    
    if (courseContext.targetAudience) {
      const audienceLabels: Record<string, string> = {
        'beginner': 'Beginner - New to the subject',
        'intermediate': 'Intermediate - Some prior knowledge expected',
        'advanced': 'Advanced - Experienced practitioners'
      };
      lines.push(`Target Audience: ${audienceLabels[courseContext.targetAudience] || courseContext.targetAudience}`);
    }
    
    if (courseContext.organizationType) {
      const orgLabels: Record<string, string> = {
        'business': 'Corporate/Business Training',
        'education': 'Academic/Educational Institution',
        'elearning': 'E-Learning Platform',
        'other': 'General Purpose'
      };
      lines.push(`Organization Type: ${orgLabels[courseContext.organizationType] || courseContext.organizationType}`);
    }
    
    return lines.join('\n');
  }

  // Helper to build Learning Journey section for prompts
  private buildLearningJourneySection(journey?: LearningJourneyContext): string {
    if (!journey) return '';
    
    const lines = ['## LEARNING JOURNEY'];
    lines.push(`This is Lesson ${journey.lessonPosition} of ${journey.totalLessons} in the course.`);
    
    if (journey.isOverview) {
      lines.push('');
      lines.push('This is the OVERVIEW lesson that introduces the entire course.');
      if (journey.allTopicNames && journey.allTopicNames.length > 1) {
        lines.push('The following topics will be covered in subsequent lessons:');
        journey.allTopicNames.slice(1).forEach((name, idx) => {
          lines.push(`  ${idx + 1}. ${name}`);
        });
      }
      lines.push('');
      lines.push('OVERVIEW LESSON REQUIREMENTS:');
      lines.push('- Establish the full scope and goals of the course');
      lines.push('- Introduce what learners will achieve by the end');
      lines.push('- Set expectations for the learning journey ahead');
      lines.push('- Create excitement and motivation for the content to come');
    } else {
      // Sequential lesson handling
      if (journey.previousTopic) {
        const previousInfo = journey.previousTopic.synopsis 
          ? `This lesson follows "${journey.previousTopic.name}" which covered ${journey.previousTopic.synopsis}.`
          : `This lesson follows "${journey.previousTopic.name}".`;
        lines.push(previousInfo);
        lines.push('');
        lines.push('SEQUENTIAL LESSON REQUIREMENTS:');
        lines.push('- Build on concepts from the previous lesson');
        lines.push('- Reference established terminology where relevant');
        lines.push('- Connect this content to the broader course narrative');
      }
      
      if (journey.nextTopic) {
        lines.push(`After this lesson, learners will continue to "${journey.nextTopic.name}".`);
        lines.push('- Prepare learners for upcoming content where appropriate');
      }
    }
    
    return lines.join('\n');
  }

  // Helper to build Learning Objectives section for prompts
  private buildObjectivesSection(objectives?: LessonObjective[]): string {
    if (!objectives || objectives.length === 0) return '';
    
    const bloomLabels: Record<BloomLevel, string> = {
      'remember': '[Remember]',
      'understand': '[Understand]',
      'apply': '[Apply]',
      'analyze': '[Analyze]',
      'evaluate': '[Evaluate]',
      'create': '[Create]'
    };
    
    const lines = [
      '## LEARNING OBJECTIVES FOR THIS LESSON',
      'By the end of this lesson, learners should be able to:'
    ];
    
    objectives.forEach(obj => {
      const levelLabel = bloomLabels[obj.bloomLevel] || `[${obj.bloomLevel}]`;
      lines.push(`- ${levelLabel} ${obj.objective}`);
    });
    
    lines.push('');
    lines.push('IMPORTANT: Ensure the lesson content addresses these specific objectives.');
    
    return lines.join('\n');
  }

  // Helper to build Key Terms section for prompts
  private buildKeyTermsSection(keyTerms?: string[]): string {
    if (!keyTerms || keyTerms.length === 0) return '';
    
    const lines = [
      '## KEY TERMS TO INTRODUCE',
      'The following terms should be explained and used appropriately in this lesson:'
    ];
    
    keyTerms.forEach(term => {
      lines.push(`- ${term}`);
    });
    
    return lines.join('\n');
  }

  // Helper to build Other Lessons Summaries section for overview lessons
  private buildOtherLessonsSummariesSection(summaries?: LessonSummary[]): string {
    if (!summaries || summaries.length === 0) return '';
    
    const lines = [
      '## OTHER LESSONS IN THIS COURSE',
      'This overview lesson should introduce and connect with the following lessons:',
      ''
    ];
    
    const sortedSummaries = [...summaries].sort((a, b) => a.topicOrder - b.topicOrder);
    
    sortedSummaries.forEach((summary, index) => {
      const excerpt = summary.description 
        ? summary.description.substring(0, 200) 
        : summary.contentExcerpt.substring(0, 200);
      const truncatedExcerpt = excerpt.length >= 200 ? excerpt + '...' : excerpt;
      lines.push(`${index + 1}. **${summary.title}** - ${truncatedExcerpt || 'No description available'}`);
    });
    
    lines.push('');
    lines.push('IMPORTANT: This overview should establish context for ALL these topics and create excitement about the learning journey ahead.');
    
    return lines.join('\n');
  }

  // Build complete context section for prompts
  private buildEnhancedContextSection(params: {
    courseContext?: CourseContext;
    learningJourney?: LearningJourneyContext;
    learningObjectives?: LessonObjective[];
    keyTerms?: string[];
    otherLessonsSummaries?: LessonSummary[];
  }): string {
    const sections: string[] = [];
    
    const courseSection = this.buildCourseContextSection(params.courseContext);
    if (courseSection) sections.push(courseSection);
    
    const journeySection = this.buildLearningJourneySection(params.learningJourney);
    if (journeySection) sections.push(journeySection);
    
    const objectivesSection = this.buildObjectivesSection(params.learningObjectives);
    if (objectivesSection) sections.push(objectivesSection);
    
    const termsSection = this.buildKeyTermsSection(params.keyTerms);
    if (termsSection) sections.push(termsSection);
    
    const otherLessonsSection = this.buildOtherLessonsSummariesSection(params.otherLessonsSummaries);
    if (otherLessonsSection) sections.push(otherLessonsSection);
    
    if (sections.length === 0) return '';
    
    return '\n\n' + sections.join('\n\n') + '\n';
  }

  private deduplicateTopics(topics: string[]): string[] {
    const seen = new Set<string>();
    return topics.filter(topic => {
      const normalized = topic.toLowerCase().trim();
      if (seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
  }

  private extractTopicsFromResponse(response: string): string[] {
    const topicsMatch = response.match(/Topics Covered:\s*([\s\S]*?)$/i);
    if (!topicsMatch) return [];
    
    const topicsSection = topicsMatch[1];
    const bullets = topicsSection
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('-') || line.startsWith('•') || line.startsWith('*'))
      .map(line => line.replace(/^[-•*]\s*/, '').trim())
      .filter(line => line.length > 0);
    
    return bullets;
  }

  private validateAndFixDescription10Topics(description: string, providedTopics: string[], lessonTitle: string): string {
    const trimmed = description.trim();
    
    let introSection = trimmed;
    let existingTopics: string[] = [];
    
    if (trimmed.includes('Topics Covered:')) {
      const parts = trimmed.split(/Topics Covered:/i);
      introSection = parts[0].trim();
      existingTopics = this.extractTopicsFromResponse(trimmed);
    }
    
    const allTopics = this.deduplicateTopics([...providedTopics, ...existingTopics]);
    
    const fallbackTopics = [
      `Overview of ${lessonTitle}`,
      `Key concepts and fundamentals`,
      `Core principles explained`,
      `Practical applications`,
      `Real-world examples`,
      `Best practices`,
      `Common challenges and solutions`,
      `Advanced techniques`,
      `Implementation strategies`,
      `Summary and next steps`
    ];
    
    while (allTopics.length < 10) {
      const fallback = fallbackTopics[allTopics.length];
      if (fallback && !allTopics.some(t => t.toLowerCase().includes(fallback.toLowerCase().split(' ')[0]))) {
        allTopics.push(fallback);
      } else {
        allTopics.push(`${lessonTitle} - Part ${allTopics.length + 1}`);
      }
    }
    
    const finalTopics = allTopics.slice(0, 10);
    
    const topicsSection = `\n\nTopics Covered:\n${finalTopics.map(t => `- ${t}`).join('\n')}`;
    
    if (!introSection || introSection.length < 20) {
      console.warn("[LessonDescriptionAIService] AI response missing intro, using fallback");
      introSection = `This lesson provides comprehensive coverage of ${lessonTitle}. You will gain practical knowledge and skills applicable to real-world scenarios.`;
    }
    
    return introSection + topicsSection;
  }

  private stripBulletMarkers(line: string): string {
    // Remove bullet markers: -, *, •, numbers with . or )
    return line.replace(/^[\s]*[-*•]\s*/, '').replace(/^[\s]*\d+[.)]\s*/, '').trim();
  }

  private generateFallbackKeyPoints(slideTitle: string, lessonTitle: string, slideIndex: number): string[] {
    // Generate meaningful, contextual key points based on slide position
    if (slideIndex === 0) {
      return [
        `Understand the core concepts of ${lessonTitle}`,
        `Learn practical skills you can apply immediately`,
        `Build a strong foundation for advanced topics`,
        `Discover best practices from industry experts`
      ];
    } else if (slideIndex === 9) {
      return [
        `Review key takeaways from this lesson`,
        `Apply what you've learned to real situations`,
        `Continue building on these foundational skills`,
        `Explore additional resources for deeper learning`
      ];
    } else {
      return [
        `Explore the fundamentals of ${slideTitle.toLowerCase()}`,
        `Learn practical techniques and approaches`,
        `Understand common challenges and solutions`,
        `Apply best practices in your work`
      ];
    }
  }

  private validateAndFixGammaFormat(content: string, providedTopics: string[], lessonTitle: string): string {
    const trimmed = content.trim();
    
    // Check if content already has --- separators (Gamma format)
    // Handle various separator formats: ---, \n---\n, \n\n---\n\n
    const slides = trimmed.split(/\n+---\n+/).map(s => s.trim()).filter(s => s.length > 0);
    
    if (slides.length < 2) {
      // No hallucinations: Throw error if content doesn't have proper slide structure
      // Frontend validation should have caught this, but be defensive
      throw new Error(`Content must have at least 2 slides separated by '---'. Found ${slides.length} slide(s). Please format your content with slide separators.`);
    }
    
    // Limit to max 10 slides
    const slidesToProcess = slides.slice(0, 10);
    const validSlides: string[] = [];
    
    for (let i = 0; i < slidesToProcess.length; i++) {
      const slide = slidesToProcess[i];
      const lines = slide.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      if (lines.length === 0) {
        // No hallucinations: Skip empty slides rather than generating content
        console.warn(`[LessonDescriptionAIService] Skipping empty slide at position ${i + 1}`);
        continue;
      }
      
      // Use provided topic as title if available, otherwise use first line from content
      // Strip any markdown headers or bullet markers from title
      const rawTitle = lines[0].replace(/^#+\s*/, '');
      const title = (providedTopics[i] && providedTopics[i].trim()) || this.stripBulletMarkers(rawTitle);
      
      if (!title) {
        // No hallucinations: Skip slides without titles
        console.warn(`[LessonDescriptionAIService] Skipping slide at position ${i + 1} - no title`);
        continue;
      }
      
      // Process key points: strip bullets/markers - use ONLY what's provided, no fallbacks
      let keyPoints = lines.slice(1)
        .filter(l => !l.startsWith('#')) // Remove any markdown headers
        .map(l => this.stripBulletMarkers(l))
        .filter(l => l.length > 0);
      
      // No hallucinations: Don't add fallback key points
      // If slide has no key points, that's okay - user provided content as-is
      if (keyPoints.length > 5) {
        keyPoints = keyPoints.slice(0, 5);
      }
      
      // Format with blank line after title, then key points
      if (keyPoints.length > 0) {
        validSlides.push(`${title}\n\n${keyPoints.join('\n')}`);
      } else {
        // Slide with just a title is valid
        validSlides.push(title);
      }
    }
    
    if (validSlides.length < 2) {
      // No hallucinations: Error if we don't have enough valid slides
      throw new Error(`Content must have at least 2 valid slides with titles. Please check your content format.`);
    }
    
    // No hallucinations: Don't fill remaining slides with generated content
    // Use exactly what the user provided (up to 10 slides max)
    
    // Join with proper blank line separators: \n\n---\n\n
    return validSlides.join('\n\n---\n\n');
  }

  async generateTopics(params: GenerateTopicsParams): Promise<LessonTopic[]> {
    const ai = await this.getAIService();
    const { lessonTitle, existingTopics = [], courseContext } = params;

    const uniqueExisting = this.deduplicateTopics(existingTopics.filter(t => t.trim().length > 0));
    const topicsNeeded = 10 - uniqueExisting.length;

    if (topicsNeeded <= 0) {
      return uniqueExisting.slice(0, 10).map((title, index) => ({
        position: index + 1,
        title,
        role: index === 0 ? 'overview' as const : 'slide' as const
      }));
    }

    // Build enhanced context section if course context is provided
    const courseContextSection = this.buildCourseContextSection(courseContext);
    const contextPrefix = courseContextSection ? `${courseContextSection}\n\n` : '';

    const promptContent = `${contextPrefix}Generate ${topicsNeeded} topic titles for a lesson about "${lessonTitle}".

${uniqueExisting.length > 0 ? `The following topics are already defined (DO NOT include these):\n${uniqueExisting.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\nGenerate ${topicsNeeded} NEW topics to complete the 10-slide lesson.` : `Generate exactly 10 topic titles for a 10-slide presentation:
- Topic 1 should be an overview/introduction to ${lessonTitle}
- Topics 2-10 should cover specific aspects, concepts, or subtopics`}
${courseContext?.targetAudience ? `\nIMPORTANT: The content should be appropriate for ${courseContext.targetAudience} level learners.` : ''}
OUTPUT FORMAT:
Return ONLY a numbered list of ${topicsNeeded} topic titles, one per line.
Each topic should be 3-8 words, clear and specific.
Do NOT include any other text, explanations, or formatting.

Example:
1. Overview of Customer Service Excellence
2. Understanding Customer Expectations
3. Active Listening Techniques
4. Handling Difficult Customers
5. Building Rapport and Trust
6. Communication Best Practices
7. Problem Resolution Strategies
8. Managing Customer Emotions
9. Follow-up and Feedback Loops
10. Continuous Improvement Methods`;

    let systemPrompt = `You are an expert curriculum designer. Generate clear, specific topic titles for presentation slides.

CRITICAL REQUIREMENTS:
1. Return ONLY numbered topic titles, nothing else
2. Each topic should be 3-8 words
3. Topics should flow logically as a lesson progression
4. First topic should be an overview/introduction
5. Subsequent topics should cover specific aspects of the subject
6. Use professional, educational language
7. Make each topic distinct and non-overlapping

🔴 ZERO HALLUCINATION POLICY:
- Use ONLY the provided lesson title and context. Do not add any information not present in the source.
- Every topic must be derivable from the lesson title and context provided.
- If the source doesn't contain enough information, indicate gaps rather than filling with assumptions.`;

    // Enhance system prompt based on context
    if (courseContext?.organizationType === 'business') {
      systemPrompt += '\n8. Use business-appropriate professional terminology';
    } else if (courseContext?.organizationType === 'education') {
      systemPrompt += '\n8. Use academic terminology appropriate for educational settings';
    }

    try {
      const response = await this.callGeminiForText(ai, systemPrompt, promptContent);
      
      const generatedTopics = response
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.match(/^\d+\.\s*/))
        .map(line => line.replace(/^\d+\.\s*/, '').trim())
        .filter(line => line.length > 0);

      const allTopics = [...uniqueExisting, ...generatedTopics].slice(0, 10);

      while (allTopics.length < 10) {
        allTopics.push(`${lessonTitle} - Part ${allTopics.length + 1}`);
      }

      return allTopics.map((title, index) => ({
        position: index + 1,
        title,
        role: index === 0 ? 'overview' as const : 'slide' as const
      }));
    } catch (error: any) {
      console.error("[LessonDescriptionAIService] Error generating topics:", error);
      
      const fallbackTopics = [
        `Overview of ${lessonTitle}`,
        `Key concepts and fundamentals`,
        `Core principles explained`,
        `Practical applications`,
        `Real-world examples`,
        `Best practices and strategies`,
        `Common challenges and solutions`,
        `Advanced techniques`,
        `Implementation strategies`,
        `Summary and next steps`
      ];

      return fallbackTopics.map((title, index) => ({
        position: index + 1,
        title,
        role: index === 0 ? 'overview' as const : 'slide' as const
      }));
    }
  }

  async generateLessonDescription(params: GenerateLessonDescriptionParams): Promise<string> {
    const ai = await this.getAIService();
    const { 
      lessonTitle, 
      topics, 
      mainTopic, 
      subtopic1, 
      subtopic2,
      courseContext,
      learningJourney,
      learningObjectives,
      keyTerms,
      otherLessonsSummaries
    } = params;

    let providedTopicTitles: string[] = [];
    
    if (topics && topics.length > 0) {
      providedTopicTitles = topics
        .sort((a, b) => a.position - b.position)
        .map(t => t.title.trim())
        .filter(t => t.length > 0);
    } else if (mainTopic || subtopic1 || subtopic2) {
      providedTopicTitles = [mainTopic, subtopic1, subtopic2]
        .filter((t): t is string => Boolean(t))
        .map(t => t.trim())
        .filter(t => t.length > 0);
    }

    const uniqueProvidedTopics = this.deduplicateTopics(providedTopicTitles);

    // Build enhanced context sections for the prompt
    const enhancedContext = this.buildEnhancedContextSection({
      courseContext,
      learningJourney,
      learningObjectives,
      keyTerms,
      otherLessonsSummaries
    });

    // Generate content in Gamma's card-based format with --- separators
    let promptContent = `Generate lesson content for a presentation titled '${lessonTitle}'.
${enhancedContext}
The content MUST follow Gamma's card-based format for AI presentation generation:
- Each slide/card has a TITLE on its own line
- Below the title, add 3-5 KEY POINTS (one per line, no bullet markers)
- Separate each slide with "---" on its own line
- Maximum 10 slides total

STRUCTURE EACH SLIDE AS:
Slide Title

Key point or sentence 1
Key point or sentence 2
Key point or sentence 3
---`;

    if (uniqueProvidedTopics.length > 0) {
      promptContent += `\n\nUSE THESE EXACT TOPICS AS SLIDE TITLES (in order):
${uniqueProvidedTopics.map((t, i) => `Slide ${i + 1}: ${t}`).join('\n')}`;
      
      const topicsNeeded = 10 - uniqueProvidedTopics.length;
      if (topicsNeeded > 0) {
        promptContent += `\n\nGenerate ${topicsNeeded} additional slide(s) with relevant topics to complete 10 slides total.`;
      }
    } else {
      promptContent += `\n\nGenerate 10 slides covering the topic '${lessonTitle}':
- Slide 1 should be an overview/introduction
- Slides 2-10 should cover specific aspects, concepts, or subtopics`;
    }

    promptContent += `\n\nEXAMPLE OUTPUT FORMAT:
Overview of Interview Excellence

Master proven strategies for interview success
Understand what employers are looking for
Build confidence through preparation
Create lasting positive impressions
---
Understanding Employer Expectations

Research company culture and values
Identify key skills for the role
Align your experience with job requirements
Prepare relevant examples and stories
---
Research and Preparation Techniques

Study the company website and news
Review the job description thoroughly
Prepare questions for the interviewer
Practice common interview scenarios
---
First Impressions and Professional Presence

Dress appropriately for the company culture
Arrive 10-15 minutes early
Use confident body language
Make eye contact and smile genuinely
---
Answering Behavioral Questions

Use the STAR method for responses
Provide specific examples from experience
Keep answers focused and concise
Highlight your contributions and results
---
Handling Challenging Questions

Stay calm when asked difficult questions
Take a moment to think before responding
Turn weaknesses into growth opportunities
Be honest but strategic in your answers
---
Demonstrating Your Value Proposition

Articulate your unique strengths clearly
Connect your skills to company needs
Quantify achievements where possible
Show enthusiasm for the opportunity
---
Salary Negotiation Basics

Research market rates before interviews
Know your worth and minimum requirements
Let the employer make the first offer
Negotiate professionally and confidently
---
Follow-up and Thank You Best Practices

Send thank you emails within 24 hours
Reference specific conversation points
Reiterate your interest and fit
Keep follow-ups professional and brief
---
Building Long-term Career Success

Learn from every interview experience
Build relationships with interviewers
Continue developing your skills
Stay positive through the job search`;

    let systemPrompt = `You are an expert e-learning content writer creating slide content for Gamma.app AI presentation generator.

CRITICAL FORMAT REQUIREMENTS:
1. Each slide starts with a clear, concise TITLE (3-8 words)
2. Below the title, add a blank line, then 3-5 key points (one sentence per line)
3. Key points should be informative sentences, NOT bullet points with markers
4. Separate each slide with "---" on its own line (with blank lines before and after)
5. Generate exactly 10 slides total
6. Use provided topics EXACTLY as slide titles - do not rephrase them
7. The first slide should be an overview/introduction
8. Content should flow logically as a lesson progression
9. Each key point should be a complete, informative sentence
10. Do NOT add any markdown formatting, bullets, or numbers to key points

This format is REQUIRED for Gamma.app to properly parse and generate the presentation.

🔴 ZERO HALLUCINATION POLICY - MANDATORY COMPLIANCE:
- Use ONLY the provided source text. Do not add any information not present in the source.
- Every statement must be traceable to the source document.
- If the source doesn't contain enough information, indicate gaps rather than filling with assumptions.
- DO NOT use external knowledge, facts, or information not explicitly stated in the source material.
- When possible, use exact phrasing from the source document to maintain accuracy.`;

    // Enhance system prompt based on provided context
    if (courseContext || learningJourney || learningObjectives || keyTerms) {
      systemPrompt += `\n\nCONTEXTUAL CONTENT REQUIREMENTS:`;
      
      if (courseContext?.targetAudience) {
        const audienceGuidance: Record<string, string> = {
          'beginner': 'Use simple language, define all terms, avoid jargon, and provide foundational explanations.',
          'intermediate': 'Assume basic knowledge, introduce more specialized terminology, and build on common concepts.',
          'advanced': 'Use technical language confidently, focus on nuanced details and advanced applications.'
        };
        systemPrompt += `\n- TARGET AUDIENCE: ${audienceGuidance[courseContext.targetAudience] || ''}`;
      }
      
      if (learningJourney?.isOverview) {
        systemPrompt += `\n- OVERVIEW LESSON: This is an introductory lesson. Focus on establishing the course scope, previewing what learners will achieve, and building excitement for the content ahead.`;
      } else if (learningJourney?.previousTopic) {
        systemPrompt += `\n- SEQUENTIAL LESSON: Build upon concepts from "${learningJourney.previousTopic.name}". Reference established ideas where relevant and connect to the broader learning journey.`;
      }
      
      if (learningObjectives && learningObjectives.length > 0) {
        systemPrompt += `\n- LEARNING OBJECTIVES: The content MUST address the specified learning objectives. Ensure each objective can be achieved through the lesson content.`;
      }
      
      if (keyTerms && keyTerms.length > 0) {
        systemPrompt += `\n- KEY TERMS: Naturally introduce and explain the specified key terms within the lesson content.`;
      }
    }

    try {
      const description = await this.callGeminiForText(ai, systemPrompt, promptContent);
      const validatedDescription = this.validateAndFixGammaFormat(description, uniqueProvidedTopics, lessonTitle);
      return validatedDescription;
    } catch (error: any) {
      console.error("[LessonDescriptionAIService] Error generating description:", error);
      
      if (error.message?.includes('quota') || error.message?.includes('429') || error.status === 429) {
        throw new Error("AI service quota exceeded. Please try again later or contact support.");
      }
      
      if (error.message?.includes('API key') || error.message?.includes('401') || error.status === 401) {
        throw new Error("AI service authentication failed. Please check the AI configuration.");
      }
      
      throw error;
    }
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

export const lessonDescriptionAIService = new LessonDescriptionAIService();
