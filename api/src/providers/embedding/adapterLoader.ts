import type { VectorStoreAdapter } from "./vectorStoreAdapter.js";
import type { KeywordAdapter } from "./keywordAdapter.js";
import { logger } from "../../common/logger/logger.js";

let vectorAdapter: VectorStoreAdapter | null = null;
let keywordAdapt: KeywordAdapter | null = null;

export async function getVectorStoreAdapter(): Promise<VectorStoreAdapter> {
  if (vectorAdapter) return vectorAdapter;

  const { FakeVectorStoreAdapter } = await import("./fakeVectorStoreAdapter.js");
  vectorAdapter = new FakeVectorStoreAdapter() as VectorStoreAdapter;
  logger.info("Vector store adapter: Fake (development/test)");

  return vectorAdapter as VectorStoreAdapter;
}

export async function getKeywordAdapter(): Promise<KeywordAdapter> {
  if (keywordAdapt) return keywordAdapt;

  const { FakeKeywordAdapter } = await import("./fakeKeywordAdapter.js");
  keywordAdapt = new FakeKeywordAdapter() as KeywordAdapter;
  logger.info("Keyword adapter: Fake (development/test)");

  return keywordAdapt as KeywordAdapter;
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
