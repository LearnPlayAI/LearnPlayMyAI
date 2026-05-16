import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocation, useRoute, Link } from 'wouter';
import { ArrowLeft, Save, Loader2, Image as ImageIcon, Trash2, BookOpen, Eye, Send, FileText, Settings, ChevronRight, Upload, Globe, Lock, Building2, Sparkles, Coins, Users, AlertCircle, Calendar as CalendarIcon, Clock, Plus, Tag, ChevronsUpDown, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePlatformMode } from '@/hooks/usePlatformMode';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectGroup, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';

import { queryClient, apiRequest, invalidateWalletCaches, invalidateCourseScopeCaches } from '@/lib/queryClient';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { ObjectUploader } from '@/components/ObjectUploader';
import { useWalletBalance, useHybridBalance } from '@/hooks/useWallet';
import { LP_CREDITS_SHORT } from '@shared/creditConstants';
import { LPCreditIcon } from '@/components/LPCreditIcon';
import { tzFormat } from '@/utils/timezoneRuntime';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';

// Inline replacements for modal/dialog primitives on this page.
const Dialog = ({ open, children }: any) => (open ? <div className="space-y-4">{children}</div> : null);
const AlertDialog = ({ open, children }: any) => (open ? <div className="space-y-4">{children}</div> : null);
const DialogContent = ({ className, children }: { className?: string; children: any }) => <Card className={className}>{children}</Card>;
const AlertDialogContent = ({ className, children }: { className?: string; children: any }) => <Card className={className}>{children}</Card>;
const DialogHeader = ({ className, children }: { className?: string; children: any }) => <CardHeader className={className}>{children}</CardHeader>;
const AlertDialogHeader = ({ className, children }: { className?: string; children: any }) => <CardHeader className={className}>{children}</CardHeader>;
const DialogTitle = ({ className, children }: { className?: string; children: any }) => <CardTitle className={className}>{children}</CardTitle>;
const AlertDialogTitle = ({ className, children }: { className?: string; children: any }) => <CardTitle className={className}>{children}</CardTitle>;
const DialogDescription = ({ className, children }: { className?: string; children: any }) => <CardDescription className={className}>{children}</CardDescription>;
const AlertDialogDescription = ({ className, children }: { className?: string; children: any }) => <CardDescription className={className}>{children}</CardDescription>;
const DialogFooter = ({ className, children }: { className?: string; children: any }) => <CardContent className={className}>{children}</CardContent>;
const AlertDialogFooter = ({ className, children }: { className?: string; children: any }) => <CardContent className={className}>{children}</CardContent>;
const AlertDialogCancel = ({ className, children, ...props }: any) => (
  <Button variant="outline" className={className} {...props}>
    {children}
  </Button>
);
const AlertDialogAction = ({ className, children, ...props }: any) => (
  <Button className={className} {...props}>
    {children}
  </Button>
);

interface OrgWalletBalanceResponse {
  organizationId: string;
  organizationName: string;
  balance: number;
  isEnabled: boolean;
  allowTeachersToSpendCredits: boolean;
}

type CreateCategoryInlineCardProps = {
  source: 'settings' | 'wizard';
  show: boolean;
  name: string;
  isPending: boolean;
  onNameChange: (value: string) => void;
  onCancel: () => void;
  onCreate: () => void;
};

