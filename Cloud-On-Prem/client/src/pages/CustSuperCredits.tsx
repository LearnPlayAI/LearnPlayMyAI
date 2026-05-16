import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import QuizAdminLayout from "@/components/QuizAdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Minus, Wallet, Users, Building2, Search } from "lucide-react";
import { usePlatformMode } from "@/hooks/usePlatformMode";

interface OrgCredit {
  id: string;
  name: string;
  creditBalance: number;
  [key: string]: any;
}

interface UserCredit {
  id: string;
  username: string;
  gamerName: string;
  email: string;
  creditBalance: number;
  organizationName?: string;
  [key: string]: any;
}

export default function CustSuperCredits() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("organizations");
  const [orgSearch, setOrgSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");

  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<{ type: 'org' | 'user'; id: string; name: string; currentBalance: number } | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const { data: orgsData, isLoading: orgsLoading } = useQuery<{ organizations: OrgCredit[] }>({
    queryKey: ["/api/admin/custsuper/org-credits", orgSearch],
    queryFn: async () => {
      const params = orgSearch ? `?search=${encodeURIComponent(orgSearch)}` : "";
      const res = await fetch(`/api/admin/custsuper/org-credits${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch organization credits");
      return res.json();
    },
  });

  const { data: usersData, isLoading: usersLoading } = useQuery<{ users: UserCredit[] }>({
    queryKey: ["/api/admin/custsuper/user-credits", userSearch],
    queryFn: async () => {
      const params = userSearch ? `?search=${encodeURIComponent(userSearch)}` : "";
      const res = await fetch(`/api/admin/custsuper/user-credits${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch user credits");
      return res.json();
    },
    enabled: activeTab === "users",
  });

  const adjustMutation = useMutation({
    mutationFn: async ({ type, id, amount, reason }: { type: 'org' | 'user'; id: string; amount: number; reason: string }) => {
      const endpoint = type === 'org'
        ? `/api/admin/custsuper/org-credits/${id}/adjust`
        : `/api/admin/custsuper/user-credits/${id}/adjust`;
      return await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify({ amount, reason }),
      });
    },
    onSuccess: (_, variables) => {
      const queryKey = variables.type === 'org'
        ? ["/api/admin/custsuper/org-credits"]
        : ["/api/admin/custsuper/user-credits"];
      queryClient.invalidateQueries({ queryKey, exact: false });
      setShowAdjustDialog(false);
      setAdjustAmount("");
      setAdjustReason("");
      setAdjustTarget(null);
      toast({ title: "Credits adjusted", description: "The credit balance has been updated successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Adjustment failed", description: error.message || "Failed to adjust credits", variant: "destructive" });
    },
  });

  const openAdjustDialog = (type: 'org' | 'user', id: string, name: string, currentBalance: number) => {
    setAdjustTarget({ type, id, name, currentBalance });
    setAdjustAmount("");
    setAdjustReason("");
    setShowAdjustDialog(true);
  };

  const handleAdjust = () => {
    if (!adjustTarget || !adjustAmount || !adjustReason.trim()) {
      toast({ title: "Missing information", description: "Please fill in both amount and reason.", variant: "destructive" });
      return;
    }
    const amount = Number(adjustAmount);
    if (isNaN(amount) || amount === 0) {
      toast({ title: "Invalid amount", description: "Please enter a valid non-zero number.", variant: "destructive" });
      return;
    }
    adjustMutation.mutate({
      type: adjustTarget.type,
      id: adjustTarget.id,
      amount,
      reason: adjustReason.trim(),
    });
  };

  const organizationsList = orgsData?.organizations || [];
  const users = usersData?.users || [];
  const totalOrgCredits = organizationsList.reduce((sum, org) => sum + (org.creditBalance || 0), 0);

  const renderLoadingSkeleton = () => (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map(i => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );

  return (
    <QuizAdminLayout title="Manage LPC Balance" description="Adjust organization and user credit balances" activeSection="manage-credits">
      <div className="space-y-[var(--space-lg)] max-w-6xl">
        {organizationsList.length > 0 && (
          <Card className="bg-card/50 border-border">
            <CardContent className="p-[var(--card-padding)]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-[length:var(--text-sm)] text-muted-foreground">Total Organization LPC Balance</p>
                  <p className="text-[length:var(--text-2xl)] font-bold font-mono text-foreground">{totalOrgCredits.toLocaleString()}</p>
                </div>
                <div className="ml-auto text-[length:var(--text-sm)] text-muted-foreground">
                  Across {organizationsList.length} organization{organizationsList.length !== 1 ? 's' : ''}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full sm:w-auto mb-[var(--space-md)]">
            <TabsTrigger value="organizations" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Organization Credits
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              User Credits
            </TabsTrigger>
          </TabsList>

          <TabsContent value="organizations" className="space-y-[var(--space-md)]">
            <Card className="bg-card/50 border-border">
              <CardHeader className="p-[var(--card-padding)]">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-sm)]">
                  <CardTitle className="text-foreground text-[length:var(--text-xl)] flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-primary" />
                    Organization Credit Balances
                  </CardTitle>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search organizations..."
                      value={orgSearch}
                      onChange={e => setOrgSearch(e.target.value)}
                      className="pl-9 bg-background border-border"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0">
                {orgsLoading ? renderLoadingSkeleton() : (
                  <div className="rounded-md border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border hover:bg-transparent">
                          <TableHead className="text-muted-foreground">Organization</TableHead>
                          <TableHead className="text-muted-foreground text-right">Credit Balance</TableHead>
                          <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {organizationsList.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                              {orgSearch ? "No organizations match your search." : "No organizations found."}
                            </TableCell>
                          </TableRow>
                        ) : (
                          organizationsList.map(org => (
                            <TableRow key={org.id} className="border-border">
                              <TableCell className="font-medium text-foreground">{org.name}</TableCell>
                              <TableCell className="text-right font-mono text-foreground">{org.creditBalance}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="outline" size="sm" onClick={() => openAdjustDialog('org', org.id, org.name, org.creditBalance)}
                                    className="border-border hover:border-primary gap-1"
                                  >
                                    <Wallet className="h-3.5 w-3.5" />
                                    Adjust
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-[var(--space-md)]">
            <Card className="bg-card/50 border-border">
              <CardHeader className="p-[var(--card-padding)]">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-sm)]">
                  <CardTitle className="text-foreground text-[length:var(--text-xl)] flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    User Credit Balances
                  </CardTitle>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search users..."
                      value={userSearch}
                      onChange={e => setUserSearch(e.target.value)}
                      className="pl-9 bg-background border-border"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0">
                {usersLoading ? renderLoadingSkeleton() : (
                  <div className="rounded-md border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border hover:bg-transparent">
                          <TableHead className="text-muted-foreground">User</TableHead>
                          <TableHead className="text-muted-foreground">Organization</TableHead>
                          <TableHead className="text-muted-foreground text-right">Credit Balance</TableHead>
                          <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                              {userSearch ? "No users match your search." : "No users found."}
                            </TableCell>
                          </TableRow>
                        ) : (
                          users.map(user => (
                            <TableRow key={user.id} className="border-border">
                              <TableCell>
                                <div>
                                  <p className="font-medium text-foreground">{user.gamerName || user.username}</p>
                                  <p className="text-[length:var(--text-xs)] text-muted-foreground">{user.email}</p>
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-foreground">{user.organizationName || '—'}</TableCell>
                              <TableCell className="text-right font-mono text-foreground">{user.creditBalance}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="outline" size="sm" onClick={() => openAdjustDialog('user', user.id, user.gamerName || user.username, user.creditBalance)}
                                    className="border-border hover:border-primary gap-1"
                                  >
                                    <Wallet className="h-3.5 w-3.5" />
                                    Adjust
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                Adjust Credits — {adjustTarget?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="text-[length:var(--text-sm)] text-muted-foreground">
                Current balance: <span className="font-mono font-medium text-foreground">{adjustTarget?.currentBalance ?? 0}</span> credits
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adjust-amount" className="text-foreground">Amount</Label>
                <Input
                  id="adjust-amount"
                  type="number"
                  placeholder="Enter amount (positive to add, negative to deduct)"
                  value={adjustAmount}
                  onChange={e => setAdjustAmount(e.target.value)}
                  className="bg-background border-border"
                />
                <p className="text-[length:var(--text-xs)] text-muted-foreground">
                  Use a positive number to add credits, negative to deduct.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adjust-reason" className="text-foreground">Reason</Label>
                <Textarea
                  id="adjust-reason"
                  placeholder="Enter a reason for this adjustment"
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  className="bg-background border-border min-h-[80px]"
                />
              </div>
              {adjustAmount && !isNaN(Number(adjustAmount)) && Number(adjustAmount) !== 0 && (
                <div className="p-3 rounded-lg bg-muted/30 border border-border">
                  <p className="text-[length:var(--text-sm)] text-foreground">
                    New balance will be:{" "}
                    <span className="font-mono font-bold">
                      {(adjustTarget?.currentBalance ?? 0) + Number(adjustAmount)}
                    </span>{" "}
                    credits
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAdjustDialog(false)} className="border-border">
                Cancel
              </Button>
              <Button onClick={handleAdjust} disabled={adjustMutation.isPending} className="gap-2">
                {adjustMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : Number(adjustAmount) > 0 ? (
                  <Plus className="h-4 w-4" />
                ) : (
                  <Minus className="h-4 w-4" />
                )}
                Apply Adjustment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </QuizAdminLayout>
  );
}
