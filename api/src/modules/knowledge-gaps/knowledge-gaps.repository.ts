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
import type { PermissionScopes } from "../permissions/permissions.types.js";

export interface KnowledgeGapVisibility {
  actorId?: string;
  assignedOnly?: boolean;
  scopes: PermissionScopes | null;
}

export interface KnowledgeGapVisibilityMetadataInput {
  reporterActorIds: string[];
  departmentIds: string[];
  documentCategories: string[];
  documentClassifications: string[];
}

/**
 * Converts a scoped knowledge-gap grant into a fail-closed Mongo filter.
 * Knowledge-gap records only expose the safe, persisted visibility fields;
 * no hidden document content is consulted to broaden this query.
 */
export function buildKnowledgeGapVisibilityQuery(
  visibility: KnowledgeGapVisibility,
): Record<string, unknown> {
  const scopes = visibility.scopes;
  const clauses: Record<string, unknown>[] = [];
  if (visibility.assignedOnly || scopes?.selfOnly) {
    clauses.push(
      visibility.actorId
        ? {
            $or: [
              { assigneeId: visibility.actorId },
              { "visibilityMetadata.reporterActorIds": visibility.actorId },
            ],
          }
        : { _id: { $exists: false } },
    );
  }
  if (!scopes) return clauses.length > 0 ? { $and: clauses } : {};

  if (scopes.departmentIds.length > 0) {
    clauses.push({
      "visibilityMetadata.departmentIds.0": { $exists: true },
    }, {
      "visibilityMetadata.departmentIds": {
        $not: { $elemMatch: { $nin: scopes.departmentIds } },
      },
    });
  }
  if (scopes.documentCategories.length > 0) {
    const categories = scopes.documentCategories.map((value) => value.trim().toLowerCase());
    clauses.push({
      "visibilityMetadata.documentCategories.0": { $exists: true },
    }, {
      "visibilityMetadata.documentCategories": {
        $not: { $elemMatch: { $nin: categories } },
      },
    });
  }
  if (scopes.documentClassifications.length > 0) {
    const classifications = scopes.documentClassifications.map((value) => value.trim().toLowerCase());
    clauses.push({
      "visibilityMetadata.documentClassifications.0": { $exists: true },
    }, {
      "visibilityMetadata.documentClassifications": {
        $not: { $elemMatch: { $nin: classifications } },
      },
    });
  }
  return clauses.length > 0 ? { $and: clauses } : {};
}

export function requiresKnowledgeGapChildRedaction(
  visibility: KnowledgeGapVisibility | undefined,
): boolean {
  if (!visibility) return false;
  if (visibility.assignedOnly || visibility.scopes?.selfOnly) return true;
  const scopes = visibility.scopes;
  return Boolean(
    scopes &&
      (scopes.departmentIds.length > 0 ||
        scopes.documentCategories.length > 0 ||
        scopes.documentClassifications.length > 0),
  );
}

function toObjectIds(values: string[]): mongoose.Types.ObjectId[] {
  return values
    .filter((value) => mongoose.Types.ObjectId.isValid(value))
    .map((value) => new mongoose.Types.ObjectId(value));
}

function normalizeVisibilityMetadata(
  metadata: KnowledgeGapVisibilityMetadataInput | undefined,
): {
  reporterActorIds: mongoose.Types.ObjectId[];
  departmentIds: mongoose.Types.ObjectId[];
  documentCategories: string[];
  documentClassifications: string[];
} {
  return {
    reporterActorIds: toObjectIds(metadata?.reporterActorIds ?? []),
    departmentIds: toObjectIds(metadata?.departmentIds ?? []),
    documentCategories: (metadata?.documentCategories ?? []).map((value) => value.trim().toLowerCase()),
    documentClassifications: (metadata?.documentClassifications ?? []).map((value) => value.trim().toLowerCase()),
  };
}

function buildVisibilityAddToSet(metadata: KnowledgeGapVisibilityMetadataInput | undefined) {
  const normalized = normalizeVisibilityMetadata(metadata);
  return {
    "visibilityMetadata.reporterActorIds": { $each: normalized.reporterActorIds },
    "visibilityMetadata.departmentIds": { $each: normalized.departmentIds },
    "visibilityMetadata.documentCategories": { $each: normalized.documentCategories },
    "visibilityMetadata.documentClassifications": { $each: normalized.documentClassifications },
  };
}

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
  visibilityMetadata?: KnowledgeGapVisibilityMetadataInput;
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
  visibility?: KnowledgeGapVisibility;
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
      visibilityMetadata: normalizeVisibilityMetadata(data.visibilityMetadata),
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

  async findGapById(
    tenantId: string,
    gapId: string,
    visibility?: KnowledgeGapVisibility,
  ): Promise<KnowledgeGapDocument | null> {
    if (!mongoose.Types.ObjectId.isValid(gapId)) return null;
    const query: Record<string, unknown> = {
      _id: new mongoose.Types.ObjectId(gapId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    };
    if (visibility) {
      Object.assign(query, buildKnowledgeGapVisibilityQuery(visibility));
    }
    return KnowledgeGapModel.findOne(query).exec();
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
    const visibilityQuery = filter.visibility
      ? buildKnowledgeGapVisibilityQuery(filter.visibility)
      : {};
    Object.assign(query, visibilityQuery);

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
    visibilityMetadata?: KnowledgeGapVisibilityMetadataInput,
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
        $addToSet: buildVisibilityAddToSet(visibilityMetadata),
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
    redactSensitive = false,
  ): Promise<{ occurrences: GapOccurrenceDocument[]; total: number }> {
    const query = {
      tenantId: new mongoose.Types.ObjectId(tenantId),
      gapId: new mongoose.Types.ObjectId(gapId),
    };
    const skip = (page - 1) * pageSize;

    const occurrenceQuery = GapOccurrenceModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize);
    if (redactSensitive) {
      occurrenceQuery.select("_id outcome category confidence createdAt");
    }
    const [occurrences, total] = await Promise.all([
      occurrenceQuery.exec(),
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
    redactSensitive = false,
  ): Promise<GapReevaluationDocument[]> {
    const query = GapReevaluationModel.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      gapId: new mongoose.Types.ObjectId(gapId),
    })
      .sort({ createdAt: -1 });
    if (redactSensitive) {
      query.select("_id result notes createdAt");
    }
    return query.exec();
  }

  async getMetrics(tenantId: string, visibility?: KnowledgeGapVisibility): Promise<{
    totalGaps: number;
    byStatus: Record<GapStatus, number>;
    bySeverity: Record<GapSeverity, number>;
    bySource: Record<GapSource, number>;
    byDepartment: Record<string, number>;
    topUnresolved: KnowledgeGapDocument[];
    resolutionRate: number;
  }> {
    const tenantObjId = new mongoose.Types.ObjectId(tenantId);

    const visibilityQuery = visibility
      ? buildKnowledgeGapVisibilityQuery(visibility)
      : {};
    const baseQuery = { tenantId: tenantObjId, ...visibilityQuery };
    const [allGaps, topUnresolved] = await Promise.all([
      KnowledgeGapModel.find(baseQuery).exec(),
      KnowledgeGapModel.find({
        ...baseQuery,
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
