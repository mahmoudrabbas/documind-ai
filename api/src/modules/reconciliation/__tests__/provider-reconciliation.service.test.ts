import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../db/models/subscription.model.js", () => ({
  default: { findOne: vi.fn(), find: vi.fn(), updateOne: vi.fn() },
}));
vi.mock("../../../db/models/package.model.js", () => ({
  default: { findById: vi.fn(), find: vi.fn() },
}));
vi.mock("../../../db/models/paymentEvent.model.js", () => ({
  default: { findOne: vi.fn() },
}));
const auditWrite = vi.fn();
vi.mock("../../../common/observability/index.js", () => ({
  getAuditWriter: () => ({ write: auditWrite }),
}));
vi.mock("../../permissions/permissions.operation.js", () => ({
  authorizePlatformOperation: vi.fn(async (context: Record<string, unknown>) => ({
    ...context,
    actorKind: "USER",
  })),
}));
vi.mock("../../checkout/payment-provider-loader.js", () => ({
  getPaymentProvider: vi.fn(),
}));

import PackageModel from "../../../db/models/package.model.js";
import PaymentEventModel from "../../../db/models/paymentEvent.model.js";
import SubscriptionModel from "../../../db/models/subscription.model.js";
import { FakePaymentProvider } from "../../billing/ports/fakes/fake-payment-provider.js";
import {
  getPlanChangeHooks,
  registerPlanChangeHook,
} from "../../billing/subscription.service.js";
import type { PlanChangeHook } from "../../billing/subscription.service.js";
import {
  reconcileSubscriptions,
  syncTenantSubscriptionFromProvider,
} from "../reconciliation.service.js";

const TENANT_ID = "507f1f77bcf86cd799439011";
const PACKAGE_ID = "507f1f77bcf86cd799439012";
const VERSION_ID = "507f1f77bcf86cd799439099";

function query<T>(result: T) {
  return {
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(result),
  };
}

