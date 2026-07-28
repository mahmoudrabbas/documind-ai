import { describe, it, expect, beforeEach } from "vitest";
import { FakeEntitlementService } from "../fake-entitlement-service.js";
import type { EntitlementSnapshot } from "../../../../billing/ports/entitlement-snapshot.port.js";

describe("FakeEntitlementService — EntitlementService contract", () => {
  let service: FakeEntitlementService;

  beforeEach(() => {
    service = new FakeEntitlementService();
  });

  // ── check ────────────────────────────────────────────────────────────────

  it("check returns correct current and limit values with default snapshot", async () => {
    const result = await service.check("tenant-1", "documents");

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(0);
    expect(result.limit).toBe(100);
    expect(result.warning).toBe(false);
  });

  it("check raises warning when current exceeds 80% of limit", async () => {
    // Seed the counter to 80 (80% of 100)
    const counter = service.getCounter();
    const now = new Date();
    const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    counter._seed("tenant-1", "documents", periodStart, 80);

    const result = await service.check("tenant-1", "documents");

    expect(result.current).toBe(80);
    expect(result.limit).toBe(100);
    expect(result.warning).toBe(true);
  });

  // ── consume within limit ─────────────────────────────────────────────────

  it("consume within limit returns committed=true and increments usage", async () => {
    const result = await service.consume("tenant-1", "documents", 5);

    expect(result.committed).toBe(true);
    expect(result.current).toBe(5);
    expect(result.limit).toBe(100);
    expect(result.remaining).toBe(95);

    // Verify the underlying counter was incremented
    const check = await service.check("tenant-1", "documents");
    expect(check.current).toBe(5);
  });

  // ── consume exceeding limit ──────────────────────────────────────────────

  it("consume exceeding limit returns committed=false and does not increment", async () => {
    // Fill up to the limit
    await service.consume("tenant-1", "documents", 100);

    // Attempt to exceed
    const result = await service.consume("tenant-1", "documents", 1);

    expect(result.committed).toBe(false);
    expect(result.current).toBe(100);
    expect(result.limit).toBe(100);
    expect(result.remaining).toBe(0);

    // Verify counter was NOT incremented past the limit
    const check = await service.check("tenant-1", "documents");
    expect(check.current).toBe(100);
  });

  // ── consume idempotency ──────────────────────────────────────────────────

  it("consume with same requestId is idempotent and does not double-increment", async () => {
    const requestId = "req-123";

    const first = await service.consume("tenant-1", "documents", 10, requestId);
    expect(first.committed).toBe(true);
    expect(first.current).toBe(10);

    // Same requestId again
    const second = await service.consume("tenant-1", "documents", 10, requestId);
    expect(second.committed).toBe(true);
    expect(second.current).toBe(10); // Not 20 — idempotency held
    expect(second.limit).toBe(100);
    expect(second.remaining).toBe(90);
  });

  it("consume with different requestIds increments each time", async () => {
    const first = await service.consume("tenant-1", "documents", 10, "req-1");
    expect(first.committed).toBe(true);
    expect(first.current).toBe(10);

    const second = await service.consume("tenant-1", "documents", 20, "req-2");
    expect(second.committed).toBe(true);
    expect(second.current).toBe(30); // 10 + 20 = 30
    expect(second.remaining).toBe(70);
  });

  // ── getUsage ─────────────────────────────────────────────────────────────

  it("getUsage returns all consumed dimensions with correct values", async () => {
    await service.consume("tenant-1", "documents", 10);
    await service.consume("tenant-1", "queriesPerMonth", 50);
    await service.consume("tenant-1", "tokensPerMonth", 1000);

    const usage = await service.getUsage("tenant-1");

    expect(usage).toHaveProperty("documents", 10);
    expect(usage).toHaveProperty("queriesPerMonth", 50);
    expect(usage).toHaveProperty("tokensPerMonth", 1000);
  });

  // ── getEffectiveLimit ────────────────────────────────────────────────────

  it("getEffectiveLimit returns default limit from default snapshot", async () => {
    const limit = await service.getEffectiveLimit("tenant-1", "documents");
    expect(limit).toBe(100);
  });

  it("getEffectiveLimit respects snapshot overrides", async () => {
    service.setSnapshot("tenant-1", {
      employees: 50,
      admins: 5,
      documents: 500,
      storageMb: 5120,
      fileSizeMb: 100,
      queriesPerMonth: 10000,
      tokensPerMonth: 500000,
      ocrPagesPerMonth: 2000,
      supportedModels: ["basic", "standard", "advanced"],
      analyticsLevel: "advanced",
      retentionDays: 180,
      supportLevel: "standard",
    } satisfies EntitlementSnapshot);

    const limit = await service.getEffectiveLimit("tenant-1", "documents");
    expect(limit).toBe(500);
  });

  // ── getPeriodReset ───────────────────────────────────────────────────────

  it("getPeriodReset returns a future ISO date string", async () => {
    const result = await service.getPeriodReset("tenant-1");

    expect(typeof result).toBe("string");
    const parsed = new Date(result);
    // Should be a valid date
    expect(parsed.getTime()).not.toBeNaN();
    // Should be in the future (end of current month)
    expect(parsed.getTime()).toBeGreaterThan(Date.now());
  });

  // ── reset() ──────────────────────────────────────────────────────────────

  it("reset clears all state including counters and snapshot overrides", async () => {
    // Arrange: set up some state
    await service.consume("tenant-1", "documents", 10);
    service.setSnapshot("tenant-1", {
      employees: 50,
      admins: 5,
      documents: 500,
      storageMb: 5120,
      fileSizeMb: 100,
      queriesPerMonth: 10000,
      tokensPerMonth: 500000,
      ocrPagesPerMonth: 2000,
      supportedModels: ["basic"],
      analyticsLevel: "basic",
      retentionDays: 90,
      supportLevel: "community",
    } satisfies EntitlementSnapshot);

    // Act
    service.reset();

    // Assert: counters reset to zero
    const check = await service.check("tenant-1", "documents");
    expect(check.current).toBe(0);
    // Assert: snapshot override cleared, default restored
    expect(check.limit).toBe(100);
  });

  // ── getEntitlementSnapshot ───────────────────────────────────────────────

  it("getEntitlementSnapshot returns default snapshot for unknown tenant", async () => {
    const snapshot = await service.getEntitlementSnapshot("non-existent");

    expect(snapshot).not.toBeNull();
    expect(snapshot!.documents).toBe(100);
    expect(snapshot!.employees).toBe(10);
    expect(snapshot!.admins).toBe(2);
    expect(Array.isArray(snapshot!.supportedModels)).toBe(true);
  });

  it("getEntitlementSnapshot returns overridden snapshot when set via setSnapshot", async () => {
    const custom: EntitlementSnapshot = {
      employees: 200,
      admins: 20,
      documents: 5000,
      storageMb: 51200,
      fileSizeMb: 100,
      queriesPerMonth: 50000,
      tokensPerMonth: 1000000,
      ocrPagesPerMonth: 5000,
      supportedModels: ["basic", "standard", "advanced"],
      analyticsLevel: "enterprise",
      retentionDays: 365,
      supportLevel: "dedicated",
    };
    service.setSnapshot("tenant-1", custom);

    const snapshot = await service.getEntitlementSnapshot("tenant-1");

    expect(snapshot).toEqual(custom);
  });

  // ── Capability keys ──────────────────────────────────────────────────────

  it("check on capability key allowedModels returns MAX_SAFE_INTEGER limit", async () => {
    const result = await service.check("tenant-1", "allowedModels");
    expect(result.limit).toBe(Number.MAX_SAFE_INTEGER);
    expect(result.allowed).toBe(true);
  });

  it("check on capability key retentionDays returns MAX_SAFE_INTEGER limit", async () => {
    const result = await service.check("tenant-1", "retentionDays");
    expect(result.limit).toBe(Number.MAX_SAFE_INTEGER);
    expect(result.allowed).toBe(true);
  });
});
