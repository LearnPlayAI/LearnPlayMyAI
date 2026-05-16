import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Download, FileArchive, FileUp, Loader2, ShieldAlert, CheckCircle2, ArrowRight, Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

export type TransferMode = "export" | "import";

type TransferJobStatus = {
  id: string;
  type: TransferMode;
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  progress: number;
  phase: string;
  error?: string;
  details?: any;
};

type ExportPreflight = {
  course: { id: string; title: string; languageCode: string | null };
  includedTables: string[];
  rowCounts: Record<string, number>;
  familySummary?: {
    courseCount: number;
    versionCount: number;
    translationCount: number;
    languageCodes: string[];
    lessonCount: number;
    quizCount: number;
  };
  clonePolicy?: {
    fullFamily: boolean;
    importDefaultMode: string;
    importedCourseStatus: string;
    targetOrgResolution: string;
  };
  artifactPortability?: {
    packageContainsSelectedArtifacts: boolean;
    targetStorageStrategy: string;
    originalPathsAreInformational: boolean;
  };
  artifacts: { discovered: string[]; selected: string[] };
  missingSelected: Array<{ sourcePath: string; reason: string }>;
  estimatedBytes: number;
};

type ImportAnalyze = {
  manifest: any;
  rowCounts: Record<string, number>;
  familySummary?: {
    courseCount: number;
    versionCount: number;
    translationCount: number;
    languageCodes: string[];
    lessonCount: number;
    quizCount: number;
  };
  targetOrganizationId?: string;
  defaultMode?: "create_new";
  importedCourseStatus?: "draft";
  artifactPortability?: {
    packageContainsSelectedArtifacts: boolean;
    targetStorageStrategy: string;
    originalPathsAreInformational: boolean;
  };
  matchingCourses: Array<{
    id: string;
    title: string;
    languageCode: string | null;
    status: string | null;
    matchReason?: string;
    matchConfidence?: number;
    autoSelected?: boolean;
  }>;
  autoMergeTargetCourse?: {
    id: string;
    title: string;
    languageCode: string | null;
    status: string | null;
    matchReason?: string;
    matchConfidence?: number;
  } | null;
  suggestedMode: "create_new" | "merge_append_versions";
};

export interface CourseTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: TransferMode;
  course?: {
    id: string;
    title: string;
  } | null;
  onSuccess?: (job: TransferJobStatus) => void;
}

const PHASE_LABELS: Record<string, string> = {
  validating: "Validating package and access",
  collecting_metadata: "Collecting course metadata",
  collecting_files: "Collecting related files",
  packaging: "Packaging transfer zip",
  extracting: "Extracting uploaded package",
  rewriting_files: "Rewriting file references",
  importing_data: "Importing course data",
  finalizing: "Finalizing",
  completed: "Completed",
  failed: "Failed",
};

const EXPORT_STEPS = ["scope", "artifacts", "review"] as const;
const IMPORT_STEPS = ["upload", "strategy", "review"] as const;

type ExportStep = typeof EXPORT_STEPS[number];
type ImportStep = typeof IMPORT_STEPS[number];

function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase] || phase;
}

async function readTransferResponse(res: Response, fallbackMessage: string) {
  if (res.status === 413) {
    return {
      error: "The course package is larger than the current transfer upload route allows. Course transfer endpoints must be deployed with large streamed upload handling before this package can be analyzed.",
    };
  }

  const contentType = String(res.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    return res.json().catch(() => ({ error: fallbackMessage }));
  }

  const text = await res.text().catch(() => "");
  return { error: text.trim() || fallbackMessage };
}

function bytesLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function languageLabel(codes?: string[]): string {
  const clean = (codes || []).map((code) => String(code || "").trim().toUpperCase()).filter(Boolean);
  return clean.length ? clean.join(", ") : "None";
}

