import mongoose from "mongoose";
import KnowledgeGapModel, {
  type KnowledgeGapDocument,
  type GapStatus,
  type GapSeverity,
  type GapSource,
  type AgentProposalSubdocument,
} from "../../db/models/knowledgeGap.model.js";
import GapOccurrenceModel, {
  type GapOccurrenceDocument,
  type GapCandidateOutcome,
} from "../../db/models/gapOccurrence.model.js";
import GapReevaluationModel, {
  type GapReevaluationDocument,
  type ReevaluationResultOutcome,
} from "../../db/models/gapReevaluation.model.js";

export interface CreateGapData {
  tenantId: string;
  status?: GapStatus;
  severity?: GapSeverity;
  topic: string;
  representativeQuestion: string;
  normalizedIntent?: string;
  department?: string;
  departmentId?: string;
  clusterKey: string;
  source: GapSource;
  sourceMetadata?: Record<string, unknown>;
  agentProposal?: AgentProposalSubdocument;
  auditActorId: string;
}

export interface ListGapsFilter {
  tenantId: string;
  status?: GapStatus;
  severity?: GapSeverity;
  source?: GapSource;
  department?: string;
  assigneeId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "updatedAt" | "occurrenceCount" | "severity";
  sortOrder?: "asc" | "desc";
}

export interface CreateOccurrenceData {
  tenantId: string;
  gapId: string;
  question: string;
  normalizedIntent?: string;
  outcome: GapCandidateOutcome;
  category?: string;
  confidence: number;
  evidenceSummaryIds?: string[];
  conversationId?: string;
  messageId?: string;
  actorId?: string;
  actorDepartment?: string;
  traceId?: string;
}

export class KnowledgeGapsRepository {
  async createGap(data: CreateGapData): Promise<KnowledgeGapDocument> {
    const doc = new KnowledgeGapModel({
      tenantId: new mongoose.Types.ObjectId(data.tenantId),
      status: data.status ?? "open",
      severity: data.severity ?? "medium",
      topic: data.topic,
      representativeQuestion: data.representativeQuestion,
      normalizedIntent: data.normalizedIntent || null,
      department: data.department || null,
      departmentId: data.departmentId ? new mongoose.Types.ObjectId(data.departmentId) : null,
      clusterKey: data.clusterKey,
      source: data.source,
      sourceMetadata: data.sourceMetadata || {},
      agentProposal: data.agentProposal || null,
      occurrenceCount: 1,
      firstOccurrence: new Date(),
      lastOccurrence: new Date(),
      linkedDocumentIds: [],
      auditHistory: [
        {
          action: "CREATED",
          actorId: data.auditActorId !== "system" ? new mongoose.Types.ObjectId(data.auditActorId) : "system",
          timestamp: new Date(),
          changes: { source: data.source, severity: data.severity ?? "medium" },
        },
      ],
    });

    return doc.save();
  }

