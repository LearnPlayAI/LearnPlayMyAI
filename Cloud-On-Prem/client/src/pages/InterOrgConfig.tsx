import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import QuizAdminLayout from "@/components/QuizAdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Building2, ArrowRight, Share2, BookOpen, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { usePlatformMode } from "@/hooks/usePlatformMode";
import { useAuth } from "@/hooks/useAuth";

interface InterOrgRule {
  id: string;
  sourceOrganizationId: string;
  targetOrganizationId: string;
  sourceOrgName: string;
  targetOrgName: string;
  enabled: boolean;
  createdAt: string;
}

interface SharedCourseAssignment {
  assignmentId: string;
  courseId: string;
  courseTitle: string;
  sourceOrganizationId: string;
  targetOrganizationId: string;
  sourceOrgName: string;
  targetOrgName: string;
  audience: string;
  assignmentScope: string;
  mandatory: boolean;
  dueDate: string | null;
  assignedAt: string | null;
}

interface SharedCourseGroup {
  key: string;
  courseId: string;
  courseTitle: string;
  sourceOrganizationId: string;
  targetOrganizationId: string;
  sourceOrgName: string;
  targetOrgName: string;
  totalAssignments: number;
  latestAssignedAt: string | null;
  audiences: string[];
  scopes: string[];
}

interface Organization {
  id: string;
  name: string;
  [key: string]: any;
}

