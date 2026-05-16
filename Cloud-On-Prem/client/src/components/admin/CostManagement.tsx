import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { DollarSign, Flame, RefreshCw, Plus, Pencil, Trash2, Calendar, Settings } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { StatsGrid, type StatItem } from '@/components/ui/stats-grid';
import { ResponsiveTable, type Column } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { tzFormat } from '@/utils/timezoneRuntime';

interface CostCategory {
  id: string;
  name: string;
  type: string;
  description?: string;
  isActive: boolean;
}

interface CategoryType {
  id: string;
  name: string;
  label: string;
  description: string | null;
  isActive: boolean;
  displayOrder: number;
}

interface CostEntry {
  id: string;
  categoryId: string | null;
  organizationId: string | null;
  description: string;
  amount: string;
  currency: 'ZAR' | 'USD' | 'EUR';
  exchangeRateUsed: string | null;
  normalizedAmountZAR: string;
  recurrence: 'one_time' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
  effectiveDate: string;
  endDate: string | null;
  isAutomated: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface CostStats {
  monthlyBurn: string;
  ytdCosts: string;
  activeRecurring: number;
}

interface EntriesResponse {
  entries: CostEntry[];
  total: number;
}

const CURRENCIES = ['ZAR', 'USD', 'EUR'] as const;
const RECURRENCE_OPTIONS = [
  { value: 'one_time', label: 'One Time' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
] as const;

const CATEGORY_TYPE_OPTIONS = [
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'payment_processing', label: 'Payment Processing' },
  { value: 'api_services', label: 'API Services' },
  { value: 'staffing', label: 'Staffing' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'revenue_share', label: 'Revenue Share' },
  { value: 'refund_payout', label: 'Refund/Payout' },
  { value: 'other', label: 'Other' },
] as const;

const costEntryFormSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  amount: z.string().min(1, 'Amount is required').refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
    'Amount must be a positive number'
  ),
  currency: z.enum(['ZAR', 'USD', 'EUR']),
  categoryId: z.string().min(1, 'Category is required'),
  recurrence: z.enum(['one_time', 'daily', 'weekly', 'monthly', 'quarterly', 'annual']),
  effectiveDate: z.date({ required_error: 'Effective date is required' }),
  endDate: z.date().optional().nullable(),
  notes: z.string().optional(),
});

type CostEntryFormValues = z.infer<typeof costEntryFormSchema>;

const categoryFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string().min(1, 'Type is required'),
  description: z.string().optional(),
});

type CategoryFormValues = z.infer<typeof categoryFormSchema>;

const categoryTypeFormSchema = z.object({
  name: z.string().min(1, 'Name is required').regex(/^[a-z_]+$/, 'Name must be lowercase letters and underscores only'),
  label: z.string().min(1, 'Label is required'),
  description: z.string().optional(),
});

type CategoryTypeFormValues = z.infer<typeof categoryTypeFormSchema>;

