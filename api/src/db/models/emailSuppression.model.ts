import mongoose, { Schema } from "mongoose";

export interface EmailSuppressionDocument extends mongoose.Document {
  emailHash: string;
  reason: "hard_bounce" | "complaint" | "manual";
  source: "webhook" | "admin" | "system";
  createdAt: Date;
}

const emailSuppressionSchema = new Schema<EmailSuppressionDocument>(
  {
    emailHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    reason: {
      type: String,
      enum: ["hard_bounce", "complaint", "manual"],
      required: true,
    },
    source: {
      type: String,
      enum: ["webhook", "admin", "system"],
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
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

const EmailSuppressionModel = mongoose.model<EmailSuppressionDocument>(
  "EmailSuppression",
  emailSuppressionSchema,
);

export default EmailSuppressionModel;
