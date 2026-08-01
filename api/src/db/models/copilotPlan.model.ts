import mongoose, { Schema } from "mongoose";

export type ConfirmationLevel = "safe" | "medium" | "high";
export type PlanMode = "guide" | "action";
export type StepStatus = "pending" | "running" | "completed" | "failed" | "awaiting_confirmation" | "cancelled";
export type ReviewDecision = "approved" | "rejected" | "retry";

interface ICopilotStep {
  stepIndex: number;
  action: string;
  description: string;
  tool: string | null;
  parameters: Record<string, unknown> | null;
  confirmationLevel: ConfirmationLevel;
  requiredPermission: string | null;
  status: StepStatus;
  result: {
    ok: boolean;
    data: unknown;
    error: string | null;
    latencyMs: number;
    auditEvent: {
      action: string;
      resourceType: string;
      resourceId: string;
    } | null;
  } | null;
  errorMessage: string | null;
  retryCount?: number;
}

export interface ICopilotPlanDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  summary: string;
  mode: PlanMode;
  steps: ICopilotStep[];
  estimatedDurationMs: number;
  status: "active" | "completed" | "cancelled" | "failed";
  createdAt: Date;
  updatedAt: Date;
}

const stepSchema = new Schema<ICopilotStep>(
  {
    stepIndex: { type: Number, required: true },
    action: { type: String, required: true },
    description: { type: String, required: true },
    tool: { type: String, default: null },
    parameters: { type: Schema.Types.Mixed, default: null },
    confirmationLevel: { type: String, enum: ["safe", "medium", "high"], required: true },
    requiredPermission: { type: String, default: null },
    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed", "awaiting_confirmation", "cancelled"],
      required: true,
    },
    result: {
      type: Schema.Types.Mixed,
      default: null,
    },
    errorMessage: { type: String, default: null },
    retryCount: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const copilotPlanSchema = new Schema<ICopilotPlanDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    summary: { type: String, required: true },
    mode: { type: String, enum: ["guide", "action"], required: true },
    steps: { type: [stepSchema], required: true },
    estimatedDurationMs: { type: Number, required: true },
    status: { type: String, enum: ["active", "completed", "cancelled", "failed"], required: true },
  },
  {
    timestamps: true,
  },
);

copilotPlanSchema.index({ tenantId: 1, createdAt: -1 });

const CopilotPlanModel = mongoose.model<ICopilotPlanDocument>("CopilotPlan", copilotPlanSchema);
export default CopilotPlanModel;
