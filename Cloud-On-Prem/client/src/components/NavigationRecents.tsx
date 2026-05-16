import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'wouter';
import { X, Star, Clock, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

const STORAGE_KEY = 'navigation-recents';
const MAX_RECENTS = 10;
const MAX_PINNED = 5;
const DEBOUNCE_MS = 300;

const ALLOWED_ROUTE_PREFIXES = [
  '/quiz-lobby', '/super-admin', '/superadmin', '/join-requests', '/user-management',
  '/billing', '/reports', '/management-hub', '/lessons', '/course-builder',
  '/browse-courses', '/profile', '/certificates', '/game-lobby',
  '/subscriptions', '/my-courses', '/purchase-history', '/admin',
  '/org-admin', '/org-structure', '/platform', '/marketplace',
  '/quiz-wizard', '/lessons/new', '/gamification', '/season-pass',
  '/challenges', '/inventory', '/shop', '/wallet', '/powerups'
];

function isAllowedRoute(path: string): boolean {
  return ALLOWED_ROUTE_PREFIXES.some(prefix => path.startsWith(prefix));
}

interface NavigationItem {
  path: string;
  title: string;
  timestamp: number;
  isPinned: boolean;
}

interface NavigationRecentsState {
  items: NavigationItem[];
}

function getStorageData(): NavigationRecentsState {
  if (typeof window === 'undefined') return { items: [] };
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to parse navigation recents from localStorage:', e);
  }
  return { items: [] };
}

function setStorageData(data: NavigationRecentsState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save navigation recents to localStorage:', e);
  }
}

function getPageTitle(path: string): string {
  const titleMap: Record<string, string> = {
    '/': 'Home',
    '/super-admin': 'Super Admin',
    '/superadmin/impersonate': 'Impersonate',
    '/organization-analytics': 'Org Analytics',
    '/sales-inquiries': 'Sales',
    '/ai-settings': 'Integration Settings',
    '/admin/integration-settings': 'Integration Settings',
    '/admin/gamification-settings': 'Gamification',
    '/lesson-credits': 'LP Credits',
    '/gamma-themes': 'Themes',
    '/admin/platform-pricing': 'Pricing',
    '/superadmin/platform-revenue': 'Revenue',
    '/user-management': 'Users',
    '/collections-manager': 'Collections',
    '/cards-manager': 'Cards',
    '/org-structure': 'Organization',
    '/join-requests': 'Join Requests',
    '/billing': 'Billing',
    '/course-refunds': 'Refunds',
    '/buy-credits': 'LP Credits',
    '/management-hub': 'Hub',
    '/lessons': 'Course Builder',
    '/quiz-drafts': 'Quiz AI',
    '/quiz-card-manager': 'Questions',
    '/reports': 'Reports',
    '/course-builder': 'Courses',
    '/marketplace-revenue': 'Marketplace',
    '/browse-courses': 'Browse',
    '/subscriptions': 'Subscriptions',
    '/my-courses': 'My Courses',
    '/purchase-history': 'Purchases',
    '/profile': 'Profile',
    '/game-lobby': 'Game Lobby',
    '/leaderboard': 'Leaderboard',
    '/login': 'Login',
    '/register': 'Register',
  };

  if (titleMap[path]) {
    return titleMap[path];
  }

  const segments = path.split('/').filter(Boolean);
  if (segments.length > 0) {
    const lastSegment = segments[segments.length - 1];
    return lastSegment
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return 'Page';
}

export function useNavigationRecents() {
  const [state, setState] = useState<NavigationRecentsState>({ items: [] });
  const [isHydrated, setIsHydrated] = useState(false);
  const lastAddedRef = useRef<{ path: string; timestamp: number } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setState(getStorageData());
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (isHydrated) {
      setStorageData(state);
    }
  }, [state, isHydrated]);

  const recents = useMemo(() => {
    return state.items.filter((item) => !item.isPinned);
  }, [state.items]);

  const pinned = useMemo(() => {
    return state.items.filter((item) => item.isPinned);
  }, [state.items]);

  const addRecent = useCallback((path: string, title?: string) => {
    if (!isAllowedRoute(path)) {
      return;
    }

    const now = Date.now();
    if (
      lastAddedRef.current &&
      lastAddedRef.current.path === path &&
      now - lastAddedRef.current.timestamp < DEBOUNCE_MS
    ) {
      return;
    }
    lastAddedRef.current = { path, timestamp: now };

    setState((prev) => {
      const existingIndex = prev.items.findIndex((item) => item.path === path);
      const pageTitle = title || getPageTitle(path);

      if (existingIndex >= 0) {
        const updated = [...prev.items];
        updated[existingIndex] = {
          ...updated[existingIndex],
          timestamp: Date.now(),
          title: pageTitle,
        };
        return { items: updated };
      }

      const newItem: NavigationItem = {
        path,
        title: pageTitle,
        timestamp: Date.now(),
        isPinned: false,
      };

      const pinnedItems = prev.items.filter((item) => item.isPinned);
      const recentItems = prev.items.filter((item) => !item.isPinned);

      const newRecents = [newItem, ...recentItems].slice(0, MAX_RECENTS);

      return { items: [...pinnedItems, ...newRecents] };
    });
  }, []);

  const togglePin = useCallback((path: string) => {
    setState((prev) => {
      const existingIndex = prev.items.findIndex((item) => item.path === path);
      if (existingIndex < 0) return prev;

      const item = prev.items[existingIndex];
      const pinnedCount = prev.items.filter((i) => i.isPinned).length;

      if (!item.isPinned && pinnedCount >= MAX_PINNED) {
        return prev;
      }

      const updated = [...prev.items];
      updated[existingIndex] = {
        ...item,
        isPinned: !item.isPinned,
        timestamp: Date.now(),
      };

      return { items: updated };
    });
  }, []);

  const removeRecent = useCallback((path: string) => {
    setState((prev) => ({
      items: prev.items.filter((item) => item.path !== path),
    }));
  }, []);

  const clearRecents = useCallback(() => {
    setState((prev) => ({
      items: prev.items.filter((item) => item.isPinned),
    }));
  }, []);

  return {
    recents,
    pinned,
    addRecent,
    togglePin,
    removeRecent,
    clearRecents,
  };
}