export function CourseTransferDialog({
  open,
  onOpenChange,
  mode,
  course,
  onSuccess,
}: CourseTransferDialogProps) {
  const [, setLocation] = useLocation();

  const [job, setJob] = useState<TransferJobStatus | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);

  const [exportStep, setExportStep] = useState<ExportStep>("scope");
  const [importStep, setImportStep] = useState<ImportStep>("upload");

  const [includeArtifacts, setIncludeArtifacts] = useState(true);
  const [failOnMissingArtifacts, setFailOnMissingArtifacts] = useState(true);
  const [selectedArtifactPaths, setSelectedArtifactPaths] = useState<string[]>([]);
  const [artifactSelectionDirty, setArtifactSelectionDirty] = useState(false);
  const [exportPreflight, setExportPreflight] = useState<ExportPreflight | null>(null);
  const [exportPreflightLoading, setExportPreflightLoading] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importAnalyze, setImportAnalyze] = useState<ImportAnalyze | null>(null);
  const [importAnalyzeLoading, setImportAnalyzeLoading] = useState(false);
  const [importMode, setImportMode] = useState<"create_new" | "merge_append_versions">("create_new");
  const [importTargetCourseId, setImportTargetCourseId] = useState<string>("");

  const isRunning = job?.status === "queued" || job?.status === "running";
  const isDone = job?.status === "completed";
  const isFailed = job?.status === "failed" || job?.status === "canceled";
  const hasRecoverableTransferState = importAnalyzeLoading || isRunning || !!job;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedMergeTarget = useMemo(() => {
    return (importAnalyze?.matchingCourses || []).find((row) => row.id === importTargetCourseId) || null;
  }, [importAnalyze?.matchingCourses, importTargetCourseId]);

  const title = useMemo(() => (mode === "export" ? "Export Course" : "Import Course"), [mode]);
  const description = useMemo(() => {
    if (mode === "export") {
      return "Select scope, verify artifacts, and generate a transfer package.";
    }
    return "Upload a package, analyze conflicts, choose strategy, and run import.";
  }, [mode]);

  const stepMeta = useMemo(() => {
    if (mode === "export") {
      const idx = EXPORT_STEPS.indexOf(exportStep);
      return { current: idx + 1, total: EXPORT_STEPS.length, percent: ((idx + 1) / EXPORT_STEPS.length) * 100 };
    }
    const idx = IMPORT_STEPS.indexOf(importStep);
    return { current: idx + 1, total: IMPORT_STEPS.length, percent: ((idx + 1) / IMPORT_STEPS.length) * 100 };
  }, [mode, exportStep, importStep]);

  const pollJob = async (jobId: string) => {
    const endpoint = mode === "export"
      ? `/api/courses/export-jobs/${jobId}`
      : `/api/courses/import-jobs/${jobId}`;

    while (true) {
      const res = await fetch(endpoint, { credentials: "include" });
      if (!res.ok) {
        throw new Error("Unable to fetch transfer job status");
      }
      const next = await res.json();
      setJob(next);
      setInlineNotice(null);

      if (next.status === "completed") {
        onSuccess?.(next);
        return next;
      }
      if (next.status === "failed" || next.status === "canceled") {
        return next;
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  };

  const requestCancel = async () => {
    if (!job?.id || !isRunning) return;
    const endpoint = mode === "export"
      ? `/api/courses/export-jobs/${job.id}/cancel`
      : `/api/courses/import-jobs/${job.id}/cancel`;
    await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });
  };

  const runExportPreflight = async (paths?: string[]) => {
    if (!course?.id) return;
    setExportPreflightLoading(true);
    try {
      const res = await fetch(`/api/courses/${course.id}/export-preflight`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedArtifactPaths: paths || selectedArtifactPaths }),
      });
      const payload = await readTransferResponse(res, "Failed to load export preflight");
      if (!res.ok) throw new Error(payload?.error || "Failed to load export preflight");
      setExportPreflight(payload);
      if (!paths?.length) {
        const discovered = Array.isArray(payload?.artifacts?.discovered) ? payload.artifacts.discovered : [];
        setSelectedArtifactPaths(discovered);
      }
      setArtifactSelectionDirty(false);
      setInlineError(null);
      setInlineNotice(null);
    } catch (error: any) {
      setInlineError(error?.message || "Failed to load export preflight");
    } finally {
      setExportPreflightLoading(false);
    }
  };

  const analyzeImportPackage = async (file: File) => {
    setImportAnalyzeLoading(true);
    try {
      const formData = new FormData();
      formData.append("package", file);
      const res = await fetch("/api/courses/import-analyze", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const payload = await readTransferResponse(res, "Failed to analyze package");
      if (!res.ok) throw new Error(payload?.error || "Failed to analyze package");
      setImportAnalyze(payload);
      setImportMode(payload?.suggestedMode === "merge_append_versions" ? "merge_append_versions" : "create_new");
      const firstCandidate = payload?.autoMergeTargetCourse || (Array.isArray(payload?.matchingCourses) ? payload.matchingCourses[0] : null);
      setImportTargetCourseId(firstCandidate?.id || "");
      setInlineError(null);
      setInlineNotice(null);
      setImportStep("strategy");
    } catch (error: any) {
      setInlineError(error?.message || "Failed to analyze package");
    } finally {
      setImportAnalyzeLoading(false);
    }
  };

  const handleImportFileSelected = (file: File | null) => {
    setSelectedFile(file);
    setImportAnalyze(null);
    setImportMode("create_new");
    setImportTargetCourseId("");
    setInlineError(null);
    setInlineNotice(null);
    if (file) {
      void analyzeImportPackage(file);
    }
  };

  const handleImportNext = async () => {
    if (importStep === "upload") {
      if (!selectedFile) return;
      if (!importAnalyze) {
        await analyzeImportPackage(selectedFile);
        return;
      }
      setImportStep("strategy");
      return;
    }
    setImportStep("review");
  };

  const startExport = async () => {
    if (!course?.id) return;
    setInlineError(null);
    setInlineNotice(null);
    setJob(null);

    const res = await fetch(`/api/courses/${course.id}/export-job`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        includeArtifacts,
        failOnMissingArtifacts,
        selectedArtifactPaths: includeArtifacts ? selectedArtifactPaths : [],
      }),
    });

    const payload = await readTransferResponse(res, "Failed to start export job");
    if (!res.ok) {
      throw new Error(payload?.error || "Failed to start export job");
    }

    await pollJob(payload.jobId);
  };

  const startImport = async () => {
    if (!selectedFile) {
      throw new Error("Select a .zip package before importing");
    }

    setInlineError(null);
    setInlineNotice(null);
    setJob(null);

    const formData = new FormData();
    formData.append("package", selectedFile);
    formData.append("options", JSON.stringify({ mode: importMode, targetCourseId: importTargetCourseId || null }));

    const res = await fetch("/api/courses/import-job", {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    const payload = await readTransferResponse(res, "Failed to start import job");
    if (!res.ok) {
      throw new Error(payload?.error || "Failed to start import job");
    }

    await pollJob(payload.jobId);
  };

  const handlePrimaryAction = async () => {
    try {
      if (mode === "export") {
        await startExport();
      } else {
        await startImport();
      }
    } catch (error: any) {
      setInlineError(error?.message || "Transfer failed");
      setInlineNotice(null);
    }
  };

  useEffect(() => {
    if (!open || mode !== "export" || !course?.id) return;
    if (exportPreflight || exportPreflightLoading) return;
    runExportPreflight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, course?.id]);

  const resetState = (nextOpen: boolean) => {
    if (!nextOpen) {
      if (hasRecoverableTransferState) {
        onOpenChange(false);
        return;
      }
      setInlineError(null);
      setInlineNotice(null);
      setJob(null);
      setExportStep("scope");
      setImportStep("upload");
      setExportPreflight(null);
      setExportPreflightLoading(false);
      setSelectedArtifactPaths([]);
      setArtifactSelectionDirty(false);
      setIncludeArtifacts(true);
      setFailOnMissingArtifacts(true);
      setSelectedFile(null);
      setImportAnalyze(null);
      setImportAnalyzeLoading(false);
      setImportMode("create_new");
      setImportTargetCourseId("");
    }
    onOpenChange(nextOpen);
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    resetState(nextOpen);
  };

  const preventRecoverableDismiss = (event: Event) => {
    if (!hasRecoverableTransferState) return;
    event.preventDefault();
    setInlineNotice(
      isRunning || importAnalyzeLoading
        ? "Transfer still running. Use Request Cancel if you need to stop it, or wait for it to finish."
        : "This transfer result is still available here. Use the action button before closing if you need the package or imported course.",
    );
    setInlineError(null);
  };

  const handleDownload = () => {
    if (!job?.id) return;
    window.location.href = `/api/courses/export-jobs/${job.id}/download`;
  };

  const handleGoToImportedCourse = () => {
    const importedCourseId = String(job?.details?.importedCourseId || "").trim();
    if (!importedCourseId) return;
    resetState(false);
    setLocation(`/course-builder/${importedCourseId}/edit`);
  };

  const toggleSelectedArtifact = (artifactPath: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...selectedArtifactPaths, artifactPath]))
      : selectedArtifactPaths.filter((p) => p !== artifactPath);
    setSelectedArtifactPaths(next);
    setArtifactSelectionDirty(true);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="max-w-3xl"
        aria-describedby="course-transfer-description"
        onPointerDownOutside={preventRecoverableDismiss}
        onEscapeKeyDown={preventRecoverableDismiss}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "export" ? <FileArchive className="h-5 w-5" /> : <FileUp className="h-5 w-5" />}
            {title}
          </DialogTitle>
          <DialogDescription id="course-transfer-description">{description}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {!isDone && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs" style={{ color: "var(--stepper-label)" }}>
                <span>Step {stepMeta.current} of {stepMeta.total}</span>
                <span>{Math.round(stepMeta.percent)}%</span>
              </div>
              <Progress value={stepMeta.percent} />
            </div>
          )}

          {inlineError && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Transfer failed</AlertTitle>
              <AlertDescription>{inlineError}</AlertDescription>
            </Alert>
          )}

          {inlineNotice && (
            <Alert variant="info">
              <Info className="h-4 w-4" />
              <AlertTitle>Transfer still running</AlertTitle>
              <AlertDescription>{inlineNotice}</AlertDescription>
            </Alert>
          )}

          {mode === "export" && !job && (
            <div className="space-y-4">
              {exportStep === "scope" && (
                <div className="space-y-4 rounded-lg border border-border p-4 bg-card" style={{ backgroundColor: "var(--step-card-bg)", borderColor: "var(--step-card-border)" }}>
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold" style={{ color: "var(--step-card-title)" }}>Scope & Safety</h3>
                    <p className="text-sm" style={{ color: "var(--step-card-body)" }}>
                      Configure strictness and verify package impact before export.
                    </p>
                  </div>

                  <label className="flex items-center gap-3 text-sm text-foreground">
                    <Checkbox checked={includeArtifacts} onCheckedChange={(v) => setIncludeArtifacts(Boolean(v))} />
                    Include binary artifacts
                  </label>
                  <label className="flex items-center gap-3 text-sm text-foreground">
                    <Checkbox checked={failOnMissingArtifacts} onCheckedChange={(v) => setFailOnMissingArtifacts(Boolean(v))} />
                    Fail export when selected artifacts are missing
                  </label>

                  <div className="rounded-md border border-border p-3 bg-background">
                    <div className="text-sm font-medium">Preflight</div>
                    {exportPreflightLoading && <div className="text-xs text-muted-foreground mt-1">Loading preflight...</div>}
                    {exportPreflight && (
                      <div className="mt-2 text-xs text-muted-foreground space-y-1">
                        <div>Courses in family: {exportPreflight.familySummary?.courseCount ?? 1}</div>
                        <div>Languages: {languageLabel(exportPreflight.familySummary?.languageCodes)}</div>
                        <div>Versions: {exportPreflight.familySummary?.versionCount ?? 0}</div>
                        <div>Lessons: {exportPreflight.familySummary?.lessonCount ?? 0}</div>
                        <div>Quizzes: {exportPreflight.familySummary?.quizCount ?? 0}</div>
                        <div>Included tables: {exportPreflight.includedTables.length}</div>
                        <div>Discovered artifacts: {exportPreflight.artifacts.discovered.length}</div>
                        <div>Estimated artifact size: {bytesLabel(exportPreflight.estimatedBytes)}</div>
                        <div>Missing selected artifacts: {exportPreflight.missingSelected.length}</div>
                      </div>
                    )}
                  </div>
                  <Alert variant="info">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>Portable full-family clone</AlertTitle>
                    <AlertDescription>
                      Export includes versions, translations, related course data, and selected binaries. The downloaded package is protected, and original file paths are recorded for audit only; import rewrites packaged artifacts into the target system storage.
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              {exportStep === "artifacts" && (
                <div className="space-y-3 rounded-lg border border-border p-4 bg-card" style={{ backgroundColor: "var(--step-card-bg)", borderColor: "var(--step-card-border)" }}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold" style={{ color: "var(--step-card-title)" }}>Select Artifacts</h3>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{selectedArtifactPaths.length} selected</Badge>
                      <Button type="button" variant="outline" size="sm" onClick={() => runExportPreflight(selectedArtifactPaths)}
                        disabled={exportPreflightLoading}
                      >
                        Recalculate
                      </Button>
                    </div>
                  </div>
                  {artifactSelectionDirty && (
                    <div className="text-xs text-muted-foreground">
                      Selection changed. Recalculate to refresh estimate and missing-asset checks.
                    </div>
                  )}
                  <div className="max-h-64 overflow-auto space-y-2 pr-1">
                    {(exportPreflight?.artifacts?.discovered || []).map((artifact) => {
                      const checked = selectedArtifactPaths.includes(artifact);
                      return (
                        <label key={artifact} className="flex items-start gap-3 rounded border border-border bg-background p-2 text-xs">
                          <Checkbox checked={checked} onCheckedChange={(v) => toggleSelectedArtifact(artifact, Boolean(v))} />
                          <span className="break-all">{artifact}</span>
                        </label>
                      );
                    })}
                    {!exportPreflight?.artifacts?.discovered?.length && (
                      <div className="text-xs text-muted-foreground">No artifact references were discovered.</div>
                    )}
                  </div>
                </div>
              )}

              {exportStep === "review" && (
                <div className="space-y-3 rounded-lg border border-border p-4 bg-card" style={{ backgroundColor: "var(--step-card-bg)", borderColor: "var(--step-card-border)" }}>
                  <h3 className="text-base font-semibold" style={{ color: "var(--step-card-title)" }}>Review Export</h3>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div>Course: {course?.title || "-"}</div>
                    <div>Courses in family: {exportPreflight?.familySummary?.courseCount ?? 1}</div>
                    <div>Languages: {languageLabel(exportPreflight?.familySummary?.languageCodes)}</div>
                    <div>Versions: {exportPreflight?.familySummary?.versionCount ?? 0}</div>
                    <div>Imported status on target: Draft</div>
                    <div>Package protection: Encrypted transfer payload</div>
                    <div>Artifacts included: {includeArtifacts ? "Yes" : "No"}</div>
                    <div>Selected artifacts: {includeArtifacts ? selectedArtifactPaths.length : 0}</div>
                    <div>Fail on missing: {failOnMissingArtifacts ? "Yes" : "No"}</div>
                    {exportPreflight && <div>Estimated size: {bytesLabel(exportPreflight.estimatedBytes)}</div>}
                  </div>
                  {!!exportPreflight?.missingSelected?.length && (
                    <Alert variant="destructive">
                      <AlertTitle>Missing Selected Artifacts</AlertTitle>
                      <AlertDescription>
                        {exportPreflight.missingSelected.length} selected artifact(s) are unavailable and may block strict export.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </div>
          )}

          {mode === "import" && !job && (
            <div className="space-y-4">
              {importStep === "upload" && (
                <div className="space-y-3 rounded-lg border border-border p-4 bg-card" style={{ backgroundColor: "var(--step-card-bg)", borderColor: "var(--step-card-border)" }}>
                  <h3 className="text-base font-semibold" style={{ color: "var(--step-card-title)" }}>Upload & Analyze</h3>
                  <input
                    id="course-import-package"
                    ref={fileInputRef}
                    type="file"
                    accept=".zip,application/zip"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      handleImportFileSelected(file);
                    }}
                    className="sr-only"
                  />
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                      Choose Zip
                    </Button>
                    <span className="text-xs text-muted-foreground">{selectedFile?.name || "No file selected"}</span>
                  </div>
                  <Button type="button" onClick={() => selectedFile && analyzeImportPackage(selectedFile)}
                    disabled={!selectedFile || importAnalyzeLoading}
                  >
                    {importAnalyzeLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    {importAnalyzeLoading ? "Analyzing Package" : importAnalyze ? "Analyze Again" : "Analyze Package"}
                  </Button>
                  {importAnalyzeLoading && (
                    <div className="text-xs text-muted-foreground">Analyzing package so the import strategy can be selected.</div>
                  )}
                </div>
              )}

              {importStep === "strategy" && (
                <div className="space-y-3 rounded-lg border border-border p-4 bg-card" style={{ backgroundColor: "var(--step-card-bg)", borderColor: "var(--step-card-border)" }}>
                  <h3 className="text-base font-semibold" style={{ color: "var(--step-card-title)" }}>Import Strategy</h3>
                  <div className="rounded-md border border-border bg-background p-3 text-xs text-muted-foreground space-y-1">
                    <div>Target organization: {importAnalyze?.targetOrganizationId || "Current authenticated or impersonated organization"}</div>
                    <div>Package courses: {importAnalyze?.familySummary?.courseCount ?? 0}</div>
                    <div>Languages: {languageLabel(importAnalyze?.familySummary?.languageCodes)}</div>
                    <div>Versions: {importAnalyze?.familySummary?.versionCount ?? 0}</div>
                    <div>Artifacts in package: {Array.isArray(importAnalyze?.manifest?.files) ? importAnalyze?.manifest?.files.length : 0}</div>
                  </div>
                  <Alert variant="info">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>Imported courses are created as drafts</AlertTitle>
                    <AlertDescription>
                      The package is cloned into the organization you are currently authenticated to or impersonating. Packaged artifacts are copied into that system storage and references are rewritten.
                    </AlertDescription>
                  </Alert>
                  <RadioGroup
                    value={importMode}
                    onValueChange={(value) => setImportMode(value === "merge_append_versions" ? "merge_append_versions" : "create_new")}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="create_new" id="import-mode-create" />
                      <Label htmlFor="import-mode-create">Create new imported draft</Label>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="merge_append_versions" id="import-mode-merge" />
                      <Label htmlFor="import-mode-merge">Merge into existing course and append versions</Label>
                    </div>
                  </RadioGroup>

                  {importMode === "merge_append_versions" && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Automated merge target</div>
                      {selectedMergeTarget ? (
                        <div className="rounded-md border border-border bg-background p-3 text-xs text-muted-foreground space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-foreground">{selectedMergeTarget.title}</span>
                            <Badge variant="outline">{selectedMergeTarget.status || "unknown"}</Badge>
                            {selectedMergeTarget.matchReason && <Badge variant="outline">{selectedMergeTarget.matchReason}</Badge>}
                          </div>
                          <div>The matching course was selected automatically from the package course family, title, and language.</div>
                          {(importAnalyze?.matchingCourses || []).length > 1 && (
                            <div>{(importAnalyze?.matchingCourses || []).length} possible matches found; the best match will be used.</div>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">No matching courses found in this organization.</div>
                      )}
                      {!importTargetCourseId && (
                        <div className="text-xs text-destructive">
                          No merge target could be identified automatically. Import as a new draft instead.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {importStep === "review" && (
                <div className="space-y-3 rounded-lg border border-border p-4 bg-card" style={{ backgroundColor: "var(--step-card-bg)", borderColor: "var(--step-card-border)" }}>
                  <h3 className="text-base font-semibold" style={{ color: "var(--step-card-title)" }}>Review Import</h3>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div>Package: {selectedFile?.name || "-"}</div>
                    <div>Target organization: {importAnalyze?.targetOrganizationId || "Current organization"}</div>
                    <div>Mode: {importMode === "create_new" ? "Create new" : "Merge + append versions"}</div>
                    <div>Imported status: Draft</div>
                    <div>Package protection: Encrypted transfer payload</div>
                    <div>Courses in family: {importAnalyze?.familySummary?.courseCount ?? 0}</div>
                    <div>Languages: {languageLabel(importAnalyze?.familySummary?.languageCodes)}</div>
                    <div>Versions: {importAnalyze?.familySummary?.versionCount ?? 0}</div>
                    <div>Lessons: {importAnalyze?.familySummary?.lessonCount ?? 0}</div>
                    <div>Quizzes: {importAnalyze?.familySummary?.quizCount ?? 0}</div>
                    <div>Matching courses detected: {(importAnalyze?.matchingCourses || []).length}</div>
                    <div>Target course: {selectedMergeTarget ? `${selectedMergeTarget.title} (${selectedMergeTarget.status || "unknown"}, auto-selected)` : "N/A"}</div>
                    <div>Tables in package: {Object.keys(importAnalyze?.rowCounts || {}).length}</div>
                    <div>Binary artifact entries: {Array.isArray(importAnalyze?.manifest?.files) ? importAnalyze?.manifest?.files.length : 0}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {job && (
            <div className="space-y-3">
              <Alert variant={isDone ? "success" : isFailed ? "destructive" : "info"}>
                {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                <AlertTitle>
                  {isDone ? "Transfer completed" : isFailed ? "Transfer failed" : "Transfer in progress"}
                </AlertTitle>
                <AlertDescription>
                  <div className="space-y-1">
                    <p>{phaseLabel(job.phase)}</p>
                    {job.error && <p>{job.error}</p>}
                    {isDone && mode === "import" && job.details?.importedCourseTitle && (
                      <p>
                        Imported course: <span className="font-medium">{job.details.importedCourseTitle}</span>
                      </p>
                    )}
                  </div>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{phaseLabel(job.phase)}</span>
                  <span>{Math.max(0, Math.min(100, Number(job.progress || 0)))}%</span>
                </div>
                <Progress value={Number(job.progress || 0)} variant={isFailed ? "error" : isDone ? "success" : "default"} />
              </div>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => resetState(false)}>
            {isDone ? "Close" : "Cancel"}
          </Button>

          {!job && mode === "export" && !isDone && (
            <>
              {exportStep !== "scope" && (
                <Button variant="outline" onClick={() => setExportStep(exportStep === "review" ? "artifacts" : "scope")}>Back</Button>
              )}
              {exportStep !== "review" ? (
                <Button onClick={() => setExportStep(exportStep === "scope" ? "artifacts" : "review")}
                  disabled={exportPreflightLoading}
                >
                  Next
                </Button>
              ) : (
                <Button onClick={handlePrimaryAction} disabled={ isRunning || (includeArtifacts && (exportPreflight?.artifacts?.discovered?.length || 0) > 0 &&
                      !selectedArtifactPaths.length)
                  }
                >
                  <FileArchive className="h-4 w-4 mr-2" />
                  Start Export
                </Button>
              )}
            </>
          )}

          {!job && mode === "import" && !isDone && (
            <>
              {importStep !== "upload" && (
                <Button variant="outline" onClick={() => setImportStep(importStep === "review" ? "strategy" : "upload")}>Back</Button>
              )}
              {importStep !== "review" ? (
                <Button onClick={handleImportNext}
                  disabled={
                    importStep === "upload"
                      ? !selectedFile || importAnalyzeLoading
                      : importMode === "merge_append_versions" && !importTargetCourseId
                  }
                >
                  {importStep === "upload" && importAnalyzeLoading ? "Analyzing..." : "Next"}
                </Button>
              ) : (
                <Button onClick={handlePrimaryAction} disabled={isRunning || !selectedFile || (importMode === "merge_append_versions" && !importTargetCourseId)} >
                  <FileUp className="h-4 w-4 mr-2" />
                  Start Import
                </Button>
              )}
            </>
          )}

          {isRunning && (
            <Button variant="outline" onClick={requestCancel}>
              Request Cancel
            </Button>
          )}

          {mode === "export" && isDone && (
            <Button onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download Package
            </Button>
          )}

          {mode === "import" && isDone && (
            <Button onClick={handleGoToImportedCourse}>
              Open Imported Course
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
