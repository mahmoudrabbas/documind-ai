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
} from "../payment-provider.port.js";
import { config } from "../../../../config/index.js";
import { logger } from "../../../../common/logger/logger.js";

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
  async createCustomer(params: CreateCustomerParams): Promise<string> {
    const stripe = await getClient();
    const customer = await stripe.customers.create({
      email: params.email,
      name: params.name,
      metadata: { tenantId: params.tenantId },
    });
    return customer.id;
  }

  async createCheckoutSession(
    params: CreateCheckoutSessionParams,
  ): Promise<CheckoutSession> {
    const stripe = await getClient();
    const session = await stripe.checkout.sessions.create({
      customer: params.customerId,
      mode: "subscription",
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata,
    });

    return {
      id: session.id,
      url: session.url ?? "",
      status: session.status === "open" ? "open" : "complete",
      customerId: (session.customer as string) ?? params.customerId,
      metadata: (session.metadata as Record<string, string>) ?? {},
    };
  }

  async retrieveCheckoutSession(
    sessionId: string,
  ): Promise<CheckoutSession> {
    const stripe = await getClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return {
      id: session.id,
      url: session.url ?? "",
      status:
        session.status === "open"
          ? "open"
          : session.status === "complete"
            ? "complete"
            : "expired",
      customerId: (session.customer as string) ?? "",
      metadata: (session.metadata as Record<string, string>) ?? {},
    };
  }

  async createBillingPortalSession(
    params: CreateBillingPortalSessionParams,
  ): Promise<BillingPortalSession> {
    const stripe = await getClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
    });
    return { url: session.url };
  }

  verifyWebhookSignature(body: string, signature: string): boolean {
    try {
      const secret = config.STRIPE_WEBHOOK_SECRET;
      if (!secret) {
        if (config.NODE_ENV === "production") {
          logger.error(
            "STRIPE_WEBHOOK_SECRET not set in production — rejecting webhook",
          );
          return false;
        }
        logger.warn(
          "STRIPE_WEBHOOK_SECRET not set — skipping signature verification (non-production)",
        );
        return true;
      }
      if (!stripeClient) {
        const secretKey = config.STRIPE_SECRET_KEY;
        if (!secretKey) {
          logger.error("STRIPE_SECRET_KEY not configured for webhook verification");
          return false;
        }
        stripeClient = new Stripe(secretKey);
      }
      stripeClient.webhooks.constructEvent(body, signature, secret);
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
    const stripe = await getClient();
    const product = await stripe.products.create({
      name: params.name,
      description: params.description,
      metadata: params.metadata ?? {},
    });
    return { id: product.id, name: product.name };
  }

  async createPrice(params: CreatePriceParams): Promise<StripePrice> {
    const stripe = await getClient();
    const price = await stripe.prices.create({
      product: params.productId,
      unit_amount: params.unitAmount,
      currency: params.currency,
      recurring: { interval: params.interval },
      metadata: params.metadata ?? {},
    });
    return {
      id: price.id,
      productId: (price.product as string) ?? params.productId,
      unitAmount: price.unit_amount ?? params.unitAmount,
      currency: price.currency,
      interval: price.recurring?.interval ?? params.interval,
    };
  }
}
