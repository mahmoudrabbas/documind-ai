import mongoose, { Schema } from "mongoose";

export type GapStatus = "open" | "triaged" | "assigned" | "resolved" | "dismissed" | "reopened";
export type GapSeverity = "low" | "medium" | "high" | "critical";
export type GapSource = "refusal" | "weak_answer" | "conflict" | "negative_feedback" | "manual";

export interface AgentProposalSubdocument {
  topic: string;
  severity: GapSeverity;
  department?: string | null;
  suggestedAction?: string | null;
  requiredDocumentType?: string | null;
  duplicateGapId?: mongoose.Types.ObjectId | null;
  confidence: number;
  reasoning?: string | null;
}

export interface GapAuditRecord {
  action: string;
  actorId: mongoose.Types.ObjectId | "system";
  timestamp: Date;
  changes?: Record<string, unknown>;
}

export interface KnowledgeGapDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  status: GapStatus;
  severity: GapSeverity;
  topic: string;
  representativeQuestion: string;
  normalizedIntent?: string | null;
  department?: string | null;
  departmentId?: mongoose.Types.ObjectId | null;
  clusterKey: string;
  occurrenceCount: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  assigneeId?: mongoose.Types.ObjectId | null;
  dueDate?: Date | null;
  linkedDocumentIds: mongoose.Types.ObjectId[];
  resolutionNotes?: string | null;
  resolvedBy?: mongoose.Types.ObjectId | null;
  resolvedAt?: Date | null;
  dismissedBy?: mongoose.Types.ObjectId | null;
  dismissedAt?: Date | null;
  dismissalReason?: string | null;
  source: GapSource;
  sourceMetadata?: Record<string, unknown>;
  agentProposal?: AgentProposalSubdocument | null;
  auditHistory: GapAuditRecord[];
  createdAt: Date;
  updatedAt: Date;
}

const agentProposalSchema = new Schema<AgentProposalSubdocument>(
  {
    topic: { type: String, required: true },
    severity: { type: String, enum: ["low", "medium", "high", "critical"], required: true },
    department: { type: String, default: null },
    suggestedAction: { type: String, default: null },
    requiredDocumentType: { type: String, default: null },
    duplicateGapId: { type: Schema.Types.ObjectId, ref: "KnowledgeGap", default: null },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    reasoning: { type: String, default: null },
  },
  { _id: false },
);

const gapAuditRecordSchema = new Schema<GapAuditRecord>(
  {
    action: { type: String, required: true },
    actorId: { type: Schema.Types.Mixed, required: true },
    timestamp: { type: Date, required: true, default: Date.now },
    changes: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const knowledgeGapSchema = new Schema<KnowledgeGapDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["open", "triaged", "assigned", "resolved", "dismissed", "reopened"],
      default: "open",
      index: true,
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
      index: true,
    },
    topic: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    representativeQuestion: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    normalizedIntent: {
      type: String,
      default: null,
      maxlength: 500,
    },
    department: {
      type: String,
      default: null,
      maxlength: 100,
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },
    clusterKey: {
      type: String,
      required: true,
      index: true,
    },
    occurrenceCount: {
      type: Number,
      default: 1,
      min: 1,
    },
    firstOccurrence: {
      type: Date,
      default: Date.now,
    },
    lastOccurrence: {
      type: Date,
      default: Date.now,
    },
    assigneeId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    dueDate: {
      type: Date,
      default: null,
    },
    linkedDocumentIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Document" }],
      default: [],
    },
    resolutionNotes: {
      type: String,
      default: null,
      maxlength: 2000,
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    dismissedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    dismissedAt: {
      type: Date,
      default: null,
    },
    dismissalReason: {
      type: String,
      default: null,
      maxlength: 1000,
    },
    source: {
      type: String,
      enum: ["refusal", "weak_answer", "conflict", "negative_feedback", "manual"],
      default: "refusal",
    },
    sourceMetadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    agentProposal: {
      type: agentProposalSchema,
      default: null,
    },
    auditHistory: {
      type: [gapAuditRecordSchema],
      default: [],
    },
  },
  {
    timestamps: true,
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

knowledgeGapSchema.index({ tenantId: 1, status: 1, severity: 1 });
knowledgeGapSchema.index({ tenantId: 1, clusterKey: 1 });
knowledgeGapSchema.index({ tenantId: 1, topic: 1 });
knowledgeGapSchema.index({ tenantId: 1, assigneeId: 1 });
knowledgeGapSchema.index({ tenantId: 1, createdAt: -1 });

const KnowledgeGapModel = mongoose.model<KnowledgeGapDocument>("KnowledgeGap", knowledgeGapSchema);
export default KnowledgeGapModel;
