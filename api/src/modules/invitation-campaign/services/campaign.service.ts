import crypto from "node:crypto";
import mongoose from "mongoose";
import { AppError } from "../../../common/errors/AppError.js";
import InvitationCampaignModel, {
  type CampaignPlan,
  type CampaignMetrics,
  type CampaignState,
  type InvitationCampaignDocument,
} from "../../../db/models/invitationCampaign.model.js";
import EmployeeImportBatchModel from "../../../db/models/employeeImportBatch.model.js";
import type { ImportBatchState } from "../../../db/models/employeeImportBatch.model.js";
import { getApiJobDispatcher } from "../../jobs/jobDispatcher.js";
import { getAuditWriter } from "../../../common/observability/index.js";
import type { AuditAction, AuditResourceType } from "../../../common/observability/auditEvents.js";
import { logger } from "../../../common/logger/logger.js";
import { invitationCampaignsCreated, invitationCampaignsConfirmed, invitationCampaignsCompleted } from "./campaignMetrics.js";

const CAMPAIGN_STATE_TRANSITIONS: Record<CampaignState, CampaignState[]> = {
  ANALYZING: ["AWAITING_CONFIRMATION", "CANCELLED"],
  AWAITING_CONFIRMATION: ["RUNNING", "CANCELLED"],
  RUNNING: ["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"],
  COMPLETED: [],
  PARTIALLY_COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function validateTransition(current: CampaignState, target: CampaignState): void {
  const allowed = CAMPAIGN_STATE_TRANSITIONS[current];
  if (!allowed || !allowed.includes(target)) {
    throw new AppError(
      400,
      "INVALID_STATE_TRANSITION",
      `Cannot transition campaign from ${current} to ${target}`,
    );
  }
}

function assertTenantAccess(campaign: InvitationCampaignDocument | { tenantId: { toString: () => string } }, tenantId: string): void {
  if (campaign.tenantId.toString() !== tenantId) {
    throw new AppError(404, "NOT_FOUND", "Campaign not found");
  }
}

export class CampaignService {
  static async createCampaign(params: {
    tenantId: string;
    createdBy: string;
    originalFileName: string;
    fileChecksum: string;
    totalRows: number;
    importBatchId: string;
    analysis: string;
    campaignPlan: CampaignPlan;
  }): Promise<InvitationCampaignDocument> {
    const existing = await InvitationCampaignModel.findOne({ tenantId: new mongoose.Types.ObjectId(params.tenantId), fileChecksum: params.fileChecksum });
    if (existing) {
      logger.warn({ campaignId: existing._id, fileChecksum: params.fileChecksum }, "duplicate campaign upload, returning existing");
      return existing;
    }

    const campaign = await InvitationCampaignModel.create({
      tenantId: new mongoose.Types.ObjectId(params.tenantId),
      createdBy: new mongoose.Types.ObjectId(params.createdBy),
      originalFileName: params.originalFileName,
      fileChecksum: params.fileChecksum,
      state: "AWAITING_CONFIRMATION",
      importBatchId: new mongoose.Types.ObjectId(params.importBatchId),
      analysis: params.analysis,
      campaignPlan: params.campaignPlan,
      metrics: {
        totalRows: params.totalRows,
        valid: params.campaignPlan.validCount,
        warning: params.campaignPlan.warningCount,
        invalid: params.campaignPlan.invalidCount,
        duplicates: params.campaignPlan.duplicateCount,
        alreadyRegistered: params.campaignPlan.alreadyRegisteredCount,
        alreadyInvited: params.campaignPlan.alreadyInvitedCount,
        created: 0,
        failed: 0,
        sent: 0,
        failedSends: 0,
        retryCount: 0,
        durationMs: 0,
      },
      autoConfirm: params.campaignPlan.autoConfirm,
    });

    await this.writeAuditEvent({
      resourceType: "InvitationCampaign" as AuditResourceType,
      resourceId: campaign._id.toString(),
      action: "CAMPAIGN_CREATED" as AuditAction,
      tenantId: params.tenantId,
      actorId: params.createdBy,
      metadata: {
        fileName: params.originalFileName,
        totalRows: params.totalRows,
        autoConfirm: params.campaignPlan.autoConfirm,
      },
    });

    invitationCampaignsCreated.inc({ tenant_id: params.tenantId });
    logger.info(
      { campaignId: campaign._id.toString(), tenantId: params.tenantId, fileName: params.originalFileName, totalRows: params.totalRows },
      "invitation campaign created",
    );

    return campaign;
  }

  static async confirmCampaign(
    campaignId: string,
    actorId: string,
    tenantId: string,
  ): Promise<{ campaign: InvitationCampaignDocument; jobResult: unknown }> {
    const campaign = await InvitationCampaignModel.findById(campaignId);
    if (!campaign) throw new AppError(404, "NOT_FOUND", "Campaign not found");
    assertTenantAccess(campaign, tenantId);

    validateTransition(campaign.state as CampaignState, "RUNNING");

    if (campaign.importBatchId && campaign.state === "RUNNING") {
      return { campaign, jobResult: { ok: true, deduplicated: true } };
    }

    // Batch was already created during upload — find it
    const batchIdempotencyKey = sha256(`${campaign.tenantId.toString()}:${campaign.fileChecksum}`);
    const batch = await EmployeeImportBatchModel.findOne({ idempotencyKey: batchIdempotencyKey });
    if (!batch) {
      throw new AppError(400, "BATCH_NOT_FOUND", "Import batch not found. Upload the spreadsheet first.");
    }

    campaign.state = "RUNNING";
    campaign.importBatchId = batch._id;
    campaign.processingStartedAt = new Date();
    await campaign.save();

    const jobResult = await getApiJobDispatcher().enqueue({
      jobType: "import.employee.batch",
      idempotencyKey: batch.idempotencyKey,
      tenantId: campaign.tenantId.toString(),
      actorId,
      payload: { batchId: batch._id.toString(), tenantId: campaign.tenantId.toString(), actorId },
      traceId: crypto.randomUUID(),
    });

    await this.writeAuditEvent({
      resourceType: "InvitationCampaign" as AuditResourceType,
      resourceId: campaign._id.toString(),
      action: "CAMPAIGN_CONFIRMED" as AuditAction,
      tenantId: campaign.tenantId.toString(),
      actorId,
      metadata: { importBatchId: batch._id.toString(), deduplicated: jobResult.deduplicated },
    });

    invitationCampaignsConfirmed.inc();
    logger.info(
      { campaignId: campaign._id.toString(), batchId: batch._id.toString(), tenantId: campaign.tenantId.toString() },
      "invitation campaign confirmed",
    );

    return { campaign, jobResult };
  }

  static async getCampaign(campaignId: string, tenantId: string): Promise<InvitationCampaignDocument | null> {
    const campaign = await InvitationCampaignModel.findById(campaignId).lean();
    if (!campaign) return null;
    if (campaign.tenantId.toString() !== tenantId) return null;

    if (campaign.importBatchId) {
      const batch = await EmployeeImportBatchModel.findById(campaign.importBatchId).lean();
      if (batch) {
        const derivedState = this.deriveCampaignState(batch.state as ImportBatchState);
        const derivedMetrics = this.deriveCampaignMetrics(campaign as InvitationCampaignDocument, batch as unknown as Record<string, unknown>);
        return {
          ...campaign,
          state: derivedState,
          metrics: derivedMetrics,
          completedAt: batch.completedAt ?? campaign.completedAt,
          errorMessage: batch.errorMessage ?? campaign.errorMessage,
        } as unknown as InvitationCampaignDocument;
      }
    }

    return campaign as unknown as InvitationCampaignDocument;
  }

  static async listCampaigns(params: {
    tenantId: string;
    page?: number;
    pageSize?: number;
    state?: CampaignState;
  }): Promise<{
    campaigns: InvitationCampaignDocument[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const filter: Record<string, unknown> = {
      tenantId: new mongoose.Types.ObjectId(params.tenantId),
    };
    if (params.state) filter.state = params.state;

    const [campaigns, total] = await Promise.all([
      InvitationCampaignModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      InvitationCampaignModel.countDocuments(filter),
    ]);

    return {
      campaigns: campaigns as unknown as InvitationCampaignDocument[],
      total,
      page,
      pageSize,
    };
  }

  static async cancelCampaign(
    campaignId: string,
    actorId: string,
    tenantId: string,
  ): Promise<InvitationCampaignDocument> {
    const campaign = await InvitationCampaignModel.findById(campaignId);
    if (!campaign) throw new AppError(404, "NOT_FOUND", "Campaign not found");
    assertTenantAccess(campaign, tenantId);

    validateTransition(campaign.state as CampaignState, "CANCELLED");

    if (campaign.importBatchId) {
      const batch = await EmployeeImportBatchModel.findById(campaign.importBatchId);
      if (batch && ["UPLOADED", "PARSED", "PREVIEW_READY", "QUEUED"].includes(batch.state as string)) {
        batch.state = "CANCELLED" as ImportBatchState;
        batch.completedAt = new Date();
        await batch.save();
      }
    }

    campaign.state = "CANCELLED";
    campaign.completedAt = new Date();
    await campaign.save();

    await this.writeAuditEvent({
      resourceType: "InvitationCampaign" as AuditResourceType,
      resourceId: campaign._id.toString(),
      action: "CAMPAIGN_CANCELLED" as AuditAction,
      tenantId: campaign.tenantId.toString(),
      actorId,
    });

    logger.info({ campaignId, tenantId: campaign.tenantId.toString() }, "invitation campaign cancelled");
    return campaign;
  }

  static async updateCampaignProgress(
    campaignId: string,
    updates: Partial<{
      progressNarrative: string;
      metrics: Partial<CampaignMetrics>;
      state: CampaignState;
    }>,
  ): Promise<InvitationCampaignDocument | null> {
    const setFields: Record<string, unknown> = {};
    if (updates.progressNarrative !== undefined) setFields.progressNarrative = updates.progressNarrative;
    if (updates.metrics !== undefined) {
      for (const [key, value] of Object.entries(updates.metrics)) {
        setFields[`metrics.${key}`] = value;
      }
    }
    if (updates.state !== undefined) {
      setFields.state = updates.state;
      if (["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"].includes(updates.state)) {
        setFields.completedAt = new Date();
      }
    }

    if (Object.keys(setFields).length === 0) return null;

    const updated = await InvitationCampaignModel.findByIdAndUpdate(
      campaignId,
      { $set: setFields },
      { new: true },
    );

    if (updated && updates.state && ["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED"].includes(updates.state)) {
      await this.writeAuditEvent({
        resourceType: "InvitationCampaign" as AuditResourceType,
        resourceId: campaignId,
        action: "CAMPAIGN_COMPLETED" as AuditAction,
        tenantId: updated.tenantId.toString(),
        actorId: updated.createdBy.toString(),
        metadata: { state: updates.state },
      });
      invitationCampaignsCompleted.inc({ state: updates.state });
    }

    return updated;
  }

  private static async writeAuditEvent(params: {
    resourceType: AuditResourceType;
    resourceId: string;
    action: AuditAction;
    tenantId: string;
    actorId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await getAuditWriter().write({
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        tenantId: params.tenantId,
        actorId: params.actorId,
        metadata: params.metadata,
      });
    } catch {
      // Audit failures never throw
    }
  }

  private static deriveCampaignState(batchState: ImportBatchState): CampaignState {
    const MAP: Record<ImportBatchState, CampaignState> = {
      UPLOADED: "RUNNING",
      PARSED: "RUNNING",
      PREVIEW_READY: "RUNNING",
      QUEUED: "RUNNING",
      PROCESSING: "RUNNING",
      COMPLETED: "COMPLETED",
      PARTIALLY_COMPLETED: "PARTIALLY_COMPLETED",
      FAILED: "FAILED",
      CANCELLED: "CANCELLED",
    };
    return MAP[batchState] ?? "RUNNING";
  }

  private static deriveCampaignMetrics(
    campaign: InvitationCampaignDocument,
    batch: Record<string, unknown>,
  ): CampaignMetrics {
    const batchSummary = batch.summary as { valid: number; warning: number; invalid: number; skipped: number; created: number; failed: number } | undefined;
    const base = (campaign.metrics ?? {}) as CampaignMetrics;

    return {
      totalRows: (batch.totalRows as number) ?? base.totalRows,
      valid: batchSummary?.valid ?? base.valid,
      warning: batchSummary?.warning ?? base.warning,
      invalid: batchSummary?.invalid ?? base.invalid,
      duplicates: base.duplicates,
      alreadyRegistered: base.alreadyRegistered,
      alreadyInvited: base.alreadyInvited,
      created: batchSummary?.created ?? base.created,
      failed: batchSummary?.failed ?? base.failed,
      sent: batchSummary?.created ?? base.sent,
      failedSends: batchSummary?.failed ?? base.failedSends,
      retryCount: base.retryCount,
      durationMs: base.durationMs,
    };
  }
}
