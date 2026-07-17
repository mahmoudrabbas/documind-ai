import mongoose, { Schema } from "mongoose";
import AgentRunModel from "./agentRun.model.js";
import AgentStepModel from "./agentStep.model.js";

export interface AgentToolCallDocument extends mongoose.Document {
  runId: mongoose.Types.ObjectId;
  stepId: mongoose.Types.ObjectId | null;
  tenantId: mongoose.Types.ObjectId;
  toolName: string;
  toolVersion: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  status:
    | "running"
    | "completed"
    | "failed"
    | "unauthorized"
    | "timeout"
    | "cancelled";
  error: Record<string, unknown> | null;
  latencyMs: number | null;
  tokensUsed: number | null;
  estimatedCost: number | null;
  approvalRequired: boolean;
  approvalId: mongoose.Types.ObjectId | null;
  traceId: string;
  requestId: string;
  createdAt: Date;
}

const agentToolCallSchema = new Schema<AgentToolCallDocument>(
  {
    runId: {
      type: Schema.Types.ObjectId,
      ref: "AgentRun",
      required: true,
      index: true,
    },
    stepId: {
      type: Schema.Types.ObjectId,
      ref: "AgentStep",
      default: null,
      index: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    toolName: { type: String, required: true, trim: true, maxlength: 120 },
    toolVersion: { type: String, required: true, trim: true, maxlength: 40 },
    input: { type: Schema.Types.Mixed, required: true, default: {} },
    output: { type: Schema.Types.Mixed, default: null },
    status: {
      type: String,
      enum: [
        "running",
        "completed",
        "failed",
        "unauthorized",
        "timeout",
        "cancelled",
      ],
      default: "running",
      required: true,
      index: true,
    },
    error: { type: Schema.Types.Mixed, default: null },
    latencyMs: { type: Number, default: null, min: 0 },
    tokensUsed: { type: Number, default: null, min: 0 },
    estimatedCost: { type: Schema.Types.Decimal128, default: null },
    approvalRequired: { type: Boolean, default: false },
    approvalId: { type: Schema.Types.ObjectId, default: null },
    traceId: { type: String, required: true },
    requestId: { type: String, required: true },
  },
  {
    timestamps: true,
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
  },
);

agentToolCallSchema.index({ tenantId: 1, createdAt: -1 });
agentToolCallSchema.index({ runId: 1, createdAt: 1 });
agentToolCallSchema.index({ approvalId: 1 });
agentToolCallSchema.index({ traceId: 1 });

const AgentToolCallModel = mongoose.model<AgentToolCallDocument>(
  "AgentToolCall",
  agentToolCallSchema,
);

export default AgentToolCallModel;
