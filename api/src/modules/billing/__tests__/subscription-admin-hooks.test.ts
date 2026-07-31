import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

vi.mock("../../../db/models/subscription.model.js", () => ({
  default: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), find: vi.fn(), populate: vi.fn() },
}));
vi.mock("../../../db/models/package.model.js", () => ({
  default: { findById: vi.fn(), find: vi.fn() },
}));
vi.mock("../../../db/models/tenant.model.js", () => ({
  default: { findOne: vi.fn() },
}));

const auditWrite = vi.fn();
vi.mock("../../../common/observability/index.js", () => ({
  getAuditWriter: () => ({ write: auditWrite }),
}));

// ── Imports under test ───────────────────────────────────────────────────────

import SubscriptionModel from "../../../db/models/subscription.model.js";
import PackageModel from "../../../db/models/package.model.js";
import TenantModel from "../../../db/models/tenant.model.js";
import { updateAdminSubscription } from "../subscription-admin.service.js";
import {
  getPlanChangeHooks,
  registerPlanChangeHook,
} from "../subscription.service.js";
import type { PlanChangeHook } from "../subscription.service.js";

const TENANT_ID = "507f1f77bcf86cd799439011";
const OLD_PACKAGE_ID = "507f1f77bcf86cd799439012";
const NEW_PACKAGE_ID = "507f1f77bcf86cd799439099";
const SUB_ID = "507f1f77bcf86cd799439013";

const ENTITLEMENTS = {
  employees: 5,
  admins: 2,
  documents: 100,
  storageMb: 1024,
  fileSizeMb: 20,
  queriesPerMonth: 1000,
  tokensPerMonth: 0,
  ocrPagesPerMonth: 100,
};

const ACTOR = {
  userId: "507f1f77bcf86cd799439014",
  email: "superadmin@platform.test",
  role: "SUPER_ADMIN" as const,
  tenantId: "507f1f77bcf86cd799439015",
  traceId: "trace",
  requestId: "request",
};

function chain<T>(result: T) {
  return {
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(result),
  };
}

function resetHooks() {
  (getPlanChangeHooks() as PlanChangeHook[]).length = 0;
}

function updatedDocument(overrides: Record<string, unknown>) {
  return {
    _id: SUB_ID,
    tenantId: TENANT_ID,
    packageId: OLD_PACKAGE_ID,
    packageVersion: 1,
    status: "ACTIVE",
    revision: 2,
    paymentState: "paid",
    periodStart: null,
    periodEnd: null,
    trialStart: null,
    trialEnd: null,
    cancelledAt: null,
    cancellationReason: "",
    cancelAtPeriodEnd: false,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
    ...overrides,
  };
}

describe("updateAdminSubscription plan-change hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHooks();
    auditWrite.mockResolvedValue(undefined);

    (TenantModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
      chain({ _id: TENANT_ID, name: "Acme", slug: "acme", status: "ACTIVE" }),
    );
    (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
      chain({
        _id: SUB_ID,
        tenantId: TENANT_ID,
        packageId: OLD_PACKAGE_ID,
        packageVersion: 1,
        status: "ACTIVE",
        revision: 1,
        paymentState: "paid",
        periodStart: null,
        periodEnd: null,
        trialStart: null,
        trialEnd: null,
        cancelledAt: null,
        cancellationReason: "",
        cancelAtPeriodEnd: false,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      }),
    );
    (PackageModel.findById as ReturnType<typeof vi.fn>).mockReturnValue(
      chain({
        _id: NEW_PACKAGE_ID,
        name: "Professional",
        code: "pro",
        version: 2,
        active: true,
        trialDays: 0,
        entitlements: ENTITLEMENTS,
      }),
    );
    (SubscriptionModel.findOneAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue(
      chain(updatedDocument({ packageId: NEW_PACKAGE_ID, packageVersion: 2 })),
    );
  });

  it("fires the hook when the admin PATCH changes the package", async () => {
    const hook = vi.fn().mockResolvedValue(undefined);
    registerPlanChangeHook(hook);

    const result = await updateAdminSubscription(
      TENANT_ID,
      { expectedVersion: 1, packageId: NEW_PACKAGE_ID, reason: "Downgrade approved" },
      "idem-key-1",
      ACTOR,
    );

    expect(result.packageId).toBe(NEW_PACKAGE_ID);
    expect(hook).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      fromPackageId: OLD_PACKAGE_ID,
      toPackageId: NEW_PACKAGE_ID,
      fromStatus: "ACTIVE",
      toStatus: "ACTIVE",
    });
  });

  it("fires the hook when the admin PATCH changes the status", async () => {
    const hook = vi.fn().mockResolvedValue(undefined);
    registerPlanChangeHook(hook);
    (PackageModel.findById as ReturnType<typeof vi.fn>).mockReturnValue(chain(null));
    (SubscriptionModel.findOneAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue(
      chain(updatedDocument({ packageId: OLD_PACKAGE_ID, packageVersion: 1, status: "PAUSED" })),
    );

    await updateAdminSubscription(
      TENANT_ID,
      { expectedVersion: 1, status: "PAUSED", reason: "Administrative pause" },
      "idem-key-2",
      ACTOR,
    );

    expect(hook).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        fromPackageId: OLD_PACKAGE_ID,
        fromStatus: "ACTIVE",
        toStatus: "PAUSED",
      }),
    );
  });

  it("does not fire the hook when the request is a no-change", async () => {
    const hook = vi.fn();
    registerPlanChangeHook(hook);
    (PackageModel.findById as ReturnType<typeof vi.fn>).mockReturnValue(
      chain({
        _id: OLD_PACKAGE_ID,
        name: "Basic",
        code: "basic",
        version: 1,
        active: true,
        trialDays: 0,
        entitlements: ENTITLEMENTS,
      }),
    );

    await expect(
      updateAdminSubscription(
        TENANT_ID,
        { expectedVersion: 1, packageId: OLD_PACKAGE_ID, reason: "No change" },
        "idem-key-3",
        ACTOR,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(hook).not.toHaveBeenCalled();
  });
});
