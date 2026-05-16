import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, BookOpen, Users, FileQuestion, Trash2, Edit, Search, CheckSquare, Square } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';

export default function GradesManager() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedOrganization, setSelectedOrganization] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [showCreateSubject, setShowCreateSubject] = useState(false);
  const [showEditSubject, setShowEditSubject] = useState(false);
  const [editingSubject, setEditingSubject] = useState<any>(null);
  const [showCreateCollection, setShowCreateCollection] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [showAssignSubjectDialog, setShowAssignSubjectDialog] = useState(false);
  const [subjectToAssign, setSubjectToAssign] = useState('');
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [bulkAssignUnit, setBulkAssignUnit] = useState('');
  const [bulkAssignSubUnit, setBulkAssignSubUnit] = useState('');

  // Subject form state
  const [subjectName, setSubjectName] = useState('');
  const [subjectDescription, setSubjectDescription] = useState('');

  // Collection form state
  const [collectionName, setCollectionName] = useState('');
  const [collectionDescription, setCollectionDescription] = useState('');

  const { terminology, terminologyLower, isResolved } = useOrganizationTerminology();

  // Show loading state until terminology is resolved
  if (!isResolved || !terminology) {
    return (
      <QuizAdminLayout title="Structure Manager" description="Loading..." activeSection="grades">
        <div className="flex items-center justify-center h-64">
          <div className="text-foreground">Loading organization settings...</div>
        </div>
      </QuizAdminLayout>
    );
  }

  // Fetch user info to check if SuperAdmin
  const { data: userInfo } = useQuery<any>({
    queryKey: ['/api/auth/user'],
  });

  // Fetch user's organizations
  const { data: userRoles = [] } = useQuery<any[]>({
    queryKey: ['/api/user/roles'],
  });

  // Check if user is SuperAdmin
  const isSuperAdmin = userInfo?.isSuperAdmin === true;

  // Fetch organizations for SuperAdmin only
  const { data: organizations = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations'],
    enabled: isSuperAdmin,
  });

  // Auto-select organization
  useEffect(() => {
    if (!selectedOrganization) {
      if (isSuperAdmin && organizations.length > 0) {
        // SuperAdmins: use first organization from the list
        setSelectedOrganization(organizations[0].id);
      } else if (!isSuperAdmin && userRoles.length > 0) {
        // Non-SuperAdmins: use their assigned organization
        setSelectedOrganization(userRoles[0].organizationId);
      }
    }
  }, [isSuperAdmin, organizations, userRoles, selectedOrganization]);

  // Fetch units for selected organization
  const { data: units = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', selectedOrganization, 'units'],
    enabled: !!selectedOrganization,
  });

  // Fetch ALL sub-units for the organization (not just selected unit)
  const { data: allSubUnitsData = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', selectedOrganization, 'all-sub-units'],
    queryFn: async () => {
      if (!selectedOrganization) return [];
      const response = await fetch(`/api/admin/organizations/${selectedOrganization}/sub-units`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch sub-units');
      return response.json();
    },
    enabled: !!selectedOrganization,
  });
  
  // For backwards compatibility, keep subUnits filtered by selected unit for other parts of the page
  const subUnits = selectedUnit 
    ? allSubUnitsData.filter((su: any) => su.unitId === selectedUnit)
    : allSubUnitsData;

  // Fetch subjects
  const { data: subjects = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/subjects', selectedOrganization, selectedUnit || null],
    queryFn: async () => {
      const params = new URLSearchParams({ organizationId: selectedOrganization });
      if (selectedUnit) params.append('unitId', selectedUnit);
      const response = await fetch(`/api/admin/subjects?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch subjects');
      return response.json();
    },
    enabled: !!selectedOrganization,
  });

  // Fetch quiz collections
  const { data: quizCollections = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/quiz-collections', selectedOrganization],
    queryFn: async () => {
      const response = await fetch(`/api/admin/quiz-collections?organizationId=${selectedOrganization}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch collections');
      return response.json();
    },
    enabled: !!selectedOrganization,
  });

  // Fetch users in organization
  const { data: orgUsers = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', selectedOrganization, 'users'],
    queryFn: async () => {
      const response = await fetch(`/api/admin/organizations/${selectedOrganization}/users`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch users');
      return response.json();
    },
    enabled: !!selectedOrganization,
  });

  // Fetch unit subjects (subjects assigned to a specific grade)
  const { data: unitSubjects = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/units', selectedUnit, 'subjects'],
    queryFn: async () => {
      if (!selectedUnit) return [];
      const response = await fetch(`/api/admin/units/${selectedUnit}/subjects`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch unit subjects');
      return response.json();
    },
    enabled: !!selectedUnit,
  });

  // Create subject mutation
  const createSubjectMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('/api/admin/subjects', { method: 'POST', body: JSON.stringify(data) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/subjects', selectedOrganization] });
      toast({ title: `${terminology!.subject} created successfully!` });
      setShowCreateSubject(false);
      setSubjectName('');
      setSubjectDescription('');
    },
    onError: () => {
      toast({ title: `Failed to create ${terminologyLower!.subject}`, variant: 'destructive' });
    },
  });

  // Create quiz collection mutation
  const createCollectionMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('/api/admin/quiz-collections', { method: 'POST', body: JSON.stringify(data) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/quiz-collections', selectedOrganization] });
      toast({ title: 'Quiz collection created successfully!' });
      setShowCreateCollection(false);
      setCollectionName('');
      setCollectionDescription('');
    },
    onError: () => {
      toast({ title: 'Failed to create quiz collection', variant: 'destructive' });
    },
  });

  // Update subject mutation
  const updateSubjectMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest(`/api/admin/subjects/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/subjects', selectedOrganization] });
      toast({ title: `${terminology!.subject} updated successfully!` });
      setShowEditSubject(false);
      setEditingSubject(null);
      setSubjectName('');
      setSubjectDescription('');
    },
    onError: () => {
      toast({ title: `Failed to update ${terminologyLower!.subject}`, variant: 'destructive' });
    },
  });

  // Delete subject mutation
  const deleteSubjectMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/subjects/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/subjects', selectedOrganization] });
      toast({ title: `${terminology!.subject} deleted successfully!` });
    },
    onError: () => {
      toast({ title: `Failed to delete ${terminologyLower!.subject}`, variant: 'destructive' });
    },
  });

  // Assign user to unit mutation
  const assignUserMutation = useMutation({
    mutationFn: async ({ userId, organizationId, unitId, subUnitId }: any) => {
      return await apiRequest(`/api/admin/organizations/${organizationId}/users/${userId}/assignments`, { 
        method: 'POST', 
        body: JSON.stringify({ unitId, subUnitId }) 
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', variables.organizationId, 'users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', variables.organizationId, 'all-sub-units'] });
      toast({ title: 'User assigned successfully!' });
    },
    onError: () => {
      toast({ title: 'Failed to assign user', variant: 'destructive' });
    },
  });

  // Bulk assign users mutation
  const bulkAssignMutation = useMutation({
    mutationFn: async ({ userIds, organizationId, unitId, subUnitId }: any) => {
      const promises = userIds.map((userId: string) => 
        apiRequest(`/api/admin/organizations/${organizationId}/users/${userId}/assignments`, { 
          method: 'POST', 
          body: JSON.stringify({ unitId, subUnitId }) 
        })
      );
      return await Promise.all(promises);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', variables.organizationId, 'users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', variables.organizationId, 'all-sub-units'] });
      toast({ title: `Successfully assigned ${variables.userIds.length} ${variables.userIds.length === 1 ? terminologyLower!.learner : terminologyLower!.learnerPlural}!` });
      setSelectedStudents([]);
      setBulkAssignUnit('');
      setBulkAssignSubUnit('');
    },
    onError: () => {
      toast({ title: 'Failed to bulk assign users', variant: 'destructive' });
    },
  });

  // Assign subject to unit mutation
  const assignSubjectToUnitMutation = useMutation({
    mutationFn: async ({ unitId, subjectId }: { unitId: string, subjectId: string }) => {
      return await apiRequest(`/api/admin/units/${unitId}/subjects/${subjectId}`, { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/units', selectedUnit, 'subjects'] });
      toast({ title: `${terminology!.subject} assigned to ${terminologyLower!.unit} successfully!` });
      setShowAssignSubjectDialog(false);
      setSubjectToAssign('');
    },
    onError: () => {
      toast({ title: `Failed to assign ${terminologyLower!.subject} to ${terminologyLower!.unit}`, variant: 'destructive' });
    },
  });

  // Unassign subject from unit mutation
  const unassignSubjectFromUnitMutation = useMutation({
    mutationFn: async ({ unitId, subjectId }: { unitId: string, subjectId: string }) => {
      return await apiRequest(`/api/admin/units/${unitId}/subjects/${subjectId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/units', selectedUnit, 'subjects'] });
      toast({ title: `${terminology!.subject} removed from ${terminologyLower!.unit} successfully!` });
    },
    onError: () => {
      toast({ title: `Failed to remove ${terminologyLower!.subject} from ${terminologyLower!.unit}`, variant: 'destructive' });
    },
  });

  const handleCreateSubject = () => {
    if (!subjectName || !selectedOrganization) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }

    createSubjectMutation.mutate({
      name: subjectName,
      description: subjectDescription,
      organizationId: selectedOrganization,
      unitId: selectedUnit || null,
    });
  };

  const handleEditSubject = (subject: any) => {
    setEditingSubject(subject);
    setSubjectName(subject.name);
    setSubjectDescription(subject.description || '');
    setShowEditSubject(true);
  };

  const handleUpdateSubject = () => {
    if (!subjectName || !editingSubject) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }

    updateSubjectMutation.mutate({
      id: editingSubject.id,
      data: {
        name: subjectName,
        description: subjectDescription,
      },
    });
  };

  const handleCreateCollection = () => {
    if (!collectionName || !selectedOrganization || !selectedSubject) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }

    createCollectionMutation.mutate({
      name: collectionName,
      description: collectionDescription,
      organizationId: selectedOrganization,
      subjectId: selectedSubject,
    });
  };

  // Filter collections by selected subject
  const filteredCollections = selectedSubject
    ? quizCollections.filter((c: any) => c.subjectId === selectedSubject)
    : quizCollections;

  return (
    <QuizAdminLayout
      title={`${terminology!.unitPlural} & ${terminology!.subjectPlural}`}
      description={`Manage ${terminologyLower!.subUnitPlural}, ${terminologyLower!.subjectPlural}, and quiz collections`}
      activeSection="grades"
    >
      <div className="space-y-[var(--space-lg)] p-[var(--container-padding)]">
        {/* Organization & Unit Selection */}
        <Card className="bg-card border-border">
          <CardHeader className="p-[var(--card-padding)]">
            <CardTitle className="text-foreground text-[length:var(--text-xl)]">Select Organization & {terminology!.unit}</CardTitle>
            <CardDescription className="text-muted-foreground text-[length:var(--text-sm)]">Choose your organization and {terminologyLower!.unit} level to manage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-[var(--space-md)] p-[var(--card-padding)]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--space-md)]">
              {isSuperAdmin && (
                <div className="space-y-2">
                  <Label htmlFor="organization">Organization</Label>
                  <Select value={selectedOrganization} onValueChange={setSelectedOrganization}>
                    <SelectTrigger id="organization" data-testid="select-organization" className="min-h-[44px] touch-manipulation">
                      <SelectValue placeholder="Select organization" />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations.map((org: any) => (
                        <SelectItem key={org.id} value={org.id} className="min-h-[44px]">
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!isSuperAdmin && organizations.length > 0 && (
                <div className="space-y-2">
                  <Label>Organization</Label>
                  <div className="text-lg font-semibold text-foreground">
                    {organizations[0]?.name}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="unit">{terminology!.unit} (Optional)</Label>
                <Select value={selectedUnit || "all"} onValueChange={(val) => setSelectedUnit(val === "all" ? "" : val)} disabled={isSuperAdmin && !selectedOrganization}>
                  <SelectTrigger id="unit" data-testid="select-unit" className="min-h-[44px] touch-manipulation">
                    <SelectValue placeholder={`All ${terminologyLower!.unitPlural}`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="min-h-[44px]">All {terminology!.unitPlural}</SelectItem>
                    {units.map((unit: any) => (
                      <SelectItem key={unit.id} value={unit.id} className="min-h-[44px]">
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {selectedOrganization && (
          <Tabs defaultValue="subjects" className="space-y-[var(--space-lg)]">
            <TabsList className="w-full flex-wrap">
              <TabsTrigger value="subjects" data-testid="tab-subjects" className="min-h-[44px] touch-manipulation">
                <BookOpen className="w-4 h-4 mr-2" />
                {terminology!.subjectPlural}
              </TabsTrigger>
            </TabsList>

            {/* Subjects Tab */}
            <TabsContent value="subjects" className="space-y-[var(--space-lg)]">
              {/* Unit-Specific Subject Assignments */}
              {selectedUnit && (
                <Card className="bg-card border-border">
                  <CardHeader className="p-[var(--card-padding)]">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-[var(--space-md)]">
                      <div>
                        <CardTitle className="text-foreground text-[length:var(--text-xl)]">{terminology!.subjectPlural} for {units.find((u: any) => u.id === selectedUnit)?.name}</CardTitle>
                        <CardDescription className="text-muted-foreground text-[length:var(--text-sm)]">
                          Manage which {terminologyLower!.subjectPlural} are available in this {terminologyLower!.unit}
                        </CardDescription>
                      </div>
                      <Button onClick={() => setShowAssignSubjectDialog(true)}
                        className="bg-primary hover:bg-primary/90 min-h-[44px] touch-manipulation w-full sm:w-auto"
                        data-testid="button-assign-subject-to-grade"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Assign {terminology!.subject}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-[var(--card-padding)]">
                    {unitSubjects.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--space-md)]">
                        {unitSubjects.map((us: any) => (
                          <div
                            key={us.id}
                            className="flex items-center justify-between p-[var(--card-padding)] bg-muted rounded-lg border border-border"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-foreground truncate">{us.subjectName}</div>
                              <div className="text-[length:var(--text-sm)] text-muted-foreground truncate">{us.subjectDescription || 'No description'}</div>
                            </div>
                            <Button variant="ghost" size="sm" className="min-h-[44px] min-w-[44px] touch-manipulation ml-2 flex-shrink-0" onClick={() => {
                                if (confirm(`Remove this subject from this ${terminologyLower!.unit}?`)) {
                                  unassignSubjectFromUnitMutation.mutate({
                                    unitId: selectedUnit,
                                    subjectId: us.subjectId
                                  });
                                }
                              }}
                              data-testid={`button-unassign-subject-${us.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-[var(--space-xl)]">
                        <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-muted-foreground">No {terminologyLower!.subjectPlural} assigned to this {terminologyLower!.unit} yet.</p>
                        <p className="text-[length:var(--text-sm)] text-muted-foreground mt-2">
                          Click "Assign {terminology!.subject}" to add {terminologyLower!.subjectPlural} to this {terminologyLower!.unit}.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* All Subjects */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-[var(--space-md)] mb-[var(--space-md)]">
                  <h3 className="text-[length:var(--text-lg)] font-semibold text-foreground">All {terminology!.subjectPlural}</h3>
                  <Button onClick={() => setShowCreateSubject(true)} data-testid="button-create-subject" className="min-h-[44px] touch-manipulation w-full sm:w-auto">
                    <Plus className="mr-2 h-4 w-4" />
                    Create {terminology!.subject}
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--space-md)]">
                  {subjects.map((subject: any) => (
                    <Card key={subject.id} className="hover:shadow-elevated transition-shadow bg-muted border-border">
                      <CardHeader className="p-[var(--card-padding)]">
                        <CardTitle className="text-[length:var(--text-lg)] text-foreground">{subject.name}</CardTitle>
                        <CardDescription className="text-muted-foreground text-[length:var(--text-sm)]">{subject.description || 'No description'}</CardDescription>
                      </CardHeader>
                      <CardContent className="p-[var(--card-padding)] pt-0">
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" className="min-h-[44px] min-w-[44px] touch-manipulation" onClick={() => handleEditSubject(subject)}
                            data-testid={`button-edit-subject-${subject.id}`}
                          >
                            <Edit className="h-4 w-4 text-primary" />
                          </Button>
                          <Button variant="ghost" size="sm" className="min-h-[44px] min-w-[44px] touch-manipulation" onClick={() => {
                              if (confirm(`Are you sure you want to delete this ${terminologyLower!.subject}?`)) {
                                deleteSubjectMutation.mutate(subject.id);
                              }
                            }}
                            data-testid={`button-delete-subject-${subject.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {subjects.length === 0 && (
                    <Card className="col-span-full">
                      <CardContent className="py-[var(--space-2xl)] text-center p-[var(--card-padding)]">
                        <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-[length:var(--text-lg)] font-semibold text-foreground mb-2">
                          No {terminologyLower!.subjectPlural} yet
                        </h3>
                        <p className="text-muted-foreground mb-4 text-[length:var(--text-base)]">
                          Create your first {terminologyLower!.subject} to organize quiz collections
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Create Subject Dialog */}
      <Dialog open={showCreateSubject} onOpenChange={setShowCreateSubject}>
        <DialogContent className="p-[var(--dialog-padding)] max-h-[var(--dialog-max-height)] overflow-y-auto w-[calc(100%-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[length:var(--text-xl)]">Create New {terminology!.subject}</DialogTitle>
            <DialogDescription className="text-[length:var(--text-sm)]">
              Add a new {terminologyLower!.subject} like Math, Science, History, etc.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-[var(--space-md)]">
            <div className="space-y-2">
              <Label htmlFor="subject-name">{terminology!.subject} Name *</Label>
              <Input
                id="subject-name"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                placeholder="e.g., Mathematics, Science, History"
                data-testid="input-subject-name"
                className="min-h-[44px] touch-manipulation"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject-description">Description</Label>
              <Textarea
                id="subject-description"
                value={subjectDescription}
                onChange={(e) => setSubjectDescription(e.target.value)}
                placeholder={`Optional description for this ${terminologyLower!.subject}`}
                rows={3}
                data-testid="input-subject-description"
                className="touch-manipulation"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
              <Button variant="outline" onClick={() => setShowCreateSubject(false)}
                data-testid="button-cancel-subject"
                className="min-h-[44px] touch-manipulation w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button onClick={handleCreateSubject} disabled={createSubjectMutation.isPending} data-testid="button-save-subject" className="min-h-[44px] touch-manipulation w-full sm:w-auto" >
                {createSubjectMutation.isPending ? 'Creating...' : `Create ${terminology!.subject}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Subject Dialog */}
      <Dialog open={showEditSubject} onOpenChange={(open) => {
        setShowEditSubject(open);
        if (!open) {
          setEditingSubject(null);
          setSubjectName('');
          setSubjectDescription('');
        }
      }}>
        <DialogContent className="p-[var(--dialog-padding)] max-h-[var(--dialog-max-height)] overflow-y-auto w-[calc(100%-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[length:var(--text-xl)]">Edit {terminology!.subject}</DialogTitle>
            <DialogDescription className="text-[length:var(--text-sm)]">
              Update the {terminologyLower!.subject} details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-[var(--space-md)]">
            <div className="space-y-2">
              <Label htmlFor="edit-subject-name">{terminology!.subject} Name *</Label>
              <Input
                id="edit-subject-name"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                placeholder="e.g., Mathematics, Science, History"
                data-testid="input-edit-subject-name"
                className="min-h-[44px] touch-manipulation"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-subject-description">Description</Label>
              <Textarea
                id="edit-subject-description"
                value={subjectDescription}
                onChange={(e) => setSubjectDescription(e.target.value)}
                placeholder={`Optional description for this ${terminologyLower!.subject}`}
                rows={3}
                data-testid="input-edit-subject-description"
                className="touch-manipulation"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
              <Button variant="outline" onClick={() => setShowEditSubject(false)}
                data-testid="button-cancel-edit-subject"
                className="min-h-[44px] touch-manipulation w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button onClick={handleUpdateSubject} disabled={updateSubjectMutation.isPending} data-testid="button-update-subject" className="min-h-[44px] touch-manipulation w-full sm:w-auto" >
                {updateSubjectMutation.isPending ? 'Updating...' : `Update ${terminology!.subject}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Quiz Collection Dialog */}
      <Dialog open={showCreateCollection} onOpenChange={setShowCreateCollection}>
        <DialogContent className="p-[var(--dialog-padding)] max-h-[var(--dialog-max-height)] overflow-y-auto w-[calc(100%-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[length:var(--text-xl)]">Create Quiz Collection</DialogTitle>
            <DialogDescription className="text-[length:var(--text-sm)]">
              Create a new quiz collection for a {terminologyLower!.subject}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-[var(--space-md)]">
            <div className="space-y-2">
              <Label htmlFor="collection-subject">{terminology!.subject} *</Label>
              <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                <SelectTrigger id="collection-subject" data-testid="select-collection-subject" className="min-h-[44px] touch-manipulation">
                  <SelectValue placeholder={`Select ${terminologyLower!.subject}`} />
                </SelectTrigger>
                <SelectContent>
                  {subjects.length > 0 ? (
                    subjects.map((subject: any) => (
                      <SelectItem key={subject.id} value={subject.id} className="min-h-[44px]">
                        {subject.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-subjects" disabled className="min-h-[44px]">No {terminologyLower!.subjectPlural} available</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="collection-name">Collection Name *</Label>
              <Input
                id="collection-name"
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
                placeholder="e.g., Chapter 1: Algebra Basics"
                data-testid="input-collection-name"
                className="min-h-[44px] touch-manipulation"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="collection-description">Description</Label>
              <Textarea
                id="collection-description"
                value={collectionDescription}
                onChange={(e) => setCollectionDescription(e.target.value)}
                placeholder="Optional description for this collection"
                rows={3}
                data-testid="input-collection-description"
                className="touch-manipulation"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
              <Button variant="outline" onClick={() => setShowCreateCollection(false)}
                data-testid="button-cancel-collection"
                className="min-h-[44px] touch-manipulation w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button onClick={handleCreateCollection} disabled={createCollectionMutation.isPending} data-testid="button-save-collection" className="min-h-[44px] touch-manipulation w-full sm:w-auto" >
                {createCollectionMutation.isPending ? 'Creating...' : 'Create Collection'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign terminology-specific subject to unit dialog */}
      <Dialog open={showAssignSubjectDialog} onOpenChange={setShowAssignSubjectDialog}>
        <DialogContent className="p-[var(--dialog-padding)] max-h-[var(--dialog-max-height)] overflow-y-auto w-[calc(100%-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[length:var(--text-xl)]">Assign {terminology!.subject} to {terminology!.unit}</DialogTitle>
            <DialogDescription className="text-[length:var(--text-sm)]">
              Choose a {terminologyLower!.subject} to assign to {units.find((u: any) => u.id === selectedUnit)?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-[var(--space-md)]">
            <div className="space-y-2">
              <Label htmlFor="assign-subject">{terminology!.subject} *</Label>
              <Select value={subjectToAssign} onValueChange={setSubjectToAssign}>
                <SelectTrigger id="assign-subject" data-testid="select-assign-subject" className="min-h-[44px] touch-manipulation">
                  <SelectValue placeholder={`Select ${terminologyLower!.subject}`} />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const availableSubjects = subjects.filter((s: any) => !unitSubjects.some((us: any) => us.subjectId === s.id));
                    return availableSubjects.length > 0 ? (
                      availableSubjects.map((subject: any) => (
                        <SelectItem key={subject.id} value={subject.id} className="min-h-[44px]">
                          {subject.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-subjects" disabled className="min-h-[44px]">All {terminologyLower!.subjectPlural} already assigned</SelectItem>
                    );
                  })()}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
              <Button variant="outline" onClick={() => setShowAssignSubjectDialog(false)}
                data-testid="button-cancel-assign-subject"
                className="min-h-[44px] touch-manipulation w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button onClick={() => {
                  if (subjectToAssign && selectedUnit) {
                    assignSubjectToUnitMutation.mutate({ unitId: selectedUnit, subjectId: subjectToAssign });
                  }
                }}
                disabled={!subjectToAssign || assignSubjectToUnitMutation.isPending}
                data-testid="button-save-assign-subject"
                className="min-h-[44px] touch-manipulation w-full sm:w-auto"
              >
                {assignSubjectToUnitMutation.isPending ? 'Assigning...' : `Assign ${terminology!.subject}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </QuizAdminLayout>
  );
}
