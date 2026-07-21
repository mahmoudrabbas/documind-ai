import {
  type PaymentProvider,
  type CreateCustomerParams,
  type CreateCheckoutSessionParams,
  type CheckoutSession,
  type CreateBillingPortalSessionParams,
  type BillingPortalSession,
  type PaymentProviderEvent,
  type CreateProductParams,
  type StripeProduct,
  type CreatePriceParams,
  type StripePrice,
} from "../payment-provider.port.js";

interface StoredCustomer {
  id: string;
  tenantId: string;
  email: string;
  name: string;
}

interface StoredSession {
  id: string;
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  status: "open" | "complete" | "expired";
}

interface StoredProduct {
  id: string;
  name: string;
  description: string;
  metadata: Record<string, string>;
}

interface StoredPrice {
  id: string;
  productId: string;
  unitAmount: number;
  currency: string;
  interval: string;
  metadata: Record<string, string>;
}

let nextId = 1;

function generateId(prefix: string): string {
  return `${prefix}_fake_${nextId++}_${Date.now()}`;
}

export class FakePaymentProvider implements PaymentProvider {
  readonly customers: StoredCustomer[] = [];
  readonly sessions: StoredSession[] = [];
  readonly products: StoredProduct[] = [];
  readonly prices: StoredPrice[] = [];
  shouldFailNextCreateCustomer = false;
  shouldFailNextCreateSession = false;
  shouldFailNextCreateProduct = false;
  shouldFailNextCreatePrice = false;
  shouldFailNextCreatePortalSession = false;

  _reset(): void {
    this.customers.length = 0;
    this.sessions.length = 0;
    this.products.length = 0;
    this.prices.length = 0;
    this.shouldFailNextCreateCustomer = false;
    this.shouldFailNextCreateSession = false;
    this.shouldFailNextCreateProduct = false;
    this.shouldFailNextCreatePrice = false;
    this.shouldFailNextCreatePortalSession = false;
    nextId = 1;
  }

  async createCustomer(params: CreateCustomerParams): Promise<string> {
    if (this.shouldFailNextCreateCustomer) {
      this.shouldFailNextCreateCustomer = false;
      throw new Error("Fake provider: customer creation failed");
    }
    const existing = this.customers.find(
      (c) => c.tenantId === params.tenantId,
    );
    if (existing) return existing.id;

    const id = generateId("cus");
    this.customers.push({ id, ...params });
    return id;
  }

  async createCheckoutSession(
    params: CreateCheckoutSessionParams,
  ): Promise<CheckoutSession> {
    if (this.shouldFailNextCreateSession) {
      this.shouldFailNextCreateSession = false;
      throw new Error("Fake provider: session creation failed");
    }
    const id = generateId("cs");
    const session: StoredSession = {
      id,
      customerId: params.customerId,
      priceId: params.priceId,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
      metadata: { ...params.metadata },
      status: "open",
    };
    this.sessions.push(session);
    return {
      id: session.id,
      url: session.successUrl.replace("{CHECKOUT_SESSION_ID}", session.id),
      status: "open",
      customerId: session.customerId,
      metadata: session.metadata,
    };
  }

  async retrieveCheckoutSession(
    sessionId: string,
  ): Promise<CheckoutSession> {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (!session) {
      throw new Error(`Fake provider: session ${sessionId} not found`);
    }
    return {
      id: session.id,
      url: session.successUrl.replace("{CHECKOUT_SESSION_ID}", session.id),
      status: session.status,
      customerId: session.customerId,
      metadata: session.metadata,
    };
  }

  async createBillingPortalSession(
    params: CreateBillingPortalSessionParams,
  ): Promise<BillingPortalSession> {
    if (this.shouldFailNextCreatePortalSession) {
      this.shouldFailNextCreatePortalSession = false;
      throw new Error("Fake provider: billing portal session creation failed");
    }
    return { url: `${params.returnUrl}?customer=${params.customerId}` };
  }

  verifyWebhookSignature(body: string, signature: string): boolean {
    void body;
    void signature;
    return true;
  }

  parseWebhookEvent(body: Record<string, unknown>): PaymentProviderEvent {
    return {
      id: (body.id as string) ?? `evt_fake_${Date.now()}`,
      type: (body.type as string) ?? "unknown",
      timestamp: new Date(
        (body.created as number)
          ? (body.created as number) * 1000
          : Date.now(),
      ),
      provider: "stripe",
      raw: body,
    };
  }

  markSessionComplete(sessionId: string): void {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (session) session.status = "complete";
  }

  async createProduct(params: CreateProductParams): Promise<StripeProduct> {
    if (this.shouldFailNextCreateProduct) {
      this.shouldFailNextCreateProduct = false;
      throw new Error("Fake provider: product creation failed");
    }
    const id = generateId("prod");
    const product: StoredProduct = {
      id,
      name: params.name,
      description: params.description ?? "",
      metadata: { ...params.metadata },
    };
    this.products.push(product);
    return { id: product.id, name: product.name };
  }

  async createPrice(params: CreatePriceParams): Promise<StripePrice> {
    if (this.shouldFailNextCreatePrice) {
      this.shouldFailNextCreatePrice = false;
      throw new Error("Fake provider: price creation failed");
    }
    const id = generateId("price");
    const price: StoredPrice = {
      id,
      productId: params.productId,
      unitAmount: params.unitAmount,
      currency: params.currency,
      interval: params.interval,
      metadata: { ...params.metadata },
    };
    this.prices.push(price);
    return {
      id: price.id,
      productId: price.productId,
      unitAmount: price.unitAmount,
      currency: price.currency,
      interval: price.interval,
    };
  }
}
