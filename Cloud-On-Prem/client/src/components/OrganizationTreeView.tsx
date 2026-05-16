import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronRight, 
  ChevronDown, 
  Building2, 
  GraduationCap, 
  Users, 
  BookOpen,
  Plus,
  Edit,
  FileQuestion
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';

interface OrganizationTreeViewProps {
  organizationId: string;
  onAddUnit?: (orgId: string) => void;
  onAddSubUnit?: (unitId: string) => void;
  onAddSubject?: (unitId: string) => void;
  onAssignQuiz?: (unitId: string, subUnitId?: string) => void;
  onManageStudents?: (unitId: string, subUnitId?: string) => void;
}

export function OrganizationTreeView({
  organizationId,
  onAddUnit,
  onAddSubUnit,
  onAddSubject,
  onAssignQuiz,
  onManageStudents
}: OrganizationTreeViewProps) {
  const { terminology, terminologyLower, isResolved } = useOrganizationTerminology();
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const [expandedSubUnits, setExpandedSubUnits] = useState<Set<string>>(new Set());

  const { data: organization } = useQuery<any>({
    queryKey: ['/api/admin/organizations', organizationId],
    enabled: !!organizationId,
  });

  const { data: units = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', organizationId, 'units'],
    enabled: !!organizationId,
  });

  const { data: subUnits = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', organizationId, 'sub-units'],
    enabled: !!organizationId,
  });

  const { data: subjects = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', organizationId, 'subjects'],
    enabled: !!organizationId,
  });

  const { data: assignments = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', organizationId, 'assignments'],
    enabled: !!organizationId,
  });

  if (!isResolved || !terminology || !terminologyLower) {
    return (
      <Card className="bg-card/50 border-border">
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  const toggleUnit = (unitId: string) => {
    const newExpanded = new Set(expandedUnits);
    if (newExpanded.has(unitId)) {
      newExpanded.delete(unitId);
    } else {
      newExpanded.add(unitId);
    }
    setExpandedUnits(newExpanded);
  };

  const toggleSubUnit = (subUnitId: string) => {
    const newExpanded = new Set(expandedSubUnits);
    if (newExpanded.has(subUnitId)) {
      newExpanded.delete(subUnitId);
    } else {
      newExpanded.add(subUnitId);
    }
    setExpandedSubUnits(newExpanded);
  };

  const getStudentCount = (unitId: string, subUnitId?: string) => {
    return assignments.filter((a: any) => {
      if (subUnitId) return a.subUnitId === subUnitId;
      return a.unitId === unitId && !a.subUnitId;
    }).length;
  };

  const getSubjectCount = (unitId: string) => {
    return subjects.filter((s: any) => s.unitId === unitId).length;
  };

  if (!organization) {
    return (
      <Card className="bg-card/50 border-border">
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">Loading organization...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 border-border">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          Organization Structure
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Organization Root */}
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg" data-testid="org-root">
            <div className="flex items-center gap-3 flex-1">
              <Building2 className="h-5 w-5 text-primary" />
              <div>
                <div className="text-foreground font-semibold">{organization.name}</div>
                <div className="text-xs text-muted-foreground">{organization.type}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" >
                {units.length} {units.length === 1 ? terminology.unit : terminology.unitPlural}
              </Badge>
              {onAddUnit && (
                <Button size="sm" onClick={() => onAddUnit(organizationId)}
                  className="bg-primary hover:bg-primary/90"
                  data-testid="button-add-unit"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Units/Grades */}
          <div className="ml-6 space-y-2">
            {units.map((unit: any) => {
              const isExpanded = expandedUnits.has(unit.id);
              const unitSubUnits = subUnits.filter((su: any) => su.unitId === unit.id);
              const unitSubjects = subjects.filter((s: any) => s.unitId === unit.id);
              
              return (
                <div key={unit.id} className="space-y-2" data-testid={`unit-${unit.id}`}>
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3 flex-1">
                      <button
                        onClick={() => toggleUnit(unit.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        data-testid={`toggle-unit-${unit.id}`}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                      <GraduationCap className="h-5 w-5 text-secondary" />
                      <div>
                        <div className="text-foreground font-medium">{unit.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-3">
                          <span>{unitSubUnits.length} {terminologyLower.subUnitPlural}</span>
                          <span>{unitSubjects.length} {terminologyLower.subjectPlural}</span>
                          <span>{getStudentCount(unit.id)} {terminologyLower.learnerPlural}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {onAddSubUnit && (
                        <Button size="sm" variant="outline" onClick={() => onAddSubUnit(unit.id)}
                          className="text-secondary border-secondary hover:bg-secondary/10"
                          data-testid={`button-add-subunit-${unit.id}`}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          {terminology.subUnit}
                        </Button>
                      )}
                      {onAddSubject && (
                        <Button size="sm" variant="outline" onClick={() => onAddSubject(unit.id)}
                          className="text-primary border-primary hover:bg-primary/10"
                          data-testid={`button-add-subject-${unit.id}`}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          {terminology.subject}
                        </Button>
                      )}
                      {onManageStudents && (
                        <Button size="sm" variant="outline" onClick={() => onManageStudents(unit.id)}
                          className="text-primary border-primary hover:bg-primary/10"
                          data-testid={`button-manage-students-${unit.id}`}
                        >
                          <Users className="h-3 w-3 mr-1" />
                          {terminology.learnerPlural}
                        </Button>
                      )}
                      {onAssignQuiz && (
                        <Button size="sm" variant="outline" onClick={() => onAssignQuiz(unit.id)}
                          className="text-warning border-[var(--warning)]/50 hover:bg-warning/10"
                          data-testid={`button-assign-quiz-${unit.id}`}
                        >
                          <FileQuestion className="h-3 w-3 mr-1" />
                          Quiz
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Sub-units/Classes */}
                  {isExpanded && unitSubUnits.length > 0 && (
                    <div className="ml-8 space-y-2">
                      {unitSubUnits.map((subUnit: any) => {
                        const isSubExpanded = expandedSubUnits.has(subUnit.id);
                        
                        return (
                          <div key={subUnit.id} className="space-y-2" data-testid={`subunit-${subUnit.id}`}>
                            <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg hover:bg-muted/40 transition-colors">
                              <div className="flex items-center gap-3 flex-1">
                                <button
                                  onClick={() => toggleSubUnit(subUnit.id)}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                  data-testid={`toggle-subunit-${subUnit.id}`}
                                >
                                  {isSubExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </button>
                                <Users className="h-4 w-4 text-secondary" />
                                <div>
                                  <div className="text-foreground text-sm font-medium">{subUnit.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {getStudentCount(unit.id, subUnit.id)} {terminologyLower.learnerPlural}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {onManageStudents && (
                                  <Button size="sm" variant="outline" onClick={() => onManageStudents(unit.id, subUnit.id)}
                                    className="text-primary border-primary hover:bg-primary/10"
                                    data-testid={`button-manage-students-${subUnit.id}`}
                                  >
                                    <Users className="h-3 w-3 mr-1" />
                                    {terminology.learnerPlural}
                                  </Button>
                                )}
                                {onAssignQuiz && (
                                  <Button size="sm" variant="outline" onClick={() => onAssignQuiz(unit.id, subUnit.id)}
                                    className="text-warning border-[var(--warning)]/50 hover:bg-warning/10"
                                    data-testid={`button-assign-quiz-${subUnit.id}`}
                                  >
                                    <FileQuestion className="h-3 w-3 mr-1" />
                                    Quiz
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Subjects */}
                  {isExpanded && unitSubjects.length > 0 && (
                    <div className="ml-8 space-y-2">
                      <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider px-3">{terminology.subjectPlural}</div>
                      {unitSubjects.map((subject: any) => (
                        <div key={subject.id} className="flex items-center justify-between p-2 bg-muted/20 rounded-lg" data-testid={`subject-${subject.id}`}>
                          <div className="flex items-center gap-3">
                            <BookOpen className="h-4 w-4 text-primary" />
                            <div className="text-foreground text-sm">{subject.name}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {units.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <p>No {terminologyLower.unitPlural} created yet</p>
                {onAddUnit && (
                  <Button onClick={() => onAddUnit(organizationId)}
                    className="mt-3 bg-primary hover:bg-primary/90"
                    size="sm"
                    data-testid="button-add-first-unit"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add First {terminology.unit}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
