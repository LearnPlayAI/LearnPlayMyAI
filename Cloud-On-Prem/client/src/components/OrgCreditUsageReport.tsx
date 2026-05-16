import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Users,
  Calendar,
  Filter,
  ChevronLeft,
  ChevronRight,
  X,
  Coins,
  Activity,
  ArrowUpRight,
  ArrowDownLeft,
  Building2,
  User,
  Download,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Link } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { LP_CREDITS_NAME, LP_CREDITS_SHORT } from '@shared/creditConstants';
import { cn } from '@/lib/utils';
import type { OrgCreditActivityType } from '@shared/schema';
import { tzFormat } from '@/utils/timezoneRuntime';

const ITEMS_PER_PAGE = 20;

const ACTIVITY_TYPE_LABELS: Record<OrgCreditActivityType, string> = {
  lesson_generation: 'Lesson Generation',
  quiz_generation: 'Quiz Generation',
  thumbnail_generation: 'Thumbnail Generation',
  course_framework: 'Course Framework',
  lesson_feedback: 'Lesson Feedback',
  ai_content_improvement: 'AI Content Improvement',
  purchase: 'Credit Purchase',
  refund: 'Refund',
  adjustment: 'Adjustment',
  trial_grant: 'Trial Grant',
  content_translation: 'Content Translation',
  topic_analysis: 'Topic Analysis',
};

const ACTIVITY_TYPE_COLORS: Record<OrgCreditActivityType, string> = {
  lesson_generation: 'bg-primary/10 text-primary border-border',
  quiz_generation: 'bg-primary/10 text-primary border-border',
  thumbnail_generation: 'bg-destructive/10 text-destructive border-destructive/20',
  course_framework: 'bg-primary/10 text-primary border-border',
  lesson_feedback: 'bg-primary/10 text-primary border-border',
  ai_content_improvement: 'bg-success/10 text-success border-success/20',
  purchase: 'bg-success/10 text-success border-success/20',
  refund: 'bg-warning/10 text-warning border-[var(--warning)]/20',
  adjustment: 'bg-warning/10 text-warning border-[var(--warning)]/20',
  trial_grant: 'bg-primary/10 text-primary border-border',
  content_translation: 'bg-primary/10 text-primary border-border',
  topic_analysis: 'bg-warning/10 text-warning border-[var(--warning)]/20',
};

type CreditSource = 'all' | 'org' | 'personal';

const SOURCE_LABELS: Record<CreditSource, string> = {
  all: 'All Sources',
  org: 'Organization Credits',
  personal: 'Personal Credits',
};

interface BalanceData {
  organizationId: string;
  organizationName: string;
  balance: number;
  isEnabled: boolean;
  allowTeachersToSpendCredits: boolean;
}

interface CombinedTransactionData {
  id: string;
  source: 'org' | 'personal';
  userId: string;
  actorUser?: {
    gamerName: string;
    email: string;
  };
  transactionType: string;
  activityType: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  metadata?: Record<string, unknown> & {
    lessonId?: string;
    courseId?: string;
    quizId?: string;
    description?: string;
    lessonTitle?: string;
    courseTitle?: string;
    quizTitle?: string;
  };
  createdAt: string;
  enrichedDetails?: {
    lessonName: string | null;
    courseName: string | null;
    quizName: string | null;
  };
}

interface CombinedTransactionsResponse {
  transactions: CombinedTransactionData[];
  total: number;
  hasMore: boolean;
  breakdown: {
    orgTotal: number;
    userTotal: number;
  };
}

interface CombinedSummaryData {
  currentBalance: number;
  orgCreditsAdded: number;
  orgCreditsUsed: number;
  personalCreditsAdded: number;
  personalCreditsUsed: number;
  totalCreditsAdded: number;
  totalCreditsUsed: number;
  orgTransactionCount: number;
  personalTransactionCount: number;
  totalTransactionCount: number;
  topSpenders: { userId: string; gamerName: string; totalSpent: number }[];
  activityBreakdown: { activityType: OrgCreditActivityType; count: number; totalAmount: number }[];
}

