import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { 
  Sparkles, 
  RefreshCw, 
  ExternalLink, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  TrendingUp,
  Calendar,
  Users,
  Search,
  Plus,
  Minus,
  Building2,
  Settings
} from 'lucide-react';
import { LPCreditIcon } from '@/components/LPCreditIcon';
import { LP_CREDITS_NAME, LP_CREDITS_SHORT } from '@shared/creditConstants';
import { tzFormat } from '@/utils/timezoneRuntime';


export default function LessonCredits() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { isSuperAdmin, isCustSuper, isLoading: authLoading, user } = useAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);

  // Redirect non-super-admins - this is a super admin only page
  useEffect(() => {
    if (!authLoading && user && !isSuperAdmin && !isCustSuper) {
      toast({
        variant: 'destructive',
        title: 'Access Restricted',
        description: 'This page is only available for super administrators.',
      });
      setLocation('/admin');
    }
  }, [user, authLoading, isSuperAdmin, isCustSuper, toast, setLocation]);
  
  // Organization credits state
  const [orgSearchQuery, setOrgSearchQuery] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<any>(null);
  const [orgAdjustmentAmount, setOrgAdjustmentAmount] = useState('');
  const [orgAdjustmentReason, setOrgAdjustmentReason] = useState('');
  const [showOrgAdjustmentModal, setShowOrgAdjustmentModal] = useState(false);
  
  // Transaction filtering state
  const [txSearch, setTxSearch] = useState('');
  const [txStartDate, setTxStartDate] = useState('');
  const [txEndDate, setTxEndDate] = useState('');
  const [txPage, setTxPage] = useState(0);
  const [txLimit] = useState(20);
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<'all' | 'user' | 'gamma'>('all');
  const [timeRangeFilter, setTimeRangeFilter] = useState<'30' | '90' | 'all'>('30');
  
  // Calculate date range based on time range filter
  const getDateRangeFromFilter = () => {
    if (timeRangeFilter === 'all') {
      return { start: '', end: '' };
    }
    
    const now = new Date();
    const end = now.toISOString().split('T')[0]; // Today
    const start = new Date(now);
    
    if (timeRangeFilter === '30') {
      start.setDate(start.getDate() - 30);
    } else if (timeRangeFilter === '90') {
      start.setDate(start.getDate() - 90);
    }
    
    return {
      start: start.toISOString().split('T')[0],
      end
    };
  };
  
  // Use manual dates if set, otherwise use preset range
  const effectiveStartDate = txStartDate || getDateRangeFromFilter().start;
  const effectiveEndDate = txEndDate || getDateRangeFromFilter().end;
  
  // Build query params for transactions
  const buildTxQueryParams = () => {
    const params = new URLSearchParams();
    if (txSearch) params.append('search', txSearch);
    if (effectiveStartDate) params.append('startDate', new Date(effectiveStartDate).toISOString());
    if (effectiveEndDate) params.append('endDate', new Date(effectiveEndDate).toISOString());
    params.append('limit', txLimit.toString());
    params.append('offset', (txPage * txLimit).toString());
    if (txSearch || effectiveStartDate || effectiveEndDate) {
      params.append('skipCache', 'true');
    }
    return params.toString();
  };
  
  // Fetch Gamma API status and usage (auto-refresh every 15s to show latest stats)
  const { data: gammaStatus, isLoading, refetch } = useQuery<any>({
    queryKey: ['/api/admin/gamma/status', txSearch, effectiveStartDate, effectiveEndDate, txPage, timeRangeFilter],
    queryFn: async () => {
      const params = buildTxQueryParams();
      const url = `/api/admin/gamma/status${params ? `?${params}` : ''}`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch lesson credit status');
      return response.json();
    },
    refetchInterval: !txSearch && !txStartDate && !txEndDate && timeRangeFilter === '30' ? 15000 : undefined, // Auto-refresh only for default view
    refetchOnWindowFocus: true, // Refresh when user returns to tab
  });

  // Fetch user credit allocations
  const { data: usersData, isLoading: usersLoading } = useQuery<any>({
    queryKey: ['/api/admin/lesson-credits/users', searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) {
        params.append('search', searchQuery);
      }
      const url = `/api/admin/lesson-credits/users${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch users');
      return response.json();
    },
    refetchInterval: 15000, // Auto-refresh to show updated balances
    refetchOnWindowFocus: true,
  });

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      // Invalidate cache to force fresh test
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gamma/status'] });
      await refetch();
      return gammaStatus;
    },
    onSuccess: () => {
      toast({
        title: 'Connection tested',
        description: 'AI lesson API status refreshed successfully',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Test failed',
        description: error.message || 'Failed to test AI lesson API connection',
      });
    },
  });

  // Credit adjustment mutation
  const adjustCreditsMutation = useMutation({
    mutationFn: async ({ allocationId, amountChange, reason }: any) => {
      return await apiRequest(`/api/admin/lesson-credits/users/${allocationId}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountChange, reason }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/lesson-credits/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gamma/status'] });
      setShowAdjustmentModal(false);
      setAdjustmentAmount('');
      setAdjustmentReason('');
      toast({
        title: 'Credits adjusted',
        description: `New balance: ${data.newBalance} credits`,
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Adjustment failed',
        description: error.message || 'Failed to adjust credits',
      });
    },
  });

  // Fetch organization credit data
  const { data: orgsData, isLoading: orgsLoading, error: orgsError } = useQuery<any>({
    queryKey: ['/api/admin/org-credits', orgSearchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (orgSearchQuery) {
        params.append('search', orgSearchQuery);
      }
      const url = `/api/admin/org-credits${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch organizations');
      return response.json();
    },
    enabled: activeTab === 'organizations',
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  // Organization credit adjustment mutation
  const adjustOrgCreditsMutation = useMutation({
    mutationFn: async ({ organizationId, amount, reason }: any) => {
      return await apiRequest(`/api/admin/org-credits/${organizationId}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, reason }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/org-credits'] });
      setShowOrgAdjustmentModal(false);
      setOrgAdjustmentAmount('');
      setOrgAdjustmentReason('');
      toast({
        title: 'Organization credits adjusted',
        description: `New balance: ${data.newBalance} credits`,
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Adjustment failed',
        description: error.message || 'Failed to adjust organization credits',
      });
    },
  });

  // Organization settings mutation (toggle useOrgCreditWallet)
  const updateOrgSettingsMutation = useMutation({
    mutationFn: async ({ organizationId, useOrgCreditWallet, allowTeachersToSpendCredits }: any) => {
      return await apiRequest(`/api/admin/org-credits/${organizationId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useOrgCreditWallet, allowTeachersToSpendCredits }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/org-credits'] });
      toast({
        title: 'Settings updated',
        description: 'Organization credit settings have been updated',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error.message || 'Failed to update organization settings',
      });
    },
  });

  const handleAdjustOrgCredits = (overrideAmount?: number) => {
    if (!selectedOrg || !orgAdjustmentAmount || !orgAdjustmentReason) {
      toast({
        variant: 'destructive',
        title: 'Missing information',
        description: 'Please fill in all fields',
      });
      return;
    }

    const amount = overrideAmount !== undefined ? overrideAmount : parseInt(orgAdjustmentAmount);
    if (isNaN(amount) || amount === 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid amount',
        description: 'Please enter a valid non-zero number',
      });
      return;
    }

    adjustOrgCreditsMutation.mutate({
      organizationId: selectedOrg.id,
      amount,
      reason: orgAdjustmentReason,
    });
  };

  const openOrgAdjustmentModal = (org: any, type: 'add' | 'subtract') => {
    setSelectedOrg({ ...org, adjustmentType: type });
    setOrgAdjustmentAmount('');
    setOrgAdjustmentReason('');
    setShowOrgAdjustmentModal(true);
  };

  const handleAdjustCredits = (overrideAmount?: number) => {
    if (!selectedUser || !adjustmentAmount || !adjustmentReason) {
      toast({
        variant: 'destructive',
        title: 'Missing information',
        description: 'Please fill in all fields',
      });
      return;
    }

    const amountChange = overrideAmount !== undefined ? overrideAmount : parseInt(adjustmentAmount);
    if (isNaN(amountChange) || amountChange === 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid amount',
        description: 'Please enter a valid non-zero number',
      });
      return;
    }

    adjustCreditsMutation.mutate({
      allocationId: selectedUser.allocationId,
      amountChange,
      reason: adjustmentReason,
    });
  };

  const openAdjustmentModal = (user: any) => {
    setSelectedUser(user);
    setAdjustmentAmount('');
    setAdjustmentReason('');
    setShowAdjustmentModal(true);
  };

  // Merge and filter transactions based on transaction type filter
  const getFilteredTransactions = () => {
    if (!gammaStatus) return { transactions: [], stats: { totalCredits: 0, totalDebits: 0, count: 0 } };

    const userTxs = gammaStatus.userTransactions?.transactions || [];
    const gammaTxs = gammaStatus.gammaUsage?.recentTransactions || [];

    // Normalize transactions to common format
    const normalizeUserTx = (tx: any) => ({
      id: tx.id,
      date: tx.date,
      amount: tx.amount,
      type: 'user',
      description: tx.description,
      organizationName: tx.organizationName,
      username: tx.username,
      lessonTitle: tx.lessonTitle,
      balanceAfter: tx.balanceAfter,
    });

    const normalizeGammaTx = (tx: any) => ({
      id: tx.date, // Use date as ID for gamma transactions
      date: tx.date,
      amount: -tx.amount, // Gamma shows positive, we want negative for deductions
      type: 'gamma',
      description: tx.description,
      organizationName: tx.organizationName,
      username: tx.username,
      lessonTitle: tx.lessonTitle,
      balanceAfter: null,
    });

    let transactions: any[] = [];

    if (transactionTypeFilter === 'all') {
      // Merge both sources
      transactions = [
        ...userTxs.map(normalizeUserTx),
        ...gammaTxs.map(normalizeGammaTx),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } else if (transactionTypeFilter === 'user') {
      transactions = userTxs.map(normalizeUserTx);
    } else if (transactionTypeFilter === 'gamma') {
      transactions = gammaTxs.map(normalizeGammaTx);
    }

    // CRITICAL FIX: Calculate stats based on transaction source type, not just amount sign
    // Gamma transactions are stored as negative but represent actual API usage debits
    // User transactions can be positive (credits added) or negative (deductions)
    let totalCredits = 0;
    let totalDebits = 0;
    
    if (transactionTypeFilter === 'gamma') {
      // Gamma ledger: all transactions are debits (actual Gamma API usage)
      totalDebits = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      totalCredits = 0; // Gamma ledger has no credits, only debits
    } else if (transactionTypeFilter === 'user') {
      // User transactions: can be credits (positive) or debits (negative)
      totalCredits = transactions
        .filter(t => t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0);
      totalDebits = transactions
        .filter(t => t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    } else {
      // All transactions: use source type from backend data
      totalCredits = (gammaStatus.userTransactions?.totalCredits || 0);
      totalDebits = (gammaStatus.userTransactions?.totalDebits || 0) + 
                    (gammaStatus.gammaUsage?.totalUsage || 0);
    }

    return {
      transactions,
      stats: {
        totalCredits,
        totalDebits,
        count: transactions.length,
      },
    };
  };

  const filteredData = getFilteredTransactions();

  const getConnectionBadge = () => {
    if (!gammaStatus?.connection) return null;
    
    if (gammaStatus.connection.connected) {
      return (
        <Badge variant="outline" >
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Connected
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline" >
          <XCircle className="mr-1 h-3 w-3" />
          Disconnected
        </Badge>
      );
    }
  };

  if (isLoading || usersLoading) {
    return (
      <QuizAdminLayout title={LP_CREDITS_NAME} description={`Manage ${LP_CREDITS_NAME} and usage`} activeSection="lesson-credits">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-foreground">Loading...</div>
        </div>
      </QuizAdminLayout>
    );
  }

  return (
    <QuizAdminLayout title={LP_CREDITS_NAME} description={`Manage ${LP_CREDITS_NAME} and usage`} activeSection="lesson-credits">
      <div className="space-y-[var(--space-lg)] w-full max-w-full lg:max-w-6xl">
        {/* Tabs for User Credits vs Organization Credits */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full sm:w-auto mb-[var(--space-md)]">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              User Credits
            </TabsTrigger>
            <TabsTrigger value="organizations" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Organization Credits
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="users" className="space-y-[var(--space-lg)]">
        {/* System Balance Card */}
        {gammaStatus?.systemBalance && (
          <Card className="bg-surface-raised border-primary/70">
            <CardHeader className="p-[var(--card-padding)]">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-sm)]">
                <div className="flex items-center gap-[var(--space-sm)]">
                  <div className="p-2 bg-primary/30 rounded-lg">
                    <LPCreditIcon size="lg" />
                  </div>
                  <div>
                    <CardTitle className="text-foreground text-[length:var(--text-xl)]">System {LP_CREDITS_SHORT} Balance</CardTitle>
                    <CardDescription className="text-primary/80 text-[length:var(--text-sm)]">Internal ledger tracking</CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-[var(--card-padding)] pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--card-gap)]">
                <div className="p-[var(--card-padding)] bg-background/20 rounded-lg">
                  <p className="text-[length:var(--text-sm)] text-primary/80">Current Balance</p>
                  <p className="text-[length:var(--text-3xl)] font-bold text-foreground mt-1">
                    {gammaStatus.systemBalance.currentBalance}
                  </p>
                  <p className="text-[length:var(--text-xs)] text-primary/70 mt-1">credits remaining</p>
                </div>
                <div className="p-[var(--card-padding)] bg-background/20 rounded-lg">
                  <p className="text-[length:var(--text-sm)] text-primary/80">Total Deducted</p>
                  <p className="text-[length:var(--text-3xl)] font-bold text-foreground mt-1">
                    {gammaStatus.systemBalance.totalDeducted}
                  </p>
                  <p className="text-[length:var(--text-xs)] text-primary/70 mt-1">credits used</p>
                </div>
                <div className="p-[var(--card-padding)] bg-background/20 rounded-lg">
                  <p className="text-[length:var(--text-sm)] text-primary/80">Last Snapshot</p>
                  <p className="text-[length:var(--text-lg)] font-bold text-foreground mt-1">
                    {gammaStatus.systemBalance.lastSnapshot 
                      ? tzFormat(gammaStatus.systemBalance.lastSnapshot, 'MMM dd, h:mm a')
                      : 'Never'}
                  </p>
                  <p className="text-[length:var(--text-xs)] text-primary/70 mt-1">reconciliation check</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI Lesson API Connection Status */}
        <Card className="bg-card/50 border-border">
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-sm)]">
              <div className="flex items-center gap-[var(--space-sm)]">
                <div className="p-2 bg-primary/20 rounded-lg">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-foreground text-[length:var(--text-xl)]">AI Lesson API Status</CardTitle>
                  <CardDescription className="text-[length:var(--text-sm)]">Connection and service health</CardDescription>
                </div>
              </div>
              {getConnectionBadge()}
            </div>
          </CardHeader>
          <CardContent className="p-[var(--card-padding)] pt-0 space-y-[var(--space-md)]">
            <div className="flex flex-col sm:flex-row items-start justify-between gap-[var(--space-md)] p-[var(--card-padding)] bg-muted/30 rounded-lg">
              <div className="space-y-1">
                <p className="text-[length:var(--text-sm)] font-medium text-foreground">
                  {gammaStatus?.connection?.message || 'Unknown status'}
                </p>
                {gammaStatus?.connection?.themeCount && (
                  <p className="text-[length:var(--text-xs)] text-muted-foreground">
                    {gammaStatus.connection.themeCount} themes available
                  </p>
                )}
              </div>
              <Button onClick={() => testConnectionMutation.mutate()}
                disabled={testConnectionMutation.isPending}
                variant="outline"
                size="sm"
                className="min-h-[44px] touch-manipulation border-border hover:border-primary w-full sm:w-auto"
                data-testid="button-test-connection"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${testConnectionMutation.isPending ? 'animate-spin' : ''}`} />
                Test Connection
              </Button>
            </div>

            {/* Important Note about Balance */}
            <div className="flex flex-col sm:flex-row items-start gap-[var(--space-sm)] p-[var(--card-padding)] bg-[var(--chart-4)]/10 border border-[var(--chart-4)]/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-chart-4 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-[length:var(--text-sm)] font-medium text-chart-4">Account Balance Not Available</p>
                <p className="text-[length:var(--text-xs)] text-chart-4/80 mt-1">
                  {gammaStatus?.note || 'The AI lesson API does not provide an account balance endpoint.'}
                </p>
                {gammaStatus?.billingUrl && (
                  <a 
                    href={gammaStatus.billingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-[length:var(--text-xs)] text-chart-4 hover:text-chart-4/80 underline min-h-[44px] touch-manipulation"
                  >
                    View account balance
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User Credit Transactions (Primary View - Database Records) */}
        <Card className="bg-card/50 border-border">
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex items-center gap-[var(--space-sm)]">
              <div className="p-2 bg-[var(--chart-2)]/20 rounded-lg">
                <LPCreditIcon size="md" />
              </div>
              <div>
                <CardTitle className="text-foreground text-[length:var(--text-xl)]">User {LP_CREDITS_SHORT} Transactions</CardTitle>
                <CardDescription className="text-[length:var(--text-sm)]">All {LP_CREDITS_SHORT} allocations, deductions, and adjustments</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-[var(--card-padding)] pt-0 space-y-[var(--space-md)]">
            {/* Filtering Controls */}
            <div className="space-y-[var(--space-sm)] p-[var(--card-padding)] bg-muted/30 rounded-lg">
              {/* Dropdown Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-sm)]">
                {/* Transaction Type Filter */}
                <div>
                  <Label className="text-[length:var(--text-xs)] text-muted-foreground mb-1.5 block">Transaction Type</Label>
                  <Select
                    value={transactionTypeFilter}
                    onValueChange={(value: 'all' | 'user' | 'gamma') => {
                      setTransactionTypeFilter(value);
                      setTxPage(0);
                    }}
                  >
                    <SelectTrigger className="min-h-[44px] touch-manipulation bg-muted/50 border-border text-foreground" data-testid="select-transaction-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Transactions</SelectItem>
                      <SelectItem value="user">User Transactions</SelectItem>
                      <SelectItem value="gamma">AI Lesson Ledger</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Time Range Filter */}
                <div>
                  <Label className="text-[length:var(--text-xs)] text-muted-foreground mb-1.5 block">Time Range</Label>
                  <Select
                    value={timeRangeFilter}
                    onValueChange={(value: '30' | '90' | 'all') => {
                      setTimeRangeFilter(value);
                      setTxPage(0);
                      // Clear manual date inputs when switching presets
                      setTxStartDate('');
                      setTxEndDate('');
                    }}
                  >
                    <SelectTrigger className="min-h-[44px] touch-manipulation bg-muted/50 border-border text-foreground" data-testid="select-time-range">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">Last 30 Days</SelectItem>
                      <SelectItem value="90">Last 90 Days</SelectItem>
                      <SelectItem value="all">All Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Search and Date Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--space-sm)]">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search org, user, or lesson..."
                    value={txSearch}
                    onChange={(e) => {
                      setTxSearch(e.target.value);
                      setTxPage(0);
                    }}
                    className="pl-10 min-h-[44px] touch-manipulation bg-muted/50 border-border text-foreground"
                    data-testid="input-tx-search"
                  />
                </div>
                
                {/* Start Date */}
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="date"
                    placeholder="Start date (override)"
                    value={txStartDate}
                    onChange={(e) => {
                      setTxStartDate(e.target.value);
                      setTxPage(0);
                    }}
                    className="pl-10 min-h-[44px] touch-manipulation bg-muted/50 border-border text-foreground"
                    data-testid="input-tx-start-date"
                  />
                </div>
                
                {/* End Date */}
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="date"
                    placeholder="End date (override)"
                    value={txEndDate}
                    onChange={(e) => {
                      setTxEndDate(e.target.value);
                      setTxPage(0);
                    }}
                    className="pl-10 min-h-[44px] touch-manipulation bg-muted/50 border-border text-foreground"
                    data-testid="input-tx-end-date"
                  />
                </div>
              </div>
              
              {/* Active Filters Indicator */}
              {(txSearch || txStartDate || txEndDate) && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-[var(--space-xs)] text-[length:var(--text-xs)] text-muted-foreground">
                  <div className="flex items-center gap-[var(--space-xs)]">
                    <AlertCircle className="w-3 h-3" />
                    <span>Filters active • Auto-refresh disabled</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => {
                      setTxSearch('');
                      setTxStartDate('');
                      setTxEndDate('');
                      setTxPage(0);
                    }}
                    className="sm:ml-auto min-h-[44px] touch-manipulation text-[length:var(--text-xs)]"
                    data-testid="button-clear-filters"
                  >
                    Clear Filters
                  </Button>
                </div>
              )}
            </div>

            {/* Credit Summary - Shows stats from filtered data */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--card-gap)]">
              <div className="p-[var(--card-padding)] bg-[var(--chart-2)]/20 rounded-lg border border-[var(--chart-2)]/30">
                <p className="text-[length:var(--text-sm)] text-chart-2">Total Credits</p>
                <p className="text-[length:var(--text-3xl)] font-bold text-foreground mt-1">
                  {filteredData.stats.totalCredits}
                </p>
              </div>
              <div className="p-[var(--card-padding)] bg-destructive/20 rounded-lg border border-destructive/30">
                <p className="text-[length:var(--text-sm)] text-destructive">Total Debits</p>
                <p className="text-[length:var(--text-3xl)] font-bold text-foreground mt-1">
                  {filteredData.stats.totalDebits}
                </p>
              </div>
              <div className="p-[var(--card-padding)] bg-muted/30 rounded-lg">
                <p className="text-[length:var(--text-sm)] text-muted-foreground">Transactions</p>
                <p className="text-[length:var(--text-3xl)] font-bold text-foreground mt-1">
                  {filteredData.stats.count}
                </p>
              </div>
            </div>

            {/* Transaction List - Shows filtered/merged data */}
            {filteredData.transactions.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[length:var(--text-sm)] font-medium text-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  {transactionTypeFilter === 'all' && 'All Transactions'}
                  {transactionTypeFilter === 'user' && 'Credit Transaction History'}
                  {transactionTypeFilter === 'gamma' && 'AI Lesson Usage'}
                </h4>
                <div className="space-y-2">
                  {filteredData.transactions.map((tx: any, idx: number) => (
                    <div 
                      key={tx.id}
                      className="flex flex-col sm:flex-row items-start justify-between gap-[var(--space-sm)] p-[var(--space-sm)] bg-muted/20 rounded-lg hover:bg-muted/30 transition-colors"
                      data-testid={`transaction-${idx}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {tx.amount > 0 ? (
                            <Plus className="w-4 h-4 text-chart-2" />
                          ) : (
                            <Minus className="w-4 h-4 text-destructive" />
                          )}
                          <p className="text-[length:var(--text-sm)] text-foreground/80 font-medium">{tx.description}</p>
                          {transactionTypeFilter === 'all' && (
                            <Badge variant="outline" className="text-[length:var(--text-xs)]">
                              {tx.type === 'user' ? 'User' : 'AI Lesson'}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-2 flex-wrap text-[length:var(--text-xs)]">
                          <span className="text-muted-foreground" data-testid={`tx-org-${idx}`}>
                            <Users className="w-3 h-3 inline mr-1" />
                            {tx.organizationName}
                          </span>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-muted-foreground" data-testid={`tx-user-${idx}`}>
                            {tx.username}
                          </span>
                          {tx.balanceAfter !== null && (
                            <>
                              <span className="text-muted-foreground">•</span>
                              <span className="text-muted-foreground">
                                Balance: {tx.balanceAfter}
                              </span>
                            </>
                          )}
                        </div>
                        <p className="text-[length:var(--text-xs)] text-muted-foreground mt-1">
                          {tzFormat(tx.date, 'MMM dd, yyyy h:mm a')}
                        </p>
                      </div>
                      <Badge variant={tx.amount > 0 ? "default" : "secondary"} 
                        className={`font-mono shrink-0 ${tx.amount > 0 ? 'bg-[var(--chart-2)]/20 text-chart-2 border-[var(--chart-2)]' : ''}`}
                        data-testid={`tx-amount-${idx}`}
                      >
                        {tx.amount > 0 ? '+' : ''}{tx.amount}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {filteredData.transactions.length === 0 && (
              <div className="text-center py-[var(--space-xl)] text-muted-foreground">
                <p className="text-[length:var(--text-sm)]">No transactions found for selected filters</p>
              </div>
            )}

            {/* Pagination Controls */}
            {gammaStatus?.userTransactions?.pagination && gammaStatus.userTransactions.transactions.length > 0 && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-md)] pt-[var(--space-md)] border-t border-border">
                <div className="text-[length:var(--text-sm)] text-muted-foreground">
                  Showing {txPage * txLimit + 1}-{Math.min((txPage + 1) * txLimit, gammaStatus.userTransactions.pagination.total)} of {gammaStatus.userTransactions.pagination.total}
                </div>
                <div className="flex items-center gap-[var(--space-xs)]">
                  <Button variant="outline" size="sm" onClick={() => setTxPage(Math.max(0, txPage - 1))}
                    disabled={txPage === 0}
                    className="min-h-[44px] touch-manipulation border-border hover:border-primary"
                    data-testid="button-prev-page"
                  >
                    Previous
                  </Button>
                  <span className="text-[length:var(--text-sm)] text-muted-foreground px-2">
                    Page {txPage + 1}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setTxPage(txPage + 1)}
                    disabled={!gammaStatus.userTransactions.pagination.hasMore}
                    className="min-h-[44px] touch-manipulation border-border hover:border-primary"
                    data-testid="button-next-page"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* User Credit Management */}
        <Card className="bg-card/50 border-border">
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-sm)]">
              <div className="flex items-center gap-[var(--space-sm)]">
                <div className="p-2 bg-[var(--chart-2)]/20 rounded-lg">
                  <Users className="w-5 h-5 text-chart-2" />
                </div>
                <div>
                  <CardTitle className="text-foreground text-[length:var(--text-xl)]">User Credit Allocations</CardTitle>
                  <CardDescription className="text-[length:var(--text-sm)]">Manage individual user credit balances</CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-[var(--card-padding)] pt-0 space-y-[var(--space-md)]">
            {/* Search Bar */}
            <div className="flex items-center gap-[var(--space-xs)]">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 min-h-[44px] touch-manipulation bg-muted/50 border-border text-foreground"
                  data-testid="input-search-users"
                />
              </div>
            </div>

            {/* User Table */}
            {usersData?.users && usersData.users.length > 0 ? (
              <div className="space-y-2">
                {usersData.users.map((user: any) => (
                  <div
                    key={user.allocationId}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-sm)] p-[var(--card-padding)] bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                    data-testid={`user-row-${user.allocationId}`}
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[length:var(--text-sm)] font-medium text-foreground">{user.userName || 'Unknown User'}</p>
                        {user.status === 'active' ? (
                          <Badge variant="outline" className="text-[length:var(--text-xs)]">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[length:var(--text-xs)]">
                            {user.status}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[length:var(--text-xs)] text-muted-foreground">{user.email}</p>
                      {user.organizationName && (
                        <p className="text-[length:var(--text-xs)] text-muted-foreground">{user.organizationName}</p>
                      )}
                    </div>
                    <div className="flex flex-row sm:flex-row items-center gap-[var(--space-md)] w-full sm:w-auto">
                      <div className="text-left sm:text-right flex-1 sm:flex-none">
                        <p className="text-[length:var(--text-lg)] font-bold text-foreground">{user.currentBalance}</p>
                        <p className="text-[length:var(--text-xs)] text-muted-foreground">of {user.monthlyAllocation} monthly</p>
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={() => openAdjustmentModal({ ...user, adjustmentType: 'add' })}
                          size="sm"
                          variant="outline"
                          className="min-h-[44px] min-w-[44px] touch-manipulation border-[var(--chart-2)] hover:bg-[var(--chart-2)]/20"
                          data-testid={`button-add-credits-${user.allocationId}`}
                        >
                          <Plus className="w-4 h-4 text-chart-2" />
                        </Button>
                        <Button onClick={() => openAdjustmentModal({ ...user, adjustmentType: 'subtract' })}
                          size="sm"
                          variant="outline"
                          className="min-h-[44px] min-w-[44px] touch-manipulation border-destructive hover:bg-destructive/20"
                          data-testid={`button-subtract-credits-${user.allocationId}`}
                        >
                          <Minus className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-[var(--space-xl)] text-muted-foreground">
                <p className="text-[length:var(--text-sm)]">No users found</p>
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>
          
          {/* Organization Credits Tab */}
          <TabsContent value="organizations" className="space-y-[var(--space-lg)]">
            <Card className="bg-card/50 border-border">
              <CardHeader className="p-[var(--card-padding)]">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-sm)]">
                  <div className="flex items-center gap-[var(--space-sm)]">
                    <div className="p-2 bg-primary/20 rounded-lg">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-foreground text-[length:var(--text-xl)]">Organization Credit Wallets</CardTitle>
                      <CardDescription className="text-[length:var(--text-sm)]">Manage credit balances and settings for organizations</CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0 space-y-[var(--space-md)]">
                {/* Search Bar */}
                <div className="flex items-center gap-[var(--space-xs)]">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search organizations by name..."
                      value={orgSearchQuery}
                      onChange={(e) => setOrgSearchQuery(e.target.value)}
                      className="pl-10 min-h-[44px] touch-manipulation bg-muted/50 border-border text-foreground"
                      data-testid="input-search-orgs"
                    />
                  </div>
                </div>

                {/* Organizations List */}
                {orgsLoading ? (
                  <div className="flex items-center justify-center py-[var(--space-xl)]">
                    <div className="text-muted-foreground">Loading organizations...</div>
                  </div>
                ) : orgsError ? (
                  <div className="text-center py-[var(--space-xl)] text-destructive">
                    <p className="text-[length:var(--text-sm)]">
                      Failed to load organizations. Please refresh or re-open this page.
                    </p>
                  </div>
                ) : orgsData?.organizations && orgsData.organizations.length > 0 ? (
                  <div className="space-y-3">
                    {orgsData.organizations.map((org: any) => (
                      <div
                        key={org.id}
                        className="flex flex-col gap-[var(--space-md)] p-[var(--card-padding)] bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                        data-testid={`org-row-${org.id}`}
                      >
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-sm)]">
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-[length:var(--text-sm)] font-medium text-foreground">{org.name}</p>
                              {org.useOrgCreditWallet ? (
                                <Badge variant="outline" className="text-[length:var(--text-xs)]">
                                  Wallet Active
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[length:var(--text-xs)]">
                                  Wallet Disabled
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-row items-center gap-[var(--space-md)]">
                            <div className="text-left sm:text-right">
                              <p className="text-[length:var(--text-lg)] font-bold text-foreground">
                                {org.orgCreditWallet ?? 0}
                              </p>
                              <p className="text-[length:var(--text-xs)] text-muted-foreground">credits</p>
                            </div>
                            <div className="flex gap-2">
                              <Button onClick={() => openOrgAdjustmentModal(org, 'add')}
                                size="sm"
                                variant="outline"
                                className="min-h-[44px] min-w-[44px] touch-manipulation border-[var(--chart-2)] hover:bg-[var(--chart-2)]/20"
                                data-testid={`button-add-org-credits-${org.id}`}
                              >
                                <Plus className="w-4 h-4 text-chart-2" />
                              </Button>
                              <Button onClick={() => openOrgAdjustmentModal(org, 'subtract')}
                                size="sm"
                                variant="outline"
                                className="min-h-[44px] min-w-[44px] touch-manipulation border-destructive hover:bg-destructive/20"
                                data-testid={`button-subtract-org-credits-${org.id}`}
                              >
                                <Minus className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        
                        {/* Settings toggles row */}
                        <div className="flex flex-col sm:flex-row gap-[var(--space-md)] pt-[var(--space-sm)] border-t border-border/50">
                          <div className="flex items-center justify-between sm:justify-start gap-[var(--space-sm)]">
                            <Label htmlFor={`wallet-enabled-${org.id}`} className="text-[length:var(--text-xs)] text-muted-foreground flex items-center gap-1">
                              <Settings className="w-3 h-3" />
                              Org Credit Wallet
                            </Label>
                            <Switch
                              id={`wallet-enabled-${org.id}`}
                              checked={org.useOrgCreditWallet ?? false}
                              onCheckedChange={(checked) => 
                                updateOrgSettingsMutation.mutate({
                                  organizationId: org.id,
                                  useOrgCreditWallet: checked
                                })
                              }
                              disabled={updateOrgSettingsMutation.isPending}
                            />
                          </div>
                          <div className="flex items-center justify-between sm:justify-start gap-[var(--space-sm)]">
                            <Label htmlFor={`teachers-spend-${org.id}`} className="text-[length:var(--text-xs)] text-muted-foreground flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              Instructors Can Spend
                            </Label>
                            <Switch
                              id={`teachers-spend-${org.id}`}
                              checked={org.allowTeachersToSpendCredits ?? false}
                              onCheckedChange={(checked) => 
                                updateOrgSettingsMutation.mutate({
                                  organizationId: org.id,
                                  allowTeachersToSpendCredits: checked
                                })
                              }
                              disabled={updateOrgSettingsMutation.isPending}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-[var(--space-xl)] text-muted-foreground">
                    <p className="text-[length:var(--text-sm)]">No organizations found</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Credit Adjustment Modal */}
        <Dialog open={showAdjustmentModal} onOpenChange={setShowAdjustmentModal}>
          <DialogContent className="bg-card border-border w-[calc(100vw-2rem)] max-w-md p-[var(--dialog-padding)]">
            <DialogHeader>
              <DialogTitle className="text-foreground text-[length:var(--text-xl)]">Adjust Credits</DialogTitle>
              <DialogDescription className="text-muted-foreground text-[length:var(--text-sm)]">
                {selectedUser && (
                  <>
                    {selectedUser.adjustmentType === 'add' ? 'Add credits to' : 'Subtract credits from'} {selectedUser.userName}
                    <br />
                    Current balance: <span className="font-semibold">{selectedUser.currentBalance}</span> credits
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-[var(--space-md)]">
              <div className="space-y-2">
                <Label htmlFor="adjustment-amount" className="text-foreground text-[length:var(--text-sm)]">
                  Amount {selectedUser?.adjustmentType === 'subtract' && '(will be subtracted)'}
                </Label>
                <Input
                  id="adjustment-amount"
                  type="number"
                  placeholder="Enter amount"
                  value={adjustmentAmount}
                  onChange={(e) => setAdjustmentAmount(e.target.value)}
                  className="min-h-[44px] touch-manipulation bg-muted border-border text-foreground"
                  data-testid="input-adjustment-amount"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="adjustment-reason" className="text-foreground text-[length:var(--text-sm)]">
                  Reason
                </Label>
                <Textarea
                  id="adjustment-reason"
                  placeholder="Enter reason for adjustment..."
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  className="min-h-[80px] touch-manipulation bg-muted border-border text-foreground"
                  data-testid="input-adjustment-reason"
                />
              </div>
            </div>
            <DialogFooter className="flex flex-col sm:flex-row gap-[var(--space-sm)]">
              <Button onClick={() => setShowAdjustmentModal(false)}
                variant="outline"
                className="min-h-[44px] touch-manipulation border-border w-full sm:w-auto"
                data-testid="button-cancel-adjustment"
              >
                Cancel
              </Button>
              <Button onClick={() => {
                  const finalAmount = selectedUser?.adjustmentType === 'subtract' 
                    ? -Math.abs(parseInt(adjustmentAmount))
                    : parseInt(adjustmentAmount);
                  handleAdjustCredits(finalAmount);
                }}
                disabled={adjustCreditsMutation.isPending}
                className="min-h-[44px] touch-manipulation bg-primary hover:bg-primary/90 w-full sm:w-auto"
                data-testid="button-confirm-adjustment"
              >
                {adjustCreditsMutation.isPending ? 'Adjusting...' : 'Adjust Credits'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Organization Credit Adjustment Modal */}
        <Dialog open={showOrgAdjustmentModal} onOpenChange={setShowOrgAdjustmentModal}>
          <DialogContent className="bg-card border-border w-[calc(100vw-2rem)] max-w-md p-[var(--dialog-padding)]">
            <DialogHeader>
              <DialogTitle className="text-foreground text-[length:var(--text-xl)]">Adjust Organization Credits</DialogTitle>
              <DialogDescription className="text-muted-foreground text-[length:var(--text-sm)]">
                {selectedOrg && (
                  <>
                    {selectedOrg.adjustmentType === 'add' ? 'Add credits to' : 'Subtract credits from'} {selectedOrg.name}
                    <br />
                    Current balance: <span className="font-semibold">{selectedOrg.orgCreditWallet ?? 0}</span> credits
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-[var(--space-md)]">
              <div className="space-y-2">
                <Label htmlFor="org-adjustment-amount" className="text-foreground text-[length:var(--text-sm)]">
                  Amount {selectedOrg?.adjustmentType === 'subtract' && '(will be subtracted)'}
                </Label>
                <Input
                  id="org-adjustment-amount"
                  type="number"
                  placeholder="Enter amount"
                  value={orgAdjustmentAmount}
                  onChange={(e) => setOrgAdjustmentAmount(e.target.value)}
                  className="min-h-[44px] touch-manipulation bg-muted border-border text-foreground"
                  data-testid="input-org-adjustment-amount"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-adjustment-reason" className="text-foreground text-[length:var(--text-sm)]">
                  Reason
                </Label>
                <Textarea
                  id="org-adjustment-reason"
                  placeholder="Enter reason for adjustment..."
                  value={orgAdjustmentReason}
                  onChange={(e) => setOrgAdjustmentReason(e.target.value)}
                  className="min-h-[80px] touch-manipulation bg-muted border-border text-foreground"
                  data-testid="input-org-adjustment-reason"
                />
              </div>
            </div>
            <DialogFooter className="flex flex-col sm:flex-row gap-[var(--space-sm)]">
              <Button onClick={() => setShowOrgAdjustmentModal(false)}
                variant="outline"
                className="min-h-[44px] touch-manipulation border-border w-full sm:w-auto"
                data-testid="button-cancel-org-adjustment"
              >
                Cancel
              </Button>
              <Button onClick={() => {
                  const finalAmount = selectedOrg?.adjustmentType === 'subtract' 
                    ? -Math.abs(parseInt(orgAdjustmentAmount))
                    : parseInt(orgAdjustmentAmount);
                  handleAdjustOrgCredits(finalAmount);
                }}
                disabled={adjustOrgCreditsMutation.isPending}
                className="min-h-[44px] touch-manipulation bg-primary hover:bg-primary/90 w-full sm:w-auto"
                data-testid="button-confirm-org-adjustment"
              >
                {adjustOrgCreditsMutation.isPending ? 'Adjusting...' : 'Adjust Credits'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </QuizAdminLayout>
  );
}
