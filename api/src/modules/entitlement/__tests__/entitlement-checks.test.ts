import { describe, expect, it, vi } from "vitest";

vi.mock("../../../db/models/quotaOverride.model.js", () => ({
  default: {
    findOne: vi.fn(() => ({
      lean: vi.fn().mockResolvedValue(null),
    })),
  },
}));

vi.mock("../reconciliation.service.js", () => ({
  getReconciliationService: vi.fn(() => ({
    reconcileAtLeast: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { AppError } from "../../../common/errors/AppError.js";
import { consumeEmployeeSeat } from "../entitlement-checks.js";
import { EntitlementService } from "../entitlement.service.js";
import type { EntitlementDimension } from "../entitlement.types.js";
import type { EntitlementProviderPort } from "../ports/entitlement-provider.port.js";
import type { QuotaCounterPort } from "../ports/quota-counter.port.js";
import { entitlementSnapshotFrom } from "../../billing/ports/entitlement-snapshot.port.js";

const TENANT_ID = "507f1f77bcf86cd799439011";

class InMemoryCounter implements QuotaCounterPort {
  private usage = new Map<string, number>();
  private gates = new Set<string>();

  private key(tenantId: string, dimension: EntitlementDimension, periodStart: string) {
    return `${tenantId}:${dimension}:${periodStart}`;
  }

  async checkAndConsume(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: string,
    amount: number,
    limit: number,
  ): Promise<{ success: boolean; current: number }> {
    const current = this.usage.get(this.key(tenantId, dimension, periodStart)) ?? 0;
    if (current + amount > limit) return { success: false, current };
    const next = current + amount;
    this.usage.set(this.key(tenantId, dimension, periodStart), next);
    return { success: true, current: next };
  }

  async release(tenantId: string, dimension: EntitlementDimension, periodStart: string, amount: number): Promise<void> {
    const current = this.usage.get(this.key(tenantId, dimension, periodStart)) ?? 0;
    this.usage.set(this.key(tenantId, dimension, periodStart), Math.max(0, current - amount));
  }

  async getUsage(tenantId: string, dimension: EntitlementDimension, periodStart: string): Promise<number> {
    return this.usage.get(this.key(tenantId, dimension, periodStart)) ?? 0;
  }

  async getAllUsage(_tenantId: string, _periodStart: string): Promise<Record<EntitlementDimension, number>> {
    return {} as Record<EntitlementDimension, number>;
  }

  async resetPeriod(): Promise<void> {}

  async set(tenantId: string, dimension: EntitlementDimension, periodStart: string, value: number): Promise<void> {
    this.usage.set(this.key(tenantId, dimension, periodStart), value);
  }

  async ensureAtLeast(tenantId: string, dimension: EntitlementDimension, periodStart: string, value: number): Promise<number> {
    const current = this.usage.get(this.key(tenantId, dimension, periodStart)) ?? 0;
    const next = Math.max(current, value);
    this.usage.set(this.key(tenantId, dimension, periodStart), next);
    return next;
  }

  async getIdempotencyGate(tenantId: string, dimension: EntitlementDimension, requestId: string): Promise<boolean> {
    return this.gates.has(`${tenantId}:${dimension}:${requestId}`);
  }

  async createIdempotencyGate(tenantId: string, dimension: EntitlementDimension, requestId: string): Promise<boolean> {
    const key = `${tenantId}:${dimension}:${requestId}`;
    if (this.gates.has(key)) return false;
    this.gates.add(key);
    return true;
  }
}

class FixedProvider implements EntitlementProviderPort {
  constructor(private readonly employees: number) {}

  async getSnapshot() {
    return entitlementSnapshotFrom({
      employees: this.employees,
      admins: 2,
      documents: 100,
      storageMb: 1024,
      fileSizeMb: 50,
      queriesPerMonth: 1000,
      tokensPerMonth: 1000000,
      ocrPagesPerMonth: 100,
    });
  }

  async getPeriodRange() {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return { periodStart, periodEnd: null };
  }
}

function buildService(employeesLimit: number) {
  const counter = new InMemoryCounter();
  const provider = new FixedProvider(employeesLimit);
  const service = new EntitlementService(counter, provider);
  return { service, counter, periodKey: `${String(provider.getPeriodRange)}+x` };
}

describe("consumeEmployeeSeat (copilot invite quota)", () => {
  it("commits a seat when below the limit", async () => {
    const { service, counter } = buildService(5);
    const periodKey = await service.getCounterPeriodKey(TENANT_ID);
    await consumeEmployeeSeat(TENANT_ID, "COMPANY_ADMIN", "run-1", service);
    const current = await counter.getUsage(TENANT_ID, "employees", periodKey);
    expect(current).toBe(1);
  });

  it("is idempotent for the same run id", async () => {
    const { service, counter } = buildService(5);
    const periodKey = await service.getCounterPeriodKey(TENANT_ID);
    await consumeEmployeeSeat(TENANT_ID, "COMPANY_ADMIN", "run-dup", service);
    await consumeEmployeeSeat(TENANT_ID, "COMPANY_ADMIN", "run-dup", service);
    expect(await counter.getUsage(TENANT_ID, "employees", periodKey)).toBe(1);
  });

  it("throws ENTITLEMENT_EXCEEDED fail-closed when the seat quota is exhausted", async () => {
    const { service } = buildService(5);
    for (let i = 0; i < 5; i += 1) {
      await consumeEmployeeSeat(TENANT_ID, "COMPANY_ADMIN", `run-fill-${i}`, service);
    }
    await expect(
      consumeEmployeeSeat(TENANT_ID, "COMPANY_ADMIN", "run-over", service),
    ).rejects.toMatchObject({
      statusCode: 429,
      code: "ENTITLEMENT_EXCEEDED",
      details: {
        dimension: "employees",
        current: 5,
        limit: 5,
        canUpgrade: true,
      },
    });
  });

  it("surfaces canUpgrade=false for employees", async () => {
    const { service } = buildService(1);
    await consumeEmployeeSeat(TENANT_ID, "COMPANY_ADMIN", "run-fill-employee", service);
    await expect(
      consumeEmployeeSeat(TENANT_ID, "EMPLOYEE", "run-over-employee", service),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      consumeEmployeeSeat(TENANT_ID, "EMPLOYEE", "run-over-employee-2", service),
    ).rejects.toMatchObject({ details: { canUpgrade: false } });
  });
});