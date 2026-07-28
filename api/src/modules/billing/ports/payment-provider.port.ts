export type IsoCurrencyCode = string;

export interface ProviderOperationContext {
  idempotencyKey: string;
  requestFingerprint: string;
  tenantReference: string;
  operationReference: string;
  traceId?: string;
}

export interface CreateCustomerParams {
  tenantId: string;
  email: string;
  name: string;
  operationContext?: ProviderOperationContext;
}

export interface CreateCheckoutSessionParams {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  subscriptionMetadata?: Record<string, string>;
  clientReferenceId?: string;
  operationContext?: ProviderOperationContext;
}

export interface CheckoutSession {
  id: string;
  url: string;
  status: "open" | "complete" | "expired";
  customerId: string;
  metadata: Record<string, string>;
  clientReferenceId?: string;
  paymentStatus: "paid" | "unpaid" | "no_payment_required";
  subscriptionId?: string;
  subscription?: ProviderSubscription;
}

export interface ProviderSubscription {
  id: string;
  customerId: string;
  status: string;
  metadata: Record<string, string>;
  priceId: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export interface ProviderSubscriptionState extends ProviderSubscription {
  observedAt: Date;
  cancellationEffectiveAt: Date | null;
}

export type ProviderInvoiceStatus = "draft" | "open" | "paid" | "void" | "uncollectible";
export interface ProviderInvoice {
  id: string;
  customerId: string;
  subscriptionId: string | null;
  number: string | null;
  status: ProviderInvoiceStatus;
  currency: IsoCurrencyCode;
  amountDueMinor: number;
  amountPaidMinor: number;
  amountRemainingMinor: number;
  subtotalMinor: number;
  taxMinor: number | null;
  createdAt: Date;
  dueAt: Date | null;
  paidAt: Date | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  providerVersion: string | null;
}
export interface ProviderInvoicePage {
  invoices: ProviderInvoice[];
  nextCursor: string | null;
  hasMore: boolean;
}
export interface ProviderInvoiceLinks {
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  receiptUrl: string | null;
}

export interface ProviderSubscriptionChangePreview {
  id: string;
  subscriptionId: string;
  customerId: string;
  currentPriceReference: string;
  targetPriceReference: string;
  currency: IsoCurrencyCode;
  amountDueMinor: number;
  effectiveAt: Date;
  expiresAt: Date;
  providerStateObservedAt: Date;
}
export interface ProviderSubscriptionMutationResult {
  operationReference: string;
  state: ProviderSubscriptionState;
  idempotentReplay: boolean;
}
export interface ProviderCancellationResult extends ProviderSubscriptionMutationResult {
  cancellationType: "PERIOD_END" | "IMMEDIATE";
  effectiveAt: Date;
}
export type ProviderReactivationResult = ProviderSubscriptionMutationResult;

export type ProviderRefundStatus = "pending" | "succeeded" | "failed" | "canceled";
export interface ProviderRefund {
  id: string;
  chargeId: string;
  customerId: string;
  amountMinor: number;
  currency: IsoCurrencyCode;
  status: ProviderRefundStatus;
  reason: string | null;
  createdAt: Date;
}
export interface ProviderRefundResult {
  refund: ProviderRefund;
  idempotentReplay: boolean;
}

export interface PaymentProviderEvent {
  id: string;
  type: string;
  timestamp: Date;
  provider: string;
  raw: Record<string, unknown>;
}
export interface CreateProductParams {
  name: string;
  description?: string;
  metadata?: Record<string, string>;
  operationContext?: ProviderOperationContext;
}
export interface StripeProduct { id: string; name: string }
export interface CreatePriceParams {
  productId: string;
  unitAmount: number;
  currency: string;
  interval: "month" | "year";
  metadata?: Record<string, string>;
  operationContext?: ProviderOperationContext;
}
export interface StripePrice {
  id: string;
  productId: string;
  unitAmount: number;
  currency: string;
  interval: string;
}

export interface CreateBillingPortalSessionParams {
  customerId: string;
  returnUrl: string;
  flow?: "general" | "payment_method_update";
  operationContext?: ProviderOperationContext;
}
export interface ProviderPortalSession { url: string; expiresAt: Date | null }
export type BillingPortalSession = ProviderPortalSession;
export interface InvoiceListParams { customerId: string; limit: number; cursor?: string }
export interface InvoiceRetrieveParams { invoiceId: string; expectedCustomerId: string }
export interface SubscriptionReadParams { subscriptionId: string; expectedCustomerId: string }
export interface SubscriptionChangeParams extends SubscriptionReadParams {
  targetPriceReference: string;
  previewReference?: string;
  operationContext: ProviderOperationContext;
}
export interface CancellationParams extends SubscriptionReadParams {
  operationContext: ProviderOperationContext;
}
export interface RefundCreateParams {
  chargeId: string;
  expectedCustomerId: string;
  amountMinor: number;
  currency: IsoCurrencyCode;
  reason: string;
  operationContext: ProviderOperationContext;
}
export interface RefundRetrieveParams { refundId: string; expectedCustomerId: string }

export interface PaymentProvider {
  createCustomer(params: CreateCustomerParams): Promise<string>;
  createCheckoutSession(params: CreateCheckoutSessionParams): Promise<CheckoutSession>;
  retrieveCheckoutSession(sessionId: string): Promise<CheckoutSession>;
  retrieveSubscription?(subscriptionId: string): Promise<ProviderSubscription>;
  listCustomerSubscriptions?(customerId: string): Promise<ProviderSubscription[]>;
  createBillingPortalSession(params: CreateBillingPortalSessionParams): Promise<ProviderPortalSession>;
  listInvoices(params: InvoiceListParams): Promise<ProviderInvoicePage>;
  retrieveInvoice(params: InvoiceRetrieveParams): Promise<ProviderInvoice>;
  getSecureInvoiceLinks(params: InvoiceRetrieveParams): Promise<ProviderInvoiceLinks>;
  previewSubscriptionChange(params: SubscriptionChangeParams): Promise<ProviderSubscriptionChangePreview>;
  updateSubscription(params: SubscriptionChangeParams): Promise<ProviderSubscriptionMutationResult>;
  scheduleCancellation(params: CancellationParams): Promise<ProviderCancellationResult>;
  cancelImmediately(params: CancellationParams): Promise<ProviderCancellationResult>;
  reactivateSubscription(params: CancellationParams): Promise<ProviderReactivationResult>;
  createRefund(params: RefundCreateParams): Promise<ProviderRefundResult>;
  retrieveRefund(params: RefundRetrieveParams): Promise<ProviderRefund>;
  retrieveCurrentSubscriptionState(params: SubscriptionReadParams): Promise<ProviderSubscriptionState>;
  verifyWebhookSignature(body: string, signature: string): boolean;
  parseWebhookEvent(body: Record<string, unknown>): PaymentProviderEvent;
  createProduct(params: CreateProductParams): Promise<StripeProduct>;
  createPrice(params: CreatePriceParams): Promise<StripePrice>;
}
