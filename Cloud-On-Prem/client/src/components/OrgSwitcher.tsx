import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest, invalidateOrgContextCaches } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Building2,
  ChevronDown,
  Check,
  Search,
  GraduationCap,
  Briefcase,
  ShoppingBag,
  Loader2,
  Shield,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Organization {
  id: string;
  name: string;
  type: 'education' | 'business' | 'elearning';
  subscriptionStatus?: string;
  trialEndDate?: string | null;
}

interface UserRolesResponse {
  organizations?: Organization[];
  defaultOrganizationId?: string;
}

export function OrgSwitcher() {
  const { isSuperAdmin, isCustSuper, isImpersonating, impersonatedOrganization } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const isAdminWithImpersonation = isSuperAdmin || isCustSuper;

  const { data: allOrganizations, isLoading: allOrgsLoading } = useQuery<Organization[]>({
    queryKey: ['/api/admin/organizations'],
    enabled: isAdminWithImpersonation && open,
  });

  const { data: userRoles, isLoading: userRolesLoading } = useQuery<UserRolesResponse>({
    queryKey: ['/api/user/roles'],
    enabled: !isAdminWithImpersonation && open,
  });

  const organizations = isAdminWithImpersonation
    ? allOrganizations || []
    : userRoles?.organizations || [];

  const isLoading = isAdminWithImpersonation ? allOrgsLoading : userRolesLoading;

  const filteredOrganizations = organizations.filter((org) =>
    org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    org.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const switchOrgMutation = useMutation({
    mutationFn: async (orgId: string) => {
      if (isAdminWithImpersonation) {
        return await apiRequest('/api/superadmin/impersonation', {
          method: 'POST',
          body: JSON.stringify({ organizationId: orgId }),
        });
      } else {
        return await apiRequest('/api/user/switch-organization', {
          method: 'POST',
          body: JSON.stringify({ organizationId: orgId }),
        });
      }
    },
    onSuccess: async (data: any) => {
      toast({
        title: isAdminWithImpersonation ? 'Organization Selected' : 'Organization Switched',
        description: data.message || 'Successfully switched organization',
      });
      
      // Refresh server-side session context and invalidate all org-scoped caches
      try {
        await apiRequest('/api/auth/refresh-context', { method: 'POST' });
      } catch (error) {
        console.warn('[OrgSwitcher] Failed to refresh context:', error);
      }
      
      // Invalidate all org-scoped client-side caches
      invalidateOrgContextCaches();
      
      setOpen(false);
      setSearchQuery('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to switch organization',
        variant: 'destructive',
      });
    },
  });

  const exitImpersonationMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/superadmin/impersonation', {
        method: 'DELETE',
      });
    },
    onSuccess: async () => {
      toast({
        title: 'Exited Impersonation',
        description: 'You are no longer acting as an organization admin.',
      });
      
      try {
        await apiRequest('/api/auth/refresh-context', { method: 'POST' });
      } catch (error) {
        console.warn('[OrgSwitcher] Failed to refresh context:', error);
      }
      
      invalidateOrgContextCaches();
      
      setOpen(false);
      setSearchQuery('');
    },
    onError: (error: any) => {
      console.error('Exit impersonation error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to exit impersonation',
        variant: 'destructive',
      });
    },
  });

  const getOrgIcon = (type: string) => {
    switch (type) {
      case 'education':
        return <GraduationCap className="w-4 h-4" />;
      case 'business':
        return <Briefcase className="w-4 h-4" />;
      case 'elearning':
        return <ShoppingBag className="w-4 h-4" />;
      default:
        return <Building2 className="w-4 h-4" />;
    }
  };

  const getOrgBadgeColor = (type: string) => {
    switch (type) {
      case 'education':
        return 'bg-secondary/20 text-secondary border-secondary/30';
      case 'business':
        return 'bg-primary/20 text-primary border-border';
      case 'elearning':
        return 'bg-accent/20 text-accent border-accent/30';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const currentOrg = isImpersonating && impersonatedOrganization
    ? impersonatedOrganization
    : organizations.find((org) => org.id === userRoles?.defaultOrganizationId) || organizations[0];

  const displayOrg = currentOrg as { id: string; name: string; type: string } | undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className={cn( 'w-auto justify-between gap-2 bg-card border-border text-foreground hover:bg-muted hover:text-foreground', isImpersonating && 'border-destructive/30 bg-destructive/10' )} data-testid="org-switcher-trigger" >
          {displayOrg ? (
            <>
              <div className="flex items-center gap-2">
                {getOrgIcon(displayOrg.type)}
                <span className="max-w-[150px] truncate">{displayOrg.name}</span>
              </div>
              {isImpersonating && isAdminWithImpersonation && (
                <Badge variant="outline" className="ml-1 px-1">
                  Acting as
                </Badge>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">Select organization</span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0 bg-card border-border" align="start">
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search organizations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-muted border-border text-foreground placeholder:text-muted-foreground"
              data-testid="org-switcher-search"
            />
          </div>
          {isAdminWithImpersonation && (
            <div className="flex items-center gap-2 mt-2 px-1">
              <Shield className="w-3 h-3 text-accent" />
              <span className="text-xs text-accent">Admin: Showing all organizations</span>
            </div>
          )}
        </div>
        {isImpersonating && isAdminWithImpersonation && (
          <div className="p-2 border-b border-border">
            <Button variant="destructive" size="sm" onClick={() => exitImpersonationMutation.mutate()}
              disabled={exitImpersonationMutation.isPending}
              className="w-full gap-2"
              data-testid="stop-impersonation-btn"
            >
              {exitImpersonationMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
              {exitImpersonationMutation.isPending ? 'Exiting...' : 'Stop Impersonation'}
            </Button>
          </div>
        )}
        <ScrollArea className="h-[280px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : filteredOrganizations.length === 0 ? (
            <div className="py-8 text-center">
              <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">
                {searchQuery ? 'No organizations match your search' : 'No organizations found'}
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredOrganizations.map((org) => {
                const isSelected = displayOrg?.id === org.id;
                return (
                  <button
                    key={org.id}
                    onClick={() => switchOrgMutation.mutate(org.id)}
                    disabled={switchOrgMutation.isPending}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left',
                      isSelected
                        ? 'bg-primary/20 border border-border'
                        : 'hover:bg-muted border border-transparent'
                    )}
                    data-testid={`org-option-${org.id}`}
                  >
                    <div className={cn(
                      'p-2 rounded-lg',
                      isSelected ? 'bg-primary/30 text-primary' : 'bg-muted text-muted-foreground'
                    )}>
                      {getOrgIcon(org.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'font-medium text-sm truncate',
                          isSelected ? 'text-foreground' : 'text-muted-foreground'
                        )}>
                          {org.name}
                        </span>
                        {isSelected && (
                          <Check className="w-4 h-4 text-primary shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge className={`text-[10px] px-1.5 py-0 ${getOrgBadgeColor(org.type)}`}>
                          {org.type.charAt(0).toUpperCase() + org.type.slice(1)}
                        </Badge>
                        {org.subscriptionStatus && (
                          <span className="text-[10px] text-muted-foreground">
                            {org.subscriptionStatus}
                          </span>
                        )}
                      </div>
                    </div>
                    {switchOrgMutation.isPending && switchOrgMutation.variables === org.id && (
                      <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export default OrgSwitcher;
