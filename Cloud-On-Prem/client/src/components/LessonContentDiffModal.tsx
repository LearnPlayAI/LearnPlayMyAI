import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tzFormatDistanceToNow } from '@/utils/timezoneRuntime';
import {
  ArrowLeftRight,
  FileText,
  Clock,
  Loader2,
  Minus,
  Plus,
  Eye,
} from "lucide-react";


interface LessonVersion {
  id: string;
  lessonId: string;
  versionNumber: number;
  title: string;
  description: string | null;
  changeDescription: string | null;
  source?: string;
  createdAt: string;
  previousContent?: string;
  newContent?: string;
  lessonSnapshot: {
    inputText?: string;
    title?: string;
    description?: string;
  } | null;
  metadata?: {
    creditsCharged?: number;
    aiModel?: string;
    originalWordCount?: number;
    improvedWordCount?: number;
  };
}

interface LessonContentDiffModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lessonId: string;
  lessonTitle: string;
}

function computeLineDiff(oldText: string, newText: string): { type: 'unchanged' | 'added' | 'removed' | 'modified'; content: string; oldContent?: string }[] {
  if (!oldText && !newText) return [];
  if (!oldText) {
    return newText.split('\n').map(line => ({ type: 'added' as const, content: line }));
  }
  if (!newText) {
    return oldText.split('\n').map(line => ({ type: 'removed' as const, content: line }));
  }

  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result: { type: 'unchanged' | 'added' | 'removed' | 'modified'; content: string; oldContent?: string }[] = [];

  const maxLen = Math.max(oldLines.length, newLines.length);
  let oldIdx = 0;
  let newIdx = 0;

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    const oldLine = oldLines[oldIdx];
    const newLine = newLines[newIdx];

    if (oldIdx >= oldLines.length) {
      result.push({ type: 'added', content: newLine });
      newIdx++;
    } else if (newIdx >= newLines.length) {
      result.push({ type: 'removed', content: oldLine });
      oldIdx++;
    } else if (oldLine === newLine) {
      result.push({ type: 'unchanged', content: newLine });
      oldIdx++;
      newIdx++;
    } else {
      const similarity = computeSimilarity(oldLine, newLine);
      if (similarity > 0.5) {
        result.push({ type: 'modified', content: newLine, oldContent: oldLine });
        oldIdx++;
        newIdx++;
      } else {
        const oldInNew = newLines.slice(newIdx, newIdx + 5).indexOf(oldLine);
        const newInOld = oldLines.slice(oldIdx, oldIdx + 5).indexOf(newLine);
        
        if (oldInNew !== -1 && (newInOld === -1 || oldInNew <= newInOld)) {
          for (let i = 0; i < oldInNew; i++) {
            result.push({ type: 'added', content: newLines[newIdx + i] });
          }
          newIdx += oldInNew;
        } else if (newInOld !== -1) {
          for (let i = 0; i < newInOld; i++) {
            result.push({ type: 'removed', content: oldLines[oldIdx + i] });
          }
          oldIdx += newInOld;
        } else {
          result.push({ type: 'modified', content: newLine, oldContent: oldLine });
          oldIdx++;
          newIdx++;
        }
      }
    }
  }

  return result;
}

function computeSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  
  const aWords = a.toLowerCase().split(/\s+/);
  const bWords = b.toLowerCase().split(/\s+/);
  const intersection = aWords.filter(w => bWords.includes(w));
  
  return (2 * intersection.length) / (aWords.length + bWords.length);
}

function highlightWordChanges(oldText: string, newText: string): { added: string[]; removed: string[] } {
  const oldWordsArr = oldText.toLowerCase().split(/\s+/);
  const newWordsArr = newText.toLowerCase().split(/\s+/);
  const oldWords = new Set(oldWordsArr);
  const newWords = new Set(newWordsArr);
  
  const added = newWordsArr.filter(w => !oldWords.has(w));
  const removed = oldWordsArr.filter(w => !newWords.has(w));
  
  return { added, removed };
}

