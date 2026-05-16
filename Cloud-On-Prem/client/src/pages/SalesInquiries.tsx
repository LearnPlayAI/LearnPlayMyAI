import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import QuizAdminLayout from "@/components/QuizAdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Phone, Building2, User, Users, Calendar, MessageSquare, ExternalLink, Search, Filter } from "lucide-react";

import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useOrganizationTerminology } from "@/contexts/OrganizationContext";
import { tzFormat } from '@/utils/timezoneRuntime';

interface SalesInquiry {
  id: number;
  name: string;
  surname: string;
  email: string;
  phone: string;
  organizationName: string;
  position: string;
  positionOther: string | null;
  studentCount: string;
  hearAboutUs: string;
  hearAboutUsOther: string | null;
  customMessage: string | null;
  status: string;
  statusUpdatedAt: string | null;
  statusUpdatedBy: string | null;
  createdAt: string;
}

export default function SalesInquiries() {
  const { toast } = useToast();
  const { terminology, terminologyLower, isResolved } = useOrganizationTerminology();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const queryParams = new URLSearchParams();
  if (searchTerm) queryParams.set("search", searchTerm);
  if (statusFilter && statusFilter !== "all") queryParams.set("status", statusFilter);
  if (dateFrom) queryParams.set("dateFrom", dateFrom);
  if (dateTo) queryParams.set("dateTo", dateTo);
  const queryString = queryParams.toString();

  const { data: inquiries, isLoading } = useQuery<SalesInquiry[]>({
    queryKey: [`/api/sales-inquiries${queryString ? `?${queryString}` : ""}`],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      return await apiRequest(`/api/sales-inquiries/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-inquiries"] });
      toast({
        title: "Status Updated",
        description: "Inquiry status has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update inquiry status. Please try again.",
        variant: "destructive",
      });
    },
  });

  const inquiriesList = inquiries ?? [];
  
  const todayInquiries = inquiriesList.filter((i) => {
    const today = new Date();
    const inquiryDate = new Date(i.createdAt);
    return (
      inquiryDate.getDate() === today.getDate() &&
      inquiryDate.getMonth() === today.getMonth() &&
      inquiryDate.getFullYear() === today.getFullYear()
    );
  }).length;

  const potentialStudents = inquiriesList.reduce(
    (sum, i) => sum + parseInt(i.studentCount || "0"), 
    0
  );

  const followUpCount = inquiriesList.filter(i => i.status === "Follow Up").length;

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "Follow Up":
        return "bg-warning/20 text-warning border-[var(--warning)]/30";
      case "Responded":
        return "bg-secondary/20 text-secondary/80 border-secondary/30";
      case "In Progress":
        return "bg-primary/20 text-primary/80 border-primary/30";
      case "Closed":
        return "bg-success/20 text-success border-[var(--success)]/30";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <QuizAdminLayout
      title="Sales Inquiries"
      description="View and manage all sales inquiries from prospective customers"
      activeSection="sales"
    >
      <div className="space-y-4 sm:space-y-6">
        {/* Search and Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="md:col-span-2">
            <Label htmlFor="search" className="text-muted-foreground mb-2 block text-sm">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Search by name, email, or organization..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-muted border-border text-foreground"
                data-testid="input-search"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="status-filter" className="text-muted-foreground mb-2 block">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger id="status-filter" className="bg-muted border-border text-foreground" data-testid="select-status-filter">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Follow Up">Follow Up</SelectItem>
                <SelectItem value="Responded">Responded</SelectItem>
                <SelectItem value="In Progress">In Progress</SelectItem>
                <SelectItem value="Closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="date-from" className="text-muted-foreground mb-2 block">Date From</Label>
            <Input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-muted border-border text-foreground"
              data-testid="input-date-from"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-surface-raised border-secondary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Inquiries</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground" data-testid="stat-total-inquiries">
                {isLoading ? "..." : inquiriesList.length}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-warning/10 border-[var(--warning)]/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Follow Up</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground" data-testid="stat-follow-up">
                {isLoading ? "..." : followUpCount}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-surface-raised border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Today's Inquiries</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground" data-testid="stat-today-inquiries">
                {isLoading ? "..." : todayInquiries}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-warning/10 border-[var(--warning)]/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Potential {isResolved ? terminology?.learnerPlural : "Learners"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground" data-testid="stat-potential-students">
                {isLoading ? "..." : potentialStudents.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="text-center py-12" data-testid="loading-inquiries">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
            <p className="mt-4 text-muted-foreground">Loading inquiries...</p>
          </div>
        ) : inquiriesList.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="py-12 text-center" data-testid="empty-state-inquiries">
              <MessageSquare className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No Inquiries Yet</h3>
              <p className="text-muted-foreground">Sales inquiries will appear here once customers submit the form.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {inquiriesList.map((inquiry) => (
              <Card key={inquiry.id} className="bg-card border-border hover:bg-muted transition-all" data-testid={`card-inquiry-${inquiry.id}`}>
                <CardHeader>
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <CardTitle className="text-xl text-foreground">
                          {inquiry.name} {inquiry.surname}
                        </CardTitle>
                        <Badge variant="outline" >
                          {inquiry.position === "Other" && inquiry.positionOther
                            ? inquiry.positionOther
                            : inquiry.position}
                        </Badge>
                        <Badge variant="outline" className={getStatusBadgeVariant(inquiry.status)} data-testid={`badge-status-${inquiry.id}`}>
                          {inquiry.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        <span data-testid={`text-inquiry-date-${inquiry.id}`}>
                          {tzFormat(inquiry.createdAt, "PPP 'at' p")}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <div className="text-right">
                        <div className="flex items-center gap-2 text-lg font-semibold text-accent">
                          <Users className="w-5 h-5" />
                          <span data-testid={`text-student-count-${inquiry.id}`}>
                            {inquiry.studentCount} {isResolved ? terminologyLower?.learnerPlural : "students"}
                          </span>
                        </div>
                      </div>
                      <div className="min-w-[180px]">
                        <Select
                          value={inquiry.status}
                          onValueChange={(value) => updateStatusMutation.mutate({ id: inquiry.id, status: value })}
                          disabled={updateStatusMutation.isPending}
                        >
                          <SelectTrigger className="bg-muted border-border text-foreground text-sm h-9" data-testid={`select-status-${inquiry.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Follow Up">Follow Up</SelectItem>
                            <SelectItem value="Responded">Responded</SelectItem>
                            <SelectItem value="In Progress">In Progress</SelectItem>
                            <SelectItem value="Closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                      <Building2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground mb-1">Organization</p>
                        <p className="text-foreground font-medium truncate" data-testid={`text-organization-${inquiry.id}`}>
                          {inquiry.organizationName}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                      <Mail className="w-5 h-5 text-secondary mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground mb-1">Email</p>
                        <a
                          href={`mailto:${inquiry.email}`}
                          className="text-secondary/80 hover:text-secondary/90 font-medium hover:underline flex items-center gap-1"
                          data-testid={`link-email-${inquiry.id}`}
                        >
                          <span className="truncate">{inquiry.email}</span>
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                      <Phone className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground mb-1">Phone</p>
                        <a
                          href={`tel:${inquiry.phone}`}
                          className="text-success hover:text-success/80 font-medium hover:underline"
                          data-testid={`link-phone-${inquiry.id}`}
                        >
                          {inquiry.phone}
                        </a>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                      <User className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground mb-1">Referral Source</p>
                        <p className="text-foreground font-medium truncate" data-testid={`text-referral-${inquiry.id}`}>
                          {inquiry.hearAboutUs === "Other" && inquiry.hearAboutUsOther
                            ? inquiry.hearAboutUsOther
                            : inquiry.hearAboutUs}
                        </p>
                      </div>
                    </div>
                  </div>

                  {inquiry.customMessage && (
                    <div className="p-4 bg-muted rounded-lg border border-border">
                      <div className="flex items-start gap-3">
                        <MessageSquare className="w-5 h-5 text-secondary mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs text-muted-foreground mb-2">Additional Message</p>
                          <p className="text-foreground leading-relaxed" data-testid={`text-message-${inquiry.id}`}>
                            {inquiry.customMessage}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </QuizAdminLayout>
  );
}