interface OrgMember {
  id: string;
  gamerName: string;
  email: string;
}

interface OrgCreditUsageReportProps {
  organizationId?: string;
}

function isPodcastGenerationTransaction(tx: CombinedTransactionData): boolean {
  const description = String(tx.description || "").toLowerCase();
  const correlationId = String((tx.metadata as any)?.correlationId || "").toLowerCase();
  return (
    tx.activityType === "lesson_generation" &&
    (
      description.includes("podcast generation") ||
      correlationId.includes("podcast-") ||
      typeof (tx.metadata as any)?.actualElevenCharactersUsed === "number"
    )
  );
}

function getActivityLabel(tx: CombinedTransactionData): string {
  if (isPodcastGenerationTransaction(tx)) return "Podcast Generation";
  return ACTIVITY_TYPE_LABELS[tx.activityType as OrgCreditActivityType] || tx.activityType;
}

function getPodcastProviderCostText(tx: CombinedTransactionData): string | null {
  if (!isPodcastGenerationTransaction(tx)) return null;
  const chars = Number((tx.metadata as any)?.actualElevenCharactersUsed);
  if (Number.isFinite(chars) && chars > 0) {
    return `ElevenLabs reported usage: ${chars.toLocaleString()} chars`;
  }
  return "ElevenLabs reported usage";
}

