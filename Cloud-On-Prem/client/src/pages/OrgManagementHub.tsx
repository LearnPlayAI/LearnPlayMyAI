import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, DragCancelEvent, useDraggable, useDroppable, closestCenter } from '@dnd-kit/core';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient, invalidateCourseScopeCaches, invalidateOrgStructureCaches } from '@/lib/queryClient';
import { ChevronRight, ChevronDown, Users, Building2, FolderTree, GripVertical, Link2, User, Plus, Pencil, Trash2, UserPlus, Copy, RefreshCw, Settings, X, Search, BookOpen, Calendar, ArrowRightLeft, Languages } from 'lucide-react';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { TIMEZONES } from '@/utils/timezones';
import { usePlatformMode } from '@/hooks/usePlatformMode';
import { getActiveTimezone } from '@/utils/timezoneRuntime';

interface HierarchySubject {
  id: string;
  name: string;
  description?: string | null;
  assignmentId?: string;
  unitId?: string;
}

interface HierarchyNode {
  id: string;
  name: string;
  type: 'department' | 'subject' | 'unit' | 'team' | 'organization';
  joinCode: string | null;
  displayOrder: number;
  directCount: number;
  totalCount: number;
  isShowcaseDepartment?: boolean;
  subjects?: HierarchySubject[];
  subjectId?: string;
  subjectDescription?: string | null;
  unitId?: string;
  children: HierarchyNode[];
  isPartner?: boolean;
  partnerOrgId?: string;
}

interface HierarchyResponse {
  organizationId: string;
  hierarchy: HierarchyNode[];
  totals: {
    departments: number;
    units: number;
    teams: number;
    users: number;
  };
  organization?: {
    timezone?: string;
    currency?: string;
  };
}

interface NodeUser {
  id: string;
  userId?: string;
  unitId?: string | null;
  subjectId?: string | null;
  subUnitId?: string | null;
  teamId?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  gamerName: string;
}

function getCanonicalUserId(user: NodeUser): string {
  return user.userId || user.id;
}

interface SelectedNode {
  id: string;
  type: 'department' | 'subject' | 'unit' | 'team' | 'organization';
  subjectId?: string;
  unitId?: string;
  orgId?: string;
  isPartner?: boolean;
  isShowcaseDepartment?: boolean;
}

