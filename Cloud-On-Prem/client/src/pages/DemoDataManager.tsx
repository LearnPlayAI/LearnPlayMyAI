import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Loader2, PlayCircle, RotateCcw, Trash2, ShieldAlert, Database, RefreshCw } from 'lucide-react';

type DemoOverview = {
  policy: {
    deploymentMode: 'cloud' | 'onprem';
    enabled: boolean;
    enabledSource?: 'stage_default' | 'env' | 'db_override';
    policyOverride?: 'auto' | 'enabled' | 'disabled';
    stage: string;
    isNodeProd: boolean;
    stageAllowed: boolean;
    isPrdStage?: boolean;
    envAllowed: boolean;
  };
  runningJob: any;
  batches: Array<any>;
  backups: Array<any>;
  lastJobs: Array<any>;
  defaultConfig: any;
  defaults: { demoPassword: string };
  templates?: Array<any>;
};

type FeatureModule = {
  key: string;
  label: string;
  description: string;
};

const FEATURE_MODULES: FeatureModule[] = [
  { key: 'org_structure', label: 'Org Structure', description: 'Organizations, departments, units, teams' },
  { key: 'users_roles', label: 'Users & Roles', description: 'CustSuper/orgAdmin/trainer/learner accounts and role maps' },
  { key: 'join_requests', label: 'Join Requests', description: 'Pending/approved/denied org join request history' },
  { key: 'courses_lessons', label: 'Courses & Lessons', description: 'Course catalog, lesson versions, frameworks' },
  { key: 'assignments', label: 'Assignments', description: 'Course assignment rows and due-date workload' },
  { key: 'enrollments_progress', label: 'Enrollments & Progress', description: 'Enrollments, course/lesson progress, completions' },
  { key: 'quizzes_results', label: 'Quizzes & Results', description: 'Quiz collections, attempts, outcomes' },
  { key: 'reviews_ratings', label: 'Reviews & Ratings', description: 'Course review/rating data' },
  { key: 'gamification', label: 'Gamification', description: 'Leaderboard, streaks, challenges, coins' },
  { key: 'commerce_marketplace', label: 'Marketplace Commerce', description: 'Course purchase/refund records (cloud)' },
  { key: 'credits_purchases', label: 'Credit Purchases', description: 'LPC pack purchases and ledger activity' },
  { key: 'interorg_sharing', label: 'Inter-Org Sharing', description: 'Cross-org assignment/sharing data (onprem)' },
  { key: 'reporting_financial_snapshots', label: 'Reporting Snapshots', description: 'Revenue/financial report rows' },
  { key: 'notifications', label: 'Notifications', description: 'User notification/event records' },
];

const parseCsvLines = (value: string): string[] =>
  value
    .split(/[\n,]/g)
    .map((s) => s.trim())
    .filter(Boolean);

const parseUnitAssignments = (value: string): Array<{ name: string; departmentName?: string }> =>
  value
    .split(/\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, departmentName] = line.split(':').map((x) => x?.trim());
      return { name, departmentName };
    })
    .filter((x) => !!x.name);

const parseTeamAssignments = (value: string): Array<{ name: string; unitName?: string }> =>
  value
    .split(/\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, unitName] = line.split(':').map((x) => x?.trim());
      return { name, unitName };
    })
    .filter((x) => !!x.name);

