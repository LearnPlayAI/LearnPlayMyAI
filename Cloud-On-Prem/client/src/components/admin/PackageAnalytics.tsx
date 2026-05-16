import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Building2, DollarSign, Users, ArrowUp, ArrowDown, ArrowRightLeft } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useState } from 'react';

interface PackageAnalyticsData {
  totalMRR: number;
  totalActiveOrgs: number;
  mrrByPackage: Array<{
    packageId: string;
    packageName: string;
    tier: string;
    mrr: number;
    orgCount: number;
  }>;
  mrrByCurrency: Record<string, number>;
  upgradesLast30Days: number;
  downgradesLast30Days: number;
  subscriptionsLast30Days: number;
  cancellationsLast30Days: number;
}

interface SeatUtilizationData {
  tier: string;
  orgCount: number;
  avgLearnerUtilization: number;
  avgTeacherUtilization: number;
  avgOrgAdminUtilization: number;
  totalLearnerSeats: number;
  usedLearnerSeats: number;
  totalTeacherSeats: number;
  usedTeacherSeats: number;
  totalOrgAdminSeats: number;
  usedOrgAdminSeats: number;
}

interface FunnelData {
  periodDays: number;
  subscribed: number;
  upgraded: number;
  downgraded: number;
  cancelled: number;
}

const CURRENCIES = ['ZAR', 'EUR', 'USD'] as const;

