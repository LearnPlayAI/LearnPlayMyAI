import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Plus, Edit, Trash2, ChevronDown, ChevronRight, Building2, FolderTree, UserPlus, Users, Link2, Globe, DollarSign } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';
import { TIMEZONES } from '@/utils/timezones';
import { usePlatformMode } from '@/hooks/usePlatformMode';

export default function OrgStructureManager() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { isSuperAdmin, isOrgAdmin, isTeacher, organizationRoles, effectiveOrganizationId } = useAuth();
  const { terminology, terminologyLower, isResolved } = useOrganizationTerminology();
  const { baseUrl } = usePlatformMode();
  
  const canManageStructure = isSuperAdmin || isOrgAdmin;
  
  const [selectedOrg, setSelectedOrg] = useState('');
  const [unitDialog, setUnitDialog] = useState(false);
  const [subUnitDialog, setSubUnitDialog] = useState(false);
  const [orgDialog, setOrgDialog] = useState(false);
  const [editingUnit, setEditingUnit] = useState<any>(null);
  const [editingSubUnit, setEditingSubUnit] = useState<any>(null);
  const [editingOrg, setEditingOrg] = useState<any>(null);
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  
  const [unitName, setUnitName] = useState('');
  const [unitOrder, setUnitOrder] = useState('1');
  const [unitJoinCode, setUnitJoinCode] = useState('');
  const [subUnitName, setSubUnitName] = useState('');
  const [subUnitOrder, setSubUnitOrder] = useState('1');
  const [subUnitJoinCode, setSubUnitJoinCode] = useState('');
  const [orgName, setOrgName] = useState('');
  const [newOrgType, setNewOrgType] = useState<'education' | 'business' | 'elearning'>('business');
  const [orgInviteCode, setOrgInviteCode] = useState('');
  const [orgTimezone, setOrgTimezone] = useState('');
  const [orgCurrency, setOrgCurrency] = useState<'ZAR' | 'USD' | 'EUR' | ''>('');
  
  const [settingsTimezone, setSettingsTimezone] = useState('');
  const [settingsCurrency, setSettingsCurrency] = useState<'ZAR' | 'USD' | 'EUR' | ''>('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  
  const [assignUserDialog, setAssignUserDialog] = useState(false);
  const [assigningToSubUnit, setAssigningToSubUnit] = useState<any>(null);
  const [assigningToUnit, setAssigningToUnit] = useState<any>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedSubUnitId, setSelectedSubUnitId] = useState('');

  // Fetch organizations for SuperAdmin only
  const { data: organizations = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations'],
    enabled: isSuperAdmin,
  });

  // Fetch current organization data for OrgAdmins (non-SuperAdmins)
  const { data: currentOrgData } = useQuery<any>({
    queryKey: ['/api/admin/organizations', selectedOrg],
    enabled: !!selectedOrg && !isSuperAdmin,
  });

  // Auto-select organization
  useEffect(() => {
    if (!selectedOrg) {
      if (isSuperAdmin && organizations.length > 0) {
        // SuperAdmins: use first organization from the list
        setSelectedOrg(organizations[0].id);
      } else if (!isSuperAdmin) {
        // Non-SuperAdmins: use effective org context first, then fallback.
        const fallbackOrgId = effectiveOrganizationId || (organizationRoles.length > 0 ? organizationRoles[0].organizationId : '');
        if (fallbackOrgId) {
          setSelectedOrg(fallbackOrgId);
        }
      }
    }
  }, [isSuperAdmin, organizations, organizationRoles, effectiveOrganizationId, selectedOrg]);

  // Sync settings card state with selectedOrgData
  // For SuperAdmins, use org from the organizations list; for OrgAdmins, use the individually fetched org data
  const selectedOrgData = isSuperAdmin 
    ? organizations.find(o => o.id === selectedOrg)
    : currentOrgData;

  useEffect(() => {
    if (selectedOrgData) {
      setSettingsTimezone(selectedOrgData.timezone || '');
      setSettingsCurrency(selectedOrgData.currency || '');
    }
  }, [selectedOrgData]);

  const { data: units = [], isLoading: unitsLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', selectedOrg, 'units'],
    enabled: !!selectedOrg,
  });

  const { data: allSubUnits = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', selectedOrg, 'sub-units'],
    enabled: !!selectedOrg,
  });
  
  const { data: orgUsers = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', selectedOrg, 'users'],
    queryFn: async () => {
      const response = await fetch(`/api/admin/organizations/${selectedOrg}/users`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch users');
      return response.json();
    },
    enabled: !!selectedOrg,
  });

  const { data: subjects = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/subjects', selectedOrg],
    queryFn: async () => {
      const response = await fetch(`/api/admin/subjects?organizationId=${selectedOrg}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch subjects');
      return response.json();
    },
    enabled: !!selectedOrg,
  });

  // Show loading state until terminology is resolved
  if (!isResolved || !terminology || !terminologyLower) {
    return (
      <QuizAdminLayout title="Organization Structure" description="Loading..." activeSection="structure">
        <div className="flex items-center justify-center h-64">
          <div className="text-foreground">Loading organization settings...</div>
        </div>
      </QuizAdminLayout>
    );
  }

  const unitExample = `Example ${terminology.unit}`;
  const subUnitExample = `Example ${terminology.subUnit}`;

  const createUnitMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/admin/organizations/${selectedOrg}/units`, {
        method: 'POST',
        body: JSON.stringify({
          name: unitName,
          displayOrder: parseInt(unitOrder),
          joinCode: unitJoinCode || null
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'units'] });
      toast({ title: `${terminology.unit} created successfully` });
      setUnitDialog(false);
      setUnitName('');
      setUnitOrder('1');
      setUnitJoinCode('');
    },
    onError: () => {
      toast({ title: `Failed to create ${terminologyLower.unit}`, variant: 'destructive' });
    }
  });

  const updateUnitMutation = useMutation({
    mutationFn: async (unitId: string) => {
      return await apiRequest(`/api/admin/units/${unitId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: unitName,
          displayOrder: parseInt(unitOrder),
          joinCode: unitJoinCode || null
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'units'] });
      toast({ title: `${terminology.unit} updated successfully` });
      setUnitDialog(false);
      setEditingUnit(null);
      setUnitName('');
      setUnitOrder('1');
      setUnitJoinCode('');
    },
    onError: () => {
      toast({ title: `Failed to update ${terminologyLower.unit}`, variant: 'destructive' });
    }
  });

  const deleteUnitMutation = useMutation({
    mutationFn: async (unitId: string) => {
      return await apiRequest(`/api/admin/units/${unitId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'units'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'sub-units'] });
      toast({ title: `${terminology.unit} deleted successfully` });
    },
    onError: () => {
      toast({ title: `Failed to delete ${terminologyLower.unit}`, variant: 'destructive' });
    }
  });

  const createSubUnitMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/admin/units/${selectedUnit}/sub-units`, {
        method: 'POST',
        body: JSON.stringify({
          name: subUnitName,
          displayOrder: parseInt(subUnitOrder),
          joinCode: subUnitJoinCode || null
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'sub-units'] });
      toast({ title: `${terminology.subUnit} created successfully` });
      setSubUnitDialog(false);
      setSubUnitName('');
      setSubUnitOrder('1');
      setSubUnitJoinCode('');
    },
    onError: () => {
      toast({ title: `Failed to create ${terminologyLower.subUnit}`, variant: 'destructive' });
    }
  });

  const updateSubUnitMutation = useMutation({
    mutationFn: async (subUnitId: string) => {
      return await apiRequest(`/api/admin/sub-units/${subUnitId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: subUnitName,
          displayOrder: parseInt(subUnitOrder),
          joinCode: subUnitJoinCode || null
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'sub-units'] });
      toast({ title: `${terminology.subUnit} updated successfully` });
      setSubUnitDialog(false);
      setEditingSubUnit(null);
      setSubUnitName('');
      setSubUnitOrder('1');
      setSubUnitJoinCode('');
    },
    onError: () => {
      toast({ title: `Failed to update ${terminologyLower.subUnit}`, variant: 'destructive' });
    }
  });

  const deleteSubUnitMutation = useMutation({
    mutationFn: async (subUnitId: string) => {
      return await apiRequest(`/api/admin/sub-units/${subUnitId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'sub-units'] });
      toast({ title: `${terminology.subUnit} deleted successfully` });
    },
    onError: () => {
      toast({ title: `Failed to delete ${terminologyLower.subUnit}`, variant: 'destructive' });
    }
  });

  const assignUserMutation = useMutation({
    mutationFn: async () => {
      // Use selectedSubUnitId if provided (from dialog selector), otherwise use assigningToSubUnit
      const subUnitId = selectedSubUnitId || assigningToSubUnit?.id || null;
      return await apiRequest(`/api/admin/organizations/${selectedOrg}/users/${selectedUserId}/assignments`, {
        method: 'POST',
        body: JSON.stringify({
          unitId: assigningToUnit?.id || null,
          subUnitId: subUnitId,
          subjectId: selectedSubjectId || null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg, 'users'] });
      toast({ title: 'User assigned successfully' });
      setAssignUserDialog(false);
      setSelectedUserId('');
      setSelectedSubjectId('');
      setSelectedSubUnitId('');
      setAssigningToSubUnit(null);
      setAssigningToUnit(null);
    },
    onError: () => {
      toast({ title: 'Failed to assign user', variant: 'destructive' });
    }
  });

  const createOrgMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/admin/organizations', {
        method: 'POST',
        body: JSON.stringify({
          name: orgName,
          type: newOrgType,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
      toast({ title: 'Organization created successfully' });
      setOrgDialog(false);
      setOrgName('');
      setNewOrgType('business');
    },
    onError: () => {
      toast({ title: 'Failed to create organization', variant: 'destructive' });
    }
  });

  const updateOrgMutation = useMutation({
    mutationFn: async (orgId: string) => {
      return await apiRequest(`/api/admin/organizations/${orgId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: orgName,
          inviteCode: orgInviteCode || null,
          timezone: orgTimezone || null,
          currency: orgCurrency || null,
        }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
      // Also invalidate the individual org query (used by OrgAdmins)
      if (selectedOrg) {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg] });
      }
      
      // Handle visibility transition - invalidate course caches if courses were migrated
      if (data?._visibilityTransition?.cacheInvalidation?.shouldInvalidate) {
        // Invalidate all course-related queries using predicate for partial matching
        // Check ALL elements in the query key array for course-related patterns
        const coursePatterns = [
          '/api/courses',
          '/api/public/courses',
          '/api/public/popular-courses',
          '/api/browse',
          '/api/catalog',
          '/api/search',
          '/api/recommendations',
          'marketplace',
          'course'
        ];
        
        queryClient.invalidateQueries({
          predicate: (query) => {
            // Check every element in the query key array
            for (const keyPart of query.queryKey) {
              if (typeof keyPart === 'string') {
                const lowerPart = keyPart.toLowerCase();
                for (const pattern of coursePatterns) {
                  if (lowerPart.includes(pattern.toLowerCase())) {
                    return true;
                  }
                }
              }
            }
            return false;
          }
        });
        
        // Show additional toast about course visibility changes
        if (data._visibilityTransition.coursesUpdated > 0) {
          toast({ 
            title: 'Course visibility updated',
            description: `${data._visibilityTransition.coursesUpdated} course(s) changed to organization-only visibility`
          });
        }
      }
      
      toast({ title: 'Organization updated successfully' });
      setOrgDialog(false);
      setEditingOrg(null);
      setOrgName('');
      setNewOrgType('business');
      setOrgInviteCode('');
      setOrgTimezone('');
      setOrgCurrency('');
    },
    onError: () => {
      toast({ title: 'Failed to update organization', variant: 'destructive' });
    }
  });

  const handleAssignUser = () => {
    if (!selectedUserId) {
      toast({ title: 'Please select a user', variant: 'destructive' });
      return;
    }
    
    // If assigning to a unit (not a specific subunit) and the unit has subunits, require subunit selection
    if (!assigningToSubUnit && assigningToUnit) {
      const unitSubUnits = getSubUnitsForUnit(assigningToUnit.id);
      if (unitSubUnits.length > 0 && !selectedSubUnitId) {
        toast({ title: `Please select a ${terminologyLower.subUnit}`, variant: 'destructive' });
        return;
      }
    }
    
    assignUserMutation.mutate();
  };

  const openAssignUserDialog = (unit: any, subUnit: any) => {
    setAssigningToUnit(unit);
    setAssigningToSubUnit(subUnit);
    setSelectedUserId('');
    setSelectedSubjectId('');
    setSelectedSubUnitId('');
    setAssignUserDialog(true);
  };

  const handleCreateUnit = () => {
    if (!unitName) {
      toast({ title: 'Please enter a name', variant: 'destructive' });
      return;
    }
    if (editingUnit) {
      updateUnitMutation.mutate(editingUnit.id);
    } else {
      createUnitMutation.mutate();
    }
  };

  const handleCreateSubUnit = () => {
    if (!subUnitName) {
      toast({ title: 'Please enter a name', variant: 'destructive' });
      return;
    }
    if (editingSubUnit) {
      updateSubUnitMutation.mutate(editingSubUnit.id);
    } else {
      createSubUnitMutation.mutate();
    }
  };

  const openEditUnit = (unit: any) => {
    setEditingUnit(unit);
    setUnitName(unit.name);
    setUnitOrder(unit.displayOrder.toString());
    setUnitJoinCode(unit.joinCode || '');
    setUnitDialog(true);
  };

  const openEditSubUnit = (subUnit: any) => {
    setEditingSubUnit(subUnit);
    setSubUnitName(subUnit.name);
    setSubUnitOrder(subUnit.displayOrder.toString());
    setSubUnitJoinCode(subUnit.joinCode || '');
    setSubUnitDialog(true);
  };

  const getSubUnitsForUnit = (unitId: string) => {
    return allSubUnits.filter((su: any) => su.unitId === unitId);
  };

  const handleCreateOrg = () => {
    if (!orgName) {
      toast({ title: 'Please enter a name', variant: 'destructive' });
      return;
    }
    if (editingOrg) {
      updateOrgMutation.mutate(editingOrg.id);
    } else {
      createOrgMutation.mutate();
    }
  };

  const openEditOrg = (org: any) => {
    setEditingOrg(org);
    setOrgName(org.name);
    setNewOrgType(org.type || 'business');
    setOrgInviteCode(org.inviteCode || '');
    setOrgTimezone(org.timezone || '');
    setOrgCurrency(org.currency || '');
    setOrgDialog(true);
  };

  const copyJoinLink = (joinCode: string) => {
    const url = `${baseUrl}/register?code=${joinCode}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ 
        title: 'Link copied!', 
        description: 'Registration link copied to clipboard' 
      });
    }).catch(() => {
      toast({ 
        title: 'Failed to copy', 
        variant: 'destructive' 
      });
    });
  };

  const canEditOrg = (org: any) => {
    if (isSuperAdmin) return true;
    if (isOrgAdmin) {
      return organizationRoles.some((r: any) => r.organizationId === org.id && r.role === 'org_admin');
    }
    return false;
  };

  return (
    <QuizAdminLayout title="Organization Structure" description="Manage organizational units and sub-units" activeSection="structure">
      <div className="space-y-[var(--space-lg)] p-[var(--container-padding)]">
        <Card>
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-[var(--space-md)]">
              <div>
                <CardTitle className="text-[length:var(--text-xl)]">Select Organization</CardTitle>
                <CardDescription className="text-[length:var(--text-sm)]">Choose an organization to manage its structure</CardDescription>
              </div>
              {isSuperAdmin && (
                <Button onClick={() => {
                    setEditingOrg(null);
                    setOrgName('');
                    setNewOrgType('business');
                    setOrgDialog(true);
                  }}
                  className="bg-primary hover:bg-primary/80 min-h-[44px] touch-manipulation w-full sm:w-auto"
                  data-testid="button-create-org"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Organization
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-[var(--card-padding)]">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-[var(--space-sm)]">
              <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                <SelectTrigger data-testid="select-organization" className="flex-1 min-h-[44px] touch-manipulation">
                  <SelectValue placeholder="Select an organization" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org: any) => (
                    <SelectItem key={org.id} value={org.id} className="min-h-[44px]">
                      {org.name} ({org.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedOrgData && canEditOrg(selectedOrgData) && canManageStructure && (
                <Button variant="outline" size="icon" onClick={() => openEditOrg(selectedOrgData)}
                  data-testid="button-edit-org"
                  title="Edit organization"
                  className="min-h-[44px] min-w-[44px] touch-manipulation"
                >
                  <Edit className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {selectedOrg && (
          <>
            <Card className="mb-[var(--space-lg)] bg-primary hover:bg-primary/90 border-primary/30 dark:border-primary/50">
              <CardContent className="p-[var(--card-padding)]">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-[var(--space-md)]">
                  <div>
                    <h2 className="text-[length:var(--text-2xl)] font-bold text-foreground">
                      {selectedOrgData?.name}
                    </h2>
                    <p className="text-foreground mt-1 font-semibold text-[length:var(--text-base)]">
                      Type: {selectedOrgData?.type === 'education' ? 'Educational Institution' : selectedOrgData?.type === 'elearning' ? 'E-Learning Organization' : 'Business Organization'}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-[var(--space-sm)]">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary dark:bg-primary/30 dark:text-primary/90">
                        {units.length} {units.length !== 1 ? terminology.unitPlural : terminology.unit}
                      </span>
                      {selectedOrgData?.inviteCode && (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs font-mono">
                            Org Code: {selectedOrgData.inviteCode}
                          </Badge>
                          <Button variant="ghost" size="sm" className="h-[44px] w-[44px] p-0 touch-manipulation" onClick={() => copyJoinLink(selectedOrgData.inviteCode)}
                            data-testid="button-copy-link-org"
                            title="Copy organization registration link"
                          >
                            <Link2 className="h-4 w-4 text-primary dark:text-primary/80" />
                          </Button>
                        </div>
                      )}
                      {selectedOrgData?.timezone && (
                        <Badge variant="outline" className="text-xs">
                          <Globe className="h-3 w-3 mr-1" />
                          {selectedOrgData.timezone}
                        </Badge>
                      )}
                      {selectedOrgData?.currency && (
                        <Badge variant="outline" className="text-xs">
                          <DollarSign className="h-3 w-3 mr-1" />
                          {selectedOrgData.currency}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-[var(--space-sm)] w-full lg:w-auto">
                    {selectedOrgData && canEditOrg(selectedOrgData) && canManageStructure && (
                      <Button onClick={() => openEditOrg(selectedOrgData)}
                        size="lg"
                        variant="outline"
                        className="border-primary text-primary dark:text-primary/80 hover:bg-primary/10 dark:hover:bg-primary/20 min-h-[44px] touch-manipulation w-full sm:w-auto"
                        data-testid="button-edit-org-card"
                      >
                        <Edit className="mr-2 h-4 w-4" />
                        Edit Organization
                      </Button>
                    )}
                    {canManageStructure && (
                      <Button onClick={() => {
                          setEditingUnit(null);
                          setUnitName('');
                          setUnitOrder((units.length + 1).toString());
                          setUnitDialog(true);
                        }}
                        size="lg"
                        className="bg-primary hover:bg-primary/90 min-h-[44px] touch-manipulation w-full sm:w-auto"
                        data-testid="button-add-unit"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add {terminology.unit}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {selectedOrgData && canEditOrg(selectedOrgData) && (
              <Card>
                <CardHeader className="p-[var(--card-padding)]">
                  <CardTitle className="flex items-center gap-2 text-[length:var(--text-xl)]">
                    <Globe className="h-5 w-5" />
                    <DollarSign className="h-5 w-5" />
                    Organization Settings
                  </CardTitle>
                  <CardDescription className="text-[length:var(--text-sm)]">
                    Configure timezone and currency preferences for this organization
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-[var(--card-padding)] space-y-[var(--space-md)]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)]">
                    <div className="space-y-2">
                      <Label htmlFor="settings-timezone">Timezone</Label>
                      <Select value={settingsTimezone} onValueChange={setSettingsTimezone}>
                        <SelectTrigger id="settings-timezone" data-testid="select-settings-timezone" className="min-h-[44px] touch-manipulation">
                          <SelectValue placeholder="Select timezone" />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz.value} value={tz.value}>
                              {tz.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Current: {selectedOrgData?.timezone || 'Not set'}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="settings-currency">Default Currency</Label>
                      <Select value={settingsCurrency} onValueChange={(value) => setSettingsCurrency(value as 'ZAR' | 'USD' | 'EUR' | '')}>
                        <SelectTrigger id="settings-currency" data-testid="select-settings-currency" className="min-h-[44px] touch-manipulation">
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ZAR">ZAR - South African Rand (R)</SelectItem>
                          <SelectItem value="USD">USD - US Dollar ($)</SelectItem>
                          <SelectItem value="EUR">EUR - Euro (€)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Current: {selectedOrgData?.currency || 'Not set'}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={async () => {
                        setSettingsSaving(true);
                        try {
                          await apiRequest(`/api/admin/organizations/${selectedOrg}`, {
                            method: 'PUT',
                            body: JSON.stringify({
                              name: selectedOrgData.name,
                              inviteCode: selectedOrgData.inviteCode || null,
                              timezone: settingsTimezone || null,
                              currency: settingsCurrency || null,
                            }),
                          });
                          queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
                          queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrg] });
                          toast({ title: 'Settings saved successfully' });
                        } catch (error) {
                          toast({ title: 'Failed to save settings', variant: 'destructive' });
                        } finally {
                          setSettingsSaving(false);
                        }
                      }}
                      disabled={settingsSaving}
                      data-testid="button-save-settings"
                      className="min-h-[44px] touch-manipulation"
                    >
                      {settingsSaving ? 'Saving...' : 'Save Settings'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {unitsLoading ? (
              <div className="text-center py-[var(--space-2xl)]">Loading structure...</div>
            ) : units.length > 0 ? (
              <Accordion type="multiple" className="space-y-[var(--space-md)]">
                {units.map((unit: any) => {
                  const subUnits = getSubUnitsForUnit(unit.id);
                  return (
                    <AccordionItem key={unit.id} value={unit.id} className="border-2 border-border rounded-lg bg-card shadow-sm">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-[var(--card-padding)] gap-[var(--space-sm)]">
                        <AccordionTrigger className="hover:no-underline flex-1 py-[var(--space-md)] min-h-[44px] touch-manipulation">
                          <div className="flex items-center gap-[var(--space-sm)]">
                            <FolderTree className="h-5 w-5 text-primary dark:text-primary/80 flex-shrink-0" />
                            <div className="text-left min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="font-semibold text-[length:var(--text-lg)] text-foreground">{unit.name}</div>
                                {unit.joinCode && (
                                  <Badge variant="outline" className="text-xs font-mono">
                                    {unit.joinCode}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-[length:var(--text-sm)] text-muted-foreground font-medium">
                                {subUnits.length} {subUnits.length !== 1 ? terminology.subUnitPlural : terminology.subUnit}
                              </div>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <div className="flex flex-wrap gap-1 pb-2 sm:pb-0">
                          {unit.joinCode && (
                            <Button variant="ghost" size="sm" className="min-h-[44px] min-w-[44px] touch-manipulation" onClick={() => copyJoinLink(unit.joinCode)}
                              data-testid={`button-copy-link-unit-${unit.id}`}
                              title="Copy registration link"
                            >
                              <Link2 className="h-4 w-4 text-primary dark:text-primary/80" />
                            </Button>
                          )}
                          {canManageStructure && (
                            <Button variant="ghost" size="sm" className="min-h-[44px] min-w-[44px] touch-manipulation" onClick={() => openAssignUserDialog(unit, null)} 
                              data-testid={`button-assign-user-unit-${unit.id}`}
                              title="Assign user to this unit"
                            >
                              <UserPlus className="h-4 w-4 text-primary" />
                            </Button>
                          )}
                          {canManageStructure && (
                            <Button variant="ghost" size="sm" className="min-h-[44px] min-w-[44px] touch-manipulation" onClick={() => openEditUnit(unit)} data-testid={`button-edit-unit-${unit.id}`}>
                              <Edit className="h-4 w-4 text-secondary" />
                            </Button>
                          )}
                          {canManageStructure && (
                            <Button variant="ghost" size="sm" className="min-h-[44px] min-w-[44px] touch-manipulation" onClick={() => {
                                if (confirm(`Delete ${terminology.unit} "${unit.name}"?`)) {
                                  deleteUnitMutation.mutate(unit.id);
                                }
                              }}
                              data-testid={`button-delete-unit-${unit.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <AccordionContent className="pt-[var(--space-md)] pb-[var(--space-sm)] px-[var(--card-padding)]">
                        <div className="space-y-[var(--space-sm)]">
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-[var(--space-sm)] mb-[var(--space-sm)]">
                            <h4 className="font-semibold text-[length:var(--text-sm)] text-foreground">
                              {terminology.subUnitPlural}
                            </h4>
                            {canManageStructure && (
                              <Button size="sm" variant="outline" className="min-h-[44px] touch-manipulation w-full sm:w-auto" onClick={() => {
                                  setSelectedUnit(unit.id);
                                  setEditingSubUnit(null);
                                  setSubUnitName('');
                                  setSubUnitOrder((subUnits.length + 1).toString());
                                  setSubUnitDialog(true);
                                }}
                                data-testid={`button-add-subunit-${unit.id}`}
                              >
                                <Plus className="mr-1 h-3 w-3" />
                                Add {terminology.subUnit}
                              </Button>
                            )}
                          </div>
                          {subUnits.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-sm)]">
                              {subUnits.map((subUnit: any) => (
                                <div key={subUnit.id} className="flex items-center justify-between p-[var(--card-padding)] bg-muted rounded border border-border">
                                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                                    <span className="text-[length:var(--text-sm)] font-medium text-foreground truncate">{subUnit.name}</span>
                                    {subUnit.joinCode && (
                                      <div className="flex items-center gap-1">
                                        <Badge variant="outline" className="text-xs font-mono w-fit">
                                          {subUnit.joinCode}
                                        </Badge>
                                        <Button variant="ghost" size="sm" className="h-[44px] w-[44px] p-0 touch-manipulation flex-shrink-0" onClick={() => copyJoinLink(subUnit.joinCode)}
                                          data-testid={`button-copy-link-subunit-${subUnit.id}`}
                                          title="Copy registration link"
                                        >
                                          <Link2 className="h-4 w-4 text-primary dark:text-primary/80" />
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-1 flex-shrink-0 ml-2">
                                    {canManageStructure && (
                                      <Button variant="ghost" size="sm" className="min-h-[44px] min-w-[44px] touch-manipulation" onClick={() => openAssignUserDialog(unit, subUnit)}
                                        data-testid={`button-assign-user-${subUnit.id}`}
                                        title="Assign user to this class"
                                      >
                                        <UserPlus className="h-4 w-4 text-primary" />
                                      </Button>
                                    )}
                                    {canManageStructure && (
                                      <Button variant="ghost" size="sm" className="min-h-[44px] min-w-[44px] touch-manipulation" onClick={() => {
                                          setSelectedUnit(unit.id);
                                          openEditSubUnit(subUnit);
                                        }}
                                        data-testid={`button-edit-subunit-${subUnit.id}`}
                                      >
                                        <Edit className="h-4 w-4 text-secondary" />
                                      </Button>
                                    )}
                                    {canManageStructure && (
                                      <Button variant="ghost" size="sm" className="min-h-[44px] min-w-[44px] touch-manipulation" onClick={() => {
                                          if (confirm(`Delete ${terminology.subUnit} "${subUnit.name}"?`)) {
                                            deleteSubUnitMutation.mutate(subUnit.id);
                                          }
                                        }}
                                        data-testid={`button-delete-subunit-${subUnit.id}`}
                                      >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[length:var(--text-sm)] text-muted-foreground italic py-[var(--space-md)] text-center">
                              No {terminologyLower.subUnitPlural} yet
                            </p>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            ) : (
              <Card>
                <CardContent className="py-[var(--space-2xl)] text-center p-[var(--card-padding)]">
                  <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-[length:var(--text-lg)] font-semibold text-foreground mb-2">
                    No {terminology.unitPlural} yet
                  </h3>
                  <p className="text-muted-foreground mb-4 text-[length:var(--text-base)]">
                    {canManageStructure ? `Create your first ${terminologyLower.unit} to organize this organization` : `No ${terminologyLower.unitPlural} have been created yet`}
                  </p>
                  {canManageStructure && (
                    <Button onClick={() => {
                        setEditingUnit(null);
                        setUnitName('');
                        setUnitOrder('1');
                        setUnitDialog(true);
                      }}
                      data-testid="button-add-first-unit"
                      className="min-h-[44px] touch-manipulation w-full sm:w-auto"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add {terminology.unit}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}

        {!selectedOrg && (
          <Card>
            <CardContent className="py-[var(--space-2xl)] text-center p-[var(--card-padding)]">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-[length:var(--text-lg)] font-semibold text-foreground mb-2">
                Select an Organization
              </h3>
              <p className="text-muted-foreground text-[length:var(--text-base)]">
                Choose an organization from the dropdown above to manage its structure
              </p>
            </CardContent>
          </Card>
        )}

        {/* Organization Dialog */}
        <Dialog open={orgDialog} onOpenChange={setOrgDialog}>
          <DialogContent className="p-[var(--dialog-padding)] max-h-[var(--dialog-max-height)] overflow-y-auto w-[calc(100%-2rem)] sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-[length:var(--text-xl)]">{editingOrg ? 'Edit Organization' : 'Create Organization'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-[var(--space-md)] py-[var(--space-md)]">
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization Name</Label>
                <Input
                  id="org-name"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g., Springfield High School"
                  data-testid="input-org-name"
                  className="min-h-[44px] touch-manipulation"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-type">Organization Type</Label>
                {editingOrg ? (
                  <div className="flex items-center gap-2 p-3 bg-muted/50 border border-border rounded-md min-h-[44px]">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">
                      {newOrgType === 'education' ? 'Educational Institution' : 
                       newOrgType === 'business' ? 'Business Organization' : 
                       'E-Learning Organization'}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">(Cannot be changed)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-muted/50 border border-border rounded-md min-h-[44px]">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">Business Organization</span>
                  </div>
                )}
              </div>
              {editingOrg && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="org-invite-code">Organization Join Code (Optional)</Label>
                    <Input
                      id="org-invite-code"
                      value={orgInviteCode}
                      onChange={(e) => setOrgInviteCode(e.target.value.toUpperCase())}
                      placeholder="e.g., CURDUG or EQUATE"
                      maxLength={50}
                      data-testid="input-org-invite-code"
                      className="min-h-[44px] touch-manipulation"
                    />
                    <p className="text-xs text-muted-foreground">
                      New users can use this code to join the organization without being assigned to a specific {terminologyLower.unit}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org-timezone">Organization Timezone</Label>
                    <Select value={orgTimezone} onValueChange={setOrgTimezone}>
                      <SelectTrigger id="org-timezone" data-testid="select-org-timezone" className="min-h-[44px] touch-manipulation">
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Default timezone for all organization users and scheduling
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org-currency">Default Currency</Label>
                    <Select value={orgCurrency} onValueChange={(value) => setOrgCurrency(value as 'ZAR' | 'USD' | 'EUR' | '')}>
                      <SelectTrigger id="org-currency" data-testid="select-org-currency" className="min-h-[44px] touch-manipulation">
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ZAR">ZAR - South African Rand (R)</SelectItem>
                        <SelectItem value="USD">USD - US Dollar ($)</SelectItem>
                        <SelectItem value="EUR">EUR - Euro (€)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Default currency for course pricing and transactions
                    </p>
                  </div>
                </>
              )}
            </div>
            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setOrgDialog(false)} data-testid="button-cancel-org" className="min-h-[44px] touch-manipulation w-full sm:w-auto">
                Cancel
              </Button>
              <Button onClick={handleCreateOrg} data-testid="button-save-org" className="min-h-[44px] touch-manipulation w-full sm:w-auto">
                {editingOrg ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={unitDialog} onOpenChange={setUnitDialog}>
          <DialogContent className="p-[var(--dialog-padding)] max-h-[var(--dialog-max-height)] overflow-y-auto w-[calc(100%-2rem)] sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-[length:var(--text-xl)]">{editingUnit ? `Edit ${terminology.unit}` : `Create ${terminology.unit}`}</DialogTitle>
            </DialogHeader>
            <div className="space-y-[var(--space-md)] py-[var(--space-md)]">
              <div className="space-y-2">
                <Label htmlFor="unit-name">{terminology.unit} Name</Label>
                <Input
                  id="unit-name"
                  value={unitName}
                  onChange={(e) => setUnitName(e.target.value)}
                  placeholder={`e.g., ${unitExample}`}
                  data-testid="input-unit-name"
                  className="min-h-[44px] touch-manipulation"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit-join-code">Join Code (Optional)</Label>
                <Input
                  id="unit-join-code"
                  value={unitJoinCode}
                  onChange={(e) => setUnitJoinCode(e.target.value.toUpperCase())}
                  placeholder={`e.g., ${selectedOrgData?.type === 'education' ? 'SCHOOL_G10' : 'COMPANY_ENG'}`}
                  maxLength={50}
                  data-testid="input-unit-join-code"
                  className="min-h-[44px] touch-manipulation"
                />
                <p className="text-xs text-muted-foreground">
                  {terminology.learnerPlural} can use this code to join this {terminologyLower.unit} during registration
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit-order">Display Order</Label>
                <Input
                  id="unit-order"
                  type="number"
                  value={unitOrder}
                  onChange={(e) => setUnitOrder(e.target.value)}
                  min="1"
                  data-testid="input-unit-order"
                  className="min-h-[44px] touch-manipulation"
                />
              </div>
            </div>
            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setUnitDialog(false)} data-testid="button-cancel-unit" className="min-h-[44px] touch-manipulation w-full sm:w-auto">
                Cancel
              </Button>
              <Button onClick={handleCreateUnit} disabled={createUnitMutation.isPending || updateUnitMutation.isPending} data-testid="button-save-unit" className="min-h-[44px] touch-manipulation w-full sm:w-auto" >
                {editingUnit ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={subUnitDialog} onOpenChange={setSubUnitDialog}>
          <DialogContent className="p-[var(--dialog-padding)] max-h-[var(--dialog-max-height)] overflow-y-auto w-[calc(100%-2rem)] sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-[length:var(--text-xl)]">{editingSubUnit ? `Edit ${terminology.subUnit}` : `Create ${terminology.subUnit}`}</DialogTitle>
            </DialogHeader>
            <div className="space-y-[var(--space-md)] py-[var(--space-md)]">
              <div className="space-y-2">
                <Label htmlFor="subunit-name">{terminology.subUnit} Name</Label>
                <Input
                  id="subunit-name"
                  value={subUnitName}
                  onChange={(e) => setSubUnitName(e.target.value)}
                  placeholder={`e.g., ${subUnitExample}`}
                  data-testid="input-subunit-name"
                  className="min-h-[44px] touch-manipulation"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subunit-join-code">Join Code (Optional)</Label>
                <Input
                  id="subunit-join-code"
                  value={subUnitJoinCode}
                  onChange={(e) => setSubUnitJoinCode(e.target.value.toUpperCase())}
                  placeholder={`e.g., ${selectedOrgData?.type === 'education' ? 'SCHOOL_G10_A' : 'COMPANY_ENG_BACKEND'}`}
                  maxLength={50}
                  data-testid="input-subunit-join-code"
                  className="min-h-[44px] touch-manipulation"
                />
                <p className="text-xs text-muted-foreground">
                  {terminology.learnerPlural} can use this code to join this {terminologyLower.subUnit} during registration
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subunit-order">Display Order</Label>
                <Input
                  id="subunit-order"
                  type="number"
                  value={subUnitOrder}
                  onChange={(e) => setSubUnitOrder(e.target.value)}
                  min="1"
                  data-testid="input-subunit-order"
                  className="min-h-[44px] touch-manipulation"
                />
              </div>
            </div>
            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setSubUnitDialog(false)} data-testid="button-cancel-subunit" className="min-h-[44px] touch-manipulation w-full sm:w-auto">
                Cancel
              </Button>
              <Button onClick={handleCreateSubUnit} disabled={createSubUnitMutation.isPending || updateSubUnitMutation.isPending} data-testid="button-save-subunit" className="min-h-[44px] touch-manipulation w-full sm:w-auto" >
                {editingSubUnit ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={assignUserDialog} onOpenChange={setAssignUserDialog}>
          <DialogContent className="p-[var(--dialog-padding)] max-h-[var(--dialog-max-height)] overflow-y-auto w-[calc(100%-2rem)] sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-[length:var(--text-xl)]">Assign User to {assigningToSubUnit ? terminology.subUnit : terminology.unit}</DialogTitle>
            </DialogHeader>
            <div className="space-y-[var(--space-md)] py-[var(--space-md)]">
              <div className="space-y-2">
                <Label className="text-[length:var(--text-sm)] text-muted-foreground">
                  Assigning to: <span className="font-semibold text-foreground">
                    {assigningToSubUnit ? `${assigningToUnit?.name} - ${assigningToSubUnit?.name}` : assigningToUnit?.name}
                  </span>
                </Label>
              </div>
              
              {!assigningToSubUnit && getSubUnitsForUnit(assigningToUnit?.id).length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="subunit-select">Select {terminology.subUnit} {getSubUnitsForUnit(assigningToUnit?.id).length > 1 ? '(Required)' : ''}</Label>
                  <Select value={selectedSubUnitId} onValueChange={setSelectedSubUnitId}>
                    <SelectTrigger id="subunit-select" data-testid="select-subunit-assignment" className="min-h-[44px] touch-manipulation">
                      <SelectValue placeholder={`Choose a ${terminologyLower.subUnit}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {getSubUnitsForUnit(assigningToUnit?.id).map((subUnit: any) => (
                        <SelectItem key={subUnit.id} value={subUnit.id} className="min-h-[44px]">
                          {subUnit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="user-select">Select User</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger id="user-select" data-testid="select-user" className="min-h-[44px] touch-manipulation">
                    <SelectValue placeholder="Choose a user to assign" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgUsers.length === 0 ? (
                      <div className="p-2 text-[length:var(--text-sm)] text-muted-foreground">No users available</div>
                    ) : (
                      orgUsers.map((user: any) => (
                        <SelectItem key={user.id} value={user.id} className="min-h-[44px]">
                          {user.username} ({user.role || terminologyLower.learner})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject-select">Select {terminology.subject} (Optional)</Label>
                <Select value={selectedSubjectId} onValueChange={(val) => setSelectedSubjectId(val === 'no-subject' ? '' : val)}>
                  <SelectTrigger id="subject-select" data-testid="select-subject" className="min-h-[44px] touch-manipulation">
                    <SelectValue placeholder={`No ${terminologyLower.subject} (access all)`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no-subject" className="min-h-[44px]">No {terminologyLower.subject} (access all)</SelectItem>
                    {subjects.map((subject: any) => (
                      <SelectItem key={subject.id} value={subject.id} className="min-h-[44px]">
                        {subject.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setAssignUserDialog(false)} data-testid="button-cancel-assign" className="min-h-[44px] touch-manipulation w-full sm:w-auto">
                Cancel
              </Button>
              <Button onClick={handleAssignUser} disabled={assignUserMutation.isPending} data-testid="button-confirm-assign" className="min-h-[44px] touch-manipulation w-full sm:w-auto" >
                Assign User
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </QuizAdminLayout>
  );
}
