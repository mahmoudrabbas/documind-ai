import type { Request, Response } from "express";
import { logger } from "../../common/logger/logger.js";
import { getPaymentProvider } from "../checkout/payment-provider-loader.js";
import { handlePaymentEvent } from "./payment-webhooks.service.js";
import { BILLING_WEBHOOK_SIGNATURE_INVALID } from "../../common/errors/errorCodes.js";

export async function webhookHandlerController(
  req: Request,
  res: Response,
): Promise<void> {
  const signature =
    (req.headers["stripe-signature"] as string) ?? "";

  const rawBodyBuffer = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body));
  const rawBody = rawBodyBuffer.toString("utf8");

  const provider = await getPaymentProvider();

  if (!provider.verifyWebhookSignature(rawBody, signature)) {
    logger.warn("Invalid webhook signature");
    res.status(400).json({ error: BILLING_WEBHOOK_SIGNATURE_INVALID });
    return;
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    logger.warn("Failed to parse webhook body as JSON");
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  try {
    const event = provider.parseWebhookEvent(payload);
    await handlePaymentEvent(event, rawBody, signature, undefined, provider);
    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ err: error }, "Failed to process webhook event");
    res.status(200).json({ received: true });
  }
}
