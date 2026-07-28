import mongoose, { Schema } from "mongoose";

export type ReevaluationResultOutcome = "improved" | "not_improved" | "error";

export interface GapReevaluationDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  gapId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  result: ReevaluationResultOutcome;
  evidenceBefore?: Record<string, unknown> | null;
  evidenceAfter?: Record<string, unknown> | null;
  notes?: string | null;
  evaluatedBy: mongoose.Types.ObjectId | "system";
  createdAt: Date;
}

const gapReevaluationSchema = new Schema<GapReevaluationDocument>(
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
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true,
    },
    result: {
      type: String,
      enum: ["improved", "not_improved", "error"],
      required: true,
    },
    evidenceBefore: {
      type: Schema.Types.Mixed,
      default: null,
    },
    evidenceAfter: {
      type: Schema.Types.Mixed,
      default: null,
    },
    notes: {
      type: String,
      default: null,
      maxlength: 1000,
    },
    evaluatedBy: {
      type: Schema.Types.Mixed,
      required: true,
      default: "system",
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

gapReevaluationSchema.index({ tenantId: 1, gapId: 1, createdAt: -1 });
gapReevaluationSchema.index({ tenantId: 1, documentId: 1 });

const GapReevaluationModel = mongoose.model<GapReevaluationDocument>(
  "GapReevaluation",
  gapReevaluationSchema,
);
export default GapReevaluationModel;
