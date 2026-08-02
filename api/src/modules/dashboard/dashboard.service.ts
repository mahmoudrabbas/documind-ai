import mongoose from "mongoose";
import DocumentModel from "../../db/models/document.model.js";
import KnowledgeGapModel from "../../db/models/knowledgeGap.model.js";
import TenantModel from "../../db/models/tenant.model.js";
import UsageLogModel from "../../db/models/usageLog.model.js";
import UserModel from "../../db/models/user.model.js";
import { findAuditLogs } from "../audit/audit.repository.js";
import type { DashboardSummary } from "./dashboard.types.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export async function getDashboardSummary(
  tenantId: string,
): Promise<DashboardSummary> {
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * DAY_IN_MS);
  const thirtyDaysAgo = new Date(now - 30 * DAY_IN_MS);
  const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
  const activeDocumentsFilter = { tenantId: tenantObjectId, isArchived: false, deletedAt: null };

  const [
    tenant,
    userCounts,
    documentCounts,
    usageCounts,
    gapCounts,
    recentActivity,
  ] = await Promise.all([
    TenantModel.findById(tenantObjectId)
      .select("name slug plan status")
      .lean()
      .exec(),
    Promise.all([
      UserModel.countDocuments({ tenantId: tenantObjectId }),
      UserModel.countDocuments({ tenantId: tenantObjectId, status: "active" }),
      UserModel.countDocuments({ tenantId: tenantObjectId, status: "pending_email_verification" }),
      UserModel.countDocuments({ tenantId: tenantObjectId, status: "disabled" }),
    ]),
    Promise.all([
      DocumentModel.countDocuments(activeDocumentsFilter),
      DocumentModel.countDocuments({ ...activeDocumentsFilter, status: "processed" }),
      DocumentModel.countDocuments({
        ...activeDocumentsFilter,
        status: { $in: ["uploading", "uploaded", "processing", "reprocessing"] },
      }),
      DocumentModel.countDocuments({ ...activeDocumentsFilter, status: "failed" }),
    ]),
    Promise.all([
      UsageLogModel.countDocuments({
        tenantId: tenantObjectId,
        eventType: "QUESTION_ASKED",
        createdAt: { $gte: sevenDaysAgo },
      }),
      UsageLogModel.countDocuments({
        tenantId: tenantObjectId,
        eventType: "QUESTION_ASKED",
        createdAt: { $gte: thirtyDaysAgo },
      }),
    ]),
    Promise.all([
      KnowledgeGapModel.countDocuments({
        tenantId: tenantObjectId,
        status: { $in: ["open", "triaged", "assigned"] },
      }),
      KnowledgeGapModel.countDocuments({ tenantId: tenantObjectId }),
    ]),
    findAuditLogs(tenantId, {}, 1, 5),
  ]);

  const [totalUsers, activeUsers, pendingInvitations, disabledUsers] = userCounts;
  const [totalDocuments, processedDocuments, processingDocuments, failedDocuments] = documentCounts;
  const [questions7d, questions30d] = usageCounts;
  const [openGaps, totalGaps] = gapCounts;

  return {
    tenant: {
      id: tenant?._id?.toString?.() ?? tenantId,
      name: tenant?.name ?? "",
      slug: tenant?.slug ?? "",
      plan: tenant?.plan ?? "free",
      status: tenant?.status ?? "",
    },
    users: {
      total: totalUsers,
      active: activeUsers,
      pendingInvitations,
      disabled: disabledUsers,
    },
    documents: {
      total: totalDocuments,
      processed: processedDocuments,
      processing: processingDocuments,
      failed: failedDocuments,
    },
    usage: {
      questionsAsked7d: questions7d,
      questionsAsked30d: questions30d,
    },
    knowledgeGaps: {
      open: openGaps,
      total: totalGaps,
    },
    recentActivity: recentActivity.map((log) => ({
      id: log._id,
      action: log.action,
      actorEmail: log.actorEmail,
      actorRole: log.actorRole,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      outcome: log.outcome,
      createdAt: log.createdAt,
    })),
    generatedAt: new Date(now).toISOString(),
  };
}
