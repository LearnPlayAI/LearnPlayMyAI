import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useRoute, Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  ArrowLeft, ArrowRight, Upload, FileText, Sparkles, Check, Lightbulb, 
  Loader2, X, FileWarning, CheckCircle2, Clock, AlertCircle, RefreshCw,
  ChevronDown, ChevronRight, GripVertical, Trash2, Edit2, Plus, WifiOff,
  Eye, Copy, Info, AlertTriangle, GraduationCap, Coins, BarChart3, BookOpen, History, Globe, Image as ImageIcon
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { queryClient, apiRequest, invalidateWalletCaches } from '@/lib/queryClient';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import type { GeneratedLesson, ExtractedSection, DocumentOutlineNode, WizardStep, LessonType } from '@shared/courseFrameworkContracts';
import { LP_CREDITS_SHORT } from '@shared/creditConstants';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';
import { cleanLessonSourceContent, groupSourceVisualsForLesson } from '@/utils/courseSourceVisuals';

const WIZARD_TOOLTIPS = {
  upload: {
    dragDrop: "Drag and drop your files here, or click to browse",
    oneDocPerLesson: "For best results, organize your content with one document per lesson",
    maxPages: "Large documents are supported; clear structure still improves lesson quality",
    supportedFormats: "We support Word (.docx), PowerPoint (.pptx), and PDF (.pdf) files",
  },
  generate: {
    aiProcessing: "AI will analyze your documents and create a suggested course structure",
    regenerate: "Click to generate a new set of suggestions",
  },
  review: {
    selectLessons: "Check the lessons you want to include in your final course",
    reorderLessons: "Drag lessons to reorder them",
    bloomsTaxonomy: "Learning objectives follow Bloom's Taxonomy levels",
    regenerateObjectives: "Generate new objectives for this lesson",
    preview: "Preview how your course will look when published",
  },
};

const STEPS = [
  { id: 'upload' as const, title: 'Upload Documents', description: 'Upload Word, PowerPoint, or PDF files', icon: Upload },
  { id: 'select_content' as const, title: 'Select Content', description: 'Choose sections for lessons', icon: FileText },
  { id: 'generate' as const, title: 'Generate Framework', description: 'AI creates your course structure', icon: Sparkles },
  { id: 'review' as const, title: 'Review & Edit', description: 'Customize lessons and objectives', icon: Check },
];

const BLOOM_LEVELS = [
  { value: 'remember', label: 'Remember', description: 'Recall facts and basic concepts' },
  { value: 'understand', label: 'Understand', description: 'Explain ideas or concepts' },
  { value: 'apply', label: 'Apply', description: 'Use information in new situations' },
  { value: 'analyze', label: 'Analyze', description: 'Draw connections among ideas' },
  { value: 'evaluate', label: 'Evaluate', description: 'Justify a decision or action' },
  { value: 'create', label: 'Create', description: 'Produce new or original work' },
];

const LESSON_TYPES: { value: LessonType; label: string; description: string }[] = [
  { value: 'overview', label: 'Overview', description: 'Introduction to the course' },
  { value: 'content', label: 'Content', description: 'Main lesson content' },
  { value: 'key_takeaways', label: 'Key Takeaways', description: 'Summary and key points' },
];

function isSupportedCourseDocument(file: File): boolean {
  const mimeType = (file.type || "").toLowerCase();
  const fileName = (file.name || "").toLowerCase();
  return (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    mimeType === 'application/pdf' ||
    fileName.endsWith('.docx') ||
    fileName.endsWith('.pptx') ||
    fileName.endsWith('.pdf')
  );
}

function isPowerPointDraftDocument(doc: Pick<DraftDocument, 'fileName' | 'mimeType'>): boolean {
  const fileName = (doc.fileName || '').toLowerCase();
  const mimeType = (doc.mimeType || '').toLowerCase();
  return fileName.endsWith('.pptx') || fileName.endsWith('.ppt') || mimeType.includes('presentation') || mimeType.includes('powerpoint');
}

