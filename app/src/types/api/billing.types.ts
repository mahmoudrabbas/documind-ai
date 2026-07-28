export interface CheckoutSessionResponse {
  checkoutId: string;
  sessionUrl: string;
  providerSessionId: string;
}

export interface CheckoutSession {
  _id: string;
  tenantId: string;
  packageId: string;
  packageVersion: number;
  billingInterval: "monthly" | "annual";
  packageVersionId: string;
  providerSessionId: string;
  providerCustomerId: string;
  status: "pending" | "completed" | "expired" | "failed";
  returnUrl: string;
  cancelUrl: string;
  expiresAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionStatus {
  id: string;
  tenantId: string;
  packageId: {
    _id: string;
    name: string;
    code: string;
    version: number;
    monthlyPrice: number;
    annualPrice: number;
    monthlyPriceCents: number;
    annualPriceCents: number;
    currency: string;
    entitlements: {
      employees: number;
      admins: number;
      documents: number;
      storageMb: number;
      fileSizeMb: number;
      queriesPerMonth: number;
      tokensPerMonth: number;
      ocrPagesPerMonth: number;
    };
  };
  packageVersion: number;
  billingInterval: "monthly" | "annual" | null;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialStart: string | null;
  trialEnd: string | null;
  paymentState: string;
  cancelAtPeriodEnd: boolean;
  cancellationEffectiveAt: string | null;
  providerManaged: boolean;
  providerLinked: boolean;
  pendingOperation: { type: string; status: string; requestedAt: string } | null;
  canOpenPortal: boolean;
  canUpdatePaymentMethod: boolean;
  canChangePlan: boolean;
  canCancel: boolean;
  canReactivate: boolean;
  canRequestRefund: boolean;
  canViewInvoices: boolean;
  lifecycle: {
    eligible: boolean;
    inGracePeriod: boolean;
    accessEndsAt: string | null;
    reason: string;
  };
  invoiceSummary: { total: number; open: number; paid: number; pastDue: number };
}

export interface PaymentEvent {
  _id: string;
  eventId: string;
  eventType: string;
  provider: string;
  status: "received" | "verified" | "processed" | "failed";
  processingErrors: string[];
  processedAt: string | null;
  tenantId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  page: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
}

export interface PublicPackage {
  id: string;
  name: string;
  code: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  monthlyPriceCents: number;
  annualPriceCents: number;
  currency: string;
  trialDays: number;
  entitlements: {
    employees: number;
    documents: number;
    storageMb: number;
    queriesPerMonth: number;
  };
  supportedModels: string[];
  analyticsLevel: string;
  retentionDays: number;
  supportLevel: string;
}

export interface BillingPortalSessionResponse {
  url: string;
  expiresAt: string | null;
}

export type BillingPortalFlow = "general" | "payment_method_update";
export type InvoiceStatus = "draft" | "open" | "paid" | "void" | "uncollectible";
export interface BillingInvoice {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  currency: string;
  amountDueMinor: number;
  amountPaidMinor: number;
  amountRemainingMinor: number;
  subtotalMinor: number;
  taxMinor: number | null;
  createdAt: string;
  dueAt: string | null;
  paidAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  hostedInvoiceAvailable: boolean;
  invoicePdfAvailable: boolean;
  receiptAvailable: boolean;
}
export interface InvoiceLinks {
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  receiptUrl: string | null;
}
