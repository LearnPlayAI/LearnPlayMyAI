import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'wouter';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import {
  Search,
  Clock,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { usePlatformMode } from '@/hooks/usePlatformMode';
import {
  NAV_SECTIONS,
  ACCOUNT_NAV_ITEMS,
  filterNavigationByRole,
  type NavItem,
  type OrgType,
} from '@/config/adminNavConfig';

const RECENT_PAGES_KEY = 'learnplay_recent_pages';
const FAVORITE_PAGES_KEY = 'learnplay_favorite_pages';
const MAX_RECENT_PAGES = 5;

interface CommandDialogNavProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

function getRecentPages(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(RECENT_PAGES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addRecentPage(path: string): void {
  if (typeof window === 'undefined') return;
  try {
    const recent = getRecentPages().filter(p => p !== path);
    recent.unshift(path);
    localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(recent.slice(0, MAX_RECENT_PAGES)));
  } catch {
    // Ignore localStorage errors
  }
}

function getFavoritePages(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(FAVORITE_PAGES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function toggleFavoritePage(path: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const favorites = getFavoritePages();
    const index = favorites.indexOf(path);
    if (index === -1) {
      favorites.push(path);
      localStorage.setItem(FAVORITE_PAGES_KEY, JSON.stringify(favorites));
      return true;
    } else {
      favorites.splice(index, 1);
      localStorage.setItem(FAVORITE_PAGES_KEY, JSON.stringify(favorites));
      return false;
    }
  } catch {
    return false;
  }
}

export { useCommandDialog } from '@/hooks/use-command-dialog';

export function CommandDialogTrigger({ onClick }: { onClick: () => void }) {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  return (
    <Button variant="outline" onClick={onClick} className={cn( "relative h-9 w-full justify-start rounded-lg border-border bg-muted px-3 text-sm text-muted-foreground", "hover:bg-primary/10 hover:border-border hover:text-primary", "transition-all duration-200 sm:w-64" )} data-testid="command-dialog-trigger" >
      <Search className="mr-2 h-4 w-4" />
      <span className="hidden sm:inline-flex">Quick navigation...</span>
      <span className="inline-flex sm:hidden">Search...</span>
      <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
        <span className="text-xs">{isMac ? '⌘' : 'Ctrl'}</span>K
      </kbd>
    </Button>
  );
}

function getAllNavItems(): NavItem[] {
  const items: NavItem[] = [];
  NAV_SECTIONS.forEach(section => {
    section.groups.forEach(group => {
      items.push(...group.items.map(item => ({
        ...item,
        category: section.label,
      })));
    });
  });
  items.push(...ACCOUNT_NAV_ITEMS.map(item => ({
    ...item,
    category: 'Account',
  })));
  return items;
}

interface NavItemWithCategory extends NavItem {
  category: string;
}

export default function CommandDialogNav({ isOpen, onOpenChange }: CommandDialogNavProps) {
  const [, setLocation] = useLocation();
  const { isSuperAdmin, isCustSuper, isOrgAdmin, isTeacher, organizationType, isImpersonating, impersonatedOrganization } = useAuth();
  const { onpremMode, baseUrl } = usePlatformMode();
  const [recentPages, setRecentPages] = useState<string[]>([]);
  const [favoritePages, setFavoritePages] = useState<string[]>([]);
  
  const effectiveOrgType = isImpersonating && impersonatedOrganization 
    ? impersonatedOrganization.type as OrgType 
    : organizationType as OrgType | null;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setRecentPages(getRecentPages());
      setFavoritePages(getFavoritePages());
    }
  }, []);

  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      setRecentPages(getRecentPages());
      setFavoritePages(getFavoritePages());
    }
  }, [isOpen]);

  const allNavItems = useMemo(() => getAllNavItems(), []);

  const filteredNav = useMemo(() => {
    return filterNavigationByRole(
      isSuperAdmin,
      isOrgAdmin,
      isTeacher,
      effectiveOrgType,
      undefined,
      isImpersonating,
      undefined,
      undefined,
      isCustSuper,
      onpremMode
    );
  }, [isSuperAdmin, isOrgAdmin, isTeacher, effectiveOrgType, isImpersonating, isCustSuper, onpremMode]);

  const allowedPaths = useMemo(() => {
    const paths = new Set<string>();

    filteredNav.sections.forEach(section => {
      section.groups.forEach(group => {
        group.items.forEach(item => {
          paths.add(item.path);
        });
      });
    });

    filteredNav.accountItems.forEach(item => {
      paths.add(item.path);
    });

    return paths;
  }, [filteredNav]);

  const filterItem = useCallback((item: NavItem): boolean => {
    return allowedPaths.has(item.path);
  }, [allowedPaths]);

  const recentNavItems = useMemo(() => {
    return recentPages
      .map(path => allNavItems.find(item => item.path === path))
      .filter((item): item is NavItemWithCategory => {
        if (!item) return false;
        return filterItem(item);
      });
  }, [recentPages, allNavItems, filterItem]);

  const favoriteNavItems = useMemo(() => {
    return favoritePages
      .map(path => allNavItems.find(item => item.path === path))
      .filter((item): item is NavItemWithCategory => {
        if (!item) return false;
        return filterItem(item);
      });
  }, [favoritePages, allNavItems, filterItem]);

  const handleSelect = useCallback((item: NavItem) => {
    addRecentPage(item.path);
    if (item.isExternal && item.externalUrl) {
      const resolvedUrl = item.externalUrl.startsWith('http')
        ? item.externalUrl
        : `${baseUrl.replace(/\/+$/, '')}/${item.externalUrl.replace(/^\/+/, '')}`;
      const newWindow = window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
      if (!newWindow) {
        window.location.href = resolvedUrl;
      }
      onOpenChange(false);
      return;
    }
    setLocation(item.path);
    onOpenChange(false);
  }, [setLocation, onOpenChange, baseUrl]);

  const handleToggleFavorite = useCallback((e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    toggleFavoritePage(path);
    setFavoritePages(getFavoritePages());
  }, []);

  const renderNavItem = (item: NavItemWithCategory, showFavorite = true) => {
    const Icon = item.icon;
    const isFavorite = favoritePages.includes(item.path);
    const keywords = item.keywords?.join(' ') || '';

    return (
      <CommandItem
        key={item.id}
        value={`${item.label} ${item.description} ${item.category} ${keywords}`}
        onSelect={() => handleSelect(item)}
        className={cn(
          "flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 sm:py-2.5 cursor-pointer rounded-lg",
          "min-h-[48px] sm:min-h-[44px]",
          "data-[selected=true]:bg-primary/20 data-[selected=true]:text-foreground",
          "hover:bg-muted"
        )}
        data-testid={`command-item-${item.id}`}
      >
        <div className="flex h-8 w-8 sm:h-8 sm:w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 overflow-hidden min-w-0">
          <p className="text-sm sm:text-sm font-medium text-foreground truncate">{(onpremMode && item.onPremLabel) ? item.onPremLabel : item.label}</p>
          <p className="text-xs text-muted-foreground truncate hidden sm:block">{(onpremMode && item.onPremDescription) ? item.onPremDescription : item.description}</p>
        </div>
        {showFavorite && (
          <button
            onClick={(e) => handleToggleFavorite(e, item.path)}
            className={cn(
              "p-2 sm:p-1 rounded hover:bg-muted transition-colors flex-shrink-0",
              "min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center",
              isFavorite ? "text-accent" : "text-muted-foreground hover:text-accent"
            )}
            data-testid={`favorite-toggle-${item.id}`}
          >
            <Star className={cn("h-4 w-4", isFavorite && "fill-current")} />
          </button>
        )}
      </CommandItem>
    );
  };

  return (
    <CommandDialog open={isOpen} onOpenChange={onOpenChange}>
      <Command
        className={cn(
          "bg-card border border-border rounded-xl shadow-dialog",
          "[&_[cmdk-group-heading]]:text-primary [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
        )}
      >
        <CommandInput
          placeholder="Search pages..."
          className="h-12 border-b border-border bg-transparent text-foreground placeholder:text-muted-foreground"
          data-testid="command-input"
        />
        <CommandList className="max-h-[50vh] sm:max-h-[400px] overflow-y-auto custom-scrollbar p-2 overscroll-contain">
          <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
            No pages found.
          </CommandEmpty>

          {recentNavItems.length > 0 && (
            <>
              <CommandGroup heading="Recently Visited">
                <div className="flex items-center gap-2 px-2 mb-2">
                  <Clock className="h-3 w-3 text-primary" />
                </div>
                {recentNavItems.map(item => renderNavItem(item))}
              </CommandGroup>
              <CommandSeparator className="my-2 bg-border" />
            </>
          )}

          {favoriteNavItems.length > 0 && (
            <>
              <CommandGroup heading="Favorites">
                <div className="flex items-center gap-2 px-2 mb-2">
                  <Star className="h-3 w-3 text-accent fill-current" />
                </div>
                {favoriteNavItems.map(item => renderNavItem(item, false))}
              </CommandGroup>
              <CommandSeparator className="my-2 bg-border" />
            </>
          )}

          {filteredNav.sections.map((section, sectionIndex) => (
            <div key={section.id}>
              {sectionIndex > 0 && <CommandSeparator className="my-2 bg-border" />}
              <CommandGroup heading={section.label}>
                {section.groups.flatMap(group => 
                  group.items.map(item => renderNavItem({ ...item, category: section.label }))
                )}
              </CommandGroup>
            </div>
          ))}

          {filteredNav.accountItems.length > 0 && (
            <>
              <CommandSeparator className="my-2 bg-border" />
              <CommandGroup heading="Account">
                {filteredNav.accountItems.map(item => renderNavItem({ ...item, category: 'Account' }))}
              </CommandGroup>
            </>
          )}
        </CommandList>
        <div className={cn(
          "flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground",
          "pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] sm:pb-2",
          "hidden sm:flex"
        )}>
          <div className="flex items-center gap-2">
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5">↑↓</kbd>
            <span>Navigate</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5">Enter</kbd>
            <span>Select</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5">Esc</kbd>
            <span>Close</span>
          </div>
        </div>
      </Command>
    </CommandDialog>
  );
}