interface NavigationRecentsProps {
  className?: string;
  showClearButton?: boolean;
  onNavigate?: (path: string) => void;
}

export default function NavigationRecents({
  className,
  showClearButton = true,
  onNavigate,
}: NavigationRecentsProps) {
  const [, setLocation] = useLocation();
  const { recents, pinned, togglePin, removeRecent, clearRecents } = useNavigationRecents();
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const allItems = useMemo(() => {
    const sortedPinned = [...pinned].sort((a, b) => b.timestamp - a.timestamp);
    const sortedRecents = [...recents].sort((a, b) => b.timestamp - a.timestamp);
    return [...sortedPinned, ...sortedRecents];
  }, [pinned, recents]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setCanScrollLeft(target.scrollLeft > 0);
    setCanScrollRight(target.scrollLeft < target.scrollWidth - target.clientWidth - 1);
  }, []);

  const scrollLeft = useCallback(() => {
    const container = document.getElementById('nav-recents-scroll');
    if (container) {
      container.scrollBy({ left: -200, behavior: 'smooth' });
    }
  }, []);

  const scrollRight = useCallback(() => {
    const container = document.getElementById('nav-recents-scroll');
    if (container) {
      container.scrollBy({ left: 200, behavior: 'smooth' });
    }
  }, []);

  const handleNavigate = useCallback(
    (path: string) => {
      if (onNavigate) {
        onNavigate(path);
      } else {
        setLocation(path);
      }
    },
    [onNavigate, setLocation]
  );

  useEffect(() => {
    const container = document.getElementById('nav-recents-scroll');
    if (container) {
      setCanScrollRight(container.scrollWidth > container.clientWidth);
    }
  }, [allItems]);

  if (allItems.length === 0) {
    return null;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          'relative flex items-center gap-2 px-2 py-2',
          'bg-card/50 backdrop-blur-md border border-border rounded-xl',
          'shadow-elevated',
          className
        )}
        data-testid="navigation-recents"
      >
        <div className="flex items-center gap-1.5 px-2 border-r border-border mr-1">
          <Clock className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium text-muted-foreground hidden sm:inline">Recents</span>
        </div>

        {canScrollLeft && (
          <Button variant="ghost" size="icon" onClick={scrollLeft} className="absolute left-10 z-10 h-8 w-8 rounded-full backdrop-blur-sm border" data-testid="scroll-left-button" >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        )}

        <div
          id="nav-recents-scroll"
          className="flex items-center gap-2 overflow-x-auto scrollbar-hide scroll-smooth flex-1"
          onScroll={handleScroll}
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {allItems.map((item) => (
            <div
              key={item.path}
              className={cn(
                'group relative flex items-center gap-1.5 shrink-0',
                'px-3 py-2 rounded-lg cursor-pointer transition-all duration-200',
                'min-h-[44px] min-w-[44px]',
                item.isPinned
                  ? 'bg-primary hover:bg-primary/90 border border-accent/30 hover:border-accent/50'
                  : 'bg-muted/20 border border-border hover:bg-muted/30 hover:border-muted-foreground/30'
              )}
              onClick={() => handleNavigate(item.path)}
              data-testid={`recent-item-${item.path.replace(/\//g, '-')}`}
            >
              {item.isPinned && (
                <Star className="w-3.5 h-3.5 text-accent fill-warning shrink-0" />
              )}

              <span
                className={cn(
                  'text-sm font-medium truncate max-w-[120px]',
                  item.isPinned ? 'text-accent' : 'text-muted-foreground'
                )}
              >
                {item.title}
              </span>

              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(item.path);
                      }}
                      className={cn(
                        'p-1.5 rounded-md transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center',
                        item.isPinned
                          ? 'hover:bg-accent/20 text-accent'
                          : 'hover:bg-muted/50 text-muted-foreground hover:text-accent'
                      )}
                      data-testid={`pin-button-${item.path.replace(/\//g, '-')}`}
                    >
                      <Star
                        className={cn(
                          'w-3.5 h-3.5',
                          item.isPinned && 'fill-warning'
                        )}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {item.isPinned ? 'Unpin' : 'Pin to favorites'}
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRecent(item.path);
                      }}
                      className="p-1.5 rounded-md hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center"
                      data-testid={`remove-button-${item.path.replace(/\//g, '-')}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Remove
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          ))}
        </div>

        {canScrollRight && (
          <Button variant="ghost" size="icon" onClick={scrollRight} className="absolute right-10 z-10 h-8 w-8 rounded-full backdrop-blur-sm border" data-testid="scroll-right-button" >
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}

        {showClearButton && recents.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={clearRecents} className="shrink-0 h-9 w-9 rounded-lg border transition-colors" data-testid="clear-recents-button" >
                <Trash2 className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Clear recent history
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
