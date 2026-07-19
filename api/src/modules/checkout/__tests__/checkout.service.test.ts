import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/models/package.model.js", () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock("../../../db/models/subscription.model.js", () => ({
  default: {
    findOne: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock("../../../db/models/checkoutSession.model.js", () => ({
  default: {
    create: vi.fn(),
    findOne: vi.fn(),
    find: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

vi.mock("../../../common/observability/index.js", () => ({
  getAuditWriter: () => ({ write: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock("../../permissions/permissions.operation.js", () => ({
  authorizeTenantOperation: vi.fn(async (actor: Record<string, unknown>) => ({
    ...actor,
    actorKind: "USER",
  })),
}));

import PackageModel from "../../../db/models/package.model.js";
import SubscriptionModel from "../../../db/models/subscription.model.js";
import CheckoutSessionModel from "../../../db/models/checkoutSession.model.js";
import { FakePaymentProvider } from "../../billing/ports/fakes/fake-payment-provider.js";
import { createCheckoutSession, getCheckoutStatus } from "../checkout.service.js";

const TENANT_ID = "507f1f77bcf86cd799439011";
const PACKAGE_ID = "507f1f77bcf86cd799439012";

const TEST_ACTOR = {
  tenantId: TENANT_ID,
  actorId: "507f1f77bcf86cd799439013",
  actorEmail: "admin@co.com",
  actorRole: "COMPANY_ADMIN" as const,
};

function mockQueryChain<T>(result: T) {
  const chain = {
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(result),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  chain.lean = vi.fn(() => chain);
  chain.sort = vi.fn(() => chain);
  chain.skip = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  return chain;
}

describe("CheckoutService", () => {
  let fakeProvider: FakePaymentProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeProvider = new FakePaymentProvider();
    fakeProvider._reset();
  });

  describe("createCheckoutSession", () => {
    it("creates a checkout session for an active package", async () => {
      const mockPkg = {
        _id: PACKAGE_ID,
        active: true,
        version: 1,
        code: "basic",
        name: "Basic",
        monthlyPrice: 29,
        annualPrice: 290,
      };

      (PackageModel.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(mockPkg),
      );
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(null),
      );
      (CheckoutSessionModel.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        {
          _id: "cs_test_123",
          tenantId: TENANT_ID,
          packageId: PACKAGE_ID,
        },
      );

      const result = await createCheckoutSession(
        TENANT_ID,
        PACKAGE_ID,
        "monthly",
        fakeProvider,
        "https://example.com/success",
        "https://example.com/cancel",
        TEST_ACTOR,
      );

      expect(result.sessionUrl).toBeTruthy();
      expect(result.checkoutId).toBe("cs_test_123");
      expect(fakeProvider.customers.length).toBe(1);
    });

    it("throws 404 when package not found", async () => {
      (PackageModel.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(null),
      );

      await expect(
        createCheckoutSession(
          TENANT_ID,
          PACKAGE_ID,
          "monthly",
          fakeProvider,
          "https://example.com/success",
          "https://example.com/cancel",
          TEST_ACTOR,
        ),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("throws 400 when package is not active", async () => {
      (PackageModel.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain({ _id: PACKAGE_ID, active: false, version: 1, monthlyPrice: 0 }),
      );

      await expect(
        createCheckoutSession(
          TENANT_ID,
          PACKAGE_ID,
          "monthly",
          fakeProvider,
          "https://example.com/success",
          "https://example.com/cancel",
          TEST_ACTOR,
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe("getCheckoutStatus", () => {
    it("returns the checkout session when found", async () => {
      const mockSession = {
        _id: "cs_1",
        tenantId: TENANT_ID,
        status: "pending",
      };

      (CheckoutSessionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(mockSession),
      );

      const result = await getCheckoutStatus("cs_1", TENANT_ID, TEST_ACTOR);
      expect(result._id).toBe("cs_1");
      expect(result.status).toBe("pending");
    });

    it("throws 404 when session not found", async () => {
      (CheckoutSessionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(null),
      );

      await expect(
        getCheckoutStatus("cs_nonexistent", TENANT_ID, TEST_ACTOR),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
