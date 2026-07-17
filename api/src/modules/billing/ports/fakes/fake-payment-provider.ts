import {
  type PaymentProvider,
  type CreateCustomerParams,
  type CreateCheckoutSessionParams,
  type CheckoutSession,
  type PaymentProviderEvent,
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

let nextId = 1;

function generateId(prefix: string): string {
  return `${prefix}_fake_${nextId++}_${Date.now()}`;
}

export class FakePaymentProvider implements PaymentProvider {
  readonly customers: StoredCustomer[] = [];
  readonly sessions: StoredSession[] = [];
  shouldFailNextCreateCustomer = false;
  shouldFailNextCreateSession = false;

  _reset(): void {
    this.customers.length = 0;
    this.sessions.length = 0;
    this.shouldFailNextCreateCustomer = false;
    this.shouldFailNextCreateSession = false;
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
      url: `https://fake-payment.test/checkout/${session.id}`,
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
      url: `https://fake-payment.test/checkout/${session.id}`,
      status: session.status,
      customerId: session.customerId,
      metadata: session.metadata,
    };
  }

  verifyWebhookSignature(_body: string, _signature: string): boolean {
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
}
