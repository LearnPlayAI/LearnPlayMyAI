import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocation, Link } from 'wouter';
import { ArrowLeft, Sparkles, Plus, X, Upload, Loader2, CheckCircle, Edit2, Check, Image as ImageIcon, Trash2, Lightbulb, ThumbsUp, RefreshCw, BookOpen, AlertCircle, ChevronDown, Info, Globe, Lock, Building2, FileText } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { ObjectUploader } from '@/components/ObjectUploader';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface EnhancedTopic {
  id: string;
  order: number;
  name: string;
  description?: string;
  isOverview?: boolean;
  userEditedName?: boolean;
  userEditedDescription?: boolean;
  lessonId: string | null;
}

export default function CourseFrameworkWizard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { organizationType, courseVisibilityEnabled } = useAuth();

  // Determine default visibility based on org type
  // E-learning orgs can choose, education/business default to org_only
  const isElearningOrg = organizationType === 'elearning';
  const defaultVisibility: 'public' | 'org_only' = isElearningOrg ? 'public' : 'org_only';

  // Fetch user preferences for default currency
  const { data: userPreferences, isLoading: preferencesLoading } = useQuery<{ timezone?: string; preferredCurrency?: string }>({
    queryKey: ['/api/user/preferences'],
  });

  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [difficultyLevel, setDifficultyLevel] = useState('');
  const [language, setLanguage] = useState('en');

  const { data: languages } = useQuery<{ code: string; name: string; nativeName: string }[]>({
    queryKey: ['/api/languages'],
  });
  const [currency, setCurrency] = useState('');
  const [currencyInitialized, setCurrencyInitialized] = useState(false);
  const [price, setPrice] = useState('');
  
  // Set default currency from user preferences when loaded (wait for query to finish)
  useEffect(() => {
    // Only initialize once, after preferences query has settled
    if (!currencyInitialized && !preferencesLoading) {
      const defaultCurrency = userPreferences?.preferredCurrency || 'ZAR';
      setCurrency(defaultCurrency);
      setCurrencyInitialized(true);
    }
  }, [userPreferences, preferencesLoading, currencyInitialized]);
  
  const [isPaid, setIsPaid] = useState(true);
  const [visibility, setVisibility] = useState<'public' | 'org_only'>(defaultVisibility);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [thumbnailPreview, setThumbnailPreview] = useState('');
  const [thumbnailTempCourseId, setThumbnailTempCourseId] = useState('');
  
  // Temporary storage for upload metadata (needed because Uppy doesn't pass meta through)
  const pendingUploadMeta = useRef<{ objectPath: string; tempCourseId: string } | null>(null);
  
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [generatingTopics, setGeneratingTopics] = useState(false);
  const [topics, setTopics] = useState<EnhancedTopic[]>([]);
  const [manualTopic, setManualTopic] = useState('');
  const [manualTopicDescription, setManualTopicDescription] = useState('');
  const [editingTopicIndex, setEditingTopicIndex] = useState<number | null>(null);
  const [editingTopicValue, setEditingTopicValue] = useState('');
  const [editingDescriptionIndex, setEditingDescriptionIndex] = useState<number | null>(null);
  const [editingDescriptionValue, setEditingDescriptionValue] = useState('');
  const [regeneratingDescriptionIndex, setRegeneratingDescriptionIndex] = useState<number | null>(null);
  const [regeneratingAllDescriptions, setRegeneratingAllDescriptions] = useState(false);
  const [showDescriptionChangedWarning, setShowDescriptionChangedWarning] = useState(false);
  const [previousDescription, setPreviousDescription] = useState('');
  
  // AI Category Suggestion State
  const [suggestedCategory, setSuggestedCategory] = useState<{category: string; confidence: number} | null>(null);
  const [generatingCategorySuggestion, setGeneratingCategorySuggestion] = useState(false);

  const createCourseMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          category,
          difficultyLevel,
          currency,
          price: isPaid ? price : '0',
          visibility,
          thumbnailUrl,
          thumbnailTempCourseId,
          topics: topics,
          defaultLanguage: language,
        }),
      });
    },
    onSuccess: (course: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/courses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses/counts'] });
      toast({
        title: 'Course Created!',
        description: 'Now add lessons to your course.',
      });
      setLocation(`/course-builder/${course.id}/lessons`);
    },
    onError: (error) => {
      toast({
        title: 'Error Creating Course',
        description: (error as Error).message,
        variant: 'destructive',
      });
    },
  });

  // Handle thumbnail upload - request signed URL and object path from backend
  const handleThumbnailUpload = async () => {
    try {
      // Request upload URL and object path from backend
      // Backend generates temp courseId server-side for security
      const response = await apiRequest('/api/uploads/course-thumbnail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }) as unknown as {method: 'PUT'; url: string; objectPath: string; tempCourseId: string};

      console.log('[Thumbnail Upload] Got upload parameters:', response);

      // Store objectPath and tempCourseId in ref for retrieval after upload
      // (Uppy doesn't pass custom meta through to the complete handler)
      pendingUploadMeta.current = {
        objectPath: response.objectPath,
        tempCourseId: response.tempCourseId,
      };

      // Return parameters in Uppy-compatible format
      return {
        method: response.method,
        url: response.url,
      };
    } catch (error) {
      console.error('Error getting upload URL:', error);
      toast({
        title: 'Upload Error',
        description: 'Failed to prepare thumbnail upload',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleUploadComplete = (result: any) => {
    if (result.successful && result.successful.length > 0) {
      const uploadedFile = result.successful[0];
      console.log('[Thumbnail Upload] Upload complete:', uploadedFile);
      
      // Retrieve the canonical object path and tempCourseId from ref
      const uploadMeta = pendingUploadMeta.current;
      
      if (!uploadMeta || !uploadMeta.objectPath || !uploadMeta.tempCourseId) {
        console.error('[Thumbnail Upload] Missing objectPath or tempCourseId in pending upload meta');
        toast({
          title: 'Upload Error',
          description: 'Failed to retrieve upload metadata',
          variant: 'destructive',
        });
        return;
      }
      
      // Store the stable object path and temp course ID
      setThumbnailUrl(uploadMeta.objectPath);
      setThumbnailTempCourseId(uploadMeta.tempCourseId);
      // Use Uppy's blob preview URL for displaying the thumbnail (local preview before server fetch)
      setThumbnailPreview(uploadedFile.preview || '');
      
      console.log('[Thumbnail Upload] Stored objectPath:', uploadMeta.objectPath, 'tempCourseId:', uploadMeta.tempCourseId, 'preview:', uploadedFile.preview);
      
      // Clear the pending meta
      pendingUploadMeta.current = null;
      
      toast({
        title: 'Thumbnail Uploaded!',
        description: 'Course thumbnail has been uploaded successfully.',
      });
    }
  };

  const removeThumbnail = () => {
    setThumbnailUrl('');
    setThumbnailPreview('');
    setThumbnailTempCourseId('');
  };

  // Track description changes to show regeneration prompt
  useEffect(() => {
    if (step === 3 && topics.length > 0 && description !== previousDescription && previousDescription !== '') {
      setShowDescriptionChangedWarning(true);
    }
  }, [step, description, previousDescription, topics.length]);

  // Store description when entering Step 3
  useEffect(() => {
    if (step === 3 && previousDescription === '' && description) {
      setPreviousDescription(description);
    }
  }, [step, description, previousDescription]);

  // AI function for category suggestion using keyword matching with title priority
  const suggestCourseCategory = async (courseTitle: string, courseDescription: string, excludedCategories: string[] = []): Promise<{category: string; confidence: number}> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const titleLower = courseTitle.toLowerCase();
    const descLower = courseDescription.toLowerCase();
    
    // Category mapping with keywords - using exact values from Select options
    // Keywords are ordered by specificity (more specific = checked first for higher score)
    const categoryKeywords: Record<string, string[]> = {
      'ai-machine-learning': ['artificial intelligence', 'machine learning', 'deep learning', 'neural network', 'ai ', ' ai', 'ml ', ' ml', 'chatgpt', 'gpt', 'llm'],
      'data-science': ['data science', 'data analytics', 'data analysis', 'big data', 'statistics', 'data visualization'],
      'web-development': ['web development', 'frontend', 'backend', 'full stack', 'fullstack', 'html', 'css', 'javascript', 'react', 'node', 'website'],
      'mobile-development': ['mobile development', 'mobile app', 'ios development', 'android development', 'flutter', 'react native', 'swift', 'kotlin'],
      'programming': ['programming', 'coding', 'software development', 'developer', 'code', 'algorithm'],
      'cybersecurity': ['cybersecurity', 'security', 'hacking', 'penetration testing', 'encryption', 'network security'],
      'cloud-computing': ['cloud computing', 'aws', 'azure', 'google cloud', 'devops', 'docker', 'kubernetes', 'serverless'],
      'game-development': ['game development', 'game design', 'unity', 'unreal engine', 'game programming', 'gaming'],
      
      'business': ['business management', 'business strategy', 'commerce', 'corporate', 'mba'],
      'entrepreneurship': ['entrepreneur', 'startup', 'venture', 'business owner', 'founder'],
      'marketing': ['marketing', 'digital marketing', 'seo', 'social media marketing', 'advertising', 'branding', 'content marketing'],
      'finance': ['finance', 'accounting', 'financial', 'investment', 'banking', 'budgeting', 'trading'],
      'project-management': ['project management', 'agile', 'scrum', 'pmp', 'kanban'],
      'leadership': ['leadership', 'strategy', 'executive', 'team management', 'organizational'],
      
      'design': ['graphic design', 'visual design', 'adobe', 'illustrator', 'photoshop', 'creative design'],
      'ui-ux': ['ui design', 'ux design', 'user interface', 'user experience', 'figma', 'product design', 'ui/ux'],
      'video-production': ['video production', 'video editing', 'premiere', 'final cut', 'videography', 'filmmaking'],
      'photography': ['photography', 'camera', 'photo editing', 'lightroom', 'photographer'],
      'music': ['music production', 'guitar', 'piano', 'audio production', 'sound design', 'music theory'],
      'creative-writing': ['creative writing', 'author', 'storytelling', 'novel writing', 'screenwriting'],
      
      'science': ['science', 'engineering', 'research', 'scientific'],
      'mathematics': ['mathematics', 'math', 'calculus', 'algebra', 'geometry', 'linear algebra'],
      'physics': ['physics', 'mechanics', 'quantum', 'thermodynamics'],
      'chemistry': ['chemistry', 'chemical', 'organic chemistry', 'biochemistry'],
      'biology': ['biology', 'life science', 'genetics', 'ecology', 'molecular'],
      
      'health': ['health', 'wellness', 'healthcare', 'healthy'],
      'fitness': ['fitness', 'exercise', 'workout', 'gym', 'training', 'strength'],
      'nutrition': ['nutrition', 'diet', 'dietitian', 'healthy eating', 'meal planning'],
      'mental-health': ['mental health', 'mindfulness', 'meditation', 'psychology', 'therapy', 'stress management'],
      'medical': ['medical', 'medicine', 'clinical', 'nursing', 'healthcare professional'],
      
      'language': ['language learning', 'linguistics', 'polyglot'],
      'english': ['english language', 'esl', 'english writing', 'english grammar'],
      'spanish': ['spanish language', 'spanish'],
      'mandarin': ['mandarin', 'chinese language'],
      'french': ['french language', 'french'],
      
      'personal-development': ['personal development', 'self improvement', 'self-help', 'growth mindset'],
      'productivity': ['productivity', 'time management', 'efficiency', 'getting things done'],
      'communication': ['communication skills', 'public speaking', 'presentation skills', 'negotiation'],
      'career-development': ['career development', 'job search', 'resume', 'interview skills', 'career change'],
      
      'lifestyle': ['lifestyle', 'hobbies', 'life skills'],
      'cooking': ['cooking', 'culinary', 'chef', 'recipe', 'baking', 'cuisine'],
      'gardening': ['gardening', 'agriculture', 'plants', 'farming', 'horticulture'],
      'travel': ['travel', 'tourism', 'vacation', 'traveling'],
      
      'test-prep': ['test prep', 'exam preparation', 'sat', 'gmat', 'gre', 'certification exam'],
      'academic': ['academic', 'study skills', 'student', 'school', 'university'],
      'certifications': ['certification', 'certificate', 'professional development'],
      
      'kids-teens': ['kids', 'children', 'teens', 'youth', 'young learners'],
      'parenting': ['parenting', 'parent', 'family', 'child development'],
    };
    
    // Find best match, with TITLE keywords weighted 3x more than description
    const allMatches: Array<{ category: string; confidence: number; titleScore: number; descScore: number }> = [];
    
    for (const [categoryKey, keywords] of Object.entries(categoryKeywords)) {
      let titleMatches = 0;
      let descMatches = 0;
      
      for (const keyword of keywords) {
        // Check title (3x weight)
        if (titleLower.includes(keyword)) {
          titleMatches++;
        }
        // Check description (1x weight) - but avoid false positives from short words
        if (keyword.length >= 3 && descLower.includes(keyword)) {
          descMatches++;
        }
      }
      
      // Calculate weighted score: title matches worth 3x description matches
      const weightedScore = (titleMatches * 3) + descMatches;
      
      if (weightedScore > 0) {
        // Base confidence starts at 0.55 (higher than "other" default)
        // Add 0.1 for each weighted point, cap at 0.95
        const confidence = Math.min(0.95, 0.55 + (weightedScore * 0.1));
        allMatches.push({ 
          category: categoryKey, 
          confidence,
          titleScore: titleMatches,
          descScore: descMatches
        });
      }
    }
    
    // Sort by confidence descending (which reflects the weighted score)
    allMatches.sort((a, b) => b.confidence - a.confidence);
    
    // Find the best match that's not in the excluded list
    let bestMatch = { category: 'other', confidence: 0.3 };
    for (const match of allMatches) {
      if (!excludedCategories.includes(match.category)) {
        bestMatch = { category: match.category, confidence: match.confidence };
        console.log(`[Category Suggestion] Best match: ${match.category} (title: ${match.titleScore}, desc: ${match.descScore})`);
        break;
      }
    }
    
    return bestMatch;
  };

  const generateAIDescription = async () => {
    if (!title.trim()) {
      toast({
        title: 'Title Required',
        description: 'Please enter a course title first to generate a description.',
        variant: 'destructive',
      });
      return;
    }

    if (!difficultyLevel) {
      toast({
        title: 'Difficulty Level Required',
        description: 'Please select a difficulty level first so AI can tailor the description.',
        variant: 'destructive',
      });
      return;
    }

    if (generatingDescription) return; // Prevent double-submit

    setGeneratingDescription(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Generate difficulty-appropriate descriptions
    const difficultyDescriptions: Record<string, { intro: string; audience: string; outcomes: string }> = {
      beginner: {
        intro: 'This beginner-friendly course provides a comprehensive introduction',
        audience: 'Perfect for complete beginners with no prior experience',
        outcomes: 'foundational knowledge and practical skills to start your journey'
      },
      intermediate: {
        intro: 'This intermediate-level course builds upon foundational knowledge',
        audience: 'Designed for those with basic understanding who want to deepen their expertise',
        outcomes: 'advanced skills and techniques to take your abilities to the next level'
      },
      advanced: {
        intro: 'This advanced course offers in-depth exploration of complex topics',
        audience: 'Created for experienced practitioners seeking mastery',
        outcomes: 'expert-level capabilities and cutting-edge techniques for professional applications'
      }
    };
    
    const level = difficultyDescriptions[difficultyLevel] || difficultyDescriptions.beginner;
    
    const mockDescription = `${level.intro} to ${title}. Through hands-on projects and real-world examples, you'll gain ${level.outcomes}. ${level.audience}, this course covers essential concepts and practical applications. By the end, you'll have the confidence and skills to apply what you've learned in your own projects.`;
    
    setDescription(mockDescription);
    setGeneratingDescription(false);
    toast({
      title: 'Description Generated!',
      description: 'AI has created a course description. Feel free to edit it.',
    });

    // Automatically suggest category after generating description
    suggestCategory(title, mockDescription);
  };

  // Track previously suggested categories to force different results
  const [previousSuggestions, setPreviousSuggestions] = useState<string[]>([]);
  
  const suggestCategory = async (courseTitle: string = title, courseDescription: string = description, forceNew: boolean = false) => {
    if (!courseTitle.trim() || !courseDescription.trim()) {
      return;
    }

    setGeneratingCategorySuggestion(true);
    
    try {
      const suggestion = await suggestCourseCategory(courseTitle, courseDescription, forceNew ? [...previousSuggestions, suggestedCategory?.category || ''] : []);
      
      // Only suggest if confidence is reasonable and different from current selection
      if (suggestion.confidence > 0.4 && suggestion.category !== category) {
        setSuggestedCategory(suggestion);
        // Track this suggestion to avoid repeating it
        if (forceNew) {
          setPreviousSuggestions(prev => [...prev, suggestion.category]);
        }
      } else if (forceNew) {
        // If forcing new and we can't find a better match, show a message
        toast({
          title: 'No Better Match Found',
          description: 'AI could not find a more suitable category. Try manually selecting one.',
        });
      }
    } catch (error) {
      console.error('Category suggestion failed:', error);
    } finally {
      setGeneratingCategorySuggestion(false);
    }
  };

  const applySuggestedCategory = () => {
    if (suggestedCategory) {
      setCategory(suggestedCategory.category);
      setSuggestedCategory(null);
      toast({
        title: 'Category Applied',
        description: 'AI-suggested category has been applied.',
      });
    }
  };

  const dismissSuggestedCategory = () => {
    setSuggestedCategory(null);
  };

  const generateAITopics = async () => {
    if (!title || !description || !difficultyLevel) {
      toast({
        title: 'Missing Information',
        description: 'Please complete Step 1 (title, description, and difficulty level) before generating topics.',
        variant: 'destructive',
      });
      return;
    }

    if (generatingTopics) return;

    setGeneratingTopics(true);
    
    try {
      const response = await apiRequest('/api/course-builder/generate-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseTitle: title,
          courseDescription: description,
          difficultyLevel,
          category: category || 'general',
          numberOfTopics: 8,
        }),
      }) as { topics: EnhancedTopic[] };

      setTopics(response.topics);
      setPreviousDescription(description);
      setShowDescriptionChangedWarning(false);
      
      toast({
        title: 'Topics Generated!',
        description: `AI has generated ${response.topics.length} topics with descriptions. The first topic is your course overview. Review and customize as needed.`,
      });
    } catch (error) {
      toast({
        title: 'Error Generating Topics',
        description: (error as Error).message || 'Failed to generate topics. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setGeneratingTopics(false);
    }
  };

  const regenerateSingleDescription = async (topicIndex: number) => {
    if (regeneratingDescriptionIndex !== null) return;
    
    setRegeneratingDescriptionIndex(topicIndex);
    
    try {
      const topic = topics[topicIndex];
      const response = await apiRequest('/api/course-builder/topics/regenerate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseTitle: title,
          courseDescription: description,
          difficultyLevel,
          topic,
          siblingTopics: topics,
        }),
      }) as { description: string };

      const updatedTopics = [...topics];
      updatedTopics[topicIndex] = {
        ...updatedTopics[topicIndex],
        description: response.description,
        userEditedDescription: false,
      };
      setTopics(updatedTopics);
      
      toast({
        title: 'Description Regenerated',
        description: `Updated description for "${topic.name}"`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: (error as Error).message || 'Failed to regenerate description',
        variant: 'destructive',
      });
    } finally {
      setRegeneratingDescriptionIndex(null);
    }
  };

  const regenerateAllDescriptions = async () => {
    if (regeneratingAllDescriptions) return;
    
    setRegeneratingAllDescriptions(true);
    
    try {
      const response = await apiRequest('/api/course-builder/topics/regenerate-all-descriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseTitle: title,
          courseDescription: description,
          difficultyLevel,
          topics,
        }),
      }) as { descriptions: Record<string, string> };

      const updatedTopics = topics.map(topic => {
        const newDescription = response.descriptions[topic.name];
        if (newDescription) {
          return {
            ...topic,
            description: newDescription,
            userEditedDescription: false,
          };
        }
        return topic;
      });
      
      setTopics(updatedTopics);
      setShowDescriptionChangedWarning(false);
      setPreviousDescription(description);
      
      toast({
        title: 'All Descriptions Regenerated',
        description: 'Topic descriptions have been updated based on your course content.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: (error as Error).message || 'Failed to regenerate descriptions',
        variant: 'destructive',
      });
    } finally {
      setRegeneratingAllDescriptions(false);
    }
  };

  const addManualTopic = () => {
    if (manualTopic.trim()) {
      const newTopic: EnhancedTopic = {
        id: crypto.randomUUID(),
        order: topics.length,
        name: manualTopic.trim(),
        description: manualTopicDescription.trim() || undefined,
        isOverview: topics.length === 0,
        userEditedName: true,
        userEditedDescription: !!manualTopicDescription.trim(),
        lessonId: null,
      };
      setTopics([...topics, newTopic]);
      setManualTopic('');
      setManualTopicDescription('');
    }
  };

  const removeTopic = (index: number) => {
    setTopics(topics.filter((_, i) => i !== index));
  };

  const startEditingTopic = (index: number) => {
    setEditingTopicIndex(index);
    setEditingTopicValue(topics[index].name);
  };

  const saveTopicEdit = () => {
    if (editingTopicIndex !== null && editingTopicValue.trim()) {
      const updatedTopics = [...topics];
      updatedTopics[editingTopicIndex] = {
        ...updatedTopics[editingTopicIndex],
        name: editingTopicValue.trim(),
        userEditedName: true,
      };
      setTopics(updatedTopics);
      setEditingTopicIndex(null);
      setEditingTopicValue('');
    }
  };

  const cancelTopicEdit = () => {
    setEditingTopicIndex(null);
    setEditingTopicValue('');
  };

  const startEditingDescription = (index: number) => {
    setEditingDescriptionIndex(index);
    setEditingDescriptionValue(topics[index].description || '');
  };

  const saveDescriptionEdit = () => {
    if (editingDescriptionIndex !== null) {
      const updatedTopics = [...topics];
      updatedTopics[editingDescriptionIndex] = {
        ...updatedTopics[editingDescriptionIndex],
        description: editingDescriptionValue.trim() || undefined,
        userEditedDescription: true,
      };
      setTopics(updatedTopics);
      setEditingDescriptionIndex(null);
      setEditingDescriptionValue('');
    }
  };

  const cancelDescriptionEdit = () => {
    setEditingDescriptionIndex(null);
    setEditingDescriptionValue('');
  };

  const reorderTopics = () => {
    const updatedTopics = topics.map((topic, index) => ({
      ...topic,
      order: index,
      isOverview: index === 0,
    }));
    setTopics(updatedTopics);
  };

  const canProceedStep1 = title && description && category && difficultyLevel;
  const canProceedStep2 = currency && (!isPaid || price);
  const canProceedStep3 = topics.length > 0;

  return (
    <QuizAdminLayout
      title="Create New Course"
      description={`Step ${step} of 3: ${step === 1 ? 'Course Details' : step === 2 ? 'Pricing' : 'Course Topics'}`}
      activeSection="lessons"
    >
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link href="/course-builder">
          <Button variant="ghost" className="mb-6" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Courses
          </Button>
        </Link>

        <div className="mb-8">
          <div className="flex items-center justify-between">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold border-2 ${
                    step >= s
                      ? 'bg-primary text-primary-foreground border-primary/80'
                      : 'bg-muted/50 text-muted-foreground border-border'
                  }`}
                >
                  {step > s ? <CheckCircle className="h-5 w-5" /> : s}
                </div>
                {s < 3 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${
                      step > s ? 'bg-primary' : 'bg-muted/50'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <Card className="border-border bg-primary/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-sm">Have existing documents?</p>
                      <p className="text-xs text-muted-foreground">
                        Upload Word or PowerPoint files and let AI create your course structure
                      </p>
                    </div>
                  </div>
                  <Link href="/course-builder/from-documents">
                    <Button variant="outline" size="sm" data-testid="upload-documents-link">
                      <Upload className="mr-2 h-4 w-4" />
                      Upload Documents
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card>
            <CardHeader>
              <CardTitle>Course Details</CardTitle>
              <CardDescription>Basic information about your course</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Course Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Complete Web Development Bootcamp"
                  data-testid="input-title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="difficulty">Difficulty Level *</Label>
                <Select value={difficultyLevel} onValueChange={setDifficultyLevel}>
                  <SelectTrigger id="difficulty" data-testid="select-difficulty">
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Tip: Select difficulty level first so AI can tailor the description accordingly
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="description">Description *</Label>
                  <Button type="button" variant="outline" size="sm" onClick={generateAIDescription} disabled={generatingDescription || !title.trim() || !difficultyLevel} data-testid="button-generate-description" >
                    {generatingDescription ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3 w-3 mr-1" />
                        Generate with AI
                      </>
                    )}
                  </Button>
                </div>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what students will learn..."
                  rows={4}
                  data-testid="input-description"
                />
                <p className="text-xs text-muted-foreground">
                  {!difficultyLevel ? 'Select a difficulty level above to enable AI generation' : 'Use the AI generator to create a description tailored to your course title and difficulty level'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger id="category" data-testid="select-category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="programming">Programming & Development</SelectItem>
                      <SelectItem value="web-development">Web Development</SelectItem>
                      <SelectItem value="mobile-development">Mobile Development</SelectItem>
                      <SelectItem value="data-science">Data Science & Analytics</SelectItem>
                      <SelectItem value="ai-machine-learning">AI & Machine Learning</SelectItem>
                      <SelectItem value="cybersecurity">Cybersecurity</SelectItem>
                      <SelectItem value="cloud-computing">Cloud Computing & DevOps</SelectItem>
                      <SelectItem value="game-development">Game Development</SelectItem>
                      
                      <SelectItem value="business">Business & Management</SelectItem>
                      <SelectItem value="entrepreneurship">Entrepreneurship</SelectItem>
                      <SelectItem value="marketing">Marketing & Sales</SelectItem>
                      <SelectItem value="finance">Finance & Accounting</SelectItem>
                      <SelectItem value="project-management">Project Management</SelectItem>
                      <SelectItem value="leadership">Leadership & Strategy</SelectItem>
                      
                      <SelectItem value="design">Graphic Design</SelectItem>
                      <SelectItem value="ui-ux">UI/UX Design</SelectItem>
                      <SelectItem value="video-production">Video Production & Editing</SelectItem>
                      <SelectItem value="photography">Photography</SelectItem>
                      <SelectItem value="music">Music & Audio Production</SelectItem>
                      <SelectItem value="creative-writing">Creative Writing</SelectItem>
                      
                      <SelectItem value="science">Science & Engineering</SelectItem>
                      <SelectItem value="mathematics">Mathematics & Statistics</SelectItem>
                      <SelectItem value="physics">Physics</SelectItem>
                      <SelectItem value="chemistry">Chemistry</SelectItem>
                      <SelectItem value="biology">Biology & Life Sciences</SelectItem>
                      
                      <SelectItem value="health">Health & Wellness</SelectItem>
                      <SelectItem value="fitness">Fitness & Exercise</SelectItem>
                      <SelectItem value="nutrition">Nutrition & Diet</SelectItem>
                      <SelectItem value="mental-health">Mental Health & Mindfulness</SelectItem>
                      <SelectItem value="medical">Medical & Healthcare</SelectItem>
                      
                      <SelectItem value="language">Language Learning</SelectItem>
                      <SelectItem value="english">English Language</SelectItem>
                      <SelectItem value="spanish">Spanish Language</SelectItem>
                      <SelectItem value="mandarin">Mandarin Chinese</SelectItem>
                      <SelectItem value="french">French Language</SelectItem>
                      
                      <SelectItem value="personal-development">Personal Development</SelectItem>
                      <SelectItem value="productivity">Productivity & Time Management</SelectItem>
                      <SelectItem value="communication">Communication Skills</SelectItem>
                      <SelectItem value="career-development">Career Development</SelectItem>
                      
                      <SelectItem value="lifestyle">Lifestyle & Hobbies</SelectItem>
                      <SelectItem value="cooking">Cooking & Culinary Arts</SelectItem>
                      <SelectItem value="gardening">Gardening & Agriculture</SelectItem>
                      <SelectItem value="travel">Travel & Tourism</SelectItem>
                      
                      <SelectItem value="test-prep">Test Preparation</SelectItem>
                      <SelectItem value="academic">Academic Skills & Study Methods</SelectItem>
                      <SelectItem value="certifications">Professional Certifications</SelectItem>
                      
                      <SelectItem value="kids-teens">Kids & Teens Education</SelectItem>
                      <SelectItem value="parenting">Parenting & Family</SelectItem>
                      
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {/* AI Category Suggestion */}
                  {suggestedCategory && (
                    <div className="mt-2 p-3 bg-primary/10 border border-primary/20 rounded-lg space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1">
                          <Lightbulb className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-primary/90 font-medium">AI Suggestion</p>
                            <p className="text-xs text-primary/70 mt-1">
                              Based on your course content, we suggest:
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline" >
                                {suggestedCategory.category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                              </Badge>
                              <span className="text-xs text-primary">
                                {Math.round(suggestedCategory.confidence * 100)}% confidence
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={dismissSuggestedCategory} className="h-6 w-6 p-0" data-testid="button-dismiss-category-suggestion" >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button size="sm" variant="outline" onClick={applySuggestedCategory} data-testid="button-apply-category-suggestion" >
                          <ThumbsUp className="h-3 w-3 mr-2" />
                          Apply
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => suggestCategory(title, description, true)}
                          className="bg-primary/10 hover:bg-primary/20 border-primary/30 text-primary/80"
                          data-testid="button-rerun-category-suggestion"
                          disabled={generatingCategorySuggestion}
                        >
                          <Sparkles className="h-3 w-3 mr-2" />
                          Get New
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {/* Manual Category Suggestion Trigger - Always available when title and description exist */}
                  {title && description && !generatingCategorySuggestion && !suggestedCategory && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => suggestCategory()}
                      className="mt-2 w-full text-xs text-primary/70 hover:text-primary/90 hover:bg-primary/20"
                      data-testid="button-suggest-category"
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      {category ? 'Get New AI Category Suggestion' : 'Suggest Category with AI'}
                    </Button>
                  )}
                  
                  {generatingCategorySuggestion && (
                    <div className="mt-2 p-2 bg-primary/10 border border-primary/20 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-3 w-3 text-primary animate-spin" />
                        <span className="text-xs text-primary/70">Analyzing course content...</span>
                      </div>
                    </div>
                  )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="language" className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  Course Language
                </Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger id="language">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    {languages?.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.nativeName} ({lang.name})
                      </SelectItem>
                    )) || (
                      <SelectItem value="en">English</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">The language your course content will be in</p>
              </div>

              <div className="space-y-2">
                <Label>Course Thumbnail (Optional)</Label>
                {thumbnailPreview ? (
                  <div className="space-y-2">
                    <div className="relative w-full h-48 bg-muted rounded-lg overflow-hidden">
                      <img
                        src={thumbnailPreview}
                        alt="Course thumbnail preview"
                        className="w-full h-full object-cover"
                      />
                      <Button variant="destructive" size="sm" className="absolute top-2 right-2" onClick={removeThumbnail} data-testid="button-remove-thumbnail" >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Thumbnail uploaded successfully</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <ObjectUploader
                      maxNumberOfFiles={1}
                      maxFileSize={5 * 1024 * 1024}
                      onGetUploadParameters={handleThumbnailUpload}
                      onComplete={handleUploadComplete}
                      buttonClassName="w-full"
                      autoProceed={true}
                      resizeWidth={1280}
                      resizeHeight={720}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Thumbnail
                    </ObjectUploader>
                    <p className="text-xs text-muted-foreground">
                      Recommended: 1280x720px, max 5MB
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button onClick={() => setStep(2)}
                disabled={!canProceedStep1}
                data-testid="button-next-step1"
              >
                Next: Pricing
              </Button>
            </CardFooter>
          </Card>
          </div>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
              <CardDescription>Set your course pricing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Course Type</Label>
                <div className="flex gap-4">
                  <Button variant={isPaid ? 'default' : 'outline'} onClick={() => setIsPaid(true)}
                    className="flex-1"
                    data-testid="button-paid"
                  >
                    Paid Course
                  </Button>
                  <Button variant={!isPaid ? 'default' : 'outline'} onClick={() => setIsPaid(false)}
                    className="flex-1"
                    data-testid="button-free"
                  >
                    Free Course
                  </Button>
                </div>
              </div>

              {isPaid && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="currency">Currency *</Label>
                      <Select value={currency} onValueChange={setCurrency}>
                        <SelectTrigger id="currency" data-testid="select-currency">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="ZAR">ZAR</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="price">Price *</Label>
                      <Input
                        id="price"
                        type="number"
                        step="0.01"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder="99.99"
                        data-testid="input-price"
                      />
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    Platform commission: 30% (configurable by SuperAdmin)
                  </p>
                </>
              )}

              {courseVisibilityEnabled && (
                <div className="space-y-3 pt-4 border-t">
                  <Label>Course Visibility</Label>
                  {isElearningOrg ? (
                    <div className="flex gap-4">
                      <Button variant={visibility === 'public' ? 'default' : 'outline'} onClick={() => setVisibility('public')}
                        className="flex-1"
                        data-testid="button-visibility-public"
                      >
                        <Globe className="h-4 w-4 mr-2" />
                        Public Marketplace
                      </Button>
                      <Button variant={visibility === 'org_only' ? 'default' : 'outline'} onClick={() => setVisibility('org_only')}
                        className="flex-1"
                        data-testid="button-visibility-org-only"
                      >
                        <Lock className="h-4 w-4 mr-2" />
                        Organization Only
                      </Button>
                    </div>
                  ) : (
                    <div className="p-4 bg-muted/50 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-secondary/10 rounded-lg">
                          <Building2 className="h-5 w-5 text-secondary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">Organization Only</p>
                          <p className="text-xs text-muted-foreground">
                            This course will only be accessible to members of your organization
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {visibility === 'public' 
                      ? 'Anyone can discover and purchase this course in the marketplace.' 
                      : 'Only members of your organization can access this course.'}
                  </p>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)} data-testid="button-back-step2">
                Back
              </Button>
              <Button onClick={() => setStep(3)}
                disabled={!canProceedStep2}
                data-testid="button-next-step2"
              >
                Next: Topics
              </Button>
            </CardFooter>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Course Topics
              </CardTitle>
              <CardDescription>
                Generate topics with AI or add them manually. Each topic includes a description that learners will see.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert >
                <Info className="h-4 w-4 text-primary" />
                <AlertDescription className="text-sm text-primary/80">
                  <strong>Tip:</strong> The first topic will be your course overview. Use the AI generator to create topics based on your course description, then customize each topic and its description to make your course unique.
                </AlertDescription>
              </Alert>

              {showDescriptionChangedWarning && topics.length > 0 && (
                <Alert >
                  <AlertCircle className="h-4 w-4 text-warning" />
                  <AlertDescription className="text-sm text-warning">
                    Your course description has changed. Would you like to regenerate topics to match the updated content?
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" onClick={generateAITopics} disabled={generatingTopics} >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Regenerate All Topics
                      </Button>
                      <Button size="sm" variant="ghost" onClick={regenerateAllDescriptions} disabled={regeneratingAllDescriptions} >
                        Update Descriptions Only
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => {
                          setShowDescriptionChangedWarning(false);
                          setPreviousDescription(description);
                        }}
                        className="text-warning hover:text-warning"
                      >
                        Dismiss
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">AI Topic Generator</h3>
                  </div>
                  {topics.length > 0 && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="outline" onClick={regenerateAllDescriptions} disabled={regeneratingAllDescriptions} className="text-xs" data-testid="button-regenerate-all-descriptions" >
                            {regeneratingAllDescriptions ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3 mr-1" />
                            )}
                            Refresh All Descriptions
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Regenerate all topic descriptions based on current course content</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                
                <p className="text-sm text-muted-foreground">
                  AI will generate topics with descriptions based on your course title, description, and difficulty level from Step 1.
                </p>

                <Button onClick={generateAITopics} disabled={generatingTopics} className="w-full" data-testid="button-generate-topics" >
                  {generatingTopics ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating Topics & Descriptions...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      {topics.length > 0 ? 'Regenerate All Topics' : 'Generate Topics with AI'}
                    </>
                  )}
                </Button>
              </div>

              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Add Topic Manually
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-4">
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Topic Name</Label>
                      <Input
                        value={manualTopic}
                        onChange={(e) => setManualTopic(e.target.value)}
                        placeholder="Enter a topic name..."
                        data-testid="input-manual-topic"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Description (optional)</Label>
                      <Textarea
                        value={manualTopicDescription}
                        onChange={(e) => setManualTopicDescription(e.target.value)}
                        placeholder="Describe what learners will learn in this topic..."
                        rows={2}
                        data-testid="input-manual-topic-description"
                      />
                    </div>
                    <Button onClick={addManualTopic} disabled={!manualTopic.trim()} data-testid="button-add-topic" >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Topic
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {topics.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Course Topics ({topics.length})</h3>
                  </div>
                  
                  <div className="space-y-3">
                    {topics.map((topic, index) => (
                      <div
                        key={topic.id}
                        className={`border rounded-lg bg-background overflow-hidden ${
                          topic.isOverview ? 'border-primary/50 bg-primary/5' : ''
                        }`}
                        data-testid={`topic-${index}`}
                      >
                        <div className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <Badge variant={topic.isOverview ? 'default' : 'outline'} className={topic.isOverview ? 'bg-primary' : ''} >
                                {index + 1}
                              </Badge>
                              
                              {editingTopicIndex === index ? (
                                <div className="flex-1 flex items-center gap-2">
                                  <Input
                                    value={editingTopicValue}
                                    onChange={(e) => setEditingTopicValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveTopicEdit();
                                      if (e.key === 'Escape') cancelTopicEdit();
                                    }}
                                    className="flex-1"
                                    autoFocus
                                    data-testid={`input-edit-topic-${index}`}
                                  />
                                  <Button variant="ghost" size="sm" onClick={saveTopicEdit} data-testid={`button-save-topic-${index}`} >
                                    <Check className="h-4 w-4 text-success" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={cancelTopicEdit} data-testid={`button-cancel-edit-topic-${index}`} >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium truncate">{topic.name}</span>
                                    {topic.isOverview && (
                                      <Badge variant="secondary" className="text-xs shrink-0">
                                        Overview
                                      </Badge>
                                    )}
                                    {topic.userEditedName && (
                                      <Badge variant="outline" className="text-xs shrink-0">
                                        Customized
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            {editingTopicIndex !== index && (
                              <div className="flex items-center gap-1 shrink-0">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="sm" onClick={() => startEditingTopic(index)}
                                        data-testid={`button-edit-topic-${index}`}
                                      >
                                        <Edit2 className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Edit topic name</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="sm" onClick={() => removeTopic(index)}
                                        data-testid={`button-remove-topic-${index}`}
                                      >
                                        <X className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Remove topic</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            )}
                          </div>

                          <div className="mt-3 ml-9">
                            {editingDescriptionIndex === index ? (
                              <div className="space-y-2">
                                <Textarea
                                  value={editingDescriptionValue}
                                  onChange={(e) => setEditingDescriptionValue(e.target.value)}
                                  placeholder="Describe what learners will learn..."
                                  rows={2}
                                  className="text-sm"
                                  autoFocus
                                  data-testid={`input-edit-description-${index}`}
                                />
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={saveDescriptionEdit}>
                                    <Check className="h-3 w-3 mr-1" />
                                    Save
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={cancelDescriptionEdit}>
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start gap-2">
                                <p className="text-sm text-muted-foreground flex-1">
                                  {topic.description || (
                                    <span className="italic">No description yet. Click to add one.</span>
                                  )}
                                </p>
                                <div className="flex items-center gap-1 shrink-0">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="ghost" size="sm" onClick={() => startEditingDescription(index)}
                                          className="h-7 w-7 p-0"
                                          data-testid={`button-edit-description-${index}`}
                                        >
                                          <Edit2 className="h-3 w-3" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Edit description</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="ghost" size="sm" onClick={() => regenerateSingleDescription(index)}
                                          disabled={regeneratingDescriptionIndex === index}
                                          className="h-7 w-7 p-0"
                                          data-testid={`button-regenerate-description-${index}`}
                                        >
                                          {regeneratingDescriptionIndex === index ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                          ) : (
                                            <RefreshCw className="h-3 w-3" />
                                          )}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Regenerate description with AI</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {topics.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No topics yet. Use the AI generator above or add topics manually.</p>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)} data-testid="button-back-step3">
                Back
              </Button>
              <Button onClick={() => createCourseMutation.mutate()}
                disabled={!canProceedStep3 || createCourseMutation.isPending}
                data-testid="button-create-course"
              >
                {createCourseMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Course'
                )}
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </QuizAdminLayout>
  );
}
