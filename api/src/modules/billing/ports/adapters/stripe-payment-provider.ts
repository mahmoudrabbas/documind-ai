import Stripe from "stripe";
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
  type ProviderOperationContext,
} from "../payment-provider.port.js";
import { config } from "../../../../config/index.js";
import { logger } from "../../../../common/logger/logger.js";
import { AppError } from "../../../../common/errors/AppError.js";
import { BILLING_PROVIDER_CONFIGURATION_INVALID } from "../../../../common/errors/errorCodes.js";
import { assertBillingPortalReturnUrl } from "../../portal-url-policy.js";

let stripeClient: Stripe | null = null;

async function getClient(): Promise<Stripe> {
  if (stripeClient) return stripeClient;
  const secretKey = config.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  stripeClient = new Stripe(secretKey);
  return stripeClient;
}

export class StripePaymentProvider implements PaymentProvider {
  constructor(private readonly injectedClient?: Stripe) {}

  private async client(): Promise<Stripe> {
    return this.injectedClient ?? getClient();
  }

  async createCustomer(params: CreateCustomerParams): Promise<string> {
    const stripe = await this.client();
    const customer = await stripe.customers.create({
      email: params.email,
      name: params.name,
      metadata: { tenantId: params.tenantId },
    }, requestOptions(params.operationContext));
    return customer.id;
  }

  async createCheckoutSession(
    params: CreateCheckoutSessionParams,
  ): Promise<CheckoutSession> {
    const stripe = await this.client();
    const session = await stripe.checkout.sessions.create({
      customer: params.customerId,
      mode: "subscription",
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata,
      client_reference_id: params.clientReferenceId,
      subscription_data: { metadata: params.subscriptionMetadata ?? params.metadata },
    }, requestOptions(params.operationContext));

    return {
      id: session.id,
      url: session.url ?? "",
      status: session.status === "open" ? "open" : "complete",
      customerId:
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? params.customerId,
      metadata: (session.metadata as Record<string, string>) ?? {},
      clientReferenceId: session.client_reference_id ?? undefined,
      paymentStatus: session.payment_status,
      subscriptionId:
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id,
    };
  }