function downloadTransactionsCSV(transactions: CombinedTransactionData[]) {
  if (!transactions || transactions.length === 0) return;
  
  const headers = ['Date', 'Time', 'Source', 'User', 'Email', 'Activity', 'Amount', 'Balance After', 'Description'];
  const csvContent = [
    headers.join(','),
    ...transactions.map(tx => {
      const date = new Date(tx.createdAt);
      return [
        tzFormat(date, 'yyyy-MM-dd'),
        tzFormat(date, 'HH:mm:ss'),
        tx.source === 'org' ? 'Organization' : 'Personal',
        `"${(tx.actorUser?.gamerName || 'Unknown').replace(/"/g, '""')}"`,
        `"${(tx.actorUser?.email || '').replace(/"/g, '""')}"`,
        getActivityLabel(tx),
        tx.amount,
        tx.balanceAfter,
        `"${((getPodcastProviderCostText(tx) || tx.description || '')).replace(/"/g, '""')}"`,
      ].join(',');
    })
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `credit_usage_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}

export default function OrgCreditUsageReport({ organizationId: propOrgId }: OrgCreditUsageReportProps) {
  const { data: user } = useQuery<any>({ queryKey: ['/api/auth/user'] });
  const { impersonatedOrganization, effectiveOrganizationId } = useAuth();
  
  const organizationId = propOrgId || impersonatedOrganization?.id || effectiveOrganizationId || user?.organizationId;
  
  const [activityTypeFilter, setActivityTypeFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<CreditSource>('all');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedTransaction, setSelectedTransaction] = useState<CombinedTransactionData | null>(null);

  const offset = useMemo(() => (currentPage - 1) * ITEMS_PER_PAGE, [currentPage]);

  const { data: balanceData, isLoading: balanceLoading } = useQuery<BalanceData>({
    queryKey: ['/api/org-wallet', organizationId, 'balance'],
    queryFn: async () => {
      const response = await fetch(`/api/org-wallet/${organizationId}/balance`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Failed to fetch balance');
      return response.json();
    },
    enabled: !!organizationId,
  });

  const buildTransactionParams = () => {
    const params = new URLSearchParams();
    params.set('limit', String(ITEMS_PER_PAGE));
    params.set('offset', String(offset));
    params.set('source', sourceFilter);
    if (startDate) params.set('startDate', startDate.toISOString());
    if (endDate) params.set('endDate', endDate.toISOString());
    if (activityTypeFilter !== 'all') params.set('activityType', activityTypeFilter);
    if (userFilter !== 'all') params.set('actorUserId', userFilter);
    return params.toString();
  };

  const { data: transactionsData, isLoading: transactionsLoading } = useQuery<CombinedTransactionsResponse>({
    queryKey: ['/api/org-wallet', organizationId, 'combined-transactions', sourceFilter, activityTypeFilter, userFilter, startDate?.toISOString(), endDate?.toISOString(), offset],
    queryFn: async () => {
      const params = buildTransactionParams();
      const response = await fetch(`/api/org-wallet/${organizationId}/combined-transactions?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch transactions');
      return response.json();
    },
    enabled: !!organizationId,
  });

  const buildSummaryParams = () => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate.toISOString());
    if (endDate) params.set('endDate', endDate.toISOString());
    return params.toString();
  };

  const { data: summaryData, isLoading: summaryLoading } = useQuery<CombinedSummaryData>({
    queryKey: ['/api/org-wallet', organizationId, 'combined-summary', startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      const params = buildSummaryParams();
      const response = await fetch(`/api/org-wallet/${organizationId}/combined-summary?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch summary');
      return response.json();
    },
    enabled: !!organizationId,
  });

  const { data: orgMembers = [] } = useQuery<OrgMember[]>({
    queryKey: ['/api/admin/organizations', organizationId, 'users'],
    enabled: !!organizationId,
  });

  const transactions = transactionsData?.transactions || [];
  const totalPages = Math.ceil((transactionsData?.total || 0) / ITEMS_PER_PAGE);

  const hasFilters = activityTypeFilter !== 'all' || userFilter !== 'all' || sourceFilter !== 'all' || startDate || endDate;

  const clearFilters = () => {
    setActivityTypeFilter('all');
    setUserFilter('all');
    setSourceFilter('all');
    setStartDate(undefined);
    setEndDate(undefined);
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">No organization context available</p>
      </div>
    );
  }

  const isLoading = balanceLoading || summaryLoading;

  return (
    <div className="space-y-6">
      <Card className="bg-primary/10 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Organization Credit Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">
                {balanceData?.organizationName || 'Organization'}
              </p>
              {balanceLoading ? (
                <Skeleton className="h-10 w-32" />
              ) : (
                <p className="text-4xl font-bold" data-testid="org-balance">
                  {balanceData?.balance?.toLocaleString() || 0} {LP_CREDITS_SHORT}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {balanceData?.isEnabled && (
                <Badge variant="outline" >
                  Org Wallet Enabled
                </Badge>
              )}
              {balanceData?.allowTeachersToSpendCredits && (
                <Badge variant="outline" >
                  Instructors Can Spend
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-success/10">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Added</p>
                {summaryLoading ? (
                  <Skeleton className="h-7 w-20" />
                ) : (
                  <p className="text-2xl font-bold text-success" data-testid="total-added">
                    +{summaryData?.totalCreditsAdded?.toLocaleString() || 0}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-destructive/10">
                <TrendingDown className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Spent</p>
                {summaryLoading ? (
                  <Skeleton className="h-7 w-20" />
                ) : (
                  <p className="text-2xl font-bold text-destructive" data-testid="total-spent">
                    -{summaryData?.totalCreditsUsed?.toLocaleString() || 0}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Org Spent</p>
                {summaryLoading ? (
                  <Skeleton className="h-7 w-20" />
                ) : (
                  <p className="text-2xl font-bold text-primary" data-testid="org-spent">
                    -{summaryData?.orgCreditsUsed?.toLocaleString() || 0}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Personal Spent</p>
                {summaryLoading ? (
                  <Skeleton className="h-7 w-20" />
                ) : (
                  <p className="text-2xl font-bold text-primary" data-testid="personal-spent">
                    -{summaryData?.personalCreditsUsed?.toLocaleString() || 0}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
                <Activity className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Transactions</p>
                {summaryLoading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <p className="text-2xl font-bold" data-testid="transaction-count">
                    {summaryData?.totalTransactionCount?.toLocaleString() || 0}
                  </p>
                )}
              </div>
            </div>
            {!summaryLoading && (
              <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {summaryData?.orgTransactionCount || 0} org
                </span>
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {summaryData?.personalTransactionCount || 0} personal
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-4 w-4" />
              Top Spenders (Combined)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : summaryData?.topSpenders?.length ? (
              <div className="space-y-3">
                {summaryData.topSpenders.slice(0, 5).map((spender, index) => (
                  <div key={spender.userId} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-medium">
                        {index + 1}
                      </span>
                      <span className="font-medium truncate max-w-[150px]">{spender.gamerName || 'Unknown'}</span>
                    </div>
                    <Badge variant="outline" >
                      -{spender.totalSpent.toLocaleString()}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-4">No spending data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Coins className="h-4 w-4" />
              Activity Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : summaryData?.activityBreakdown?.length ? (
              <div className="space-y-3">
                {summaryData.activityBreakdown
                  .sort((a, b) => b.totalAmount - a.totalAmount)
                  .slice(0, 6)
                  .map((activity) => {
                    const maxAmount = Math.max(...summaryData.activityBreakdown.map(a => a.totalAmount));
                    const percentage = maxAmount > 0 ? (activity.totalAmount / maxAmount) * 100 : 0;
                    
                    return (
                      <div key={activity.activityType} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="truncate">
                            {ACTIVITY_TYPE_LABELS[activity.activityType] || activity.activityType}
                          </span>
                          <span className="font-medium ml-2">
                            {activity.totalAmount.toLocaleString()} ({activity.count})
                          </span>
                        </div>
                        <Progress value={percentage} className="h-2" />
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-4">No activity data available</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Transaction History</CardTitle>
          <Button variant="outline" size="sm" onClick={() => downloadTransactionsCSV(transactions)}
            disabled={transactions.length === 0}
            className="shrink-0"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Filter className="h-4 w-4" />
              <span className="text-sm font-medium">Filters:</span>
            </div>

            <Select value={sourceFilter} onValueChange={(value: CreditSource) => { setSourceFilter(value); setCurrentPage(1); }}>
              <SelectTrigger className="w-[180px]" data-testid="filter-source">
                <SelectValue placeholder="Credit Source" />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(SOURCE_LABELS) as [CreditSource, string][]).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={activityTypeFilter} onValueChange={(value) => { setActivityTypeFilter(value); setCurrentPage(1); }}>
              <SelectTrigger className="w-[180px]" data-testid="filter-activity-type">
                <SelectValue placeholder="Activity Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Activities</SelectItem>
                {Object.entries(ACTIVITY_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={userFilter} onValueChange={(value) => { setUserFilter(value); setCurrentPage(1); }}>
              <SelectTrigger className="w-[180px]" data-testid="filter-user">
                <SelectValue placeholder="All Users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {orgMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.gamerName || member.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start text-left font-normal" data-testid="filter-start-date">
                  <Calendar className="mr-2 h-4 w-4" />
                  {startDate ? tzFormat(startDate, 'MMM d, yyyy') : 'Start date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={startDate}
                  onSelect={(date) => { setStartDate(date); setCurrentPage(1); }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start text-left font-normal" data-testid="filter-end-date">
                  <Calendar className="mr-2 h-4 w-4" />
                  {endDate ? tzFormat(endDate, 'MMM d, yyyy') : 'End date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={endDate}
                  onSelect={(date) => { setEndDate(date); setCurrentPage(1); }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="clear-filters">
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {transactionsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12">
              <Coins className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-muted-foreground">
                {hasFilters ? 'No transactions match your filters' : 'No transactions yet'}
              </p>
              {hasFilters && (
                <Button variant="outline" className="mt-4" onClick={clearFilters}>
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Activity</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="hidden md:table-cell">Description</TableHead>
                      <TableHead className="hidden lg:table-cell">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => {
                      const isPositive = tx.amount > 0;
                      const Icon = isPositive ? ArrowUpRight : ArrowDownLeft;
                      const SourceIcon = tx.source === 'org' ? Building2 : User;
                      const sourceLabel = tx.source === 'org' ? 'Org' : 'Personal';
                      const sourceColor = tx.source === 'org' 
                        ? 'bg-primary/10 text-primary border-border' 
                        : 'bg-primary/10 text-primary border-border';
                      const activityLabel = getActivityLabel(tx);
                      const providerCostText = getPodcastProviderCostText(tx);
                      
                      return (
                        <TableRow 
                          key={`${tx.source}-${tx.id}`} 
                          data-testid={`transaction-row-${tx.id}`}
                          onClick={() => setSelectedTransaction(tx)}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                        >
                          <TableCell className="whitespace-nowrap">
                            {tzFormat(tx.createdAt, 'MMM d, yyyy')}
                            <div className="text-xs text-muted-foreground">
                              {tzFormat(tx.createdAt, 'h:mm a')}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn('text-xs flex items-center gap-1 w-fit', sourceColor)} >
                              <SourceIcon className="h-3 w-3" />
                              {sourceLabel}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium truncate max-w-[120px]">
                              {tx.actorUser?.gamerName || 'Unknown'}
                            </div>
                            <div className="text-xs text-muted-foreground truncate max-w-[120px]">
                              {tx.actorUser?.email}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn( 'text-xs', ACTIVITY_TYPE_COLORS[tx.activityType as OrgCreditActivityType] || 'bg-muted text-muted-foreground' )} >
                              {activityLabel}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Icon className={cn(
                                'h-4 w-4',
                                isPositive ? 'text-success' : 'text-destructive'
                              )} />
                              <span className={cn(
                                'font-bold tabular-nums',
                                isPositive ? 'text-success' : 'text-destructive'
                              )}>
                                {isPositive ? '+' : ''}{tx.amount.toLocaleString()}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Balance: {tx.balanceAfter.toLocaleString()}
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell max-w-[200px] truncate">
                            {providerCostText || tx.description || '-'}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm">
                            {(() => {
                              const details = tx.enrichedDetails;
                              const metadata = tx.metadata;
                              const parts: Array<{ label: string; name: string; href?: string }> = [];
                              
                              if (details?.courseName || metadata?.courseTitle) {
                                const courseId = metadata?.courseId;
                                parts.push({
                                  label: 'Course',
                                  name: details?.courseName || metadata?.courseTitle || '',
                                  href: courseId ? `/course-builder/${courseId}/edit` : undefined,
                                });
                              }
                              if (details?.lessonName || metadata?.lessonTitle) {
                                const lessonId = metadata?.lessonId;
                                const courseId = metadata?.courseId;
                                parts.push({
                                  label: 'Lesson',
                                  name: details?.lessonName || metadata?.lessonTitle || '',
                                  href: lessonId && courseId ? `/course-builder/${courseId}/lessons?lessonId=${lessonId}` : undefined,
                                });
                              }
                              if (details?.quizName || metadata?.quizTitle) {
                                const quizId = metadata?.quizId;
                                parts.push({
                                  label: 'Quiz',
                                  name: details?.quizName || metadata?.quizTitle || '',
                                  href: quizId ? `/quiz-card-manager?quizId=${quizId}` : undefined,
                                });
                              }
                              
                              if (parts.length === 0) {
                                return <span className="text-muted-foreground">-</span>;
                              }
                              
                              return (
                                <div className="space-y-0.5 text-xs">
                                  {parts.map((part, i) => (
                                    <div key={i} className="text-muted-foreground">
                                      {part.label}:{' '}
                                      {part.href ? (
                                        <Link
                                          href={part.href}
                                          className="text-primary hover:underline cursor-pointer inline-flex items-center gap-1"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {part.name}
                                          <ExternalLink className="h-3 w-3" />
                                        </Link>
                                      ) : (
                                        <span>{part.name}</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages} ({transactionsData?.total || 0} transactions)
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let page: number;
                        if (totalPages <= 5) {
                          page = i + 1;
                        } else if (currentPage <= 3) {
                          page = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          page = totalPages - 4 + i;
                        } else {
                          page = currentPage - 2 + i;
                        }
                        
                        return (
                          <Button key={page} variant={currentPage === page ? 'default' : 'outline'} size="sm" onClick={() => handlePageChange(page)}
                            className="w-8 h-8 p-0"
                            data-testid={`button-page-${page}`}
                          >
                            {page}
                          </Button>
                        );
                      })}
                    </div>
                    
                    <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      data-testid="button-next-page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedTransaction} onOpenChange={(open) => !open && setSelectedTransaction(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
          </DialogHeader>
          {selectedTransaction && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Date</label>
                  <p className="font-medium">{tzFormat(selectedTransaction.createdAt, 'PPpp')}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Source</label>
                  <Badge>{selectedTransaction.source === 'org' ? 'Organization' : 'Personal'}</Badge>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">User</label>
                  <p>{selectedTransaction.actorUser?.gamerName || 'Unknown'}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Activity</label>
                  <Badge>{getActivityLabel(selectedTransaction)}</Badge>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Amount</label>
                  <p className={selectedTransaction.amount > 0 ? 'text-success' : 'text-destructive'}>
                    {selectedTransaction.amount > 0 ? '+' : ''}{selectedTransaction.amount}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Balance After</label>
                  <p>{selectedTransaction.balanceAfter}</p>
                </div>
              </div>
              
              <div>
                <label className="text-sm text-muted-foreground">Description</label>
                <p className="font-medium">{getPodcastProviderCostText(selectedTransaction) || selectedTransaction.description || 'N/A'}</p>
              </div>
              
              <div>
                <label className="text-sm text-muted-foreground">Details</label>
                <div className="space-y-1 mt-1">
                  {(selectedTransaction.enrichedDetails?.courseName || selectedTransaction.metadata?.courseTitle) && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Course:</span>
                      {selectedTransaction.metadata?.courseId ? (
                        <Link
                          href={`/course-builder/${selectedTransaction.metadata.courseId}/edit`}
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          {selectedTransaction.enrichedDetails?.courseName || selectedTransaction.metadata?.courseTitle}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span>{selectedTransaction.enrichedDetails?.courseName || selectedTransaction.metadata?.courseTitle}</span>
                      )}
                    </div>
                  )}
                  {(selectedTransaction.enrichedDetails?.lessonName || selectedTransaction.metadata?.lessonTitle) && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Lesson:</span>
                      {selectedTransaction.metadata?.lessonId && selectedTransaction.metadata?.courseId ? (
                        <Link
                          href={`/course-builder/${selectedTransaction.metadata.courseId}/lessons?lessonId=${selectedTransaction.metadata.lessonId}`}
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          {selectedTransaction.enrichedDetails?.lessonName || selectedTransaction.metadata?.lessonTitle}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span>{selectedTransaction.enrichedDetails?.lessonName || selectedTransaction.metadata?.lessonTitle}</span>
                      )}
                    </div>
                  )}
                  {(selectedTransaction.enrichedDetails?.quizName || selectedTransaction.metadata?.quizTitle) && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Quiz:</span>
                      {selectedTransaction.metadata?.quizId ? (
                        <Link
                          href={`/quiz-card-manager?quizId=${selectedTransaction.metadata.quizId}`}
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          {selectedTransaction.enrichedDetails?.quizName || selectedTransaction.metadata?.quizTitle}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span>{selectedTransaction.enrichedDetails?.quizName || selectedTransaction.metadata?.quizTitle}</span>
                      )}
                    </div>
                  )}
                  {selectedTransaction.metadata?.description && (
                    <p className="text-sm">{selectedTransaction.metadata.description}</p>
                  )}
                  {!selectedTransaction.enrichedDetails?.courseName && 
                   !selectedTransaction.enrichedDetails?.lessonName && 
                   !selectedTransaction.enrichedDetails?.quizName &&
                   !selectedTransaction.metadata?.courseTitle &&
                   !selectedTransaction.metadata?.lessonTitle &&
                   !selectedTransaction.metadata?.quizTitle &&
                   !selectedTransaction.metadata?.description && (
                    <p className="text-muted-foreground">N/A</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
