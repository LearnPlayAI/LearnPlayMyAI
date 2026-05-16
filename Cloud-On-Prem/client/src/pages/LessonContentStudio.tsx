import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import QuizAdminLayout from "@/components/QuizAdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Globe, History, Trash2, Sparkles, Save, ArrowLeftRight as CompareIcon, CheckCircle2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

type FeedbackMode = "quick" | "deep" | "compare";
type ViewMode = "edit" | "compare";
type CompareLayout = "inline" | "side-by-side";
type FeedbackAction = {
  id?: string;
  priority?: string;
  title: string;
  description?: string;
  effort?: string;
  impactScore?: number;
  category?: string;
  example?: string | null;
};
type DiffRow = {
  kind: "same" | "added" | "removed" | "changed";
  leftText: string;
  rightText: string;
  lineLeft: number | null;
  lineRight: number | null;
};

type RelevanceAuditItem = {
  id?: string;
  itemHash?: string;
  title: string;
  reason?: string;
  excerpt?: string;
  category?: "on_topic" | "possibly_off_topic" | "off_topic";
  confidence?: number;
  suggestedAction?: string;
  defaultSelected?: boolean;
  userDecision?: "pending" | "accepted" | "rejected" | "ignored" | "applied" | "stale";
};

type FeedbackPayload = {
  overallScore?: number;
  summary?: string;
  strengths?: string[];
  prioritizedActions?: FeedbackAction[];
  weakestDimensions?: Array<{ key: string; name: string; score: number; whyItMatters: string; nextSteps: string[] }>;
  relevanceAudit?: RelevanceAuditItem[];
  feedbackRunId?: string | null;
  persistedForVersion?: boolean;
  selectedVersionRef?: string;
};

function getFeedbackActionKey(action: FeedbackAction, idx: number): string {
  return String(action.id || "").trim() || `${String(action.title || "").trim()}::${idx}`;
}

function hashText(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h << 5) - h + input.charCodeAt(i);
  return String(h);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeVersionId(id: string): string {
  const value = String(id || "");
  return value.trim() || "current";
}

function isCurrentVersionId(id?: string): boolean {
  const value = normalizeVersionId(String(id || ""));
  return value === "current" || value.startsWith("current-");
}

function isInitialVersionId(id?: string): boolean {
  const value = normalizeVersionId(String(id || ""));
  return value === "initial" || value.startsWith("initial-");
}

function versionIdsMatch(left?: string, right?: string): boolean {
  if (isCurrentVersionId(left) && isCurrentVersionId(right)) return true;
  if (isInitialVersionId(left) && isInitialVersionId(right)) return true;
  return normalizeVersionId(String(left || "")) === normalizeVersionId(String(right || ""));
}

function getVersionSourceLabel(source?: string): string {
  if (!source) return "Unknown";
  if (source === "course_builder_source_v1") return "Original source";
  if (source === "manual_edit") return "Manual edit";
  if (source === "feedback_fix") return "Feedback fix";
  if (source === "ai_improve") return "AI improve";
  if (source === "upload") return "Upload";
  if (source === "current" || source === "current_state") return "Current version";
  if (source === "initial_state") return "Initial version";
  if (source === "version_restore") return "Set as current";
  if (source === "initial_version_restore") return "Initial restored";
  return source.replace(/_/g, " ");
}

function getSemanticVersionLabel(version?: any): string {
  const semanticVersion = String(version?.metadata?.semanticVersion || "").trim();
  if (semanticVersion) return semanticVersion;
  if (version?.source === "course_builder_source_v1") return "V1";
  if (version?.source === "feedback_fix" && version?.metadata?.sourceVersionRole === "ai_enhanced") return "V1.1";
  return `v${version?.versionNumber || ""}`.trim();
}

function formatVersionTimestamp(value?: string): string {
  if (!value) return "Unknown time";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-ZA", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function tokenizeWords(value: string): string[] {
  return String(value || "").split(/(\s+)/).filter((v) => v.length > 0);
}

function diffTokens(oldLine: string, newLine: string): { left: Array<{ text: string; changed: boolean }>; right: Array<{ text: string; changed: boolean }> } {
  const a = tokenizeWords(oldLine);
  const b = tokenizeWords(newLine);
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const leftChanged = new Set<number>();
  const rightChanged = new Set<number>();
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      leftChanged.add(i - 1);
      i--;
    } else {
      rightChanged.add(j - 1);
      j--;
    }
  }
  while (i > 0) {
    leftChanged.add(i - 1);
    i--;
  }
  while (j > 0) {
    rightChanged.add(j - 1);
    j--;
  }

  return {
    left: a.map((text, idx) => ({ text, changed: leftChanged.has(idx) })),
    right: b.map((text, idx) => ({ text, changed: rightChanged.has(idx) })),
  };
}

function buildDiffRows(baseText: string, targetText: string): DiffRow[] {
  const oldLines = String(baseText || "").split("\n");
  const newLines = String(targetText || "").split("\n");
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  let lineLeft = 1;
  let lineRight = 1;

  while (i < oldLines.length || j < newLines.length) {
    const oldLine = oldLines[i];
    const newLine = newLines[j];

    if (i >= oldLines.length) {
      rows.push({ kind: "added", leftText: "", rightText: newLine || "", lineLeft: null, lineRight });
      j++;
      lineRight++;
      continue;
    }
    if (j >= newLines.length) {
      rows.push({ kind: "removed", leftText: oldLine || "", rightText: "", lineLeft, lineRight: null });
      i++;
      lineLeft++;
      continue;
    }

    if (oldLine === newLine) {
      rows.push({ kind: "same", leftText: oldLine || "", rightText: newLine || "", lineLeft, lineRight });
      i++;
      j++;
      lineLeft++;
      lineRight++;
      continue;
    }

    if (newLines.slice(j + 1, j + 4).includes(oldLine)) {
      rows.push({ kind: "added", leftText: "", rightText: newLine || "", lineLeft: null, lineRight });
      j++;
      lineRight++;
      continue;
    }
    if (oldLines.slice(i + 1, i + 4).includes(newLine)) {
      rows.push({ kind: "removed", leftText: oldLine || "", rightText: "", lineLeft, lineRight: null });
      i++;
      lineLeft++;
      continue;
    }

    rows.push({ kind: "changed", leftText: oldLine || "", rightText: newLine || "", lineLeft, lineRight });
    i++;
    j++;
    lineLeft++;
    lineRight++;
  }

  return rows;
}