function CreateCategoryInlineCard({
  source,
  show,
  name,
  isPending,
  onNameChange,
  onCancel,
  onCreate,
}: CreateCategoryInlineCardProps) {
  if (!show) return null;

  return (
    <Card className="border-primary/30 bg-muted/20" data-testid={`create-category-inline-${source}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Tag className="h-5 w-5 text-primary" />
          Create New Category
        </CardTitle>
        <CardDescription>Enter a name for your new course category.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`newCategoryName-${source}`}>Category Name</Label>
          <Input
            id={`newCategoryName-${source}`}
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g., Marketing, Leadership, Technology"
            className="bg-input border-border text-foreground"
            data-testid={`input-new-category-name-${source}`}
          />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onCancel} data-testid={`button-cancel-create-category-${source}`}>
            Cancel
          </Button>
          <Button
            onClick={onCreate}
            disabled={!name.trim() || isPending}
            data-testid={`button-confirm-create-category-${source}`}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Create Category
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface Course {
  id: string;
  title: string;
  description: string;
  difficultyLevel: string;
  currency: string;
  price: string;
  isPaid: boolean;
  visibility: 'public' | 'org_only';
  organizationId: string;
  categoryId?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  thumbnailSignedUrl?: string;
  thumbnailSource?: 'upload' | 'ai';
  status: 'draft' | 'active' | 'inactive' | 'archived';
  publishedAt?: string;
  createdAt: string;
  totalEnrollments: number;
  averageRating: string;
  totalReviews: number;
  languageCode?: string;
  contentGroupId?: string;
}

interface CategoryItem {
  id: string;
  name: string;
  type: string;
  group?: string;
}

interface ThumbnailPricing {
  creditCost: number;
  isOrgOverride: boolean;
  featureEnabled: boolean;
}

interface ThumbnailGenerationResponse {
  thumbnailUrl: string;
  thumbnailSignedUrl?: string;
  creditsCharged: number;
  generatedAt: string;
  source: 'ai';
}

interface CourseFramework {
  id: string;
  courseId: string;
  topics: Array<{
    id: string;
    order: number;
    name: string;
    lessonId: string | null;
  }>;
}

interface CourseAssignment {
  id: string;
  courseId: string;
  organizationId: string;
  assignedBy: string;
  assignmentScope: string;
  userId: string | null;
  unitId: string | null;
  subUnitId: string | null;
  teamId: string | null;
  audience: string;
  mandatory: boolean;
  dueDate: string | null;
  assignedAt: string;
  createdAt: string;
}

interface PublishValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  lessonDetails: Array<{
    lessonId: string;
    lessonTitle: string;
    topicOrder: number;
    lessonType: string;
    generationStatus: string;
    hasQuiz: boolean;
    requiresQuiz: boolean;
  }>;
}

function getAssignmentScopePriority(assignment: CourseAssignment): number {
  if (assignment.assignmentScope === 'organization' || (!assignment.unitId && !assignment.subUnitId && !assignment.teamId && !assignment.userId)) {
    return 1;
  }
  if (assignment.assignmentScope === 'department' || (assignment.unitId && !assignment.subUnitId && !assignment.teamId && !assignment.userId)) {
    return 2;
  }
  if (assignment.assignmentScope === 'unit' || (assignment.subUnitId && !assignment.teamId && !assignment.userId)) {
    return 3;
  }
  if (assignment.assignmentScope === 'team' || (assignment.teamId && !assignment.userId)) {
    return 4;
  }
  if (assignment.assignmentScope === 'user' || assignment.userId) {
    return 5;
  }
  return 6;
}

function getAssignmentScopeLabel(
  assignment: CourseAssignment,
  terminology: { unit: string; subUnit: string; team: string }
): string {
  if (assignment.assignmentScope === 'organization' || (!assignment.unitId && !assignment.subUnitId && !assignment.teamId && !assignment.userId)) {
    return 'Entire Organization';
  }
  if (assignment.assignmentScope === 'department' || (assignment.unitId && !assignment.subUnitId && !assignment.teamId && !assignment.userId)) {
    return terminology.unit;
  }
  if (assignment.assignmentScope === 'unit' || (assignment.subUnitId && !assignment.teamId && !assignment.userId)) {
    return terminology.subUnit;
  }
  if (assignment.assignmentScope === 'team' || (assignment.teamId && !assignment.userId)) {
    return terminology.team;
  }
  if (assignment.assignmentScope === 'user' || assignment.userId) {
    return 'Individual User';
  }
  return 'Custom';
}

const difficultyLevels = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'expert', label: 'Expert' }
];

export default function CourseEdit() {
  const [, params] = useRoute('/course-builder/:id/edit');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, organizationType, courseVisibilityEnabled, effectiveOrganizationId } = useAuth();
  const { terminology: rawTerminology } = useOrganizationTerminology();
  const terminology = rawTerminology || {
    learnerPlural: 'Learners',
    unit: 'Department',
    unitPlural: 'Departments',
    subUnit: 'Unit',
    subUnitPlural: 'Units',
    team: 'Team',
    teamPlural: 'Teams',
  };
  const { onpremMode } = usePlatformMode();
  const courseId = params?.id;
  
  // All orgs can now modify visibility (unified org model)
  // This enables all organizations to create public courses for the marketplace
  
  // Default visibility for new courses
  const defaultVisibility: 'public' | 'org_only' = 'org_only';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficultyLevel, setDifficultyLevel] = useState('');
  const [currency, setCurrency] = useState('ZAR');
  const [price, setPrice] = useState('');
  const [isPaid, setIsPaid] = useState(true);
  const [visibility, setVisibility] = useState<'public' | 'org_only'>('org_only');
  const [isFree, setIsFree] = useState(true);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [thumbnailPreview, setThumbnailPreview] = useState('');
  const [thumbnailSource, setThumbnailSource] = useState<'upload' | 'ai' | undefined>(undefined);
  const [hasChanges, setHasChanges] = useState(false);
  const [isUploadingThumbnail, setIsUploadingThumbnail] = useState(false);
  const [showGenerateConfirmDialog, setShowGenerateConfirmDialog] = useState(false);
  const [showInsufficientCreditsModal, setShowInsufficientCreditsModal] = useState(false);
  const [insufficientCreditsData, setInsufficientCreditsData] = useState<{ required: number; current: number } | null>(null);
  const [thumbnailGenerationError, setThumbnailGenerationError] = useState<{
    code: 'ai_unavailable' | 'invalid_model' | 'generation_failed' | 'rate_limited' | null;
    message: string;
  } | null>(null);
  const [assignmentDueDate, setAssignmentDueDate] = useState<Date | undefined>(undefined);
  const [assignmentMandatory, setAssignmentMandatory] = useState(false);
  const [hasAssignmentChanges, setHasAssignmentChanges] = useState(false);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [showCreateCategoryDialog, setShowCreateCategoryDialog] = useState(false);
  const [categoryCreateSource, setCategoryCreateSource] = useState<'settings' | 'wizard'>('settings');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryComboboxOpen, setCategoryComboboxOpen] = useState(false);
  const [showValidationErrorModal, setShowValidationErrorModal] = useState(false);
  const [assignmentValidationData, setAssignmentValidationData] = useState<PublishValidation | null>(null);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [showAvailabilityWizard, setShowAvailabilityWizard] = useState(false);
  const [availabilityStep, setAvailabilityStep] = useState<'audience' | 'pricing' | 'targets' | 'review'>('audience');
  const [availabilityAudience, setAvailabilityAudience] = useState<'own_org' | 'marketplace' | 'showcase' | 'cross_org'>('own_org');
  const [publishAfterAvailability, setPublishAfterAvailability] = useState(false);
  const [selectedTargetOrgId, setSelectedTargetOrgId] = useState<string>('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const pendingUploadMeta = useRef<{ objectPath: string } | null>(null);
  const generateButtonRef = useRef<HTMLButtonElement>(null);

  const { balance, isLoading: balanceLoading, refreshBalance } = useWalletBalance();

  // Org wallet query - only for org members with org wallet enabled
  const { data: orgWalletData, isLoading: orgWalletLoading } = useQuery<OrgWalletBalanceResponse>({
    queryKey: ['/api/org-wallet', effectiveOrganizationId, 'balance'],
    queryFn: async () => {
      const response = await fetch(`/api/org-wallet/${effectiveOrganizationId}/balance`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch org wallet balance');
      }
      return response.json();
    },
    enabled: !!effectiveOrganizationId,
    staleTime: 30000,
    retry: 1,
  });
  
  // Determine if org badge should be shown
  const showOrgBadge = !!orgWalletData?.isEnabled;
  const orgBalance = orgWalletData?.balance ?? 0;

  const { data: course, isLoading: courseLoading, error: courseError } = useQuery<Course>({
    queryKey: ['/api/courses', courseId],
    queryFn: async () => {
      const response = await fetch(`/api/courses/${courseId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const rawBody = await response.text();
        let message = 'Failed to load course';
        try {
          const parsed = JSON.parse(rawBody);
          message = parsed?.error || parsed?.message || message;
        } catch {
          if (rawBody?.trim()) {
            message = rawBody;
          }
        }
        const error: any = new Error(message);
        error.status = response.status;
        throw error;
      }
      return response.json();
    },
    enabled: !!courseId,
  });

  const { data: framework, isLoading: frameworkLoading } = useQuery<CourseFramework>({
    queryKey: ['/api/courses', courseId, 'framework'],
    queryFn: async () => {
      const response = await fetch(`/api/courses/${courseId}/framework`, {
        credentials: 'include',
      });
      if (!response.ok) {
        if (response.status === 404) {
          return { id: '', courseId: courseId || '', topics: [] };
        }
        throw new Error('Failed to load framework');
      }
      return response.json();
    },
    enabled: !!courseId,
  });

  const { data: lessonsData } = useQuery<any[]>({
    queryKey: ['/api/courses', courseId, 'lessons'],
    queryFn: async () => {
      const response = await fetch(`/api/courses/${courseId}/lessons`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!courseId,
  });

  const { data: thumbnailPricing, isLoading: pricingLoading } = useQuery<ThumbnailPricing>({
    queryKey: ['/api/admin/thumbnail-pricing'],
    queryFn: async () => {
      const response = await fetch('/api/admin/thumbnail-pricing', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to load thumbnail pricing');
      return response.json();
    },
  });

  // Hybrid balance for thumbnail generation credit check
  const thumbnailCreditCost = thumbnailPricing?.creditCost ?? 25;
  const hybridBalance = useHybridBalance({ amount: thumbnailCreditCost });

  const { data: courseAssignments, isLoading: assignmentsLoading } = useQuery<CourseAssignment[]>({
    queryKey: ['/api/course-assignments/course', courseId],
    queryFn: async () => {
      const response = await fetch(`/api/course-assignments/course/${courseId}`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!courseId,
  });

  const { data: publishValidation, isLoading: validationLoading } = useQuery<PublishValidation>({
    queryKey: ['/api/courses', courseId, 'validate-publish'],
    queryFn: async () => {
      const response = await fetch(`/api/courses/${courseId}/validate-publish`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to validate course');
      }
      return response.json();
    },
    enabled: !!courseId && !course?.publishedAt,
    staleTime: 10000,
  });

  const { data: departmentsData, isLoading: departmentsLoading } = useQuery<any[]>({
    queryKey: ['/api/organizations', effectiveOrganizationId, 'units'],
    queryFn: async () => {
      const response = await fetch(`/api/organizations/${effectiveOrganizationId}/units`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!effectiveOrganizationId,
  });

  const { data: subUnitsData, isLoading: unitsLoading } = useQuery<any[]>({
    queryKey: ['/api/organization/sub-units', selectedDepartmentId],
    queryFn: async () => {
      const response = await fetch(`/api/organization/sub-units/${selectedDepartmentId}`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!selectedDepartmentId,
  });

  const { data: teamsData, isLoading: teamsLoading } = useQuery<any[]>({
    queryKey: ['/api/organization/teams', selectedUnitId],
    queryFn: async () => {
      const response = await fetch(`/api/organization/teams/${selectedUnitId}`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!selectedUnitId,
  });

  const { data: categoriesData, refetch: refetchCategories } = useQuery<{ categories: CategoryItem[], orgType: string }>({
    queryKey: ['/api/courses/categories/public'],
    enabled: !!user,
  });

  const categories = categoriesData?.categories || [];

  const { data: publishReadiness } = useQuery<any>({
    queryKey: ['/api/courses', courseId, 'publish-readiness'],
    queryFn: async () => {
      const response = await fetch(`/api/courses/${courseId}/publish-readiness`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to check publish readiness');
      return response.json();
    },
    enabled: !!courseId && showPublishDialog,
  });

  const { data: courseLanguages } = useQuery<Array<{ code: string; name: string; nativeName: string; courseId: string }>>({
    queryKey: ['/api/courses', courseId, 'languages'],
    enabled: !!courseId,
  });

  const { data: targetOrgs = [] } = useQuery<Array<{ id: string; name: string; ruleId: string }>>({
    queryKey: ['/api/interorg/target-orgs', courseId],
    queryFn: async () => {
      const response = await fetch(`/api/interorg/target-orgs?courseId=${courseId}`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: showAvailabilityWizard && onpremMode,
  });

  const { data: targetOrgHierarchy } = useQuery<{ units: Array<{ id: string; name: string; subUnits: Array<{ id: string; name: string; teams: Array<{ id: string; name: string }> }> }> }>({
    queryKey: ['/api/interorg/target-orgs', selectedTargetOrgId, 'hierarchy', courseId],
    queryFn: async () => {
      const response = await fetch(`/api/interorg/target-orgs/${selectedTargetOrgId}/hierarchy?courseId=${courseId}`, {
        credentials: 'include',
      });
      if (!response.ok) return { units: [] };
      return response.json();
    },
    enabled: showAvailabilityWizard && onpremMode && availabilityAudience === 'cross_org' && !!selectedTargetOrgId,
  });

  const departments = Array.isArray(departmentsData) ? departmentsData : (departmentsData as any)?.units || [];
  const subUnits = subUnitsData || [];
  const teams = teamsData || [];
  const isCrossOrgAvailability = availabilityAudience === 'cross_org';
  const wizardDepartments = isCrossOrgAvailability ? targetOrgHierarchy?.units || [] : departments;
  const isShowcaseDepartmentOption = (department: any) =>
    department?.isShowcaseDepartment === true || String(department?.name || '').trim().toLowerCase() === 'showcase';
  const showcaseDepartments = wizardDepartments.filter(isShowcaseDepartmentOption);
  const targetDepartmentOptions = availabilityAudience === 'showcase' ? showcaseDepartments : wizardDepartments;
  const selectedWizardDepartment = wizardDepartments.find((department: any) => department.id === selectedDepartmentId);
  const selectedShowcaseDepartment = showcaseDepartments.find((department: any) => department.id === selectedDepartmentId);
  const wizardSubUnits = isCrossOrgAvailability ? selectedWizardDepartment?.subUnits || [] : subUnits;
  const selectedWizardUnit = wizardSubUnits.find((unit: any) => unit.id === selectedUnitId);
  const wizardTeams = isCrossOrgAvailability ? selectedWizardUnit?.teams || [] : teams;
  const primaryAssignment = courseAssignments && courseAssignments.length > 0
    ? [...courseAssignments].sort((a, b) => getAssignmentScopePriority(a) - getAssignmentScopePriority(b))[0]
    : null;
  const assignmentScopeLabel = primaryAssignment ? getAssignmentScopeLabel(primaryAssignment, terminology) : 'Not assigned';
  const availabilitySummary = visibility === 'public'
    ? `${isPaid ? `${currency} ${price || '0'}` : 'Free'} public course`
    : 'Organization-only course';
  const selectedTargetOrgName = targetOrgs.find((org) => org.id === selectedTargetOrgId)?.name || 'Partner organization';
  const availabilitySteps: Array<typeof availabilityStep> = ['audience', 'pricing', 'targets', 'review'];
  const availabilityStepIndex = availabilitySteps.indexOf(availabilityStep);
  const availabilityProgress = ((availabilityStepIndex + 1) / availabilitySteps.length) * 100;

  const resetAvailabilityWizard = () => {
    setAvailabilityStep('audience');
    setAvailabilityAudience(visibility === 'public' ? 'marketplace' : 'own_org');
    setPublishAfterAvailability(true);
    setSelectedTargetOrgId('');
  };

  const openAvailabilityWizard = () => {
    resetAvailabilityWizard();
    setShowAvailabilityWizard(true);
  };

  const closeAvailabilityWizard = () => {
    setShowAvailabilityWizard(false);
    setAvailabilityStep('audience');
  };

  const getSelectedAssignmentScope = () => {
    if (selectedTeamId) return 'team';
    if (selectedUnitId) return 'unit';
    if (selectedDepartmentId) return 'department';
    return 'organization';
  };

  const getSelectedAssignmentLabel = () => {
    if (selectedTeamId) return wizardTeams.find((team: any) => team.id === selectedTeamId)?.name || 'Selected team';
    if (selectedUnitId) return wizardSubUnits.find((unit: any) => unit.id === selectedUnitId)?.name || 'Selected unit';
    if (selectedDepartmentId) return wizardDepartments.find((department: any) => department.id === selectedDepartmentId)?.name || 'Selected department';
    return availabilityAudience === 'cross_org' ? selectedTargetOrgName : 'Entire organization';
  };

  useEffect(() => {
    if (availabilityAudience !== 'showcase') return;
    if (selectedDepartmentId && selectedShowcaseDepartment) return;
    if (showcaseDepartments.length === 0) return;
    setSelectedDepartmentId(showcaseDepartments[0].id);
    setSelectedUnitId(null);
    setSelectedTeamId(null);
  }, [availabilityAudience, selectedDepartmentId, selectedShowcaseDepartment, showcaseDepartments]);

  useEffect(() => {
    if (selectedUnitId && selectedDepartmentId && subUnits.length > 0) {
      const unitStillValid = subUnits.some((u: any) => u.id === selectedUnitId);
      if (!unitStillValid) {
        setSelectedUnitId(null);
        setSelectedTeamId(null);
        setHasAssignmentChanges(true);
      }
    }
  }, [selectedDepartmentId, subUnits, selectedUnitId]);

  useEffect(() => {
    if (selectedTeamId && selectedUnitId && teams.length > 0) {
      const teamStillValid = teams.some((t: any) => t.id === selectedTeamId);
      if (!teamStillValid) {
        setSelectedTeamId(null);
        setHasAssignmentChanges(true);
      }
    }
  }, [selectedUnitId, teams, selectedTeamId]);

  useEffect(() => {
    if (course) {
      setTitle(course.title);
      setDescription(course.description || '');
      setDifficultyLevel(course.difficultyLevel || '');
      setCurrency(course.currency || 'ZAR');
      setPrice(course.price || '0');
      setIsPaid(course.isPaid);
      setVisibility(course.visibility || 'org_only');
      setSelectedCategoryId(course.categoryId || null);
      const coursePrice = parseFloat(course.price || '0');
      setIsFree(!coursePrice || coursePrice === 0);
      setThumbnailUrl(course.thumbnailUrl || course.imageUrl || '');
      setThumbnailPreview(course.thumbnailSignedUrl || course.thumbnailUrl || course.imageUrl || '');
      setThumbnailSource(course.thumbnailSource);
    }
  }, [course]);

  useEffect(() => {
    if (courseAssignments && courseAssignments.length > 0) {
      const sortedAssignments = [...courseAssignments].sort(
        (a, b) => getAssignmentScopePriority(a) - getAssignmentScopePriority(b)
      );
      const assignment = sortedAssignments[0];
      setAssignmentDueDate(assignment.dueDate ? new Date(assignment.dueDate) : undefined);
      setAssignmentMandatory(assignment.mandatory);
      setSelectedDepartmentId(assignment.unitId || null);
      setSelectedUnitId(assignment.subUnitId || null);
      setSelectedTeamId(assignment.teamId || null);
      setHasAssignmentChanges(false);
    }
  }, [courseAssignments]);

  const handleThumbnailUpload = async () => {
    try {
      const response = await apiRequest(`/api/courses/${courseId}/thumbnail-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }) as unknown as { method: 'PUT'; url: string; objectPath: string; courseId: string };

      pendingUploadMeta.current = { objectPath: response.objectPath };

      return {
        method: response.method,
        url: response.url,
      };
    } catch (error) {
      console.error('Error getting upload URL:', error);
      toast({
        title: 'Upload Error',
        description: 'Failed to prepare thumbnail upload',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleUploadComplete = async (result: any) => {
    if (result.successful && result.successful.length > 0) {
      const uploadedFile = result.successful[0];
      const uploadMeta = pendingUploadMeta.current;

      if (!uploadMeta || !uploadMeta.objectPath) {
        console.error('Missing objectPath in pending upload meta');
        toast({
          title: 'Upload Error',
          description: 'Failed to retrieve upload metadata',
          variant: 'destructive',
        });
        return;
      }

      setIsUploadingThumbnail(true);

      try {
        const updated = await apiRequest(`/api/courses/${courseId}/thumbnail`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ thumbnailUrl: uploadMeta.objectPath }),
        }) as unknown as { thumbnailSignedUrl?: string };

        setThumbnailUrl(uploadMeta.objectPath);
        setThumbnailPreview(updated.thumbnailSignedUrl || uploadedFile.preview || '');
        setThumbnailSource('upload');
        pendingUploadMeta.current = null;

        // Invalidate all course-related queries to update thumbnail everywhere
        queryClient.invalidateQueries({ queryKey: ['/api/courses'] });
        queryClient.invalidateQueries({ queryKey: ['/api/courses/counts'] });

        toast({
          title: 'Thumbnail Updated!',
          description: 'Course thumbnail has been updated successfully.',
        });
      } catch (error) {
        console.error('Error updating thumbnail:', error);
        toast({
          title: 'Update Error',
          description: 'Failed to save thumbnail',
          variant: 'destructive',
        });
      } finally {
        setIsUploadingThumbnail(false);
      }
    }
  };

  const removeThumbnail = () => {
    setThumbnailUrl('');
    setThumbnailPreview('');
    setThumbnailSource(undefined);
    setHasChanges(true);
  };

  const createCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      return await apiRequest<{ category: { id: string; name: string }; message: string }>('/api/courses/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/courses/categories'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses/categories/public'] });
      refetchCategories();
      setSelectedCategoryId(data.category.id);
      setNewCategoryName('');
      setShowCreateCategoryDialog(false);
      setHasChanges(true);
      toast({
        title: 'Category Created',
        description: `Category "${data.category.name}" has been created.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to Create Category',
        description: (error as Error).message,
        variant: 'destructive',
      });
    },
  });

  const updateCourseMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/courses/${courseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          difficultyLevel,
          currency,
          price: isPaid ? price : '0',
          isPaid,
          visibility,
          thumbnailUrl,
          categoryId: selectedCategoryId || null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/courses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId] });
      invalidateCourseScopeCaches({ 
        courseId: courseId || undefined,
        organizationId: course?.organizationId || undefined 
      });
      setHasChanges(false);
      toast({
        title: 'Course Updated',
        description: 'Your course changes have been saved.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Update Failed',
        description: (error as Error).message,
        variant: 'destructive',
      });
    },
  });

  const publishCourseMutation = useMutation({
    mutationFn: async () => {
      if (hasChanges) {
        const validation = validateSave();
        if (!validation.valid) {
          throw new Error(validation.error || 'Please fix course settings before publishing.');
        }
        try {
          await apiRequest(`/api/courses/${courseId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title,
              description,
              difficultyLevel,
              currency,
              price: isPaid ? price : '0',
              isPaid,
              visibility,
              thumbnailUrl,
              categoryId: selectedCategoryId || null,
            }),
          });
        } catch (saveError: any) {
          throw new Error(`Failed to save course changes: ${saveError.message || 'Unknown error'}`);
        }
      }
      return await apiRequest(`/api/courses/${courseId}/publish`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['/api/courses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses/counts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'validate-publish'] });
      invalidateCourseScopeCaches({ 
        courseId: courseId || undefined,
        organizationId: course?.organizationId || undefined 
      });
      
      const hasExistingAssignment = courseAssignments && courseAssignments.length > 0;
      
      if (hasExistingAssignment) {
        toast({
          title: 'Course Published!',
          description: 'Your course is now live and assigned to learners.',
        });
      } else {
        toast({
          title: 'Course Published!',
          description: 'Redirecting to assign course to learners...',
        });
        setLocation(`/course-assignments?courseId=${courseId}&source=builder`);
      }
    },
    onError: (error) => {
      toast({
        title: 'Publish Failed',
        description: (error as Error).message,
        variant: 'destructive',
      });
    },
  });

  const publishLanguagesMutation = useMutation({
    mutationFn: async (languageCodes: string[]) => {
      return await apiRequest(`/api/courses/${courseId}/publish-languages`, {
        method: 'POST',
        body: JSON.stringify({ languageCodes }),
      });
    },
    onSuccess: (data: any) => {
      setShowPublishDialog(false);
      setSelectedLanguages([]);
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses/counts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'publish-readiness'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'languages'] });
      toast({
        title: 'Languages published',
        description: `${data.published?.length || 0} language(s) published successfully.`,
      });
    },
    onError: (error: any) => {
      toast({ title: 'Publish failed', description: error.message, variant: 'destructive' });
    },
  });

  const availabilityWizardMutation = useMutation({
    mutationFn: async () => {
      const nextVisibility: 'public' | 'org_only' = availabilityAudience === 'marketplace' || availabilityAudience === 'showcase' || availabilityAudience === 'cross_org'
        ? 'public'
        : 'org_only';
      const nextIsPaid = nextVisibility === 'public' ? isPaid && parseFloat(price || '0') > 0 : false;
      const nextPrice = nextIsPaid ? price : '0';

      if (nextVisibility === 'public' && !selectedCategoryId) {
        throw new Error('Choose a category before making this course public.');
      }
      if (availabilityAudience === 'cross_org' && !selectedTargetOrgId) {
        throw new Error('Choose a partner organization before assigning cross-org.');
      }
      if (availabilityAudience === 'showcase' && !selectedShowcaseDepartment) {
        throw new Error('Choose a showcase department before saving showcase access.');
      }

      await apiRequest(`/api/courses/${courseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          difficultyLevel,
          currency,
          price: nextPrice,
          isPaid: nextIsPaid,
          visibility: nextVisibility,
          thumbnailUrl,
          categoryId: selectedCategoryId || null,
        }),
      });

      if (publishAfterAvailability && availabilityAudience === 'cross_org') {
        await apiRequest(`/api/courses/${courseId}/publish`, {
          method: 'POST',
        });
      }

      const assignmentScope = getSelectedAssignmentScope();
      const assignmentPayload: any = {
        courseId,
        organizationId: course?.organizationId || effectiveOrganizationId,
        unitId: selectedDepartmentId || null,
        subUnitId: selectedUnitId || null,
        teamId: selectedTeamId || null,
        dueDate: assignmentDueDate ? assignmentDueDate.toISOString() : null,
        mandatory: assignmentMandatory,
        assignmentScope,
        audience: 'learner',
      };

      if (availabilityAudience === 'cross_org') {
        assignmentPayload.targetOrganizationId = selectedTargetOrgId;
      }

      if (availabilityAudience === 'own_org' || availabilityAudience === 'showcase' || availabilityAudience === 'cross_org') {
        await apiRequest('/api/course-assignments', {
          method: 'POST',
          body: JSON.stringify(assignmentPayload),
        });
      }

      if (publishAfterAvailability && availabilityAudience !== 'cross_org') {
        await apiRequest(`/api/courses/${courseId}/publish`, {
          method: 'POST',
        });
      }

      return { visibility: nextVisibility, isPaid: nextIsPaid, price: nextPrice };
    },
    onSuccess: (result) => {
      setVisibility(result.visibility);
      setIsPaid(result.isPaid);
      setPrice(result.price);
      setIsFree(!result.isPaid);
      setHasChanges(false);
      setHasAssignmentChanges(false);
      closeAvailabilityWizard();
      queryClient.invalidateQueries({ queryKey: ['/api/courses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses/counts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/course-assignments/course', courseId] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'validate-publish'] });
      invalidateCourseScopeCaches({
        courseId: courseId || undefined,
        organizationId: course?.organizationId || undefined,
      });
      toast({
        title: publishAfterAvailability ? 'Availability saved and course published' : 'Availability saved',
        description: 'Course access, pricing, and assignment settings are up to date.',
      });
    },
    onError: (error: any) => {
      if (error?.validation) {
        setAssignmentValidationData({
          isValid: false,
          errors: error.validation.errors || [],
          warnings: error.validation.warnings || [],
          lessonDetails: error.validation.lessonDetails || [],
        });
        setShowValidationErrorModal(true);
      } else {
        toast({
          title: 'Availability update failed',
          description: error.message || 'Please review the wizard and try again.',
          variant: 'destructive',
        });
      }
    },
  });

  const updateAssignmentMutation = useMutation({
    mutationFn: async () => {
      if (!courseAssignments || courseAssignments.length === 0) {
        throw new Error('No assignment exists to update');
      }
      const sortedAssignments = [...courseAssignments].sort(
        (a, b) => getAssignmentScopePriority(a) - getAssignmentScopePriority(b)
      );
      const assignmentId = sortedAssignments[0].id;
      
      let assignmentScope = 'organization';
      if (selectedTeamId) {
        assignmentScope = 'team';
      } else if (selectedUnitId) {
        assignmentScope = 'unit';
      } else if (selectedDepartmentId) {
        assignmentScope = 'department';
      }
      
      return await apiRequest(`/api/course-assignments/${assignmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          dueDate: assignmentDueDate ? assignmentDueDate.toISOString() : null,
          mandatory: assignmentMandatory,
          unitId: selectedDepartmentId || null,
          subUnitId: selectedUnitId || null,
          teamId: selectedTeamId || null,
          assignmentScope,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/course-assignments/course', courseId] });
      queryClient.invalidateQueries({ queryKey: ['/api/course-assignments'] });
      invalidateCourseScopeCaches({ 
        courseId: courseId || undefined,
        organizationId: course?.organizationId || undefined 
      });
      setHasAssignmentChanges(false);
      toast({
        title: 'Assignment Settings Updated',
        description: 'Scope, due date and mandatory settings have been saved.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Update Failed',
        description: (error as Error).message,
        variant: 'destructive',
      });
    },
  });

  const createAssignmentMutation = useMutation({
    mutationFn: async () => {
      let assignmentScope = 'organization';
      if (selectedTeamId) {
        assignmentScope = 'team';
      } else if (selectedUnitId) {
        assignmentScope = 'unit';
      } else if (selectedDepartmentId) {
        assignmentScope = 'department';
      }
      
      return await apiRequest('/api/course-assignments', {
        method: 'POST',
        body: JSON.stringify({
          courseId,
          organizationId: effectiveOrganizationId,
          unitId: selectedDepartmentId || null,
          subUnitId: selectedUnitId || null,
          teamId: selectedTeamId || null,
          dueDate: assignmentDueDate ? assignmentDueDate.toISOString() : null,
          mandatory: assignmentMandatory,
          assignmentScope,
          audience: 'learner',
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/course-assignments/course', courseId] });
      queryClient.invalidateQueries({ queryKey: ['/api/course-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'validate-publish'] });
      invalidateCourseScopeCaches({ 
        courseId: courseId || undefined,
        organizationId: course?.organizationId || undefined 
      });
      setHasAssignmentChanges(false);
      toast({
        title: 'Course Assigned',
        description: 'Course has been assigned to the selected scope.',
      });
    },
    onError: (error: any) => {
      if (error?.validation) {
        setAssignmentValidationData({
          isValid: false,
          errors: error.validation.errors || [],
          warnings: error.validation.warnings || [],
          lessonDetails: error.validation.lessonDetails || [],
        });
        setShowValidationErrorModal(true);
      } else {
        toast({
          title: 'Assignment Failed',
          description: (error as Error).message,
          variant: 'destructive',
        });
      }
    },
  });

  const generateThumbnailMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest<ThumbnailGenerationResponse>(
        `/api/admin/courses/${courseId}/generate-thumbnail`,
        { method: 'POST' }
      );
    },
    onSuccess: (data) => {
      setThumbnailUrl(data.thumbnailUrl);
      setThumbnailPreview(data.thumbnailSignedUrl || data.thumbnailUrl);
      setThumbnailSource('ai');
      setShowGenerateConfirmDialog(false);
      setThumbnailGenerationError(null);

      queryClient.invalidateQueries({ queryKey: ['/api/courses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId] });
      invalidateWalletCaches();
      refreshBalance();

      setHasChanges(true);

      toast({
        title: 'Thumbnail Generated!',
        description: `AI thumbnail created successfully! ${data.creditsCharged} ${LP_CREDITS_SHORT} charged.`,
      });

      setTimeout(() => generateButtonRef.current?.focus(), 100);
    },
    onError: (error: any) => {
      setShowGenerateConfirmDialog(false);
      
      const errorCode = error.errorCode || error.response?.errorCode;
      const statusCode = error.statusCode;

      if (statusCode === 402 || errorCode === 'insufficient_credits') {
        setThumbnailGenerationError(null);
        setInsufficientCreditsData({
          required: error.required || error.response?.required || (thumbnailPricing?.creditCost ?? 25),
          current: error.current || error.response?.current || balance,
        });
        setShowInsufficientCreditsModal(true);
        return;
      }

      if (statusCode === 429 || errorCode === 'rate_limited') {
        const retryAfter = error.retryAfter || error.response?.retryAfter;
        const minutes = retryAfter ? Math.ceil(retryAfter / 60) : 5;
        setThumbnailGenerationError({
          code: 'rate_limited',
          message: `Too many requests. Please wait ${minutes} minute${minutes !== 1 ? 's' : ''} before trying again.`,
        });
        return;
      }

      if (statusCode === 503 || errorCode === 'ai_unavailable') {
        setThumbnailGenerationError({
          code: 'ai_unavailable',
          message: 'AI is not configured. Please configure an AI provider in Settings.',
        });
        return;
      }

      if (errorCode === 'invalid_model') {
        setThumbnailGenerationError({
          code: 'invalid_model',
          message: 'The configured AI model doesn\'t support image generation. Please update the model in Settings.',
        });
        return;
      }

      setThumbnailGenerationError({
        code: 'generation_failed',
        message: 'Failed to generate thumbnail. Your credits have been refunded. Please try again.',
      });

      setTimeout(() => generateButtonRef.current?.focus(), 100);
    },
  });

  const handleGenerateClick = () => {
    setThumbnailGenerationError(null);
    
    if (!thumbnailPricing?.featureEnabled) {
      toast({
        title: 'Feature Unavailable',
        description: 'AI thumbnail generation is not available at this time.',
        variant: 'destructive',
      });
      return;
    }

    const creditCost = thumbnailPricing?.creditCost ?? 25;
    if (!hybridBalance.canAfford) {
      setInsufficientCreditsData({
        required: creditCost,
        current: hybridBalance.totalAvailable,
      });
      setShowInsufficientCreditsModal(true);
      return;
    }

    setShowGenerateConfirmDialog(true);
  };

  const handleConfirmGenerate = () => {
    generateThumbnailMutation.mutate();
  };

  const handleFieldChange = (setter: (v: any) => void, value: any) => {
    setter(value);
    setHasChanges(true);
  };

  // Validation for saving course
  const validateSave = (): { valid: boolean; error?: string } => {
    // Public courses require a category for marketplace filtering
    if (visibility === 'public' && !selectedCategoryId) {
      return { 
        valid: false, 
        error: 'Public courses require a category. Please select a category before saving.' 
      };
    }
    return { valid: true };
  };

  const handleSaveCourse = () => {
    const validation = validateSave();
    if (!validation.valid) {
      toast({
        title: 'Cannot Save Course',
        description: validation.error,
        variant: 'destructive',
      });
      return;
    }
    updateCourseMutation.mutate();
  };

  const topics = framework?.topics?.sort((a, b) => a.order - b.order) || [];
  const generatedLessonsCount = topics.filter(t => t.lessonId).length;
  const isPublished = !!course?.publishedAt;
  
  const lessons = Array.isArray(lessonsData) ? lessonsData : [];
  const lessonsWithContent = lessons.filter((l: any) => l.storageKey || l.hasSlides || l.slideCount > 0);
  const allLessonsHaveContent = lessons.length > 0 && lessonsWithContent.length === lessons.length;
  const lessonsWithoutContent = lessons.filter((l: any) => !l.storageKey && !l.hasSlides && !(l.slideCount > 0));
  
  const canPublish = publishValidation?.isValid ?? false;
  const validationErrors = publishValidation?.errors ?? [];
  const validationWarnings = publishValidation?.warnings ?? [];
  const availabilityPublishReadinessErrors = validationErrors.filter((error) => {
    const isAssignmentReadinessError = error.toLowerCase().includes('course must be assigned');
    const wizardWillResolveAssignmentReadiness =
      availabilityAudience === 'marketplace'
      || availabilityAudience === 'own_org'
      || availabilityAudience === 'showcase'
      || availabilityAudience === 'cross_org';

    return !(publishAfterAvailability && wizardWillResolveAssignmentReadiness && isAssignmentReadinessError);
  });
  const publishReadinessMessage = availabilityPublishReadinessErrors[0] || validationErrors[0];
  const canContinueAvailability =
    availabilityStep !== 'targets'
    || (
      (availabilityAudience !== 'cross_org' || !!selectedTargetOrgId)
      && (availabilityAudience !== 'showcase' || !!selectedShowcaseDepartment)
    );

  const renderCreateCategoryInlineCard = (source: 'settings' | 'wizard') => (
    <CreateCategoryInlineCard
      source={source}
      show={showCreateCategoryDialog && categoryCreateSource === source}
      name={newCategoryName}
      isPending={createCategoryMutation.isPending}
      onNameChange={setNewCategoryName}
      onCancel={() => {
        setShowCreateCategoryDialog(false);
        setNewCategoryName('');
      }}
      onCreate={() => {
        if (newCategoryName.trim()) {
          createCategoryMutation.mutate(newCategoryName.trim());
        }
      }}
    />
  );

  const CourseAvailabilityWizard = () => {
    if (!showAvailabilityWizard) return null;

    return (
      <Card className="border-primary/40 bg-card shadow-lg" data-testid="course-availability-wizard">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-card-foreground">
                <Globe className="h-5 w-5 text-primary" />
                Set Availability & Assign
              </CardTitle>
              <CardDescription>
                Choose how learners find this course, whether it is free or paid, and who receives it.
              </CardDescription>
            </div>
            <Badge variant="secondary">Step {availabilityStepIndex + 1} of {availabilitySteps.length}</Badge>
          </div>
          <Progress value={availabilityProgress} className="h-2" />
        </CardHeader>
        <CardContent className="space-y-5">
          {availabilityStep === 'audience' && (
            <div className="grid gap-3 md:grid-cols-2">
              {[
                { id: 'own_org', title: 'Own Organization', text: 'Assign internally to everyone or a selected department, unit, or team.', icon: Building2 },
                { id: 'marketplace', title: 'Public Marketplace', text: 'Make the course discoverable as a free or paid public course.', icon: Globe },
                { id: 'showcase', title: 'Showcase Access', text: 'Publish publicly and assign to a showcase department for open demo access.', icon: Eye },
                ...(onpremMode ? [{ id: 'cross_org', title: 'Partner Organization', text: 'Assign a public course to another organization on this on-prem system.', icon: Users }] : []),
              ].map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setAvailabilityAudience(option.id as any);
                      if (option.id === 'marketplace') {
                        setVisibility('public');
                      }
                      if (option.id === 'own_org') {
                        setVisibility('org_only');
                        setIsPaid(false);
                        setPrice('0');
                      }
                      if (option.id === 'showcase' || option.id === 'cross_org') {
                        setVisibility('public');
                      }
                      if (option.id === 'showcase') {
                        const firstShowcaseDepartment = departments.find(isShowcaseDepartmentOption);
                        if (firstShowcaseDepartment) {
                          setSelectedDepartmentId(firstShowcaseDepartment.id);
                          setSelectedUnitId(null);
                          setSelectedTeamId(null);
                        }
                      }
                      if (option.id !== 'cross_org') {
                        setSelectedTargetOrgId('');
                      }
                      setHasChanges(true);
                    }}
                    className={`rounded-lg border p-4 text-left transition-colors ${
                      availabilityAudience === option.id ? 'border-primary bg-primary/10' : 'border-border bg-muted/30 hover:bg-muted/60'
                    }`}
                    data-testid={`availability-audience-${option.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-foreground">{option.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{option.text}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
              {availabilityAudience === 'cross_org' && (
                <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4 md:col-span-2">
                  <Label>Partner organization</Label>
                  <Select
                    value={selectedTargetOrgId || 'none'}
                    onValueChange={(value) => {
                      setSelectedTargetOrgId(value === 'none' ? '' : value);
                      setSelectedDepartmentId(null);
                      setSelectedUnitId(null);
                      setSelectedTeamId(null);
                    }}
                  >
                    <SelectTrigger data-testid="availability-audience-target-org">
                      <SelectValue placeholder="Choose partner organization" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Choose partner organization</SelectItem>
                      {targetOrgs.map((org) => <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Select the on-prem organization that should receive this course.</p>
                </div>
              )}
            </div>
          )}

          {availabilityStep === 'pricing' && (
            <div className="space-y-4">
              {availabilityAudience === 'own_org' ? (
                <Alert>
                  <Lock className="h-4 w-4" />
                  <AlertDescription>Internal organization courses are assigned to learners without marketplace pricing.</AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button type="button" onClick={() => { setIsPaid(false); setIsFree(true); setPrice('0'); setHasChanges(true); }} className={`rounded-lg border p-4 text-left ${!isPaid ? 'border-primary bg-primary/10' : 'border-border bg-muted/30'}`} data-testid="availability-pricing-free">
                      <Coins className="mb-2 h-5 w-5 text-primary" />
                      <p className="font-medium">Free</p>
                      <p className="text-sm text-muted-foreground">{terminology.learnerPlural} can enroll without payment.</p>
                    </button>
                    <button type="button" onClick={() => { setIsPaid(true); setIsFree(false); if (!price || price === '0') setPrice('50'); setHasChanges(true); }} className={`rounded-lg border p-4 text-left ${isPaid ? 'border-primary bg-primary/10' : 'border-border bg-muted/30'}`} data-testid="availability-pricing-paid">
                      <Coins className="mb-2 h-5 w-5 text-primary" />
                      <p className="font-medium">Paid</p>
                      <p className="text-sm text-muted-foreground">Set a marketplace price for enrollment.</p>
                    </button>
                  </div>
                  {isPaid && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Price</Label>
                        <Input type="number" min="0" step="0.01" value={price} onChange={(event) => { setPrice(event.target.value); setHasChanges(true); }} data-testid="availability-price" />
                      </div>
                      <div className="space-y-2">
                        <Label>Currency</Label>
                        <Select value={currency} onValueChange={(value) => { setCurrency(value); setHasChanges(true); }}>
                          <SelectTrigger data-testid="availability-currency"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ZAR">ZAR</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-primary" />
                      Category
                    </Label>
                    <Select
                      value={selectedCategoryId || 'none'}
                      onValueChange={(value) => {
                        if (value === 'create') {
                          setCategoryCreateSource('wizard');
                          setShowCreateCategoryDialog(true);
                          return;
                        }
                        setSelectedCategoryId(value === 'none' ? null : value);
                        setHasChanges(true);
                      }}
                    >
                      <SelectTrigger data-testid="availability-category">
                        <SelectValue placeholder="Choose category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Category</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                        ))}
                        <SelectItem value="create" data-testid="availability-create-category">Create new category...</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Required for public marketplace, showcase, and partner courses.</p>
                    {renderCreateCategoryInlineCard('wizard')}
                  </div>
                  {!selectedCategoryId && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>Public courses need a category. Choose one here before finishing.</AlertDescription>
                    </Alert>
                  )}
                </>
              )}
            </div>
          )}

          {availabilityStep === 'targets' && (
            <div className="space-y-4">
              {availabilityAudience === 'cross_org' && (
                <div className="space-y-2">
                  <Label>Partner organization</Label>
                  <Select value={selectedTargetOrgId || 'none'} onValueChange={(value) => {
                    setSelectedTargetOrgId(value === 'none' ? '' : value);
                    setSelectedDepartmentId(null);
                    setSelectedUnitId(null);
                    setSelectedTeamId(null);
                  }}>
                    <SelectTrigger data-testid="availability-target-org"><SelectValue placeholder="Choose partner organization" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Choose partner organization</SelectItem>
                      {targetOrgs.map((org) => <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {availabilityAudience !== 'marketplace' && (
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>{terminology.unit}</Label>
                    <Select
                      value={selectedDepartmentId || 'all'}
                      onValueChange={(value) => { setSelectedDepartmentId(value === 'all' ? null : value); setSelectedUnitId(null); setSelectedTeamId(null); }}
                      disabled={availabilityAudience === 'showcase' && showcaseDepartments.length === 0}
                    >
                      <SelectTrigger data-testid="availability-department"><SelectValue placeholder={`All ${terminology.unitPlural.toLowerCase()}`} /></SelectTrigger>
                      <SelectContent>
                        {availabilityAudience === 'showcase'
                          ? <SelectItem value="all" disabled>Choose showcase department</SelectItem>
                          : <SelectItem value="all">Entire organization</SelectItem>}
                        {targetDepartmentOptions.map((department: any) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{terminology.subUnit}</Label>
                    <Select value={selectedUnitId || 'all'} onValueChange={(value) => { setSelectedUnitId(value === 'all' ? null : value); setSelectedTeamId(null); }} disabled={!selectedDepartmentId}>
                      <SelectTrigger data-testid="availability-unit"><SelectValue placeholder={`All ${terminology.subUnitPlural.toLowerCase()}`} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All {terminology.subUnitPlural.toLowerCase()}</SelectItem>
                        {wizardSubUnits.map((unit: any) => <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{terminology.team}</Label>
                    <Select value={selectedTeamId || 'all'} onValueChange={(value) => setSelectedTeamId(value === 'all' ? null : value)} disabled={!selectedUnitId}>
                      <SelectTrigger data-testid="availability-team"><SelectValue placeholder={`All ${terminology.teamPlural.toLowerCase()}`} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All {terminology.teamPlural.toLowerCase()}</SelectItem>
                        {wizardTeams.map((team: any) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              {availabilityAudience === 'cross_org' && selectedTargetOrgId && wizardDepartments.length === 0 && (
                <Alert>
                  <Building2 className="h-4 w-4" />
                  <AlertDescription>No partner hierarchy is configured yet. Leave the scope as entire organization to assign to all partner learners.</AlertDescription>
                </Alert>
              )}
              {availabilityAudience === 'showcase' && showcaseDepartments.length === 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>No showcase department is configured yet. Create or mark a department as a showcase department before saving showcase access.</AlertDescription>
                </Alert>
              )}
              {availabilityAudience === 'marketplace' && (
                <Alert>
                  <Globe className="h-4 w-4" />
                  <AlertDescription>Marketplace courses are available publicly. You can still add organization assignments later from this wizard or the assignment page.</AlertDescription>
                </Alert>
              )}
              {availabilityAudience !== 'marketplace' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Due date</Label>
                    <Input type="date" value={assignmentDueDate ? tzFormat(assignmentDueDate, 'yyyy-MM-dd') : ''} onChange={(event) => setAssignmentDueDate(event.target.value ? new Date(`${event.target.value}T23:59:59`) : undefined)} data-testid="availability-due-date" />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
                    <Label htmlFor="availability-mandatory">Require completion</Label>
                    <Switch id="availability-mandatory" checked={assignmentMandatory} onCheckedChange={setAssignmentMandatory} data-testid="availability-mandatory" />
                  </div>
                </div>
              )}
            </div>
          )}

          {availabilityStep === 'review' && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Audience</span><span className="font-medium text-foreground">{availabilityAudience === 'own_org' ? 'Own organization' : availabilityAudience === 'marketplace' ? 'Public marketplace' : availabilityAudience === 'showcase' ? 'Showcase' : selectedTargetOrgName}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Pricing</span><span className="font-medium text-foreground">{availabilityAudience === 'own_org' ? 'Internal' : isPaid ? `${currency} ${price || '0'}` : 'Free'}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Target</span><span className="font-medium text-foreground">{availabilityAudience === 'marketplace' ? 'All public learners' : getSelectedAssignmentLabel()}</span></div>
              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <span className="text-muted-foreground">Publish latest changes</span>
                <Badge variant="secondary">Automatic</Badge>
              </div>
              {!isPublished && publishAfterAvailability && publishReadinessMessage && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{publishReadinessMessage}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={() => availabilityStepIndex === 0 ? closeAvailabilityWizard() : setAvailabilityStep(availabilitySteps[availabilityStepIndex - 1])} disabled={availabilityWizardMutation.isPending}>
              {availabilityStepIndex === 0 ? 'Cancel' : 'Back'}
            </Button>
            {availabilityStep === 'review' ? (
              <Button onClick={() => availabilityWizardMutation.mutate()} disabled={availabilityWizardMutation.isPending} data-testid="button-confirm-availability">
                {availabilityWizardMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Availability
              </Button>
            ) : (
              <Button onClick={() => setAvailabilityStep(availabilitySteps[availabilityStepIndex + 1])} disabled={!canContinueAvailability}>
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (courseLoading || frameworkLoading) {
    return (
      <QuizAdminLayout title="Course Editor" description="Loading course...">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-lg text-muted-foreground">Loading course...</span>
        </div>
      </QuizAdminLayout>
    );
  }

  const courseErrorStatus = (courseError as any)?.status;
  if (courseErrorStatus === 404 || !course) {
    return (
      <QuizAdminLayout title="Course Not Found" description="">
        <Alert variant="destructive" className="max-w-md mx-auto">
          <AlertDescription>
            The requested course could not be found. It may have been deleted or you may not have access to it.
          </AlertDescription>
        </Alert>
        <div className="flex justify-center mt-4">
          <Link href="/course-builder">
            <Button data-testid="button-back-to-builder">Back to Course Builder</Button>
          </Link>
        </div>
      </QuizAdminLayout>
    );
  }

  if (courseError) {
    return (
      <QuizAdminLayout title="Course Load Error" description="">
        <Alert variant="destructive" className="max-w-md mx-auto">
          <AlertDescription>
            {(courseError as Error).message || 'Failed to load course details. Please retry.'}
          </AlertDescription>
        </Alert>
        <div className="flex justify-center mt-4">
          <Link href="/course-builder">
            <Button data-testid="button-back-to-builder-error">Back to Course Builder</Button>
          </Link>
        </div>
      </QuizAdminLayout>
    );
  }

  return (
    <QuizAdminLayout
      title="Edit Course"
      description={`Managing: ${course.title}`}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/course-builder">
            <Button variant="outline" data-testid="button-back" >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Courses
            </Button>
          </Link>

          <div className="flex items-center gap-3">
            {courseLanguages && courseLanguages.length > 1 && (
              <Select
                value={courseId || ''}
                onValueChange={(val) => {
                  if (val !== courseId) {
                    setLocation(`/course-builder/${val}/edit`);
                  }
                }}
              >
                <SelectTrigger className="w-auto min-w-[140px] h-9">
                  <Globe className="h-4 w-4 mr-1" />
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent>
                  {courseLanguages.map((lang) => (
                    <SelectItem key={lang.courseId} value={lang.courseId}>
                      {lang.name} ({lang.code.toUpperCase()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {isPublished ? (
              <Badge >
                Published
              </Badge>
            ) : (
              <Badge variant="secondary" >
                Draft
              </Badge>
            )}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href={`/course-builder/${courseId}/lessons`}>
                  <Card 
                    className="bg-surface-base border-2 border-border hover:border-primary hover:shadow-lg hover:shadow-primary/20 transition-all duration-300 cursor-pointer h-full group" 
                    data-testid="card-manage-lessons"
                  >
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-3 rounded-xl bg-surface-base shadow-md group-hover:scale-110 transition-transform">
                            <BookOpen className="h-6 w-6 text-primary-foreground" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors">Manage Lessons</h3>
                            <p className="text-sm text-muted-foreground">{generatedLessonsCount}/{topics.length} lessons created</p>
                            <p className="text-xs text-primary/70 mt-1">Click here to add, edit, or generate lesson content</p>
                          </div>
                        </div>
                        <ChevronRight className="h-6 w-6 text-primary/50 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p>This is where you create and manage all lessons for your course. Generate AI-powered presentations or upload your own content.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {isPublished && (
            <Link href={`/courses/${courseId}`}>
              <Card className="bg-card/50 border-border hover:border-secondary/50 transition-colors cursor-pointer h-full" data-testid="card-view-public">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-secondary/20">
                        <Eye className="h-5 w-5 text-secondary" />
                      </div>
                      <div>
                        <h3 className="font-medium text-foreground">View Public Page</h3>
                        <p className="text-sm text-muted-foreground">
                          {course.totalEnrollments} enrolled
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}

          <Card className="bg-card/50 border-border h-full" data-testid="card-course-stats">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/20">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">Course Stats</h3>
                  <p className="text-sm text-muted-foreground">
                    {course.averageRating ? `${parseFloat(course.averageRating).toFixed(1)}⭐` : 'No ratings'} · {course.totalReviews} reviews
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator className="bg-border" />

        <Card className="bg-card/50 border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-card-foreground">
              <Settings className="h-5 w-5 text-primary" />
              Course Settings
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Edit your course details and pricing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-foreground">Course Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => handleFieldChange(setTitle, e.target.value)}
                placeholder="Enter course title"
                className="bg-input border-border text-foreground"
                data-testid="input-title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-foreground">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => handleFieldChange(setDescription, e.target.value)}
                placeholder="Describe what students will learn"
                className="bg-input border-border text-foreground min-h-[200px] resize-y"
                data-testid="input-description"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="difficulty" className="text-foreground">Difficulty Level</Label>
                <Select value={difficultyLevel} onValueChange={(v) => handleFieldChange(setDifficultyLevel, v)}>
                  <SelectTrigger className="bg-input border-border text-foreground" data-testid="select-difficulty">
                    <SelectValue placeholder="Select difficulty" />
                  </SelectTrigger>
                  <SelectContent>
                    {difficultyLevels.map((level) => (
                      <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category" className="text-foreground flex items-center gap-2">
                  <Tag className="h-4 w-4 text-primary" />
                  Category
                </Label>
                <Popover open={categoryComboboxOpen} onOpenChange={setCategoryComboboxOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={categoryComboboxOpen} className="w-full justify-between" data-testid="select-category" >
                      {selectedCategoryId
                        ? categories.find((cat) => cat.id === selectedCategoryId)?.name || "Select category..."
                        : "No Category"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search categories..." />
                      <CommandList>
                        <CommandEmpty>No category found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="no-category"
                            onSelect={() => {
                              handleFieldChange(setSelectedCategoryId, null);
                              setCategoryComboboxOpen(false);
                            }}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${
                                !selectedCategoryId ? "opacity-100" : "opacity-0"
                              }`}
                            />
                            No Category
                          </CommandItem>
                          {categories.map((cat) => (
                            <CommandItem
                              key={cat.id}
                              value={cat.name}
                              onSelect={() => {
                                handleFieldChange(setSelectedCategoryId, cat.id);
                                setCategoryComboboxOpen(false);
                              }}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${
                                  selectedCategoryId === cat.id ? "opacity-100" : "opacity-0"
                                }`}
                              />
                              {cat.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                        <CommandGroup>
                          <CommandItem
                            value="create-new-category"
                            onSelect={() => {
                              setCategoryComboboxOpen(false);
                              setCategoryCreateSource('settings');
                              setShowCreateCategoryDialog(true);
                            }}
                            className="text-primary"
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Create new category...
                          </CommandItem>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">
                  Organize your course by category
                </p>
                {renderCreateCategoryInlineCard('settings')}
              </div>
            </div>

            <Separator className="bg-border" />

            <div className="space-y-4">
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <Label className="text-foreground font-medium">Availability Summary</Label>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={visibility === 'public' ? 'default' : 'secondary'}>
                      {availabilitySummary}
                    </Badge>
                    <Badge variant="outline">
                      {assignmentsLoading ? 'Checking assignments...' : assignmentScopeLabel}
                    </Badge>
                    {courseAssignments && courseAssignments.length > 1 && (
                      <Badge variant="outline">{courseAssignments.length} assignments</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Use the guided flow to publish, price, showcase, and assign this course.
                  </p>
                </div>
                <Button onClick={openAvailabilityWizard} data-testid="button-open-availability-wizard">
                  <Globe className="mr-2 h-4 w-4" />
                  Set Availability & Assign
                </Button>
              </div>
              <CourseAvailabilityWizard />
            </div>

            <Separator className="bg-border" />

            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <Label className="text-foreground">Course Thumbnail</Label>
                {!balanceLoading && !pricingLoading && thumbnailPricing?.featureEnabled && (
                  <div 
                    className="flex items-center gap-2"
                    data-testid="text-thumbnail-credit-cost"
                    aria-live="polite"
                  >
                    <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 border border-border">
                      <LPCreditIcon size="sm" />
                      <span className="text-sm text-primary font-medium">{balance.toLocaleString()} {LP_CREDITS_SHORT}</span>
                    </span>
                    {showOrgBadge && !orgWalletLoading && (
                      <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary/10 border border-secondary/20">
                        <Building2 className="h-4 w-4 text-secondary" />
                        <span className="text-sm text-secondary font-medium">{orgBalance.toLocaleString()} Org</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Upload an image or use AI to generate a thumbnail (recommended: 16:9 aspect ratio)
              </p>
              
              {thumbnailPreview && (
                <div className="relative w-full max-w-md mb-4">
                  <img
                    src={thumbnailPreview}
                    alt="Course thumbnail"
                    className="w-full h-48 object-cover rounded-lg border border-border"
                    data-testid="img-thumbnail-preview"
                  />
                  {thumbnailSource === 'ai' && (
                    <Badge className="absolute top-2 left-2 backdrop-blur-sm" data-testid="badge-ai-generated-thumbnail" >
                      <Sparkles className="h-3 w-3 mr-1" />
                      AI Generated
                    </Badge>
                  )}
                  <Button variant="destructive" size="icon" className="absolute top-2 right-2 min-h-[44px] min-w-[44px]" onClick={removeThumbnail} data-testid="button-remove-thumbnail" >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 max-w-md">
                <ObjectUploader
                  maxNumberOfFiles={1}
                  maxFileSize={5 * 1024 * 1024}
                  onGetUploadParameters={handleThumbnailUpload}
                  onComplete={handleUploadComplete}
                  buttonClassName="bg-secondary/10 hover:bg-secondary/20 border-2 border-secondary text-secondary font-medium min-h-[48px] sm:min-h-[44px] w-full sm:w-auto"
                  resizeWidth={1280}
                  resizeHeight={720}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {thumbnailPreview ? 'Replace' : 'Upload'}
                </ObjectUploader>

                <Button ref={generateButtonRef} onClick={handleGenerateClick} disabled={ generateThumbnailMutation.isPending || !thumbnailPricing?.featureEnabled || pricingLoading || hybridBalance.isLoading || !hybridBalance.canAfford } className="border min-h-[48px] sm:min-h-[44px] w-full sm:w-auto touch-manipulation" data-testid="button-generate-ai-thumbnail" aria-label={`Generate thumbnail with AI for ${thumbnailPricing?.creditCost ?? 25} credits`} >
                  {generateThumbnailMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  {generateThumbnailMutation.isPending 
                    ? 'Generating...' 
                    : pricingLoading
                      ? 'Loading...'
                      : thumbnailSource === 'ai'
                        ? `Regenerate (${thumbnailPricing?.creditCost ?? 25} ${LP_CREDITS_SHORT})`
                        : `Generate with AI (${thumbnailPricing?.creditCost ?? 25} ${LP_CREDITS_SHORT})`
                  }
                </Button>
              </div>

              {(isUploadingThumbnail || generateThumbnailMutation.isPending) && (
                <div 
                  className="flex items-center gap-2 mt-2 text-sm text-muted-foreground"
                  aria-live="polite"
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isUploadingThumbnail ? 'Saving thumbnail...' : 'Generating AI thumbnail...'}
                </div>
              )}

              {thumbnailGenerationError && (
                <Alert variant="destructive" className="mt-3 max-w-md" data-testid="alert-thumbnail-generation-error" >
                  <AlertDescription className="space-y-2">
                    <p>{thumbnailGenerationError.message}</p>
                    {(thumbnailGenerationError.code === 'ai_unavailable' || thumbnailGenerationError.code === 'invalid_model') && (
                      <div className="flex items-center gap-2 pt-1">
                        <Link href="/admin/integration-settings">
                          <Button variant="outline" size="sm" className="h-8 text-xs" data-testid="button-go-to-ai-settings" >
                            <Settings className="h-3 w-3 mr-1" />
                            Go to Integration Settings
                          </Button>
                        </Link>
                      </div>
                    )}
                    {thumbnailGenerationError.code === 'generation_failed' && (
                      <p className="text-xs text-muted-foreground">
                        Click "Generate with AI" to try again.
                      </p>
                    )}
                    {thumbnailGenerationError.code === 'rate_limited' && (
                      <p className="text-xs text-muted-foreground">
                        The AI service is temporarily rate limited. Please wait and try again.
                      </p>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {!thumbnailPricing?.featureEnabled && !pricingLoading && (
                <p className="text-sm text-primary">
                  AI thumbnail generation is currently unavailable.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button onClick={handleSaveCourse} disabled={updateCourseMutation.isPending || !hasChanges} data-testid="button-save-changes" >
              {updateCourseMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
            
            {hasChanges && (
              <span className="text-sm text-primary">Unsaved changes</span>
            )}
          </div>

          {!isPublished ? (
            courseLanguages && courseLanguages.length > 1 ? (
              <Button onClick={() => setShowPublishDialog(true)}
                data-testid="button-publish-course"
              >
                <Send className="h-4 w-4 mr-2" />
                Publish Course Languages
              </Button>
            ) : (
              <Button
                onClick={openAvailabilityWizard}
                disabled={validationLoading}
                data-testid="button-publish-course"
              >
                {validationLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Set Availability & Publish
              </Button>
            )
          ) : (
            <div className="flex items-center gap-2">
              {courseLanguages && courseLanguages.length > 1 && (
                <Button variant="outline" onClick={() => setShowPublishDialog(true)}
                  data-testid="button-manage-language-publishing"
                >
                  <Globe className="h-4 w-4 mr-2" />
                  Manage Languages
                </Button>
              )}
              <Button onClick={openAvailabilityWizard}
                data-testid="button-assign-course"
              >
                <Users className="h-4 w-4 mr-2" />
                Set Availability & Assign
              </Button>
            </div>
          )}
        </div>

        {!canPublish && !isPublished && !validationLoading && validationErrors.length > 0 && (
          <Alert >
            <AlertDescription className="text-warning">
              <strong>Before publishing:</strong> {validationErrors[0]}
              {validationErrors.length > 1 && ` (+${validationErrors.length - 1} more issues)`}
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* AI Thumbnail Generation Confirmation Dialog */}
      <AlertDialog 
        open={showGenerateConfirmDialog} 
        onOpenChange={(open: boolean) => {
          setShowGenerateConfirmDialog(open);
          if (!open) {
            setTimeout(() => generateButtonRef.current?.focus(), 100);
          }
        }}
      >
        <AlertDialogContent 
          className="max-w-[min(425px,90vw)] p-[var(--dialog-padding)] bg-background border-primary/30"
          data-testid="dialog-confirm-thumbnail-generation"
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              Generate AI Thumbnail
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                This will generate a new thumbnail using AI based on your course title and description.
              </p>
              <div className="bg-primary/10 border border-border p-3 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Credits to charge:</span>
                  <span className="text-primary font-medium">
                    {thumbnailPricing?.creditCost ?? 25} {LP_CREDITS_SHORT}
                  </span>
                </div>
              </div>
              {thumbnailSource === 'ai' && (
                <div className="bg-warning/10 border border-[var(--warning)]/20 p-3 rounded-lg">
                  <p className="text-warning text-sm">
                    ⚠️ This will replace your current AI-generated thumbnail.
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel 
              className="min-h-[48px] sm:min-h-[44px] touch-manipulation w-full sm:w-auto"
              data-testid="button-cancel-generate-thumbnail"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmGenerate}
              disabled={generateThumbnailMutation.isPending}
              className="bg-primary hover:bg-primary/90 border border-accent/30 min-h-[48px] sm:min-h-[44px] touch-manipulation w-full sm:w-auto"
              data-testid="button-confirm-generate-thumbnail"
            >
              {generateThumbnailMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Coins className="h-4 w-4 mr-2" />
              )}
              {generateThumbnailMutation.isPending ? 'Generating...' : 'Generate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Insufficient Credits (Inline) */}
      {showInsufficientCreditsModal && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive">Insufficient Credits</CardTitle>
            <CardDescription>
              You need {(insufficientCreditsData?.required ?? (thumbnailPricing?.creditCost ?? 25))} {LP_CREDITS_SHORT} but only have {(insufficientCreditsData?.current ?? hybridBalance.totalAvailable)}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-end">
            <Button onClick={() => {
                setShowInsufficientCreditsModal(false);
                setInsufficientCreditsData(null);
                setTimeout(() => generateButtonRef.current?.focus(), 100);
              }}
            >
              Close
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Validation Error Modal */}
      <Dialog open={showValidationErrorModal} onOpenChange={setShowValidationErrorModal}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Course Needs Attention Before Assigning
            </DialogTitle>
            <DialogDescription>
              Please complete the following items before you can assign this course to learners.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {assignmentValidationData?.lessonDetails && assignmentValidationData.lessonDetails.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-foreground">Lessons requiring quizzes:</h4>
                <div className="space-y-2">
                  {assignmentValidationData.lessonDetails
                    .filter(lesson => lesson.requiresQuiz && !lesson.hasQuiz)
                    .map((lesson, index) => (
                      <div key={lesson.lessonId} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-destructive/10 flex items-center justify-center">
                          <span className="text-xs font-medium text-destructive">{lesson.topicOrder}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{lesson.lessonTitle}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {lesson.lessonType === 'overview' ? 'Overview' : lesson.lessonType === 'key_takeaways' ? 'Key Takeaways' : 'Content'}
                            </Badge>
                            {lesson.generationStatus !== 'completed' && lesson.generationStatus !== 'published' && (
                              <Badge variant="secondary" className="text-xs">
                                Lesson not generated
                              </Badge>
                            )}
                            <Badge variant="secondary" className="text-xs">
                              Quiz required
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
            
            {assignmentValidationData?.errors && assignmentValidationData.errors.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <h4 className="text-sm font-medium text-foreground">Additional issues:</h4>
                <ul className="space-y-1">
                  {assignmentValidationData.errors
                    .filter(err => !err.includes('requires a linked quiz'))
                    .map((error, index) => (
                      <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                        {error}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <p className="text-xs text-muted-foreground flex-1">
              Generate quizzes for each lesson using the lesson editor, then try assigning again.
            </p>
            <Button onClick={() => setShowValidationErrorModal(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPublishDialog} onOpenChange={setShowPublishDialog}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Publish Course Languages
            </DialogTitle>
            <DialogDescription>
              Select which language versions to make active and available to learners.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {!publishReadiness ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              publishReadiness.languages?.map((lang: any) => {
                const isAlreadyActive = lang.status === 'active';
                const isChecked = isAlreadyActive || selectedLanguages.includes(lang.languageCode);
                const isDisabled = isAlreadyActive || !lang.ready;

                return (
                  <div key={lang.courseId} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={`lang-${lang.languageCode}`}
                        checked={isChecked}
                        disabled={isDisabled}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedLanguages(prev => [...prev, lang.languageCode]);
                          } else {
                            setSelectedLanguages(prev => prev.filter(l => l !== lang.languageCode));
                          }
                        }}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`lang-${lang.languageCode}`} className="font-medium cursor-pointer">
                            {lang.languageName}
                          </Label>
                          {lang.isSource && (
                            <Badge variant="outline" className="text-xs">Source</Badge>
                          )}
                          {isAlreadyActive ? (
                            <Badge className="text-xs">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              {lang.status === 'draft' ? 'Draft' : lang.status}
                            </Badge>
                          )}
                          {lang.ready ? (
                            <Badge className="text-xs">
                              Ready
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              Not Ready
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {lang.totalLessons} lesson{lang.totalLessons !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    {!lang.ready && lang.issues && lang.issues.length > 0 && (
                      <div className="ml-7 space-y-1">
                        {lang.issues.slice(0, 5).map((issue: any, idx: number) => (
                          <p key={idx} className="text-xs text-destructive">
                            {issue.lessonTitle}: {issue.missingAssets.join(', ')}
                          </p>
                        ))}
                        {lang.issues.length > 5 && (
                          <p className="text-xs text-muted-foreground">
                            ...and {lang.issues.length - 5} more issues
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowPublishDialog(false); setSelectedLanguages([]); }}>
              Cancel
            </Button>
            <Button onClick={() => publishLanguagesMutation.mutate(selectedLanguages)}
              disabled={selectedLanguages.length === 0 || publishLanguagesMutation.isPending}
            >
              {publishLanguagesMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Publish Selected ({selectedLanguages.length})
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </QuizAdminLayout>
  );
}

const Wand2 = FileText;
