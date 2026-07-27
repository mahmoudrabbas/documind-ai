import type { VectorIndex } from "./vectorIndex.port.js";
import { FakeVectorIndex } from "./fakeVectorIndex.js";

let singleton: VectorIndex | null = null;

export function getVectorIndex(): VectorIndex {
  if (singleton) return singleton;
  const index = createVectorIndexSync();
  singleton = index;
  return singleton;
}

export function setVectorIndex(provider: VectorIndex | null): void {
  singleton = provider;
}

function createVectorIndexSync(): VectorIndex {
  const useFake = process.env.NODE_ENV === "test" || (!process.env.OPENAI_API_KEY && process.env.AI_PROVIDER !== "student-bedrock");
  if (useFake) {
    return new FakeVectorIndex();
  }
  // Return fake for sync version, async version will create real one
  return new FakeVectorIndex();
}

export async function getVectorIndexAsync(): Promise<VectorIndex> {
  if (singleton && !(singleton instanceof FakeVectorIndex)) return singleton;
  singleton = await createVectorIndex();
  return singleton;
}

async function createVectorIndex(): Promise<VectorIndex> {
  const useFake = process.env.NODE_ENV === "test" || (!process.env.OPENAI_API_KEY && process.env.AI_PROVIDER !== "student-bedrock");
  if (useFake) {
    return new FakeVectorIndex();
  }
  const mod = await import("./atlasVectorIndex.adapter.js");
  return new mod.AtlasVectorIndexAdapter(
    process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    parseInt(process.env.OPENAI_EMBEDDING_DIMENSIONS || "1536", 10),
  );
}

export type {
  VectorSearchInput,
  VectorSearchResult,
  VectorIndex,
  VectorSearchFilters,
} from "./vectorIndex.port.js";