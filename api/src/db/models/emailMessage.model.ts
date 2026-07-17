import mongoose, { Schema } from "mongoose";

export interface EmailMessageDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  recipientEmail: string;
  recipientHash: string;
  templateId: "email_verification" | "password_reset" | "user_invitation" | "invitation_reminder";
  templateVersion: string;
  language: "en" | "ar";
  variables: Record<string, unknown>;
  subject: string;
  state:
    | "PENDING"
    | "QUEUED"
    | "PROCESSING"
    | "SENT"
    | "DELIVERED"
    | "TEMPORARY_FAILURE"
    | "PERMANENT_FAILURE"
    | "BOUNCED"
    | "REJECTED"
    | "CANCELLED"
    | "SUPPRESSED";
  idempotencyKey: string;
  correlationId: string | null;
  providerMessageId: string | null;
  priority: number;
  scheduledFor: Date | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
  lastAttemptAt: Date | null;
  attemptCount: number;
  maxAttempts: number;
  errorCategory: string | null;
  errorMessage: string | null;
  createdBy: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const emailMessageSchema = new Schema<EmailMessageDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    recipientEmail: {
      type: String,
      required: true,
    },
    recipientHash: {
      type: String,
      required: true,
    },
    templateId: {
      type: String,
      enum: [
        "email_verification",
        "password_reset",
        "user_invitation",
        "invitation_reminder",
      ],
      required: true,
    },
    templateVersion: {
      type: String,
      required: true,
    },
    language: {
      type: String,
      enum: ["en", "ar"],
      required: true,
    },
    variables: {
      type: Schema.Types.Mixed,
      required: true,
    },
    subject: {
      type: String,
      required: true,
    },
    state: {
      type: String,
      enum: [
        "PENDING",
        "QUEUED",
        "PROCESSING",
        "SENT",
        "DELIVERED",
        "TEMPORARY_FAILURE",
        "PERMANENT_FAILURE",
        "BOUNCED",
        "REJECTED",
        "CANCELLED",
        "SUPPRESSED",
      ],
      default: "PENDING",
    },
    idempotencyKey: {
      type: String,
      required: true,
    },
    correlationId: {
      type: String,
      default: null,
    },
    providerMessageId: {
      type: String,
      default: null,
      sparse: true,
    },
    priority: {
      type: Number,
      default: 10,
    },
    scheduledFor: {
      type: Date,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    failedAt: {
      type: Date,
      default: null,
    },
    lastAttemptAt: {
      type: Date,
      default: null,
    },
    attemptCount: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 5,
    },
    errorCategory: {
      type: String,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        const record = ret as Record<string, unknown> & { _id?: unknown; __v?: number };
        record.id = record._id?.toString?.() ?? "";
        delete record._id;
        delete record.__v;
        return record;
      },
    },
  },
);

emailMessageSchema.index({ idempotencyKey: 1, tenantId: 1 }, { unique: true });
emailMessageSchema.index({ tenantId: 1, state: 1 });
emailMessageSchema.index({ tenantId: 1, recipientEmail: 1 });
emailMessageSchema.index({ state: 1, scheduledFor: 1 });

const EmailMessageModel = mongoose.model<EmailMessageDocument>(
  "EmailMessage",
  emailMessageSchema,
);

export default EmailMessageModel;