describe("provider-backed subscription reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditWrite.mockResolvedValue(undefined);
    const localSubscription = {
        _id: "507f1f77bcf86cd799439014",
        tenantId: TENANT_ID,
        packageId: "507f1f77bcf86cd799439055",
        packageVersionId: null,
        packageVersion: 1,
        providerCustomerId: "cus_reconcile",
        providerSubscriptionId: "sub_reconcile",
        status: "ACTIVE",
        paymentState: "paid",
      };
    (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(query(localSubscription));
    (SubscriptionModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
      query([localSubscription]),
    );
    (SubscriptionModel.updateOne as ReturnType<typeof vi.fn>).mockResolvedValue({ modifiedCount: 1 });
    (PackageModel.findById as ReturnType<typeof vi.fn>).mockReturnValue(
      query({
        _id: PACKAGE_ID,
        version: 2,
        versions: [{
          _id: VERSION_ID,
          version: 2,
          stripePriceId: "price_pro",
          stripeAnnualPriceId: "price_pro_year",
        }],
      }),
    );
  });

  it("repairs a stale Free mapping from Stripe without creating a charge", async () => {
    const provider = new FakePaymentProvider();
    provider.subscriptions.push({
      id: "sub_reconcile",
      customerId: "cus_reconcile",
      status: "active",
      metadata: {
        tenantId: TENANT_ID,
        packageId: PACKAGE_ID,
        packageVersionId: VERSION_ID,
        packageVersion: "2",
        billingInterval: "monthly",
      },
      priceId: "price_pro",
      currentPeriodStart: new Date("2026-07-01T00:00:00Z"),
      currentPeriodEnd: new Date("2026-08-01T00:00:00Z"),
      cancelAtPeriodEnd: false,
    });

    const result = await syncTenantSubscriptionFromProvider(
      TENANT_ID,
      {
        tenantId: "507f1f77bcf86cd799439088",
        actorId: "507f1f77bcf86cd799439087",
        actorEmail: "admin@example.com",
        actorRole: "SUPER_ADMIN",
      },
      provider,
    );

    expect(result).toMatchObject({ packageId: PACKAGE_ID, packageVersionId: VERSION_ID });
    expect((SubscriptionModel.updateOne as ReturnType<typeof vi.fn>).mock.calls[0][1].$set)
      .toMatchObject({ provider: "stripe", packageVersion: 2, status: "ACTIVE" });
    expect(provider.customers).toHaveLength(0);
    expect(provider.sessions).toHaveLength(0);
    expect(auditWrite).toHaveBeenCalledTimes(1);
  });

  it("fires plan-change hooks and records triggeredBy when the package changes", async () => {
    (getPlanChangeHooks() as PlanChangeHook[]).length = 0;
    const hook = vi.fn().mockResolvedValue(undefined);
    registerPlanChangeHook(hook);

    const provider = new FakePaymentProvider();
    provider.subscriptions.push({
      id: "sub_reconcile",
      customerId: "cus_reconcile",
      status: "active",
      metadata: {
        tenantId: TENANT_ID,
        packageId: PACKAGE_ID,
        packageVersionId: VERSION_ID,
        packageVersion: "2",
        billingInterval: "monthly",
      },
      priceId: "price_pro",
      currentPeriodStart: new Date("2026-07-01T00:00:00Z"),
      currentPeriodEnd: new Date("2026-08-01T00:00:00Z"),
      cancelAtPeriodEnd: false,
    });

    const result = await syncTenantSubscriptionFromProvider(
      TENANT_ID,
      {
        tenantId: "507f1f77bcf86cd799439088",
        actorId: "507f1f77bcf86cd799439087",
        actorEmail: "admin@example.com",
        actorRole: "SUPER_ADMIN",
      },
      provider,
    );

    expect(result.status).toBe("ACTIVE");
    expect(hook).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      fromPackageId: "507f1f77bcf86cd799439055",
      toPackageId: PACKAGE_ID,
      fromStatus: "ACTIVE",
      toStatus: "ACTIVE",
    });
    const auditPayload = auditWrite.mock.calls[0][0];
    expect(auditPayload.changes.triggeredBy).toBe("provider_sync");
    expect(auditPayload.changes.reason).toContain("synchronized");
  });

  it("skips subscriptions with a null tenantId and reports the skipped count", async () => {
    const nullTenantSubscription = {
      _id: "507f1f77bcf86cd799439014",
      tenantId: null,
      packageId: "507f1f77bcf86cd799439055",
      packageVersionId: null,
      packageVersion: 1,
      status: "ACTIVE",
      paymentState: "failed",
    };
    const normalSubscription = {
      _id: "507f1f77bcf86cd799439015",
      tenantId: TENANT_ID,
      packageId: "507f1f77bcf86cd799439055",
      packageVersionId: null,
      packageVersion: 1,
      providerCustomerId: "cus_normal",
      providerSubscriptionId: "sub_normal",
      status: "ACTIVE",
      paymentState: "paid",
    };
    (SubscriptionModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
      query([nullTenantSubscription, normalSubscription]),
    );
    const eventFindOne = PaymentEventModel.findOne as ReturnType<typeof vi.fn>;
    eventFindOne.mockReturnValue(
      query({
        eventType: "customer.subscription.deleted",
        status: "processed",
        createdAt: new Date("2026-08-01T00:00:00Z"),
      }),
    );

    const result = await reconcileSubscriptions({
      tenantId: "507f1f77bcf86cd799439088",
      actorId: "507f1f77bcf86cd799439087",
      actorEmail: "admin@example.com",
      actorRole: "SUPER_ADMIN",
    });

    expect(result.totalSubscriptions).toBe(2);
    expect(result.skippedNullTenant).toBe(1);
    expect(result.mismatched).toHaveLength(1);
    expect(result.mismatched[0]).toMatchObject({
      tenantId: TENANT_ID,
      localStatus: "ACTIVE",
      localPaymentState: "paid",
    });
    expect(result.mismatched[0].issues[0]).toContain(
      "customer.subscription.deleted",
    );
    // The null-tenant row must be skipped before any work per row: the only
    // payment-event lookup is for the normal row, keyed by its real tenantId.
    expect(eventFindOne).toHaveBeenCalledTimes(1);
    expect(eventFindOne.mock.calls[0][0]).toMatchObject({
      tenantId: TENANT_ID,
      status: "processed",
    });
  });
});
