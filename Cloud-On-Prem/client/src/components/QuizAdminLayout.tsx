import { ReactNode, useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Home,
  Menu,
  Shield,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import CommandDialogNav, { CommandDialogTrigger, useCommandDialog } from '@/components/CommandDialogNav';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { useNavigationRecents } from '@/components/NavigationRecents';
import { TrialStatusIndicator, TrialStatusMobileItem } from '@/components/TrialStatusIndicator';
import { AdminNavSidebar } from '@/components/AdminNavSidebar';
import { ExpiredTrialBanner } from '@/components/ExpiredTrialBanner';
import { CreditStatusBar } from '@/components/CreditCenter';
import { OrgSwitcher } from '@/components/OrgSwitcher';
import { UserMenu } from '@/components/UserMenu';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';
import { useBranding } from '@/contexts/BrandingContext';
import { usePlatformMode } from '@/hooks/usePlatformMode';

const SIDEBAR_COLLAPSED_KEY = 'admin-sidebar-collapsed';

interface QuizAdminLayoutProps {
  children: ReactNode;
  title: string;
  description?: string;
  activeSection?: string;
}

export default function QuizAdminLayout({ children, title, description }: QuizAdminLayoutProps) {
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    }
    return false;
  });
  const {
    user,
    isSuperAdmin,
    isCustSuper,
    isOrgAdmin,
    isTeacher,
    impersonatedOrganization,
    effectiveOrganizationName,
    runtimeContext,
  } = useAuth();
  const { onpremMode } = usePlatformMode();
  const isHighAdmin = isSuperAdmin || isCustSuper;
  const { branding } = useBranding();
  const orgName = branding?.orgName || 'LearnPlay';
  const logoUrl = branding?.logoUrl;
  const activeOrganizationName = effectiveOrganizationName || impersonatedOrganization?.name || runtimeContext.activeOrgName;
  const showScopeChip = !impersonatedOrganization && (isHighAdmin || isOrgAdmin || isTeacher);
  const showOrgSwitcher = isHighAdmin;
  const canManagePlatformScope = isSuperAdmin;

  const toggleSidebar = () => {
    const newValue = !sidebarCollapsed;
    setSidebarCollapsed(newValue);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(newValue));
  };

  const { isOpen: commandDialogOpen, onOpenChange: setCommandDialogOpen, openCommandDialog } = useCommandDialog();
  const { addRecent } = useNavigationRecents();

  useEffect(() => {
    if (location && title) {
      addRecent(location, title);
    }
  }, [location, title, addRecent]);

  const renderNavContent = (collapsed = false) => (
    <TooltipProvider delayDuration={0}>
      <div className="flex flex-col h-full">
        <div className={cn(
          'border-b border-sidebar-border',
          collapsed ? 'p-3' : 'p-6'
        )}>
          <button
            onClick={() => setLocation('/')}
            className={cn(
              'flex items-center mb-1 w-full hover:opacity-80 transition-opacity',
              collapsed ? 'justify-center' : 'gap-3'
            )}
            data-testid="logo-home-link"
          >
            <div className={cn(
              'rounded-xl overflow-hidden shadow-elevated border-2 border-border flex items-center justify-center bg-surface-raised',
              collapsed ? 'w-10 h-10' : 'w-8 h-8 lg:w-10 lg:h-10'
            )}>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`${orgName} Logo`}
                  className="max-h-full max-w-full object-contain p-0.5"
                />
              ) : (
                <span className="text-sidebar-foreground font-bold text-sm lg:text-base">
                  {orgName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            {!collapsed && (
              <div>
                <h2 className="text-lg font-bold text-sidebar-primary tracking-wide">{orgName.toUpperCase()}</h2>
                <p className="text-xs text-sidebar-primary font-medium">Admin Control</p>
                {user && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {user.firstName && user.lastName
                      ? `${user.firstName} ${user.lastName}`
                      : user.firstName || user.lastName || user.email || user.username || 'User'}
                  </p>
                )}
              </div>
            )}
          </button>
          {!collapsed && (
            <div className="mt-3 lg:hidden">
              <TrialStatusMobileItem />
            </div>
          )}
        </div>

        <div className={cn(
          'flex-1 overflow-y-auto custom-scrollbar',
          collapsed ? 'p-2' : 'p-4'
        )}>
          {!collapsed && (
            <div className="mb-4">
              <CommandDialogTrigger onClick={openCommandDialog} />
            </div>
          )}
          <AdminNavSidebar onNavigate={() => setMobileMenuOpen(false)} collapsed={collapsed} />
        </div>

        <div className={cn(
          'space-y-2 border-t border-sidebar-border',
          collapsed ? 'p-2' : 'p-4'
        )}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={() => setLocation('/quiz-lobby')}
                  variant="outline"
                  size="icon"
                  className="w-full bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border text-sidebar-foreground hover:text-sidebar-foreground hover:border-sidebar-border/80"
                  data-testid="nav-home"
                >
                  <Home className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Back to Home</TooltipContent>
            </Tooltip>
          ) : (
            <Button onClick={() => setLocation('/quiz-lobby')}
              variant="outline"
              className="w-full bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border text-sidebar-foreground hover:text-sidebar-foreground hover:border-sidebar-border/80"
              data-testid="nav-home"
            >
              <Home className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          )}

          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={toggleSidebar} variant="ghost" size="icon" className="w-full" data-testid="button-expand-sidebar" >
                  <PanelLeft className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand Sidebar</TooltipContent>
            </Tooltip>
          ) : (
            <Button onClick={toggleSidebar} variant="ghost" className="w-full justify-start" data-testid="button-collapse-sidebar" >
              <PanelLeftClose className="w-4 h-4 mr-2" />
              Collapse
            </Button>
          )}
        </div>
      </div>
    </TooltipProvider>
  );

  return (
    <div className="min-h-screen bg-surface-base text-foreground">
      <ImpersonationBanner />
      <div className="flex">
        <aside
          className={cn(
            'hidden lg:block sticky top-0 h-screen bg-sidebar border-r border-sidebar-border shadow-dialog transition-all duration-300 ease-in-out',
            sidebarCollapsed ? 'w-16' : 'w-80'
          )}
          style={{
            backgroundColor: 'var(--admin-sidebar-bg)',
            color: 'var(--admin-sidebar-fg)',
          }}
        >
          {renderNavContent(sidebarCollapsed)}
        </aside>

        <div className="flex-1 min-h-screen overflow-x-hidden max-w-full">
          <header className="bg-[var(--admin-header-bg)] border-b border-sidebar-border sticky top-0 z-40">
            <div className="px-3 sm:px-4 lg:px-8 py-3 sm:py-4 lg:py-5 space-y-3">
              <div className="hidden md:flex items-center justify-end gap-3">
                {!onpremMode && <CreditStatusBar />}
                <TrialStatusIndicator variant="pill" showDismiss={true} />
                {showScopeChip && (
                  <div className="px-3 py-1.5 rounded-full border border-border bg-card text-xs text-foreground">
                    <span className="font-semibold tracking-wide">{runtimeContext.scopeLabel.toUpperCase()}</span>
                    {runtimeContext.showActiveOrg && activeOrganizationName ? (
                      <span className="ml-2 text-muted-foreground">{activeOrganizationName}</span>
                    ) : null}
                  </div>
                )}
                {showOrgSwitcher && <OrgSwitcher />}
                <UserMenu />
                {canManagePlatformScope ? (
                  <Button onClick={() => setLocation('/superadmin/impersonate')}
                    variant="outline"
                    className="h-8 px-3 lg:px-4 rounded-full border-[var(--warning)]/40 bg-warning/14 text-foreground shadow-elevated hover:bg-warning/22"
                    data-testid="button-superadmin-badge"
                  >
                    <Shield className="w-4 h-4" />
                    <span className="text-xs font-semibold tracking-wide">{runtimeContext.roleBadgeLabel.toUpperCase()}</span>
                  </Button>
                ) : (
                  <div className="px-3 lg:px-4 py-1.5 lg:py-2 rounded-full bg-primary hover:bg-primary/90 border border-primary/30 shadow-elevated shadow-elevated">
                    <span className="text-xs font-semibold text-primary-foreground tracking-wide">{runtimeContext.roleBadgeLabel.toUpperCase()}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" className="lg:hidden shrink-0 h-11 w-11 p-0" data-testid="mobile-menu-button" >
                      <Menu className="w-5 h-5 sm:w-6 sm:h-6" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-80 p-0 bg-sidebar border-sidebar-border">
                    {renderNavContent(false)}
                  </SheetContent>
                </Sheet>

                <div className="min-w-0 flex-1">
                  <h1 className="text-lg sm:text-xl lg:text-3xl font-bold text-sidebar-foreground tracking-tight truncate">{title}</h1>
                  {description && (
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1 truncate">{description}</p>
                  )}
                  <div className="hidden md:block mt-1">
                    <Breadcrumbs className="mb-0 text-xs" />
                  </div>
                </div>
              </div>
            </div>
          </header>

          <main className="p-3 sm:p-4 lg:p-8 overflow-x-hidden max-w-full">
            <ExpiredTrialBanner />
            {children}
          </main>
        </div>
      </div>

      <CommandDialogNav isOpen={commandDialogOpen} onOpenChange={setCommandDialogOpen} />
    </div>
  );
}
