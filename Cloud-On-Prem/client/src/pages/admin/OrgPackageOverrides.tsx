import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import QuizAdminLayout from "@/components/QuizAdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Edit, Trash2, Building2, Users, GraduationCap, DollarSign, Percent, Calendar, Package } from "lucide-react";
import { tzFormat } from '@/utils/timezoneRuntime';

interface Organization {
  id: string;
  name: string;
  type: string;
}

interface PackageOverride {
  id: string;
  organizationId: string;
  maxLearners: number | null;
  maxTeachers: number | null;
  maxOrgAdmins: number | null;
  monthlyCredits: number | null;
  pricePerLearnerZAR: string | null;
  pricePerLearnerUSD: string | null;
  pricePerLearnerEUR: string | null;
  pricePerTeacherZAR: string | null;
  pricePerTeacherUSD: string | null;
  pricePerTeacherEUR: string | null;
  pricePerOrgAdminZAR: string | null;
  pricePerOrgAdminUSD: string | null;
  pricePerOrgAdminEUR: string | null;
  discountPercentage: number;
  reason: string | null;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
  createdAt: string;
  organization: Organization;
  createdByUser: { gamerName: string } | null;
}

const overrideFormSchema = z.object({
  organizationId: z.string().min(1, "Organization is required"),
  maxLearners: z.coerce.number().int().positive().nullable().optional(),
  maxTeachers: z.coerce.number().int().positive().nullable().optional(),
  maxOrgAdmins: z.coerce.number().int().positive().nullable().optional(),
  monthlyCredits: z.coerce.number().int().min(0).nullable().optional(),
  pricePerLearnerZAR: z.coerce.number().min(0).nullable().optional(),
  pricePerLearnerUSD: z.coerce.number().min(0).nullable().optional(),
  pricePerLearnerEUR: z.coerce.number().min(0).nullable().optional(),
  pricePerTeacherZAR: z.coerce.number().min(0).nullable().optional(),
  pricePerTeacherUSD: z.coerce.number().min(0).nullable().optional(),
  pricePerTeacherEUR: z.coerce.number().min(0).nullable().optional(),
  pricePerOrgAdminZAR: z.coerce.number().min(0).nullable().optional(),
  pricePerOrgAdminUSD: z.coerce.number().min(0).nullable().optional(),
  pricePerOrgAdminEUR: z.coerce.number().min(0).nullable().optional(),
  discountPercentage: z.number().min(0).max(100).default(0),
  reason: z.string().nullable().optional(),
  validUntil: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

type OverrideFormData = z.infer<typeof overrideFormSchema>;

export default function OrgPackageOverrides() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOverride, setEditingOverride] = useState<PackageOverride | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [overrideToDelete, setOverrideToDelete] = useState<PackageOverride | null>(null);

  const { data: overridesData, isLoading: overridesLoading } = useQuery<{ overrides: PackageOverride[] }>({
    queryKey: ["/api/superadmin/package-overrides"],
  });

  const { data: organizationsData } = useQuery<{ organizations: Organization[] }>({
    queryKey: ["/api/superadmin/organizations-for-override"],
  });

  const overrides = overridesData?.overrides ?? [];
  const organizations = organizationsData?.organizations ?? [];

  const filteredOverrides = overrides.filter((override) =>
    override.organization.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const existingOrgIds = overrides.map((o) => o.organizationId);
  const availableOrganizations = organizations.filter((org) => !existingOrgIds.includes(org.id));

  const form = useForm<OverrideFormData>({
    resolver: zodResolver(overrideFormSchema),
    defaultValues: {
      organizationId: "",
      maxLearners: null,
      maxTeachers: null,
      maxOrgAdmins: null,
      monthlyCredits: null,
      pricePerLearnerZAR: null,
      pricePerLearnerUSD: null,
      pricePerLearnerEUR: null,
      pricePerTeacherZAR: null,
      pricePerTeacherUSD: null,
      pricePerTeacherEUR: null,
      pricePerOrgAdminZAR: null,
      pricePerOrgAdminUSD: null,
      pricePerOrgAdminEUR: null,
      discountPercentage: 0,
      reason: "",
      validUntil: "",
      isActive: true,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: OverrideFormData) => {
      return await apiRequest("/api/superadmin/package-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/package-overrides"] });
      toast({ title: "Override created", description: "The package override has been created successfully." });
      setDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create override.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<OverrideFormData> }) => {
      return await apiRequest(`/api/superadmin/package-overrides/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/package-overrides"] });
      toast({ title: "Override updated", description: "The package override has been updated successfully." });
      setDialogOpen(false);
      setEditingOverride(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update override.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/superadmin/package-overrides/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/package-overrides"] });
      toast({ title: "Override deleted", description: "The package override has been deleted." });
      setDeleteDialogOpen(false);
      setOverrideToDelete(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete override.", variant: "destructive" });
    },
  });

  const handleOpenCreate = () => {
    setEditingOverride(null);
    form.reset({
      organizationId: "",
      maxLearners: null,
      maxTeachers: null,
      maxOrgAdmins: null,
      monthlyCredits: null,
      pricePerLearnerZAR: null,
      pricePerLearnerUSD: null,
      pricePerLearnerEUR: null,
      pricePerTeacherZAR: null,
      pricePerTeacherUSD: null,
      pricePerTeacherEUR: null,
      pricePerOrgAdminZAR: null,
      pricePerOrgAdminUSD: null,
      pricePerOrgAdminEUR: null,
      discountPercentage: 0,
      reason: "",
      validUntil: "",
      isActive: true,
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (override: PackageOverride) => {
    setEditingOverride(override);
    form.reset({
      organizationId: override.organizationId,
      maxLearners: override.maxLearners,
      maxTeachers: override.maxTeachers,
      maxOrgAdmins: override.maxOrgAdmins,
      monthlyCredits: override.monthlyCredits,
      pricePerLearnerZAR: override.pricePerLearnerZAR ? parseFloat(override.pricePerLearnerZAR) : null,
      pricePerLearnerUSD: override.pricePerLearnerUSD ? parseFloat(override.pricePerLearnerUSD) : null,
      pricePerLearnerEUR: override.pricePerLearnerEUR ? parseFloat(override.pricePerLearnerEUR) : null,
      pricePerTeacherZAR: override.pricePerTeacherZAR ? parseFloat(override.pricePerTeacherZAR) : null,
      pricePerTeacherUSD: override.pricePerTeacherUSD ? parseFloat(override.pricePerTeacherUSD) : null,
      pricePerTeacherEUR: override.pricePerTeacherEUR ? parseFloat(override.pricePerTeacherEUR) : null,
      pricePerOrgAdminZAR: override.pricePerOrgAdminZAR ? parseFloat(override.pricePerOrgAdminZAR) : null,
      pricePerOrgAdminUSD: override.pricePerOrgAdminUSD ? parseFloat(override.pricePerOrgAdminUSD) : null,
      pricePerOrgAdminEUR: override.pricePerOrgAdminEUR ? parseFloat(override.pricePerOrgAdminEUR) : null,
      discountPercentage: override.discountPercentage ?? 0,
      reason: override.reason ?? "",
      validUntil: override.validUntil ? override.validUntil.split("T")[0] : "",
      isActive: override.isActive,
    });
    setDialogOpen(true);
  };

  const handleSubmit = (data: OverrideFormData) => {
    if (editingOverride) {
      updateMutation.mutate({ id: editingOverride.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (override: PackageOverride) => {
    setOverrideToDelete(override);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (overrideToDelete) {
      deleteMutation.mutate(overrideToDelete.id);
    }
  };

  const activeCount = overrides.filter((o) => o.isActive).length;
  const totalDiscount = overrides.reduce((sum, o) => sum + (o.discountPercentage || 0), 0);
  const avgDiscount = overrides.length > 0 ? Math.round(totalDiscount / overrides.length) : 0;

  return (
    <QuizAdminLayout
      title="Organization Package Overrides"
      description="Manage custom pricing and limits for specific organizations"
      activeSection="packages"
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-surface-raised border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Overrides</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{overridesLoading ? "..." : overrides.length}</div>
            </CardContent>
          </Card>

          <Card className="bg-success/10 border-[var(--success)]/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Overrides</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{overridesLoading ? "..." : activeCount}</div>
            </CardContent>
          </Card>

          <Card className="bg-warning/10 border-[var(--warning)]/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Discount</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{overridesLoading ? "..." : `${avgDiscount}%`}</div>
            </CardContent>
          </Card>

          <Card className="bg-surface-raised border-secondary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Available Orgs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{availableOrganizations.length}</div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search organizations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-muted border-border text-foreground"
            />
          </div>
          <Button onClick={handleOpenCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            Create Override
          </Button>
        </div>

        <Card className="bg-card border-border">
          <CardContent className="p-0">
            {overridesLoading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredOverrides.length === 0 ? (
              <div className="p-12 text-center">
                <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">No Overrides Found</h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm ? "No overrides match your search." : "Create your first package override to customize pricing for an organization."}
                </p>
                {!searchTerm && (
                  <Button onClick={handleOpenCreate} variant="outline">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Override
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Organization</TableHead>
                      <TableHead className="text-muted-foreground">Status</TableHead>
                      <TableHead className="text-muted-foreground">Learner Seat Limit</TableHead>
                      <TableHead className="text-muted-foreground">Instructor Seat Limit</TableHead>
                      <TableHead className="text-muted-foreground">Monthly Credits</TableHead>
                      <TableHead className="text-muted-foreground">Discount</TableHead>
                      <TableHead className="text-muted-foreground">Valid Until</TableHead>
                      <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOverrides.map((override) => (
                      <TableRow key={override.id} className="border-border hover:bg-muted/50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Building2 className="w-4 h-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{override.organization.name}</p>
                              <p className="text-xs text-muted-foreground capitalize">{override.organization.type}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={ override.isActive ? "bg-success/10 text-success border-[var(--success)]/30" : "bg-muted text-muted-foreground border-border" } >
                            {override.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-foreground">{override.maxLearners ?? "Default"}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-foreground">{override.maxTeachers ?? "Default"}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-foreground">{override.monthlyCredits ?? "Default"}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" >
                            {override.discountPercentage}%
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-foreground">
                            {override.validUntil ? tzFormat(override.validUntil, "PP") : "No expiry"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(override)}>
                              <Edit className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(override)}>
                              <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingOverride ? "Edit Override" : "Create Package Override"}</DialogTitle>
              <DialogDescription>
                {editingOverride
                  ? "Update the custom package terms for this organization."
                  : "Set custom pricing and limits for a specific organization."}
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                {!editingOverride && (
                  <FormField
                    control={form.control}
                    name="organizationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organization</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-muted border-border">
                              <SelectValue placeholder="Select an organization" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {availableOrganizations.map((org) => (
                              <SelectItem key={org.id} value={org.id}>
                                {org.name} ({org.type})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="space-y-4">
                  <h4 className="font-medium text-foreground flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Custom Seat Limits
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="maxLearners"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Learner Seats</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="Default"
                              {...field}
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                              className="bg-muted border-border"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="maxTeachers"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Instructor Seats</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="Default"
                              {...field}
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                              className="bg-muted border-border"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="maxOrgAdmins"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Org Admins</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="Default"
                              {...field}
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                              className="bg-muted border-border"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="monthlyCredits"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <GraduationCap className="w-4 h-4" />
                        Custom Monthly Credits
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Default"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                          className="bg-muted border-border"
                        />
                      </FormControl>
                      <FormDescription>Leave empty to use default package credits</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-4">
                  <h4 className="font-medium text-foreground flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Custom Pricing (per seat/month)
                  </h4>

                  <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                    <Label className="text-sm font-medium">Learner Seat Pricing</Label>
                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="pricePerLearnerZAR"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">ZAR</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="Default"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                                className="bg-background border-border"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="pricePerLearnerUSD"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">USD</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="Default"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                                className="bg-background border-border"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="pricePerLearnerEUR"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">EUR</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="Default"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                                className="bg-background border-border"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                    <Label className="text-sm font-medium">Instructor Seat Pricing</Label>
                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="pricePerTeacherZAR"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">ZAR</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="Default"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                                className="bg-background border-border"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="pricePerTeacherUSD"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">USD</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="Default"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                                className="bg-background border-border"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="pricePerTeacherEUR"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">EUR</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="Default"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                                className="bg-background border-border"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                    <Label className="text-sm font-medium">Org Admin Pricing</Label>
                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="pricePerOrgAdminZAR"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">ZAR</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="Default"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                                className="bg-background border-border"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="pricePerOrgAdminUSD"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">USD</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="Default"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                                className="bg-background border-border"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="pricePerOrgAdminEUR"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">EUR</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="Default"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                                className="bg-background border-border"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="discountPercentage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Percent className="w-4 h-4" />
                        Discount Percentage: {field.value}%
                      </FormLabel>
                      <FormControl>
                        <Slider
                          min={0}
                          max={100}
                          step={1}
                          value={[field.value]}
                          onValueChange={(values) => field.onChange(values[0])}
                          className="py-4"
                        />
                      </FormControl>
                      <FormDescription>Applied to the base package price</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="validUntil"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        Valid Until
                      </FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value ?? ""} className="bg-muted border-border" />
                      </FormControl>
                      <FormDescription>Leave empty for no expiration</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason/Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="e.g., Enterprise deal negotiated by sales team"
                          {...field}
                          value={field.value ?? ""}
                          className="bg-muted border-border resize-none"
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Active</FormLabel>
                        <FormDescription>Enable this override for the organization</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {createMutation.isPending || updateMutation.isPending
                      ? "Saving..."
                      : editingOverride
                      ? "Update Override"
                      : "Create Override"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Override</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete the package override for{" "}
                <strong>{overrideToDelete?.organization.name}</strong>? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </QuizAdminLayout>
  );
}
