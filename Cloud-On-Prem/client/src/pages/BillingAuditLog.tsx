import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Download, Search, Filter } from 'lucide-react';
import { useLocation } from 'wouter';
import QuizAdminLayout from '@/components/QuizAdminLayout';

import { useOrganizationTerminology } from '@/contexts/OrganizationContext';
import { tzFormat } from '@/utils/timezoneRuntime';
import { useAuth } from '@/hooks/useAuth';

interface AuditLogEntry {
  id: string;
  status: 'approved' | 'denied';
  requestedAt: string;
  reviewedAt: string;
  approvedAt: string | null;
  denialReason: string | null;
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  studentEmail: string;
  studentGamerName: string;
  reviewerId: string;
  reviewerFirstName: string;
  reviewerLastName: string;
  reviewerGamerName: string;
  assignedUnitId: string | null;
  assignedSubUnitId: string | null;
  assignedSubjectIds: string[] | null;
  unitName: string | null;
  subUnitName: string | null;
}

export default function BillingAuditLog() {
  const [, setLocation] = useLocation();
  const [studentName, setStudentName] = useState('');
  const [selectedUnit, setSelectedUnit] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<string>('');

  const { terminology, isResolved } = useOrganizationTerminology();
  const { effectiveOrganizationId, isSuperAdmin } = useAuth();
  const { data: user } = useQuery<any>({ queryKey: ['/api/auth/user'] });
  const { data: organizations } = useQuery<any[]>({
    queryKey: ['/api/superadmin/organizations'],
    enabled: isSuperAdmin,
  });
  const baseOrgId = isSuperAdmin ? selectedOrg : (effectiveOrganizationId || user?.organizationId);
  const { data: units } = useQuery<any[]>({
    queryKey: [`/api/admin/organizations/${baseOrgId}/units`],
    enabled: !!baseOrgId,
  });
  const subjectsUrl = baseOrgId
    ? `/api/admin/subjects?organizationId=${baseOrgId}`
    : null;
  const { data: subjects } = useQuery<any[]>({
    queryKey: [subjectsUrl],
    enabled: !!subjectsUrl,
  });

  const currentOrgId = baseOrgId;
  
  // Build query parameters
  const queryParams = new URLSearchParams();
  if (selectedUnit && selectedUnit !== 'all') queryParams.append('unitId', selectedUnit);
  if (selectedSubject && selectedSubject !== 'all') queryParams.append('subjectId', selectedSubject);
  if (studentName) queryParams.append('studentName', studentName);
  if (dateFrom) queryParams.append('dateFrom', dateFrom);
  if (dateTo) queryParams.append('dateTo', dateTo);
  if (selectedStatus && selectedStatus !== 'all') queryParams.append('status', selectedStatus);
  
  // Build the full API URL
  const apiUrl = currentOrgId 
    ? user?.isSuperAdmin 
      ? `/api/superadmin/organizations/${currentOrgId}/billing/audit-log?${queryParams.toString()}`
      : `/api/org/${currentOrgId}/billing/audit-log?${queryParams.toString()}`
    : null;
  
  const { data: auditLog, isLoading } = useQuery<AuditLogEntry[]>({
    queryKey: [apiUrl],
    enabled: !!apiUrl,
  });

  const exportCSV = () => {
    if (!auditLog || !auditLog.length || !terminology) return;
    
    const headers = [
      `${terminology.learner} Name`,
      `${terminology.learner} Email`,
      'Action',
      'Reviewed By',
      'Date',
      terminology.unit,
      terminology.subUnit,
      'Denial Reason',
    ];
    
    const rows = auditLog.map(entry => [
      `${entry.studentFirstName} ${entry.studentLastName}`,
      entry.studentEmail,
      entry.status === 'approved' ? 'Approved' : 'Denied',
      `${entry.reviewerFirstName} ${entry.reviewerLastName}`,
      tzFormat(entry.reviewedAt, 'yyyy-MM-dd HH:mm'),
      entry.unitName || 'N/A',
      entry.subUnitName || 'N/A',
      entry.denialReason || 'N/A',
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billing-audit-log-${tzFormat(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <QuizAdminLayout title="Billing Audit Log">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <Button variant="ghost" size="sm" onClick={() => setLocation('/org-admin')}
                data-testid="button-back"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">Billing Audit Log</h1>
            <p className="text-muted-foreground mt-2" data-testid="text-page-description">
              {isResolved && terminology 
                ? `Review all ${terminology.learner.toLowerCase()} join request approvals and denials`
                : 'Review all join request approvals and denials'
              }
            </p>
          </div>
          <Button onClick={exportCSV} disabled={!auditLog || auditLog.length === 0} data-testid="button-export" >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Filters Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
            <CardDescription>Filter audit log by various criteria</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {user?.isSuperAdmin && (
              <div>
                <label className="text-sm font-medium mb-2 block">Organization</label>
                <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                  <SelectTrigger data-testid="select-organization">
                    <SelectValue placeholder="Select organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations?.map(org => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  {isResolved && terminology ? `${terminology.learner} Name` : 'Name'}
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email..."
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    className="pl-10"
                    data-testid="input-student-search"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  {isResolved && terminology ? terminology.unit : 'Unit'}
                </label>
                <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                  <SelectTrigger data-testid="select-grade">
                    <SelectValue placeholder={`All ${isResolved && terminology ? terminology.unitPlural : 'Departments'}`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      All {isResolved && terminology ? terminology.unitPlural : 'Departments'}
                    </SelectItem>
                    {units?.map(unit => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  {isResolved && terminology ? terminology.subject : 'Subject'}
                </label>
                <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                  <SelectTrigger data-testid="select-subject">
                    <SelectValue placeholder={isResolved && terminology ? `All ${terminology.subjectPlural}` : 'All Subjects'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {isResolved && terminology ? `All ${terminology.subjectPlural}` : 'All Subjects'}
                    </SelectItem>
                    {subjects?.map(subject => (
                      <SelectItem key={subject.id} value={subject.id}>
                        {subject.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Status</label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger data-testid="select-status">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="denied">Denied</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Date From</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  data-testid="input-date-from"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Date To</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  data-testid="input-date-to"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Audit Log Table */}
        <Card>
          <CardHeader>
            <CardTitle>Audit Log</CardTitle>
            <CardDescription>
              {isLoading ? 'Loading...' : `${auditLog?.length || 0} records found`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium">
                      {isResolved && terminology ? terminology.learner : 'User'}
                    </th>
                    <th className="text-left p-3 font-medium">Action</th>
                    <th className="text-left p-3 font-medium">Reviewed By</th>
                    <th className="text-left p-3 font-medium">Date</th>
                    <th className="text-left p-3 font-medium">
                      {isResolved && terminology ? `${terminology.unit}/${terminology.subUnit}` : 'Department/Unit'}
                    </th>
                    <th className="text-left p-3 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="text-center p-8 text-muted-foreground">
                        Loading audit log...
                      </td>
                    </tr>
                  ) : !auditLog || auditLog.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center p-8 text-muted-foreground">
                        No records found. Try adjusting your filters.
                      </td>
                    </tr>
                  ) : (
                    auditLog.map((entry) => (
                      <tr key={entry.id} className="border-b hover:bg-muted/50">
                        <td className="p-3">
                          <div className="font-medium">{entry.studentFirstName} {entry.studentLastName}</div>
                          <div className="text-sm text-muted-foreground">{entry.studentEmail}</div>
                        </td>
                        <td className="p-3">
                          <Badge variant={entry.status === 'approved' ? 'default' : 'destructive'} data-testid={`badge-status-${entry.status}`} >
                            {entry.status === 'approved' ? 'Approved' : 'Denied'}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div>{entry.reviewerFirstName} {entry.reviewerLastName}</div>
                        </td>
                        <td className="p-3">
                          <div>{tzFormat(entry.reviewedAt, 'MMM dd, yyyy')}</div>
                          <div className="text-sm text-muted-foreground">
                            {tzFormat(entry.reviewedAt, 'HH:mm')}
                          </div>
                        </td>
                        <td className="p-3">
                          <div>{entry.unitName || 'N/A'}</div>
                          {entry.subUnitName && (
                            <div className="text-sm text-muted-foreground">{entry.subUnitName}</div>
                          )}
                        </td>
                        <td className="p-3">
                          {entry.denialReason && (
                            <div className="text-sm text-destructive">
                              {entry.denialReason}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </QuizAdminLayout>
  );
}
