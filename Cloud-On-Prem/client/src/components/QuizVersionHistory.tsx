import { useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { tzFormatDistanceToNow } from '@/utils/timezoneRuntime';
import {
  History,
  RotateCcw,
  Clock,
  ChevronRight,
  AlertCircle,
  FileEdit,
} from "lucide-react";


interface QuizVersion {
  id: string;
  quizId: string;
  organizationId: string;
  versionNumber: number;
  name: string;
  description: string | null;
  totalCards: number | null;
  difficulty: string | null;
  passPercentage: number | null;
  changeDescription: string | null;
  editedBy: string | null;
  createdAt: string;
  changedFields: string[];
  diffSummary: {
    modified: Record<string, { from: any; to: any }>;
  } | null;
}

interface QuizVersionHistoryProps {
  quizId: string;
}

export function QuizVersionHistory({ quizId }: QuizVersionHistoryProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [versionToRestore, setVersionToRestore] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<QuizVersion | null>(null);

  const { data: versions, isLoading } = useQuery<QuizVersion[]>({
    queryKey: ["/api/quizzes", quizId, "versions"],
    enabled: !!quizId,
  });

  const restoreMutation = useMutation({
    mutationFn: async (versionId: string) => {
      return await apiRequest(
        `/api/quizzes/${quizId}/versions/${versionId}/restore`,
        { method: "POST" }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/quizzes", quizId],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/quizzes", quizId, "versions"],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/quiz-collections"],
        exact: false,
      });
    },
  });

  const handleRestore = async () => {
    if (!versionToRestore) return;

    try {
      await restoreMutation.mutateAsync(versionToRestore);

      toast({
        title: "Version Restored",
        description: "The quiz has been restored to the selected version.",
      });

      setRestoreDialogOpen(false);
      setVersionToRestore(null);
      setSelectedVersion(null);
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
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="min-h-[48px] sm:min-h-[44px] touch-manipulation" data-testid="button-quiz-version-history">
            <History className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Version History</span>
            <span className="sm:hidden">History</span>
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full sm:max-w-2xl p-4 sm:p-6">
          <SheetHeader>
            <SheetTitle className="text-base sm:text-lg">Quiz Version History</SheetTitle>
            <SheetDescription className="text-sm">
              View and restore previous versions of this quiz
            </SheetDescription>
          </SheetHeader>

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
                  Versions are automatically created when you make changes to the quiz.
                </p>
              </div>
            ) : (
              <div className="space-y-4 pr-4">
                {versions.map((version, index) => {
                  const isLatest = index === 0;
                  const hasChanges = version.changedFields && version.changedFields.length > 0;
                  const isSelected = selectedVersion?.id === version.id;

                  return (
                    <div
                      key={version.id}
                      className={`relative border rounded-lg p-4 hover:bg-accent/50 transition-colors cursor-pointer ${isSelected ? "ring-2 ring-primary bg-accent/30" : ""}`}
                      data-testid={`version-${version.versionNumber}`}
                      onClick={() => setSelectedVersion(isSelected ? null : version)}
                    >
                      {index < versions.length - 1 && (
                        <div className="absolute left-6 top-16 w-0.5 h-8 bg-border" />
                      )}

                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
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

                          {version.changeDescription && (
                            <div className="pl-10 text-sm text-muted-foreground italic">
                              "{version.changeDescription}"
                            </div>
                          )}

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

                          {isSelected && (
                            <div className="pl-10 mt-3 p-3 bg-muted/50 rounded-md space-y-1">
                              <div className="flex items-center gap-1 mb-2">
                                <ChevronRight className="w-3 h-3" />
                                <span className="text-sm font-medium">Version Details</span>
                              </div>
                              {version.name && (
                                <p className="text-sm"><span className="text-muted-foreground">Name:</span> {version.name}</p>
                              )}
                              {version.description && (
                                <p className="text-sm"><span className="text-muted-foreground">Description:</span> {version.description}</p>
                              )}
                              {version.totalCards != null && (
                                <p className="text-sm"><span className="text-muted-foreground">Total Cards:</span> {version.totalCards}</p>
                              )}
                              {version.difficulty && (
                                <p className="text-sm"><span className="text-muted-foreground">Difficulty:</span> {version.difficulty}</p>
                              )}
                              {version.passPercentage != null && (
                                <p className="text-sm"><span className="text-muted-foreground">Pass Percentage:</span> {version.passPercentage}%</p>
                              )}
                            </div>
                          )}
                        </div>

                        {!isLatest && (
                          <Button variant="outline" size="sm" onClick={(e) => {
                              e.stopPropagation();
                              openRestoreDialog(version.id);
                            }}
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

      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent className="w-[min(95vw,28rem)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <AlertCircle className="w-5 h-5 text-warning" />
              Restore Version?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              This will restore the quiz to a previous version. Your current version will be
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
