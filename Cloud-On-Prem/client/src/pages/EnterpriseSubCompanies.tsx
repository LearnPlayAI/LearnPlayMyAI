import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { Plus, Pencil, Trash2, Loader2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import EnterprisePortalLayout from '@/components/EnterprisePortalLayout';
import { useEnterpriseAuth } from '@/hooks/useEnterpriseAuth';

const subCompanySchema = z.object({
  companyName: z.string().min(2, 'Company name is required'),
  contactPersonName: z.string().min(2, 'Contact person is required'),
  contactEmail: z.string().email('Valid email required'),
  contactMobile: z.string().optional(),
  country: z.string().optional(),
});

type SubCompanyForm = z.infer<typeof subCompanySchema>;

function SubCompaniesContent() {
  const { isSuperAdmin, hasCustomerSelected } = useEnterpriseAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: subCompanies, isLoading } = useQuery({
    queryKey: ['/api/enterprise/sub-companies'],
  });

  const form = useForm<SubCompanyForm>({
    resolver: zodResolver(subCompanySchema),
    defaultValues: { companyName: '', contactPersonName: '', contactEmail: '', contactMobile: '', country: '' },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: SubCompanyForm) => {
      if (editingId) {
        return await apiRequest(`/api/enterprise/sub-companies/${editingId}`, { method: 'PUT', body: JSON.stringify(data) });
      }
      return await apiRequest('/api/enterprise/sub-companies', { method: 'POST', body: JSON.stringify(data) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise/sub-companies'] });
      toast({ title: editingId ? 'Updated' : 'Created', description: `Sub-company has been ${editingId ? 'updated' : 'created'}.` });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Operation failed.', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/enterprise/sub-companies/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise/sub-companies'] });
      toast({ title: 'Deleted', description: 'Sub-company has been removed.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Delete failed.', variant: 'destructive' });
    },
  });

  const openCreate = () => {
    setEditingId(null);
    form.reset({ companyName: '', contactPersonName: '', contactEmail: '', contactMobile: '', country: '' });
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditingId(item.id);
    form.reset({
      companyName: item.companyName || '',
      contactPersonName: item.contactPersonName || '',
      contactEmail: item.contactEmail || '',
      contactMobile: item.contactMobile || '',
      country: item.country || '',
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    form.reset();
  };

  const items = (subCompanies as any)?.subCompanies || [];

  if (isSuperAdmin && !hasCustomerSelected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sub-Companies</h1>
          <p className="text-muted-foreground text-sm">Manage your subsidiary companies</p>
        </div>
        <Card className="border-border">
          <CardContent className="text-center py-12 text-muted-foreground">
            <Building2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium text-foreground mb-1">No customer selected</p>
            <p className="text-sm">Please select an enterprise customer from the dropdown above to view this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sub-Companies</h1>
          <p className="text-muted-foreground text-sm">Manage your subsidiary companies</p>
        </div>
        <Button onClick={openCreate} >
          <Plus className="w-4 h-4 mr-2" /> Add Sub-Company
        </Button>
      </div>

      <Card className="border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No sub-companies yet. Click "Add Sub-Company" to create one.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company Name</TableHead>
                  <TableHead>Contact Person</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.companyName}</TableCell>
                    <TableCell>{item.contactPersonName}</TableCell>
                    <TableCell>{item.contactEmail}</TableCell>
                    <TableCell>{item.country || '-'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(item.id)} className="text-destructive hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Sub-Company' : 'Add Sub-Company'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))} className="space-y-4">
              <FormField control={form.control} name="companyName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Company Name</FormLabel>
                  <FormControl><Input {...field} className="border-border" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="contactPersonName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Person</FormLabel>
                  <FormControl><Input {...field} className="border-border" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="contactEmail" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input {...field} type="email" className="border-border" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="contactMobile" render={({ field }) => (
                <FormItem>
                  <FormLabel>Mobile (Optional)</FormLabel>
                  <FormControl><Input {...field} className="border-border" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="country" render={({ field }) => (
                <FormItem>
                  <FormLabel>Country (Optional)</FormLabel>
                  <FormControl><Input {...field} className="border-border" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button type="submit" disabled={saveMutation.isPending} >
                  {saveMutation.isPending ? 'Saving...' : editingId ? 'Update' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function EnterpriseSubCompanies() {
  return (
    <EnterprisePortalLayout>
      <SubCompaniesContent />
    </EnterprisePortalLayout>
  );
}
