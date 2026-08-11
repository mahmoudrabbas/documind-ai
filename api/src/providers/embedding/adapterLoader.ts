import type { VectorStoreAdapter } from "./vectorStoreAdapter.js";
import type { KeywordAdapter } from "./keywordAdapter.js";
import { logger } from "../../common/logger/logger.js";

let vectorAdapter: VectorStoreAdapter | null = null;
let keywordAdapt: KeywordAdapter | null = null;

export function shouldUseRealAdapters(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  // Search storage is selected independently from the chat/embedding model.
  // A real MongoDB-backed runtime must query the same Atlas indexes populated
  // by processing even when the legacy AI_PROVIDER switch is absent. Tests
  // inject deterministic in-memory adapters explicitly.
  return env.NODE_ENV !== "test" && Boolean(env.MONGODB_URI?.trim());
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
      logger.error({ err }, "Failed to load AtlasVectorStoreAdapter");
      throw err;
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
      logger.error({ err }, "Failed to load AtlasKeywordSearchAdapter");
      throw err;
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
