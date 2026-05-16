import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/useAuth';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  BookOpen, 
  Trophy, 
  Target, 
  Calendar, 
  AlertTriangle,
  Search,
  Download,
  RefreshCw,
  BarChart3,
  GraduationCap,
  ClipboardList,
  Clock,
  Mail,
  Loader2
} from 'lucide-react';

type TabValue = 'overview' | 'learners' | 'courses' | 'quizzes' | 'deadlines';
type ReportFilters = {
  courseId?: string;
  departmentId?: string;
  subUnitId?: string;
  teamId?: string;
  courseStatus?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
};

// CSV Export utility
function downloadCSV(data: any[], filename: string, headers: string[]) {
  if (!data || data.length === 0) return;
  
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(h => {
      const key = h.toLowerCase().replace(/\s+/g, '');
      const value = row[key] ?? row[h] ?? '';
      // Escape quotes and wrap in quotes if contains comma
      const escaped = String(value).replace(/"/g, '""');
      return escaped.includes(',') ? `"${escaped}"` : escaped;
    }).join(','))
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}

function buildReportUrl(orgId: string, section: string, filters: ReportFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && value !== 'all') {
      params.set(key, String(value));
    }
  });
  const query = params.toString();
  return `/api/reports/learner-analytics/${orgId}/${section}${query ? `?${query}` : ''}`;
}

function pushExportRows(rows: any[], tab: string, data: any[] = [], mapRow: (row: any) => Record<string, any>) {
  data.forEach((row) => rows.push({ tab, ...mapRow(row) }));
}

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  loading?: boolean;
}

