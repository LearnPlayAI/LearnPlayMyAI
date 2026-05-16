import { useState, useMemo, useEffect, useDeferredValue } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Lock, Unlock, KeyRound, Shield, Search, Calendar, Clock, Building2, Users, UserPlus, Trash2, Mail, Ban, UserCheck, ChevronLeft, ChevronRight, Save, X, ArrowUpDown, Table as TableIcon, Filter, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import QuizAdminLayout from '@/components/QuizAdminLayout';

import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { getDisplayName } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';
import { ResponsiveTable, type Column } from '@/components/ui/responsive-table';
import { FilterChips, type FilterChipOption } from '@/components/ui/filter-chips';
import { usePlatformMode } from '@/hooks/usePlatformMode';
import { tzFormat } from '@/utils/timezoneRuntime';

export default function UserManagement() {
  const { terminology, isResolved } = useOrganizationTerminology();
  const { toast } = useToast();
  const { onpremMode } = usePlatformMode();
  const { isSuperAdmin: currentUserIsSuperAdmin, isCustSuper: currentUserIsCustSuper, organizationRoles: currentUserOrgRoles } = useAuth();
  const canModifyGlobalRoles = currentUserIsSuperAdmin || (onpremMode && currentUserIsCustSuper);
  const platformTopRoleLabel = onpremMode ? 'CustSuper' : 'SuperAdmin';
  const canAssignCustSuper = onpremMode && currentUserIsCustSuper;
  const DEFAULT_ORG_ID = '08b8b57e-4c4f-4c04-ac0b-c411b6c873a8';
  const PREFERENCES_KEY = 'user-management-preferences-v2';
  const SAVED_VIEWS_KEY = 'user-management-saved-views-v1';
  const isGeneralOrgAdmin = currentUserIsSuperAdmin || (currentUserOrgRoles || []).some((r: any) => r.organizationId === DEFAULT_ORG_ID && r.role === 'org_admin');
  const canReassignUsers = currentUserIsSuperAdmin || isGeneralOrgAdmin;
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [resetPasswordDialog, setResetPasswordDialog] = useState(false);
  const [rolesDialog, setRolesDialog] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [userRoles, setUserRoles] = useState({ isAdmin: false, isSuperAdmin: false, isCustSuper: false });
  const [organizationRoles, setOrganizationRoles] = useState<{[key: string]: string[]}>({});
  const [filterOrganization, setFilterOrganization] = useState<string>('');
  const [filterRole, setFilterRole] = useState<string>('');
  const [assignOrgDialog, setAssignOrgDialog] = useState(false);
  const [assignToOrgId, setAssignToOrgId] = useState<string>('');
  const [assignOrgRoles, setAssignOrgRoles] = useState<string[]>([]);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deletingUser, setDeletingUser] = useState<any>(null);
  const [changeEmailDialog, setChangeEmailDialog] = useState(false);
  const [changeEmailUser, setChangeEmailUser] = useState<any>(null);
  const [newEmail, setNewEmail] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortKey, setSortKey] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [orgTableSearch, setOrgTableSearch] = useState('');
  const [showLockedOnly, setShowLockedOnly] = useState(false);
  const [showDisabledOnly, setShowDisabledOnly] = useState(false);
  const [showNoOrganizationsOnly, setShowNoOrganizationsOnly] = useState(false);
  const [showSuperAdminOnly, setShowSuperAdminOnly] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [bulkAssignOrgId, setBulkAssignOrgId] = useState('');
  const [bulkAssignRoles, setBulkAssignRoles] = useState<string[]>([]);
  const [newViewName, setNewViewName] = useState('');
  const [savedViews, setSavedViews] = useState<Array<{name: string; config: any}>>([]);

  const { data: users = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/users'],
  });

  const { data: organizations = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations'],
  });

  useEffect(() => {
    try {
      const rawPrefs = localStorage.getItem(PREFERENCES_KEY);
      if (rawPrefs) {
        const prefs = JSON.parse(rawPrefs);
        setFilterOrganization(prefs.filterOrganization || '');
        setFilterRole(prefs.filterRole || '');
        setSortKey(prefs.sortKey || 'createdAt');
        setSortDirection(prefs.sortDirection || 'desc');
        setDensity(prefs.density || 'comfortable');
        setPageSize(Number.isFinite(prefs.pageSize) ? prefs.pageSize : 25);
        setShowLockedOnly(Boolean(prefs.showLockedOnly));
        setShowDisabledOnly(Boolean(prefs.showDisabledOnly));
        setShowNoOrganizationsOnly(Boolean(prefs.showNoOrganizationsOnly));
        setShowSuperAdminOnly(Boolean(prefs.showSuperAdminOnly));
      }
    } catch (error) {
      console.warn('[UserManagement] Failed to load preferences:', error);
    }

    try {
      const rawViews = localStorage.getItem(SAVED_VIEWS_KEY);
      if (rawViews) {
        const parsed = JSON.parse(rawViews);
        if (Array.isArray(parsed)) {
          setSavedViews(parsed.filter((view) => view && typeof view.name === 'string' && view.config));
        }
      }
    } catch (error) {
      console.warn('[UserManagement] Failed to load saved views:', error);
    }
  }, []);

  useEffect(() => {
    const prefs = {
      filterOrganization,
      filterRole,
      sortKey,
      sortDirection,
      density,
      pageSize,
      showLockedOnly,
      showDisabledOnly,
      showNoOrganizationsOnly,
      showSuperAdminOnly,
    };
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
  }, [
    filterOrganization,
    filterRole,
    sortKey,
    sortDirection,
    density,
    pageSize,
    showLockedOnly,
    showDisabledOnly,
    showNoOrganizationsOnly,
    showSuperAdminOnly,
  ]);

  useEffect(() => {
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(savedViews));
  }, [savedViews]);

  const lockUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest(`/api/admin/users/${userId}/lock`, {
        method: 'PATCH',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: 'User locked successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to lock user', variant: 'destructive' });
    }
  });

  const unlockUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest(`/api/admin/users/${userId}/unlock`, {
        method: 'PATCH',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: 'User unlocked successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to unlock user', variant: 'destructive' });
    }
  });

  const disableUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest(`/api/admin/users/${userId}/disable`, {
        method: 'PATCH',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: 'User disabled successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to disable user', variant: 'destructive' });
    }
  });

  const enableUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest(`/api/admin/users/${userId}/enable`, {
        method: 'PATCH',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: 'User enabled successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to enable user', variant: 'destructive' });
    }
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
      return await apiRequest(`/api/admin/users/${userId}/reset-password`, {
        method: 'PATCH',
        body: JSON.stringify({ newPassword }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: 'Password reset successfully' });
      setResetPasswordDialog(false);
      setNewPassword('');
      setSelectedUser(null);
    },
    onError: (error: any) => {
      const message = error?.message || error?.error || 'Failed to reset password';
      toast({ 
        title: 'Failed to reset password', 
        description: message,
        variant: 'destructive' 
      });
    }
  });

  const updateRolesMutation = useMutation({
    mutationFn: async ({ userId, roles }: { userId: string; roles: any }) => {
      return await apiRequest(`/api/admin/users/${userId}/roles`, {
        method: 'PATCH',
        body: JSON.stringify(roles),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: 'User roles updated successfully' });
      setRolesDialog(false);
      setSelectedUser(null);
      setOrganizationRoles({});
    },
    onError: () => {
      toast({ title: 'Failed to update user roles', variant: 'destructive' });
    }
  });

  const assignToOrganizationMutation = useMutation({
    mutationFn: async ({ userId, organizationId, roles }: { userId: string; organizationId: string; roles: string[] }) => {
      return await apiRequest(`/api/admin/users/${userId}/roles`, {
        method: 'PATCH',
        body: JSON.stringify({
          organizationRoles: [{ organizationId, roles }],
          reassign: true
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: 'User reassigned to organization successfully' });
      setAssignOrgDialog(false);
      setSelectedUser(null);
      setAssignToOrgId('');
      setAssignOrgRoles([]);
    },
    onError: (error: any) => {
      const message = error?.message || 'Failed to reassign user to organization';
      toast({ title: 'Reassignment failed', description: message, variant: 'destructive' });
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: 'User deleted successfully' });
      setDeleteDialog(false);
      setDeletingUser(null);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to delete user', 
        description: error.message || 'An error occurred while deleting the user',
        variant: 'destructive' 
      });
    }
  });

  const changeEmailMutation = useMutation({
    mutationFn: async ({ userId, newEmail }: { userId: string; newEmail: string }) => {
      return await apiRequest(`/api/admin/users/${userId}/email`, {
        method: 'PUT',
        body: JSON.stringify({ email: newEmail }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: 'Email changed successfully', description: 'A verification email has been sent to the new address.' });
      setChangeEmailDialog(false);
      setNewEmail('');
      setChangeEmailUser(null);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to change email', 
        description: error?.message || 'Email may already be in use',
        variant: 'destructive' 
      });
    }
  });

  const roleFilterOptions: FilterChipOption[] = useMemo(() => {
    if (!terminology) return [];
    return [
      { value: 'org_admin', label: 'Org Admin', icon: Shield },
      { value: 'teacher', label: terminology.educator, icon: Users },
      { value: 'student', label: terminology.learner, icon: Users }
    ];
  }, [terminology]);

  const organizationUserCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const user of users) {
      for (const role of (user.organizationRoles || [])) {
        counts[role.organizationId] = (counts[role.organizationId] || 0) + 1;
      }
    }
    return counts;
  }, [users]);

  const filteredOrganizationsForTable = useMemo(() => {
    const q = orgTableSearch.trim().toLowerCase();
    return organizations
      .filter((org: any) => {
        if (!q) return true;
        return (org.name || '').toLowerCase().includes(q) || (org.type || '').toLowerCase().includes(q);
      })
      .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
  }, [organizations, orgTableSearch]);

  const filteredUsers = useMemo(() => {
    const searchLower = deferredSearchQuery.toLowerCase();
    const base = users.filter((user) => {
      if (!currentUserIsSuperAdmin && user.isSuperAdmin) {
        return false;
      }
      if (!canModifyGlobalRoles && onpremMode && user.isCustSuper) {
        return false;
      }

      if (showLockedOnly && !user.isLocked) return false;
      if (showDisabledOnly && !user.isDisabled) return false;
      if (showSuperAdminOnly && !(onpremMode ? user.isCustSuper : user.isSuperAdmin)) return false;
      if (showNoOrganizationsOnly && (user.organizationRoles?.length || 0) > 0) return false;

      const displayName = getDisplayName(user);
      const matchesSearch = !deferredSearchQuery || (
        displayName.toLowerCase().includes(searchLower) ||
        (user.email || '').toLowerCase().includes(searchLower) ||
        (user.firstName || '').toLowerCase().includes(searchLower) ||
        (user.lastName || '').toLowerCase().includes(searchLower) ||
        (user.gamerName || '').toLowerCase().includes(searchLower)
      );
      if (!matchesSearch) return false;

      if (!filterOrganization && !filterRole) return true;
      if (!user.organizationRoles || user.organizationRoles.length === 0) return false;

      return user.organizationRoles.some((role: any) => {
        const matchesOrg = !filterOrganization || role.organizationId === filterOrganization;
        const matchesRole = !filterRole || role.role === filterRole;
        return matchesOrg && matchesRole;
      });
    });

    const withSort = [...base].sort((a: any, b: any) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'displayName':
          return direction * getDisplayName(a).localeCompare(getDisplayName(b));
        case 'email':
          return direction * (a.email || '').localeCompare(b.email || '');
        case 'lastActiveAt':
          return direction * ((new Date(a.lastActiveAt || 0).getTime()) - (new Date(b.lastActiveAt || 0).getTime()));
        case 'createdAt':
        default:
          return direction * ((new Date(a.createdAt || 0).getTime()) - (new Date(b.createdAt || 0).getTime()));
      }
    });
    return withSort;
  }, [
    users,
    currentUserIsSuperAdmin,
    deferredSearchQuery,
    filterOrganization,
    filterRole,
    sortDirection,
    sortKey,
    showLockedOnly,
    showDisabledOnly,
    showNoOrganizationsOnly,
    showSuperAdminOnly,
    canModifyGlobalRoles,
    onpremMode,
  ]);

  const actorTierByOrg = useMemo(() => {
    const tiers = new Map<string, 'org_admin' | 'instructor' | 'none'>();
    for (const role of (currentUserOrgRoles || [])) {
      const current = tiers.get(role.organizationId) || 'none';
      let next: 'org_admin' | 'instructor' | 'none' = 'none';
      if (role.role === 'org_admin') next = 'org_admin';
      else if (role.role === 'teacher' || role.role === 'team_lead') next = 'instructor';
      const merged = current === 'org_admin' || next === 'org_admin'
        ? 'org_admin'
        : (current === 'instructor' || next === 'instructor' ? 'instructor' : 'none');
      tiers.set(role.organizationId, merged);
    }
    return tiers;
  }, [currentUserOrgRoles]);

  const canManageTargetUser = (user: any): boolean => {
    if (canModifyGlobalRoles) return true;
    if (user.isSuperAdmin || (onpremMode && user.isCustSuper)) return false;
    const targetRoles = user.organizationRoles || [];
    if (targetRoles.some((r: any) => r.role === 'org_admin')) return false;
    return targetRoles.some((r: any) => {
      const actorTier = actorTierByOrg.get(r.organizationId) || 'none';
      if (actorTier === 'org_admin') {
        return ['teacher', 'team_lead', 'student', 'employee', 'learner'].includes(r.role);
      }
      if (actorTier === 'instructor') {
        return ['student', 'employee', 'learner'].includes(r.role);
      }
      return false;
    });
  };

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterOrganization, filterRole, sortKey, sortDirection, pageSize, showLockedOnly, showDisabledOnly, showNoOrganizationsOnly, showSuperAdminOnly]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    const visibleIds = new Set(filteredUsers.map((u: any) => u.id));
    setSelectedUserIds((prev) => prev.filter((id) => visibleIds.has(id)));
  }, [filteredUsers]);

  const handleResetPassword = (user: any) => {
    setSelectedUser(user);
    setNewPassword('');
    setResetPasswordDialog(true);
  };

  const handleEditRoles = (user: any) => {
    setSelectedUser(user);
    setUserRoles({
      isAdmin: user.isAdmin || false,
      isSuperAdmin: user.isSuperAdmin || false,
      isCustSuper: onpremMode ? (user.isCustSuper || false) : false
    });
    
    const orgRolesMap: {[key: string]: string[]} = {};
    if (user.organizationRoles && Array.isArray(user.organizationRoles)) {
      user.organizationRoles.forEach((role: any) => {
        if (!orgRolesMap[role.organizationId]) {
          orgRolesMap[role.organizationId] = [];
        }
        orgRolesMap[role.organizationId].push(role.role);
      });
    }
    setOrganizationRoles(orgRolesMap);
    
    setRolesDialog(true);
  };

  const handleSaveRoles = async () => {
    if (!selectedUser) {
      toast({ title: 'Error', description: 'No user selected', variant: 'destructive' });
      return;
    }
    
    const orgRolesArray = Object.entries(organizationRoles).map(([organizationId, roles]) => ({
      organizationId,
      roles
    }));
    
    // SECURITY: Only SuperAdmins can modify global roles (isAdmin/isSuperAdmin)
    // Strip these fields for non-SuperAdmins to prevent unauthorized role escalation
    const rolesPayload: any = {
      organizationRoles: orgRolesArray
    };
    
    if (canModifyGlobalRoles) {
      rolesPayload.isAdmin = userRoles.isAdmin;
      rolesPayload.isSuperAdmin = userRoles.isSuperAdmin;
      if (canAssignCustSuper) {
        rolesPayload.isCustSuper = userRoles.isCustSuper;
      }
    }
    
    updateRolesMutation.mutate({
      userId: selectedUser.id,
      roles: rolesPayload
    });
  };

  const handleAssignToOrganization = (user: any) => {
    if (!canModifyGlobalRoles) {
      const userOrgIds = user.organizationRoles?.map((r: any) => r.organizationId) || [];
      if (!userOrgIds.includes(DEFAULT_ORG_ID)) {
        toast({ title: 'Cannot reassign', description: 'You can only reassign users who are currently in the General Org', variant: 'destructive' });
        return;
      }
    }
    setSelectedUser(user);
    setAssignToOrgId('');
    setAssignOrgRoles([]);
    setAssignOrgDialog(true);
  };

  const handleAssignOrgRoleToggle = (role: string, checked: boolean) => {
    setAssignOrgRoles(prev => {
      if (checked) {
        return [...prev, role];
      } else {
        return prev.filter(r => r !== role);
      }
    });
  };

  const handleSaveAssignToOrganization = async () => {
    if (!selectedUser) {
      toast({ title: 'Error', description: 'No user selected', variant: 'destructive' });
      return;
    }
    
    if (!assignToOrgId) {
      toast({ title: 'Error', description: 'Please select an organization', variant: 'destructive' });
      return;
    }
    
    if (assignOrgRoles.length === 0) {
      toast({ title: 'Error', description: 'Please select at least one role', variant: 'destructive' });
      return;
    }
    
    assignToOrganizationMutation.mutate({
      userId: selectedUser.id,
      organizationId: assignToOrgId,
      roles: assignOrgRoles
    });
  };

  const getAvailableOrganizations = () => {
    if (!selectedUser) return organizations;
    
    const userOrgIds = selectedUser.organizationRoles?.map((role: any) => role.organizationId) || [];
    return organizations.filter((org: any) => !userOrgIds.includes(org.id));
  };

  const handleChangeEmail = (user: any) => {
    setChangeEmailUser(user);
    setNewEmail(user.email || '');
    setChangeEmailDialog(true);
  };

  const handleSaveEmail = () => {
    if (changeEmailUser && newEmail && newEmail !== changeEmailUser.email) {
      changeEmailMutation.mutate({ userId: changeEmailUser.id, newEmail });
    }
  };

  const clearAllFilters = () => {
    setFilterOrganization('');
    setFilterRole('');
    setSearchQuery('');
    setShowLockedOnly(false);
    setShowDisabledOnly(false);
    setShowNoOrganizationsOnly(false);
    setShowSuperAdminOnly(false);
  };

  const saveCurrentView = () => {
    const trimmedName = newViewName.trim();
    if (!trimmedName) {
      toast({ title: 'Name required', description: 'Enter a name before saving this view.', variant: 'destructive' });
      return;
    }
    const config = {
      searchQuery,
      filterOrganization,
      filterRole,
      showLockedOnly,
      showDisabledOnly,
      showNoOrganizationsOnly,
      showSuperAdminOnly,
      sortKey,
      sortDirection,
      density,
      pageSize,
    };
    setSavedViews((prev) => {
      const withoutDupes = prev.filter((view) => view.name !== trimmedName);
      return [{ name: trimmedName, config }, ...withoutDupes].slice(0, 12);
    });
    setNewViewName('');
    toast({ title: 'View saved', description: `"${trimmedName}" is now available in saved views.` });
  };

  const applySavedView = (name: string) => {
    const view = savedViews.find((item) => item.name === name);
    if (!view?.config) return;
    const config = view.config;
    setSearchQuery(config.searchQuery || '');
    setFilterOrganization(config.filterOrganization || '');
    setFilterRole(config.filterRole || '');
    setShowLockedOnly(Boolean(config.showLockedOnly));
    setShowDisabledOnly(Boolean(config.showDisabledOnly));
    setShowNoOrganizationsOnly(Boolean(config.showNoOrganizationsOnly));
    setShowSuperAdminOnly(Boolean(config.showSuperAdminOnly));
    setSortKey(config.sortKey || 'createdAt');
    setSortDirection(config.sortDirection || 'desc');
    setDensity(config.density || 'comfortable');
    setPageSize(Number.isFinite(config.pageSize) ? config.pageSize : 25);
  };

  const toggleUserSelection = (userId: string, checked: boolean) => {
    setSelectedUserIds((prev) => checked ? [...prev, userId] : prev.filter((id) => id !== userId));
  };

  const selectCurrentPage = () => {
    setSelectedUserIds((prev) => Array.from(new Set([...prev, ...paginatedUsers.map((u: any) => u.id)])));
  };

  const clearSelection = () => {
    setSelectedUserIds([]);
    setBulkAssignOrgId('');
    setBulkAssignRoles([]);
  };

  const runBulkPatch = async (label: string, buildRequest: (user: any) => { url: string; method: 'PATCH' | 'PUT' | 'DELETE'; body?: any } | null) => {
    const selectedUsers = users.filter((u: any) => selectedUserIds.includes(u.id));
    if (selectedUsers.length === 0) {
      toast({ title: 'No users selected', variant: 'destructive' });
      return;
    }

    const tasks = selectedUsers
      .map((user: any) => ({ user, req: buildRequest(user) }))
      .filter((item) => item.req !== null) as Array<{ user: any; req: { url: string; method: 'PATCH' | 'PUT' | 'DELETE'; body?: any } }>;

    if (tasks.length === 0) {
      toast({ title: 'No applicable users', description: `No selected users require "${label.toLowerCase()}".` });
      return;
    }

    const results = await Promise.allSettled(
      tasks.map(({ req }) => apiRequest(req.url, {
        method: req.method,
        body: req.body ? JSON.stringify(req.body) : undefined,
      }))
    );
    const successCount = results.filter((r) => r.status === 'fulfilled').length;
    const failureCount = results.length - successCount;

    queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    toast({
      title: `${label} completed`,
      description: `${successCount} succeeded${failureCount ? `, ${failureCount} failed` : ''}.`,
      variant: failureCount ? 'destructive' : 'default',
    });
  };

  const exportSelectedUsers = () => {
    const selectedUsers = users.filter((u: any) => selectedUserIds.includes(u.id));
    if (selectedUsers.length === 0) {
      toast({ title: 'No users selected', variant: 'destructive' });
      return;
    }
    const headers = ['id', 'displayName', 'email', 'isLocked', 'isDisabled', 'isSuperAdmin', 'organizations'];
    const rows = selectedUsers.map((u: any) => ([
      u.id,
      getDisplayName(u),
      u.email || '',
      u.isLocked ? 'yes' : 'no',
      u.isDisabled ? 'yes' : 'no',
      u.isSuperAdmin ? 'yes' : 'no',
      (u.organizationRoles || []).map((r: any) => `${r.organizationName}:${r.role}`).join(' | ')
    ]));
    const csv = [headers, ...rows]
      .map((row) => row.map((value: any) => `"${String(value).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `user-management-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const userTableColumns: Column<any>[] = useMemo(() => [
    {
      key: 'selected',
      header: 'Select',
      mobileLabel: 'Select',
      render: (user: any) => (
        <Checkbox
          checked={selectedUserIds.includes(user.id)}
          onCheckedChange={(checked) => toggleUserSelection(user.id, checked === true)}
          data-testid={`checkbox-select-user-${user.id}`}
        />
      )
    },
    {
      key: 'displayName',
      header: 'User',
      mobileLabel: 'User',
      sortable: true,
      render: (user: any) => (
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-foreground" data-testid={`text-username-${user.id}`}>
              {getDisplayName(user)}
            </span>
            {user.isLocked && (
              <Badge variant="destructive" className="flex items-center gap-1" data-testid={`badge-locked-${user.id}`}>
                <Lock className="w-3 h-3" />
                Locked
              </Badge>
            )}
            {user.isDisabled && (
              <Badge variant="destructive" className="flex items-center gap-1" data-testid={`badge-disabled-${user.id}`}>
                <Ban className="w-3 h-3" />
                Disabled
              </Badge>
            )}
            {user.isSuperAdmin && (
              <Badge variant="default" className="flex items-center gap-1" data-testid={`badge-superadmin-${user.id}`}>
                <Shield className="w-3 h-3" />
                SuperAdmin
              </Badge>
            )}
            {onpremMode && user.isCustSuper && (
              <Badge data-testid={`badge-custsuper-${user.id}`}>
                CustSuper
              </Badge>
            )}
            {user.isAdmin && !user.isSuperAdmin && (
              <Badge variant="default" className="flex items-center gap-1" data-testid={`badge-admin-${user.id}`}>
                <Shield className="w-3 h-3" />
                Admin
              </Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground" data-testid={`text-email-${user.id}`}>
            {user.email}
          </div>
          {user.firstName && user.lastName && (
            <div className="text-sm text-muted-foreground" data-testid={`text-fullname-${user.id}`}>
              {user.firstName} {user.lastName}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'organizationRoles',
      header: 'Organizations & Roles',
      mobileLabel: 'Orgs & Roles',
      render: (user: any) => (
        <div className="flex flex-wrap gap-1">
          {user.organizationRoles && user.organizationRoles.map((orgRole: any, index: number) => (
            <div key={`${orgRole.organizationId}-${orgRole.role}-${index}`} className="flex items-center gap-1">
              <Badge variant="outline" className="flex items-center gap-1" data-testid={`badge-org-${user.id}-${index}`}>
                <Building2 className="w-3 h-3" />
                {orgRole.organizationName}
              </Badge>
              {onpremMode && user.isCustSuper ? (
                <Badge data-testid={`badge-role-${user.id}-${index}`}>
                  CustSuper
                </Badge>
              ) : user.isSuperAdmin ? (
                <Badge variant="default" data-testid={`badge-role-${user.id}-${index}`}>
                  SuperAdmin
                </Badge>
              ) : (
                <Badge variant="outline" data-testid={`badge-role-${user.id}-${index}`}>
                  {orgRole.role === 'org_admin' ? 'Org Admin' : 
                   orgRole.role === 'teacher' ? terminology?.educator : 
                   orgRole.role === 'student' ? terminology?.learner : 
                   orgRole.role}
                </Badge>
              )}
            </div>
          ))}
          {(!user.organizationRoles || user.organizationRoles.length === 0) && (
            <span className="text-sm text-muted-foreground">No organizations</span>
          )}
        </div>
      )
    },
    {
      key: 'activity',
      header: 'Activity',
      mobileLabel: 'Activity',
      sortable: true,
      render: (user: any) => (
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-4 h-4 shrink-0" />
            <span>Joined: {user.createdAt ? tzFormat(user.createdAt, 'MMM d, yyyy') : 'N/A'}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-4 h-4 shrink-0" />
            <span>Last: {user.lastActiveAt ? tzFormat(user.lastActiveAt, 'MMM d, yyyy') : 'Never'}</span>
          </div>
        </div>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      mobileLabel: 'Actions',
      render: (user: any) => (
        <div className="flex flex-wrap gap-2">
          {!canManageTargetUser(user) ? (
            <span className="text-xs text-muted-foreground">no actions available</span>
          ) : (
            <>
          {user.isLocked ? (
            <Button size="sm" variant="outline" onClick={() => unlockUserMutation.mutate(user.id)}
              disabled={unlockUserMutation.isPending}
              className="min-h-[44px] min-w-[44px] border-[var(--success)] text-success hover:bg-success/20"
              data-testid={`button-unlock-${user.id}`}
            >
              <Unlock className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Unlock</span>
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => lockUserMutation.mutate(user.id)}
              disabled={lockUserMutation.isPending}
              className="min-h-[44px] min-w-[44px] border-[var(--destructive)] text-destructive hover:bg-destructive/20"
              data-testid={`button-lock-${user.id}`}
            >
              <Lock className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Lock</span>
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => handleResetPassword(user)}
            className="min-h-[44px] min-w-[44px] border-[var(--warning)] text-warning hover:bg-warning/20"
            data-testid={`button-reset-password-${user.id}`}
          >
            <KeyRound className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Reset</span>
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleEditRoles(user)}
            className="min-h-[44px] min-w-[44px] border-secondary text-secondary hover:bg-secondary/20"
            data-testid={`button-edit-roles-${user.id}`}
          >
            <Shield className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Roles</span>
          </Button>
          {canReassignUsers && (
            <Button size="sm" variant="outline" onClick={() => handleAssignToOrganization(user)}
              className="min-h-[44px] min-w-[44px] border-primary text-primary hover:bg-primary/20"
              data-testid={`button-assign-org-${user.id}`}
            >
              <UserPlus className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Reassign</span>
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => handleChangeEmail(user)}
            className="min-h-[44px] min-w-[44px] border-[var(--info)] text-[var(--info)] hover:bg-[var(--info)]/20"
            data-testid={`button-change-email-${user.id}`}
          >
            <Mail className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Email</span>
          </Button>
          <Button size="sm" variant="outline" onClick={() => {
              setDeletingUser(user);
              setDeleteDialog(true);
            }}
            className="min-h-[44px] min-w-[44px] border-[var(--destructive)] text-destructive hover:bg-destructive/20"
            data-testid={`button-delete-${user.id}`}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Delete</span>
          </Button>
          {user.isDisabled ? (
            <Button size="sm" variant="outline" onClick={() => enableUserMutation.mutate(user.id)}
              disabled={enableUserMutation.isPending}
              className="min-h-[44px] min-w-[44px] border-[var(--success)] text-success hover:bg-success/20"
              data-testid={`button-enable-${user.id}`}
            >
              <UserCheck className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Enable</span>
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => disableUserMutation.mutate(user.id)}
              disabled={disableUserMutation.isPending}
              className="min-h-[44px] min-w-[44px] border-[var(--text-muted)] text-muted-foreground hover:bg-[var(--surface-muted)]/50"
              data-testid={`button-disable-${user.id}`}
            >
              <Ban className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Disable</span>
            </Button>
          )}
            </>
          )}
        </div>
      )
    }
  ], [terminology, onpremMode, selectedUserIds, unlockUserMutation, lockUserMutation, disableUserMutation, enableUserMutation, canModifyGlobalRoles, actorTierByOrg]);

  if (!isResolved || !terminology) {
    return (
      <QuizAdminLayout title="User Management" description="Loading..." activeSection="users">
        <div className="flex items-center justify-center h-64">
          <div className="text-foreground">Loading organization settings...</div>
        </div>
      </QuizAdminLayout>
    );
  }

  return (
    <QuizAdminLayout title="User Management" activeSection="users">
      <div className="space-y-[var(--space-lg)]" style={{ padding: 'var(--container-padding)' }}>
        <div className="space-y-[var(--space-md)]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[var(--space-md)]">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
              <h2 className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)] font-bold text-foreground">User Management</h2>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by name, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 min-h-[44px] bg-muted border-border text-foreground"
                data-testid="input-user-search"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Card className="bg-card border-border xl:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TableIcon className="w-4 h-4" />
                  Organization Filter Table
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={orgTableSearch}
                    onChange={(e) => setOrgTableSearch(e.target.value)}
                    placeholder="Search organizations..."
                    className="pl-9 min-h-[40px]"
                    data-testid="input-org-table-search"
                  />
                </div>
                <div className="border border-border rounded-md overflow-hidden">
                  <div className="max-h-64 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/70 backdrop-blur-sm">
                        <tr className="text-left text-muted-foreground">
                          <th className="px-3 py-2">Organization</th>
                          <th className="px-3 py-2">Users</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          className={`cursor-pointer border-t border-border ${filterOrganization === '' ? 'bg-primary/10' : 'hover:bg-muted/50'}`}
                          onClick={() => setFilterOrganization('')}
                          data-testid="row-org-filter-all"
                        >
                          <td className="px-3 py-2">{canModifyGlobalRoles ? 'All Organizations' : 'My Organizations'}</td>
                          <td className="px-3 py-2">{users.length}</td>
                        </tr>
                        {filteredOrganizationsForTable.map((org: any) => (
                          <tr
                            key={org.id}
                            className={`cursor-pointer border-t border-border ${filterOrganization === org.id ? 'bg-primary/10' : 'hover:bg-muted/50'}`}
                            onClick={() => setFilterOrganization(org.id)}
                            data-testid={`row-org-filter-${org.id}`}
                          >
                            <td className="px-3 py-2">
                              <div className="font-medium">{org.name}</div>
                              <div className="text-xs text-muted-foreground">{org.type || 'organization'}</div>
                            </td>
                            <td className="px-3 py-2">{organizationUserCounts[org.id] || 0}</td>
                          </tr>
                        ))}
                        {filteredOrganizationsForTable.length === 0 && (
                          <tr>
                            <td colSpan={2} className="px-3 py-4 text-center text-muted-foreground">No organizations match your search.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border xl:col-span-2">
              <CardContent className="p-[var(--card-padding)] space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Filter by Role</Label>
                  <FilterChips
                    options={roleFilterOptions}
                    selected={filterRole}
                    onChange={(value) => setFilterRole(value as string)}
                    showAll
                    allLabel="All Roles"
                    data-testid="filter-chips-role"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant={showLockedOnly ? 'default' : 'outline'} size="sm" onClick={() => setShowLockedOnly((v) => !v)} data-testid="button-filter-locked">
                    <Filter className="w-3 h-3 mr-1" /> Locked
                  </Button>
                  <Button variant={showDisabledOnly ? 'default' : 'outline'} size="sm" onClick={() => setShowDisabledOnly((v) => !v)} data-testid="button-filter-disabled">
                    <Filter className="w-3 h-3 mr-1" /> Disabled
                  </Button>
                  <Button variant={showNoOrganizationsOnly ? 'default' : 'outline'} size="sm" onClick={() => setShowNoOrganizationsOnly((v) => !v)} data-testid="button-filter-no-org">
                    <Filter className="w-3 h-3 mr-1" /> No Organization
                  </Button>
                  <Button variant={showSuperAdminOnly ? 'default' : 'outline'} size="sm" onClick={() => setShowSuperAdminOnly((v) => !v)} data-testid="button-filter-superadmin">
                    <Filter className="w-3 h-3 mr-1" /> {platformTopRoleLabel}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearAllFilters} data-testid="button-clear-filters">
                    <X className="w-3 h-3 mr-1" /> Clear Filters
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Sort</Label>
                    <Select value={sortKey} onValueChange={setSortKey}>
                      <SelectTrigger data-testid="select-user-sort-key">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="createdAt">Joined Date</SelectItem>
                        <SelectItem value="lastActiveAt">Last Active</SelectItem>
                        <SelectItem value="displayName">Display Name</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Direction</Label>
                    <Select value={sortDirection} onValueChange={(v: 'asc' | 'desc') => setSortDirection(v)}>
                      <SelectTrigger data-testid="select-user-sort-direction">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="desc">Descending</SelectItem>
                        <SelectItem value="asc">Ascending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Density</Label>
                    <Select value={density} onValueChange={(v: 'comfortable' | 'compact') => setDensity(v)}>
                      <SelectTrigger data-testid="select-user-density">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="comfortable">Comfortable</SelectItem>
                        <SelectItem value="compact">Compact</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Rows per page</Label>
                    <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                      <SelectTrigger data-testid="select-user-page-size">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2 flex items-center gap-2">
                    <Input
                      value={newViewName}
                      onChange={(e) => setNewViewName(e.target.value)}
                      placeholder="Save current view name"
                      data-testid="input-save-view-name"
                    />
                    <Button onClick={saveCurrentView} variant="outline" data-testid="button-save-current-view">
                      <Save className="w-4 h-4 mr-1" /> Save View
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Saved Views</Label>
                    <Select value="" onValueChange={applySavedView}>
                      <SelectTrigger data-testid="select-saved-view">
                        <SelectValue placeholder="Apply saved view" />
                      </SelectTrigger>
                      <SelectContent>
                        {savedViews.length === 0 && <SelectItem value="__none" disabled>No saved views</SelectItem>}
                        {savedViews.map((view) => (
                          <SelectItem key={view.name} value={view.name}>{view.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="bg-card border-border">
          <CardContent className="p-[var(--card-padding)]">
            {selectedUserIds.length > 0 && (
              <div className="mb-4 p-3 rounded-md border border-border bg-muted/40 space-y-3" data-testid="bulk-actions-bar">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{selectedUserIds.length} selected</Badge>
                  <Button size="sm" variant="outline" onClick={clearSelection} data-testid="button-bulk-clear-selection">Clear selection</Button>
                  <Button size="sm" variant="outline" onClick={() => runBulkPatch('Lock', (u) => u.isLocked ? null : ({ url: `/api/admin/users/${u.id}/lock`, method: 'PATCH' }))} data-testid="button-bulk-lock">Lock</Button>
                  <Button size="sm" variant="outline" onClick={() => runBulkPatch('Unlock', (u) => !u.isLocked ? null : ({ url: `/api/admin/users/${u.id}/unlock`, method: 'PATCH' }))} data-testid="button-bulk-unlock">Unlock</Button>
                  <Button size="sm" variant="outline" onClick={() => runBulkPatch('Disable', (u) => u.isDisabled ? null : ({ url: `/api/admin/users/${u.id}/disable`, method: 'PATCH' }))} data-testid="button-bulk-disable">Disable</Button>
                  <Button size="sm" variant="outline" onClick={() => runBulkPatch('Enable', (u) => !u.isDisabled ? null : ({ url: `/api/admin/users/${u.id}/enable`, method: 'PATCH' }))} data-testid="button-bulk-enable">Enable</Button>
                  <Button size="sm" variant="outline" onClick={exportSelectedUsers} data-testid="button-bulk-export">
                    <Download className="w-3 h-3 mr-1" /> Export selected
                  </Button>
                </div>
                {canReassignUsers && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <Select value={bulkAssignOrgId} onValueChange={setBulkAssignOrgId}>
                      <SelectTrigger data-testid="select-bulk-assign-org">
                        <SelectValue placeholder="Bulk reassign target organization" />
                      </SelectTrigger>
                      <SelectContent>
                        {organizations.map((org: any) => (
                          <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={bulkAssignRoles[0] || ''} onValueChange={(value) => setBulkAssignRoles([value])}>
                      <SelectTrigger data-testid="select-bulk-assign-role">
                        <SelectValue placeholder="Role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="org_admin">Org Admin</SelectItem>
                        <SelectItem value="teacher">{terminology.educator}</SelectItem>
                        <SelectItem value="student">{terminology.learner}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" disabled={!bulkAssignOrgId || bulkAssignRoles.length === 0} onClick={() => runBulkPatch('Bulk Reassign', (u) => {
                        if (!canModifyGlobalRoles) {
                          const userOrgIds = u.organizationRoles?.map((r: any) => r.organizationId) || [];
                          if (!userOrgIds.includes(DEFAULT_ORG_ID)) {
                            return null;
                          }
                        }
                        return {
                          url: `/api/admin/users/${u.id}/roles`,
                          method: 'PATCH',
                          body: { organizationRoles: [{ organizationId: bulkAssignOrgId, roles: bulkAssignRoles }], reassign: true }
                        };
                      })}
                      data-testid="button-bulk-reassign"
                    >
                      <ArrowUpDown className="w-3 h-3 mr-1" />
                      Reassign selected
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="mb-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={selectCurrentPage} data-testid="button-select-current-page">
                Select current page
              </Button>
              <Button variant="outline" size="sm" onClick={clearSelection} data-testid="button-clear-current-selection">
                Clear selected
              </Button>
            </div>
            <ResponsiveTable
              data={paginatedUsers}
              columns={userTableColumns}
              keyExtractor={(user) => user.id}
              isLoading={isLoading}
              emptyMessage="No users found matching your search."
              onSort={(key, direction) => {
                setSortKey(key);
                setSortDirection(direction);
              }}
              sortKey={sortKey}
              sortDirection={sortDirection}
              className={density === 'compact' ? '[&_td]:py-1 [&_th]:py-1 text-sm' : ''}
            />

            {!isLoading && filteredUsers.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filteredUsers.length)} of {filteredUsers.length} users
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="min-h-[40px]"
                    data-testid="button-users-prev-page"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <span className="text-sm text-foreground px-2" data-testid="text-users-page-indicator">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="min-h-[40px]"
                    data-testid="button-users-next-page"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {(resetPasswordDialog || rolesDialog || assignOrgDialog || changeEmailDialog || deleteDialog) && (
        <Card className="bg-card border-border">
          <CardContent className="p-[var(--card-padding)] space-y-4">
            {resetPasswordDialog && (
              <div className="space-y-3 border border-border rounded-md p-4" data-testid="panel-reset-password">
                <h3 className="font-semibold">Reset Password</h3>
                <p className="text-sm text-muted-foreground">User: {selectedUser ? getDisplayName(selectedUser) : 'N/A'}</p>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 6 characters)"
                  data-testid="input-new-password"
                />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => {
                      if (!selectedUser) return;
                      if (newPassword.length < 6) {
                        toast({ title: 'Error', description: 'Password must be at least 6 characters', variant: 'destructive' });
                        return;
                      }
                      resetPasswordMutation.mutate({ userId: selectedUser.id, newPassword });
                    }}
                    disabled={resetPasswordMutation.isPending}
                    data-testid="button-confirm-reset"
                  >
                    Reset Password
                  </Button>
                  <Button variant="outline" onClick={() => setResetPasswordDialog(false)} data-testid="button-cancel-reset">Cancel</Button>
                </div>
              </div>
            )}

            {rolesDialog && (
              <div className="space-y-4 border border-border rounded-md p-4" data-testid="panel-edit-roles">
                <h3 className="font-semibold">Edit User Roles</h3>
                <p className="text-sm text-muted-foreground">User: {selectedUser ? getDisplayName(selectedUser) : 'N/A'}</p>
                {canModifyGlobalRoles && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Global Roles</Label>
                    {currentUserIsSuperAdmin && (
                      <div className="flex items-center gap-2">
                        <Checkbox checked={userRoles.isSuperAdmin} onCheckedChange={(checked) => setUserRoles({ ...userRoles, isSuperAdmin: checked === true })} />
                        <Label>SuperAdmin</Label>
                      </div>
                    )}
                    {canAssignCustSuper && (
                      <div className="flex items-center gap-2">
                        <Checkbox checked={userRoles.isCustSuper} onCheckedChange={(checked) => setUserRoles({ ...userRoles, isCustSuper: checked === true })} />
                        <Label>Platform Admin (CustSuper)</Label>
                      </div>
                    )}
                  </div>
                )}
                {organizations.length > 0 && selectedUser && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {organizations
                      .filter((org: any) => selectedUser.organizationRoles?.some((role: any) => role.organizationId === org.id))
                      .map((org: any) => (
                        <div key={org.id} className="p-3 rounded-md border border-border bg-muted/40">
                          <Label className="font-semibold">{org.name}</Label>
                          <RadioGroup
                            value={organizationRoles[org.id]?.[0] || ''}
                            onValueChange={(value) => setOrganizationRoles(prev => ({ ...prev, [org.id]: [value] }))}
                            className="mt-2 space-y-2"
                          >
                            <div className="flex items-center gap-2"><RadioGroupItem value="org_admin" id={`org_admin_${org.id}`} /><Label htmlFor={`org_admin_${org.id}`}>Org Admin</Label></div>
                            <div className="flex items-center gap-2"><RadioGroupItem value="teacher" id={`teacher_${org.id}`} /><Label htmlFor={`teacher_${org.id}`}>{terminology.educator}</Label></div>
                            <div className="flex items-center gap-2"><RadioGroupItem value="student" id={`student_${org.id}`} /><Label htmlFor={`student_${org.id}`}>{terminology.learner}</Label></div>
                          </RadioGroup>
                        </div>
                      ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button onClick={handleSaveRoles} disabled={updateRolesMutation.isPending} data-testid="button-save-roles">Save Roles</Button>
                  <Button variant="outline" onClick={() => setRolesDialog(false)} data-testid="button-cancel-roles">Cancel</Button>
                </div>
              </div>
            )}

            {assignOrgDialog && (
              <div className="space-y-3 border border-border rounded-md p-4" data-testid="panel-assign-org">
                <h3 className="font-semibold">Reassign User to Organization</h3>
                <p className="text-sm text-muted-foreground">User: {selectedUser ? getDisplayName(selectedUser) : 'N/A'}</p>
                <Select value={assignToOrgId} onValueChange={setAssignToOrgId}>
                  <SelectTrigger data-testid="select-assign-organization">
                    <SelectValue placeholder="Choose an organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableOrganizations().map((org: any) => (
                      <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {assignToOrgId && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2"><Checkbox checked={assignOrgRoles.includes('org_admin')} onCheckedChange={(checked) => handleAssignOrgRoleToggle('org_admin', checked === true)} /><Label>Org Admin</Label></div>
                    <div className="flex items-center gap-2"><Checkbox checked={assignOrgRoles.includes('teacher')} onCheckedChange={(checked) => handleAssignOrgRoleToggle('teacher', checked === true)} /><Label>{terminology.educator}</Label></div>
                    <div className="flex items-center gap-2"><Checkbox checked={assignOrgRoles.includes('student')} onCheckedChange={(checked) => handleAssignOrgRoleToggle('student', checked === true)} /><Label>{terminology.learner}</Label></div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button onClick={handleSaveAssignToOrganization} disabled={assignToOrganizationMutation.isPending || !assignToOrgId || assignOrgRoles.length === 0} data-testid="button-save-assign">Reassign User</Button>
                  <Button variant="outline" onClick={() => setAssignOrgDialog(false)} data-testid="button-cancel-assign">Cancel</Button>
                </div>
              </div>
            )}

            {changeEmailDialog && (
              <div className="space-y-3 border border-border rounded-md p-4" data-testid="panel-change-email">
                <h3 className="font-semibold">Change Email Address</h3>
                <p className="text-sm text-muted-foreground">User: {changeEmailUser ? getDisplayName(changeEmailUser) : 'N/A'}</p>
                <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Enter new email address" data-testid="input-new-email" />
                <div className="flex gap-2">
                  <Button onClick={handleSaveEmail} disabled={changeEmailMutation.isPending || !newEmail || newEmail === changeEmailUser?.email} data-testid="button-save-email">{changeEmailMutation.isPending ? 'Changing...' : 'Change Email'}</Button>
                  <Button variant="outline" onClick={() => setChangeEmailDialog(false)} data-testid="button-cancel-email">Cancel</Button>
                </div>
              </div>
            )}

            {deleteDialog && (
              <div className="space-y-3 border border-destructive/40 rounded-md p-4 bg-destructive/5" data-testid="panel-delete-user">
                <h3 className="font-semibold text-destructive">Delete User</h3>
                <p className="text-sm text-muted-foreground">
                  Delete <span className="font-semibold text-foreground">{deletingUser ? getDisplayName(deletingUser) : 'this user'}</span> permanently? This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <Button variant="destructive" onClick={() => deletingUser && deleteUserMutation.mutate(deletingUser.id)} disabled={deleteUserMutation.isPending} data-testid="button-confirm-delete">
                    {deleteUserMutation.isPending ? 'Deleting...' : 'Delete User'}
                  </Button>
                  <Button variant="outline" onClick={() => setDeleteDialog(false)} data-testid="button-cancel-delete">Cancel</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </QuizAdminLayout>
  );
}
