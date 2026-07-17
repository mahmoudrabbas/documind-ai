import { z } from "zod";
import { ObjectId } from "mongodb";
import { JobHandlerDefinition, JobHandlerResult, JobHandlerContext } from "../contracts/jobDispatcher.js";
import { RetryableJobError, PermanentJobError } from "../contracts/retryPolicy.js";
import { getTemplate } from "../email-templates/templateRegistry.js";
import type { EmailDispatchPort } from "../providers/emailDispatchPort.js";
import { getMongoClient } from "../db/mongo.js";

const PayloadSchema = z.object({
  messageId: z.string(),
});

type EmailSendPayload = z.infer<typeof PayloadSchema>;

export function createEmailSendJobHandler(dispatchPort: EmailDispatchPort): JobHandlerDefinition<EmailSendPayload> {
  return {
    jobType: "email.send",
    description: "Renders and dispatches a tenant-branded email via the configured provider.",
    payloadSchema: PayloadSchema,
    maxAttempts: 5,
    handle: async (payload, ctx): Promise<JobHandlerResult | void> => {
      const db = getMongoClient()?.db();
      if (!db) throw new RetryableJobError("Database not connected");

      const messageId = new ObjectId(payload.messageId);

      // 1. Load the email message
      const message = await db.collection("emailmessages").findOne({ _id: messageId });
      if (!message) {
        ctx.progress("EmailMessage not found, discarding job");
        return { summary: { discarded: true, reason: "not_found" } };
      }

      // 2. Validate state
      if (message.state === "CANCELLED" || message.state === "SENT" || message.state === "DELIVERED") {
        ctx.progress("EmailMessage is already in a terminal state, discarding job", { state: message.state });
        return { summary: { discarded: true, reason: `state_${message.state}` } };
      }
      
      if (message.state === "SUPPRESSED") {
        ctx.progress("EmailMessage is suppressed, discarding job");
        return { summary: { discarded: true, reason: "suppressed" } };
      }

      // Re-check suppression list
      const isSuppressed = await db.collection("emailsuppressions").findOne({ emailHash: message.recipientHash });
      if (isSuppressed) {
        await db.collection("emailmessages").updateOne(
          { _id: messageId },
          { $set: { state: "SUPPRESSED" } }
        );
        ctx.progress("Recipient was suppressed while job was queued");
        return { summary: { discarded: true, reason: "suppressed_late" } };
      }

      // Transition to PROCESSING
      const attemptCount = (message.attemptCount || 0) + 1;
      await db.collection("emailmessages").updateOne(
        { _id: messageId },
        { 
          $set: { state: "PROCESSING", lastAttemptAt: new Date() },
          $inc: { attemptCount: 1 } 
        }
      );

      // Create EmailAttempt
      const attemptId = new ObjectId();
      await db.collection("emailattempts").insertOne({
        _id: attemptId,
        messageId: message._id,
        attemptNumber: attemptCount,
        state: "PROCESSING",
        startedAt: new Date(),
      });

      try {
        // Render full HTML
        const tenant = await db.collection("tenants").findOne({ _id: message.tenantId });
        const branding = {
          accentColor: tenant?.settings?.accentColor,
          logoUrl: tenant?.settings?.logoUrl,
        };

        const template = getTemplate(
          message.templateId,
          message.language,
          message.variables,
          branding
        );

        // Send via port
        ctx.progress("Dispatching email via port");
        const dispatchStartTime = Date.now();
        
        const result = await dispatchPort.send({
          to: message.recipientEmail,
          subject: template.subject,
          text: template.text,
          html: template.html,
          messageId: message._id.toString(),
          idempotencyKey: message.idempotencyKey,
        });

        const durationMs = Date.now() - dispatchStartTime;

        // Update Attempt
        await db.collection("emailattempts").updateOne(
          { _id: attemptId },
          {
            $set: {
              state: result.state,
              providerMessageId: result.providerMessageId,
              errorCategory: result.errorCategory || null,
              errorMessage: result.errorMessage || null,
              completedAt: new Date(),
              durationMs,
            }
          }
        );

        if (result.state === "SENT") {
          await db.collection("emailmessages").updateOne(
            { _id: messageId },
            {
              $set: {
                providerMessageId: result.providerMessageId,
                state: "SENT",
                sentAt: new Date(),
                errorCategory: null,
                errorMessage: null,
              }
            }
          );
          ctx.progress("Email sent successfully");
          return { summary: { sent: true, providerMessageId: result.providerMessageId } };
        } 
        
        if (result.state === "PERMANENT_FAILURE") {
          await db.collection("emailmessages").updateOne(
            { _id: messageId },
            {
              $set: {
                providerMessageId: result.providerMessageId,
                state: "PERMANENT_FAILURE",
                failedAt: new Date(),
                errorCategory: result.errorCategory || null,
                errorMessage: result.errorMessage || null,
              }
            }
          );
          
          if (result.errorCategory === "rejected") {
            // Hard bounce / Rejected -> add to suppression list
            await db.collection("emailsuppressions").updateOne(
              { emailHash: message.recipientHash },
              { $setOnInsert: { reason: "hard_bounce", source: "system", createdAt: new Date() } },
              { upsert: true }
            );
          }

          throw new PermanentJobError(`Permanent failure: ${result.errorCategory} - ${result.errorMessage}`);
        }

        if (result.state === "TEMPORARY_FAILURE") {
          await db.collection("emailmessages").updateOne(
            { _id: messageId },
            {
              $set: {
                providerMessageId: result.providerMessageId,
                state: "TEMPORARY_FAILURE",
                errorCategory: result.errorCategory || null,
                errorMessage: result.errorMessage || null,
              }
            }
          );
          throw new RetryableJobError(`Temporary failure: ${result.errorCategory} - ${result.errorMessage}`);
        }

        // Unknown state from the dispatch port — treat as retryable so the message
        // doesn't get permanently stuck in PROCESSING.
        throw new RetryableJobError(`Unexpected dispatch result state: ${result.state}`);

      } catch (err: unknown) {
        if (err instanceof RetryableJobError || err instanceof PermanentJobError) {
          throw err;
        }

        const errorMsg = err instanceof Error ? err.message : String(err);
        await db.collection("emailattempts").updateOne(
          { _id: attemptId },
          {
            $set: {
              state: "TEMPORARY_FAILURE",
              errorCategory: "internal_error",
              errorMessage: errorMsg.substring(0, 500),
              completedAt: new Date(),
            }
          }
        );

        await db.collection("emailmessages").updateOne(
          { _id: messageId },
          {
            $set: {
              state: "TEMPORARY_FAILURE",
              errorCategory: "internal_error",
              errorMessage: errorMsg.substring(0, 500),
            }
          }
        );

        throw new RetryableJobError(`Internal error: ${errorMsg}`);
      }
    },
  };
}
