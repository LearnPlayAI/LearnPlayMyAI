import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useEnterpriseAuth } from '@/hooks/useEnterpriseAuth';
import { usePlatformMode } from '@/hooks/usePlatformMode';
import { Building2, FileText, Download, Key, Users, LogOut, LayoutDashboard, ScrollText, Shield, Menu, X, Loader2, Server, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { queryClient, apiRequest } from '@/lib/queryClient';

const navItems = [
  { href: '/enterprise/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/enterprise/profile', label: 'Company Profile', icon: Building2 },
  { href: '/enterprise/sub-companies', label: 'Sub-Companies', icon: Users },
  { href: '/enterprise/documents', label: 'Documents', icon: FileText },
  { href: '/enterprise/builds', label: 'Downloads', icon: Download },
  { href: '/enterprise/licenses', label: 'License Management', icon: Key },
  { href: '/enterprise/systems', label: 'Systems', icon: Server },
  { href: '/enterprise/keys', label: 'Encryption Keys', icon: Shield },
  { href: '/enterprise/agreements', label: 'Agreements', icon: ScrollText },
];

const cloudSuperAdminNavItem = {
  href: '/superadmin/enterprise',
  label: 'Customer Management',
  icon: ShieldCheck,
};

export default function EnterprisePortalLayout({ children }: { children: React.ReactNode }) {
  const { enterpriseUser, isLoading, isAuthenticated, isSuperAdmin, isImpersonating, needsCustomerSelection } = useEnterpriseAuth();
  const { onpremMode } = usePlatformMode();
  const [location, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ["/api/enterprise/auth/customers"],
    enabled: isSuperAdmin,
  });

  const impersonateMutation = useMutation({
    mutationFn: async (enterpriseCustomerId: string) => {
      return await apiRequest('/api/enterprise/auth/impersonate', {
        method: 'POST',
        body: JSON.stringify({ enterpriseCustomerId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/auth/me"] });
    },
  });

  const endImpersonationMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/enterprise/auth/end-impersonation', {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/auth/me"] });
    },
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isSuperAdmin) {
      if (onpremMode) {
        setLocation('/enterprise/login');
      } else {
        setLocation('/enterprise/login');
      }
    }
  }, [isLoading, isAuthenticated, isSuperAdmin, onpremMode, setLocation]);

  const handleLogout = async () => {
    try {
      const res = await apiRequest('/api/enterprise/auth/logout', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/auth/me"] });
      if (data.returnToAdmin) {
        window.location.href = '/superadmin/enterprise';
        return;
      }
    } catch {
    }
    window.location.href = '/enterprise/login';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading portal...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !isSuperAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {isSuperAdmin && (
        <div className="bg-primary text-primary-foreground px-4 py-2 flex items-center justify-between z-50 flex-shrink-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Shield className="w-4 h-4" />
            <span>{isImpersonating ? `SuperAdmin Mode — Viewing as: ${enterpriseUser?.companyName}` : 'SuperAdmin Mode — No customer selected'}</span>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="bg-background text-foreground border border-border rounded px-2 py-1 text-xs appearance-none cursor-pointer min-w-[180px] focus:outline-none focus:ring-2 focus:ring-ring"
              value={enterpriseUser?.id || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val) {
                  impersonateMutation.mutate(val);
                } else {
                  endImpersonationMutation.mutate();
                }
              }}
              disabled={impersonateMutation.isPending || endImpersonationMutation.isPending}
            >
              <option value="" className="text-foreground">-- No Customer Selected --</option>
              {((customersData as any)?.customers || []).map((c: any) => (
                <option key={c.id} value={c.id} className="text-foreground">{c.companyName}</option>
              ))}
            </select>
            <Button size="sm" variant="secondary" onClick={handleLogout} className="text-xs" >
              Exit
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {sidebarOpen && (
          <div className="fixed inset-0 bg-[var(--surface-overlay)]/30 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-card border-r border-border flex flex-col transform transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Building2 className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-foreground text-sm">Enterprise Portal</span>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {!onpremMode && isSuperAdmin && (
              <Link href={cloudSuperAdminNavItem.href}>
                <div
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
                    location === cloudSuperAdminNavItem.href
                      ? 'bg-primary/15 text-primary'
                      : 'text-primary bg-primary/10 hover:bg-primary/20'
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <cloudSuperAdminNavItem.icon className="w-4 h-4 flex-shrink-0" />
                  {cloudSuperAdminNavItem.label}
                </div>
              </Link>
            )}

            {navItems.map((item) => {
              const isActive = location === item.href;
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </nav>

          <div className="p-3 border-t border-border">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-destructive/12 hover:text-destructive w-full transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="bg-card border-b border-border px-4 py-3 flex items-center justify-between sticky top-0 z-20">
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-muted-foreground hover:text-foreground">
                <Menu className="w-5 h-5" />
              </button>
              <h2 className="font-semibold text-foreground truncate">
                {enterpriseUser?.companyName || 'Enterprise Portal'}
              </h2>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="hidden sm:inline">{enterpriseUser?.email}</span>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
