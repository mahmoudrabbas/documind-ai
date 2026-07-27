import mongoose, { Schema } from "mongoose";

export interface ConversationDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
  lastMessageAt: Date;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<ConversationDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    messageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        const r = ret as Record<string, unknown>;
        r.id = (r._id as mongoose.Types.ObjectId).toString();
        delete r._id;
        delete r.__v;
        delete r.tenantId;
        return r;
      },
    },
  },
);

conversationSchema.index({ tenantId: 1, userId: 1, lastMessageAt: -1 });

const ConversationModel = mongoose.model<ConversationDocument>(
  "Conversation",
  conversationSchema,
);

export default ConversationModel;