export default function DemoDataManager() {
  const { toast } = useToast();
  const [confirmText, setConfirmText] = useState('');
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const [selectedBackupId, setSelectedBackupId] = useState('');
  const [autoBackupBeforeGenerate, setAutoBackupBeforeGenerate] = useState(true);

  const [orgCount, setOrgCount] = useState(2);
  const [randomOrgNames, setRandomOrgNames] = useState(true);
  const [orgNamesText, setOrgNamesText] = useState('');

  const [custSuperPerOrg, setCustSuperPerOrg] = useState(1);
  const [orgAdminPerOrg, setOrgAdminPerOrg] = useState(2);
  const [trainerPerOrg, setTrainerPerOrg] = useState(4);
  const [learnerPerOrg, setLearnerPerOrg] = useState(30);

  const [departmentCount, setDepartmentCount] = useState(4);
  const [randomDepartmentNames, setRandomDepartmentNames] = useState(true);
  const [departmentNamesText, setDepartmentNamesText] = useState('');

  const [unitCountPerOrg, setUnitCountPerOrg] = useState(8);
  const [randomUnitNames, setRandomUnitNames] = useState(true);
  const [unitAssignmentsText, setUnitAssignmentsText] = useState('');

  const [teamCountPerOrg, setTeamCountPerOrg] = useState(12);
  const [randomTeamNames, setRandomTeamNames] = useState(true);
  const [teamAssignmentsText, setTeamAssignmentsText] = useState('');

  const [courseCountPerOrg, setCourseCountPerOrg] = useState(16);
  const [sharedPptAssetKey, setSharedPptAssetKey] = useState('');
  const [seed, setSeed] = useState<number>(Date.now());
  const [includeMarketplaceSales, setIncludeMarketplaceSales] = useState(true);
  const [includeCreditPackPurchases, setIncludeCreditPackPurchases] = useState(true);
  const [includeJoinRequests, setIncludeJoinRequests] = useState(true);
  const [includeCourseCatalog, setIncludeCourseCatalog] = useState(true);
  const [includeEnrollments, setIncludeEnrollments] = useState(true);
  const [includeReviews, setIncludeReviews] = useState(true);
  const [includeGamification, setIncludeGamification] = useState(true);
  const [includeInterOrgAssignments, setIncludeInterOrgAssignments] = useState(true);
  const [namingConvention, setNamingConvention] = useState<'realistic' | 'demo_tagged'>('realistic');
  const [namingEmailDomain, setNamingEmailDomain] = useState('learnplay.local');
  const [activityWindowStart, setActivityWindowStart] = useState('');
  const [activityWindowEnd, setActivityWindowEnd] = useState('');
  const [featureModules, setFeatureModules] = useState<Record<string, { enabled: boolean; volume: 'none' | 'small' | 'medium' | 'large' }>>(
    Object.fromEntries(FEATURE_MODULES.map((m) => [m.key, { enabled: true, volume: 'medium' }])) as any,
  );
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [selectedTemplateName, setSelectedTemplateName] = useState('');

  const { data: overview, isLoading, refetch } = useQuery<DemoOverview>({
    queryKey: ['/api/admin/demo-data/overview'],
    refetchInterval: 5000,
  });

  const runningJobId = overview?.runningJob?.id;

  const { data: runningJob } = useQuery<any>({
    queryKey: ['/api/admin/demo-data/jobs', runningJobId],
    queryFn: async () => {
      if (!runningJobId) return null;
      return apiRequest(`/api/admin/demo-data/jobs/${runningJobId}`);
    },
    enabled: !!runningJobId,
    refetchInterval: 2000,
  });

  useEffect(() => {
    if (runningJob?.status === 'completed') {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/demo-data/overview'] });
    }
  }, [runningJob?.status]);

  const payload = useMemo(
    () => ({
      orgCount,
      randomOrgNames,
      orgNames: parseCsvLines(orgNamesText),
      usersPerOrg: {
        custSuper: custSuperPerOrg,
        orgAdmin: orgAdminPerOrg,
        trainerTeamLead: trainerPerOrg,
        learner: learnerPerOrg,
      },
      departmentCount,
      randomDepartmentNames,
      departmentNames: parseCsvLines(departmentNamesText),
      unitCountPerOrg,
      randomUnitNames,
      unitNames: parseUnitAssignments(unitAssignmentsText),
      teamCountPerOrg,
      randomTeamNames,
      teamNames: parseTeamAssignments(teamAssignmentsText),
      courseCountPerOrg,
      sharedPptAssetKey: sharedPptAssetKey.trim() || undefined,
      seed,
      includeMarketplaceSales,
      includeCreditPackPurchases,
      includeJoinRequests,
      includeCourseCatalog,
      includeEnrollments,
      includeReviews,
      includeGamification,
      includeInterOrgAssignments,
      namingConvention,
      namingEmailDomain: namingEmailDomain.trim() || undefined,
      activityWindowStart: activityWindowStart || undefined,
      activityWindowEnd: activityWindowEnd || undefined,
      featureModules,
      namingPolicy: {
        mode: namingConvention,
        emailDomain: namingEmailDomain.trim() || undefined,
      },
      autoBackupBeforeGenerate,
    }),
    [
      orgCount,
      randomOrgNames,
      orgNamesText,
      custSuperPerOrg,
      orgAdminPerOrg,
      trainerPerOrg,
      learnerPerOrg,
      departmentCount,
      randomDepartmentNames,
      departmentNamesText,
      unitCountPerOrg,
      randomUnitNames,
      unitAssignmentsText,
      teamCountPerOrg,
      randomTeamNames,
      teamAssignmentsText,
      courseCountPerOrg,
      sharedPptAssetKey,
      seed,
      includeMarketplaceSales,
      includeCreditPackPurchases,
      includeJoinRequests,
      includeCourseCatalog,
      includeEnrollments,
      includeReviews,
      includeGamification,
      includeInterOrgAssignments,
      namingConvention,
      namingEmailDomain,
      activityWindowStart,
      activityWindowEnd,
      featureModules,
      autoBackupBeforeGenerate,
    ]
  );

  useEffect(() => {
    if (!selectedBackupId && overview?.backups?.length) {
      setSelectedBackupId(overview.backups[0].id);
    }
  }, [overview?.backups?.length, selectedBackupId]);

  const generateMutation = useMutation({
    mutationFn: async () => apiRequest('/api/admin/demo-data/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
    onSuccess: () => {
      toast({ title: 'Job queued', description: 'Demo data generation has started in the background.' });
      refetch();
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: 'Failed', description: err?.message || 'Failed to queue generation job' });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => apiRequest('/api/admin/demo-data/reset', {
      method: 'POST',
      body: JSON.stringify({ ...payload, confirmText }),
    }),
    onSuccess: () => {
      toast({ title: 'Job queued', description: 'Reset + regenerate job has started.' });
      refetch();
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: 'Failed', description: err?.message || 'Failed to queue reset job' });
    },
  });

  const purgeMutation = useMutation({
    mutationFn: async () => apiRequest('/api/admin/demo-data/purge', {
      method: 'POST',
      body: JSON.stringify({ confirmText }),
    }),
    onSuccess: () => {
      toast({ title: 'Job queued', description: 'Purge job has started.' });
      refetch();
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: 'Failed', description: err?.message || 'Failed to queue purge job' });
    },
  });

  const backupMutation = useMutation({
    mutationFn: async () => apiRequest('/api/admin/demo-data/backups', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
    onSuccess: () => {
      toast({ title: 'Backup queued', description: 'Database backup job started.' });
      refetch();
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: 'Backup failed', description: err?.message || 'Failed to queue backup job' });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async () => apiRequest('/api/admin/demo-data/backups/restore', {
      method: 'POST',
      body: JSON.stringify({ backupId: selectedBackupId, confirmText: restoreConfirmText }),
    }),
    onSuccess: () => {
      toast({ title: 'Restore queued', description: 'Database restore job started.' });
      refetch();
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: 'Restore failed', description: err?.message || 'Failed to queue restore job' });
    },
  });

  const policyMutation = useMutation({
    mutationFn: async (mode: 'auto' | 'enabled' | 'disabled') =>
      apiRequest('/api/admin/demo-data/policy', {
        method: 'PUT',
        body: JSON.stringify({ mode }),
      }),
    onSuccess: () => {
      toast({ title: 'Policy updated', description: 'Demo tooling policy override was saved.' });
      refetch();
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: 'Policy update failed', description: err?.message || 'Failed to update policy' });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => apiRequest('/api/admin/demo-data/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async () => apiRequest('/api/admin/demo-data/templates', {
      method: 'POST',
      body: JSON.stringify({
        name: templateName.trim(),
        description: templateDescription.trim() || undefined,
        config: payload,
      }),
    }),
    onSuccess: () => {
      toast({ title: 'Template saved' });
      refetch();
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: 'Template save failed', description: err?.message || 'Failed to save template' });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (name: string) => apiRequest(`/api/admin/demo-data/templates/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      toast({ title: 'Template deleted' });
      refetch();
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: 'Template delete failed', description: err?.message || 'Failed to delete template' });
    },
  });

  const busy = !!overview?.runningJob || generateMutation.isPending || resetMutation.isPending || purgeMutation.isPending || backupMutation.isPending || restoreMutation.isPending || policyMutation.isPending;

  return (
    <QuizAdminLayout title="Demo Data Manager">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              Environment Guard
            </CardTitle>
            <CardDescription>
              Demo tooling is hard-gated to Cloud/OnPrem DEV+ACC only.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant={overview?.policy?.enabled ? 'default' : 'destructive'}>
                DEMO_DATA_ENABLED: {String(overview?.policy?.enabled)}
              </Badge>
              <Badge variant={overview?.policy?.envAllowed ? 'default' : 'destructive'}>
                Env Allowed: {String(overview?.policy?.envAllowed)}
              </Badge>
              <Badge variant="outline">
                Policy: {overview?.policy?.policyOverride || 'auto'} ({overview?.policy?.enabledSource || 'n/a'})
              </Badge>
              <Badge variant="secondary">
                Mode: {overview?.policy?.deploymentMode || 'unknown'}
              </Badge>
              <Badge variant="outline">
                Stage: {overview?.policy?.stage || '(not set)'}
              </Badge>
            </div>
            {!overview?.policy?.envAllowed && (
              <Alert variant="destructive">
                <AlertTitle>Blocked</AlertTitle>
                <AlertDescription>
                  Demo tooling is blocked by policy or environment guard. PRD remains blocked.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant={overview?.policy?.policyOverride === 'auto' ? 'default' : 'outline'} size="sm" disabled={policyMutation.isPending} onClick={() => policyMutation.mutate('auto')}
              >
                Policy: Auto
              </Button>
              <Button variant={overview?.policy?.policyOverride === 'enabled' ? 'default' : 'outline'} size="sm" disabled={policyMutation.isPending || overview?.policy?.isPrdStage} onClick={() => policyMutation.mutate('enabled')}
              >
                Force Enable
              </Button>
              <Button variant={overview?.policy?.policyOverride === 'disabled' ? 'default' : 'outline'} size="sm" disabled={policyMutation.isPending} onClick={() => policyMutation.mutate('disabled')}
              >
                Force Disable
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Generation Inputs</CardTitle>
            <CardDescription>
              Configure org/user/content volumes. Use random naming for fast setup.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <Label>Organizations</Label>
                <Input type="number" min={1} max={30} value={orgCount} onChange={(e) => setOrgCount(Number(e.target.value || 1))} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3 mt-6 md:mt-0">
                <Label>Random org names</Label>
                <Switch checked={randomOrgNames} onCheckedChange={setRandomOrgNames} />
              </div>
              <div>
                <Label>Courses per org</Label>
                <Input type="number" min={1} max={400} value={courseCountPerOrg} onChange={(e) => setCourseCountPerOrg(Number(e.target.value || 1))} />
              </div>
              <div>
                <Label>Deterministic seed</Label>
                <Input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value || Date.now()))} />
              </div>
            </div>

            {!randomOrgNames && (
              <div>
                <Label>Organization names (comma/newline separated)</Label>
                <Textarea value={orgNamesText} onChange={(e) => setOrgNamesText(e.target.value)} placeholder="Acme Learning\nNorthwind Training" />
              </div>
            )}

            <Separator />

            <div>
              <Label className="text-sm font-semibold">Feature Modules</Label>
              <div className="grid gap-3 md:grid-cols-2 mt-2">
                {FEATURE_MODULES.map((module) => (
                  <div key={module.key} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <Label>{module.label}</Label>
                        <p className="text-xs text-muted-foreground">{module.description}</p>
                      </div>
                      <Switch
                        checked={featureModules[module.key]?.enabled !== false}
                        onCheckedChange={(next) =>
                          setFeatureModules((prev) => ({
                            ...prev,
                            [module.key]: { ...(prev[module.key] || { volume: 'medium' }), enabled: next },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Volume</Label>
                      <select
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={featureModules[module.key]?.volume || 'medium'}
                        onChange={(e) =>
                          setFeatureModules((prev) => ({
                            ...prev,
                            [module.key]: {
                              ...(prev[module.key] || { enabled: true }),
                              volume: (['none', 'small', 'medium', 'large'].includes(e.target.value) ? e.target.value : 'medium') as any,
                            },
                          }))
                        }
                        disabled={featureModules[module.key]?.enabled === false}
                      >
                        <option value="none">none</option>
                        <option value="small">small</option>
                        <option value="medium">medium</option>
                        <option value="large">large</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div>
              <Label className="text-sm font-semibold">Users per organization</Label>
              <div className="grid gap-4 md:grid-cols-4 mt-2">
                <div>
                  <Label>CustSuper (onprem)</Label>
                  <Input type="number" min={0} max={20} value={custSuperPerOrg} onChange={(e) => setCustSuperPerOrg(Number(e.target.value || 0))} />
                </div>
                <div>
                  <Label>orgAdmin</Label>
                  <Input type="number" min={1} max={100} value={orgAdminPerOrg} onChange={(e) => setOrgAdminPerOrg(Number(e.target.value || 1))} />
                </div>
                <div>
                  <Label>trainer/teamlead</Label>
                  <Input type="number" min={1} max={300} value={trainerPerOrg} onChange={(e) => setTrainerPerOrg(Number(e.target.value || 1))} />
                </div>
                <div>
                  <Label>Learner</Label>
                  <Input type="number" min={1} max={5000} value={learnerPerOrg} onChange={(e) => setLearnerPerOrg(Number(e.target.value || 1))} />
                </div>
              </div>
            </div>

            <Separator />

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Departments per org</Label>
                    <Input type="number" min={1} max={50} value={departmentCount} onChange={(e) => setDepartmentCount(Number(e.target.value || 1))} />
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3 mt-6 md:mt-0">
                    <Label>Random dept names</Label>
                    <Switch checked={randomDepartmentNames} onCheckedChange={setRandomDepartmentNames} />
                  </div>
                </div>
                {!randomDepartmentNames && (
                  <div>
                    <Label>Department names</Label>
                    <Textarea value={departmentNamesText} onChange={(e) => setDepartmentNamesText(e.target.value)} placeholder="Operations\nSales\nEngineering" />
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Units per org</Label>
                    <Input type="number" min={1} max={300} value={unitCountPerOrg} onChange={(e) => setUnitCountPerOrg(Number(e.target.value || 1))} />
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3 mt-6 md:mt-0">
                    <Label>Random unit names</Label>
                    <Switch checked={randomUnitNames} onCheckedChange={setRandomUnitNames} />
                  </div>
                </div>
                {!randomUnitNames && (
                  <div>
                    <Label>Unit assignments (`Unit:Department` per line)</Label>
                    <Textarea value={unitAssignmentsText} onChange={(e) => setUnitAssignmentsText(e.target.value)} placeholder="Unit Alpha:Operations\nUnit Beta:Sales" />
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Teams per org</Label>
                    <Input type="number" min={1} max={500} value={teamCountPerOrg} onChange={(e) => setTeamCountPerOrg(Number(e.target.value || 1))} />
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3 mt-6 md:mt-0">
                    <Label>Random team names</Label>
                    <Switch checked={randomTeamNames} onCheckedChange={setRandomTeamNames} />
                  </div>
                </div>
                {!randomTeamNames && (
                  <div>
                    <Label>Team assignments (`Team:Unit` per line)</Label>
                    <Textarea value={teamAssignmentsText} onChange={(e) => setTeamAssignmentsText(e.target.value)} placeholder="Team A:Unit Alpha\nTeam B:Unit Beta" />
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <Label>Shared PPT asset key/path (optional)</Label>
                  <Input value={sharedPptAssetKey} onChange={(e) => setSharedPptAssetKey(e.target.value)} placeholder="private/lessons/demo/shared/source.pptx" />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label>Include marketplace sales demo data</Label>
                  <Switch checked={includeMarketplaceSales} onCheckedChange={setIncludeMarketplaceSales} />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label>Include LPC pack purchase demo data</Label>
                  <Switch checked={includeCreditPackPurchases} onCheckedChange={setIncludeCreditPackPurchases} />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label>Include join requests demo data</Label>
                  <Switch checked={includeJoinRequests} onCheckedChange={setIncludeJoinRequests} />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label>Include course catalog demo data</Label>
                  <Switch checked={includeCourseCatalog} onCheckedChange={(next) => {
                    setIncludeCourseCatalog(next);
                    if (!next) {
                      setIncludeEnrollments(false);
                      setIncludeReviews(false);
                      setIncludeInterOrgAssignments(false);
                    }
                  }} />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label>Include enrollments/progress demo data</Label>
                  <Switch checked={includeEnrollments} onCheckedChange={setIncludeEnrollments} disabled={!includeCourseCatalog} />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label>Include course reviews demo data</Label>
                  <Switch checked={includeReviews} onCheckedChange={setIncludeReviews} disabled={!includeCourseCatalog} />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label>Include gamification demo data</Label>
                  <Switch checked={includeGamification} onCheckedChange={setIncludeGamification} />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label>Include inter-org assignment demo data (onprem)</Label>
                  <Switch checked={includeInterOrgAssignments} onCheckedChange={setIncludeInterOrgAssignments} disabled={!includeCourseCatalog} />
                </div>
                <div className="rounded-md border p-3 space-y-2">
                  <Label>Data naming convention</Label>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={namingConvention}
                    onChange={(e) => {
                      const next = (e.target.value === 'demo_tagged' ? 'demo_tagged' : 'realistic') as 'realistic' | 'demo_tagged';
                      setNamingConvention(next);
                      if (next === 'demo_tagged' && namingEmailDomain === 'learnplay.local') setNamingEmailDomain('learnplay.demo.local');
                      if (next === 'realistic' && namingEmailDomain === 'learnplay.demo.local') setNamingEmailDomain('learnplay.local');
                    }}
                  >
                    <option value="realistic">Realistic names (no [DEMO] tag)</option>
                    <option value="demo_tagged">Tagged names ([DEMO] prefix)</option>
                  </select>
                  <div>
                    <Label>Email domain for generated users</Label>
                    <Input value={namingEmailDomain} onChange={(e) => setNamingEmailDomain(e.target.value)} placeholder="learnplay.local" />
                  </div>
                </div>
                <div className="rounded-md border p-3 space-y-2">
                  <Label>Activity date/time window</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <Label>From</Label>
                      <Input type="datetime-local" value={activityWindowStart} onChange={(e) => setActivityWindowStart(e.target.value)} />
                    </div>
                    <div>
                      <Label>To</Label>
                      <Input type="datetime-local" value={activityWindowEnd} onChange={(e) => setActivityWindowEnd(e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className="rounded-md border p-3 space-y-2">
                  <Label>Generation Templates</Label>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={selectedTemplateName}
                    onChange={(e) => setSelectedTemplateName(e.target.value)}
                  >
                    <option value="">Select saved template</option>
                    {(overview?.templates || []).map((tpl: any) => (
                      <option key={tpl.name} value={tpl.name}>{tpl.name}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => {
                        const tpl = (overview?.templates || []).find((t: any) => t.name === selectedTemplateName);
                        if (!tpl?.config) return;
                        const cfg = tpl.config;
                        setOrgCount(Number(cfg.orgCount ?? 2));
                        setCourseCountPerOrg(Number(cfg.courseCountPerOrg ?? 16));
                        setSeed(Number(cfg.seed ?? Date.now()));
                        setNamingConvention((cfg.namingConvention === 'demo_tagged' ? 'demo_tagged' : 'realistic'));
                        setNamingEmailDomain(String(cfg.namingEmailDomain || 'learnplay.local'));
                        setActivityWindowStart(String(cfg.activityWindowStart || ''));
                        setActivityWindowEnd(String(cfg.activityWindowEnd || ''));
                        setIncludeMarketplaceSales(cfg.includeMarketplaceSales !== false);
                        setIncludeCreditPackPurchases(cfg.includeCreditPackPurchases !== false);
                        setIncludeJoinRequests(cfg.includeJoinRequests !== false);
                        setIncludeCourseCatalog(cfg.includeCourseCatalog !== false);
                        setIncludeEnrollments(cfg.includeEnrollments !== false);
                        setIncludeReviews(cfg.includeReviews !== false);
                        setIncludeGamification(cfg.includeGamification !== false);
                        setIncludeInterOrgAssignments(cfg.includeInterOrgAssignments !== false);
                        if (cfg.featureModules && typeof cfg.featureModules === 'object') {
                          setFeatureModules(cfg.featureModules);
                        }
                        toast({ title: 'Template applied' });
                      }}
                      disabled={!selectedTemplateName}
                    >
                      Apply Template
                    </Button>
                    <Button type="button" variant="destructive" onClick={() => selectedTemplateName && deleteTemplateMutation.mutate(selectedTemplateName)}
                      disabled={!selectedTemplateName || deleteTemplateMutation.isPending}
                    >
                      Delete Template
                    </Button>
                  </div>
                  <Input placeholder="Template name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
                  <Input placeholder="Template description (optional)" value={templateDescription} onChange={(e) => setTemplateDescription(e.target.value)} />
                  <Button type="button" variant="outline" onClick={() => saveTemplateMutation.mutate()}
                    disabled={!templateName.trim() || saveTemplateMutation.isPending}
                  >
                    Save Current As Template
                  </Button>
                </div>
                <div className="rounded-md border p-3 space-y-2">
                  <Label>Generation Preview</Label>
                  <Button type="button" variant="outline" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>
                    {previewMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Preview Dataset
                  </Button>
                  {previewMutation.data?.estimated && (
                    <div className="text-sm space-y-1">
                      <div>Organizations: <strong>{previewMutation.data.estimated.organizations}</strong></div>
                      <div>Users: <strong>{previewMutation.data.estimated.users}</strong></div>
                      <div>Courses: <strong>{previewMutation.data.estimated.courses}</strong></div>
                      <div>Lessons: <strong>{previewMutation.data.estimated.lessons}</strong></div>
                      <div>Enrollments: <strong>{previewMutation.data.estimated.enrollments}</strong></div>
                      <div>Reviews: <strong>{previewMutation.data.estimated.reviews}</strong></div>
                      <div>Join Requests: <strong>{previewMutation.data.estimated.joinRequests}</strong></div>
                      <div>Inter-Org Assignments: <strong>{previewMutation.data.estimated.crossOrgAssignments}</strong></div>
                      {Array.isArray(previewMutation.data.warnings) && previewMutation.data.warnings.length > 0 && (
                        <div className="text-warning">
                          {previewMutation.data.warnings.map((w: string, i: number) => (
                            <div key={`${w}-${i}`}>• {w}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label>Auto backup DB before Generate/Reset</Label>
                  <Switch checked={autoBackupBeforeGenerate} onCheckedChange={setAutoBackupBeforeGenerate} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Database Backup & Restore</CardTitle>
            <CardDescription>
              Create a backup before demo generation, or restore from any available backup file.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button disabled={busy || !overview?.policy?.envAllowed} onClick={() => backupMutation.mutate()}>
                {(backupMutation.isPending || (runningJob?.action === 'backup' && runningJob?.status === 'running')) ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Database className="h-4 w-4 mr-2" />
                )}
                Backup Database Now
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Backup List
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Available backups</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={selectedBackupId}
                onChange={(e) => setSelectedBackupId(e.target.value)}
                disabled={busy || !overview?.backups?.length}
              >
                {(overview?.backups || []).map((backup: any) => (
                  <option key={backup.id} value={backup.id}>
                    {backup.name} • {new Date(backup.createdAt).toLocaleString()} • {(backup.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                  </option>
                ))}
              </select>
              {!overview?.backups?.length && (
                <div className="text-sm text-muted-foreground">No database backups found in configured backup paths.</div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Type `RESTORE` to allow database restore</Label>
              <Input value={restoreConfirmText} onChange={(e) => setRestoreConfirmText(e.target.value)} placeholder="RESTORE" />
            </div>

            <Button variant="destructive" disabled={busy || !overview?.policy?.envAllowed || !selectedBackupId || restoreConfirmText.toUpperCase() !== 'RESTORE'} onClick={() => restoreMutation.mutate()}
            >
              {(restoreMutation.isPending || (runningJob?.action === 'restore' && runningJob?.status === 'running')) ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              Restore Database Backup
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
            <CardDescription>
              `Generate` adds a new demo batch. `Reset` purges all demo data then regenerates. `Delete` purges all demo data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Type `DEMO` to allow Reset/Delete</Label>
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DEMO" />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button disabled={busy || !overview?.policy?.envAllowed} onClick={() => generateMutation.mutate()}>
                {(generateMutation.isPending || (runningJob?.action === 'generate' && runningJob?.status === 'running')) ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <PlayCircle className="h-4 w-4 mr-2" />
                )}
                Generate Demo Data
              </Button>

              <Button variant="secondary" disabled={busy || !overview?.policy?.envAllowed || confirmText.toUpperCase() !== 'DEMO'} onClick={() => resetMutation.mutate()}
              >
                {resetMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                Reset (Delete + Regenerate)
              </Button>

              <Button variant="destructive" disabled={busy || !overview?.policy?.envAllowed || confirmText.toUpperCase() !== 'DEMO'} onClick={() => purgeMutation.mutate()}
              >
                {purgeMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Delete All Demo Data
              </Button>
            </div>

            {runningJob && (
              <Alert>
                <AlertTitle>Running Job: {runningJob.action}</AlertTitle>
                <AlertDescription>
                  <div className="space-y-1">
                    <div>Status: <strong>{runningJob.status}</strong></div>
                    <div>Progress: <strong>{runningJob.progress}%</strong></div>
                    <div>Message: {runningJob.message}</div>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Jobs</CardTitle>
            <CardDescription>Latest demo-data operations and outcomes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading && <div className="text-sm text-muted-foreground">Loading...</div>}
            {!isLoading && (overview?.lastJobs?.length || 0) === 0 && (
              <div className="text-sm text-muted-foreground">No jobs yet.</div>
            )}
            {(overview?.lastJobs || []).map((job: any) => (
              <div key={job.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{job.action} • {job.id}</div>
                  <Badge variant={job.status === 'completed' ? 'default' : job.status === 'failed' ? 'destructive' : 'secondary'}>
                    {job.status}
                  </Badge>
                </div>
                <div className="text-muted-foreground mt-1">{job.message}</div>
                {job.error && <div className="text-destructive mt-1">{job.error}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </QuizAdminLayout>
  );
}
