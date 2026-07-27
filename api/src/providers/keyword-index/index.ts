import type { KeywordIndex } from "./keywordIndex.port.js";
import { FakeKeywordIndex } from "./fakeKeywordIndex.js";

let singleton: KeywordIndex | null = null;

export function getKeywordIndex(): KeywordIndex {
  if (singleton) return singleton;
  const index = createKeywordIndexSync();
  singleton = index;
  return singleton;
}

export function setKeywordIndex(provider: KeywordIndex | null): void {
  singleton = provider;
}

function createKeywordIndexSync(): KeywordIndex {
  const useFake = process.env.NODE_ENV === "test" || (!process.env.OPENAI_API_KEY && process.env.AI_PROVIDER !== "student-bedrock");
  if (useFake) {
    return new FakeKeywordIndex();
  }
  // Return fake for sync version, async version will create real one
  return new FakeKeywordIndex();
}

export async function getKeywordIndexAsync(): Promise<KeywordIndex> {
  if (singleton && !(singleton instanceof FakeKeywordIndex)) return singleton;
  singleton = await createKeywordIndex();
  return singleton;
}

async function createKeywordIndex(): Promise<KeywordIndex> {
  const useFake = process.env.NODE_ENV === "test" || (!process.env.OPENAI_API_KEY && process.env.AI_PROVIDER !== "student-bedrock");
  if (useFake) {
    return new FakeKeywordIndex();
  }
  const mod = await import("./atlasKeywordIndex.adapter.js");
  return new mod.AtlasKeywordIndexAdapter();
}

export type {
  KeywordSearchInput,
  KeywordSearchResult,
  KeywordIndex,
  KeywordSearchFilters,
} from "./keywordIndex.port.js";