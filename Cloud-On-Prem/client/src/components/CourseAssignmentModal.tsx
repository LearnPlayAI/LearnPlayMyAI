import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BookOpen,
  Users,
  Building2,
  User,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
} from 'lucide-react';
import { apiRequest, queryClient, invalidateCourseScopeCaches } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';
import { usePlatformMode } from '@/hooks/usePlatformMode';
import { useAuth } from '@/hooks/useAuth';

import { getDisplayName } from '@/lib/utils';
import { tzFormat } from '@/utils/timezoneRuntime';

const Dialog = ({ open, children }: any) => (open ? <div className="space-y-3">{children}</div> : null);
const DialogContent = ({ className, children }: any) => <section className={className}>{children}</section>;
const DialogHeader = ({ className, children }: any) => <div className={className}>{children}</div>;
const DialogTitle = ({ className, children }: any) => <h3 className={className}>{children}</h3>;
const DialogDescription = ({ className, children }: any) => <p className={className}>{children}</p>;
const DialogFooter = ({ className, children }: any) => <div className={className}>{children}</div>;

type WizardStep = 'type' | 'target' | 'due_date' | 'review';
type AssignmentType = 'user' | 'unit' | 'organization' | 'crossorg';

interface Course {
  id: string;
  title: string;
  description: string | null;
  status: string;
  thumbnailUrl: string | null;
  organizationId: string;
  visibility?: string;
}

interface CourseAssignmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseTitle?: string;
  courseOrganizationId?: string;
  onAssignmentComplete?: () => void;
}

