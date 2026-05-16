import { db } from "../db";
import {
  subscriptionInvoices,
  subscriptions,
  elearningSubscriptionPlans,
  organizations,
  users,
  creditOrders,
  brandingThemes,
  coursePurchases,
  courses,
} from "@shared/schema";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { ObjectStorageService } from "../objectStorage";
import { PaymentService } from "./paymentService";
import { CurrencyService } from "./currencyService";
import { format } from "date-fns";
import { getBaseUrl } from '../config/base-url';

export interface GenerateInvoiceParams {
  subscriptionId: string;
  amountDue: string; // Decimal string (e.g., "99.99")
  currency: 'ZAR' | 'USD' | 'EUR';
  dueAt: Date;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
}

export interface GenerateLearnerPlanInvoiceParams {
  userId: string;
  planId: string; // 'learner-monthly-plan' or 'elearning-learner-monthly-plan'
  planName: string;
  planPrice: string;
  amountDue: string;
  currency: 'ZAR' | 'USD' | 'EUR';
  dueAt: Date;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
}

export interface InvoicePDFData {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  billingPeriod: string;
  organizationName: string;
  organizationAddress?: string;
  planName: string;
  planPrice: string;
  currency: string;
  amountDue: string;
  zarEquivalent?: string;
  previousBalance?: string;
  paymentUrl?: string;
  sellerName: string;
  sellerLogoUrl?: string;
  sellerEmail: string;
  sellerWebsite: string;
  primaryColor?: string;
  accentColor?: string;
}

export interface OrgBranding {
  orgName: string;
  logoUrl?: string;
  supportEmail?: string;
  supportUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  allowEmailBranding: boolean;
}

