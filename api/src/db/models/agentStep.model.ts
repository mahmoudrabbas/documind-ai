import mongoose, { Schema } from "mongoose";
import AgentRunModel from "./agentRun.model.js";

export interface AgentStepDocument extends mongoose.Document {
  runId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  stepIndex: number;
  agentName: string;
  action:
    | "plan"
    | "tool_call"
    | "handoff"
    | "guardrail"
    | "approval_requested"
    | "approval_resolved"
    | "completed"
    | "failed"
    | "cancelled";
  status: "running" | "completed" | "failed" | "skipped";
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  modelProvider: string | null;
  modelName: string | null;
  promptVersion: string | null;
  tokensUsed: number | null;
  estimatedCost: number | null;
  latencyMs: number | null;
  error: Record<string, unknown> | null;
  toolCallsCount: number;
  approvalsCount: number;
  handoffToAgent: string | null;
  previousAgent: string | null;
  traceId: string;
  requestId: string;
  createdAt: Date;
}

const agentStepSchema = new Schema<AgentStepDocument>(
  {
    runId: {
      type: Schema.Types.ObjectId,
      ref: "AgentRun",
      required: true,
      index: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    stepIndex: { type: Number, required: true, min: 0 },
    agentName: { type: String, required: true, trim: true, maxlength: 120 },
    action: {
      type: String,
      enum: [
        "plan",
        "tool_call",
        "handoff",
        "guardrail",
        "approval_requested",
        "approval_resolved",
        "completed",
        "failed",
        "cancelled",
      ],
      required: true,
    },
    status: {
      type: String,
      enum: ["running", "completed", "failed", "skipped"],
      default: "running",
      required: true,
    },
    input: { type: Schema.Types.Mixed, required: true, default: {} },
    output: { type: Schema.Types.Mixed, default: null },
    modelProvider: { type: String, default: null },
    modelName: { type: String, default: null },
    promptVersion: { type: String, default: null },
    tokensUsed: { type: Number, default: null, min: 0 },
    estimatedCost: { type: Schema.Types.Decimal128, default: null },
    latencyMs: { type: Number, default: null, min: 0 },
    error: { type: Schema.Types.Mixed, default: null },
    toolCallsCount: { type: Number, default: 0, min: 0 },
    approvalsCount: { type: Number, default: 0, min: 0 },
    handoffToAgent: { type: String, default: null, trim: true, maxlength: 120 },
    previousAgent: { type: String, default: null, trim: true, maxlength: 120 },
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

agentStepSchema.index({ runId: 1, stepIndex: 1 }, { unique: true });
agentStepSchema.index({ tenantId: 1, createdAt: -1 });
agentStepSchema.index({ traceId: 1 });

const AgentStepModel = mongoose.model<AgentStepDocument>(
  "AgentStep",
  agentStepSchema,
);

export default AgentStepModel;
