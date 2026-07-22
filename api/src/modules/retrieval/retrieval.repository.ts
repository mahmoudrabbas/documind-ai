import mongoose from "mongoose";
import DocumentChunkModel, {
  type DocumentChunkDocument,
} from "../../db/models/documentChunk.model.js";
import DocumentVersionModel from "../../db/models/documentVersion.model.js";
import DocumentModel from "../../db/models/document.model.js";
import {
  tenantScopedFind,
  tenantScopedFindById,
} from "../../db/repositories/tenantScopedRepository.js";
import type { AdapterFilter } from "../../providers/embedding/adapterFilter.types.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface RetrievalRepository {
  findChunksByFilter(
    tenantId: string,
    filter: AdapterFilter,
    page: number,
    pageSize: number,
  ): Promise<DocumentChunkDocument[]>;

  countChunksByFilter(
    tenantId: string,
    filter: AdapterFilter,
  ): Promise<number>;

  findChunksByIds(
    tenantId: string,
    chunkIds: string[],
  ): Promise<DocumentChunkDocument[]>;

  getDocumentVersionFilter(
    tenantId: string,
  ): Promise<Partial<AdapterFilter>>;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Converts an AdapterFilter to a Mongoose query predicate object.
 *
 * Field mapping:
 *   - `tenantId`           → injected by tenantScopedFind, not included here
 *   - `allowAiUse`         → `{ allowAiUse }`          (when defined)
 *   - `classification`     → passthrough `{ $in: ... }`
 *   - `department`         → passthrough `{ $in: ... }`
 *   - `category`           → passthrough `{ $in: ... }`
 *   - `documentIds`        → `{ documentId: { $in } }` (snake → camelCase)
 *   - `documentVersionId`  → `{ documentVersionId }`   (exact match)
 */
function adapterFilterToMongoose(filter: AdapterFilter): Record<string, unknown> {
  const mongoFilter: Record<string, unknown> = {};

  if (filter.allowAiUse !== undefined) {
    mongoFilter.allowAiUse = filter.allowAiUse;
  }

  if (filter.classification !== undefined) {
    mongoFilter.classification = filter.classification;
  }

  if (filter.department !== undefined) {
    mongoFilter.department = filter.department;
  }

  if (filter.category !== undefined) {
    mongoFilter.category = filter.category;
  }

  if (filter.documentIds !== undefined && filter.documentIds.length > 0) {
    mongoFilter.documentId = { $in: filter.documentIds };
  }

  if (filter.documentVersionId !== undefined) {
    mongoFilter.documentVersionId = filter.documentVersionId;
  }

  return mongoFilter;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createRetrievalRepository(): RetrievalRepository {
  return {
    async findChunksByFilter(tenantId, filter, page, pageSize) {
      const mongooseFilter = adapterFilterToMongoose(filter);
      const skip = (page - 1) * pageSize;

      const results = await tenantScopedFind(
        DocumentChunkModel,
        tenantId,
        mongooseFilter,
      )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean<DocumentChunkDocument[]>()
        .exec();

      return results;
    },

    async countChunksByFilter(tenantId, filter) {
      const mongooseFilter = adapterFilterToMongoose(filter);

      const count = await tenantScopedFind(
        DocumentChunkModel,
        tenantId,
        mongooseFilter,
      )
        .countDocuments()
        .exec();

      return count;
    },

    async findChunksByIds(tenantId, chunkIds) {
      const results: DocumentChunkDocument[] = [];

      for (const chunkId of chunkIds) {
        const chunk = await tenantScopedFindById(
          DocumentChunkModel,
          tenantId,
          chunkId,
        )
          .lean<DocumentChunkDocument | null>()
          .exec();

        if (chunk !== null) {
          results.push(chunk);
        }
      }

      return results;
    },

    async getDocumentVersionFilter(tenantId) {
      // 1. Collect active (non-soft-deleted) documents for this tenant
      const activeDocs = await DocumentModel.find(
        { tenantId, deletedAt: null },
        { _id: 1 },
      )
        .lean()
        .exec();

      const docIds = activeDocs.map((doc) => doc._id);

      if (docIds.length === 0) {
        return { documentVersionId: "__no_versions__" } as Partial<AdapterFilter>;
      }

      // 2. Fetch all versions for active documents, newest first
      const versions = await tenantScopedFind(
        DocumentVersionModel,
        tenantId,
        { documentId: { $in: docIds } } as Record<string, unknown>,
      )
        .sort({ version: -1 })
        .lean()
        .exec();

      // 3. Deduplicate — keep the first (latest) version per document
      const seenDocs = new Set<string>();
      const latestVersionIds: string[] = [];

      for (const version of versions as Array<{
        documentId: mongoose.Types.ObjectId;
        _id: mongoose.Types.ObjectId;
      }>) {
        const docIdStr = version.documentId.toString();
        if (!seenDocs.has(docIdStr)) {
          seenDocs.add(docIdStr);
          latestVersionIds.push(version._id.toString());
        }
      }

      if (latestVersionIds.length === 0) {
        return { documentVersionId: "__no_versions__" } as Partial<AdapterFilter>;
      }

      // adapterFilterToMongoose passes documentVersionId through to Mongoose,
      // which handles $in queries on ObjectId fields. The cast is required
      // because AdapterFilter types documentVersionId as string, but at the
      // Mongoose query level we support $in for multiple version IDs.
      return { documentVersionId: { $in: latestVersionIds } } as unknown as Partial<AdapterFilter>;
    },
  };
}
