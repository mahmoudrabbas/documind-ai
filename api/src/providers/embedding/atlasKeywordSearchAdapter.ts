import { MongoClient, ObjectId, type Document, type Db } from "mongodb";
import type { KeywordAdapter } from "./keywordAdapter.js";
import type { AdapterFilter } from "./adapterFilter.types.js";
import { logger } from "../../common/logger/logger.js";

const ATLAS_TEXT_INDEX_NAME = "kidx_chunk_text_v1";
const COLLECTION_NAME = "documentchunks";

export class AtlasKeywordSearchAdapter implements KeywordAdapter {
  readonly providerKey = "atlas-search";

  private client: MongoClient | null = null;

  async search(query: {
    queryText: string;
    topK: number;
    filter: AdapterFilter;
    signal?: AbortSignal;
  }): Promise<{ chunkId: string; score: number }[]> {
    const db = await this.getDb();
    const collection = db.collection(COLLECTION_NAME);

    const compoundFilter: Document[] = [
      { in: { path: "tenantId", value: [new ObjectId(query.filter.tenantId)] } },
    ];

    if (query.filter.documentIds && query.filter.documentIds.length > 0) {
      compoundFilter.push({
        in: {
          path: "documentId",
          value: query.filter.documentIds.map((id) => new ObjectId(id)),
        },
      });
    }

    if (query.filter.classification) {
      compoundFilter.push({
        in: {
          path: "classification",
          value: query.filter.classification.$in,
        },
      });
    }

    if (query.filter.department) {
      compoundFilter.push({
        in: {
          path: "department",
          value: query.filter.department.$in,
        },
      });
    }

    if (query.filter.category) {
      compoundFilter.push({
        in: {
          path: "category",
          value: query.filter.category.$in,
        },
      });
    }

    if (query.filter.allowAiUse === false) {
      compoundFilter.push({
        equals: {
          path: "allowAiUse",
          value: false,
        },
      });
    }

    const pipeline: Document[] = [
      {
        $search: {
          index: ATLAS_TEXT_INDEX_NAME,
          text: {
            query: query.queryText,
            path: "text",
          },
          compound: {
            filter: compoundFilter,
          },
        },
      },
      { $limit: query.topK },
      {
        $addFields: {
          score: { $meta: "searchScore" },
        },
      },
      {
        $project: {
          chunkId: "$_id",
          score: 1,
        },
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();

    return results.map((doc) => ({
      chunkId: doc.chunkId?.toString() ?? "",
      score: doc.score as number,
    }));
  }

  async indexChunks(
    _chunks: {
      chunkId: string;
      text: string;
      metadata: Record<string, unknown>;
    }[],
  ): Promise<void> {
    // Writes handled by the indexing pipeline (workers), not retrieval
  }

  async removeChunks(
    filter: Pick<AdapterFilter, "tenantId" | "documentIds">,
  ): Promise<void> {
    const db = await this.getDb();
    const collection = db.collection(COLLECTION_NAME);

    const deleteFilter: Document = { tenantId: new ObjectId(filter.tenantId) };
    if (filter.documentIds && filter.documentIds.length > 0) {
      deleteFilter.documentId = { $in: filter.documentIds.map((id) => new ObjectId(id)) };
    }

    const result = await collection.deleteMany(deleteFilter);
    logger.info({ tenantId: filter.tenantId, deletedCount: result.deletedCount }, "AtlasKeywordSearchAdapter.removeChunks");
  }

  private async getDb(): Promise<Db> {
    if (!this.client) {
      const uri = process.env.MONGODB_URI;
      if (!uri) throw new Error("MONGODB_URI is required for AtlasKeywordSearchAdapter");
      this.client = new MongoClient(uri);
      await this.client.connect();
      logger.info("AtlasKeywordSearchAdapter connected to MongoDB");
    }
    return this.client.db();
  }
}
