import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Users, GraduationCap, BookOpen, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogBody } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

interface DowngradePreview {
  currentCounts: {
    learners: number;
    teachers: number;
    orgAdmins: number;
  };
  newLimits: {
    maxLearners: number;
    maxTeachers: number;
    maxOrgAdmins: number;
  };
  users: {
    learners: User[];
    teachers: User[];
    orgAdmins: User[];
  };
}

interface DowngradeUserSelectionProps {
  organizationId: string;
  newPackageId: string;
  newPackageName: string;
  onComplete: (keepUserIds: { learnerIds: string[]; teacherIds: string[]; orgAdminIds: string[] }) => void;
  onCancel: () => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function UserCheckboxItem({
  user,
  checked,
  onCheckedChange,
  disabled,
}: {
  user: User;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/50'
      } ${checked ? 'bg-primary/5' : ''}`}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
      <Avatar className="h-8 w-8">
        {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
        <AvatarFallback className="text-xs">{getInitials(user.name)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{user.name}</p>
        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
      </div>
    </label>
  );
}

function RoleSection({
  title,
  icon: Icon,
  users,
  selectedIds,
  onToggle,
  maxAllowed,
  minRequired,
  colorClass,
}: {
  title: string;
  icon: React.ElementType;
  users: User[];
  selectedIds: Set<string>;
  onToggle: (userId: string) => void;
  maxAllowed: number;
  minRequired?: number;
  colorClass: string;
}) {
  const selectedCount = selectedIds.size;
  const isAtMax = selectedCount >= maxAllowed;
  const needsMore = minRequired !== undefined && selectedCount < minRequired;

  return (
    <div className={`rounded-lg border ${colorClass} p-4`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          <h4 className="font-medium">{title}</h4>
        </div>
        <Badge variant={needsMore ? 'destructive' : isAtMax ? 'secondary' : 'outline'}>
          {selectedCount} / {maxAllowed}
        </Badge>
      </div>
      
      {minRequired !== undefined ? (
        <p className="text-xs text-muted-foreground mb-2">
          Select at least {minRequired} {title.toLowerCase()}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground mb-2">
          Select up to {maxAllowed} {title.toLowerCase()} to keep
        </p>
      )}

      <ScrollArea className="h-[140px]">
        <div className="space-y-1 pr-3">
          {users.map(user => (
            <UserCheckboxItem
              key={user.id}
              user={user}
              checked={selectedIds.has(user.id)}
              onCheckedChange={() => onToggle(user.id)}
              disabled={!selectedIds.has(user.id) && isAtMax}
            />
          ))}
          {users.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No {title.toLowerCase()} in this organization
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export function DowngradeUserSelection({
  organizationId,
  newPackageId,
  newPackageName,
  onComplete,
  onCancel,
}: DowngradeUserSelectionProps) {
  const [selectedLearners, setSelectedLearners] = useState<Set<string>>(new Set());
  const [selectedTeachers, setSelectedTeachers] = useState<Set<string>>(new Set());
  const [selectedOrgAdmins, setSelectedOrgAdmins] = useState<Set<string>>(new Set());

  const { data: preview, isLoading, error } = useQuery<DowngradePreview>({
    queryKey: ['/api/organizations', organizationId, 'downgrade-preview', { packageId: newPackageId }],
  });

  const toggleSelection = (
    set: Set<string>,
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    userId: string,
    maxAllowed: number
  ) => {
    const newSet = new Set(set);
    if (newSet.has(userId)) {
      newSet.delete(userId);
    } else if (newSet.size < maxAllowed) {
      newSet.add(userId);
    }
    setter(newSet);
  };

  const validation = useMemo(() => {
    if (!preview) return { isValid: false, errors: [] };

    const errors: string[] = [];

    if (selectedLearners.size > preview.newLimits.maxLearners) {
      errors.push(`Too many learners selected (max ${preview.newLimits.maxLearners})`);
    }

    if (selectedTeachers.size > preview.newLimits.maxTeachers) {
      errors.push(`Too many teachers selected (max ${preview.newLimits.maxTeachers})`);
    }

    if (selectedOrgAdmins.size < 1 && preview.users.orgAdmins.length > 0) {
      errors.push('At least 1 org admin must be selected');
    }

    if (selectedOrgAdmins.size > preview.newLimits.maxOrgAdmins) {
      errors.push(`Too many org admins selected (max ${preview.newLimits.maxOrgAdmins})`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }, [preview, selectedLearners, selectedTeachers, selectedOrgAdmins]);

  const usersToDisable = useMemo(() => {
    if (!preview) return [];

    const disabled: (User & { role: string })[] = [];

    preview.users.learners.forEach(user => {
      if (!selectedLearners.has(user.id)) {
        disabled.push({ ...user, role: 'Learner Seat' });
      }
    });

    preview.users.teachers.forEach(user => {
      if (!selectedTeachers.has(user.id)) {
        disabled.push({ ...user, role: 'Instructor Seat' });
      }
    });

    preview.users.orgAdmins.forEach(user => {
      if (!selectedOrgAdmins.has(user.id)) {
        disabled.push({ ...user, role: 'Org Admin' });
      }
    });

    return disabled;
  }, [preview, selectedLearners, selectedTeachers, selectedOrgAdmins]);

  const handleConfirm = () => {
    onComplete({
      learnerIds: Array.from(selectedLearners),
      teacherIds: Array.from(selectedTeachers),
      orgAdminIds: Array.from(selectedOrgAdmins),
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2 text-warning dark:text-warning">
            <AlertTriangle className="h-5 w-5" />
            <DialogTitle>Select Users to Keep</DialogTitle>
          </div>
          <DialogDescription>
            The <strong>{newPackageName}</strong> package has lower seat limits than your current plan.
            Please select which users should remain active after the downgrade.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-[180px] w-full" />
              <Skeleton className="h-[180px] w-full" />
              <Skeleton className="h-[180px] w-full" />
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertDescription>
                Failed to load user data. Please try again.
              </AlertDescription>
            </Alert>
          ) : preview ? (
            <div className="space-y-4">
              {preview.users.learners.length > 0 && (
                <RoleSection
                  title="Learner Seats"
                  icon={GraduationCap}
                  users={preview.users.learners}
                  selectedIds={selectedLearners}
                  onToggle={(id) => toggleSelection(selectedLearners, setSelectedLearners, id, preview.newLimits.maxLearners)}
                  maxAllowed={preview.newLimits.maxLearners}
                  colorClass="border-border dark:border-primary bg-primary/10/50 dark:bg-primary/20"
                />
              )}

              {preview.users.teachers.length > 0 && (
                <RoleSection
                  title="Instructor Seats"
                  icon={BookOpen}
                  users={preview.users.teachers}
                  selectedIds={selectedTeachers}
                  onToggle={(id) => toggleSelection(selectedTeachers, setSelectedTeachers, id, preview.newLimits.maxTeachers)}
                  maxAllowed={preview.newLimits.maxTeachers}
                  colorClass="border-success/20 dark:border-success/50 bg-success/10/50 dark:bg-success/20"
                />
              )}

              {preview.users.orgAdmins.length > 0 && (
                <RoleSection
                  title="Org Admins"
                  icon={ShieldCheck}
                  users={preview.users.orgAdmins}
                  selectedIds={selectedOrgAdmins}
                  onToggle={(id) => toggleSelection(selectedOrgAdmins, setSelectedOrgAdmins, id, preview.newLimits.maxOrgAdmins)}
                  maxAllowed={preview.newLimits.maxOrgAdmins}
                  minRequired={1}
                  colorClass="border-primary dark:border-primary bg-primary/50 dark:bg-primary/20"
                />
              )}

              {usersToDisable.length > 0 && (
                <div className="rounded-lg border border-[var(--warning)]/20 dark:border-[var(--warning)]/50 bg-warning/10/50 dark:bg-warning/20 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="h-4 w-4 text-warning dark:text-warning" />
                    <h4 className="font-medium text-warning dark:text-warning">
                      {usersToDisable.length} user{usersToDisable.length !== 1 ? 's' : ''} will be disabled
                    </h4>
                  </div>
                  <ScrollArea className="h-[100px]">
                    <div className="space-y-1 pr-3">
                      {usersToDisable.map(user => (
                        <div key={user.id} className="flex items-center gap-2 text-sm text-muted-foreground opacity-60">
                          <Avatar className="h-6 w-6">
                            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
                            <AvatarFallback className="text-xs">{getInitials(user.name)}</AvatarFallback>
                          </Avatar>
                          <span className="truncate">{user.name}</span>
                          <Badge variant="outline" className="text-xs">{user.role}</Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <Alert className="mt-3">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      These users will be notified via email that their access has been disabled.
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              {validation.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertDescription>
                    <ul className="list-disc list-inside text-sm">
                      {validation.errors.map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!validation.isValid || isLoading} >
            Confirm Selection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
