import { MongoClient, ObjectId, type Document, type Db } from "mongodb";
import type { VectorStoreAdapter } from "./vectorStoreAdapter.js";
import type { AdapterFilter } from "./adapterFilter.types.js";
import { logger } from "../../common/logger/logger.js";

const ATLAS_INDEX_NAME = "vidx_chunk_embeddings_v1";
const COLLECTION_NAME = "chunkembeddings";

export function buildAtlasVectorFilter(filter: AdapterFilter): Document {
  const atlasFilter: Document = { tenantId: new ObjectId(filter.tenantId) };
  if (filter.classification) atlasFilter.classification = { $in: filter.classification.$in };
  if (filter.department) atlasFilter.department = { $in: filter.department.$in };
  if (filter.category) atlasFilter.category = { $in: filter.category.$in };
  if (filter.documentIds?.length) atlasFilter.documentId = { $in: filter.documentIds.map((id) => new ObjectId(id)) };
  return atlasFilter;
}

export class AtlasVectorStoreAdapter implements VectorStoreAdapter {
  readonly providerKey = "atlas-vector-search";

  private client: MongoClient | null = null;

  async search(query: {
    vector: number[];
    topK: number;
    filter: AdapterFilter;
    signal?: AbortSignal;
  }): Promise<{ chunkId: string; score: number }[]> {
    const db = await this.getDb();
    const collection = db.collection(COLLECTION_NAME);

    const atlasFilter = buildAtlasVectorFilter(query.filter);

    const pipeline: Document[] = [
      {
        $vectorSearch: {
          index: ATLAS_INDEX_NAME,
          path: "vector",
          queryVector: query.vector,
          numCandidates: query.topK * 10,
          limit: query.topK,
          filter: atlasFilter,
        },
      },
      {
        $addFields: {
          score: { $meta: "vectorSearchScore" },
        },
      },
      {
        $project: {
          chunkId: 1,
          score: 1,
        },
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();

    return results.map((doc) => ({
      chunkId: doc.chunkId?.toString() ?? doc._id?.toString() ?? "",
      score: doc.score as number,
    }));
  }

  async storeChunks(
    _chunks: {
      chunkId: string;
      vector: number[];
      metadata: Record<string, unknown>;
    }[],
  ): Promise<void> {
    // Writes handled by the indexing pipeline (workers), not retrieval
  }

  async deleteChunks(
    filter: Pick<AdapterFilter, "tenantId" | "documentIds">,
  ): Promise<void> {
    const db = await this.getDb();
    const collection = db.collection(COLLECTION_NAME);

    const deleteFilter: Document = { tenantId: new ObjectId(filter.tenantId) };
    if (filter.documentIds && filter.documentIds.length > 0) {
      deleteFilter.documentId = { $in: filter.documentIds.map((id) => new ObjectId(id)) };
    }

    const result = await collection.deleteMany(deleteFilter);
    logger.info({ tenantId: filter.tenantId, deletedCount: result.deletedCount }, "AtlasVectorStoreAdapter.deleteChunks");
  }

  private async getDb(): Promise<Db> {
    if (!this.client) {
      const uri = process.env.MONGODB_URI;
      if (!uri) throw new Error("MONGODB_URI is required for AtlasVectorStoreAdapter");
      this.client = new MongoClient(uri);
      await this.client.connect();
      logger.info("AtlasVectorStoreAdapter connected to MongoDB");
    }
    return this.client.db();
  }
}
