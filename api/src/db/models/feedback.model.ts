import mongoose, { Schema } from "mongoose";

export type FeedbackRating = "thumbs_up" | "thumbs_down";
export type FeedbackCategory = "inaccurate" | "incomplete" | "irrelevant" | "harmful" | "other";

export interface FeedbackDocument extends mongoose.Document {
  id: string;
  tenantId: mongoose.Types.ObjectId;
  messageId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  rating: FeedbackRating;
  category?: FeedbackCategory | null;
  comment?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const feedbackSchema = new Schema<FeedbackDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    messageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      required: true,
      index: true,
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    rating: {
      type: String,
      enum: ["thumbs_up", "thumbs_down"],
      required: true,
    },
    category: {
      type: String,
      enum: ["inaccurate", "incomplete", "irrelevant", "harmful", "other"],
      default: null,
    },
    comment: {
      type: String,
      maxlength: 500,
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

feedbackSchema.index({ tenantId: 1, messageId: 1, userId: 1 }, { unique: true });
feedbackSchema.index({ tenantId: 1, rating: 1, createdAt: -1 });
feedbackSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });

const FeedbackModel = mongoose.model<FeedbackDocument>("Feedback", feedbackSchema);
export default FeedbackModel;
