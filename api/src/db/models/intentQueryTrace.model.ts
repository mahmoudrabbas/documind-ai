import mongoose, { Schema } from "mongoose";

export interface IntentQueryTraceDocument extends mongoose.Document {
  traceId: string;
  tenantId: mongoose.Types.ObjectId;
  queryPlan: Record<string, unknown>;
  timing: Record<string, unknown>;
  promptVersion: string;
  modelVersion: string;
  rawEntities: Array<unknown>;
  fallbackUsed: boolean;
  createdAt: Date;
}

const intentQueryTraceSchema = new Schema<IntentQueryTraceDocument>(
  {
    traceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    queryPlan: {
      type: Schema.Types.Mixed,
      required: true,
    },
    timing: {
      type: Schema.Types.Mixed,
      required: true,
    },
    promptVersion: {
      type: String,
      required: true,
    },
    modelVersion: {
      type: String,
      required: true,
    },
    rawEntities: {
      type: [Schema.Types.Mixed],
      required: true,
    },
    fallbackUsed: {
      type: Boolean,
      required: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: "7d", // Automatically expire documents after 7 days
    },
  },
  {
    timestamps: false,
    toJSON: {
      transform(_doc, ret) {
        const record = ret as Record<string, unknown> & {
          _id?: unknown;
          __v?: number;
        };
        record.id = record._id?.toString?.() ?? "";
        delete record._id;
        delete record.__v;
        return record;
      },
    },
  }
);

const IntentQueryTraceModel = mongoose.model<IntentQueryTraceDocument>(
  "IntentQueryTrace",
  intentQueryTraceSchema
);

export default IntentQueryTraceModel;
