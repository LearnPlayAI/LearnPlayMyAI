import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { BillingCard } from "@/components/BillingCard";
import { WebhookEventSkeleton } from "@/components/BillingSkeletons";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { Server, CheckCircle, XCircle, Clock } from "lucide-react";
import QuizAdminLayout from '@/components/QuizAdminLayout';

interface WebhookEvent {
  id: string;
  eventType: string;
  checkoutId: string | null;
  status: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  payload: any;
  error: string | null;
  createdAt: string;
}

export default function WebhookAdmin() {
  const { isSuperAdmin, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isSuperAdmin) {
      setLocation("/");
    }
  }, [isSuperAdmin, isLoading, setLocation]);

  const { data: eventsData, isLoading: isLoadingEvents } = useQuery<{ events: WebhookEvent[]; total: number }>({
    queryKey: ['/api/webhooks/events', { limit: '50', offset: '0' }],
    queryFn: async () => {
      const response = await fetch('/api/webhooks/events?limit=50&offset=0');
      if (!response.ok) throw new Error('Failed to fetch webhook events');
      return response.json();
    },
    enabled: isSuperAdmin,
  });

  const events = eventsData?.events || [];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'succeeded':
      case 'processed':
        return <CheckCircle className="h-5 w-5 text-success" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-warning" />;
      default:
        return <Server className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'succeeded':
      case 'processed':
        return 'default';
      case 'pending':
        return 'secondary';
      case 'failed':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  if (isLoading) {
    return (
      <QuizAdminLayout
        title="Webhook Events"
        description="Monitor and manage payment webhook events"
        activeSection="webhooks"
      >
        <div className="text-center text-foreground text-lg">Loading...</div>
      </QuizAdminLayout>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  if (isLoadingEvents) {
    return (
      <QuizAdminLayout
        title="Webhook Events"
        description="Monitor and manage payment webhook events"
        activeSection="webhooks"
      >
        <div className="mt-6">
          <WebhookEventSkeleton />
        </div>
      </QuizAdminLayout>
    );
  }

  const totalEvents = events.length;
  const succeededEvents = events.filter(e => e.status === 'succeeded' || e.status === 'processed').length;
  const failedEvents = events.filter(e => e.status === 'failed').length;
  const pendingEvents = events.filter(e => e.status === 'pending').length;

  return (
    <QuizAdminLayout
      title="Webhook Events"
      description="Monitor and manage payment webhook events"
      activeSection="webhooks"
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <BillingCard title="Total Events" testId="card-total-events">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-3xl font-bold">{totalEvents}</p>
              <p className="text-sm text-muted-foreground">All time</p>
            </div>
            <Server className="h-8 w-8 text-primary opacity-50" />
          </div>
        </BillingCard>

        <BillingCard title="Succeeded" testId="card-succeeded-events">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-3xl font-bold text-success">{succeededEvents}</p>
              <p className="text-sm text-muted-foreground">
                {totalEvents > 0 ? `${Math.round((succeededEvents / totalEvents) * 100)}%` : '0%'}
              </p>
            </div>
            <CheckCircle className="h-8 w-8 text-success opacity-50" />
          </div>
        </BillingCard>

        <BillingCard title="Failed" testId="card-failed-events">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-3xl font-bold text-destructive">{failedEvents}</p>
              <p className="text-sm text-muted-foreground">
                {totalEvents > 0 ? `${Math.round((failedEvents / totalEvents) * 100)}%` : '0%'}
              </p>
            </div>
            <XCircle className="h-8 w-8 text-destructive opacity-50" />
          </div>
        </BillingCard>

        <BillingCard title="Pending" testId="card-pending-events">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-3xl font-bold text-warning">{pendingEvents}</p>
              <p className="text-sm text-muted-foreground">In progress</p>
            </div>
            <Clock className="h-8 w-8 text-warning opacity-50" />
          </div>
        </BillingCard>
      </div>

      <div className="mt-8">
        <BillingCard
          title={`Webhook Events (${events.length})`}
          description="Recent webhook event log"
          testId="card-webhook-events"
        >
          {events.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No webhook events found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  data-testid={`webhook-event-${event.id}`}
                >
                  <div className="pt-1">
                    {getStatusIcon(event.status)}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <p className="font-semibold">{event.eventType}</p>
                        <Badge variant={getStatusVariant(event.status)}>
                          {event.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {event.checkoutId && (
                      <p className="text-sm text-muted-foreground">
                        Checkout ID: <span className="font-mono">{event.checkoutId}</span>
                      </p>
                    )}
                    {event.attemptCount > 1 && (
                      <p className="text-sm text-muted-foreground">
                        Attempts: {event.attemptCount}
                        {event.lastAttemptAt && (
                          <span> (Last: {new Date(event.lastAttemptAt).toLocaleString()})</span>
                        )}
                      </p>
                    )}
                    {event.error && (
                      <div className="p-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
                        Error: {event.error}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </BillingCard>
      </div>
    </QuizAdminLayout>
  );
}
