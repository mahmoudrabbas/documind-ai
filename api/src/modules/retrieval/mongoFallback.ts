import { Types } from "mongoose";
import { logger } from "../../common/logger/logger.js";
import DocumentChunkModel from "../../db/models/documentChunk.model.js";
import type { AdapterFilter } from "../../providers/embedding/adapterFilter.types.js";

export interface MongoFallbackSearchInput {
  queryText: string;
  vector: number[];
  topK: number;
  filter: AdapterFilter;
}

export interface MongoFallback {
  search(input: MongoFallbackSearchInput): Promise<{ chunkId: string; score: number }[]>;
}

const QUERY_TOKEN_MAX = 64;

function tokenize(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1);
  const unique = new Set(tokens);
  return [...unique].slice(0, QUERY_TOKEN_MAX);
}

function cosine(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Local-only fallback that runs a cosine-similarity + keyword scan over
 * persisted ACTIVE DocumentChunk rows in MongoDB. It is wired in when the
 * configured vector/keyword adapters are the in-memory fake adapters, which
 * are empty on every process boot and therefore cannot answer queries without
 * this fallback.
 */
export function createMongoFallback(): MongoFallback {
  return {
    async search({ queryText, vector, topK, filter }) {
      const query: Record<string, unknown> = {
        tenantId: new Types.ObjectId(filter.tenantId),
        status: "ACTIVE",
        allowAiUse: true,
      };
      if (filter.classification?.$in?.length) {
        query.classification = { $in: filter.classification.$in };
      }
      if (filter.department?.$in?.length) {
        query.department = { $in: filter.department.$in };
      }
      if (filter.category?.$in?.length) {
        query.category = { $in: filter.category.$in };
      }
      if (filter.documentIds?.length) {
        query.documentId = { $in: filter.documentIds.map((id) => new Types.ObjectId(id)) };
      }

      const chunks = await DocumentChunkModel.find(query)
        .select({ _id: 1, text: 1, vector: 1 })
        .lean()
        .limit(500)
        .exec();

      const queryTokens = tokenize(queryText);

      const scored = chunks
        .map((chunk) => {
          const text = chunk.text ?? "";
          let keywordHits = 0;
          for (const token of queryTokens) {
            if (text.toLowerCase().includes(token)) keywordHits++;
          }
          const keywordScore = queryTokens.length > 0 ? keywordHits / queryTokens.length : 0;
          const vectorScore = chunk.vector?.length ? cosine(vector, chunk.vector) : 0;
          const score = vectorScore > 0 ? 0.7 * vectorScore + 0.3 * keywordScore : keywordScore;
          return { chunkId: chunk._id.toString(), score };
        })
        .filter((c) => c.score > 0);

      scored.sort((a, b) => b.score - a.score);

      if (chunks.length > 0) {
        logger.info(
          { tenantId: filter.tenantId, candidates: chunks.length },
          "Mongo fallback scan completed",
        );
      }

      return scored.slice(0, topK);
    },
  };
}
