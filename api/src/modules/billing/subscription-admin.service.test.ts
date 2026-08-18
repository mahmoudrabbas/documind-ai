import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose, { Types } from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import {
  assertDisposableMongoConnection,
  connectToDisposableMongoDatabase,
} from "../../common/testing/disposableMongo.js";
import AuditLogModel from "../../db/models/auditLog.model.js";
import PackageModel from "../../db/models/package.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import TenantModel from "../../db/models/tenant.model.js";
import {
  decideAdminSubscriptionOperation,
  provisionAdminSubscription,
  updateAdminSubscription,
} from "./subscription-admin.service.js";

const packageA = {
  _id: new Types.ObjectId("6a668bed76ec8e0569d93008"), name: "A", code: "a", version: 1,
  active: true, trialDays: 14,
  entitlements: { employees: 1, admins: 1, documents: 10, storageMb: 100,
    fileSizeMb: 10, queriesPerMonth: 100, tokensPerMonth: 0, ocrPagesPerMonth: 0 },
};
const packageB = { ...packageA, _id: new Types.ObjectId("6a668bed76ec8e0569d93009"), name: "B", code: "b", version: 3 };
const existing = {
  _id: new Types.ObjectId(), tenantId: new Types.ObjectId(), packageId: packageA._id,
  packageVersion: 1, status: "ACTIVE" as const, revision: 4,
};

describe("admin subscription decisions", () => {
it("package-only admin update preserves ACTIVE without evaluating ACTIVE to ACTIVE", () => {
  const decision = decideAdminSubscriptionOperation("update", existing, packageB, {
    expectedVersion: 4, packageId: String(packageB._id), reason: "Approved package change",
  });
  expect(decision.packageChanged).toBe(true);
  expect(decision.statusChanged).toBe(false);
  expect(decision.transitionAllowed).toBe(true);
});

it("same status and package is a stable no-change decision", () => {
  const decision = decideAdminSubscriptionOperation("update", existing, packageA, {
    expectedVersion: 4, packageId: String(packageA._id), status: "ACTIVE", reason: "Administrative review",
  });
  expect(decision.transitionAllowed).toBe(false);
  expect(decision.blockingReasons[0] ?? "").toMatch(/does not change/);
});

it("state machine remains authoritative for legal and terminal transitions", () => {
  expect(decideAdminSubscriptionOperation("update", existing, null, {
    expectedVersion: 4, status: "PAUSED", reason: "Administrative pause",
  }).transitionAllowed).toBe(true);
  const canceled = { ...existing, status: "CANCELED" as const };
  const blocked = decideAdminSubscriptionOperation("update", canceled, null, {
    expectedVersion: 4, status: "ACTIVE", reason: "Attempted reactivation",
  });
  expect(blocked.transitionAllowed).toBe(false);
  expect(blocked.blockingReasons.join(" ")).toMatch(/Illegal subscription transition/);
});

it("provider-managed mutation and inactive package assignment fail closed", () => {
  const managed = { ...existing, providerSubscriptionId: "present" };
  expect(decideAdminSubscriptionOperation("update", managed, packageB, {
    expectedVersion: 4, packageId: String(packageB._id), reason: "Provider package change",
  }).transitionAllowed).toBe(false);
  expect(decideAdminSubscriptionOperation("provision", null, { ...packageA, active: false }, {
    expectedVersion: 0, packageId: String(packageA._id), status: "TRIALING", reason: "New subscription provision",
  }).transitionAllowed).toBe(false);
});
});

