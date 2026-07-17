import mongoose, { Schema } from "mongoose";
import AgentToolCallModel from "./agentToolCall.model.js";

export interface AgentApprovalDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  runId: mongoose.Types.ObjectId;
  stepId: mongoose.Types.ObjectId | null;
  toolCallId: mongoose.Types.ObjectId | null;
  status: "pending" | "approved" | "rejected" | "expired";
  requestedBy: string;
  approverRole: string | null;
  approverId: mongoose.Types.ObjectId | null;
  contextHash: string;
  context: Record<string, unknown>;
  decisionNote: string | null;
  resolvedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const agentApprovalSchema = new Schema<AgentApprovalDocument>(
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
    toolCallId: {
      type: Schema.Types.ObjectId,
      ref: "AgentToolCall",
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "expired"],
      default: "pending",
      required: true,
      index: true,
    },
    requestedBy: { type: String, required: true, trim: true, maxlength: 120 },
    approverRole: { type: String, default: null, trim: true, maxlength: 40 },
    approverId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    contextHash: { type: String, required: true, trim: true, maxlength: 128 },
    context: { type: Schema.Types.Mixed, required: true, default: {} },
    decisionNote: { type: String, default: null, trim: true, maxlength: 500 },
    resolvedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
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

agentApprovalSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
agentApprovalSchema.index({ runId: 1, createdAt: 1 });
agentApprovalSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AgentApprovalModel = mongoose.model<AgentApprovalDocument>(
  "AgentApproval",
  agentApprovalSchema,
);

export default AgentApprovalModel;