function KPICard({ title, value, subtitle, icon: Icon, trend, loading }: KPICardProps) {
  if (loading) {
    return (
      <Card className="bg-[var(--card-bg)] border-[var(--card-border)]">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-10 w-10 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[var(--card-bg)] border-[var(--card-border)] hover:border-[var(--card-hover-border)] transition-colors">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-body-muted">{title}</p>
            <p className="text-2xl font-bold text-fg-strong">{value}</p>
            {trend && (
              <div className="flex items-center gap-1">
                {trend.isPositive ? (
                  <TrendingUp className="w-3 h-3 text-success" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-destructive" />
                )}
                <span className={`text-xs font-medium ${trend.isPositive ? 'text-success' : 'text-destructive'}`}>
                  {trend.isPositive ? '+' : ''}{trend.value}%
                </span>
                <span className="text-xs text-body-muted">vs last period</span>
              </div>
            )}
            {subtitle && !trend && (
              <p className="text-xs text-body-muted">{subtitle}</p>
            )}
          </div>
          <div className="p-2.5 rounded-lg bg-[var(--pill-bg)] border border-[var(--pill-border)]">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface FiltersBarProps {
  selectedCourse: string;
  onCourseChange: (value: string) => void;
  selectedDepartment: string;
  onDepartmentChange: (value: string) => void;
  selectedUnit: string;
  onUnitChange: (value: string) => void;
  selectedTeam: string;
  onTeamChange: (value: string) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  dateRange: { start: Date | null; end: Date | null };
  onDateRangeChange: (range: { start: Date | null; end: Date | null }) => void;
  courses: Array<{ id: string; title: string }>;
  departments: Array<{ id: string; name: string; type?: string }>;
  units: Array<{ id: string; name: string; unitId?: string | null }>;
  teams: Array<{ id: string; name: string; subUnitId?: string | null }>;
  onRefresh: () => void;
  isRefreshing: boolean;
  onExportAll?: () => void;
  activeTab?: TabValue;
  selectedCourseStatus: string;
  onCourseStatusChange: (value: string) => void;
}

function FiltersBar({
  selectedCourse,
  onCourseChange,
  selectedDepartment,
  onDepartmentChange,
  selectedUnit,
  onUnitChange,
  selectedTeam,
  onTeamChange,
  searchQuery,
  onSearchChange,
  dateRange,
  onDateRangeChange,
  courses,
  departments,
  units,
  teams,
  onRefresh,
  isRefreshing,
  onExportAll,
  activeTab = 'overview',
  selectedCourseStatus,
  onCourseStatusChange,
}: FiltersBarProps) {
  const { terminology: rawTerminology } = useOrganizationTerminology();
  const terminology = rawTerminology || {
    learner: 'Learner',
    learnerPlural: 'Learners',
    unit: 'Department',
    unitPlural: 'Departments',
    subUnit: 'Unit',
    subUnitPlural: 'Units',
    team: 'Team',
    teamPlural: 'Teams',
  };
  const terminologyLower = {
    learner: terminology.learner.toLowerCase(),
    learnerPlural: terminology.learnerPlural.toLowerCase(),
    unit: terminology.unit.toLowerCase(),
    unitPlural: terminology.unitPlural.toLowerCase(),
    subUnit: terminology.subUnit.toLowerCase(),
    subUnitPlural: terminology.subUnitPlural.toLowerCase(),
    team: terminology.team.toLowerCase(),
    teamPlural: terminology.teamPlural.toLowerCase(),
  };
  const [courseSearchQuery, setCourseSearchQuery] = useState('');
  const [selectedDateRange, setSelectedDateRange] = useState('30d');
  
  const searchPlaceholder = {
    overview: `Search ${terminologyLower.learnerPlural}...`,
    learners: `Search ${terminologyLower.learnerPlural}...`,
    courses: 'Search courses...',
    quizzes: 'Search quizzes...',
    deadlines: 'Search assignments...'
  }[activeTab] || 'Search...';
  
  const handleDateRangeChange = (value: string) => {
    setSelectedDateRange(value);
    const now = new Date();
    let start: Date | null = null;
    
    switch (value) {
      case '7d':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '365d':
        start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        start = null;
        break;
    }
    onDateRangeChange({ start, end: value === 'all' ? null : now });
  };
  
  const filteredCourses = courses.filter(course =>
    course.title.toLowerCase().includes(courseSearchQuery.toLowerCase())
  );

  const filteredUnits = selectedDepartment !== 'all'
    ? units.filter(unit => unit.unitId === selectedDepartment)
    : units;

  const filteredTeams = selectedUnit !== 'all'
    ? teams.filter(team => !team.subUnitId || team.subUnitId === selectedUnit)
    : teams;
  
  return (
    <Card className="bg-[var(--card-bg)] border-[var(--card-border)]">
      <CardContent className="p-4">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 w-full">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-inputField-placeholder" />
              <Input
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9 bg-[var(--input-bg)] border-[var(--input-border)] text-inputField-foreground placeholder:text-inputField-placeholder"
              />
            </div>
            
            <Select value={selectedCourse} onValueChange={(value) => {
              onCourseChange(value);
              setCourseSearchQuery('');
            }}>
              <SelectTrigger className="bg-[var(--select-bg)] border-[var(--select-border)] text-select-fg">
                <SelectValue placeholder="All Courses" />
              </SelectTrigger>
              <SelectContent>
                <div className="p-2 border-b border-[var(--stroke-default)]">
                  <Input
                    placeholder="Search courses..."
                    value={courseSearchQuery}
                    onChange={(e) => setCourseSearchQuery(e.target.value)}
                    className="h-8 bg-[var(--input-bg)] border-[var(--input-border)] text-inputField-foreground placeholder:text-inputField-placeholder"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
                <SelectItem value="all">All Courses</SelectItem>
                {filteredCourses.map((course) => (
                  <SelectItem key={course.id} value={course.id}>
                    {course.title}
                  </SelectItem>
                ))}
                {filteredCourses.length === 0 && courseSearchQuery && (
                  <div className="p-2 text-sm text-body-muted text-center">
                    No courses match "{courseSearchQuery}"
                  </div>
                )}
              </SelectContent>
            </Select>

            <Select value={selectedDepartment} onValueChange={(value) => {
              onDepartmentChange(value);
              if (value !== selectedDepartment) {
                onUnitChange('all');
              }
            }}>
              <SelectTrigger className="bg-[var(--select-bg)] border-[var(--select-border)] text-select-fg">
                <SelectValue placeholder={`All ${terminology.unitPlural}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {terminology.unitPlural}</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={selectedUnit} onValueChange={(value) => {
              onUnitChange(value);
              // Reset team selection when unit changes
              onTeamChange('all');
            }}>
              <SelectTrigger className="bg-[var(--select-bg)] border-[var(--select-border)] text-select-fg">
                <SelectValue placeholder={`All ${terminology.subUnitPlural}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {terminology.subUnitPlural}</SelectItem>
                {filteredUnits.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>
                    {unit.name}
                  </SelectItem>
                ))}
                {filteredUnits.length === 0 && selectedDepartment !== 'all' && (
                  <div className="p-2 text-sm text-body-muted text-center">
                    No {terminologyLower.subUnitPlural} in this {terminologyLower.unit}
                  </div>
                )}
              </SelectContent>
            </Select>
            
            <Select value={selectedTeam} onValueChange={onTeamChange} disabled={selectedUnit === 'all'}>
              <SelectTrigger className="bg-[var(--select-bg)] border-[var(--select-border)] text-select-fg">
                <SelectValue placeholder={`All ${terminology.teamPlural}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {terminology.teamPlural}</SelectItem>
                {filteredTeams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
                {filteredTeams.length === 0 && selectedUnit !== 'all' && (
                  <div className="p-2 text-sm text-body-muted text-center">
                    No {terminologyLower.teamPlural} in this {terminologyLower.subUnit}
                  </div>
                )}
              </SelectContent>
            </Select>
            
            <Select value={selectedDateRange} onValueChange={handleDateRangeChange}>
              <SelectTrigger className="bg-[var(--select-bg)] border-[var(--select-border)] text-select-fg">
                <Calendar className="w-4 h-4 mr-2 text-inputField-placeholder" />
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="365d">Last year</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={selectedCourseStatus} onValueChange={onCourseStatusChange}>
              <SelectTrigger className="bg-[var(--select-bg)] border-[var(--select-border)] text-select-fg">
                <SelectValue placeholder="Course Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active Courses</SelectItem>
                <SelectItem value="draft">Draft Courses</SelectItem>
                <SelectItem value="archived">Archived Courses</SelectItem>
                <SelectItem value="inactive">Inactive Courses</SelectItem>
                <SelectItem value="all">All Statuses</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing} >
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={onExportAll} >
              <Download className="w-4 h-4 mr-2" />
              Export All
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface OverviewTabProps {
  orgId: string | null;
  isLoading: boolean;
  onDrilldown: (type: string, param?: string) => void;
  selectedCourse: string;
  selectedDepartment: string;
  selectedUnit: string;
  selectedTeam: string;
  dateRange: { start: Date | null; end: Date | null };
  selectedCourseStatus: string;
}

function OverviewTab({ orgId, isLoading, onDrilldown, selectedCourse, selectedDepartment, selectedUnit, selectedTeam, dateRange, selectedCourseStatus }: OverviewTabProps) {
  const { terminology: rawTerminology } = useOrganizationTerminology();
  const terminology = rawTerminology || { learner: 'Learner', learnerPlural: 'Learners' };
  const courseFilter = selectedCourse !== 'all' ? selectedCourse : undefined;
  const departmentFilter = selectedDepartment !== 'all' ? selectedDepartment : undefined;
  const unitFilter = selectedUnit !== 'all' ? selectedUnit : undefined;
  const teamFilter = selectedTeam !== 'all' ? selectedTeam : undefined;
  const courseStatusFilter = selectedCourseStatus !== 'all' ? selectedCourseStatus : undefined;
  const startDate = dateRange.start?.toISOString();
  const endDate = dateRange.end?.toISOString();
  
  const { data: overview } = useQuery<{
    activeLearners: number;
    totalLearners: number;
    coursesCompleted: number;
    averageQuizScore: number;
    completionRate: number;
    activeLearnersTrend?: number;
    coursesCompletedTrend?: number;
    averageQuizScoreTrend?: number;
    completionRateTrend?: number;
  }>({
    queryKey: ['/api/reports/learner-analytics', orgId, 'overview', { courseId: courseFilter, departmentId: departmentFilter, subUnitId: unitFilter, teamId: teamFilter, courseStatus: courseStatusFilter, startDate, endDate }],
    enabled: !!orgId,
    staleTime: 0,
  });

  const { data: funnelData, isLoading: funnelLoading } = useQuery<any>({
    queryKey: ['/api/reports/learner-analytics', orgId, 'completion-funnel', { courseId: courseFilter, departmentId: departmentFilter, subUnitId: unitFilter, teamId: teamFilter, courseStatus: courseStatusFilter, startDate, endDate }],
    enabled: !!orgId,
    staleTime: 0,
  });

  const { data: atRiskData } = useQuery<{ atRisk: Array<{ userId: string; name: string; reason: string; details: string }> }>({
    queryKey: ['/api/reports/learner-analytics', orgId, 'at-risk-learners', { courseId: courseFilter, departmentId: departmentFilter, subUnitId: unitFilter, teamId: teamFilter, courseStatus: courseStatusFilter, startDate, endDate }],
    enabled: !!orgId,
    staleTime: 0,
  });

  const atRiskCounts = {
    behindSchedule: atRiskData?.atRisk?.filter(r => r.reason === 'overdue_assignments').length ?? 0,
    lowScores: atRiskData?.atRisk?.filter(r => r.reason === 'low_quiz_scores').length ?? 0,
    inactive: atRiskData?.atRisk?.filter(r => r.reason === 'inactive').length ?? 0,
  };

  const funnelTotals = (funnelData?.courses || []).reduce(
    (acc: { enrolled: number; started: number; inProgress: number; completed: number }, c: any) => ({
      enrolled: acc.enrolled + (c.enrolled || 0),
      started: acc.started + (c.started || 0),
      inProgress: acc.inProgress + (c.inProgress || 0),
      completed: acc.completed + (c.completed || 0),
    }),
    { enrolled: 0, started: 0, inProgress: 0, completed: 0 }
  );

  const funnelPercentages = {
    enrolled: 100,
    started: funnelTotals.enrolled > 0 ? Math.round((funnelTotals.started / funnelTotals.enrolled) * 100) : 0,
    inProgress: funnelTotals.enrolled > 0 ? Math.round((funnelTotals.inProgress / funnelTotals.enrolled) * 100) : 0,
    completed: funnelTotals.enrolled > 0 ? Math.round((funnelTotals.completed / funnelTotals.enrolled) * 100) : 0,
  };

  const kpiData = [
    {
      title: `Active ${terminology.learnerPlural}`,
      value: overview?.activeLearners ?? 0,
      subtitle: `of ${overview?.totalLearners ?? 0} total`,
      icon: Users,
      trend: overview?.activeLearnersTrend !== undefined ? {
        value: overview.activeLearnersTrend,
        isPositive: overview.activeLearnersTrend >= 0,
      } : undefined,
    },
    {
      title: 'Courses Completed',
      value: overview?.coursesCompleted ?? 0,
      icon: GraduationCap,
      trend: overview?.coursesCompletedTrend !== undefined ? {
        value: overview.coursesCompletedTrend,
        isPositive: overview.coursesCompletedTrend >= 0,
      } : undefined,
    },
    {
      title: 'Average Score',
      value: overview?.averageQuizScore ? `${overview.averageQuizScore.toFixed(1)}%` : '0%',
      icon: Target,
      trend: overview?.averageQuizScoreTrend !== undefined ? {
        value: overview.averageQuizScoreTrend,
        isPositive: overview.averageQuizScoreTrend >= 0,
      } : undefined,
    },
    {
      title: 'Completion Rate',
      value: overview?.completionRate ? `${overview.completionRate.toFixed(1)}%` : '0%',
      icon: Trophy,
      trend: overview?.completionRateTrend !== undefined ? {
        value: overview.completionRateTrend,
        isPositive: overview.completionRateTrend >= 0,
      } : undefined,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiData.map((kpi, index) => (
          <KPICard
            key={index}
            title={kpi.title}
            value={kpi.value}
            subtitle={kpi.subtitle}
            icon={kpi.icon}
            trend={kpi.trend}
            loading={isLoading}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-[var(--card-bg)] border-[var(--card-border)]">
          <CardHeader>
            <CardTitle className="text-fg-strong flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Course Completion Funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            {funnelLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-10" />
                    </div>
                    <Skeleton className="h-3 w-full rounded-full" />
                  </div>
                ))}
              </div>
            ) : funnelTotals.enrolled === 0 ? (
              <div className="text-center py-8 text-body-muted">
                No enrollment data available
              </div>
            ) : (
              <div className="space-y-4">
                <FunnelStep label="Enrolled" value={funnelPercentages.enrolled} color="var(--chart-1)" onClick={() => onDrilldown('funnel', 'enrolled')} />
                <FunnelStep label="Started" value={funnelPercentages.started} color="var(--chart-2)" onClick={() => onDrilldown('funnel', 'started')} />
                <FunnelStep label="In Progress" value={funnelPercentages.inProgress} color="var(--chart-3)" onClick={() => onDrilldown('funnel', 'in_progress')} />
                <FunnelStep label="Completed" value={funnelPercentages.completed} color="var(--chart-4)" onClick={() => onDrilldown('funnel', 'completed')} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[var(--card-bg)] border-[var(--card-border)]">
          <CardHeader>
            <CardTitle className="text-fg-strong flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              At-Risk {terminology.learnerPlural}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-body-muted">
                {terminology.learnerPlural} who may need attention based on their progress and engagement.
              </p>
              <div 
                className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface-muted)] border border-[var(--stroke-default)] cursor-pointer hover:bg-[var(--surface-muted)]/80 transition-colors"
                onClick={() => onDrilldown('at-risk', 'behind_schedule')}
              >
                <div>
                  <p className="font-medium text-fg-default">Behind Schedule</p>
                  <p className="text-xs text-body-muted">More than 7 days behind</p>
                </div>
                <Badge >{atRiskCounts.behindSchedule}</Badge>
              </div>
              <div 
                className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface-muted)] border border-[var(--stroke-default)] cursor-pointer hover:bg-[var(--surface-muted)]/80 transition-colors"
                onClick={() => onDrilldown('at-risk', 'low_scores')}
              >
                <div>
                  <p className="font-medium text-fg-default">Low Quiz Scores</p>
                  <p className="text-xs text-body-muted">Averaging below 60%</p>
                </div>
                <Badge >{atRiskCounts.lowScores}</Badge>
              </div>
              <div 
                className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface-muted)] border border-[var(--stroke-default)] cursor-pointer hover:bg-[var(--surface-muted)]/80 transition-colors"
                onClick={() => onDrilldown('at-risk', 'inactive')}
              >
                <div>
                  <p className="font-medium text-fg-default">Inactive</p>
                  <p className="text-xs text-body-muted">No activity in 14+ days</p>
                </div>
                <Badge >{atRiskCounts.inactive}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FunnelStep({ label, value, color, onClick }: { label: string; value: number; color: string; onClick?: () => void }) {
  return (
    <div 
      className={`space-y-1.5 ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between text-sm">
        <span className="text-fg-default">{label}</span>
        <span className="font-medium text-fg-strong">{value}%</span>
      </div>
      <div className="h-3 rounded-full bg-[var(--surface-muted)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

interface LearnersTabProps {
  orgId: string;
  onSelectLearner: (id: string) => void;
  selectedCourse: string;
  selectedDepartment: string;
  selectedUnit: string;
  selectedTeam: string;
  searchQuery: string;
  dateRange: { start: Date | null; end: Date | null };
  selectedCourseStatus: string;
}

function LearnersTab({ orgId, onSelectLearner, selectedCourse, selectedDepartment, selectedUnit, selectedTeam, searchQuery, dateRange, selectedCourseStatus }: LearnersTabProps) {
  const { terminology: rawTerminology } = useOrganizationTerminology();
  const terminology = rawTerminology || { learner: 'Learner', learnerPlural: 'Learners' };
  const courseFilter = selectedCourse !== 'all' ? selectedCourse : undefined;
  const departmentFilter = selectedDepartment !== 'all' ? selectedDepartment : undefined;
  const unitFilter = selectedUnit !== 'all' ? selectedUnit : undefined;
  const teamFilter = selectedTeam !== 'all' ? selectedTeam : undefined;
  const courseStatusFilter = selectedCourseStatus !== 'all' ? selectedCourseStatus : undefined;
  const startDate = dateRange.start?.toISOString();
  const endDate = dateRange.end?.toISOString();
  
  const { data: topPerformers, isLoading: topLoading } = useQuery<any>({
    queryKey: ['/api/reports/learner-analytics', orgId, 'top-performers', { courseId: courseFilter, departmentId: departmentFilter, subUnitId: unitFilter, teamId: teamFilter, courseStatus: courseStatusFilter, search: searchQuery || undefined, startDate, endDate }],
    enabled: !!orgId,
    staleTime: 0,
  });
  
  const { data: atRiskData, isLoading: atRiskLoading } = useQuery<any>({
    queryKey: ['/api/reports/learner-analytics', orgId, 'at-risk-learners', { courseId: courseFilter, departmentId: departmentFilter, subUnitId: unitFilter, teamId: teamFilter, courseStatus: courseStatusFilter, search: searchQuery || undefined, startDate, endDate }],
    enabled: !!orgId,
    staleTime: 0,
  });
  
  return (
    <div className="space-y-6">
      {/* Top Performers Section */}
      <Card className="bg-[var(--card-bg)] border-[var(--card-border)]">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-fg-strong">
            <Trophy className="w-5 h-5 text-warning" />
            Top Performers
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => downloadCSV(
              topPerformers?.performers || [],
              'top_performers',
              ['name', 'coursesCompleted', 'avgScore']
            )}
            className="border-border text-foreground hover:bg-muted"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>{terminology.learner}</TableHead>
                <TableHead>Courses Completed</TableHead>
                <TableHead>Avg Score</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topPerformers?.performers?.map((p: any, i: number) => (
                <TableRow key={p.userId} className="cursor-pointer hover:bg-[var(--table-row-hover-bg)]" onClick={() => onSelectLearner(p.userId)}>
                  <TableCell>
                    {i === 0 && <span className="text-warning">🥇</span>}
                    {i === 1 && <span>🥈</span>}
                    {i === 2 && <span>🥉</span>}
                    {i > 2 && <span>#{i + 1}</span>}
                  </TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.coursesCompleted}</TableCell>
                  <TableCell>{p.avgScore?.toFixed(1)}%</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm">View Profile</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {/* At-risk learner section */}
      <Card className="bg-[var(--card-bg)] border-[var(--card-border)]">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-fg-strong">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            {terminology.learnerPlural} Needing Attention
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => downloadCSV(
              atRiskData?.atRisk || [],
              'at_risk_learners',
              ['name', 'reason', 'details']
            )}
            className="border-border text-foreground hover:bg-muted"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{terminology.learner}</TableHead>
                <TableHead>Risk Category</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {atRiskData?.atRisk?.map((r: any) => (
                <TableRow key={r.userId}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <Badge variant={r.reason === 'overdue_assignments' ? 'destructive' : r.reason === 'low_quiz_scores' ? 'secondary' : 'outline'}>
                      {r.reason.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-body-muted">{r.details}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => onSelectLearner(r.userId)}>View Profile</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

interface CoursesTabProps {
  orgId: string;
  onDrilldown: (type: string, param?: string) => void;
  selectedCourse: string;
  selectedDepartment: string;
  selectedUnit: string;
  selectedTeam: string;
  searchQuery: string;
  dateRange: { start: Date | null; end: Date | null };
  selectedCourseStatus: string;
}

function CoursesTab({ orgId, onDrilldown, selectedCourse, selectedDepartment, selectedUnit, selectedTeam, searchQuery, dateRange, selectedCourseStatus }: CoursesTabProps) {
  const courseFilter = selectedCourse !== 'all' ? selectedCourse : undefined;
  const departmentFilter = selectedDepartment !== 'all' ? selectedDepartment : undefined;
  const unitFilter = selectedUnit !== 'all' ? selectedUnit : undefined;
  const teamFilter = selectedTeam !== 'all' ? selectedTeam : undefined;
  const courseStatusFilter = selectedCourseStatus !== 'all' ? selectedCourseStatus : undefined;
  const startDate = dateRange.start?.toISOString();
  const endDate = dateRange.end?.toISOString();
  
  const { data: funnelData, isLoading } = useQuery<any>({
    queryKey: ['/api/reports/learner-analytics', orgId, 'completion-funnel', { courseId: courseFilter, departmentId: departmentFilter, subUnitId: unitFilter, teamId: teamFilter, courseStatus: courseStatusFilter, search: searchQuery || undefined, startDate, endDate }],
    enabled: !!orgId,
    staleTime: 0,
  });
  
  const chartData = funnelData?.courses?.map((c: any) => ({
    name: c.courseName?.substring(0, 20) + (c.courseName?.length > 20 ? '...' : ''),
    enrolled: c.enrolled || 0,
    started: c.started || 0,
    inProgress: c.inProgress || 0,
    completed: c.completed || 0,
    completionRate: c.enrolled > 0 ? Math.round((c.completed / c.enrolled) * 100) : 0,
  })) || [];
  
  return (
    <div className="space-y-6">
      <Card className="bg-[var(--card-bg)] border-[var(--card-border)]">
        <CardHeader>
          <CardTitle className="text-fg-strong">Course Completion Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="enrolled" fill="var(--action-primary)" name="Enrolled" />
                <Bar dataKey="started" fill="var(--action-secondary)" name="Started" />
                <Bar dataKey="inProgress" fill="var(--warning)" name="In Progress" />
                <Bar dataKey="completed" fill="var(--success)" name="Completed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-[var(--card-bg)] border-[var(--card-border)]">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-fg-strong">Course Performance Details</CardTitle>
          <Button variant="outline" size="sm" onClick={() => downloadCSV(
              funnelData?.courses || [],
              'course_completion_data',
              ['courseName', 'enrolled', 'started', 'inProgress', 'completed']
            )}
            className="border-border text-foreground hover:bg-muted"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead className="text-right">Enrolled</TableHead>
                <TableHead className="text-right">Started</TableHead>
                <TableHead className="text-right">In Progress</TableHead>
                <TableHead className="text-right">Completed</TableHead>
                <TableHead className="text-right">Completion Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {funnelData?.courses?.map((c: any) => (
                <TableRow 
                  key={c.courseId} 
                  className="cursor-pointer hover:bg-[var(--table-row-hover-bg)]"
                  onClick={() => onDrilldown('course-learners', c.courseId)}
                >
                  <TableCell className="font-medium">{c.courseName}</TableCell>
                  <TableCell className="text-right">{c.enrolled || 0}</TableCell>
                  <TableCell className="text-right">{c.started || 0}</TableCell>
                  <TableCell className="text-right">{c.inProgress || 0}</TableCell>
                  <TableCell className="text-right">{c.completed || 0}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={c.enrolled > 0 && (c.completed / c.enrolled) >= 0.7 ? 'default' : 'secondary'}>
                      {c.enrolled > 0 ? Math.round((c.completed / c.enrolled) * 100) : 0}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

interface DeadlinesTabProps {
  orgId: string;
  selectedCourse: string;
  selectedDepartment: string;
  selectedUnit: string;
  selectedTeam: string;
  searchQuery: string;
  dateRange: { start: Date | null; end: Date | null };
}

function DeadlinesTab({ orgId, selectedCourse, selectedDepartment, selectedUnit, selectedTeam, searchQuery, dateRange }: DeadlinesTabProps) {
  const { isTeacher, isOrgAdmin, isSuperAdmin } = useAuth();
  const { terminology: rawTerminology } = useOrganizationTerminology();
  const terminology = rawTerminology || { learner: 'Learner' };
  const { toast } = useToast();
  const [emailDialog, setEmailDialog] = useState<{
    open: boolean;
    type: 'overdue' | 'upcoming';
    recipients: string[] | 'all';
    recipientCount: number;
  }>({ open: false, type: 'overdue', recipients: [], recipientCount: 0 });
  
  const canSendEmails = isTeacher || isOrgAdmin || isSuperAdmin;
  
  const courseFilter = selectedCourse !== 'all' ? selectedCourse : undefined;
  const departmentFilter = selectedDepartment !== 'all' ? selectedDepartment : undefined;
  const unitFilter = selectedUnit !== 'all' ? selectedUnit : undefined;
  const teamFilter = selectedTeam !== 'all' ? selectedTeam : undefined;
  const startDate = dateRange.start?.toISOString();
  const endDate = dateRange.end?.toISOString();
  
  const { data: deadlineData, isLoading } = useQuery<any>({
    queryKey: ['/api/reports/learner-analytics', orgId, 'deadlines', { courseId: courseFilter, departmentId: departmentFilter, subUnitId: unitFilter, teamId: teamFilter, search: searchQuery || undefined, startDate, endDate }],
    enabled: !!orgId,
    staleTime: 0,
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (params: { type: 'overdue' | 'upcoming'; recipients: string[] | 'all'; courseId?: string }) => {
      return apiRequest(`/api/reports/learner-analytics/${orgId}/deadlines/email`, {
        method: 'POST',
        body: JSON.stringify(params),
      });
    },
    onSuccess: (data: any) => {
      if (data.success) {
        toast({
          title: "Emails sent successfully",
          description: data.message,
        });
      } else {
        toast({
          title: "Partial success",
          description: data.message,
          variant: "destructive",
        });
      }
      setEmailDialog({ open: false, type: 'overdue', recipients: [], recipientCount: 0 });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send emails",
        description: error.message || "An error occurred while sending emails",
        variant: "destructive",
      });
      setEmailDialog({ open: false, type: 'overdue', recipients: [], recipientCount: 0 });
    },
  });

  const handleSendEmail = (type: 'overdue' | 'upcoming', recipients: string[] | 'all', recipientCount: number) => {
    setEmailDialog({ open: true, type, recipients, recipientCount });
  };

  const confirmSendEmail = () => {
    sendEmailMutation.mutate({
      type: emailDialog.type,
      recipients: emailDialog.recipients,
      courseId: courseFilter,
    });
  };
  
  return (
    <div className="space-y-6">
      <Card className="bg-[var(--card-bg)] border-[var(--card-border)] border-l-4 border-l-[var(--destructive)]">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Overdue Assignments ({deadlineData?.overdue?.length || 0})
          </CardTitle>
          <div className="flex items-center gap-2 shrink-0">
            {canSendEmails && (deadlineData?.overdue?.length || 0) > 0 && (
              <Button variant="outline" size="sm" onClick={() => handleSendEmail('overdue', 'all', deadlineData?.overdue?.length || 0)}
                className="border-[var(--destructive)] text-destructive hover:bg-destructive/10"
              >
                <Mail className="w-4 h-4 mr-2" />
                Email All
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => downloadCSV(
                deadlineData?.overdue || [],
                'overdue_assignments',
                ['userName', 'courseName', 'dueDate', 'daysOverdue']
              )}
              className="border-border text-foreground hover:bg-muted"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {deadlineData?.overdue?.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{terminology.learner}</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Days Overdue</TableHead>
                  {canSendEmails && <TableHead className="w-12"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {deadlineData?.overdue?.map((item: any, i: number) => (
                  <TableRow key={i} className="bg-destructive/5">
                    <TableCell className="font-medium">{item.userName || item.userId}</TableCell>
                    <TableCell>{item.courseName || item.courseId}</TableCell>
                    <TableCell>{new Date(item.dueDate).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="destructive">{item.daysOverdue} days</Badge>
                    </TableCell>
                    {canSendEmails && (
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => handleSendEmail('overdue', [item.userId], 1)}
                          className="h-8 w-8 text-body-muted hover:text-destructive"
                          title="Send reminder email"
                        >
                          <Mail className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-body-muted">No overdue assignments</div>
          )}
        </CardContent>
      </Card>
      
      <Card className="bg-[var(--card-bg)] border-[var(--card-border)]">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-fg-strong">
            <Calendar className="w-5 h-5 text-warning" />
            Upcoming Deadlines (Next 7 Days)
          </CardTitle>
          <div className="flex items-center gap-2 shrink-0">
            {canSendEmails && (deadlineData?.upcoming?.length || 0) > 0 && (
              <Button variant="outline" size="sm" onClick={() => handleSendEmail('upcoming', 'all', deadlineData?.upcoming?.length || 0)}
                className="border-primary text-primary hover:bg-primary/10"
              >
                <Mail className="w-4 h-4 mr-2" />
                Email All
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => downloadCSV(
                deadlineData?.upcoming || [],
                'upcoming_deadlines',
                ['userName', 'courseName', 'dueDate', 'daysRemaining']
              )}
              className="border-border text-foreground hover:bg-muted"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {deadlineData?.upcoming?.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{terminology.learner}</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Days Remaining</TableHead>
                  {canSendEmails && <TableHead className="w-12"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {deadlineData?.upcoming?.map((item: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{item.userName || item.userId}</TableCell>
                    <TableCell>{item.courseName || item.courseId}</TableCell>
                    <TableCell>{new Date(item.dueDate).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={item.daysRemaining <= 2 ? 'secondary' : 'outline'}>
                        {item.daysRemaining} days
                      </Badge>
                    </TableCell>
                    {canSendEmails && (
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => handleSendEmail('upcoming', [item.userId], 1)}
                          className="h-8 w-8 text-body-muted hover:text-primary"
                          title="Send reminder email"
                        >
                          <Mail className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-body-muted">No upcoming deadlines</div>
          )}
        </CardContent>
      </Card>

      {emailDialog.open && (
        <Card className="bg-[var(--card-bg)] border-[var(--card-border)]">
          <CardHeader>
            <CardTitle className="text-fg-strong">
              Send {emailDialog.type === 'overdue' ? 'Overdue' : 'Upcoming Deadline'} Reminder
            </CardTitle>
            <p className="text-sm text-body-muted">
              {emailDialog.recipients === 'all'
                ? `This will send reminder emails to ${emailDialog.recipientCount} learner${emailDialog.recipientCount !== 1 ? 's' : ''}.`
                : 'This will send a reminder email to the selected learner.'}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-body-base">
              {emailDialog.type === 'overdue'
                ? 'The email will remind learners about their overdue assignments and encourage them to complete their coursework.'
                : 'The email will notify learners about their upcoming deadline and encourage them to complete their assignments on time.'}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEmailDialog({ ...emailDialog, open: false })}
                className="border-border text-foreground"
              >
                Cancel
              </Button>
              <Button onClick={confirmSendEmail} disabled={sendEmailMutation.isPending} className={emailDialog.type === 'overdue' ? "bg-destructive hover:bg-destructive/90" : "bg-primary hover:bg-primary/90"} >
                {sendEmailMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    Send Email{emailDialog.recipientCount > 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LearnerProfilePage({ userId, orgId, courseId, onBack }: { userId: string; orgId: string; courseId?: string; onBack: () => void }) {
  const { data: profile, isLoading } = useQuery<any>({
    queryKey: courseId && courseId !== 'all' 
      ? ['/api/reports/learner-analytics', orgId, 'learner', userId, 'profile', { courseId }]
      : ['/api/reports/learner-analytics', orgId, 'learner', userId, 'profile'],
    enabled: !!userId && !!orgId,
    staleTime: 0,
  });
  
  return (
    <Card className="bg-[var(--card-bg)] border-[var(--card-border)]">
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
              {profile?.user?.name?.charAt(0) || '?'}
            </div>
            <div>
              <div className="text-lg font-semibold text-fg-strong">{profile?.user?.name || 'Loading...'}</div>
              <div className="text-sm text-body-muted">{profile?.user?.email}</div>
            </div>
          </div>
          <Button variant="outline" onClick={onBack}>Back to Reports</Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div>
          <h3 className="font-semibold mb-3">Course Progress</h3>
          <div className="space-y-3">
            {profile?.courses?.map((c: any) => (
              <div key={c.courseId} className="p-3 border rounded-lg">
                <div className="flex justify-between mb-2">
                  <span className="font-medium">{c.name}</span>
                  <Badge variant={c.status === 'completed' ? 'default' : c.status === 'in_progress' ? 'secondary' : 'outline'}>
                    {c.status?.replace('_', ' ')}
                  </Badge>
                </div>
                <Progress value={c.progress || 0} className="h-2" />
                <div className="flex justify-between text-xs text-body-muted mt-1">
                  <span>{c.progress || 0}% complete</span>
                  {c.dueDate && <span>Due: {new Date(c.dueDate).toLocaleDateString()}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="font-semibold mb-3">Recent Quiz Attempts</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[150px]">Quiz</TableHead>
                  <TableHead className="min-w-[80px]">Score</TableHead>
                  <TableHead className="min-w-[100px]">Result</TableHead>
                  <TableHead className="min-w-[100px]">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profile?.quizHistory?.slice(0, 10).map((q: any, i: number) => {
                  const displayScore = q.score <= 1 ? Math.round(q.score * 100) : q.score < 10 && q.totalQuestions && q.correctAnswers ? Math.round((q.correctAnswers / q.totalQuestions) * 100) : q.score;
                  return (
                    <TableRow key={i}>
                      <TableCell>{q.quizName || 'Quiz'}</TableCell>
                      <TableCell>{displayScore}%</TableCell>
                      <TableCell>
                        <Badge variant={q.passed ? 'default' : 'destructive'}>
                          {q.passed ? 'Passed' : 'Failed'}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(q.date).toLocaleDateString()}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface QuizzesTabProps {
  orgId: string;
  onDrilldown: (type: string, param?: string) => void;
  selectedCourse: string;
  selectedDepartment: string;
  selectedUnit: string;
  selectedTeam: string;
  searchQuery: string;
  dateRange: { start: Date | null; end: Date | null };
  selectedCourseStatus: string;
}

function QuizzesTab({ orgId, onDrilldown, selectedCourse, selectedDepartment, selectedUnit, selectedTeam, searchQuery, dateRange, selectedCourseStatus }: QuizzesTabProps) {
  const { terminology: rawTerminology } = useOrganizationTerminology();
  const terminology = rawTerminology || { learnerPlural: 'Learners' };
  const learnerPluralLower = terminology.learnerPlural.toLowerCase();
  const courseFilter = selectedCourse !== 'all' ? selectedCourse : undefined;
  const departmentFilter = selectedDepartment !== 'all' ? selectedDepartment : undefined;
  const unitFilter = selectedUnit !== 'all' ? selectedUnit : undefined;
  const teamFilter = selectedTeam !== 'all' ? selectedTeam : undefined;
  const courseStatusFilter = selectedCourseStatus !== 'all' ? selectedCourseStatus : undefined;
  const startDate = dateRange.start?.toISOString();
  const endDate = dateRange.end?.toISOString();
  
  const { data: quizData, isLoading } = useQuery<any>({
    queryKey: ['/api/reports/learner-analytics', orgId, 'quiz-analytics', { courseId: courseFilter, departmentId: departmentFilter, subUnitId: unitFilter, teamId: teamFilter, courseStatus: courseStatusFilter, search: searchQuery || undefined, startDate, endDate }],
    enabled: !!orgId,
    staleTime: 0,
  });
  
  // Score distribution chart data
  const distributionData = quizData?.scoreDistribution || [];
  
  return (
    <div className="space-y-6">
      {/* Quiz Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card 
          className="bg-[var(--card-bg)] border-[var(--card-border)] cursor-pointer hover:border-[var(--card-hover-border)] transition-colors"
          onClick={() => onDrilldown('quiz-breakdown')}
        >
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-success">{quizData?.overallPassRate?.toFixed(1) || 0}%</div>
              <div className="text-sm text-body-muted">Overall Pass Rate</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[var(--card-bg)] border-[var(--card-border)]">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">{quizData?.avgAttemptsToPass?.toFixed(1) || 0}</div>
              <div className="text-sm text-body-muted">Avg Attempts to Pass</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[var(--card-bg)] border-[var(--card-border)]">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-fg-strong">{quizData?.totalAttempts || 0}</div>
              <div className="text-sm text-body-muted">Total Quiz Attempts</div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Score Distribution Chart */}
      <Card className="bg-[var(--card-bg)] border-[var(--card-border)]">
        <CardHeader>
          <CardTitle className="text-fg-strong">Score Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distributionData}>
                <XAxis dataKey="range" />
                <YAxis />
                <Tooltip 
                  formatter={(value: number) => [`${value} ${learnerPluralLower}`, terminology.learnerPlural]}
                  labelFormatter={(label) => `Score Range: ${label}%`}
                />
                <Bar 
                  dataKey="count" 
                  fill="var(--chart-1)"
                  onClick={(data: any) => onDrilldown('score-range', data?.payload?.range || data?.range)}
                  style={{ cursor: 'pointer' }}
                >
                  {distributionData.map((entry: any, index: number) => (
                    <Cell key={index} fill={
                      entry.range === '81-100' ? 'var(--chart-2)' :
                      entry.range === '61-80' ? 'var(--chart-1)' :
                      entry.range === '41-60' ? 'var(--chart-3)' :
                      'var(--chart-5)'
                    } />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      
      {/* Lesson Difficulty Table */}
      <Card className="bg-[var(--card-bg)] border-[var(--card-border)]">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-fg-strong">Lesson Difficulty Analysis</CardTitle>
            <p className="text-sm text-body-muted">Lessons ranked by quiz pass rate (hardest first)</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => downloadCSV(
              quizData?.lessonDifficulty || [],
              'lesson_difficulty_data',
              ['lessonName', 'courseName', 'passRate', 'attempts']
            )}
            className="border-border text-foreground hover:bg-muted shrink-0"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lesson</TableHead>
                <TableHead>Course</TableHead>
                <TableHead className="text-right">Pass Rate</TableHead>
                <TableHead className="text-right">Attempts</TableHead>
                <TableHead>Difficulty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quizData?.lessonDifficulty?.map((l: any) => (
                <TableRow key={`${l.lessonId}-${l.courseId}`}>
                  <TableCell className="font-medium">{l.lessonName}</TableCell>
                  <TableCell className="text-body-muted">{l.courseName || 'No Course'}</TableCell>
                  <TableCell className="text-right">{l.passRate?.toFixed(1)}%</TableCell>
                  <TableCell className="text-right">{l.attempts || 0}</TableCell>
                  <TableCell>
                    <Badge variant={l.passRate >= 70 ? 'default' : l.passRate >= 50 ? 'secondary' : 'destructive'}>
                      {l.passRate >= 70 ? 'Easy' : l.passRate >= 50 ? 'Medium' : 'Hard'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Reports() {
  const { effectiveOrganizationId, isSuperAdmin, isOrgAdmin, isTeacher } = useAuth();
  const { terminology: rawTerminology } = useOrganizationTerminology();
  const terminology = rawTerminology || {
    learner: 'Learner',
    learnerPlural: 'Learners',
    educator: 'Instructor',
  };
  const learnerPluralLower = terminology.learnerPlural.toLowerCase();
  
  const [activeTab, setActiveTab] = useState<TabValue>('overview');
  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null });
  const [selectedCourse, setSelectedCourse] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedUnit, setSelectedUnit] = useState<string>('all');
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [selectedCourseStatus, setSelectedCourseStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLearnerId, setSelectedLearnerId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [drilldownModal, setDrilldownModal] = useState<{
    open: boolean;
    type: string;
    param?: string;
  }>({ open: false, type: '' });

  const orgId = effectiveOrganizationId || '';
  const reportFilters: ReportFilters = {
    courseId: selectedCourse !== 'all' ? selectedCourse : undefined,
    departmentId: selectedDepartment !== 'all' ? selectedDepartment : undefined,
    subUnitId: selectedUnit !== 'all' ? selectedUnit : undefined,
    teamId: selectedTeam !== 'all' ? selectedTeam : undefined,
    courseStatus: selectedCourseStatus !== 'all' ? selectedCourseStatus : undefined,
    search: searchQuery || undefined,
    startDate: dateRange.start?.toISOString(),
    endDate: dateRange.end?.toISOString()
  };

  const { data: courses = [], isLoading: coursesLoading } = useQuery<Array<{ id: string; title: string }>>({
    queryKey: ['/api/admin/organizations', orgId, 'courses'],
    enabled: !!orgId,
  });

  const { data: departments = [], isLoading: departmentsLoading } = useQuery<Array<{ id: string; name: string; type?: string }>>({
    queryKey: ['/api/admin/organizations', orgId, 'units'],
    enabled: !!orgId,
  });

  const { data: units = [], isLoading: unitsLoading } = useQuery<Array<{ id: string; name: string; unitId?: string | null }>>({
    queryKey: ['/api/admin/organizations', orgId, 'sub-units'],
    enabled: !!orgId,
  });

  const { data: teams = [], isLoading: teamsLoading } = useQuery<Array<{ id: string; name: string; subUnitId?: string | null }>>({
    queryKey: ['/api/organization/teams', selectedUnit !== 'all' ? selectedUnit : null],
    enabled: selectedUnit !== 'all' && !!orgId,
  });

  const { data: funnelDetails, isLoading: funnelLoading } = useQuery<any>({
    queryKey: ['/api/reports/learner-analytics', orgId, 'funnel-details', drilldownModal.param, reportFilters],
    enabled: drilldownModal.open && drilldownModal.type === 'funnel' && !!drilldownModal.param,
    staleTime: 0,
  });

  const { data: atRiskDetails, isLoading: atRiskLoading } = useQuery<any>({
    queryKey: ['/api/reports/learner-analytics', orgId, 'at-risk-details', drilldownModal.param, reportFilters],
    enabled: drilldownModal.open && drilldownModal.type === 'at-risk' && !!drilldownModal.param,
    staleTime: 0,
  });

  const { data: courseLearners, isLoading: courseLearnersLoading } = useQuery<any>({
    queryKey: ['/api/reports/learner-analytics', orgId, 'course-learners', drilldownModal.param, reportFilters],
    enabled: drilldownModal.open && drilldownModal.type === 'course-learners' && !!drilldownModal.param,
    staleTime: 0,
  });

  const { data: quizBreakdown, isLoading: quizBreakdownLoading } = useQuery<any>({
    queryKey: ['/api/reports/learner-analytics', orgId, 'quiz-breakdown', reportFilters],
    enabled: drilldownModal.open && drilldownModal.type === 'quiz-breakdown',
    staleTime: 0,
  });

  const { data: scoreRangeData, isLoading: scoreRangeLoading } = useQuery<any>({
    queryKey: ['/api/reports/learner-analytics', orgId, 'quiz-score-range', drilldownModal.param, reportFilters],
    enabled: drilldownModal.open && drilldownModal.type === 'score-range' && !!drilldownModal.param,
    staleTime: 0,
  });

  const handleDrilldown = (type: string, param?: string) => {
    setDrilldownModal({ open: true, type, param });
  };

  const getModalTitle = (type: string, param?: string): string => {
    if (type === 'at-risk') {
      const titles: Record<string, string> = {
        behind_schedule: `Behind Schedule ${terminology.learnerPlural}`,
        low_scores: `Low Score ${terminology.learnerPlural}`,
        inactive: `Inactive ${terminology.learnerPlural}`
      };
      return titles[param || ''] || `At-Risk ${terminology.learnerPlural}`;
    }
    if (type === 'funnel') {
      const stage = param?.replace('_', ' ');
      return `${stage?.charAt(0).toUpperCase()}${stage?.slice(1) || ''} ${terminology.learnerPlural}`;
    }
    if (type === 'course-learners') {
      return `Course ${terminology.learnerPlural}`;
    }
    if (type === 'quiz-breakdown') {
      return 'Quiz Performance Breakdown';
    }
    if (type === 'score-range') {
      return `Score Range: ${param || ''}%`;
    }
    return 'Details';
  };

  const getModalDescription = (type: string, param?: string): string => {
    if (type === 'at-risk') {
      const descriptions: Record<string, string> = {
        behind_schedule: `${terminology.learnerPlural} who are more than 7 days behind on their assignments`,
        low_scores: `${terminology.learnerPlural} averaging below 60% on quizzes`,
        inactive: `${terminology.learnerPlural} with no activity in the last 14+ days`
      };
      return descriptions[param || ''] || `${terminology.learnerPlural} requiring attention`;
    }
    if (type === 'funnel') {
      return `All ${learnerPluralLower} at the ${param?.replace('_', ' ')} stage`;
    }
    if (type === 'course-learners') {
      return `All ${learnerPluralLower} enrolled in this course`;
    }
    if (type === 'quiz-breakdown') {
      return 'Detailed breakdown of quiz performance by quiz';
    }
    if (type === 'score-range') {
      return `${terminology.learnerPlural} with average quiz scores in the ${param || ''} range`;
    }
    return '';
  };

  const getModalColumns = (type: string, param?: string): { key: string; header: string }[] => {
    if (type === 'at-risk') {
      if (param === 'behind_schedule') {
        return [
          { key: 'name', header: terminology.learner },
          { key: 'email', header: 'Email' },
          { key: 'courseName', header: 'Course' },
          { key: 'daysOverdue', header: 'Days Overdue' },
          { key: 'progress', header: 'Progress' }
        ];
      }
      if (param === 'low_scores') {
        return [
          { key: 'name', header: terminology.learner },
          { key: 'email', header: 'Email' },
          { key: 'avgScore', header: 'Avg Score' },
          { key: 'totalAttempts', header: 'Attempts' },
          { key: 'reason', header: 'Details' }
        ];
      }
      if (param === 'inactive') {
        return [
          { key: 'name', header: terminology.learner },
          { key: 'email', header: 'Email' },
          { key: 'daysInactive', header: 'Days Inactive' },
          { key: 'lastActive', header: 'Last Active' }
        ];
      }
      return [
        { key: 'name', header: terminology.learner },
        { key: 'email', header: 'Email' },
        { key: 'details', header: 'Details' },
        { key: 'lastActive', header: 'Last Active' }
      ];
    }
    if (type === 'funnel') {
      return [
        { key: 'name', header: terminology.learner },
        { key: 'email', header: 'Email' },
        { key: 'courseName', header: 'Course' },
        { key: 'progress', header: 'Progress' }
      ];
    }
    if (type === 'course-learners') {
      return [
        { key: 'name', header: terminology.learner },
        { key: 'email', header: 'Email' },
        { key: 'status', header: 'Status' },
        { key: 'progress', header: 'Progress' },
        { key: 'lastAccessed', header: 'Last Accessed' }
      ];
    }
    if (type === 'quiz-breakdown') {
      return [
        { key: 'quizName', header: 'Quiz' },
        { key: 'totalAttempts', header: 'Attempts' },
        { key: 'passRate', header: 'Pass Rate' },
        { key: 'avgScore', header: 'Avg Score' },
        { key: 'uniqueLearners', header: terminology.learnerPlural }
      ];
    }
    if (type === 'score-range') {
      return [
        { key: 'name', header: terminology.learner },
        { key: 'email', header: 'Email' },
        { key: 'avgScore', header: 'Avg Score' },
        { key: 'totalAttempts', header: 'Attempts' },
        { key: 'lastAttempt', header: 'Last Attempt' }
      ];
    }
    return [];
  };

  const getModalData = (): any[] => {
    if (drilldownModal.type === 'at-risk') {
      return atRiskDetails?.learners || [];
    }
    if (drilldownModal.type === 'funnel') {
      return funnelDetails?.learners || [];
    }
    if (drilldownModal.type === 'course-learners') {
      return courseLearners?.learners || [];
    }
    if (drilldownModal.type === 'quiz-breakdown') {
      return quizBreakdown?.quizzes || [];
    }
    if (drilldownModal.type === 'score-range') {
      return scoreRangeData?.learners || [];
    }
    return [];
  };

  const getModalLoading = (): boolean => {
    if (drilldownModal.type === 'at-risk') return atRiskLoading;
    if (drilldownModal.type === 'funnel') return funnelLoading;
    if (drilldownModal.type === 'course-learners') return courseLearnersLoading;
    if (drilldownModal.type === 'quiz-breakdown') return quizBreakdownLoading;
    if (drilldownModal.type === 'score-range') return scoreRangeLoading;
    return false;
  };

  const getEmptyMessage = (type: string): string => {
    if (type === 'at-risk') return 'No at-risk learners found';
    if (type === 'funnel') return 'No learners at this stage';
    if (type === 'course-learners') return 'No learners enrolled in this course';
    if (type === 'quiz-breakdown') return 'No quiz data available';
    if (type === 'score-range') return 'No learners found in this score range';
    return 'No data available';
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setIsRefreshing(false);
  };

  const handleExportAll = async () => {
    if (!orgId) return;

    const [overview, performers, atRisk, funnel, quizzes, deadlines] = await Promise.all([
      apiRequest<any>(buildReportUrl(orgId, 'overview', reportFilters)),
      apiRequest<any>(buildReportUrl(orgId, 'top-performers', reportFilters)),
      apiRequest<any>(buildReportUrl(orgId, 'at-risk-learners', reportFilters)),
      apiRequest<any>(buildReportUrl(orgId, 'completion-funnel', reportFilters)),
      apiRequest<any>(buildReportUrl(orgId, 'quiz-analytics', reportFilters)),
      apiRequest<any>(buildReportUrl(orgId, 'deadlines', reportFilters)),
    ]);

    const rows: any[] = [
      { tab: 'Overview', metric: `Active ${terminology.learnerPlural}`, value: overview?.activeLearners ?? 0 },
      { tab: 'Overview', metric: `Total ${terminology.learnerPlural}`, value: overview?.totalLearners ?? 0 },
      { tab: 'Overview', metric: 'Courses Completed', value: overview?.coursesCompleted ?? 0 },
      { tab: 'Overview', metric: 'Average Quiz Score', value: overview?.averageQuizScore ?? 0 },
      { tab: 'Overview', metric: 'Completion Rate', value: overview?.completionRate ?? 0 },
    ];

    pushExportRows(rows, 'Top Performers', performers?.performers, (row) => ({
      learner: row.name,
      email: row.email,
      metric: 'Average Score',
      value: row.avgScore,
      details: `${row.coursesCompleted} courses completed`,
    }));
    pushExportRows(rows, 'At Risk', atRisk?.atRisk, (row) => ({
      learner: row.name,
      email: row.email,
      metric: row.reason,
      value: row.avgScore || row.daysInactive || row.daysOverdue || '',
      details: row.details,
    }));
    pushExportRows(rows, 'Courses', funnel?.courses, (row) => ({
      course: row.courseName,
      metric: 'Completion',
      value: row.enrolled > 0 ? Math.round((row.completed / row.enrolled) * 100) : 0,
      details: `${row.completed || 0}/${row.enrolled || 0} completed`,
    }));
    pushExportRows(rows, 'Quizzes', quizzes?.lessonDifficulty, (row) => ({
      course: row.courseName,
      metric: row.lessonName,
      value: row.passRate,
      details: `${row.attempts || 0} attempts`,
    }));
    pushExportRows(rows, 'Overdue Deadlines', deadlines?.overdue, (row) => ({
      learner: row.userName,
      course: row.courseName,
      metric: 'Days Overdue',
      value: row.daysOverdue,
      details: row.dueDate,
    }));
    pushExportRows(rows, 'Upcoming Deadlines', deadlines?.upcoming, (row) => ({
      learner: row.userName,
      course: row.courseName,
      metric: 'Days Remaining',
      value: row.daysRemaining,
      details: row.dueDate,
    }));

    downloadCSV(rows, 'all_reports', ['tab', 'learner', 'email', 'course', 'metric', 'value', 'details']);
  };

  const isLoading = coursesLoading || departmentsLoading || unitsLoading || teamsLoading;

  if (!isSuperAdmin && !isOrgAdmin && !isTeacher) {
    return (
      <QuizAdminLayout
        title="Performance Analytics"
        description="Track learner progress and course completion"
        activeSection="reports"
      >
        <Card className="bg-[var(--card-bg)] border-[var(--card-border)]">
          <CardContent className="p-12 flex flex-col items-center justify-center text-center">
            <AlertTriangle className="w-12 h-12 text-warning mb-4" />
            <h3 className="text-lg font-semibold text-fg-strong mb-2">Access Restricted</h3>
            <p className="text-sm text-body-muted">
              You need to be an org_admin, superadmin, or teacher to access performance analytics.
            </p>
          </CardContent>
        </Card>
      </QuizAdminLayout>
    );
  }

  return (
    <QuizAdminLayout
      title="Performance Analytics"
      description="Track learner progress and course completion"
      activeSection="reports"
    >
      <div className="space-y-6">
        <FiltersBar
          selectedCourse={selectedCourse}
          onCourseChange={setSelectedCourse}
          selectedDepartment={selectedDepartment}
          onDepartmentChange={setSelectedDepartment}
          selectedUnit={selectedUnit}
          onUnitChange={setSelectedUnit}
          selectedTeam={selectedTeam}
          onTeamChange={setSelectedTeam}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          courses={courses}
          departments={departments}
          units={units}
          teams={teams}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          onExportAll={handleExportAll}
          activeTab={activeTab}
          selectedCourseStatus={selectedCourseStatus}
          onCourseStatusChange={setSelectedCourseStatus}
        />

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)}>
          <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
            <TabsList className="inline-flex sm:grid w-full sm:w-full min-w-max sm:min-w-0 sm:grid-cols-5 h-auto bg-[var(--tab)]">
              <TabsTrigger 
                value="overview" 
                data-testid="tab-overview"
                className="text-xs sm:text-sm py-2.5 min-h-[44px] gap-2"
              >
                <BarChart3 className="w-4 h-4" />
                <span className="hidden sm:inline">Overview</span>
                <span className="sm:hidden">Stats</span>
              </TabsTrigger>
              <TabsTrigger 
                value="learners" 
                data-testid="tab-learners"
                className="text-xs sm:text-sm py-2.5 min-h-[44px] gap-2"
              >
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">{terminology.learnerPlural}</span>
                <span className="sm:hidden">Users</span>
              </TabsTrigger>
              <TabsTrigger 
                value="courses" 
                data-testid="tab-courses"
                className="text-xs sm:text-sm py-2.5 min-h-[44px] gap-2"
              >
                <BookOpen className="w-4 h-4" />
                Courses
              </TabsTrigger>
              <TabsTrigger 
                value="quizzes" 
                data-testid="tab-quizzes"
                className="text-xs sm:text-sm py-2.5 min-h-[44px] gap-2"
              >
                <ClipboardList className="w-4 h-4" />
                Quizzes
              </TabsTrigger>
              <TabsTrigger 
                value="deadlines" 
                data-testid="tab-deadlines"
                className="text-xs sm:text-sm py-2.5 min-h-[44px] gap-2"
              >
                <Clock className="w-4 h-4" />
                Deadlines
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-6">
            <OverviewTab 
              orgId={orgId} 
              isLoading={isLoading} 
              onDrilldown={handleDrilldown}
              selectedCourse={selectedCourse}
              selectedDepartment={selectedDepartment}
              selectedUnit={selectedUnit}
              selectedTeam={selectedTeam}
              dateRange={dateRange}
              selectedCourseStatus={selectedCourseStatus}
            />
          </TabsContent>
          
          <TabsContent value="learners" className="mt-6">
            <LearnersTab 
              orgId={orgId} 
              onSelectLearner={setSelectedLearnerId}
              selectedCourse={selectedCourse}
              selectedDepartment={selectedDepartment}
              selectedUnit={selectedUnit}
              selectedTeam={selectedTeam}
              searchQuery={searchQuery}
              dateRange={dateRange}
              selectedCourseStatus={selectedCourseStatus}
            />
          </TabsContent>
          
          <TabsContent value="courses" className="mt-6">
            <CoursesTab 
              orgId={orgId} 
              onDrilldown={handleDrilldown}
              selectedCourse={selectedCourse}
              selectedDepartment={selectedDepartment}
              selectedUnit={selectedUnit}
              selectedTeam={selectedTeam}
              searchQuery={searchQuery}
              dateRange={dateRange}
              selectedCourseStatus={selectedCourseStatus}
            />
          </TabsContent>
          
          <TabsContent value="quizzes" className="mt-6">
            <QuizzesTab 
              orgId={orgId} 
              onDrilldown={handleDrilldown}
              selectedCourse={selectedCourse}
              selectedDepartment={selectedDepartment}
              selectedUnit={selectedUnit}
              selectedTeam={selectedTeam}
              searchQuery={searchQuery}
              dateRange={dateRange}
              selectedCourseStatus={selectedCourseStatus}
            />
          </TabsContent>
          
          <TabsContent value="deadlines" className="mt-6">
            <DeadlinesTab 
              orgId={orgId}
              selectedCourse={selectedCourse}
              selectedDepartment={selectedDepartment}
              selectedUnit={selectedUnit}
              selectedTeam={selectedTeam}
              searchQuery={searchQuery}
              dateRange={dateRange}
            />
          </TabsContent>
        </Tabs>
      </div>
      
      {selectedLearnerId && (
        <LearnerProfilePage
          userId={selectedLearnerId}
          orgId={orgId}
          courseId={selectedCourse !== 'all' ? selectedCourse : undefined}
          onBack={() => setSelectedLearnerId(null)}
        />
      )}

      {drilldownModal.open && (
        <Card className="bg-[var(--card-bg)] border-[var(--card-border)]">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="text-fg-strong">
                {getModalTitle(drilldownModal.type, drilldownModal.param)}
              </CardTitle>
              <p className="text-sm text-body-muted">
                {getModalDescription(drilldownModal.type, drilldownModal.param)}
              </p>
            </div>
            <Button variant="outline" onClick={() => setDrilldownModal({ open: false, type: '' })}>
              Back to Reports
            </Button>
          </CardHeader>
          <CardContent>
            {getModalLoading() ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : getModalData().length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {getModalColumns(drilldownModal.type, drilldownModal.param).map((column) => (
                        <TableHead key={column.key}>{column.header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getModalData().map((row: any, index: number) => (
                      <TableRow key={index}>
                        {getModalColumns(drilldownModal.type, drilldownModal.param).map((column) => (
                          <TableCell key={`${index}-${column.key}`}>
                            {String(row[column.key] ?? '-')}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-body-muted">{getEmptyMessage(drilldownModal.type)}</div>
            )}
          </CardContent>
        </Card>
      )}
    </QuizAdminLayout>
  );
}