  async retrieveCheckoutSession(
    sessionId: string,
  ): Promise<CheckoutSession> {
    const stripe = await this.client();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "customer"],
    });
    const expandedSubscription =
      session.subscription && typeof session.subscription !== "string"
        ? this.mapSubscription(session.subscription)
        : undefined;

    return {
      id: session.id,
      url: session.url ?? "",
      status:
        session.status === "open"
          ? "open"
          : session.status === "complete"
            ? "complete"
            : "expired",
      customerId:
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? "",
      metadata: (session.metadata as Record<string, string>) ?? {},
      clientReferenceId: session.client_reference_id ?? undefined,
      paymentStatus: session.payment_status,
      subscriptionId:
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id,
      subscription: expandedSubscription,
    };
  }

  async retrieveSubscription(subscriptionId: string): Promise<ProviderSubscription> {
    const stripe = await this.client();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return this.mapSubscription(subscription);
  }

  async listCustomerSubscriptions(customerId: string): Promise<ProviderSubscription[]> {
    const stripe = await this.client();
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });
    return subscriptions.data.map((subscription) => this.mapSubscription(subscription));
  }

  private mapSubscription(subscription: Stripe.Subscription): ProviderSubscription {
    const item = subscription.items.data[0];
    return {
      id: subscription.id,
      customerId:
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id,
      status: subscription.status,
      metadata: subscription.metadata,
      priceId: item?.price.id ?? "",
      currentPeriodStart: item?.current_period_start
        ? new Date(item.current_period_start * 1000)
        : null,
      currentPeriodEnd: item?.current_period_end
        ? new Date(item.current_period_end * 1000)
        : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    };
  }

  async createBillingPortalSession(
    params: CreateBillingPortalSessionParams,
  ): Promise<BillingPortalSession> {
    assertBillingPortalReturnUrl(params.returnUrl, config.BILLING_PORTAL_ALLOWED_ORIGIN);
    const stripe = await this.client();
    if (params.flow === "general" && !config.STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID.trim()) {
      throw new AppError(503, BILLING_PROVIDER_CONFIGURATION_INVALID, "Billing provider configuration is invalid");
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
      ...(params.flow === "general"
        ? { configuration: config.STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID }
        : {}),
      ...(params.flow === "payment_method_update"
        ? { flow_data: { type: "payment_method_update" as const } }
        : {}),
    }, requestOptions(params.operationContext));
    return { url: session.url, expiresAt: null };
  }

  verifyWebhookSignature(body: string, signature: string): boolean {
    try {
      const secret = config.STRIPE_WEBHOOK_SECRET;
      if (!secret) {
        logger.error("STRIPE_WEBHOOK_SECRET is not configured — rejecting webhook");
        return false;
      }
      if (!this.injectedClient && !stripeClient) {
        if (!config.STRIPE_SECRET_KEY) {
          logger.error("STRIPE_SECRET_KEY is not configured — rejecting webhook");
          return false;
        }
        stripeClient = new Stripe(config.STRIPE_SECRET_KEY);
      }
      const verifier = this.injectedClient ?? stripeClient;
      if (!verifier) return false;
      verifier.webhooks.constructEvent(body, signature, secret);
      return true;
    } catch {
      return false;
    }
  }

  parseWebhookEvent(body: Record<string, unknown>): PaymentProviderEvent {
    return {
      id: (body.id as string) ?? "",
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

  async createProduct(params: CreateProductParams): Promise<StripeProduct> {
    const stripe = await this.client();
    const product = await stripe.products.create({
      name: params.name,
      description: params.description,
      metadata: params.metadata ?? {},
    }, requestOptions(params.operationContext));
    return { id: product.id, name: product.name };
  }

  async createPrice(params: CreatePriceParams): Promise<StripePrice> {
    const stripe = await this.client();
    const price = await stripe.prices.create({
      product: params.productId,
      unit_amount: params.unitAmount,
      currency: params.currency,
      recurring: { interval: params.interval },
      metadata: params.metadata ?? {},
    }, requestOptions(params.operationContext));
    return {
      id: price.id,
      productId: (price.product as string) ?? params.productId,
      unitAmount: price.unit_amount ?? params.unitAmount,
      currency: price.currency,
      interval: price.recurring?.interval ?? params.interval,
    };
  }

  async listInvoices(params: InvoiceListParams): Promise<ProviderInvoicePage> {
    const stripe = await this.client();
    const page = await stripe.invoices.list({
      customer: params.customerId,
      limit: Math.min(100, Math.max(1, params.limit)),
      ...(params.cursor ? { starting_after: params.cursor } : {}),
    });
    return {
      invoices: page.data.map((invoice) => {
        assertProviderOwnership(customerId(invoice.customer), params.customerId);
        return this.mapInvoice(invoice);
      }),
      hasMore: page.has_more,
      nextCursor: page.has_more ? page.data.at(-1)?.id ?? null : null,
    };
  }

  async retrieveInvoice(params: InvoiceRetrieveParams): Promise<ProviderInvoice> {
    const stripe = await this.client();
    const invoice = await stripe.invoices.retrieve(params.invoiceId);
    assertProviderOwnership(customerId(invoice.customer), params.expectedCustomerId);
    return this.mapInvoice(invoice);
  }

  async getSecureInvoiceLinks(params: InvoiceRetrieveParams): Promise<ProviderInvoiceLinks> {
    const stripe = await this.client();
    const invoice = await stripe.invoices.retrieve(params.invoiceId);
    assertProviderOwnership(customerId(invoice.customer), params.expectedCustomerId);
    return {
      hostedInvoiceUrl: secureStripeUrl(invoice.hosted_invoice_url),
      invoicePdfUrl: secureStripeUrl(invoice.invoice_pdf),
      receiptUrl: await this.invoiceReceiptUrl(stripe, invoice.id, params.expectedCustomerId),
    };
  }

  async retrieveCurrentSubscriptionState(params: SubscriptionReadParams): Promise<ProviderSubscriptionState> {
    const stripe = await this.client();
    const subscription = await stripe.subscriptions.retrieve(params.subscriptionId);
    const mapped = this.mapSubscription(subscription);
    assertProviderOwnership(mapped.customerId, params.expectedCustomerId);
    return this.state(mapped, subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null);
  }

  async previewSubscriptionChange(params: SubscriptionChangeParams): Promise<ProviderSubscriptionChangePreview> {
    const stripe = await this.client();
    const current = await this.retrieveCurrentSubscriptionState(params);
    const previewApi = stripe.invoices as unknown as {
      createPreview(input: Record<string, unknown>): Promise<Stripe.Invoice>;
    };
    const preview = await previewApi.createPreview({
      customer: current.customerId,
      subscription: current.id,
      subscription_details: {
        items: [{ id: await this.subscriptionItemId(stripe, current.id), price: params.targetPriceReference }],
        proration_behavior: "create_prorations",
      },
    });
    assertProviderOwnership(customerId(preview.customer), params.expectedCustomerId);
    const effectiveAt = new Date();
    return {
      id: preview.id, subscriptionId: current.id, customerId: current.customerId,
      currentPriceReference: current.priceId, targetPriceReference: params.targetPriceReference,
      currency: preview.currency.toUpperCase(), amountDueMinor: preview.amount_due,
      effectiveAt, expiresAt: new Date(effectiveAt.getTime() + 15 * 60_000),
      providerStateObservedAt: current.observedAt,
    };
  }

  async updateSubscription(params: SubscriptionChangeParams): Promise<ProviderSubscriptionMutationResult> {
    const stripe = await this.client();
    const current = await this.retrieveCurrentSubscriptionState(params);
    const updated = await stripe.subscriptions.update(current.id, {
      items: [{ id: await this.subscriptionItemId(stripe, current.id), price: params.targetPriceReference }],
      proration_behavior: "create_prorations",
      metadata: { ...current.metadata, tenantReference: params.operationContext.tenantReference,
        operationReference: params.operationContext.operationReference },
    }, requestOptions(params.operationContext));
    return this.mutationResult(updated, params.operationContext, params.expectedCustomerId);
  }

  async scheduleCancellation(params: CancellationParams): Promise<ProviderCancellationResult> {
    const stripe = await this.client();
    await this.retrieveCurrentSubscriptionState(params);
    const updated = await stripe.subscriptions.update(params.subscriptionId, {
      cancel_at_period_end: true,
    }, requestOptions(params.operationContext));
    const result = this.mutationResult(updated, params.operationContext, params.expectedCustomerId);
    return { ...result, cancellationType: "PERIOD_END", effectiveAt: result.state.currentPeriodEnd ?? new Date() };
  }

  async cancelImmediately(params: CancellationParams): Promise<ProviderCancellationResult> {
    const stripe = await this.client();
    await this.retrieveCurrentSubscriptionState(params);
    const canceled = await stripe.subscriptions.cancel(params.subscriptionId, {}, requestOptions(params.operationContext));
    const result = this.mutationResult(canceled, params.operationContext, params.expectedCustomerId);
    return { ...result, cancellationType: "IMMEDIATE", effectiveAt: new Date() };
  }

  async reactivateSubscription(params: CancellationParams): Promise<ProviderReactivationResult> {
    const stripe = await this.client();
    const current = await this.retrieveCurrentSubscriptionState(params);
    if (current.status === "canceled") throw new Error("Provider subscription cancellation is already effective");
    const updated = await stripe.subscriptions.update(params.subscriptionId, {
      cancel_at_period_end: false,
    }, requestOptions(params.operationContext));
    return this.mutationResult(updated, params.operationContext, params.expectedCustomerId);
  }

  async createRefund(params: RefundCreateParams): Promise<ProviderRefundResult> {
    if (!Number.isSafeInteger(params.amountMinor) || params.amountMinor <= 0) throw new Error("Refund amount must be a positive minor-unit integer");
    const stripe = await this.client();
    const charge = await stripe.charges.retrieve(params.chargeId);
    assertProviderOwnership(customerId(charge.customer), params.expectedCustomerId);
    if (charge.currency.toUpperCase() !== params.currency.toUpperCase()) throw new Error("Refund currency mismatch");
    const refundableMinor = charge.amount - charge.amount_refunded;
    if (params.amountMinor > refundableMinor) throw new Error("Refund amount exceeds the refundable amount");
    const refund = await stripe.refunds.create({
      charge: charge.id, amount: params.amountMinor,
      metadata: { tenantReference: params.operationContext.tenantReference,
        operationReference: params.operationContext.operationReference, reason: params.reason },
    }, requestOptions(params.operationContext));
    return { refund: this.mapRefund(refund, params.expectedCustomerId), idempotentReplay: false };
  }

  async retrieveRefund(params: RefundRetrieveParams): Promise<ProviderRefund> {
    const stripe = await this.client();
    const refund = await stripe.refunds.retrieve(params.refundId);
    const chargeReference = typeof refund.charge === "string" ? refund.charge : refund.charge?.id;
    if (!chargeReference) throw new Error("Refund charge ownership cannot be resolved");
    const charge = await stripe.charges.retrieve(chargeReference);
    assertProviderOwnership(customerId(charge.customer), params.expectedCustomerId);
    return this.mapRefund(refund, params.expectedCustomerId);
  }

  private mapInvoice(invoice: Stripe.Invoice): ProviderInvoice {
    const raw = invoice as unknown as Record<string, unknown>;
    const parent = raw.parent as { subscription_details?: { subscription?: string | { id?: string } } } | undefined;
    const subscription = parent?.subscription_details?.subscription;
    return {
      id: invoice.id, customerId: customerId(invoice.customer),
      subscriptionId: typeof subscription === "string" ? subscription : subscription?.id ?? null,
      number: invoice.number, status: invoice.status ?? "draft", currency: invoice.currency.toUpperCase(),
      amountDueMinor: invoice.amount_due, amountPaidMinor: invoice.amount_paid,
      amountRemainingMinor: invoice.amount_remaining, subtotalMinor: invoice.subtotal,
      taxMinor: invoice.total_taxes?.reduce((sum, tax) => sum + tax.amount, 0) ?? null,
      createdAt: new Date(invoice.created * 1000), dueAt: unixDate(invoice.due_date),
      paidAt: unixDate(invoice.status_transitions?.paid_at), periodStart: unixDate(invoice.period_start),
      periodEnd: unixDate(invoice.period_end), providerVersion: null,
      observedAt: new Date(),
      hostedInvoiceAvailable: Boolean(invoice.hosted_invoice_url),
      invoicePdfAvailable: Boolean(invoice.invoice_pdf),
      receiptAvailable: invoice.status === "paid",
    };
  }

  private async invoiceReceiptUrl(stripe: Stripe, invoiceId: string, expectedCustomerId: string): Promise<string | null> {
    const payments = await stripe.invoicePayments.list({ invoice: invoiceId, status: "paid", limit: 10 });
    for (const payment of payments.data) {
      const chargeReference = payment.payment.charge;
      if (chargeReference) {
        const charge = typeof chargeReference === "string" ? await stripe.charges.retrieve(chargeReference) : chargeReference;
        assertProviderOwnership(customerId(charge.customer), expectedCustomerId);
        const receipt = secureStripeUrl(charge.receipt_url);
        if (receipt) return receipt;
      }
      const intentReference = payment.payment.payment_intent;
      if (!intentReference) continue;
      const intent = typeof intentReference === "string" ? await stripe.paymentIntents.retrieve(intentReference) : intentReference;
      assertProviderOwnership(customerId(intent.customer), expectedCustomerId);
      const latestCharge = intent.latest_charge;
      if (!latestCharge) continue;
      const charge = typeof latestCharge === "string" ? await stripe.charges.retrieve(latestCharge) : latestCharge;
      assertProviderOwnership(customerId(charge.customer), expectedCustomerId);
      const receipt = secureStripeUrl(charge.receipt_url);
      if (receipt) return receipt;
    }
    return null;
  }

  private mapRefund(refund: Stripe.Refund, owner: string): ProviderRefund {
    const chargeId = typeof refund.charge === "string" ? refund.charge : refund.charge?.id ?? "";
    const status = refund.status === "succeeded" || refund.status === "failed" || refund.status === "canceled"
      ? refund.status : "pending";
    return { id: refund.id, chargeId, customerId: owner, amountMinor: refund.amount,
      currency: refund.currency.toUpperCase(), status, reason: refund.metadata?.reason ?? refund.reason ?? null,
      createdAt: new Date(refund.created * 1000) };
  }

  private state(subscription: ProviderSubscription, cancellationEffectiveAt: Date | null): ProviderSubscriptionState {
    return { ...subscription, observedAt: new Date(), cancellationEffectiveAt };
  }

  private mutationResult(subscription: Stripe.Subscription, context: ProviderOperationContext, expectedCustomerId: string): ProviderSubscriptionMutationResult {
    const mapped = this.mapSubscription(subscription);
    assertProviderOwnership(mapped.customerId, expectedCustomerId);
    return { operationReference: context.operationReference,
      state: this.state(mapped, subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null),
      idempotentReplay: false };
  }

  private async subscriptionItemId(stripe: Stripe, subscriptionId: string): Promise<string> {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const id = subscription.items.data[0]?.id;
    if (!id) throw new Error("Provider subscription item is missing");
    return id;
  }
}

function requestOptions(context?: ProviderOperationContext): Stripe.RequestOptions | undefined {
  return context ? { idempotencyKey: context.idempotencyKey } : undefined;
}

function customerId(customer: string | { id: string } | null | undefined): string {
  return typeof customer === "string" ? customer : customer?.id ?? "";
}

function assertProviderOwnership(actual: string, expected: string): void {
  if (!expected || actual !== expected) throw new Error("Provider object ownership mismatch");
}

function unixDate(value: number | null | undefined): Date | null {
  return value ? new Date(value * 1000) : null;
}

function secureStripeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "stripe.com" || url.hostname.endsWith(".stripe.com"))
      ? url.toString() : null;
  } catch { return null; }
}
