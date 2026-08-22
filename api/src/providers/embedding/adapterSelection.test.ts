import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { shouldUseRealAdapters } from "./adapterLoader.js";
import {
  resolveConfiguredEmbeddingModel,
  resolveEmbeddingModel,
  resolveEmbeddingProviderKey,
} from "./index.js";
import {
  resetEffectiveAiRuntimeConfigForTests,
  updateEffectiveAiRuntimeConfig,
} from "../../modules/platform/ai-runtime-config.js";

describe("production retrieval adapter selection", () => {
  test("uses Atlas for a non-test MongoDB runtime without legacy AI_PROVIDER", () => {
    assert.equal(
      shouldUseRealAdapters({
        NODE_ENV: "development",
        MONGODB_URI: "mongodb+srv://configured.invalid/db",
      }),
      true,
    );
  });

  test("keeps test runtimes deterministic", () => {
    assert.equal(
      shouldUseRealAdapters({
        NODE_ENV: "test",
        MONGODB_URI: "mongodb://127.0.0.1/test",
      }),
      false,
    );
  });

  test("infers Jina from its credential when AI_PROVIDER is absent", () => {
    assert.equal(
      resolveEmbeddingProviderKey({
        NODE_ENV: "development",
        JINA_API_KEY: "configured",
      }),
      "groq",
    );
  });

  test("preserves an explicit fake override", () => {
    assert.equal(
      resolveEmbeddingProviderKey({
        NODE_ENV: "development",
        AI_PROVIDER: "fake",
        JINA_API_KEY: "configured",
      }),
      "fake",
    );
  });

  test("always uses fake embeddings in tests", () => {
    assert.equal(
      resolveEmbeddingProviderKey({
        NODE_ENV: "test",
        AI_PROVIDER: "groq",
        JINA_API_KEY: "configured",
      }),
      "fake",
    );
  });

  test("selects the Jina model independently from the chat runtime model", () => {
    assert.equal(
      resolveEmbeddingModel("groq", {
        JINA_EMBEDDING_MODEL: "jina-embeddings-v3",
        BEDROCK_EMBEDDING_MODEL: "amazon.titan-embed-text-v2:0",
      }),
      "jina-embeddings-v3",
    );
  });

  test("selects the OpenAI model independently from the chat runtime model", () => {
    assert.equal(
      resolveEmbeddingModel("openai", {
        OPENAI_EMBEDDING_MODEL: "text-embedding-3-large",
        BEDROCK_EMBEDDING_MODEL: "amazon.titan-embed-text-v2:0",
      }),
      "text-embedding-3-large",
    );
  });

  test("selects the student-bedrock model from the plural env name the resolver reads", () => {
    // BEDROCK_EMBEDDING_MODELS (plural) is the name ai-runtime-config and this
    // resolver agree on; the singular form used as a decoy above is read by
    // neither, so assert the plural explicitly.
    assert.equal(
      resolveEmbeddingModel("student-bedrock", {
        BEDROCK_EMBEDDING_MODELS: "amazon.titan-embed-text-v2:0,cohere.embed-english-v3",
        BEDROCK_EMBEDDING_MODEL: "should-be-ignored",
      }),
      "amazon.titan-embed-text-v2:0",
    );
  });

  test("honours a database-configured embedding model only for its own provider", (t) => {
    t.after(() => resetEffectiveAiRuntimeConfigForTests());
    const env = { JINA_EMBEDDING_MODEL: "jina-embeddings-v3" };

    updateEffectiveAiRuntimeConfig({
      provider: "groq",
      chatModel: "llama-3.3-70b-versatile",
      embeddingModel: "jina-embeddings-v2-base-en",
      temperature: 0.2,
      maxOutputTokens: 2048,
    });
    // Same provider: the admin's choice must reach the adapter, otherwise the
    // reindex gate in platform.service guards a setting that never takes effect.
    assert.equal(
      resolveConfiguredEmbeddingModel("groq", env),
      "jina-embeddings-v2-base-en",
    );
    // resolveEmbeddingProviderKey can infer openai from credentials alone, and
    // AiProviderKey cannot even express it, so a Jina model must not leak there.
    assert.equal(
      resolveConfiguredEmbeddingModel("openai", { OPENAI_EMBEDDING_MODEL: "text-embedding-3-small" }),
      "text-embedding-3-small",
    );
  });

  test("ignores an environment-sourced embedding model snapshot in favour of live env", (t) => {
    t.after(() => resetEffectiveAiRuntimeConfigForTests());
    resetEffectiveAiRuntimeConfigForTests();
    // The environment-sourced config is captured at module load, so a later env
    // change (or a per-test override) must still win.
    assert.equal(
      resolveConfiguredEmbeddingModel("groq", { JINA_EMBEDDING_MODEL: "jina-embeddings-v4" }),
      "jina-embeddings-v4",
    );
  });
});
