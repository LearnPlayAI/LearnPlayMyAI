import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, DollarSign, Check, X, BarChart3, Package } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PackageAnalytics } from './PackageAnalytics';

import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

interface PricingSettings {
  platformCostTiers: Array<{ credits: number; cost: number; currency?: 'ZAR' | 'USD' | 'EUR' }>;
}

interface ExchangeRate {
  baseCurrency: string;
  targetCurrency: string;
  rate: string;
  isActive: boolean;
}

interface ExchangeRatesResponse {
  rates: ExchangeRate[];
}

interface PackagePrice {
  id: string;
  packageId: string;
  currency: 'ZAR' | 'EUR' | 'USD';
  pricePerLearner: string;
  pricePerTeacher: string;
  pricePerOrgAdmin: string;
}

interface BusinessPackage {
  id: string;
  name: string;
  tier: 'starter' | 'professional' | 'enterprise' | 'custom';
  maxLearners: number;
  maxTeachers: number;
  maxOrgAdmins: number;
  monthlyCredits: number;
  annualDiscountPercent: string;
  valueProposition: string | null;
  features: string[];
  badge: string | null;
  colorScheme: string;
  isActive: boolean;
  displayOrder: number;
  prices?: PackagePrice[];
}

const TIERS = ['starter', 'professional', 'enterprise', 'custom'] as const;
const COLOR_SCHEMES = ['green', 'blue', 'purple', 'orange'] as const;
const BADGES = ['Most Popular', 'Best Value'] as const;
const CURRENCIES = ['ZAR', 'EUR', 'USD'] as const;

const packageFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  tier: z.enum(TIERS),
  maxLearners: z.coerce.number().min(0, 'Must be 0 or greater'),
  maxTeachers: z.coerce.number().min(0, 'Must be 0 or greater'),
  maxOrgAdmins: z.coerce.number().min(0, 'Must be 0 or greater'),
  monthlyCredits: z.coerce.number().min(0, 'Must be 0 or greater'),
  annualDiscountPercent: z.coerce.number().min(0).max(100),
  valueProposition: z.string().optional(),
  features: z.string().optional(),
  badge: z.string().optional(),
  colorScheme: z.enum(COLOR_SCHEMES),
  isActive: z.boolean(),
  displayOrder: z.coerce.number().min(0),
});

type PackageFormValues = z.infer<typeof packageFormSchema>;

const priceFormSchema = z.object({
  currency: z.enum(CURRENCIES),
  pricePerLearner: z.coerce.number().min(0, 'Must be 0 or greater'),
  pricePerTeacher: z.coerce.number().min(0, 'Must be 0 or greater'),
  pricePerOrgAdmin: z.coerce.number().min(0, 'Must be 0 or greater'),
});

type PriceFormValues = z.infer<typeof priceFormSchema>;

