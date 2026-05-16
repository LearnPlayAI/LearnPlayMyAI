import { useState, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Upload, 
  FileSpreadsheet, 
  Users, 
  CheckCircle2, 
  AlertCircle,
  Download,
  Info
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';

interface BulkUserManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
}

interface ParsedUser {
  email: string;
  gamerName: string;
  firstName?: string;
  lastName?: string;
  unitId?: string;
  subUnitId?: string;
  role: string;
}

export function BulkUserManager({ open, onOpenChange, organizationId }: BulkUserManagerProps) {
  const { toast } = useToast();
  const { terminology: rawTerminology } = useOrganizationTerminology();
  const terminology = rawTerminology || {
    learner: 'Learner',
    educator: 'Instructor',
    unit: 'Department',
    subUnit: 'Unit',
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedUsers, setParsedUsers] = useState<ParsedUser[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [defaultUnit, setDefaultUnit] = useState('');
  const [defaultSubUnit, setDefaultSubUnit] = useState('');
  const [defaultRole, setDefaultRole] = useState('student');

  const { data: units = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', organizationId, 'units'],
    enabled: !!organizationId && open,
  });

  const { data: subUnits = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', organizationId, 'sub-units'],
    enabled: !!organizationId && open,
  });

  const parseCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        setErrors(['CSV file is empty']);
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const emailIndex = headers.indexOf('email');
      const gamerNameIndex = headers.indexOf('gamername') >= 0 ? headers.indexOf('gamername') : headers.indexOf('username');
      const firstNameIndex = headers.indexOf('firstname') >= 0 ? headers.indexOf('firstname') : -1;
      const lastNameIndex = headers.indexOf('lastname') >= 0 ? headers.indexOf('lastname') : -1;
      const roleIndex = headers.indexOf('role') >= 0 ? headers.indexOf('role') : -1;

      if (emailIndex === -1 || gamerNameIndex === -1) {
        setErrors(['CSV must have "email" and "gamerName" (or "username") columns']);
        return;
      }

      const users: ParsedUser[] = [];
      const newErrors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const email = values[emailIndex];
        const gamerName = values[gamerNameIndex];
        const firstName = firstNameIndex >= 0 ? values[firstNameIndex] : '';
        const lastName = lastNameIndex >= 0 ? values[lastNameIndex] : '';
        const role = roleIndex >= 0 ? values[roleIndex].toLowerCase() : defaultRole;

        if (!email || !gamerName) {
          newErrors.push(`Row ${i + 1}: Missing email or gamerName`);
          continue;
        }

        if (!email.includes('@')) {
          newErrors.push(`Row ${i + 1}: Invalid email format`);
          continue;
        }

        users.push({
          email,
          gamerName,
          firstName,
          lastName,
          role: role || 'student',
          unitId: defaultUnit,
          subUnitId: defaultSubUnit,
        });
      }

      setParsedUsers(users);
      setErrors(newErrors);
    };

    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.csv')) {
        setErrors(['Please upload a CSV file']);
        return;
      }
      setCsvFile(file);
      parseCSV(file);
    }
  };

  const downloadTemplate = () => {
    const template = 'email,gamerName,firstName,lastName,role\n' +
      'student1@example.com,student1,John,Doe,student\n' +
      'student2@example.com,student2,Jane,Smith,student\n' +
      'teacher1@example.com,teacher1,Bob,Johnson,teacher';
    
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk_users_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // NOTE: Bulk import mutation removed - requires backend implementation of POST /api/admin/users/bulk
  // The backend needs to implement a privileged bulk user creation endpoint that can:
  // 1. Create multiple users with admin authentication
  // 2. Set temporary passwords
  // 3. Assign users to organizational units
  // 4. Handle role assignments

  const handleClose = () => {
    setCsvFile(null);
    setParsedUsers([]);
    setErrors([]);
    setDefaultUnit('');
    setDefaultSubUnit('');
    setDefaultRole('student');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Bulk User Import
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Upload a CSV file to import multiple users at once
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Template Download */}
          <Alert >
            <Info className="h-4 w-4 text-primary" />
            <AlertDescription className="text-foreground">
              <div className="flex items-center justify-between">
                <span>Need a template? Download the CSV template to get started.</span>
                <Button size="sm" variant="outline" onClick={downloadTemplate} data-testid="button-download-template" >
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
              </div>
            </AlertDescription>
          </Alert>

          {/* Default Settings */}
          <Card className="bg-muted/50 border-border">
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-foreground">Default {terminology.unit}</Label>
                <Select value={defaultUnit} onValueChange={(val) => setDefaultUnit(val === 'no-default' ? '' : val)}>
                  <SelectTrigger className="bg-muted border-border text-foreground" data-testid="bulk-select-unit">
                    <SelectValue placeholder={`Select default ${terminology.unit.toLowerCase()} (optional)`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no-default">No default</SelectItem>
                    {units.map((unit: any) => (
                      <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {defaultUnit && (
                <div className="space-y-2">
                  <Label className="text-foreground">Default {terminology.subUnit}</Label>
                  <Select value={defaultSubUnit} onValueChange={(val) => setDefaultSubUnit(val === 'no-default' ? '' : val)}>
                    <SelectTrigger className="bg-muted border-border text-foreground" data-testid="bulk-select-subunit">
                      <SelectValue placeholder={`Select default ${terminology.subUnit.toLowerCase()} (optional)`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no-default">No default</SelectItem>
                      {subUnits.filter((su: any) => su.unitId === defaultUnit).map((subUnit: any) => (
                        <SelectItem key={subUnit.id} value={subUnit.id}>{subUnit.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-foreground">Default Role</Label>
                <Select value={defaultRole} onValueChange={setDefaultRole}>
                  <SelectTrigger className="bg-muted border-border text-foreground" data-testid="bulk-select-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">{terminology.learner}</SelectItem>
                    <SelectItem value="teacher">{terminology.educator}</SelectItem>
                    <SelectItem value="org_admin">Organization Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* File Upload */}
          <div className="space-y-4">
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-border border-dashed rounded-lg cursor-pointer bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <FileSpreadsheet className="h-10 w-10 mb-2 text-muted-foreground" />
                  <p className="mb-2 text-sm text-muted-foreground">
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground/70">CSV files only</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".csv"
                  onChange={handleFileChange}
                  data-testid="bulk-file-input"
                />
              </label>
            </div>

            {csvFile && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileSpreadsheet className="h-4 w-4" />
                <span>{csvFile.name}</span>
                <Badge variant="outline" >
                  {parsedUsers.length} users
                </Badge>
              </div>
            )}
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <Alert >
              <AlertCircle className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-foreground">
                <p className="font-semibold mb-1">Errors found:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {errors.slice(0, 5).map((error, idx) => (
                    <li key={idx}>{error}</li>
                  ))}
                  {errors.length > 5 && (
                    <li>... and {errors.length - 5} more errors</li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Preview */}
          {parsedUsers.length > 0 && errors.length === 0 && (
            <Card className="bg-muted/50 border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <h3 className="text-foreground font-semibold">Preview</h3>
                  <Badge variant="outline" >
                    {parsedUsers.length} users ready
                  </Badge>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {parsedUsers.slice(0, 10).map((user, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-card/50 rounded" data-testid={`bulk-user-${idx}`}>
                      <div>
                        <div className="text-foreground text-sm">{user.gamerName}</div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {user.role}
                      </Badge>
                    </div>
                  ))}
                  {parsedUsers.length > 10 && (
                    <div className="text-center text-sm text-muted-foreground py-2">
                      ... and {parsedUsers.length - 10} more
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Backend Limitation Warning */}
          <Alert >
            <AlertCircle className="h-4 w-4 text-destructive" />
            <AlertDescription className="text-foreground text-sm">
              <p className="font-medium mb-1">⚠️ Feature Not Yet Functional</p>
              <p className="text-xs">
                This bulk import feature requires a backend API endpoint that doesn't exist yet. 
                The backend needs to implement <code className="bg-muted px-1 rounded">POST /api/admin/users/bulk</code> 
                to support privileged user creation by administrators.
              </p>
            </AlertDescription>
          </Alert>
          
          {/* Info Alert */}
          <Alert >
            <AlertCircle className="h-4 w-4 text-warning" />
            <AlertDescription className="text-foreground text-sm">
              <p className="font-medium mb-1">How it should work:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>All users will be created with temporary password: <code className="bg-muted px-1 rounded">TempPassword123!</code></li>
                <li>Users should change their password on first login</li>
                <li>Duplicate emails will be skipped</li>
                <li>Default {terminology.unit.toLowerCase()}/{terminology.subUnit.toLowerCase()} will be assigned to all imported users</li>
              </ul>
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} data-testid="bulk-cancel">
            Cancel
          </Button>
          <Button onClick={() => {
              toast({
                title: 'Feature Not Available',
                description: 'Bulk user import requires backend API support that is not yet implemented.',
                variant: 'destructive'
              });
            }}
            disabled={true}
            className="bg-muted text-muted-foreground cursor-not-allowed"
            data-testid="bulk-import"
          >
            <Users className="h-4 w-4 mr-2" />
            Import {parsedUsers.length} Users (Not Available)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