export default function LessonContentStudio() {
  const [, params] = useRoute("/lessons/:lessonId/content-studio");
  const lessonId = params?.lessonId;
  const { effectiveOrganizationId } = useAuth();
  const { toast } = useToast();
  const initialSearchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const initialLangLessonId = String(initialSearchParams.get("langLessonId") || lessonId || "");
  const initialDocVersionId = String(initialSearchParams.get("docVersionId") || "current");
  const initialFocus = String(initialSearchParams.get("focus") || "").trim().toLowerCase();
  const preferredSourceMode: "auto" | "sourcedb" | "word" =
    initialFocus === "word" ? "word" : initialFocus === "source" ? "sourcedb" : "auto";
  const initialDocVersionAppliedRef = useRef(false);

  const [selectedLangLessonId, setSelectedLangLessonId] = useState<string>(initialLangLessonId);
  const [selectedDocVersion, setSelectedDocVersion] = useState<string>(initialDocVersionId || "current");
  const [viewMode, setViewMode] = useState<ViewMode>("edit");
  const [compareBaseVersionId, setCompareBaseVersionId] = useState<string>("current");
  const [compareTargetVersionId, setCompareTargetVersionId] = useState<string>("current");
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>("quick");
  const [draftText, setDraftText] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackPayload | null>(null);
  const [selectedRelevanceItemIds, setSelectedRelevanceItemIds] = useState<string[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isPollingAiFix, setIsPollingAiFix] = useState(false);

  const [isOrgContextMissing, setIsOrgContextMissing] = useState(false);
  const queryParams = initialSearchParams;
  const returnTo = queryParams.get("returnTo") || "/course-builder";
  const queryCourseId = queryParams.get("courseId") || "";
  const queryOrgId = queryParams.get("organizationId") || "";
  const autoFeedback = queryParams.get("autofeedback") === "1";
  const [autoFeedbackTriggered, setAutoFeedbackTriggered] = useState(false);
  const [showChangedOnly, setShowChangedOnly] = useState(true);
  const [compareLayout, setCompareLayout] = useState<CompareLayout>("inline");
  const [activeChangeIndex, setActiveChangeIndex] = useState(0);
  const leftCompareRef = useRef<HTMLDivElement | null>(null);
  const rightCompareRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const syncScrollLockRef = useRef(false);

  const { data: courseData } = useQuery<{ organizationId?: string }>({
    queryKey: ["/api/courses", queryCourseId, "details-for-content-studio"],
    queryFn: async () => {
      const res = await fetch(`/api/courses/${queryCourseId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load course context");
      return res.json();
    },
    enabled: !!queryCourseId,
    retry: 1,
  });

  const orgId = effectiveOrganizationId || queryOrgId || courseData?.organizationId || "";

  const { data: lessonData } = useQuery<any>({
    queryKey: ["/api/lessons", lessonId, orgId],
    queryFn: async () => {
      const res = await fetch(`/api/lessons/${lessonId}?organizationId=${orgId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load lesson");
      return res.json();
    },
    enabled: !!lessonId && !!orgId,
  });

  const { data: languageVariants } = useQuery<
    Array<{ code: string; name: string; nativeName: string; lessonId: string; hasContent: boolean; hasWordDoc: boolean; isDefault?: boolean }>
  >({
    queryKey: ["/api/lessons", lessonId, "languages-details"],
    queryFn: () => fetch(`/api/lessons/${lessonId}/languages?details=true`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!lessonId,
  });

  const contentLangs = useMemo(() => (languageVariants || []).filter((v) => v.hasContent || v.hasWordDoc), [languageVariants]);

  const { data: sourceData, isLoading: sourceLoading } = useQuery<{ text?: string; source?: string; extractedWordCount?: number }>({
    queryKey: ["/api/lessons", selectedLangLessonId, "source-document", orgId, preferredSourceMode],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("organizationId", orgId);
      if (preferredSourceMode !== "auto") params.set("preferredSource", preferredSourceMode);
      const res = await fetch(`/api/lessons/${selectedLangLessonId}/source-document?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load source content");
      return res.json();
    },
    enabled: !!selectedLangLessonId && !!orgId,
  });
  const sourceError = !sourceLoading && !sourceData && !!orgId;

  const { data: contentVersions } = useQuery<any[]>({
    queryKey: ["/api/lessons", selectedLangLessonId, "content-versions"],
    queryFn: async () => {
      const res = await fetch(`/api/lessons/${selectedLangLessonId}/versions?organizationId=${orgId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedLangLessonId && !!orgId,
  });

  const { data: latestFeedbackRunData } = useQuery<any>({
    queryKey: ["/api/lessons", selectedLangLessonId, "source-feedback-latest", selectedDocVersion, orgId],
    queryFn: async () => {
      const selected = encodeURIComponent(selectedDocVersion || "current");
      const res = await fetch(`/api/lessons/${selectedLangLessonId}/source-document/feedback-latest?organizationId=${orgId}&selectedVersionId=${selected}`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!selectedLangLessonId && !!orgId,
    retry: 1,
  });

  const versionsWithCurrent = useMemo(() => {
    const list = Array.isArray(contentVersions) ? [...contentVersions] : [];
    const hasCurrent = list.some((v: any) => isCurrentVersionId(v.id));
    if (!hasCurrent) {
      list.unshift({
        id: `current-${selectedLangLessonId}`,
        versionNumber: "current",
        source: "current_state",
        newContent: sourceData?.text || "",
        createdAt: new Date().toISOString(),
      });
    }
    const hasInitial = list.some((v: any) => isInitialVersionId(v.id));
    if (!hasInitial) {
      list.splice(1, 0, {
        id: `initial-${selectedLangLessonId}`,
        versionNumber: 1,
        source: "initial_state",
        newContent: String(list.find((v: any) => isCurrentVersionId(v.id))?.newContent || sourceData?.text || ""),
        createdAt: new Date().toISOString(),
      });
    }
    const seen = new Set<string>();
    return list.filter((v: any) => {
      const id = isCurrentVersionId(v.id)
        ? "current"
        : isInitialVersionId(v.id)
          ? "initial"
          : normalizeVersionId(v.id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [contentVersions, sourceData?.text, selectedLangLessonId]);
  const hasHistoricalVersions = versionsWithCurrent.some((v: any) => !isCurrentVersionId(v.id));

  const initialVersionId = useMemo(
    () => normalizeVersionId(versionsWithCurrent.find((v: any) => isInitialVersionId(v.id))?.id || "initial"),
    [versionsWithCurrent]
  );

  useEffect(() => {
    if (!contentLangs.length) return;
    const selectedExists = contentLangs.some((v) => v.lessonId === selectedLangLessonId);
    if (!selectedLangLessonId || !selectedExists) {
      const defaultLang = contentLangs.find((v) => v.isDefault) || contentLangs[0];
      setSelectedLangLessonId(defaultLang.lessonId);
    }
  }, [contentLangs, selectedLangLessonId]);

  useEffect(() => {
    const nextDocVersion =
      !initialDocVersionAppliedRef.current && initialDocVersionId
        ? initialDocVersionId
        : "current";
    setSelectedDocVersion(nextDocVersion);
    initialDocVersionAppliedRef.current = true;
    setCompareBaseVersionId(initialVersionId || "initial");
    setCompareTargetVersionId("current");
    setFeedback(null);
    setSelectedRelevanceItemIds([]);
    setDirty(false);
  }, [selectedLangLessonId, initialVersionId]);

  useEffect(() => {
    if (!orgId) {
      setIsOrgContextMissing(true);
      return;
    }
    setIsOrgContextMissing(false);
  }, [orgId]);

  useEffect(() => {
    if (viewMode === "compare") return;
    if (!isCurrentVersionId(selectedDocVersion)) return;
    if (dirty) return;
    setDraftText(String(sourceData?.text || ""));
  }, [sourceData?.text, selectedDocVersion, viewMode, dirty]);

  useEffect(() => {
    if (!latestFeedbackRunData || feedback) return;
    if (latestFeedbackRunData?.isStaleForSelectedVersion) return;
    const run = latestFeedbackRunData?.run;
    const items = Array.isArray(latestFeedbackRunData?.items) ? latestFeedbackRunData.items : [];
    if (!run) return;

    const mappedItems: RelevanceAuditItem[] = items.map((item: any) => ({
      id: item.id,
      itemHash: item.itemHash,
      title: String(item.title || "Relevance candidate"),
      reason: item.reason ? String(item.reason) : "",
      excerpt: item.excerpt ? String(item.excerpt) : "",
      category: item.category,
      confidence: Number(item.confidence || 0),
      suggestedAction: item.suggestedAction ? String(item.suggestedAction) : "remove",
      defaultSelected: Boolean(item.defaultSelected),
      userDecision: item.userDecision || "pending",
    }));

    const fromDecisions = mappedItems
      .filter((item) => item.userDecision === "accepted" || item.userDecision === "applied")
      .map((item) => item.id)
      .filter((value): value is string => !!value);
    const fallbackDefaults = mappedItems
      .filter((item) => !item.userDecision || item.userDecision === "pending")
      .filter((item) => !!item.defaultSelected)
      .map((item) => item.id)
      .filter((value): value is string => !!value);

    setSelectedRelevanceItemIds(fromDecisions.length > 0 ? fromDecisions : fallbackDefaults);
    setFeedback({
      ...(run?.actionable || {}),
      summary: run?.summary || run?.actionable?.summary || "",
      feedbackRunId: run?.id,
      persistedForVersion: true,
      selectedVersionRef: run?.contentVersionRef,
      relevanceAudit: mappedItems,
    });
  }, [latestFeedbackRunData, feedback]);

  const getVersionContent = (versionId: string) => {
    if (isCurrentVersionId(versionId)) return sourceData?.text || "";
    return versionsWithCurrent.find((v: any) => versionIdsMatch(v.id, versionId))?.newContent || "";
  };
  const getVersionById = (versionId: string) => versionsWithCurrent.find((v: any) => versionIdsMatch(v.id, versionId));
  const getVersionDisplayLabel = (versionId: string) => {
    const id = normalizeVersionId(versionId);
    const version = getVersionById(id);
    if (isCurrentVersionId(id)) return "Current Version (Active)";
    if (isInitialVersionId(id)) return "Initial Version";
    if (!version) return "Version";
    return `${getSemanticVersionLabel(version)} - ${getVersionSourceLabel(version.source)}`;
  };
  const getVersionTimestamp = (versionId: string) => {
    const version = getVersionById(versionId);
    return formatVersionTimestamp(version?.createdAt);
  };
  const selectedVersionText =
    isCurrentVersionId(selectedDocVersion)
      ? draftText
      : getVersionContent(selectedDocVersion);
  const feedbackActions: FeedbackAction[] = Array.isArray(feedback?.prioritizedActions) ? feedback.prioritizedActions : [];
  const relevanceAuditItems: RelevanceAuditItem[] = Array.isArray(feedback?.relevanceAudit) ? feedback.relevanceAudit : [];
  const selectedRelevancePreview = useMemo(() => {
    const sourceText = String(draftText || "");
    const selectedSet = new Set(selectedRelevanceItemIds);
    const selectedItems = relevanceAuditItems
      .map((item, idx) => ({ item, id: String(item.id || item.itemHash || `local-${idx}`) }))
      .filter(({ id }) => selectedSet.has(id));

    let nextText = sourceText;
    const willRemove: Array<{ id: string; title: string; excerpt: string }> = [];
    const noMatch: Array<{ id: string; title: string; excerpt: string }> = [];

    for (const { item, id } of selectedItems) {
      const excerpt = String(item.excerpt || "").trim();
      if (!excerpt) {
        noMatch.push({ id, title: String(item.title || "Untitled item"), excerpt: "(No excerpt provided)" });
        continue;
      }
      const regex = new RegExp(escapeRegExp(excerpt), "m");
      if (!regex.test(nextText)) {
        noMatch.push({ id, title: String(item.title || "Untitled item"), excerpt });
        continue;
      }
      nextText = nextText.replace(regex, "").replace(/\n{3,}/g, "\n\n").trim();
      willRemove.push({ id, title: String(item.title || "Untitled item"), excerpt });
    }

    return {
      selectedCount: selectedItems.length,
      willRemove,
      noMatch,
      estimatedResultText: nextText,
      removedChars: Math.max(0, sourceText.length - nextText.length),
    };
  }, [draftText, relevanceAuditItems, selectedRelevanceItemIds]);

  const compareBaseText = getVersionContent(compareBaseVersionId);
  const compareTargetText = getVersionContent(compareTargetVersionId);
  const allDiffRows = useMemo(() => buildDiffRows(compareBaseText, compareTargetText), [compareBaseText, compareTargetText]);
  const visibleDiffRows = useMemo(
    () => (showChangedOnly ? allDiffRows.filter((row) => row.kind !== "same") : allDiffRows),
    [allDiffRows, showChangedOnly]
  );
  const diffSummary = useMemo(() => {
    const added = allDiffRows.filter((r) => r.kind === "added").length;
    const removed = allDiffRows.filter((r) => r.kind === "removed").length;
    const changed = allDiffRows.filter((r) => r.kind === "changed").length;
    return { added, removed, changed, total: added + removed + changed };
  }, [allDiffRows]);

  const previewFeedbackMutation = useMutation({
    mutationFn: async () => {
      const payload =
        feedbackMode === "compare"
          ? {
              text: getVersionContent(compareTargetVersionId),
              mode: "compare",
              compareBaseText: getVersionContent(compareBaseVersionId),
              selectedVersionId: compareTargetVersionId,
            }
          : {
              text: isCurrentVersionId(selectedDocVersion)
                ? draftText
                : getVersionContent(selectedDocVersion),
              mode: feedbackMode,
              selectedVersionId: selectedDocVersion,
            };
      return apiRequest(`/api/lessons/${selectedLangLessonId}/source-document/feedback-preview?organizationId=${orgId}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (data: any) => {
      const relevanceAudit = Array.isArray(data?.relevanceAudit) ? data.relevanceAudit : [];
      const preselected = relevanceAudit
        .filter((item: any) => !!item?.defaultSelected)
        .map((item: any) => String(item?.id || item?.itemHash || ""))
        .filter(Boolean);
      setSelectedRelevanceItemIds(preselected);
      setFeedback({
        ...(data?.actionable || data?.report || data),
        summary: data?.actionable?.summary || data?.report?.summary || "",
        relevanceAudit,
        feedbackRunId: data?.feedbackRunId || null,
        persistedForVersion: !!data?.persistedForVersion,
        selectedVersionRef: data?.selectedVersionRef,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", selectedLangLessonId, "source-feedback-latest", selectedDocVersion, orgId] });
    },
    onError: (e: any) => toast({ title: "Feedback failed", description: e.message || "Could not generate feedback", variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/lessons/${selectedLangLessonId}/source-document?organizationId=${orgId}`, {
        method: "PUT",
        body: JSON.stringify({ text: draftText }),
      }),
    onSuccess: () => {
      setDirty(false);
      setFeedback(null);
      setSelectedRelevanceItemIds([]);
      toast({ title: "Saved", description: "Lesson source content updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", selectedLangLessonId, "source-document", orgId] });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", selectedLangLessonId, "content-versions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", selectedLangLessonId, "source-feedback-latest"] });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message || "Could not save content", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/lessons/${selectedLangLessonId}/source-document?organizationId=${orgId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      setShowDeleteConfirm(false);
      setDraftText("");
      setFeedback(null);
      setSelectedRelevanceItemIds([]);
      toast({ title: "Deleted", description: "Source content removed." });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", selectedLangLessonId, "source-document", orgId] });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", selectedLangLessonId, "content-versions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", selectedLangLessonId, "source-feedback-latest"] });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message || "Could not delete content", variant: "destructive" }),
  });

  const setCurrentVersionMutation = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/lessons/${selectedLangLessonId}/source-document/set-current-version?organizationId=${orgId}`, {
        method: "POST",
        body: JSON.stringify({ versionId: selectedDocVersion }),
      }),
    onSuccess: () => {
      setSelectedDocVersion("current");
      setDirty(false);
      setFeedback(null);
      setSelectedRelevanceItemIds([]);
      toast({ title: "Current version updated", description: "Selected version is now active for this language." });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", selectedLangLessonId, "source-document", orgId] });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", selectedLangLessonId, "content-versions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", selectedLangLessonId, "versions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", selectedLangLessonId, "source-feedback-latest"] });
    },
    onError: (e: any) => toast({ title: "Set current failed", description: e.message || "Could not set current version", variant: "destructive" }),
  });

  const applyFeedbackActionMutation = useMutation({
    mutationFn: async (payload: { action: FeedbackAction; actionIndex: number }) => {
      const currentTextForApply = isCurrentVersionId(selectedDocVersion)
        ? draftText
        : String(sourceData?.text || "");
      const actionId = String(payload.action?.id || "").trim();
      return apiRequest(`/api/lessons/${selectedLangLessonId}/source-document/apply-feedback-action?organizationId=${orgId}`, {
        method: "POST",
        body: JSON.stringify({
          text: currentTextForApply,
          mode: feedbackMode,
          compareBaseText: feedbackMode === "compare" ? getVersionContent(compareBaseVersionId) : undefined,
          action: payload.action,
          actionId: actionId || undefined,
          actionIndex: payload.actionIndex,
          runId: feedback?.feedbackRunId || undefined,
          selectedVersionId: selectedDocVersion,
        }),
      });
    },
    onSuccess: (data: any, variables) => {
      const nextText = String(data?.text || "");
      setSelectedDocVersion("current");
      setDraftText(nextText);
      setDirty(false);
      setFeedback((prev) => {
        if (!prev) return prev;
        const nextActions = Array.isArray(prev.prioritizedActions)
          ? prev.prioritizedActions.filter((action, idx) => {
              if (idx === variables.actionIndex) return false;
              const lhs = getFeedbackActionKey(action, idx);
              const rhs = getFeedbackActionKey(variables.action, variables.actionIndex);
              return lhs !== rhs;
            })
          : [];
        if (nextActions.length === 0) return null;
        return { ...prev, prioritizedActions: nextActions };
      });
      toast({ title: "Fix applied", description: "The recommended change was applied and saved as a new version." });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", selectedLangLessonId, "source-document", orgId] });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", selectedLangLessonId, "content-versions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", selectedLangLessonId, "versions"] });
    },
    onError: (e: any) => toast({ title: "Apply failed", description: e.message || "Could not apply this feedback action", variant: "destructive" }),
  });

  const saveFeedbackDecisionMutation = useMutation({
    mutationFn: async (payload: { runId: string; itemId: string; decision: "accepted" | "rejected" | "ignored" }) =>
      apiRequest(`/api/lessons/${selectedLangLessonId}/source-document/feedback-item-decision?organizationId=${orgId}`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  });

  const aiImproveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/lessons/${selectedLangLessonId}/ai-improve?organizationId=${orgId}`, {
        method: 'POST',
        body: JSON.stringify({ feedbackReport: feedback }),
      });
      return response;
    },
    onSuccess: (data: any) => {
      setIsPollingAiFix(true);
    },
    onError: (e: any) => toast({ title: "AI Fix Failed", description: e.message || "Could not start AI improvements", variant: "destructive" }),
  });

  useEffect(() => {
    let timeoutId: any;
    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/lessons/${selectedLangLessonId}/ai-improve-status`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'completed' || data.status === 'failed' || data.status === null) {
            setIsPollingAiFix(false);
            if (data.status === 'completed') {
              toast({ title: "AI Improvements Applied", description: data.result?.changesSummary || "Content has been improved based on feedback." });
              queryClient.invalidateQueries({ queryKey: ["/api/lessons", selectedLangLessonId, "source-document", orgId] });
              queryClient.invalidateQueries({ queryKey: ["/api/lessons", selectedLangLessonId, "content-versions"] });
              queryClient.invalidateQueries({ queryKey: ["/api/lessons", selectedLangLessonId, "versions"] });
              queryClient.invalidateQueries({ queryKey: ["/api/lessons", selectedLangLessonId, "source-feedback-latest"] });
              setSelectedDocVersion("current");
              setDirty(false);
              setFeedback(null);
            } else if (data.status === 'failed') {
               toast({ title: "AI Fix Failed", description: data.result?.error || "AI improvement failed", variant: "destructive" });
            }
            return;
          }
        }
      } catch (err) {
        console.error("Polling AI fix status failed:", err);
      }
      timeoutId = setTimeout(pollStatus, 2000);
    };
    if (isPollingAiFix) {
      pollStatus();
    }
    return () => clearTimeout(timeoutId);
  }, [isPollingAiFix, selectedLangLessonId, orgId, queryClient, toast]);


  const applySelectedRelevanceMutation = useMutation({
    mutationFn: async () => {
      if (!feedback?.feedbackRunId) {
        throw new Error("No persisted feedback run found. Please run Get Feedback first.");
      }
      const currentTextForApply = isCurrentVersionId(selectedDocVersion)
        ? draftText
        : String(sourceData?.text || "");
      return apiRequest(`/api/lessons/${selectedLangLessonId}/source-document/apply-feedback-selection?organizationId=${orgId}`, {
        method: "POST",
        body: JSON.stringify({
          runId: feedback.feedbackRunId,
          selectedItemIds: selectedRelevanceItemIds,
          selectedVersionId: selectedDocVersion,
          text: currentTextForApply,
        }),
      });
    },
    onSuccess: (data: any) => {
      const nextText = String(data?.text || "");
      if (nextText) {
        setSelectedDocVersion("current");
        setDraftText(nextText);
        setDirty(false);
      }
      setFeedback(null);
      setSelectedRelevanceItemIds([]);
      toast({
        title: "Selected fixes applied",
        description: data?.unchanged
          ? "No matching excerpts were removed."
          : `Saved as new version with ${Number(data?.appliedCount || 0)} relevance actions.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", selectedLangLessonId, "source-document", orgId] });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", selectedLangLessonId, "content-versions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", selectedLangLessonId, "versions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons", selectedLangLessonId, "source-feedback-latest", selectedDocVersion, orgId] });
    },
    onError: (e: any) => toast({ title: "Apply selected failed", description: e.message || "Could not apply selected relevance items", variant: "destructive" }),
  });

  const canSave = !sourceLoading && isCurrentVersionId(selectedDocVersion) && viewMode !== "compare";
  const canSetAsCurrent =
    viewMode !== "compare" &&
    !sourceLoading &&
    !isCurrentVersionId(selectedDocVersion);

  useEffect(() => {
    if (!autoFeedback || autoFeedbackTriggered || previewFeedbackMutation.isPending) return;
    if (feedbackMode !== "quick") return;
    if (!draftText.trim()) return;
    previewFeedbackMutation.mutate();
    setAutoFeedbackTriggered(true);
  }, [autoFeedback, autoFeedbackTriggered, previewFeedbackMutation.isPending, feedbackMode, draftText]);

  useEffect(() => {
    setActiveChangeIndex(0);
  }, [compareBaseVersionId, compareTargetVersionId, showChangedOnly]);

  useEffect(() => {
    if (compareLayout !== "side-by-side") return;
    const left = leftCompareRef.current;
    const right = rightCompareRef.current;
    if (!left || !right) return;

    const sync = (source: HTMLDivElement, target: HTMLDivElement) => {
      if (syncScrollLockRef.current) return;
      syncScrollLockRef.current = true;
      target.scrollTop = source.scrollTop;
      target.scrollLeft = source.scrollLeft;
      window.requestAnimationFrame(() => {
        syncScrollLockRef.current = false;
      });
    };

    const onLeft = () => sync(left, right);
    const onRight = () => sync(right, left);
    left.addEventListener("scroll", onLeft);
    right.addEventListener("scroll", onRight);
    return () => {
      left.removeEventListener("scroll", onLeft);
      right.removeEventListener("scroll", onRight);
    };
  }, [viewMode, visibleDiffRows.length, compareLayout]);

  const navigateDiff = (direction: "next" | "prev") => {
    const changedIndexes = visibleDiffRows
      .map((row, idx) => (row.kind === "same" ? -1 : idx))
      .filter((idx) => idx >= 0);
    if (changedIndexes.length === 0) return;

    const max = changedIndexes.length - 1;
    const next = direction === "next" ? (activeChangeIndex >= max ? 0 : activeChangeIndex + 1) : (activeChangeIndex <= 0 ? max : activeChangeIndex - 1);
    setActiveChangeIndex(next);

    const rowIndex = changedIndexes[next];
    rowRefs.current[rowIndex]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <QuizAdminLayout title="Lesson Content Studio" description="Full-page source content editing, compare, and review">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Link href={returnTo}>
            <Button variant="outline" className="min-h-[44px]">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <Badge variant="outline">{lessonData?.title || "Lesson"}</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Lesson Source Content</CardTitle>
            <CardDescription>Use this full-page studio to review, compare, and edit source content.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {contentLangs.length > 1 && (
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <Select value={selectedLangLessonId} onValueChange={setSelectedLangLessonId}>
                    <SelectTrigger className="w-[220px] min-h-[44px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {contentLangs.map((v) => (
                        <SelectItem key={v.lessonId} value={v.lessonId}>
                          {v.name} ({v.code.toUpperCase()})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {hasHistoricalVersions && (
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  <Select
                    value={selectedDocVersion}
                    onValueChange={(v) => {
                      if (dirty && selectedDocVersion !== v && !window.confirm("You have unsaved changes. Switch versions and discard unsaved edits?")) {
                        return;
                      }
                      setSelectedDocVersion(v);
                      setFeedback(null);
                      setSelectedRelevanceItemIds([]);
                      const text = getVersionContent(v);
                      if (isCurrentVersionId(v)) {
                        setDraftText(text);
                        setDirty(false);
                      }
                    }}
                  >
                    <SelectTrigger className="w-[260px] min-h-[44px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current">Current Version (Active) - {getVersionTimestamp("current")}</SelectItem>
                      {versionsWithCurrent
                        .filter((v: any) => !isCurrentVersionId(v.id))
                        .map((v: any) => (
                          <SelectItem key={normalizeVersionId(v.id)} value={normalizeVersionId(v.id)}>
                            {isInitialVersionId(v.id)
                              ? `Initial Version - ${formatVersionTimestamp(v.createdAt)}`
                              : `${getSemanticVersionLabel(v)} - ${getVersionSourceLabel(v.source)} - ${formatVersionTimestamp(v.createdAt)}`}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Select value={feedbackMode} onValueChange={(v: FeedbackMode) => setFeedbackMode(v)}>
                <SelectTrigger className="w-[160px] min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quick">Quick Review</SelectItem>
                  <SelectItem value="deep">Deep Review</SelectItem>
                  <SelectItem value="compare">Compare Review</SelectItem>
                </SelectContent>
              </Select>
              <Button variant={viewMode === "compare" ? "default" : "outline"} onClick={() => setViewMode(viewMode === "compare" ? "edit" : "compare")}>
                <CompareIcon className="h-4 w-4 mr-2" />
                {viewMode === "compare" ? "Edit Mode" : "Compare Mode"}
              </Button>
              <Button variant="outline" onClick={() => previewFeedbackMutation.mutate()}
                disabled={
                  previewFeedbackMutation.isPending ||
                  (feedbackMode === "compare" ? !getVersionContent(compareBaseVersionId).trim() || !getVersionContent(compareTargetVersionId).trim() : !draftText.trim())
                }
              >
                {previewFeedbackMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Get Feedback
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              {isOrgContextMissing
                ? "Source: organization context not resolved yet."
                : sourceLoading
                ? "Source: loading lesson source content..."
                : sourceError
                ? "Source: unable to load source content for this lesson/language."
                : sourceData?.text
                ? `Source: ${sourceData?.source === "sourceDocument" ? "Original uploaded document" : "Lesson content (database)"}${
                    typeof sourceData?.extractedWordCount === "number" ? ` | ${sourceData.extractedWordCount} words` : ""
                  }`
                : "Source: no lesson source content found yet."}
            </p>
            {latestFeedbackRunData?.isStaleForSelectedVersion && (
              <div className="rounded-md border border-[var(--warning)]/20 bg-warning/10 px-3 py-2 text-xs text-warning">
                Feedback exists for this version, but content has changed since that run. Please click <span className="font-semibold">Get Feedback</span> again before applying fixes.
              </div>
            )}

            {viewMode === "compare" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Select value={compareBaseVersionId} onValueChange={setCompareBaseVersionId}>
                  <SelectTrigger className="min-h-[44px]">
                    <SelectValue placeholder="Base version" />
                  </SelectTrigger>
                  <SelectContent>
                    {versionsWithCurrent.map((v: any) => (
                      <SelectItem key={`base-${normalizeVersionId(v.id)}`} value={normalizeVersionId(v.id)}>
                        {isCurrentVersionId(v.id)
                          ? `Current Version (Active) - ${formatVersionTimestamp(v.createdAt)}`
                          : isInitialVersionId(v.id)
                          ? `Initial Version - ${formatVersionTimestamp(v.createdAt)}`
                          : `${getSemanticVersionLabel(v)} - ${getVersionSourceLabel(v.source)} - ${formatVersionTimestamp(v.createdAt)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={compareTargetVersionId} onValueChange={setCompareTargetVersionId}>
                  <SelectTrigger className="min-h-[44px]">
                    <SelectValue placeholder="Target version" />
                  </SelectTrigger>
                  <SelectContent>
                    {versionsWithCurrent.map((v: any) => (
                      <SelectItem key={`target-${normalizeVersionId(v.id)}`} value={normalizeVersionId(v.id)}>
                        {isCurrentVersionId(v.id)
                          ? `Current Version (Active) - ${formatVersionTimestamp(v.createdAt)}`
                          : isInitialVersionId(v.id)
                          ? `Initial Version - ${formatVersionTimestamp(v.createdAt)}`
                          : `${getSemanticVersionLabel(v)} - ${getVersionSourceLabel(v.source)} - ${formatVersionTimestamp(v.createdAt)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {viewMode === "compare" ? (
              <div className="space-y-3">
                <div className="rounded-md border p-2 bg-muted/30 flex flex-wrap items-center gap-2 justify-between">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="secondary" >+ {diffSummary.added} added</Badge>
                    <Badge variant="secondary" >- {diffSummary.removed} removed</Badge>
                    <Badge variant="secondary" >~ {diffSummary.changed} changed</Badge>
                    <Badge variant="outline">{diffSummary.total} total differences</Badge>
                    <Badge variant="outline">
                      Base: {getVersionDisplayLabel(compareBaseVersionId)}
                    </Badge>
                    <Badge variant="outline">
                      Target: {getVersionDisplayLabel(compareTargetVersionId)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant={compareLayout === "inline" ? "default" : "outline"} onClick={() => setCompareLayout("inline")}>
                      Inline Diff
                    </Button>
                    <Button size="sm" variant={compareLayout === "side-by-side" ? "default" : "outline"} onClick={() => setCompareLayout("side-by-side")}>
                      Side-by-Side
                    </Button>
                    <Button size="sm" variant={showChangedOnly ? "default" : "outline"} onClick={() => setShowChangedOnly((v) => !v)}>
                      {showChangedOnly ? "Changed Only" : "Show All Lines"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigateDiff("prev")} disabled={diffSummary.total === 0}>Previous Change</Button>
                    <Button size="sm" variant="outline" onClick={() => navigateDiff("next")} disabled={diffSummary.total === 0}>Next Change</Button>
                  </div>
                </div>
                {visibleDiffRows.length === 0 && (
                  <div className="rounded-md border p-4 text-sm text-muted-foreground">
                    No differences found for the selected versions.
                  </div>
                )}
                {compareLayout === "inline" ? (
                  <Card>
                    <CardContent className="p-0">
                      <div className="max-h-[60vh] overflow-auto border rounded-md">
                        {visibleDiffRows.map((row, idx) => {
                          const tokenDiff = row.kind === "changed" ? diffTokens(row.leftText, row.rightText) : null;
                          return (
                            <div
                              key={`inline-${idx}`}
                              ref={(el) => { rowRefs.current[idx] = el; }}
                              className={
                                row.kind === "added"
                                  ? "border-b bg-success/10"
                                  : row.kind === "removed"
                                  ? "border-b bg-cyan-100"
                                  : row.kind === "changed"
                                  ? "border-b bg-warning/10"
                                  : "border-b bg-background"
                              }
                            >
                              {row.kind === "same" ? (
                                <div className="grid grid-cols-[88px_1fr] text-sm">
                                  <div className="px-2 py-1 text-xs text-muted-foreground border-r">{row.lineRight ?? row.lineLeft ?? ""}</div>
                                  <div className="px-2 py-1 whitespace-pre-wrap break-words">{row.rightText || <span className="text-muted-foreground italic">(no line)</span>}</div>
                                </div>
                              ) : row.kind === "added" ? (
                                <div className="grid grid-cols-[88px_1fr] text-sm">
                                  <div className="px-2 py-1 text-xs text-success border-r">After {row.lineRight ?? ""}</div>
                                  <div className="px-2 py-1 whitespace-pre-wrap break-words text-success">{row.rightText || <span className="text-muted-foreground italic">(no line)</span>}</div>
                                </div>
                              ) : row.kind === "removed" ? (
                                <div className="grid grid-cols-[88px_1fr] text-sm">
                                  <div className="px-2 py-1 text-xs text-cyan-700 border-r">Before {row.lineLeft ?? ""}</div>
                                  <div className="px-2 py-1 whitespace-pre-wrap break-words text-cyan-800 line-through">{row.leftText || <span className="text-muted-foreground italic">(no line)</span>}</div>
                                </div>
                              ) : (
                                <div className="space-y-0.5 py-1">
                                  <div className="grid grid-cols-[88px_1fr] text-sm">
                                    <div className="px-2 py-1 text-xs text-cyan-700 border-r">Before {row.lineLeft ?? ""}</div>
                                    <div className="px-2 py-1 whitespace-pre-wrap break-words text-cyan-800">
                                      {tokenDiff
                                        ? tokenDiff.left.map((token, tokenIdx) => (
                                            <span key={`inline-lt-${idx}-${tokenIdx}`} className={token.changed ? "bg-cyan-200 line-through rounded-sm" : ""}>
                                              {token.text}
                                            </span>
                                          ))
                                        : row.leftText || <span className="text-muted-foreground italic">(no line)</span>}
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-[88px_1fr] text-sm">
                                    <div className="px-2 py-1 text-xs text-success border-r">After {row.lineRight ?? ""}</div>
                                    <div className="px-2 py-1 whitespace-pre-wrap break-words text-success">
                                      {tokenDiff
                                        ? tokenDiff.right.map((token, tokenIdx) => (
                                            <span key={`inline-rt-${idx}-${tokenIdx}`} className={token.changed ? "bg-success font-medium rounded-sm" : ""}>
                                              {token.text}
                                            </span>
                                          ))
                                        : row.rightText || <span className="text-muted-foreground italic">(no line)</span>}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Base: {getVersionDisplayLabel(compareBaseVersionId)}</CardTitle>
                        <CardDescription className="text-xs">{getVersionTimestamp(compareBaseVersionId)}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div ref={leftCompareRef} className="max-h-[55vh] overflow-auto border rounded-md">
                          {visibleDiffRows.map((row, idx) => {
                            const tokenDiff = row.kind === "changed" ? diffTokens(row.leftText, row.rightText) : null;
                            return (
                              <div
                                key={`left-${idx}`}
                                ref={(el) => { rowRefs.current[idx] = el; }}
                                className={
                                  row.kind === "removed"
                                    ? "border-b bg-cyan-100"
                                    : row.kind === "changed"
                                    ? "border-b bg-warning/10"
                                    : row.kind === "added"
                                    ? "border-b bg-muted/30"
                                    : "border-b"
                                }
                              >
                                <div className="grid grid-cols-[78px_1fr] text-sm">
                                  <div className={row.kind === "same" || row.kind === "added"
                                    ? "px-2 py-1 text-xs text-muted-foreground border-r"
                                    : "px-2 py-1 text-xs text-cyan-700 border-r"}
                                  >
                                    {row.lineLeft ?? ""} {row.kind === "removed" ? "Before" : row.kind === "changed" ? "Before" : " "}
                                  </div>
                                  <div className={row.kind === "same" || row.kind === "added"
                                    ? "px-2 py-1 whitespace-pre-wrap break-words"
                                    : "px-2 py-1 whitespace-pre-wrap break-words text-cyan-800"}
                                  >
                                    {row.kind === "changed" && tokenDiff
                                      ? tokenDiff.left.map((token, tokenIdx) => (
                                          <span key={`lt-${idx}-${tokenIdx}`} className={token.changed ? "bg-cyan-200 line-through rounded-sm" : ""}>
                                            {token.text}
                                          </span>
                                        ))
                                      : row.leftText || <span className="text-muted-foreground italic">(no line)</span>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Target: {getVersionDisplayLabel(compareTargetVersionId)}</CardTitle>
                        <CardDescription className="text-xs">{getVersionTimestamp(compareTargetVersionId)}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div ref={rightCompareRef} className="max-h-[55vh] overflow-auto border rounded-md">
                          {visibleDiffRows.map((row, idx) => {
                            const tokenDiff = row.kind === "changed" ? diffTokens(row.leftText, row.rightText) : null;
                            return (
                              <div
                                key={`right-${idx}`}
                                className={
                                  row.kind === "added"
                                    ? "border-b bg-success/10"
                                    : row.kind === "changed"
                                    ? "border-b bg-warning/10"
                                    : row.kind === "removed"
                                    ? "border-b bg-muted/30"
                                    : "border-b"
                                }
                              >
                                <div className="grid grid-cols-[78px_1fr] text-sm">
                                  <div className="px-2 py-1 text-xs text-muted-foreground border-r">
                                    {row.lineRight ?? ""} {row.kind === "added" ? "After" : row.kind === "changed" ? "After" : " "}
                                  </div>
                                  <div className="px-2 py-1 whitespace-pre-wrap break-words">
                                    {row.kind === "changed" && tokenDiff
                                      ? tokenDiff.right.map((token, tokenIdx) => (
                                          <span key={`rt-${idx}-${tokenIdx}`} className={token.changed ? "bg-success font-medium rounded-sm" : ""}>
                                            {token.text}
                                          </span>
                                        ))
                                      : row.rightText || <span className="text-muted-foreground italic">(no line)</span>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            ) : sourceLoading ? (
              <div className="min-h-[55vh] border rounded-md flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading source content...
              </div>
            ) : sourceError ? (
              <div className="min-h-[55vh] border rounded-md flex items-center justify-center text-destructive">
                Could not load source content. Please retry from Course Lessons.
              </div>
            ) : !selectedVersionText?.trim() ? (
              <div className="min-h-[55vh] border rounded-md flex items-center justify-center text-muted-foreground">
                No source content is available for this lesson yet.
              </div>
            ) : (
              <Textarea
                value={selectedVersionText}
                onChange={(e) => {
                  setDraftText(e.target.value);
                  setDirty(true);
                }}
                readOnly={!canSave}
                className="min-h-[55vh] text-sm"
              />
            )}

            {!!feedback && (
              <Card className="border-border bg-primary/5">
                <CardHeader>
                  <CardTitle className="text-sm">Feedback Score: {Math.round(Number(feedback?.overallScore || 0))} / 100</CardTitle>
                  <CardDescription>{String(feedback?.summary || "Feedback generated successfully.")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-md border bg-background p-2 text-xs flex flex-wrap items-center gap-2">
                    <Badge variant={feedback?.persistedForVersion ? "default" : "secondary"}>
                      {feedback?.persistedForVersion ? "Saved for selected version" : "Preview only (unsaved text)"}
                    </Badge>
                    {feedback?.selectedVersionRef && (
                      <span className="text-muted-foreground">Version: {feedback.selectedVersionRef}</span>
                    )}
                  </div>

                  {Array.isArray(feedback?.strengths) && feedback.strengths.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold mb-1">What is working well</div>
                      <ul className="list-disc pl-5 text-sm space-y-1">
                        {feedback.strengths.slice(0, 4).map((s: string, idx: number) => (
                          <li key={`studio-strength-${idx}`}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="text-xs font-semibold">Relevance Audit (User-controlled)</div>
                  {relevanceAuditItems.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No specific relevance candidates were found for this version.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {relevanceAuditItems.map((item, idx) => {
                        const id = String(item.id || item.itemHash || `local-${idx}`);
                        const checked = selectedRelevanceItemIds.includes(id);
                        const confidence = Number(item.confidence || 0);
                        const confidenceLabel = `${Math.round(confidence * 100)}%`;
                        return (
                          <div key={id} className="rounded-md border bg-background p-3">
                            <div className="flex items-start gap-3">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(value) => {
                                  const nextChecked = value === true;
                                  setSelectedRelevanceItemIds((current) =>
                                    nextChecked ? Array.from(new Set([...current, id])) : current.filter((entry) => entry !== id)
                                  );
                                  if (feedback?.feedbackRunId && item.id) {
                                    saveFeedbackDecisionMutation.mutate({
                                      runId: feedback.feedbackRunId,
                                      itemId: item.id,
                                      decision: nextChecked ? "accepted" : "ignored",
                                    });
                                    setFeedback((prev) => {
                                      if (!prev) return prev;
                                      return {
                                        ...prev,
                                        relevanceAudit: prev.relevanceAudit?.map((i) =>
                                          i.id === item.id ? { ...i, userDecision: nextChecked ? "accepted" : "ignored" } : i
                                        )
                                      };
                                    });
                                  }
                                }}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 justify-between">
                                  <div className="font-medium text-sm">{item.title}</div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant={item.category === "off_topic" ? "destructive" : item.category === "possibly_off_topic" ? "secondary" : "outline"} >
                                      {String(item.category || "possibly_off_topic").replace(/_/g, " ")}
                                    </Badge>
                                    <Badge variant="outline" >
                                      confidence {confidenceLabel}
                                    </Badge>
                                  </div>
                                </div>
                                {item.reason ? <p className="text-sm text-muted-foreground mt-1">{item.reason}</p> : null}
                                {item.excerpt ? (
                                  <pre className="text-xs mt-2 rounded border bg-muted/40 p-2 whitespace-pre-wrap break-words">{item.excerpt}</pre>
                                ) : null}
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {item.userDecision === "rejected" ? (
                                    <Badge variant="outline" className="text-success border-success bg-success/10 py-1.5 flex items-center">
                                      <CheckCircle2 className="h-4 w-4 mr-1.5" /> Content Kept
                                    </Badge>
                                  ) : item.userDecision === "applied" ? (
                                    <Badge variant="outline" className="text-muted-foreground border-muted flex items-center">
                                      <CheckCircle2 className="h-4 w-4 mr-1.5" /> Already Applied
                                    </Badge>
                                  ) : (
                                    <>
                                      <Button type="button" variant="outline" size="sm" onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setSelectedRelevanceItemIds((current) => current.filter((entry) => entry !== id));
                                          
                                          // Update UI instantly
                                          setFeedback((prev) => {
                                            if (!prev) return prev;
                                            return {
                                              ...prev,
                                              relevanceAudit: prev.relevanceAudit?.map((i) =>
                                                i.id === item.id || i.itemHash === item.itemHash ? { ...i, userDecision: "rejected" } : i
                                              )
                                            };
                                          });

                                          if (feedback?.feedbackRunId && item.id) {
                                            saveFeedbackDecisionMutation.mutate({
                                              runId: feedback.feedbackRunId,
                                              itemId: item.id,
                                              decision: "rejected",
                                            });
                                          } else {
                                            toast({ title: "Content Kept", description: "You marked this finding to be kept. (Local preview)"});
                                          }
                                        }}
                                      >
                                        Keep This Content
                                      </Button>
                                      <Button type="button" variant="secondary" size="sm" onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setSelectedRelevanceItemIds((current) => Array.from(new Set([...current, id])));
                                          
                                          // Update UI instantly
                                          setFeedback((prev) => {
                                            if (!prev) return prev;
                                            return {
                                              ...prev,
                                              relevanceAudit: prev.relevanceAudit?.map((i) =>
                                                i.id === item.id || i.itemHash === item.itemHash ? { ...i, userDecision: "accepted" } : i
                                              )
                                            };
                                          });

                                          if (feedback?.feedbackRunId && item.id) {
                                            saveFeedbackDecisionMutation.mutate({
                                              runId: feedback.feedbackRunId,
                                              itemId: item.id,
                                              decision: "accepted",
                                            });
                                          } else {
                                            toast({ title: "Marked for Removal", description: "Added to removal list. (Local preview)"});
                                          }
                                        }}
                                      >
                                        Mark Excerpt For Removal
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-3">
                        <div className="text-sm text-muted-foreground">
                          {selectedRelevanceItemIds.length} relevance item(s) selected for apply.
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => {
                              const defaults = relevanceAuditItems
                                .map((item, idx) => ({ item, id: String(item.id || item.itemHash || `local-${idx}`) }))
                                .filter(({ item }) => !!item.defaultSelected)
                                .map(({ id }) => id);
                              setSelectedRelevanceItemIds(defaults);
                            }}
                          >
                            Select Recommended
                          </Button>
                          <Button type="button" size="sm" onClick={() => applySelectedRelevanceMutation.mutate()}
                            disabled={
                              applySelectedRelevanceMutation.isPending ||
                              selectedRelevanceItemIds.length === 0 ||
                              !feedback?.feedbackRunId ||
                              viewMode === "compare" ||
                              !isCurrentVersionId(selectedDocVersion)
                            }
                          >
                            {applySelectedRelevanceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                            Apply Selected Fixes
                          </Button>
                        </div>
                      </div>

                      {selectedRelevancePreview.selectedCount > 0 && (
                        <div className="rounded-md border bg-background p-3 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-medium">Removal Preview (before apply)</div>
                            <Badge variant="outline" >
                              chars removed estimate: {selectedRelevancePreview.removedChars}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Only matching excerpts are removed from the text. Entire topics are not automatically deleted.
                          </p>

                          {selectedRelevancePreview.willRemove.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-xs font-semibold">Will remove</div>
                              {selectedRelevancePreview.willRemove.map((entry) => (
                                <div key={`preview-remove-${entry.id}`} className="rounded border bg-muted/30 p-2">
                                  <div className="text-xs font-medium">{entry.title}</div>
                                  <pre className="text-xs mt-1 whitespace-pre-wrap break-words">{entry.excerpt}</pre>
                                </div>
                              ))}
                            </div>
                          )}

                          {selectedRelevancePreview.noMatch.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-xs font-semibold text-warning">Selected but no exact match in current text</div>
                              {selectedRelevancePreview.noMatch.map((entry) => (
                                <div key={`preview-nomatch-${entry.id}`} className="rounded border bg-warning/10 p-2">
                                  <div className="text-xs font-medium">{entry.title}</div>
                                  <pre className="text-xs mt-1 whitespace-pre-wrap break-words">{entry.excerpt}</pre>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="text-xs font-semibold">Actionable Recommendations</div>
                  {feedbackActions.length > 0 && (
                    <div className="mb-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-primary/20 bg-primary/5 rounded-md p-3">
                      <div>
                        <span className="font-semibold text-sm">Auto-Fix with AI</span>
                        <p className="text-muted-foreground text-xs mt-0.5">Automatically apply all best practices to the current draft.</p>
                      </div>
                      <Button size="sm" type="button" onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!feedback) {
                             toast({ title: "Not ready", description: "Feedback is not loaded.", variant: "destructive" });
                             return;
                          }
                          aiImproveMutation.mutate();
                        }} 
                        disabled={aiImproveMutation.isPending || isPollingAiFix || viewMode === "compare" || !isCurrentVersionId(selectedDocVersion) || !feedback}>
                        {aiImproveMutation.isPending || isPollingAiFix ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                        Apply All AI Fixes
                      </Button>
                    </div>
                  )}

                  {feedbackActions.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No specific actions were returned. Try Deep Review for richer recommendations.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {feedbackActions.map((action, idx) => (
                        <div key={`${action.id || action.title}-${idx}`} className="rounded-md border bg-background p-3">
                          <div className="flex flex-wrap items-center gap-2 justify-between">
                            <div className="font-medium text-sm">{action.title}</div>
                            <div className="flex items-center gap-2">
                              {action.priority && <Badge variant="outline" >{String(action.priority)}</Badge>}
                              {action.category && <Badge variant="secondary" >{String(action.category)}</Badge>}
                            </div>
                          </div>
                          {action.description ? (
                            <p className="text-sm text-muted-foreground mt-1">{action.description}</p>
                          ) : null}
                          {action.example ? (
                            <p className="text-xs text-muted-foreground mt-1">
                              Example: {String(action.example)}
                            </p>
                          ) : null}
                          <div className="mt-2 flex items-center justify-end">
                            <Button size="sm" type="button" onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                applyFeedbackActionMutation.mutate({ action, actionIndex: idx });
                              }}
                              disabled={
                                applyFeedbackActionMutation.isPending ||
                                viewMode === "compare" ||
                                !isCurrentVersionId(selectedDocVersion)
                              }
                            >
                              {applyFeedbackActionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                              Apply This Fix
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {(viewMode === "compare" || !isCurrentVersionId(selectedDocVersion)) && (
                    <div className="text-xs text-warning bg-warning/10 border border-[var(--warning)]/20 rounded p-2">
                      Switch to Edit Mode and Current Version (Active) to apply recommendation buttons.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {showDeleteConfirm && (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardHeader>
                  <CardTitle className="text-destructive text-sm">Delete Source Content</CardTitle>
                  <CardDescription>Are you sure you want to delete this source content? This cannot be undone.</CardDescription>
                </CardHeader>
                <CardContent className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                  <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                    {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                    Delete Content
                  </Button>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)} disabled={!sourceData?.text}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Content
              </Button>
              <div className="flex items-center gap-2">
                {canSetAsCurrent && (
                  <Button variant="outline" onClick={() => setCurrentVersionMutation.mutate()} disabled={setCurrentVersionMutation.isPending}>
                    {setCurrentVersionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                    Set As Current
                  </Button>
                )}
                <Button onClick={() => saveMutation.mutate()} disabled={!canSave || !dirty || !draftText.trim() || saveMutation.isPending}>
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Save
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </QuizAdminLayout>
  );
}