function DiffLine({ diff }: { diff: { type: 'unchanged' | 'added' | 'removed' | 'modified'; content: string; oldContent?: string } }) {
  const lineClasses = {
    unchanged: 'bg-background text-foreground',
    added: 'bg-success/10 text-success dark:text-success',
    removed: 'bg-destructive/10 text-destructive dark:text-destructive',
    modified: 'bg-warning/10',
  };

  const icon = {
    unchanged: null,
    added: <Plus className="w-3 h-3 text-success dark:text-success flex-shrink-0" />,
    removed: <Minus className="w-3 h-3 text-destructive dark:text-destructive flex-shrink-0" />,
    modified: <ArrowLeftRight className="w-3 h-3 text-warning dark:text-warning flex-shrink-0" />,
  };

  if (diff.type === 'modified' && diff.oldContent) {
    return (
      <div className="space-y-0.5">
        <div className={`flex items-start gap-2 px-3 py-0.5 text-sm font-mono bg-destructive/10`}>
          <Minus className="w-3 h-3 text-destructive dark:text-destructive flex-shrink-0 mt-1" />
          <span className="text-destructive dark:text-destructive line-through break-words">{diff.oldContent || <span className="text-muted-foreground italic">(empty line)</span>}</span>
        </div>
        <div className={`flex items-start gap-2 px-3 py-0.5 text-sm font-mono bg-success/10`}>
          <Plus className="w-3 h-3 text-success dark:text-success flex-shrink-0 mt-1" />
          <span className="text-success dark:text-success break-words">{diff.content || <span className="text-muted-foreground italic">(empty line)</span>}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-2 px-3 py-0.5 text-sm font-mono ${lineClasses[diff.type]}`}>
      <span className="w-3 flex-shrink-0 mt-1">{icon[diff.type]}</span>
      <span className="break-words">{diff.content || <span className="text-muted-foreground italic">(empty line)</span>}</span>
    </div>
  );
}

function ContentPreview({ content, label }: { content: string; label: string }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
        <FileText className="w-3 h-3" />
        {label}
      </div>
      <ScrollArea className="h-[400px] border rounded-lg bg-muted/30">
        <pre className="p-4 text-sm whitespace-pre-wrap break-words font-mono">
          {content || <span className="text-muted-foreground italic">No content</span>}
        </pre>
      </ScrollArea>
    </div>
  );
}

export function LessonContentDiffModal({
  open,
  onOpenChange,
  lessonId,
  lessonTitle,
}: LessonContentDiffModalProps) {
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [viewMode, setViewMode] = useState<"diff" | "side-by-side">("diff");

  const { data: versions, isLoading: versionsLoading } = useQuery<LessonVersion[]>({
    queryKey: ["/api/lessons", lessonId, "versions"],
    enabled: open && !!lessonId,
  });

  const isLoading = versionsLoading;
  const hasVersions = versions && versions.length > 0;
  
  const selectedVersion = versions?.find(v => v.id === selectedVersionId);
  // Use previousContent/newContent from new content versions table, 
  // fall back to lessonSnapshot for legacy versions
  const previousContent = selectedVersion?.previousContent || selectedVersion?.lessonSnapshot?.inputText || "";
  const newContent = selectedVersion?.newContent || "";
  
  const diffLines = selectedVersion ? computeLineDiff(previousContent, newContent) : [];
  const stats = diffLines.reduce(
    (acc, line) => {
      if (line.type === 'added') acc.added++;
      else if (line.type === 'removed') acc.removed++;
      else if (line.type === 'modified') acc.modified++;
      return acc;
    },
    { added: 0, removed: 0, modified: 0 }
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-primary" />
            Content Changes - {lessonTitle}
          </DialogTitle>
          <DialogDescription>
            Compare content between versions to see what has been added, removed, or modified.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 py-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-[300px] w-full" />
          </div>
        ) : !hasVersions ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Clock className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">No Version History</p>
            <p className="text-sm mt-2 max-w-md">
              Content comparison requires at least one saved version. Versions are created automatically when AI improves content or when you save changes.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Compare with:</span>
                <Select
                  value={selectedVersionId}
                  onValueChange={setSelectedVersionId}
                >
                  <SelectTrigger className="w-[280px]">
                    <SelectValue placeholder="Select a version" />
                  </SelectTrigger>
                  <SelectContent>
                    {versions?.map((version) => (
                      <SelectItem key={version.id} value={version.id}>
                        <div className="flex items-center gap-2">
                          <span>Version {version.versionNumber}</span>
                          <span className="text-xs text-muted-foreground">
                            ({tzFormatDistanceToNow(version.createdAt, { addSuffix: true })})
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedVersion && (
                <div className="flex items-center gap-2">
                  <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as typeof viewMode)}>
                    <TabsList className="h-8">
                      <TabsTrigger value="diff" className="text-xs px-3">
                        Unified Diff
                      </TabsTrigger>
                      <TabsTrigger value="side-by-side" className="text-xs px-3">
                        Side-by-Side
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              )}
            </div>

            {selectedVersion && (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedVersion.changeDescription && (
                    <Badge variant="outline" className="text-xs">
                      {selectedVersion.changeDescription}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Plus className="w-3 h-3 text-success" />
                    {stats.added} added
                  </Badge>
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Minus className="w-3 h-3 text-destructive" />
                    {stats.removed} removed
                  </Badge>
                  <Badge variant="secondary" className="text-xs gap-1">
                    <ArrowLeftRight className="w-3 h-3 text-warning" />
                    {stats.modified} modified
                  </Badge>
                </div>

                <div className="flex-1 overflow-hidden">
                  {viewMode === "diff" ? (
                    <ScrollArea className="h-[400px] border rounded-lg">
                      <div className="divide-y divide-border/50">
                        {diffLines.length > 0 ? (
                          diffLines.map((diff, idx) => (
                            <DiffLine key={idx} diff={diff} />
                          ))
                        ) : (
                          <div className="flex items-center justify-center py-12 text-muted-foreground">
                            <Eye className="w-5 h-5 mr-2" />
                            No content differences found
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="flex gap-4 h-[400px]">
                      <ContentPreview 
                        content={previousContent} 
                        label={`Before AI Improvement`} 
                      />
                      <ContentPreview 
                        content={newContent} 
                        label={`After AI Improvement (Version ${selectedVersion.versionNumber})`} 
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            {!selectedVersion && hasVersions && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border rounded-lg bg-muted/20">
                <ArrowLeftRight className="w-10 h-10 mb-3 opacity-50" />
                <p className="font-medium">Select a Version to Compare</p>
                <p className="text-sm mt-1">Choose a previous version from the dropdown above</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
