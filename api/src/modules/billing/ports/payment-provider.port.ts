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
}

export interface CheckoutSession {
  id: string;
  url: string;
  status: "open" | "complete" | "expired";
  customerId: string;
  metadata: Record<string, string>;
}

export interface PaymentProviderEvent {
  id: string;
  type: string;
  timestamp: Date;
  provider: string;
  raw: Record<string, unknown>;
}

export interface PaymentProvider {
  createCustomer(params: CreateCustomerParams): Promise<string>;
  createCheckoutSession(params: CreateCheckoutSessionParams): Promise<CheckoutSession>;
  retrieveCheckoutSession(sessionId: string): Promise<CheckoutSession>;
  verifyWebhookSignature(body: string, signature: string): boolean;
  parseWebhookEvent(body: Record<string, unknown>): PaymentProviderEvent;
}
