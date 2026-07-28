import { AppError } from "../../common/errors/AppError.js";
import {
  NOT_FOUND,
  BAD_REQUEST,
} from "../../common/errors/errorCodes.js";
import { MongoAuditWriter } from "../../common/observability/auditWriter.js";
import { knowledgeGapsRepository, KnowledgeGapsRepository } from "./knowledge-gaps.repository.js";
import type { KnowledgeGapDocument } from "../../db/models/knowledgeGap.model.js";
import { normalizeQuestion, generateClusterKey } from "./knowledge-gaps.clustering.js";
import type { KnowledgeGapAgentPort } from "./knowledge-gaps.agent.js";
import { FakeKnowledgeGapAgent } from "./knowledge-gaps.agent.fake.js";
import type { KnowledgeGapReevaluationPort } from "./knowledge-gaps.reevaluation.port.js";
import { FakeKnowledgeGapReevaluationAdapter } from "./knowledge-gaps.reevaluation.port.js";
import type {
  ReportGapCandidateInput,
  ListGapsQueryInput,
  AssignGapInput,
  ResolveGapInput,
  DismissGapInput,
  MergeGapsInput,
  SplitGapInput,
  LinkDocumentsInput,
} from "./knowledge-gaps.dto.js";

const auditWriter = new MongoAuditWriter();

export class KnowledgeGapsService {
  constructor(
    private repo: KnowledgeGapsRepository = knowledgeGapsRepository,
    private agent: KnowledgeGapAgentPort = new FakeKnowledgeGapAgent(),
    private reevaluator: KnowledgeGapReevaluationPort = new FakeKnowledgeGapReevaluationAdapter(),
  ) {}

  async reportCandidate(tenantId: string, actorId: string, input: ReportGapCandidateInput) {
    const normalizedText = input.normalizedIntent || normalizeQuestion(input.question);
    const clusterKey = generateClusterKey(normalizedText);

    // 1. Check if a matching gap already exists for this tenant & cluster key
    const existingGap = await this.repo.findByClusterKey(tenantId, clusterKey);

    // Get proposal from Knowledge Gap Agent
    const proposal = await this.agent.proposeGapAnalysis({
      question: input.question,
      normalizedIntent: normalizedText,
      outcome: input.outcome,
      category: input.category,
      confidence: input.confidence,
      evidenceSummaryIds: input.evidenceSummaryIds,
      actorDepartment: input.actorDepartment,
    });

    if (existingGap) {
      const gapIdStr = String(existingGap._id);
      // Increment occurrence count & update category/severity if higher
      const updated = await this.repo.incrementOccurrence(tenantId, gapIdStr, actorId, {
        category: input.category,
        severity: proposal.severity,
      });

      await this.repo.createOccurrence({
        tenantId,
        gapId: gapIdStr,
        question: input.question,
        normalizedIntent: normalizedText,
        outcome: input.outcome,
        category: input.category,
        confidence: input.confidence,
        evidenceSummaryIds: input.evidenceSummaryIds,
        conversationId: input.conversationId,
        messageId: input.messageId,
        actorId: actorId !== "system" ? actorId : undefined,
        actorDepartment: input.actorDepartment,
        traceId: input.traceId,
      });

      await auditWriter.write({
        tenantId,
        actorId: actorId !== "system" ? actorId : undefined,
        action: "KNOWLEDGE_GAP_CREATED",
        resourceType: "KnowledgeGap",
        resourceId: gapIdStr,
        outcome: "SUCCESS",
        metadata: { recurrence: true, occurrenceCount: (updated?.occurrenceCount ?? 1) },
      });

      return updated;
    }

    // 3. Create new KnowledgeGap record
    const source = input.outcome === "negative_feedback" ? "negative_feedback" : "refusal";

    const newGap = await this.repo.createGap({
      tenantId,
      topic: proposal.topic,
      representativeQuestion: input.question,
      normalizedIntent: normalizedText,
      department: proposal.department || input.actorDepartment || undefined,
      severity: proposal.severity,
      clusterKey,
      source,
      sourceMetadata: {
        outcome: input.outcome,
        category: input.category,
        confidence: input.confidence,
        evidenceSummaryIds: input.evidenceSummaryIds,
        conflictType: input.conflictType,
      },
      agentProposal: {
        topic: proposal.topic,
        severity: proposal.severity,
        department: proposal.department,
        suggestedAction: proposal.suggestedAction,
        requiredDocumentType: proposal.requiredDocumentType,
        duplicateGapId: null,
        confidence: proposal.confidence,
        reasoning: proposal.reasoning,
      },
      auditActorId: actorId,
    });

    const newGapIdStr = String(newGap._id);
    // 4. Create first occurrence record
    await this.repo.createOccurrence({
      tenantId,
      gapId: newGapIdStr,
      question: input.question,
      normalizedIntent: normalizedText,
      outcome: input.outcome,
      confidence: input.confidence,
      evidenceSummaryIds: input.evidenceSummaryIds,
      conversationId: input.conversationId,
      messageId: input.messageId,
      actorId: actorId !== "system" ? actorId : undefined,
      actorDepartment: input.actorDepartment,
      traceId: input.traceId,
    });

    await auditWriter.write({
      tenantId,
      actorId: actorId !== "system" ? actorId : undefined,
      action: "KNOWLEDGE_GAP_CREATED",
      resourceType: "KnowledgeGap",
      resourceId: newGapIdStr,
      outcome: "SUCCESS",
      changes: { topic: newGap.topic, severity: newGap.severity, source: newGap.source },
    });

    return newGap;
  }

