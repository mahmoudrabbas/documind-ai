import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { shouldUseRealAdapters } from "./adapterLoader.js";
import {
  resolveEmbeddingModel,
  resolveEmbeddingProviderKey,
} from "./index.js";

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
});
