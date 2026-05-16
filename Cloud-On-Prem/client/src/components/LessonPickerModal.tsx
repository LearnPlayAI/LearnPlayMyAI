import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, BookOpen, Loader2, Link2, Calendar, Image } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

const Dialog = ({ open, children }: any) => (open ? <div className="space-y-3">{children}</div> : null);
const DialogContent = ({ className, children }: any) => <section className={className}>{children}</section>;
const DialogHeader = ({ className, children }: any) => <div className={className}>{children}</div>;
const DialogTitle = ({ className, children }: any) => <h3 className={className}>{children}</h3>;
const DialogDescription = ({ className, children }: any) => <p className={className}>{children}</p>;
const DialogBody = ({ className, children }: any) => <div className={className}>{children}</div>;
const DialogFooter = ({ className, children }: any) => <div className={className}>{children}</div>;

interface AvailableLesson {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
  isPublished: boolean;
  gradeLevel: string | null;
  subject: string | null;
}

interface PaginationInfo {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasMore: boolean;
}

interface AvailableLessonsResponse {
  lessons: AvailableLesson[];
  pagination: PaginationInfo;
}

interface LessonPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  topicId?: string;
  topicName?: string;
  topicOrder?: number;
  onLessonAttached?: () => void;
}

export function LessonPickerModal({
  isOpen,
  onClose,
  courseId,
  topicId,
  topicName,
  topicOrder,
  onLessonAttached
}: LessonPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [allLessons, setAllLessons] = useState<AvailableLesson[]>([]);
  const { toast } = useToast();

  const { data, isLoading, isFetching } = useQuery<AvailableLessonsResponse>({
    queryKey: ['/api/admin/courses', courseId, 'available-lessons', page],
    queryFn: async () => {
      const response = await fetch(
        `/api/admin/courses/${courseId}/available-lessons?page=${page}&limit=20`,
        { credentials: 'include' }
      );
      if (!response.ok) {
        throw new Error('Failed to load available lessons');
      }
      return response.json();
    },
    enabled: isOpen && !!courseId,
  });

  const lessons = useMemo(() => {
    if (!data?.lessons) return allLessons;
    if (page === 1) return data.lessons;
    const existingIds = new Set(allLessons.map(l => l.id));
    const newLessons = data.lessons.filter(l => !existingIds.has(l.id));
    return [...allLessons, ...newLessons];
  }, [data?.lessons, page, allLessons]);

  useMemo(() => {
    if (data?.lessons) {
      if (page === 1) {
        setAllLessons(data.lessons);
      } else {
        setAllLessons(prev => {
          const existingIds = new Set(prev.map(l => l.id));
          const newLessons = data.lessons.filter(l => !existingIds.has(l.id));
          return [...prev, ...newLessons];
        });
      }
    }
  }, [data?.lessons, page]);

  const filteredLessons = useMemo(() => {
    if (!searchQuery.trim()) return lessons;
    const query = searchQuery.toLowerCase();
    return lessons.filter(lesson =>
      lesson.title.toLowerCase().includes(query) ||
      lesson.description?.toLowerCase().includes(query) ||
      lesson.subject?.toLowerCase().includes(query)
    );
  }, [lessons, searchQuery]);

  const attachLessonMutation = useMutation({
    mutationFn: async (lessonId: string) => {
      return apiRequest(`/api/admin/courses/${courseId}/lessons/${lessonId}/link`, {
        method: 'POST',
        body: JSON.stringify({
          topicName: topicName || 'General',
          topicOrder: topicOrder,
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: 'Lesson attached',
        description: 'The lesson has been successfully attached to the course.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/courses', courseId, 'available-lessons'] });
      onLessonAttached?.();
      handleClose();
    },
    onError: (error: any) => {
      const errorMessage = error.message || 'Failed to attach lesson';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    },
  });

  const handleLoadMore = () => {
    if (data?.pagination.hasMore && !isFetching) {
      setPage(prev => prev + 1);
    }
  };

  const handleClose = () => {
    setSearchQuery('');
    setPage(1);
    setAllLessons([]);
    onClose();
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'Unknown date';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-[min(95vw,42rem)] max-h-[85vh] flex flex-col bg-card border-primary/30">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-base sm:text-xl font-bold text-primary/80 flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            Attach Existing Lesson
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {topicName
              ? `Select a lesson to attach to "${topicName}"`
              : 'Select a lesson to attach to this course'}
          </DialogDescription>
        </DialogHeader>

        <div className="relative flex-shrink-0 mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search lessons..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 min-h-[48px] sm:min-h-[44px] bg-muted border-border text-foreground placeholder:text-muted-foreground focus:border-primary"
            data-testid="input-search-lessons"
          />
        </div>

        <DialogBody className="mt-3 sm:mt-4">
          {isLoading && page === 1 ? (
            <div className="space-y-3" data-testid="loading-lessons">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex gap-4 p-4 rounded-lg bg-muted/50 border border-border">
                  <Skeleton className="h-16 w-24 rounded-md bg-muted" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-3/4 bg-muted" />
                    <Skeleton className="h-4 w-1/2 bg-muted" />
                    <Skeleton className="h-4 w-1/4 bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredLessons.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="empty-lessons">
              <div className="p-4 rounded-full bg-muted/50 mb-4">
                <BookOpen className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                {searchQuery ? 'No matching lessons' : 'No available lessons'}
              </h3>
              <p className="text-muted-foreground text-sm mt-1 max-w-md">
                {searchQuery
                  ? 'Try adjusting your search terms'
                  : 'There are no lessons available to attach. All lessons may already be linked to this course.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredLessons.map((lesson) => (
                <div
                  key={lesson.id}
                  className="flex flex-col sm:flex-row gap-4 p-4 rounded-lg bg-muted/50 border border-border hover:border-primary/50 transition-colors"
                  data-testid={`lesson-item-${lesson.id}`}
                >
                  {lesson.thumbnailUrl ? (
                    <div className="h-20 w-28 sm:h-16 sm:w-24 rounded-md overflow-hidden bg-muted flex-shrink-0">
                      <img
                        src={lesson.thumbnailUrl}
                        alt={lesson.title}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          target.parentElement?.classList.add('flex', 'items-center', 'justify-center');
                          const icon = document.createElement('div');
                          icon.innerHTML = '<svg class="h-6 w-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>';
                          target.parentElement?.appendChild(icon.firstElementChild!);
                        }}
                      />
                    </div>
                  ) : (
                    <div className="h-20 w-28 sm:h-16 sm:w-24 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                      <Image className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-medium text-foreground truncate" data-testid={`lesson-title-${lesson.id}`}>
                        {lesson.title}
                      </h4>
                      <Badge variant="outline" className={`flex-shrink-0 ${ lesson.isPublished ? 'bg-success/20 text-success border-[var(--success)]/30' : 'bg-[var(--game-gold)]/20 text-glow-gold border-[var(--game-gold)]/30' }`} data-testid={`lesson-status-${lesson.id}`} >
                        {lesson.isPublished ? 'Published' : 'Draft'}
                      </Badge>
                    </div>

                    {lesson.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {lesson.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(lesson.createdAt)}
                      </span>
                      {lesson.subject && (
                        <span className="text-muted-foreground">{lesson.subject}</span>
                      )}
                      {lesson.gradeLevel && (
                        <span className="text-muted-foreground">Grade {lesson.gradeLevel}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-end gap-2 sm:ml-2 mt-3 sm:mt-0">
                    <Button size="sm" onClick={() => attachLessonMutation.mutate(lesson.id)}
                      disabled={attachLessonMutation.isPending}
                      className="w-full sm:w-auto min-h-[48px] sm:min-h-[44px] bg-primary hover:bg-primary/90 text-btn-primary-foreground"
                      data-testid={`button-attach-lesson-${lesson.id}`}
                    >
                      {attachLessonMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Link2 className="h-4 w-4 mr-1" />
                          Attach
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}

              {data?.pagination.hasMore && !searchQuery && (
                <div className="flex justify-center pt-4 pb-2">
                  <Button variant="outline" onClick={handleLoadMore} disabled={isFetching} className="w-full sm:w-auto min-h-[48px] sm:min-h-[44px]" data-testid="button-load-more-lessons" >
                    {isFetching ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        Load More ({data.pagination.totalCount - lessons.length} remaining)
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogBody>

        <DialogFooter className="flex-col-reverse sm:flex-row">
          <p className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left sm:flex-1">
            {!isLoading && filteredLessons.length > 0 && (
              <>
                Showing {filteredLessons.length}
                {data?.pagination && !searchQuery && (
                  <> of {data.pagination.totalCount}</>
                )} lesson{filteredLessons.length !== 1 ? 's' : ''}
              </>
            )}
          </p>
          <Button variant="outline" onClick={handleClose} className="w-full sm:w-auto min-h-[48px] sm:min-h-[44px]" data-testid="button-cancel-picker" >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
