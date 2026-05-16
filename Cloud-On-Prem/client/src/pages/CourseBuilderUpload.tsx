import { useState, useEffect } from 'react';
import { Link, useRoute, useLocation } from 'wouter';
import { ArrowLeft, Upload, FileText, Video, Loader2, CheckCircle, AlertCircle, FileType2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/hooks/use-user';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/queryClient';
import QuizAdminLayout from '@/components/QuizAdminLayout';

interface Topic {
  id: string;
  order: number;
  name: string;
  description?: string;
  isOverview?: boolean;
  lessonId: string | null;
}

interface CourseFramework {
  id: string;
  courseId: string;
  topics: Topic[];
}

interface Course {
  id: string;
  title: string;
  description?: string;
}

type FileType = 'pptx' | 'document' | 'video';

const documentUploadAccept = '.doc,.docx,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf';

const getSelectedFileLabel = (fileType: FileType) => {
  if (fileType === 'pptx') return 'PowerPoint File';
  if (fileType === 'document') return 'Word or PDF File';
  return 'Video File';
};

const getSelectedFilePrompt = (fileType: FileType) => {
  if (fileType === 'pptx') return 'a PowerPoint file';
  if (fileType === 'document') return 'a Word or PDF file';
  return 'a video file';
};

const getSelectedFileHint = (fileType: FileType) => {
  if (fileType === 'pptx') return '.pptx files (no size limit)';
  if (fileType === 'document') return '.doc, .docx, or .pdf files';
  return '.mp4 files (no size limit)';
};

const getAcceptForFileType = (fileType: FileType) => {
  if (fileType === 'pptx') return '.pptx';
  if (fileType === 'document') return documentUploadAccept;
  return '.mp4';
};

export default function CourseBuilderUpload() {
  const [, params] = useRoute('/course-builder/:courseId/upload/:topicOrder');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useUser();
  const { impersonatedOrganization, effectiveOrganizationId } = useAuth();
  const effectiveOrgId = impersonatedOrganization?.id || effectiveOrganizationId || user?.organizationId;
  const queryClient = useQueryClient();
  
  const courseId = params?.courseId;
  const topicOrder = params?.topicOrder ? parseInt(params.topicOrder, 10) : null;
  
  // Parse lessonId and returnTo from URL query params for direct lesson replacement
  // Use useMemo to ensure React-compatible parsing that updates on navigation
  const urlLessonId = (() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      return searchParams.get('lessonId');
    }
    return null;
  })();

  const uploadMode = (() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      return searchParams.get('mode');
    }
    return null;
  })();
  
  // Parse returnTo for navigation after successful upload (e.g., back to lesson viewer)
  const returnTo = (() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      return searchParams.get('returnTo');
    }
    return null;
  })();
  
  const [fileType, setFileType] = useState<FileType>('pptx');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const { data: framework, isLoading: frameworkLoading } = useQuery<CourseFramework>({
    queryKey: ['/api/courses', courseId, 'framework'],
    queryFn: async () => {
      const response = await fetch(`/api/courses/${courseId}/framework`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to load course framework');
      return response.json();
    },
    enabled: !!courseId,
  });

  const { data: course } = useQuery<Course>({
    queryKey: ['/api/courses', courseId, 'details'],
    queryFn: async () => {
      const response = await fetch(`/api/courses/${courseId}`);
      if (!response.ok) throw new Error('Failed to load course');
      return response.json();
    },
    enabled: !!courseId,
  });

  const topic = framework?.topics?.find(t => t.order === topicOrder);
  const isAddMode = uploadMode === 'add';
  const isReplacement = !!topic?.lessonId && !isAddMode;
  
  // Fetch existing lesson details to check if it has a PPTX and/or video
  const { data: existingLesson } = useQuery<{
    id: string;
    storageKey?: string;  // PPTX is stored in storageKey field
    videoStorageKey?: string;  // Video is stored in videoStorageKey field
    generationMode?: string;
  }>({
    queryKey: ['/api/lessons', topic?.lessonId],
    queryFn: async () => {
      const response = await fetch(`/api/lessons/${topic?.lessonId}?organizationId=${effectiveOrgId}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to load lesson');
      return response.json();
    },
    enabled: !!topic?.lessonId && !!effectiveOrgId,
  });
  
  // Video upload is only available if a lesson with PPTX already exists
  // because the PPTX is required for quiz generation
  // Check if the lesson has an actual PPTX file (storageKey contains the Object Storage path)
  const hasPptx = !!existingLesson?.storageKey;
  const hasVideo = !!existingLesson?.videoStorageKey;
  const canUploadVideo = isReplacement && hasPptx;

  useEffect(() => {
    if (topic) {
      setTitle(topic.name);
      setDescription(topic.description || '');
    }
  }, [topic]);
  
  // Reset to PPTX if video is not available
  useEffect(() => {
    if (!canUploadVideo && fileType === 'video') {
      setFileType('pptx');
    }
  }, [canUploadVideo, fileType]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (fileType === 'pptx' && !file.name.endsWith('.pptx')) {
        toast({
          variant: "destructive",
          title: "Invalid file type",
          description: "Please select a PPTX file",
        });
        return;
      }
      if (fileType === 'video' && !file.name.endsWith('.mp4')) {
        toast({
          variant: "destructive",
          title: "Invalid file type",
          description: "Please select an MP4 video file",
        });
        return;
      }
      if (fileType === 'document' && !file.name.toLowerCase().match(/\.(doc|docx|pdf)$/)) {
        toast({
          variant: "destructive",
          title: "Invalid file type",
          description: "Please select a Word document or PDF file",
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  // Upload PPTX as a NEW lesson (used when no video to preserve)
  const uploadPptxAsNewLesson = async (): Promise<any> => {
    if (!selectedFile || !effectiveOrgId) {
      throw new Error("Missing file or organization");
    }

    const formData = new FormData();
    formData.append("pptxFile", selectedFile);
    formData.append("title", title);
    if (description) formData.append("description", description);
    formData.append("organizationId", effectiveOrgId);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("loadstart", () => {
        setUploadProgress((prev) => Math.max(prev, 1));
      });

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(percentComplete);
        }
      });

      // Browsers can stop emitting granular progress events near the beginning
      // while the server is still receiving bytes; keep UI moving to processing state.
      xhr.upload.addEventListener("loadend", () => {
        setUploadProgress((prev) => Math.max(prev, 95));
      });

      xhr.addEventListener("load", () => {
        setUploadProgress(100);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (e) {
            reject(new Error("Invalid response from server"));
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.error || "Failed to upload PPTX"));
          } catch (e) {
            reject(new Error("Failed to upload PPTX"));
          }
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
      xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

      xhr.open("POST", "/api/lessons/manual-upload");
      xhr.send(formData);
    });
  };

  // Upload PPTX to an EXISTING lesson (used when video exists and we want to preserve it)
  const uploadPptxToExistingLesson = async (lessonId: string): Promise<any> => {
    if (!selectedFile || !effectiveOrgId) {
      throw new Error("Missing file or organization");
    }

    const formData = new FormData();
    formData.append("pptxFile", selectedFile);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("loadstart", () => {
        setUploadProgress((prev) => Math.max(prev, 1));
      });

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(percentComplete);
        }
      });

      xhr.upload.addEventListener("loadend", () => {
        setUploadProgress((prev) => Math.max(prev, 95));
      });

      xhr.addEventListener("load", () => {
        setUploadProgress(100);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (e) {
            reject(new Error("Invalid response from server"));
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.error || "Failed to upload PPTX"));
          } catch (e) {
            reject(new Error("Failed to upload PPTX"));
          }
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
      xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

      xhr.open("POST", `/api/lessons/${lessonId}/upload?organizationId=${effectiveOrgId}`);
      xhr.send(formData);
    });
  };

  const uploadVideo = async (lessonId: string): Promise<any> => {
    if (!selectedFile || !effectiveOrgId) {
      throw new Error("Missing file or organization");
    }

    const formData = new FormData();
    formData.append("videoFile", selectedFile);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("loadstart", () => {
        setUploadProgress((prev) => Math.max(prev, 1));
      });

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(percentComplete);
        }
      });

      xhr.upload.addEventListener("loadend", () => {
        setUploadProgress((prev) => Math.max(prev, 95));
      });

      xhr.addEventListener("load", () => {
        setUploadProgress(100);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (e) {
            reject(new Error("Invalid response from server"));
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.error || "Failed to upload video"));
          } catch (e) {
            reject(new Error("Failed to upload video"));
          }
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
      xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

      xhr.open("POST", `/api/lessons/${lessonId}/upload-video?organizationId=${effectiveOrgId}`);
      xhr.send(formData);
    });
  };

  const uploadDocumentAsNewLesson = async (): Promise<any> => {
    if (!selectedFile || !effectiveOrgId) {
      throw new Error("Missing file or organization");
    }

    const formData = new FormData();
    formData.append("documentFile", selectedFile);
    formData.append("title", title);
    if (description) formData.append("description", description);
    formData.append("organizationId", effectiveOrgId);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("loadstart", () => {
        setUploadProgress((prev) => Math.max(prev, 1));
      });

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(percentComplete);
        }
      });

      xhr.upload.addEventListener("loadend", () => {
        setUploadProgress((prev) => Math.max(prev, 95));
      });

      xhr.addEventListener("load", () => {
        setUploadProgress(100);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (e) {
            reject(new Error("Invalid response from server"));
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.error || "Failed to upload document"));
          } catch (e) {
            reject(new Error("Failed to upload document"));
          }
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
      xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

      xhr.open("POST", "/api/lessons/source-document-upload");
      xhr.send(formData);
    });
  };

  const linkLessonToCourse = async (lessonId: string) => {
    if (!courseId || !topic) return;

    await apiRequest(`/api/courses/${courseId}/lessons/${lessonId}`, {
      method: 'POST',
      body: JSON.stringify({
        topicName: topic.name,
        topicOrder: topic.order,
        replacePreviousLessonId: isReplacement ? topic.lessonId : undefined,
      }),
    });
  };

  const archivePreviousLesson = async () => {
    if (!isReplacement || !topic?.lessonId || !user?.organizationId) return;

    try {
      await apiRequest(`/api/lessons/${topic.lessonId}/archive`, {
        method: 'POST',
        body: JSON.stringify({ 
          organizationId: effectiveOrgId,
          deleteFiles: true, // Permanently delete files since lesson is being replaced
        }),
      });
      console.log(`Archived previous lesson: ${topic.lessonId}`);
    } catch (error) {
      console.error('Failed to archive previous lesson:', error);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !title.trim()) {
      toast({
        variant: "destructive",
        title: "Missing information",
        description: "Please provide a title and select a file",
      });
      return;
    }
    
    // Guard: ensure org context is available before uploading
    if (!effectiveOrgId) {
      toast({
        variant: "destructive",
        title: "Loading...",
        description: "Please wait for organization context to load",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // When urlLessonId is present, we're replacing an existing lesson directly
      if (urlLessonId) {
        if (fileType === 'document') {
          throw new Error("Use Lesson Actions to upload source documents to an existing lesson");
        }
        if (fileType === 'pptx') {
          await uploadPptxToExistingLesson(urlLessonId);
          
          queryClient.invalidateQueries({ queryKey: ['/api/lessons', urlLessonId] });
          queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'framework'] });
          queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lessons'] });
          queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });

          toast({
            title: "Presentation replaced",
            description: "Your presentation has been updated successfully.",
          });
        } else {
          await uploadVideo(urlLessonId);

          queryClient.invalidateQueries({ queryKey: ['/api/lessons', urlLessonId] });
          queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lessons'] });
          queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });

          toast({
            title: "Video uploaded",
            description: "Your video has been added to the lesson.",
          });
        }
        
        // Navigate back to returnTo location if provided, otherwise default to course lessons
        const destination = returnTo || `/course-builder/${courseId}/lessons`;
        setLocation(destination);
        return;
      }
      
      // Standard flow: use topic-based logic for new lessons or framework-based replacement
      if (fileType === 'pptx') {
        // PPTX upload strategy depends on whether existing lesson has a video
        if (isReplacement && hasVideo && topic?.lessonId) {
          // Lesson has a video - upload PPTX to EXISTING lesson to preserve video
          // The storePPTX function handles versioning (deletes old PPTX, keeps video intact)
          await uploadPptxToExistingLesson(topic.lessonId);
          
          queryClient.invalidateQueries({ queryKey: ['/api/lessons', topic.lessonId] });
          queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'framework'] });
          queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lessons'] });
          queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });

          toast({
            title: "Presentation replaced",
            description: "Your presentation has been updated. The video walkthrough has been preserved.",
          });
        } else {
          // No video to preserve - create new lesson, link, archive old
          const lesson = await uploadPptxAsNewLesson();
          const lessonId = lesson.id;

          // Link new lesson to course (this updates the framework)
          await linkLessonToCourse(lessonId);

          // Archive old lesson ONLY after new one is successfully linked
          if (isReplacement) {
            await archivePreviousLesson();
          }

          queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'framework'] });
          queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lessons'] });
          queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });
          queryClient.invalidateQueries({ queryKey: ['/api/lessons'] });

          toast({
            title: isReplacement ? "Lesson replaced" : "Lesson uploaded",
            description: "Your presentation has been uploaded and linked to the course.",
          });
        }
      } else if (fileType === 'document') {
        if (isReplacement) {
          throw new Error("Use Lesson Actions to upload source documents to an existing lesson");
        }

        const lesson = await uploadDocumentAsNewLesson();
        const lessonId = lesson.id;

        await linkLessonToCourse(lessonId);

        queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'framework'] });
        queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lessons'] });
        queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });
        queryClient.invalidateQueries({ queryKey: ['/api/lessons'] });

        toast({
          title: "Source material uploaded",
          description: "The document text was extracted into the new lesson Source DB.",
        });
      } else {
        // Video upload: Add video to EXISTING lesson (the one with PPTX)
        // No need to create new lesson, link, or archive - just add video
        if (!topic?.lessonId) {
          throw new Error("No existing lesson to add video to");
        }

        await uploadVideo(topic.lessonId);

        queryClient.invalidateQueries({ queryKey: ['/api/lessons', topic.lessonId] });
        queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lessons'] });
        queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'lesson-details'] });

        toast({
          title: "Video uploaded",
          description: "Your video has been added to the lesson.",
        });
      }

      setLocation(`/course-builder/${courseId}/lessons`);
    } catch (error) {
      console.error('Upload failed:', error);
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: (error as Error).message || "Failed to upload file",
      });
    } finally {
      setIsUploading(false);
    }
  };

  if (frameworkLoading) {
    return (
      <QuizAdminLayout 
        title="Upload Lesson" 
        description="Loading..."
        activeSection="lessons"
      >
        <div className="flex items-center justify-center min-h-[300px] sm:min-h-[400px] p-[var(--container-padding)]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" data-testid="loading-spinner" />
        </div>
      </QuizAdminLayout>
    );
  }

  if (!topic) {
    return (
      <QuizAdminLayout 
        title="Upload Lesson" 
        description="Topic not found"
        activeSection="lessons"
      >
        <Card className="bg-destructive/10 border-[var(--destructive)]/30 m-[var(--container-padding)]">
          <CardContent className="p-[var(--card-padding)]">
            <div className="flex flex-col sm:flex-row items-start gap-[var(--space-sm)]">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
              <div className="space-y-[var(--space-sm)]">
                <h3 
                  className="font-semibold text-destructive"
                  style={{ fontSize: 'var(--text-base)' }}
                  data-testid="text-error-heading"
                >
                  Topic not found
                </h3>
                <p className="text-destructive/70 text-[length:var(--text-sm)]">
                  The requested topic could not be found in the course framework.
                </p>
                <Link href={`/course-builder/${courseId}/lessons`}>
                  <Button variant="outline" className="mt-[var(--space-sm)] min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="button-back-to-builder" >
                    Back to Course Builder
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </QuizAdminLayout>
    );
  }

  return (
    <QuizAdminLayout 
      title={isReplacement ? "Replace Lesson" : "Upload Lesson"} 
      description={`${course?.title || 'Course'} - ${topic.name}`}
      activeSection="lessons"
    >
      <div className="space-y-[var(--space-lg)] pt-24 sm:pt-32 p-[var(--container-padding)]">
        <Link href={`/course-builder/${courseId}/lessons`}>
          <Button variant="outline" className="min-h-[44px] touch-manipulation" data-testid="button-back" >
            <ArrowLeft className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Back to Course Lessons</span>
            <span className="sm:hidden">Back</span>
          </Button>
        </Link>

        <Card className="bg-card/50 border-border">
          <CardHeader className="p-[var(--card-padding)]">
            <CardTitle 
              className="text-foreground flex items-center gap-[var(--space-sm)]"
              style={{ fontSize: 'var(--text-xl)' }}
              data-testid="text-upload-heading"
            >
              <Upload className="h-5 w-5 text-secondary flex-shrink-0" />
              <span>{isReplacement ? 'Replace Lesson Content' : 'Add Lesson Source Material'}</span>
            </CardTitle>
            <CardDescription className="text-muted-foreground text-[length:var(--text-sm)]">
              {isReplacement 
                ? 'Upload a new file to replace the existing lesson content. The previous version will be archived.'
                : 'Upload source material for this new lesson. Word and PDF files are extracted into the Source DB; PowerPoint files are saved as lesson presentations.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-[var(--space-lg)] p-[var(--card-padding)] pt-0">
            <div className="space-y-[var(--space-sm)]">
              <Label htmlFor="title" className="text-foreground text-[length:var(--text-sm)]">Lesson Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter lesson title"
                className="bg-input border-border text-foreground min-h-[44px] touch-manipulation"
                data-testid="input-lesson-title"
              />
            </div>

            <div className="space-y-[var(--space-sm)]">
              <Label htmlFor="description" className="text-foreground text-[length:var(--text-sm)]">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter lesson description"
                className="bg-input border-border text-foreground min-h-[100px] touch-manipulation"
                data-testid="input-lesson-description"
              />
            </div>

            <div className="space-y-[var(--space-sm)]">
              <Label className="text-foreground text-[length:var(--text-sm)]">File Type</Label>
              <div className="flex flex-col sm:flex-row gap-[var(--space-sm)] sm:gap-[var(--space-md)]">
                <Button type="button" variant={fileType === 'pptx' ? 'default' : 'outline'} onClick={() => {
                    setFileType('pptx');
                    setSelectedFile(null);
                  }}
                  className={`min-h-[44px] touch-manipulation w-full sm:w-auto ${fileType === 'pptx' 
                    ? 'bg-secondary hover:bg-secondary/90 text-secondary-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent'}`}
                  data-testid="button-select-pptx"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  PowerPoint (.pptx)
                </Button>
                {!isReplacement && (
                  <Button type="button" variant={fileType === 'document' ? 'default' : 'outline'} onClick={() => {
                      setFileType('document');
                      setSelectedFile(null);
                    }}
                    className={`min-h-[44px] touch-manipulation w-full sm:w-auto ${fileType === 'document'
                      ? 'bg-secondary hover:bg-secondary/90 text-secondary-foreground'
                      : 'border-border text-muted-foreground hover:bg-accent'}`}
                    data-testid="button-select-document"
                  >
                    <FileType2 className="h-4 w-4 mr-2" />
                    Document (.doc, .docx, .pdf)
                  </Button>
                )}
                {canUploadVideo ? (
                  <Button type="button" variant={fileType === 'video' ? 'default' : 'outline'} onClick={() => {
                      setFileType('video');
                      setSelectedFile(null);
                    }}
                    className={`min-h-[44px] touch-manipulation w-full sm:w-auto ${fileType === 'video' 
                      ? 'bg-secondary hover:bg-secondary/90 text-secondary-foreground' 
                      : 'border-border text-muted-foreground hover:bg-accent'}`}
                    data-testid="button-select-video"
                  >
                    <Video className="h-4 w-4 mr-2" />
                    Video (.mp4)
                  </Button>
                ) : (
                  <div className="flex items-center text-muted-foreground text-[length:var(--text-sm)] py-[var(--space-sm)]">
                    <Video className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span>Video upload available after PPTX is uploaded</span>
                  </div>
                )}
              </div>
              {isReplacement && !hasPptx && (
                <p className="text-muted-foreground text-[length:var(--text-sm)]">
                  This lesson was AI-generated without a PPTX file. Upload a PowerPoint file first to enable video uploads (PPTX is required for quiz generation).
                </p>
              )}
              {!isReplacement && (
                <p className="text-muted-foreground text-[length:var(--text-sm)]">
                  Upload a document to populate the Source DB, or upload a PowerPoint deck to attach a presentation. Video upload will be available after a PPTX exists.
                </p>
              )}
            </div>

            <div className="space-y-[var(--space-sm)]">
              <Label htmlFor="file" className="text-foreground text-[length:var(--text-sm)]">
                Select {getSelectedFileLabel(fileType)}
              </Label>
              <div 
                className="border-2 border-dashed border-border rounded-lg p-[var(--space-lg)] sm:p-[var(--space-xl)] text-center hover:border-muted-foreground transition-colors min-h-[120px] flex items-center justify-center"
                data-testid="upload-drop-zone"
              >
                <input
                  type="file"
                  id="file"
                  accept={getAcceptForFileType(fileType)}
                  onChange={handleFileChange}
                  className="hidden"
                  data-testid="input-file"
                />
                <label 
                  htmlFor="file" 
                  className="cursor-pointer min-h-[44px] touch-manipulation flex items-center justify-center w-full"
                >
                  {selectedFile ? (
                    <div className="flex flex-col items-center gap-[var(--space-sm)]">
                      <CheckCircle className="h-8 w-8 sm:h-10 sm:w-10 text-success" />
                      <span className="text-success font-medium text-[length:var(--text-sm)] sm:text-[length:var(--text-base)] break-all px-2">
                        {selectedFile.name}
                      </span>
                      <span className="text-muted-foreground text-[length:var(--text-xs)] sm:text-[length:var(--text-sm)]">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                      </span>
                      <span className="text-muted-foreground text-[length:var(--text-xs)] sm:text-[length:var(--text-sm)]">
                        Tap to change file
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-[var(--space-sm)]">
                      <Upload className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
                      <span className="text-foreground text-[length:var(--text-sm)] sm:text-[length:var(--text-base)]">
                        Tap to select {getSelectedFilePrompt(fileType)}
                      </span>
                      <span className="text-muted-foreground text-[length:var(--text-xs)] sm:text-[length:var(--text-sm)]">
                        {getSelectedFileHint(fileType)}
                      </span>
                    </div>
                  )}
                </label>
              </div>
            </div>

            {isUploading && (
              <div className="space-y-[var(--space-sm)]">
                <div className="flex justify-between text-[length:var(--text-sm)]">
                  <span className="text-muted-foreground">{uploadProgress >= 95 ? "Processing..." : "Uploading..."}</span>
                  <span className="text-foreground">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" data-testid="progress-upload" />
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-[var(--space-sm)] pt-[var(--space-md)]">
              <Link href={`/course-builder/${courseId}/lessons`} className="w-full sm:w-auto">
                <Button variant="outline" className="min-h-[44px] touch-manipulation w-full" disabled={isUploading} data-testid="button-cancel" >
                  Cancel
                </Button>
              </Link>
              <Button onClick={handleUpload} disabled={!selectedFile || !title.trim() || isUploading} variant="default" className="flex-1 min-h-[44px] touch-manipulation" data-testid="button-upload" >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {uploadProgress >= 95 ? "Processing..." : "Uploading..."} {uploadProgress}%
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    {isReplacement ? 'Replace Lesson' : 'Add Source Material'}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </QuizAdminLayout>
  );
}
