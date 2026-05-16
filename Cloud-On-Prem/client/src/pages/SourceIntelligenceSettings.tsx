import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BrainCircuit, CheckCircle2, ChevronDown, ExternalLink, Loader2, PlugZap, Trash2 } from "lucide-react";
import QuizAdminLayout from "@/components/QuizAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type NotebookLmSummary = {
  provider: "notebooklm_enterprise";
  label: string;
  enabled: boolean;
  authMode: "service_account_json" | "google_oauth";
  projectNumber: string | null;
  location: string;
  endpointLocation: "global-" | "us-" | "eu-";
  selectedProjectId: string | null;
  selectedProjectName: string | null;
  projectOptions: Array<{ projectId: string; projectNumber: string; name: string }>;
  defaultNotebookTitle: string | null;
  sourceMode: "upload_files" | "raw_text";
  credentialConfigured: boolean;
  credentialSummary: Record<string, unknown> | null;
  oauthConfigured: boolean;
  connectionStatus: "not_configured" | "configured" | "needs_project_selection" | "available" | "unavailable" | "unsupported";
  lastTestedAt: string | null;
  lastError: string | null;
  apiCapability: {
    notebookManagement: "available";
    sourceUpload: "available";
    structuredLessonExtraction: "not_exposed";
  };
};

const QUERY_KEY = ["/api/org/source-intelligence/notebooklm"];

function statusLabel(status: NotebookLmSummary["connectionStatus"], hasCredential: boolean) {
  if (status === "needs_project_selection") return "choose project";
  if (status === "configured" || status === "unsupported") return "connected";
  if (hasCredential) return "connected";
  return "not connected";
}

