import mongoose, { Schema } from "mongoose";

export type MessageRole = "user" | "assistant";

export interface MessageSource {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  sectionTitle?: string;
  pageNumber?: number;
  score: number;
}

export interface MessageDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  role: MessageRole;
  content: string;
  sources: MessageSource[];
  sequenceNumber: number;
  createdAt: Date;
  updatedAt: Date;
}

const messageSourceSchema = new Schema<MessageSource>(
  {
    chunkId: { type: String, required: true },
    documentId: { type: String, required: true },
    documentTitle: { type: String, required: true },
    sectionTitle: { type: String },
    pageNumber: { type: Number },
    score: { type: Number, required: true },
  },
  { _id: false },
);

const messageSchema = new Schema<MessageDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    sources: {
      type: [messageSourceSchema],
      default: [],
    },
    sequenceNumber: {
      type: Number,
      required: true,
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

messageSchema.index({ tenantId: 1, conversationId: 1, sequenceNumber: 1 });

const MessageModel = mongoose.model<MessageDocument>(
  "Message",
  messageSchema,
);

export default MessageModel;
