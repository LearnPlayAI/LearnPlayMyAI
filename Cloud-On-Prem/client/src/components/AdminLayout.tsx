import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { Database, ImageIcon, BarChart3, LogOut, Menu, Home, ExternalLink, Mail, FileText, Shield, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useBranding, useBrandingLinks } from '@/contexts/BrandingContext';
import { ExpiredTrialBanner } from '@/components/ExpiredTrialBanner';

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [location, navigate] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { branding, isOrgDomain } = useBranding();
  const { supportUrl, supportEmail, termsUrl, privacyUrl } = useBrandingLinks();
  const orgName = branding?.orgName || 'LearnPlay';
  const logoUrl = branding?.logoUrl;
  const hasFooterLinks = supportUrl || supportEmail || termsUrl || privacyUrl;

  const logoutMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/auth/logout', {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.clear();
      window.location.href = '/';
    },
    onError: (error) => {
      console.error('Logout error:', error);
    },
  });

  const navItems = [
    { 
      href: "/admin", 
      label: "Dashboard", 
      icon: BarChart3,
      description: "Overview & Stats"
    },
    { 
      href: "/admin/collections", 
      label: "Collections", 
      icon: Database,
      description: "Manage Card Collections"
    },
    { 
      href: "/admin/cards", 
      label: "Cards", 
      icon: ImageIcon,
      description: "Manage Individual Cards"
    },
  ];

  const NavContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border">
        <Link href="/">
          <div 
            className="flex items-center gap-3 mb-1 w-full hover:opacity-80 transition-opacity cursor-pointer"
            onClick={() => setMobileMenuOpen(false)}
            data-testid="logo-home-link"
          >
            <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-xl overflow-hidden shadow-elevated border-2 border-border flex items-center justify-center bg-surface-raised">
              {logoUrl ? (
                <img 
                  src={logoUrl} 
                  alt={`${orgName} Logo`} 
                  className="max-h-full max-w-full object-contain p-0.5"
                />
              ) : (
                <span className="text-primary-foreground font-bold text-sm lg:text-base">
                  {orgName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-lg lg:text-xl font-bold text-sidebar-primary tracking-wide">
                {orgName.toUpperCase()}
              </h2>
              <p className="text-xs text-muted-foreground font-medium">Admin Control Center</p>
            </div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href || 
            (item.href !== "/admin" && location.startsWith(item.href));
          
          return (
            <Link key={item.href} href={item.href}>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'w-full group relative px-4 py-4 rounded-xl transition-all duration-300 border touch-target',
                  'min-h-[var(--mobile-nav-height)]',
                  isActive 
                    ? 'bg-nav-active border-nav-border shadow-elevated' 
                    : 'border-transparent hover:bg-nav-hover hover:border-nav-border'
                )}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    'p-2.5 rounded-lg transition-all duration-300',
                    isActive 
                      ? 'bg-nav-active text-nav-active-foreground shadow-elevated' 
                      : 'bg-muted/50 text-nav-foreground group-hover:bg-nav-hover group-hover:text-nav-link-hover'
                  )}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-left flex-1">
                    <p className={cn(
                      'font-semibold text-sm transition-colors',
                      isActive ? 'text-nav-active-foreground' : 'text-nav-foreground group-hover:text-nav-link-hover'
                    )}>
                      {item.label}
                    </p>
                    <p className={cn(
                      'text-xs transition-colors mt-0.5',
                      isActive ? 'text-nav-active-foreground/80' : 'text-nav-foreground/70 group-hover:text-nav-link-hover/80'
                    )}>
                      {item.description}
                    </p>
                  </div>
                </div>
                
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-10 bg-primary hover:bg-primary/90 rounded-r-full"></div>
                )}
              </button>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 space-y-2 border-t border-border">
        <Button onClick={() => {
            setMobileMenuOpen(false);
            navigate('/');
          }}
          variant="outline"
          className="w-full bg-muted/50 hover:bg-muted border-border text-foreground hover:text-foreground hover:border-border touch-target"
          style={{ minHeight: 'var(--touch-target-min)' }}
          data-testid="button-back-home"
        >
          <Home className="h-4 w-4 mr-2" />
          Back to Home
        </Button>
        <Button onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          variant="outline"
          className="w-full bg-destructive/10 hover:bg-destructive/20 border-[var(--destructive)]/30 text-destructive hover:text-destructive touch-target"
          style={{ minHeight: 'var(--touch-target-min)' }}
          data-testid="button-logout"
        >
          <LogOut className="h-4 w-4 mr-2" />
          {logoutMutation.isPending ? 'Logging out...' : 'Logout'}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background relative">
      <div className="absolute inset-0 bg-background">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0ic3RhcnMiIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48Y2lyY2xlIGN4PSIzIiBjeT0iMyIgcj0iMSIgZmlsbD0id2hpdGUiIG9wYWNpdHk9IjAuMiIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNTAiIHI9IjEuNSIgZmlsbD0id2hpdGUiIG9wYWNpdHk9IjAuMyIvPjxjaXJjbGUgY3g9IjEwMCIgY3k9IjIwIiByPSIxIiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC4yNSIvPjxjaXJjbGUgY3g9IjE1MCIgY3k9IjE1MCIgcj0iMiIgZmlsbD0id2hpdGUiIG9wYWNpdHk9IjAuMTUiLz48Y2lyY2xlIGN4PSI3MCIgY3k9IjEyMCIgcj0iMSIgZmlsbD0id2hpdGUiIG9wYWNpdHk9IjAuMiIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNzdGFycykiLz48L3N2Zz4=')] opacity-20"></div>
      </div>

      <div className="relative z-10 flex">
        <aside className="hidden lg:block w-80 h-screen sticky top-0 bg-nav backdrop-blur-xl border-r border-nav-border shadow-dialog">
          <NavContent />
        </aside>

        <div className="flex-1 min-h-screen overflow-x-hidden max-w-full">
          <header className="mobile-nav bg-nav backdrop-blur-xl border-b border-nav-border sticky top-0 z-40">
            <div className="mobile-header-padding sm:px-4 lg:px-8 py-3 sm:py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
                <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" className="lg:hidden shrink-0 touch-target p-0" style={{ width: 'var(--touch-target-min)', height: 'var(--touch-target-min)' }} data-testid="mobile-menu-button" >
                      <Menu className="w-5 h-5 sm:w-6 sm:h-6" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-80 p-0 bg-nav border-nav-border">
                    <NavContent />
                  </SheetContent>
                </Sheet>

                <div className="min-w-0 flex-1">
                  <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground tracking-tight truncate">
                    Admin Panel
                  </h1>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 truncate hidden sm:block">
                    Manage collections and cards
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="hidden md:block px-3 lg:px-4 py-1.5 lg:py-2 rounded-full bg-primary hover:bg-primary/90 border border-primary/30 shadow-elevated shadow-elevated">
                  <span className="text-xs font-semibold text-primary tracking-wide">ADMIN</span>
                </div>
              </div>
            </div>
          </header>

          <main className="p-3 sm:p-4 lg:p-8 overflow-x-hidden max-w-full">
            <ExpiredTrialBanner />
            <div className="bg-card/40 backdrop-blur-lg rounded-2xl border border-border shadow-dialog">
              <div className="p-4 sm:p-6 lg:p-8">
                {children}
              </div>
            </div>
          </main>

          {hasFooterLinks && (
            <footer className="mt-auto p-4 lg:p-8 border-t border-border" data-testid="admin-footer">
              <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6">
                {supportUrl && (
                  <a 
                    href={supportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
                    data-testid="admin-footer-support"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Support
                  </a>
                )}
                {supportEmail && (
                  <a 
                    href={`mailto:${supportEmail}`}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
                    data-testid="admin-footer-contact"
                  >
                    <Mail className="w-4 h-4" />
                    Contact Us
                  </a>
                )}
                {termsUrl && (
                  <a 
                    href={termsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
                    data-testid="admin-footer-terms"
                  >
                    <FileText className="w-4 h-4" />
                    Terms of Service
                  </a>
                )}
                {privacyUrl && (
                  <a 
                    href={privacyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
                    data-testid="admin-footer-privacy"
                  >
                    <Shield className="w-4 h-4" />
                    Privacy Policy
                  </a>
                )}
              </div>
            </footer>
          )}
        </div>
      </div>
    </div>
  );
}
