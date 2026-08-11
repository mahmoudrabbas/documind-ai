import {
  type PaymentProvider,
  type CreateCustomerParams,
  type ProviderCustomer,
  type CreateCheckoutSessionParams,
  type CheckoutSession,
  type CreateBillingPortalSessionParams,
  type BillingPortalSession,
  type PaymentProviderEvent,
  type CreateProductParams,
  type StripeProduct,
  type CreatePriceParams,
  type StripePrice,
  type ProviderSubscription,
  type ProviderInvoice,
  type ProviderInvoicePage,
  type ProviderInvoiceLinks,
  type ProviderSubscriptionState,
  type ProviderSubscriptionChangePreview,
  type ProviderSubscriptionMutationResult,
  type ProviderCancellationResult,
  type ProviderReactivationResult,
  type ProviderRefund,
  type ProviderRefundResult,
  type InvoiceListParams,
  type InvoiceRetrieveParams,
  type SubscriptionReadParams,
  type SubscriptionChangeParams,
  type CancellationParams,
  type RefundCreateParams,
  type RefundRetrieveParams,
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
  subscriptionMetadata: Record<string, string>;
  clientReferenceId: string;
  status: "open" | "complete" | "expired";
  paymentStatus: "paid" | "unpaid" | "no_payment_required";
  subscriptionId?: string;
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

export class FakePaymentProvider implements PaymentProvider {
  readonly customers: StoredCustomer[] = [];
  readonly sessions: StoredSession[] = [];
  readonly products: StoredProduct[] = [];
  readonly prices: StoredPrice[] = [];
  readonly subscriptions: ProviderSubscription[] = [];
  readonly invoices: Array<ProviderInvoice & ProviderInvoiceLinks> = [];
  readonly refunds: ProviderRefund[] = [];
  readonly mutationCalls: string[] = [];
  private readonly idempotency = new Map<string, { fingerprint: string; value: unknown }>();
  private nextId = 1;
  private now = new Date("2026-01-01T00:00:00.000Z");
  shouldFailNextOperation = false;
  shouldTimeoutNextOperation = false;
  shouldReturnStalePreview = false;
  shouldFailNextCreateCustomer = false;
  shouldFailNextCreateSession = false;
  shouldFailNextCreateProduct = false;
  shouldFailNextCreatePrice = false;
  shouldFailNextCreatePortalSession = false;
  shouldFailNextRetrieveSession = false;
  shouldFailNextInvoiceRead = false;

  _reset(): void {
    this.customers.length = 0;
    this.sessions.length = 0;
    this.products.length = 0;
    this.prices.length = 0;
    this.subscriptions.length = 0;
    this.invoices.length = 0;
    this.refunds.length = 0;
    this.mutationCalls.length = 0;
    this.idempotency.clear();
    this.shouldFailNextCreateCustomer = false;
    this.shouldFailNextCreateSession = false;
    this.shouldFailNextCreateProduct = false;
    this.shouldFailNextCreatePrice = false;
    this.shouldFailNextCreatePortalSession = false;
    this.shouldFailNextRetrieveSession = false;
    this.shouldFailNextInvoiceRead = false;
    this.nextId = 1;
    this.now = new Date("2026-01-01T00:00:00.000Z");
    this.shouldFailNextOperation = false;
    this.shouldTimeoutNextOperation = false;
    this.shouldReturnStalePreview = false;
  }

  setClock(now: Date): void { this.now = new Date(now); }
  advanceClock(milliseconds: number): void { this.now = new Date(this.now.getTime() + milliseconds); }
  private generateId(prefix: string): string { return `${prefix}_fake_${this.nextId++}`; }

  async createCustomer(params: CreateCustomerParams): Promise<string> {
    if (this.shouldFailNextCreateCustomer) {
      this.shouldFailNextCreateCustomer = false;
      throw new Error("Fake provider: customer creation failed");
    }
    const existing = this.customers.find(
      (c) => c.tenantId === params.tenantId,
    );
    if (existing) return existing.id;

    const id = this.generateId("cus");
    const { operationContext: _operationContext, ...customer } = params;
    void _operationContext;
    this.customers.push({ id, ...customer });
    return id;
  }

  async retrieveCustomer(customerId: string): Promise<ProviderCustomer> {
    const customer = this.customers.find((item) => item.id === customerId);
    if (!customer) {
      const error = new Error(`Fake provider: customer ${customerId} not found`);
      Object.assign(error, { status: 404, code: "resource_missing" });
      throw error;
    }
    return { id: customer.id };
  }

  async createCheckoutSession(
    params: CreateCheckoutSessionParams,
  ): Promise<CheckoutSession> {
    if (this.shouldFailNextCreateSession) {
      this.shouldFailNextCreateSession = false;
      throw new Error("Fake provider: session creation failed");
    }
    const id = this.generateId("cs");
    const session: StoredSession = {
      id,
      customerId: params.customerId,
      priceId: params.priceId,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
      metadata: { ...params.metadata },
      subscriptionMetadata: { ...(params.subscriptionMetadata ?? params.metadata) },
      clientReferenceId: params.clientReferenceId ?? "",
      status: "open",
      paymentStatus: "unpaid",
    };
    this.sessions.push(session);
    return {
      id: session.id,
      url: session.successUrl.replace("{CHECKOUT_SESSION_ID}", session.id),
      status: "open",
      customerId: session.customerId,
      metadata: session.metadata,
      clientReferenceId: session.clientReferenceId,
      paymentStatus: session.paymentStatus,
      subscriptionId: session.subscriptionId,
    };
  }

  async retrieveSubscription(subscriptionId: string): Promise<ProviderSubscription> {
    const subscription = this.subscriptions.find((item) => item.id === subscriptionId);
    if (!subscription) throw new Error(`Fake provider: subscription ${subscriptionId} not found`);
    return { ...subscription, metadata: { ...subscription.metadata } };
  }

  async listCustomerSubscriptions(customerId: string): Promise<ProviderSubscription[]> {
    return this.subscriptions
      .filter((item) => item.customerId === customerId)
      .map((item) => ({ ...item, metadata: { ...item.metadata } }));
  }

  async retrieveCheckoutSession(
    sessionId: string,
  ): Promise<CheckoutSession> {
    if (this.shouldFailNextRetrieveSession) {
      this.shouldFailNextRetrieveSession = false;
      throw new Error("Fake provider: session retrieval failed");
    }
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
      clientReferenceId: session.clientReferenceId,
      paymentStatus: session.paymentStatus,
      subscriptionId: session.subscriptionId,
      subscription: session.subscriptionId
        ? await this.retrieveSubscription(session.subscriptionId)
        : undefined,
    };
  }

  async createBillingPortalSession(
    params: CreateBillingPortalSessionParams,
  ): Promise<BillingPortalSession> {
    if (this.shouldFailNextCreatePortalSession) {
      this.shouldFailNextCreatePortalSession = false;
      throw new Error("Fake provider: billing portal session creation failed");
    }
    return { url: `${params.returnUrl}?fake_portal=1&flow=${params.flow}`, expiresAt: new Date(this.now.getTime() + 30 * 60_000) };
  }

  verifyWebhookSignature(body: string, signature: string): boolean {
    void body;
    void signature;
    return true;
  }

  parseWebhookEvent(body: Record<string, unknown>): PaymentProviderEvent {
    return {
      id: (body.id as string) ?? this.generateId("evt"),
      type: (body.type as string) ?? "unknown",
      timestamp: new Date(
        (body.created as number)
          ? (body.created as number) * 1000
          : this.now.getTime(),
      ),
      provider: "fake",
      raw: body,
    };
  }

  markSessionComplete(sessionId: string): void {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (session) {
      session.status = "complete";
      session.paymentStatus = "paid";
    }
  }

  attachSubscriptionToSession(
    sessionId: string,
    subscription: ProviderSubscription,
  ): void {
    const session = this.sessions.find((item) => item.id === sessionId);
    if (!session) throw new Error(`Fake provider: session ${sessionId} not found`);
    const existing = this.subscriptions.findIndex((item) => item.id === subscription.id);
    if (existing >= 0) this.subscriptions[existing] = subscription;
    else this.subscriptions.push(subscription);
    session.subscriptionId = subscription.id;
    session.status = "complete";
    session.paymentStatus = "paid";
  }

  async createProduct(params: CreateProductParams): Promise<StripeProduct> {
    if (this.shouldFailNextCreateProduct) {
      this.shouldFailNextCreateProduct = false;
      throw new Error("Fake provider: product creation failed");
    }
    const id = this.generateId("prod");
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
    const id = this.generateId("price");
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

  seedInvoice(invoice: ProviderInvoice, links: ProviderInvoiceLinks = {
    hostedInvoiceUrl: null, invoicePdfUrl: null, receiptUrl: null,
  }): void {
    this.invoices.push({ ...invoice, ...links });
  }

  seedSubscription(subscription: ProviderSubscription): void {
    const index = this.subscriptions.findIndex((item) => item.id === subscription.id);
    if (index >= 0) this.subscriptions[index] = { ...subscription };
    else this.subscriptions.push({ ...subscription });
  }

  seedOutOfOrderEvents(events: PaymentProviderEvent[]): PaymentProviderEvent[] {
    return [...events].reverse();
  }

  async listInvoices(params: InvoiceListParams): Promise<ProviderInvoicePage> {
    this.failInvoiceReadIfConfigured();
    const owned = this.invoices.filter((invoice) => invoice.customerId === params.customerId);
    const start = params.cursor ? Math.max(0, owned.findIndex((invoice) => invoice.id === params.cursor) + 1) : 0;
    const page = owned.slice(start, start + params.limit);
    return {
      invoices: page.map(({ hostedInvoiceUrl: _h, invoicePdfUrl: _p, receiptUrl: _r, ...invoice }) => ({
        ...invoice,
        observedAt: new Date(this.now),
        hostedInvoiceAvailable: Boolean(_h),
        invoicePdfAvailable: Boolean(_p),
        receiptAvailable: Boolean(_r),
      })),
      hasMore: start + page.length < owned.length,
      nextCursor: start + page.length < owned.length ? page.at(-1)?.id ?? null : null,
    };
  }

  async retrieveInvoice(params: InvoiceRetrieveParams): Promise<ProviderInvoice> {
    this.failInvoiceReadIfConfigured();
    const invoice = this.ownedInvoice(params);
    const { hostedInvoiceUrl: _h, invoicePdfUrl: _p, receiptUrl: _r, ...normalized } = invoice;
    return {
      ...normalized,
      observedAt: new Date(this.now),
      hostedInvoiceAvailable: Boolean(invoice.hostedInvoiceUrl),
      invoicePdfAvailable: Boolean(invoice.invoicePdfUrl),
      receiptAvailable: Boolean(invoice.receiptUrl),
    };
  }

  async getSecureInvoiceLinks(params: InvoiceRetrieveParams): Promise<ProviderInvoiceLinks> {
    this.failInvoiceReadIfConfigured();
    const invoice = this.ownedInvoice(params);
    return {
      hostedInvoiceUrl: invoice.hostedInvoiceUrl,
      invoicePdfUrl: invoice.invoicePdfUrl,
      receiptUrl: invoice.receiptUrl,
    };
  }

  async retrieveCurrentSubscriptionState(params: SubscriptionReadParams): Promise<ProviderSubscriptionState> {
    const subscription = await this.retrieveSubscription(params.subscriptionId);
    this.assertOwnership(subscription.customerId, params.expectedCustomerId);
    return this.state(subscription);
  }

  async previewSubscriptionChange(params: SubscriptionChangeParams): Promise<ProviderSubscriptionChangePreview> {
    const state = await this.retrieveCurrentSubscriptionState(params);
    const expiresAt = new Date(this.now.getTime() + (this.shouldReturnStalePreview ? -1 : 15 * 60_000));
    this.shouldReturnStalePreview = false;
    return {
      id: this.generateId("preview"), subscriptionId: state.id, customerId: state.customerId,
      currentPriceReference: state.priceId, targetPriceReference: params.targetPriceReference,
      currency: "USD", amountDueMinor: 500, effectiveAt: new Date(this.now), expiresAt,
      providerStateObservedAt: new Date(this.now),
    };
  }

  async updateSubscription(params: SubscriptionChangeParams): Promise<ProviderSubscriptionMutationResult> {
    return this.idempotentMutation("update", params.operationContext, async () => {
      await this.maybeFail();
      const subscription = await this.ownedSubscription(params);
      subscription.priceId = params.targetPriceReference;
      subscription.metadata = {
        ...subscription.metadata,
        tenantReference: params.operationContext.tenantReference,
        operationReference: params.operationContext.operationReference,
      };
      if (params.targetPackage) {
        subscription.metadata.packageId = params.targetPackage.packageId;
        subscription.metadata.packageVersionId = params.targetPackage.packageVersionId;
        subscription.metadata.packageVersion = String(params.targetPackage.packageVersion);
        subscription.metadata.billingInterval = params.targetPackage.billingInterval;
      }
      return { operationReference: params.operationContext.operationReference, state: this.state(subscription), idempotentReplay: false };
    });
  }

  async scheduleCancellation(params: CancellationParams): Promise<ProviderCancellationResult> {
    return this.idempotentMutation("schedule-cancel", params.operationContext, async () => {
      await this.maybeFail();
      const subscription = await this.ownedSubscription(params);
      subscription.cancelAtPeriodEnd = true;
      const effectiveAt = subscription.currentPeriodEnd ?? new Date(this.now);
      return { operationReference: params.operationContext.operationReference, state: this.state(subscription), idempotentReplay: false, cancellationType: "PERIOD_END", effectiveAt };
    });
  }

  async cancelImmediately(params: CancellationParams): Promise<ProviderCancellationResult> {
    return this.idempotentMutation("cancel-now", params.operationContext, async () => {
      await this.maybeFail();
      const subscription = await this.ownedSubscription(params);
      subscription.status = "canceled";
      subscription.cancelAtPeriodEnd = false;
      return { operationReference: params.operationContext.operationReference, state: this.state(subscription), idempotentReplay: false, cancellationType: "IMMEDIATE", effectiveAt: new Date(this.now) };
    });
  }

  async reactivateSubscription(params: CancellationParams): Promise<ProviderReactivationResult> {
    return this.idempotentMutation("reactivate", params.operationContext, async () => {
      await this.maybeFail();
      const subscription = await this.ownedSubscription(params);
      if (subscription.status === "canceled") throw new Error("Fake provider: cancellation is already effective");
      subscription.cancelAtPeriodEnd = false;
      return { operationReference: params.operationContext.operationReference, state: this.state(subscription), idempotentReplay: false };
    });
  }

  async createRefund(params: RefundCreateParams): Promise<ProviderRefundResult> {
    if (!Number.isInteger(params.amountMinor) || params.amountMinor <= 0) throw new Error("Fake provider: invalid refund amount");
    return this.idempotentMutation("refund", params.operationContext, async () => {
      await this.maybeFail();
      const invoice = this.invoices.find((item) => item.paymentReference === params.chargeId);
      if (invoice) {
        this.assertOwnership(invoice.customerId, params.expectedCustomerId);
        if (invoice.currency.toUpperCase() !== params.currency.toUpperCase()) {
          throw new Error("Fake provider: refund currency mismatch");
        }
        const alreadyRefunded = this.refunds
          .filter((item) => item.chargeId === params.chargeId && item.status === "succeeded")
          .reduce((sum, item) => sum + item.amountMinor, 0);
        if (params.amountMinor > Math.max(0, invoice.amountPaidMinor - alreadyRefunded)) {
          throw new Error("Fake provider: refund amount exceeds refundable balance");
        }
      }
      const refund: ProviderRefund = {
        id: this.generateId("re"), chargeId: params.chargeId, customerId: params.expectedCustomerId,
        amountMinor: params.amountMinor, currency: params.currency.toUpperCase(), status: "succeeded",
        reason: params.reason, createdAt: new Date(this.now),
      };
      this.refunds.push(refund);
      if (invoice) {
        invoice.refundedAmountMinor = Math.max(0, invoice.refundedAmountMinor ?? 0) + params.amountMinor;
      }
      return { refund, idempotentReplay: false };
    });
  }

  async retrieveRefund(params: RefundRetrieveParams): Promise<ProviderRefund> {
    const refund = this.refunds.find((item) => item.id === params.refundId);
    if (!refund) throw new Error("Fake provider: refund not found");
    this.assertOwnership(refund.customerId, params.expectedCustomerId);
    return { ...refund };
  }

  private ownedInvoice(params: InvoiceRetrieveParams) {
    const invoice = this.invoices.find((item) => item.id === params.invoiceId);
    if (!invoice) throw new Error("Fake provider: invoice not found");
    this.assertOwnership(invoice.customerId, params.expectedCustomerId);
    return invoice;
  }

  private async ownedSubscription(params: SubscriptionReadParams): Promise<ProviderSubscription> {
    const subscription = this.subscriptions.find((item) => item.id === params.subscriptionId);
    if (!subscription) throw new Error("Fake provider: subscription not found");
    this.assertOwnership(subscription.customerId, params.expectedCustomerId);
    return subscription;
  }

  private assertOwnership(actual: string, expected: string): void {
    if (!expected || actual !== expected) throw new Error("Fake provider: ownership mismatch");
  }

  private failInvoiceReadIfConfigured(): void {
    if (!this.shouldFailNextInvoiceRead) return;
    this.shouldFailNextInvoiceRead = false;
    throw new Error("Fake provider: invoice read failed");
  }

  private state(subscription: ProviderSubscription): ProviderSubscriptionState {
    return {
      ...subscription, metadata: { ...subscription.metadata }, observedAt: new Date(this.now),
      cancellationEffectiveAt: subscription.cancelAtPeriodEnd ? subscription.currentPeriodEnd : null,
    };
  }

  private async maybeFail(): Promise<void> {
    if (this.shouldTimeoutNextOperation) {
      this.shouldTimeoutNextOperation = false;
      throw new Error("Fake provider: timeout");
    }
    if (this.shouldFailNextOperation) {
      this.shouldFailNextOperation = false;
      throw new Error("Fake provider: operation failed");
    }
  }

  private async idempotentMutation<T extends { idempotentReplay: boolean }>(
    kind: string,
    context: { idempotencyKey: string; requestFingerprint: string },
    execute: () => Promise<T>,
  ): Promise<T> {
    const key = `${kind}:${context.idempotencyKey}`;
    const prior = this.idempotency.get(key);
    if (prior) {
      if (prior.fingerprint !== context.requestFingerprint) throw new Error("Fake provider: idempotency conflict");
      return { ...(prior.value as T), idempotentReplay: true };
    }
    this.mutationCalls.push(kind);
    const value = await execute();
    this.idempotency.set(key, { fingerprint: context.requestFingerprint, value });
    return value;
  }
}
