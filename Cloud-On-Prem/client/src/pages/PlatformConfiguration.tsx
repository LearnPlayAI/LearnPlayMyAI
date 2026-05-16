import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { DollarSign, Building2, ChevronDown, ChevronUp, Save, History } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { useUser } from '@/hooks/use-user';

type GlobalConfig = {
  defaultCommissionRate: string;
};

type OrgOverride = {
  organizationId: string;
  organizationName: string;
  commissionRate: string;
  effectiveDate: string;
};

type AuditLog = {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  userId: string;
  userName: string;
};

export default function PlatformConfiguration() {
  const { user } = useUser();
  const { toast } = useToast();
  const [globalExpanded, setGlobalExpanded] = useState(true);
  const [overridesExpanded, setOverridesExpanded] = useState(false);
  const [auditExpanded, setAuditExpanded] = useState(false);
  const [editingGlobal, setEditingGlobal] = useState(false);
  const [globalRate, setGlobalRate] = useState<string>('');
  const [editingOrg, setEditingOrg] = useState<string | null>(null);
  const [orgRate, setOrgRate] = useState<string>('');

  const { data: adminCheck, isLoading: adminLoading } = useQuery<{ isAdmin: boolean; isSuperAdmin: boolean }>({
    queryKey: ['/api/admin/check'],
    retry: false,
    enabled: !!user,
  });

  const isAuthenticated = !!user;
  const isAdmin = adminCheck?.isAdmin || false;
  const isSuperAdmin = adminCheck?.isSuperAdmin || false;

  const { data: config, isLoading: configLoading } = useQuery<GlobalConfig>({
    queryKey: ['/api/superadmin/config/global'],
    enabled: isAuthenticated && isSuperAdmin,
  });

  const { data: overrides, isLoading: overridesLoading } = useQuery<{ overrides: OrgOverride[] }>({
    queryKey: ['/api/superadmin/config/overrides'],
    enabled: isAuthenticated && isSuperAdmin,
  });

  const { data: auditLog } = useQuery<{ logs: AuditLog[] }>({
    queryKey: ['/api/superadmin/config/audit-log'],
    enabled: isAuthenticated && isSuperAdmin && auditExpanded,
  });

  const updateGlobalMutation = useMutation({
    mutationFn: async (rate: string) => {
      return await apiRequest('/api/superadmin/config/global', {
        method: 'PUT',
        body: JSON.stringify({ defaultCommissionRate: rate }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/config/global'] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/config/audit-log'] });
      setEditingGlobal(false);
      setGlobalRate('');
      toast({
        title: 'Success',
        description: 'Global commission rate updated',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: (error as Error).message,
        variant: 'destructive',
      });
    },
  });

  const updateOverrideMutation = useMutation({
    mutationFn: async ({ orgId, rate }: { orgId: string; rate: string }) => {
      return await apiRequest('/api/superadmin/config/override', {
        method: 'POST',
        body: JSON.stringify({ organizationId: orgId, commissionRate: rate }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/config/overrides'] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/config/audit-log'] });
      setEditingOrg(null);
      setOrgRate('');
      toast({
        title: 'Success',
        description: 'Organization commission rate updated',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: (error as Error).message,
        variant: 'destructive',
      });
    },
  });

  const startEditGlobal = () => {
    setEditingGlobal(true);
    setGlobalRate(config?.defaultCommissionRate || '0.15');
  };

  const saveGlobal = () => {
    const rateNum = parseFloat(globalRate);
    if (isNaN(rateNum) || rateNum < 0 || rateNum > 1) {
      toast({
        title: 'Error',
        description: 'Rate must be between 0 and 1',
        variant: 'destructive',
      });
      return;
    }
    updateGlobalMutation.mutate(globalRate);
  };

  const startEditOrg = (override: OrgOverride) => {
    setEditingOrg(override.organizationId);
    setOrgRate(override.commissionRate);
  };

  const saveOrgOverride = (orgId: string) => {
    const rateNum = parseFloat(orgRate);
    if (isNaN(rateNum) || rateNum < 0 || rateNum > 1) {
      toast({
        title: 'Error',
        description: 'Rate must be between 0 and 1',
        variant: 'destructive',
      });
      return;
    }
    updateOverrideMutation.mutate({ orgId, rate: orgRate });
  };

  if (!isSuperAdmin) {
    return null;
  }

  if (configLoading || adminLoading) {
    return (
      <QuizAdminLayout
        title="Platform Configuration"
        description="Configure global platform settings"
        activeSection="platform-config"
      >
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </QuizAdminLayout>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <QuizAdminLayout
      title="Platform Configuration"
      description="Configure global platform settings"
      activeSection="platform-config"
    >
      <div className="space-y-6">
          {/* Global Configuration */}
          <Card className="bg-card border-border">
            <CardHeader>
              <Button type="button" variant="ghost" onClick={() => setGlobalExpanded(!globalExpanded)}
                aria-expanded={globalExpanded}
                aria-controls="platform-global-panel"
                className="w-full justify-between h-auto px-0 hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CardTitle className="text-foreground flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Global Commission Rate
                </CardTitle>
                {globalExpanded ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </Button>
            </CardHeader>
            {globalExpanded && (
              <CardContent id="platform-global-panel">
                {editingGlobal ? (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="global-rate" className="text-foreground">
                        Default Commission Rate (0-1)
                      </Label>
                      <Input
                        id="global-rate"
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={globalRate}
                        onChange={(e) => setGlobalRate(e.target.value)}
                        className="bg-muted border-border text-foreground mt-2"
                        data-testid="input-global-rate"
                      />
                      <p className="text-muted-foreground text-sm mt-1">
                        {(parseFloat(globalRate || '0') * 100).toFixed(0)}% commission
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <Button onClick={saveGlobal} disabled={updateGlobalMutation.isPending} data-testid="button-save-global" >
                        <Save className="h-4 w-4 mr-2" />
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => {
                          setEditingGlobal(false);
                          setGlobalRate('');
                        }}
                        className="bg-card border-border text-foreground hover:bg-muted"
                        data-testid="button-cancel-global"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-foreground text-3xl font-bold" data-testid="global-rate-display">
                        {(parseFloat(config?.defaultCommissionRate || '0') * 100).toFixed(0)}%
                      </p>
                      <p className="text-muted-foreground text-sm mt-1">
                        Applied to all organizations without specific overrides
                      </p>
                    </div>
                    <Button onClick={startEditGlobal} data-testid="button-edit-global" >
                      Edit Rate
                    </Button>
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* Organization Overrides */}
          <Card className="bg-card border-border">
            <CardHeader>
              <Button type="button" variant="ghost" onClick={() => setOverridesExpanded(!overridesExpanded)}
                aria-expanded={overridesExpanded}
                aria-controls="platform-overrides-panel"
                className="w-full justify-between h-auto px-0 hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Organization Overrides
                </CardTitle>
                {overridesExpanded ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </Button>
            </CardHeader>
            {overridesExpanded && (
              <CardContent id="platform-overrides-panel">
                {overridesLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : !overrides || overrides.overrides.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8" data-testid="empty-overrides">No organization overrides configured</p>
                ) : (
                  <div className="space-y-4">
                    {overrides.overrides.map((override) => {
                      const isEditing = editingOrg === override.organizationId;

                      return (
                        <div
                          key={override.organizationId}
                          className="bg-muted p-4 rounded-lg border border-border"
                          data-testid={`override-card-${override.organizationId}`}
                        >
                          {isEditing ? (
                            <div className="space-y-4">
                              <div>
                                <Label className="text-foreground mb-2">{override.organizationName}</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max="1"
                                  value={orgRate}
                                  onChange={(e) => setOrgRate(e.target.value)}
                                  className="bg-muted border-border text-foreground mt-2"
                                  data-testid={`input-override-${override.organizationId}`}
                                />
                                <p className="text-muted-foreground text-sm mt-1">
                                  {(parseFloat(orgRate || '0') * 100).toFixed(0)}% commission
                                </p>
                              </div>
                              <div className="flex gap-3">
                                <Button onClick={() => saveOrgOverride(override.organizationId)}
                                  disabled={updateOverrideMutation.isPending}
                                  className="bg-primary hover:bg-primary/90"
                                  data-testid={`button-save-override-${override.organizationId}`}
                                >
                                  Save
                                </Button>
                                <Button variant="outline" onClick={() => {
                                    setEditingOrg(null);
                                    setOrgRate('');
                                  }}
                                  className="bg-card border-border text-foreground hover:bg-muted"
                                  data-testid={`button-cancel-override-${override.organizationId}`}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="text-foreground font-semibold mb-1" data-testid={`override-org-name-${override.organizationId}`}>
                                  {override.organizationName}
                                </h4>
                                <p className="text-muted-foreground text-sm" data-testid={`override-effective-date-${override.organizationId}`}>
                                  Effective since {new Date(override.effectiveDate).toLocaleDateString()}
                                </p>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <Badge variant="outline" data-testid={`override-rate-badge-${override.organizationId}`}>
                                    {(parseFloat(override.commissionRate) * 100).toFixed(0)}% commission
                                  </Badge>
                                </div>
                                <Button size="sm" variant="outline" onClick={() => startEditOrg(override)}
                                  className="bg-card border-border text-foreground hover:bg-muted"
                                  data-testid={`button-edit-override-${override.organizationId}`}
                                >
                                  Edit
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* Audit Log */}
          <Card className="bg-card border-border">
            <CardHeader>
              <Button type="button" variant="ghost" onClick={() => setAuditExpanded(!auditExpanded)}
                aria-expanded={auditExpanded}
                aria-controls="platform-audit-panel"
                className="w-full justify-between h-auto px-0 hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CardTitle className="text-foreground flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Configuration Audit Log
                </CardTitle>
                {auditExpanded ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </Button>
            </CardHeader>
            {auditExpanded && (
              <CardContent id="platform-audit-panel">
                {!auditLog || auditLog.logs.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8" data-testid="empty-audit-log">No audit logs available</p>
                ) : (
                  <div className="space-y-2">
                    {auditLog.logs.map((log) => (
                      <div
                        key={log.id}
                        className="bg-muted p-3 rounded-lg border border-border text-sm"
                        data-testid={`audit-log-${log.id}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-muted-foreground" data-testid={`audit-log-user-${log.id}`}>{log.userName}</span>
                          <span className="text-muted-foreground text-xs" data-testid={`audit-log-timestamp-${log.id}`}>
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-foreground" data-testid={`audit-log-action-${log.id}`}>{log.action}</p>
                        <p className="text-muted-foreground text-xs mt-1" data-testid={`audit-log-details-${log.id}`}>{log.details}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
      </div>
    </QuizAdminLayout>
  );
}
