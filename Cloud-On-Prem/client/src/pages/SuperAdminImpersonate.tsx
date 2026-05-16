import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { 
  Building2, 
  Search, 
  Shield, 
  ArrowRight,
  Briefcase,
  GraduationCap,
  ShoppingBag,
  Loader2
} from 'lucide-react';

interface Organization {
  id: string;
  name: string;
  type: 'education' | 'business' | 'elearning';
  subscriptionStatus?: string;
  trialEndDate?: string | null;
}

export default function SuperAdminImpersonate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isSuperAdmin, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: organizations, isLoading: orgsLoading } = useQuery<Organization[]>({
    queryKey: ['/api/superadmin/organizations'],
    enabled: isSuperAdmin,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const setImpersonationMutation = useMutation({
    mutationFn: async (organizationId: string) => {
      return await apiRequest('/api/superadmin/impersonation', { 
        method: 'POST', 
        body: JSON.stringify({ organizationId }) 
      });
    },
    onSuccess: async (data) => {
      toast({
        title: 'Organization Selected',
        description: data.message,
      });
      await queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/admin/check'] });
      await queryClient.refetchQueries({ queryKey: ['/api/auth/user'], type: 'all' });
      await queryClient.refetchQueries({ queryKey: ['/api/admin/check'], type: 'all' });
      setLocation('/super-admin');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to set organization',
        variant: 'destructive',
      });
    },
  });

  const filteredOrgs = organizations?.filter(org => 
    org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    org.type.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const getOrgIcon = (type: string) => {
    switch (type) {
      case 'education':
        return <GraduationCap className="w-5 h-5" />;
      case 'business':
        return <Briefcase className="w-5 h-5" />;
      case 'elearning':
        return <ShoppingBag className="w-5 h-5" />;
      default:
        return <Building2 className="w-5 h-5" />;
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

  if (authLoading) {
    return (
      <QuizAdminLayout title="Act as Organization" activeSection="impersonate">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </QuizAdminLayout>
    );
  }

  if (!isSuperAdmin) {
    return (
      <QuizAdminLayout title="Act as Organization" activeSection="impersonate">
        <Card className="bg-card border-destructive/30 max-w-md mx-auto">
          <CardContent className="pt-6 text-center">
            <Shield className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground">This page is only available to SuperAdmin users.</p>
            <Button onClick={() => setLocation('/login')}
              className="mt-4"
              data-testid="button-login"
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </QuizAdminLayout>
    );
  }

  return (
    <QuizAdminLayout title="Act as Organization" description="Select an organization to manage with OrgAdmin privileges" activeSection="impersonate">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent/20 rounded-full border border-accent/30 mb-4">
            <Shield className="w-5 h-5 text-accent" />
            <span className="text-accent font-semibold">SuperAdmin Mode</span>
          </div>
          <p className="text-muted-foreground max-w-md mx-auto">
            Choose an organization to manage. You'll have OrgAdmin access while retaining all SuperAdmin privileges.
          </p>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Search organizations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-input border-border text-foreground placeholder:text-muted-foreground"
            data-testid="input-search-org"
          />
        </div>

        {orgsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredOrgs.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="py-12 text-center">
              <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {searchQuery ? 'No organizations match your search.' : 'No organizations found.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredOrgs.map((org) => (
              <Card 
                key={org.id} 
                className="bg-card border-border hover:border-border transition-all cursor-pointer group"
                onClick={() => setImpersonationMutation.mutate(org.id)}
                data-testid={`card-org-${org.id}`}
              >
                <CardContent className="py-4 px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary transition-all">
                        {getOrgIcon(org.type)}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                          {org.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={`text-xs ${getOrgBadgeColor(org.type)}`}>
                            {org.type.charAt(0).toUpperCase() + org.type.slice(1)}
                          </Badge>
                          {org.subscriptionStatus && (
                            <Badge variant="outline" className="text-xs">
                              {org.subscriptionStatus}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {setImpersonationMutation.isPending ? (
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      ) : (
                        <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-8 text-center">
          <p className="text-muted-foreground text-sm mb-3">
            Don't need organization access?
          </p>
          <Button variant="outline" onClick={() => setLocation('/super-admin')}
            className="border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            data-testid="button-skip-impersonation"
          >
            Continue to SuperAdmin Dashboard
          </Button>
        </div>
      </div>
    </QuizAdminLayout>
  );
}
