import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown, Search, X, ChevronDown, ChevronUp } from 'lucide-react';
import { getDisplayName } from '@/lib/utils';
import { BarChart as RechartsBar, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, ScatterChart, Scatter, Cell } from 'recharts';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import StudentRangeModal from './StudentRangeModal';
import EngagementPerformanceModal from './EngagementPerformanceModal';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { getActiveTimezone } from '@/utils/timezoneRuntime';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';

// Simple Sparkline component for displaying mini performance charts
function Sparkline({ data, width = 80, height = 24 }: { data: number[], width?: number, height?: number }) {
  if (!data || data.length < 2) return null;
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  
  // Determine color based on trend
  const trend = data[data.length - 1] - data[0];
  const color = trend > 0 ? 'var(--success)' : trend < 0 ? 'var(--destructive)' : 'var(--text-muted)';
  
  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Helper function to format completion date in the effective user timezone
function formatCompletionDate(dateString: string | null | undefined, timezone: string): string {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    
    // Format date part (Nov 6, 2025)
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    
    // Format time part with timezone abbreviation (e.g., "10:30 AM GMT+2")
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    });
    
    const datePart = dateFormatter.format(date);
    const timePart = timeFormatter.format(date);
    
    return `Completed ${datePart} • ${timePart}`;
  } catch (error) {
    return '';
  }
}

interface StudentInsightsTabProps {
  selectedOrganization: string;
  selectedUnit: string;
  selectedSubject: string;
}