  async listGaps(tenantId: string, query: ListGapsQueryInput) {
    return this.repo.findGaps({ tenantId, ...query });
  }

  async getGapById(tenantId: string, gapId: string) {
    const gap = await this.repo.findGapById(tenantId, gapId);
    if (!gap) {
      throw new AppError(404, NOT_FOUND, "Knowledge gap not found");
    }
    return gap;
  }

  async assignGap(tenantId: string, gapId: string, actorId: string, input: AssignGapInput) {
    const gap = await this.getGapById(tenantId, gapId);

    const updates: Record<string, unknown> = {
      assigneeId: input.assigneeId,
      status: gap.status === "open" ? "assigned" : gap.status,
    };
    if (input.dueDate !== undefined) {
      updates.dueDate = input.dueDate ? new Date(input.dueDate) : null;
    }

    const updated = await this.repo.updateGap(tenantId, gapId, updates as Partial<KnowledgeGapDocument>, {
      action: "ASSIGNED",
      actorId,
      changes: { assigneeId: input.assigneeId, dueDate: input.dueDate },
    });

    await auditWriter.write({
      tenantId,
      actorId,
      action: "KNOWLEDGE_GAP_ASSIGNED",
      resourceType: "KnowledgeGap",
      resourceId: gapId,
      outcome: "SUCCESS",
      changes: { assigneeId: input.assigneeId },
    });

    return updated;
  }

  async resolveGap(tenantId: string, gapId: string, actorId: string, input: ResolveGapInput) {
    const gap = await this.getGapById(tenantId, gapId);
    if (gap.status === "resolved") {
      throw new AppError(400, BAD_REQUEST, "Knowledge gap is already resolved");
    }

    const updates = {
      status: "resolved" as const,
      resolutionNotes: input.resolutionNotes,
      linkedDocumentIds: Array.from(new Set([...gap.linkedDocumentIds.map((id) => id.toString()), ...input.linkedDocumentIds])),
      resolvedBy: actorId !== "system" ? actorId : null,
      resolvedAt: new Date(),
    };

    const updated = await this.repo.updateGap(tenantId, gapId, updates as unknown as Partial<KnowledgeGapDocument>, {
      action: "RESOLVED",
      actorId,
      changes: { resolutionNotes: input.resolutionNotes, linkedDocumentIds: input.linkedDocumentIds },
    });

    await auditWriter.write({
      tenantId,
      actorId,
      action: "KNOWLEDGE_GAP_RESOLVED",
      resourceType: "KnowledgeGap",
      resourceId: gapId,
      outcome: "SUCCESS",
    });

    return updated;
  }

  async dismissGap(tenantId: string, gapId: string, actorId: string, input: DismissGapInput) {
    const _gap = await this.getGapById(tenantId, gapId);

    const updates = {
      status: "dismissed" as const,
      dismissalReason: input.reason,
      dismissedBy: actorId !== "system" ? actorId : null,
      dismissedAt: new Date(),
    };

    const updated = await this.repo.updateGap(tenantId, gapId, updates as Partial<KnowledgeGapDocument>, {
      action: "DISMISSED",
      actorId,
      changes: { reason: input.reason },
    });

    await auditWriter.write({
      tenantId,
      actorId,
      action: "KNOWLEDGE_GAP_DISMISSED",
      resourceType: "KnowledgeGap",
      resourceId: gapId,
      outcome: "SUCCESS",
    });

    return updated;
  }

  async reopenGap(tenantId: string, gapId: string, actorId: string) {
    const _gap = await this.getGapById(tenantId, gapId);

    const updates = {
      status: "reopened" as const,
      resolvedBy: null,
      resolvedAt: null,
      dismissedBy: null,
      dismissedAt: null,
    };

    const updated = await this.repo.updateGap(tenantId, gapId, updates as Partial<KnowledgeGapDocument>, {
      action: "REOPENED",
      actorId,
    });

    await auditWriter.write({
      tenantId,
      actorId,
      action: "KNOWLEDGE_GAP_REOPENED",
      resourceType: "KnowledgeGap",
      resourceId: gapId,
      outcome: "SUCCESS",
    });

    return updated;
  }

