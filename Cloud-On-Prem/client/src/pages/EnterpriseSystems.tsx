import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { Server, Plus, Pencil, Trash2, Loader2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import EnterprisePortalLayout from '@/components/EnterprisePortalLayout';
import { useEnterpriseAuth } from '@/hooks/useEnterpriseAuth';

const systemSchema = z.object({
  name: z.string().min(1, 'System name is required'),
  systemType: z.enum(['development', 'qa', 'production']),
  baseUrl: z.string().optional().or(z.literal('')),
  internalHostname: z.string().optional().or(z.literal('')),
  cpu: z.string().optional().or(z.literal('')),
  memory: z.string().optional().or(z.literal('')),
  appPort: z.coerce.number().int().min(1).max(65535).optional(),
  dbPort: z.coerce.number().int().min(1).max(65535).optional(),
  nginxHttpPort: z.coerce.number().int().min(1).max(65535).optional(),
  nginxHttpsPort: z.coerce.number().int().min(1).max(65535).optional(),
});

type SystemForm = z.infer<typeof systemSchema>;

function SystemsContent() {
  const { isSuperAdmin, hasCustomerSelected } = useEnterpriseAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: systems, isLoading } = useQuery({
    queryKey: ['/api/enterprise/systems'],
  });

  const form = useForm<SystemForm>({
    resolver: zodResolver(systemSchema),
    defaultValues: {
      name: '',
      systemType: 'development',
      baseUrl: '',
      internalHostname: '',
      cpu: '',
      memory: '',
      appPort: 3000,
      dbPort: 5432,
      nginxHttpPort: 80,
      nginxHttpsPort: 443,
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: SystemForm) => {
      if (editingId) {
        return await apiRequest(`/api/enterprise/systems/${editingId}`, { method: 'PUT', body: JSON.stringify(data) });
      }
      return await apiRequest('/api/enterprise/systems', { method: 'POST', body: JSON.stringify(data) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise/systems'] });
      toast({ title: editingId ? 'Updated' : 'Created', description: `System has been ${editingId ? 'updated' : 'created'}.` });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Operation failed.', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/enterprise/systems/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise/systems'] });
      toast({ title: 'Deleted', description: 'System has been removed.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Delete failed.', variant: 'destructive' });
    },
  });

  const openCreate = () => {
    setEditingId(null);
    form.reset({
      name: '',
      systemType: 'development',
      baseUrl: '',
      internalHostname: '',
      cpu: '',
      memory: '',
      appPort: 3000,
      dbPort: 5432,
      nginxHttpPort: 80,
      nginxHttpsPort: 443,
    });
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditingId(item.id);
    form.reset({
      name: item.name || '',
      systemType: item.systemType === 'qa' || item.systemType === 'production' ? item.systemType : 'development',
      baseUrl: item.baseUrl || '',
      internalHostname: item.internalHostname || '',
      cpu: item.cpu || '',
      memory: item.memory || '',
      appPort: item.appPort ?? 3000,
      dbPort: item.dbPort ?? 5432,
      nginxHttpPort: item.nginxHttpPort ?? 80,
      nginxHttpsPort: item.nginxHttpsPort ?? 443,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    form.reset();
  };

  const items = (systems as any)?.systems || [];

  if (isSuperAdmin && !hasCustomerSelected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Systems</h1>
          <p className="text-muted-foreground text-sm">Manage your on-premises systems</p>
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
          <h1 className="text-2xl font-bold text-foreground">Systems</h1>
          <p className="text-muted-foreground text-sm">Manage your on-premises systems</p>
        </div>
        <Button onClick={openCreate} >
          <Plus className="w-4 h-4 mr-2" /> Add System
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
              <Server className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p>No systems yet. Click "Add System" to create one.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Base URL</TableHead>
                  <TableHead>Hostname</TableHead>
                  <TableHead>Ports</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={systemTypeBadgeClass(item.systemType)}>
                        {formatSystemType(item.systemType)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.baseUrl || '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.internalHostname || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      App: {item.appPort ?? 3000} | DB: {item.dbPort ?? 5432}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" >
                        {item.status || 'active'}
                      </Badge>
                    </TableCell>
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
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit System' : 'Add System'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl><Input {...field} className="border-border" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="systemType" render={({ field }) => (
                <FormItem>
                  <FormLabel>System Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="border-border">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="development">Development</SelectItem>
                      <SelectItem value="qa">QA/Testing</SelectItem>
                      <SelectItem value="production">Production</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="baseUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>Base URL</FormLabel>
                  <FormControl><Input {...field} placeholder="https://learnplay.company.com" className="border-border" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="internalHostname" render={({ field }) => (
                <FormItem>
                  <FormLabel>Internal Hostname</FormLabel>
                  <FormControl><Input {...field} className="border-border" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="cpu" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPU</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g., 8 vCPU Intel Xeon" className="border-border" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="memory" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Memory</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g., 32GB DDR4" className="border-border" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="appPort" render={({ field }) => (
                  <FormItem>
                    <FormLabel>App Port</FormLabel>
                    <FormControl><Input {...field} type="number" className="border-border" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="dbPort" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Database Port</FormLabel>
                    <FormControl><Input {...field} type="number" className="border-border" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="nginxHttpPort" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nginx HTTP Port</FormLabel>
                    <FormControl><Input {...field} type="number" className="border-border" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="nginxHttpsPort" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nginx HTTPS Port</FormLabel>
                    <FormControl><Input {...field} type="number" className="border-border" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
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

export default function EnterpriseSystems() {
  return (
    <EnterprisePortalLayout>
      <SystemsContent />
    </EnterprisePortalLayout>
  );
}
  const formatSystemType = (value: string) => {
    if (value === 'qa') return 'QA/Testing';
    if (value === 'production') return 'Production';
    return 'Development';
  };

  const systemTypeBadgeClass = (value: string) => {
    if (value === 'production') return 'border-primary text-primary bg-primary/10';
    if (value === 'qa') return 'border-warning text-warning bg-warning/10';
    return 'border-warning text-warning bg-warning/10';
  };
