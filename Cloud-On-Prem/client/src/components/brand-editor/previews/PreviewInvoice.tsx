import { useState } from 'react';
import { PreviewFrame, ClickableElement } from '../PreviewFrame';
import { useBrandEditor } from '../BrandEditorShell';
import { 
  CreditCard, 
  Calendar, 
  Coins, 
  Package, 
  Download, 
  Eye, 
  DollarSign,
  FileText,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle
} from 'lucide-react';

function SectionTitle({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <h2 
      id={id}
      className="text-lg font-semibold pb-2 border-b"
      style={{ color: 'var(--text-primary)', borderColor: 'var(--stroke-default)', fontFamily: 'var(--font-heading)', marginBottom: 'var(--space-md)' }}
      data-testid={`invoice-section-title-${id}`}
    >
      {children}
    </h2>
  );
}

export function PreviewInvoice() {
  const { state } = useBrandEditor();
  const brandName = state.brandName || 'LearnPlay';
  const [showEmptyState, setShowEmptyState] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const invoices = [
    { id: 'INV-2024-001234', date: 'Dec 4, 2024', dueDate: 'Dec 18, 2024', amount: 178.09, status: 'paid' as const },
    { id: 'INV-2024-001189', date: 'Nov 4, 2024', dueDate: 'Nov 18, 2024', amount: 154.99, status: 'paid' as const },
    { id: 'INV-2024-001156', date: 'Oct 4, 2024', dueDate: 'Oct 18, 2024', amount: 129.99, status: 'pending' as const },
    { id: 'INV-2024-001123', date: 'Sep 4, 2024', dueDate: 'Sep 18, 2024', amount: 99.99, status: 'overdue' as const },
    { id: 'INV-2024-001098', date: 'Aug 4, 2024', dueDate: 'Aug 18, 2024', amount: 79.99, status: 'cancelled' as const },
  ];

  const lineItems = [
    { description: 'Python for Beginners - Course Enrollment', quantity: 1, price: 49.99 },
    { description: 'Data Science Masterclass - Course Enrollment', quantity: 1, price: 79.99 },
    { description: 'Platform Credits (100 LPC)', quantity: 1, price: 25.00 },
  ];

  const subtotal = lineItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.15;
  const total = subtotal + tax;

  const getStatusStyle = (status: 'paid' | 'pending' | 'overdue' | 'cancelled') => {
    switch (status) {
      case 'paid':
        return { bg: 'var(--success)', fg: 'var(--success-foreground)', icon: CheckCircle };
      case 'pending':
        return { bg: 'var(--warning)', fg: 'var(--warning-foreground)', icon: Clock };
      case 'overdue':
        return { bg: 'var(--destructive)', fg: 'var(--destructive-foreground)', icon: AlertCircle };
      case 'cancelled':
        return { bg: 'var(--surface-muted)', fg: 'var(--text-muted)', icon: XCircle };
    }
  };

  return (
    <PreviewFrame className="min-h-[900px]" data-testid="preview-invoice">
      <div className="p-6 space-y-6" style={{ backgroundColor: 'var(--surface-primary)' }}>
        
        {/* Header */}
        <ClickableElement 
          editKey="--gradient-primary-from"
          className="rounded-xl p-6"
          style={{
            background: `linear-gradient(135deg, var(--gradient-primary-from), var(--gradient-primary-to))`,
          }}
          data-testid="preview-invoice-header"
          aria-label="Edit invoice header gradient"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {state.logoUrl ? (
                <img src={state.logoUrl} alt="Logo" className="h-10 object-contain" data-testid="preview-invoice-logo" />
              ) : (
                <div 
                  className="h-10 w-10 rounded-lg flex items-center justify-center font-bold"
                  style={{ backgroundColor: 'var(--action-primary-fg)', color: 'var(--action-primary)' }}
                  data-testid="preview-invoice-logo-placeholder"
                >
                  {brandName[0]}
                </div>
              )}
              <div>
                <h1 className="text-xl font-bold" style={{ color: 'var(--action-primary-fg)', fontFamily: 'var(--font-heading)' }}>{brandName}</h1>
                <p className="text-sm opacity-80" style={{ color: 'var(--action-primary-fg)', fontFamily: 'var(--font-body)' }}>Billing & Invoices</p>
              </div>
            </div>
            <ClickableElement
              editKey="--btn-secondary-bg"
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ backgroundColor: 'var(--btn-secondary-bg)', color: 'var(--btn-secondary-fg)' }}
              onActivate={() => setShowEmptyState(!showEmptyState)}
              data-testid="preview-invoice-toggle-empty"
              aria-label="Toggle empty state preview"
            >
              {showEmptyState ? 'Show Invoices' : 'Show Empty State'}
            </ClickableElement>
          </div>
        </ClickableElement>

        {/* Billing Overview Cards */}
        <section data-testid="billing-overview-section">
          <SectionTitle id="billing-overview">Billing Overview</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <ClickableElement
              editKey="--card"
              className="p-4 rounded-lg border"
              style={{ backgroundColor: 'var(--surface-raised)', borderColor: 'var(--stroke-default)' }}
              data-testid="card-current-plan"
              aria-label="Edit billing card style"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Current Plan</p>
                  <p className="text-lg font-bold mt-1" style={{ color: 'var(--text-primary)' }}>Pro Plan</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--action-primary)' }}>$29.99/mo</p>
                </div>
                <div 
                  className="p-2 rounded-lg"
                  style={{ backgroundColor: 'var(--action-primary)', opacity: 0.1 }}
                >
                  <Package className="w-5 h-5" style={{ color: 'var(--action-primary)' }} />
                </div>
              </div>
            </ClickableElement>

            <ClickableElement
              editKey="--card"
              className="p-4 rounded-lg border"
              style={{ backgroundColor: 'var(--surface-raised)', borderColor: 'var(--stroke-default)' }}
              data-testid="card-next-billing"
              aria-label="Edit next billing card"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Next Billing</p>
                  <p className="text-lg font-bold mt-1" style={{ color: 'var(--text-primary)' }}>Jan 4, 2025</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>30 days left</p>
                </div>
                <div 
                  className="p-2 rounded-lg"
                  style={{ backgroundColor: 'var(--action-secondary)', opacity: 0.2 }}
                >
                  <Calendar className="w-5 h-5" style={{ color: 'var(--action-secondary)' }} />
                </div>
              </div>
            </ClickableElement>

            <ClickableElement
              editKey="--card"
              className="p-4 rounded-lg border"
              style={{ backgroundColor: 'var(--surface-raised)', borderColor: 'var(--stroke-default)' }}
              data-testid="card-payment-method"
              aria-label="Edit payment method card"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Payment Method</p>
                  <p className="text-lg font-bold mt-1" style={{ color: 'var(--text-primary)' }}>•••• 4242</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Expires 12/26</p>
                </div>
                <div 
                  className="p-2 rounded-lg"
                  style={{ backgroundColor: 'var(--action-accent)', opacity: 0.2 }}
                >
                  <CreditCard className="w-5 h-5" style={{ color: 'var(--action-accent-fg)' }} />
                </div>
              </div>
            </ClickableElement>

            <ClickableElement
              editKey="--card"
              className="p-4 rounded-lg border"
              style={{ backgroundColor: 'var(--surface-raised)', borderColor: 'var(--stroke-default)' }}
              data-testid="card-credits-balance"
              aria-label="Edit credits balance card"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Credits Balance</p>
                  <p className="text-lg font-bold mt-1" style={{ color: 'var(--text-primary)' }}>2,450 LPC</p>
                  <ClickableElement 
                    editKey="--success"
                    as="span"
                    className="text-xs mt-1 inline-block"
                    style={{ color: 'var(--success)' }}
                    data-testid="credits-positive-indicator"
                    aria-label="Edit success color"
                  >
                    +150 this month
                  </ClickableElement>
                </div>
                <div 
                  className="p-2 rounded-lg"
                  style={{ backgroundColor: 'var(--success)', opacity: 0.15 }}
                >
                  <Coins className="w-5 h-5" style={{ color: 'var(--success)' }} />
                </div>
              </div>
            </ClickableElement>
          </div>
        </section>

        {/* Invoice History Section */}
        <section data-testid="invoice-history-section">
          <SectionTitle id="invoice-history">Invoice History</SectionTitle>
          
          {showEmptyState ? (
            /* Empty State */
            <ClickableElement
              editKey="--muted"
              className="py-16 rounded-lg border text-center"
              style={{ backgroundColor: 'var(--surface-muted)', borderColor: 'var(--stroke-default)' }}
              data-testid="empty-state-invoices"
              aria-label="Edit empty state style"
            >
              <FileText className="w-16 h-16 mx-auto mb-4 opacity-40" style={{ color: 'var(--text-muted)' }} />
              <p className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>No invoices found</p>
              <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
                Your invoice history will appear here once you make a purchase.
              </p>
              <ClickableElement
                editKey="--btn-primary-bg"
                className="mt-6 px-6 py-2 rounded-lg font-medium inline-block"
                style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)' }}
                data-testid="empty-state-cta"
                aria-label="Edit primary button"
              >
                Browse Courses
              </ClickableElement>
            </ClickableElement>
          ) : (
            /* Invoice Table */
            <ClickableElement
              editKey="--table-header-bg"
              className="rounded-lg border overflow-hidden"
              style={{ borderColor: 'var(--table-cell-border)' }}
              data-testid="invoice-table"
              aria-label="Edit table style"
            >
              {/* Table Header */}
              <div 
                className="grid grid-cols-12 gap-2 p-3 text-sm font-medium"
                style={{ backgroundColor: 'var(--table-header-bg)', color: 'var(--table-header-fg)' }}
                data-testid="invoice-table-header"
              >
                <div className="col-span-3">Invoice #</div>
                <div className="col-span-2">Date</div>
                <div className="col-span-2">Due Date</div>
                <div className="col-span-2 text-right">Amount</div>
                <div className="col-span-1 text-center">Status</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>

              {/* Table Rows */}
              {invoices.map((invoice, index) => {
                const statusStyle = getStatusStyle(invoice.status);
                const StatusIcon = statusStyle.icon;
                return (
                  <ClickableElement
                    key={invoice.id}
                    editKey={index % 2 === 0 ? "--table-row-bg" : "--table-row-alt-bg"}
                    className="grid grid-cols-12 gap-2 p-3 text-sm items-center"
                    style={{ 
                      backgroundColor: index % 2 === 0 ? 'var(--table-row-bg)' : 'var(--table-row-alt-bg)',
                      borderTop: '1px solid var(--table-cell-border)'
                    }}
                    data-testid={`invoice-row-${index}`}
                    aria-label={`Edit ${index % 2 === 0 ? 'table row' : 'alternate row'} style`}
                  >
                    <div className="col-span-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                      {invoice.id}
                    </div>
                    <div className="col-span-2" style={{ color: 'var(--text-muted)' }}>
                      {invoice.date}
                    </div>
                    <div className="col-span-2" style={{ color: 'var(--text-muted)' }}>
                      {invoice.dueDate}
                    </div>
                    <div className="col-span-2 text-right font-medium" style={{ color: 'var(--text-primary)' }}>
                      ${invoice.amount.toFixed(2)}
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <ClickableElement
                        editKey={`--${invoice.status === 'cancelled' ? 'muted' : invoice.status}`}
                        className="px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1"
                        style={{ backgroundColor: statusStyle.bg, color: statusStyle.fg }}
                        data-testid={`status-badge-${invoice.status}`}
                        aria-label={`Edit ${invoice.status} status badge`}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                      </ClickableElement>
                    </div>
                    <div className="col-span-2 flex justify-end gap-1">
                      <ClickableElement
                        editKey="--btn-ghost-bg"
                        className="p-1.5 rounded-md"
                        style={{ backgroundColor: 'var(--btn-ghost-bg)', color: 'var(--btn-ghost-fg)' }}
                        data-testid={`btn-download-${index}`}
                        aria-label="Download PDF"
                      >
                        <Download className="w-4 h-4" />
                      </ClickableElement>
                      <ClickableElement
                        editKey="--btn-ghost-bg"
                        className="p-1.5 rounded-md"
                        style={{ backgroundColor: 'var(--btn-ghost-bg)', color: 'var(--btn-ghost-fg)' }}
                        onActivate={() => setSelectedInvoice(selectedInvoice === index ? null : index)}
                        data-testid={`btn-view-${index}`}
                        aria-label="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </ClickableElement>
                      {invoice.status === 'pending' && (
                        <ClickableElement
                          editKey="--btn-primary-bg"
                          className="px-2 py-1 rounded-md text-xs font-medium"
                          style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)' }}
                          data-testid={`btn-pay-${index}`}
                          aria-label="Pay now"
                        >
                          Pay
                        </ClickableElement>
                      )}
                    </div>
                  </ClickableElement>
                );
              })}
            </ClickableElement>
          )}

          {/* Pagination */}
          {!showEmptyState && (
            <div className="flex items-center justify-between mt-4" data-testid="pagination-section">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Showing 1-5 of 23 invoices
              </p>
              <div className="flex items-center gap-2">
                <ClickableElement
                  editKey="--btn-outline-bg"
                  className="p-2 rounded-lg border"
                  style={{ 
                    backgroundColor: 'var(--btn-outline-bg)', 
                    color: 'var(--btn-outline-fg)',
                    borderColor: 'var(--btn-outline-border)'
                  }}
                  data-testid="pagination-prev"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </ClickableElement>
                {[1, 2, 3].map((page) => (
                  <ClickableElement
                    key={page}
                    editKey={page === currentPage ? "--btn-primary-bg" : "--btn-outline-bg"}
                    className="w-8 h-8 rounded-lg border flex items-center justify-center text-sm font-medium"
                    style={{ 
                      backgroundColor: page === currentPage ? 'var(--btn-primary-bg)' : 'var(--btn-outline-bg)',
                      color: page === currentPage ? 'var(--btn-primary-fg)' : 'var(--btn-outline-fg)',
                      borderColor: page === currentPage ? 'var(--btn-primary-bg)' : 'var(--btn-outline-border)'
                    }}
                    onActivate={() => setCurrentPage(page)}
                    data-testid={`pagination-page-${page}`}
                    aria-label={`Page ${page}`}
                  >
                    {page}
                  </ClickableElement>
                ))}
                <span className="text-sm px-1" style={{ color: 'var(--text-muted)' }}>...</span>
                <ClickableElement
                  editKey="--btn-outline-bg"
                  className="w-8 h-8 rounded-lg border flex items-center justify-center text-sm font-medium"
                  style={{ 
                    backgroundColor: 'var(--btn-outline-bg)', 
                    color: 'var(--btn-outline-fg)',
                    borderColor: 'var(--btn-outline-border)'
                  }}
                  data-testid="pagination-page-5"
                  aria-label="Page 5"
                >
                  5
                </ClickableElement>
                <ClickableElement
                  editKey="--btn-outline-bg"
                  className="p-2 rounded-lg border"
                  style={{ 
                    backgroundColor: 'var(--btn-outline-bg)', 
                    color: 'var(--btn-outline-fg)',
                    borderColor: 'var(--btn-outline-border)'
                  }}
                  data-testid="pagination-next"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </ClickableElement>
              </div>
            </div>
          )}
        </section>

        {/* Invoice Detail View */}
        <section data-testid="invoice-detail-section">
          <SectionTitle id="invoice-detail">Invoice Detail View</SectionTitle>
          
          <ClickableElement
            editKey="--card"
            className="rounded-xl border overflow-hidden"
            style={{ backgroundColor: 'var(--surface-raised)', borderColor: 'var(--stroke-default)' }}
            data-testid="invoice-detail-card"
            aria-label="Edit invoice detail card"
          >
            {/* Invoice Header */}
            <ClickableElement 
              editKey="--gradient-primary-from"
              className="p-6"
              style={{
                background: `linear-gradient(135deg, var(--gradient-primary-from), var(--gradient-primary-to))`,
              }}
              data-testid="invoice-detail-header"
              aria-label="Edit invoice detail header"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {state.logoUrl ? (
                    <img src={state.logoUrl} alt="Logo" className="h-10 object-contain" />
                  ) : (
                    <div 
                      className="h-10 w-10 rounded-lg flex items-center justify-center font-bold"
                      style={{ backgroundColor: 'var(--action-primary-fg)', color: 'var(--action-primary)' }}
                    >
                      {brandName[0]}
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-bold" style={{ color: 'var(--action-primary-fg)' }}>{brandName}</h3>
                    <p className="text-sm opacity-80" style={{ color: 'var(--action-primary-fg)' }}>Invoice</p>
                  </div>
                </div>
                <div className="text-right" style={{ color: 'var(--action-primary-fg)' }}>
                  <p className="font-bold text-lg">#INV-2024-001234</p>
                  <p className="text-sm opacity-80">December 4, 2024</p>
                </div>
              </div>
            </ClickableElement>

            <div className="p-6 space-y-6">
              {/* Billing Addresses */}
              <div className="grid grid-cols-2 gap-8">
                <ClickableElement 
                  editKey="--foreground" 
                  as="div" 
                  className="space-y-1"
                  data-testid="invoice-detail-bill-to"
                  aria-label="Edit billing address section"
                >
                  <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Bill To:</p>
                  <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>John Doe</p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>john.doe@email.com</p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>123 Learning Street</p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cape Town, South Africa</p>
                </ClickableElement>
                <ClickableElement 
                  editKey="support" 
                  as="div" 
                  className="text-right space-y-1"
                  data-testid="invoice-detail-from"
                  aria-label="Edit company address section"
                >
                  <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>From:</p>
                  <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{brandName}</p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{state.supportEmail || 'support@learnplay.com'}</p>
                  <p className="text-sm" style={{ color: 'var(--action-primary)' }}>{state.supportUrl || 'www.learnplay.com'}</p>
                </ClickableElement>
              </div>

              {/* Line Items Table */}
              <ClickableElement
                editKey="--table-header-bg"
                className="rounded-lg border overflow-hidden"
                style={{ borderColor: 'var(--table-cell-border)' }}
                data-testid="line-items-table"
                aria-label="Edit line items table"
              >
                <div 
                  className="grid grid-cols-12 gap-4 p-3 text-sm font-medium"
                  style={{ backgroundColor: 'var(--table-header-bg)', color: 'var(--table-header-fg)' }}
                >
                  <div className="col-span-6">Description</div>
                  <div className="col-span-2 text-center">Qty</div>
                  <div className="col-span-2 text-right">Price</div>
                  <div className="col-span-2 text-right">Total</div>
                </div>
                {lineItems.map((item, i) => (
                  <div 
                    key={i}
                    className="grid grid-cols-12 gap-4 p-3 text-sm"
                    style={{ 
                      backgroundColor: i % 2 === 0 ? 'var(--table-row-bg)' : 'var(--table-row-alt-bg)', 
                      borderTop: '1px solid var(--table-cell-border)' 
                    }}
                    data-testid={`line-item-${i}`}
                  >
                    <div className="col-span-6" style={{ color: 'var(--text-primary)' }}>{item.description}</div>
                    <div className="col-span-2 text-center" style={{ color: 'var(--text-muted)' }}>{item.quantity}</div>
                    <div className="col-span-2 text-right" style={{ color: 'var(--text-muted)' }}>${item.price.toFixed(2)}</div>
                    <div className="col-span-2 text-right font-medium" style={{ color: 'var(--text-primary)' }}>
                      ${(item.price * item.quantity).toFixed(2)}
                    </div>
                  </div>
                ))}
              </ClickableElement>

              {/* Summary */}
              <div className="flex justify-end">
                <ClickableElement 
                  editKey="--muted"
                  className="w-72 space-y-2 p-4 rounded-lg"
                  style={{ backgroundColor: 'var(--surface-muted)' }}
                  data-testid="invoice-detail-summary"
                  aria-label="Edit invoice summary style"
                >
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--text-muted)' }}>Subtotal</span>
                    <span style={{ color: 'var(--text-primary)' }}>${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--text-muted)' }}>VAT (15%)</span>
                    <span style={{ color: 'var(--text-primary)' }}>${tax.toFixed(2)}</span>
                  </div>
                  <div 
                    className="flex justify-between font-bold pt-2 text-lg"
                    style={{ borderTop: '1px solid var(--stroke-default)' }}
                  >
                    <span style={{ color: 'var(--text-primary)' }}>Total</span>
                    <ClickableElement 
                      editKey="--primary" 
                      as="span" 
                      style={{ color: 'var(--action-primary)' }}
                      data-testid="invoice-detail-total"
                      aria-label="Edit total amount color"
                    >
                      ${total.toFixed(2)}
                    </ClickableElement>
                  </div>
                </ClickableElement>
              </div>

              {/* Payment Status */}
              <ClickableElement
                editKey="--success"
                className="flex items-center gap-3 p-4 rounded-lg"
                style={{ backgroundColor: 'var(--alert-success-bg)', border: '1px solid var(--success)' }}
                data-testid="payment-status"
                aria-label="Edit payment status style"
              >
                <CheckCircle className="w-6 h-6" style={{ color: 'var(--success)' }} />
                <div>
                  <p className="font-medium" style={{ color: 'var(--success)' }}>Payment Received</p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Paid on December 4, 2024 via Credit Card ending in 4242
                  </p>
                </div>
              </ClickableElement>

              {/* Notes Section */}
              <ClickableElement
                editKey="--muted"
                className="p-4 rounded-lg"
                style={{ backgroundColor: 'var(--surface-muted)' }}
                data-testid="invoice-notes"
                aria-label="Edit notes section style"
              >
                <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Notes</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Thank you for your purchase! If you have any questions about this invoice, 
                  please contact our support team at{' '}
                  <span style={{ color: 'var(--action-primary)' }}>{state.supportEmail || 'support@learnplay.com'}</span>
                </p>
              </ClickableElement>

              {/* Action Buttons */}
              <div className="flex justify-between items-center pt-4" style={{ borderTop: '1px solid var(--stroke-default)' }}>
                <ClickableElement
                  editKey="--btn-outline-bg"
                  className="px-4 py-2 rounded-lg border flex items-center gap-2 font-medium"
                  style={{ 
                    backgroundColor: 'var(--btn-outline-bg)', 
                    color: 'var(--btn-outline-fg)',
                    borderColor: 'var(--btn-outline-border)'
                  }}
                  data-testid="btn-download-pdf"
                  aria-label="Download PDF button"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </ClickableElement>
                <ClickableElement
                  editKey="--btn-primary-bg"
                  className="px-6 py-2 rounded-lg font-medium flex items-center gap-2"
                  style={{ 
                    backgroundColor: 'var(--btn-primary-bg)', 
                    color: 'var(--btn-primary-fg)',
                    boxShadow: '0 4px 12px var(--game-glow)'
                  }}
                  data-testid="btn-pay-invoice"
                  aria-label="Pay invoice button"
                >
                  <DollarSign className="w-4 h-4" />
                  Pay Now - ${total.toFixed(2)}
                </ClickableElement>
              </div>
            </div>
          </ClickableElement>
        </section>

        {/* Footer */}
        <ClickableElement 
          editKey="support"
          className="text-center text-sm p-4 rounded-lg"
          style={{ backgroundColor: 'var(--surface-muted)' }}
          data-testid="preview-invoice-footer"
          aria-label="Edit invoice footer"
        >
          <p style={{ color: 'var(--text-muted)' }}>
            Questions about billing? Contact us at{' '}
            <span style={{ color: 'var(--action-primary)' }}>{state.supportEmail || 'support@learnplay.com'}</span>
          </p>
          <div className="flex justify-center gap-4 mt-2">
            <span style={{ color: 'var(--action-primary)' }}>Terms of Service</span>
            <span style={{ color: 'var(--text-muted)' }}>•</span>
            <span style={{ color: 'var(--action-primary)' }}>Privacy Policy</span>
            <span style={{ color: 'var(--text-muted)' }}>•</span>
            <span style={{ color: 'var(--action-primary)' }}>Refund Policy</span>
          </div>
        </ClickableElement>
      </div>
    </PreviewFrame>
  );
}

export default PreviewInvoice;