  async mergeGaps(tenantId: string, actorId: string, input: MergeGapsInput) {
    const targetGap = await this.getGapById(tenantId, input.targetGapId);

    const targetGapIdStr = String(targetGap._id);
    let mergedOccurrences = 0;
    for (const sourceId of input.sourceGapIds) {
      if (sourceId === input.targetGapId) continue;

      const sourceGap = await this.repo.findGapById(tenantId, sourceId);
      if (!sourceGap) continue;

      mergedOccurrences += sourceGap.occurrenceCount;

      // Update occurrences of sourceGap to targetGap
      // Mark source gap as dismissed/merged
      await this.repo.updateGap(tenantId, sourceId, {
        status: "dismissed" as const,
        dismissalReason: `Merged into gap ${targetGapIdStr}`,
        dismissedBy: actorId !== "system" ? actorId : null,
        dismissedAt: new Date(),
      } as Partial<KnowledgeGapDocument>, {
        action: "MERGED_INTO",
        actorId,
        changes: { targetGapId: targetGapIdStr },
      });
    }

    const updatedTarget = await this.repo.updateGap(
      tenantId,
      targetGapIdStr,
      { occurrenceCount: targetGap.occurrenceCount + mergedOccurrences } as Partial<KnowledgeGapDocument>,
      { action: "MERGE_TARGET", actorId, changes: { addedOccurrences: mergedOccurrences } },
    );

    await auditWriter.write({
      tenantId,
      actorId,
      action: "KNOWLEDGE_GAP_MERGED",
      resourceType: "KnowledgeGap",
      resourceId: targetGapIdStr,
      outcome: "SUCCESS",
      changes: { mergedSourceIds: input.sourceGapIds },
    });

    return updatedTarget;
  }

  async splitGap(tenantId: string, actorId: string, gapId: string, input: SplitGapInput) {
    const originalGap = await this.getGapById(tenantId, gapId);

    const createdGaps = [];
    for (const newTopic of input.newTopics) {
      const normalizedText = normalizeQuestion(newTopic);
      const clusterKey = generateClusterKey(normalizedText);

      const newGap = await this.repo.createGap({
        tenantId,
        topic: newTopic,
        representativeQuestion: newTopic,
        normalizedIntent: normalizedText,
        department: originalGap.department || undefined,
        severity: originalGap.severity,
        clusterKey,
        source: originalGap.source,
        auditActorId: actorId,
      });

      createdGaps.push(newGap);
    }

    // Dismiss original gap
    await this.repo.updateGap(tenantId, gapId, {
      status: "dismissed" as const,
      dismissalReason: `Split into ${createdGaps.length} new gaps`,
      dismissedBy: actorId !== "system" ? actorId : null,
      dismissedAt: new Date(),
    } as Partial<KnowledgeGapDocument>, {
      action: "SPLIT",
      actorId,
      changes: { newGapIds: createdGaps.map((g) => String(g._id)) },
    });

    await auditWriter.write({
      tenantId,
      actorId,
      action: "KNOWLEDGE_GAP_SPLIT",
      resourceType: "KnowledgeGap",
      resourceId: gapId,
      outcome: "SUCCESS",
    });

    return createdGaps;
  }

  async linkDocuments(tenantId: string, gapId: string, actorId: string, input: LinkDocumentsInput) {
    const gap = await this.getGapById(tenantId, gapId);

    const updatedDocIds = Array.from(
      new Set([...gap.linkedDocumentIds.map((id) => id.toString()), ...input.documentIds]),
    );

    const updated = await this.repo.updateGap(
      tenantId,
      gapId,
      { linkedDocumentIds: updatedDocIds } as unknown as Partial<KnowledgeGapDocument>,
      { action: "DOCUMENTS_LINKED", actorId, changes: { linkedDocumentIds: input.documentIds } },
    );

    await auditWriter.write({
      tenantId,
      actorId,
      action: "KNOWLEDGE_GAP_DOCUMENTS_LINKED",
      resourceType: "KnowledgeGap",
      resourceId: gapId,
      outcome: "SUCCESS",
    });

    return updated;
  }

  async triggerReevaluation(tenantId: string, gapId: string, documentId: string, actorId: string) {
    const gap = await this.getGapById(tenantId, gapId);

    const result = await this.reevaluator.evaluateGapResolution({
      tenantId,
      gapId,
      question: gap.representativeQuestion,
      documentId,
      evaluatedBy: actorId,
    });

    const record = await this.repo.createReevaluation({
      tenantId,
      gapId,
      documentId,
      result: result.outcome,
      evidenceBefore: result.evidenceBefore,
      evidenceAfter: result.evidenceAfter,
      notes: result.notes,
      evaluatedBy: actorId,
    });

    await auditWriter.write({
      tenantId,
      actorId,
      action: "KNOWLEDGE_GAP_REEVALUATED",
      resourceType: "KnowledgeGap",
      resourceId: gapId,
      outcome: "SUCCESS",
      metadata: { result: result.outcome, documentId },
    });

    return record;
  }

  async getOccurrences(tenantId: string, gapId: string, page = 1, pageSize = 20) {
    await this.getGapById(tenantId, gapId);
    return this.repo.findOccurrences(tenantId, gapId, page, pageSize);
  }

  async getReevaluations(tenantId: string, gapId: string) {
    await this.getGapById(tenantId, gapId);
    return this.repo.findReevaluations(tenantId, gapId);
  }

  async getMetrics(tenantId: string) {
    return this.repo.getMetrics(tenantId);
  }
}

export const knowledgeGapsService = new KnowledgeGapsService();
