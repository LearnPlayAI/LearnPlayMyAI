import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Building2, Users, GitBranch, Plus, Trash2 } from "lucide-react";
import { apiRequest, invalidateLessonCaches, queryClient } from "@/lib/queryClient";
import { useOrganizationTerminology } from "@/contexts/OrganizationContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const Dialog = ({ open, children }: any) => (open ? <div className="space-y-3">{children}</div> : null);
const DialogContent = ({ className, children }: any) => <section className={className}>{children}</section>;
const DialogHeader = ({ className, children }: any) => <div className={className}>{children}</div>;
const DialogTitle = ({ className, children }: any) => <h3 className={className}>{children}</h3>;
const DialogDescription = ({ className, children }: any) => <p className={className}>{children}</p>;
const DialogBody = ({ className, children }: any) => <div className={className}>{children}</div>;
const DialogFooter = ({ className, children }: any) => <div className={className}>{children}</div>;

export interface LessonEditData {
  id: string;
  title: string;
  description?: string | null;
  department?: string | null;
  unit?: string | null;
  isPublished?: boolean;
}

export interface LessonEditDialogProps {
  lesson: LessonEditData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  organizationType?: string;
  courseId?: string;
  onSuccess?: () => void;
}

interface CourseHierarchy {
  unitId?: string | null;
  subUnitId?: string | null;
  teamId?: string | null;
}

interface HierarchyNames {
  departmentName?: string;
  unitName?: string;
  teamName?: string;
}

type BloomLevel = "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";
interface EditableLearningObjective {
  id: string;
  objective: string;
  bloomLevel: BloomLevel;
}
interface FrameworkTopic {
  id?: string;
  lessonId?: string | null;
  learningObjectives?: Array<{ id?: string; objective?: string; bloomLevel?: string } | string>;
}
interface CourseFrameworkData {
  topics?: FrameworkTopic[];
}

const BLOOM_LEVELS: BloomLevel[] = ["remember", "understand", "apply", "analyze", "evaluate", "create"];
const DEFAULT_BLOOM_LEVEL: BloomLevel = "understand";

function normalizeBloomLevel(value?: string): BloomLevel {
  const candidate = String(value || "").toLowerCase() as BloomLevel;
  return BLOOM_LEVELS.includes(candidate) ? candidate : DEFAULT_BLOOM_LEVEL;
}

