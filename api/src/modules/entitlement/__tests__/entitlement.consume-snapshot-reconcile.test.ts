import { describe, expect, it, vi } from "vitest";

vi.mock("../../../db/models/quotaOverride.model.js", () => ({
  default: {
    findOne: vi.fn(() => ({
      lean: vi.fn().mockResolvedValue(null),
    })),
  },
}));
import { EntitlementService } from "../entitlement.service.js";
import type {
  EntitlementDimension,
} from "../entitlement.types.js";
import type { QuotaCounterPort } from "../ports/quota-counter.port.js";
import type { EntitlementProviderPort } from "../ports/entitlement-provider.port.js";
import type { EntitlementSnapshot } from "../../billing/ports/entitlement-snapshot.port.js";

const TENANT_ID = "507f1f77bcf86cd799439011";

class InMemoryCounter implements QuotaCounterPort {
  private usage = new Map<string, number>();

  private key(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: string,
  ) {
    return `${tenantId}:${dimension}:${periodStart}`;
  }

  async getUsage(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: string,
  ): Promise<number> {
    return this.usage.get(this.key(tenantId, dimension, periodStart)) ?? 0;
  }

  async getAllUsage(
    tenantId: string,
    periodStart: string,
  ): Promise<Record<EntitlementDimension, number>> {
    return {} as Record<EntitlementDimension, number>;
  }

  async set(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: string,
    value: number,
  ): Promise<void> {
    this.usage.set(this.key(tenantId, dimension, periodStart), value);
  }

  async checkAndConsume(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: string,
    amount: number,
    limit: number,
  ) {
    const current = await this.getUsage(tenantId, dimension, periodStart);

    if (current + amount > limit) {
      return { success: false, current };
    }

    const next = current + amount;
    await this.set(tenantId, dimension, periodStart, next);
    return { success: true, current: next };
  }

  async ensureAtLeast(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: string,
    value: number,
  ): Promise<number> {
    const current = await this.getUsage(tenantId, dimension, periodStart);
    const next = Math.max(current, value);
    await this.set(tenantId, dimension, periodStart, next);
    return next;
  }

  async release(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: string,
    amount: number,
  ): Promise<void> {
    const current = await this.getUsage(tenantId, dimension, periodStart);
    await this.set(
      tenantId,
      dimension,
      periodStart,
      Math.max(0, current - amount),
    );
  }

  async getIdempotencyGate(): Promise<boolean> {
    return false;
  }

  async createIdempotencyGate(): Promise<boolean> {
    return true;
  }

  async resetPeriod(
    tenantId: string,
    oldPeriodStart: string,
    newPeriodStart: string,
  ): Promise<void> {
    const prefix = `${tenantId}:`;

    for (const [key] of this.usage) {
      if (!key.startsWith(prefix) || !key.endsWith(`:${oldPeriodStart}`)) {
        continue;
      }

      const parts = key.split(":");
      const dimension = parts[1] as EntitlementDimension;

      await this.set(
        tenantId,
        dimension,
        newPeriodStart,
        0,
      );
    }
  }
}

class FakeProvider implements EntitlementProviderPort {
  constructor(
    private readonly queriesPerMonthLimit = 100,
  ) {}

  async getSnapshot(): Promise<EntitlementSnapshot> {
    return {
      employees: 6,
      admins: 1,
      documents: 10,
      storageMb: 1000,
      fileSizeMb: 100,
      queriesPerMonth: this.queriesPerMonthLimit,
      tokensPerMonth: 1000,
      ocrPagesPerMonth: 100,
      supportedModels: [],
      analyticsLevel: "basic",
      supportLevel: "community",
      retentionDays: 30,
    };
  }

  async getPeriodRange() {
    return {
      periodStart: new Date("2026-08-01T00:00:00.000Z"),
      periodEnd: new Date("2026-09-01T00:00:00.000Z"),
    };
  }
}

describe("EntitlementService snapshot reconciliation", () => {
  it("denies employee consumption when authoritative usage has already reached the limit", async () => {
    const counter = new InMemoryCounter();
    const provider = new FakeProvider();
    const periodKey = "2026-08";

    // Stale counter says only 2 employee seats are used.
    await counter.set(TENANT_ID, "employees", periodKey, 2);

    const service = new EntitlementService(
      counter,
      provider,
      undefined,
      async (tenantId) => {
        // Authoritative user state says all 6 seats are already occupied.
        await counter.ensureAtLeast(
          tenantId,
          "employees",
          periodKey,
          6,
        );
      },
    );

    const result = await service.consume(
      TENANT_ID,
      "employees",
      1,
      "invite-regression",
    );

    expect(result.committed).toBe(false);
    expect(result.current).toBe(6);
    expect(result.limit).toBe(6);
    expect(result.remaining).toBe(0);

    await expect(
      counter.getUsage(TENANT_ID, "employees", periodKey),
    ).resolves.toBe(6);
  });

  it("denies a query when authoritative monthly usage has already reached the limit", async () => {
    const counter = new InMemoryCounter();
    const provider = new FakeProvider(18);
    const periodKey = "2026-08";

    // The quota counter is stale-low even though 18 QUESTION_ASKED events
    // already exist in the authoritative usage source.
    await counter.set(
      TENANT_ID,
      "queriesPerMonth",
      periodKey,
      7,
    );

    const service = new EntitlementService(
      counter,
      provider,
      undefined,
      async (tenantId) => {
        await counter.ensureAtLeast(
          tenantId,
          "queriesPerMonth",
          periodKey,
          18,
        );
      },
    );

    const result = await service.consume(
      TENANT_ID,
      "queriesPerMonth",
      1,
      "query-regression",
    );

    expect(result.committed).toBe(false);
    expect(result.current).toBe(18);
    expect(result.limit).toBe(18);
    expect(result.remaining).toBe(0);

    await expect(
      counter.getUsage(
        TENANT_ID,
        "queriesPerMonth",
        periodKey,
      ),
    ).resolves.toBe(18);
  });
});
