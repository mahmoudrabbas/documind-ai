import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { AppError } from "../../../common/errors/AppError.js";
import { ENTITLEMENT_EXCEEDED } from "../../../common/errors/errorCodes.js";
import { quotaExceededMetadataSchema } from "../../notifications/factory/metadata.schemas.js";
import type {
  OutboxTriggerPort,
  TriggerEnvelope,
} from "../../notifications/ports/outboxTrigger.port.js";
import { createCapabilityGuard } from "../middlewares/entitlement.middleware.js";
import type { EntitlementService } from "../entitlement.service.js";
import { FakeEntitlementService } from "../ports/fakes/fake-entitlement-service.js";

function makeCapabilityGuard(
  svc: FakeEntitlementService,
  options: Parameters<typeof createCapabilityGuard>[1],
) {
  return createCapabilityGuard(svc as unknown as EntitlementService, options);
}

function makeReq(): { req: Request; logWarn: ReturnType<typeof vi.fn> } {
  const logWarn = vi.fn();
  const info = vi.fn();
  const error = vi.fn();
  const req = {
    tenantId: "tenant-1",
    auth: { userId: "user-1", role: "COMPANY_ADMIN", email: "admin@corp.com" },
    traceId: "trace-1",
    log: { warn: logWarn, info, error },
  } as unknown as Request;
  return { req, logWarn };
}

function makeRes(): Response {
  return { setHeader: vi.fn() } as unknown as Response;
}

function makePort(): {
  port: OutboxTriggerPort;
  publishTrigger: ReturnType<typeof vi.fn>;
} {
  const publishTrigger = vi.fn(
    async (_event: TriggerEnvelope): Promise<void> => {},
  );
  return { port: { publishTrigger }, publishTrigger };
}

describe("createCapabilityGuard — quota_exceeded trigger (T18)", () => {
  let service: FakeEntitlementService;

  beforeEach(() => {
    service = new FakeEntitlementService();
  });

  it("publishes a quota_exceeded trigger on a fail-closed quota denial and still denies with 429", async () => {
    const { port, publishTrigger } = makePort();
    const guard = makeCapabilityGuard(service, {
      capability: "allowedModels",
      value: "premium", // not in default supportedModels ["basic", "standard"]
      failMode: "fail-closed",
      triggerPort: () => port,
    });
    const { req } = makeReq();
    const next = vi.fn();

    await guard(req, makeRes(), next);

    // Denial is still enforced — the trigger is a fire-and-forget side effect.
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe(ENTITLEMENT_EXCEEDED);

    // Exactly one well-formed quota_exceeded trigger published.
    expect(publishTrigger).toHaveBeenCalledTimes(1);
    const envelope = publishTrigger.mock.calls[0][0] as TriggerEnvelope;
    expect(envelope.type).toBe("quota_exceeded");
    expect(envelope.tenantId).toBe("tenant-1");
    expect(envelope.actorId).toBe("user-1");
    expect(envelope.recipientUserIds).toEqual(["user-1"]);
    expect(envelope.payload.dedupEventId).toBe("allowedModels");
    expect(envelope.payload.source).toEqual({
      type: "entitlement",
      id: "allowedModels",
      displayName: "allowedModels",
    });
    const parsed = quotaExceededMetadataSchema.safeParse(
      envelope.payload.metadata,
    );
    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.quotaType : "").toBe("allowedModels");
  });

  it("does NOT publish on a non-quota 503 denial (service unavailable)", async () => {
    vi.spyOn(service, "checkCapability").mockRejectedValueOnce(
      new Error("provider down"),
    );
    const { port, publishTrigger } = makePort();
    const guard = makeCapabilityGuard(service, {
      capability: "allowedModels",
      value: "premium",
      failMode: "fail-closed",
      triggerPort: () => port,
    });
    const next = vi.fn();

    await guard(makeReq().req, makeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(503);
    expect(publishTrigger).not.toHaveBeenCalled();
  });

  it("does NOT publish when no trigger port is wired", async () => {
    const guard = makeCapabilityGuard(service, {
      capability: "allowedModels",
      value: "premium",
      failMode: "fail-closed",
    });
    const next = vi.fn();

    await guard(makeReq().req, makeRes(), next);

    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(429);
  });

  it("does NOT publish when the period reset cannot be resolved", async () => {
    vi.spyOn(service, "getPeriodReset").mockRejectedValueOnce(
      new Error("reset provider down"),
    );
    const { port, publishTrigger } = makePort();
    const guard = makeCapabilityGuard(service, {
      capability: "allowedModels",
      value: "premium",
      failMode: "fail-closed",
      triggerPort: () => port,
    });
    const next = vi.fn();

    await guard(makeReq().req, makeRes(), next);

    // Quota denial is still enforced (periodReset is informational).
    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(429);
    // Without a reset timestamp the strict metadata schema cannot be
    // satisfied — skip rather than emit a dead trigger.
    expect(publishTrigger).not.toHaveBeenCalled();
  });

  it("is non-fatal when the trigger publish fails — the denial is still enforced", async () => {
    const { port, publishTrigger } = makePort();
    publishTrigger.mockRejectedValueOnce(new Error("outbox down"));
    const { req, logWarn } = makeReq();
    const guard = makeCapabilityGuard(service, {
      capability: "allowedModels",
      value: "premium",
      failMode: "fail-closed",
      triggerPort: () => port,
    });
    const next = vi.fn();

    await expect(guard(req, makeRes(), next)).resolves.toBeUndefined();
    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(429);
    // The publish failure is logged, never thrown to the request path.
    await vi.waitFor(() => expect(logWarn).toHaveBeenCalled());
  });

  it("does NOT publish on a fail-open capability denial (warning only)", async () => {
    const { port, publishTrigger } = makePort();
    const guard = makeCapabilityGuard(service, {
      capability: "allowedModels",
      value: "premium",
      failMode: "fail-open",
      triggerPort: () => port,
    });
    const { req } = makeReq();
    const next = vi.fn();

    await guard(req, makeRes(), next);

    expect(req.quotaWarning).toBe(true);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined();
    expect(publishTrigger).not.toHaveBeenCalled();
  });
});
