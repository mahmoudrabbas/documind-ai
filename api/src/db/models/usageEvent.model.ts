import mongoose, { Schema } from "mongoose";

export type UsageEventType =
  | "prompt"
  | "completion"
  | "embedding"
  | "ocr_page"
  | "agent_run"
  | "agent_tool_call"
  | "retrieval"
  | "reranking"
  | "citation_check"
  | "refusal"
  | "feedback"
  | "document_processing"
  | "email_send"
  | "import_batch"
  | "job_execution"
  | "entitlement_denial"
  | "question_asked";

export type CostType = "estimated" | "calculated" | "invoiced" | "reconciled";

export interface UsageEventDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  actorId?: mongoose.Types.ObjectId | null;
  departmentId?: string | null;
  eventType: UsageEventType;
  provider?: string | null;
  modelName?: string | null;
  modelVersion?: string | null;
  documentId?: mongoose.Types.ObjectId | null;
  evidenceIds?: string[];
  conversationId?: string | null;
  messageId?: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  units: number;
  costMinorUnits: number;
  currency: string;
  costType: CostType;
  latencyMs: number;
  success: boolean;
  errorCode?: string | null;
  traceId?: string | null;
  requestId?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const usageEventSchema = new Schema<UsageEventDocument>(
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
      required: false,
      default: null,
      index: true,
    },
    departmentId: {
      type: String,
      required: false,
      default: null,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      index: true,
    },
    provider: {
      type: String,
      required: false,
      default: null,
    },
    modelName: {
      type: String,
      required: false,
      default: null,
    },
    modelVersion: {
      type: String,
      required: false,
      default: null,
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: false,
      default: null,
    },
    evidenceIds: {
      type: [String],
      default: [],
    },
    conversationId: {
      type: String,
      required: false,
      default: null,
    },
    messageId: {
      type: String,
      required: false,
      default: null,
    },
    inputTokens: {
      type: Number,
      default: 0,
    },
    outputTokens: {
      type: Number,
      default: 0,
    },
    totalTokens: {
      type: Number,
      default: 0,
    },
    units: {
      type: Number,
      default: 1,
    },
    costMinorUnits: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: "USD",
    },
    costType: {
      type: String,
      enum: ["estimated", "calculated", "invoiced", "reconciled"],
      default: "estimated",
    },
    latencyMs: {
      type: Number,
      default: 0,
    },
    success: {
      type: Boolean,
      default: true,
    },
    errorCode: {
      type: String,
      default: null,
    },
    traceId: {
      type: String,
      default: null,
    },
    requestId: {
      type: String,
      default: null,
    },
    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

usageEventSchema.index({ tenantId: 1, createdAt: -1 });
usageEventSchema.index({ tenantId: 1, eventType: 1, createdAt: -1 });
usageEventSchema.index({ tenantId: 1, provider: 1, modelName: 1, createdAt: -1 });

const UsageEventModel = mongoose.model<UsageEventDocument>(
  "UsageEvent",
  usageEventSchema,
  "usage_events"
);

export default UsageEventModel;
