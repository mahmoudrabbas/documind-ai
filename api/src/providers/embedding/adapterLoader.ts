import type { VectorStoreAdapter } from "./vectorStoreAdapter.js";
import type { KeywordAdapter } from "./keywordAdapter.js";
import { logger } from "../../common/logger/logger.js";

let vectorAdapter: VectorStoreAdapter | null = null;
let keywordAdapt: KeywordAdapter | null = null;

function shouldUseRealAdapters(): boolean {
  if (process.env.NODE_ENV === "test") return false;
  const aiProvider = process.env.AI_PROVIDER;
  return !!aiProvider && aiProvider !== "fake";
}

export async function getVectorStoreAdapter(): Promise<VectorStoreAdapter> {
  if (vectorAdapter) return vectorAdapter;

  if (shouldUseRealAdapters() && process.env.MONGODB_URI) {
    try {
      const { AtlasVectorStoreAdapter } = await import("./atlasVectorStoreAdapter.js");
      vectorAdapter = new AtlasVectorStoreAdapter();
      logger.info("Vector store adapter: Atlas Vector Search");
      return vectorAdapter;
    } catch (err) {
      logger.warn({ err }, "Failed to load AtlasVectorStoreAdapter, falling back to fake");
    }
  }

  const { FakeVectorStoreAdapter } = await import("./fakeVectorStoreAdapter.js");
  vectorAdapter = new FakeVectorStoreAdapter();
  logger.info("Vector store adapter: Fake (development/test)");
  return vectorAdapter;
}

export async function getKeywordAdapter(): Promise<KeywordAdapter> {
  if (keywordAdapt) return keywordAdapt;

  if (shouldUseRealAdapters() && process.env.MONGODB_URI) {
    try {
      const { AtlasKeywordSearchAdapter } = await import("./atlasKeywordSearchAdapter.js");
      keywordAdapt = new AtlasKeywordSearchAdapter();
      logger.info("Keyword adapter: Atlas Search");
      return keywordAdapt;
    } catch (err) {
      logger.warn({ err }, "Failed to load AtlasKeywordSearchAdapter, falling back to fake");
    }
  }

  const { FakeKeywordAdapter } = await import("./fakeKeywordAdapter.js");
  keywordAdapt = new FakeKeywordAdapter();
  logger.info("Keyword adapter: Fake (development/test)");
  return keywordAdapt;
}

export function setVectorStoreAdapter(adapter: VectorStoreAdapter): void {
  vectorAdapter = adapter;
}

export function setKeywordAdapter(adapter: KeywordAdapter): void {
  keywordAdapt = adapter;
}

export function resetVectorStoreAdapter(): void {
  vectorAdapter = null;
}

export function resetKeywordAdapter(): void {
  keywordAdapt = null;
}
