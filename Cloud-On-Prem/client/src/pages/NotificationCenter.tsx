import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Bell, Check, CheckCheck, Filter, X, Package, RefreshCw, Star, TrendingUp, Megaphone } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { PremiumHeader } from '@/pages/landing';
import { useUser } from '@/hooks/use-user';

type Notification = {
  id: string;
  userId: string;
  type: 'course_purchase' | 'course_version_update' | 'payout_processed' | 'review_posted' | 'system_announcement';
  title: string;
  message: string;
  isRead: boolean;
  relatedEntityId?: string;
  relatedEntityType?: string;
  createdAt: string;
};

export default function NotificationCenter() {
  const { user } = useUser();
  const { toast } = useToast();
  const [filterType, setFilterType] = useState<string>('all');

  const { data: adminCheck, isLoading: adminLoading } = useQuery<{ isAdmin: boolean; isSuperAdmin: boolean }>({
    queryKey: ['/api/admin/check'],
    retry: false,
    enabled: !!user,
  });

  const isAuthenticated = !!user;
  const isAdmin = adminCheck?.isAdmin || false;
  const isSuperAdmin = adminCheck?.isSuperAdmin || false;

  const { data, isLoading } = useQuery<{ notifications: Notification[]; unreadCount: number }>({
    queryKey: ['/api/notifications', filterType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterType !== 'all') params.append('type', filterType);

      const response = await fetch(`/api/notifications?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      return await apiRequest(`/api/notifications/${notificationId}/read`, {
        method: 'PUT',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'], exact: false });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: (error as Error).message,
        variant: 'destructive',
      });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/notifications/mark-all-read', {
        method: 'PUT',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'], exact: false });
      toast({
        title: 'Success',
        description: 'All notifications marked as read',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: (error as Error).message,
        variant: 'destructive',
      });
    },
  });

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'course_purchase':
        return <Package className="h-5 w-5 text-success" />;
      case 'course_version_update':
        return <RefreshCw className="h-5 w-5 text-secondary" />;
      case 'payout_processed':
        return <TrendingUp className="h-5 w-5 text-primary" />;
      case 'review_posted':
        return <Star className="h-5 w-5 text-warning" />;
      case 'system_announcement':
        return <Megaphone className="h-5 w-5 text-warning" />;
      default:
        return <Bell className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (!isAuthenticated) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-base text-foreground relative overflow-hidden">
        <PremiumHeader isAuthenticated={isAuthenticated} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} user={user} isAdminLoading={adminLoading} />
        
        <div className="container mx-auto p-[var(--container-padding)] pt-32 max-w-4xl relative z-10">
          <Skeleton className="h-10 sm:h-12 w-48 sm:w-64 mb-[var(--space-md)]" data-testid="skeleton-title" />
          <Skeleton className="h-5 sm:h-6 w-64 sm:w-96 mb-[var(--space-xl)]" data-testid="skeleton-description" />
          <div className="space-y-[var(--space-md)]">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28 sm:h-32 w-full" data-testid={`skeleton-notification-${i}`} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-base text-foreground relative overflow-hidden">
      <PremiumHeader isAuthenticated={isAuthenticated} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} user={user} isAdminLoading={adminLoading} />
      
      <div className="container mx-auto p-[var(--container-padding)] pt-28 sm:pt-32 max-w-4xl relative z-10">
        <div className="mb-[var(--space-xl)]">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-md)]">
            <div>
              <h1 className="text-[length:var(--text-3xl)] sm:text-[length:var(--text-4xl)] font-bold mb-[var(--space-sm)] text-foreground drop-shadow-elevated flex flex-wrap items-center gap-[var(--space-sm)]" data-testid="page-title">
                <Bell className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0" />
                <span>Notifications</span>
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="text-base sm:text-lg px-2 sm:px-3 py-0.5 sm:py-1" data-testid="badge-unread-count">
                    {unreadCount}
                  </Badge>
                )}
              </h1>
              <p className="text-muted-foreground text-[length:var(--text-base)] sm:text-[length:var(--text-lg)]" data-testid="page-description">
                Stay updated with your course activity and platform announcements
              </p>
            </div>
            {unreadCount > 0 && (
              <Button onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending}
                variant="outline"
                className="bg-muted hover:bg-muted/80 text-foreground border-border min-h-[44px] touch-manipulation w-full sm:w-auto"
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="h-4 w-4 mr-2" />
                Mark All Read
              </Button>
            )}
          </div>
        </div>

        <div className="mb-[var(--space-lg)] flex gap-[var(--space-md)]">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-64 bg-muted border-border text-foreground min-h-[44px] touch-manipulation" data-testid="select-filter-type">
              <Filter className="h-4 w-4 mr-2 flex-shrink-0" />
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Notifications</SelectItem>
              <SelectItem value="course_purchase">Course Purchases</SelectItem>
              <SelectItem value="course_version_update">Version Updates</SelectItem>
              <SelectItem value="payout_processed">Payouts</SelectItem>
              <SelectItem value="review_posted">Reviews</SelectItem>
              <SelectItem value="system_announcement">Announcements</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {notifications.length === 0 ? (
          <Card className="bg-card border-border" data-testid="empty-notifications">
            <CardContent className="py-[var(--space-2xl)] text-center p-[var(--card-padding)]">
              <Bell className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-[var(--space-md)] text-muted-foreground/50" />
              <p className="text-muted-foreground text-[length:var(--text-lg)]" data-testid="empty-notifications-message">No notifications yet</p>
              <p className="text-muted-foreground text-[length:var(--text-sm)] mt-[var(--space-sm)]" data-testid="empty-notifications-hint">
                You'll see course updates, purchases, and announcements here
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-[var(--space-md)]">
            {notifications.map((notification) => (
              <Card
                key={notification.id}
                className={`transition-all duration-200 ${
                  notification.isRead
                    ? 'bg-card border-border'
                    : 'bg-card/80 border-border shadow-elevated'
                }`}
                data-testid={`notification-card-${notification.id}`}
              >
                <CardHeader className="p-[var(--card-padding)] pb-[var(--space-sm)]">
                  <div className="flex items-start justify-between gap-[var(--space-sm)] sm:gap-[var(--space-md)]">
                    <div className="flex items-start gap-[var(--space-sm)] flex-1 min-w-0">
                      <div className="mt-1 flex-shrink-0">{getNotificationIcon(notification.type)}</div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className={`text-[length:var(--text-base)] sm:text-[length:var(--text-lg)] mb-1 ${notification.isRead ? 'text-muted-foreground' : 'text-foreground'}`} data-testid={`notification-title-${notification.id}`}>
                          {notification.title}
                        </CardTitle>
                        <CardDescription className={`text-[length:var(--text-sm)] text-muted-foreground`} data-testid={`notification-message-${notification.id}`}>
                          {notification.message}
                        </CardDescription>
                        <div className="flex flex-wrap items-center gap-[var(--space-sm)] mt-[var(--space-sm)]">
                          <span className="text-[length:var(--text-xs)] text-muted-foreground" data-testid={`notification-time-${notification.id}`}>
                            {formatTimestamp(notification.createdAt)}
                          </span>
                          <Badge variant="outline" className="text-[length:var(--text-xs)]" data-testid={`notification-type-${notification.id}`}>
                            {notification.type.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    {!notification.isRead && (
                      <Button size="sm" variant="ghost" onClick={() => markAsReadMutation.mutate(notification.id)}
                        disabled={markAsReadMutation.isPending}
                        className="text-foreground hover:bg-muted min-h-[44px] min-w-[44px] touch-manipulation flex-shrink-0"
                        data-testid={`button-mark-read-${notification.id}`}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                {notification.relatedEntityId && notification.relatedEntityType === 'course' && (
                  <>
                    <Separator className="bg-border" />
                    <CardContent className="p-[var(--card-padding)] pt-[var(--space-sm)]">
                      <Link href={`/courses/${notification.relatedEntityId}`}>
                        <Button variant="link" className="p-0 min-h-[44px] touch-manipulation text-[length:var(--text-sm)]" data-testid={`button-view-course-${notification.id}`}>
                          View Course →
                        </Button>
                      </Link>
                    </CardContent>
                  </>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
