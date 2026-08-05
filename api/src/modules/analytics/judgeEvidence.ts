import type { MessageSource } from "../../db/models/message.model.js";
import type { DocumentChunkDocument } from "../../db/models/documentChunk.model.js";
import DocumentChunkModel from "../../db/models/documentChunk.model.js";
import { DocumentAccessAuthorizationService } from "../document-access/documentAccess.authorization.service.js";
import { JUDGE_EVIDENCE_LIMITS } from "./llmJudge.types.js";
import type { JudgeEvidence } from "./llmJudge.types.js";

/**
 * Reloads the persisted source metadata of an assistant message into the
 * full text evidence needed by the judge, enforcing document-level AI-use
 * authorization and a deterministic evidence budget.
 *
 * Sources are preserved in the order they were persisted on the message so
 * judge inputs are stable across runs. Any document the submitting user is no
 * longer allowed to use in AI is dropped silently (mirrors retrieval).
 */

export interface JudgeEvidenceLoader {
  load(context: JudgeEvidenceContext, sources: readonly MessageSource[]): Promise<JudgeEvidence[]>;
}

export interface JudgeEvidenceContext {
  tenantId: string;
  actorId: string;
}

export interface JudgeEvidenceLimits {
  maxChunks: number;
  maxCharsPerChunk: number;
  maxTotalChars: number;
}

export interface JudgeEvidenceLoaderDeps {
  documentAuthorization: Pick<DocumentAccessAuthorizationService, "authorizeDocumentAction">;
  limits?: JudgeEvidenceLimits;
  findChunksByIds?: (tenantId: string, chunkIds: string[]) => Promise<DocumentChunkDocument[]>;
}

async function findChunksByIds(tenantId: string, chunkIds: string[]) {
  return DocumentChunkModel.find({
    _id: { $in: chunkIds },
    tenantId,
  }).lean();
}

export class DefaultJudgeEvidenceLoader implements JudgeEvidenceLoader {
  private readonly documentAuthorization: Pick<DocumentAccessAuthorizationService, "authorizeDocumentAction">;
  private readonly limits: JudgeEvidenceLimits;
  private readonly findChunksByIds: (tenantId: string, chunkIds: string[]) => Promise<DocumentChunkDocument[]>;

  constructor(deps: JudgeEvidenceLoaderDeps) {
    this.documentAuthorization = deps.documentAuthorization;
    this.limits = deps.limits ?? JUDGE_EVIDENCE_LIMITS;
    this.findChunksByIds = deps.findChunksByIds ?? findChunksByIds;
  }

  async load(context: JudgeEvidenceContext, sources: readonly MessageSource[]): Promise<JudgeEvidence[]> {
    if (sources.length === 0) return [];

    const uniqueSources: MessageSource[] = [];
    const seenChunkIds = new Set<string>();
    for (const source of sources) {
      if (!source?.chunkId) continue;
      const chunkId = source.chunkId.toString();
      if (seenChunkIds.has(chunkId)) continue;
      seenChunkIds.add(chunkId);
      uniqueSources.push(source);
    }

    const chunkIdList = uniqueSources.map((source) => source.chunkId.toString());
    const chunks = await this.findChunksByIds(context.tenantId, chunkIdList);

    const chunksById = new Map<string, DocumentChunkDocument>(chunks.map((chunk) => [chunk._id.toString(), chunk]));
    const documentsById = new Map<string, { chunkId: string; documentId: string }[]>();
    for (const chunk of chunks) {
      const documentId = chunk.documentId.toString();
      const entries = documentsById.get(documentId) ?? [];
      entries.push({ chunkId: chunk._id.toString(), documentId });
      documentsById.set(documentId, entries);
    }

    const authorizedChunkIds = new Set<string>();
    await Promise.all(
      [...documentsById.entries()].map(async ([documentId, entries]) => {
        try {
          await this.documentAuthorization.authorizeDocumentAction(context, documentId, "use_in_ai");
          for (const entry of entries) authorizedChunkIds.add(entry.chunkId);
        } catch {
          // Document-level AI-use no longer permitted: drop its chunks.
        }
      }),
    );

    const evidence: JudgeEvidence[] = [];
    let totalChars = 0;
    for (const source of uniqueSources) {
      if (evidence.length >= this.limits.maxChunks) break;
      const chunkId = source.chunkId.toString();
      const chunk = chunksById.get(chunkId);
      if (!chunk || !authorizedChunkIds.has(chunkId)) continue;
      if (totalChars >= this.limits.maxTotalChars) break;

      const rawText = typeof chunk.text === "string" ? chunk.text : "";
      const normalized = rawText.trim();
      if (normalized.length === 0) continue;
      const text =
        normalized.length > this.limits.maxCharsPerChunk
          ? `${normalized.slice(0, this.limits.maxCharsPerChunk)}…`
          : normalized;
      if (totalChars + text.length > this.limits.maxTotalChars) break;

      totalChars += text.length;
      evidence.push({
        chunkId,
        documentId: chunk.documentId.toString(),
        documentTitle: source.documentTitle || "Untitled document",
        sectionTitle: source.sectionTitle ?? chunk.sectionTitle ?? undefined,
        pageNumber: source.pageNumber ?? chunk.pageNumber ?? undefined,
        text,
      });
    }

    return evidence;
  }
}
