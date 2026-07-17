import mongoose, { Schema } from "mongoose";

export interface AgentRunDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  workflowName: string;
  agentName: string;
  status:
    | "pending"
    | "running"
    | "awaiting_approval"
    | "completed"
    | "failed"
    | "cancelled"
    | "expired";
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  modelProvider: string;
  modelName: string;
  promptVersion: string | null;
  promptVersionId: mongoose.Types.ObjectId | null;
  toolVersionSnapshot: string | null;
  traceId: string;
  requestId: string;
  totalSteps: number;
  totalToolCalls: number;
  totalTokensUsed: number | null;
  estimatedCost: number | null;
  latencyMs: number | null;
  error: Record<string, unknown> | null;
  guardrailResult: Record<string, unknown> | null;
  approvalsCount: number;
  handoffsCount: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const agentRunSchema = new Schema<AgentRunDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    workflowName: { type: String, required: true, trim: true, maxlength: 120 },
    agentName: { type: String, required: true, trim: true, maxlength: 120 },
    status: {
      type: String,
      enum: [
        "pending",
        "running",
        "awaiting_approval",
        "completed",
        "failed",
        "cancelled",
        "expired",
      ],
      default: "pending",
      required: true,
      index: true,
    },
    input: { type: Schema.Types.Mixed, required: true, default: {} },
    output: { type: Schema.Types.Mixed, default: null },
    modelProvider: { type: String, required: true, trim: true, maxlength: 80 },
    modelName: { type: String, required: true, trim: true, maxlength: 120 },
    promptVersion: { type: String, default: null },
    promptVersionId: { type: Schema.Types.ObjectId, default: null },
    toolVersionSnapshot: { type: String, default: null },
    traceId: { type: String, required: true },
    requestId: { type: String, required: true, index: true },
    totalSteps: { type: Number, default: 0, min: 0 },
    totalToolCalls: { type: Number, default: 0, min: 0 },
    totalTokensUsed: { type: Number, default: null, min: 0 },
    estimatedCost: { type: Schema.Types.Decimal128, default: null },
    latencyMs: { type: Number, default: null, min: 0 },
    error: { type: Schema.Types.Mixed, default: null },
    guardrailResult: { type: Schema.Types.Mixed, default: null },
    approvalsCount: { type: Number, default: 0, min: 0 },
    handoffsCount: { type: Number, default: 0, min: 0 },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
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

agentRunSchema.index({ tenantId: 1, createdAt: -1 });
agentRunSchema.index({ tenantId: 1, actorId: 1, createdAt: -1 });
agentRunSchema.index({ traceId: 1 });
agentRunSchema.index({ status: 1, createdAt: -1 });

const AgentRunModel = mongoose.model<AgentRunDocument>(
  "AgentRun",
  agentRunSchema,
);

export default AgentRunModel;