function extractColorFromTokens(tokens: Record<string, string> | null, colorName: string, fallback: string): string {
  if (!tokens) return fallback;
  
  const possibleKeys = [
    `--${colorName}`,
    `--color-${colorName}`,
    `--${colorName}-color`,
    colorName,
  ];
  
  let value: string | undefined;
  for (const key of possibleKeys) {
    if (tokens[key] && typeof tokens[key] === 'string') {
      value = tokens[key];
      break;
    }
  }
  
  if (!value) return fallback;
  
  if (value.startsWith('hsl(')) {
    const match = value.match(/hsl\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*\)/);
    if (match) {
      const [, h, s, l] = match;
      return hslToHex(parseFloat(h), parseFloat(s), parseFloat(l));
    }
  }
  return value.startsWith('#') ? value : fallback;
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export class InvoiceService {
  private static objectStorage = new ObjectStorageService();

  private static getDefaultBranding(): OrgBranding {
    return {
      orgName: 'LearnPlay',
      supportEmail: 'support@learnplay.co.za',
      supportUrl: getBaseUrl(),
      primaryColor: '#6b46c1',
      secondaryColor: '#10b981',
      accentColor: '#3b82f6',
      allowEmailBranding: true,
    };
  }

  private static async getOrgBranding(organizationId?: string): Promise<OrgBranding> {
    if (!organizationId) {
      return this.getDefaultBranding();
    }

    try {
      const [branding] = await db
        .select()
        .from(brandingThemes)
        .where(eq(brandingThemes.organizationId, organizationId))
        .limit(1);

      if (!branding || branding.status !== 'active') {
        return this.getDefaultBranding();
      }

      const allowEmailBranding = branding.allowEmailBranding ?? true;
      
      if (!allowEmailBranding) {
        return this.getDefaultBranding();
      }

      const tokens = (branding.tokens as Record<string, string>) || null;

      return {
        orgName: branding.orgName || this.getDefaultBranding().orgName,
        logoUrl: branding.logoUrl || undefined,
        supportEmail: branding.supportEmail || this.getDefaultBranding().supportEmail,
        supportUrl: branding.supportUrl || this.getDefaultBranding().supportUrl,
        primaryColor: extractColorFromTokens(tokens, 'primary', this.getDefaultBranding().primaryColor),
        secondaryColor: extractColorFromTokens(tokens, 'secondary', this.getDefaultBranding().secondaryColor),
        accentColor: extractColorFromTokens(tokens, 'accent', this.getDefaultBranding().accentColor),
        allowEmailBranding: true,
      };
    } catch (error) {
      console.warn('[InvoiceService] Error fetching org branding, using defaults:', error);
      return this.getDefaultBranding();
    }
  }

  /**
   * Generate a new invoice for a subscription
   * Creates invoice record, generates PDF, stores in Object Storage, creates YOCO checkout
   */
  static async generateInvoice(params: GenerateInvoiceParams): Promise<string> {
    const {
      subscriptionId,
      amountDue,
      currency,
      dueAt,
      billingPeriodStart,
      billingPeriodEnd,
    } = params;

    try {
      // Fetch subscription details
      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, subscriptionId))
        .limit(1);

      if (!subscription) {
        throw new Error(`Subscription not found: ${subscriptionId}`);
      }

      // Fetch plan details
      const [plan] = await db
        .select()
        .from(elearningSubscriptionPlans)
        .where(eq(elearningSubscriptionPlans.id, subscription.planId))
        .limit(1);

      if (!plan) {
        throw new Error(`Subscription plan not found: ${subscription.planId}`);
      }

      // Fetch organization/user details based on targetType
      let targetName = 'Unknown';
      let targetEmail = '';
      let targetAddress = '';

      if (subscription.targetType === 'organization') {
        const [org] = await db
          .select()
          .from(organizations)
          .where(eq(organizations.id, subscription.targetId))
          .limit(1);
        
        if (org) {
          targetName = org.name;
          targetEmail = org.billingEmail || '';
          targetAddress = org.streetAddress 
            ? `${org.streetAddress}, ${org.city}, ${org.province} ${org.postalCode}, ${org.country}`
            : '';
        }
      } else {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, subscription.targetId))
          .limit(1);
        
        if (user) {
          targetName = `${user.firstName} ${user.lastName}`;
          targetEmail = user.email;
        }
      }

      // Convert to ZAR if needed (YOCO requires ZAR) and snapshot FX rate
      let finalAmountDue = amountDue;
      let finalCurrency: 'ZAR' | 'USD' | 'EUR' = currency;
      let exchangeRate: string | undefined;
      let originalAmount: string | undefined;
      let originalCurrency: 'ZAR' | 'USD' | 'EUR' | undefined;

      if (currency !== 'ZAR') {
        // Convert to ZAR for YOCO payment processing
        const conversion = await CurrencyService.convertAmount(amountDue, currency, 'ZAR');
        
        if (!conversion || !conversion.convertedAmount) {
          throw new Error(`Failed to fetch exchange rate for ${currency}/ZAR - cannot generate invoice`);
        }

        // Store FX snapshot for audit trail
        originalAmount = amountDue; // Original amount in USD/EUR
        originalCurrency = currency; // Original currency
        exchangeRate = conversion.rate; // Rate used: ZAR per original currency
        
        // Invoice stored in ZAR for YOCO
        finalAmountDue = conversion.convertedAmount;
        finalCurrency = 'ZAR';
      }

      // Create invoice record (always in ZAR, with FX snapshot if converted)
      const [invoice] = await db
        .insert(subscriptionInvoices)
        .values({
          subscriptionId,
          amountDue: finalAmountDue,
          currency: finalCurrency,
          originalAmount,
          originalCurrency,
          exchangeRate,
          billingPeriodStart,
          billingPeriodEnd,
          status: 'pending',
          dueAt,
        })
        .returning();

      console.log(`[InvoiceService] Created invoice ${invoice.id} for subscription ${subscriptionId}` +
        (exchangeRate ? ` (converted from ${originalCurrency} ${originalAmount} @ ${exchangeRate} = ZAR ${finalAmountDue})` : ` (ZAR ${finalAmountDue})`));

      // Fetch platform branding - LearnPlay invoices ALWAYS use platform default theme
      // regardless of the subscription target (org or individual)
      const branding = await this.getOrgBranding(undefined);

      // Generate invoice PDF (always in ZAR) with branding colors
      const pdfData: InvoicePDFData = {
        invoiceNumber: invoice.id.substring(0, 8).toUpperCase(),
        invoiceDate: format(new Date(), 'yyyy-MM-dd'),
        dueDate: format(dueAt, 'yyyy-MM-dd'),
        billingPeriod: `${format(billingPeriodStart, 'MMM dd, yyyy')} - ${format(billingPeriodEnd, 'MMM dd, yyyy')}`,
        organizationName: targetName,
        organizationAddress: targetAddress || undefined,
        planName: plan.name,
        planPrice: plan.priceAmount,
        currency: finalCurrency,
        amountDue: finalAmountDue,
        sellerName: branding.orgName,
        sellerLogoUrl: branding.logoUrl,
        sellerEmail: branding.supportEmail || 'support@learnplay.co.za',
        sellerWebsite: branding.supportUrl || getBaseUrl(),
        primaryColor: branding.primaryColor,
        accentColor: branding.accentColor,
      };

      // If we converted from another currency, show original amount on PDF
      if (originalCurrency && originalAmount) {
        pdfData.zarEquivalent = `Converted from ${originalCurrency} ${originalAmount}`;
      }

      const pdfBuffer = await this.generateInvoicePDF(pdfData);

      // Store PDF in Object Storage with org-branded filename
      const pdfPath = await this.storePDFInObjectStorage(
        invoice.id,
        subscriptionId,
        pdfBuffer,
        branding.orgName
      );

      console.log(`[InvoiceService] Stored invoice PDF at ${pdfPath}`);

      // Create YOCO checkout link for payment (always in ZAR)
      const checkoutUrl = await this.createYocoCheckout(
        invoice.id,
        subscriptionId,
        targetEmail,
        parseFloat(finalAmountDue),
        finalCurrency // Always ZAR
      );

      // Update invoice with checkout URL and PDF path
      await db
        .update(subscriptionInvoices)
        .set({
          checkoutUrl,
          pdfStoragePath: pdfPath,
          updatedAt: new Date(),
        })
        .where(eq(subscriptionInvoices.id, invoice.id));

      console.log(`[InvoiceService] Generated YOCO checkout: ${checkoutUrl}`);

      return invoice.id;

    } catch (error: any) {
      console.error('[InvoiceService] Error generating invoice:', error);
      throw new Error(`Failed to generate invoice: ${error.message}`);
    }
  }

  /**
   * Generate a new invoice for a learner plan purchase (before subscription exists)
   * Creates invoice record without subscriptionId - subscription will be linked by webhook
   */
  static async generateLearnerPlanInvoice(params: GenerateLearnerPlanInvoiceParams): Promise<typeof subscriptionInvoices.$inferSelect> {
    const {
      userId,
      planId,
      planName,
      planPrice,
      amountDue,
      currency,
      dueAt,
      billingPeriodStart,
      billingPeriodEnd,
    } = params;

    try {
      // Fetch user details
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      const targetName = `${user.firstName} ${user.lastName}`;
      const targetEmail = user.email;

      // Convert to ZAR if needed (YOCO requires ZAR) and snapshot FX rate
      let finalAmountDue = amountDue;
      let finalCurrency: 'ZAR' | 'USD' | 'EUR' = currency;
      let exchangeRate: string | undefined;
      let originalAmount: string | undefined;
      let originalCurrency: 'ZAR' | 'USD' | 'EUR' | undefined;

      if (currency !== 'ZAR') {
        // Convert to ZAR for YOCO payment processing
        const conversion = await CurrencyService.convertAmount(amountDue, currency, 'ZAR');
        
        if (!conversion || !conversion.convertedAmount) {
          throw new Error(`Failed to fetch exchange rate for ${currency}/ZAR - cannot generate invoice`);
        }

        // Store FX snapshot for audit trail
        originalAmount = amountDue;
        originalCurrency = currency;
        exchangeRate = conversion.rate;
        
        // Invoice stored in ZAR for YOCO
        finalAmountDue = conversion.convertedAmount;
        finalCurrency = 'ZAR';
      }

      // Create invoice record (always in ZAR, with FX snapshot if converted)
      // Note: subscriptionId is null - will be linked by webhook after payment
      const [invoice] = await db
        .insert(subscriptionInvoices)
        .values({
          subscriptionId: null,
          amountDue: finalAmountDue,
          currency: finalCurrency,
          originalAmount,
          originalCurrency,
          exchangeRate,
          billingPeriodStart,
          billingPeriodEnd,
          status: 'pending',
          dueAt,
          metadata: {
            planId,
            planName,
            planPrice,
            userId,
            type: 'learner_plan_purchase',
          },
        })
        .returning();

      console.log(`[InvoiceService] Created learner plan invoice ${invoice.id} for user ${userId}` +
        (exchangeRate ? ` (converted from ${originalCurrency} ${originalAmount} @ ${exchangeRate} = ZAR ${finalAmountDue})` : ` (ZAR ${finalAmountDue})`));

      return invoice;

    } catch (error: any) {
      console.error('[InvoiceService] Error generating learner plan invoice:', error);
      throw new Error(`Failed to generate learner plan invoice: ${error.message}`);
    }
  }

  /**
   * Generate invoice PDF using PDFKit with organization branding
   * Applies custom colors from branding theme
   * Returns PDF as Buffer
   */
  private static async generateInvoicePDF(data: InvoicePDFData): Promise<Buffer> {
    const primaryColor = data.primaryColor || '#6b46c1';
    const accentColor = data.accentColor || '#3b82f6';

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header accent bar with branding color
        doc.rect(0, 0, 595, 15).fill(primaryColor);

        let headerTextY = 55;
        
        if (data.sellerLogoUrl) {
          doc
            .fontSize(8)
            .font('Helvetica')
            .fillColor('#666666')
            .text(`[Logo: ${data.sellerName}]`, 50, 30);
          headerTextY = 55;
        }

        doc
          .fontSize(20)
          .font('Helvetica-Bold')
          .fillColor(primaryColor)
          .text(data.sellerName, 50, headerTextY)
          .fontSize(10)
          .font('Helvetica')
          .fillColor('#333333')
          .text(data.sellerWebsite, 50, headerTextY + 25)
          .text(data.sellerEmail, 50, headerTextY + 40);

        // Invoice title with branding color
        doc
          .fontSize(24)
          .font('Helvetica-Bold')
          .fillColor(primaryColor)
          .text('INVOICE', 400, 50, { align: 'right' });

        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor('#333333')
          .text(`Invoice #: ${data.invoiceNumber}`, 400, 80, { align: 'right' })
          .text(`Date: ${data.invoiceDate}`, 400, 95, { align: 'right' })
          .text(`Due Date: ${data.dueDate}`, 400, 110, { align: 'right' });

        // Divider line with accent color
        doc.strokeColor(primaryColor).lineWidth(2).moveTo(50, 140).lineTo(545, 140).stroke();

        // Bill To section
        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .text('BILL TO:', 50, 160);

        doc
          .fontSize(10)
          .font('Helvetica')
          .text(data.organizationName, 50, 180);

        if (data.organizationAddress) {
          doc.text(data.organizationAddress, 50, 195, { width: 250 });
        }

        // Invoice details table
        const tableTop = 250;
        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .text('Description', 50, tableTop)
          .text('Period', 250, tableTop)
          .text('Amount', 450, tableTop, { width: 95, align: 'right' });

        // Divider
        doc.moveTo(50, tableTop + 20).lineTo(545, tableTop + 20).stroke();

        // Line item
        const itemY = tableTop + 30;
        doc
          .fontSize(10)
          .font('Helvetica')
          .text(`${data.planName} Subscription`, 50, itemY)
          .text(data.billingPeriod, 250, itemY)
          .text(`${data.currency} ${data.amountDue}`, 450, itemY, { width: 95, align: 'right' });

        // Total section
        const totalY = itemY + 60;
        doc.moveTo(350, totalY - 10).lineTo(545, totalY - 10).stroke();

        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .text('Total Due:', 350, totalY)
          .text(`${data.currency} ${data.amountDue}`, 450, totalY, { width: 95, align: 'right' });

        // ZAR equivalent if applicable
        if (data.zarEquivalent) {
          doc
            .fontSize(9)
            .font('Helvetica')
            .text(`(ZAR ${data.zarEquivalent} equivalent)`, 450, totalY + 15, { width: 95, align: 'right' });
        }

        // Payment instructions
        const paymentY = totalY + 80;
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('Payment Instructions:', 50, paymentY);

        doc
          .fontSize(9)
          .font('Helvetica')
          .text('Please pay this invoice by the due date using the payment link provided in your email.', 50, paymentY + 20, { width: 495 })
          .text('Payments are processed securely through YOCO.', 50, paymentY + 50, { width: 495 });

        if (data.paymentUrl) {
          doc
            .fillColor(accentColor)
            .text('Payment Link:', 50, paymentY + 80)
            .text(data.paymentUrl, 50, paymentY + 95, { link: data.paymentUrl, underline: true })
            .fillColor('#333333');
        }

        // Footer accent bar with branding color
        doc.rect(0, 815, 595, 15).fill(primaryColor);

        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor('#333333')
          .text('Thank you for your business!', 50, 700, { align: 'center', width: 495 })
          .text(`If you have any questions, please contact ${data.sellerEmail}`, 50, 715, { align: 'center', width: 495 });

        doc.end();

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Store invoice PDF in Object Storage
   * Path: privateDir/invoices/{subscriptionId}/{orgName}-Invoice-{invoiceNumber}.pdf
   */
  private static async storePDFInObjectStorage(
    invoiceId: string,
    subscriptionId: string,
    pdfBuffer: Buffer,
    orgName: string = 'LearnPlay'
  ): Promise<string> {
    try {
      const sanitizedOrgName = orgName.replace(/[^a-zA-Z0-9-_]/g, '-');
      const invoiceNumber = invoiceId.substring(0, 8).toUpperCase();
      const filePath = `invoices/${subscriptionId}/${sanitizedOrgName}-Invoice-${invoiceNumber}.pdf`;

      const storedPath = await InvoiceService.objectStorage.uploadCourseDraftDocument(filePath, pdfBuffer, 'application/pdf');

      console.log(`[InvoiceService] Uploaded PDF to Object Storage: ${storedPath}`);

      return storedPath;

    } catch (error: any) {
      console.error('[InvoiceService] Error storing PDF:', error);
      throw new Error(`Failed to store invoice PDF: ${error.message}`);
    }
  }

  /**
   * Create YOCO checkout session for invoice payment
   */
  private static async createYocoCheckout(
    invoiceId: string,
    subscriptionId: string,
    userEmail: string,
    amount: number,
    currency: 'ZAR' | 'USD' | 'EUR'
  ): Promise<string> {
    try {
      // Convert to ZAR if needed (YOCO only supports ZAR)
      let zarAmount = amount.toString();
      if (currency !== 'ZAR') {
        const conversion = await CurrencyService.convertAmount(amount.toString(), currency, 'ZAR');
        zarAmount = conversion.convertedAmount;
      }

      const baseUrl = getBaseUrl();

      const checkout = await PaymentService.createYocoCheckout({
        courseId: invoiceId, // Using courseId field for invoiceId
        userId: userEmail,
        amount: zarAmount,
        currency: 'ZAR',
        successUrl: `${baseUrl}/billing/payment-success?invoiceId=${invoiceId}`,
        cancelUrl: `${baseUrl}/billing/payment-cancelled?invoiceId=${invoiceId}`,
        failureUrl: `${baseUrl}/billing/payment-failed?invoiceId=${invoiceId}`,
        organizationId: subscriptionId, // Using organizationId field for subscriptionId
        originalAmount: amount.toString(),
        originalCurrency: currency,
      });

      // Update invoice with YOCO checkout ID
      await db
        .update(subscriptionInvoices)
        .set({
          yocoCheckoutId: checkout.checkoutId,
        })
        .where(eq(subscriptionInvoices.id, invoiceId));

      return checkout.redirectUrl;

    } catch (error: any) {
      console.error('[InvoiceService] Error creating YOCO checkout:', error);
      throw new Error(`Failed to create payment checkout: ${error.message}`);
    }
  }

  /**
   * Mark invoice as paid (called after successful YOCO payment)
   */
  static async markInvoicePaid(invoiceId: string, yocoCheckoutId: string): Promise<void> {
    try {
      await db
        .update(subscriptionInvoices)
        .set({
          status: 'paid',
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(subscriptionInvoices.id, invoiceId));

      console.log(`[InvoiceService] Marked invoice ${invoiceId} as paid`);

    } catch (error: any) {
      console.error('[InvoiceService] Error marking invoice as paid:', error);
      throw new Error(`Failed to mark invoice as paid: ${error.message}`);
    }
  }

  /**
   * Mark invoice as failed
   */
  static async markInvoiceFailed(invoiceId: string): Promise<void> {
    try {
      await db
        .update(subscriptionInvoices)
        .set({
          status: 'failed',
          updatedAt: new Date(),
        })
        .where(eq(subscriptionInvoices.id, invoiceId));

      console.log(`[InvoiceService] Marked invoice ${invoiceId} as failed`);

    } catch (error: any) {
      console.error('[InvoiceService] Error marking invoice as failed:', error);
      throw new Error(`Failed to mark invoice as failed: ${error.message}`);
    }
  }

  /**
   * Get invoice PDF from Object Storage
   */
  static async getInvoicePDF(invoiceId: string): Promise<Buffer | null> {
    try {
      const [invoice] = await db
        .select()
        .from(subscriptionInvoices)
        .where(eq(subscriptionInvoices.id, invoiceId))
        .limit(1);

      if (!invoice || !invoice.pdfStoragePath) {
        return null;
      }

      const contents = await InvoiceService.objectStorage.downloadFileToBuffer(invoice.pdfStoragePath);
      return contents;

    } catch (error: any) {
      console.error('[InvoiceService] Error retrieving PDF:', error);
      return null;
    }
  }

  /**
   * Get receipt PDF from Object Storage
   */
  static async getReceiptPDF(receiptId: string): Promise<Buffer | null> {
    try {
      const [receipt] = await db
        .select()
        .from(creditOrders)
        .where(eq(creditOrders.id, receiptId))
        .limit(1);

      if (!receipt || !receipt.receiptPdfPath) {
        return null;
      }

      const contents = await InvoiceService.objectStorage.downloadFileToBuffer(receipt.receiptPdfPath);
      return contents;

    } catch (error: any) {
      console.error('[InvoiceService] Error retrieving receipt PDF:', error);
      return null;
    }
  }

  /**
   * Get invoices for a subscription
   */
  static async getSubscriptionInvoices(subscriptionId: string, limit = 10): Promise<any[]> {
    try {
      const invoices = await db
        .select()
        .from(subscriptionInvoices)
        .where(eq(subscriptionInvoices.subscriptionId, subscriptionId))
        .orderBy(desc(subscriptionInvoices.createdAt))
        .limit(limit);

      return invoices;

    } catch (error: any) {
      console.error('[InvoiceService] Error fetching invoices:', error);
      return [];
    }
  }

  /**
   * Generate a standalone receipt PDF for credit purchases
   * Stores in Object Storage and returns path
   */
  static async generateStandaloneReceipt(params: {
    orderId: string;
    purchaserId: string;
    organizationId?: string;
    packageName: string;
    creditsAmount: number;
    amount: string;
    currency: string;
    paidAt: Date;
  }): Promise<{ success: boolean; pdfPath?: string; error?: string }> {
    try {
      // Fetch organization details if provided
      let orgData: any = null;
      if (params.organizationId) {
        const [org] = await db
          .select()
          .from(organizations)
          .where(eq(organizations.id, params.organizationId))
          .limit(1);
        orgData = org;
      }

      // Fetch purchaser details
      const [purchaser] = await db
        .select()
        .from(users)
        .where(eq(users.id, params.purchaserId))
        .limit(1);

      // Generate receipt PDF
      const receiptNumber = `CR-${params.orderId.substring(0, 8).toUpperCase()}`;
      const receiptDate = format(params.paidAt, 'yyyy-MM-dd');

      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));

      // Header
      doc.fontSize(24).font('Helvetica-Bold').text('Credit Purchase Receipt', { align: 'center' });
      doc.moveDown();

      // Receipt info
      doc.fontSize(10).font('Helvetica');
      doc.text(`Receipt Number: ${receiptNumber}`, { align: 'right' });
      doc.text(`Date: ${receiptDate}`, { align: 'right' });
      doc.moveDown(2);

      // Organization info
      if (orgData) {
        doc.fontSize(12).font('Helvetica-Bold').text('Billed To:', 50, doc.y);
        doc.fontSize(10).font('Helvetica');
        doc.text(orgData.name);
        if (orgData.streetAddress) doc.text(orgData.streetAddress);
        if (orgData.city || orgData.province) {
          doc.text(`${orgData.city || ''}${orgData.city && orgData.province ? ', ' : ''}${orgData.province || ''}`);
        }
        if (orgData.postalCode) doc.text(orgData.postalCode);
        if (orgData.country) doc.text(orgData.country);
      }
      doc.moveDown(2);

      // Purchaser info
      if (purchaser) {
        doc.fontSize(12).font('Helvetica-Bold').text('Purchased By:');
        doc.fontSize(10).font('Helvetica');
        const purchaserName = purchaser.firstName && purchaser.lastName 
          ? `${purchaser.firstName} ${purchaser.lastName}`
          : purchaser.gamerName;
        doc.text(purchaserName);
        if (purchaser.email) doc.text(purchaser.email);
      }
      doc.moveDown(3);

      // Purchase details table
      const tableTop = doc.y;
      const col1 = 50;
      const col2 = 300;
      const col3 = 450;

      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Description', col1, tableTop);
      doc.text('Quantity', col2, tableTop);
      doc.text('Amount', col3, tableTop);
      
      doc.moveTo(col1, tableTop + 15).lineTo(550, tableTop + 15).stroke();
      doc.moveDown();

      doc.font('Helvetica');
      const itemY = tableTop + 25;
      doc.text(params.packageName, col1, itemY);
      doc.text(`${params.creditsAmount.toLocaleString()} credits`, col2, itemY);
      doc.text(`${params.currency} ${parseFloat(params.amount).toFixed(2)}`, col3, itemY);

      doc.moveDown(3);
      doc.moveTo(col1, doc.y).lineTo(550, doc.y).stroke();

      // Total
      doc.moveDown();
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text('Total Paid:', col2, doc.y);
      doc.text(`${params.currency} ${parseFloat(params.amount).toFixed(2)}`, col3, doc.y);

      doc.moveDown(3);

      // Footer
      doc.fontSize(10).font('Helvetica');
      doc.text('Thank you for your purchase!', { align: 'center' });
      doc.moveDown();
      doc.fontSize(8).fillColor('gray');
      doc.text('LearnPlay - AI-Powered Educational Platform', { align: 'center' });
      doc.text(getBaseUrl(), { align: 'center' });

      doc.end();

      // Wait for PDF generation to complete
      const pdfBuffer = await new Promise<Buffer>((resolve) => {
        doc.on('end', () => {
          resolve(Buffer.concat(chunks));
        });
      });

      const filePath = `receipts/${params.organizationId || 'user'}/${params.orderId}.pdf`;

      const storedPath = await InvoiceService.objectStorage.uploadCourseDraftDocument(filePath, pdfBuffer, 'application/pdf');

      console.log(`[InvoiceService] Receipt PDF generated and uploaded: ${storedPath}`);

      return {
        success: true,
        pdfPath: storedPath,
      };

    } catch (error: any) {
      console.error('[InvoiceService] Failed to generate receipt PDF:', error);
      return {
        success: false,
        error: error.message || 'Failed to generate receipt PDF',
      };
    }
  }

  /**
   * Generate Course Purchase Receipt PDF
   * Follows same pattern as generateStandaloneReceipt for credit purchases
   */
  static async generateCoursePurchaseReceipt(params: {
    purchaseId: string;
    userId: string;
    courseName: string;
    courseId: string;
    amount: string;
    currency: string;
    paidAt: Date;
    transactionId: string;
  }): Promise<{ success: boolean; pdfPath?: string; error?: string }> {
    try {
      // Fetch purchaser details
      const [purchaser] = await db
        .select()
        .from(users)
        .where(eq(users.id, params.userId))
        .limit(1);

      // Generate receipt PDF
      const receiptNumber = `CP-${params.purchaseId.substring(0, 8).toUpperCase()}`;
      const receiptDate = format(params.paidAt, 'yyyy-MM-dd');

      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));

      // Header
      doc.fontSize(24).font('Helvetica-Bold').text('Course Purchase Receipt', { align: 'center' });
      doc.moveDown();

      // Receipt info
      doc.fontSize(10).font('Helvetica');
      doc.text(`Receipt Number: ${receiptNumber}`, { align: 'right' });
      doc.text(`Date: ${receiptDate}`, { align: 'right' });
      doc.text(`Transaction ID: ${params.transactionId}`, { align: 'right' });
      doc.moveDown(2);

      // Purchaser info
      if (purchaser) {
        doc.fontSize(12).font('Helvetica-Bold').text('Purchased By:');
        doc.fontSize(10).font('Helvetica');
        const purchaserName = purchaser.firstName && purchaser.lastName 
          ? `${purchaser.firstName} ${purchaser.lastName}`
          : purchaser.gamerName || 'Customer';
        doc.text(purchaserName);
        if (purchaser.email) doc.text(purchaser.email);
      }
      doc.moveDown(3);

      // Purchase details table
      const tableTop = doc.y;
      const col1 = 50;
      const col2 = 450;

      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Description', col1, tableTop);
      doc.text('Amount', col2, tableTop);
      
      doc.moveTo(col1, tableTop + 15).lineTo(550, tableTop + 15).stroke();
      doc.moveDown();

      doc.font('Helvetica');
      const itemY = tableTop + 25;
      doc.text(`Course: ${params.courseName}`, col1, itemY);
      doc.text(`${params.currency} ${parseFloat(params.amount).toFixed(2)}`, col2, itemY);

      doc.moveDown(3);
      doc.moveTo(col1, doc.y).lineTo(550, doc.y).stroke();

      // Total
      doc.moveDown();
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text('Total Paid:', 300, doc.y);
      doc.text(`${params.currency} ${parseFloat(params.amount).toFixed(2)}`, col2, doc.y);

      doc.moveDown(3);

      // Footer
      doc.fontSize(10).font('Helvetica');
      doc.text('Thank you for your purchase!', { align: 'center' });
      doc.moveDown();
      doc.text('You now have full access to this course.', { align: 'center' });
      doc.moveDown(2);
      doc.fontSize(8).fillColor('gray');
      doc.text('LearnPlay - AI-Powered Educational Platform', { align: 'center' });
      doc.text(getBaseUrl(), { align: 'center' });

      doc.end();

      // Wait for PDF generation to complete
      const pdfBuffer = await new Promise<Buffer>((resolve) => {
        doc.on('end', () => {
          resolve(Buffer.concat(chunks));
        });
      });

      const filePath = `receipts/courses/${params.courseId}/${params.purchaseId}.pdf`;

      const storedPath = await InvoiceService.objectStorage.uploadCourseDraftDocument(filePath, pdfBuffer, 'application/pdf');

      console.log(`[InvoiceService] Course purchase receipt PDF generated and uploaded: ${storedPath}`);

      return {
        success: true,
        pdfPath: storedPath,
      };

    } catch (error: any) {
      console.error('[InvoiceService] Failed to generate course purchase receipt PDF:', error);
      return {
        success: false,
        error: error.message || 'Failed to generate course purchase receipt PDF',
      };
    }
  }

  /**
   * Get course purchase receipt PDF from Object Storage
   * Follows same pattern as getReceiptPDF for credit orders
   */
  static async getCoursePurchaseReceiptPDF(purchaseId: string): Promise<Buffer | null> {
    try {
      const [purchase] = await db
        .select()
        .from(coursePurchases)
        .where(eq(coursePurchases.id, purchaseId))
        .limit(1);

      if (!purchase || !purchase.receiptPdfPath) {
        return null;
      }

      const contents = await InvoiceService.objectStorage.downloadFileToBuffer(purchase.receiptPdfPath);
      return contents;

    } catch (error: any) {
      console.error('[InvoiceService] Error retrieving course purchase receipt PDF:', error);
      return null;
    }
  }
}