  async findGapById(tenantId: string, gapId: string): Promise<KnowledgeGapDocument | null> {
    if (!mongoose.Types.ObjectId.isValid(gapId)) return null;
    return KnowledgeGapModel.findOne({
      _id: new mongoose.Types.ObjectId(gapId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    }).exec();
  }

  async findByClusterKey(tenantId: string, clusterKey: string): Promise<KnowledgeGapDocument | null> {
    return KnowledgeGapModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      clusterKey,
      status: { $ne: "dismissed" },
    }).exec();
  }

  async findGaps(filter: ListGapsFilter): Promise<{ gaps: KnowledgeGapDocument[]; total: number }> {
    const query: Record<string, unknown> = {
      tenantId: new mongoose.Types.ObjectId(filter.tenantId),
    };

    if (filter.status) query.status = filter.status;
    if (filter.severity) query.severity = filter.severity;
    if (filter.source) query.source = filter.source;
    if (filter.department) query.department = filter.department;
    if (filter.assigneeId && mongoose.Types.ObjectId.isValid(filter.assigneeId)) {
      query.assigneeId = new mongoose.Types.ObjectId(filter.assigneeId);
    }
    if (filter.search) {
      query.$or = [
        { topic: { $regex: filter.search, $options: "i" } },
        { representativeQuestion: { $regex: filter.search, $options: "i" } },
      ];
    }

    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const sortField = filter.sortBy ?? "createdAt";
    const sortDir = filter.sortOrder === "asc" ? 1 : -1;

    const [gaps, total] = await Promise.all([
      KnowledgeGapModel.find(query)
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(pageSize)
        .exec(),
      KnowledgeGapModel.countDocuments(query).exec(),
    ]);

    return { gaps, total };
  }

  async incrementOccurrence(
    tenantId: string,
    gapId: string,
    actorId: string,
    updates?: { category?: string; severity?: GapSeverity },
  ): Promise<KnowledgeGapDocument | null> {
    const setUpdates: Record<string, unknown> = { lastOccurrence: new Date() };
    if (updates?.category) {
      setUpdates["sourceMetadata.category"] = updates.category;
    }
    if (updates?.severity) {
      setUpdates["severity"] = updates.severity;
    }

    return KnowledgeGapModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(gapId),
        tenantId: new mongoose.Types.ObjectId(tenantId),
      },
      {
        $inc: { occurrenceCount: 1 },
        $set: setUpdates,
        $push: {
          auditHistory: {
            action: "OCCURRENCE_ADDED",
            actorId: actorId !== "system" ? new mongoose.Types.ObjectId(actorId) : "system",
            timestamp: new Date(),
          },
        },
      },
      { new: true },
    ).exec();
  }

  async updateGap(
    tenantId: string,
    gapId: string,
    updates: Partial<KnowledgeGapDocument>,
    auditRecord: { action: string; actorId: string; changes?: Record<string, unknown> },
  ): Promise<KnowledgeGapDocument | null> {
    const actorIdVal =
      auditRecord.actorId !== "system" ? new mongoose.Types.ObjectId(auditRecord.actorId) : "system";

    return KnowledgeGapModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(gapId),
        tenantId: new mongoose.Types.ObjectId(tenantId),
      },
      {
        $set: updates,
        $push: {
          auditHistory: {
            action: auditRecord.action,
            actorId: actorIdVal,
            timestamp: new Date(),
            changes: auditRecord.changes || {},
          },
        },
      },
      { new: true },
    ).exec();
  }

  async createOccurrence(data: CreateOccurrenceData): Promise<GapOccurrenceDocument> {
    const doc = new GapOccurrenceModel({
      tenantId: new mongoose.Types.ObjectId(data.tenantId),
      gapId: new mongoose.Types.ObjectId(data.gapId),
      question: data.question,
      normalizedIntent: data.normalizedIntent || null,
      outcome: data.outcome,
      category: data.category || null,
      confidence: data.confidence,
      evidenceSummaryIds: data.evidenceSummaryIds || [],
      conversationId: data.conversationId && mongoose.Types.ObjectId.isValid(data.conversationId)
        ? new mongoose.Types.ObjectId(data.conversationId)
        : null,
      messageId: data.messageId && mongoose.Types.ObjectId.isValid(data.messageId)
        ? new mongoose.Types.ObjectId(data.messageId)
        : null,
      actorId: data.actorId && mongoose.Types.ObjectId.isValid(data.actorId)
        ? new mongoose.Types.ObjectId(data.actorId)
        : null,
      actorDepartment: data.actorDepartment || null,
      traceId: data.traceId || null,
    });

    return doc.save();
  }

  async findOccurrences(
    tenantId: string,
    gapId: string,
    page = 1,
    pageSize = 20,
  ): Promise<{ occurrences: GapOccurrenceDocument[]; total: number }> {
    const query = {
      tenantId: new mongoose.Types.ObjectId(tenantId),
      gapId: new mongoose.Types.ObjectId(gapId),
    };
    const skip = (page - 1) * pageSize;

    const [occurrences, total] = await Promise.all([
      GapOccurrenceModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(pageSize).exec(),
      GapOccurrenceModel.countDocuments(query).exec(),
    ]);

    return { occurrences, total };
  }

  async createReevaluation(data: {
    tenantId: string;
    gapId: string;
    documentId: string;
    result: ReevaluationResultOutcome;
    evidenceBefore?: Record<string, unknown>;
    evidenceAfter?: Record<string, unknown>;
    notes?: string;
    evaluatedBy: string;
  }): Promise<GapReevaluationDocument> {
    const doc = new GapReevaluationModel({
      tenantId: new mongoose.Types.ObjectId(data.tenantId),
      gapId: new mongoose.Types.ObjectId(data.gapId),
      documentId: mongoose.Types.ObjectId.isValid(data.documentId)
        ? new mongoose.Types.ObjectId(data.documentId)
        : new mongoose.Types.ObjectId(),
      result: data.result,
      evidenceBefore: data.evidenceBefore || null,
      evidenceAfter: data.evidenceAfter || null,
      notes: data.notes || null,
      evaluatedBy: data.evaluatedBy !== "system" && mongoose.Types.ObjectId.isValid(data.evaluatedBy)
        ? new mongoose.Types.ObjectId(data.evaluatedBy)
        : "system",
    });

    return doc.save();
  }

  async findReevaluations(
    tenantId: string,
    gapId: string,
  ): Promise<GapReevaluationDocument[]> {
    return GapReevaluationModel.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      gapId: new mongoose.Types.ObjectId(gapId),
    })
      .sort({ createdAt: -1 })
      .exec();
  }

  async getMetrics(tenantId: string): Promise<{
    totalGaps: number;
    byStatus: Record<GapStatus, number>;
    bySeverity: Record<GapSeverity, number>;
    bySource: Record<GapSource, number>;
    byDepartment: Record<string, number>;
    topUnresolved: KnowledgeGapDocument[];
    resolutionRate: number;
  }> {
    const tenantObjId = new mongoose.Types.ObjectId(tenantId);

    const [allGaps, topUnresolved] = await Promise.all([
      KnowledgeGapModel.find({ tenantId: tenantObjId }).exec(),
      KnowledgeGapModel.find({
        tenantId: tenantObjId,
        status: { $in: ["open", "triaged", "assigned", "reopened"] },
      })
        .sort({ occurrenceCount: -1, severity: -1 })
        .limit(5)
        .exec(),
    ]);

    const totalGaps = allGaps.length;
    const byStatus: Record<GapStatus, number> = {
      open: 0,
      triaged: 0,
      assigned: 0,
      resolved: 0,
      dismissed: 0,
      reopened: 0,
    };
    const bySeverity: Record<GapSeverity, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };
    const bySource: Record<GapSource, number> = {
      refusal: 0,
      weak_answer: 0,
      conflict: 0,
      negative_feedback: 0,
      manual: 0,
    };
    const byDepartment: Record<string, number> = {};

    let resolvedCount = 0;

    for (const gap of allGaps) {
      if (byStatus[gap.status] !== undefined) byStatus[gap.status]++;
      if (bySeverity[gap.severity] !== undefined) bySeverity[gap.severity]++;
      if (bySource[gap.source] !== undefined) bySource[gap.source]++;
      if (gap.department) {
        byDepartment[gap.department] = (byDepartment[gap.department] || 0) + 1;
      }
      if (gap.status === "resolved") resolvedCount++;
    }

    const resolutionRate = totalGaps > 0 ? Number((resolvedCount / totalGaps).toFixed(2)) : 0;

    return {
      totalGaps,
      byStatus,
      bySeverity,
      bySource,
      byDepartment,
      topUnresolved,
      resolutionRate,
    };
  }

  async deleteGap(tenantId: string, gapId: string): Promise<boolean> {
    const result = await KnowledgeGapModel.deleteOne({
      _id: new mongoose.Types.ObjectId(gapId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    }).exec();

    return (result.deletedCount ?? 0) > 0;
  }
}

export const knowledgeGapsRepository = new KnowledgeGapsRepository();
