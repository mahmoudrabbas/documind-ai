import mongoose, { Schema } from "mongoose";

export interface CitationDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  messageId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  claimId: string;
  claimText: string;
  verificationStatus: "supported" | "partially_supported" | "unsupported";
  chunkId: string;
  documentId: mongoose.Types.ObjectId;
  documentVersionId: mongoose.Types.ObjectId;
  pageNumber: number | null;
  sectionTitle: string | null;
  traceId: string;
  createdAt: Date;
  updatedAt: Date;
}

const citationSchema = new Schema<CitationDocument>(
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
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    claimId: {
      type: String,
      required: true,
      maxlength: 40,
    },
    claimText: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    verificationStatus: {
      type: String,
      enum: ["supported", "partially_supported", "unsupported"],
      required: true,
    },
    chunkId: {
      type: String,
      required: true,
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    documentVersionId: {
      type: Schema.Types.ObjectId,
      ref: "DocumentVersion",
      required: true,
    },
    pageNumber: {
      type: Number,
      default: null,
    },
    sectionTitle: {
      type: String,
      default: null,
      maxlength: 200,
    },
    traceId: {
      type: String,
      required: true,
      maxlength: 128,
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

citationSchema.index({ tenantId: 1, messageId: 1 });
citationSchema.index({ tenantId: 1, conversationId: 1, claimId: 1 });
citationSchema.index({ tenantId: 1, documentId: 1 });

const CitationModel = mongoose.model<CitationDocument>(
  "Citation",
  citationSchema,
);

export default CitationModel;
