import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { updateEffectiveAiRuntimeConfig } from "./ai-runtime-config.js";

test("updateEffectiveAiRuntimeConfig clamps unsafe numeric values", () => {
  const config = updateEffectiveAiRuntimeConfig({
    provider: "groq",
    chatModel: "llama-3.3-70b-versatile",
    embeddingModel: "jina-embeddings-v3",
    temperature: 9,
    maxOutputTokens: 16,
  });

  assert.equal(config.temperature, 2);
  assert.equal(config.maxOutputTokens, 128);
});

test("source-contract: ai-runtime-config.ts hydrates from ai_configuration and exposes the effective runtime config shape", async () => {
  const src = await readFile(new URL("./ai-runtime-config.ts", import.meta.url), "utf8");
  const serviceSrc = await readFile(new URL("./platform.service.ts", import.meta.url), "utf8");
  const errorCodesSrc = await readFile(
    new URL("../../common/errors/errorCodes.ts", import.meta.url),
    "utf8",
  );

  assert.ok(src.includes('PlatformSettingModel.findOne({ key: "ai_configuration" })'));
  assert.ok(src.includes("normalizeConfig"), "Normalizes stored AI config");
  assert.ok(src.includes("getEffectiveAiRuntimeConfig"), "Exports runtime getter");
  assert.ok(src.includes("updateEffectiveAiRuntimeConfig"), "Exports runtime updater");
  assert.ok(src.includes("embeddingModel"), "Tracks embedding model");
  assert.ok(src.includes("maxOutputTokens"), "Tracks output token limit");
  assert.ok(serviceSrc.includes("ChunkEmbeddingModel.exists"), "Rejects embedding-model changes while incompatible embeddings exist");
  assert.ok(serviceSrc.includes("EMBEDDING_MODEL_REINDEX_REQUIRED"), "Uses a dedicated reindex-required error code");
  assert.ok(errorCodesSrc.includes("EMBEDDING_MODEL_REINDEX_REQUIRED"), "Defines the embedding reindex-required error code");
});
