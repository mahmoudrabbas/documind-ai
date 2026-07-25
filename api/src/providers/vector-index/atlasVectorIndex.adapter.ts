import { MongoClient, type Document } from "mongodb";
import type {
  VectorSearchInput,
  VectorSearchResult,
  VectorIndex,
} from "./vectorIndex.port.js";

const ATLAS_INDEX_NAME = "vidx_chunk_embeddings_v1";

export class AtlasVectorIndexAdapter implements VectorIndex {
  readonly indexName = ATLAS_INDEX_NAME;

  private model: string;
  private dimensions: number;
  private client: MongoClient | null = null;

  constructor(model: string, dimensions: number) {
    this.model = model;
    this.dimensions = dimensions;
  }

  async search(input: VectorSearchInput): Promise<VectorSearchResult[]> {
    const db = await this.getDb();
    const collection = db.collection("chunkembeddings");

    const pipeline: Document[] = [
      {
        $vectorSearch: {
          index: this.indexName,
          path: "vector",
          queryVector: input.vector,
          numCandidates: input.topK * 10,
          limit: input.topK,
          filter: {
            tenantId: input.tenantId,
            generationId: input.generationId,
            ...(input.filters?.documentId && { documentId: input.filters.documentId }),
            ...(input.filters?.department && { department: input.filters.department }),
            ...(input.filters?.classification && { classification: input.filters.classification }),
            ...(input.filters?.language && { language: input.filters.language }),
            ...(input.filters?.contentType && { contentType: input.filters.contentType }),
          },
        },
      },
      {
        $addFields: {
          score: { $meta: "vectorSearchScore" },
        },
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();

    return results.map((doc: Record<string, unknown>) => ({
      chunkId: (doc.chunkId as { toString(): string }).toString(),
      documentId: (doc.documentId as { toString(): string }).toString(),
      generationId: (doc.generationId as { toString(): string }).toString(),
      similarityScore: doc.score as number,
      text: "",
      sectionPath: [],
      pageStart: 1,
      pageEnd: 1,
      contentType: (doc.contentType as string) || "paragraph",
      language: (doc.language as string) || "en",
    }));
  }

  async ensureIndex(dimensions: number): Promise<void> {
    const db = await this.getDb();
    const collection = db.collection("chunkembeddings");

    try {
      const existing = await collection.listSearchIndexes().toArray() as Array<{ name: string; status?: string }>;
      const found = existing.find((idx) => idx.name === this.indexName);
      if (found && found.status === "READY") return;
    } catch {
      // listSearchIndexes may not be available in all environments
    }

    await collection.createSearchIndex({
      name: this.indexName,
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            vector: {
              type: "knnVector",
              dimensions,
              similarity: "cosine",
            },
            tenantId: { type: "objectId" },
            generationId: { type: "objectId" },
            documentId: { type: "objectId" },
            department: { type: "string" },
            classification: { type: "string" },
            accessPolicyVersion: { type: "string" },
            language: { type: "string" },
            contentType: { type: "string" },
          },
        },
      },
    });
  }

  async getIndexStatus(): Promise<{ exists: boolean; status: string }> {
    const db = await this.getDb();
    const collection = db.collection("chunkembeddings");

    try {
      const indexes = await collection.listSearchIndexes().toArray() as Array<{ name: string; status?: string }>;
      const found = indexes.find((idx) => idx.name === this.indexName);
      if (!found) return { exists: false, status: "NOT_FOUND" };
      return { exists: true, status: found.status || "UNKNOWN" };
    } catch {
      return { exists: false, status: "UNKNOWN" };
    }
  }

  private async getDb(): Promise<ReturnType<MongoClient["db"]>> {
    if (!this.client) {
      const uri = process.env.MONGODB_URI;
      if (!uri) throw new Error("MONGODB_URI is required for AtlasVectorIndexAdapter");
      this.client = new MongoClient(uri);
      await this.client.connect();
    }
    return this.client.db();
  }
}
