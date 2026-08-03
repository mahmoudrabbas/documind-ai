import { describe, expect, it, vi } from "vitest";
import { quotaExceededMetadataSchema } from "../factory/metadata.schemas.js";
import type {
  OutboxTriggerPort,
  TriggerEnvelope,
} from "../ports/outboxTrigger.port.js";
import { publishQuotaExceededTrigger } from "../triggers/quotaExceeded.trigger.js";

const INPUT = {
  tenantId: "tenant-1",
  actorId: "user-1",
  capability: "allowedModels",
  usage: 3,
  limit: 2,
  resetAt: "2026-08-31T21:59:59.000Z",
};

function makePort(): {
  port: OutboxTriggerPort;
  publishTrigger: ReturnType<typeof vi.fn>;
} {
  const publishTrigger = vi.fn(
    async (_event: TriggerEnvelope): Promise<void> => {},
  );
  return { port: { publishTrigger }, publishTrigger };
}

describe("publishQuotaExceededTrigger (T18 producer)", () => {
  it("publishes exactly one well-formed quota_exceeded envelope", async () => {
    const { port, publishTrigger } = makePort();

    await publishQuotaExceededTrigger(port, INPUT);

    expect(publishTrigger).toHaveBeenCalledTimes(1);
    const envelope = publishTrigger.mock.calls[0][0] as TriggerEnvelope;
    expect(envelope.type).toBe("quota_exceeded");
    expect(envelope.tenantId).toBe("tenant-1");
    expect(envelope.actorId).toBe("user-1");
    expect(envelope.eventId).toEqual(expect.any(String));
    expect(envelope.eventId.length).toBeGreaterThan(0);
    expect(envelope.recipientUserIds).toEqual(["user-1"]);
    expect(envelope.dedupKey).toMatch(/^quota_exceeded:/);
  });

  it("emits metadata satisfying the strict quota_exceeded schema (quotaType/usage/limit/resetAt)", async () => {
    const { port, publishTrigger } = makePort();

    await publishQuotaExceededTrigger(port, INPUT);

    const envelope = publishTrigger.mock.calls[0][0] as TriggerEnvelope;
    expect(envelope.payload.metadata).toEqual({
      quotaType: "allowedModels",
      usage: 3,
      limit: 2,
      resetAt: "2026-08-31T21:59:59.000Z",
    });
    const parsed = quotaExceededMetadataSchema.safeParse(
      envelope.payload.metadata,
    );
    expect(parsed.success).toBe(true);
  });

  it("identifies the denied capability as dedupEventId and source entity", async () => {
    const { port, publishTrigger } = makePort();

    await publishQuotaExceededTrigger(port, INPUT);

    const envelope = publishTrigger.mock.calls[0][0] as TriggerEnvelope;
    expect(envelope.payload.dedupEventId).toBe("allowedModels");
    expect(envelope.payload.source).toEqual({
      type: "entitlement",
      id: "allowedModels",
      displayName: "allowedModels",
    });
    expect(envelope.payload.actorId).toBe("user-1");
  });

  it("passes trace ids through when provided", async () => {
    const { port, publishTrigger } = makePort();

    await publishQuotaExceededTrigger(port, {
      ...INPUT,
      traceId: "trace-1",
      correlationId: "corr-1",
      causationId: "caus-1",
    });

    const envelope = publishTrigger.mock.calls[0][0] as TriggerEnvelope;
    expect(envelope.payload.traceIds).toEqual({
      traceId: "trace-1",
      correlationId: "corr-1",
      causationId: "caus-1",
    });
  });
});
