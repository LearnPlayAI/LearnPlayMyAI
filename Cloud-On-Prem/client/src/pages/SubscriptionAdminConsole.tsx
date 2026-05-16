import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useCurrencyPreference } from '@/hooks/useCurrencyPreference';
import { Search, RefreshCw, AlertCircle, ChevronDown, ChevronUp, PlayCircle, Calendar, User, Building, CreditCard, History, Edit } from 'lucide-react';

import QuizAdminLayout from '@/components/QuizAdminLayout';
import { tzFormat } from '@/utils/timezoneRuntime';

interface Subscription {
  id: string;
  userId: string;
  organizationId: string;
  planId: string;
  status: string;
  createdAt: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelledAt: string | null;
  suspendedAt: string | null;
  userName?: string;
  organizationName?: string;
  planName?: string;
  planPrice?: string;
  planCurrency?: string;
  planInterval?: string;
}

interface SubscriptionEvent {
  id: string;
  subscriptionId: string;
  eventType: string;
  previousStatus: string | null;
  newStatus: string | null;
  metadata: any;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-success',
  grace: 'bg-warning',
  past_due: 'bg-warning/80',
  suspended: 'bg-destructive',
  cancelled: 'bg-muted',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  grace: 'Grace Period',
  past_due: 'Past Due',
  suspended: 'Suspended',
  cancelled: 'Cancelled',
};