export function CourseAssignmentModal({
  open,
  onOpenChange,
  courseId,
  courseTitle,
  courseOrganizationId,
  onAssignmentComplete,
}: CourseAssignmentModalProps) {
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
  };

  const [currentStep, setCurrentStep] = useState<WizardStep>('type');
  const [assignmentType, setAssignmentType] = useState<AssignmentType>('user');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [selectedSubUnit, setSelectedSubUnit] = useState<string>('');
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [isMandatory, setIsMandatory] = useState(true);
  const [selectedTargetOrg, setSelectedTargetOrg] = useState<string>('');

  const { onpremMode } = usePlatformMode();
  const { effectiveOrganizationId } = useAuth();

  const steps: WizardStep[] = ['type', 'target', 'due_date', 'review'];
  const currentStepIndex = steps.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  const { data: courseData } = useQuery<Course>({
    queryKey: ['/api/courses', courseId],
    queryFn: async () => {
      const response = await fetch(`/api/courses/${courseId}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to load course');
      return response.json();
    },
    enabled: open && !!courseId,
  });

  const effectiveCourseTitle = courseTitle || courseData?.title || 'Course';
  const effectiveOrgId = courseOrganizationId || courseData?.organizationId;

  const { data: usersData = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/users'],
    enabled: open && assignmentType === 'user',
  });

  const { data: unitsData = [] } = useQuery<any[]>({
    queryKey: ['/api/organization/units', effectiveOrganizationId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (effectiveOrganizationId) {
        params.set('organizationId', effectiveOrganizationId);
      }
      const url = `/api/organization/units${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: open,
  });

  const { data: subUnitsData = [] } = useQuery<any[]>({
    queryKey: ['/api/organization/sub-units', selectedUnit, effectiveOrganizationId],
    enabled: open && assignmentType === 'unit' && !!selectedUnit,
    queryFn: async () => {
      if (!selectedUnit) return [];
      const params = new URLSearchParams();
      if (effectiveOrganizationId) {
        params.set('organizationId', effectiveOrganizationId);
      }
      const response = await fetch(`/api/organization/sub-units/${selectedUnit}${params.toString() ? `?${params.toString()}` : ''}`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
  });

  const { data: teamsData = [] } = useQuery<any[]>({
    queryKey: ['/api/organization/teams', selectedSubUnit],
    enabled: open && assignmentType === 'unit' && !!selectedSubUnit,
  });

  const filteredSubUnits = subUnitsData;
  const selectedDepartmentIds = selectedUnits.length > 0 ? selectedUnits : (selectedUnit ? [selectedUnit] : []);
  const canSelectNestedScope = selectedDepartmentIds.length === 1;

  const { data: targetOrgsData = [] } = useQuery<Array<{ id: string; name: string; ruleId: string }>>({
    queryKey: ['/api/interorg/target-orgs'],
    enabled: open && onpremMode,
  });

  const { data: targetOrgHierarchy } = useQuery<{ units: Array<{ id: string; name: string; subUnits: Array<{ id: string; name: string; teams: Array<{ id: string; name: string }> }> }> }>({
    queryKey: ['/api/interorg/target-orgs', selectedTargetOrg, 'hierarchy'],
    queryFn: async () => {
      const response = await fetch(`/api/interorg/target-orgs/${selectedTargetOrg}/hierarchy`, { credentials: 'include' });
      if (!response.ok) return { units: [] };
      return response.json();
    },
    enabled: open && onpremMode && !!selectedTargetOrg && assignmentType === 'crossorg',
  });

  const canAssignCrossOrg = onpremMode && targetOrgsData.length > 0 && courseData?.visibility === 'public';

  const createAssignmentMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveOrgId) {
        throw new Error('Course organization not found');
      }

      let dueDateISO: string | null = null;
      if (dueDate) {
        dueDateISO = dueTime
          ? new Date(`${dueDate}T${dueTime}`).toISOString()
          : new Date(`${dueDate}T23:59:59`).toISOString();
      }

      const payload: any = {
        courseId,
        organizationId: effectiveOrgId,
        dueDate: dueDateISO,
        mandatory: isMandatory,
      };

      if (assignmentType === 'crossorg') {
        payload.targetOrganizationId = selectedTargetOrg;
        if (selectedDepartmentIds.length > 1 && !selectedSubUnit && !selectedTeam) {
          payload.targets = selectedDepartmentIds.map((unitId) => ({
            unitId,
            assignmentScope: 'department',
          }));
          return apiRequest('/api/course-assignments', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
        }
        if (selectedDepartmentIds[0]) payload.unitId = selectedDepartmentIds[0];
        if (selectedSubUnit) payload.subUnitId = selectedSubUnit;
        if (selectedTeam) payload.teamId = selectedTeam;
        payload.assignmentScope = selectedTeam
          ? 'team'
          : selectedSubUnit
          ? 'unit'
          : selectedDepartmentIds[0]
          ? 'department'
          : 'organization';
        return apiRequest('/api/course-assignments', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      if (assignmentType === 'user' && selectedUsers.length > 0) {
        const results = await Promise.all(
          selectedUsers.map((userId) =>
            apiRequest('/api/course-assignments', {
              method: 'POST',
              body: JSON.stringify({ ...payload, userId }),
            })
          )
        );
        return results;
      } else if (assignmentType === 'unit') {
        if (selectedDepartmentIds.length > 1 && !selectedSubUnit && !selectedTeam) {
          payload.targets = selectedDepartmentIds.map((unitId) => ({
            unitId,
            assignmentScope: 'department',
          }));
          return apiRequest('/api/course-assignments', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
        }
        payload.unitId = selectedDepartmentIds[0];
        if (selectedSubUnit) {
          payload.subUnitId = selectedSubUnit;
        }
        if (selectedTeam) {
          payload.teamId = selectedTeam;
          payload.assignmentScope = 'team';
        } else if (selectedSubUnit) {
          payload.assignmentScope = 'unit';
        } else {
          payload.assignmentScope = 'department';
        }
      }

      return apiRequest('/api/course-assignments', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/course-assignments'] });
      invalidateCourseScopeCaches({ courseId, organizationId: effectiveOrgId });
      const autoPublished = result?.autoPublished === true || result?.assignments?.some?.((assignment: any) => assignment?.autoPublished === true);
      
      toast({ 
        title: autoPublished ? 'Course assigned and published!' : 'Course assigned successfully!',
        description: autoPublished
          ? `${terminology.learnerPlural} now have access to this course.`
          : `${terminology.learnerPlural} have been assigned to this course. You can publish the course when ready.`,
      });
      
      handleClose();
      onAssignmentComplete?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to assign course',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    },
  });

  const handleClose = () => {
    setCurrentStep('type');
    setAssignmentType('user');
    setSelectedUsers([]);
    setSelectedUnits([]);
    setSelectedUnit('');
    setSelectedSubUnit('');
    setSelectedTeam('');
    setSelectedTargetOrg('');
    setDueDate('');
    setDueTime('');
    setIsMandatory(true);
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
      case 'type':
        return !!assignmentType;
      case 'target':
        if (assignmentType === 'user') return selectedUsers.length > 0;
        if (assignmentType === 'unit') return selectedDepartmentIds.length > 0;
        if (assignmentType === 'crossorg') return !!selectedTargetOrg;
        return true;
      case 'due_date':
        return true;
      case 'review':
        return true;
      default:
        return false;
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const toggleUnitSelection = (unitId: string) => {
    const next = selectedUnits.includes(unitId)
      ? selectedUnits.filter((id) => id !== unitId)
      : [...selectedUnits, unitId];
    setSelectedUnits(next);
    setSelectedUnit(next.length === 1 ? next[0] : '');
    setSelectedSubUnit('');
    setSelectedTeam('');
  };

  useEffect(() => {
    if (open) {
      setCurrentStep('type');
      setAssignmentType('user');
      setSelectedUsers([]);
      setSelectedUnits([]);
      setSelectedUnit('');
      setSelectedSubUnit('');
      setSelectedTeam('');
      setSelectedTargetOrg('');
      setDueDate('');
      setDueTime('');
      setIsMandatory(true);
    }
  }, [open]);

  useEffect(() => {
    setSelectedUsers([]);
    setSelectedUnits([]);
    setSelectedUnit('');
    setSelectedSubUnit('');
    setSelectedTeam('');
    setSelectedTargetOrg('');
  }, [assignmentType]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground w-[min(95vw,48rem)] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <BookOpen className="h-5 w-5 text-primary" />
            Assign Course
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Assigning: <span className="font-medium text-foreground">{effectiveCourseTitle}</span>
            <br />
            Step {currentStepIndex + 1} of {steps.length}:{' '}
            {currentStep === 'type'
              ? 'Choose Assignment Type'
              : currentStep === 'target'
              ? 'Select Target'
              : currentStep === 'due_date'
              ? 'Set Due Date'
              : 'Review & Confirm'}
          </DialogDescription>
        </DialogHeader>

        <Progress value={progress} className="h-2" />

        <div className="py-4 sm:py-6 min-h-[250px] sm:min-h-[300px] flex-1 overflow-auto">
          {currentStep === 'type' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <Users className="h-4 w-4 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Assignment Type</h3>
                  <p className="text-sm text-muted-foreground">Who should this course be assigned to?</p>
                </div>
              </div>

              <div className="grid gap-3">
                <Card
                  className={`cursor-pointer transition-all ${
                    assignmentType === 'user'
                      ? 'bg-primary/20 border-primary'
                      : 'bg-muted/50 border-border hover:border-muted-foreground'
                  }`}
                  onClick={() => setAssignmentType('user')}
                >
                  <CardHeader className="p-4">
                    <div className="flex items-center gap-3">
                      <User className="h-5 w-5 text-primary" />
                      <div className="flex-1">
                        <CardTitle className="text-base">Specific Users</CardTitle>
                        <CardDescription>Assign to individual users</CardDescription>
                      </div>
                      {assignmentType === 'user' && <Check className="h-5 w-5 text-primary" />}
                    </div>
                  </CardHeader>
                </Card>

                <Card
                  className={`cursor-pointer transition-all ${
                    assignmentType === 'unit'
                      ? 'bg-primary/20 border-primary'
                      : 'bg-muted/50 border-border hover:border-muted-foreground'
                  }`}
                  onClick={() => setAssignmentType('unit')}
                >
                  <CardHeader className="p-4">
                    <div className="flex items-center gap-3">
                      <Users className="h-5 w-5 text-primary" />
                      <div className="flex-1">
                        <CardTitle className="text-base">{terminology.unit} / {terminology.subUnit}</CardTitle>
                        <CardDescription>
                          Assign to all members of a {terminology.unit.toLowerCase()} or {terminology.subUnit.toLowerCase()}
                        </CardDescription>
                      </div>
                      {assignmentType === 'unit' && <Check className="h-5 w-5 text-primary" />}
                    </div>
                  </CardHeader>
                </Card>

                <Card
                  className={`cursor-pointer transition-all ${
                    assignmentType === 'organization'
                      ? 'bg-primary/20 border-primary'
                      : 'bg-muted/50 border-border hover:border-muted-foreground'
                  }`}
                  onClick={() => setAssignmentType('organization')}
                >
                  <CardHeader className="p-4">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-5 w-5 text-primary" />
                      <div className="flex-1">
                        <CardTitle className="text-base">Entire Organization</CardTitle>
                        <CardDescription>Assign to everyone in the organization</CardDescription>
                      </div>
                      {assignmentType === 'organization' && <Check className="h-5 w-5 text-primary" />}
                    </div>
                  </CardHeader>
                </Card>

                {canAssignCrossOrg && (
                  <Card
                    className={`cursor-pointer transition-all ${
                      assignmentType === 'crossorg'
                        ? 'bg-primary/20 border-primary'
                        : 'bg-muted/50 border-border hover:border-muted-foreground'
                    }`}
                    onClick={() => setAssignmentType('crossorg')}
                  >
                    <CardHeader className="p-4">
                      <div className="flex items-center gap-3">
                        <Building2 className="h-5 w-5 text-primary" />
                        <div className="flex-1">
                          <CardTitle className="text-base">Another Organization</CardTitle>
                          <CardDescription>Assign this public course to users in a partner organization</CardDescription>
                        </div>
                        {assignmentType === 'crossorg' && <Check className="h-5 w-5 text-primary" />}
                      </div>
                    </CardHeader>
                  </Card>
                )}
              </div>
            </div>
          )}

          {currentStep === 'target' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  {assignmentType === 'user' ? (
                    <User className="h-4 w-4 text-primary-foreground" />
                  ) : (
                    <Users className="h-4 w-4 text-primary-foreground" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {assignmentType === 'user'
                      ? 'Select Users'
                      : assignmentType === 'unit'
                      ? `Select ${terminology.unit}`
                      : assignmentType === 'crossorg'
                      ? 'Select Target Organization'
                      : 'Confirm Organization'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {assignmentType === 'user'
                      ? 'Choose which users should receive this course'
                      : assignmentType === 'unit'
                      ? `Select the ${terminology.unit.toLowerCase()} to assign this course to`
                      : assignmentType === 'crossorg'
                      ? 'Choose the partner organization to assign this course to'
                      : 'The course will be assigned to all organization members'}
                  </p>
                </div>
              </div>

              {assignmentType === 'user' && (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2 pr-4">
                    {usersData.map((user: any) => (
                      <div
                        key={user.id}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                          selectedUsers.includes(user.id)
                            ? 'bg-primary/20 border border-primary'
                            : 'bg-muted/50 border border-border hover:border-muted-foreground'
                        }`}
                        onClick={() => toggleUserSelection(user.id)}
                      >
                        <Checkbox
                          checked={selectedUsers.includes(user.id)}
                          onCheckedChange={() => toggleUserSelection(user.id)}
                        />
                        <div className="flex-1">
                          <p className="font-medium text-foreground">{getDisplayName(user)}</p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                        {selectedUsers.includes(user.id) && <Check className="h-5 w-5 text-primary" />}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {assignmentType === 'unit' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{terminology.unitPlural || terminology.unit}</Label>
                    <ScrollArea className="max-h-[220px] rounded-lg border border-border bg-muted/30">
                      <div className="space-y-2 p-3">
                        {unitsData.map((unit: any) => (
                          <button
                            key={unit.id}
                            type="button"
                            className={`flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors ${
                              selectedDepartmentIds.includes(unit.id)
                                ? 'border-primary bg-primary/10'
                                : 'border-border bg-card hover:bg-muted/60'
                            }`}
                            onClick={() => toggleUnitSelection(unit.id)}
                          >
                            <Checkbox
                              checked={selectedDepartmentIds.includes(unit.id)}
                              onCheckedChange={() => toggleUnitSelection(unit.id)}
                              onClick={(event) => event.stopPropagation()}
                            />
                            <span className="flex-1 text-sm font-medium text-foreground">{unit.name}</span>
                            {selectedDepartmentIds.includes(unit.id) && <Check className="h-4 w-4 text-primary" />}
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                    {selectedDepartmentIds.length > 0 && (
                      <p className="text-sm text-primary">
                        {selectedDepartmentIds.length} {terminology.unit?.toLowerCase() || 'department'}{selectedDepartmentIds.length > 1 ? 's' : ''} selected
                      </p>
                    )}
                  </div>

                  {canSelectNestedScope && selectedUnit && filteredSubUnits.length > 0 && (
                    <div className="space-y-2">
                      <Label>{terminology.subUnit} (Optional)</Label>
                      <Select value={selectedSubUnit || 'all'} onValueChange={(v) => {
                        const newSubUnit = v === 'all' ? '' : v;
                        setSelectedSubUnit(newSubUnit);
                        setSelectedTeam('');
                      }}>
                        <SelectTrigger className="bg-muted border-border">
                          <SelectValue placeholder={`All ${terminology.subUnitPlural.toLowerCase()}`} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All {terminology.subUnitPlural.toLowerCase()}</SelectItem>
                          {filteredSubUnits.map((subUnit: any) => (
                            <SelectItem key={subUnit.id} value={subUnit.id}>
                              {subUnit.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {canSelectNestedScope && selectedSubUnit && teamsData.length > 0 && (
                    <div className="space-y-2">
                      <Label>{terminology.team} (Optional)</Label>
                      <Select value={selectedTeam || 'all'} onValueChange={(v) => setSelectedTeam(v === 'all' ? '' : v)}>
                        <SelectTrigger className="bg-muted border-border">
                          <SelectValue placeholder={`All ${terminology.teamPlural.toLowerCase()}`} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All {terminology.teamPlural.toLowerCase()}</SelectItem>
                          {teamsData.map((team: any) => (
                            <SelectItem key={team.id} value={team.id}>
                              {team.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {!canSelectNestedScope && selectedDepartmentIds.length > 1 && (
                    <p className="text-xs text-muted-foreground">
                      Optional {terminology.subUnit?.toLowerCase() || 'unit'} and {terminology.team?.toLowerCase() || 'team'} targeting is available when one {terminology.unit?.toLowerCase() || 'department'} is selected.
                    </p>
                  )}
                </div>
              )}

              {assignmentType === 'organization' && (
                <div className="bg-muted/50 border border-border rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-8 w-8 text-primary" />
                    <div>
                      <p className="font-medium text-foreground">Organization-Wide Assignment</p>
                      <p className="text-sm text-muted-foreground">
                        All current and future members of the organization will have access to this course.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {assignmentType === 'crossorg' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Target Organization</Label>
                    <Select
                      value={selectedTargetOrg}
                      onValueChange={(val) => {
                        setSelectedTargetOrg(val);
                        setSelectedUnits([]);
                        setSelectedUnit('');
                        setSelectedSubUnit('');
                        setSelectedTeam('');
                      }}
                    >
                      <SelectTrigger className="bg-muted border-border">
                        <SelectValue placeholder="Select target organization" />
                      </SelectTrigger>
                      <SelectContent>
                        {targetOrgsData.map((org: any) => (
                          <SelectItem key={org.id} value={org.id}>
                            {org.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedTargetOrg && targetOrgHierarchy && targetOrgHierarchy.units.length > 0 && (
                    <>
                      <div className="space-y-2">
                        <Label>{terminology.unitPlural || terminology.unit} (Optional)</Label>
                        <ScrollArea className="max-h-[220px] rounded-lg border border-border bg-muted/30">
                          <div className="space-y-2 p-3">
                            {targetOrgHierarchy.units.map((unit: any) => (
                              <button
                                key={unit.id}
                                type="button"
                                className={`flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors ${
                                  selectedDepartmentIds.includes(unit.id)
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border bg-card hover:bg-muted/60'
                                }`}
                                onClick={() => toggleUnitSelection(unit.id)}
                              >
                                <Checkbox
                                  checked={selectedDepartmentIds.includes(unit.id)}
                                  onCheckedChange={() => toggleUnitSelection(unit.id)}
                                  onClick={(event) => event.stopPropagation()}
                                />
                                <span className="flex-1 text-sm font-medium text-foreground">{unit.name}</span>
                                {selectedDepartmentIds.includes(unit.id) && <Check className="h-4 w-4 text-primary" />}
                              </button>
                            ))}
                          </div>
                        </ScrollArea>
                        {selectedDepartmentIds.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Leave blank to assign to the whole target organization.</p>
                        ) : (
                          <p className="text-sm text-primary">
                            {selectedDepartmentIds.length} {terminology.unit?.toLowerCase() || 'department'}{selectedDepartmentIds.length > 1 ? 's' : ''} selected
                          </p>
                        )}
                      </div>

                      {canSelectNestedScope && selectedUnit && (() => {
                        const selectedUnitData = targetOrgHierarchy.units.find((u: any) => u.id === selectedUnit);
                        return (selectedUnitData?.subUnits?.length ?? 0) > 0 ? (
                          <div className="space-y-2">
                            <Label>{terminology.subUnit} (Optional)</Label>
                            <Select
                              value={selectedSubUnit || 'all'}
                              onValueChange={(val) => {
                                setSelectedSubUnit(val === 'all' ? '' : val);
                                setSelectedTeam('');
                              }}
                            >
                              <SelectTrigger className="bg-muted border-border">
                                <SelectValue placeholder={`All ${terminology.subUnitPlural?.toLowerCase() || 'classes'}`} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All {terminology.subUnitPlural?.toLowerCase() || 'classes'}</SelectItem>
                                {selectedUnitData?.subUnits?.map((su: any) => (
                                  <SelectItem key={su.id} value={su.id}>{su.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null;
                      })()}

                      {canSelectNestedScope && selectedSubUnit && (() => {
                        const selectedUnitData = targetOrgHierarchy.units.find((u: any) => u.id === selectedUnit);
                        const selectedSubUnitData = selectedUnitData?.subUnits?.find((su: any) => su.id === selectedSubUnit);
                        return (selectedSubUnitData?.teams?.length ?? 0) > 0 ? (
                          <div className="space-y-2">
                            <Label>{terminology.team} (Optional)</Label>
                            <Select
                              value={selectedTeam || 'all'}
                              onValueChange={(val) => setSelectedTeam(val === 'all' ? '' : val)}
                            >
                              <SelectTrigger className="bg-muted border-border">
                                <SelectValue placeholder={`All ${terminology.teamPlural?.toLowerCase() || 'teams'}`} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All {terminology.teamPlural?.toLowerCase() || 'teams'}</SelectItem>
                                {selectedSubUnitData?.teams?.map((t: any) => (
                                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null;
                      })()}
                      {!canSelectNestedScope && selectedDepartmentIds.length > 1 && (
                        <p className="text-xs text-muted-foreground">
                          Optional {terminology.subUnit?.toLowerCase() || 'unit'} and {terminology.team?.toLowerCase() || 'team'} targeting is available when one {terminology.unit?.toLowerCase() || 'department'} is selected.
                        </p>
                      )}
                    </>
                  )}

                  {selectedTargetOrg && (!targetOrgHierarchy || targetOrgHierarchy.units.length === 0) && (
                    <div className="bg-muted/50 border border-border rounded-lg p-4">
                      <p className="text-sm text-muted-foreground">
                        This course will be assigned to all members of the selected organization.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {assignmentType === 'user' && selectedUsers.length > 0 && (
                <div className="pt-2 text-sm text-primary">
                  {selectedUsers.length} user{selectedUsers.length > 1 ? 's' : ''} selected
                </div>
              )}
            </div>
          )}

          {currentStep === 'due_date' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <Calendar className="h-4 w-4 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Due Date (Optional)</h3>
                  <p className="text-sm text-muted-foreground">Set a deadline for course completion</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="bg-muted border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Time (Optional)</Label>
                  <Input
                    type="time"
                    value={dueTime}
                    onChange={(e) => setDueTime(e.target.value)}
                    className="bg-muted border-border"
                  />
                </div>
              </div>

              <p className="text-sm text-muted-foreground mt-4">
                Leave empty if there's no specific deadline for this course.
              </p>

              <div className="border-t border-border pt-4 mt-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="mandatory"
                    checked={isMandatory}
                    onCheckedChange={(checked) => setIsMandatory(checked === true)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <label
                      htmlFor="mandatory"
                      className="text-sm font-medium text-foreground cursor-pointer"
                    >
                      This is a mandatory course
                    </label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {terminology.learnerPlural} must complete this course
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === 'review' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <Check className="h-4 w-4 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Review & Confirm</h3>
                  <p className="text-sm text-muted-foreground">Review assignment details before confirming</p>
                </div>
              </div>

              <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <span className="text-muted-foreground">Course:</span>
                  <span className="font-medium text-foreground text-right">{effectiveCourseTitle}</span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-muted-foreground">Assignment Type:</span>
                  <span className="font-medium text-foreground">
                    {assignmentType === 'user'
                      ? 'Specific Users'
                      : assignmentType === 'unit'
                      ? `${terminology.unit}/${terminology.subUnit}`
                      : assignmentType === 'crossorg'
                      ? 'Another Organization'
                      : 'Entire Organization'}
                  </span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-muted-foreground">Assigned To:</span>
                  <span className="font-medium text-foreground text-right">
                    {assignmentType === 'user'
                      ? `${selectedUsers.length} user${selectedUsers.length > 1 ? 's' : ''}`
                      : assignmentType === 'unit'
                      ? selectedDepartmentIds.length > 1
                        ? `${selectedDepartmentIds.length} ${terminology.unitPlural?.toLowerCase() || 'departments'}`
                        : unitsData.find((u: any) => u.id === selectedDepartmentIds[0])?.name +
                          (selectedSubUnit
                            ? ` → ${filteredSubUnits.find((s: any) => s.id === selectedSubUnit)?.name}`
                            : '') +
                          (selectedTeam
                            ? ` → ${teamsData.find((t: any) => t.id === selectedTeam)?.name}`
                            : '')
                      : assignmentType === 'crossorg'
                      ? targetOrgsData.find((o: any) => o.id === selectedTargetOrg)?.name +
                        (selectedDepartmentIds.length > 1
                          ? ` → ${selectedDepartmentIds.length} ${terminology.unitPlural?.toLowerCase() || 'departments'}`
                          : selectedDepartmentIds[0]
                          ? ` → ${targetOrgHierarchy?.units?.find((u: any) => u.id === selectedDepartmentIds[0])?.name || ''}`
                          : '') +
                        (selectedSubUnit ? ` → ${targetOrgHierarchy?.units?.find((u: any) => u.id === selectedUnit)?.subUnits?.find((s: any) => s.id === selectedSubUnit)?.name || ''}` : '')
                      : 'All organization members'}
                  </span>
                </div>
                {dueDate && (
                  <div className="flex justify-between items-start">
                    <span className="text-muted-foreground">Due Date:</span>
                    <span className="font-medium text-foreground">
                      {tzFormat(`${dueDate}T${dueTime || '23:59'}`, 'PPP p')}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-start">
                  <span className="text-muted-foreground">Course Status:</span>
                  <span className="font-medium text-foreground">
                    <Badge variant={isMandatory ? "default" : "secondary"}>
                      {isMandatory ? 'Mandatory' : 'Optional'}
                    </Badge>
                  </span>
                </div>
                {courseData?.status !== 'active' && (
                  <div className="flex justify-between items-start border-t border-border pt-3 mt-3">
                    <span className="text-muted-foreground">Auto-Publish:</span>
                    <span className="font-medium text-foreground">
                      <Badge variant="outline" >
                        Course will be published
                      </Badge>
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-row justify-between gap-2 pt-4 border-t">
          <Button variant="outline" onClick={currentStepIndex === 0 ? handleClose : handleBack} disabled={createAssignmentMutation.isPending} >
            {currentStepIndex === 0 ? 'Cancel' : (
              <>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </>
            )}
          </Button>

          {currentStep === 'review' ? (
            <Button onClick={() => createAssignmentMutation.mutate()}
              disabled={createAssignmentMutation.isPending}
            >
              {createAssignmentMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Assigning...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Confirm Assignment
                </>
              )}
            </Button>
          ) : (
            <Button onClick={handleNext} disabled={!canProceed()}>
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
