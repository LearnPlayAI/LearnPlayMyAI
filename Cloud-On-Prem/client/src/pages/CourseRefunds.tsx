import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Check, X, Clock, BookOpen, User, Calendar, DollarSign, MessageSquare, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCurrencyDisplay, type CurrencyCode } from '@/hooks/useCurrencyDisplay';
import { DualCurrencyDisplay } from '@/components/CurrencyConversionTooltip';
import { CurrencyIndicatorBadge } from '@/components/CurrencyIndicatorBadge';
import { apiRequest, queryClient } from '@/lib/queryClient';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { tzFormat } from '@/utils/timezoneRuntime';


interface CourseRefund {
  id: string;
  purchaseId: string;
  userId: string;
  courseId: string;
  originalAmount: string;
  platformCommission: string;
  refundAmount: string;
  currency: CurrencyCode;
  status: 'pending' | 'approved' | 'declined';
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
  decisionReason?: string;
  userReason?: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  course?: {
    id: string;
    title: string;
    imageUrl?: string;
  };
  purchase?: {
    id: string;
    pricePaid: string;
    purchaseDate: string;
  };
}

export default function CourseRefunds() {
  const [activeTab, setActiveTab] = useState('pending');
  const { toast } = useToast();
  const { formatPrice, displayCurrency, isLoading: currencyLoading } = useCurrencyDisplay();
  
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [selectedRefund, setSelectedRefund] = useState<CourseRefund | null>(null);
  const [declineReason, setDeclineReason] = useState('');

  const { data: organization, isLoading: orgLoading } = useQuery<any>({
    queryKey: ['/api/my-organization'],
  });

  const orgId = organization?.id;

  const { data: refunds = [], isLoading: refundsLoading } = useQuery<CourseRefund[]>({
    queryKey: ['/api/organizations', orgId, 'refunds'],
    enabled: !!orgId,
  });

  const approveMutation = useMutation({
    mutationFn: async (refundId: string) => {
      return apiRequest(`/api/organizations/${orgId}/refunds/${refundId}/approve`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      toast({
        title: 'Refund Approved',
        description: 'The refund request has been approved successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'refunds'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve refund',
        variant: 'destructive',
      });
    },
  });

  const declineMutation = useMutation({
    mutationFn: async ({ refundId, reason }: { refundId: string; reason: string }) => {
      return apiRequest(`/api/organizations/${orgId}/refunds/${refundId}/decline`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      toast({
        title: 'Refund Declined',
        description: 'The refund request has been declined.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'refunds'] });
      setDeclineDialogOpen(false);
      setSelectedRefund(null);
      setDeclineReason('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to decline refund',
        variant: 'destructive',
      });
    },
  });

  const handleApprove = (refund: CourseRefund) => {
    approveMutation.mutate(refund.id);
  };

  const handleDeclineClick = (refund: CourseRefund) => {
    setSelectedRefund(refund);
    setDeclineReason('');
    setDeclineDialogOpen(true);
  };

  const handleConfirmDecline = () => {
    if (selectedRefund && declineReason.trim()) {
      declineMutation.mutate({
        refundId: selectedRefund.id,
        reason: declineReason.trim(),
      });
    }
  };

  const pendingRefunds = refunds.filter(r => r.status === 'pending');
  const approvedRefunds = refunds.filter(r => r.status === 'approved');
  const declinedRefunds = refunds.filter(r => r.status === 'declined');

  const getFilteredRefunds = () => {
    switch (activeTab) {
      case 'pending':
        return pendingRefunds;
      case 'approved':
        return approvedRefunds;
      case 'declined':
        return declinedRefunds;
      case 'all':
      default:
        return refunds;
    }
  };

  const getStatusBadge = (status: CourseRefund['status']) => {
    switch (status) {
      case 'pending':
        return (
          <Badge data-testid="badge-status-pending">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      case 'approved':
        return (
          <Badge data-testid="badge-status-approved">
            <Check className="w-3 h-3 mr-1" />
            Approved
          </Badge>
        );
      case 'declined':
        return (
          <Badge data-testid="badge-status-declined">
            <X className="w-3 h-3 mr-1" />
            Declined
          </Badge>
        );
    }
  };

  const isLoading = orgLoading || refundsLoading || currencyLoading;

  const renderRefundCard = (refund: CourseRefund) => (
    <Card
      key={refund.id}
      className="bg-card border-border hover:shadow-dialog hover:-translate-y-1 transition-all duration-300 backdrop-blur-sm"
      data-testid={`card-refund-${refund.id}`}
    >
      <CardContent className="p-6">
        <div className="flex gap-6">
          {refund.course?.imageUrl ? (
            <div className="w-32 h-24 rounded-lg overflow-hidden bg-muted flex-shrink-0">
              <img
                src={refund.course.imageUrl}
                alt={refund.course.title}
                className="w-full h-full object-cover"
                data-testid={`img-course-${refund.id}`}
              />
            </div>
          ) : (
            <div className="w-32 h-24 rounded-lg bg-surface-raised flex items-center justify-center flex-shrink-0">
              <BookOpen className="h-8 w-8 text-primary/60" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h3 className="text-lg font-semibold text-foreground truncate" data-testid={`text-course-title-${refund.id}`}>
                  {refund.course?.title || 'Unknown Course'}
                </h3>
                <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                  <User className="w-4 h-4" />
                  <span data-testid={`text-user-name-${refund.id}`}>
                    {refund.user?.firstName} {refund.user?.lastName}
                  </span>
                  <span className="text-muted-foreground">•</span>
                  <span data-testid={`text-user-email-${refund.id}`}>{refund.user?.email}</span>
                </div>
              </div>
              {getStatusBadge(refund.status)}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Purchase Date</div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground" data-testid={`text-purchase-date-${refund.id}`}>
                  <Calendar className="w-3 h-3" />
                  {refund.purchase?.purchaseDate
                    ? tzFormat(refund.purchase.purchaseDate, 'MMM dd, yyyy')
                    : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Price Paid</div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground" data-testid={`text-price-paid-${refund.id}`}>
                  <DollarSign className="w-3 h-3" />
                  {formatPrice(
                    refund.purchase?.pricePaid || refund.originalAmount,
                    refund.currency
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Refund Amount</div>
                <div className="flex items-center gap-1 text-sm font-medium text-success" data-testid={`text-refund-amount-${refund.id}`}>
                  <DualCurrencyDisplay
                    amount={refund.refundAmount}
                    fromCurrency={refund.currency}
                    showSettlement={true}
                    primarySize="sm"
                  />
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Request Date</div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground" data-testid={`text-request-date-${refund.id}`}>
                  <Clock className="w-3 h-3" />
                  {tzFormat(refund.requestedAt, 'MMM dd, yyyy')}
                </div>
              </div>
            </div>

            {refund.userReason && (
              <div className="mb-4 p-3 rounded-lg bg-muted border border-border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <MessageSquare className="w-3 h-3" />
                  User's Reason
                </div>
                <p className="text-sm text-muted-foreground" data-testid={`text-user-reason-${refund.id}`}>
                  {refund.userReason}
                </p>
              </div>
            )}

            {refund.status === 'declined' && refund.decisionReason && (
              <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-[var(--destructive)]/30">
                <div className="flex items-center gap-2 text-xs text-destructive mb-1">
                  <AlertCircle className="w-3 h-3" />
                  Decline Reason
                </div>
                <p className="text-sm text-destructive/80" data-testid={`text-decline-reason-${refund.id}`}>
                  {refund.decisionReason}
                </p>
              </div>
            )}

            {refund.status === 'pending' && (
              <div className="flex gap-3 mt-4">
                <Button onClick={() => handleApprove(refund)}
                  disabled={approveMutation.isPending}
                  className="bg-success hover:bg-success/90"
                  data-testid={`button-approve-${refund.id}`}
                >
                  <Check className="w-4 h-4 mr-2" />
                  Approve Refund
                </Button>
                <Button onClick={() => handleDeclineClick(refund)}
                  disabled={declineMutation.isPending}
                  variant="destructive"
                  data-testid={`button-decline-${refund.id}`}
                >
                  <X className="w-4 h-4 mr-2" />
                  Decline
                </Button>
              </div>
            )}

            {refund.decidedAt && (
              <div className="mt-3 text-xs text-muted-foreground" data-testid={`text-decided-at-${refund.id}`}>
                Decision made on {tzFormat(refund.decidedAt, 'MMM dd, yyyy \'at\' h:mm a')}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderSkeletons = () => (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex gap-6">
              <Skeleton className="w-32 h-24 rounded-lg" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
                <div className="grid grid-cols-4 gap-4">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const renderEmptyState = () => (
    <div className="text-center py-12" data-testid="text-empty-state">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
        <DollarSign className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium text-muted-foreground mb-2">No Refund Requests</h3>
      <p className="text-sm text-muted-foreground">
        {activeTab === 'pending'
          ? 'There are no pending refund requests to review.'
          : activeTab === 'approved'
          ? 'No refund requests have been approved yet.'
          : activeTab === 'declined'
          ? 'No refund requests have been declined.'
          : 'No refund requests found.'}
      </p>
    </div>
  );

  const filteredRefunds = getFilteredRefunds();

  return (
    <QuizAdminLayout
      title="Course Refunds"
      description="Review and manage refund requests for your courses"
    >
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground" data-testid="text-page-title">
              Course Refund Requests
            </h1>
            <p className="text-muted-foreground mt-1" data-testid="text-page-description">
              Review and manage refund requests from learners
            </p>
          </div>
          <div className="flex items-center gap-4">
            <CurrencyIndicatorBadge 
              showIcon={true}
              variant="outline"
              className="bg-card border-border text-muted-foreground"
            />
            <Card className="bg-card border-border">
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-warning" />
                  <div>
                    <div className="text-xl font-bold text-foreground" data-testid="text-pending-total">
                      {pendingRefunds.length}
                    </div>
                    <div className="text-xs text-muted-foreground">Pending</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-card border border-border">
            <TabsTrigger
              value="pending"
              data-testid="tab-pending"
            >
              Pending
              {pendingRefunds.length > 0 && (
                <Badge className="ml-2" data-testid="badge-pending-count" >
                  {pendingRefunds.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="approved"
              data-testid="tab-approved"
            >
              Approved
            </TabsTrigger>
            <TabsTrigger
              value="declined"
              data-testid="tab-declined"
            >
              Declined
            </TabsTrigger>
            <TabsTrigger
              value="all"
              data-testid="tab-all"
            >
              All
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="space-y-4">
            {isLoading ? (
              renderSkeletons()
            ) : filteredRefunds.length === 0 ? (
              renderEmptyState()
            ) : (
              <div className="space-y-4">
                {filteredRefunds.map(refund => renderRefundCard(refund))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={declineDialogOpen} onOpenChange={setDeclineDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground" data-testid="dialog-decline-title">
              Decline Refund Request
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Please provide a reason for declining this refund request. This will be shared with the user.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="decline-reason" className="text-muted-foreground mb-2 block">
              Reason for Declining
            </Label>
            <Textarea
              id="decline-reason"
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Enter the reason for declining this refund..."
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              data-testid="textarea-decline-reason"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="bg-muted border-border text-muted-foreground hover:bg-muted/80"
              data-testid="button-cancel-decline"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDecline}
              disabled={!declineReason.trim() || declineMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-decline"
            >
              {declineMutation.isPending ? 'Declining...' : 'Decline Refund'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </QuizAdminLayout>
  );
}