function DraggableUserItem({ 
  user, 
  children, 
  activeDragId,
  organizationId 
}: { 
  user: NodeUser; 
  children?: JSX.Element;
  activeDragId: string | null;
  organizationId: string;
}) {
  const canonicalUserId = getCanonicalUserId(user);
  const dragId = `user-${canonicalUserId}`;
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: dragId,
    data: { type: 'user', user },
  });

  const isBeingDragged = activeDragId === dragId;

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-3 p-3 rounded-lg border bg-card transition-colors ${
        isBeingDragged ? 'opacity-30 ring-2 ring-primary scale-95' : 'hover:bg-accent/50'
      }`}
    >
      <div {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing p-1 -m-1 hover:bg-accent rounded">
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>
      <Link 
        href={`/organization/${organizationId}/users/${canonicalUserId}`}
        className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 cursor-pointer"
      >
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
          <User className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate text-primary hover:underline">
            {user.firstName} {user.lastName}
          </p>
          <p className="text-xs text-muted-foreground truncate">{user.gamerName || user.email}</p>
        </div>
      </Link>
      {children}
    </div>
  );
}

function DroppableTreeNode({
  node,
  level,
  isExpanded,
  isSelected,
  onToggle,
  onSelect,
  terminology,
}: {
  node: HierarchyNode;
  level: number;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onSelect: () => void;
  terminology: { unit: string; subUnit: string; team: string };
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `node-${node.type}-${node.id}`,
    data: { type: 'node', node },
    disabled: node.isPartner,
  });

  const hasChildren = node.children && node.children.length > 0;
  const hasSubjects = node.subjects && node.subjects.length > 0;
  // Teams are expandable if they have direct users, even without child nodes
  const isExpandable = hasChildren || hasSubjects || (node.type === 'team' && node.directCount > 0);
  
  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'department':
        return <Building2 className="w-4 h-4" />;
      case 'subject':
        return <BookOpen className="w-4 h-4" />;
      case 'unit':
        return <FolderTree className="w-4 h-4" />;
      case 'team':
        return <Users className="w-4 h-4" />;
      case 'organization':
        return <Building2 className="w-4 h-4" />;
      default:
        return <FolderTree className="w-4 h-4" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'department':
        return terminology.unit;
      case 'subject':
        return 'Subject';
      case 'unit':
        return terminology.subUnit;
      case 'team':
        return terminology.team;
      case 'organization':
        return 'Organization';
      default:
        return type;
    }
  };

  return (
    <div ref={setNodeRef}>
      <div
        className={`flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer transition-all duration-200 ${
          isSelected ? 'bg-primary/20 border border-border' : 'hover:bg-accent/50'
        } ${isOver ? 'ring-2 ring-primary ring-offset-2 ring-offset-background bg-primary/20 scale-[1.02] shadow-md' : ''}`}
        style={{ paddingLeft: `${level * 20 + 12}px` }}
        onClick={onSelect}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="p-0.5 hover:bg-accent rounded"
          disabled={!isExpandable}
        >
          {isExpandable ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )
          ) : (
            <div className="w-4 h-4" />
          )}
        </button>
        
        <div className={`p-1.5 rounded ${
          node.type === 'organization' ? 'bg-warning/20 text-warning' :
          node.type === 'department' ? 'bg-primary/20 text-primary' :
          node.type === 'subject' ? 'bg-muted text-muted-foreground' :
          node.type === 'unit' ? 'bg-success/20 text-success' :
          'bg-primary/20 text-primary'
        }`}>
          {getNodeIcon(node.type)}
        </div>
        
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm">{node.name}</span>
          <span className="text-xs text-muted-foreground ml-2">
            ({node.directCount} direct) [Total: {node.totalCount}]
          </span>
        </div>
        
        <Badge variant="outline" className="text-xs shrink-0">
          {getTypeLabel(node.type)}
        </Badge>
        {node.type === 'department' && node.isShowcaseDepartment && (
          <Badge variant="warning" className="text-xs shrink-0 border-0">
            Showcase
          </Badge>
        )}
        {node.isPartner && (
          <Badge variant="outline" className="text-xs shrink-0">
            Partner
          </Badge>
        )}
      </div>
    </div>
  );
}

function InlineNodeUsers({
  organizationId,
  nodeType,
  nodeId,
  subjectId,
  level,
  searchTerm,
}: {
  organizationId: string;
  nodeType: string;
  nodeId: string;
  subjectId?: string;
  level: number;
  searchTerm?: string;
}) {
  const { data: users, isLoading } = useQuery<NodeUser[]>({
    queryKey: organizationId 
      ? ['/api/organization', organizationId, 'hierarchy', nodeType, nodeId, subjectId || null, 'members', 'direct-inline']
      : ['skip'],
    queryFn: async () => {
      if (!organizationId) return [];
      const params = new URLSearchParams({ scope: 'direct' });
      if (subjectId && nodeType !== 'subject') params.set('subjectId', subjectId);
      const res = await fetch(`/api/organization/${organizationId}/hierarchy/${nodeType}/${nodeId}/members?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch members');
      const data = await res.json();
      return data.members || [];
    },
    staleTime: 30000,
    enabled: !!organizationId && !!nodeId,
  });

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    if (!searchTerm?.trim()) return users;
    
    const query = searchTerm.toLowerCase().trim();
    return users.filter((user) => {
      const fullName = `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase();
      return (
        fullName.includes(query) ||
        (user.email?.toLowerCase().includes(query) ?? false) ||
        (user.gamerName?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [users, searchTerm]);

  if (!organizationId) {
    return null;
  }

  if (isLoading) {
    return (
      <div 
        className="flex items-center gap-2 py-1.5 px-3 text-muted-foreground"
        style={{ paddingLeft: `${(level + 1) * 20 + 24}px` }}
      >
        <Skeleton className="w-5 h-5 rounded-full" />
        <Skeleton className="w-24 h-3" />
      </div>
    );
  }

  if (!filteredUsers || filteredUsers.length === 0) {
    return null;
  }

  return (
    <div className="space-y-0.5">
      {filteredUsers.map((user) => (
        <div
          key={getCanonicalUserId(user)}
          className="flex items-center gap-2 py-1.5 px-3 rounded hover:bg-accent/30 transition-colors cursor-pointer group"
          style={{ paddingLeft: `${(level + 1) * 20 + 24}px` }}
        >
          <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0">
            <User className="w-3 h-3 text-muted-foreground" />
          </div>
          <Link
            href={`/organization/${organizationId}/users/${getCanonicalUserId(user)}`}
            className="text-xs text-muted-foreground group-hover:text-foreground truncate hover:underline"
          >
            {user.firstName} {user.lastName}
          </Link>
        </div>
      ))}
    </div>
  );
}

function TreeNode({
  node,
  level,
  expandedNodes,
  selectedNode,
  onToggle,
  onSelect,
  terminology,
  organizationId,
  searchTerm,
}: {
  node: HierarchyNode;
  level: number;
  expandedNodes: Set<string>;
  selectedNode: SelectedNode | null;
  onToggle: (nodeId: string) => void;
  onSelect: (node: SelectedNode) => void;
  terminology: { unit: string; subUnit: string; team: string; subjectPlural: string };
  organizationId: string;
  searchTerm?: string;
}) {
  const nodeKey = `${node.type}-${node.id}`;
  const isExpanded = expandedNodes.has(nodeKey);
  const isSelected = selectedNode?.id === node.id && selectedNode?.type === node.type;

  return (
    <div>
      <DroppableTreeNode
        node={node}
        level={level}
        isExpanded={isExpanded}
        isSelected={isSelected}
        onToggle={() => onToggle(nodeKey)}
        onSelect={() => onSelect({ id: node.id, type: node.type, subjectId: node.subjectId, unitId: node.unitId, isShowcaseDepartment: node.isShowcaseDepartment })}
        terminology={terminology}
      />
      
      {isExpanded && organizationId && (
        <>
          <InlineNodeUsers
            organizationId={organizationId}
            nodeType={node.type}
            nodeId={node.id}
            subjectId={node.subjectId}
            level={level}
            searchTerm={searchTerm}
          />
          {node.children && node.children.length > 0 && (
            <div>
              {node.children.map((child) => (
                <TreeNode
                  key={`${child.type}-${child.id}`}
                  node={child}
                  level={level + 1}
                  expandedNodes={expandedNodes}
                  selectedNode={selectedNode}
                  onToggle={onToggle}
                  onSelect={onSelect}
                  terminology={terminology}
                  organizationId={organizationId}
                  searchTerm={searchTerm}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function HierarchySkeleton() {
  return (
    <div className="space-y-2 p-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-2" style={{ paddingLeft: `${(i % 3) * 20 + 12}px` }}>
          <Skeleton className="w-4 h-4" />
          <Skeleton className="w-6 h-6 rounded" />
          <Skeleton className="h-4 flex-1 max-w-[200px]" />
          <Skeleton className="w-16 h-5" />
        </div>
      ))}
    </div>
  );
}

function DetailPanelSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-32" />
      <div className="space-y-2 mt-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3">
            <Skeleton className="w-4 h-4" />
            <Skeleton className="w-8 h-8 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-32 mb-1" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OrgManagementHub() {
  const { toast } = useToast();
  const { effectiveOrganizationId, isSuperAdmin, isOrgAdmin } = useAuth();
  const { terminology, terminologyLower, isResolved } = useOrganizationTerminology();
  const { baseUrl: platformBaseUrl, onpremMode } = usePlatformMode();
  
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [activeDragUser, setActiveDragUser] = useState<NodeUser | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [createDepartmentOpen, setCreateDepartmentOpen] = useState(false);
  const [createUnitOpen, setCreateUnitOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [editNodeOpen, setEditNodeOpen] = useState(false);
  const [deleteNodeOpen, setDeleteNodeOpen] = useState(false);
  const [assignUsersOpen, setAssignUsersOpen] = useState(false);
  const [newNodeName, setNewNodeName] = useState('');
  const [newJoinCode, setNewJoinCode] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [orgTimezone, setOrgTimezone] = useState(() => getActiveTimezone());
  const [orgCurrency, setOrgCurrency] = useState('USD');
  const [orgLanguage, setOrgLanguage] = useState('en');
  const [memberScope, setMemberScope] = useState<'direct' | 'all'>('direct');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [hierarchySearch, setHierarchySearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [rightPanelTab, setRightPanelTab] = useState<'members' | 'courses'>('members');
  const [crossOrgAssignOpen, setCrossOrgAssignOpen] = useState(false);
  const [crossOrgTargetUser, setCrossOrgTargetUser] = useState<NodeUser | null>(null);
  const [crossOrgTargetOrgId, setCrossOrgTargetOrgId] = useState<string>('');
  const [crossOrgRequestedRole, setCrossOrgRequestedRole] = useState<string>('learner');
  const [assignCourseOpen, setAssignCourseOpen] = useState(false);
  const [assignCourseId, setAssignCourseId] = useState('');
  const [assignDueDate, setAssignDueDate] = useState('');
  const [assignMandatory, setAssignMandatory] = useState(false);
  const [editAssignmentOpen, setEditAssignmentOpen] = useState(false);
  const [editAssignmentId, setEditAssignmentId] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editMandatory, setEditMandatory] = useState(false);
  const [removeAssignmentOpen, setRemoveAssignmentOpen] = useState(false);
  const [removeAssignmentId, setRemoveAssignmentId] = useState('');
  const [removeCourseName, setRemoveCourseName] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(hierarchySearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [hierarchySearch]);

  const organizationId = effectiveOrganizationId;

  const { data: hierarchyData, isLoading: hierarchyLoading } = useQuery<HierarchyResponse>({
    queryKey: ['/api/organization/hierarchy', organizationId],
    enabled: !!organizationId,
  });

  const { data: nodeUsers, isLoading: usersLoading } = useQuery<NodeUser[]>({
    queryKey: ['/api/organization', organizationId, 'hierarchy', selectedNode?.type, selectedNode?.id, selectedNode?.subjectId || null, 'members', memberScope],
    queryFn: async () => {
      if (!selectedNode || !organizationId) return [];
      const params = new URLSearchParams({ scope: memberScope });
      if (selectedNode.subjectId && selectedNode.type !== 'subject') params.set('subjectId', selectedNode.subjectId);
      const res = await fetch(`/api/organization/${organizationId}/hierarchy/${selectedNode.type}/${selectedNode.id}/members?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch members');
      const data = await res.json();
      return data.members || [];
    },
    enabled: !!selectedNode && !!organizationId,
  });

  const isPartnerSelected = selectedNode?.isPartner === true;
  const selectedPartnerOrgId = selectedNode?.orgId;

  const getPartnerScopeInfo = useMemo(() => {
    if (!selectedNode?.isPartner) return null;
    const id = selectedNode.id;
    const match = id.match(/^partner-[^-]+-(\w+)-(.+)$/);
    if (!match) return null;
    const typeMap: Record<string, string> = { dept: 'department', unit: 'unit', team: 'team' };
    return { scopeType: typeMap[match[1]] || match[1], scopeId: match[2] };
  }, [selectedNode]);

  const { data: scopeCourses, isLoading: coursesLoading } = useQuery<{
    courses: Array<{
      course: { id: string; title: string; description: string | null; thumbnailUrl: string | null; status: string };
      assignment: { id: string; dueDate: string | null; mandatory: boolean };
    }>;
  }>({
    queryKey: isPartnerSelected && getPartnerScopeInfo
      ? ['/api/interorg/target-orgs', selectedPartnerOrgId, 'scope-courses', getPartnerScopeInfo.scopeType, getPartnerScopeInfo.scopeId]
      : ['/api/organization', organizationId, 'hierarchy', selectedNode?.type, selectedNode?.id, 'courses', { includeChildren: false, subjectId: selectedNode?.subjectId || null }],
    queryFn: async () => {
      if (isPartnerSelected && getPartnerScopeInfo && selectedPartnerOrgId) {
        const response = await fetch(
          `/api/interorg/target-orgs/${selectedPartnerOrgId}/scope-courses?scopeType=${getPartnerScopeInfo.scopeType}&scopeId=${getPartnerScopeInfo.scopeId}`,
          { credentials: 'include' }
        );
        if (!response.ok) throw new Error('Failed to fetch cross-org courses');
        return response.json();
      }
      const params = new URLSearchParams({ includeChildren: 'false' });
      if (selectedNode?.subjectId && selectedNode.type !== 'subject') params.set('subjectId', selectedNode.subjectId);
      const response = await fetch(
        `/api/organization/${organizationId}/hierarchy/${selectedNode?.type}/${selectedNode?.id}/courses?${params.toString()}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch courses');
      return response.json();
    },
    enabled: !!selectedNode && (isPartnerSelected ? !!getPartnerScopeInfo && !!selectedPartnerOrgId : !!organizationId) && rightPanelTab === 'courses',
    staleTime: 0,
  });

  const { data: orgUsers } = useQuery<NodeUser[]>({
    queryKey: ['/api/organization', organizationId, 'users'],
    queryFn: async () => {
      if (!organizationId) return [];
      const res = await fetch(`/api/organization/${organizationId}/users`);
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      return data.users || [];
    },
    enabled: !!organizationId,
  });

  const { data: orgSettings } = useQuery<{ timezone?: string; currency?: string; defaultLanguage?: string }>({
    queryKey: ['/api/organization', organizationId, 'settings'],
    queryFn: async () => {
      if (!organizationId) return {};
      const res = await fetch(`/api/organization/${organizationId}/settings`);
      if (!res.ok) return {};
      const data = await res.json();
      return data.organization || {};
    },
    enabled: !!organizationId,
  });

  const { data: searchResults } = useQuery<{
    nodes: Array<{ id: string; name: string; type: string }>;
    users: Array<{ id: string; firstName: string; lastName: string; email: string }>;
    courses: Array<{ id: string; title: string; status: string; thumbnailUrl: string | null }>;
  }>({
    queryKey: ['/api/organization', organizationId, 'search', { q: debouncedSearch }],
    enabled: !!organizationId && debouncedSearch.length >= 2,
  });

  const { data: orgDetails } = useQuery<{ isShowcaseOrg?: boolean }>({
    queryKey: ['/api/organization', organizationId, 'details'],
    queryFn: async () => {
      if (!organizationId) return {};
      const res = await fetch(`/api/organizations/${organizationId}`, { credentials: 'include' });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!organizationId && isOrgAdmin,
  });

  const isShowcaseOrg = orgDetails?.isShowcaseOrg || false;

  const { data: availableOrgs } = useQuery<{ organizations: Array<{ id: string; name: string; type: string }> }>({
    queryKey: ['/api/admin/cross-org-assignment/organizations'],
    enabled: crossOrgAssignOpen && isShowcaseOrg,
  });

  const { data: supportedLanguages } = useQuery<Array<{ code: string; name: string; nativeName: string }>>({
    queryKey: ['/api/languages'],
    enabled: !!organizationId,
  });

  const scopeCourseIds = useMemo(() => {
    return scopeCourses?.courses?.map(c => c.course.id) || [];
  }, [scopeCourses]);

  const { data: scopeCourseLanguages } = useQuery<Record<string, { languages: Array<{ code: string }> }>>({
    queryKey: ['/api/courses/batch-languages', scopeCourseIds.join(',')],
    queryFn: async () => {
      if (scopeCourseIds.length === 0) return {};
      const response = await fetch('/api/courses/batch-languages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseIds: scopeCourseIds }),
        credentials: 'include',
      });
      if (!response.ok) return {};
      return response.json();
    },
    enabled: scopeCourseIds.length > 0 && rightPanelTab === 'courses',
  });

  const updateOrgLanguageMutation = useMutation({
    mutationFn: async (languageCode: string) => {
      return await apiRequest(`/api/organizations/${organizationId}/language`, {
        method: 'PATCH',
        body: JSON.stringify({ languageCode }),
      });
    },
    onSuccess: () => {
      toast({ title: 'Default language updated successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/organization', organizationId, 'settings'] });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to update language', description: error.message, variant: 'destructive' });
    },
  });

  useEffect(() => {
    if (orgSettings?.timezone) {
      setOrgTimezone(orgSettings.timezone);
    }
    if (orgSettings?.currency) {
      setOrgCurrency(orgSettings.currency);
    }
    if (orgSettings?.defaultLanguage) {
      setOrgLanguage(orgSettings.defaultLanguage);
    }
  }, [orgSettings]);

  const { data: partnerOrgs } = useQuery<Array<{ id: string; name: string; ruleId: string }>>({
    queryKey: ['/api/interorg/target-orgs'],
    enabled: onpremMode,
  });

  const { data: partnerHierarchies } = useQuery<Record<string, { units: Array<{ id: string; name: string; subUnits: Array<{ id: string; name: string; teams: Array<{ id: string; name: string }> }> }> }>>({
    queryKey: ['/api/interorg/partner-hierarchies', partnerOrgs?.map(o => o.id).join(',')],
    queryFn: async () => {
      if (!partnerOrgs || partnerOrgs.length === 0) return {};
      const result: Record<string, any> = {};
      for (const org of partnerOrgs) {
        try {
          const res = await fetch(`/api/interorg/target-orgs/${org.id}/hierarchy`, { credentials: 'include' });
          if (res.ok) result[org.id] = await res.json();
        } catch (e) { /* skip failed orgs */ }
      }
      return result;
    },
    enabled: onpremMode && !!partnerOrgs && partnerOrgs.length > 0,
    staleTime: 60000,
  });

  const partnerHierarchyNodes = useMemo((): HierarchyNode[] => {
    if (!onpremMode || !partnerOrgs || !partnerHierarchies) return [];
    
    return partnerOrgs.map(org => {
      const hierarchy = partnerHierarchies[org.id];
      const units = hierarchy?.units || [];
      
      const convertToNodes = (units: any[]): HierarchyNode[] => {
        return units.map(unit => ({
          id: `partner-${org.id}-dept-${unit.id}`,
          name: unit.name,
          type: 'department' as const,
          joinCode: null,
          displayOrder: 0,
          directCount: 0,
          totalCount: 0,
          isPartner: true,
          isShowcaseDepartment: unit.isShowcaseDepartment === true || String(unit.name || '').trim().toLowerCase() === 'showcase',
          partnerOrgId: org.id,
          children: (unit.subUnits || []).map((sub: any) => ({
            id: `partner-${org.id}-unit-${sub.id}`,
            name: sub.name,
            type: 'unit' as const,
            joinCode: null,
            displayOrder: 0,
            directCount: 0,
            totalCount: 0,
            isPartner: true,
            partnerOrgId: org.id,
            children: (sub.teams || []).map((team: any) => ({
              id: `partner-${org.id}-team-${team.id}`,
              name: team.name,
              type: 'team' as const,
              joinCode: null,
              displayOrder: 0,
              directCount: 0,
              totalCount: 0,
              isPartner: true,
              partnerOrgId: org.id,
              children: [],
            })),
          })),
        }));
      };

      return {
        id: `partner-org-${org.id}`,
        name: org.name,
        type: 'organization' as const,
        joinCode: null,
        displayOrder: 0,
        directCount: 0,
        totalCount: units.length,
        isPartner: true,
        partnerOrgId: org.id,
        children: convertToNodes(units),
      };
    });
  }, [onpremMode, partnerOrgs, partnerHierarchies]);

  const { data: orgCourses } = useQuery<Array<{ id: string; title: string; description: string | null; thumbnailUrl: string | null; status: string; visibility: string }>>({
    queryKey: ['/api/organization/assignable-courses'],
    enabled: assignCourseOpen && !selectedNode?.isPartner,
  });

  const { data: publicCourses } = useQuery<Array<{ id: string; title: string; description: string | null; thumbnailUrl: string | null; status: string; visibility: string }>>({
    queryKey: ['/api/interorg/my-public-courses'],
    enabled: assignCourseOpen && !!selectedNode?.isPartner && onpremMode,
  });
  const assignableCourses = selectedNode?.isPartner ? publicCourses : orgCourses;

  const assignCourseMutation = useMutation({
    mutationFn: async (data: { courseId: string; dueDate?: string; mandatory: boolean }) => {
      const body: any = {
        courseId: data.courseId,
        mandatory: data.mandatory,
      };
      if (data.dueDate) body.dueDate = new Date(data.dueDate).toISOString();
      
      if (selectedNode?.isPartner && selectedNode?.orgId) {
        body.targetOrganizationId = selectedNode.orgId;
      }
      
      if (selectedNode) {
        if (selectedNode.isPartner && getPartnerScopeInfo) {
          const scopeMap: Record<string, string> = { department: 'unitId', unit: 'subUnitId', team: 'teamId' };
          const field = scopeMap[getPartnerScopeInfo.scopeType];
          if (field) body[field] = getPartnerScopeInfo.scopeId;
          body.assignmentScope = getPartnerScopeInfo.scopeType;
        } else if (selectedNode.type === 'department') {
          body.unitId = selectedNode.id;
          body.assignmentScope = 'department';
        } else if (selectedNode.type === 'subject') {
          body.unitId = selectedNode.unitId;
          body.subjectId = selectedNode.id;
          body.assignmentScope = 'subject';
        } else if (selectedNode.type === 'unit') {
          body.subjectId = selectedNode.subjectId;
          body.subUnitId = selectedNode.id;
          body.assignmentScope = 'unit';
        } else if (selectedNode.type === 'team') {
          body.subjectId = selectedNode.subjectId;
          body.teamId = selectedNode.id;
          body.assignmentScope = 'team';
        } else {
          body.assignmentScope = 'organization';
        }
      }
      
      return await apiRequest('/api/course-assignments', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast({ title: 'Course assigned successfully' });
      setAssignCourseOpen(false);
      setAssignCourseId('');
      setAssignDueDate('');
      setAssignMandatory(false);
      if (selectedNode?.isPartner) {
        queryClient.invalidateQueries({ queryKey: ['/api/interorg/target-orgs', selectedNode.orgId, 'scope-courses'] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['/api/organization', organizationId, 'hierarchy', selectedNode?.type, selectedNode?.id, 'courses'] });
      }
    },
    onError: (error: any) => {
      toast({ title: 'Failed to assign course', description: error.message, variant: 'destructive' });
    },
  });

  const editAssignmentMutation = useMutation({
    mutationFn: async (data: { id: string; dueDate?: string | null; mandatory: boolean }) => {
      const body: any = { mandatory: data.mandatory };
      if (data.dueDate) {
        body.dueDate = new Date(data.dueDate).toISOString();
      } else {
        body.dueDate = null;
      }
      return await apiRequest(`/api/course-assignments/${data.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast({ title: 'Assignment updated successfully' });
      setEditAssignmentOpen(false);
      setEditAssignmentId('');
      setEditDueDate('');
      setEditMandatory(false);
      if (selectedNode?.isPartner) {
        queryClient.invalidateQueries({ queryKey: ['/api/interorg/target-orgs', selectedNode.orgId, 'scope-courses'] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['/api/organization', organizationId, 'hierarchy', selectedNode?.type, selectedNode?.id, 'courses'] });
      }
    },
    onError: (error: any) => {
      toast({ title: 'Failed to update assignment', description: error.message, variant: 'destructive' });
    },
  });

  const removeAssignmentMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/course-assignments/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      toast({ title: 'Assignment removed successfully' });
      setRemoveAssignmentOpen(false);
      setRemoveAssignmentId('');
      setRemoveCourseName('');
      if (selectedNode?.isPartner) {
        queryClient.invalidateQueries({ queryKey: ['/api/interorg/target-orgs', selectedNode.orgId, 'scope-courses'] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['/api/organization', organizationId, 'hierarchy', selectedNode?.type, selectedNode?.id, 'courses'] });
      }
    },
    onError: (error: any) => {
      toast({ title: 'Failed to remove assignment', description: error.message, variant: 'destructive' });
    },
  });

  useEffect(() => {
    if (selectedNode?.isPartner) {
      setRightPanelTab('courses');
    }
  }, [selectedNode]);

  useEffect(() => {
    if (!selectedNode && hierarchyData?.hierarchy && hierarchyData.hierarchy.length > 0) {
      const firstNode = hierarchyData.hierarchy[0];
      setSelectedNode({ id: firstNode.id, type: firstNode.type });
      setExpandedNodes(new Set([`${firstNode.type}-${firstNode.id}`]));
    }
  }, [hierarchyData, selectedNode]);

  const selectedNodeData = useMemo(() => {
    if (!selectedNode) return null;
    
    const findNode = (nodes: HierarchyNode[]): HierarchyNode | null => {
      for (const node of nodes) {
        const subjectMatches = selectedNode.subjectId
          ? node.subjectId === selectedNode.subjectId
          : !node.subjectId;
        if (node.id === selectedNode.id && node.type === selectedNode.type && subjectMatches) {
          return node;
        }
        if (node.children) {
          const found = findNode(node.children);
          if (found) return found;
        }
      }
      return null;
    };
    
    if (hierarchyData) {
      const found = findNode(hierarchyData.hierarchy);
      if (found) return found;
    }
    
    return findNode(partnerHierarchyNodes);
  }, [selectedNode, hierarchyData, partnerHierarchyNodes]);

  const filteredHierarchy = useMemo(() => {
    if (!hierarchyData?.hierarchy || !hierarchySearch.trim()) {
      return hierarchyData?.hierarchy || [];
    }

    const query = hierarchySearch.toLowerCase().trim();

    const usersByNodeKey = new Map<string, NodeUser[]>();
    if (orgUsers) {
      orgUsers.forEach((user: any) => {
        // Users assigned directly to a department have unitId set but no subUnitId
        if (user.unitId && !user.subjectId && !user.subUnitId) {
          const key = `department-${user.unitId}`;
          const existing = usersByNodeKey.get(key) || [];
          usersByNodeKey.set(key, [...existing, user]);
        }
        if (user.subjectId && !user.subUnitId) {
          const key = `subject-${user.subjectId}`;
          const existing = usersByNodeKey.get(key) || [];
          usersByNodeKey.set(key, [...existing, user]);
        }
        // Users assigned to a sub-unit have subUnitId set (these appear under "unit" nodes in hierarchy)
        if (user.subUnitId && !user.teamId) {
          const key = user.subjectId ? `unit-${user.subUnitId}-${user.subjectId}` : `unit-${user.subUnitId}`;
          const existing = usersByNodeKey.get(key) || [];
          usersByNodeKey.set(key, [...existing, user]);
        }
        // Users assigned to a team
        if (user.teamId) {
          const key = `team-${user.teamId}`;
          const existing = usersByNodeKey.get(key) || [];
          usersByNodeKey.set(key, [...existing, user]);
        }
      });
    }

    const userMatchesQuery = (user: NodeUser): boolean => {
      const fullName = `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase();
      return (
        fullName.includes(query) ||
        (user.email?.toLowerCase().includes(query) ?? false) ||
        (user.gamerName?.toLowerCase().includes(query) ?? false)
      );
    };

    const nodeMatchesQuery = (node: HierarchyNode): boolean => {
      return node.name.toLowerCase().includes(query);
    };

    const filterNode = (node: HierarchyNode): HierarchyNode | null => {
      const nodeKey = `${node.type}-${node.id}`;
      const nodeUsers = usersByNodeKey.get(node.subjectId ? `${nodeKey}-${node.subjectId}` : nodeKey) || [];
      const hasMatchingUser = nodeUsers.some(userMatchesQuery);
      const selfMatches = nodeMatchesQuery(node);
      const filteredSubjects = (node.subjects || []).filter((subject) =>
        subject.name.toLowerCase().includes(query)
      );

      const filteredChildren: HierarchyNode[] = [];
      if (node.children) {
        for (const child of node.children) {
          const filtered = filterNode(child);
          if (filtered) {
            filteredChildren.push(filtered);
          }
        }
      }

      if (selfMatches || hasMatchingUser || filteredChildren.length > 0 || filteredSubjects.length > 0) {
        return {
          ...node,
          children: filteredChildren,
          subjects: selfMatches ? node.subjects : filteredSubjects,
        };
      }

      return null;
    };

    const result: HierarchyNode[] = [];
    for (const node of hierarchyData.hierarchy) {
      const filtered = filterNode(node);
      if (filtered) {
        result.push(filtered);
      }
    }

    return result;
  }, [hierarchyData, hierarchySearch, orgUsers]);

  useEffect(() => {
    if (!hierarchySearch.trim()) {
      return;
    }

    const searchLower = hierarchySearch.toLowerCase().trim();
    const nodesToExpand = new Set<string>();

    // Build a map of users by node key for matching
    const usersByNodeKey = new Map<string, NodeUser[]>();
    if (orgUsers) {
      orgUsers.forEach((user: any) => {
        // Users assigned directly to a department have unitId set but no subUnitId
        if (user.unitId && !user.subjectId && !user.subUnitId) {
          const key = `department-${user.unitId}`;
          const existing = usersByNodeKey.get(key) || [];
          usersByNodeKey.set(key, [...existing, user]);
        }
        if (user.subjectId && !user.subUnitId) {
          const key = `subject-${user.subjectId}`;
          const existing = usersByNodeKey.get(key) || [];
          usersByNodeKey.set(key, [...existing, user]);
        }
        // Users assigned to a sub-unit have subUnitId set (these appear under "unit" nodes in hierarchy)
        if (user.subUnitId && !user.teamId) {
          const key = user.subjectId ? `unit-${user.subUnitId}-${user.subjectId}` : `unit-${user.subUnitId}`;
          const existing = usersByNodeKey.get(key) || [];
          usersByNodeKey.set(key, [...existing, user]);
        }
        // Users assigned to a team
        if (user.teamId) {
          const key = `team-${user.teamId}`;
          const existing = usersByNodeKey.get(key) || [];
          usersByNodeKey.set(key, [...existing, user]);
        }
      });
    }

    // Check if a user matches the search query
    const userMatchesQuery = (user: NodeUser): boolean => {
      const fullName = `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase();
      return (
        fullName.includes(searchLower) ||
        (user.email?.toLowerCase().includes(searchLower) ?? false) ||
        (user.gamerName?.toLowerCase().includes(searchLower) ?? false)
      );
    };

    // Recursively find matching nodes and add them + ancestors
    const findMatches = (nodes: HierarchyNode[], ancestors: string[] = []) => {
      for (const node of nodes) {
        const nodeKey = `${node.type}-${node.id}`;
        const nodeUsers = usersByNodeKey.get(node.subjectId ? `${nodeKey}-${node.subjectId}` : nodeKey) || [];
        const hasMatchingUser = nodeUsers.some(userMatchesQuery);
        const nodeMatches = node.name.toLowerCase().includes(searchLower);
        const subjectMatches = node.subjects?.some((subject) =>
          subject.name.toLowerCase().includes(searchLower)
        ) ?? false;

        if (nodeMatches || hasMatchingUser || subjectMatches) {
          nodesToExpand.add(nodeKey);
          ancestors.forEach(a => nodesToExpand.add(a));
        }

        if (node.children?.length) {
          findMatches(node.children, [...ancestors, nodeKey]);
        }
      }
    };

    findMatches(hierarchyData?.hierarchy || []);
    setExpandedNodes(prev => new Set([...Array.from(prev), ...Array.from(nodesToExpand)]));
  }, [hierarchySearch, hierarchyData?.hierarchy, orgUsers]);

  const moveUserMutation = useMutation({
    mutationFn: async (data: { userId: string; targetType: string; targetId: string; subjectId?: string }) => {
      return await apiRequest('/api/organization/move-user', {
        method: 'POST',
        body: JSON.stringify({
          userId: data.userId,
          organizationId,
          targetType: data.targetType,
          targetId: data.targetId,
          subjectId: data.subjectId,
        }),
      });
    },
    onSuccess: () => {
      toast({ title: 'User moved successfully' });
      invalidateOrgStructureCaches({ organizationId });
      queryClient.invalidateQueries({ queryKey: ['/api/organization', organizationId, 'users'] });
      if (selectedNode) {
        queryClient.invalidateQueries({ 
          queryKey: ['/api/organization', organizationId, 'hierarchy', selectedNode.type, selectedNode.id, 'members'] 
        });
      }
      invalidateCourseScopeCaches({ organizationId: organizationId ?? undefined });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to move user',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    },
  });

  const createDepartmentMutation = useMutation({
    mutationFn: async (name: string) => {
      return await apiRequest(`/api/organization/${organizationId}/departments`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
    },
    onSuccess: () => {
      toast({ title: `${terminology?.unit || 'Department'} created successfully` });
      invalidateOrgStructureCaches({ organizationId });
      setCreateDepartmentOpen(false);
      setNewNodeName('');
    },
    onError: (error: any) => {
      toast({ title: `Failed to create ${terminology?.unit || 'department'}`, description: error.message, variant: 'destructive' });
    },
  });

  const createUnitMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!selectedNode || (selectedNode.type !== 'department' && selectedNode.type !== 'subject')) throw new Error('Select a grade or subject first');
      const parentUnitId = selectedNode.type === 'subject' ? selectedNode.unitId : selectedNode.id;
      if (!parentUnitId) throw new Error('Could not resolve parent grade');
      return await apiRequest(`/api/organization/${organizationId}/departments/${parentUnitId}/units`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
    },
    onSuccess: () => {
      toast({ title: `${terminology?.subUnit || 'Unit'} created successfully` });
      invalidateOrgStructureCaches({ organizationId });
      setCreateUnitOpen(false);
      setNewNodeName('');
    },
    onError: (error: any) => {
      toast({ title: `Failed to create ${terminology?.subUnit || 'unit'}`, description: error.message, variant: 'destructive' });
    },
  });

  const createTeamMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!selectedNode || selectedNode.type !== 'unit') throw new Error('Select a unit first');
      return await apiRequest(`/api/organization/${organizationId}/units/${selectedNode.id}/teams`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
    },
    onSuccess: () => {
      toast({ title: `${terminology?.team || 'Team'} created successfully` });
      invalidateOrgStructureCaches({ organizationId });
      setCreateTeamOpen(false);
      setNewNodeName('');
    },
    onError: (error: any) => {
      toast({ title: `Failed to create ${terminology?.team || 'team'}`, description: error.message, variant: 'destructive' });
    },
  });

  const updateNodeMutation = useMutation({
    mutationFn: async (data: { name: string; joinCode?: string }) => {
      if (!selectedNode) throw new Error('No node selected');
      const endpoint = selectedNode.type === 'department' ? 'departments' : selectedNode.type === 'unit' ? 'units' : 'teams';
      const payload: { name: string; joinCode?: string } = { name: data.name };
      if (data.joinCode && data.joinCode.trim()) {
        payload.joinCode = data.joinCode.trim();
      }
      return await apiRequest(`/api/organization/${organizationId}/${endpoint}/${selectedNode.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast({ title: 'Updated successfully' });
      invalidateOrgStructureCaches({ organizationId });
      setEditNodeOpen(false);
      setNewNodeName('');
      setNewJoinCode('');
    },
    onError: (error: any) => {
      toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
    },
  });

  const deleteNodeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedNode) throw new Error('No node selected');
      const endpoint = selectedNode.type === 'department' ? 'departments' : selectedNode.type === 'unit' ? 'units' : 'teams';
      return await apiRequest(`/api/organization/${organizationId}/${endpoint}/${selectedNode.id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      toast({ title: 'Deleted successfully' });
      invalidateOrgStructureCaches({ organizationId });
      setDeleteNodeOpen(false);
      setSelectedNode(null);
    },
    onError: (error: any) => {
      toast({ title: 'Failed to delete', description: error.message, variant: 'destructive' });
    },
  });

  const assignUsersMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      if (!selectedNode) throw new Error('No node selected');
      return await apiRequest(`/api/organization/${organizationId}/hierarchy/${selectedNode.type}/${selectedNode.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ userIds, subjectId: selectedNode.subjectId }),
      });
    },
    onSuccess: () => {
      toast({ title: 'Users assigned successfully' });
      invalidateOrgStructureCaches({ organizationId });
      setAssignUsersOpen(false);
      setSelectedUserIds([]);
    },
    onError: (error: any) => {
      toast({ title: 'Failed to assign users', description: error.message, variant: 'destructive' });
    },
  });

  const removeUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!selectedNode) throw new Error('No node selected');
      const params = new URLSearchParams();
      if (selectedNode.subjectId && selectedNode.type !== 'subject') params.set('subjectId', selectedNode.subjectId);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return await apiRequest(`/api/organization/${organizationId}/hierarchy/${selectedNode.type}/${selectedNode.id}/users/${userId}${suffix}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      toast({ title: 'User removed successfully' });
      invalidateOrgStructureCaches({ organizationId });
      queryClient.invalidateQueries({ queryKey: ['/api/organization', organizationId, 'users'] });
      if (selectedNode) {
        queryClient.invalidateQueries({ 
          queryKey: ['/api/organization', organizationId, 'hierarchy', selectedNode.type, selectedNode.id, 'members'] 
        });
      }
      invalidateCourseScopeCaches({ organizationId: organizationId ?? undefined });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to remove user', description: error.message, variant: 'destructive' });
    },
  });

  const regenerateCodeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedNode || selectedNode.type !== 'team') throw new Error('Select a team first');
      return await apiRequest(`/api/organization/${organizationId}/teams/${selectedNode.id}/regenerate-code`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      toast({ title: 'Join code regenerated successfully' });
      invalidateOrgStructureCaches({ organizationId });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to regenerate code', description: error.message, variant: 'destructive' });
    },
  });

  const updateOrgSettingsMutation = useMutation({
    mutationFn: async (settings: { timezone?: string; currency?: string }) => {
      return await apiRequest(`/api/organization/${organizationId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
    },
    onSuccess: () => {
      toast({ title: 'Settings updated successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/organization', organizationId, 'settings'] });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to update settings', description: error.message, variant: 'destructive' });
    },
  });

  const crossOrgAssignMutation = useMutation({
    mutationFn: async (data: { userId: string; targetOrganizationId: string; requestedRole: string }) => {
      return await apiRequest(`/api/admin/users/${data.userId}/initiate-join-request`, {
        method: 'POST',
        body: JSON.stringify({
          targetOrganizationId: data.targetOrganizationId,
          requestedRole: data.requestedRole,
        }),
      });
    },
    onSuccess: (data: any) => {
      toast({ 
        title: 'Join request created', 
        description: data.message || 'The target organization admins will review the request.',
      });
      setCrossOrgAssignOpen(false);
      setCrossOrgTargetUser(null);
      setCrossOrgTargetOrgId('');
      setCrossOrgRequestedRole('learner');
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to create join request', 
        description: error.message || 'An error occurred', 
        variant: 'destructive',
      });
    },
  });

  const handleOpenCrossOrgAssign = (user: NodeUser) => {
    setCrossOrgTargetUser(user);
    setCrossOrgTargetOrgId('');
    setCrossOrgRequestedRole('learner');
    setCrossOrgAssignOpen(true);
  };

  const handleSubmitCrossOrgAssign = () => {
    if (!crossOrgTargetUser || !crossOrgTargetOrgId) return;
    crossOrgAssignMutation.mutate({
      userId: getCanonicalUserId(crossOrgTargetUser),
      targetOrganizationId: crossOrgTargetOrgId,
      requestedRole: crossOrgRequestedRole,
    });
  };

  const handleCopyLink = () => {
    if (!selectedNodeData?.joinCode) return;
    const registerUrl = `${platformBaseUrl}/register?code=${selectedNodeData.joinCode}`;
    navigator.clipboard.writeText(registerUrl);
    toast({ title: 'Link copied to clipboard' });
  };

  const handleToggle = (nodeKey: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeKey)) {
        next.delete(nodeKey);
      } else {
        next.add(nodeKey);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    if (!hierarchyData) return;
    
    const allNodeKeys = new Set<string>();
    const collectNodes = (nodes: HierarchyNode[]) => {
      for (const node of nodes) {
        allNodeKeys.add(`${node.type}-${node.id}`);
        if (node.children) collectNodes(node.children);
      }
    };
    collectNodes(hierarchyData.hierarchy);
    setExpandedNodes(allNodeKeys);
  };

  const handleCollapseAll = () => {
    setExpandedNodes(new Set());
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    if (active.data.current?.type === 'user') {
      setActiveDragUser(active.data.current.user);
      setActiveDragId(active.id as string);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragUser(null);
    setActiveDragId(null);

    if (!over || !active.data.current?.user) return;

    const targetData = over.data.current;
    if (targetData?.type !== 'node') return;

    const user = active.data.current.user as NodeUser;
    const targetNode = targetData.node as HierarchyNode;

    moveUserMutation.mutate({
      userId: getCanonicalUserId(user),
      targetType: targetNode.type,
      targetId: targetNode.id,
      subjectId: targetNode.subjectId,
    });
  };

  const handleDragCancel = () => {
    setActiveDragUser(null);
    setActiveDragId(null);
  };

  if (!isResolved || !terminology || !terminologyLower) {
    return (
      <QuizAdminLayout title="Organization Hub" description="Loading...">
        <div className="flex items-center justify-center h-64">
          <div className="text-foreground">Loading organization settings...</div>
        </div>
      </QuizAdminLayout>
    );
  }

  if (!organizationId) {
    return (
      <QuizAdminLayout
        title="Organization Hub"
        description="Manage your organization hierarchy"
      >
        <div className="flex items-center justify-center min-h-[400px] px-4">
          <div className="text-center space-y-4 max-w-md">
            <Building2 className="w-12 h-12 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">No Organization Selected</h2>
            <div className="text-muted-foreground">
              {isSuperAdmin ? (
                <>
                  <p>Please select an organization from the organization switcher to manage its structure.</p>
                  <p className="md:hidden mt-3 text-sm font-medium text-primary bg-primary/10 p-3 rounded-lg border border-primary/20">
                    <span className="block mb-1">Mobile Tip:</span>
                    Tap the menu icon (☰) at the top of your screen to access the organization switcher.
                  </p>
                </>
              ) : (
                <p>You are not currently assigned to any organization. Please contact your administrator.</p>
              )}
            </div>
          </div>
        </div>
      </QuizAdminLayout>
    );
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'department':
        return terminology.unit;
      case 'subject':
        return terminology.subject || 'Subject';
      case 'unit':
        return terminology.subUnit;
      case 'team':
        return terminology.team;
      default:
        return type;
    }
  };

  return (
    <QuizAdminLayout
      title="Central Management Hub"
      description={`Manage your ${terminologyLower.unitPlural}, ${terminologyLower.subUnitPlural}, and ${terminologyLower.teamPlural}`}
    >
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Organization Settings
          </CardTitle>
          <CardDescription>Configure timezone, currency, and language for your organization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-2 min-w-[200px]">
              <Label htmlFor="timezone">Timezone</Label>
              <Select value={orgTimezone} onValueChange={(value) => { setOrgTimezone(value); updateOrgSettingsMutation.mutate({ timezone: value }); }}>
                <SelectTrigger id="timezone">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2 min-w-[200px]">
              <Label htmlFor="currency">Currency</Label>
              <Select value={orgCurrency} onValueChange={(value) => { setOrgCurrency(value); updateOrgSettingsMutation.mutate({ currency: value }); }}>
                <SelectTrigger id="currency">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ZAR">ZAR - South African Rand</SelectItem>
                  <SelectItem value="USD">USD - US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                  <SelectItem value="GBP">GBP - British Pound</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2 min-w-[200px]">
              <Label htmlFor="org-language" className="flex items-center gap-1">
                <Languages className="w-4 h-4" />
                Default Language
              </Label>
              <Select value={orgLanguage} onValueChange={(value) => { setOrgLanguage(value); updateOrgLanguageMutation.mutate(value); }}>
                <SelectTrigger id="org-language">
                  <SelectValue placeholder="Select default language" />
                </SelectTrigger>
                <SelectContent>
                  {supportedLanguages && supportedLanguages.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name} ({lang.nativeName})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <DndContext
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex flex-col lg:flex-row gap-6">
          <Card className="flex-[2]">
            <CardHeader className="space-y-4 pb-4">
              <div className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FolderTree className="w-5 h-5" />
                    Organization Hierarchy
                  </CardTitle>
                  <CardDescription>
                    {hierarchyData && (
                      <span className="text-xs">
                        {hierarchyData.totals.departments} {terminology.unitPlural} · {hierarchyData.totals.units} {terminology.subUnitPlural} · {hierarchyData.totals.teams} {terminology.teamPlural} · {hierarchyData.totals.users} Members
                      </span>
                    )}
                    <span className="block text-xs text-muted-foreground mt-1">
                      Drag users from the right panel and drop them onto any node below to move them
                    </span>
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleExpandAll}>
                    Expand All
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCollapseAll}>
                    Collapse All
                  </Button>
                  <Button size="sm" onClick={() => setCreateDepartmentOpen(true)}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add {terminology.unit}
                  </Button>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder={`Search ${terminologyLower.unitPlural}, users, courses, ${terminologyLower.subjectPlural}...`}
                  value={hierarchySearch}
                  onChange={(e) => setHierarchySearch(e.target.value)}
                  className="pl-9"
                />
                {hierarchySearch && (
                  <Button variant="ghost" size="sm" className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0" onClick={() => setHierarchySearch('')}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {hierarchyLoading ? (
                <HierarchySkeleton />
              ) : organizationId && filteredHierarchy.length > 0 ? (
                <div className="space-y-1">
                  {filteredHierarchy.map((node) => (
                    <TreeNode
                      key={`${node.type}-${node.id}`}
                      node={node}
                      level={0}
                      expandedNodes={expandedNodes}
                      selectedNode={selectedNode}
                      onToggle={handleToggle}
                      onSelect={setSelectedNode}
                      terminology={{
                        unit: terminology.unit,
                        subUnit: terminology.subUnit,
                        team: terminology.team,
                        subjectPlural: terminology.subjectPlural,
                      }}
                      organizationId={organizationId}
                      searchTerm={hierarchySearch}
                    />
                  ))}
                  {partnerHierarchyNodes.length > 0 && (
                    <>
                      <div className="border-t my-3 pt-3">
                        <p className="text-xs text-muted-foreground font-medium mb-2 px-3 flex items-center gap-1.5">
                          <ArrowRightLeft className="w-3 h-3" />
                          Partner Organizations
                        </p>
                      </div>
                      {partnerHierarchyNodes.map((node) => (
                        <TreeNode
                          key={node.id}
                          node={node}
                          level={0}
                          expandedNodes={expandedNodes}
                          selectedNode={selectedNode}
                          onToggle={handleToggle}
                          onSelect={(n) => setSelectedNode({ ...n, orgId: node.partnerOrgId, isPartner: true })}
                          terminology={{
                            unit: terminology.unit,
                            subUnit: terminology.subUnit,
                            team: terminology.team,
                            subjectPlural: terminology.subjectPlural,
                          }}
                          organizationId={node.partnerOrgId || organizationId}
                          searchTerm={hierarchySearch}
                        />
                      ))}
                    </>
                  )}
                </div>
              ) : hierarchySearch.trim() && (!searchResults?.courses || searchResults.courses.length === 0) ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Search className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No results found for "{hierarchySearch}"</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Try adjusting your search terms
                  </p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => setHierarchySearch('')}
                  >
                    Clear search
                  </Button>
                </div>
              ) : !hierarchySearch.trim() ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FolderTree className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No hierarchy structure found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Create {terminologyLower.unitPlural} to get started
                  </p>
                </div>
              ) : null}
              
              {debouncedSearch.length >= 2 && searchResults?.courses && searchResults.courses.length > 0 && (
                <div className="mt-6 pt-4 border-t">
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <BookOpen className="w-4 h-4" />
                    Courses ({searchResults.courses.length})
                  </h4>
                  <div className="space-y-2">
                    {searchResults.courses.map((course) => (
                      <Link
                        key={course.id}
                        href={`/course-builder/${course.id}/edit`}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                      >
                        {course.thumbnailUrl ? (
                          <img
                            src={course.thumbnailUrl}
                            alt={course.title}
                            className="w-12 h-9 rounded object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-9 rounded bg-muted flex items-center justify-center shrink-0">
                            <BookOpen className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{course.title}</p>
                        </div>
                        <Badge variant={course.status === 'published' ? 'default' : 'secondary'} className="shrink-0" >
                          {course.status}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex-1 min-w-[300px]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                {selectedNodeData ? selectedNodeData.name : 'Node Details'}
              </CardTitle>
              {selectedNodeData && (
                <CardDescription>
                  {getTypeLabel(selectedNodeData.type)} · {selectedNodeData.directCount} direct members
                  {selectedNodeData.type === 'department' && selectedNodeData.isShowcaseDepartment && (
                    <Badge variant="warning" className="ml-2 border-0 align-middle">Showcase</Badge>
                  )}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {!selectedNode ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Building2 className="w-10 h-10 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground text-sm">
                    Select a node from the hierarchy to view details
                  </p>
                </div>
              ) : usersLoading ? (
                <DetailPanelSkeleton />
              ) : (
                <div className="space-y-4">
                  {!selectedNode?.isPartner && (
                    <div className="flex flex-wrap gap-2">
                      {(selectedNodeData?.type === 'department' || selectedNodeData?.type === 'subject') && (
                        <Button size="sm" variant="outline" onClick={() => setCreateUnitOpen(true)}>
                          <Plus className="w-4 h-4 mr-1" />
                          Add {terminology.subUnit}
                        </Button>
                      )}
                      {selectedNodeData?.type === 'unit' && (
                        <Button size="sm" variant="outline" onClick={() => setCreateTeamOpen(true)}>
                          <Plus className="w-4 h-4 mr-1" />
                          Add {terminology.team}
                        </Button>
                      )}
                      {selectedNodeData?.type !== 'subject' && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => { setNewNodeName(selectedNodeData?.name || ''); setNewJoinCode(selectedNodeData?.joinCode || ''); setEditNodeOpen(true); }}>
                            <Pencil className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setDeleteNodeOpen(true)}
                            disabled={selectedNodeData?.name === 'General'}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Delete
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setAssignUsersOpen(true)}>
                        <UserPlus className="w-4 h-4 mr-1" />
                        Assign Users
                      </Button>
                    </div>
                  )}

                  {!selectedNode?.isPartner && selectedNodeData?.joinCode && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/50">
                      <Link2 className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-mono flex-1">{selectedNodeData.joinCode}</span>
                      <Button size="sm" variant="ghost" onClick={handleCopyLink}>
                        <Copy className="w-4 h-4" />
                      </Button>
                      {selectedNodeData?.type === 'team' && (
                        <Button size="sm" variant="ghost" onClick={() => regenerateCodeMutation.mutate()} disabled={regenerateCodeMutation.isPending}>
                          <RefreshCw className={`w-4 h-4 ${regenerateCodeMutation.isPending ? 'animate-spin' : ''}`} />
                        </Button>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mb-3">
                    {!selectedNode?.isPartner && (
                      <Button variant={rightPanelTab === 'members' ? 'default' : 'outline'} size="sm" onClick={() => setRightPanelTab('members')}
                      >
                        <Users className="w-4 h-4 mr-1" />
                        Members
                      </Button>
                    )}
                    <Button variant={rightPanelTab === 'courses' ? 'default' : 'outline'} size="sm" onClick={() => setRightPanelTab('courses')}
                    >
                      <BookOpen className="w-4 h-4 mr-1" />
                      Courses
                    </Button>
                  </div>

                  {rightPanelTab === 'members' && selectedNode?.isPartner && (
                    <div className="text-center py-8">
                      <Users className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Members are not available for partner organizations</p>
                    </div>
                  )}

                  {rightPanelTab === 'members' && !selectedNode?.isPartner && (
                    <div>
                      <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Members ({nodeUsers?.length || 0})
                      </h4>
                      
                      <div className="flex items-center gap-2 mb-3">
                        <Button variant={memberScope === 'direct' ? 'default' : 'outline'} size="sm" onClick={() => setMemberScope('direct')}
                        >
                          Direct Only
                        </Button>
                        <Button variant={memberScope === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setMemberScope('all')}
                        >
                          All Members
                        </Button>
                      </div>
                      
                      {nodeUsers && nodeUsers.length > 0 ? (
                        <div className="space-y-2 max-h-[400px] overflow-y-auto">
                          {nodeUsers.map((user) => (
                            <DraggableUserItem 
                              key={getCanonicalUserId(user)} 
                              user={user}
                              activeDragId={activeDragId}
                              organizationId={organizationId}
                            >
                              <div className="flex items-center gap-1">
                                {isShowcaseOrg && (
                                  <Button size="sm" variant="ghost" onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleOpenCrossOrgAssign(user);
                                    }}
                                    title="Assign to Another Organization"
                                  >
                                    <ArrowRightLeft className="w-4 h-4" />
                                  </Button>
                                )}
                                <Button size="sm" variant="ghost" onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    removeUserMutation.mutate(getCanonicalUserId(user));
                                  }}
                                  disabled={removeUserMutation.isPending}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            </DraggableUserItem>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No members in this {getTypeLabel(selectedNodeData?.type || 'node').toLowerCase()}
                        </p>
                      )}
                    </div>
                  )}

                  {rightPanelTab === 'courses' && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium flex items-center gap-2">
                          <BookOpen className="w-4 h-4" />
                          Courses ({scopeCourses?.courses?.length || 0})
                        </h4>
                        {selectedNode?.type !== 'organization' && (
                          <Button size="sm" variant="outline" onClick={() => { setAssignCourseId(''); setAssignDueDate(''); setAssignMandatory(false); setAssignCourseOpen(true); }}>
                            <Plus className="w-4 h-4 mr-1" />
                            Assign Course
                          </Button>
                        )}
                      </div>
                      
                      {coursesLoading ? (
                        <div className="space-y-2">
                          {[...Array(3)].map((_, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
                              <Skeleton className="w-16 h-12 rounded" />
                              <div className="flex-1">
                                <Skeleton className="h-4 w-32 mb-1" />
                                <Skeleton className="h-3 w-24" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : scopeCourses?.courses && scopeCourses.courses.length > 0 ? (
                        <div className="space-y-2 max-h-[400px] overflow-y-auto">
                          {scopeCourses.courses.map(({ course, assignment }) => (
                            <div 
                              key={`${course.id}-${assignment.id}`}
                              className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                            >
                              {course.thumbnailUrl ? (
                                <img 
                                  src={course.thumbnailUrl} 
                                  alt={course.title}
                                  className="w-16 h-12 rounded object-cover shrink-0"
                                />
                              ) : (
                                <div className="w-16 h-12 rounded bg-muted flex items-center justify-center shrink-0">
                                  <BookOpen className="w-6 h-6 text-muted-foreground" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{course.title}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  {assignment.mandatory && (
                                    <Badge variant="destructive" className="text-xs">
                                      Mandatory
                                    </Badge>
                                  )}
                                  {assignment.dueDate && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Calendar className="w-3 h-3" />
                                      {new Date(assignment.dueDate).toLocaleDateString()}
                                    </span>
                                  )}
                                  {(scopeCourseLanguages?.[course.id]?.languages?.length ?? 0) > 0 && (
                                    <div className="flex items-center gap-1">
                                      {scopeCourseLanguages?.[course.id]?.languages?.map(lang => (
                                        <Badge key={lang.code} variant="outline" className="px-1 py-0 uppercase">
                                          {lang.code}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button size="sm" variant="ghost" onClick={() => {
                                    setEditAssignmentId(assignment.id);
                                    setEditDueDate(assignment.dueDate ? new Date(assignment.dueDate).toISOString().split('T')[0] : '');
                                    setEditMandatory(assignment.mandatory);
                                    setEditAssignmentOpen(true);
                                  }}
                                  title="Edit assignment"
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => {
                                    setRemoveAssignmentId(assignment.id);
                                    setRemoveCourseName(course.title);
                                    setRemoveAssignmentOpen(true);
                                  }}
                                  className="text-destructive hover:text-destructive"
                                  title="Remove assignment"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No courses assigned to this {getTypeLabel(selectedNodeData?.type || 'node').toLowerCase()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <DragOverlay>
          {activeDragUser && (
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-card shadow-lg">
              <GripVertical className="w-4 h-4 text-muted-foreground" />
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {activeDragUser.firstName} {activeDragUser.lastName}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {activeDragUser.gamerName || activeDragUser.email}
                </p>
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <Dialog open={createDepartmentOpen} onOpenChange={setCreateDepartmentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create {terminology.unit}</DialogTitle>
            <DialogDescription>Add a new {terminologyLower.unit} to your organization</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="department-name">{terminology.unit} Name</Label>
              <Input
                id="department-name"
                value={newNodeName}
                onChange={(e) => setNewNodeName(e.target.value)}
                placeholder={`Enter ${terminologyLower.unit} name`}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDepartmentOpen(false)}>Cancel</Button>
            <Button onClick={() => createDepartmentMutation.mutate(newNodeName)} disabled={!newNodeName.trim() || createDepartmentMutation.isPending}>
              {createDepartmentMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createUnitOpen} onOpenChange={setCreateUnitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create {terminology.subUnit}</DialogTitle>
            <DialogDescription>Add a new {terminologyLower.subUnit} to {selectedNodeData?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="unit-name">{terminology.subUnit} Name</Label>
              <Input
                id="unit-name"
                value={newNodeName}
                onChange={(e) => setNewNodeName(e.target.value)}
                placeholder={`Enter ${terminologyLower.subUnit} name`}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateUnitOpen(false)}>Cancel</Button>
            <Button onClick={() => createUnitMutation.mutate(newNodeName)} disabled={!newNodeName.trim() || createUnitMutation.isPending}>
              {createUnitMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createTeamOpen} onOpenChange={setCreateTeamOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create {terminology.team}</DialogTitle>
            <DialogDescription>Add a new {terminologyLower.team} to {selectedNodeData?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="team-name">{terminology.team} Name</Label>
              <Input
                id="team-name"
                value={newNodeName}
                onChange={(e) => setNewNodeName(e.target.value)}
                placeholder={`Enter ${terminologyLower.team} name`}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateTeamOpen(false)}>Cancel</Button>
            <Button onClick={() => createTeamMutation.mutate(newNodeName)} disabled={!newNodeName.trim() || createTeamMutation.isPending}>
              {createTeamMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editNodeOpen} onOpenChange={setEditNodeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {selectedNodeData ? getTypeLabel(selectedNodeData.type) : 'Node'}</DialogTitle>
            <DialogDescription>Update the name and join code of this {selectedNodeData ? getTypeLabel(selectedNodeData.type).toLowerCase() : 'node'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={newNodeName}
                onChange={(e) => setNewNodeName(e.target.value)}
                placeholder="Enter new name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-join-code">Join Code (optional)</Label>
              <Input
                id="edit-join-code"
                value={newJoinCode}
                onChange={(e) => setNewJoinCode(e.target.value)}
                placeholder={selectedNodeData?.joinCode || 'Enter new join code'}
              />
              <p className="text-xs text-muted-foreground">Leave empty to keep the current code. Enter a new code to update it.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditNodeOpen(false)}>Cancel</Button>
            <Button onClick={() => updateNodeMutation.mutate({ name: newNodeName, joinCode: newJoinCode })} disabled={!newNodeName.trim() || updateNodeMutation.isPending}>
              {updateNodeMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteNodeOpen} onOpenChange={setDeleteNodeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedNodeData?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All users in this {selectedNodeData ? getTypeLabel(selectedNodeData.type).toLowerCase() : 'node'} will be moved to the General {terminology.unit.toLowerCase()}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteNodeMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteNodeMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={assignUsersOpen} onOpenChange={(open) => {
        setAssignUsersOpen(open);
        if (!open) {
          setUserSearchQuery('');
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Users to {selectedNodeData?.name}</DialogTitle>
            <DialogDescription>Select users to assign to this {selectedNodeData ? getTypeLabel(selectedNodeData.type).toLowerCase() : 'node'}</DialogDescription>
          </DialogHeader>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search users by name or email..."
              value={userSearchQuery}
              onChange={(e) => setUserSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <ScrollArea className="h-[300px] py-4">
            <div className="space-y-2">
              {(() => {
                const filteredUsers = (orgUsers || []).filter(user => {
                  if (!userSearchQuery.trim()) return true;
                  const query = userSearchQuery.toLowerCase();
                  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase();
                  return (
                    fullName.includes(query) ||
                    user.email?.toLowerCase().includes(query) ||
                    user.gamerName?.toLowerCase().includes(query)
                  );
                });
                if (filteredUsers.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {userSearchQuery.trim() ? 'No users match your search' : 'No users available'}
                    </p>
                  );
                }
                return filteredUsers.map((user) => (
                  <div key={user.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50">
                    <Checkbox
                      id={`user-${user.id}`}
                      checked={selectedUserIds.includes(user.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedUserIds((prev) => [...prev, user.id]);
                        } else {
                          setSelectedUserIds((prev) => prev.filter((id) => id !== user.id));
                        }
                      }}
                    />
                    <Label htmlFor={`user-${user.id}`} className="flex-1 cursor-pointer">
                      <p className="text-sm font-medium">{user.firstName} {user.lastName}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </Label>
                  </div>
                ));
              })()}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAssignUsersOpen(false); setSelectedUserIds([]); setUserSearchQuery(''); }}>Cancel</Button>
            <Button onClick={() => assignUsersMutation.mutate(selectedUserIds)} disabled={selectedUserIds.length === 0 || assignUsersMutation.isPending}>
              {assignUsersMutation.isPending ? 'Assigning...' : `Assign ${selectedUserIds.length} User${selectedUserIds.length !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={crossOrgAssignOpen} onOpenChange={setCrossOrgAssignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5" />
              Assign to Another Organization
            </DialogTitle>
            <DialogDescription>
              Create a join request for {crossOrgTargetUser?.firstName} {crossOrgTargetUser?.lastName} to join another organization. The target organization admins will need to approve this request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>User</Label>
              <div className="p-3 rounded-lg bg-muted">
                <p className="font-medium">{crossOrgTargetUser?.firstName} {crossOrgTargetUser?.lastName}</p>
                <p className="text-sm text-muted-foreground">{crossOrgTargetUser?.email}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-org">Target Organization</Label>
              <Select value={crossOrgTargetOrgId} onValueChange={setCrossOrgTargetOrgId}>
                <SelectTrigger id="target-org">
                  <SelectValue placeholder="Select an organization" />
                </SelectTrigger>
                <SelectContent>
                  {availableOrgs?.organizations?.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name} ({org.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="requested-role">Requested Role</Label>
              <Select value={crossOrgRequestedRole} onValueChange={setCrossOrgRequestedRole}>
                <SelectTrigger id="requested-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="learner">{terminology?.learner || 'Learner'}</SelectItem>
                  <SelectItem value="student">{terminology?.learner || 'Learner'}</SelectItem>
                  <SelectItem value="teacher">{terminology?.educator || 'Instructor'}</SelectItem>
                  <SelectItem value="instructor">{terminology?.educator || 'Instructor'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCrossOrgAssignOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitCrossOrgAssign} disabled={!crossOrgTargetOrgId || crossOrgAssignMutation.isPending} >
              {crossOrgAssignMutation.isPending ? 'Creating Request...' : 'Create Join Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignCourseOpen} onOpenChange={setAssignCourseOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Assign Course to {selectedNodeData?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedNode?.isPartner ? 'Select a public course from your organization to assign cross-org.' : 'Select a course to assign to this scope.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Course</Label>
              <Select value={assignCourseId} onValueChange={setAssignCourseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a course" />
                </SelectTrigger>
                <SelectContent>
                  {assignableCourses && assignableCourses.length > 0 ? (
                    assignableCourses.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.title}{course.status !== 'active' ? ` (${course.status})` : ''}
                    </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="__no_courses__" disabled>
                      No assignable courses found
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Due Date (optional)</Label>
              <Input
                type="date"
                value={assignDueDate}
                onChange={(e) => setAssignDueDate(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="assign-mandatory"
                checked={assignMandatory}
                onCheckedChange={(checked) => setAssignMandatory(checked === true)}
              />
              <Label htmlFor="assign-mandatory">Mandatory</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignCourseOpen(false)}>Cancel</Button>
            <Button onClick={() => assignCourseMutation.mutate({ courseId: assignCourseId, dueDate: assignDueDate || undefined, mandatory: assignMandatory })}
              disabled={!assignCourseId || assignCourseMutation.isPending}
            >
              {assignCourseMutation.isPending ? 'Assigning...' : 'Assign Course'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editAssignmentOpen} onOpenChange={setEditAssignmentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Assignment</DialogTitle>
            <DialogDescription>Update the due date and mandatory status for this assignment.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Due Date (optional)</Label>
              <Input
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-mandatory"
                checked={editMandatory}
                onCheckedChange={(checked) => setEditMandatory(checked === true)}
              />
              <Label htmlFor="edit-mandatory">Mandatory</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAssignmentOpen(false)}>Cancel</Button>
            <Button onClick={() => editAssignmentMutation.mutate({ id: editAssignmentId, dueDate: editDueDate || null, mandatory: editMandatory })}
              disabled={editAssignmentMutation.isPending}
            >
              {editAssignmentMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removeAssignmentOpen} onOpenChange={setRemoveAssignmentOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Course Assignment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "{removeCourseName}" from {selectedNodeData?.name}. Users in this scope will no longer have this course assigned. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeAssignmentMutation.mutate(removeAssignmentId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeAssignmentMutation.isPending ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </QuizAdminLayout>
  );
}
