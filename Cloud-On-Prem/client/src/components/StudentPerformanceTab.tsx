import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  Search, TrendingUp, TrendingDown, Award, AlertTriangle, 
  Target, Clock, Trophy, BarChart3, Calendar, ChevronDown, ChevronUp,
  BookOpen, CheckCircle, XCircle, Minus
} from 'lucide-react';
import { getDisplayName } from '@/lib/utils';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';
import { useIsMobile } from '@/hooks/use-mobile';

interface StudentPerformanceTabProps {
  selectedOrganization: string;
  selectedUnit: string;
  selectedSubject: string;
}

export default function StudentPerformanceTab({ 
  selectedOrganization, 
  selectedUnit,
  selectedSubject 
}: StudentPerformanceTabProps) {
  const { terminology, terminologyLower, isLoading: terminologyLoading, isResolved } = useOrganizationTerminology();
  const learnerLabel = isResolved && terminology ? terminology.learner : 'Learner';
  const learnerLower = isResolved && terminologyLower ? terminologyLower.learner : 'learner';
  const subUnitLabel = isResolved && terminology ? terminology.subUnit : 'Unit';
  const isMobile = useIsMobile();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [expandedQuizzes, setExpandedQuizzes] = useState<Set<string>>(new Set());

  // Fetch all students in organization
  const { data: orgUsers = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', selectedOrganization, 'users'],
    enabled: !!selectedOrganization,
  });

  const students = orgUsers.filter((user: any) => user.role === 'student' || user.role === 'employee');

  // Filter students by search and unit
  const filteredStudents = useMemo(() => {
    let result = students;
    
    if (selectedUnit && selectedUnit !== 'all') {
      result = result.filter((s: any) => s.unitId === selectedUnit);
    }
    
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      result = result.filter((s: any) => {
        const firstName = s.firstName?.toLowerCase() || '';
        const lastName = s.lastName?.toLowerCase() || '';
        const gamerName = s.gamerName?.toLowerCase() || '';
        const email = s.email?.toLowerCase() || '';
        const displayName = getDisplayName(s).toLowerCase();
        
        return firstName.includes(searchLower) || 
               lastName.includes(searchLower) || 
               gamerName.includes(searchLower) || 
               email.includes(searchLower) ||
               displayName.includes(searchLower);
      });
    }
    
    return result;
  }, [students, selectedUnit, searchTerm]);

  // Fetch detailed student analytics
  const { data: studentAnalytics, isLoading: loadingAnalytics } = useQuery<any>({
    queryKey: ['/api/admin/reports/student-analytics', selectedStudent, selectedOrganization, selectedUnit, selectedSubject],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedUnit && selectedUnit !== 'all') params.append('unitId', selectedUnit);
      if (selectedSubject && selectedSubject !== 'all') params.append('subjectId', selectedSubject);
      
      const response = await fetch(
        `/api/admin/reports/student-analytics/${selectedStudent}?organizationId=${selectedOrganization}&${params.toString()}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch student analytics');
      return response.json();
    },
    enabled: !!selectedStudent && !!selectedOrganization,
  });

  const toggleQuizExpansion = (quizId: string) => {
    const newExpanded = new Set(expandedQuizzes);
    if (newExpanded.has(quizId)) {
      newExpanded.delete(quizId);
    } else {
      newExpanded.add(quizId);
    }
    setExpandedQuizzes(newExpanded);
  };

  const getPerformanceColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };

  const getPerformanceBadge = (score: number) => {
    if (score >= 80) return 'bg-success/20 border-[var(--success)] text-success';
    if (score >= 60) return 'bg-warning/20 border-[var(--warning)] text-warning';
    return 'bg-destructive/20 border-[var(--destructive)] text-destructive';
  };

  const selectedStudentData = students.find((s: any) => s.userId === selectedStudent);

  if (terminologyLoading || !isResolved || !terminology || !terminologyLower) {
    return (
      <Card className="bg-card/50 border-border">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <Card className="bg-card/50 border-border">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              type="text"
              placeholder={`Search ${terminologyLower.learner} by name, email, or gamer name...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-muted border-border text-foreground placeholder:text-muted-foreground"
              data-testid="input-search-student"
            />
          </div>
          
          {/* Student Suggestions */}
          {searchTerm && filteredStudents.length > 0 && (
            <div className="mt-3 max-h-60 overflow-y-auto border border-border rounded-lg bg-muted">
              {filteredStudents.slice(0, 10).map((student: any) => (
                <button
                  key={student.userId}
                  onClick={() => {
                    setSelectedStudent(student.userId);
                    setSearchTerm('');
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-muted/80 transition-colors border-b border-border last:border-0"
                  data-testid={`button-select-student-${student.userId}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-surface-raised flex items-center justify-center text-foreground font-semibold text-sm">
                      {getDisplayName(student).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground font-medium truncate">{getDisplayName(student)}</p>
                      <p className="text-xs text-muted-foreground truncate">{student.email}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {searchTerm && filteredStudents.length === 0 && (
            <p className="mt-3 text-center text-muted-foreground text-sm">No {terminologyLower.learnerPlural} found matching "{searchTerm}"</p>
          )}
        </CardContent>
      </Card>

      {/* Student Analytics Dashboard */}
      {selectedStudent && selectedStudentData && (
        <>
          {/* Student Overview */}
          <Card className="bg-surface-raised border-primary">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-surface-raised flex items-center justify-center text-foreground font-bold text-2xl">
                    {getDisplayName(selectedStudentData).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <CardTitle className="text-foreground text-2xl" data-testid="text-selected-student-name">
                      {getDisplayName(selectedStudentData)}
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">{selectedStudentData.email}</CardDescription>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelectedStudent('')}
                  className="text-muted-foreground hover:text-foreground"
                  data-testid="button-clear-student"
                >
                  Clear
                </Button>
              </div>
            </CardHeader>
          </Card>

          {loadingAnalytics ? (
            <Card className="bg-card/50 border-border">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Loading {terminologyLower.learner} analytics...</p>
              </CardContent>
            </Card>
          ) : studentAnalytics ? (
            <>
              {/* Key Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <Card className="bg-surface-raised border-secondary">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs sm:text-sm font-medium text-secondary/80 flex items-center gap-2">
                      <Trophy className="w-4 h-4" />
                      Overall Score
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl sm:text-3xl font-bold ${getPerformanceColor(studentAnalytics.overallAccuracy || 0)}`}>
                      {studentAnalytics.overallAccuracy || 0}%
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-surface-raised border-primary">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs sm:text-sm font-medium text-primary/80 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      Games Played
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl sm:text-3xl font-bold text-foreground">{studentAnalytics.totalGames || 0}</div>
                  </CardContent>
                </Card>

                <Card className="bg-surface-raised border-primary">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs sm:text-sm font-medium text-primary/80 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Avg Time
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl sm:text-3xl font-bold text-foreground">
                      {studentAnalytics.averageTimeMinutes ? `${studentAnalytics.averageTimeMinutes}m` : 'N/A'}
                    </div>
                  </CardContent>
                </Card>

                <Card className={` ${
                  studentAnalytics.riskLevel === 'critical' ? 'from-[var(--destructive)]/50 border-[var(--destructive)]/70' :
                  studentAnalytics.riskLevel === 'warning' ? 'from-[var(--warning)]/50 border-[var(--warning)]/70' :
                  'from-[var(--success)]/50 border-[var(--success)]/70'
                }`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Badge className={getPerformanceBadge(studentAnalytics.overallAccuracy || 0)} data-testid="badge-student-status">
                      {studentAnalytics.riskLevel === 'critical' ? 'Critical' :
                       studentAnalytics.riskLevel === 'warning' ? 'Warning' : 'On Track'}
                    </Badge>
                  </CardContent>
                </Card>
              </div>

              {/* Performance Trend Chart */}
              {studentAnalytics.performanceTrend && studentAnalytics.performanceTrend.length > 0 && (
                <Card className="bg-card/50 border-border">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <TrendingUp className="w-5 h-5" />
                      Performance Trend
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Accuracy over the last 30 days
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="w-full h-56 sm:h-72 md:h-80" data-testid="chart-performance-trend">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart 
                          data={studentAnalytics.performanceTrend}
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
                  </CardContent>
                </Card>
              )}

              {/* Strengths & Weaknesses */}
              {(studentAnalytics.strengths?.length > 0 || studentAnalytics.weaknesses?.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Strengths */}
                  {studentAnalytics.strengths?.length > 0 && (
                    <Card className="bg-card/50 border-border">
                      <CardHeader>
                        <CardTitle className="text-foreground flex items-center gap-2">
                          <Award className="w-5 h-5 text-success" />
                          Top Strengths
                        </CardTitle>
                        <CardDescription className="text-muted-foreground">
                          Best performing subjects
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {studentAnalytics.strengths.slice(0, 3).map((subject: any, index: number) => (
                          <div key={index} className="p-3 bg-success/10 border border-[var(--success)]/30 rounded-lg">
                            <div className="flex items-center justify-between mb-1">
                              <h4 className="font-semibold text-foreground text-sm">{subject.name}</h4>
                              <Badge >
                                {subject.accuracy}%
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{subject.attempts} attempts</p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  {/* Weaknesses */}
                  {studentAnalytics.weaknesses?.length > 0 && (
                    <Card className="bg-card/50 border-border">
                      <CardHeader>
                        <CardTitle className="text-foreground flex items-center gap-2">
                          <Target className="w-5 h-5 text-destructive" />
                          Areas for Improvement
                        </CardTitle>
                        <CardDescription className="text-muted-foreground">
                          Subjects needing attention
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {studentAnalytics.weaknesses.slice(0, 3).map((subject: any, index: number) => (
                          <div key={index} className="p-3 bg-destructive/10 border border-[var(--destructive)]/30 rounded-lg">
                            <div className="flex items-center justify-between mb-1">
                              <h4 className="font-semibold text-foreground text-sm">{subject.name}</h4>
                              <Badge >
                                {subject.accuracy}%
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{subject.attempts} attempts</p>
                            {subject.recommendation && (
                              <p className="text-xs text-warning mt-2 italic">💡 {subject.recommendation}</p>
                            )}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Subject Breakdown */}
              {studentAnalytics.subjectBreakdown && studentAnalytics.subjectBreakdown.length > 0 && (
                <Card className="bg-card/50 border-border">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <BookOpen className="w-5 h-5" />
                      Subject Performance
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Detailed breakdown by subject
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="w-full h-56 sm:h-72 md:h-80" data-testid="chart-subject-breakdown">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                          data={studentAnalytics.subjectBreakdown}
                          margin={{ top: 5, right: isMobile ? 5 : 20, left: isMobile ? -10 : 0, bottom: isMobile ? 60 : 80 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke-default)" />
                          <XAxis 
                            dataKey="name" 
                            stroke="var(--text-muted)" 
                            tick={{ fontSize: isMobile ? 9 : 11 }} 
                            angle={-45} 
                            textAnchor="end" 
                            height={isMobile ? 60 : 80}
                            interval={0}
                          />
                          <YAxis 
                            stroke="var(--text-muted)" 
                            domain={[0, 100]} 
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
                          <Bar dataKey="accuracy" fill="var(--chart-1)" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Quiz Attempts Breakdown */}
              {studentAnalytics.quizAttempts && studentAnalytics.quizAttempts.length > 0 && (
                <Card className="bg-card/50 border-border">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <Calendar className="w-5 h-5" />
                      Quiz Attempts
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Detailed history of all quiz attempts
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {studentAnalytics.quizAttempts.map((quiz: any) => (
                      <Collapsible 
                        key={quiz.id}
                        open={expandedQuizzes.has(quiz.id)}
                        onOpenChange={() => toggleQuizExpansion(quiz.id)}
                      >
                        <div className="border border-border rounded-lg overflow-hidden">
                          <CollapsibleTrigger className="w-full p-4 bg-muted/50 hover:bg-muted transition-colors">
                            <div className="flex items-center justify-between">
                              <div className="flex-1 text-left">
                                <h4 className="font-semibold text-foreground text-sm sm:text-base">{quiz.collectionName}</h4>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {new Date(quiz.playedAt).toLocaleDateString()} • {quiz.timeTaken ? `${quiz.timeTaken}s` : 'N/A'}
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <Badge className={getPerformanceBadge(quiz.score)}>
                                  {quiz.score}%
                                </Badge>
                                {expandedQuizzes.has(quiz.id) ? (
                                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                )}
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="p-4 bg-card/30 border-t border-border">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                                <div className="text-center p-2 bg-muted/50 rounded">
                                  <p className="text-xs text-muted-foreground">Correct</p>
                                  <p className="text-lg font-bold text-success flex items-center justify-center gap-1">
                                    <CheckCircle className="w-4 h-4" />
                                    {quiz.correctAnswers || 0}
                                  </p>
                                </div>
                                <div className="text-center p-2 bg-muted/50 rounded">
                                  <p className="text-xs text-muted-foreground">Incorrect</p>
                                  <p className="text-lg font-bold text-destructive flex items-center justify-center gap-1">
                                    <XCircle className="w-4 h-4" />
                                    {quiz.incorrectAnswers || 0}
                                  </p>
                                </div>
                                <div className="text-center p-2 bg-muted/50 rounded">
                                  <p className="text-xs text-muted-foreground">Skipped</p>
                                  <p className="text-lg font-bold text-muted-foreground flex items-center justify-center gap-1">
                                    <Minus className="w-4 h-4" />
                                    {quiz.skippedAnswers || 0}
                                  </p>
                                </div>
                                <div className="text-center p-2 bg-muted/50 rounded">
                                  <p className="text-xs text-muted-foreground">vs {subUnitLabel} Avg</p>
                                  <p className={`text-lg font-bold ${quiz.vsClassAverage >= 0 ? 'text-success' : 'text-destructive'}`}>
                                    {quiz.vsClassAverage >= 0 ? '+' : ''}{quiz.vsClassAverage || 0}%
                                  </p>
                                </div>
                              </div>
                              {quiz.subject && (
                                <Badge className="mb-2">
                                  {quiz.subject}
                                </Badge>
                              )}
                              {quiz.recommendation && (
                                <p className="text-sm text-warning mt-2 p-2 bg-warning/10 rounded border border-[var(--warning)]/30">
                                  💡 <span className="italic">{quiz.recommendation}</span>
                                </p>
                              )}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card className="bg-card/50 border-border">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No performance data available for this student</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Empty State */}
      {!selectedStudent && (
        <Card className="bg-card/50 border-border">
          <CardContent className="py-16 text-center">
            <Search className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Search for a {learnerLabel}
            </h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Use the search bar above to find a {learnerLower} and view their detailed performance analytics, 
              including trends, strengths, weaknesses, and quiz-by-quiz breakdowns.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
