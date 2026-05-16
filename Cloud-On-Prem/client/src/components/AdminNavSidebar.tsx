import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'wouter';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { usePlatformMode } from '@/hooks/usePlatformMode';
import { useQuery } from '@tanstack/react-query';
import {
  NAV_SECTIONS,
  ACCOUNT_NAV_ITEMS,
  filterNavigationByRole,
  getSavedCollapseState,
  saveCollapseState,
  getSectionByPath,
  type NavSection,
  type NavItem,
  type OrgType,
  type FeatureFlag,
} from '@/config/adminNavConfig';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface BadgeCounts {
  joinRequests: number;
  pendingPayouts: number;
  pendingRefunds: number;
}

interface AdminNavSidebarProps {
  onNavigate?: () => void;
  className?: string;
  collapsed?: boolean;
}

export function AdminNavSidebar({ onNavigate, className, collapsed = false }: AdminNavSidebarProps) {
  const [location, setLocation] = useLocation();
  const { isSuperAdmin, isCustSuper, isOrgAdmin, isTeacher, organizationType, isImpersonating, impersonatedOrganization, effectiveOrgAdmin, isDemo, effectiveOrganizationId } = useAuth();
  
  const effectiveOrgType = isImpersonating && impersonatedOrganization 
    ? impersonatedOrganization.type as OrgType 
    : organizationType as OrgType | null;
  
  const [collapseState, setCollapseState] = useState<Record<string, boolean>>(() => {
    const saved = getSavedCollapseState();
    const activeSection = getSectionByPath(location);
    
    const initial: Record<string, boolean> = {};
    NAV_SECTIONS.forEach(section => {
      initial[section.id] = saved[section.id] ?? section.defaultExpanded ?? false;
    });
    
    if (activeSection) {
      initial[activeSection.id] = true;
    }
    
    return initial;
  });

  const { paymentGatewayEnabled, onpremMode, baseUrl } = usePlatformMode();

  const { data: pendingCountData } = useQuery<{ count: number }>({
    queryKey: ['/api/org', effectiveOrganizationId, 'join-requests/pending-count'],
    enabled: !!effectiveOrganizationId && (isOrgAdmin || isTeacher),
    refetchInterval: 30000,
  });

  const badgeCounts: BadgeCounts = useMemo(() => ({
    joinRequests: pendingCountData?.count ?? 0,
    pendingPayouts: 0,
    pendingRefunds: 0,
  }), [pendingCountData]);

  const featureFlags = useMemo(() => ({
    PAYMENT_GATEWAY_ENABLED: paymentGatewayEnabled,
  } as Record<FeatureFlag, boolean>), [paymentGatewayEnabled]);

  const filteredNav = useMemo(() => {
    return filterNavigationByRole(
      isSuperAdmin,
      isOrgAdmin,
      isTeacher,
      effectiveOrgType,
      featureFlags,
      isImpersonating,
      effectiveOrgAdmin,
      isDemo,
      isCustSuper,
      onpremMode
    );
  }, [isSuperAdmin, isOrgAdmin, isTeacher, effectiveOrgType, featureFlags, isImpersonating, effectiveOrgAdmin, isDemo, isCustSuper, onpremMode]);

  useEffect(() => {
    const activeSection = getSectionByPath(location);
    if (activeSection && !collapseState[activeSection.id]) {
      setCollapseState(prev => {
        const next = { ...prev, [activeSection.id]: true };
        return next;
      });
    }
  }, [location]);

  const toggleSection = useCallback((sectionId: string) => {
    setCollapseState(prev => {
      const next = { ...prev, [sectionId]: !prev[sectionId] };
      saveCollapseState(next);
      return next;
    });
  }, []);

  const handleNavigate = useCallback((path: string) => {
    setLocation(path);
    onNavigate?.();
  }, [setLocation, onNavigate]);

  const getSectionBadgeCount = useCallback((section: NavSection): number => {
    let total = 0;
    section.groups.forEach(group => {
      group.items.forEach(item => {
        if (item.badge && badgeCounts[item.badge]) {
          total += badgeCounts[item.badge];
        }
      });
    });
    return total;
  }, [badgeCounts]);

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = location === item.path;
    const badgeCount = item.badge ? badgeCounts[item.badge] : 0;

    const buttonContent = (
      <button
        onClick={() => {
          if (item.isExternal && item.externalUrl) {
            const resolvedUrl = item.externalUrl.startsWith('http')
              ? item.externalUrl
              : `${baseUrl.replace(/\/+$/, '')}/${item.externalUrl.replace(/^\/+/, '')}`;
            const newWindow = window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
            if (!newWindow) {
              // Popup blocked fallback
              window.location.href = resolvedUrl;
            }
          } else {
            handleNavigate(item.path);
          }
        }}
        className={cn(
          'w-full group relative rounded-lg transition-all duration-200 border text-left',
          collapsed ? 'p-2 flex justify-center' : 'px-3 py-2.5',
          isActive
            ? 'bg-sidebar-accent border-sidebar-border shadow-elevated'
            : 'border-transparent hover:bg-muted hover:border-sidebar-border'
        )}
        style={
          isActive
            ? {
                backgroundColor: 'var(--admin-sidebar-active-bg)',
                color: 'var(--admin-sidebar-active-fg)',
                borderColor: 'var(--admin-sidebar-active-bg)',
              }
            : {
                backgroundColor: 'var(--admin-sidebar-bg)',
                color: 'var(--admin-sidebar-fg)',
              }
        }
        data-testid={`nav-item-${item.id}`}
      >
        {collapsed ? (
          <div className="relative">
            <div className={cn(
              'p-1.5 rounded-md transition-all duration-200',
              isActive
                ? 'bg-transparent text-inherit'
                : 'bg-muted text-sidebar-foreground group-hover:bg-muted group-hover:text-sidebar-accent-foreground'
            )}>
              <Icon className="w-4 h-4" />
            </div>
            {badgeCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-destructive rounded-full" />
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className={cn(
                'p-1.5 rounded-md transition-all duration-200',
                isActive
                  ? 'bg-transparent text-inherit'
                  : 'bg-muted text-sidebar-foreground group-hover:bg-muted group-hover:text-sidebar-accent-foreground'
              )}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'font-medium text-sm truncate transition-colors',
                    isActive ? 'text-inherit' : 'text-sidebar-foreground group-hover:text-sidebar-accent-foreground'
                  )}>
                    {(onpremMode && item.onPremLabel) ? item.onPremLabel : item.label}
                  </span>
                  {item.isExternal && (
                    <ExternalLink className="w-3 h-3 shrink-0 text-muted-foreground" />
                  )}
                  {badgeCount > 0 && (
                    <Badge variant="destructive" className="h-5 px-1.5 text-xs font-bold shrink-0" data-testid={`badge-${item.id}`} >
                      {badgeCount}
                    </Badge>
                  )}
                </div>
                <span className={cn(
                  'text-xs truncate block transition-colors',
                  isActive ? 'text-inherit opacity-80' : 'text-sidebar-foreground/70 group-hover:text-sidebar-accent-foreground/80'
                )}>
                  {(onpremMode && item.onPremDescription) ? item.onPremDescription : item.description}
                </span>
              </div>
            </div>
            {isActive && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-8 bg-sidebar-accent-foreground rounded-r-full" />
            )}
          </>
        )}
      </button>
    );

    if (collapsed) {
      return (
        <Tooltip key={item.id}>
          <TooltipTrigger asChild>
            {buttonContent}
          </TooltipTrigger>
          <TooltipContent side="right" className="flex flex-col">
            <span className="font-medium">{(onpremMode && item.onPremLabel) ? item.onPremLabel : item.label}</span>
            {item.description && (
              <span className="text-xs text-muted-foreground">{(onpremMode && item.onPremDescription) ? item.onPremDescription : item.description}</span>
            )}
          </TooltipContent>
        </Tooltip>
      );
    }

    return <div key={item.id}>{buttonContent}</div>;
  };

  const renderSection = (section: NavSection) => {
    const isExpanded = collapseState[section.id] ?? false;
    const sectionBadgeCount = getSectionBadgeCount(section);
    const Icon = section.icon;
    const hasActiveItem = section.groups.some(group => 
      group.items.some(item => location === item.path)
    );

    if (collapsed) {
      const firstItem = section.groups[0]?.items[0];
      return (
        <Tooltip key={section.id}>
          <TooltipTrigger asChild>
            <button
              onClick={() => firstItem && handleNavigate(firstItem.path)}
              className={cn(
                'w-full flex justify-center p-2 rounded-lg transition-all duration-200',
                'hover:bg-muted',
                hasActiveItem && 'bg-sidebar-accent border border-sidebar-border'
              )}
              data-testid={`nav-section-${section.id}`}
            >
              <div className={cn(
                'p-1.5 rounded-md transition-all duration-200 relative',
                hasActiveItem ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'bg-muted text-sidebar-foreground',
                section.color
              )}>
                <Icon className="w-4 h-4" />
                {sectionBadgeCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-destructive rounded-full animate-pulse" />
                )}
              </div>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="flex flex-col gap-1">
            <span className="font-medium">{section.label}</span>
            <span className="text-xs text-muted-foreground">
              {section.groups.reduce((acc, g) => acc + g.items.length, 0)} items
            </span>
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Collapsible
        key={section.id}
        open={isExpanded}
        onOpenChange={() => toggleSection(section.id)}
        className="space-y-1"
      >
        <CollapsibleTrigger
          className={cn(
            'w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-200',
            'hover:bg-muted group',
            hasActiveItem && !isExpanded && 'bg-sidebar-accent border border-sidebar-border'
          )}
          data-testid={`nav-section-${section.id}`}
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-1.5 rounded-md transition-all duration-200',
              hasActiveItem ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'bg-muted text-sidebar-foreground',
              section.color
            )}>
              <Icon className="w-4 h-4" />
            </div>
            <span className={cn(
              'font-semibold text-sm transition-colors',
              hasActiveItem ? 'text-sidebar-accent-foreground' : 'text-sidebar-foreground group-hover:text-sidebar-accent-foreground'
            )}>
              {section.label}
            </span>
            {sectionBadgeCount > 0 && !isExpanded && (
              <Badge variant="destructive" className="h-5 px-1.5 text-xs font-bold animate-pulse" >
                {sectionBadgeCount}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent className="pl-4 space-y-3">
          {section.groups.map(group => (
            <div key={group.id} className="space-y-1">
              {section.groups.length > 1 && (
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 py-1">
                  {group.label}
                </h4>
              )}
              <div className="space-y-0.5">
                {group.items.map(renderNavItem)}
              </div>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const renderCollapsedAccountItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = location === item.path;
    const badgeCount = item.badge ? badgeCounts[item.badge] : 0;

    return (
      <Tooltip key={item.id}>
        <TooltipTrigger asChild>
          <button
            onClick={() => handleNavigate(item.path)}
            className={cn(
              'w-full flex justify-center p-2 rounded-lg transition-all duration-200',
              'hover:bg-muted',
              isActive && 'bg-sidebar-accent border border-sidebar-border'
            )}
            data-testid={`nav-item-${item.id}`}
          >
            <div className={cn(
              'p-1.5 rounded-md transition-all duration-200 relative',
              isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'bg-muted text-sidebar-foreground'
            )}>
              <Icon className="w-4 h-4" />
              {badgeCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-destructive rounded-full animate-pulse" />
              )}
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <span className="font-medium">{(onpremMode && item.onPremLabel) ? item.onPremLabel : item.label}</span>
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={0}>
      <nav className={cn('space-y-1', className)}>
        {filteredNav.sections.map(renderSection)}
        
        {filteredNav.accountItems.length > 0 && (
          <div className={cn(
            "pt-3 border-t border-border space-y-1",
            collapsed && "pt-2"
          )}>
            {!collapsed && (
              <h3 className="text-xs font-semibold text-primary/70 uppercase tracking-wider px-3 mb-2">
                Account
              </h3>
            )}
            {collapsed 
              ? filteredNav.accountItems.map(renderCollapsedAccountItem)
              : filteredNav.accountItems.map(renderNavItem)
            }
          </div>
        )}
      </nav>
    </TooltipProvider>
  );
}

export default AdminNavSidebar;