export default function InterOrgConfig() {
  const { toast } = useToast();
  const { onpremMode } = usePlatformMode();
  const { isSuperAdmin, isCustSuper, effectiveOrganizationId } = useAuth();
  const isTopRole = isSuperAdmin || (onpremMode && isCustSuper);
  const [sourceOrgId, setSourceOrgId] = useState("");
  const [targetOrgId, setTargetOrgId] = useState("");
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);
  const [sharedSearch, setSharedSearch] = useState("");
  const [sharedSourceFilter, setSharedSourceFilter] = useState("all");
  const [sharedTargetFilter, setSharedTargetFilter] = useState("all");
  const [sharedAudienceFilter, setSharedAudienceFilter] = useState("all");
  const [sharedScopeFilter, setSharedScopeFilter] = useState("all");
  const [sharedPage, setSharedPage] = useState(1);
  const [rulesSearch, setRulesSearch] = useState("");
  const [rulesStatusFilter, setRulesStatusFilter] = useState("all");
  const [rulesSourceFilter, setRulesSourceFilter] = useState("all");
  const [rulesTargetFilter, setRulesTargetFilter] = useState("all");
  const [rulesPage, setRulesPage] = useState(1);
  const PAGE_SIZE = 10;

  const { data: rules, isLoading: rulesLoading } = useQuery<InterOrgRule[]>({
    queryKey: ["/api/admin/interorg-rules"],
  });

  const { data: sharedCoursesData, isLoading: sharedCoursesLoading } = useQuery<SharedCourseAssignment[]>({
    queryKey: ["/api/admin/interorg-shared-courses"],
  });

  const { data: orgsData, isLoading: orgsLoading } = useQuery<Organization[]>({
    queryKey: ["/api/admin/organizations"],
  });
  const rulesList = rules || [];

  const createMutation = useMutation({
    mutationFn: async (body: { sourceOrganizationId: string; targetOrganizationId: string }) => {
      return await apiRequest("/api/admin/interorg-rules", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/interorg-rules"] });
      setSourceOrgId("");
      setTargetOrgId("");
      toast({ title: "Rule created", description: "The inter-organization sharing rule has been created." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create rule", variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      return await apiRequest(`/api/admin/interorg-rules/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/interorg-rules"] });
      toast({ title: "Rule updated", description: "The rule status has been updated." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update rule", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/interorg-rules/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/interorg-rules"] });
      setDeleteRuleId(null);
      toast({ title: "Rule deleted", description: "The inter-organization sharing rule has been removed." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete rule", variant: "destructive" });
    },
  });

  const handleCreateRule = () => {
    if (!sourceOrgId || !targetOrgId) {
      toast({ title: "Missing selection", description: "Please select both source and target organizations.", variant: "destructive" });
      return;
    }
    if (sourceOrgId === targetOrgId) {
      toast({ title: "Invalid selection", description: "Source and target organizations must be different.", variant: "destructive" });
      return;
    }
    createMutation.mutate({ sourceOrganizationId: sourceOrgId, targetOrganizationId: targetOrgId });
  };

  const sharedCourses = useMemo<SharedCourseGroup[]>(() => {
    const rows = sharedCoursesData || [];
    const grouped = new Map<string, SharedCourseGroup>();

    for (const row of rows) {
      const key = `${row.courseId}::${row.sourceOrganizationId}::${row.targetOrganizationId}`;
      const existing = grouped.get(key);

      if (!existing) {
        grouped.set(key, {
          key,
          courseId: row.courseId,
          courseTitle: row.courseTitle,
          sourceOrganizationId: row.sourceOrganizationId,
          targetOrganizationId: row.targetOrganizationId,
          sourceOrgName: row.sourceOrgName,
          targetOrgName: row.targetOrgName,
          totalAssignments: 1,
          latestAssignedAt: row.assignedAt,
          audiences: row.audience ? [row.audience] : [],
          scopes: row.assignmentScope ? [row.assignmentScope] : [],
        });
        continue;
      }

      existing.totalAssignments += 1;
      if ((row.assignedAt || "") > (existing.latestAssignedAt || "")) {
        existing.latestAssignedAt = row.assignedAt;
      }
      if (row.audience && !existing.audiences.includes(row.audience)) {
        existing.audiences.push(row.audience);
      }
      if (row.assignmentScope && !existing.scopes.includes(row.assignmentScope)) {
        existing.scopes.push(row.assignmentScope);
      }
    }

    return Array.from(grouped.values()).sort((a, b) => (b.latestAssignedAt || "").localeCompare(a.latestAssignedAt || ""));
  }, [sharedCoursesData]);

  const sharedAudienceOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of sharedCourses) {
      for (const audience of item.audiences) values.add(audience);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [sharedCourses]);

  const sharedScopeOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of sharedCourses) {
      for (const scope of item.scopes) values.add(scope);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [sharedCourses]);

  const filteredSharedCourses = useMemo(() => {
    const term = sharedSearch.trim().toLowerCase();
    return sharedCourses.filter((item) => {
      if (sharedSourceFilter !== "all" && item.sourceOrganizationId !== sharedSourceFilter) return false;
      if (sharedTargetFilter !== "all" && item.targetOrganizationId !== sharedTargetFilter) return false;
      if (sharedAudienceFilter !== "all" && !item.audiences.includes(sharedAudienceFilter)) return false;
      if (sharedScopeFilter !== "all" && !item.scopes.includes(sharedScopeFilter)) return false;
      if (!term) return true;

      const haystack = [
        item.courseTitle,
        item.courseId,
        item.sourceOrgName,
        item.targetOrgName,
        ...item.audiences,
        ...item.scopes,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [sharedCourses, sharedSearch, sharedSourceFilter, sharedTargetFilter, sharedAudienceFilter, sharedScopeFilter]);

  const sharedTotalPages = Math.max(1, Math.ceil(filteredSharedCourses.length / PAGE_SIZE));
  const pagedSharedCourses = useMemo(() => {
    const start = (sharedPage - 1) * PAGE_SIZE;
    return filteredSharedCourses.slice(start, start + PAGE_SIZE);
  }, [filteredSharedCourses, sharedPage]);

  const filteredRules = useMemo(() => {
    const term = rulesSearch.trim().toLowerCase();
    return rulesList.filter((rule) => {
      if (rulesSourceFilter !== "all" && rule.sourceOrganizationId !== rulesSourceFilter) return false;
      if (rulesTargetFilter !== "all" && rule.targetOrganizationId !== rulesTargetFilter) return false;
      if (rulesStatusFilter === "enabled" && !rule.enabled) return false;
      if (rulesStatusFilter === "disabled" && rule.enabled) return false;
      if (!term) return true;
      const haystack = [rule.sourceOrgName, rule.targetOrgName, rule.id].join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [rulesList, rulesSearch, rulesStatusFilter, rulesSourceFilter, rulesTargetFilter]);

  const rulesTotalPages = Math.max(1, Math.ceil(filteredRules.length / PAGE_SIZE));
  const pagedRules = useMemo(() => {
    const start = (rulesPage - 1) * PAGE_SIZE;
    return filteredRules.slice(start, start + PAGE_SIZE);
  }, [filteredRules, rulesPage]);

  useEffect(() => {
    if (sharedPage > sharedTotalPages) {
      setSharedPage(sharedTotalPages);
    }
  }, [sharedPage, sharedTotalPages]);

  useEffect(() => {
    if (rulesPage > rulesTotalPages) {
      setRulesPage(rulesTotalPages);
    }
  }, [rulesPage, rulesTotalPages]);

  useEffect(() => {
    if (!isTopRole && effectiveOrganizationId && !sourceOrgId) {
      setSourceOrgId(effectiveOrganizationId);
    }
  }, [isTopRole, effectiveOrganizationId, sourceOrgId]);

  const organizations = orgsData || [];
  const sourceOrganizations = useMemo(() => {
    if (isTopRole) return organizations;
    return organizations.filter((org) => org.id === effectiveOrganizationId);
  }, [organizations, isTopRole, effectiveOrganizationId]);

  if (!onpremMode) {
    return (
      <QuizAdminLayout title="Inter-Organization Course Sharing" description="Manage which organizations can assign courses to each other" activeSection="interorg-config">
        <div className="max-w-4xl">
          <Card className="bg-card/50 border-border">
            <CardContent className="p-[var(--card-padding)]">
              <p className="text-muted-foreground">This feature is only available in on-premises mode.</p>
            </CardContent>
          </Card>
        </div>
      </QuizAdminLayout>
    );
  }

  if (rulesLoading || orgsLoading || sharedCoursesLoading) {
    return (
      <QuizAdminLayout title="Inter-Organization Course Sharing" description="Manage which organizations can assign courses to each other" activeSection="interorg-config">
        <div className="space-y-[var(--space-lg)] max-w-6xl">
          <Card className="bg-card/50 border-border">
            <CardHeader className="p-[var(--card-padding)]">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64 mt-2" />
            </CardHeader>
            <CardContent className="p-[var(--card-padding)] pt-0 space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border">
            <CardHeader className="p-[var(--card-padding)]">
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent className="p-[var(--card-padding)] pt-0 space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      </QuizAdminLayout>
    );
  }

  return (
    <QuizAdminLayout title="Inter-Organization Course Sharing" description="Manage which organizations can assign courses to each other" activeSection="interorg-config">
      <div className="space-y-[var(--space-lg)] max-w-6xl">
        <Tabs defaultValue="shared-courses" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="shared-courses" className="gap-2">
              <BookOpen className="h-4 w-4" />
              Shared Courses
            </TabsTrigger>
            <TabsTrigger value="sharing-rules" className="gap-2">
              <Share2 className="h-4 w-4" />
              Sharing Rules
            </TabsTrigger>
          </TabsList>

          <TabsContent value="shared-courses" className="mt-4">
            <Card className="bg-card/50 border-border">
              <CardHeader className="p-[var(--card-padding)]">
                <div className="flex items-center gap-[var(--space-sm)]">
                  <div className="p-2 bg-primary/20 rounded-lg">
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-foreground text-[length:var(--text-lg)]">Shared Courses</CardTitle>
                    <CardDescription className="text-[length:var(--text-sm)]">
                      {filteredSharedCourses.length} shared course mapping{filteredSharedCourses.length !== 1 ? "s" : ""} currently active across organizations
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0">
                <div className="mb-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
                  <div className="relative xl:col-span-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={sharedSearch}
                      onChange={(e) => { setSharedSearch(e.target.value); setSharedPage(1); }}
                      placeholder="Search course, org, audience, scope, ID..."
                      className="pl-9"
                    />
                  </div>
                  <Select value={sharedSourceFilter} onValueChange={(value) => { setSharedSourceFilter(value); setSharedPage(1); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Source org" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sources</SelectItem>
                      {organizations.map((org) => (
                        <SelectItem key={`shared-source-${org.id}`} value={String(org.id)}>{org.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={sharedTargetFilter} onValueChange={(value) => { setSharedTargetFilter(value); setSharedPage(1); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Target org" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Targets</SelectItem>
                      {organizations.map((org) => (
                        <SelectItem key={`shared-target-${org.id}`} value={String(org.id)}>{org.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <Select value={sharedAudienceFilter} onValueChange={(value) => { setSharedAudienceFilter(value); setSharedPage(1); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Audience" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Audiences</SelectItem>
                        {sharedAudienceOptions.map((aud) => (
                          <SelectItem key={`aud-${aud}`} value={aud}>{aud}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={sharedScopeFilter} onValueChange={(value) => { setSharedScopeFilter(value); setSharedPage(1); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Scope" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Scopes</SelectItem>
                        {sharedScopeOptions.map((scope) => (
                          <SelectItem key={`scope-${scope}`} value={scope}>{scope}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {filteredSharedCourses.length === 0 ? (
                  <div className="text-center py-12">
                    <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-foreground font-medium text-[length:var(--text-lg)]">No shared courses found</p>
                    <p className="text-muted-foreground text-[length:var(--text-sm)] mt-1">Create sharing rules and assign courses cross-organization to populate this list.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pagedSharedCourses.map((item) => (
                      <div key={item.key} className="p-4 rounded-lg border border-border bg-background/50 space-y-3">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                          <div>
                            <p className="text-foreground font-semibold text-[length:var(--text-base)]">{item.courseTitle}</p>
                            <p className="text-muted-foreground text-[length:var(--text-xs)] mt-1">Course ID: {item.courseId}</p>
                          </div>
                          <Badge variant="outline" className="w-fit">
                            {item.totalAssignments} assignment{item.totalAssignments !== 1 ? "s" : ""}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" >
                            <Building2 className="w-3 h-3 mr-1" />
                            {item.sourceOrgName}
                          </Badge>
                          <ArrowRight className="w-4 h-4 text-muted-foreground" />
                          <Badge variant="outline" >
                            <Building2 className="w-3 h-3 mr-1" />
                            {item.targetOrgName}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {item.audiences.map((audience) => (
                            <Badge key={`${item.key}-aud-${audience}`} variant="outline">
                              Audience: {audience}
                            </Badge>
                          ))}
                          {item.scopes.map((scope) => (
                            <Badge key={`${item.key}-scope-${scope}`} variant="secondary">
                              Scope: {scope}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {filteredSharedCourses.length > 0 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Page {sharedPage} of {sharedTotalPages}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSharedPage((p) => Math.max(1, p - 1))} disabled={sharedPage <= 1}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setSharedPage((p) => Math.min(sharedTotalPages, p + 1))} disabled={sharedPage >= sharedTotalPages}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sharing-rules" className="mt-4 space-y-[var(--space-lg)]">
            <Card className="bg-card/50 border-border">
              <CardHeader className="p-[var(--card-padding)]">
                <div className="flex items-center gap-[var(--space-sm)]">
                  <div className="p-2 bg-primary/20 rounded-lg">
                    <Plus className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-foreground text-[length:var(--text-lg)]">Add Sharing Rule</CardTitle>
                    <CardDescription className="text-[length:var(--text-sm)]">Create a new inter-organization course sharing rule</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0">
                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-[var(--space-md)]">
                  <div className="w-full sm:flex-1 space-y-1.5">
                    <Label className="text-[length:var(--text-sm)] text-foreground">Source Organization</Label>
                    <Select value={sourceOrgId} onValueChange={setSourceOrgId} disabled={!isTopRole}>
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue placeholder="Select source organization" />
                      </SelectTrigger>
                      <SelectContent>
                        {sourceOrganizations.map(org => (
                          <SelectItem key={org.id} value={String(org.id)}>{org.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="hidden sm:flex items-center pb-1">
                    <ArrowRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="w-full sm:flex-1 space-y-1.5">
                    <Label className="text-[length:var(--text-sm)] text-foreground">Target Organization</Label>
                    <Select value={targetOrgId} onValueChange={setTargetOrgId}>
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue placeholder="Select target organization" />
                      </SelectTrigger>
                      <SelectContent>
                        {organizations.map(org => (
                          <SelectItem key={org.id} value={String(org.id)}>{org.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleCreateRule} disabled={createMutation.isPending} className="w-full sm:w-auto gap-2" >
                    {createMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Add Rule
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border">
              <CardHeader className="p-[var(--card-padding)]">
                <div className="flex items-center gap-[var(--space-sm)]">
                  <div className="p-2 bg-primary/20 rounded-lg">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-foreground text-[length:var(--text-lg)]">Sharing Rules</CardTitle>
                    <CardDescription className="text-[length:var(--text-sm)]">{filteredRules.length} rule{filteredRules.length !== 1 ? 's' : ''} configured</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0">
                <div className="mb-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
                  <div className="relative xl:col-span-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={rulesSearch}
                      onChange={(e) => { setRulesSearch(e.target.value); setRulesPage(1); }}
                      placeholder="Search source, target, rule ID..."
                      className="pl-9"
                    />
                  </div>
                  <Select value={rulesStatusFilter} onValueChange={(value) => { setRulesStatusFilter(value); setRulesPage(1); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="enabled">Enabled</SelectItem>
                      <SelectItem value="disabled">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={rulesSourceFilter} onValueChange={(value) => { setRulesSourceFilter(value); setRulesPage(1); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Source org" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sources</SelectItem>
                      {organizations.map((org) => (
                        <SelectItem key={`rules-source-${org.id}`} value={String(org.id)}>{org.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={rulesTargetFilter} onValueChange={(value) => { setRulesTargetFilter(value); setRulesPage(1); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Target org" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Targets</SelectItem>
                      {organizations.map((org) => (
                        <SelectItem key={`rules-target-${org.id}`} value={String(org.id)}>{org.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {filteredRules.length === 0 ? (
                  <div className="text-center py-12">
                    <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-foreground font-medium text-[length:var(--text-lg)]">No sharing rules yet</p>
                    <p className="text-muted-foreground text-[length:var(--text-sm)] mt-1">Create your first inter-organization course sharing rule above to get started.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pagedRules.map(rule => (
                      <div key={rule.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-lg border border-border bg-background/50">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" >
                            <Building2 className="w-3 h-3 mr-1" />
                            {rule.sourceOrgName}
                          </Badge>
                          <ArrowRight className="w-4 h-4 text-muted-foreground" />
                          <Badge variant="outline" >
                            <Building2 className="w-3 h-3 mr-1" />
                            {rule.targetOrgName}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={rule.enabled}
                              onCheckedChange={(checked) => toggleMutation.mutate({ id: rule.id, enabled: checked })}
                            />
                            <span className={`text-[length:var(--text-sm)] ${rule.enabled ? 'text-success' : 'text-muted-foreground'}`}>
                              {rule.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteRuleId(rule.id)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {filteredRules.length > 0 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Page {rulesPage} of {rulesTotalPages}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setRulesPage((p) => Math.max(1, p - 1))} disabled={rulesPage <= 1}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setRulesPage((p) => Math.min(rulesTotalPages, p + 1))} disabled={rulesPage >= rulesTotalPages}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={!!deleteRuleId} onOpenChange={(open) => !open && setDeleteRuleId(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete Sharing Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this inter-organization sharing rule? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteRuleId && deleteMutation.mutate(deleteRuleId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </QuizAdminLayout>
  );
}
