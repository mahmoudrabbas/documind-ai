import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditWrite: vi.fn(),
  authorizeTenantOperation: vi.fn(async (context: Record<string, unknown>) => ({ ...context, actorKind: "USER" })),
}));

vi.mock("../../../common/observability/index.js", () => ({
  getAuditWriter: () => ({ write: mocks.auditWrite }),
}));
vi.mock("../../permissions/permissions.operation.js", () => ({
  authorizeTenantOperation: mocks.authorizeTenantOperation,
}));
vi.mock("../../../db/models/subscription.model.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("../../../db/models/package.model.js", () => ({ default: { findById: vi.fn() } }));
vi.mock("../../../db/models/billingOperation.model.js", () => ({ default: { exists: vi.fn() } }));
vi.mock("../../../db/models/billingPreview.model.js", () => ({ default: { create: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn() } }));

import SubscriptionModel from "../../../db/models/subscription.model.js";
import PackageModel from "../../../db/models/package.model.js";
import BillingOperationModel from "../../../db/models/billingOperation.model.js";
import BillingPreviewModel from "../../../db/models/billingPreview.model.js";
import { BillingOperationService } from "../billing-operation.service.js";
import { createSubscriptionChangePreview, requestCancellation, requestReactivation, requestSubscriptionChange } from "../tenant-billing-mutations.service.js";
import type { PaymentProvider } from "../ports/payment-provider.port.js";

const tenantId = "507f1f77bcf86cd799439011";
const actorContext = {
  tenantId,
  actorId: "507f1f77bcf86cd799439012",
  actorEmail: "billing@example.test",
  actorRole: "COMPANY_ADMIN" as const,
  traceId: "trace-1",
  requestId: "request-1",
};

function chain<T>(value: T) {
  const result = { populate: vi.fn(), select: vi.fn(), lean: vi.fn(), sort: vi.fn(), exec: vi.fn().mockResolvedValue(value) };
  for (const method of ["populate", "select", "lean", "sort"] as const) result[method].mockReturnValue(result);
  return result;
}

const subscription = {
  _id: "507f1f77bcf86cd799439013",
  tenantId,
  packageId: { _id: "507f1f77bcf86cd799439020", name: "Pro", code: "pro", version: 2, currency: "USD", entitlements: { employees: 1, documents: 10, storageMb: 100, queriesPerMonth: 1000 } },
  packageVersionId: "507f1f77bcf86cd799439021",
  packageVersion: 2,
  billingInterval: "monthly",
  revision: 3,
  status: "ACTIVE",
  paymentState: "paid",
  cancelAtPeriodEnd: false,
  currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
  provider: "fake",
  providerCustomerId: "cus_owned",
  providerSubscriptionId: "sub_owned",
  providerPriceId: "price_pro_monthly",
};
const targetPackage = {
  _id: "507f1f77bcf86cd799439030",
  name: "Enterprise",
  code: "enterprise",
  version: 4,
  active: true,
  visibility: "public",
  currency: "USD",
  entitlements: { employees: 5, documents: 50, storageMb: 500, queriesPerMonth: 5000 },
  stripePriceId: "price_enterprise_monthly",
  stripeAnnualPriceId: "price_enterprise_annual",
  versions: [{
    _id: "507f1f77bcf86cd799439031",
    version: 4,
    name: "Enterprise",
    code: "enterprise",
    currency: "USD",
    entitlements: { employees: 5, documents: 50, storageMb: 500, queriesPerMonth: 5000 },
    stripePriceId: "price_enterprise_monthly",
    stripeAnnualPriceId: "price_enterprise_annual",
  }],
};
const downgradePackage = {
  _id: "507f1f77bcf86cd799439025",
  name: "Basic",
  code: "basic",
  version: 3,
  active: true,
  visibility: "public",
  currency: "USD",
  entitlements: { employees: 1, documents: 10, storageMb: 100, queriesPerMonth: 1000 },
  versions: [{ _id: "507f1f77bcf86cd799439026", version: 3, name: "Basic", code: "basic", currency: "USD", entitlements: { employees: 1, documents: 10, storageMb: 100, queriesPerMonth: 1000 }, stripePriceId: "price_basic_monthly", stripeAnnualPriceId: "price_basic_annual" }],
};

describe("tenant billing mutations service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditWrite.mockResolvedValue(true);
    vi.mocked(SubscriptionModel.findOne).mockReturnValue(chain(subscription) as never);
    vi.mocked(PackageModel.findById).mockReturnValue(chain(targetPackage) as never);
    vi.mocked(BillingOperationModel.exists).mockResolvedValue(null);
    vi.mocked(BillingPreviewModel.create).mockImplementation(async (value: Record<string, unknown>) => value as never);
    vi.mocked(BillingPreviewModel.findOne).mockReturnValue(chain(null) as never);
    vi.spyOn(BillingOperationService.prototype, "execute").mockResolvedValue({
      operation: {
        _id: "507f1f77bcf86cd799439040",
        operationType: "PLAN_CHANGE",
        status: "PROVIDER_PENDING",
        requestedAt: new Date("2026-07-20T00:00:00.000Z"),
        confirmedAt: null,
        failedAt: null,
        retryCount: 0,
        failureCode: "",
        effectiveAt: null,
        cancellationType: null,
      } as never,
      result: { operationReference: "507f1f77bcf86cd799439040", state: { id: "sub_owned" } },
      replayed: false,
    });
    vi.spyOn(BillingOperationService.prototype, "begin").mockResolvedValue({
      operation: {
        _id: "507f1f77bcf86cd799439040",
        operationType: "PLAN_CHANGE",
        status: "REQUESTED",
        requestedAt: new Date("2026-07-20T00:00:00.000Z"),
        confirmedAt: null,
        failedAt: null,
        retryCount: 0,
        failureCode: "",
        effectiveAt: null,
        cancellationType: null,
      } as never,
      replayed: false,
    });
    vi.spyOn(BillingOperationService.prototype, "markProviderPending").mockResolvedValue({
      _id: "507f1f77bcf86cd799439040",
      operationType: "PLAN_CHANGE",
      status: "PROVIDER_PENDING",
      requestedAt: new Date("2026-07-20T00:00:00.000Z"),
      confirmedAt: null,
      failedAt: null,
      retryCount: 0,
      failureCode: "",
      effectiveAt: null,
      cancellationType: null,
      revision: 1,
    } as never);
    vi.spyOn(BillingOperationService.prototype, "recordProviderResult").mockResolvedValue(undefined);
  });

  it("creates a provider-derived preview and returns only safe local fields", async () => {
    const provider = {
      previewSubscriptionChange: vi.fn().mockResolvedValue({
        id: "preview_provider_1",
        subscriptionId: "sub_owned",
        customerId: "cus_owned",
        currentPriceReference: "price_pro_monthly",
        targetPriceReference: "price_enterprise_monthly",
        currency: "USD",
        amountDueMinor: 5000,
        effectiveAt: new Date("2026-07-20T00:00:00.000Z"),
        expiresAt: new Date("2026-07-20T00:15:00.000Z"),
        providerStateObservedAt: new Date("2026-07-20T00:00:00.000Z"),
      }),
    } as unknown as PaymentProvider;
    const preview = await createSubscriptionChangePreview({
      tenantId,
      targetPackageId: String(targetPackage._id),
      billingInterval: "monthly",
      provider,
      context: actorContext,
    });
    expect(preview).toMatchObject({
      currentPackage: { name: "Pro", version: 2 },
      targetPackage: { name: "Enterprise", version: 4 },
      billingInterval: "monthly",
      amountDueMinor: 5000,
    });
    expect(JSON.stringify(preview)).not.toContain("cus_owned");
  });

  it("rejects a same-plan preview safely", async () => {
    vi.mocked(PackageModel.findById).mockReturnValue(chain({
      ...targetPackage,
      _id: subscription.packageId._id,
      version: 2,
      versions: [{ ...targetPackage.versions[0], _id: subscription.packageVersionId, version: 2, stripePriceId: subscription.providerPriceId }],
    }) as never);
    await expect(createSubscriptionChangePreview({
      tenantId,
      targetPackageId: String(subscription.packageId._id),
      billingInterval: "monthly",
      provider: {} as never,
      context: actorContext,
    })).rejects.toMatchObject({ code: "BILLING_OPERATION_NOT_ALLOWED" });
  });

  it("previews a monthly downgrade with provider credit and preserves currency", async () => {
    vi.mocked(PackageModel.findById).mockReturnValue(chain(downgradePackage) as never);
    const previewSubscriptionChange = vi.fn().mockResolvedValue({
        id: "preview_downgrade", subscriptionId: "subscription", customerId: "customer",
        currentPriceReference: "price_pro_monthly", targetPriceReference: "price_basic_monthly",
        currency: "USD", amountDueMinor: -700, effectiveAt: new Date("2026-08-01"), expiresAt: new Date("2026-07-20T00:15:00.000Z"), providerStateObservedAt: new Date("2026-07-20"),
    });
    const provider = { previewSubscriptionChange } as unknown as PaymentProvider;
    const preview = await createSubscriptionChangePreview({ tenantId, targetPackageId: downgradePackage._id, billingInterval: "monthly", provider, context: actorContext });
    expect(preview).toMatchObject({ targetPackage: { code: "basic", version: 3 }, amountDueMinor: 0, amountCreditMinor: 700, currency: "USD" });
    expect(previewSubscriptionChange).toHaveBeenCalledOnce();
  });

  it("confirms a stored downgrade preview through the durable provider mutation path", async () => {
    vi.mocked(PackageModel.findById).mockReturnValue(chain(downgradePackage) as never);
    vi.mocked(BillingPreviewModel.findOne).mockReturnValue(chain({
      _id: "507f1f77bcf86cd799439050", tenantId, subscriptionId: subscription._id,
      targetPackageId: downgradePackage._id, targetPackageVersionId: downgradePackage.versions[0]._id, targetPackageVersion: 3,
      targetBillingInterval: "monthly", currency: "USD", amountDueMinor: 0, amountCreditMinor: 700,
      expiresAt: new Date("2099-08-20"), subscriptionRevision: 3, providerPreviewReference: "preview_downgrade",
    }) as never);
    vi.mocked(BillingPreviewModel.findOneAndUpdate).mockReturnValue({ exec: vi.fn().mockResolvedValue({ _id: "507f1f77bcf86cd799439050", consumedByOperationId: "507f1f77bcf86cd799439040" }) } as never);
    const provider = { updateSubscription: vi.fn().mockResolvedValue({ operationReference: "provider-op-downgrade", state: { id: "sub_owned" } }) } as unknown as PaymentProvider;
    const result = await requestSubscriptionChange({ tenantId, previewId: "507f1f77bcf86cd799439050", idempotencyKey: "phase3-downgrade-key", provider, context: actorContext });
    expect(result.operation).toMatchObject({ type: "PLAN_CHANGE", status: "PROVIDER_PENDING" });
    expect(provider.updateSubscription).toHaveBeenCalledOnce();
  });

  it("requests a durable plan change from a stored preview", async () => {
    vi.mocked(BillingPreviewModel.findOne).mockReturnValue(chain({
      _id: "507f1f77bcf86cd799439050",
      tenantId,
      subscriptionId: subscription._id,
      targetPackageId: targetPackage._id,
      targetPackageVersionId: targetPackage.versions[0]._id,
      targetPackageVersion: 4,
      targetBillingInterval: "monthly",
      currency: "USD",
      expiresAt: new Date("2026-08-20T00:15:00.000Z"),
      subscriptionRevision: 3,
      providerPreviewReference: "preview_provider_1",
    }) as never);
    vi.mocked(BillingPreviewModel.findOneAndUpdate).mockReturnValue({
      exec: vi.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439050",
        consumedByOperationId: "507f1f77bcf86cd799439040",
      }),
    } as never);
    const provider = { updateSubscription: vi.fn().mockResolvedValue({ operationReference: "provider-op-1", state: { id: "sub_owned" } }) } as unknown as PaymentProvider;
    const result = await requestSubscriptionChange({
      tenantId,
      previewId: "507f1f77bcf86cd799439050",
      idempotencyKey: "phase3-plan-change-key",
      provider,
      context: actorContext,
    });
    expect(result.replayed).toBe(false);
    expect(result.operation).toMatchObject({ type: "PLAN_CHANGE", status: "PROVIDER_PENDING" });
    expect(provider.updateSubscription).toHaveBeenCalledOnce();
    expect(BillingPreviewModel.findOneAndUpdate).toHaveBeenCalledOnce();
  });

  it("replays an existing plan change without re-consuming the preview", async () => {
    vi.mocked(BillingPreviewModel.findOne).mockReturnValue(chain({
      _id: "507f1f77bcf86cd799439050",
      tenantId,
      subscriptionId: subscription._id,
      targetPackageId: targetPackage._id,
      targetPackageVersionId: targetPackage.versions[0]._id,
      targetPackageVersion: 4,
      targetBillingInterval: "monthly",
      currency: "USD",
      expiresAt: new Date("2026-08-20T00:15:00.000Z"),
      subscriptionRevision: 3,
      providerPreviewReference: "preview_provider_1",
    }) as never);
    vi.mocked(BillingOperationService.prototype.begin).mockResolvedValueOnce({
      operation: {
        _id: "507f1f77bcf86cd799439040",
        operationType: "PLAN_CHANGE",
        status: "PROVIDER_PENDING",
        requestedAt: new Date("2026-07-20T00:00:00.000Z"),
        confirmedAt: null,
        failedAt: null,
        retryCount: 0,
        failureCode: "",
        effectiveAt: null,
        cancellationType: null,
      } as never,
      replayed: true,
    });
    const provider = { updateSubscription: vi.fn() } as unknown as PaymentProvider;
    const result = await requestSubscriptionChange({
      tenantId,
      previewId: "507f1f77bcf86cd799439050",
      idempotencyKey: "phase3-plan-change-key",
      provider,
      context: actorContext,
    });
    expect(result.replayed).toBe(true);
    expect(provider.updateSubscription).not.toHaveBeenCalled();
    expect(BillingPreviewModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("requests period-end cancellation through the durable operation path", async () => {
    const provider = { scheduleCancellation: vi.fn().mockResolvedValue({ operationReference: "provider-op-2", state: { id: "sub_owned" } }) } as never;
    const result = await requestCancellation({
      tenantId,
      cancellationType: "PERIOD_END",
      idempotencyKey: "phase3-cancel-key",
      provider,
      context: actorContext,
    });
    expect(result.operation).toMatchObject({ status: "PROVIDER_PENDING" });
  });

  it("rejects reactivation when no cancellation is scheduled", async () => {
    await expect(requestReactivation({
      tenantId,
      idempotencyKey: "phase3-reactivate-key",
      provider: {} as never,
      context: actorContext,
    })).rejects.toMatchObject({ code: "BILLING_OPERATION_NOT_ALLOWED" });
  });
});
