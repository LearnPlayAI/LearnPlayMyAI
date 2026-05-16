import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Calculator, Users, GraduationCap, UserCog, Loader2, CheckCircle2, AlertTriangle, XCircle, Info, Building2, Edit2, Globe, Coins } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface PackageProposal {
  packageId: string;
  packageName: string;
  tier: string;
  pricePerLearner: number;
  pricePerTeacher: number;
  pricePerOrgAdmin: number;
  totalMonthlyCost: number;
  costPerCredit: number;
  creditsIncluded: number;
  seatsFit: boolean;
  creditsFit: boolean;
  overallFit: 'perfect' | 'adequate' | 'too_small' | 'too_large';
  highlights: string[];
  limitations: string[];
}

interface EditedProposal {
  pricePerLearner: number;
  pricePerTeacher: number;
  pricePerOrgAdmin: number;
  creditsIncluded: number;
}

interface ComparisonRow {
  packageId: string;
  packageName: string;
  tier: string;
  pricePerSeat: number;
  creditsPerSeat: number;
  totalMonthlyCost: number;
  valueScore: number;
  fit: 'perfect' | 'adequate' | 'too_small' | 'too_large';
}

interface ProposalResult {
  proposals: PackageProposal[];
  recommendation: string;
  comparisonTable?: ComparisonRow[];
}

interface Organization {
  id: string;
  name: string;
  type: string;
}

const CURRENCIES = ['ZAR', 'EUR', 'USD'] as const;
type CurrencyCode = typeof CURRENCIES[number];

const PROPOSAL_COUNT_OPTIONS = [
  { value: '1', label: 'Top 1' },
  { value: '2', label: 'Top 2' },
  { value: '3', label: 'Top 3' },
  { value: '5', label: 'Top 5' },
  { value: 'all', label: 'All' },
];

