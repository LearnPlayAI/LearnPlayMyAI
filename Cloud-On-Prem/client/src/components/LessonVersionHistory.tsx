import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { 
  useLessonVersions, 
  useRestoreLessonVersion,
} from "@/hooks/useLessonVersions";
import { 
  History, 
  RotateCcw, 
  Clock, 
  User,
  FileEdit,
  AlertCircle,
  Globe,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { tzFormatDistanceToNow } from '@/utils/timezoneRuntime';


interface LanguageVariant {
  code: string;
  name: string;
  nativeName: string;
  lessonId: string;
  isDefault: boolean;
  hasPptx: boolean;
  hasWordDoc: boolean;
  hasContent: boolean;
  quizIds: string[];
}

interface LessonVersionHistoryProps {
  lessonId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function LessonVersionHistory({ lessonId, open, onOpenChange }: LessonVersionHistoryProps) {
  const { toast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const isControlled = open !== undefined;
  const effectiveOpen = isControlled ? open : sheetOpen;
  const setEffectiveOpen = isControlled ? (onOpenChange || (() => {})) : setSheetOpen;
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [versionToRestore, setVersionToRestore] = useState<string | null>(null);
  const [selectedLangLessonId, setSelectedLangLessonId] = useState(lessonId);

  // Fetch language variants
  const { data: languages } = useQuery<LanguageVariant[]>({
    queryKey: ["/api/lessons", lessonId, "languages"],
    queryFn: async () => {
      const response = await fetch(
        `/api/lessons/${lessonId}/languages?details=true`
      );
      if (!response.ok) throw new Error("Failed to fetch languages");
      return response.json();
    },
    enabled: effectiveOpen,
  });

  // Reset selectedLangLessonId when sheet closes
  useEffect(() => {
    if (!effectiveOpen) {
      setSelectedLangLessonId(lessonId);
    }
  }, [effectiveOpen, lessonId]);

  // Keep language selection aligned with the active lesson while the sheet stays open.
  useEffect(() => {
    if (!effectiveOpen) return;
    setSelectedLangLessonId(lessonId);
  }, [effectiveOpen, lessonId]);

  useEffect(() => {
    if (!effectiveOpen || !languages || languages.length === 0) return;
    const isValidSelection = languages.some((lang) => lang.lessonId === selectedLangLessonId);
    if (isValidSelection) return;
    const defaultLanguage = languages.find((lang) => lang.isDefault) || languages[0];
    setSelectedLangLessonId(defaultLanguage?.lessonId || lessonId);
  }, [effectiveOpen, languages, selectedLangLessonId, lessonId]);

  const { data: versions, isLoading } = useLessonVersions(selectedLangLessonId);
  const restoreMutation = useRestoreLessonVersion(selectedLangLessonId);

  const handleRestore = async () => {
    if (!versionToRestore) return;

    try {
      await restoreMutation.mutateAsync(versionToRestore);
      
      toast({
        title: "Version Restored",
        description: "The lesson has been restored to the selected version.",
      });
      
      setRestoreDialogOpen(false);
      setVersionToRestore(null);
    } catch (error: any) {
      toast({
        title: "Restore Failed",
        description: error.message || "Failed to restore version.",
        variant: "destructive",
      });
    }
  };

  const openRestoreDialog = (versionId: string) => {
    setVersionToRestore(versionId);
    setRestoreDialogOpen(true);
  };

  return (
    <>
      <Sheet open={effectiveOpen} onOpenChange={setEffectiveOpen}>
        {!isControlled && (
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="min-h-[48px] sm:min-h-[44px] touch-manipulation" data-testid="button-version-history">
              <History className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Version History</span>
              <span className="sm:hidden">History</span>
            </Button>
          </SheetTrigger>
        )}
        <SheetContent className="w-full sm:max-w-2xl p-4 sm:p-6">
          <SheetHeader>
            <SheetTitle className="text-base sm:text-lg">Version History</SheetTitle>
            <SheetDescription className="text-sm">
              View and restore previous versions of this lesson
            </SheetDescription>
          </SheetHeader>

          {/* Language Selector */}
          {languages && languages.length >= 2 && (
            <div className="mt-4 sm:mt-6 pb-4 border-b">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <label className="text-sm font-medium">Language</label>
              </div>
              <Select value={selectedLangLessonId} onValueChange={setSelectedLangLessonId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((lang) => (
                    <SelectItem key={lang.lessonId} value={lang.lessonId}>
                      <div className="flex items-center gap-2">
                        <span>{lang.name}</span>
                        {lang.nativeName !== lang.name && (
                          <span className="text-xs text-muted-foreground">
                            ({lang.nativeName})
                          </span>
                        )}
                        {lang.isDefault && (
                          <Badge variant="secondary" className="text-xs ml-2">
                            Default
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Selected language badge */}
              {languages && (
                <div className="mt-3 flex items-center gap-2">
                  <Globe className="w-3 h-3 text-primary" />
                  <Badge variant="outline" className="text-xs">
                    {languages.find((l) => l.lessonId === selectedLangLessonId)?.name || "Unknown"}
                  </Badge>
                </div>
              )}
            </div>
          )}

          <ScrollArea className="h-[calc(100vh-10rem)] sm:h-[calc(100vh-8rem)] mt-4 sm:mt-6">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ))}
              </div>
            ) : !versions || versions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <FileEdit className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-lg font-medium">No Version History</p>
                <p className="text-sm mt-2">
                  Versions are automatically created when you make changes to the lesson.
                </p>
              </div>
            ) : (
              <div className="space-y-4 pr-4">
                {versions.map((version, index) => {
                  const isLatest = index === 0;
                  const hasChanges = version.changedFields && version.changedFields.length > 0;

                  return (
                    <div
                      key={version.id}
                      className="relative border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                      data-testid={`version-${version.versionNumber}`}
                    >
                      {/* Timeline connector */}
                      {index < versions.length - 1 && (
                        <div className="absolute left-6 top-16 w-0.5 h-8 bg-border" />
                      )}

                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          {/* Version header */}
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <Clock className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold">
                                Version {version.versionNumber}
                              </span>
                              {isLatest && (
                                <Badge variant="default" data-testid="badge-current-version">
                                  Current
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {tzFormatDistanceToNow(version.createdAt, { addSuffix: true })}
                              </span>
                            </div>
                          </div>

                          {/* Change description */}
                          {version.changeDescription && (
                            <div className="pl-10 text-sm text-muted-foreground italic">
                              "{version.changeDescription}"
                            </div>
                          )}

                          {/* Changed fields */}
                          {hasChanges && (
                            <div className="pl-10 space-y-1">
                              <p className="text-sm font-medium text-muted-foreground">
                                Changed fields:
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {version.changedFields.map((field) => (
                                  <Badge key={field} variant="secondary" className="text-xs" data-testid={`badge-changed-${field}`} >
                                    {field}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Diff summary */}
                          {version.diffSummary && Object.keys(version.diffSummary.modified).length > 0 && (
                            <div className="pl-10 mt-2 text-xs space-y-1">
                              {Object.entries(version.diffSummary.modified).map(([field, change]) => (
                                <div key={field} className="font-mono text-xs">
                                  <span className="text-destructive">- {field}: </span>
                                  <span className="text-muted-foreground line-through">
                                    {JSON.stringify(change.from)}
                                  </span>
                                  <br />
                                  <span className="text-success">+ {field}: </span>
                                  <span>{JSON.stringify(change.to)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Restore button */}
                        {!isLatest && (
                          <Button variant="outline" size="sm" onClick={() => openRestoreDialog(version.id)}
                            disabled={restoreMutation.isPending}
                            className="w-full sm:w-auto min-h-[48px] sm:min-h-[44px] touch-manipulation mt-2 sm:mt-0"
                            data-testid={`button-restore-v${version.versionNumber}`}
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            Restore
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent className="w-[min(95vw,28rem)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <AlertCircle className="w-5 h-5 text-warning" />
              Restore Version?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              This will restore the lesson to a previous version. Your current version will be
              saved automatically before restoring, so you can always undo this action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
            <AlertDialogCancel 
              disabled={restoreMutation.isPending}
              className="w-full sm:w-auto min-h-[48px] sm:min-h-[44px]"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestore}
              disabled={restoreMutation.isPending}
              className="w-full sm:w-auto min-h-[48px] sm:min-h-[44px]"
              data-testid="button-confirm-restore"
            >
              {restoreMutation.isPending ? "Restoring..." : "Restore Version"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
