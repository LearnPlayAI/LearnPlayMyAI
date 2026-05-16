import { useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { BookOpen, UserCog, LogOut, ChevronDown, Store, Trophy, Award, Receipt, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

export function UserMenu() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const logoutMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/auth/logout', {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.clear();
      setOpen(false);
      toast({
        title: 'Logged out',
        description: 'You have been successfully logged out.',
      });
      window.location.href = '/';
    },
    onError: (error: any) => {
      toast({
        title: 'Logout failed',
        description: error.message || 'Failed to logout. Please try again.',
        variant: 'destructive',
      });
    },
  });

  if (!isAuthenticated || !user) {
    return null;
  }

  const userInitials = user.firstName && user.lastName
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`
    : (user.firstName || user.username || user.email || 'U').charAt(0).toUpperCase();

  const userDisplayName = user.firstName && user.lastName
    ? `${user.firstName} ${user.lastName}`
    : user.firstName || user.lastName || user.username || user.email || 'User';
  const userAvatarSrc = user.avatarImageUrl
    ? (user.avatarImageUrl.startsWith('/')
      ? `/api/public-objects${user.avatarImageUrl}`
      : user.avatarImageUrl)
    : '';

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className={cn( "flex items-center gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg", "hover:bg-sidebar-accent/20 border border-sidebar-border/20", "transition-all duration-200 h-10 sm:h-auto", open && "bg-sidebar-accent/30 border-sidebar-border/50" )} data-testid="user-menu-trigger" >
          <Avatar className="w-7 h-7 sm:w-8 sm:h-8 border border-sidebar-border/50">
            {userAvatarSrc ? <AvatarImage src={userAvatarSrc} alt={userDisplayName} /> : null}
            <AvatarFallback className="bg-surface-raised text-xs sm:text-sm font-bold text-primary-foreground">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="hidden sm:flex flex-col items-start gap-0">
            <span className="text-xs sm:text-sm font-medium text-sidebar-foreground truncate max-w-[120px]">
              {userDisplayName}
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-200" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium text-foreground">{userDisplayName}</p>
          <p className="text-xs text-muted-foreground truncate">{user.email || user.username}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            setLocation('/browse-courses');
            setOpen(false);
          }}
          className="flex items-center gap-2 cursor-pointer"
          data-testid="user-menu-browse-marketplace"
        >
          <Store className="w-4 h-4" />
          <span>Browse Marketplace</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setLocation('/my-courses');
            setOpen(false);
          }}
          className="flex items-center gap-2 cursor-pointer"
          data-testid="user-menu-my-courses"
        >
          <BookOpen className="w-4 h-4" />
          <span>My Courses</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setLocation('/quiz-lobby');
            setOpen(false);
          }}
          className="flex items-center gap-2 cursor-pointer"
          data-testid="user-menu-gamification"
        >
          <Trophy className="w-4 h-4" />
          <span>Gamification</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setLocation('/certificates');
            setOpen(false);
          }}
          className="flex items-center gap-2 cursor-pointer"
          data-testid="user-menu-certificates"
        >
          <Award className="w-4 h-4" />
          <span>My Certificates</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setLocation('/invoices');
            setOpen(false);
          }}
          className="flex items-center gap-2 cursor-pointer"
          data-testid="user-menu-invoices"
        >
          <Receipt className="w-4 h-4" />
          <span>Invoices</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setLocation('/profile');
            setOpen(false);
          }}
          className="flex items-center gap-2 cursor-pointer"
          data-testid="user-menu-profile"
        >
          <UserCog className="w-4 h-4" />
          <span>Profile & Settings</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            window.location.href = '/';
            setOpen(false);
          }}
          className="flex items-center gap-2 cursor-pointer"
          data-testid="user-menu-homepage"
        >
          <Home className="w-4 h-4" />
          <span>Homepage</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
          data-testid="user-menu-logout"
        >
          <LogOut className="w-4 h-4" />
          <span>{logoutMutation.isPending ? 'Logging out...' : 'Logout'}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
