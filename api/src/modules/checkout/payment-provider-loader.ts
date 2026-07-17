import type { PaymentProvider } from "../billing/ports/payment-provider.port.js";
import { config } from "../../config/index.js";
import { logger } from "../../common/logger/logger.js";

let provider: PaymentProvider | null = null;

export async function getPaymentProvider(): Promise<PaymentProvider> {
  if (provider) return provider;

  if (config.PAYMENT_PROVIDER === "stripe") {
    const { StripePaymentProvider } = await import(
      "../billing/ports/adapters/stripe-payment-provider.js"
    );
    provider = new StripePaymentProvider() as PaymentProvider;
    logger.info("Payment provider: Stripe (production)");
  } else {
    const { FakePaymentProvider } = await import(
      "../billing/ports/fakes/fake-payment-provider.js"
    );
    provider = new FakePaymentProvider() as unknown as PaymentProvider;
    logger.info("Payment provider: Fake (development/test)");
  }

  return provider as PaymentProvider;
}

export function setPaymentProvider(p: PaymentProvider): void {
  provider = p;
}

export function resetPaymentProvider(): void {
  provider = null;
}