export function CostManagement() {
  const { toast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CostEntry | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CostCategory | null>(null);
  const [categoryDeleteDialogOpen, setCategoryDeleteDialogOpen] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);

  const [editingCategoryType, setEditingCategoryType] = useState<CategoryType | null>(null);
  const [categoryTypeDeleteDialogOpen, setCategoryTypeDeleteDialogOpen] = useState(false);
  const [deletingCategoryTypeId, setDeletingCategoryTypeId] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [recurrenceFilter, setRecurrenceFilter] = useState<string>('all');
  const [startDateFilter, setStartDateFilter] = useState<Date | undefined>(undefined);
  const [endDateFilter, setEndDateFilter] = useState<Date | undefined>(undefined);

  const form = useForm<CostEntryFormValues>({
    resolver: zodResolver(costEntryFormSchema),
    defaultValues: {
      description: '',
      amount: '',
      currency: 'ZAR',
      categoryId: '',
      recurrence: 'one_time',
      effectiveDate: new Date(),
      endDate: null,
      notes: '',
    },
  });

  const categoryForm = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: '',
      type: '',
      description: '',
    },
  });

  const categoryTypeForm = useForm<CategoryTypeFormValues>({
    resolver: zodResolver(categoryTypeFormSchema),
    defaultValues: {
      name: '',
      label: '',
      description: '',
    },
  });

  const { data: stats, isLoading: statsLoading } = useQuery<CostStats>({
    queryKey: ['/api/admin/platform-costs/stats'],
  });

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<CostCategory[]>({
    queryKey: ['/api/admin/platform-costs/categories'],
  });

  const { data: categoryTypes = [], isLoading: typesLoading } = useQuery<CategoryType[]>({
    queryKey: ['/api/admin/platform-costs/category-types'],
  });

  const buildEntriesQueryParams = () => {
    const params = new URLSearchParams();
    if (categoryFilter && categoryFilter !== 'all') {
      params.set('categoryId', categoryFilter);
    }
    if (recurrenceFilter && recurrenceFilter !== 'all') {
      params.set('recurrence', recurrenceFilter);
    }
    if (startDateFilter) {
      params.set('startDate', tzFormat(startDateFilter, 'yyyy-MM-dd'));
    }
    if (endDateFilter) {
      params.set('endDate', tzFormat(endDateFilter, 'yyyy-MM-dd'));
    }
    return params.toString();
  };

  const { data: entriesData, isLoading: entriesLoading } = useQuery<EntriesResponse>({
    queryKey: ['/api/admin/platform-costs/entries', categoryFilter, recurrenceFilter, startDateFilter, endDateFilter],
    queryFn: async () => {
      const queryString = buildEntriesQueryParams();
      const url = queryString ? `/api/admin/platform-costs/entries?${queryString}` : '/api/admin/platform-costs/entries';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch entries');
      return res.json();
    },
  });

  const entries = entriesData?.entries || [];

  const createMutation = useMutation({
    mutationFn: async (data: CostEntryFormValues) => {
      return await apiRequest('/api/admin/platform-costs/entries', {
        method: 'POST',
        body: JSON.stringify({
          description: data.description,
          amount: data.amount,
          currency: data.currency,
          categoryId: data.categoryId,
          recurrence: data.recurrence,
          effectiveDate: tzFormat(data.effectiveDate, 'yyyy-MM-dd'),
          endDate: data.endDate ? tzFormat(data.endDate, 'yyyy-MM-dd') : null,
          metadata: data.notes ? { notes: data.notes } : undefined,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-costs/entries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-costs/stats'] });
      toast({ title: 'Cost entry created successfully' });
      handleCloseSheet();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create cost entry', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CostEntryFormValues }) => {
      return await apiRequest(`/api/admin/platform-costs/entries/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          description: data.description,
          amount: data.amount,
          currency: data.currency,
          recurrence: data.recurrence,
          effectiveDate: tzFormat(data.effectiveDate, 'yyyy-MM-dd'),
          endDate: data.endDate ? tzFormat(data.endDate, 'yyyy-MM-dd') : null,
          metadata: data.notes ? { notes: data.notes } : undefined,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-costs/entries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-costs/stats'] });
      toast({ title: 'Cost entry updated successfully' });
      handleCloseSheet();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update cost entry', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/platform-costs/entries/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-costs/entries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-costs/stats'] });
      toast({ title: 'Cost entry deleted successfully' });
      setDeleteDialogOpen(false);
      setDeletingEntryId(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete cost entry', description: error.message, variant: 'destructive' });
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (data: CategoryFormValues) => {
      return await apiRequest('/api/admin/platform-costs/categories', {
        method: 'POST',
        body: JSON.stringify({
          name: data.name,
          type: data.type,
          description: data.description || undefined,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-costs/categories'] });
      toast({ title: 'Category created successfully' });
      handleCloseCategoryForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create category', description: error.message, variant: 'destructive' });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CategoryFormValues }) => {
      return await apiRequest(`/api/admin/platform-costs/categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: data.name,
          type: data.type,
          description: data.description || undefined,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-costs/categories'] });
      toast({ title: 'Category updated successfully' });
      handleCloseCategoryForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update category', description: error.message, variant: 'destructive' });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/platform-costs/categories/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-costs/categories'] });
      toast({ title: 'Category deleted successfully' });
      setCategoryDeleteDialogOpen(false);
      setDeletingCategoryId(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete category', description: error.message, variant: 'destructive' });
    },
  });

  const createCategoryTypeMutation = useMutation({
    mutationFn: async (data: CategoryTypeFormValues) => {
      return await apiRequest('/api/admin/platform-costs/category-types', {
        method: 'POST',
        body: JSON.stringify({
          name: data.name,
          label: data.label,
          description: data.description || undefined,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-costs/category-types'] });
      toast({ title: 'Category type created successfully' });
      handleCloseCategoryTypeForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create category type', description: error.message, variant: 'destructive' });
    },
  });

  const updateCategoryTypeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CategoryTypeFormValues }) => {
      return await apiRequest(`/api/admin/platform-costs/category-types/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: data.name,
          label: data.label,
          description: data.description || undefined,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-costs/category-types'] });
      toast({ title: 'Category type updated successfully' });
      handleCloseCategoryTypeForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update category type', description: error.message, variant: 'destructive' });
    },
  });

  const deleteCategoryTypeMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/platform-costs/category-types/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-costs/category-types'] });
      toast({ title: 'Category type deleted successfully' });
      setCategoryTypeDeleteDialogOpen(false);
      setDeletingCategoryTypeId(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete category type', description: error.message, variant: 'destructive' });
    },
  });

  const handleOpenSheet = (entry?: CostEntry) => {
    if (entry) {
      setEditingEntry(entry);
      form.reset({
        description: entry.description,
        amount: entry.amount,
        currency: entry.currency,
        categoryId: entry.categoryId || '',
        recurrence: entry.recurrence,
        effectiveDate: new Date(entry.effectiveDate),
        endDate: entry.endDate ? new Date(entry.endDate) : null,
        notes: (entry.metadata as { notes?: string } | null)?.notes || '',
      });
    } else {
      setEditingEntry(null);
      form.reset({
        description: '',
        amount: '',
        currency: 'ZAR',
        categoryId: '',
        recurrence: 'one_time',
        effectiveDate: new Date(),
        endDate: null,
        notes: '',
      });
    }
    setSheetOpen(true);
  };

  const handleCloseSheet = () => {
    setSheetOpen(false);
    setEditingEntry(null);
    form.reset();
  };

  const handleSubmit = (data: CostEntryFormValues) => {
    if (editingEntry) {
      updateMutation.mutate({ id: editingEntry.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDeleteClick = (id: string) => {
    setDeletingEntryId(id);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (deletingEntryId) {
      deleteMutation.mutate(deletingEntryId);
    }
  };

  const handleOpenCategoryForm = (category?: CostCategory) => {
    if (category) {
      setEditingCategory(category);
      categoryForm.reset({
        name: category.name,
        type: category.type,
        description: category.description || '',
      });
    } else {
      setEditingCategory(null);
      categoryForm.reset({
        name: '',
        type: '',
        description: '',
      });
    }
  };

  const handleCloseCategoryForm = () => {
    setEditingCategory(null);
    categoryForm.reset({
      name: '',
      type: '',
      description: '',
    });
  };

  const handleCategorySubmit = (data: CategoryFormValues) => {
    if (editingCategory) {
      updateCategoryMutation.mutate({ id: editingCategory.id, data });
    } else {
      createCategoryMutation.mutate(data);
    }
  };

  const handleDeleteCategoryClick = (id: string) => {
    setDeletingCategoryId(id);
    setCategoryDeleteDialogOpen(true);
  };

  const handleConfirmCategoryDelete = () => {
    if (deletingCategoryId) {
      deleteCategoryMutation.mutate(deletingCategoryId);
    }
  };

  const handleOpenCategoryTypeForm = (categoryType?: CategoryType) => {
    if (categoryType) {
      setEditingCategoryType(categoryType);
      categoryTypeForm.reset({
        name: categoryType.name,
        label: categoryType.label,
        description: categoryType.description || '',
      });
    } else {
      setEditingCategoryType(null);
      categoryTypeForm.reset({
        name: '',
        label: '',
        description: '',
      });
    }
  };

  const handleCloseCategoryTypeForm = () => {
    setEditingCategoryType(null);
    categoryTypeForm.reset({
      name: '',
      label: '',
      description: '',
    });
  };

  const handleCategoryTypeSubmit = (data: CategoryTypeFormValues) => {
    if (editingCategoryType) {
      updateCategoryTypeMutation.mutate({ id: editingCategoryType.id, data });
    } else {
      createCategoryTypeMutation.mutate(data);
    }
  };

  const handleDeleteCategoryTypeClick = (id: string) => {
    setDeletingCategoryTypeId(id);
    setCategoryTypeDeleteDialogOpen(true);
  };

  const handleConfirmCategoryTypeDelete = () => {
    if (deletingCategoryTypeId) {
      deleteCategoryTypeMutation.mutate(deletingCategoryTypeId);
    }
  };

  const getCategoryTypeLabel = (type: string) => {
    const categoryType = categoryTypes.find(t => t.name === type);
    return categoryType?.label || type;
  };

  const clearFilters = () => {
    setCategoryFilter('all');
    setRecurrenceFilter('all');
    setStartDateFilter(undefined);
    setEndDateFilter(undefined);
  };

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return 'Uncategorized';
    const category = categories.find(c => c.id === categoryId);
    return category?.name || 'Unknown';
  };

  const getRecurrenceLabel = (recurrence: string) => {
    const option = RECURRENCE_OPTIONS.find(o => o.value === recurrence);
    return option?.label || recurrence;
  };

  const formatCurrency = (amount: string, currency: string) => {
    const num = parseFloat(amount);
    const symbols: Record<string, string> = { ZAR: 'R', USD: '$', EUR: '€' };
    return `${symbols[currency] || ''}${num.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const statsItems: StatItem[] = useMemo(() => [
    {
      label: 'Monthly Burn',
      value: stats?.monthlyBurn || 'R0.00',
      icon: Flame,
    },
    {
      label: 'YTD Costs',
      value: stats?.ytdCosts || 'R0.00',
      icon: DollarSign,
    },
    {
      label: 'Active Recurring',
      value: stats?.activeRecurring?.toString() || '0',
      icon: RefreshCw,
    },
  ], [stats]);

  const columns: Column<CostEntry>[] = useMemo(() => [
    {
      key: 'description',
      header: 'Description',
      sortable: true,
      render: (item) => (
        <span className="font-medium" data-testid={`text-description-${item.id}`}>
          {item.description}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      sortable: true,
      render: (item) => (
        <span data-testid={`text-amount-${item.id}`}>
          {formatCurrency(item.amount, item.currency)}
        </span>
      ),
    },
    {
      key: 'currency',
      header: 'Currency',
      render: (item) => (
        <Badge variant="outline" data-testid={`badge-currency-${item.id}`}>
          {item.currency}
        </Badge>
      ),
    },
    {
      key: 'categoryId',
      header: 'Category',
      render: (item) => (
        <span data-testid={`text-category-${item.id}`}>
          {getCategoryName(item.categoryId)}
        </span>
      ),
    },
    {
      key: 'recurrence',
      header: 'Recurrence',
      render: (item) => (
        <Badge variant={item.recurrence === 'one_time' ? 'secondary' : 'default'} data-testid={`badge-recurrence-${item.id}`} >
          {getRecurrenceLabel(item.recurrence)}
        </Badge>
      ),
    },
    {
      key: 'effectiveDate',
      header: 'Effective Date',
      sortable: true,
      render: (item) => (
        <span data-testid={`text-effective-date-${item.id}`}>
          {tzFormat(item.effectiveDate, 'MMM d, yyyy')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (item) => (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => handleOpenSheet(item)}
            data-testid={`button-edit-${item.id}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(item.id)}
            data-testid={`button-delete-${item.id}`}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ], [categories]);

  const isFormSubmitting = createMutation.isPending || updateMutation.isPending;
  const isCategoryFormSubmitting = createCategoryMutation.isPending || updateCategoryMutation.isPending;
  const isCategoryTypeFormSubmitting = createCategoryTypeMutation.isPending || updateCategoryTypeMutation.isPending;

  return (
    <div className="space-y-6" data-testid="cost-management-container">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" data-testid="text-page-title">Cost Management</h2>
          <p className="text-muted-foreground" data-testid="text-page-subtitle">
            Manage platform costs and recurring expenses
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setCategoryDialogOpen(true)} data-testid="button-manage-categories">
            <Settings className="h-4 w-4 mr-2" />
            Manage Categories
          </Button>
          <Button onClick={() => handleOpenSheet()} data-testid="button-add-cost-entry">
            <Plus className="h-4 w-4 mr-2" />
            Add Cost Entry
          </Button>
        </div>
      </div>

      <StatsGrid stats={statsItems} isLoading={statsLoading} columns={3} />

      <div className="flex flex-wrap items-end gap-4 p-4 bg-muted/30 rounded-lg" data-testid="filter-bar">
        <div className="space-y-1.5">
          <Label htmlFor="category-filter">Category</Label>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger id="category-filter" className="w-[180px]" data-testid="select-category-filter">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="recurrence-filter">Recurrence</Label>
          <Select value={recurrenceFilter} onValueChange={setRecurrenceFilter}>
            <SelectTrigger id="recurrence-filter" className="w-[180px]" data-testid="select-recurrence-filter">
              <SelectValue placeholder="All Recurrence" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Recurrence</SelectItem>
              {RECURRENCE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Start Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal", !startDateFilter && "text-muted-foreground")} data-testid="button-start-date-filter" >
                <Calendar className="mr-2 h-4 w-4" />
                {startDateFilter ? tzFormat(startDateFilter, 'MMM d, yyyy') : 'Pick date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={startDateFilter}
                onSelect={setStartDateFilter}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1.5">
          <Label>End Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal", !endDateFilter && "text-muted-foreground")} data-testid="button-end-date-filter" >
                <Calendar className="mr-2 h-4 w-4" />
                {endDateFilter ? tzFormat(endDateFilter, 'MMM d, yyyy') : 'Pick date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={endDateFilter}
                onSelect={setEndDateFilter}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <Button variant="ghost" onClick={clearFilters} data-testid="button-clear-filters">
          Clear Filters
        </Button>
      </div>

      <ResponsiveTable
        data={entries}
        columns={columns}
        keyExtractor={(item) => item.id}
        isLoading={entriesLoading}
        emptyMessage="No cost entries found"
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto" data-testid="sheet-cost-entry-form">
          <SheetHeader>
            <SheetTitle data-testid="text-sheet-title">
              {editingEntry ? 'Edit Cost Entry' : 'Add Cost Entry'}
            </SheetTitle>
          </SheetHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter description" 
                        {...field} 
                        data-testid="input-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        {...field}
                        data-testid="input-amount"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-currency">
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CURRENCIES.map((curr) => (
                          <SelectItem key={curr} value={curr}>{curr}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="recurrence"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recurrence</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-recurrence">
                          <SelectValue placeholder="Select recurrence" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {RECURRENCE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="effectiveDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Effective Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")} data-testid="button-effective-date" >
                            <Calendar className="mr-2 h-4 w-4" />
                            {field.value ? tzFormat(field.value, 'PPP') : 'Pick a date'}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>End Date (Optional)</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")} data-testid="button-end-date" >
                            <Calendar className="mr-2 h-4 w-4" />
                            {field.value ? tzFormat(field.value, 'PPP') : 'No end date'}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={field.value || undefined}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add any additional notes..."
                        className="resize-none"
                        rows={3}
                        {...field}
                        data-testid="textarea-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <SheetFooter className="pt-4">
                <Button type="button" variant="outline" onClick={handleCloseSheet} data-testid="button-cancel" >
                  Cancel
                </Button>
                <Button type="submit" disabled={isFormSubmitting} data-testid="button-submit" >
                  {isFormSubmitting ? 'Saving...' : editingEntry ? 'Update' : 'Create'}
                </Button>
              </SheetFooter>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent data-testid="dialog-delete-confirmation">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cost Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this cost entry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-manage-categories">
          <DialogHeader>
            <DialogTitle data-testid="text-category-dialog-title">Manage Categories</DialogTitle>
            <DialogDescription>
              Add, edit, or delete cost categories and category types for organizing expenses.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="categories" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="category-types" data-testid="tab-category-types">Category Types</TabsTrigger>
              <TabsTrigger value="categories" data-testid="tab-categories">Categories</TabsTrigger>
            </TabsList>

            <TabsContent value="category-types" className="space-y-6 py-4">
              <div className="space-y-4">
                <h3 className="font-medium text-sm text-muted-foreground">Existing Category Types</h3>
                {typesLoading ? (
                  <p className="text-sm text-muted-foreground">Loading category types...</p>
                ) : categoryTypes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No category types yet. Add one below.</p>
                ) : (
                  <div className="space-y-2">
                    {categoryTypes.map((type) => (
                      <div
                        key={type.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                        data-testid={`category-type-item-${type.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="font-medium" data-testid={`text-category-type-label-${type.id}`}>
                              {type.label}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono" data-testid={`text-category-type-name-${type.id}`}>
                              {type.name}
                            </p>
                            {type.description && (
                              <p className="text-sm text-muted-foreground" data-testid={`text-category-type-description-${type.id}`}>
                                {type.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenCategoryTypeForm(type)}
                            data-testid={`button-edit-category-type-${type.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteCategoryTypeClick(type.id)}
                            data-testid={`button-delete-category-type-${type.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t pt-4">
                <h3 className="font-medium text-sm text-muted-foreground mb-4">
                  {editingCategoryType ? 'Edit Category Type' : 'Add New Category Type'}
                </h3>
                <Form {...categoryTypeForm}>
                  <form onSubmit={categoryTypeForm.handleSubmit(handleCategoryTypeSubmit)} className="space-y-4">
                    <FormField
                      control={categoryTypeForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name (slug format)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., infrastructure, api_services"
                              {...field}
                              data-testid="input-category-type-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={categoryTypeForm.control}
                      name="label"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Label (display name)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., Infrastructure, API Services"
                              {...field}
                              data-testid="input-category-type-label"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={categoryTypeForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description (Optional)</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Optional description..."
                              className="resize-none"
                              rows={2}
                              {...field}
                              data-testid="textarea-category-type-description"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex items-center gap-2">
                      {editingCategoryType && (
                        <Button type="button" variant="outline" onClick={handleCloseCategoryTypeForm} data-testid="button-cancel-category-type-edit" >
                          Cancel
                        </Button>
                      )}
                      <Button type="submit" disabled={isCategoryTypeFormSubmitting} data-testid="button-submit-category-type" >
                        {isCategoryTypeFormSubmitting
                          ? 'Saving...'
                          : editingCategoryType
                          ? 'Update Type'
                          : 'Add Type'}
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>
            </TabsContent>

            <TabsContent value="categories" className="space-y-6 py-4">
              <div className="space-y-4">
                <h3 className="font-medium text-sm text-muted-foreground">Existing Categories</h3>
                {categoriesLoading ? (
                  <p className="text-sm text-muted-foreground">Loading categories...</p>
                ) : categories.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No categories yet. Add one below.</p>
                ) : (
                  <div className="space-y-2">
                    {categories.map((category) => (
                      <div
                        key={category.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                        data-testid={`category-item-${category.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="font-medium" data-testid={`text-category-name-${category.id}`}>
                              {category.name}
                            </p>
                            {category.description && (
                              <p className="text-sm text-muted-foreground" data-testid={`text-category-description-${category.id}`}>
                                {category.description}
                              </p>
                            )}
                          </div>
                          <Badge variant="outline" data-testid={`badge-category-type-${category.id}`}>
                            {getCategoryTypeLabel(category.type)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenCategoryForm(category)}
                            data-testid={`button-edit-category-${category.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteCategoryClick(category.id)}
                            data-testid={`button-delete-category-${category.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t pt-4">
                <h3 className="font-medium text-sm text-muted-foreground mb-4">
                  {editingCategory ? 'Edit Category' : 'Add New Category'}
                </h3>
                <Form {...categoryForm}>
                  <form onSubmit={categoryForm.handleSubmit(handleCategorySubmit)} className="space-y-4">
                    <FormField
                      control={categoryForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Category name"
                              {...field}
                              data-testid="input-category-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={categoryForm.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-category-type">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {categoryTypes.map((type) => (
                                <SelectItem key={type.id} value={type.name}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={categoryForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description (Optional)</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Optional description..."
                              className="resize-none"
                              rows={2}
                              {...field}
                              data-testid="textarea-category-description"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex items-center gap-2">
                      {editingCategory && (
                        <Button type="button" variant="outline" onClick={handleCloseCategoryForm} data-testid="button-cancel-category-edit" >
                          Cancel
                        </Button>
                      )}
                      <Button type="submit" disabled={isCategoryFormSubmitting} data-testid="button-submit-category" >
                        {isCategoryFormSubmitting
                          ? 'Saving...'
                          : editingCategory
                          ? 'Update Category'
                          : 'Add Category'}
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AlertDialog open={categoryDeleteDialogOpen} onOpenChange={setCategoryDeleteDialogOpen}>
        <AlertDialogContent data-testid="dialog-delete-category-confirmation">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this category? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-category-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmCategoryDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-category-delete"
            >
              {deleteCategoryMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={categoryTypeDeleteDialogOpen} onOpenChange={setCategoryTypeDeleteDialogOpen}>
        <AlertDialogContent data-testid="dialog-delete-category-type-confirmation">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category Type</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this category type? This action cannot be undone. If categories are using this type, the deletion will fail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-category-type-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmCategoryTypeDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-category-type-delete"
            >
              {deleteCategoryTypeMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default CostManagement;
