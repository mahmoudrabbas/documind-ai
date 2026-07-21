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
  _id: string;
  tenantId: string | { _id: string; name: string; slug: string };
  packageId: {
    _id: string;
    name: string;
    code: string;
    version: number;
    monthlyPrice: number;
    annualPrice: number;
    currency: string;
  };
  packageVersion: number;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  trialStart: string | null;
  trialEnd: string | null;
  cancelledAt: string | null;
  cancellationReason: string;
  providerCustomerId: string;
  providerSubscriptionId: string;
  providerPriceId: string;
  paymentState: string;
  lastProviderEventId: string;
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
}
