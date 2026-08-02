import mongoose, { Schema, type Document } from "mongoose";

export type CampaignState =
  | "ANALYZING"
  | "AWAITING_CONFIRMATION"
  | "RUNNING"
  | "COMPLETED"
  | "PARTIALLY_COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface CampaignPlan {
  validCount: number;
  warningCount: number;
  invalidCount: number;
  duplicateCount: number;
  alreadyRegisteredCount: number;
  alreadyInvitedCount: number;
  totalRows: number;
  recommendations: string[];
  autoConfirm: boolean;
}

export interface CampaignMetrics {
  totalRows: number;
  valid: number;
  warning: number;
  invalid: number;
  duplicates: number;
  alreadyRegistered: number;
  alreadyInvited: number;
  created: number;
  failed: number;
  sent: number;
  failedSends: number;
  retryCount: number;
  durationMs: number;
}

export interface InvitationCampaignDocument extends Document {
  tenantId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  originalFileName: string;
  fileChecksum: string;
  state: CampaignState;
  analysis: string;
  campaignPlan: CampaignPlan;
  progressNarrative: string;
  summary: string;
  metrics: CampaignMetrics;
  importBatchId?: mongoose.Types.ObjectId;
  autoConfirm: boolean;
  errorMessage?: string;
  processingStartedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CampaignPlanSchema = new Schema<CampaignPlan>(
  {
    validCount: { type: Number, required: true, default: 0 },
    warningCount: { type: Number, required: true, default: 0 },
    invalidCount: { type: Number, required: true, default: 0 },
    duplicateCount: { type: Number, required: true, default: 0 },
    alreadyRegisteredCount: { type: Number, required: true, default: 0 },
    alreadyInvitedCount: { type: Number, required: true, default: 0 },
    totalRows: { type: Number, required: true, default: 0 },
    recommendations: [{ type: String }],
    autoConfirm: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

const CampaignMetricsSchema = new Schema<CampaignMetrics>(
  {
    totalRows: { type: Number, default: 0 },
    valid: { type: Number, default: 0 },
    warning: { type: Number, default: 0 },
    invalid: { type: Number, default: 0 },
    duplicates: { type: Number, default: 0 },
    alreadyRegistered: { type: Number, default: 0 },
    alreadyInvited: { type: Number, default: 0 },
    created: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failedSends: { type: Number, default: 0 },
    retryCount: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
  },
  { _id: false },
);

const invitationCampaignSchema = new Schema<InvitationCampaignDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    originalFileName: { type: String, required: true, maxlength: 500 },
    fileChecksum: { type: String, required: true },
    state: {
      type: String,
      enum: [
        "ANALYZING",
        "AWAITING_CONFIRMATION",
        "RUNNING",
        "COMPLETED",
        "PARTIALLY_COMPLETED",
        "FAILED",
        "CANCELLED",
      ],
      required: true,
      default: "ANALYZING",
    },
    analysis: { type: String, default: "" },
    campaignPlan: { type: CampaignPlanSchema, default: () => ({}) },
    progressNarrative: { type: String, default: "" },
    summary: { type: String, default: "" },
    metrics: { type: CampaignMetricsSchema, default: () => ({}) },
    importBatchId: { type: Schema.Types.ObjectId, ref: "EmployeeImportBatch", default: null },
    autoConfirm: { type: Boolean, default: false },
    errorMessage: { type: String, default: null },
    processingStartedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: "invitationcampaigns",
  },
);

invitationCampaignSchema.index({ tenantId: 1, createdAt: -1 });
invitationCampaignSchema.index({ state: 1, createdAt: -1 });

export default mongoose.model<InvitationCampaignDocument>(
  "InvitationCampaign",
  invitationCampaignSchema,
);