export function PackageCalculator() {
  const { toast } = useToast();
  const [currency, setCurrency] = useState<CurrencyCode>('ZAR');
  const [learners, setLearners] = useState<number>(10);
  const [teachers, setTeachers] = useState<number>(2);
  const [orgAdmins, setOrgAdmins] = useState<number>(1);
  const [proposalResult, setProposalResult] = useState<ProposalResult | null>(null);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [bulkApplyDialogOpen, setBulkApplyDialogOpen] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<PackageProposal | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [proposalCount, setProposalCount] = useState<string>('3');
  const [editedProposals, setEditedProposals] = useState<Record<string, EditedProposal>>({});
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);

  const { data: organizationsData } = useQuery<{ organizations: Organization[] }>({
    queryKey: ["/api/superadmin/organizations-for-override"],
  });

  const organizations = organizationsData?.organizations ?? [];

  const generateProposalsMutation = useMutation({
    mutationFn: async (data: {
      targetUserCount: { learners: number; teachers: number; orgAdmins: number };
      preferredCurrency: CurrencyCode;
      includeComparison: boolean;
    }) => {
      return await apiRequest('/api/admin/package-proposals/generate', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data: ProposalResult) => {
      setProposalResult(data);
      setEditedProposals({});
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to generate proposals', description: error.message, variant: 'destructive' });
    },
  });

  const applyOverrideMutation = useMutation({
    mutationFn: async (data: {
      organizationId: string;
      maxLearners: number;
      maxTeachers: number;
      maxOrgAdmins: number;
      monthlyCredits: number;
      pricePerLearnerZAR?: number;
      pricePerLearnerUSD?: number;
      pricePerLearnerEUR?: number;
      pricePerTeacherZAR?: number;
      pricePerTeacherUSD?: number;
      pricePerTeacherEUR?: number;
      pricePerOrgAdminZAR?: number;
      pricePerOrgAdminUSD?: number;
      pricePerOrgAdminEUR?: number;
      reason: string;
      isActive: boolean;
    }) => {
      return await apiRequest('/api/superadmin/package-overrides', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({ title: 'Package override applied successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/package-overrides'] });
      setApplyDialogOpen(false);
      setSelectedProposal(null);
      setSelectedOrgId('');
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to apply override', description: error.message, variant: 'destructive' });
    },
  });

  const bulkApplyMutation = useMutation({
    mutationFn: async (data: {
      proposal: {
        pricePerLearner: number;
        pricePerTeacher: number;
        pricePerOrgAdmin: number;
        creditsIncluded: number;
        packageName: string;
        tier: string;
      };
      currency: CurrencyCode;
      maxLearners: number;
      maxTeachers: number;
      maxOrgAdmins: number;
      organizationIds: string[] | 'all';
    }) => {
      return await apiRequest('/api/admin/package-proposals/bulk-apply', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data: { success: boolean; results: { success: number; failed: number; errors: string[] }; message: string }) => {
      toast({
        title: 'Bulk apply completed',
        description: data.message,
        variant: data.results.failed > 0 ? 'destructive' : 'default',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/package-overrides'] });
      setBulkApplyDialogOpen(false);
      setSelectedProposal(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to bulk apply', description: error.message, variant: 'destructive' });
    },
  });

  const handleGenerateProposals = () => {
    generateProposalsMutation.mutate({
      targetUserCount: { learners, teachers, orgAdmins },
      preferredCurrency: currency,
      includeComparison: true,
    });
  };

  const handleApplyToOrganization = (proposal: PackageProposal) => {
    setSelectedProposal(proposal);
    setApplyDialogOpen(true);
  };

  const handleBulkApply = (proposal: PackageProposal) => {
    setSelectedProposal(proposal);
    setBulkApplyDialogOpen(true);
  };

  const getEffectiveProposalValues = (proposal: PackageProposal): EditedProposal => {
    return editedProposals[proposal.packageId] || {
      pricePerLearner: proposal.pricePerLearner,
      pricePerTeacher: proposal.pricePerTeacher,
      pricePerOrgAdmin: proposal.pricePerOrgAdmin,
      creditsIncluded: proposal.creditsIncluded,
    };
  };

  const handleEditProposal = (packageId: string, field: keyof EditedProposal, value: number) => {
    setEditedProposals(prev => ({
      ...prev,
      [packageId]: {
        ...(prev[packageId] || {}),
        [field]: value,
      },
    }));
  };

  const handleConfirmApply = () => {
    if (!selectedProposal || !selectedOrgId) {
      toast({ title: 'Please select an organization', variant: 'destructive' });
      return;
    }

    const effectiveValues = getEffectiveProposalValues(selectedProposal);
    const priceData: Record<string, number> = {};
    const currencyKey = currency.toUpperCase();
    priceData[`pricePerLearner${currencyKey}`] = effectiveValues.pricePerLearner;
    priceData[`pricePerTeacher${currencyKey}`] = effectiveValues.pricePerTeacher;
    priceData[`pricePerOrgAdmin${currencyKey}`] = effectiveValues.pricePerOrgAdmin;

    applyOverrideMutation.mutate({
      organizationId: selectedOrgId,
      maxLearners: learners,
      maxTeachers: teachers,
      maxOrgAdmins: orgAdmins,
      monthlyCredits: effectiveValues.creditsIncluded,
      ...priceData,
      reason: `Applied from Package Proposal: ${selectedProposal.packageName} (${selectedProposal.tier})`,
      isActive: true,
    });
  };

  const handleConfirmBulkApply = () => {
    if (!selectedProposal) return;

    const effectiveValues = getEffectiveProposalValues(selectedProposal);
    
    bulkApplyMutation.mutate({
      proposal: {
        pricePerLearner: effectiveValues.pricePerLearner,
        pricePerTeacher: effectiveValues.pricePerTeacher,
        pricePerOrgAdmin: effectiveValues.pricePerOrgAdmin,
        creditsIncluded: effectiveValues.creditsIncluded,
        packageName: selectedProposal.packageName,
        tier: selectedProposal.tier,
      },
      currency,
      maxLearners: learners,
      maxTeachers: teachers,
      maxOrgAdmins: orgAdmins,
      organizationIds: 'all',
    });
  };

  const getCurrencySymbol = (curr: string) => {
    const symbols: Record<string, string> = { ZAR: 'R', USD: '$', EUR: '€' };
    return symbols[curr] || curr;
  };

  const formatCurrency = (amount: number) => {
    return `${getCurrencySymbol(currency)}${(amount ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'starter': return 'bg-success/10 text-success';
      case 'professional': return 'bg-primary/10 text-primary';
      case 'enterprise': return 'bg-primary/10 text-primary';
      case 'custom': return 'bg-warning/10 text-warning';
      default: return 'bg-muted/30 text-muted-foreground';
    }
  };

  const getFitBadge = (fit: 'perfect' | 'adequate' | 'too_small' | 'too_large') => {
    switch (fit) {
      case 'perfect':
        return <Badge ><CheckCircle2 className="h-3 w-3 mr-1" />Perfect Fit</Badge>;
      case 'adequate':
        return <Badge ><Info className="h-3 w-3 mr-1" />Adequate</Badge>;
      case 'too_small':
        return <Badge ><XCircle className="h-3 w-3 mr-1" />Too Small</Badge>;
      case 'too_large':
        return <Badge ><AlertTriangle className="h-3 w-3 mr-1" />Too Large</Badge>;
      default:
        return <Badge variant="secondary">{fit}</Badge>;
    }
  };

  const totalSeats = learners + teachers + orgAdmins;

  const displayedProposals = useMemo(() => {
    if (!proposalResult) return [];
    if (proposalCount === 'all') return proposalResult.proposals;
    const count = parseInt(proposalCount);
    return proposalResult.proposals.slice(0, count);
  }, [proposalResult, proposalCount]);

  const calculateMonthlyLpcCost = (proposal: PackageProposal) => {
    const effectiveValues = getEffectiveProposalValues(proposal);
    return effectiveValues.creditsIncluded * proposal.costPerCredit;
  };

  const calculateEditedMonthlyCost = (proposal: PackageProposal) => {
    const effectiveValues = getEffectiveProposalValues(proposal);
    return (
      effectiveValues.pricePerLearner * learners +
      effectiveValues.pricePerTeacher * teachers +
      effectiveValues.pricePerOrgAdmin * orgAdmins
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Calculator className="h-6 w-6" />
            Package Proposal Generator
          </h2>
          <p className="text-muted-foreground">
            Generate and compare package proposals based on your organization's needs
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Target User Configuration</CardTitle>
          <CardDescription>
            Enter the number of users for each role to find the best package fit
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label htmlFor="learners" className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4" />
                Learner Seats
              </Label>
              <Input
                id="learners"
                type="number"
                min={0}
                value={learners}
                onChange={(e) => setLearners(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="teachers" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Instructor Seats
              </Label>
              <Input
                id="teachers"
                type="number"
                min={0}
                value={teachers}
                onChange={(e) => setTeachers(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="orgAdmins" className="flex items-center gap-2">
                <UserCog className="h-4 w-4" />
                Org Admins
              </Label>
              <Input
                id="orgAdmins"
                type="number"
                min={0}
                value={orgAdmins}
                onChange={(e) => setOrgAdmins(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as CurrencyCode)}>
                <SelectTrigger>
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Show Proposals</Label>
              <Select value={proposalCount} onValueChange={setProposalCount}>
                <SelectTrigger>
                  <SelectValue placeholder="Count" />
                </SelectTrigger>
                <SelectContent>
                  {PROPOSAL_COUNT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              Total seats: <span className="font-semibold text-foreground">{totalSeats}</span>
            </div>
            <Button onClick={handleGenerateProposals} disabled={generateProposalsMutation.isPending || totalSeats === 0} >
              {generateProposalsMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Calculator className="h-4 w-4 mr-2" />
              )}
              Generate Proposals
            </Button>
          </div>
        </CardContent>
      </Card>

      {generateProposalsMutation.isPending && (
        <Card>
          <CardContent className="py-8">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {proposalResult && (
        <>
          <Card className="border-border bg-primary/5">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-semibold text-foreground">Recommendation</h4>
                  <p className="text-muted-foreground">{proposalResult.recommendation}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {proposalCount === 'all' 
                  ? `All ${proposalResult.proposals.length} Proposals` 
                  : `Top ${Math.min(parseInt(proposalCount), proposalResult.proposals.length)} Proposals`}
              </CardTitle>
              <CardDescription>
                Compare packages based on your target user count of {totalSeats} users. 
                Click <Edit2 className="h-3 w-3 inline" /> to edit pricing before applying.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Package</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead className="text-right">Per Learner Seat</TableHead>
                      <TableHead className="text-right">Per Instructor Seat</TableHead>
                      <TableHead className="text-right">Per Org Admin</TableHead>
                      <TableHead className="text-right">Monthly Cost</TableHead>
                      <TableHead className="text-right">Credits</TableHead>
                      <TableHead className="text-right">LPC Cost</TableHead>
                      <TableHead>Fit</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedProposals.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                          No packages available. Create packages first.
                        </TableCell>
                      </TableRow>
                    ) : (
                      displayedProposals.map((proposal) => {
                        const isEditing = editingPackageId === proposal.packageId;
                        const effectiveValues = getEffectiveProposalValues(proposal);
                        const hasEdits = !!editedProposals[proposal.packageId];
                        const editedMonthlyCost = calculateEditedMonthlyCost(proposal);
                        const monthlyLpcCost = calculateMonthlyLpcCost(proposal);

                        return (
                          <TableRow key={proposal.packageId} className={proposal.overallFit === 'perfect' ? 'bg-success/5' : ''}>
                            <TableCell className="font-medium">
                              {proposal.packageName}
                              {hasEdits && <Badge variant="outline" className="ml-2 text-xs">Edited</Badge>}
                            </TableCell>
                            <TableCell>
                              <Badge className={getTierColor(proposal.tier)}>{proposal.tier}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {isEditing ? (
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={effectiveValues.pricePerLearner}
                                  onChange={(e) => handleEditProposal(proposal.packageId, 'pricePerLearner', parseFloat(e.target.value) || 0)}
                                  className="w-24 text-right"
                                />
                              ) : (
                                formatCurrency(effectiveValues.pricePerLearner)
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {isEditing ? (
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={effectiveValues.pricePerTeacher}
                                  onChange={(e) => handleEditProposal(proposal.packageId, 'pricePerTeacher', parseFloat(e.target.value) || 0)}
                                  className="w-24 text-right"
                                />
                              ) : (
                                formatCurrency(effectiveValues.pricePerTeacher)
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {isEditing ? (
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={effectiveValues.pricePerOrgAdmin}
                                  onChange={(e) => handleEditProposal(proposal.packageId, 'pricePerOrgAdmin', parseFloat(e.target.value) || 0)}
                                  className="w-24 text-right"
                                />
                              ) : (
                                formatCurrency(effectiveValues.pricePerOrgAdmin)
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold">
                              {formatCurrency(editedMonthlyCost)}
                            </TableCell>
                            <TableCell className="text-right">
                              {isEditing ? (
                                <Input
                                  type="number"
                                  min={0}
                                  value={effectiveValues.creditsIncluded}
                                  onChange={(e) => handleEditProposal(proposal.packageId, 'creditsIncluded', parseInt(e.target.value) || 0)}
                                  className="w-24 text-right"
                                />
                              ) : (
                                effectiveValues.creditsIncluded.toLocaleString()
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono text-muted-foreground">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="flex items-center justify-end gap-1 cursor-help">
                                      <Coins className="h-3 w-3" />
                                      {formatCurrency(monthlyLpcCost)}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Monthly LPC Cost = Credits × Cost per Credit</p>
                                    <p className="font-mono">{effectiveValues.creditsIncluded.toLocaleString()} × {formatCurrency(proposal.costPerCredit)}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableCell>
                            <TableCell>{getFitBadge(proposal.overallFit)}</TableCell>
                            <TableCell>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                      <Info className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="max-w-xs">
                                    <div className="space-y-2">
                                      {proposal.highlights.length > 0 && (
                                        <div>
                                          <p className="font-semibold text-success">Highlights</p>
                                          <ul className="text-sm list-disc list-inside">
                                            {proposal.highlights.map((h, i) => (
                                              <li key={i}>{h}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                      {proposal.limitations.length > 0 && (
                                        <div>
                                          <p className="font-semibold text-destructive">Limitations</p>
                                          <ul className="text-sm list-disc list-inside">
                                            {proposal.limitations.map((l, i) => (
                                              <li key={i}>{l}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                      {proposal.highlights.length === 0 && proposal.limitations.length === 0 && (
                                        <p className="text-muted-foreground">No additional details</p>
                                      )}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="sm" onClick={() => setEditingPackageId(isEditing ? null : proposal.packageId)}
                                  title={isEditing ? 'Done editing' : 'Edit pricing'}
                                >
                                  <Edit2 className={`h-4 w-4 ${isEditing ? 'text-primary' : ''}`} />
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => handleApplyToOrganization(proposal)}
                                  disabled={proposal.overallFit === 'too_small'}
                                  title="Apply to single organization"
                                >
                                  <Building2 className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => handleBulkApply(proposal)}
                                  disabled={proposal.overallFit === 'too_small'}
                                  title="Apply to all organizations"
                                  className="text-warning hover:text-warning"
                                >
                                  <Globe className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {proposalResult.comparisonTable && proposalResult.comparisonTable.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Value Comparison</CardTitle>
                <CardDescription>
                  Compare per-seat pricing and value scores across packages
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Package</TableHead>
                        <TableHead>Tier</TableHead>
                        <TableHead className="text-right">Price/Seat</TableHead>
                        <TableHead className="text-right">Credits/Seat</TableHead>
                        <TableHead className="text-right">Value Score</TableHead>
                        <TableHead>Fit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {proposalResult.comparisonTable.map((row) => (
                        <TableRow key={row.packageId}>
                          <TableCell className="font-medium">{row.packageName}</TableCell>
                          <TableCell>
                            <Badge className={getTierColor(row.tier)}>{row.tier}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(row.pricePerSeat)}
                          </TableCell>
                          <TableCell className="text-right">{row.creditsPerSeat.toFixed(1)}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">{row.valueScore.toFixed(2)}</Badge>
                          </TableCell>
                          <TableCell>{getFitBadge(row.fit)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Package to Organization</DialogTitle>
            <DialogDescription>
              Apply the selected package configuration as a custom override for an organization.
            </DialogDescription>
          </DialogHeader>
          {selectedProposal && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Package:</span>
                  <span className="font-medium">{selectedProposal.packageName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tier:</span>
                  <Badge className={getTierColor(selectedProposal.tier)}>{selectedProposal.tier}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Per Learner Seat:</span>
                  <span className="font-mono">{formatCurrency(getEffectiveProposalValues(selectedProposal).pricePerLearner)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Per Instructor Seat:</span>
                  <span className="font-mono">{formatCurrency(getEffectiveProposalValues(selectedProposal).pricePerTeacher)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Per Org Admin:</span>
                  <span className="font-mono">{formatCurrency(getEffectiveProposalValues(selectedProposal).pricePerOrgAdmin)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monthly Cost:</span>
                  <span className="font-mono font-semibold">{formatCurrency(calculateEditedMonthlyCost(selectedProposal))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Credits:</span>
                  <span>{getEffectiveProposalValues(selectedProposal).creditsIncluded.toLocaleString()}</span>
                </div>
                {editedProposals[selectedProposal.packageId] && (
                  <Badge variant="outline" className="mt-2">Using edited values</Badge>
                )}
              </div>
              <div className="space-y-2">
                <Label>Select Organization</Label>
                <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name} ({org.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmApply} disabled={applyOverrideMutation.isPending || !selectedOrgId} >
              {applyOverrideMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Apply Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={bulkApplyDialogOpen} onOpenChange={setBulkApplyDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-5 w-5" />
              Apply to ALL Organizations
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This action will create or update package overrides for <strong>all active organizations</strong> in the system.
                </p>
                {selectedProposal && (
                  <div className="p-4 bg-muted rounded-lg space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Package:</span>
                      <span className="font-medium">{selectedProposal.packageName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Per Learner Seat:</span>
                      <span className="font-mono">{formatCurrency(getEffectiveProposalValues(selectedProposal).pricePerLearner)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Per Instructor Seat:</span>
                      <span className="font-mono">{formatCurrency(getEffectiveProposalValues(selectedProposal).pricePerTeacher)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Per Org Admin:</span>
                      <span className="font-mono">{formatCurrency(getEffectiveProposalValues(selectedProposal).pricePerOrgAdmin)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Credits:</span>
                      <span>{getEffectiveProposalValues(selectedProposal).creditsIncluded.toLocaleString()}</span>
                    </div>
                    {editedProposals[selectedProposal.packageId] && (
                      <Badge variant="outline" className="mt-2">Using edited values</Badge>
                    )}
                  </div>
                )}
                <p className="text-destructive font-medium">
                  ⚠️ Existing overrides will be updated. This cannot be easily undone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmBulkApply}
              disabled={bulkApplyMutation.isPending}
              className="bg-warning hover:bg-warning/90"
            >
              {bulkApplyMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Globe className="h-4 w-4 mr-2" />
              )}
              Apply to All Organizations
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
