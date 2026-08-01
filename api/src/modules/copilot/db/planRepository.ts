import mongoose from "mongoose";
import CopilotPlanModel, { type ICopilotPlanDocument } from "../../../db/models/copilotPlan.model.js";
import type { CopilotPlan, CopilotStep, ConfirmationLevel, PlanMode, PlanStatus, StepStatus } from "../copilot.types.js";

function toDomain(doc: ICopilotPlanDocument): CopilotPlan {
  return {
    id: doc._id.toString(),
    summary: doc.summary,
    mode: doc.mode as PlanMode,
    steps: doc.steps.map((s) => ({
      stepIndex: s.stepIndex,
      action: s.action,
      description: s.description,
      tool: s.tool,
      parameters: s.parameters,
      confirmationLevel: s.confirmationLevel as ConfirmationLevel,
      requiredPermission: s.requiredPermission,
      status: s.status as StepStatus,
      result: s.result,
      errorMessage: s.errorMessage,
      retryCount: s.retryCount ?? 0,
    })),
    estimatedDurationMs: doc.estimatedDurationMs,
    status: doc.status as PlanStatus,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toDoc(plan: CopilotPlan, tenantId: string): Omit<ICopilotPlanDocument, keyof mongoose.Document> {
  return {
    tenantId: new mongoose.Types.ObjectId(tenantId),
    summary: plan.summary,
    mode: plan.mode,
    steps: plan.steps.map((s) => ({
      stepIndex: s.stepIndex,
      action: s.action,
      description: s.description,
      tool: s.tool,
      parameters: s.parameters,
      confirmationLevel: s.confirmationLevel,
      requiredPermission: s.requiredPermission,
      status: s.status,
      result: s.result,
      errorMessage: s.errorMessage,
      retryCount: s.retryCount ?? 0,
    })),
    estimatedDurationMs: plan.estimatedDurationMs,
    status: plan.status,
    createdAt: new Date(plan.createdAt),
    updatedAt: new Date(plan.updatedAt),
  } as unknown as Omit<ICopilotPlanDocument, keyof mongoose.Document>;
}

export const planRepository = {
  async create(plan: CopilotPlan, tenantId: string): Promise<CopilotPlan> {
    const doc = await CopilotPlanModel.create(toDoc(plan, tenantId));
    return toDomain(doc);
  },

  async findById(planId: string): Promise<CopilotPlan | null> {
    const doc = await CopilotPlanModel.findById(planId);
    if (!doc) return null;
    return toDomain(doc);
  },

  /** Tenant-scoped lookup: cross-tenant plans resolve to null. */
  async findByIdInTenant(planId: string, tenantId: string): Promise<CopilotPlan | null> {
    if (!mongoose.isValidObjectId(planId)) return null;
    const doc = await CopilotPlanModel.findOne({
      _id: planId,
      tenantId: new mongoose.Types.ObjectId(tenantId),
    });
    if (!doc) return null;
    return toDomain(doc);
  },

  async findByTenantId(tenantId: string, filter?: { status?: string }): Promise<CopilotPlan[]> {
    const query: Record<string, unknown> = { tenantId: new mongoose.Types.ObjectId(tenantId) };
    if (filter?.status) query.status = filter.status;
    const docs = await CopilotPlanModel.find(query).sort({ createdAt: -1 }).lean();
    return docs.map((d) => toDomain(d as unknown as ICopilotPlanDocument));
  },

  async updateStatus(
    planId: string,
    status: PlanStatus,
  ): Promise<CopilotPlan | null> {
    const doc = await CopilotPlanModel.findByIdAndUpdate(
      planId,
      { $set: { status } },
      { new: true },
    );
    if (!doc) return null;
    return toDomain(doc);
  },

  async updateStep(
    planId: string,
    stepIndex: number,
    update: Partial<CopilotStep>,
  ): Promise<CopilotPlan | null> {
    const setFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(update)) {
      setFields[`steps.${stepIndex}.${key}`] = value;
    }
    const doc = await CopilotPlanModel.findByIdAndUpdate(
      planId,
      { $set: { ...setFields, updatedAt: new Date() } },
      { new: true },
    );
    if (!doc) return null;
    return toDomain(doc);
  },

  async updatePlanTimestamp(planId: string): Promise<CopilotPlan | null> {
    const doc = await CopilotPlanModel.findByIdAndUpdate(
      planId,
      { $set: { updatedAt: new Date() } },
      { new: true },
    );
    if (!doc) return null;
    return toDomain(doc);
  },

  async cancelPlanSteps(
    planId: string,
  ): Promise<CopilotPlan | null> {
    const doc = await CopilotPlanModel.findById(planId);
    if (!doc) return null;
    doc.status = "cancelled";
    for (const step of doc.steps) {
      if (step.status === "pending" || step.status === "awaiting_confirmation") {
        step.status = "cancelled";
      }
    }
    await doc.save();
    return toDomain(doc);
  },

  async setAllStepsCompleted(planId: string): Promise<CopilotPlan | null> {
    const doc = await CopilotPlanModel.findByIdAndUpdate(
      planId,
      { $set: { status: "completed", updatedAt: new Date() } },
      { new: true },
    );
    return doc ? toDomain(doc) : null;
  },
};