export default function SourceIntelligenceSettings() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [defaultNotebookTitle, setDefaultNotebookTitle] = useState("");
  const [sourceMode, setSourceMode] = useState<"upload_files" | "raw_text">("upload_files");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const { data, isLoading } = useQuery<NotebookLmSummary>({
    queryKey: QUERY_KEY,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("notebookLmConnected");
    const error = params.get("notebookLmError");
    if (connected) {
      toast({ title: "Google connected", description: "Choose a project if more than one workspace is available." });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (error) {
      toast({ variant: "destructive", title: "Google connection failed", description: error.replace(/_/g, " ") });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [toast]);

  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setSelectedProjectId(data.selectedProjectId || "");
    setDefaultNotebookTitle(data.defaultNotebookTitle || "LearnPlay course sources");
    setSourceMode(data.sourceMode || "upload_files");
  }, [data]);

  const saveSettingsMutation = useMutation({
    mutationFn: () => apiRequest<NotebookLmSummary>("/api/org/source-intelligence/notebooklm/settings", {
      method: "PUT",
      body: JSON.stringify({
        enabled,
        projectNumber: data?.projectNumber || "",
        location: data?.location || "global",
        endpointLocation: data?.endpointLocation || "global-",
        defaultNotebookTitle,
        sourceMode,
      }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "NotebookLM settings saved" });
    },
    onError: (error: any) => toast({ variant: "destructive", title: "Could not save settings", description: error?.message }),
  });

  const selectProjectMutation = useMutation({
    mutationFn: () => apiRequest<NotebookLmSummary>("/api/org/source-intelligence/notebooklm/project", {
      method: "PUT",
      body: JSON.stringify({ projectId: selectedProjectId, sourceMode }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "Google project selected" });
    },
    onError: (error: any) => toast({ variant: "destructive", title: "Could not select project", description: error?.message }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiRequest<NotebookLmSummary>("/api/org/source-intelligence/notebooklm/credential", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "Google connection removed" });
    },
    onError: (error: any) => toast({ variant: "destructive", title: "Could not remove Google connection", description: error?.message }),
  });

  const testMutation = useMutation({
    mutationFn: () => apiRequest<{ success: boolean; message: string; summary: NotebookLmSummary }>("/api/org/source-intelligence/notebooklm/test", { method: "POST" }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: result.success ? "NotebookLM checked" : "NotebookLM needs attention", description: result.message });
    },
    onError: (error: any) => toast({ variant: "destructive", title: "Could not test NotebookLM", description: error?.message }),
  });

  const busy = saveSettingsMutation.isPending || selectProjectMutation.isPending || disconnectMutation.isPending || testMutation.isPending;
  const status = data?.connectionStatus || "not_configured";
  const connectedEmail = data?.credentialSummary?.connectedEmail ? String(data.credentialSummary.connectedEmail) : null;
  const hasProjectChoices = Boolean(data?.projectOptions?.length);
  const selectedProject = useMemo(() => {
    if (!data?.projectOptions?.length) return null;
    return data.projectOptions.find((project) => project.projectId === data.selectedProjectId) || null;
  }, [data]);

  return (
    <QuizAdminLayout title="Source Intelligence" description="Organization-owned extraction providers">
      <div className="mx-auto max-w-4xl space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BrainCircuit className="h-5 w-5 text-primary" />
                  NotebookLM Enterprise
                </CardTitle>
                <CardDescription>One Google connection for the active organization.</CardDescription>
              </div>
              <Badge variant={data?.credentialConfigured ? "secondary" : "outline"}>
                {statusLabel(status, Boolean(data?.credentialConfigured))}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading connection
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-border p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">{data?.credentialConfigured ? "Google account connected" : "Connect Google"}</p>
                      {connectedEmail ? <p className="text-sm text-muted-foreground">Account: {connectedEmail}</p> : null}
                      {selectedProject ? <p className="text-sm text-muted-foreground">Project: {selectedProject.name}</p> : null}
                      {!data?.oauthConfigured ? (
                        <p className="text-sm text-destructive">Google OAuth is not configured on this LearnPlay deployment.</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        onClick={() => { window.location.href = "/api/org/source-intelligence/notebooklm/oauth/start"; }}
                        disabled={busy || !data?.oauthConfigured}
                      >
                        <ExternalLink className="h-4 w-4" />
                        {data?.credentialConfigured ? "Reconnect Google" : "Connect Google"}
                      </Button>
                      {data?.credentialConfigured ? (
                        <Button variant="outline" onClick={() => disconnectMutation.mutate()} disabled={busy}>
                          {disconnectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Disconnect
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>

                {hasProjectChoices ? (
                  <div className="space-y-3 rounded-lg border border-border p-4">
                    <div className="space-y-1">
                      <Label>NotebookLM Google Cloud project</Label>
                      <p className="text-sm text-muted-foreground">Choose the project that owns this organization&apos;s NotebookLM workspace.</p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                        <SelectTrigger className="sm:flex-1"><SelectValue placeholder="Select a project" /></SelectTrigger>
                        <SelectContent>
                          {data?.projectOptions.map((project) => (
                            <SelectItem key={project.projectId} value={project.projectId}>
                              {project.name} ({project.projectId})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button onClick={() => selectProjectMutation.mutate()} disabled={busy || !selectedProjectId}>
                        {selectProjectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Use Project
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <Label htmlFor="notebooklm-enabled" className="text-base font-medium">Enable for this organization</Label>
                    <p className="text-sm text-muted-foreground">Native extraction remains active until NotebookLM extraction is enabled in course builder.</p>
                  </div>
                  <Switch id="notebooklm-enabled" checked={enabled} onCheckedChange={setEnabled} disabled={!data?.credentialConfigured || !data?.projectNumber} />
                </div>

                <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      Advanced defaults
                      <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-4 space-y-4 rounded-lg border border-border p-4">
                    <div className="space-y-2">
                      <Label htmlFor="notebook-title">Default notebook title</Label>
                      <Input id="notebook-title" value={defaultNotebookTitle} onChange={(event) => setDefaultNotebookTitle(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Source upload mode</Label>
                      <Select value={sourceMode} onValueChange={(value) => setSourceMode(value as "upload_files" | "raw_text")}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="upload_files">Upload source files</SelectItem>
                          <SelectItem value="raw_text">Raw text source</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => saveSettingsMutation.mutate()} disabled={busy || !data?.credentialConfigured}>
                    {saveSettingsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Save Settings
                  </Button>
                  <Button variant="outline" onClick={() => testMutation.mutate()} disabled={busy || !data?.credentialConfigured}>
                    {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                    Test Connection
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </QuizAdminLayout>
  );
}
