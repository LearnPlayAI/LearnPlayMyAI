import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  ChevronRight, 
  ChevronLeft, 
  Check, 
  BookOpen,
  Target,
  GraduationCap,
  Users,
  AlertCircle,
  Calendar
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';

interface LessonAssignmentWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId?: string;
  initialUnitId?: string;
  initialSubjectId?: string;
}

type WizardStep = 'browse' | 'select' | 'target' | 'review';

export function LessonAssignmentWizard({ 
  open, 
  onOpenChange, 
  organizationId, 
  initialUnitId, 
  initialSubjectId 
}: LessonAssignmentWizardProps) {
  const { toast } = useToast();
  const { terminology: rawTerminology } = useOrganizationTerminology();
  
  // Safe terminology with fallbacks
  const terminology = rawTerminology || {
    learner: 'Learner',
    learnerPlural: 'Learners',
    unit: 'Department',
    unitPlural: 'Departments',
    subUnit: 'Unit',
    subUnitPlural: 'Units',
    subject: 'Topic',
    subjectPlural: 'Topics',
    educator: 'Instructor',
    educatorPlural: 'Instructors',
    educatorRole: 'team_lead',
    learnerRole: 'learner',
  };
  
  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>('browse');
  const [selectedLessons, setSelectedLessons] = useState<string[]>([]);
  const [selectedOrg, setSelectedOrg] = useState(organizationId || '');
  
  // Browse scope (for filtering content)
  const [browseUnit, setBrowseUnit] = useState('ALL_UNITS'); // 'ALL_UNITS' or unit ID
  const [browseSubUnit, setBrowseSubUnit] = useState('');
  const [browseSubject, setBrowseSubject] = useState('ALL_SUBJECTS'); // 'ALL_SUBJECTS' or subject ID
  
  // Target scope (for assignment destination)
  const [targetUnit, setTargetUnit] = useState('');
  const [targetSubUnit, setTargetSubUnit] = useState('');
  const [targetSubject, setTargetSubject] = useState('');
  
  const [lessonAssignmentFilter, setLessonAssignmentFilter] = useState('unassigned');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');

  const steps: WizardStep[] = ['browse', 'select', 'target', 'review'];
  const currentStepIndex = steps.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  // Initialize context from props when wizard opens
  useEffect(() => {
    if (open) {
      if (organizationId) setSelectedOrg(organizationId);
      if (initialUnitId && initialUnitId !== 'all-grades' && initialUnitId !== 'all-departments') {
        setBrowseUnit(initialUnitId);
        setTargetUnit(initialUnitId);
      }
      if (initialSubjectId && initialSubjectId !== 'all-subjects' && initialSubjectId !== 'all-units') {
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

  // Fetch lessons - use default fetcher to handle 304 responses correctly
  const { data: lessonData } = useQuery<any>({
    queryKey: [`/api/lessons?organizationId=${selectedOrg}`],
    enabled: !!selectedOrg && open,
  });
  
  const lessons = lessonData?.lessons || [];

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

  // Fetch subjects
  const { data: subjects = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', selectedOrg, 'subjects'],
    enabled: !!selectedOrg && open,
  });

  // Fetch lesson assignments
  const { data: lessonAssignments = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/lesson-assignments', selectedOrg],
    queryFn: async () => {
      if (!selectedOrg) return [];
      const response = await fetch(`/api/admin/lesson-assignments?organizationId=${selectedOrg}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch lesson assignments');
      return response.json();
    },
    enabled: !!selectedOrg && open,
  });

  // Fetch unit-subject assignments
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
      let dueDateISO: string | null = null;
      
      if (dueDate && dueTime) {
        dueDateISO = new Date(`${dueDate}T${dueTime}`).toISOString();
      }
      
      return apiRequest('/api/lessons/assign', {
        method: 'POST',
        body: JSON.stringify({
          lessonIds: selectedLessons,
          unitId: targetUnit,
          subUnitId: targetSubUnit || null,
          subjectId: targetSubject || null,
          organizationId: selectedOrg,
          dueDate: dueDateISO,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/lesson-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons'] });
      toast({ 
        title: `${selectedLessons.length} ${"Lesson"}${selectedLessons.length > 1 ? 's' : ''} assigned successfully!` 
      });
      handleClose();
    },
    onError: (error: any) => {
      toast({ 
        title: `Failed to assign ${"Lesson"}s`, 
        description: error.message || 'Please try again',
        variant: 'destructive' 
      });
    },
  });

  const handleClose = () => {
    setCurrentStep('browse');
    setSelectedLessons([]);
    setSelectedOrg(organizationId || '');
    setBrowseUnit('ALL_UNITS');
    setBrowseSubUnit('');
    setBrowseSubject('');
    setTargetUnit('');
    setTargetSubUnit('');
    setTargetSubject('');
    setDueDate('');
    setDueTime('');
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
        // Must select at least one lesson
        return selectedLessons.length > 0;
      case 'target':
        // Must specify assignment target (org + department required)
        return !!selectedOrg && !!targetUnit;
      case 'review':
        return true;
      default:
        return false;
    }
  };

  // Filter lessons based on browse scope and assignment status
  const filteredLessons = lessons.filter((lesson: any) => {
    // Filter by organization
    if (selectedOrg && lesson.organizationId !== selectedOrg) return false;
    
    // Filter by browse scope (department/unit/subject)
    if (browseUnit !== 'ALL_UNITS') {
      // Filter by browse department
      if (lesson.department !== browseUnit && lesson.gradeLevel !== browseUnit) {
        return false;
      }
      
      // Filter by browse subject if selected (skip if ALL_SUBJECTS)
      if (browseSubject && browseSubject !== 'ALL_SUBJECTS' && lesson.subject !== browseSubject && lesson.unit !== browseSubject) {
        return false;
      }
    }
    
    // Filter by assignment status
    if (lessonAssignmentFilter === 'assigned') {
      // Show only lessons that have ANY assignments
      const hasAnyAssignment = lessonAssignments.some((assignment: any) => 
        assignment.lessonId === lesson.id
      );
      if (!hasAnyAssignment) return false;
    } else if (lessonAssignmentFilter === 'unassigned') {
      // Show only lessons with NO assignments
      const hasAnyAssignment = lessonAssignments.some((assignment: any) => 
        assignment.lessonId === lesson.id
      );
      if (hasAnyAssignment) return false;
    }
    // 'all' filter shows everything
    
    return true;
  });

  const toggleLessonSelection = (lessonId: string) => {
    setSelectedLessons(prev => 
      prev.includes(lessonId) 
        ? prev.filter(id => id !== lessonId)
        : [...prev, lessonId]
    );
  };

  const selectedOrgData = organizations.find((o: any) => o.id === selectedOrg);
  const browseUnitData = units.find((u: any) => u.id === browseUnit);
  const targetUnitData = units.find((u: any) => u.id === targetUnit);
  const targetSubUnitData = subUnits.find((su: any) => su.id === targetSubUnit);
  const targetSubjectData = subjects.find((s: any) => s.id === targetSubject);
  const selectedLessonsData = lessons.filter((l: any) => selectedLessons.includes(l.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground w-[min(95vw,48rem)] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <BookOpen className="h-5 w-5 text-primary" />
            {"Lesson"} Assignment Wizard
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Step {currentStepIndex + 1} of {steps.length}: {
              currentStep === 'browse' ? 'Browse Content' :
              currentStep === 'select' ? 'Select Lessons' :
              currentStep === 'target' ? 'Choose Assignment Target' :
              'Review & Confirm'
            }
          </DialogDescription>
        </DialogHeader>

        {/* Progress Bar */}
        <Progress value={progress} className="h-2" />

        {/* Step Content */}
        <DialogBody className="py-4 sm:py-6 min-h-[250px] sm:min-h-[300px]">
          {/* Step 1: Browse Content */}
          {currentStep === 'browse' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Browse Content</h3>
                  <p className="text-sm text-muted-foreground">
                    Filter lessons by {terminology.unit.toLowerCase()} or browse all
                  </p>
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
                    setSelectedLessons([]);
                  }}>
                    <SelectTrigger className="bg-muted border-border text-foreground min-h-[48px] sm:min-h-[44px]" data-testid="lesson-wizard-select-org">
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
                        <SelectTrigger className="bg-muted border-border text-foreground min-h-[48px] sm:min-h-[44px]" data-testid="lesson-wizard-browse-unit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL_UNITS">All {terminology.unitPlural}</SelectItem>
                          {units.map((unit: any) => (
                            <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Filter content or select "All {terminology.unitPlural}" to see everything</p>
                    </div>

                    {browseUnit !== 'ALL_UNITS' && browseFilteredSubjects.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-foreground">{terminology.subject} (Optional)</Label>
                        <Select value={browseSubject} onValueChange={(val) => setBrowseSubject(val)}>
                          <SelectTrigger className="bg-muted border-border text-foreground min-h-[48px] sm:min-h-[44px]" data-testid="lesson-wizard-browse-subject">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ALL_SUBJECTS">All {terminology.subjectPlural.toLowerCase()}</SelectItem>
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

          {/* Step 2: Select Lessons */}
          {currentStep === 'select' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Select {"Lesson"}s</h3>
                  <p className="text-sm text-muted-foreground">
                    Choose from {"Lesson".toLowerCase()}s in the organization
                  </p>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <Label className="text-foreground">Assignment Status</Label>
                <Select value={lessonAssignmentFilter} onValueChange={setLessonAssignmentFilter}>
                  <SelectTrigger className="bg-muted border-border text-foreground min-h-[48px] sm:min-h-[44px]" data-testid="lesson-wizard-select-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All {"Lesson".toLowerCase()}s</SelectItem>
                    <SelectItem value="assigned">Assigned {"Lesson".toLowerCase()}s</SelectItem>
                    <SelectItem value="unassigned">Unassigned {"Lesson".toLowerCase()}s</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 max-h-96 overflow-y-auto">
                {filteredLessons.map((lesson: any) => (
                  <Card
                    key={lesson.id}
                    className={`cursor-pointer transition-all ${
                      selectedLessons.includes(lesson.id)
                        ? 'bg-primary/20 border-primary'
                        : 'bg-muted/50 border-border hover:border-muted-foreground'
                    }`}
                    onClick={() => toggleLessonSelection(lesson.id)}
                    data-testid={`lesson-wizard-lesson-${lesson.id}`}
                  >
                    <CardHeader className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1">
                          <div onClick={(e) => e.stopPropagation()}>
                            <Checkbox 
                              checked={selectedLessons.includes(lesson.id)}
                              onCheckedChange={() => toggleLessonSelection(lesson.id)}
                              className="mt-1"
                              data-testid={`lesson-wizard-checkbox-${lesson.id}`}
                            />
                          </div>
                          <div className="flex-1">
                            <CardTitle className="text-foreground text-base">{lesson.title}</CardTitle>
                            <CardDescription className="text-muted-foreground text-sm line-clamp-2">
                              {lesson.description || 'No description'}
                            </CardDescription>
                          </div>
                        </div>
                        {selectedLessons.includes(lesson.id) && (
                          <Check className="h-5 w-5 text-primary flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" >
                          {lesson.generationStatus === 'completed' ? 'Published' : lesson.generationStatus}
                        </Badge>
                        {lesson.creditsUsed && (
                          <Badge variant="outline" >
                            {lesson.creditsUsed} credits
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                  </Card>
                ))}
                {filteredLessons.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No lessons available{browseUnit !== 'ALL_UNITS' ? ` for selected ${terminology.unit.toLowerCase()}` : ' in this organization'}
                  </div>
                )}
              </div>

              {selectedLessons.length > 0 && (
                <div className="pt-2 text-sm text-primary">
                  {selectedLessons.length} {"Lesson".toLowerCase()}{selectedLessons.length > 1 ? 's' : ''} selected
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
                  <p className="text-sm text-muted-foreground">Select where to assign these lessons</p>
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
                    <SelectTrigger className="bg-muted border-border text-foreground min-h-[48px] sm:min-h-[44px]" data-testid="lesson-wizard-target-unit">
                      <SelectValue placeholder={`Select ${terminology.unit.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((unit: any) => (
                        <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Required: Select which {terminology.unit.toLowerCase()} to assign these lessons to</p>
                </div>

                {targetUnit && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-foreground flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {terminology.subUnit} (Optional)
                      </Label>
                      <Select value={targetSubUnit} onValueChange={(val) => setTargetSubUnit(val === 'ALL' ? '' : val)}>
                        <SelectTrigger className="bg-muted border-border text-foreground min-h-[48px] sm:min-h-[44px]" data-testid="lesson-wizard-target-subunit">
                          <SelectValue placeholder={`All ${terminology.subUnitPlural.toLowerCase()}`} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All {terminology.subUnitPlural.toLowerCase()}</SelectItem>
                          {subUnits.filter((su: any) => su.unitId === targetUnit).map((subUnit: any) => (
                            <SelectItem key={subUnit.id} value={subUnit.id}>{subUnit.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-foreground">{terminology.subject} (Optional)</Label>
                      <Select value={targetSubject} onValueChange={(val) => setTargetSubject(val === "ALL" ? "" : val)}>
                        <SelectTrigger className="bg-muted border-border text-foreground min-h-[48px] sm:min-h-[44px]" data-testid="lesson-wizard-target-subject">
                          <SelectValue placeholder={`All ${terminology.subjectPlural.toLowerCase()}`} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All {terminology.subjectPlural.toLowerCase()}</SelectItem>
                          {targetFilteredSubjects.map((subject: any) => (
                            <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Leave empty for {terminology.unit.toLowerCase()}-wide assignment</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Review & Settings */}
          {currentStep === 'review' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <Check className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Review & Configure</h3>
                  <p className="text-sm text-muted-foreground">Confirm details and set optional due date</p>
                </div>
              </div>

              <div className="space-y-3">
                <Card className="bg-muted/50 border-border">
                  <CardHeader className="p-4">
                    <CardTitle className="text-foreground text-sm">Selected Lessons</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {selectedLessonsData.map((lesson: any) => (
                      <div key={lesson.id} className="mb-2 last:mb-0">
                        <p className="text-foreground font-medium">{lesson.title}</p>
                      </div>
                    ))}
                    <p className="text-sm text-muted-foreground mt-2">
                      {selectedLessons.length} lesson{selectedLessons.length > 1 ? 's' : ''} selected
                    </p>
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
                    {targetSubjectData && (
                      <p className="text-foreground">
                        <span className="text-muted-foreground">{terminology.subject}:</span> {targetSubjectData.name}
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-muted/50 border-border">
                  <CardHeader className="p-3 sm:p-4">
                    <CardTitle className="text-foreground text-sm flex items-center gap-2">
                      <Calendar className="h-4 w-4 flex-shrink-0" />
                      Due Date (Optional)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-4 pt-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">Date</Label>
                        <Input
                          type="date"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          className="bg-muted border-border text-foreground min-h-[48px] sm:min-h-[44px]"
                          data-testid="lesson-wizard-due-date"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">Time</Label>
                        <Input
                          type="time"
                          value={dueTime}
                          onChange={(e) => setDueTime(e.target.value)}
                          className="bg-muted border-border text-foreground min-h-[48px] sm:min-h-[44px]"
                          data-testid="lesson-wizard-due-time"
                        />
                      </div>
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-2">
                      {dueDate && dueTime ? 
                        `Due: ${new Date(`${dueDate}T${dueTime}`).toLocaleString()}` : 
                        'No due date set'
                      }
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </DialogBody>

        {/* Footer Navigation */}
        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {currentStepIndex > 0 && (
              <Button variant="outline" onClick={handleBack} className="w-full sm:w-auto min-h-[48px] sm:min-h-[44px]" data-testid="lesson-wizard-back" >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
            <Button variant="outline" onClick={handleClose} className="w-full sm:w-auto min-h-[48px] sm:min-h-[44px]" data-testid="lesson-wizard-cancel" >
              Cancel
            </Button>
          </div>

          <Button onClick={() => {
              if (currentStepIndex === steps.length - 1) {
                createAssignment.mutate();
              } else {
                handleNext();
              }
            }}
            disabled={!canProceed() || createAssignment.isPending}
            className="w-full sm:w-auto min-h-[48px] sm:min-h-[44px] bg-primary hover:bg-primary/90 text-foreground"
            data-testid="lesson-wizard-next"
          >
            {createAssignment.isPending ? (
              'Assigning...'
            ) : currentStepIndex === steps.length - 1 ? (
              <>
                <Check className="h-4 w-4 mr-1" />
                Assign {"Lesson"}s
              </>
            ) : (
              <>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
