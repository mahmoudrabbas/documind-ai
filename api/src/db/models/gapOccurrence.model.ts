import mongoose, { Schema } from "mongoose";

export type GapCandidateOutcome = "refused" | "weak" | "conflict" | "negative_feedback";

export interface GapOccurrenceDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  gapId: mongoose.Types.ObjectId;
  question: string;
  normalizedIntent?: string | null;
  outcome: GapCandidateOutcome;
  category?: string | null;
  confidence: number;
  evidenceSummaryIds?: string[];
  conversationId?: mongoose.Types.ObjectId | null;
  messageId?: mongoose.Types.ObjectId | null;
  actorId?: mongoose.Types.ObjectId | null;
  actorDepartment?: string | null;
  traceId?: string | null;
  createdAt: Date;
}

const gapOccurrenceSchema = new Schema<GapOccurrenceDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    gapId: {
      type: Schema.Types.ObjectId,
      ref: "KnowledgeGap",
      required: true,
      index: true,
    },
    question: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    normalizedIntent: {
      type: String,
      default: null,
      maxlength: 500,
    },
    outcome: {
      type: String,
      enum: ["refused", "weak", "conflict", "negative_feedback"],
      required: true,
    },
    category: {
      type: String,
      default: null,
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    evidenceSummaryIds: {
      type: [String],
      default: [],
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
    },
    messageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    actorDepartment: {
      type: String,
      default: null,
    },
    traceId: {
      type: String,
      default: null,
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

gapOccurrenceSchema.index({ tenantId: 1, gapId: 1, createdAt: -1 });
gapOccurrenceSchema.index({ tenantId: 1, createdAt: -1 });

const GapOccurrenceModel = mongoose.model<GapOccurrenceDocument>("GapOccurrence", gapOccurrenceSchema);
export default GapOccurrenceModel;
