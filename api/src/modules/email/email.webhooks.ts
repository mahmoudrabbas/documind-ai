import { Router } from "express";
import EmailMessageModel from "../../db/models/emailMessage.model.js";
import EmailSuppressionModel from "../../db/models/emailSuppression.model.js";

const router = Router();

export type WebhookEventType = "delivered" | "bounced" | "complaint";

export interface NormalizedWebhookEvent {
  providerMessageId: string;
  eventType: WebhookEventType;
  reason?: string;
  timestamp: string;
  recipientEmail: string;
}

export async function handleNormalizedWebhook(event: NormalizedWebhookEvent) {
  const message = await EmailMessageModel.findOne({ providerMessageId: event.providerMessageId });
  if (!message) {
    return; // Ignore events for unknown messages
  }

  const timestamp = event.timestamp ? new Date(event.timestamp) : new Date();

  if (event.eventType === "delivered") {
    message.state = "DELIVERED";
    message.deliveredAt = timestamp;
    await message.save();
  } else if (event.eventType === "bounced") {
    message.state = "PERMANENT_FAILURE";
    message.failedAt = timestamp;
    message.errorCategory = "bounced";
    message.errorMessage = event.reason || "Bounced";
    await message.save();

    await EmailSuppressionModel.updateOne(
      { emailHash: message.recipientHash },
      { $setOnInsert: { reason: "hard_bounce", source: "webhook", createdAt: new Date() } },
      { upsert: true }
    );
  } else if (event.eventType === "complaint") {
    await EmailSuppressionModel.updateOne(
      { emailHash: message.recipientHash },
      { $setOnInsert: { reason: "complaint", source: "webhook", createdAt: new Date() } },
      { upsert: true }
    );
  }
}

// Generic webhook handler for providers (e.g. SendGrid, SES)
router.post("/provider-webhook", async (req, res) => {
  // TODO: Implement signature checking for the specific provider
  // const signature = req.headers['x-provider-signature'];
  // verifySignature(signature, req.body);
  
  const event = req.body as NormalizedWebhookEvent;
  await handleNormalizedWebhook(event);
  
  res.status(200).send("OK");
});

export default router;
