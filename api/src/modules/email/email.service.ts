import mongoose from "mongoose";
import crypto from "node:crypto";
import { AppError } from "../../common/errors/AppError.js";
import EmailMessageModel, { type EmailMessageDocument } from "../../db/models/emailMessage.model.js";
import EmailSuppressionModel from "../../db/models/emailSuppression.model.js";
import EmailAttemptModel from "../../db/models/emailAttempt.model.js";
import { getApiJobDispatcher } from "../jobs/jobDispatcher.js";
import { getTemplate, type TemplateIdType } from "./email-templates/templateRegistry.js";
import TenantModel from "../../db/models/tenant.model.js";

function hashString(val: string) {
  return crypto.createHash("sha256").update(val).digest("hex");
}

export interface EnqueueEmailInput {
  tenantId: string;
  recipientEmail: string;
  templateId: TemplateIdType;
  language: "en" | "ar";
  variables: unknown;
  idempotencyKey: string;
  actorId?: string;
  correlationId?: string;
  priority?: number;
  scheduledFor?: Date;
}

export class EmailService {
  async enqueue(input: EnqueueEmailInput) {
    const tenantId = new mongoose.Types.ObjectId(input.tenantId);
    
    // Check suppression list before anything else
    const normalizedEmail = input.recipientEmail.trim().toLowerCase();
    const recipientHash = hashString(normalizedEmail);
    
    const isSuppressed = await EmailSuppressionModel.exists({ emailHash: recipientHash });

    // Handle deduplication using idempotencyKey
    const existing = await EmailMessageModel.findOne({
      tenantId,
      idempotencyKey: input.idempotencyKey,
    });

    if (existing) {
      if (existing.state === "PENDING" && !isSuppressed) {
        await this.dispatchToQueue(existing);
      }
      return { messageId: existing._id.toString(), state: existing.state, idempotencyKey: existing.idempotencyKey };
    }

    // Load tenant for branding
    const tenant = await TenantModel.findById(tenantId).lean() as { settings?: { accentColor?: string; logoUrl?: string } } | null;
    const branding = {
      accentColor: tenant?.settings?.accentColor,
      logoUrl: tenant?.settings?.logoUrl,
    };

    // Render subject for the DB record (the worker renders the full HTML later)
    const preview = getTemplate(input.templateId, input.language, input.variables, branding);

    // Create record
    const message = await EmailMessageModel.create({
      tenantId,
      recipientEmail: normalizedEmail,
      recipientHash,
      templateId: input.templateId,
      templateVersion: "1.0",
      language: input.language,
      variables: input.variables as Record<string, unknown>,
      subject: preview.subject,
      state: isSuppressed ? "SUPPRESSED" : "PENDING",
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId || null,
      priority: input.priority ?? 10,
      scheduledFor: input.scheduledFor || null,
      createdBy: input.actorId ? new mongoose.Types.ObjectId(input.actorId) : null,
    });

    if (!isSuppressed) {
      await this.dispatchToQueue(message);
    }

    return {
      messageId: message._id.toString(),
      state: message.state,
      idempotencyKey: message.idempotencyKey,
    };
  }

  private async dispatchToQueue(message: EmailMessageDocument) {
    const dispatcher = getApiJobDispatcher();
    const result = await dispatcher.enqueue({
      jobType: "email.send",
      tenantId: message.tenantId.toString(),
      actorId: message.createdBy ? message.createdBy.toString() : "system",
      traceId: message.correlationId || crypto.randomUUID(),
      idempotencyKey: message.idempotencyKey,
      priority: message.priority,
      scheduledFor: message.scheduledFor?.toISOString(),
      payload: { messageId: message._id.toString() },
    });

    if (!result.ok) {
      throw new AppError(
        500,
        "EMAIL_SENDING_FAILED",
        `Failed to enqueue email job: ${result.error}`,
      );
    }

    message.state = "QUEUED";
    await message.save();
  }

  async getMessageStatus(messageId: string, tenantId: string) {
    const message = await EmailMessageModel.findOne({
      _id: new mongoose.Types.ObjectId(messageId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    }).lean();

    if (!message) {
      throw new AppError(404, "NOT_FOUND", "Email message not found");
    }

    const attempts = await EmailAttemptModel.find({
      messageId: message._id,
    })
      .sort({ attemptNumber: 1 })
      .lean();

    const serializedMessage = {
      ...message,
      id: message._id.toString(),
      _id: message._id.toString(),
      tenantId: message.tenantId.toString(),
      createdBy: message.createdBy?.toString() || null,
    };

    const serializedAttempts = attempts.map(a => ({
      ...a,
      id: a._id.toString(),
      _id: a._id.toString(),
      messageId: a.messageId.toString(),
    }));

    return { message: serializedMessage, attempts: serializedAttempts };
  }

  async listMessages(
    tenantId: string,
    filters: { state?: string; recipientEmail?: string; templateId?: string },
    pagination: { page: number; limit: number },
  ) {
    const query: Record<string, unknown> = {
      tenantId: new mongoose.Types.ObjectId(tenantId),
    };

    if (filters.state) query.state = filters.state;
    if (filters.recipientEmail) {
      query.recipientEmail = filters.recipientEmail.trim().toLowerCase();
    }
    if (filters.templateId) query.templateId = filters.templateId;

    const skip = (pagination.page - 1) * pagination.limit;

    const [messages, total] = await Promise.all([
      EmailMessageModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pagination.limit)
        .lean(),
      EmailMessageModel.countDocuments(query),
    ]);

    const serializedMessages = messages.map((m) => ({
      ...m,
      id: m._id.toString(),
      _id: m._id.toString(),
      tenantId: m.tenantId.toString(),
      createdBy: m.createdBy?.toString() || null,
    }));

    return {
      data: serializedMessages,
      meta: {
        total,
        page: pagination.page,
        limit: pagination.limit,
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async resendMessage(messageId: string, tenantId: string, actorId?: string) {
    const message = await EmailMessageModel.findOne({
      _id: new mongoose.Types.ObjectId(messageId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    });

    if (!message) throw new AppError(404, "NOT_FOUND", "Email message not found");

    if (message.state !== "TEMPORARY_FAILURE" && message.state !== "PERMANENT_FAILURE" && message.state !== "CANCELLED") {
      throw new AppError(400, "INVALID_INPUT", "Only failed or cancelled messages can be resent");
    }

    // Determine new idempotency key so it bypasses dedup and creates a new queue job
    const newIdempotencyKey = `${message.idempotencyKey}-resend-${Date.now()}`;
    
    // We update the existing message record but send it back to the queue
    message.state = "PENDING";
    message.idempotencyKey = newIdempotencyKey;
    message.errorCategory = null;
    message.errorMessage = null;
    message.attemptCount = 0; // Reset attempts for a full fresh retry
    await message.save();

    await this.dispatchToQueue(message);
    
    return { success: true, state: "QUEUED" };
  }

  async cancelMessage(messageId: string, tenantId: string) {
    const message = await EmailMessageModel.findOne({
      _id: new mongoose.Types.ObjectId(messageId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    });

    if (!message) throw new AppError(404, "NOT_FOUND", "Email message not found");

    if (message.state !== "PENDING" && message.state !== "QUEUED") {
      throw new AppError(400, "INVALID_INPUT", "Only pending or queued messages can be cancelled");
    }

    message.state = "CANCELLED";
    await message.save();

    // The worker job will still pull it from the queue, but it will see the state is CANCELLED and short-circuit
    return { success: true };
  }
}

export const emailService = new EmailService();
