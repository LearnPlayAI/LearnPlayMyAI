import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BillingCard } from "@/components/BillingCard";
import { InvoiceListSkeleton } from "@/components/BillingSkeletons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import QuizAdminLayout from "@/components/QuizAdminLayout";
import { useCurrencyPreference } from "@/hooks/useCurrencyPreference";

interface Invoice {
  id: string;
  type: 'subscription' | 'credit_purchase' | 'course_purchase';
  subscriptionId: string | null;
  invoiceNumber: string;
  amountDue: string;
  currency: 'ZAR' | 'USD' | 'EUR';
  originalAmount?: string;
  originalCurrency?: 'ZAR' | 'USD' | 'EUR';
  exchangeRate?: string;
  status: string;
  createdAt: string;
  dueAt: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  pdfPath: string | null;
  description?: string | null;
  courseName?: string | null;
}

export default function InvoiceHistory() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { formatPrice } = useCurrencyPreference();

  // Fetch invoices
  const { data: invoicesData, isLoading: isLoadingInvoices } = useQuery<{ invoices: Invoice[]; total: number }>({
    queryKey: ['/api/invoices', { limit: '50', offset: '0' }],
    queryFn: async () => {
      const response = await fetch('/api/invoices?limit=50&offset=0');
      if (!response.ok) throw new Error('Failed to fetch invoices');
      return response.json();
    },
  });

  const invoices = invoicesData?.invoices || [];
  const filteredInvoices = statusFilter === 'all' 
    ? invoices 
    : invoices.filter(inv => inv.status === statusFilter);

  const handleDownloadPDF = async (invoice: Invoice) => {
    try {
      // Route to correct endpoint based on invoice type
      let downloadUrl: string;
      let downloadTitle: string;
      
      if (invoice.type === 'credit_purchase') {
        downloadUrl = `/api/receipts/${invoice.id}/download`;
        downloadTitle = "Downloading receipt";
      } else if (invoice.type === 'course_purchase') {
        downloadUrl = `/api/course-receipts/${invoice.id}/download`;
        downloadTitle = "Downloading receipt";
      } else {
        downloadUrl = `/api/invoices/${invoice.id}/download`;
        downloadTitle = "Downloading invoice";
      }
      
      window.open(downloadUrl, '_blank');
      toast({
        title: downloadTitle,
        description: "Your PDF is being downloaded.",
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Failed to download PDF",
        variant: "destructive",
      });
    }
  };

  const getTypeLabel = (type: 'subscription' | 'credit_purchase' | 'course_purchase'): string => {
    switch (type) {
      case 'credit_purchase':
        return 'Credit Purchase';
      case 'course_purchase':
        return 'Course Purchase';
      default:
        return 'Subscription';
    }
  };

  const getStatusStyle = (status: string): string => {
    switch (status) {
      case 'paid':
        return 'bg-badge-success/10 text-badge-success border-badge-success/30';
      case 'pending':
        return 'bg-badge-warning/10 text-badge-warning border-badge-warning/30';
      case 'overdue':
        return 'bg-badge-danger/10 text-badge-danger border-badge-danger/30';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <QuizAdminLayout
      title="Invoice History"
      description="View and download your billing invoices"
      activeSection="invoices"
    >
      {isLoadingInvoices ? (
        <div className="mt-[var(--space-lg)]">
          <InvoiceListSkeleton />
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="mt-[var(--space-lg)] flex flex-col sm:flex-row sm:items-center gap-[var(--space-md)]">
            <span className="text-sm text-muted-foreground">Filter by status:</span>
            <div className="flex flex-wrap gap-[var(--space-sm)]">
              <Button variant={statusFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('all')}
                className="min-h-[44px] touch-manipulation"
                data-testid="filter-all"
              >
                All
              </Button>
              <Button variant={statusFilter === 'paid' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('paid')}
                className="min-h-[44px] touch-manipulation"
                data-testid="filter-paid"
              >
                Paid
              </Button>
              <Button variant={statusFilter === 'pending' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('pending')}
                className="min-h-[44px] touch-manipulation"
                data-testid="filter-pending"
              >
                Pending
              </Button>
              <Button variant={statusFilter === 'overdue' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('overdue')}
                className="min-h-[44px] touch-manipulation"
                data-testid="filter-overdue"
              >
                Overdue
              </Button>
            </div>
          </div>

          {/* Invoice List */}
          <div className="mt-[var(--space-lg)]">
            <BillingCard
              title={`Invoices (${filteredInvoices.length})`}
              description="Your billing invoice history"
              testId="card-invoice-list"
            >
              {filteredInvoices.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No invoices found</p>
                </div>
              ) : (
                <div className="space-y-[var(--space-md)]">
                  {filteredInvoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-[var(--card-padding)] border rounded-lg hover:bg-muted/50 transition-colors gap-[var(--space-md)]"
                      data-testid={`invoice-${invoice.id}`}
                    >
                      <div className="flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-[var(--space-sm)]">
                          <p className="font-semibold text-[length:var(--text-base)]">{invoice.invoiceNumber}</p>
                          <Badge variant="outline" className="text-xs">
                            {getTypeLabel(invoice.type)}
                          </Badge>
                          <Badge className={getStatusStyle(invoice.status)}>
                            {invoice.status}
                          </Badge>
                        </div>
                        {invoice.description && (
                          <p className="text-[length:var(--text-sm)] font-medium text-primary">
                            {invoice.description}
                          </p>
                        )}
                        {invoice.type === 'subscription' ? (
                          <>
                            <p className="text-[length:var(--text-sm)] text-muted-foreground">
                              Billing Period: {new Date(invoice.billingPeriodStart).toLocaleDateString()} -{' '}
                              {new Date(invoice.billingPeriodEnd).toLocaleDateString()}
                            </p>
                            <p className="text-[length:var(--text-sm)] text-muted-foreground">
                              Due: {new Date(invoice.dueAt).toLocaleDateString()}
                            </p>
                          </>
                        ) : (
                          <p className="text-[length:var(--text-sm)] text-muted-foreground">
                            Purchased: {new Date(invoice.createdAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-[var(--space-md)]">
                        <div className="text-left sm:text-right">
                          <p className="font-bold text-[length:var(--text-lg)]">{formatPrice(invoice.amountDue, invoice.currency)}</p>
                        </div>
                        {invoice.pdfPath && (
                          <Button variant="outline" size="sm" onClick={() => handleDownloadPDF(invoice)}
                            className="min-h-[44px] touch-manipulation w-full sm:w-auto"
                            data-testid={`button-download-${invoice.id}`}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            PDF
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </BillingCard>
          </div>
        </>
      )}
    </QuizAdminLayout>
  );
}