function formatCurrency(amount: number, currency: string): string {
  const symbols: Record<string, string> = { ZAR: 'R', EUR: '€', USD: '$' };
  return `${symbols[currency] || currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getTierColor(tier: string): string {
  const colors: Record<string, string> = {
    starter: 'bg-success/10 text-success border-success/20',
    professional: 'bg-primary/10 text-primary border-border',
    enterprise: 'bg-primary/10 text-primary border-border',
    custom: 'bg-warning/10 text-warning border-[var(--warning)]/20',
  };
  return colors[tier] || 'bg-muted/30 text-muted-foreground border-border/20';
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  subtitle 
}: { 
  title: string; 
  value: string | number; 
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'neutral';
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={`p-3 rounded-full ${
            trend === 'up' ? 'bg-success/20 dark:bg-success/30' : 
            trend === 'down' ? 'bg-destructive/20 dark:bg-destructive/30' : 
            'bg-primary/10'
          }`}>
            <Icon className={`h-5 w-5 ${
              trend === 'up' ? 'text-success' : 
              trend === 'down' ? 'text-destructive' : 
              'text-primary'
            }`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function PackageAnalytics() {
  const [currency, setCurrency] = useState<string>('ZAR');
  const [funnelDays, setFunnelDays] = useState<string>('90');

  const { data: analytics, isLoading: analyticsLoading } = useQuery<PackageAnalyticsData>({
    queryKey: ['/api/admin/package-analytics', currency],
  });

  const { data: utilization, isLoading: utilizationLoading } = useQuery<SeatUtilizationData[]>({
    queryKey: ['/api/admin/package-analytics/seat-utilization'],
  });

  const { data: funnel, isLoading: funnelLoading } = useQuery<FunnelData>({
    queryKey: ['/api/admin/package-analytics/funnel', funnelDays],
  });

  if (analyticsLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const maxMRR = Math.max(...(analytics?.mrrByPackage.map(p => p.mrr) || [1]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Package Analytics</h2>
          <p className="text-sm text-muted-foreground">
            MRR, seat utilization, and subscription funnel insights
          </p>
        </div>
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger className="w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total MRR"
          value={formatCurrency(analytics?.totalMRR || 0, currency)}
          icon={DollarSign}
        />
        <StatCard
          title="Active Organizations"
          value={analytics?.totalActiveOrgs || 0}
          icon={Building2}
        />
        <StatCard
          title="Upgrades (30d)"
          value={analytics?.upgradesLast30Days || 0}
          icon={TrendingUp}
          trend="up"
        />
        <StatCard
          title="Downgrades (30d)"
          value={analytics?.downgradesLast30Days || 0}
          icon={TrendingDown}
          trend="down"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>MRR by Package</CardTitle>
            <CardDescription>Monthly recurring revenue breakdown by package tier</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics?.mrrByPackage.map((pkg) => (
                <div key={pkg.packageId} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={getTierColor(pkg.tier)}>{pkg.tier}</Badge>
                      <span className="font-medium">{pkg.packageName}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(pkg.mrr, currency)}</p>
                      <p className="text-xs text-muted-foreground">{pkg.orgCount} org{pkg.orgCount !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <Progress value={maxMRR > 0 ? (pkg.mrr / maxMRR) * 100 : 0} className="h-2" />
                </div>
              ))}
              {(!analytics?.mrrByPackage || analytics.mrrByPackage.length === 0) && (
                <p className="text-center text-muted-foreground py-4">No package data available</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>MRR by Currency</CardTitle>
            <CardDescription>Revenue distribution across currencies</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                  <TableHead className="text-right">% of Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(analytics?.mrrByCurrency || {}).map(([curr, amount]) => {
                  const total = Object.values(analytics?.mrrByCurrency || {}).reduce((s, v) => s + v, 0);
                  const percentage = total > 0 ? (amount / total) * 100 : 0;
                  return (
                    <TableRow key={curr}>
                      <TableCell className="font-medium">{curr}</TableCell>
                      <TableCell className="text-right">{formatCurrency(amount, curr)}</TableCell>
                      <TableCell className="text-right">{percentage.toFixed(1)}%</TableCell>
                    </TableRow>
                  );
                })}
                {Object.keys(analytics?.mrrByCurrency || {}).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No currency data available
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Seat Utilization by Tier</CardTitle>
          <CardDescription>Average seat usage across organization tiers</CardDescription>
        </CardHeader>
        <CardContent>
          {utilizationLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tier</TableHead>
                  <TableHead>Organizations</TableHead>
                  <TableHead>Learner Seat Utilization</TableHead>
                  <TableHead>Instructor Seat Utilization</TableHead>
                  <TableHead>Org Admin Utilization</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {utilization?.map((tier) => (
                  <TableRow key={tier.tier}>
                    <TableCell>
                      <Badge className={getTierColor(tier.tier)}>{tier.tier}</Badge>
                    </TableCell>
                    <TableCell>{tier.orgCount}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={tier.avgLearnerUtilization * 100} className="w-20 h-2" />
                        <span className="text-sm">{(tier.avgLearnerUtilization * 100).toFixed(0)}%</span>
                        <span className="text-xs text-muted-foreground">
                          ({tier.usedLearnerSeats}/{tier.totalLearnerSeats})
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={tier.avgTeacherUtilization * 100} className="w-20 h-2" />
                        <span className="text-sm">{(tier.avgTeacherUtilization * 100).toFixed(0)}%</span>
                        <span className="text-xs text-muted-foreground">
                          ({tier.usedTeacherSeats}/{tier.totalTeacherSeats})
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={tier.avgOrgAdminUtilization * 100} className="w-20 h-2" />
                        <span className="text-sm">{(tier.avgOrgAdminUtilization * 100).toFixed(0)}%</span>
                        <span className="text-xs text-muted-foreground">
                          ({tier.usedOrgAdminSeats}/{tier.totalOrgAdminSeats})
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(!utilization || utilization.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No utilization data available
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Subscription Funnel</CardTitle>
            <CardDescription>Subscription lifecycle events over time</CardDescription>
          </div>
          <Select value={funnelDays} onValueChange={setFunnelDays}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="180">Last 180 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {funnelLoading ? (
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-success/10 dark:bg-success/20 border border-success/20 dark:border-success/50">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowRightLeft className="h-4 w-4 text-success" />
                  <span className="text-sm font-medium text-success dark:text-success">New Subscriptions</span>
                </div>
                <p className="text-3xl font-bold text-success">{funnel?.subscribed || 0}</p>
              </div>
              <div className="p-4 rounded-lg bg-primary/10 dark:bg-primary/20 border border-border dark:border-primary">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowUp className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-primary dark:text-primary">Upgrades</span>
                </div>
                <p className="text-3xl font-bold text-primary">{funnel?.upgraded || 0}</p>
              </div>
              <div className="p-4 rounded-lg bg-warning/10 dark:bg-warning/20 border border-warning dark:border-warning">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowDown className="h-4 w-4 text-warning" />
                  <span className="text-sm font-medium text-warning dark:text-warning">Downgrades</span>
                </div>
                <p className="text-3xl font-bold text-warning">{funnel?.downgraded || 0}</p>
              </div>
              <div className="p-4 rounded-lg bg-destructive/10 dark:bg-destructive/20 border border-destructive/20 dark:border-destructive">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium text-destructive dark:text-destructive">Cancellations</span>
                </div>
                <p className="text-3xl font-bold text-destructive">{funnel?.cancelled || 0}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