export function LessonEditDialog({
  lesson,
  open,
  onOpenChange,
  organizationId,
  organizationType = "education",
  courseId,
  onSuccess,
}: LessonEditDialogProps) {
  const { toast } = useToast();
  
  const getInitialFormData = () => ({
    title: lesson?.title || "",
    description: lesson?.description || "",
    isPublished: lesson?.isPublished ?? false,
  });
  
  const [formData, setFormData] = useState(getInitialFormData);
  const [learningObjectives, setLearningObjectives] = useState<EditableLearningObjective[]>([]);
  const [topicId, setTopicId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.max(150, textarea.scrollHeight)}px`;
    }
  }, []);

  useEffect(() => {
    if (open && lesson) {
      setFormData({
        title: lesson.title || "",
        description: lesson.description || "",
        isPublished: lesson.isPublished ?? false,
      });
      setTimeout(autoResizeTextarea, 50);
    }
  }, [open, lesson?.id, autoResizeTextarea]);

  const { data: courseData } = useQuery<CourseHierarchy>({
    queryKey: ["/api/courses", courseId],
    enabled: !!courseId && open,
  });

  const { data: frameworkData } = useQuery<CourseFrameworkData>({
    queryKey: ["/api/courses", courseId, "framework"],
    enabled: !!courseId && open,
    queryFn: async () => {
      const response = await fetch(`/api/courses/${courseId}/framework`, { credentials: "include" });
      if (!response.ok) return { topics: [] };
      return response.json();
    },
  });

  useEffect(() => {
    if (!open || !lesson?.id) return;
    const topics = frameworkData?.topics || [];
    const matchingTopic = topics.find((topic) => topic.lessonId === lesson.id);
    setTopicId(matchingTopic?.id ? String(matchingTopic.id) : null);

    const rawObjectives = Array.isArray(matchingTopic?.learningObjectives)
      ? matchingTopic!.learningObjectives!
      : [];

    const normalized = rawObjectives
      .map((item, index) => {
        if (typeof item === "string") {
          return {
            id: `obj-${index + 1}`,
            objective: item,
            bloomLevel: DEFAULT_BLOOM_LEVEL as BloomLevel,
          };
        }
        return {
          id: String(item?.id || `obj-${index + 1}`),
          objective: String(item?.objective || "").trim(),
          bloomLevel: normalizeBloomLevel(item?.bloomLevel),
        };
      })
      .filter((item) => item.objective.length > 0);

    setLearningObjectives(normalized);
  }, [open, lesson?.id, frameworkData?.topics]);

  const { data: orgUnitsData } = useQuery<{ units: Array<{ id: string; name: string }> }>({
    queryKey: ["/api/organizations", organizationId, "units"],
    enabled: !!organizationId && open,
  });

  const { data: orgSubUnitsData } = useQuery<Array<{ id: string; name: string; unitId: string }>>({
    queryKey: ["/api/organizations", organizationId, "sub-units"],
    enabled: !!organizationId && open,
  });

  const { data: teamsData } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/organization/teams", courseData?.subUnitId, courseData?.teamId],
    queryFn: async () => {
      // Primary approach: fetch teams for the specific subUnit
      if (courseData?.subUnitId) {
        const res = await fetch(`/api/organization/teams/${courseData.subUnitId}`, { credentials: 'include' });
        if (res.ok) return res.json();
      }
      
      // Fallback: if subUnitId is null but teamId exists, fetch all teams for the organization
      if (courseData?.teamId && organizationId) {
        const res = await fetch(`/api/organization/all-teams/${organizationId}`, { credentials: 'include' });
        if (res.ok) return res.json();
      }
      
      return [];
    },
    enabled: (!!courseData?.subUnitId || !!courseData?.teamId) && !!organizationId && open,
  });

  const hierarchyNames: HierarchyNames = {
    departmentName: courseData?.unitId 
      ? (orgUnitsData?.units || []).find(u => u.id === courseData.unitId)?.name 
      : undefined,
    unitName: courseData?.subUnitId 
      ? (orgSubUnitsData || []).find(u => u.id === courseData.subUnitId)?.name 
      : undefined,
    teamName: courseData?.teamId 
      ? (teamsData || []).find(t => t.id === courseData.teamId)?.name 
      : undefined,
  };

  const { terminology } = useOrganizationTerminology();
  const departmentLabel = terminology?.unit || "Department";
  const unitLabel = terminology?.subUnit || "Unit";
  const teamLabel = terminology?.team || "Team";

  const updateMutation = useMutation({
    mutationFn: async (data: { lessonId: string; metadata: any }) => {
      return await apiRequest(`/api/lessons/${data.lessonId}`, {
        method: "PUT",
        body: JSON.stringify({
          organizationId,
          ...data.metadata,
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Lesson updated",
        description: "Lesson details and learning objectives have been updated successfully.",
      });
      invalidateLessonCaches({ 
        lessonId: lesson?.id, 
        courseId: courseId,
      });
      if (courseId) {
        queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId, "framework"] });
      }
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error.message || "Failed to update lesson",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lesson) return;
    
    updateMutation.mutate({
      lessonId: lesson.id,
      metadata: {
        title: formData.title,
        description: formData.description || null,
        isPublished: formData.isPublished,
        courseId: courseId || undefined,
        topicId: topicId || undefined,
        learningObjectives: learningObjectives
          .map((objective) => ({
            id: objective.id,
            objective: objective.objective.trim(),
            bloomLevel: objective.bloomLevel,
          }))
          .filter((objective) => objective.objective.length > 0),
      },
    });
  };

  if (!lesson) return null;

  const hasHierarchy = hierarchyNames.departmentName || hierarchyNames.unitName || hierarchyNames.teamName;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent key={lesson.id} className="w-[min(95vw,42rem)] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">Edit Lesson</DialogTitle>
          <DialogDescription className="text-sm">
            Update lesson details and assignment. Content cannot be edited.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <DialogBody className="space-y-3 sm:space-y-4">
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="edit-title" className="text-sm">Title *</Label>
              <Input
                id="edit-title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Lesson title"
                required
                className="min-h-[48px] sm:min-h-[44px]"
                data-testid="input-edit-title"
              />
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="edit-description" className="text-sm">Description</Label>
              <Textarea
                ref={textareaRef}
                id="edit-description"
                value={formData.description}
                onChange={(e) => {
                  setFormData({ ...formData, description: e.target.value });
                  autoResizeTextarea();
                }}
                placeholder="Optional description"
                className="min-h-[150px] resize-none overflow-hidden"
                data-testid="input-edit-description"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Learning Objectives</Label>
              <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/20">
                {learningObjectives.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No learning objectives yet. Add at least one objective for this lesson.
                  </p>
                )}
                {learningObjectives.map((objective, index) => (
                  <div key={objective.id} className="grid grid-cols-1 sm:grid-cols-[1fr_160px_auto] gap-2 items-start">
                    <Input
                      value={objective.objective}
                      placeholder="Define the learning objective..."
                      onChange={(e) => {
                        const next = [...learningObjectives];
                        next[index] = { ...next[index], objective: e.target.value };
                        setLearningObjectives(next);
                      }}
                    />
                    <Select
                      value={objective.bloomLevel}
                      onValueChange={(value) => {
                        const next = [...learningObjectives];
                        next[index] = { ...next[index], bloomLevel: normalizeBloomLevel(value) };
                        setLearningObjectives(next);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Bloom's Level" />
                      </SelectTrigger>
                      <SelectContent>
                        {BLOOM_LEVELS.map((level) => (
                          <SelectItem key={level} value={level}>
                            {level.charAt(0).toUpperCase() + level.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="icon" onClick={() => {
                        const next = learningObjectives.filter((_, i) => i !== index);
                        setLearningObjectives(next);
                      }}
                      aria-label="Remove objective"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={() => {
                    setLearningObjectives([
                      ...learningObjectives,
                      {
                        id: `new-${Date.now()}-${learningObjectives.length + 1}`,
                        objective: "",
                        bloomLevel: DEFAULT_BLOOM_LEVEL,
                      },
                    ]);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Objective
                </Button>
              </div>
            </div>

            {hasHierarchy && (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Inherited from Course</Label>
                <div className="p-3 rounded-lg bg-muted/50 border border-border">
                  <div className="flex flex-wrap gap-3">
                    {hierarchyNames.departmentName && (
                      <div className="flex items-center gap-2 text-sm">
                        <Building2 className="h-4 w-4 text-primary" />
                        <span className="text-muted-foreground">{departmentLabel}:</span>
                        <span className="font-medium">{hierarchyNames.departmentName}</span>
                      </div>
                    )}
                    {hierarchyNames.unitName && (
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="h-4 w-4 text-success" />
                        <span className="text-muted-foreground">{unitLabel}:</span>
                        <span className="font-medium">{hierarchyNames.unitName}</span>
                      </div>
                    )}
                    {hierarchyNames.teamName && (
                      <div className="flex items-center gap-2 text-sm">
                        <GitBranch className="h-4 w-4 text-primary" />
                        <span className="text-muted-foreground">{teamLabel}:</span>
                        <span className="font-medium">{hierarchyNames.teamName}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Lessons inherit their organization hierarchy from the parent course.
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="edit-published"
                checked={formData.isPublished}
                onChange={(e) => setFormData({ ...formData, isPublished: e.target.checked })}
                className="h-6 w-6 rounded border-border touch-manipulation"
                data-testid="checkbox-edit-published"
              />
              <Label htmlFor="edit-published" className="cursor-pointer text-sm py-2">
                Published (visible to learners)
              </Label>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}
              disabled={updateMutation.isPending}
              className="w-full sm:w-auto min-h-[48px] sm:min-h-[44px] touch-manipulation"
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending || !formData.title} className="w-full sm:w-auto min-h-[48px] sm:min-h-[44px] touch-manipulation" data-testid="button-save-edit" >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
