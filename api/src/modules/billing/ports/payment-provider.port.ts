export interface CreateCustomerParams {
  tenantId: string;
  email: string;
  name: string;
}

export interface CreateCheckoutSessionParams {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  subscriptionMetadata?: Record<string, string>;
  clientReferenceId?: string;
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
}

export interface StripeProduct {
  id: string;
  name: string;
}

export interface CreatePriceParams {
  productId: string;
  unitAmount: number;
  currency: string;
  interval: "month" | "year";
  metadata?: Record<string, string>;
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
}

export interface BillingPortalSession {
  url: string;
}

export interface PaymentProvider {
  createCustomer(params: CreateCustomerParams): Promise<string>;
  createCheckoutSession(params: CreateCheckoutSessionParams): Promise<CheckoutSession>;
  /** Read-only recovery lookup. Implementations must not create provider resources. */
  retrieveCheckoutSession(sessionId: string): Promise<CheckoutSession>;
  retrieveSubscription?(subscriptionId: string): Promise<ProviderSubscription>;
  listCustomerSubscriptions?(customerId: string): Promise<ProviderSubscription[]>;
  createBillingPortalSession(params: CreateBillingPortalSessionParams): Promise<BillingPortalSession>;
  verifyWebhookSignature(body: string, signature: string): boolean;
  parseWebhookEvent(body: Record<string, unknown>): PaymentProviderEvent;
  createProduct(params: CreateProductParams): Promise<StripeProduct>;
  createPrice(params: CreatePriceParams): Promise<StripePrice>;
}
