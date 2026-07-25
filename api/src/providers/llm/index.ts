import type { ModelAdapter } from "../../modules/agents/agents.types.js";
import { FakeModelAdapter } from "./fakeAdapters.js";

let singleton: ModelAdapter | null = null;

/**
 * Returns the configured model adapter singleton.
 * In development/test, uses FakeModelAdapter.
 * Set AI_PROVIDER=student-bedrock and SBG_API_KEY to use the Student Bedrock Gateway.
 */
export function getModelAdapter(): ModelAdapter {
  if (singleton) return singleton;
  const adapter = createModelAdapterSync();
  singleton = adapter;
  return singleton;
}

export function setModelAdapter(adapter: ModelAdapter | null): void {
  singleton = adapter;
}

function createModelAdapterSync(): ModelAdapter {
  const aiProvider = process.env.AI_PROVIDER || "fake";

  if (aiProvider === "student-bedrock") {
    // Placeholder - will be replaced by async initialization
    return new FakeModelAdapter();
  }

  return new FakeModelAdapter();
}

// Async version for proper initialization
export async function getModelAdapterAsync(): Promise<ModelAdapter> {
  if (singleton) return singleton;
  singleton = await createModelAdapter();
  return singleton;
}

async function createModelAdapter(): Promise<ModelAdapter> {
  const aiProvider = process.env.AI_PROVIDER || "fake";

  if (aiProvider === "student-bedrock") {
    const { createStudentBedrockProvider } = await import("../bedrock/index.js");
    return createStudentBedrockProvider();
  }

  return new FakeModelAdapter();
}

export type { ModelAdapter } from "../../modules/agents/agents.types.js";