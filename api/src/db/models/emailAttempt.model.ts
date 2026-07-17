import mongoose, { Schema } from "mongoose";

export interface EmailAttemptDocument extends mongoose.Document {
  messageId: mongoose.Types.ObjectId;
  attemptNumber: number;
  state: "PROCESSING" | "SENT" | "TEMPORARY_FAILURE" | "PERMANENT_FAILURE";
  providerMessageId: string | null;
  errorCategory: string | null;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
}

const emailAttemptSchema = new Schema<EmailAttemptDocument>(
  {
    messageId: {
      type: Schema.Types.ObjectId,
      ref: "EmailMessage",
      required: true,
      index: true,
    },
    attemptNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    state: {
      type: String,
      enum: ["PROCESSING", "SENT", "TEMPORARY_FAILURE", "PERMANENT_FAILURE"],
      required: true,
    },
    providerMessageId: {
      type: String,
      default: null,
    },
    errorCategory: {
      type: String,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    startedAt: {
      type: Date,
      required: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    durationMs: {
      type: Number,
      default: null,
    },
  },
  {
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

emailAttemptSchema.index({ messageId: 1, attemptNumber: 1 }, { unique: true });

const EmailAttemptModel = mongoose.model<EmailAttemptDocument>(
  "EmailAttempt",
  emailAttemptSchema,
);

export default EmailAttemptModel;