describe("admin subscription persistence", () => {
  const testDatabaseName = "billing-subscription-admin-test";
  const tenantId = new Types.ObjectId("6a668bed76ec8e0569d93101");
  const packageOneId = new Types.ObjectId("6a668bed76ec8e0569d93102");
  const packageTwoId = new Types.ObjectId("6a668bed76ec8e0569d93103");
  const platformTenantId = new Types.ObjectId("6a668bed76ec8e0569d93104");
  const actor = { userId: String(new Types.ObjectId()), email: "superadmin@integration.test", role: "SUPER_ADMIN" as const, tenantId: String(platformTenantId), traceId: "trace", requestId: "request" };
  const entitlements = packageA.entitlements;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await connectToDisposableMongoDatabase(
        mongoose,
        process.env.MONGODB_URI!,
        testDatabaseName,
      );
    }
    assertDisposableMongoConnection(mongoose.connection, testDatabaseName);
    await SubscriptionModel.init();
  });
  beforeEach(async () => {
    assertDisposableMongoConnection(mongoose.connection, testDatabaseName);
    await Promise.all([
      SubscriptionModel.deleteMany({ tenantId }),
      PackageModel.deleteMany({ _id: { $in: [packageOneId, packageTwoId] } }),
      TenantModel.deleteMany({ _id: tenantId }),
      AuditLogModel.deleteMany({ "changes.targetTenantId": String(tenantId) }),
    ]);
    await TenantModel.create({ _id: tenantId, name: "Phase Four Tenant", slug: "phase-four-tenant", status: "active", plan: "free" });
    await PackageModel.create([
      { _id: packageOneId, name: "Trial", code: "phase-four-trial", monthlyPrice: 10, version: 2, trialDays: 14, entitlements,
        versions: [{ version: 2, name: "Trial", code: "phase-four-trial", monthlyPrice: 10, entitlements, createdAt: new Date() }] },
      { _id: packageTwoId, name: "Growth", code: "phase-four-growth", monthlyPrice: 20, version: 4, trialDays: 0, entitlements,
        versions: [{ version: 4, name: "Growth", code: "phase-four-growth", monthlyPrice: 20, entitlements, createdAt: new Date() }] },
    ]);
  });
  afterAll(async () => {
    assertDisposableMongoConnection(mongoose.connection, testDatabaseName);
    await Promise.all([
      SubscriptionModel.deleteMany({ tenantId }), PackageModel.deleteMany({ _id: { $in: [packageOneId, packageTwoId] } }),
      TenantModel.deleteMany({ _id: tenantId }), AuditLogModel.deleteMany({ "changes.targetTenantId": String(tenantId) }),
    ]);
  });

  it("provisions exactly one trial subscription/version and replays without duplicate audit", async () => {
    const input = { packageId: String(packageOneId), status: "TRIALING" as const, expectedVersion: 0 as const, reason: "Approved trial provisioning" };
    const [first, replay] = await Promise.all([
      provisionAdminSubscription(String(tenantId), input, "concurrent-stable-key", actor),
      provisionAdminSubscription(String(tenantId), input, "concurrent-stable-key", actor),
    ]);
    expect(first.packageVersion).toBe(2);
    expect(replay.packageVersion).toBe(2);
    expect(await SubscriptionModel.countDocuments({ tenantId })).toBe(1);
    const stored = await SubscriptionModel.findOne({ tenantId }).lean().exec();
    expect(stored?.status).toBe("TRIALING");
    expect(stored?.providerCustomerId).toBe("");
    expect(stored?.providerSubscriptionId).toBe("");
    expect(stored?.trialEnd).toBeInstanceOf(Date);
    expect(await AuditLogModel.countDocuments({ action: "SUBSCRIPTION_PROVISIONED", "changes.targetTenantId": String(tenantId) })).toBe(1);
  });

  it("rejects conflicting idempotency and duplicate provisioning", async () => {
    const input = { packageId: String(packageOneId), status: "TRIALING" as const, expectedVersion: 0 as const, reason: "Approved trial provisioning" };
    await provisionAdminSubscription(String(tenantId), input, "stable-conflict-key", actor);
    await expect(provisionAdminSubscription(String(tenantId), { ...input, reason: "Different approved reason" }, "stable-conflict-key", actor))
      .rejects.toMatchObject({ code: "SUBSCRIPTION_IDEMPOTENCY_CONFLICT", statusCode: 409 } satisfies Partial<AppError>);
    await expect(provisionAdminSubscription(String(tenantId), input, "different-valid-key", actor))
      .rejects.toMatchObject({ code: "SUBSCRIPTION_ALREADY_EXISTS", statusCode: 409 } satisfies Partial<AppError>);
  });

  it("atomically changes package without changing ACTIVE and rejects stale updates", async () => {
    await provisionAdminSubscription(String(tenantId), {
      packageId: String(packageTwoId), status: "ACTIVE", expectedVersion: 0, reason: "Approved active provisioning",
    }, "initial-active-key", actor);
    const updated = await updateAdminSubscription(String(tenantId), {
      packageId: String(packageOneId), expectedVersion: 1, reason: "Approved package migration",
    }, "package-change-key", actor);
    expect(updated.status).toBe("ACTIVE");
    expect(String(updated.packageId)).toBe(String(packageOneId));
    expect(updated.packageVersion).toBe(2);
    expect(updated.version).toBe(2);
    await expect(updateAdminSubscription(String(tenantId), {
      status: "PAUSED", expectedVersion: 1, reason: "Stale administrative pause",
    }, "stale-update-key", actor)).rejects.toMatchObject({ code: "SUBSCRIPTION_STALE_VERSION", statusCode: 409 });
    expect(await AuditLogModel.countDocuments({ action: "SUBSCRIPTION_OVERRIDE_DENIED", outcome: "DENIED", "changes.targetTenantId": String(tenantId) })).toBe(1);
  });

  it("fails closed for provider-managed package changes", async () => {
    await provisionAdminSubscription(String(tenantId), {
      packageId: String(packageTwoId), status: "ACTIVE", expectedVersion: 0, reason: "Approved active provisioning",
    }, "provider-initial-key", actor);
    await SubscriptionModel.updateOne({ tenantId }, { $set: { providerSubscriptionId: "provider-owned" } });
    await expect(updateAdminSubscription(String(tenantId), {
      packageId: String(packageOneId), expectedVersion: 2, reason: "Attempt provider package change",
    }, "provider-change-key", actor)).rejects.toMatchObject({ code: "SUBSCRIPTION_PROVIDER_ACTION_REQUIRED", statusCode: 409 });
  });
});
