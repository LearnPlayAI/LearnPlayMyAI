import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  ChevronRight, 
  ChevronLeft, 
  Check, 
  FileQuestion,
  Target,
  GraduationCap,
  Users,
  AlertCircle
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';

interface AssignmentWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId?: string;
  initialUnitId?: string;
  initialSubjectId?: string;
}

type WizardStep = 'browse' | 'select' | 'target' | 'review';

export function AssignmentWizard({ open, onOpenChange, organizationId, initialUnitId, initialSubjectId }: AssignmentWizardProps) {
  const { toast } = useToast();
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
    subject: 'Subject',
    subjectPlural: 'Subjects',
  };
  const termsLower = {
    learner: terminology.learner.toLowerCase(),
    learnerPlural: terminology.learnerPlural.toLowerCase(),
    unit: terminology.unit.toLowerCase(),
    unitPlural: terminology.unitPlural.toLowerCase(),
    subUnit: terminology.subUnit.toLowerCase(),
    subUnitPlural: terminology.subUnitPlural.toLowerCase(),
    team: terminology.team.toLowerCase(),
    teamPlural: terminology.teamPlural.toLowerCase(),
    subject: terminology.subject.toLowerCase(),
    subjectPlural: terminology.subjectPlural.toLowerCase(),
  };
  const [currentStep, setCurrentStep] = useState<WizardStep>('browse');
  const [selectedQuizzes, setSelectedQuizzes] = useState<string[]>([]);
  const [selectedOrg, setSelectedOrg] = useState(organizationId || '');
  
  // Browse scope (for filtering which quizzes to show)
  const [browseUnit, setBrowseUnit] = useState('ALL_UNITS');
  const [browseSubject, setBrowseSubject] = useState('ALL_SUBJECTS');
  
  // Assignment target (where to assign TO)
  const [targetUnit, setTargetUnit] = useState('');
  const [targetSubUnit, setTargetSubUnit] = useState('');
  const [targetTeam, setTargetTeam] = useState('');
  const [targetSubject, setTargetSubject] = useState('');
  
  const [quizAssignmentFilter, setQuizAssignmentFilter] = useState('unassigned');
  const [passPercentage, setPassPercentage] = useState('70');
  const [availableFromDate, setAvailableFromDate] = useState('');
  const [availableFromTime, setAvailableFromTime] = useState('');
  const [availableToDate, setAvailableToDate] = useState('');
  const [availableToTime, setAvailableToTime] = useState('');

  const steps: WizardStep[] = ['browse', 'select', 'target', 'review'];
  const currentStepIndex = steps.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  const toggleQuizSelection = (quizId: string) => {
    setSelectedQuizzes(prev => 
      prev.includes(quizId) 
        ? prev.filter(id => id !== quizId)
        : [...prev, quizId]
    );
  };

  // Initialize context from props when wizard opens
  useEffect(() => {
    if (open) {
      if (organizationId) setSelectedOrg(organizationId);
      if (initialUnitId && initialUnitId !== 'all-grades') {
        setBrowseUnit(initialUnitId);
        setTargetUnit(initialUnitId);
      }
      if (initialSubjectId && initialSubjectId !== 'all-subjects') {
        setBrowseSubject(initialSubjectId);
        setTargetSubject(initialSubjectId);
      }
    }
  }, [open, organizationId, initialUnitId, initialSubjectId]);

  // Fetch organizations
  const { data: organizations = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations'],
    enabled: open,
  });

  // Fetch quiz collections
  const { data: quizzes = [] } = useQuery<any[]>({
    queryKey: ['/api/quiz/collections'],
    enabled: open,
  });

  // Fetch units
  const { data: units = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', selectedOrg, 'units'],
    enabled: !!selectedOrg && open,
  });

  // Fetch sub-units
  const { data: subUnits = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', selectedOrg, 'sub-units'],
    enabled: !!selectedOrg && open,
  });

  // Fetch teams (Level 3 in hierarchy)
  const { data: teams = [] } = useQuery<any[]>({
    queryKey: ['/api/organization/teams', targetSubUnit],
    enabled: !!targetSubUnit && open,
  });

  // Fetch subjects
  const { data: subjects = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', selectedOrg, 'subjects'],
    enabled: !!selectedOrg && open,
  });

  // Fetch quiz assignments to know which quizzes are already assigned
  const { data: quizAssignments = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', selectedOrg, 'quiz-assignments'],
    enabled: !!selectedOrg && open,
  });

  // Fetch unit-subject assignments to filter subjects by grade
  const { data: unitSubjectAssignments = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', selectedOrg, 'unit-subjects'],
    enabled: !!selectedOrg && open,
  });

  // Filter subjects based on browse unit for step 1
  const browseFilteredSubjects = subjects.filter((subject: any) => {
    if (browseUnit === 'ALL_UNITS') return true;
    
    return unitSubjectAssignments.some(
      (usa: any) => usa.subjectId === subject.id && usa.unitId === browseUnit
    );
  });

  // Filter subjects based on target unit for step 3
  const targetFilteredSubjects = subjects.filter((subject: any) => {
    if (!targetUnit) return true;
    
    return unitSubjectAssignments.some(
      (usa: any) => usa.subjectId === subject.id && usa.unitId === targetUnit
    );
  });

  // Create assignment mutation
  const createAssignment = useMutation({
    mutationFn: async () => {
      // Combine date and time into ISO strings
      let availableFrom: string | null = null;
      let availableTo: string | null = null;
      
      if (availableFromDate && availableFromTime) {
        availableFrom = new Date(`${availableFromDate}T${availableFromTime}`).toISOString();
      }
      
      if (availableToDate && availableToTime) {
        availableTo = new Date(`${availableToDate}T${availableToTime}`).toISOString();
      }
      
      // Assign all selected quizzes
      const promises = selectedQuizzes.map(quizId =>
        apiRequest(`/api/admin/quiz-collections/${quizId}/assignments`, {
          method: 'POST',
          body: JSON.stringify({
            unitId: targetUnit,
            subUnitId: targetSubUnit || null,
            teamId: targetTeam || null,
            subjectId: targetSubject || null,
            requiredPassPercentage: parseInt(passPercentage),
            availableFrom,
            availableTo,
          }),
        })
      );
      
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quiz/assignments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
      toast({ title: 'Quiz assigned successfully!' });
      handleClose();
    },
    onError: () => {
      toast({ title: 'Failed to assign quiz', variant: 'destructive' });
    },
  });

  const handleClose = () => {
    setCurrentStep('browse');
    setSelectedQuizzes([]);
    setSelectedOrg(organizationId || '');
    setBrowseUnit('ALL_UNITS');
    setBrowseSubject('ALL_SUBJECTS');
    setTargetUnit('');
    setTargetSubUnit('');
    setTargetTeam('');
    setTargetSubject('');
    setPassPercentage('70');
    setAvailableFromDate('');
    setAvailableFromTime('');
    setAvailableToDate('');
    setAvailableToTime('');
    onOpenChange(false);
  };

  const handleNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex]);
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex]);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 'browse':
        // Organization required, browse filters optional
        return !!selectedOrg;
      case 'select':
        // Must select at least one quiz
        return selectedQuizzes.length > 0;
      case 'target':
        // Must specify assignment target (org + department required)
        return !!selectedOrg && !!targetUnit;
      case 'review':
        // Must have valid pass percentage
        return passPercentage && parseInt(passPercentage) >= 0 && parseInt(passPercentage) <= 100;
      default:
        return false;
    }
  };

  // Filter quizzes based on browse scope and assignment status
  const filteredQuizzes = quizzes.filter((q: any) => {
    // Filter by organization
    if (selectedOrg && q.organizationId !== selectedOrg) return false;
    
    // Filter by browse scope (department/unit/subject)
    if (browseUnit !== 'ALL_UNITS') {
      // Filter by browse department
      if (q.department !== browseUnit && q.gradeLevel !== browseUnit) {
        return false;
      }
      
      // Filter by browse subject if selected
      if (browseSubject && browseSubject !== 'ALL_SUBJECTS' && q.subject !== browseSubject && q.unit !== browseSubject) {
        return false;
      }
    }
    
    // Filter by assignment status
    if (quizAssignmentFilter === 'assigned') {
      // Show only quizzes that have ANY assignments
      const hasAnyAssignment = quizAssignments.some((assignment: any) => 
        assignment.collectionId === q.id
      );
      if (!hasAnyAssignment) return false;
    } else if (quizAssignmentFilter === 'unassigned') {
      // Show only quizzes with NO assignments
      const hasAnyAssignment = quizAssignments.some((assignment: any) => 
        assignment.collectionId === q.id
      );
      if (hasAnyAssignment) return false;
    }
    // 'all' filter shows everything
    
    return true;
  });

  const selectedOrgData = organizations.find((o: any) => o.id === selectedOrg);
  const browseUnitData = units.find((u: any) => u.id === browseUnit);
  const targetUnitData = units.find((u: any) => u.id === targetUnit);
  const targetSubUnitData = subUnits.find((su: any) => su.id === targetSubUnit);
  const targetTeamData = teams.find((t: any) => t.id === targetTeam);
  const targetSubjectData = subjects.find((s: any) => s.id === targetSubject);
  
  // Get all selected quiz data for review step
  const selectedQuizzesData = selectedQuizzes.map(quizId => 
    quizzes.find((q: any) => q.id === quizId)
  ).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileQuestion className="h-5 w-5 text-primary" />
            Quiz Assignment Wizard
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Step {currentStepIndex + 1} of {steps.length}: {
              currentStep === 'browse' ? 'Browse Content' :
              currentStep === 'select' ? 'Select Quiz' :
              currentStep === 'target' ? 'Choose Assignment Target' :
              'Review & Configure'
            }
          </DialogDescription>
        </DialogHeader>

        {/* Progress Bar */}
        <Progress value={progress} className="h-2" />

        {/* Step Content */}
        <div className="py-6 min-h-[300px]">
          {/* Step 1: Browse Content */}
          {currentStep === 'browse' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <FileQuestion className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Browse Content</h3>
                  <p className="text-sm text-muted-foreground">Filter quizzes by department or browse all</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-foreground flex items-center gap-2">
                    <GraduationCap className="h-4 w-4" />
                    Organization
                  </Label>
                  <Select value={selectedOrg} onValueChange={(val) => {
                    setSelectedOrg(val);
                    setBrowseUnit('ALL_UNITS');
                    setBrowseSubject('');
                    setSelectedQuizzes([]);
                  }}>
                    <SelectTrigger className="bg-muted border-border text-foreground" data-testid="wizard-select-org">
                      <SelectValue placeholder="Select organization" />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations.map((org: any) => (
                        <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedOrg && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-foreground flex items-center gap-2">
                        <GraduationCap className="h-4 w-4" />
                        Browse by {terminology.unit}
                      </Label>
                      <Select value={browseUnit} onValueChange={(val) => {
                        setBrowseUnit(val);
                        setBrowseSubject('');
                      }}>
                        <SelectTrigger className="bg-muted border-border text-foreground" data-testid="wizard-browse-unit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL_UNITS">All {terminology.unitPlural}</SelectItem>
                          {units.map((unit: any) => (
                            <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Filter content or select all {termsLower.unitPlural} to see everything</p>
                    </div>

                    {browseUnit !== 'ALL_UNITS' && browseFilteredSubjects.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-foreground">{terminology.subject} (Optional)</Label>
                        <Select value={browseSubject} onValueChange={(val) => setBrowseSubject(val)}>
                          <SelectTrigger className="bg-muted border-border text-foreground" data-testid="wizard-browse-subject">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ALL_SUBJECTS">All {termsLower.subjectPlural}</SelectItem>
                            {browseFilteredSubjects.map((subject: any) => (
                              <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Select Quiz */}
          {currentStep === 'select' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <FileQuestion className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Select Quiz</h3>
                  <p className="text-sm text-muted-foreground">Choose from quizzes in the organization</p>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <Label className="text-foreground">Assignment Status</Label>
                <Select value={quizAssignmentFilter} onValueChange={setQuizAssignmentFilter}>
                  <SelectTrigger className="bg-muted border-border text-foreground" data-testid="wizard-select-quiz-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All quizzes</SelectItem>
                    <SelectItem value="assigned">Assigned quizzes</SelectItem>
                    <SelectItem value="unassigned">Unassigned quizzes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 max-h-96 overflow-y-auto">
                {filteredQuizzes.map((quiz: any) => (
                  <Card
                    key={quiz.id}
                    className={`cursor-pointer transition-all ${
                      selectedQuizzes.includes(quiz.id)
                        ? 'bg-primary/20 border-primary'
                        : 'bg-muted/50 border-border hover:border-muted-foreground'
                    }`}
                    onClick={() => toggleQuizSelection(quiz.id)}
                    data-testid={`wizard-quiz-${quiz.id}`}
                  >
                    <CardHeader className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1">
                          <div onClick={(e) => e.stopPropagation()}>
                            <Checkbox 
                              checked={selectedQuizzes.includes(quiz.id)}
                              onCheckedChange={() => toggleQuizSelection(quiz.id)}
                              className="mt-1"
                              data-testid={`quiz-wizard-checkbox-${quiz.id}`}
                            />
                          </div>
                          <div className="flex-1">
                            <CardTitle className="text-foreground text-base">{quiz.name}</CardTitle>
                            <CardDescription className="text-muted-foreground text-sm">
                              {quiz.description || 'No description'}
                            </CardDescription>
                          </div>
                        </div>
                        {selectedQuizzes.includes(quiz.id) && (
                          <Check className="h-5 w-5 text-primary flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" >
                          {quiz.totalCards} questions
                        </Badge>
                        <Badge variant="outline" >
                          {quiz.difficulty || 'medium'}
                        </Badge>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
                {filteredQuizzes.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No quizzes available{browseUnit !== 'ALL_UNITS' ? ` for selected ${termsLower.unit}` : ' in this organization'}
                  </div>
                )}
              </div>

              {selectedQuizzes.length > 0 && (
                <div className="pt-2 text-sm text-primary">
                  {selectedQuizzes.length} quiz{selectedQuizzes.length > 1 ? 'zes' : ''} selected
                </div>
              )}
            </div>
          )}

          {/* Step 3: Choose Assignment Target */}
          {currentStep === 'target' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <Target className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Choose Assignment Target</h3>
                  <p className="text-sm text-muted-foreground">Select where to assign this quiz</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-foreground flex items-center gap-2">
                    <GraduationCap className="h-4 w-4" />
                    {terminology.unit} *
                  </Label>
                  <Select value={targetUnit} onValueChange={(val) => {
                    setTargetUnit(val);
                    setTargetSubUnit('');
                    setTargetSubject('');
                  }}>
                    <SelectTrigger className="bg-muted border-border text-foreground" data-testid="wizard-target-unit">
                      <SelectValue placeholder={`Select ${termsLower.unit}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((unit: any) => (
                        <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Required: Select which {termsLower.unit} to assign this quiz to</p>
                </div>

                {targetUnit && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-foreground flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {terminology.subUnit} (Optional)
                      </Label>
                      <Select value={targetSubUnit} onValueChange={(val) => {
                        setTargetSubUnit(val === 'ALL' ? '' : val);
                        setTargetTeam('');
                      }}>
                        <SelectTrigger className="bg-muted border-border text-foreground" data-testid="wizard-target-subunit">
                          <SelectValue placeholder={`All ${termsLower.subUnitPlural}`} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All {termsLower.subUnitPlural}</SelectItem>
                          {subUnits.filter((su: any) => su.unitId === targetUnit).map((subUnit: any) => (
                            <SelectItem key={subUnit.id} value={subUnit.id}>{subUnit.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {targetSubUnit && teams.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-foreground flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          {terminology.team} (Optional)
                        </Label>
                        <Select value={targetTeam} onValueChange={(val) => setTargetTeam(val === 'ALL' ? '' : val)}>
                          <SelectTrigger className="bg-muted border-border text-foreground" data-testid="wizard-target-team">
                            <SelectValue placeholder={`All ${termsLower.teamPlural}`} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ALL">All {termsLower.teamPlural}</SelectItem>
                            {teams.map((team: any) => (
                              <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label className="text-foreground">{terminology.subject} (Optional)</Label>
                      <Select value={targetSubject} onValueChange={(val) => setTargetSubject(val === "ALL" ? "" : val)}>
                        <SelectTrigger className="bg-muted border-border text-foreground" data-testid="wizard-target-subject">
                          <SelectValue placeholder={`All ${termsLower.subjectPlural}`} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All {termsLower.subjectPlural}</SelectItem>
                          {targetFilteredSubjects.map((subject: any) => (
                            <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Leave empty for {termsLower.unit}-wide assignment</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Review & Configure */}
          {currentStep === 'review' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <Check className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Review & Configure</h3>
                  <p className="text-sm text-muted-foreground">Confirm details and set requirements</p>
                </div>
              </div>

              <div className="space-y-3">
                <Card className="bg-muted/50 border-border">
                  <CardHeader className="p-4">
                    <CardTitle className="text-foreground text-sm">Selected Quizzes</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-2">
                    {selectedQuizzesData.map((quiz: any) => (
                      <div key={quiz.id} className="border-b border-border last:border-0 pb-2 last:pb-0">
                        <p className="text-foreground font-medium">{quiz.name}</p>
                        <p className="text-sm text-muted-foreground">{quiz.totalCards} questions</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="bg-muted/50 border-border">
                  <CardHeader className="p-4">
                    <CardTitle className="text-foreground text-sm">Assignment Target</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-1">
                    <p className="text-foreground">
                      <span className="text-muted-foreground">Organization:</span> {selectedOrgData?.name}
                    </p>
                    <p className="text-foreground">
                      <span className="text-muted-foreground">{terminology.unit}:</span> {targetUnitData?.name || 'Not selected'}
                    </p>
                    {targetSubUnitData && (
                      <p className="text-foreground">
                        <span className="text-muted-foreground">{terminology.subUnit}:</span> {targetSubUnitData.name}
                      </p>
                    )}
                    {targetTeamData && (
                      <p className="text-foreground">
                        <span className="text-muted-foreground">{terminology.team}:</span> {targetTeamData.name}
                      </p>
                    )}
                    {targetSubjectData && (
                      <p className="text-foreground">
                        <span className="text-muted-foreground">{terminology.subject}:</span> {targetSubjectData.name}
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-muted/50 border-border">
                  <CardHeader className="p-4">
                    <CardTitle className="text-foreground text-sm">Assignment Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-4">
                    <div className="space-y-2">
                      <Label className="text-foreground">Required Pass Percentage</Label>
                      <div className="flex items-center gap-4">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={passPercentage}
                          onChange={(e) => setPassPercentage(e.target.value)}
                          className="bg-muted border-border text-foreground"
                          data-testid="wizard-pass-percentage"
                        />
                        <span className="text-muted-foreground">%</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {terminology.learnerPlural} must score at least {passPercentage}% to pass this quiz
                      </p>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-foreground">Availability Timeframe (Optional)</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label className="text-sm text-muted-foreground">Available From Date</Label>
                          <Input
                            type="date"
                            value={availableFromDate}
                            onChange={(e) => setAvailableFromDate(e.target.value)}
                            className="bg-muted border-border text-foreground"
                            data-testid="wizard-available-from-date"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm text-muted-foreground">Available From Time</Label>
                          <Input
                            type="time"
                            value={availableFromTime}
                            onChange={(e) => setAvailableFromTime(e.target.value)}
                            className="bg-muted border-border text-foreground"
                            data-testid="wizard-available-from-time"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm text-muted-foreground">Available To Date</Label>
                          <Input
                            type="date"
                            value={availableToDate}
                            onChange={(e) => setAvailableToDate(e.target.value)}
                            className="bg-muted border-border text-foreground"
                            data-testid="wizard-available-to-date"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm text-muted-foreground">Available To Time</Label>
                          <Input
                            type="time"
                            value={availableToTime}
                            onChange={(e) => setAvailableToTime(e.target.value)}
                            className="bg-muted border-border text-foreground"
                            data-testid="wizard-available-to-time"
                          />
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {(availableFromDate && availableFromTime) || (availableToDate && availableToTime) ? 
                          `Available: ${availableFromDate && availableFromTime ? new Date(`${availableFromDate}T${availableFromTime}`).toLocaleString() : 'Now'} - ${availableToDate && availableToTime ? new Date(`${availableToDate}T${availableToTime}`).toLocaleString() : 'Always'}` : 
                          'Always available'
                        }
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <DialogFooter className="flex items-center justify-between">
          <div className="flex gap-2">
            {currentStepIndex > 0 && (
              <Button variant="outline" onClick={handleBack} data-testid="wizard-back" >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} data-testid="wizard-cancel" >
              Cancel
            </Button>
            
            {currentStep !== 'review' ? (
              <Button onClick={handleNext} disabled={!canProceed()} data-testid="wizard-next" >
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={() => createAssignment.mutate()}
                disabled={createAssignment.isPending}
                className="bg-primary hover:bg-primary/90"
                data-testid="wizard-confirm"
              >
                <Check className="h-4 w-4 mr-2" />
                {createAssignment.isPending ? 'Creating...' : 'Create Assignment'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