export function BusinessPackageManager() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<BusinessPackage | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingPackageId, setDeletingPackageId] = useState<string | null>(null);
  
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [pricingPackage, setPricingPackage] = useState<BusinessPackage | null>(null);
  const [editingPrice, setEditingPrice] = useState<PackagePrice | null>(null);
  const [deletePriceDialogOpen, setDeletePriceDialogOpen] = useState(false);
  const [deletingPriceId, setDeletingPriceId] = useState<string | null>(null);

  const form = useForm<PackageFormValues>({
    resolver: zodResolver(packageFormSchema),
    defaultValues: {
      name: '',
      tier: 'starter',
      maxLearners: 10,
      maxTeachers: 2,
      maxOrgAdmins: 1,
      monthlyCredits: 100,
      annualDiscountPercent: 0,
      valueProposition: '',
      features: '',
      badge: 'none',
      colorScheme: 'blue',
      isActive: true,
      displayOrder: 0,
    },
  });

  const priceForm = useForm<PriceFormValues>({
    resolver: zodResolver(priceFormSchema),
    defaultValues: {
      currency: 'ZAR',
      pricePerLearner: 0,
      pricePerTeacher: 0,
      pricePerOrgAdmin: 0,
    },
  });

  const { data: packages = [], isLoading } = useQuery<BusinessPackage[]>({
    queryKey: ['/api/admin/business-packages'],
  });

  const { data: pricingSettingsData } = useQuery<{ settings: PricingSettings }>({
    queryKey: ['/api/admin/lesson-credit-pricing-settings'],
  });

  const { data: exchangeRatesData } = useQuery<ExchangeRatesResponse>({
    queryKey: ['/api/currency/rates'],
  });

  const calculateCostPerCreditUSD = (): number => {
    const tiers = pricingSettingsData?.settings?.platformCostTiers;
    if (!tiers || tiers.length === 0) return 0;
    const rates = exchangeRatesData?.rates || [];
    
    let totalCredits = 0;
    let totalCost = 0;
    for (const tier of tiers) {
      const tierCurrency = tier.currency || 'ZAR';
      let usdCost = tier.cost;
      if (tierCurrency !== 'USD') {
        if (tierCurrency === 'ZAR') {
          const usdToZar = rates.find(r => r.baseCurrency === 'USD' && r.targetCurrency === 'ZAR' && r.isActive);
          if (!usdToZar) continue;
          usdCost = tier.cost / parseFloat(usdToZar.rate);
        } else if (tierCurrency === 'EUR') {
          const usdToEur = rates.find(r => r.baseCurrency === 'USD' && r.targetCurrency === 'EUR' && r.isActive);
          if (!usdToEur) continue;
          usdCost = tier.cost / parseFloat(usdToEur.rate);
        }
      }
      totalCredits += tier.credits;
      totalCost += usdCost;
    }
    return totalCredits > 0 ? totalCost / totalCredits : 0;
  };

  const convertUSDToCurrency = (amountUSD: number, targetCurrency: string): number => {
    if (targetCurrency === 'USD') return amountUSD;
    const rates = exchangeRatesData?.rates || [];
    
    const targetRate = rates.find(r => 
      r.baseCurrency === 'USD' && r.targetCurrency === targetCurrency && r.isActive
    );
    
    if (!targetRate) return amountUSD;
    return amountUSD * parseFloat(targetRate.rate);
  };

  const calculateProfitInfo = (price: PackagePrice, monthlyCredits: number, maxSeats: { learners: number; teachers: number; admins: number }) => {
    const costPerCreditUSD = calculateCostPerCreditUSD();
    const monthlyCreditsValue = monthlyCredits || 0;
    
    const platformCostUSD = monthlyCreditsValue * costPerCreditUSD;
    const platformCostLocal = convertUSDToCurrency(platformCostUSD, price.currency);
    
    const pricePerLearner = parseFloat(price.pricePerLearner) || 0;
    const pricePerTeacher = parseFloat(price.pricePerTeacher) || 0;
    const pricePerOrgAdmin = parseFloat(price.pricePerOrgAdmin) || 0;
    
    const typicalRevenue = (pricePerLearner * Math.min(maxSeats.learners, 10)) + 
                          (pricePerTeacher * Math.min(maxSeats.teachers, 3)) + 
                          (pricePerOrgAdmin * Math.min(maxSeats.admins, 2));
    
    const profit = typicalRevenue - platformCostLocal;
    const profitMargin = typicalRevenue > 0 ? (profit / typicalRevenue) * 100 : 0;
    
    return {
      platformCost: platformCostLocal,
      typicalRevenue,
      profit,
      profitMargin,
      isHealthy: profitMargin >= 30,
    };
  };

  const createMutation = useMutation({
    mutationFn: async (data: PackageFormValues) => {
      const features = data.features ? data.features.split('\n').filter(f => f.trim()) : [];
      return await apiRequest('/api/admin/business-packages', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          features,
          badge: data.badge === 'none' ? null : data.badge,
          valueProposition: data.valueProposition || null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/business-packages'] });
      toast({ title: 'Package created successfully' });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create package', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: PackageFormValues }) => {
      const features = data.features ? data.features.split('\n').filter(f => f.trim()) : [];
      return await apiRequest(`/api/admin/business-packages/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...data,
          features,
          badge: data.badge === 'none' ? null : data.badge,
          valueProposition: data.valueProposition || null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/business-packages'] });
      toast({ title: 'Package updated successfully' });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update package', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/business-packages/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/business-packages'] });
      toast({ title: 'Package deleted successfully' });
      setDeleteDialogOpen(false);
      setDeletingPackageId(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete package', description: error.message, variant: 'destructive' });
    },
  });

  const priceMutation = useMutation({
    mutationFn: async ({ packageId, data, priceId }: { packageId: string; data: PriceFormValues; priceId?: string }) => {
      const url = priceId 
        ? `/api/admin/business-packages/${packageId}/prices/${priceId}`
        : `/api/admin/business-packages/${packageId}/prices`;
      return await apiRequest(url, {
        method: priceId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          currency: data.currency,
          pricePerLearner: data.pricePerLearner.toString(),
          pricePerTeacher: data.pricePerTeacher.toString(),
          pricePerOrgAdmin: data.pricePerOrgAdmin.toString(),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/business-packages'] });
      toast({ title: editingPrice ? 'Price updated successfully' : 'Price added successfully' });
      handleClosePriceDialog();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to save price', description: error.message, variant: 'destructive' });
    },
  });

  const deletePriceMutation = useMutation({
    mutationFn: async ({ packageId, priceId }: { packageId: string; priceId: string }) => {
      return await apiRequest(`/api/admin/business-packages/${packageId}/prices/${priceId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/business-packages'] });
      toast({ title: 'Price deleted successfully' });
      setDeletePriceDialogOpen(false);
      setDeletingPriceId(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete price', description: error.message, variant: 'destructive' });
    },
  });

  const handleOpenDialog = (pkg?: BusinessPackage) => {
    if (pkg) {
      setEditingPackage(pkg);
      form.reset({
        name: pkg.name,
        tier: pkg.tier,
        maxLearners: pkg.maxLearners,
        maxTeachers: pkg.maxTeachers,
        maxOrgAdmins: pkg.maxOrgAdmins,
        monthlyCredits: pkg.monthlyCredits,
        annualDiscountPercent: parseFloat(pkg.annualDiscountPercent),
        valueProposition: pkg.valueProposition || '',
        features: pkg.features?.join('\n') || '',
        badge: pkg.badge || 'none',
        colorScheme: pkg.colorScheme as typeof COLOR_SCHEMES[number],
        isActive: pkg.isActive,
        displayOrder: pkg.displayOrder,
      });
    } else {
      setEditingPackage(null);
      form.reset({
        name: '',
        tier: 'starter',
        maxLearners: 10,
        maxTeachers: 2,
        maxOrgAdmins: 1,
        monthlyCredits: 100,
        annualDiscountPercent: 0,
        valueProposition: '',
        features: '',
        badge: 'none',
        colorScheme: 'blue',
        isActive: true,
        displayOrder: 0,
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingPackage(null);
    form.reset();
  };

  const handleSubmit = (data: PackageFormValues) => {
    if (editingPackage) {
      updateMutation.mutate({ id: editingPackage.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDeleteClick = (id: string) => {
    setDeletingPackageId(id);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (deletingPackageId) {
      deleteMutation.mutate(deletingPackageId);
    }
  };

  const handleOpenPriceDialog = (pkg: BusinessPackage, price?: PackagePrice) => {
    setPricingPackage(pkg);
    if (price) {
      setEditingPrice(price);
      priceForm.reset({
        currency: price.currency,
        pricePerLearner: parseFloat(price.pricePerLearner),
        pricePerTeacher: parseFloat(price.pricePerTeacher),
        pricePerOrgAdmin: parseFloat(price.pricePerOrgAdmin),
      });
    } else {
      setEditingPrice(null);
      priceForm.reset({
        currency: 'ZAR',
        pricePerLearner: 0,
        pricePerTeacher: 0,
        pricePerOrgAdmin: 0,
      });
    }
    setPriceDialogOpen(true);
  };

  const handleClosePriceDialog = () => {
    setPriceDialogOpen(false);
    setPricingPackage(null);
    setEditingPrice(null);
    priceForm.reset();
  };

  const handlePriceSubmit = (data: PriceFormValues) => {
    if (pricingPackage) {
      priceMutation.mutate({ 
        packageId: pricingPackage.id, 
        data, 
        priceId: editingPrice?.id 
      });
    }
  };

  const handleDeletePriceClick = (packageId: string, priceId: string) => {
    setPricingPackage(packages.find(p => p.id === packageId) || null);
    setDeletingPriceId(priceId);
    setDeletePriceDialogOpen(true);
  };

  const handleConfirmDeletePrice = () => {
    if (pricingPackage && deletingPriceId) {
      deletePriceMutation.mutate({ packageId: pricingPackage.id, priceId: deletingPriceId });
    }
  };

  const formatCurrency = (amount: string, currency: string) => {
    const num = parseFloat(amount);
    const symbols: Record<string, string> = { ZAR: 'R', USD: '$', EUR: '€' };
    return `${symbols[currency] || ''}${num.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-foreground">Loading packages...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="packages" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="packages" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Packages
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="packages">
      <Card>
        <CardHeader className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-foreground">Business Packages</CardTitle>
              <CardDescription>Manage subscription packages and their pricing</CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()} 
              className="min-h-[44px]"
              data-testid="button-create-package"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Package
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Badge</TableHead>
                  <TableHead>Seats (L/T/A)</TableHead>
                  <TableHead>Monthly LP Credits</TableHead>
                  <TableHead>Prices</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No packages found. Create your first package.
                    </TableCell>
                  </TableRow>
                ) : (
                  packages.map((pkg) => (
                    <TableRow key={pkg.id}>
                      <TableCell className="font-medium">{pkg.name}</TableCell>
                      <TableCell>
                        <Badge className={getTierColor(pkg.tier)}>
                          {pkg.tier}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {pkg.badge && (
                          <Badge variant="outline">{pkg.badge}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {pkg.maxLearners}/{pkg.maxTeachers}/{pkg.maxOrgAdmins}
                      </TableCell>
                      <TableCell>{(pkg.monthlyCredits ?? 0).toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {pkg.prices?.map((price) => (
                            <Badge key={price.id} variant="secondary" className="cursor-pointer text-xs" onClick={() => handleOpenPriceDialog(pkg, price)}
                            >
                              {price.currency}: {formatCurrency(price.pricePerLearner, price.currency)}/L
                            </Badge>
                          ))}
                          <Button variant="ghost" size="sm" onClick={() => handleOpenPriceDialog(pkg)}
                            className="h-6 px-2"
                            data-testid={`button-add-price-${pkg.id}`}
                          >
                            <DollarSign className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        {pkg.isActive ? (
                          <Badge >
                            <Check className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <X className="h-3 w-3 mr-1" />
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(pkg)}
                            data-testid={`button-edit-${pkg.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(pkg.id)}
                            className="text-destructive hover:text-destructive"
                            data-testid={`button-delete-${pkg.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      </TabsContent>
        
      <TabsContent value="analytics">
        <PackageAnalytics />
      </TabsContent>
    </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPackage ? 'Edit Package' : 'Create Package'}</DialogTitle>
            <DialogDescription>
              {editingPackage ? 'Update the package details below' : 'Fill in the details to create a new package'}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Package name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tier</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select tier" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TIERS.map((tier) => (
                            <SelectItem key={tier} value={tier} className="capitalize">
                              {tier}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="maxLearners"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Learner Seats</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" {...field} />
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
                        <Input type="number" min="0" {...field} />
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
                        <Input type="number" min="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="monthlyCredits"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monthly LP Credits</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="annualDiscountPercent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Annual Discount %</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" max="100" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="valueProposition"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Value Proposition</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Brief description of what this package offers" 
                        rows={2}
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="features"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Features (one per line)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Feature 1&#10;Feature 2&#10;Feature 3" 
                        rows={4}
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="badge"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Badge (optional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || 'none'}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select badge" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {BADGES.map((badge) => (
                            <SelectItem key={badge} value={badge}>
                              {badge}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="colorScheme"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Color Scheme</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select color" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {COLOR_SCHEMES.map((color) => (
                            <SelectItem key={color} value={color} className="capitalize">
                              {color}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="displayOrder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Order</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Pricing Section - only show when editing an existing package */}
              {editingPackage && (
                <div className="border-t pt-4 mt-4">
                  <FormLabel className="text-base font-semibold mb-4 block">Package Pricing & Profitability</FormLabel>
                  <p className="text-sm text-muted-foreground mb-4">Set prices per seat type for each currency. Profit margins are calculated based on platform costs and typical team size.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-2">Currency</th>
                          <th className="text-left py-2 px-2">Per Learner Seat</th>
                          <th className="text-left py-2 px-2">Per Instructor Seat</th>
                          <th className="text-left py-2 px-2">Per Admin</th>
                          <th className="text-left py-2 px-2">Platform Cost</th>
                          <th className="text-left py-2 px-2">Est. Profit</th>
                          <th className="text-left py-2 px-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {CURRENCIES.map(currency => {
                          const price = editingPackage.prices?.find(p => p.currency === currency);
                          const profitInfo = price ? calculateProfitInfo(price, editingPackage.monthlyCredits, {
                            learners: editingPackage.maxLearners,
                            teachers: editingPackage.maxTeachers,
                            admins: editingPackage.maxOrgAdmins,
                          }) : null;
                          
                          return (
                            <tr key={currency} className="border-b hover:bg-muted/50">
                              <td className="py-3 px-2 font-medium">{currency}</td>
                              <td className="py-3 px-2">{price ? formatCurrency(price.pricePerLearner, currency) : '—'}</td>
                              <td className="py-3 px-2">{price ? formatCurrency(price.pricePerTeacher, currency) : '—'}</td>
                              <td className="py-3 px-2">{price ? formatCurrency(price.pricePerOrgAdmin, currency) : '—'}</td>
                              <td className="py-3 px-2">
                                {profitInfo ? formatCurrency(profitInfo.platformCost.toFixed(2), currency) : '—'}
                              </td>
                              <td className="py-3 px-2">
                                {profitInfo ? (
                                  <div className="flex items-center gap-1">
                                    {profitInfo.isHealthy ? (
                                      <TrendingUp className="h-3 w-3 text-success" />
                                    ) : profitInfo.profitMargin > 0 ? (
                                      <AlertCircle className="h-3 w-3 text-warning" />
                                    ) : (
                                      <TrendingDown className="h-3 w-3 text-destructive" />
                                    )}
                                    <span className={profitInfo.isHealthy ? 'text-success' : profitInfo.profitMargin > 0 ? 'text-warning' : 'text-destructive'}>
                                      {profitInfo.profitMargin.toFixed(0)}%
                                    </span>
                                  </div>
                                ) : '—'}
                              </td>
                              <td className="py-3 px-2">
                                <Button type="button" variant="ghost" size="sm" onClick={() => handleOpenPriceDialog(editingPackage, price)}
                                  className="h-7 px-2"
                                >
                                  {price ? <Pencil className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                                  <span className="ml-1">{price ? 'Edit' : 'Add'}</span>
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Platform cost based on {editingPackage.monthlyCredits} monthly LP Credits. Estimated profit uses typical team: 10 learners, 3 teachers, 2 admins (or max seats if lower). Target ≥30% margin (green).
                  </p>
                </div>
              )}

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="font-normal">Active</FormLabel>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleCloseDialog}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} >
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPrice ? 'Edit Price' : 'Add Price'}</DialogTitle>
            <DialogDescription>
              {pricingPackage ? `Set pricing for ${pricingPackage.name}` : 'Set pricing for this package'}
            </DialogDescription>
          </DialogHeader>
          <Form {...priceForm}>
            <form onSubmit={priceForm.handleSubmit(handlePriceSubmit)} className="space-y-4">
              <FormField
                control={priceForm.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      value={field.value}
                      disabled={!!editingPrice}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CURRENCIES.map((currency) => (
                          <SelectItem key={currency} value={currency}>
                            {currency}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={priceForm.control}
                name="pricePerLearner"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price per Learner Seat</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={priceForm.control}
                name="pricePerTeacher"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price per Instructor Seat</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={priceForm.control}
                name="pricePerOrgAdmin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price per Org Admin</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {editingPrice && (
                <Button type="button" variant="destructive" onClick={() => {
                    if (pricingPackage && editingPrice) {
                      handleDeletePriceClick(pricingPackage.id, editingPrice.id);
                    }
                  }}
                  className="w-full"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Price
                </Button>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleClosePriceDialog}>
                  Cancel
                </Button>
                <Button type="submit" disabled={priceMutation.isPending}>
                  {priceMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Package</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this package? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deletePriceDialogOpen} onOpenChange={setDeletePriceDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Price</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this price? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeletePrice}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePriceMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