function cleanPowerPointLessonTitle(fileName: string): string {
  return (fileName || 'PowerPoint Lesson')
    .replace(/\.(pptx|ppt)$/i, '')
    .replace(/^\s*\d+\s*[-_.]\s*/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\bEN\s*v?\d+\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || 'PowerPoint Lesson';
}

interface ValidationError {
  type: 'error' | 'warning';
  lessonIndex?: number;
  field?: string;
  message: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

function validateLessonStructure(lessons: GeneratedLesson[], selectedIds: Set<string>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  
  const isStructuralLesson = (lesson: GeneratedLesson, idx: number) => {
    const type = lesson.lessonType || (lesson.isOverview ? 'overview' : 'content');
    return type === 'overview' || type === 'key_takeaways';
  };
  const selectedLessons = lessons.filter((lesson, idx) => isStructuralLesson(lesson, idx) || selectedIds.has(String(idx)));
  const selectedContentLessons = lessons.filter((lesson, idx) => !isStructuralLesson(lesson, idx) && selectedIds.has(String(idx)));
  const overviewLessons = selectedLessons.filter((lesson) => lesson.lessonType === 'overview' || lesson.isOverview === true);
  const keyTakeawaysLessons = selectedLessons.filter((lesson) => lesson.lessonType === 'key_takeaways');
  
  if (selectedContentLessons.length === 0) {
    errors.push({ type: 'error', message: 'At least one content lesson must be selected' });
  }

  if (overviewLessons.length !== 1) {
    errors.push({ 
      type: 'error', 
      message: overviewLessons.length === 0
        ? 'One lesson must be marked as Overview'
        : 'Only one lesson can be marked as Overview'
    });
  }
  
  if (keyTakeawaysLessons.length !== 1) {
    errors.push({ 
      type: 'error', 
      message: keyTakeawaysLessons.length === 0
        ? 'One lesson must be marked as Key Takeaways'
        : 'Only one lesson can be marked as Key Takeaways'
    });
  }
  
  const contentLessons = selectedLessons.filter(l => 
    l.lessonType === 'content' || (!l.lessonType && !l.isOverview)
  );
  
  if (contentLessons.length === 0) {
    errors.push({ 
      type: 'error', 
      message: 'At least one content lesson is required' 
    });
  }
  
  if (selectedLessons.length < 3) {
    errors.push({
      type: 'error',
      message: 'Course must have at least 3 lessons: Overview + at least one content lesson + Key Takeaways'
    });
  }
  
  selectedLessons.forEach((lesson, selectedIdx) => {
    const actualIndex = lessons.findIndex((l, idx) => selectedIds.has(String(idx)) && l === lesson);
    
    if (!lesson.title?.trim()) {
      errors.push({ type: 'error', lessonIndex: actualIndex, field: 'title', message: `Lesson ${selectedIdx + 1}: Title is required` });
    }
    
    const lessonType = lesson.lessonType || (lesson.isOverview ? 'overview' : 'content');
    const isPlaceholder = lessonType === 'overview' || lessonType === 'key_takeaways';
    if (isPlaceholder) return;

    if (!lesson.description?.trim()) {
      errors.push({ type: 'error', lessonIndex: actualIndex, field: 'description', message: `Lesson ${selectedIdx + 1}: Description is required` });
    }
    
    if (!lesson.objectives || lesson.objectives.length === 0) {
      errors.push({ type: 'error', lessonIndex: actualIndex, field: 'objectives', message: `Lesson ${selectedIdx + 1}: At least one learning objective is required` });
    }
    
    const sourceWordCount = (lesson.sourceContent || '').split(/\s+/).filter(w => w.length > 0).length;
    const hasAdequateSource = sourceWordCount >= 200;

    // Only surface "detail/example" recommendations when source content is thin.
    if (lessonType === 'content' && !hasAdequateSource) {
      if (!lesson.detail?.trim()) {
        warnings.push({ type: 'warning', lessonIndex: actualIndex, field: 'detail', message: `Lesson ${selectedIdx + 1} (${lesson.title}): Detail is recommended for better content generation` });
      }
      
      if (!lesson.realWorldExample?.trim()) {
        warnings.push({ type: 'warning', lessonIndex: actualIndex, field: 'realWorldExample', message: `Lesson ${selectedIdx + 1} (${lesson.title}): Real-world example is recommended` });
      }
    }
  });
  
  // Deduplicate warnings by composite key of (lessonIndex + field)
  const uniqueWarnings = warnings.filter((warning, index, self) => 
    index === self.findIndex(w => 
      w.lessonIndex === warning.lessonIndex && w.field === warning.field
    )
  );
  
  // Deduplicate errors by composite key of (lessonIndex + field)
  const uniqueErrors = errors.filter((error, index, self) => 
    index === self.findIndex(e => 
      e.lessonIndex === error.lessonIndex && e.field === error.field && e.message === error.message
    )
  );
  
  return { 
    isValid: uniqueErrors.length === 0, 
    errors: uniqueErrors, 
    warnings: uniqueWarnings 
  };
}

interface DraftDocument {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  extractionStatus: 'pending' | 'processing' | 'completed' | 'failed';
  extractionError?: string | null;
  detectedLanguage?: string | null;
  createdAt?: string;
}

interface ContentWarning {
  lessonIndex: number;
  title: string;
  wordCount: number;
  deficit: number;
  minRequired: number;
  status: 'ok' | 'needs_content';
}

interface ContentHealth {
  totalLessons: number;
  lessonsWithSufficientContent: number;
  lessonsNeedingContent: number;
  overallStatus: 'healthy' | 'warning' | 'critical';
}

interface AnalyzedTopic {
  name: string;
  estimatedWordCount: number;
  confidenceScore?: number;
  evidenceSections?: string[];
  directMatchedWords?: number;
  relatedContextWords?: number;
  isWeakTitle?: boolean;
}

interface Draft {
  id: string;
  organizationId: string;
  createdBy: string;
  courseDescription?: string | null;
  // Topic analysis state (persisted for navigation)
  analyzedTopics?: Array<AnalyzedTopic | string> | null;
  selectedTopics?: string[] | null;
  customTopics?: Array<{name: string, documentId?: string}> | null;
  selectedOutlineNodeIds?: string[] | null;
  selectedOutlineContextNodeIds?: string[] | null;
  suggestedTitle?: string | null;
  generatedTitle?: string | null;
  generatedDescription?: string | null;
  generatedLessons?: GeneratedLesson[] | null;
  currentStep: WizardStep;
  version: number;
  documents: DraftDocument[];
  courseSettings?: {
    categoryId?: string;
    unitId?: string | null;
    subjectId?: string | null;
    subUnitId?: string | null;
    documentOutlineSelection?: {
      selectedNodeIds?: string[];
      contextNodeIds?: string[];
      selectedDocumentId?: string;
    };
  };
  isPublished?: boolean;
  publishedCourseId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  metadata?: {
    contentWarnings?: ContentWarning[];
    contentHealth?: ContentHealth;
    totalWordCount?: number;
    documentsProcessed?: number;
  };
  // Framework generation job status (for background processing)
  generationStatus?: 'idle' | 'generating' | 'completed' | 'failed' | null;
  generationError?: string | null;
  generationStartedAt?: string | null;
  generationCompletedAt?: string | null;
}

interface SourceAsset {
  id: string;
  sourceDocumentId: string;
  sourceFileName?: string | null;
  assetType: string;
  signedUrl?: string | null;
  storageKey: string;
  mimeType: string;
  pageOrSlide?: number | null;
  caption?: string | null;
  altText?: string | null;
  width?: number | null;
  height?: number | null;
  containsEmbeddedText?: boolean;
  metadata?: Record<string, any> | null;
}

interface AdvisorHint {
  type: 'suggestion' | 'warning' | 'best_practice' | 'missing_content';
  message: string;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

function useAutosave(
  draftId: string | undefined,
  data: Partial<Draft> | null,
  version: number,
  enabled: boolean,
  onRefetchNeeded?: () => Promise<Draft | undefined>
) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [hasConflict, setHasConflict] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const lastSavedRef = useRef<string>('');
  const pendingUpdateRef = useRef<string | null>(null);
  const versionRef = useRef(version);

  useEffect(() => {
    versionRef.current = version;
  }, [version]);

  const debouncedData = useDebounce(data, 2000);

  const saveData = useCallback(async (dataToSave: Partial<Draft>, retryWithVersion?: number) => {
    if (!draftId || !enabled) return false;
    
    const saveVersion = retryWithVersion ?? versionRef.current;
    setIsSaving(true);
    try {
      await apiRequest(`/api/courses/drafts/${draftId}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...dataToSave, version: saveVersion }),
      });
      lastSavedRef.current = JSON.stringify(dataToSave);
      pendingUpdateRef.current = null;
      setHasConflict(false);
      queryClient.invalidateQueries({ queryKey: ['/api/courses/drafts'] });
      return true;
    } catch (error: any) {
      if (error.statusCode === 409) {
        if (onRefetchNeeded && !retryWithVersion) {
          try {
            const freshDraft = await onRefetchNeeded();
            if (freshDraft?.version) {
              return saveData(dataToSave, freshDraft.version);
            }
          } catch (refetchError) {
            console.error('Failed to refetch draft for retry:', refetchError);
          }
        }
        setHasConflict(true);
        toast({
          title: 'Version Conflict',
          description: 'Someone else has made changes. Please refresh to see the latest version.',
          variant: 'destructive',
        });
      } else {
        console.error('Autosave failed:', error);
      }
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [draftId, enabled, toast, onRefetchNeeded]);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOffline(false);
      if (pendingUpdateRef.current) {
        try {
          let currentVersion = versionRef.current;
          if (onRefetchNeeded) {
            const freshDraft = await onRefetchNeeded();
            if (freshDraft?.version) {
              currentVersion = freshDraft.version;
            }
          }
          const pendingData = JSON.parse(pendingUpdateRef.current);
          await saveData(pendingData, currentVersion);
          toast({
            title: 'Changes saved',
            description: 'Your pending changes have been saved.',
          });
        } catch (error) {
          console.error('Failed to save pending update:', error);
        }
      }
    };
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [saveData, toast, onRefetchNeeded]);

  useEffect(() => {
    if (!draftId || !debouncedData || !enabled) return;
    
    const dataString = JSON.stringify(debouncedData);
    if (dataString === lastSavedRef.current) return;

    if (isOffline) {
      pendingUpdateRef.current = dataString;
      return;
    }

    saveData(debouncedData);
  }, [draftId, debouncedData, enabled, isOffline, saveData]);

  return { isSaving, hasConflict, isOffline, setHasConflict };
}

function UploadStep({ draftId, draft, onDocumentsChange, onUpdate, onDescriptionChange }: { 
  draftId?: string; 
  draft?: Draft | null;
  onDocumentsChange: () => void;
  onUpdate: (updates: Partial<Draft>) => void;
  onDescriptionChange?: (description: string) => void;
}) {
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRetrying, setIsRetrying] = useState<string | null>(null);
  const [courseDescription, setCourseDescription] = useState(draft?.courseDescription || '');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const debouncedDescription = useDebounce(courseDescription, 1000);

  useEffect(() => {
    if (debouncedDescription !== (draft?.courseDescription || '') && draftId) {
      onUpdate({ courseDescription: debouncedDescription });
    }
  }, [debouncedDescription, draftId, draft?.courseDescription, onUpdate]);

  const retryExtraction = async (docId: string) => {
    if (!draftId) return;
    setIsRetrying(docId);
    try {
      await apiRequest(`/api/courses/drafts/${draftId}/documents/${docId}/retry`, {
        method: 'POST',
      });
      toast({
        title: 'Retry queued',
        description: 'Document extraction will be retried.',
      });
      onDocumentsChange();
    } catch (error: any) {
      toast({
        title: 'Retry failed',
        description: error.message || 'Failed to retry extraction',
        variant: 'destructive',
      });
    } finally {
      setIsRetrying(null);
    }
  };

  const documents = draft?.documents || [];

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    await uploadFiles(files);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await uploadFiles(files);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadFiles = async (files: File[]) => {
    if (!draftId) return;

    const validFiles = files.filter(file => {
      const isValid = isSupportedCourseDocument(file);
      
      if (!isValid) {
        toast({
          title: 'Invalid file type',
          description: `${file.name} is not a supported format. Please use .docx, .pptx, or .pdf files.`,
          variant: 'destructive',
        });
      }
      return isValid;
    });

    if (validFiles.length === 0) return;

    setIsUploading(true);
    
    for (const file of validFiles) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`/api/courses/drafts/${draftId}/documents`, {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Upload failed');
        }

        toast({
          title: 'Document uploaded',
          description: `${file.name} has been uploaded and is being processed.`,
        });
      } catch (error: any) {
        toast({
          title: 'Upload failed',
          description: error.message || 'Failed to upload document',
          variant: 'destructive',
        });
      }
    }

    setIsUploading(false);
    onDocumentsChange();
  };

  const deleteDocument = async (docId: string) => {
    if (!draftId) return;
    
    try {
      await apiRequest(`/api/courses/drafts/${draftId}/documents/${docId}`, {
        method: 'DELETE',
      });
      toast({
        title: 'Document removed',
        description: 'The document has been removed from your draft.',
      });
      onDocumentsChange();
    } catch (error: any) {
      toast({
        title: 'Failed to remove document',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusIcon = (status: DraftDocument['extractionStatus']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-warning" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const getStatusText = (status: DraftDocument['extractionStatus']) => {
    switch (status) {
      case 'completed':
        return 'Ready';
      case 'processing':
        return 'Processing...';
      case 'pending':
        return 'Queued';
      case 'failed':
        return 'Failed';
    }
  };

  return (
    <div className="space-y-6" data-testid="upload-step">
      <div
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging 
            ? 'border-primary bg-primary/5' 
            : 'border-muted-foreground/25 hover:border-border'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-testid="drop-zone"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,.pptx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          data-testid="file-input"
        />
        
        <div className="flex flex-col items-center gap-4">
          {isUploading ? (
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
          ) : (
            <Upload className="h-12 w-12 text-muted-foreground" />
          )}
          
          <div>
            <p className="text-lg font-medium">
              {isUploading ? 'Uploading...' : 'Drop your documents here'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              or{' '}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-primary hover:underline"
                disabled={isUploading}
              >
                browse files
              </button>
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">.docx</Badge>
            <Badge variant="outline">.pptx</Badge>
            <Badge variant="outline">.pdf</Badge>
            <Badge variant="outline">Large files supported</Badge>
          </div>
        </div>
      </div>

      {/* Document Content Guidance */}
      <Card className="bg-primary/5 border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            Recommended Document Structure
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>For best AI results, your document should include:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Course Title</strong> - Clear, descriptive title</li>
            <li><strong>Course Description</strong> - Overview of what learners will achieve</li>
            <li><strong>Course Overview</strong> - Introduction (becomes first lesson)</li>
            <li><strong>Topic Lessons</strong> - Each with:
              <ul className="list-disc list-inside ml-4 text-xs mt-1">
                <li>Lesson title and description</li>
                <li>Learning objectives</li>
                <li>Detailed content</li>
                <li>Practical real-world example</li>
              </ul>
            </li>
            <li><strong>Key Takeaways</strong> - Summary (becomes final lesson)</li>
          </ul>
        </CardContent>
      </Card>

      <TooltipProvider>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 cursor-help">
                <Lightbulb className="h-4 w-4" />
                <span>One document per lesson recommended</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Organizing your content into separate documents helps AI generate better lesson structures.</p>
            </TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 cursor-help">
                <FileText className="h-4 w-4" />
                <span>Large documents supported</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Large PDFs are supported. Clear index/section headings improve extraction and topic mapping accuracy.</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      {documents.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Uploaded Documents ({documents.length})</Label>
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card"
                data-testid={`document-${doc.id}`}
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">{doc.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(doc.fileSize)}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    {getStatusIcon(doc.extractionStatus)}
                    <span className="text-xs text-muted-foreground">
                      {getStatusText(doc.extractionStatus)}
                    </span>
                  </div>
                  
                  {doc.extractionStatus === 'failed' && (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => retryExtraction(doc.id)}
                      disabled={isRetrying === doc.id}
                      data-testid={`retry-doc-${doc.id}`}
                    >
                      {isRetrying === doc.id ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <RefreshCw className="h-3 w-3 mr-1" />
                      )}
                      Retry
                    </Button>
                  )}
                  
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteDocument(doc.id)}
                    data-testid={`delete-doc-${doc.id}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {documents.some(d => d.extractionStatus === 'failed') && (
        <Alert variant="destructive">
          <FileWarning className="h-4 w-4" />
          <AlertDescription>
            Some documents failed to process. You can remove them and try uploading again, or use the retry button.
          </AlertDescription>
        </Alert>
      )}

      <div className="relative py-4">
        <Separator />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="bg-background px-4 text-sm text-muted-foreground font-medium">OR</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="course-description-upload">Describe your course</Label>
        <Textarea
          id="course-description-upload"
          placeholder={`Example: Create a comprehensive course about [YOUR TOPIC] designed for [TARGET AUDIENCE, e.g., beginners/professionals]. 

The course should cover:
- [KEY CONCEPT 1]
- [KEY CONCEPT 2]  
- [KEY CONCEPT 3]

Learning outcomes should include [SPECIFIC SKILLS OR KNOWLEDGE LEARNERS WILL GAIN].

Replace the bracketed text with your specific course details.`}
          value={courseDescription}
          onChange={(e) => {
            setCourseDescription(e.target.value);
            onDescriptionChange?.(e.target.value);
          }}
          rows={8}
          className="min-h-[180px]"
          data-testid="course-description-upload"
        />
        <p className="text-xs text-muted-foreground">
          Describe the course you want to create and AI will generate a framework for you
        </p>
        {courseDescription.length > 0 && courseDescription.length < 20 && (
          <p className="text-xs text-warning">
            Please enter at least 20 characters ({courseDescription.length}/20)
          </p>
        )}
      </div>
    </div>
  );
}

function ContentSelectStep({ draftId, draft, onContinue, onUpdate }: { draftId?: string; draft?: Draft | null; onContinue?: () => void; onUpdate?: (updates: Partial<Draft>) => void }) {
  const { toast } = useToast();
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [documentOutline, setDocumentOutline] = useState<DocumentOutlineNode[]>([]);
  const [isLoadingSections, setIsLoadingSections] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [documentWordCounts, setDocumentWordCounts] = useState<Record<string, number>>({});
  // Initialize from draft's persisted state if available
  // Topics now have per-topic word counts from AI analysis
  const [topics, setTopics] = useState<AnalyzedTopic[]>(
    // Handle legacy format (string array) by converting to new format
    (draft?.analyzedTopics || []).map((t: any) => 
      typeof t === 'string'
        ? { name: t, estimatedWordCount: 0 }
        : {
            name: t.name || t,
            estimatedWordCount: t.estimatedWordCount || 0,
            confidenceScore: t.confidenceScore,
            evidenceSections: t.evidenceSections || [],
            directMatchedWords: t.directMatchedWords,
            relatedContextWords: t.relatedContextWords,
            isWeakTitle: t.isWeakTitle,
          }
    )
  );
  const [suggestedTitle, setSuggestedTitle] = useState<string>(draft?.suggestedTitle || '');
  const [isAnalyzingTopics, setIsAnalyzingTopics] = useState(false);
  const [hasAnalyzedTopics, setHasAnalyzedTopics] = useState(!!(draft?.analyzedTopics && draft.analyzedTopics.length > 0));
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set(draft?.selectedTopics || []));
  const [customTopics, setCustomTopics] = useState<Array<{name: string, documentId?: string}>>(draft?.customTopics || []);
  const [selectedOutlineNodeIds, setSelectedOutlineNodeIds] = useState<Set<string>>(
    new Set(((draft?.courseSettings as any)?.documentOutlineSelection?.selectedNodeIds || []) as string[])
  );
  const [contextOutlineNodeIds, setContextOutlineNodeIds] = useState<Set<string>>(
    new Set(((draft?.courseSettings as any)?.documentOutlineSelection?.contextNodeIds || []) as string[])
  );
  const [expandedTopicEvidence, setExpandedTopicEvidence] = useState<Set<string>>(new Set());
  const [newTopicName, setNewTopicName] = useState('');
  const [hasInitializedTopics, setHasInitializedTopics] = useState(!!(draft?.analyzedTopics && draft.analyzedTopics.length > 0));
  const [hasUserModifiedTopics, setHasUserModifiedTopics] = useState(false);
  const [analysisScope, setAnalysisScope] = useState<'selected' | 'all'>('selected');

  // Keep parent autosave state in sync with the latest topic selections.
  // This ensures both navigation paths ("Continue to Generate" and global "Next")
  // persist exactly the same selected topics.
  useEffect(() => {
    if (!onUpdate || !hasInitializedTopics) return;

    onUpdate({
      analyzedTopics: topics.map(t => ({
        name: t.name,
        estimatedWordCount: t.estimatedWordCount,
        confidenceScore: t.confidenceScore,
        evidenceSections: t.evidenceSections || [],
        directMatchedWords: t.directMatchedWords,
        relatedContextWords: t.relatedContextWords,
        isWeakTitle: t.isWeakTitle,
      })),
      selectedTopics: Array.from(selectedTopics),
      customTopics,
      selectedOutlineNodeIds: Array.from(selectedOutlineNodeIds),
      selectedOutlineContextNodeIds: Array.from(contextOutlineNodeIds),
      suggestedTitle,
    });
  }, [topics, selectedTopics, customTopics, selectedOutlineNodeIds, contextOutlineNodeIds, suggestedTitle, hasInitializedTopics, onUpdate]);

  useEffect(() => {
    // Only hydrate from server on initial load, not after user modifications
    if (topics.length === 0 && draft?.analyzedTopics && draft.analyzedTopics.length > 0 && !hasUserModifiedTopics) {
      const parsedTopics = (draft.analyzedTopics || []).map((t: any) => 
        typeof t === 'string'
          ? { name: t, estimatedWordCount: 0 }
          : {
              name: t.name || t,
              estimatedWordCount: t.estimatedWordCount || 0,
              confidenceScore: t.confidenceScore,
              evidenceSections: t.evidenceSections || [],
              directMatchedWords: t.directMatchedWords,
              relatedContextWords: t.relatedContextWords,
              isWeakTitle: t.isWeakTitle,
            }
      );
      setTopics(parsedTopics);
      setSuggestedTitle(draft?.suggestedTitle || '');
      setHasAnalyzedTopics(true);
      setSelectedTopics(new Set(draft?.selectedTopics || parsedTopics.map(t => t.name)));
      if (draft?.customTopics) {
        setCustomTopics(draft.customTopics);
      }
      setHasInitializedTopics(true);
    }
  }, [draft?.analyzedTopics, draft?.suggestedTitle, draft?.selectedTopics, draft?.customTopics, topics.length, hasUserModifiedTopics]);
  const [contentAnalysis, setContentAnalysis] = useState<{
    totalWordCount: number;
    topicCount: number;
    estimatedWordsPerTopic: number;
    minObservedWordsPerTopic?: number;
    analyzedDocumentCount?: number;
    analyzedDocumentIds?: string[];
    wasContentTruncated: boolean;
    contentSufficiency: 'ok' | 'warning';
    minWordsPerTopicRecommended: number;
  } | null>(null);
  const [topicQuality, setTopicQuality] = useState<{
    weakTopicCount: number;
    lowConfidenceCount: number;
    lowWordTopicCount: number;
    hasIssues: boolean;
  } | null>(null);
  const { data: topicAnalysisCostData } = useQuery<{ creditCost: number }>({
    queryKey: ['/api/courses/drafts/topic-analysis-cost'],
    staleTime: 30000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });
  const topicAnalysisCost = topicAnalysisCostData?.creditCost ?? 5;

  const documents = draft?.documents?.filter(d => d.extractionStatus === 'completed') || [];
  const isPowerPointBundle = documents.length > 0 && documents.every(isPowerPointDraftDocument);
  const documentSignature = documents.map((doc) => `${doc.id}:${doc.fileName}:${doc.mimeType}:${doc.fileSize}`).join('|');
  
  // Persist topics to draft when they change
  const persistTopicState = useCallback(async () => {
    if (!draftId) return;
    try {
      await apiRequest(`/api/courses/drafts/${draftId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          analyzedTopics: topics.map(t => ({
            name: t.name,
            estimatedWordCount: t.estimatedWordCount,
            confidenceScore: t.confidenceScore,
            evidenceSections: t.evidenceSections || [],
            directMatchedWords: t.directMatchedWords,
            relatedContextWords: t.relatedContextWords,
            isWeakTitle: t.isWeakTitle,
          })),
          selectedTopics: Array.from(selectedTopics),
          customTopics: customTopics,
          selectedOutlineNodeIds: Array.from(selectedOutlineNodeIds),
          selectedOutlineContextNodeIds: Array.from(contextOutlineNodeIds),
          suggestedTitle: suggestedTitle,
        }),
      });
      // Invalidate draft query so step 3 shows correct topic count
      queryClient.invalidateQueries({ queryKey: ['/api/courses/drafts', draftId] });
    } catch (error) {
      console.error('Failed to persist topic state:', error);
    }
  }, [draftId, topics, selectedTopics, customTopics, selectedOutlineNodeIds, contextOutlineNodeIds, suggestedTitle]);

  useEffect(() => {
    if (documents.length > 0 && !selectedDoc) {
      setSelectedDoc(documents[0].id);
    }
  }, [documents, selectedDoc]);

  useEffect(() => {
    if (!isPowerPointBundle || documents.length === 0 || hasUserModifiedTopics) return;

    const pptxTopics = documents.map((doc, index) => ({
      name: cleanPowerPointLessonTitle(doc.fileName),
      estimatedWordCount: documentWordCounts[doc.id] || 0,
      confidenceScore: 1,
      evidenceSections: [doc.fileName],
      directMatchedWords: documentWordCounts[doc.id] || 0,
      relatedContextWords: 0,
      isWeakTitle: false,
      lessonNumber: index + 1,
    }));

    const commonPrefix = pptxTopics
      .map((topic) => topic.name.split(/\s+/))
      .reduce<string[]>((prefix, tokens, index) => {
        if (index === 0) return tokens;
        return prefix.filter((token, tokenIndex) => tokens[tokenIndex]?.toLowerCase() === token.toLowerCase());
      }, []);

    setTopics(pptxTopics);
    setSelectedTopics(new Set(pptxTopics.map((topic) => topic.name)));
    setSuggestedTitle((current) => current || (commonPrefix.length >= 3 ? commonPrefix.join(' ') : pptxTopics[0]?.name || 'PowerPoint Course'));
    setSelectedOutlineNodeIds(new Set());
    setContextOutlineNodeIds(new Set());
    setHasAnalyzedTopics(false);
    setHasInitializedTopics(true);
  }, [isPowerPointBundle, documentSignature, documentWordCounts, hasUserModifiedTopics]);

  useEffect(() => {
    if (selectedDoc && draftId && !isPowerPointBundle) {
      loadSections(selectedDoc);
    }
  }, [selectedDoc, draftId, isPowerPointBundle]);

  useEffect(() => {
    if (documentOutline.length === 0 || selectedOutlineNodeIds.size === 0 || topics.length > 0) return;
    syncTopicsFromOutlineSelection(selectedOutlineNodeIds);
  }, [documentOutline.length, selectedOutlineNodeIds.size]);

  useEffect(() => {
    if (draftId && documents.length > 0) {
      loadAllDocumentWordCounts();
    }
  }, [draftId, documents.length]);

  const loadAllDocumentWordCounts = async () => {
    if (!draftId) return;
    const counts: Record<string, number> = {};
    for (const doc of documents) {
      try {
        const response = await apiRequest(`/api/courses/drafts/${draftId}/documents/${doc.id}/content`);
        counts[doc.id] = (response as any).wordCount || 0;
      } catch (error) {
        console.error(`Failed to load word count for ${doc.id}:`, error);
        counts[doc.id] = 0;
      }
    }
    setDocumentWordCounts(counts);
  };

  const loadSections = async (docId: string) => {
    setIsLoadingSections(true);
    try {
      const response = await apiRequest(`/api/courses/drafts/${draftId}/documents/${docId}/content`);
      const outline = ((response as any).documentOutline || []) as DocumentOutlineNode[];
      setDocumentOutline(outline);
      setExpandedSections(new Set(outline.filter(node => !node.parentId).map(node => node.id)));
      setDocumentWordCounts(prev => ({
        ...prev,
        [docId]: (response as any).wordCount || 0
      }));
    } catch (error) {
      console.error('Failed to load sections:', error);
      setDocumentOutline([]);
    } finally {
      setIsLoadingSections(false);
    }
  };

  const analyzeTopics = async () => {
    if (!draftId) return;
    setIsAnalyzingTopics(true);
    try {
      const response = await apiRequest(`/api/courses/drafts/${draftId}/analyze-topics`, {
        method: 'POST',
        body: JSON.stringify({
          documentIds: analysisScope === 'selected' && selectedDoc ? [selectedDoc] : undefined,
        }),
      });
      const data = response as { 
        topics: Array<AnalyzedTopic> | string[];
        suggestedTitle: string;
        contentAnalysis?: {
          totalWordCount: number;
          topicCount: number;
          estimatedWordsPerTopic: number;
          minObservedWordsPerTopic?: number;
          analyzedDocumentCount?: number;
          analyzedDocumentIds?: string[];
          wasContentTruncated: boolean;
          contentSufficiency: 'ok' | 'warning';
          minWordsPerTopicRecommended: number;
        };
        topicQuality?: {
          weakTopicCount: number;
          lowConfidenceCount: number;
          lowWordTopicCount: number;
          hasIssues: boolean;
        };
        creditDeduction?: { amount: number; source: string } 
      };
      
      // Handle both legacy format (string array) and new format (object array with word counts)
      const parsedTopics: AnalyzedTopic[] = (data.topics || []).map((t: any) => 
        typeof t === 'string' 
          ? { name: t, estimatedWordCount: data.contentAnalysis?.estimatedWordsPerTopic || 0 } 
          : {
              name: t.name || '',
              estimatedWordCount: t.estimatedWordCount || 0,
              confidenceScore: t.confidenceScore,
              evidenceSections: t.evidenceSections || [],
              directMatchedWords: t.directMatchedWords,
              relatedContextWords: t.relatedContextWords,
              isWeakTitle: t.isWeakTitle,
            }
      );
      
      setTopics(parsedTopics);
      setSuggestedTitle(data.suggestedTitle || '');
      setHasAnalyzedTopics(true);
      setSelectedTopics(new Set(parsedTopics.map(t => t.name)));
      setHasInitializedTopics(true);
      
      if (data.contentAnalysis) {
        setContentAnalysis(data.contentAnalysis);
      }
      setTopicQuality(data.topicQuality || null);
      
      if (data.creditDeduction) {
        const sourceLabel = data.creditDeduction.source === 'user' ? 'personal' : 'organization';
        toast({
          title: 'Topics analyzed',
          description: `AI has identified key topics. ${data.creditDeduction.amount} ${LP_CREDITS_SHORT} deducted from ${sourceLabel} wallet.`,
        });
        queryClient.invalidateQueries({ queryKey: ['/api/credits'] });
        queryClient.invalidateQueries({ queryKey: ['/api/org-credits'] });
      } else {
        toast({
          title: 'Topics analyzed',
          description: 'AI has identified key topics from your documents.',
        });
      }
    } catch (error: any) {
      if (error.status === 402 || error.message?.includes('Insufficient credits')) {
        toast({
          title: 'Insufficient Credits',
          description: `You need ${topicAnalysisCost} ${LP_CREDITS_SHORT} to analyze topics. Please purchase more credits.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Topic analysis failed',
          description: error.message || 'Failed to analyze topics',
          variant: 'destructive',
        });
      }
    } finally {
      setIsAnalyzingTopics(false);
    }
  };

  const runAutoFixTopics = () => {
    if (topics.length === 0) return;
    const fixed: AnalyzedTopic[] = [];
    const seen = new Set<string>();
    let removedCount = 0;
    let renamedCount = 0;

    for (const topic of topics) {
      const evidenceName = topic.evidenceSections?.[0]?.trim() || '';
      const needsRename = (!!topic.isWeakTitle || /^lesson\s*\d+/i.test(topic.name)) && evidenceName.length > 0;
      const candidateName = (needsRename ? evidenceName : topic.name).replace(/\s+/g, ' ').trim();
      if (needsRename && candidateName !== topic.name) renamedCount += 1;

      const confidence = topic.confidenceScore ?? 1;
      const words = topic.estimatedWordCount || 0;
      const lowerCandidate = candidateName.toLowerCase();
      const isObjectiveStyleMeta =
        /^learning\s*outcomes?$/.test(lowerCandidate) ||
        /^by\s+the\s+end\s+of\s+(this|the)\s+(training|course)/.test(lowerCandidate) ||
        /^learners?\s+should\s+be\s+able\s+to/.test(lowerCandidate);
      if (!candidateName || isObjectiveStyleMeta || (confidence < 0.35 && words < 120)) {
        removedCount += 1;
        continue;
      }

      const key = candidateName.toLowerCase();
      if (seen.has(key)) {
        removedCount += 1;
        continue;
      }
      seen.add(key);
      fixed.push({
        ...topic,
        name: candidateName,
        isWeakTitle: /^lesson\s*\d+/i.test(candidateName) ? true : topic.isWeakTitle,
      });
    }

    if (fixed.length === 0) {
      toast({
        title: 'Auto-fix skipped',
        description: 'No safe topic fixes were found.',
        variant: 'destructive',
      });
      return;
    }

    setTopics(fixed);
    setSelectedTopics(new Set(fixed.map(t => t.name)));
    setHasUserModifiedTopics(true);
    toast({
      title: 'Topics auto-fixed',
      description: `Renamed ${renamedCount}, removed ${removedCount}.`,
    });
  };

  const outlineById = new Map(documentOutline.map((node) => [node.id, node]));
  const outlineChildren = documentOutline.reduce<Record<string, DocumentOutlineNode[]>>((acc, node) => {
    const key = node.parentId || 'root';
    acc[key] = acc[key] || [];
    acc[key].push(node);
    return acc;
  }, {});
  Object.values(outlineChildren).forEach((nodes) => nodes.sort((a, b) => a.order - b.order));

  const getDescendantNodeIds = (nodeId: string): string[] => {
    const children = outlineChildren[nodeId] || [];
    return children.flatMap((child) => [child.id, ...getDescendantNodeIds(child.id)]);
  };

  const getAncestorNodeIds = (nodeId: string): string[] => {
    const ancestors: string[] = [];
    let current = outlineById.get(nodeId);
    while (current?.parentId) {
      ancestors.push(current.parentId);
      current = outlineById.get(current.parentId);
    }
    return ancestors;
  };

  const selectableOutlineNodes = documentOutline.filter((node) =>
    ['chapter', 'section', 'subsection', 'slide'].includes(node.level)
  );

  const syncTopicsFromOutlineSelection = (selectedIds: Set<string>) => {
    const selectedNodes = selectableOutlineNodes.filter((node) => selectedIds.has(node.id));
    const outlineTopics = selectedNodes.map((node, index) => ({
      name: node.title,
      estimatedWordCount: node.wordCount || 0,
      confidenceScore: 1,
      evidenceSections: [
        `${node.level}${node.pageStart ? ` page ${node.pageStart}${node.pageEnd && node.pageEnd !== node.pageStart ? `-${node.pageEnd}` : ''}` : ''}`,
      ],
      directMatchedWords: node.wordCount || 0,
      relatedContextWords: 0,
      isWeakTitle: false,
      lessonNumber: index + 1,
    }));
    setTopics(outlineTopics);
    setSelectedTopics(new Set(outlineTopics.map((topic) => topic.name)));
    setSuggestedTitle((current) => current || selectedNodes[0]?.title || '');
    setHasAnalyzedTopics(false);
    setHasInitializedTopics(true);
  };

  const toggleOutlineNode = (nodeId: string, checked: boolean) => {
    const node = outlineById.get(nodeId);
    if (!node) return;
    const nextSelected = new Set(selectedOutlineNodeIds);

    if (checked) {
      nextSelected.add(nodeId);
      for (const descendantId of getDescendantNodeIds(nodeId)) {
        nextSelected.delete(descendantId);
      }
      for (const ancestorId of getAncestorNodeIds(nodeId)) {
        nextSelected.delete(ancestorId);
      }
    } else {
      nextSelected.delete(nodeId);
    }

    const nextContext = new Set<string>();
    for (const id of nextSelected) {
      for (const ancestorId of getAncestorNodeIds(id)) {
        if (!nextSelected.has(ancestorId)) nextContext.add(ancestorId);
      }
    }

    setSelectedOutlineNodeIds(nextSelected);
    setContextOutlineNodeIds(nextContext);
    syncTopicsFromOutlineSelection(nextSelected);
    setHasUserModifiedTopics(true);
  };

  const toggleSection = (id: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedSections(newExpanded);
  };

  const renderOutlineNode = (node: DocumentOutlineNode, depth = 0): JSX.Element => {
    const children = outlineChildren[node.id] || [];
    const isExpanded = expandedSections.has(node.id);
    const isSelectable = ['chapter', 'section', 'subsection', 'slide'].includes(node.level);
    const isSelected = selectedOutlineNodeIds.has(node.id);
    const isContext = contextOutlineNodeIds.has(node.id);
    return (
      <div key={node.id} data-testid={`outline-node-${node.id}`}>
        <div
          className={`flex items-center gap-2 rounded px-2 py-1.5 text-left ${isSelected ? 'bg-primary/10' : isContext ? 'bg-muted' : 'hover:bg-muted/70'}`}
          style={{ paddingLeft: `${8 + depth * 18}px` }}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => toggleSection(node.id)}
            disabled={children.length === 0}
          >
            {children.length > 0 ? (
              isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
            ) : (
              <span className="h-4 w-4" />
            )}
          </Button>
          <Checkbox
            checked={isSelected}
            disabled={!isSelectable}
            onCheckedChange={(checked) => toggleOutlineNode(node.id, checked === true)}
            aria-label={`Select ${node.title}`}
          />
          <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm truncate">{node.title}</span>
              {isContext && !isSelected && <Badge variant="outline" className="text-[10px]">context</Badge>}
              {node.assetIds && node.assetIds.length > 0 && (
                <Badge variant="outline" className="text-[10px] flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" />
                  {node.assetIds.length}
                </Badge>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {node.level}{node.pageStart ? ` • page ${node.pageStart}${node.pageEnd && node.pageEnd !== node.pageStart ? `-${node.pageEnd}` : ''}` : ''}{node.wordCount ? ` • ${formatWordCount(node.wordCount)}` : ''}
            </div>
          </div>
        </div>
        {isExpanded && children.length > 0 && (
          <div className="space-y-1">
            {children.map((child) => renderOutlineNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const formatWordCount = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k words`;
    }
    return `${count} words`;
  };

  const totalWordCount = Object.values(documentWordCounts).reduce((sum, count) => sum + count, 0);

  if (documents.length === 0) {
    return (
      <div className="text-center py-12" data-testid="content-select-step">
        <FileWarning className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-lg font-medium">No processed documents</p>
        <p className="text-sm text-muted-foreground mt-1">
          Please wait for documents to finish processing or go back to upload more.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="content-select-step">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Select Document</Label>
            {isPowerPointBundle ? (
              <div className="mt-1.5 rounded-lg border p-3 bg-muted/20 space-y-2">
                {documents.map((doc, index) => (
                  <div key={doc.id} className="flex items-center gap-2 rounded border bg-background/60 px-3 py-2">
                    <Badge variant="outline" className="shrink-0">Lesson {index + 1}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{cleanPowerPointLessonTitle(doc.fileName)}</p>
                      <p className="text-xs text-muted-foreground truncate">{doc.fileName}</p>
                    </div>
                    {documentWordCounts[doc.id] !== undefined && (
                      <Badge variant="secondary" className="text-xs">
                        {formatWordCount(documentWordCounts[doc.id])}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Select value={selectedDoc || ''} onValueChange={setSelectedDoc}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Choose a document" />
                </SelectTrigger>
                <SelectContent>
                  {documents.map((doc) => (
                    <SelectItem key={doc.id} value={doc.id}>
                      <div className="flex items-center justify-between w-full gap-2">
                        <span>{doc.fileName}</span>
                        {documentWordCounts[doc.id] !== undefined && (
                          <Badge variant="secondary" className="text-xs ml-2">
                            {formatWordCount(documentWordCounts[doc.id])}
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {totalWordCount > 0 && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Total: {formatWordCount(totalWordCount)} across {documents.length} document(s)
              </p>
            )}
          </div>

          <div>
            <Label className="text-sm font-medium">Document Outline</Label>
            <ScrollArea className="max-h-[600px] mt-1.5 border rounded-lg overflow-y-auto">
              {isPowerPointBundle ? (
                <div className="p-6 text-center text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-60" />
                  <p className="font-medium text-foreground">Each PowerPoint file will become one lesson.</p>
                  <p className="text-sm mt-1">
                    The uploaded deck is saved as that lesson's presentation, and slide images are prepared during course creation.
                  </p>
                </div>
              ) : isLoadingSections ? (
                <div className="p-4 space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : documentOutline.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <p>No outline was extracted from this document.</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {outlineChildren.root?.map((node) => renderOutlineNode(node)) || null}
                </div>
              )}
            </ScrollArea>
            {selectedOutlineNodeIds.size > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                {selectedOutlineNodeIds.size} content lesson{selectedOutlineNodeIds.size === 1 ? '' : 's'} selected. Parent context is included automatically for selected subsections.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Content Lessons</Label>
              <div className="flex items-center gap-2">
                <Select value={analysisScope} onValueChange={(value) => setAnalysisScope(value as 'selected' | 'all')}>
                  <SelectTrigger className="h-8 w-[170px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="selected">Selected document</SelectItem>
                    <SelectItem value="all">All documents</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={analyzeTopics} disabled={isAnalyzingTopics || documents.length === 0} className="relative" data-testid="analyze-topics-btn" >
                  {isAnalyzingTopics ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-3 w-3" />
                      {hasAnalyzedTopics ? 'Re-analyze' : 'Analyze Topics'}
                    </>
                  )}
                </Button>
                <Badge variant="secondary" className="text-xs flex items-center gap-1" data-testid="topic-analysis-cost-badge">
                  <Coins className="h-3 w-3" />
                  {topicAnalysisCost} {LP_CREDITS_SHORT}
                </Badge>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {isPowerPointBundle
                ? 'Lessons come directly from the uploaded PowerPoint files. Each deck stays attached as the lesson presentation.'
                : 'Lessons come from your selected document outline. Select a parent section to create one lesson containing its subsections.'}
            </p>
          </div>
          
          <div className="border rounded-lg p-4 min-h-[350px] bg-muted/30">
            {isAnalyzingTopics ? (
              <div className="flex flex-col items-center justify-center h-full py-12">
                <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
                <p className="text-sm text-muted-foreground">Analyzing your documents...</p>
              </div>
            ) : (hasAnalyzedTopics || topics.length > 0) ? (
              <div className="space-y-4">
                {suggestedTitle && (
                  <div className="p-3 bg-primary/10 rounded-lg border border-border">
                    <Label className="text-xs font-medium text-primary">Suggested Course Title</Label>
                    <p className="text-sm font-semibold mt-1" data-testid="suggested-title">{suggestedTitle}</p>
                  </div>
                )}
                
                {contentAnalysis && (
                  <div className={`p-3 rounded-lg border ${contentAnalysis.contentSufficiency === 'warning' ? 'bg-warning/10 border-[var(--warning)]/20 dark:bg-warning/20 dark:border-warning' : 'bg-success/10 border-success/20 dark:bg-success/20 dark:border-success/50'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {contentAnalysis.contentSufficiency === 'warning' ? (
                        <AlertTriangle className="h-4 w-4 text-warning dark:text-warning" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-success dark:text-success" />
                      )}
                      <Label className="text-xs font-medium">
                        Content Analysis: {formatWordCount(contentAnalysis.totalWordCount)} total
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ~{contentAnalysis.estimatedWordsPerTopic} words per topic 
                      {contentAnalysis.contentSufficiency === 'warning' && (
                        <span className="text-warning dark:text-warning ml-1">
                          (minimum {contentAnalysis.minWordsPerTopicRecommended} recommended)
                        </span>
                      )}
                    </p>
                    {contentAnalysis.wasContentTruncated && (
                      <p className="text-xs text-warning dark:text-warning mt-1">
                        Note: Some content was condensed for analysis. Full content will be used during generation.
                      </p>
                    )}
                  </div>
                )}
                
                {topicQuality?.hasIssues && (
                  <div className="p-3 rounded-lg border bg-warning/10 border-[var(--warning)]/20 dark:bg-warning/20 dark:border-[var(--warning)]/50">
                    <Label className="text-xs font-medium text-warning dark:text-warning">
                      Pre-generation topic quality check
                    </Label>
                    <div className="text-xs text-warning dark:text-warning mt-1 space-y-1">
                      <p>Weak topic titles: {topicQuality.weakTopicCount}</p>
                      <p>Low-confidence topics: {topicQuality.lowConfidenceCount}</p>
                      <p>Low-word topics: {topicQuality.lowWordTopicCount}</p>
                    </div>
                    <div className="mt-2">
                      <Button variant="outline" size="sm" onClick={runAutoFixTopics} data-testid="autofix-topics-btn" >
                        <Sparkles className="h-3 w-3 mr-1" />
                        Auto-fix topics
                      </Button>
                    </div>
                  </div>
                )}

                {topics.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium text-muted-foreground">Content Lessons</Label>
                      {hasAnalyzedTopics && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={runAutoFixTopics} >
                          <Sparkles className="h-3 w-3 mr-1" />
                          Auto-fix topics
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 mt-2" data-testid="topics-list">
                      {topics.map((topic, idx) => {
                        const topicWordCount = topic.estimatedWordCount || contentAnalysis?.estimatedWordsPerTopic || 0;
                        const isLowContent = contentAnalysis && topicWordCount < contentAnalysis.minWordsPerTopicRecommended;
                        const confidence = topic.confidenceScore ?? 0.65;
                        const confidenceLabel = confidence >= 0.75 ? 'high' : confidence >= 0.5 ? 'med' : 'low';
                        const evidenceKey = `${idx}:${topic.name}`;
                        const evidenceOpen = expandedTopicEvidence.has(evidenceKey);
                        return (
                          <div key={idx} className="rounded border p-2 bg-background/40">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`topic-${idx}`}
                                checked={selectedTopics.has(topic.name)}
                                onCheckedChange={(checked) => {
                                  const newSelected = new Set(selectedTopics);
                                  if (checked) {
                                    newSelected.add(topic.name);
                                  } else {
                                    newSelected.delete(topic.name);
                                  }
                                  setSelectedTopics(newSelected);
                                  setHasUserModifiedTopics(true);
                                }}
                              />
                              <label htmlFor={`topic-${idx}`} className="text-sm cursor-pointer flex-1">
                                {topic.name}
                              </label>
                              <Badge variant="outline" className={`text-xs ${isLowContent ? 'border-[var(--warning)] text-warning dark:text-warning' : ''}`}>
                                ~{topicWordCount} words
                              </Badge>
                              {hasAnalyzedTopics && (
                                <Badge variant="secondary" className={`text-xs ${confidenceLabel === 'low' ? 'bg-warning text-warning' : ''}`}>
                                  conf {Math.round(confidence * 100)}%
                                </Badge>
                              )}
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => {
                                  const next = new Set(expandedTopicEvidence);
                                  if (next.has(evidenceKey)) next.delete(evidenceKey);
                                  else next.add(evidenceKey);
                                  setExpandedTopicEvidence(next);
                                }}
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                Source
                              </Button>
                            </div>
                            {evidenceOpen && (
                              <div className="mt-2 text-xs text-muted-foreground border-t pt-2">
                                <p>Directly matched words: {topic.directMatchedWords ?? topicWordCount}</p>
                                <p>Related context words: {topic.relatedContextWords ?? Math.round(topicWordCount * 0.15)}</p>
                                {topic.evidenceSections && topic.evidenceSections.length > 0 ? (
                                  <div className="mt-1">
                                    <p className="font-medium text-foreground">Evidence sections:</p>
                                    {topic.evidenceSections.slice(0, 3).map((section, sectionIdx) => (
                                      <p key={sectionIdx} className="truncate">- {section}</p>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="mt-1">No strong evidence section match was found.</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t">
                  <Label className="text-xs font-medium text-muted-foreground">Add Custom Topic</Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      value={newTopicName}
                      onChange={(e) => setNewTopicName(e.target.value)}
                      placeholder="Enter topic name..."
                      className="flex-1"
                    />
                    <Button variant="outline" size="sm" onClick={() => {
                        if (newTopicName.trim()) {
                          setCustomTopics([...customTopics, { name: newTopicName.trim() }]);
                          setNewTopicName('');
                        }
                      }}
                      disabled={!newTopicName.trim()}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </div>
                  {customTopics.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {customTopics.map((topic, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded border bg-muted/30">
                          <span className="text-sm">{topic.name}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCustomTopics(customTopics.filter((_, i) => i !== idx))}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {topics.length === 0 && !suggestedTitle && (
                  <div className="text-center text-muted-foreground py-8">
                    <p>No topics found. Try adding more content to your documents.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center text-muted-foreground">
                <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">Select from the document outline</p>
                <p className="text-sm mt-1">
                  Choose chapters, sections, slides, or subsections. AI topic analysis remains available as an optional assist.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 pt-4 border-t">
        {contentAnalysis?.contentSufficiency === 'warning' && (
          <Alert >
            <AlertTriangle className="h-4 w-4 text-warning dark:text-warning" />
            <AlertDescription className="text-warning dark:text-warning">
              <strong>Heads up:</strong> The smallest identified topic has ~{contentAnalysis.minObservedWordsPerTopic ?? contentAnalysis.estimatedWordsPerTopic} words, 
              below the recommended {contentAnalysis.minWordsPerTopicRecommended} words per topic. 
              AI-generated lessons may need supplementary content for best results.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex justify-end">
          <Button onClick={async () => {
              await persistTopicState();
              onContinue?.();
            }}
            size="lg"
            disabled={selectedTopics.size === 0 && customTopics.length === 0}
            data-testid="continue-to-generate-btn"
          >
            Continue to Generate
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface StructuredLessonHeading {
  index: number;
  rawHeading: string;
  normalizedTitle: string;
  lessonNumber: number | null;
  type: 'lesson' | 'module' | 'chapter' | 'section' | 'overview' | 'takeaways';
}

function GenerateStep({ draftId, draft, onGenerated, onUpdate }: { 
  draftId?: string; 
  draft?: Draft | null;
  onGenerated: () => void;
  onUpdate: (updates: Partial<Draft>) => void;
}) {
  const { toast } = useToast();
  const [courseDescription, setCourseDescription] = useState(
    draft?.courseDescription || draft?.generatedDescription || ''
  );
  const [targetAudience, setTargetAudience] = useState<'beginner' | 'intermediate' | 'advanced'>('intermediate');
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [detectedLessonHeadings, setDetectedLessonHeadings] = useState<StructuredLessonHeading[]>([]);
  const [hasExplicitLessonStructure, setHasExplicitLessonStructure] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isTimerActive, setIsTimerActive] = useState(false);

  const debouncedDescription = useDebounce(courseDescription, 1000);

  // Hydrate courseDescription from draft when draft loads/changes (for resuming drafts)
  useEffect(() => {
    const draftDescription = draft?.courseDescription || draft?.generatedDescription || '';
    if (draftDescription && courseDescription === '') {
      setCourseDescription(draftDescription);
    }
  }, [draft?.courseDescription, draft?.generatedDescription]);

  useEffect(() => {
    if (debouncedDescription !== (draft?.courseDescription || '') && draftId) {
      onUpdate({ courseDescription: debouncedDescription });
    }
  }, [debouncedDescription, draftId, draft?.courseDescription, onUpdate]);

  const completedDocs = draft?.documents?.filter(d => d.extractionStatus === 'completed') || [];
  const processingDocs = draft?.documents?.filter(d => d.extractionStatus === 'processing' || d.extractionStatus === 'pending') || [];
  const completedDocIds = completedDocs.map(d => d.id).sort().join(',');
  const [isDetectingStructure, setIsDetectingStructure] = useState(false);
  
  // Fetch structured lesson headings from all completed documents
  useEffect(() => {
    const fetchStructuredHeadings = async () => {
      if (!draftId || completedDocs.length === 0) return;
      
      setIsDetectingStructure(true);
      const allHeadings: StructuredLessonHeading[] = [];
      let foundStructure = false;
      
      for (const doc of completedDocs) {
        try {
          const response = await apiRequest(`/api/courses/drafts/${draftId}/documents/${doc.id}/content`);
          const data = response as {
            status?: string;
            structuredLessonHeadings?: StructuredLessonHeading[];
            hasExplicitLessonStructure?: boolean;
          };
          
          // Skip if extraction not complete
          if (data.status === 'pending' || data.status === 'processing') {
            continue;
          }
          
          if (data.hasExplicitLessonStructure && data.structuredLessonHeadings?.length) {
            foundStructure = true;
            allHeadings.push(...data.structuredLessonHeadings);
          }
        } catch (error: any) {
          // Handle 202 (processing) or 422 (failed) gracefully
          if (error.status !== 202 && error.status !== 422) {
            console.error('Failed to fetch document content for lesson structure:', error);
          }
        }
      }
      
      if (foundStructure && allHeadings.length > 0) {
        setHasExplicitLessonStructure(true);
        setDetectedLessonHeadings(allHeadings);
      } else {
        setHasExplicitLessonStructure(false);
        setDetectedLessonHeadings([]);
      }
      setIsDetectingStructure(false);
    };
    
    fetchStructuredHeadings();
  }, [draftId, completedDocIds]); // Re-fetch when completed doc set changes
  
  // Calculate detected content lesson count (excluding overview and takeaways)
  const detectedContentLessons = detectedLessonHeadings.filter(h => 
    h.type !== 'overview' && h.type !== 'takeaways'
  );
  
  // Auto-calculate lesson count: prioritize user's explicit topic selection over auto-detected structure
  // User selection takes precedence when they have modified topics in "Select Content" step
  const selectedTopicCount = (draft?.selectedTopics?.length || 0) + (draft?.customTopics?.length || 0);
  const userHasExplicitSelection = selectedTopicCount > 0;
  
  // Priority: 1) User's explicit topic selection, 2) Detected document structure, 3) Default
  const effectiveLessonCount = userHasExplicitSelection
    ? selectedTopicCount
    : (hasExplicitLessonStructure && detectedContentLessons.length > 0 ? detectedContentLessons.length : 0);
  // Course structure is dynamic: 1 overview + N content + 1 key takeaways (N >= 1)
  const targetLessonCount = Math.max(effectiveLessonCount, 1);

  // Check if generation is currently in progress based on persisted draft state.
  const isDraftGenerating = draft?.generationStatus === 'generating';

  // Poll for generation status
  const { data: generationStatusData, refetch: refetchStatus } = useQuery<{
    status: 'idle' | 'generating' | 'completed' | 'failed';
    startedAt?: string;
    completedAt?: string;
    error?: string;
    generatedTitle?: string;
    generatedDescription?: string;
    generatedLessons?: GeneratedLesson[];
    recommendedLessons?: any[];
    version?: number;
  }>({
    queryKey: ['/api/courses/drafts', draftId, 'generation-status'],
    enabled: !!draftId,
    refetchInterval: (query) => {
      const status = (query.state.data as { status?: string } | undefined)?.status;
      return status === 'generating' || isDraftGenerating ? 3000 : false;
    },
    staleTime: 0,
  });

  const isGenerating = isDraftGenerating || generationStatusData?.status === 'generating' || isTimerActive;

  // Handle status changes from polling
  useEffect(() => {
    if (!generationStatusData) return;

    if (generationStatusData.status === 'completed') {
      // Generation completed - invalidate draft query and navigate
      queryClient.invalidateQueries({ queryKey: ['/api/courses/drafts', draftId] });
      toast({
        title: 'Framework generated!',
        description: 'Your course structure has been created. Review and customize it in the next step.',
      });
      onGenerated();
    } else if (generationStatusData.status === 'failed') {
      // Generation failed
      setGenerationError(generationStatusData.error || 'An unexpected error occurred');
      queryClient.invalidateQueries({ queryKey: ['/api/courses/drafts', draftId] });
      toast({
        title: 'Generation failed',
        description: generationStatusData.error || 'Failed to generate course framework',
        variant: 'destructive',
      });
    }
  }, [generationStatusData, draftId, onGenerated, toast]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Client-side elapsed timer that updates every second
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (isGenerating || isTimerActive) {
      // Initialize elapsed time from server timestamp on page reload
      if (draft?.generationStartedAt && elapsedSeconds === 0) {
        const initialElapsed = Math.floor((Date.now() - new Date(draft.generationStartedAt).getTime()) / 1000);
        setElapsedSeconds(Math.max(0, initialElapsed));
      }
      
      interval = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isGenerating, isTimerActive, draft?.generationStartedAt]);

  // Stop timer when generation completes or fails
  useEffect(() => {
    if (generationStatusData?.status === 'completed' || generationStatusData?.status === 'failed') {
      setIsTimerActive(false);
    }
  }, [generationStatusData?.status]);

  // Format elapsed time for display
  const formatElapsedTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const { data: frameworkPricing } = useQuery<{ baseCreditCost: number; perTopicCost: number; maxCreditCost: number }>({
    queryKey: ['/api/courses/drafts/framework-generation-cost'],
    staleTime: 5 * 60 * 1000,
  });

  const { data: contentPricing } = useQuery<{ descriptionCost: number; lessonContentCost: number }>({
    queryKey: ['/api/courses/drafts/content-generation-cost'],
    staleTime: 5 * 60 * 1000,
  });

  const frameworkCost = frameworkPricing 
    ? frameworkPricing.baseCreditCost + (selectedTopicCount * frameworkPricing.perTopicCost)
    : 20; // Default fallback to COURSE_FRAMEWORK_CREDITS
  const descriptionCost = contentPricing?.descriptionCost || 0;

  const handleGenerateDescription = async () => {
    if (!draftId) return;
    setIsGeneratingDescription(true);
    try {
      const response = await apiRequest(`/api/courses/drafts/${draftId}/description`, {
        method: 'POST',
        body: JSON.stringify({
          userDescription: courseDescription || undefined,
          targetAudience: targetAudience || undefined,
        }),
      });
      const data = response as { description: string; disclaimer: string };
      const generatedDesc = data.description || '';
      setCourseDescription(generatedDesc);
      onUpdate({ courseDescription: generatedDesc, generatedDescription: generatedDesc });
      toast({
        title: 'Description generated',
        description: data.disclaimer || 'AI has generated a course description based on your documents.',
      });
    } catch (error: any) {
      toast({
        title: 'Generation failed',
        description: error.message || 'Failed to generate description',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  const handleGenerate = async () => {
    if (!draftId || completedDocs.length === 0) return;

    setGenerationError(null);
    // Start client-side timer immediately
    setElapsedSeconds(0);
    setIsTimerActive(true);
    
    try {
      const response = await apiRequest(`/api/courses/drafts/${draftId}/generate`, {
        method: 'POST',
        body: JSON.stringify({
          courseDescription,
          targetAudience,
          targetLessonCount,
          includeRecommendations: true,
        }),
      }) as { success: boolean; status: string; message: string };
      
      if (response.status === 'completed') {
        setIsTimerActive(false);
        setElapsedSeconds(0);
        await queryClient.invalidateQueries({ queryKey: ['/api/courses/drafts', draftId] });
        toast({
          title: 'Framework generated',
          description: response.message || 'Your course framework is ready to review.',
        });
        onGenerated();
        return;
      }

      if (response.status === 'generating') {
        // Invalidate draft to pick up the new generationStatus
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['/api/courses/drafts', draftId] }),
          refetchStatus(),
        ]);
        toast({
          title: 'Generation started',
          description: 'This is running in the background. You can leave this page and return later.',
        });
      }
    } catch (error: any) {
      // Stop timer on error
      setIsTimerActive(false);
      setGenerationError(error.message || 'Failed to start generation');
      toast({
        title: 'Generation failed',
        description: error.message || 'Failed to generate course framework',
        variant: 'destructive',
      });
    }
  };

  // Show completed state if lessons exist
  if (draft?.generatedLessons && draft.generatedLessons.length > 0 && draft.generationStatus !== 'generating') {
    return (
      <div className="text-center py-8" data-testid="generate-step">
        <CheckCircle2 className="h-16 w-16 text-success mx-auto mb-4" />
        <h3 className="text-xl font-semibold">Framework Generated!</h3>
        <p className="text-muted-foreground mt-2">
          {draft.generatedLessons.length} lessons have been created from your documents.
        </p>
        <Button className="mt-6" onClick={onGenerated} data-testid="proceed-to-review" >
          Review & Edit Lessons
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    );
  }

  // Show generating state (supports page reload recovery)
  if (isGenerating) {
    return (
      <div className="text-center py-8" data-testid="generate-step">
        <div className="relative">
          <Loader2 className="h-16 w-16 text-primary mx-auto mb-4 animate-spin" />
        </div>
        <h3 className="text-xl font-semibold">Generating Framework...</h3>
        <p className="text-muted-foreground mt-2">
          AI is analyzing your documents and creating your course structure.
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          <Clock className="inline h-3 w-3 mr-1" />
          Elapsed: {formatElapsedTime(elapsedSeconds)}
        </p>
        <div className="mt-6 max-w-xs mx-auto">
          <Progress value={undefined} className="h-2" />
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          You can safely navigate away. Your progress will be saved.
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={async () => {
            await Promise.all([
              refetchStatus(),
              queryClient.invalidateQueries({ queryKey: ['/api/courses/drafts', draftId] }),
            ]);
          }}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-2" />
          Refresh now
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="generate-step">
      {/* Show error if generation failed */}
      {(generationError || draft?.generationStatus === 'failed') && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {generationError || draft?.generationError || 'Generation failed. Please try again.'}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="course-description">Course Description (Optional)</Label>
            <Button variant="outline" size="sm" onClick={handleGenerateDescription} disabled={isGeneratingDescription || completedDocs.length === 0} data-testid="generate-description-btn" >
              {isGeneratingDescription ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-3 w-3" />
                  Generate with AI{descriptionCost > 0 ? ` (${descriptionCost} ${LP_CREDITS_SHORT})` : ''}
                </>
              )}
            </Button>
          </div>
          <Textarea
            id="course-description"
            placeholder="Describe what this course is about to help AI generate better lessons..."
            value={courseDescription}
            onChange={(e) => setCourseDescription(e.target.value)}
            className="mt-1.5 min-h-[120px]"
            rows={5}
            data-testid="course-description-input"
          />
        </div>

        <div>
          <Label>Target Audience</Label>
          <Select value={targetAudience} onValueChange={(v) => setTargetAudience(v as any)}>
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="beginner">Beginner</SelectItem>
              <SelectItem value="intermediate">Intermediate</SelectItem>
              <SelectItem value="advanced">Advanced</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Loading indicator for structure detection */}
      {isDetectingStructure && (
        <Alert >
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <AlertDescription className="ml-2 text-muted-foreground">
            Analyzing document structure for lesson detection...
          </AlertDescription>
        </Alert>
      )}
      
      {/* Indicator when documents are still processing */}
      {!isDetectingStructure && processingDocs.length > 0 && !hasExplicitLessonStructure && (
        <Alert >
          <Clock className="h-4 w-4 text-warning" />
          <AlertDescription className="ml-2 text-warning">
            {processingDocs.length} document{processingDocs.length !== 1 ? 's' : ''} still processing. 
            Lesson structure will be detected when extraction completes.
          </AlertDescription>
        </Alert>
      )}

      {/* Alert for detected lesson structure - zero-hallucination mode */}
      {!isDetectingStructure && hasExplicitLessonStructure && detectedContentLessons.length > 0 && (
        <Alert >
          <BookOpen className="h-4 w-4 text-success" />
          <AlertDescription className="ml-2">
            <div className="font-medium text-success mb-2">
              Document Structure Detected - Zero-Hallucination Mode
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Your document{completedDocs.length > 1 ? 's' : ''} contain{completedDocs.length === 1 ? 's' : ''} {detectedContentLessons.length} explicit lesson{detectedContentLessons.length !== 1 ? 's' : ''}. 
              AI will use <strong>only</strong> these exact titles - no topics will be invented or combined.
            </p>
            <div className="space-y-1 text-sm">
              {detectedContentLessons.slice(0, 6).map((heading, idx) => (
                <div key={idx} className="flex items-center gap-2 text-muted-foreground">
                  <Check className="h-3 w-3 text-success" />
                  <span className="truncate">{heading.normalizedTitle}</span>
                </div>
              ))}
              {detectedContentLessons.length > 6 && (
                <div className="text-xs text-muted-foreground ml-5">
                  +{detectedContentLessons.length - 6} more lessons...
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-3 italic">
              Previously selected topics will be replaced by this document structure.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className="p-4 rounded-lg border bg-muted/30">
        <h4 className="font-medium text-sm mb-3">Course Structure Preview</h4>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span>1 Overview Lesson</span>
            <Badge variant="outline" className="text-xs">Introduction</Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-secondary" />
            <span>{effectiveLessonCount} Topic Lessons</span>
            <Badge variant="outline" className="text-xs">
              {userHasExplicitSelection ? 'Based on selected topics' : (hasExplicitLessonStructure ? 'From document structure' : 'Select topics')}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-accent" />
            <span>1 Key Takeaways Lesson</span>
            <Badge variant="outline" className="text-xs">Summary</Badge>
          </div>
          <Separator className="my-2" />
          <div className="font-medium">
            Total: {effectiveLessonCount + 2} lessons
          </div>
        </div>
      </div>

      <div className="p-4 rounded-lg border bg-muted/30">
        <div className="flex items-center gap-2 text-sm">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span>{completedDocs.length} document(s) ready for processing</span>
        </div>
        {completedDocs.length === 0 && (
          <p className="text-xs text-destructive mt-2">
            No documents are ready. Please wait for processing to complete or go back to upload documents.
          </p>
        )}
      </div>

      <Button onClick={handleGenerate} disabled={completedDocs.length === 0 || isGenerating} className="w-full" size="lg" data-testid="generate-button" >
        {isGenerating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating in background...
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            Generate Course Framework{frameworkCost > 0 ? ` (${frameworkCost} ${LP_CREDITS_SHORT})` : ''}
          </>
        )}
      </Button>
    </div>
  );
}

function CoursePreviewDialog({ 
  title, 
  description, 
  lessons 
}: { 
  title: string; 
  description: string; 
  lessons: GeneratedLesson[]; 
}) {
  const [open, setOpen] = useState(false);
  const selectedLessons = lessons.filter(l => l.isSelected);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="preview-course-btn">
          <Eye className="mr-2 h-4 w-4" />
          Preview Course
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col" data-testid="preview-dialog">
        <DialogHeader>
          <DialogTitle className="text-xl">Course Preview</DialogTitle>
          <DialogDescription>
            This is how your course will appear when published.
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-foreground" style={{ color: 'var(--text-primary)' }}>
                {title || 'Untitled Course'}
              </h2>
              <p className="text-muted-foreground" style={{ color: 'var(--text-muted)' }}>
                {description || 'No description provided.'}
              </p>
            </div>
            
            <Separator />
            
            <div className="space-y-4">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Course Lessons ({selectedLessons.length})
              </h3>
              
              {selectedLessons.length === 0 ? (
                <p className="text-sm text-muted-foreground">No lessons selected.</p>
              ) : (
                <div className="space-y-4">
                  {selectedLessons.map((lesson, idx) => (
                    <Card 
                      key={idx} 
                      className="border"
                      style={{ 
                        backgroundColor: 'var(--surface-raised)', 
                        borderColor: 'var(--stroke-default)' 
                      }}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs" style={{ backgroundColor: 'var(--action-secondary)' }} >
                            Lesson {idx + 1}
                          </Badge>
                          <CardTitle className="text-base" style={{ color: 'var(--text-primary)' }}>
                            {lesson.title}
                          </CardTitle>
                        </div>
                        <CardDescription style={{ color: 'var(--text-muted)' }}>
                          {lesson.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <Label className="text-xs font-medium text-muted-foreground">
                            Learning Objectives
                          </Label>
                          <ul className="space-y-1">
                            {lesson.objectives.map((obj, objIdx) => (
                              <li 
                                key={objIdx} 
                                className="flex items-start gap-2 text-sm"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                <Check 
                                  className="h-4 w-4 mt-0.5 shrink-0" 
                                  style={{ color: 'var(--action-primary)' }} 
                                />
                                {obj}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
        
        <DialogFooter className="pt-4">
          <Button onClick={() => setOpen(false)} data-testid="preview-looks-good-btn">
            Looks Good
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewStep({ draftId, draft, onUpdate }: { 
  draftId?: string; 
  draft?: Draft | null;
  onUpdate: (updates: Partial<Draft>) => void;
}) {
  const { toast } = useToast();
  const { effectiveOrganizationId } = useAuth();
  const { terminology: rawTerminology } = useOrganizationTerminology();
  const terminology = rawTerminology || {
    unit: 'Department',
    unitPlural: 'Departments',
    subUnit: 'Unit',
    subUnitPlural: 'Units',
    team: 'Team',
    teamPlural: 'Teams',
  };
  const termsLower = {
    unit: terminology.unit.toLowerCase(),
    unitPlural: terminology.unitPlural.toLowerCase(),
    subUnit: terminology.subUnit.toLowerCase(),
    subUnitPlural: terminology.subUnitPlural.toLowerCase(),
    team: terminology.team.toLowerCase(),
    teamPlural: terminology.teamPlural.toLowerCase(),
  };
  const [, setLocation] = useLocation();
  const [lessons, setLessons] = useState<GeneratedLesson[]>(draft?.generatedLessons || []);
  const [title, setTitle] = useState(draft?.generatedTitle || '');
  const [description, setDescription] = useState(draft?.generatedDescription || '');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingObjectiveIndex, setEditingObjectiveIndex] = useState<{ lesson: number; objective: number } | null>(null);
  const [regeneratingLessons, setRegeneratingLessons] = useState<Set<number>>(new Set());
  const [isCreatingCourse, setIsCreatingCourse] = useState(false);
  const [uploadingLessonIndex, setUploadingLessonIndex] = useState<number | null>(null);
  const [generatingLessonIndex, setGeneratingLessonIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: sourceAssetsData } = useQuery<{ assets: SourceAsset[] }>({
    queryKey: ['/api/courses/drafts', draftId, 'source-assets'],
    queryFn: async () => apiRequest(`/api/courses/drafts/${draftId}/source-assets`),
    enabled: !!draftId,
  });
  const sourceAssets = sourceAssetsData?.assets || [];
  const [pendingUploadLessonIndex, setPendingUploadLessonIndex] = useState<number | null>(null);

  const [visibility, setVisibility] = useState<'public' | 'org_only'>('public');
  const [price, setPrice] = useState('0');
  const [currency, setCurrency] = useState<'ZAR' | 'USD' | 'EUR'>('ZAR');
  const [selectedLessonIds, setSelectedLessonIds] = useState<Set<string>>(new Set());
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(
    draft?.courseSettings?.categoryId || undefined
  );
  const [selectedUnitId, setSelectedUnitId] = useState<string | undefined>(
    draft?.courseSettings?.unitId || undefined
  );
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | undefined>(
    draft?.courseSettings?.subjectId || undefined
  );
  const [selectedSubUnitId, setSelectedSubUnitId] = useState<string | undefined>(
    draft?.courseSettings?.subUnitId || undefined
  );
  const [previewAsset, setPreviewAsset] = useState<SourceAsset | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>(undefined);
  const categoryInitializedRef = useRef(false);
  const unitInitializedRef = useRef(false);
  
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  
  const [feedbackLessonIndex, setFeedbackLessonIndex] = useState<number | null>(null);
  const [confirmFeedbackOpen, setConfirmFeedbackOpen] = useState(false);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackData, setFeedbackData] = useState<any>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [pendingFeedbackLessons, setPendingFeedbackLessons] = useState<Set<number>>(new Set());

  const { data: currentOrg } = useQuery<{ type: 'education' | 'business' | 'elearning' }>({
    queryKey: ['/api/organizations/current'],
  });
  const isElearningOrg = currentOrg?.type === 'elearning';
  
  const { data: feedbackPricingData } = useQuery<{ creditCost: number }>({
    queryKey: ['/api/public/lesson-feedback-pricing'],
  });

  const { data: contentPricing } = useQuery<{ descriptionCost: number; lessonContentCost: number }>({
    queryKey: ['/api/courses/drafts/content-generation-cost'],
    staleTime: 5 * 60 * 1000,
  });

  const lessonContentCost = contentPricing?.lessonContentCost || 0;

  const { data: categoriesData, isPending: categoriesLoading } = useQuery<{ categories: Array<{ id: string; name: string; type: string; group?: string }>; orgType: string }>({
    queryKey: ['/api/courses/categories'],
  });

  const { data: unitsData, isPending: unitsLoading } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['/api/organization/units', effectiveOrganizationId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (effectiveOrganizationId) {
        params.set('organizationId', effectiveOrganizationId);
      }
      const url = `/api/organization/units${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
  });

  const { data: subUnitsData, isPending: subUnitsLoading } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['/api/organization/sub-units', selectedUnitId, effectiveOrganizationId],
    queryFn: async () => {
      if (!selectedUnitId) return [];
      const params = new URLSearchParams();
      if (effectiveOrganizationId) {
        params.set('organizationId', effectiveOrganizationId);
      }
      const response = await fetch(`/api/organization/sub-units/${selectedUnitId}${params.toString() ? `?${params.toString()}` : ''}`, { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!selectedUnitId,
  });

  const { data: gradeSubjectsData, isPending: gradeSubjectsLoading } = useQuery<Array<{ subjectId: string; subjectName: string; subjectDescription?: string | null }>>({
    queryKey: ['/api/auth/subjects-for-grade', selectedUnitId],
    queryFn: async () => {
      if (!selectedUnitId) return [];
      return apiRequest(`/api/auth/subjects-for-grade?unitId=${encodeURIComponent(selectedUnitId)}`);
    },
    enabled: !!selectedUnitId && currentOrg?.type === 'education',
  });

  const { data: teamsData, isPending: teamsLoading } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['/api/organization/teams', selectedSubUnitId],
    enabled: !!selectedSubUnitId,
  });

  // Track if we've already initialized from draft to avoid overwriting user edits
  const hasInitializedFromDraft = useRef(false);
  // Track if we've applied last lesson defaults to prevent re-defaulting on user edits
  const hasAppliedLastLessonDefaults = useRef(false);
  
  useEffect(() => {
    if (draft?.generatedLessons) {
      // Only sync from draft on initial load or if lessons haven't been set yet
      if (!hasInitializedFromDraft.current || lessons.length === 0) {
        // Clone lessons and preserve explicit lesson type defaults.
        let processedLessons = [...draft.generatedLessons];
        
        // Apply lessonType defaults on initial load if not already applied
        if (processedLessons.length > 0 && !hasAppliedLastLessonDefaults.current) {
          processedLessons = processedLessons.map((lesson) => {
            let updatedLesson = { ...lesson };
            
            // Preserve explicit roles only. Untyped imported/generated lessons are content
            // until the user marks one as Overview or Key Takeaways.
            if (!updatedLesson.lessonType) {
              updatedLesson.lessonType = updatedLesson.isOverview ? 'overview' : 'content';
            }
            
            // Set bloom level defaults based on lesson type:
            // - Overview and Key Takeaways lessons: default to 'remember'
            // - Content lessons: default to 'understand'
            if (updatedLesson.learningObjectives && updatedLesson.learningObjectives.length > 0) {
              const defaultBloomLevel = (updatedLesson.lessonType === 'overview' || updatedLesson.lessonType === 'key_takeaways') ? 'remember' : 'understand';
              updatedLesson.learningObjectives = updatedLesson.learningObjectives.map(obj => ({
                ...obj,
                bloomLevel: obj.bloomLevel || defaultBloomLevel,
              }));
            }
            
            return updatedLesson;
          });
          
          hasAppliedLastLessonDefaults.current = true;
        }
        
        setLessons(processedLessons);
        // Only lessons currently marked as content are user-selectable here.
        const selectedIds = processedLessons
          .map((lesson, idx) => {
            const type = lesson.lessonType || (lesson.isOverview ? 'overview' : 'content');
            const isStructural = type === 'overview' || type === 'key_takeaways';
            return !isStructural && lesson.isSelected !== false ? String(idx) : null;
          })
          .filter((id): id is string => id !== null);
        setSelectedLessonIds(new Set(selectedIds));
        hasInitializedFromDraft.current = true;
      }
    }
    if (draft?.generatedTitle && title === '') {
      setTitle(draft.generatedTitle);
    }
    if (draft?.generatedDescription && description === '') {
      setDescription(draft.generatedDescription);
    }
  }, [draft]);

  useEffect(() => {
    if (draft?.courseSettings?.categoryId && !categoryInitializedRef.current) {
      setSelectedCategoryId(draft.courseSettings.categoryId);
      categoryInitializedRef.current = true;
    }
  }, [draft?.courseSettings?.categoryId]);

  useEffect(() => {
    if (draft?.courseSettings?.unitId && !unitInitializedRef.current) {
      setSelectedUnitId(draft.courseSettings.unitId);
      if (draft.courseSettings.subjectId) {
        setSelectedSubjectId(draft.courseSettings.subjectId);
      }
      if (draft.courseSettings.subUnitId) {
        setSelectedSubUnitId(draft.courseSettings.subUnitId);
      }
      unitInitializedRef.current = true;
    }
  }, [draft?.courseSettings?.unitId]);

  useEffect(() => {
    if (selectedCategoryId !== (draft?.courseSettings?.categoryId || undefined)) {
      onUpdate({
        courseSettings: {
          ...draft?.courseSettings,
          categoryId: selectedCategoryId,
        },
      });
    }
  }, [selectedCategoryId, draft?.courseSettings, onUpdate]);

  useEffect(() => {
    if (selectedUnitId !== (draft?.courseSettings?.unitId || undefined) || 
        selectedSubjectId !== (draft?.courseSettings?.subjectId || undefined) ||
        selectedSubUnitId !== (draft?.courseSettings?.subUnitId || undefined)) {
      onUpdate({
        courseSettings: {
          ...draft?.courseSettings,
          unitId: selectedUnitId || null,
          subjectId: selectedSubjectId || null,
          subUnitId: selectedSubUnitId || null,
        },
      });
    }
  }, [selectedUnitId, selectedSubjectId, selectedSubUnitId, draft?.courseSettings, onUpdate]);

  const handleUnitChange = (value: string) => {
    setSelectedUnitId(value === 'none' ? undefined : value);
    setSelectedSubjectId(undefined);
    setSelectedSubUnitId(undefined);
    setSelectedTeamId(undefined);
  };

  const triggerFeedback = async (lessonIndex: number) => {
    if (!draftId) {
      toast({ title: 'Error', description: 'Draft ID required', variant: 'destructive' });
      return;
    }
    const lesson = lessons[lessonIndex];
    if (!lesson) {
      toast({ title: 'Error', description: 'Lesson not found', variant: 'destructive' });
      return;
    }
    
    // Add to pending set
    setPendingFeedbackLessons(prev => new Set(prev).add(lessonIndex));
    
    try {
      const response = await apiRequest(`/api/courses/drafts/${draftId}/preview-feedback`, {
        method: 'POST',
        body: JSON.stringify({
          lessonIndex,
          lessonData: {
            title: lesson.title,
            description: lesson.description,
            detail: (lesson as any).detail || '',
            objectives: lesson.objectives,
            realWorldExample: (lesson as any).realWorldExample || '',
          },
        }),
      });
      
      // Invalidate wallet caches to refresh credit display
      invalidateWalletCaches();
      
      // Update lesson with feedback data
      setLessons(prev => {
        const newLessons = [...prev];
        newLessons[lessonIndex] = {
          ...newLessons[lessonIndex],
          aiCoachFeedback: response.report,
          feedbackGeneratedAt: response.generatedAt || new Date().toISOString(),
          feedbackScore10: response.score10,
        };
        onUpdate({ generatedLessons: newLessons });
        return newLessons;
      });
      
      toast({
        title: 'Feedback Generated',
        description: `${lesson.title}: Quality score ${response.score10}/10`,
      });
      
      // If this was the lesson user clicked to confirm, show dialog
      if (feedbackLessonIndex === lessonIndex) {
        setFeedbackData(response);
        setFeedbackDialogOpen(true);
      }
    } catch (error: any) {
      if (error.status === 402 || error.message?.includes('Insufficient credits')) {
        setFeedbackError('Insufficient LP Credits. Please add more credits to get feedback.');
        toast({
          title: 'Insufficient Credits',
          description: 'You need more LP Credits to get feedback on this lesson.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Feedback Failed',
          description: `${lesson.title}: ${error.message || 'Failed to generate feedback'}`,
          variant: 'destructive',
        });
      }
    } finally {
      // Remove from pending set
      setPendingFeedbackLessons(prev => {
        const newSet = new Set(prev);
        newSet.delete(lessonIndex);
        return newSet;
      });
      setConfirmFeedbackOpen(false);
    }
  };
  
  // Keep legacy mutation for compatibility with existing confirm dialog flow
  const feedbackMutation = useMutation({
    mutationFn: async (lessonIndex: number) => {
      await triggerFeedback(lessonIndex);
      return { success: true };
    },
  });

  const handleGetFeedback = (lessonIndex: number) => {
    setFeedbackLessonIndex(lessonIndex);
    setFeedbackError(null);
    setConfirmFeedbackOpen(true);
  };

  const updateLessonsState = useCallback((newLessons: GeneratedLesson[]) => {
    setLessons(newLessons);
    setSelectedLessonIds(new Set(
      newLessons
        .map((lesson, idx) => {
          const type = lesson.lessonType || (lesson.isOverview ? 'overview' : 'content');
          return type === 'content' && lesson.isSelected !== false ? String(idx) : null;
        })
        .filter((id): id is string => id !== null)
    ));
    onUpdate({ generatedLessons: newLessons });
  }, [onUpdate]);

  const toggleLessonSelection = (index: number) => {
    const lesson = lessons[index];
    const lessonType = lesson?.lessonType || (lesson?.isOverview ? 'overview' : 'content');
    if (lessonType === 'overview' || lessonType === 'key_takeaways') {
      toast({
        title: 'Structural lesson is always included',
        description: 'Only content lessons are selected during course creation.',
      });
      return;
    }
    const newLessons = [...lessons];
    newLessons[index] = { ...newLessons[index], isSelected: !newLessons[index].isSelected };
    updateLessonsState(newLessons);

    const lessonId = String(index);
    setSelectedLessonIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(lessonId)) {
        newSet.delete(lessonId);
      } else {
        newSet.add(lessonId);
      }
      return newSet;
    });
  };

  const updateLesson = (index: number, updates: Partial<GeneratedLesson>) => {
    const requestedType = updates.lessonType;

    const newLessons = [...lessons];
    const nextType = requestedType || newLessons[index].lessonType || (newLessons[index].isOverview ? 'overview' : 'content');
    newLessons[index] = {
      ...newLessons[index],
      ...updates,
      lessonType: nextType,
      isOverview: nextType === 'overview',
      isSelected: nextType === 'content' ? newLessons[index].isSelected !== false : true,
    };

    updateLessonsState(newLessons);
  };

  const linkSourceAssetToLesson = (lessonIndex: number, asset: SourceAsset, recommendedUse: 'lesson_visual' | 'quiz_stimulus' | 'reference') => {
    const currentLesson = lessons[lessonIndex] as any;
    const existingAssets = Array.isArray(currentLesson.sourceAssets) ? currentLesson.sourceAssets : [];
    const nextAsset = {
      assetId: asset.id,
      recommendedUse,
      caption: asset.caption || null,
      altText: asset.altText || null,
      pageOrSlide: asset.pageOrSlide || null,
    };
    const withoutDuplicate = existingAssets.filter((item: any) => item.assetId !== asset.id || item.recommendedUse !== recommendedUse);
    const newLessons = [...lessons] as any[];
    newLessons[lessonIndex] = {
      ...newLessons[lessonIndex],
      sourceAssets: [...withoutDuplicate, nextAsset],
    };
    updateLessonsState(newLessons);
    toast({
      title: recommendedUse === 'quiz_stimulus' ? 'Visual linked to quiz' : 'Visual linked to lesson',
      description: asset.caption || asset.sourceFileName || 'Source visual linked',
    });
  };

  const unlinkSourceAssetFromLesson = (lessonIndex: number, assetId: string, recommendedUse?: string) => {
    const currentLesson = lessons[lessonIndex] as any;
    const existingAssets = Array.isArray(currentLesson.sourceAssets) ? currentLesson.sourceAssets : [];
    const newLessons = [...lessons] as any[];
    newLessons[lessonIndex] = {
      ...newLessons[lessonIndex],
      sourceAssets: existingAssets.filter((item: any) =>
        item.assetId !== assetId || (recommendedUse && item.recommendedUse !== recommendedUse)
      ),
    };
    updateLessonsState(newLessons);
  };

  const renderSourceAssetCard = (lessonIndex: number, asset: SourceAsset) => {
    const lesson = lessons[lessonIndex] as any;
    const linked = Array.isArray(lesson.sourceAssets)
      && lesson.sourceAssets.some((item: any) => item.assetId === asset.id);
    return (
      <div key={`${lessonIndex}-${asset.id}`} className="flex gap-2 rounded-md border bg-card p-2">
        <div className="h-14 w-16 shrink-0 rounded bg-muted overflow-hidden flex items-center justify-center">
          {asset.signedUrl ? (
            <button type="button" className="h-full w-full" onClick={() => setPreviewAsset(asset)}>
              <img src={asset.signedUrl} alt={asset.altText || asset.caption || 'Source visual'} className="h-full w-full object-contain" />
            </button>
          ) : (
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-xs font-medium truncate">{asset.caption || asset.sourceFileName || 'Source visual'}</div>
          <div className="text-[11px] text-muted-foreground">
            {asset.pageOrSlide ? `Page/slide ${asset.pageOrSlide}` : 'Source asset'}
          </div>
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              variant={linked ? 'secondary' : 'outline'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => linkSourceAssetToLesson(lessonIndex, asset, 'lesson_visual')}
            >
              {linked ? 'Linked' : 'Use'}
            </Button>
            {linked && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => unlinkSourceAssetFromLesson(lessonIndex, asset.id)}
              >
                Unlink
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => linkSourceAssetToLesson(lessonIndex, asset, 'quiz_stimulus')}
            >
              Quiz
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const updateObjective = (lessonIndex: number, objectiveIndex: number, value: string) => {
    const newLessons = [...lessons];
    const newObjectives = [...newLessons[lessonIndex].objectives];
    newObjectives[objectiveIndex] = value;
    newLessons[lessonIndex] = { ...newLessons[lessonIndex], objectives: newObjectives };
    updateLessonsState(newLessons);
  };

  const addObjective = (lessonIndex: number) => {
    const newLessons = [...lessons];
    newLessons[lessonIndex] = {
      ...newLessons[lessonIndex],
      objectives: [...newLessons[lessonIndex].objectives, 'New learning objective'],
    };
    updateLessonsState(newLessons);
    setEditingObjectiveIndex({ lesson: lessonIndex, objective: newLessons[lessonIndex].objectives.length - 1 });
  };

  const removeObjective = (lessonIndex: number, objectiveIndex: number) => {
    const newLessons = [...lessons];
    newLessons[lessonIndex] = {
      ...newLessons[lessonIndex],
      objectives: newLessons[lessonIndex].objectives.filter((_, i) => i !== objectiveIndex),
    };
    updateLessonsState(newLessons);
  };

  const regenerateObjectives = (lessonIndex: number, targetLevel?: string) => {
    if (!draftId) return;
    
    setRegeneratingLessons(prev => new Set(prev).add(lessonIndex));
    
    apiRequest(`/api/courses/drafts/${draftId}/lessons/${lessonIndex}/objectives`, {
      method: 'POST',
      body: JSON.stringify({ targetLevel }),
    })
    .then((result: any) => {
      setLessons(prev => {
        const newLessons = [...prev];
        newLessons[lessonIndex] = { 
          ...newLessons[lessonIndex], 
          objectives: result.objectives
        };
        return newLessons;
      });
      
      toast({
        title: 'Objectives regenerated',
        description: 'Learning objectives have been updated.',
      });
    })
    .catch((error: any) => {
      toast({
        title: 'Regeneration failed',
        description: error.message || 'Failed to regenerate objectives',
        variant: 'destructive',
      });
    })
    .finally(() => {
      setRegeneratingLessons(prev => {
        const next = new Set(prev);
        next.delete(lessonIndex);
        return next;
      });
    });
  };

  const moveLesson = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= lessons.length) return;
    
    const newLessons = [...lessons];
    const [removed] = newLessons.splice(fromIndex, 1);
    newLessons.splice(toIndex, 0, removed);
    updateLessonsState(newLessons);
  };

  const deleteLesson = (index: number) => {
    const lesson = lessons[index];
    const lessonType = lesson?.lessonType || (lesson?.isOverview ? 'overview' : 'content');
    const newLessons = lessons.filter((_, i) => i !== index);
    const hasOverview = newLessons.some((item) => item.lessonType === 'overview' || item.isOverview === true);
    const hasKeyTakeaways = newLessons.some((item) => item.lessonType === 'key_takeaways');
    const hasContent = newLessons.some((item) => {
      const type = item.lessonType || (item.isOverview ? 'overview' : 'content');
      return type === 'content';
    });

    if (lessonType === 'overview' && !hasOverview) {
      toast({
        title: 'Overview required',
        description: 'Mark another lesson as Overview before deleting this one.',
        variant: 'destructive',
      });
      return;
    }
    if (lessonType === 'key_takeaways' && !hasKeyTakeaways) {
      toast({
        title: 'Key Takeaways required',
        description: 'Mark another lesson as Key Takeaways before deleting this one.',
        variant: 'destructive',
      });
      return;
    }
    if (lessonType === 'content' && !hasContent) {
      toast({
        title: 'Content lesson required',
        description: 'At least one content lesson is required.',
        variant: 'destructive',
      });
      return;
    }

    updateLessonsState(newLessons);
  };

  const handleUploadClick = (lessonIndex: number) => {
    setPendingUploadLessonIndex(lessonIndex);
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || pendingUploadLessonIndex === null) return;

    if (!isSupportedCourseDocument(file)) {
      toast({
        title: 'Invalid file type',
        description: `${file.name} is not a supported format. Please use .docx, .pptx, or .pdf files.`,
        variant: 'destructive',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    
    const lessonIndex = pendingUploadLessonIndex;
    setUploadingLessonIndex(lessonIndex);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`/api/courses/drafts/${draftId}/lessons/${lessonIndex}/supplement`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }
      
      const result = await response.json();
      
      const newLessons = [...lessons];
      newLessons[lessonIndex] = result.lesson;
      setLessons(newLessons);
      
      toast({
        title: 'Content Added',
        description: `Added ${result.addedWords} words from ${file.name}`,
      });
    } catch (error: any) {
      toast({
        title: 'Upload Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUploadingLessonIndex(null);
      setPendingUploadLessonIndex(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleGenerateContent = async (lessonIndex: number) => {
    setGeneratingLessonIndex(lessonIndex);
    
    try {
      const response = await apiRequest(`/api/courses/drafts/${draftId}/lessons/${lessonIndex}/generate-content`, {
        method: 'POST',
      });
      
      const newLessons = [...lessons];
      newLessons[lessonIndex] = (response as any).lesson;
      setLessons(newLessons);
      
      toast({
        title: 'Content Generated',
        description: `Added ${(response as any).generatedWords} words using AI`,
      });
    } catch (error: any) {
      toast({
        title: 'Generation Failed',
        description: error.message || 'Failed to generate content',
        variant: 'destructive',
      });
    } finally {
      setGeneratingLessonIndex(null);
    }
  };

  const handleValidateAndPublish = () => {
    if (!draftId) return;
    
    if (!title.trim()) {
      toast({
        title: 'Title required',
        description: 'Please enter a course title before creating the course.',
        variant: 'destructive',
      });
      return;
    }
    
    const result = validateLessonStructure(lessons, selectedLessonIds);
    setValidationResult(result);
    
    if (result.errors.length > 0 || result.warnings.length > 0) {
      setShowValidationDialog(true);
    } else {
      handleCreateCourse();
    }
  };

  const handleCreateCourse = async () => {
    if (!draftId) return;
    
    setShowValidationDialog(false);
    setIsCreatingCourse(true);
    try {
      const result = await apiRequest(`/api/courses/drafts/${draftId}/finalize`, {
        method: 'POST',
        body: JSON.stringify({
          visibility: isElearningOrg ? visibility : 'org_only',
          price: isElearningOrg ? price : '0',
          currency: isElearningOrg ? currency : 'ZAR',
          selectedLessonIds: Array.from(selectedLessonIds),
          generatedLessons: lessons,
          ...(selectedCategoryId && { categoryId: selectedCategoryId }),
          ...(selectedUnitId && { unitId: selectedUnitId }),
          ...(selectedSubjectId && { subjectId: selectedSubjectId }),
          ...(selectedSubUnitId && { subUnitId: selectedSubUnitId }),
          ...(selectedTeamId && { teamId: selectedTeamId }),
        }),
      });
      
      toast({
        title: 'Course created!',
        description: `Your course has been created with ${(result as any).lessonCount} lessons.`,
      });
      
      setLocation(`/course-builder/${(result as any).courseId}/edit`);
    } catch (error: any) {
      toast({
        title: 'Failed to create course',
        description: error.message || 'An error occurred while creating the course.',
        variant: 'destructive',
      });
    } finally {
      setIsCreatingCourse(false);
    }
  };

  if (!lessons || lessons.length === 0) {
    return (
      <div className="text-center py-12" data-testid="review-step">
        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-lg font-medium">No lessons generated yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Go back to the Generate step to create your course framework.
        </p>
      </div>
    );
  }

  // Get content health from draft metadata (preferred) or compute from lessons (fallback)
  const contentWarnings = draft?.metadata?.contentWarnings || [];
  const contentHealth = draft?.metadata?.contentHealth || {
    totalLessons: lessons.length,
    lessonsWithSufficientContent: lessons.filter(l => (l as any).contentStatus !== 'needs_content').length,
    lessonsNeedingContent: lessons.filter(l => (l as any).contentStatus === 'needs_content').length,
    overallStatus: lessons.every(l => (l as any).contentStatus !== 'needs_content') ? 'healthy' as const : 
      lessons.every(l => (l as any).contentStatus === 'needs_content') ? 'critical' as const : 'warning' as const,
  };
  const warningsToShow = contentWarnings.length > 0 
    ? contentWarnings.filter(w => w.status === 'needs_content')
    : lessons.filter(l => (l as any).contentStatus === 'needs_content').map((lesson, idx) => ({
        lessonIndex: idx,
        title: lesson.title,
        wordCount: (lesson as any).contentWordCount || 0,
        deficit: (lesson as any).contentDeficit || 0,
        minRequired: 200,
        status: 'needs_content' as const,
      }));

  return (
    <div className="space-y-6" data-testid="review-step">
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".docx,.pptx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf"
        onChange={handleFileUpload}
      />
      {/* Content Health Report Panel */}
      {contentHealth.overallStatus === 'healthy' ? (
        <div className="p-4 rounded-lg border bg-success/10 border-success/30">
          <div className="flex items-center gap-3">
            <Check className="h-5 w-5 text-success" />
            <div>
              <h4 className="font-semibold text-success dark:text-success">Content Health: Excellent</h4>
              <p className="text-sm text-muted-foreground">
                All {contentHealth.totalLessons} lessons have sufficient source content from your documents.
              </p>
            </div>
          </div>
        </div>
      ) : warningsToShow.length > 0 && (
        <div className={`p-4 rounded-lg border ${
          contentHealth.overallStatus === 'critical' 
            ? 'bg-destructive/10 border-destructive/30' 
            : 'bg-warning/10 border-[var(--warning)]/30'
        }`}>
          <div className="flex items-start gap-3">
            <AlertCircle className={`h-5 w-5 mt-0.5 ${
              contentHealth.overallStatus === 'critical' ? 'text-destructive' : 'text-warning'
            }`} />
            <div className="flex-1">
              <h4 className={`font-semibold ${
                contentHealth.overallStatus === 'critical' ? 'text-destructive' : 'text-warning dark:text-warning'
              }`}>
                Content Health Report
              </h4>
              <p className="text-sm text-muted-foreground mt-1">
                {contentHealth.lessonsNeedingContent} of {contentHealth.totalLessons} lessons need more source content. 
                Lessons with insufficient content may rely more heavily on AI-generated material.
              </p>
              <div className="mt-3 space-y-2">
                {warningsToShow.map((warning, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm bg-background/50 rounded px-3 py-2">
                    <span className="font-medium truncate">{warning.title}</span>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className="text-muted-foreground">
                        {warning.wordCount}/{warning.minRequired} words
                      </span>
                      <Badge variant="outline" >
                        +{warning.deficit} needed
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                You can proceed with course creation. Consider uploading additional documents or using AI to supplement content later.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <Label htmlFor="course-title">Course Title</Label>
          <Input
            id="course-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              onUpdate({ generatedTitle: e.target.value });
            }}
            className="mt-1.5 text-lg font-semibold"
            data-testid="course-title-input"
          />
        </div>

        <div>
          <Label htmlFor="course-desc">Course Description</Label>
          <Textarea
            id="course-desc"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              onUpdate({ generatedDescription: e.target.value });
            }}
            className="mt-1.5"
            rows={3}
            data-testid="course-description-review"
          />
        </div>

        <Separator className="my-4" />

        <div>
          <Label className="text-base font-semibold">Course Settings</Label>
          {isElearningOrg ? (
            <div className="mt-3 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="visibility">Visibility</Label>
                  <Select value={visibility} onValueChange={(v: 'public' | 'org_only') => setVisibility(v)}>
                    <SelectTrigger id="visibility" className="mt-1.5" data-testid="visibility-select">
                      <SelectValue placeholder="Select visibility" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public (visible to all)</SelectItem>
                      <SelectItem value="org_only">Organization Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="currency">Currency</Label>
                  <Select value={currency} onValueChange={(v: 'ZAR' | 'USD' | 'EUR') => setCurrency(v)}>
                    <SelectTrigger id="currency" className="mt-1.5" data-testid="currency-select">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ZAR">ZAR (South African Rand)</SelectItem>
                      <SelectItem value="USD">USD (US Dollar)</SelectItem>
                      <SelectItem value="EUR">EUR (Euro)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="price">Price</Label>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-muted-foreground text-sm">{currency}</span>
                  <Input
                    id="price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                    className="max-w-32"
                    data-testid="price-input"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Set to 0 for a free course
                </p>
              </div>

              <div>
                <Label htmlFor="category">Course Category</Label>
                {categoriesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1.5 p-2 border rounded-md bg-muted/30">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading categories...
                  </div>
                ) : (
                  <Select value={selectedCategoryId || ''} onValueChange={(val) => setSelectedCategoryId(val || undefined)}>
                    <SelectTrigger id="category" className="mt-1.5" data-testid="category-select">
                      <SelectValue placeholder="Select a category (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoriesData?.categories && categoriesData.categories.length > 0 ? (
                        (() => {
                          const groupedCategories = categoriesData.categories.reduce((groups, cat) => {
                            const groupName = cat.group || 'Other';
                            if (!groups[groupName]) {
                              groups[groupName] = [];
                            }
                            groups[groupName].push(cat);
                            return groups;
                          }, {} as Record<string, typeof categoriesData.categories>);

                          return Object.entries(groupedCategories).map(([groupName, items]) => (
                            <SelectGroup key={groupName}>
                              <SelectLabel>{groupName}</SelectLabel>
                              {items.map(cat => (
                                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                              ))}
                            </SelectGroup>
                          ));
                        })()
                      ) : (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">No categories available</div>
                      )}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Optionally assign your course to a category
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="department">{terminology.unit}</Label>
                  {unitsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1.5 p-2 border rounded-md bg-muted/30">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading {termsLower.unitPlural}...
                    </div>
                  ) : (
                    <Select value={selectedUnitId || 'none'} onValueChange={handleUnitChange}>
                      <SelectTrigger id="department" className="mt-1.5" data-testid="department-select">
                        <SelectValue placeholder={`All ${termsLower.unitPlural}`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">All {termsLower.unitPlural}</SelectItem>
                        {unitsData && unitsData.length > 0 ? (
                          unitsData.map(unit => (
                            <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>
                          ))
                        ) : (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">No {termsLower.unitPlural} available</div>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Optionally limit course visibility to a {termsLower.unit}
                  </p>
                </div>

                <div>
                  <Label htmlFor="sub-unit">{terminology.subUnit}</Label>
                  {selectedUnitId && subUnitsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1.5 p-2 border rounded-md bg-muted/30">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading {termsLower.subUnitPlural}...
                    </div>
                  ) : (
                    <Select 
                      value={selectedSubUnitId || 'none'} 
                      onValueChange={(v) => setSelectedSubUnitId(v === 'none' ? undefined : v)}
                      disabled={!selectedUnitId}
                    >
                      <SelectTrigger id="sub-unit" className="mt-1.5" data-testid="sub-unit-select">
                        <SelectValue placeholder={selectedUnitId ? `All ${termsLower.subUnitPlural}` : `Select ${termsLower.unit} first`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">All {termsLower.subUnitPlural}</SelectItem>
                        {subUnitsData && subUnitsData.length > 0 ? (
                          subUnitsData.map(subUnit => (
                            <SelectItem key={subUnit.id} value={subUnit.id}>{subUnit.name}</SelectItem>
                          ))
                        ) : (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">No {termsLower.subUnitPlural} available</div>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Optionally limit to a specific {termsLower.subUnit}
                  </p>
                </div>

                <div>
                  <Label htmlFor="team">{terminology.team} (Optional)</Label>
                  {selectedSubUnitId && teamsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1.5 p-2 border rounded-md bg-muted/30">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading {termsLower.teamPlural}...
                    </div>
                  ) : (
                    <Select 
                      value={selectedTeamId || 'none'} 
                      onValueChange={(v) => setSelectedTeamId(v === 'none' ? undefined : v)}
                      disabled={!selectedSubUnitId}
                    >
                      <SelectTrigger id="team" className="mt-1.5" data-testid="team-select">
                        <SelectValue placeholder={selectedSubUnitId ? `All ${termsLower.teamPlural}` : `Select ${termsLower.subUnit} first`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">All {termsLower.teamPlural}</SelectItem>
                        {teamsData && teamsData.length > 0 ? (
                          teamsData.map(team => (
                            <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                          ))
                        ) : (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">No {termsLower.teamPlural} available</div>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Optionally limit to a specific {termsLower.team}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              <div>
                <Badge variant="secondary" className="text-sm px-3 py-1">
                  <Check className="h-3 w-3 mr-1.5" />
                  Free internal course
                </Badge>
                <p className="text-sm text-muted-foreground mt-2">
                  This course will be available to all members of your organization at no cost.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="department-internal">{terminology.unit}</Label>
                  {unitsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1.5 p-2 border rounded-md bg-muted/30">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading {termsLower.unitPlural}...
                    </div>
                  ) : (
                    <Select value={selectedUnitId || 'none'} onValueChange={handleUnitChange}>
                      <SelectTrigger id="department-internal" className="mt-1.5" data-testid="department-select-internal">
                        <SelectValue placeholder={`All ${termsLower.unitPlural}`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">All {termsLower.unitPlural}</SelectItem>
                        {unitsData && unitsData.length > 0 ? (
                          unitsData.map(unit => (
                            <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>
                          ))
                        ) : (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">No {termsLower.unitPlural} available</div>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Optionally limit course visibility to a {termsLower.unit}
                  </p>
                </div>

                {currentOrg?.type === 'education' && (
                <div>
                  <Label htmlFor="subject-internal">Subject</Label>
                  {selectedUnitId && gradeSubjectsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1.5 p-2 border rounded-md bg-muted/30">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading subjects...
                    </div>
                  ) : (
                    <Select 
                      value={selectedSubjectId || 'none'} 
                      onValueChange={(v) => setSelectedSubjectId(v === 'none' ? undefined : v)}
                      disabled={!selectedUnitId}
                    >
                      <SelectTrigger id="subject-internal" className="mt-1.5" data-testid="subject-select-internal">
                        <SelectValue placeholder={selectedUnitId ? 'All subjects' : `Select ${termsLower.unit} first`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">All subjects</SelectItem>
                        {gradeSubjectsData && gradeSubjectsData.length > 0 ? (
                          gradeSubjectsData.map(subject => (
                            <SelectItem key={subject.subjectId} value={subject.subjectId}>{subject.subjectName}</SelectItem>
                          ))
                        ) : (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">No subjects available for this grade</div>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Optionally limit course visibility to a subject in this grade
                  </p>
                </div>
                )}

                <div>
                  <Label htmlFor="sub-unit-internal">{terminology.subUnit}</Label>
                  {selectedUnitId && subUnitsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1.5 p-2 border rounded-md bg-muted/30">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading {termsLower.subUnitPlural}...
                    </div>
                  ) : (
                    <Select 
                      value={selectedSubUnitId || 'none'} 
                      onValueChange={(v) => setSelectedSubUnitId(v === 'none' ? undefined : v)}
                      disabled={!selectedUnitId}
                    >
                      <SelectTrigger id="sub-unit-internal" className="mt-1.5" data-testid="sub-unit-select-internal">
                        <SelectValue placeholder={selectedUnitId ? `All ${termsLower.subUnitPlural}` : `Select ${termsLower.unit} first`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">All {termsLower.subUnitPlural}</SelectItem>
                        {subUnitsData && subUnitsData.length > 0 ? (
                          subUnitsData.map(subUnit => (
                            <SelectItem key={subUnit.id} value={subUnit.id}>{subUnit.name}</SelectItem>
                          ))
                        ) : (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">No {termsLower.subUnitPlural} available</div>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Optionally limit to a specific {termsLower.subUnit}
                  </p>
                </div>

                <div>
                  <Label htmlFor="team-internal">{terminology.team} (Optional)</Label>
                  {selectedSubUnitId && teamsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1.5 p-2 border rounded-md bg-muted/30">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading {termsLower.teamPlural}...
                    </div>
                  ) : (
                    <Select 
                      value={selectedTeamId || 'none'} 
                      onValueChange={(v) => setSelectedTeamId(v === 'none' ? undefined : v)}
                      disabled={!selectedSubUnitId}
                    >
                      <SelectTrigger id="team-internal" className="mt-1.5" data-testid="team-select-internal">
                        <SelectValue placeholder={selectedSubUnitId ? `All ${termsLower.teamPlural}` : `Select ${termsLower.subUnit} first`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">All {termsLower.teamPlural}</SelectItem>
                        {teamsData && teamsData.length > 0 ? (
                          teamsData.map(team => (
                            <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                          ))
                        ) : (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">No {termsLower.teamPlural} available</div>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Optionally limit to a specific {termsLower.team}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 cursor-help">
                <Info className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {WIZARD_TOOLTIPS.review.selectLessons}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{WIZARD_TOOLTIPS.review.bloomsTaxonomy}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <CoursePreviewDialog title={title} description={description} lessons={lessons} />
      </div>

      {sourceAssets.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-primary" />
              Extracted visuals
            </CardTitle>
            <CardDescription>
              {sourceAssets.length} visual{sourceAssets.length === 1 ? '' : 's'} available from uploaded source material
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="w-full">
              <div className="flex gap-3 pb-2">
                {sourceAssets.map((asset) => (
                  <div key={asset.id} className="w-[180px] shrink-0 rounded-md border bg-card overflow-hidden">
                    <div className="aspect-video bg-muted flex items-center justify-center">
                      {asset.signedUrl ? (
                        <img
                          src={asset.signedUrl}
                          alt={asset.altText || asset.caption || 'Source visual'}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <ImageIcon className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                    <div className="p-2 space-y-2">
                      <div className="text-xs font-medium line-clamp-2">
                        {asset.caption || asset.sourceFileName || 'Source visual'}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3" />
                        {asset.pageOrSlide ? `Page/slide ${asset.pageOrSlide}` : 'Source asset'}
                      </div>
                      {asset.containsEmbeddedText && (
                        <Badge variant="outline" className="text-[10px]">
                          Contains text
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">
            Content Lessons ({selectedLessonIds.size} selected)
          </Label>
        </div>

        {lessons.map((lesson, lessonIndex) => {
          const lessonType = lesson.lessonType || (lesson.isOverview ? 'overview' : 'content');
          const isStructuralPlaceholder = lessonType === 'overview' || lessonType === 'key_takeaways';
          const visualGroups = groupSourceVisualsForLesson(lesson as any, sourceAssets);
          const cleanedSourceContent = cleanLessonSourceContent(String((lesson as any).sourceContent || ''));
          const pageRangeLabel = visualGroups.pageStart && visualGroups.pageEnd
            ? visualGroups.pageStart === visualGroups.pageEnd
              ? `page ${visualGroups.pageStart}`
              : `pages ${visualGroups.pageStart}-${visualGroups.pageEnd}`
            : 'the lesson source pages';
          return (
          <Card 
            key={lessonIndex}
            className={`transition-opacity ${!isStructuralPlaceholder && !selectedLessonIds.has(String(lessonIndex)) ? 'opacity-60' : ''}`}
            data-testid={`lesson-${lessonIndex}`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <div className="flex items-center gap-2 pt-1">
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                  <Checkbox
                    checked={isStructuralPlaceholder || selectedLessonIds.has(String(lessonIndex))}
                    disabled={isStructuralPlaceholder}
                    onCheckedChange={() => toggleLessonSelection(lessonIndex)}
                    data-testid={`lesson-checkbox-${lessonIndex}`}
                  />
                </div>
                
                <div className="flex-1 min-w-0">
                  {editingIndex === lessonIndex ? (
                    <div className="space-y-2">
                      <Input
                        value={lesson.title}
                        onChange={(e) => updateLesson(lessonIndex, { title: e.target.value })}
                        className="font-semibold"
                        autoFocus
                        onBlur={() => setEditingIndex(null)}
                        onKeyDown={(e) => e.key === 'Enter' && setEditingIndex(null)}
                        data-testid={`lesson-title-input-${lessonIndex}`}
                      />
                      <Textarea
                        value={lesson.description}
                        onChange={(e) => updateLesson(lessonIndex, { description: e.target.value })}
                        rows={2}
                        data-testid={`lesson-desc-input-${lessonIndex}`}
                      />
                    </div>
                  ) : (
                    <>
                      <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          Lesson {lessonIndex + 1}
                        </Badge>
                        <Select 
                          value={lessonType} 
                          onValueChange={(v: LessonType) => updateLesson(lessonIndex, { lessonType: v, isOverview: v === 'overview' })}
                        >
                          <SelectTrigger 
                            className="h-6 w-[120px] text-xs"
                            data-testid={`lesson-type-${lessonIndex}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LESSON_TYPES.map(type => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isStructuralPlaceholder && (
                          <Badge variant="outline" className="text-xs">
                            Placeholder
                          </Badge>
                        )}
                        {lesson.title}
                        {(lesson as any).contentStatus === 'needs_content' ? (
                          <Badge variant="outline" className="text-xs">
                            {(lesson as any).contentWordCount || 0} words
                          </Badge>
                        ) : (lesson as any).contentStatus === 'ok' ? (
                          <Badge variant="outline" className="text-xs">
                            Ready
                          </Badge>
                        ) : null}
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingIndex(lessonIndex)}
                          data-testid={`edit-lesson-${lessonIndex}`}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {lesson.description}
                      </CardDescription>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveLesson(lessonIndex, lessonIndex - 1)}
                    disabled={lessonIndex <= 0}
                    data-testid={`move-up-${lessonIndex}`}
                  >
                    <ArrowLeft className="h-4 w-4 rotate-90" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveLesson(lessonIndex, lessonIndex + 1)}
                    disabled={lessonIndex >= lessons.length - 1}
                    data-testid={`move-down-${lessonIndex}`}
                  >
                    <ArrowRight className="h-4 w-4 rotate-90" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteLesson(lessonIndex)}
                    data-testid={`delete-lesson-${lessonIndex}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Learning Objectives</Label>
                  <div className="flex items-center gap-2">
                    <Select 
                      onValueChange={(level) => regenerateObjectives(lessonIndex, level)}
                      disabled={regeneratingLessons.has(lessonIndex)}
                    >
                      <SelectTrigger className="h-8 w-[140px] text-xs">
                        <SelectValue placeholder="Bloom's Level" />
                      </SelectTrigger>
                      <SelectContent>
                        {BLOOM_LEVELS.map(level => (
                          <SelectItem key={level.value} value={level.value}>
                            <div>
                              <span className="font-medium">{level.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {regeneratingLessons.has(lessonIndex) && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" onClick={() => regenerateObjectives(lessonIndex)}
                            disabled={regeneratingLessons.has(lessonIndex)}
                            data-testid={`regenerate-objectives-${lessonIndex}`}
                          >
                            {regeneratingLessons.has(lessonIndex) ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Regenerate objectives with AI</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                <ul className="space-y-2">
                  {lesson.objectives.map((objective, objIndex) => (
                    <li key={objIndex} className="flex items-start gap-2 group">
                      <span className="text-primary mt-1">•</span>
                      {editingObjectiveIndex?.lesson === lessonIndex && 
                       editingObjectiveIndex?.objective === objIndex ? (
                        <Input
                          value={objective}
                          onChange={(e) => updateObjective(lessonIndex, objIndex, e.target.value)}
                          className="flex-1 h-8 text-sm"
                          autoFocus
                          onBlur={() => setEditingObjectiveIndex(null)}
                          onKeyDown={(e) => e.key === 'Enter' && setEditingObjectiveIndex(null)}
                          data-testid={`objective-input-${lessonIndex}-${objIndex}`}
                        />
                      ) : (
                        <span 
                          className="flex-1 text-sm cursor-pointer hover:bg-muted rounded px-1 -mx-1"
                          onClick={() => setEditingObjectiveIndex({ lesson: lessonIndex, objective: objIndex })}
                        >
                          {objective}
                        </span>
                      )}
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeObjective(lessonIndex, objIndex)}
                        data-testid={`remove-objective-${lessonIndex}-${objIndex}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </li>
                  ))}
                </ul>

                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => addObjective(lessonIndex)}
                    data-testid={`add-objective-${lessonIndex}`}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Objective
                  </Button>
                  {(lesson as any).aiCoachFeedback && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="sm" className="text-xs" onClick={() => {
                              setFeedbackLessonIndex(lessonIndex);
                              setFeedbackData({
                                score10: (lesson as any).feedbackScore10,
                                report: (lesson as any).aiCoachFeedback,
                                generatedAt: (lesson as any).feedbackGeneratedAt,
                                cached: true,
                              });
                              setFeedbackDialogOpen(true);
                            }}
                            data-testid={`view-feedback-${lessonIndex}`}
                          >
                            <History className="h-3 w-3 mr-1" />
                            View Last Feedback
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>View previously generated feedback</p>
                          {(lesson as any).feedbackGeneratedAt && (
                            <p className="text-xs text-muted-foreground">
                              Generated {new Date((lesson as any).feedbackGeneratedAt).toLocaleDateString()}
                            </p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => handleGetFeedback(lessonIndex)}
                          disabled={pendingFeedbackLessons.has(lessonIndex)}
                          data-testid={`get-feedback-${lessonIndex}`}
                        >
                          {pendingFeedbackLessons.has(lessonIndex) ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              Analyzing...
                            </>
                          ) : (
                            <>
                              <GraduationCap className="h-3 w-3 mr-1" />
                              Get Feedback
                              <Badge variant="outline" className="ml-1 px-1">
                                {feedbackPricingData?.creditCost || 10} LPC
                              </Badge>
                            </>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Get AI-powered content quality feedback</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {sourceAssets.length > 0 && (
                  <div className="rounded-md border bg-muted/20 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <ImageIcon className="h-4 w-4 text-primary" />
                        Source visuals
                      </Label>
                      {Array.isArray((lesson as any).sourceAssets) && (lesson as any).sourceAssets.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {(lesson as any).sourceAssets.length} linked
                        </Badge>
                      )}
                    </div>
                    {(lesson as any).sourceContent && (
                      <details className="rounded border bg-background p-2 text-xs">
                        <summary className="cursor-pointer font-medium">View source content</summary>
                        <div className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-muted-foreground">
                          {cleanedSourceContent || (lesson as any).sourceContent}
                        </div>
                      </details>
                    )}
                    {visualGroups.linked.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-medium">Linked visuals</div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {visualGroups.linked.map((asset) => renderSourceAssetCard(lessonIndex, asset))}
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-medium">Recommended from {pageRangeLabel}</div>
                        <Badge variant="outline" className="text-[10px]">
                          {visualGroups.recommended.length} match{visualGroups.recommended.length === 1 ? '' : 'es'}
                        </Badge>
                      </div>
                      {visualGroups.recommended.length > 0 ? (
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {visualGroups.recommended.map((asset) => renderSourceAssetCard(lessonIndex, asset))}
                        </div>
                      ) : (
                        <p className="rounded border bg-background p-2 text-xs text-muted-foreground">
                          No unlinked visuals were captured from this lesson's source pages.
                        </p>
                      )}
                    </div>
                    {visualGroups.other.length > 0 && (
                      <details className="rounded border bg-background p-2 text-xs">
                        <summary className="cursor-pointer font-medium">
                          Other extracted visuals ({visualGroups.other.length})
                        </summary>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {visualGroups.other.map((asset) => renderSourceAssetCard(lessonIndex, asset))}
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </div>
            </CardContent>

            {/* Content Remediation Panel */}
            {(lesson as any).contentStatus === 'needs_content' && (
              <div className="mx-6 mb-4 p-3 rounded-lg border border-[var(--warning)]/30 bg-warning/5">
                <div className="flex items-center gap-2 text-sm text-warning mb-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span>This lesson needs {(lesson as any).contentDeficit || 80} more words before generating a PowerPoint</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleUploadClick(lessonIndex)}
                    disabled={uploadingLessonIndex === lessonIndex}
                  >
                    {uploadingLessonIndex === lessonIndex ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload Document
                      </>
                    )}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleGenerateContent(lessonIndex)}
                    disabled={generatingLessonIndex === lessonIndex}
                  >
                    {generatingLessonIndex === lessonIndex ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Generate with AI{lessonContentCost > 0 ? ` (${lessonContentCost} ${LP_CREDITS_SHORT})` : ''}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </Card>
          );
        })}
      </div>

      <Separator className="my-6" />

      <div className="flex justify-end">
        <Button size="lg" onClick={handleValidateAndPublish} disabled={isCreatingCourse || selectedLessonIds.size === 0} data-testid="create-course-btn" >
          {isCreatingCourse ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating Course...
            </>
          ) : (
            <>
              <Check className="mr-2 h-4 w-4" />
              Create Course
            </>
          )}
        </Button>
      </div>

      <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
        <DialogContent className="max-w-lg" data-testid="validation-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {validationResult?.errors.length ? (
                <>
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  Validation Issues Found
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  Recommendations
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {validationResult?.errors.length 
                ? 'Please fix the following errors before creating your course.'
                : 'Your course structure looks good, but consider these recommendations.'}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[400px] pr-4">
            <div className="space-y-4">
              {validationResult?.errors.length ? (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-destructive flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    Errors ({validationResult.errors.length})
                  </Label>
                  {(() => {
                    const groupedErrors = validationResult.errors.reduce((acc, error) => {
                      const lessonKey = error.lessonIndex ?? -1;
                      if (!acc[lessonKey]) {
                        acc[lessonKey] = [];
                      }
                      acc[lessonKey].push(error);
                      return acc;
                    }, {} as Record<number, typeof validationResult.errors>);
                    
                    return Object.entries(groupedErrors).map(([lessonKey, errors]) => {
                      const lessonNum = parseInt(lessonKey);
                      const lessonTitle = lessonNum >= 0 && lessons[lessonNum] ? lessons[lessonNum].title : null;
                      return (
                        <div 
                          key={lessonKey} 
                          className="p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm space-y-1"
                        >
                          {lessonNum >= 0 && (
                            <div className="font-medium text-destructive">
                              Lesson {lessonNum + 1}{lessonTitle ? `: ${lessonTitle}` : ''}
                            </div>
                          )}
                          <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                            {errors.map((e, idx) => (
                              <li key={idx}>{e.field ? `${e.field.charAt(0).toUpperCase() + e.field.slice(1)} is required` : e.message}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : null}
              
              {validationResult?.warnings.length ? (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-warning flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" />
                    Warnings ({validationResult.warnings.length})
                  </Label>
                  {(() => {
                    const groupedWarnings = validationResult.warnings.reduce((acc, warning) => {
                      const lessonKey = warning.lessonIndex ?? -1;
                      if (!acc[lessonKey]) {
                        acc[lessonKey] = [];
                      }
                      acc[lessonKey].push(warning);
                      return acc;
                    }, {} as Record<number, typeof validationResult.warnings>);
                    
                    return Object.entries(groupedWarnings).map(([lessonKey, warnings]) => {
                      const lessonNum = parseInt(lessonKey);
                      const lessonTitle = lessonNum >= 0 && lessons[lessonNum] ? lessons[lessonNum].title : null;
                      return (
                        <div 
                          key={lessonKey} 
                          className="p-3 rounded-lg border border-[var(--warning)]/30 bg-warning/5 text-sm space-y-1"
                        >
                          {lessonNum >= 0 && (
                            <div className="font-medium text-warning dark:text-warning">
                              Lesson {lessonNum + 1}{lessonTitle ? `: ${lessonTitle}` : ''}
                            </div>
                          )}
                          <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                            {warnings.map((w, idx) => (
                              <li key={idx}>{w.field === 'detail' ? 'Detail is recommended for better content generation' : 'Real-world example is recommended'}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : null}
            </div>
          </ScrollArea>
          
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowValidationDialog(false)}
              data-testid="validation-cancel-btn"
            >
              Go Back & Fix
            </Button>
            {validationResult && !validationResult.errors.length && (
              <Button onClick={handleCreateCourse} disabled={isCreatingCourse} data-testid="validation-proceed-btn" >
                {isCreatingCourse ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Proceed Anyway'
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Paid Feedback Confirmation Dialog */}
      <Dialog open={confirmFeedbackOpen} onOpenChange={setConfirmFeedbackOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              Get Expert Feedback
            </DialogTitle>
            <DialogDescription>
              {feedbackLessonIndex !== null && lessons[feedbackLessonIndex]?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Get detailed AI-powered feedback on your lesson content, including a quality score and improvement suggestions.
            </p>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="font-medium">Cost</span>
              <Badge variant="outline" className="text-lg">
                <Coins className="h-4 w-4 mr-1" />
                {feedbackPricingData?.creditCost || 10} LPC
              </Badge>
            </div>
            {feedbackError && (
              <p className="text-sm text-destructive mt-3">{feedbackError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmFeedbackOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
                if (feedbackLessonIndex !== null) {
                  triggerFeedback(feedbackLessonIndex);
                }
              }}
              disabled={feedbackLessonIndex !== null && pendingFeedbackLessons.has(feedbackLessonIndex)}
            >
              {feedbackLessonIndex !== null && pendingFeedbackLessons.has(feedbackLessonIndex) ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Get Feedback
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feedback Results Dialog */}
      <Dialog open={feedbackDialogOpen} onOpenChange={(open) => {
        setFeedbackDialogOpen(open);
        if (!open) setFeedbackData(null);
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              Expert Feedback Results
            </DialogTitle>
            <DialogDescription>
              {feedbackLessonIndex !== null && lessons[feedbackLessonIndex]?.title}
            </DialogDescription>
          </DialogHeader>
          {feedbackData && (
            <div className="space-y-6 py-4">
              {/* Score overview with quality rating */}
              <div className="flex items-center gap-4 p-4 rounded-lg bg-primary/10 border border-border">
                <div className="text-center">
                  <div className="text-4xl font-bold text-primary">
                    {feedbackData.score10}/10
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Quality Score</div>
                </div>
                {feedbackData.report?.qualityGrade && (
                  <div className="text-center px-4 border-l border-border">
                    <div className={`text-3xl font-bold ${
                      feedbackData.report.qualityGrade === 'A' ? 'text-success' :
                      feedbackData.report.qualityGrade === 'B' ? 'text-primary' :
                      feedbackData.report.qualityGrade === 'C' ? 'text-warning' :
                      feedbackData.report.qualityGrade === 'D' ? 'text-warning' : 'text-destructive'
                    }`}>
                      {feedbackData.report.qualityGrade}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Rating</div>
                  </div>
                )}
                <div className="flex-1">
                  <div className="w-full bg-muted rounded-full h-3">
                    <div 
                      className="bg-primary h-3 rounded-full transition-all" 
                      style={{ width: `${(feedbackData.score10 / 10) * 100}%` }}
                    />
                  </div>
                  {feedbackData.creditsCharged && (
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <Coins className="h-3 w-3" />
                      {feedbackData.creditsCharged} LPC charged
                    </p>
                  )}
                  {feedbackData.cached && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Cached result (no credits charged)
                    </p>
                  )}
                  {feedbackData.generatedAt && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Feedback from {new Date(feedbackData.generatedAt).toLocaleDateString(undefined, { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  )}
                </div>
              </div>

              {/* 7-Dimensional Quality Rubric */}
              {feedbackData.report?.rubric && (
                <div className="space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Quality Dimensions
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {Object.entries(feedbackData.report.rubric).map(([dimension, data]: [string, any]) => (
                      <div key={dimension} className="flex items-center gap-3 p-2 bg-muted/30 rounded">
                        <span className="text-sm font-medium w-28 capitalize">{dimension.replace(/([A-Z])/g, ' $1').trim()}</span>
                        <div className="flex-1 bg-muted rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full transition-all ${
                              data.score >= 80 ? 'bg-success' :
                              data.score >= 60 ? 'bg-primary' :
                              data.score >= 40 ? 'bg-warning' : 'bg-destructive'
                            }`}
                            style={{ width: `${data.score}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium w-12 text-right">{data.score}/100</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing Bloom's Levels */}
              {feedbackData.report?.missingBloomLevels && feedbackData.report.missingBloomLevels.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    Missing Bloom's Taxonomy Levels
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {feedbackData.report.missingBloomLevels.map((level: string) => (
                      <Badge key={level} variant="outline" className="capitalize">
                        {level}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Priority Improvements */}
              {feedbackData.report?.topImprovements && feedbackData.report.topImprovements.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-warning" />
                    Priority Improvements
                  </h4>
                  <ul className="space-y-2">
                    {feedbackData.report.topImprovements.map((item: any, index: number) => (
                      <li key={`improvement-${index}-${item.title || item.priority}`} className="text-sm flex flex-col gap-1 p-3 bg-muted/30 rounded border-l-2 border-[var(--warning)]">
                        <div className="flex items-center gap-2">
                          <Badge variant={ item.priority === 'critical' ? 'destructive' : item.priority === 'important' ? 'secondary' : 'outline' } className="text-xs capitalize">
                            {item.priority}
                          </Badge>
                          <span className="font-medium">{item.title}</span>
                        </div>
                        <p className="text-muted-foreground">{item.description}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Strengths */}
              {feedbackData.report?.strengths && feedbackData.report.strengths.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    Strengths
                  </h4>
                  <ul className="space-y-1">
                    {feedbackData.report.strengths.map((strength: string, index: number) => (
                      <li key={`strength-${index}-${strength.substring(0, 20)}`} className="text-sm flex items-start gap-2 text-muted-foreground">
                        <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                        {strength}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeedbackDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewAsset} onOpenChange={(open) => !open && setPreviewAsset(null)}>
        <DialogContent className="max-w-4xl" data-testid="source-visual-preview-dialog">
          <DialogHeader>
            <DialogTitle>{previewAsset?.caption || 'Source visual'}</DialogTitle>
            <DialogDescription>
              {previewAsset?.pageOrSlide ? `Page/slide ${previewAsset.pageOrSlide}` : previewAsset?.sourceFileName || 'Uploaded source material'}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-auto rounded-md border bg-muted/20 p-3">
            {previewAsset?.signedUrl ? (
              <img src={previewAsset.signedUrl} alt={previewAsset.altText || previewAsset.caption || 'Source visual'} className="mx-auto max-h-[64vh] object-contain" />
            ) : (
              <div className="flex h-64 items-center justify-center text-muted-foreground">
                Preview unavailable
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CourseDocumentWizard() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/course-builder/from-documents/:draftId?');
  const draftId = params?.draftId;
  const { toast } = useToast();

  const [currentStep, setCurrentStep] = useState<'upload' | 'select_content' | 'generate' | 'review'>('upload');
  const [advisorHint, setAdvisorHint] = useState<AdvisorHint | null>(null);
  const [pendingUpdates, setPendingUpdates] = useState<Partial<Draft> | null>(null);
  const [localCourseDescription, setLocalCourseDescription] = useState('');
  const [localDocuments, setLocalDocuments] = useState<DraftDocument[]>([]);

  const { data: userRoles } = useQuery<{
    organizations: Array<{ id: string }>;
    effectiveOrganizationId?: string | null;
    defaultOrganizationId?: string | null;
  }>({
    queryKey: ['/api/user/roles'],
  });

  const organizationId =
    userRoles?.effectiveOrganizationId ||
    userRoles?.defaultOrganizationId ||
    userRoles?.organizations?.[0]?.id;

  const { data: draft, isLoading: draftLoading, refetch: refetchDraft } = useQuery<Draft>({
    queryKey: ['/api/courses/drafts', draftId],
    enabled: !!draftId,
    refetchInterval: (query) => {
      const draftData = query.state.data;
      const hasProcessingDocs = draftData?.documents?.some(
        (doc: DraftDocument) => doc.extractionStatus === 'pending' || doc.extractionStatus === 'processing'
      );
      const isFrameworkGenerating = draftData?.generationStatus === 'generating';
      return hasProcessingDocs || isFrameworkGenerating ? 3000 : false;
    },
  });

  const handleRefetchForAutosave = useCallback(async (): Promise<Draft | undefined> => {
    const result = await refetchDraft();
    return result.data;
  }, [refetchDraft]);

  const { data: existingDrafts } = useQuery<{ items: Draft[] }>({
    queryKey: ['/api/courses/drafts'],
    enabled: !draftId,
  });

  const createDraft = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error('No organization found');
      return await apiRequest('/api/courses/drafts', {
        method: 'POST',
        body: JSON.stringify({ organizationId, courseDescription: '' }),
      });
    },
    onSuccess: (data: any) => {
      setLocation(`/course-builder/from-documents/${data.id}`, { replace: true });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to create draft',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const duplicateDraft = useMutation({
    mutationFn: async (sourceDraftId: string) => {
      return await apiRequest(`/api/courses/drafts/${sourceDraftId}/duplicate`, {
        method: 'POST',
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/courses/drafts'] });
      toast({
        title: 'Draft duplicated',
        description: 'A copy of the draft has been created.',
      });
      setLocation(`/course-builder/from-documents/${data.id}`);
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to duplicate draft',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleDuplicateDraft = (draftIdToDupe: string) => {
    duplicateDraft.mutate(draftIdToDupe);
  };

  const deleteDraft = useMutation({
    mutationFn: async (draftIdToDelete: string) => {
      return await apiRequest(`/api/courses/drafts/${draftIdToDelete}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/courses/drafts'] });
      toast({
        title: 'Draft deleted',
        description: 'The draft has been successfully deleted.',
      });
      setDeleteConfirmDraftId(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to delete draft',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleDeleteDraft = (draftIdToDelete: string) => {
    deleteDraft.mutate(draftIdToDelete);
  };

  const [deleteConfirmDraftId, setDeleteConfirmDraftId] = useState<string | null>(null);
  const [draftsPage, setDraftsPage] = useState(0);
  const [draftSearchQuery, setDraftSearchQuery] = useState('');
  const [draftDateFilter, setDraftDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const DRAFTS_PER_PAGE = 10;

  // Helper to format relative time
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  // Helper to get friendly step label
  const getStepLabel = (step: string) => {
    const labels: Record<string, string> = {
      'upload': 'Uploading Documents',
      'select_content': 'Selecting Content',
      'generate': 'Generating Framework',
      'review': 'Review & Edit',
      'complete': 'Completed'
    };
    return labels[step] || step;
  };

  // Helper to get draft display title
  const getDraftTitle = (draft: Draft) => {
    if (draft.generatedTitle) return draft.generatedTitle;
    if (draft.suggestedTitle) return draft.suggestedTitle;
    if (draft.documents && draft.documents.length > 0) {
      return draft.documents[0].fileName.replace(/\.[^/.]+$/, '');
    }
    return 'Untitled Course';
  };

  // Filter drafts by search and date
  const filterDrafts = (drafts: Draft[]) => {
    let filtered = [...drafts];
    
    // Apply search filter
    if (draftSearchQuery.trim()) {
      const query = draftSearchQuery.toLowerCase();
      filtered = filtered.filter(d => {
        const title = getDraftTitle(d).toLowerCase();
        const docNames = d.documents?.map(doc => doc.fileName.toLowerCase()).join(' ') || '';
        return title.includes(query) || docNames.includes(query);
      });
    }
    
    // Apply date filter
    if (draftDateFilter !== 'all') {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      filtered = filtered.filter(d => {
        if (!d.createdAt) return true;
        const created = new Date(d.createdAt);
        switch (draftDateFilter) {
          case 'today':
            return created >= startOfToday;
          case 'week':
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            return created >= weekAgo;
          case 'month':
            const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            return created >= monthAgo;
          default:
            return true;
        }
      });
    }
    
    return filtered;
  };

  const [manualTitle, setManualTitle] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualLessonCount, setManualLessonCount] = useState('5');
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [languageAutoDetected, setLanguageAutoDetected] = useState(false);

  useEffect(() => {
    if (languageAutoDetected) return;
    const completedDocs = draft?.documents?.filter(
      (d: DraftDocument) => d.extractionStatus === 'completed' && d.detectedLanguage
    );
    if (completedDocs && completedDocs.length > 0) {
      const detectedLang = completedDocs[0].detectedLanguage!;
      if (detectedLang !== selectedLanguage) {
        setSelectedLanguage(detectedLang);
      }
      setLanguageAutoDetected(true);
    }
  }, [draft?.documents, languageAutoDetected]);

  const { data: supportedLanguages } = useQuery<Array<{ code: string; name: string; nativeName: string }>>({
    queryKey: ['/api/languages'],
  });

  const createManualCourse = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/courses/drafts/create-manual', {
        method: 'POST',
        body: JSON.stringify({
          title: manualTitle,
          description: manualDescription,
          numberOfContentLessons: parseInt(manualLessonCount, 10),
          languageCode: selectedLanguage,
        }),
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Course created!',
        description: `Your course has been created with ${data.lessonCount} lessons. You can now add content to each lesson.`,
      });
      setLocation(`/course-builder/${data.courseId}/edit`);
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to create course',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCreateManualCourse = () => {
    if (!manualTitle.trim() || manualTitle.trim().length < 3) {
      toast({
        title: 'Title required',
        description: 'Please enter a course title (at least 3 characters).',
        variant: 'destructive',
      });
      return;
    }
    if (!manualDescription.trim() || manualDescription.trim().length < 10) {
      toast({
        title: 'Description required',
        description: 'Please enter a course description (at least 10 characters).',
        variant: 'destructive',
      });
      return;
    }
    const lessonCount = parseInt(manualLessonCount, 10);
    if (isNaN(lessonCount) || lessonCount < 1 || lessonCount > 20) {
      toast({
        title: 'Invalid lesson count',
        description: 'Number of content lessons must be between 1 and 20.',
        variant: 'destructive',
      });
      return;
    }
    createManualCourse.mutate();
  };

  const { isSaving, hasConflict, isOffline, setHasConflict } = useAutosave(
    draftId,
    pendingUpdates,
    draft?.version || 1,
    !!draftId && !!draft,
    handleRefetchForAutosave
  );

  useEffect(() => {
    if (draft?.currentStep) {
      setCurrentStep(draft.currentStep as any);
    }
  }, [draft?.currentStep]);

  useEffect(() => {
    if (draft?.courseDescription && localCourseDescription === '') {
      setLocalCourseDescription(draft.courseDescription);
    }
  }, [draft?.courseDescription]);

  useEffect(() => {
    if (draft?.documents) {
      setLocalDocuments(draft.documents);
    }
  }, [draft?.documents]);

  useEffect(() => {
    if (draftId) {
      fetchAdvisorHint();
    }
  }, [currentStep, draftId]);

  const fetchAdvisorHint = async () => {
    try {
      const result = await apiRequest(`/api/courses/drafts/${draftId}/advisor`, {
        method: 'POST',
        body: JSON.stringify({ currentStep }),
      });
      if ((result as any).hint) {
        setAdvisorHint((result as any).hint);
      }
    } catch (e) {
      // Ignore advisor errors
    }
  };

  const handleStartNewDraft = () => {
    if (!organizationId) {
      toast({
        title: 'Organization required',
        description: 'Please make sure you are part of an organization.',
        variant: 'destructive',
      });
      return;
    }
    createDraft.mutate();
  };

  const handleContinueDraft = (id: string) => {
    setLocation(`/course-builder/from-documents/${id}`);
  };

  const handleUpdate = useCallback((updates: Partial<Draft>) => {
    setPendingUpdates(prev => ({ ...prev, ...updates }));
  }, []);

  const canProceed = () => {
    switch (currentStep) {
      case 'upload':
        const hasCompletedDocs = localDocuments.length > 0 && 
          localDocuments.every(d => d.extractionStatus === 'completed');
        const hasValidDescription = (localCourseDescription?.trim()?.length || 0) >= 20;
        return hasCompletedDocs || hasValidDescription;
      case 'select_content':
        return localDocuments.some(d => d.extractionStatus === 'completed') || 
          (localCourseDescription?.trim()?.length || 0) >= 20;
      case 'generate':
        return draft?.generatedLessons && draft.generatedLessons.length > 0;
      case 'review':
        return draft?.generatedLessons?.some(l => l.isSelected);
      default:
        return false;
    }
  };

  const handleNext = async () => {
    if (!canProceed()) {
      if (currentStep === 'upload') {
        const hasCompletedDocs = localDocuments.length > 0 && 
          localDocuments.every(d => d.extractionStatus === 'completed');
        const descLength = localCourseDescription?.trim()?.length || 0;
        
        if (!hasCompletedDocs && descLength === 0) {
          toast({
            title: 'Add documents or description',
            description: 'Please upload documents or provide a course description to proceed.',
            variant: 'destructive',
          });
          return;
        }
        
        if (!hasCompletedDocs && descLength > 0 && descLength < 20) {
          toast({
            title: 'Description too short',
            description: 'Please provide a course description of at least 20 characters.',
            variant: 'destructive',
          });
          return;
        }
      }
      return;
    }

    const stepIndex = STEPS.findIndex(s => s.id === currentStep);
    if (stepIndex < STEPS.length - 1) {
      const nextStep = STEPS[stepIndex + 1].id;
      setCurrentStep(nextStep);
      
      if (draftId) {
        // Persist latest pending edits together with step transition to avoid
        // losing topic selections when user advances via the global "Next" button.
        const transitionPayload: Record<string, unknown> = {
          currentStep: nextStep,
          version: draft?.version || 1,
          ...(pendingUpdates || {}),
        };

        await apiRequest(`/api/courses/drafts/${draftId}`, {
          method: 'PATCH',
          body: JSON.stringify(transitionPayload),
        });
        setPendingUpdates(null);
        refetchDraft();
      }
    }
  };

  const handleBack = () => {
    const stepIndex = STEPS.findIndex(s => s.id === currentStep);
    if (stepIndex > 0) {
      setCurrentStep(STEPS[stepIndex - 1].id);
    }
  };

  const handleResolveConflict = async () => {
    await refetchDraft();
    setHasConflict(false);
    setPendingUpdates(null);
  };

  const stepIndex = STEPS.findIndex(s => s.id === currentStep);
  const progressPercent = ((stepIndex + 1) / STEPS.length) * 100;

  if (!draftId && !draftLoading) {
    const allDrafts = existingDrafts?.items || [];
    const filteredDrafts = filterDrafts(allDrafts);
    const totalDrafts = filteredDrafts.length;
    const totalPages = Math.ceil(totalDrafts / DRAFTS_PER_PAGE);
    const paginatedDrafts = filteredDrafts.slice(draftsPage * DRAFTS_PER_PAGE, (draftsPage + 1) * DRAFTS_PER_PAGE);
    const totalLessonsPreview = parseInt(manualLessonCount || '0', 10) + 2;

    return (
      <QuizAdminLayout title="Create Course" data-testid="course-document-wizard">
        <div className="max-w-2xl mx-auto space-y-6">
          {(allDrafts.length > 0) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Continue a Draft
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    placeholder="Search drafts..."
                    value={draftSearchQuery}
                    onChange={(e) => {
                      setDraftSearchQuery(e.target.value);
                      setDraftsPage(0);
                    }}
                    className="flex-1"
                  />
                  <Select 
                    value={draftDateFilter} 
                    onValueChange={(v: 'all' | 'today' | 'week' | 'month') => {
                      setDraftDateFilter(v);
                      setDraftsPage(0);
                    }}
                  >
                    <SelectTrigger className="w-full sm:w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All time</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="week">Last 7 days</SelectItem>
                      <SelectItem value="month">Last 30 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {paginatedDrafts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {draftSearchQuery || draftDateFilter !== 'all' 
                      ? 'No drafts match your filters' 
                      : 'No drafts available'}
                  </p>
                ) : paginatedDrafts.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-2"
                  >
                    <button
                      onClick={() => handleContinueDraft(d.id)}
                      className="flex-1 flex items-center justify-between p-3 rounded-lg border hover:bg-muted transition-colors text-left"
                      data-testid={`continue-draft-${d.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium break-words whitespace-normal line-clamp-2">
                          {getDraftTitle(d)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {d.documents?.length || 0} document(s) • {getStepLabel(d.currentStep)}{d.createdAt ? ` • ${formatRelativeTime(d.createdAt)}` : ''}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
                    </button>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="icon" onClick={(e) => {
                              e.stopPropagation();
                              handleDuplicateDraft(d.id);
                            }}
                            disabled={duplicateDraft.isPending}
                            data-testid={`duplicate-draft-${d.id}`}
                          >
                            {duplicateDraft.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Duplicate this draft</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Dialog open={deleteConfirmDraftId === d.id} onOpenChange={(open) => !open && setDeleteConfirmDraftId(null)}>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmDraftId(d.id);
                              }}
                              disabled={deleteDraft.isPending}
                              data-testid={`delete-draft-${d.id}`}
                            >
                              {deleteDraft.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4 text-destructive" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Delete this draft</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Delete Draft</DialogTitle>
                          <DialogDescription>
                            Are you sure you want to delete "{d.generatedTitle || 'Untitled Course'}"? This action cannot be undone.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="flex gap-2 justify-end">
                          <Button variant="outline" onClick={() => setDeleteConfirmDraftId(null)}
                          >
                            Cancel
                          </Button>
                          <Button variant="destructive" onClick={() => handleDeleteDraft(d.id)}
                            disabled={deleteDraft.isPending}
                          >
                            {deleteDraft.isPending ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Deleting...
                              </>
                            ) : (
                              'Delete'
                            )}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                ))}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-2 border-t mt-2">
                    <p className="text-xs text-muted-foreground">
                      Showing {draftsPage * DRAFTS_PER_PAGE + 1}-{Math.min((draftsPage + 1) * DRAFTS_PER_PAGE, totalDrafts)} of {totalDrafts} drafts
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setDraftsPage(p => Math.max(0, p - 1))}
                        disabled={draftsPage === 0}
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setDraftsPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={draftsPage >= totalPages - 1}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="ai-assisted" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="ai-assisted" className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                AI-Assisted
              </TabsTrigger>
              <TabsTrigger value="manual" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Manual Creation
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="ai-assisted" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>AI-Assisted Course Creation</CardTitle>
                  <CardDescription>
                    Upload your Word, PowerPoint, or PDF documents and let AI create a structured course framework for you.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={handleStartNewDraft} disabled={createDraft.isPending || !organizationId} className="w-full" size="lg" data-testid="start-new-draft" >
                    {createDraft.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    Start AI-Assisted Course
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="manual" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Manual Course Creation</CardTitle>
                  <CardDescription>
                    Create a course framework structure and add content to each lesson manually. 
                    No AI generation - you have full control over lesson content.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="manual-title">Course Title</Label>
                    <Input
                      id="manual-title"
                      placeholder="Enter your course title"
                      value={manualTitle}
                      onChange={(e) => setManualTitle(e.target.value)}
                      data-testid="manual-course-title"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="manual-description">Course Description</Label>
                    <Textarea
                      id="manual-description"
                      placeholder="Describe what learners will achieve in this course"
                      value={manualDescription}
                      onChange={(e) => setManualDescription(e.target.value)}
                      rows={3}
                      data-testid="manual-course-description"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="manual-lesson-count">Number of Content Lessons</Label>
                    <Select 
                      value={manualLessonCount} 
                      onValueChange={setManualLessonCount}
                    >
                      <SelectTrigger id="manual-lesson-count" data-testid="manual-lesson-count">
                        <SelectValue placeholder="Select number of lessons" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                          <SelectItem key={num} value={String(num)}>
                            {num} content lesson{num > 1 ? 's' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Your course will have {totalLessonsPreview} total lessons: Overview + {manualLessonCount} content lesson{parseInt(manualLessonCount) > 1 ? 's' : ''} + Key Takeaways
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="manual-language" className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-primary" />
                      Course Language
                    </Label>
                    <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                      <SelectTrigger id="manual-language" data-testid="manual-language-select">
                        <SelectValue placeholder="Select language" />
                      </SelectTrigger>
                      <SelectContent>
                        {supportedLanguages?.map((lang) => (
                          <SelectItem key={lang.code} value={lang.code}>
                            {lang.name} ({lang.nativeName})
                          </SelectItem>
                        )) || (
                          <SelectItem value="en">English</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      The primary language for this course content
                    </p>
                  </div>

                  <Alert >
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Course Structure Preview:</strong>
                      <ul className="mt-2 space-y-1 text-sm">
                        <li>• <strong>Overview</strong> - Course introduction</li>
                        {parseInt(manualLessonCount) > 0 && (
                          <li>• <strong>Lesson 1{parseInt(manualLessonCount) > 1 ? ` - ${manualLessonCount}` : ''}</strong> - Content lessons</li>
                        )}
                        <li>• <strong>Key Takeaways</strong> - Summary and conclusion</li>
                      </ul>
                      <p className="mt-2 text-xs text-muted-foreground">
                        All lessons will start as "pending" - you can upload documents or add content manually for each lesson.
                      </p>
                    </AlertDescription>
                  </Alert>
                  
                  <Button onClick={handleCreateManualCourse} disabled={createManualCourse.isPending || !organizationId || !manualTitle.trim() || !manualDescription.trim()} className="w-full" size="lg" data-testid="create-manual-course" >
                    {createManualCourse.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating Course...
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Course Framework
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </QuizAdminLayout>
    );
  }

  if (draftLoading) {
    return (
      <QuizAdminLayout title="Create Course from Documents" data-testid="course-document-wizard">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </QuizAdminLayout>
    );
  }

  // If step is complete or invalid, redirect to course edit or show completion view
  if (stepIndex < 0) {
    // Draft is complete - redirect to course edit page
    if (draft?.publishedCourseId) {
      return (
        <div className="container mx-auto px-4 py-8 pt-32">
          <Card>
            <CardHeader>
              <CardTitle>Course Created Successfully!</CardTitle>
              <CardDescription>Your course has been created from this framework.</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-4">
              <Link href={`/course-builder/${draft.publishedCourseId}/edit`}>
                <Button>Edit Course</Button>
              </Link>
              <Link href="/course-builder">
                <Button variant="outline">Back to Course Builder</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      );
    }
    // Invalid state - redirect to course builder
    return (
      <div className="container mx-auto px-4 py-8 pt-32">
        <Card>
          <CardHeader>
            <CardTitle>Draft Completed</CardTitle>
            <CardDescription>This draft has already been completed.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/course-builder">
              <Button>Back to Course Builder</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <QuizAdminLayout title="Create Course from Documents" data-testid="course-document-wizard">
      {isOffline && (
        <Alert className="mb-4">
          <WifiOff className="h-4 w-4" />
          <AlertDescription>
            You're offline. Changes will be saved when you reconnect.
          </AlertDescription>
        </Alert>
      )}

      {hasConflict && (
        <Alert className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Someone else has made changes. Please refresh to see the latest version.</span>
            <Button variant="outline" size="sm" onClick={handleResolveConflict}>
              Refresh
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <Progress value={progressPercent} className="h-2 flex-1" />
          {isSaving && (
            <span className="ml-4 text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving...
            </span>
          )}
        </div>
        <div className="flex justify-between mt-2">
          {STEPS.map((step, idx) => {
            const StepIcon = step.icon;
            return (
              <div
                key={step.id}
                className={`flex items-center gap-2 text-sm transition-colors ${
                  idx <= stepIndex ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <StepIcon className="h-4 w-4" />
                <span className="hidden sm:inline">{step.title}</span>
              </div>
            );
          })}
        </div>
      </div>

      {advisorHint && (
        <Alert className="mb-6">
          <Lightbulb className="h-4 w-4" />
          <AlertDescription>{advisorHint.message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{STEPS[stepIndex].title}</CardTitle>
          <CardDescription>{STEPS[stepIndex].description}</CardDescription>
        </CardHeader>
        <CardContent>
          {currentStep === 'upload' && (
            <UploadStep 
              draftId={draftId} 
              draft={draft}
              onDocumentsChange={() => refetchDraft()}
              onUpdate={handleUpdate}
              onDescriptionChange={setLocalCourseDescription}
            />
          )}
          {currentStep === 'select_content' && (
            <ContentSelectStep 
              draftId={draftId} 
              draft={draft} 
              onUpdate={handleUpdate}
              onContinue={async () => {
                // Clear any stale autosave payload from previous steps before entering Generate.
                setPendingUpdates(null);
                await refetchDraft();
                setCurrentStep('generate');
              }}
            />
          )}
          {currentStep === 'generate' && (
            <GenerateStep 
              draftId={draftId} 
              draft={draft}
              onUpdate={handleUpdate}
              onGenerated={() => {
                refetchDraft();
                setCurrentStep('review');
              }}
            />
          )}
          {currentStep === 'review' && (
            <ReviewStep 
              draftId={draftId} 
              draft={draft}
              onUpdate={handleUpdate}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between mt-6">
        <Button variant="outline" onClick={handleBack} disabled={stepIndex === 0} data-testid="wizard-back" >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={handleNext} disabled={!canProceed() || stepIndex === STEPS.length - 1} data-testid="wizard-next" >
          Next <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </QuizAdminLayout>
  );
}