export default function StudentInsightsTab({ 
  selectedOrganization, 
  selectedUnit, 
  selectedSubject 
}: StudentInsightsTabProps) {
  const { terminology: rawTerminology } = useOrganizationTerminology();
  const terminology = rawTerminology || {
    learner: 'Learner',
    learnerPlural: 'Learners',
    unit: 'Department',
    unitPlural: 'Departments',
    subject: 'Topic',
    subjectPlural: 'Topics',
  };
  const learnerLower = terminology.learner.toLowerCase();
  const learnerPluralLower = terminology.learnerPlural.toLowerCase();
  const unitLower = terminology.unit.toLowerCase();
  const subjectLower = terminology.subject.toLowerCase();
  const subjectPluralLower = terminology.subjectPlural.toLowerCase();
  const { userPreferences } = useAuth();
  const effectiveTimezone = userPreferences?.timezone || getActiveTimezone();
  const isMobile = useIsMobile();
  const [selectedStudentForTimeline, setSelectedStudentForTimeline] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [localSubjectFilter, setLocalSubjectFilter] = useState<string>('');
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());
  const [expandedSubjects, setExpandedSubjects] = useState<Map<string, Set<string>>>(new Map());
  const [selectedRange, setSelectedRange] = useState<string>('');
  const [isRangeModalOpen, setIsRangeModalOpen] = useState(false);
  const [selectedScatterPoint, setSelectedScatterPoint] = useState<{ gamesPlayed: number; accuracy: number } | null>(null);
  const [isEngagementModalOpen, setIsEngagementModalOpen] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Reset local subject filter when organization or unit changes
  useEffect(() => {
    setLocalSubjectFilter('');
  }, [selectedOrganization, selectedUnit]);

  // Fetch subjects for selected unit-aware context
  const { data: subjects = [] } = useQuery<any[]>({
    queryKey: selectedUnit 
      ? ['/api/admin/units', selectedUnit, 'subjects', selectedOrganization]
      : ['/api/admin/organizations', selectedOrganization, 'subjects'],
    queryFn: async () => {
      const url = selectedUnit && selectedUnit !== 'all'
        ? `/api/admin/units/${selectedUnit}/subjects`
        : `/api/admin/organizations/${selectedOrganization}/subjects`;
      const response = await fetch(url, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch subjects');
      return response.json();
    },
    enabled: !!selectedOrganization && !!selectedUnit,
  });

  // Use the combined subject filter (local filter takes precedence over parent's selectedSubject)
  const effectiveSubject = localSubjectFilter || selectedSubject;

  // Fetch at-risk students
  const { data: atRiskStudents = [], isLoading: loadingAtRisk } = useQuery<any[]>({
    queryKey: ['/api/admin/reports/organizations', selectedOrganization, 'at-risk-students', selectedUnit, effectiveSubject, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedUnit && selectedUnit !== 'all') params.append('unitId', selectedUnit);
      if (effectiveSubject && effectiveSubject !== 'all') params.append('subjectId', effectiveSubject);
      if (searchTerm && searchTerm.trim()) params.append('search', searchTerm.trim());
      
      const response = await fetch(
        `/api/admin/reports/organizations/${selectedOrganization}/at-risk-students?${params.toString()}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch at-risk students');
      return await response.json();
    },
    enabled: !!selectedOrganization && !!selectedUnit,
  });

  // Fetch performance distribution
  const { data: performanceDistribution = [], isLoading: loadingDistribution } = useQuery<any[]>({
    queryKey: ['/api/admin/reports/organizations', selectedOrganization, 'performance-distribution', selectedUnit, effectiveSubject, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedUnit && selectedUnit !== 'all') params.append('unitId', selectedUnit);
      if (effectiveSubject && effectiveSubject !== 'all') params.append('subjectId', effectiveSubject);
      if (searchTerm && searchTerm.trim()) params.append('search', searchTerm.trim());
      
      const response = await fetch(
        `/api/admin/reports/organizations/${selectedOrganization}/performance-distribution?${params.toString()}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch performance distribution');
      return await response.json();
    },
    enabled: !!selectedOrganization && !!selectedUnit,
  });

  // Fetch student timeline (when a student is selected)
  const { data: studentTimeline = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/reports/organizations', selectedOrganization, 'student-timeline', selectedStudentForTimeline, effectiveSubject],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (effectiveSubject && effectiveSubject !== 'all') params.append('subjectId', effectiveSubject);
      
      const response = await fetch(
        `/api/admin/reports/organizations/${selectedOrganization}/student-timeline/${selectedStudentForTimeline}?${params.toString()}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch student timeline');
      return await response.json();
    },
    enabled: !!selectedOrganization && !!selectedStudentForTimeline && !!selectedUnit,
  });

  // Fetch performance heatmap
  const { data: performanceHeatmap = [], isLoading: loadingHeatmap } = useQuery<any[]>({
    queryKey: ['/api/admin/reports/organizations', selectedOrganization, 'performance-heatmap', selectedUnit, effectiveSubject, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedUnit && selectedUnit !== 'all') params.append('unitId', selectedUnit);
      if (effectiveSubject && effectiveSubject !== 'all') params.append('subjectId', effectiveSubject);
      if (searchTerm && searchTerm.trim()) params.append('search', searchTerm.trim());
      
      const response = await fetch(
        `/api/admin/reports/organizations/${selectedOrganization}/performance-heatmap?${params.toString()}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch performance heatmap');
      return await response.json();
    },
    enabled: !!selectedOrganization && !!selectedUnit,
  });

  // Fetch students by performance range (for modal)
  const { data: studentsInRange = [], isLoading: loadingStudentsInRange } = useQuery<any[]>({
    queryKey: ['/api/admin/reports/organizations', selectedOrganization, 'students-by-range', selectedRange, selectedUnit, effectiveSubject, searchTerm],
    queryFn: async () => {
      if (!selectedRange) return [];
      const params = new URLSearchParams();
      if (selectedUnit && selectedUnit !== 'all') params.append('unitId', selectedUnit);
      if (effectiveSubject && effectiveSubject !== 'all') params.append('subjectId', effectiveSubject);
      if (searchTerm && searchTerm.trim()) params.append('search', searchTerm.trim());
      
      const response = await fetch(
        `/api/admin/reports/organizations/${selectedOrganization}/students-by-range/${encodeURIComponent(selectedRange)}?${params.toString()}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch students by range');
      return await response.json();
    },
    enabled: !!selectedOrganization && !!selectedUnit && !!selectedRange,
  });

  // Backend handles all filtering (by student name AND quiz name) with searchTerm in queryKey
  // No client-side filtering needed - React Query refetches when searchTerm changes
  
  // Prepare data for engagement vs performance scatter plot
  const engagementPerformanceData = atRiskStudents.map(student => ({
    name: getDisplayName(student),
    gamesPlayed: student.totalGames,
    accuracy: student.accuracy,
    riskLevel: student.riskLevel,
  }));

  // Filter students for selected scatter point
  const studentsAtScatterPoint = selectedScatterPoint 
    ? engagementPerformanceData.filter(student => 
        student.gamesPlayed === selectedScatterPoint.gamesPlayed && 
        Math.round(student.accuracy) === Math.round(selectedScatterPoint.accuracy)
      )
    : [];

  // Helper functions
  const getPerformanceColor = (accuracy: number) => {
    if (accuracy >= 80) return 'bg-success/20 text-success border-[var(--success)]/50';
    if (accuracy >= 60) return 'bg-warning/20 text-warning border-[var(--warning)]/50';
    return 'bg-destructive/20 text-destructive border-[var(--destructive)]/50';
  };

  const getPerformanceBadgeVariant = (accuracy: number): "default" | "secondary" | "destructive" | "outline" => {
    if (accuracy >= 80) return 'default';
    if (accuracy >= 60) return 'secondary';
    return 'destructive';
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') return <ArrowUp className="w-4 h-4 text-success" />;
    if (trend === 'down') return <ArrowDown className="w-4 h-4 text-destructive" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  const getRiskColor = (riskLevel: string) => {
    if (riskLevel === 'critical') return 'bg-destructive/20 border-[var(--destructive)] text-destructive';
    if (riskLevel === 'warning') return 'bg-warning/20 border-[var(--warning)] text-warning';
    return 'bg-success/20 border-[var(--success)] text-success';
  };

  const getRiskLabel = (riskLevel: string) => {
    if (riskLevel === 'critical') return 'Critical';
    if (riskLevel === 'warning') return 'Needs Attention';
    return 'On Track';
  };

  const getRiskReason = (student: any) => {
    const reasons = [];
    
    if (student.totalGames < 3) {
      reasons.push(`Limited engagement (only ${student.totalGames} game${student.totalGames !== 1 ? 's' : ''})`);
    }
    
    if (student.accuracy < 50) {
      reasons.push(`Low accuracy (${student.accuracy}%)`);
    } else if (student.accuracy >= 50 && student.accuracy < 70) {
      reasons.push(`Below target accuracy (${student.accuracy}%)`);
    }
    
    if (student.trend === 'down' && student.previousAccuracy > 0) {
      const decline = Math.round(student.previousAccuracy - student.recentAccuracy);
      if (decline > 0) {
        reasons.push(`Performance declining (down ${decline}%)`);
      }
    }
    
    return reasons.length > 0 ? reasons.join(' • ') : 'Needs attention';
  };

  const handleViewTimeline = (studentId: string) => {
    setSelectedStudentForTimeline(studentId);
    // Scroll to timeline after a short delay to allow the component to render
    setTimeout(() => {
      timelineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleBarClick = (data: any) => {
    if (data && data.range) {
      setSelectedRange(data.range);
      setIsRangeModalOpen(true);
    }
  };

  const handleScatterClick = (data: any) => {
    if (data && data.gamesPlayed !== undefined && data.accuracy !== undefined) {
      setSelectedScatterPoint({ 
        gamesPlayed: data.gamesPlayed, 
        accuracy: data.accuracy 
      });
      setIsEngagementModalOpen(true);
    }
  };

  const toggleStudentExpansion = (userId: string) => {
    const newExpanded = new Set(expandedStudents);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
    }
    setExpandedStudents(newExpanded);
  };

  const toggleSubjectExpansion = (studentId: string, subjectId: string) => {
    const newExpandedSubjects = new Map(expandedSubjects);
    const studentSubjects = newExpandedSubjects.get(studentId) || new Set();
    
    if (studentSubjects.has(subjectId)) {
      studentSubjects.delete(subjectId);
    } else {
      studentSubjects.add(subjectId);
    }
    
    newExpandedSubjects.set(studentId, studentSubjects);
    setExpandedSubjects(newExpandedSubjects);
  };

  // Map subject IDs to names
  const getSubjectName = (subjectId: string) => {
    if (subjectId === 'general') return 'General';
    const subject = subjects.find((s: any) => (s.subjectId || s.id) === subjectId);
    return subject ? (subject.subjectName || subject.name) : 'Unknown Subject';
  };

  // Calculate struggling areas summary
  const strugglingAreas = atRiskStudents.reduce((acc: any, student: any) => {
    student.subjects?.forEach((subject: any) => {
      if (subject.accuracy < 70) {
        const subjectName = getSubjectName(subject.subjectId);
        if (!acc[subjectName]) {
          acc[subjectName] = {
            count: 0,
            totalAccuracy: 0,
            students: [],
          };
        }
        acc[subjectName].count++;
        acc[subjectName].totalAccuracy += subject.accuracy;
        acc[subjectName].students.push(getDisplayName(student));
      }
    });
    return acc;
  }, {});

  const strugglingAreasArray = Object.entries(strugglingAreas).map(([name, data]: [string, any]) => ({
    subject: name,
    studentCount: data.count,
    avgAccuracy: Math.round(data.totalAccuracy / data.count),
    students: data.students,
  })).sort((a, b) => a.avgAccuracy - b.avgAccuracy);

  // Check if no unit is selected
  if (!selectedUnit) {
    return (
      <Card className="bg-card/50 border-border">
        <CardContent className="p-12 text-center">
          <AlertTriangle className="w-16 h-16 text-warning mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">Select a {terminology.unit} to View Insights</h3>
          <p className="text-muted-foreground">
            Please select a {unitLower} from the filter above to view {learnerLower} performance insights and analytics.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Filters */}
      <Card className="bg-card/50 border-border">
        <CardContent className="p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {/* Search Input */}
            <div className="space-y-2">
              <Label htmlFor="student-search" className="text-sm text-muted-foreground">Search {terminology.learnerPlural} and Quiz Names</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="student-search"
                  placeholder="Search by name or gamer name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-9 bg-muted/10 border-border text-foreground h-11"
                  data-testid="input-student-search"
                />
                {searchTerm && (
                  <Button variant="ghost" size="sm" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0" onClick={() => setSearchTerm('')}
                    data-testid="button-clear-search"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Subject Filter */}
            <div className="space-y-2">
              <Label htmlFor="subject-filter" className="text-sm text-muted-foreground">{terminology.subject} (Optional)</Label>
              <Select value={localSubjectFilter || "all"} onValueChange={(val) => setLocalSubjectFilter(val === "all" ? "" : val)}>
                <SelectTrigger id="subject-filter" className="bg-muted/10 border-border text-foreground h-11" data-testid="select-subject-filter">
                  <SelectValue placeholder={`All ${terminology.subjectPlural}`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All {terminology.subjectPlural}</SelectItem>
                  {subjects.map((subject: any) => (
                    <SelectItem key={subject.subjectId || subject.id} value={subject.subjectId || subject.id}>
                      {subject.subjectName || subject.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
      {/* Struggling Areas Summary */}
      {strugglingAreasArray.length > 0 && (
        <Card className="bg-warning/30 border-[var(--warning)]/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              <CardTitle className="text-foreground">Struggling Areas</CardTitle>
            </div>
            <CardDescription className="text-muted-foreground">
              {terminology.subjectPlural} where {learnerPluralLower} need the most help
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {strugglingAreasArray.slice(0, 6).map((area) => (
                <div
                  key={area.subject}
                  className={`p-3 rounded-lg border ${getPerformanceColor(area.avgAccuracy)}`}
                  data-testid={`struggling-area-${area.subject}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium text-sm">{area.subject}</h4>
                    <Badge variant={getPerformanceBadgeVariant(area.avgAccuracy)} className="text-xs">
                      {area.avgAccuracy}%
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {area.studentCount} {area.studentCount !== 1 ? learnerPluralLower : learnerLower} struggling
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {/* Learner performance overview */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            <CardTitle className="text-foreground">{terminology.learner} Performance Overview</CardTitle>
          </div>
          <CardDescription className="text-muted-foreground">
            All {learnerPluralLower} from the applied filters - click to expand {subjectLower} breakdown
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingAtRisk ? (
            <div className="text-muted-foreground">Loading {learnerPluralLower}...</div>
          ) : atRiskStudents.length === 0 && searchTerm ? (
            <div className="text-muted-foreground text-center py-8">
              No {learnerPluralLower} found matching "{searchTerm}"
            </div>
          ) : atRiskStudents.length === 0 ? (
            <div className="text-muted-foreground text-center py-8">
              No {learnerPluralLower} match the selected filters.
            </div>
          ) : (
            <div className="space-y-3">
              {atRiskStudents.map((student) => {
                const isExpanded = expandedStudents.has(student.userId);
                const studentExpandedSubjects = expandedSubjects.get(student.userId) || new Set();
                
                return (
                  <Card 
                    key={student.userId} 
                    className={`border-2 ${getRiskColor(student.riskLevel)} transition-all`}
                    data-testid={`at-risk-student-${student.userId}`}
                  >
                    <CardContent className="p-4">
                      {/* Learner header */}
                      <div className="flex items-start gap-3 mb-3">
                        <PlayerAvatar 
                          user={{
                            id: student.userId,
                            gamerName: student.gamerName,
                            firstName: student.firstName,
                            lastName: student.lastName,
                            avatarImageUrl: student.avatarImageUrl
                          }}
                          size="sm"
                          showCountry={false}
                          showGlow={false}
                          showCosmetics={false}
                          className=""
                          data-testid={`avatar-${student.userId}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <p className="font-medium text-foreground truncate" data-testid={`student-name-${student.userId}`}>
                              {getDisplayName(student)}
                            </p>
                            {getTrendIcon(student.trend)}
                            <Badge className={getRiskColor(student.riskLevel)} data-testid={`risk-badge-${student.userId}`}>
                              {getRiskLabel(student.riskLevel)}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground">
                            <span>Overall: {student.accuracy}%</span>
                            {student.previousAccuracy !== undefined && student.recentAccuracy !== undefined && (
                              <Sparkline 
                                data={[student.previousAccuracy, student.recentAccuracy, student.accuracy]} 
                                width={60} 
                                height={20} 
                              />
                            )}
                            <span>•</span>
                            <span>{student.totalGames} games</span>
                            {student.unitName && (
                              <>
                                <span>•</span>
                                <span>{student.unitName}</span>
                              </>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-warning flex items-start gap-1">
                            <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                            <span className="italic">{getRiskReason(student)}</span>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => toggleStudentExpansion(student.userId)}
                          className="flex-shrink-0"
                          data-testid={`button-expand-${student.userId}`}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                      </div>

                      {/* Subject Breakdown */}
                      {student.subjects && student.subjects.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            {student.subjects.slice(0, isExpanded ? undefined : 3).map((subject: any) => (
                              <div key={subject.subjectId} className="flex-shrink-0">
                                <Collapsible>
                                  <div className="flex items-center gap-1">
                                    <Badge variant={getPerformanceBadgeVariant(subject.accuracy)} className="text-xs cursor-default" data-testid={`subject-badge-${student.userId}-${subject.subjectId}`} >
                                      {getSubjectName(subject.subjectId)}: {subject.accuracy}%
                                    </Badge>
                                    <CollapsibleTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleSubjectExpansion(student.userId, subject.subjectId)}
                                        data-testid={`button-expand-subject-${student.userId}-${subject.subjectId}`}
                                      >
                                        {studentExpandedSubjects.has(subject.subjectId) ? (
                                          <ChevronUp className="w-3 h-3" />
                                        ) : (
                                          <ChevronDown className="w-3 h-3" />
                                        )}
                                      </Button>
                                    </CollapsibleTrigger>
                                  </div>
                                  
                                  <CollapsibleContent>
                                    {studentExpandedSubjects.has(subject.subjectId) && subject.quizzes && (
                                      <div className="mt-2 ml-2 space-y-2 border-l-2 border-border pl-3">
                                        {subject.quizzes.map((quiz: any) => (
                                          <div 
                                            key={quiz.collectionId}
                                            className="text-xs space-y-1"
                                            data-testid={`quiz-${student.userId}-${quiz.collectionId}`}
                                          >
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="text-muted-foreground truncate flex-1">
                                                {quiz.collectionName}
                                              </span>
                                              <Badge variant={getPerformanceBadgeVariant(quiz.accuracy)} className="text-xs flex-shrink-0" >
                                                {quiz.accuracy}% ({quiz.attempts})
                                              </Badge>
                                            </div>
                                            {quiz.completedAt && (
                                              <div className="text-[10px] text-muted-foreground italic" data-testid={`quiz-completed-${student.userId}-${quiz.collectionId}`}>
                                                {formatCompletionDate(quiz.completedAt, effectiveTimezone)}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </CollapsibleContent>
                                </Collapsible>
                              </div>
                            ))}
                          </div>
                          
                          {!isExpanded && student.subjects.length > 3 && (
                            <button
                              onClick={() => toggleStudentExpansion(student.userId)}
                              className="text-xs text-primary hover:text-primary transition-colors"
                            >
                              +{student.subjects.length - 3} more {subjectPluralLower}
                            </button>
                          )}
                        </div>
                      )}

                      {/* View Timeline Button */}
                      <Button variant="outline" size="sm" onClick={() => handleViewTimeline(student.userId)}
                        className="mt-3 w-full sm:w-auto text-xs"
                        data-testid={`button-timeline-${student.userId}`}
                      >
                        View Performance Timeline
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      {/* Performance Distribution Chart */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Performance Distribution</CardTitle>
          <CardDescription className="text-muted-foreground">
            How {learnerPluralLower} are distributed across performance ranges (click on a bar to see {learnerPluralLower})
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingDistribution ? (
            <div className="text-muted-foreground">Loading distribution...</div>
          ) : (
            <div className="w-full h-56 sm:h-72 md:h-80" data-testid="performance-distribution-chart">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsBar 
                  data={performanceDistribution}
                  margin={{ top: 5, right: isMobile ? 5 : 20, left: isMobile ? -15 : 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke-default)" />
                  <XAxis 
                    dataKey="range" 
                    stroke="var(--text-muted)" 
                    tick={{ fontSize: isMobile ? 9 : 12 }}
                    tickMargin={isMobile ? 5 : 10}
                    interval={0}
                    angle={isMobile ? -45 : 0}
                    textAnchor={isMobile ? "end" : "middle"}
                    height={isMobile ? 60 : 30}
                  />
                  <YAxis 
                    stroke="var(--text-muted)" 
                    tick={{ fontSize: isMobile ? 10 : 12 }}
                    width={isMobile ? 30 : 40}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--surface-raised)', 
                      border: '1px solid var(--stroke-default)', 
                      borderRadius: '6px',
                      padding: isMobile ? '8px 12px' : '6px 10px'
                    }}
                    labelStyle={{ color: 'var(--text-primary)' }}
                    wrapperStyle={{ touchAction: 'none' }}
                    cursor={{ fill: 'var(--stroke-default)', fillOpacity: 0.3 }}
                  />
                  <Bar 
                    dataKey="count" 
                    fill="var(--chart-1)" 
                    radius={[8, 8, 0, 0]} 
                    onClick={handleBarClick}
                    cursor="pointer"
                  />
                </RechartsBar>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Learner timeline chart */}
      {selectedStudentForTimeline && (
        <Card ref={timelineRef} className="bg-card/50 border-border scroll-mt-4">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <CardTitle className="text-foreground">{terminology.learner} Performance Timeline</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Performance trend for selected {learnerLower} over the last 30 days
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedStudentForTimeline('')}
                className="text-muted-foreground hover:text-foreground flex-shrink-0"
                data-testid="button-close-timeline"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {studentTimeline.length === 0 ? (
              <div className="text-muted-foreground text-center py-8">
                No timeline data available for this {learnerLower}
              </div>
            ) : (
              <div className="w-full h-56 sm:h-72 md:h-80" data-testid="student-timeline-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart 
                    data={studentTimeline}
                    margin={{ top: 5, right: isMobile ? 5 : 20, left: isMobile ? -10 : 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke-default)" />
                    <XAxis 
                      dataKey="date" 
                      stroke="var(--text-muted)" 
                      tick={{ fontSize: isMobile ? 10 : 12 }}
                      tickMargin={isMobile ? 5 : 10}
                      interval={isMobile ? 'preserveStartEnd' : 0}
                    />
                    <YAxis 
                      stroke="var(--text-muted)" 
                      domain={[0, 100]} 
                      tick={{ fontSize: isMobile ? 10 : 12 }}
                      width={isMobile ? 35 : 45}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'var(--surface-raised)', 
                        border: '1px solid var(--stroke-default)', 
                        borderRadius: '6px',
                        padding: isMobile ? '8px 12px' : '6px 10px'
                      }}
                      labelStyle={{ color: 'var(--text-primary)' }}
                      wrapperStyle={{ touchAction: 'none' }}
                    />
                    <Legend 
                      wrapperStyle={{ 
                        fontSize: isMobile ? '10px' : '12px',
                        paddingTop: isMobile ? '5px' : '10px'
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="accuracy" 
                      stroke="var(--success)" 
                      strokeWidth={2}
                      name="Accuracy (%)"
                      dot={{ fill: 'var(--success)', r: isMobile ? 3 : 4 }}
                      activeDot={{ r: isMobile ? 6 : 5, strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {/* Performance Heatmap */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Performance Heatmap</CardTitle>
          <CardDescription className="text-muted-foreground">
            {terminology.learner} performance across quiz collections (hover for details)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingHeatmap ? (
            <div className="text-muted-foreground">Loading heatmap...</div>
          ) : performanceHeatmap.length === 0 && searchTerm ? (
            <div className="text-muted-foreground text-center py-8">
              No {learnerPluralLower} found matching "{searchTerm}"
            </div>
          ) : performanceHeatmap.length === 0 ? (
            <div className="text-muted-foreground text-center py-8">
              No heatmap data available
            </div>
          ) : (
            <div className="w-full" data-testid="performance-heatmap">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                <span className="font-medium">Legend:</span>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 sm:w-4 sm:h-4 bg-destructive/30 rounded"></div>
                  <span>&lt;60%</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 sm:w-4 sm:h-4 bg-warning/30 rounded"></div>
                  <span>60-79%</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 sm:w-4 sm:h-4 bg-success/30 rounded"></div>
                  <span>80%+</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 sm:w-4 sm:h-4 bg-muted/30 rounded"></div>
                  <span>No data</span>
                </div>
              </div>
              <div className="w-full overflow-x-auto rounded-lg border border-border">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-card/50">
                      <th className="sticky left-0 z-20 bg-card text-left p-3 text-foreground border-b border-r border-border text-xs sm:text-sm font-semibold min-w-[120px] max-w-[150px]">
                        {terminology.learner}
                      </th>
                      {performanceHeatmap[0] && Object.values(performanceHeatmap[0].collections).map((col: any, idx: number) => (
                        <th key={idx} className="text-center p-3 text-foreground border-b border-border min-w-[80px]">
                          <div className="text-xs whitespace-normal break-words leading-tight max-w-[120px] mx-auto" title={col.name}>
                            {col.name}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {performanceHeatmap.map((student, studentIdx) => (
                      <tr key={student.userId} className={`border-b border-border ${studentIdx % 2 === 0 ? 'bg-card/30' : 'bg-card/10'}`}>
                        <td className="sticky left-0 z-10 bg-card/95 backdrop-blur p-3 text-foreground font-medium text-xs sm:text-sm border-r border-border min-w-[120px] max-w-[150px]" data-testid={`heatmap-student-${student.userId}`}>
                          <div className="whitespace-normal break-words leading-tight" title={getDisplayName(student)}>
                            {getDisplayName(student)}
                          </div>
                        </td>
                        {Object.entries(student.collections).map(([collId, data]: [string, any]) => {
                          const accuracy = data.accuracy;
                          const bgColor = accuracy === null 
                            ? 'bg-muted/30 border-muted' 
                            : accuracy >= 80 
                            ? 'bg-success/30 border-[var(--success)]/50' 
                            : accuracy >= 60 
                            ? 'bg-warning/30 border-[var(--warning)]/50' 
                            : 'bg-destructive/30 border-[var(--destructive)]/50';
                          
                          const tooltipText = accuracy !== null 
                            ? `${data.name}\nLatest: ${accuracy}% (attempt ${data.totalAttempts} of ${data.totalAttempts})\nTotal attempts: ${data.totalAttempts}`
                            : `${data.name}\nNo attempts yet`;
                          
                          return (
                            <td key={collId} className="p-2">
                              <div 
                                className={`${bgColor} p-2 rounded text-center text-foreground text-xs font-semibold cursor-help border transition-all hover:scale-105 hover:shadow-elevated min-h-[36px] flex items-center justify-center`}
                                title={tooltipText}
                                data-testid={`heatmap-cell-${student.userId}-${collId}`}
                              >
                                {accuracy !== null ? `${accuracy}%` : '-'}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Engagement vs Performance Scatter Plot */}
      {engagementPerformanceData.length > 0 && (
        <Card className="bg-card/50 border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Engagement vs Performance</CardTitle>
            <CardDescription className="text-muted-foreground">
              Relationship between number of games played and accuracy
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full h-56 sm:h-72 md:h-80" data-testid="engagement-performance-chart">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: isMobile ? 10 : 20, left: isMobile ? 0 : 10, bottom: isMobile ? 30 : 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke-default)" />
                  <XAxis 
                    type="number" 
                    dataKey="gamesPlayed" 
                    name="Games Played" 
                    stroke="var(--text-muted)"
                    tick={{ fontSize: isMobile ? 10 : 12 }}
                    tickMargin={isMobile ? 5 : 10}
                    label={isMobile ? undefined : { value: 'Games Played', position: 'bottom', fill: 'var(--text-muted)', fontSize: 12, offset: -5 }}
                  />
                  <YAxis 
                    type="number" 
                    dataKey="accuracy" 
                    name="Accuracy %" 
                    stroke="var(--text-muted)"
                    domain={[0, 100]}
                    tick={{ fontSize: isMobile ? 10 : 12 }}
                    width={isMobile ? 35 : 50}
                    label={isMobile ? undefined : { value: 'Accuracy %', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 12 }}
                  />
                  <Tooltip 
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{ 
                      backgroundColor: 'var(--surface-raised)', 
                      border: '1px solid var(--stroke-default)', 
                      borderRadius: '6px',
                      padding: isMobile ? '8px 12px' : '6px 10px'
                    }}
                    labelStyle={{ color: 'var(--text-primary)' }}
                    wrapperStyle={{ touchAction: 'none' }}
                  />
                  <Legend 
                    wrapperStyle={{ 
                      fontSize: isMobile ? '10px' : '12px',
                      paddingTop: '5px'
                    }}
                    verticalAlign="top"
                  />
                  <Scatter 
                    name="Critical" 
                    data={engagementPerformanceData.filter(d => d.riskLevel === 'critical')} 
                    fill="var(--destructive)"
                    onClick={handleScatterClick}
                    cursor="pointer"
                  />
                  <Scatter 
                    name="Warning" 
                    data={engagementPerformanceData.filter(d => d.riskLevel === 'warning')} 
                    fill="var(--warning)"
                    onClick={handleScatterClick}
                    cursor="pointer"
                  />
                  <Scatter 
                    name="Good" 
                    data={engagementPerformanceData.filter(d => d.riskLevel === 'good')} 
                    fill="var(--success)"
                    onClick={handleScatterClick}
                    cursor="pointer"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
      {/* Student Range Modal */}
      <StudentRangeModal
        isOpen={isRangeModalOpen}
        onClose={() => {
          setIsRangeModalOpen(false);
          setSelectedRange('');
        }}
        range={selectedRange}
        students={studentsInRange}
        isLoading={loadingStudentsInRange}
      />
      {/* Engagement Performance Modal */}
      <EngagementPerformanceModal
        isOpen={isEngagementModalOpen}
        onClose={() => {
          setIsEngagementModalOpen(false);
          setSelectedScatterPoint(null);
        }}
        students={studentsAtScatterPoint}
        gamesPlayed={selectedScatterPoint?.gamesPlayed || 0}
        accuracy={selectedScatterPoint?.accuracy || 0}
      />
    </div>
  );
}
