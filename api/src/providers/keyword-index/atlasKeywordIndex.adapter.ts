import { MongoClient, type Document } from "mongodb";
import type {
  KeywordSearchInput,
  KeywordSearchResult,
  KeywordIndex,
} from "./keywordIndex.port.js";

const ATLAS_TEXT_INDEX_NAME = "kidx_chunk_text_v1";

export class AtlasKeywordIndexAdapter implements KeywordIndex {
  private client: MongoClient | null = null;

  async search(input: KeywordSearchInput): Promise<KeywordSearchResult[]> {
    const db = await this.getDb();
    const collection = db.collection("documentchunks");

    const pipeline: Document[] = [
      {
        $search: {
          index: ATLAS_TEXT_INDEX_NAME,
          text: {
            query: input.query,
            path: "text",
          },
          compound: {
            filter: [
              { equals: { path: "tenantId", value: input.tenantId } },
              { equals: { path: "generationId", value: input.generationId } },
              ...(input.filters?.documentId
                ? [{ equals: { path: "documentId", value: input.filters.documentId } }]
                : []),
            ],
          },
        },
      },
      { $limit: input.topK },
      {
        $addFields: {
          score: { $meta: "searchScore" },
        },
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();

    return results.map((doc: Record<string, unknown>) => ({
      chunkId: (doc._id as { toString(): string }).toString(),
      documentId: (doc.documentId as { toString(): string }).toString(),
      generationId: (doc.generationId as { toString(): string }).toString(),
      score: doc.score as number,
      text: (doc.text as string) || "",
      sectionPath: (doc.sectionPath as string[]) || [],
      pageStart: (doc.pageStart as number) || 1,
      pageEnd: (doc.pageEnd as number) || 1,
      contentType: (doc.contentType as string) || "paragraph",
      language: (doc.language as string) || "en",
    }));
  }

  async ensureIndex(): Promise<void> {
    const db = await this.getDb();
    const collection = db.collection("documentchunks");

    try {
      await collection.createSearchIndex({
        name: ATLAS_TEXT_INDEX_NAME,
        definition: {
          mappings: {
            dynamic: false,
            fields: {
              text: { type: "string" },
              tenantId: { type: "objectId" },
              generationId: { type: "objectId" },
              documentId: { type: "objectId" },
            },
          },
        },
      });
    } catch {
      // Index may already exist
    }
  }

  async getIndexStatus(): Promise<{ exists: boolean; status: string }> {
    const db = await this.getDb();
    const collection = db.collection("documentchunks");

    try {
      const indexes = await collection.listSearchIndexes().toArray() as Array<{ name: string; status?: string }>;
      const found = indexes.find((idx) => idx.name === ATLAS_TEXT_INDEX_NAME);
      if (!found) return { exists: false, status: "NOT_FOUND" };
      return { exists: true, status: found.status || "UNKNOWN" };
    } catch {
      return { exists: false, status: "UNKNOWN" };
    }
  }

  private async getDb(): Promise<ReturnType<MongoClient["db"]>> {
    if (!this.client) {
      const uri = process.env.MONGODB_URI;
      if (!uri) throw new Error("MONGODB_URI is required for AtlasKeywordIndexAdapter");
      this.client = new MongoClient(uri);
      await this.client.connect();
    }
    return this.client.db();
  }
}
