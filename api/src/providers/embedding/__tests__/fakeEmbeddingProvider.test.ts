import { describe, test, expect, beforeEach } from "vitest";
import { FakeEmbeddingProvider } from "../fakeEmbeddingProvider.js";
import type { EmbeddingInput } from "../embeddingProvider.port.js";

describe("FakeEmbeddingProvider", () => {
  let provider: FakeEmbeddingProvider;

  beforeEach(() => {
    provider = new FakeEmbeddingProvider();
  });

  test("returns vectors with correct dimensions", async () => {
    const inputs: EmbeddingInput[] = [
      { chunkId: "c1", text: "hello world", idempotencyKey: "k1" },
    ];
    const results = await provider.embedBatch(inputs);
    expect(results).toHaveLength(1);
    expect(results[0].vector).toHaveLength(1536);
  });

  test("returns one result per input", async () => {
    const inputs: EmbeddingInput[] = [
      { chunkId: "c1", text: "first", idempotencyKey: "k1" },
      { chunkId: "c2", text: "second", idempotencyKey: "k2" },
      { chunkId: "c3", text: "third", idempotencyKey: "k3" },
    ];
    const results = await provider.embedBatch(inputs);
    expect(results).toHaveLength(3);
  });

  test("returns deterministic vectors for same input", async () => {
    const input: EmbeddingInput[] = [
      { chunkId: "c1", text: "hello world", idempotencyKey: "k1" },
    ];
    const r1 = await provider.embedBatch(input);
    const r2 = await provider.embedBatch(input);
    expect(r1[0].vector).toEqual(r2[0].vector);
  });

  test("returns different vectors for different input", async () => {
    const r1 = await provider.embedBatch([
      { chunkId: "c1", text: "hello", idempotencyKey: "k1" },
    ]);
    const r2 = await provider.embedBatch([
      { chunkId: "c2", text: "goodbye", idempotencyKey: "k2" },
    ]);
    expect(r1[0].vector).not.toEqual(r2[0].vector);
  });

  test("tracks embed calls", async () => {
    const inputs: EmbeddingInput[] = [
      { chunkId: "c1", text: "hello", idempotencyKey: "k1" },
    ];
    await provider.embedBatch(inputs);
    expect(provider.getEmbedCalls()).toHaveLength(1);
  });

  test("resets state", async () => {
    await provider.embedBatch([
      { chunkId: "c1", text: "hello", idempotencyKey: "k1" },
    ]);
    provider.reset();
    expect(provider.getEmbedCalls()).toHaveLength(0);
  });

  test("returns positive token usage", async () => {
    const results = await provider.embedBatch([
      { chunkId: "c1", text: "hello world this is a test", idempotencyKey: "k1" },
    ]);
    expect(results[0].tokenUsage).toBeGreaterThan(0);
  });

  test("respects custom dimensions", async () => {
    const small = new FakeEmbeddingProvider(384);
    const results = await small.embedBatch([
      { chunkId: "c1", text: "test", idempotencyKey: "k1" },
    ]);
    expect(results[0].vector).toHaveLength(384);
  });
});
