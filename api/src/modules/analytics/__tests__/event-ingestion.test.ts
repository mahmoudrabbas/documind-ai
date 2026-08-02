import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InMemoryUsageEventWriter } from "../adapters/in-memory-usage-event-writer.js";

describe("Analytics Event Ingestion & Idempotency", () => {
  it("records events and assigns unique IDs", async () => {
    const writer = new InMemoryUsageEventWriter();

    const record1 = await writer.record({
      tenantId: "tenant_123",
      eventType: "prompt",
      provider: "groq",
      model: "llama-3.3-70b-versatile",
      inputTokens: 150,
      outputTokens: 50,
    });

    assert.equal(typeof record1.id, "string");
    assert.equal(record1.tenantId, "tenant_123");
    assert.equal(record1.totalTokens, 200);
    assert.equal(writer.getEvents().length, 1);
  });

  it("enforces idempotency when idempotencyKey is reused", async () => {
    const writer = new InMemoryUsageEventWriter();
    const idempotencyKey = "req_unique_key_001";

    const record1 = await writer.record({
      tenantId: "tenant_123",
      eventType: "completion",
      idempotencyKey,
      inputTokens: 100,
    });

    const record2 = await writer.record({
      tenantId: "tenant_123",
      eventType: "completion",
      idempotencyKey,
      inputTokens: 100,
    });

    assert.equal(record1.id, record2.id);
    assert.equal(writer.getEvents().length, 1);
  });

  it("handles batch ingestion correctly", async () => {
    const writer = new InMemoryUsageEventWriter();

    const results = await writer.recordBatch([
      { tenantId: "t1", eventType: "prompt", inputTokens: 50 },
      { tenantId: "t1", eventType: "completion", outputTokens: 50 },
    ]);

    assert.equal(results.length, 2);
    assert.equal(writer.getEvents().length, 2);
  });
});