export default function SubscriptionAdminConsole() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { formatPrice } = useCurrencyPreference();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedSubscriptionId, setExpandedSubscriptionId] = useState<string | null>(null);
  const [showEventsFor, setShowEventsFor] = useState<string | null>(null);
  const [showStatusEditorFor, setShowStatusEditorFor] = useState<string | null>(null);
  const [showReactivateConfirmFor, setShowReactivateConfirmFor] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<string>('');
  const [statusChangeReason, setStatusChangeReason] = useState<string>('');

  const { data: userRoles } = useQuery<{ isSuperAdmin: boolean }>({
    queryKey: ['/api/user/roles'],
  });

  // Redirect if not SuperAdmin
  useEffect(() => {
    if (userRoles && !userRoles.isSuperAdmin) {
      navigate('/');
    }
  }, [userRoles, navigate]);

  const { data: subscriptions, isLoading, refetch } = useQuery<Subscription[]>({
    queryKey: ['/api/superadmin/subscriptions', statusFilter],
    enabled: userRoles?.isSuperAdmin,
  });

  const { data: events, isLoading: eventsLoading } = useQuery<SubscriptionEvent[]>({
    queryKey: ['/api/superadmin/subscriptions', showEventsFor, 'events'],
    enabled: !!showEventsFor,
    refetchOnMount: 'always', // Force fresh fetch every time to prevent stale cached data
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ subscriptionId, status, reason }: { subscriptionId: string; status: string; reason: string }) => {
      return await apiRequest(`/api/superadmin/subscriptions/${subscriptionId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      toast({
        title: 'Status updated',
        description: 'Subscription status has been updated successfully.',
      });
      setShowStatusEditorFor(null);
      setExpandedSubscriptionId(null);
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/subscriptions'] });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: 'Update failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      return await apiRequest(`/api/superadmin/subscriptions/${subscriptionId}/reactivate`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      toast({
        title: 'Subscription reactivated',
        description: 'The subscription has been successfully reactivated.',
      });
      setShowReactivateConfirmFor(null);
      setExpandedSubscriptionId(null);
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/subscriptions'] });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: 'Reactivation failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  if (!userRoles?.isSuperAdmin && !isLoading) {
    return null;
  }

  const filteredSubscriptions = subscriptions?.filter(sub => {
    const matchesSearch = !searchQuery || 
      sub.userName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.organizationName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
    return matchesSearch && matchesStatus;
  }) || [];

  const handleToggleExpand = (subscriptionId: string) => {
    if (expandedSubscriptionId === subscriptionId) {
      setExpandedSubscriptionId(null);
      setShowEventsFor(null);
      setShowStatusEditorFor(null);
      setShowReactivateConfirmFor(null);
    } else {
      setExpandedSubscriptionId(subscriptionId);
      setShowEventsFor(null);
      setShowStatusEditorFor(null);
      setShowReactivateConfirmFor(null);
    }
  };

  const handleShowEvents = (subscriptionId: string) => {
    // Invalidate cache to ensure fresh data when switching between subscriptions
    queryClient.invalidateQueries({ 
      queryKey: ['/api/superadmin/subscriptions', subscriptionId, 'events'] 
    });
    setShowEventsFor(subscriptionId);
    setShowStatusEditorFor(null);
    setShowReactivateConfirmFor(null);
  };

  const handleShowStatusEditor = (subscription: Subscription) => {
    setNewStatus(subscription.status);
    setStatusChangeReason('');
    setShowStatusEditorFor(subscription.id);
    setShowEventsFor(null);
    setShowReactivateConfirmFor(null);
  };

  const handleShowReactivateConfirm = (subscriptionId: string) => {
    setShowReactivateConfirmFor(subscriptionId);
    setShowEventsFor(null);
    setShowStatusEditorFor(null);
  };

  const confirmStatusUpdate = (subscriptionId: string) => {
    if (newStatus && statusChangeReason.trim()) {
      updateStatusMutation.mutate({ subscriptionId, status: newStatus, reason: statusChangeReason });
    }
  };

  const confirmReactivate = (subscriptionId: string) => {
    reactivateMutation.mutate(subscriptionId);
  };

  return (
    <QuizAdminLayout
      title="Subscription Console"
      description="Manage platform subscriptions"
      activeSection="subscription-console"
    >
      <div className="space-y-6" data-testid="page-subscription-admin-console">
        {/* Filters & Search */}
        <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by user, organization, or subscription ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-subscriptions"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48" data-testid="select-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="grace">Grace Period</SelectItem>
                <SelectItem value="past_due">Past Due</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => refetch()}
              variant="outline"
              data-testid="button-refresh"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Subscription List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : filteredSubscriptions.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No subscriptions found matching your criteria.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredSubscriptions.map(subscription => {
            const isExpanded = expandedSubscriptionId === subscription.id;
            
            return (
              <Card key={subscription.id} data-testid={`subscription-card-${subscription.id}`}>
                <CardHeader>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-lg">
                          {subscription.planName || 'Unknown Plan'}
                        </CardTitle>
                        <Badge className={STATUS_COLORS[subscription.status]}>
                          {STATUS_LABELS[subscription.status]}
                        </Badge>
                      </div>
                      <CardDescription>
                        Subscription ID: {subscription.id}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleToggleExpand(subscription.id)}
                        data-testid={`button-toggle-expand-${subscription.id}`}
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4 mr-2" /> : <ChevronDown className="h-4 w-4 mr-2" />}
                        {isExpanded ? 'Collapse' : 'Expand'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <User className="h-4 w-4" />
                        User
                      </div>
                      <div className="font-medium">{subscription.userName || 'Unknown'}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <Building className="h-4 w-4" />
                        Organization
                      </div>
                      <div className="font-medium">{subscription.organizationName || 'Unknown'}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <CreditCard className="h-4 w-4" />
                        Plan Details
                      </div>
                      <div className="font-medium">
                        {formatPrice(subscription.planPrice || '0', (subscription.planCurrency || 'ZAR') as 'ZAR' | 'USD' | 'EUR')} / {subscription.planInterval}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <Calendar className="h-4 w-4" />
                        Current Period
                      </div>
                      <div className="text-sm">
                        {tzFormat(subscription.currentPeriodStart, 'MMM d, yyyy')} - {tzFormat(subscription.currentPeriodEnd, 'MMM d, yyyy')}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground mb-2">Created</div>
                      <div className="text-sm">{tzFormat(subscription.createdAt, 'MMM d, yyyy HH:mm')}</div>
                    </div>
                    {subscription.cancelledAt && (
                      <div>
                        <div className="text-sm text-muted-foreground mb-2">Cancelled</div>
                        <div className="text-sm">{tzFormat(subscription.cancelledAt, 'MMM d, yyyy HH:mm')}</div>
                      </div>
                    )}
                    {subscription.suspendedAt && (
                      <div>
                        <div className="text-sm text-muted-foreground mb-2">Suspended</div>
                        <div className="text-sm">{tzFormat(subscription.suspendedAt, 'MMM d, yyyy HH:mm')}</div>
                      </div>
                    )}
                  </div>

                  {/* Expanded Section - Admin Actions */}
                  {isExpanded && (
                    <div className="mt-6 pt-6 border-t space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant={showEventsFor === subscription.id ? 'default' : 'outline'} onClick={() => handleShowEvents(subscription.id)}
                          data-testid={`button-view-events-${subscription.id}`}
                        >
                          <History className="h-4 w-4 mr-2" />
                          Event History
                        </Button>
                        <Button size="sm" variant={showStatusEditorFor === subscription.id ? 'default' : 'outline'} onClick={() => handleShowStatusEditor(subscription)}
                          data-testid={`button-change-status-${subscription.id}`}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Change Status
                        </Button>
                        {(subscription.status === 'cancelled' || subscription.status === 'suspended') && (
                          <Button size="sm" variant={showReactivateConfirmFor === subscription.id ? 'default' : 'outline'} onClick={() => handleShowReactivateConfirm(subscription.id)}
                            data-testid={`button-reactivate-${subscription.id}`}
                          >
                            <PlayCircle className="h-4 w-4 mr-2" />
                            Reactivate
                          </Button>
                        )}
                      </div>

                      {/* Event History Card */}
                      {showEventsFor === subscription.id && (
                        <Card className="bg-muted/50">
                          <CardHeader>
                            <CardTitle className="text-base">Event History</CardTitle>
                            <CardDescription>Subscription lifecycle events</CardDescription>
                          </CardHeader>
                          <CardContent>
                            {eventsLoading ? (
                              <div className="space-y-2">
                                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
                              </div>
                            ) : !events || events.length === 0 ? (
                              <p className="text-center text-muted-foreground py-4">No events found</p>
                            ) : (
                              <div className="space-y-3">
                                {events.filter(event => event.subscriptionId === subscription.id).map(event => (
                                  <div key={event.id} className="p-3 bg-background rounded border">
                                    <div className="flex items-start justify-between">
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                          <Badge variant="outline">{event.eventType}</Badge>
                                          {event.previousStatus && event.newStatus && (
                                            <span className="text-sm text-muted-foreground">
                                              {STATUS_LABELS[event.previousStatus]} → {STATUS_LABELS[event.newStatus]}
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                          {tzFormat(event.createdAt, 'MMM d, yyyy HH:mm:ss')}
                                        </p>
                                        {event.metadata && Object.keys(event.metadata).length > 0 && (
                                          <div className="mt-2 space-y-1">
                                            {event.metadata.actorRole && (
                                              <p className="text-xs text-muted-foreground">
                                                <span className="font-medium">Actor:</span> {event.metadata.actorUsername || 'Unknown'} ({event.metadata.actorRole})
                                              </p>
                                            )}
                                            {event.metadata.reason && (
                                              <p className="text-xs text-muted-foreground">
                                                <span className="font-medium">Reason:</span> {event.metadata.reason}
                                              </p>
                                            )}
                                            {event.metadata.timestamp && (
                                              <p className="text-xs text-muted-foreground">
                                                <span className="font-medium">Action Time:</span> {tzFormat(event.metadata.timestamp, 'MMM d, yyyy HH:mm:ss')}
                                              </p>
                                            )}
                                            <details className="text-xs">
                                              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Full metadata</summary>
                                              <pre className="bg-muted p-2 rounded mt-1 overflow-x-auto">
                                                {JSON.stringify(event.metadata, null, 2)}
                                              </pre>
                                            </details>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      {/* Status Editor Card */}
                      {showStatusEditorFor === subscription.id && (
                        <Card className="bg-muted/50">
                          <CardHeader>
                            <CardTitle className="text-base">Change Subscription Status</CardTitle>
                            <CardDescription>Update the status of this subscription</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div>
                              <label className="text-sm font-medium mb-2 block">Current Status</label>
                              <Badge className={STATUS_COLORS[subscription.status]}>
                                {STATUS_LABELS[subscription.status]}
                              </Badge>
                            </div>
                            <div>
                              <label className="text-sm font-medium mb-2 block">New Status</label>
                              <Select value={newStatus} onValueChange={setNewStatus}>
                                <SelectTrigger data-testid="select-new-status">
                                  <SelectValue placeholder="Select new status" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="active">Active</SelectItem>
                                  <SelectItem value="grace">Grace Period</SelectItem>
                                  <SelectItem value="past_due">Past Due</SelectItem>
                                  <SelectItem value="suspended">Suspended</SelectItem>
                                  <SelectItem value="cancelled">Cancelled</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="text-sm font-medium mb-2 block">Reason (Required)</label>
                              <textarea
                                value={statusChangeReason}
                                onChange={(e) => setStatusChangeReason(e.target.value)}
                                placeholder="Enter reason for status change (required for audit trail)..."
                                className="w-full min-h-[80px] p-2 rounded-md border border-input bg-background text-sm"
                                data-testid="textarea-status-change-reason"
                              />
                            </div>
                            <Alert>
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription>
                                Manual status changes should be used with caution. This will override the billing scheduler's automated status management. Reason will be logged for audit purposes.
                              </AlertDescription>
                            </Alert>
                            <div className="flex gap-2">
                              <Button variant="outline" onClick={() => setShowStatusEditorFor(null)}
                                data-testid="button-cancel-status-change"
                              >
                                Cancel
                              </Button>
                              <Button onClick={() => confirmStatusUpdate(subscription.id)}
                                disabled={updateStatusMutation.isPending || newStatus === subscription.status || !statusChangeReason.trim()}
                                data-testid="button-confirm-status-change"
                              >
                                {updateStatusMutation.isPending ? 'Updating...' : 'Update Status'}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Reactivate Confirmation Card */}
                      {showReactivateConfirmFor === subscription.id && (
                        <Card className="bg-muted/50">
                          <CardHeader>
                            <CardTitle className="text-base">Reactivate Subscription</CardTitle>
                            <CardDescription>This will restore the subscription to active status</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <Alert>
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription>
                                Reactivating will set status to "active" and extend the current period based on the plan interval ({subscription.planInterval}).
                                The subscription will be eligible for automatic billing.
                              </AlertDescription>
                            </Alert>
                            <div className="flex gap-2">
                              <Button variant="outline" onClick={() => setShowReactivateConfirmFor(null)}
                                data-testid="button-cancel-reactivate"
                              >
                                Cancel
                              </Button>
                              <Button onClick={() => confirmReactivate(subscription.id)}
                                disabled={reactivateMutation.isPending}
                                data-testid="button-confirm-reactivate"
                              >
                                {reactivateMutation.isPending ? 'Reactivating...' : 'Confirm Reactivation'}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      </div>
    </QuizAdminLayout>
  );
}
