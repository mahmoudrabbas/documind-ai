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
import { createCheckoutSession, getCheckoutStatus, createBillingPortalSession } from "../checkout.service.js";

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
    it("creates a monthly checkout session for an active package", async () => {
      const mockPkg = {
        _id: PACKAGE_ID,
        active: true,
        version: 1,
        code: "basic",
        name: "Basic",
        monthlyPrice: 29,
        annualPrice: 290,
        stripePriceId: "price_stripe_basic_monthly",
        stripeAnnualPriceId: "price_stripe_basic_annual",
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

    it("selects stripePriceId for monthly billing", async () => {
      const mockPkg = {
        _id: PACKAGE_ID,
        active: true,
        version: 1,
        code: "basic",
        name: "Basic",
        monthlyPrice: 29,
        annualPrice: 290,
        stripePriceId: "price_monthly_basic",
        stripeAnnualPriceId: "price_annual_basic",
      };

      (PackageModel.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(mockPkg),
      );
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(null),
      );
      (CheckoutSessionModel.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        { _id: "cs_monthly_123", tenantId: TENANT_ID, packageId: PACKAGE_ID },
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
      expect(fakeProvider.sessions[0].priceId).toBe("price_monthly_basic");
    });

    it("selects stripeAnnualPriceId for annual billing", async () => {
      const mockPkg = {
        _id: PACKAGE_ID,
        active: true,
        version: 1,
        code: "basic",
        name: "Basic",
        monthlyPrice: 29,
        annualPrice: 290,
        stripePriceId: "price_monthly_basic",
        stripeAnnualPriceId: "price_annual_basic",
      };

      (PackageModel.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(mockPkg),
      );
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(null),
      );
      (CheckoutSessionModel.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        { _id: "cs_annual_123", tenantId: TENANT_ID, packageId: PACKAGE_ID },
      );

      const result = await createCheckoutSession(
        TENANT_ID,
        PACKAGE_ID,
        "annual",
        fakeProvider,
        "https://example.com/success",
        "https://example.com/cancel",
        TEST_ACTOR,
      );

      expect(result.sessionUrl).toBeTruthy();
      expect(fakeProvider.sessions[0].priceId).toBe("price_annual_basic");
    });

    it("throws PRICE_NOT_CONFIGURED when stripePriceId is missing for monthly", async () => {
      const mockPkg = {
        _id: PACKAGE_ID,
        active: true,
        version: 1,
        code: "basic",
        name: "Basic",
        monthlyPrice: 29,
        annualPrice: 290,
        stripePriceId: "",
        stripeAnnualPriceId: "price_annual_basic",
      };

      (PackageModel.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(mockPkg),
      );
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
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
      ).rejects.toMatchObject({ code: "PRICE_NOT_CONFIGURED" });
    });

    it("throws PRICE_NOT_CONFIGURED when stripeAnnualPriceId is missing for annual", async () => {
      const mockPkg = {
        _id: PACKAGE_ID,
        active: true,
        version: 1,
        code: "basic",
        name: "Basic",
        monthlyPrice: 29,
        annualPrice: 290,
        stripePriceId: "price_monthly_basic",
        stripeAnnualPriceId: "",
      };

      (PackageModel.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(mockPkg),
      );
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(null),
      );

      await expect(
        createCheckoutSession(
          TENANT_ID,
          PACKAGE_ID,
          "annual",
          fakeProvider,
          "https://example.com/success",
          "https://example.com/cancel",
          TEST_ACTOR,
        ),
      ).rejects.toMatchObject({ code: "PRICE_NOT_CONFIGURED" });
    });

    it("throws BAD_REQUEST when monthlyPrice is 0 for monthly interval", async () => {
      const mockPkg = {
        _id: PACKAGE_ID,
        active: true,
        version: 1,
        code: "free",
        name: "Free",
        monthlyPrice: 0,
        annualPrice: 0,
        stripePriceId: "",
        stripeAnnualPriceId: "",
      };

      (PackageModel.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(mockPkg),
      );
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
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
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws BAD_REQUEST when annualPrice is 0 for annual interval", async () => {
      const mockPkg = {
        _id: PACKAGE_ID,
        active: true,
        version: 1,
        code: "basic",
        name: "Basic",
        monthlyPrice: 29,
        annualPrice: 0,
        stripePriceId: "price_monthly_basic",
        stripeAnnualPriceId: "",
      };

      (PackageModel.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(mockPkg),
      );
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(null),
      );

      await expect(
        createCheckoutSession(
          TENANT_ID,
          PACKAGE_ID,
          "annual",
          fakeProvider,
          "https://example.com/success",
          "https://example.com/cancel",
          TEST_ACTOR,
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
    describe("provider customer management", () => {
      const mockPkg = {
        _id: PACKAGE_ID,
        active: true,
        version: 1,
        code: "basic",
        name: "Basic",
        monthlyPrice: 29,
        annualPrice: 290,
        stripePriceId: "price_monthly_basic",
        stripeAnnualPriceId: "price_annual_basic",
      };

      function makeMockProvider() {
        return {
          createCustomer: vi.fn().mockResolvedValue("cus_real_new_123"),
          createCheckoutSession: vi.fn().mockResolvedValue({
            id: "cs_new_session",
            url: "https://checkout.stripe.com/new",
            metadata: { tenantId: TENANT_ID },
          }),
          retrieveCheckoutSession: vi.fn(),
          createBillingPortalSession: vi.fn().mockResolvedValue({ url: "https://portal.stripe.com" }),
          verifyWebhookSignature: vi.fn(),
          parseWebhookEvent: vi.fn(),
          createProduct: vi.fn(),
          createPrice: vi.fn(),
          getCheckoutSession: vi.fn(),
          getSubscription: vi.fn(),
          cancelSubscription: vi.fn(),
          listInvoices: vi.fn(),
        };
      }

      it("creates and persists a new customer when providerCustomerId is empty", async () => {
        const provider = makeMockProvider();
        (PackageModel.findById as ReturnType<typeof vi.fn>).mockReturnValue(
          mockQueryChain(mockPkg),
        );
        (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
          mockQueryChain({ providerCustomerId: "", status: "ACTIVE" }),
        );
        (CheckoutSessionModel.create as ReturnType<typeof vi.fn>).mockResolvedValue({
          _id: "cs_empty",
        });

        await createCheckoutSession(
          TENANT_ID, PACKAGE_ID, "monthly", provider,
          "https://ok", "https://cancel", TEST_ACTOR,
        );

        expect(provider.createCustomer).toHaveBeenCalledOnce();
        expect(provider.createCustomer).toHaveBeenCalledWith({
          tenantId: TENANT_ID,
          email: TEST_ACTOR.actorEmail,
          name: TEST_ACTOR.actorEmail,
        });
        expect(SubscriptionModel.updateOne).toHaveBeenCalledWith(
          { tenantId: TENANT_ID },
          { $set: { providerCustomerId: "cus_real_new_123" } },
        );
      });

      it("creates and persists a new real customer when providerCustomerId starts with cus_fake_", async () => {
        const provider = makeMockProvider();
        (PackageModel.findById as ReturnType<typeof vi.fn>).mockReturnValue(
          mockQueryChain(mockPkg),
        );
        (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
          mockQueryChain({ providerCustomerId: "cus_fake_1_1784556342992", status: "ACTIVE" }),
        );
        (CheckoutSessionModel.create as ReturnType<typeof vi.fn>).mockResolvedValue({
          _id: "cs_fake_replaced",
        });

        await createCheckoutSession(
          TENANT_ID, PACKAGE_ID, "monthly", provider,
          "https://ok", "https://cancel", TEST_ACTOR,
        );

        expect(provider.createCustomer).toHaveBeenCalledOnce();
        expect(SubscriptionModel.updateOne).toHaveBeenCalledWith(
          { tenantId: TENANT_ID },
          { $set: { providerCustomerId: "cus_real_new_123" } },
        );
        const checkoutCall = provider.createCheckoutSession.mock.calls[0][0];
        expect(checkoutCall.customerId).toBe("cus_real_new_123");
      });

      it("reuses an existing real providerCustomerId without creating a new customer", async () => {
        const provider = makeMockProvider();
        (PackageModel.findById as ReturnType<typeof vi.fn>).mockReturnValue(
          mockQueryChain(mockPkg),
        );
        (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
          mockQueryChain({ providerCustomerId: "cus_real_existing", status: "ACTIVE" }),
        );
        (CheckoutSessionModel.create as ReturnType<typeof vi.fn>).mockResolvedValue({
          _id: "cs_reuse",
        });

        await createCheckoutSession(
          TENANT_ID, PACKAGE_ID, "monthly", provider,
          "https://ok", "https://cancel", TEST_ACTOR,
        );

        expect(provider.createCustomer).not.toHaveBeenCalled();
        const checkoutCall = provider.createCheckoutSession.mock.calls[0][0];
        expect(checkoutCall.customerId).toBe("cus_real_existing");
      });

      it("never passes a cus_fake_ ID to createCheckoutSession", async () => {
        const provider = makeMockProvider();
        provider.createCustomer.mockResolvedValue("cus_real_fresh");
        (PackageModel.findById as ReturnType<typeof vi.fn>).mockReturnValue(
          mockQueryChain(mockPkg),
        );
        (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
          mockQueryChain({ providerCustomerId: "cus_fake_1_stale", status: "ACTIVE" }),
        );
        (CheckoutSessionModel.create as ReturnType<typeof vi.fn>).mockResolvedValue({
          _id: "cs_no_fake",
        });

        await createCheckoutSession(
          TENANT_ID, PACKAGE_ID, "annual", provider,
          "https://ok", "https://cancel", TEST_ACTOR,
        );

        const checkoutCall = provider.createCheckoutSession.mock.calls[0][0];
        expect(checkoutCall.customerId).not.toMatch(/^cus_fake_/);
        expect(checkoutCall.customerId).toBe("cus_real_fresh");
      });

      it("does not double-persist when sub is null (new tenant)", async () => {
        const provider = makeMockProvider();
        (PackageModel.findById as ReturnType<typeof vi.fn>).mockReturnValue(
          mockQueryChain(mockPkg),
        );
        (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
          mockQueryChain(null),
        );
        (CheckoutSessionModel.create as ReturnType<typeof vi.fn>).mockResolvedValue({
          _id: "cs_no_sub",
        });

        await createCheckoutSession(
          TENANT_ID, PACKAGE_ID, "monthly", provider,
          "https://ok", "https://cancel", TEST_ACTOR,
        );

        expect(provider.createCustomer).toHaveBeenCalledOnce();
        expect(SubscriptionModel.updateOne).toHaveBeenCalledOnce();
      });
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

  describe("createBillingPortalSession", () => {
    it("creates a portal session using the stored providerCustomerId", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain({ providerCustomerId: "cus_real_123", status: "ACTIVE" }),
      );

      const result = await createBillingPortalSession(
        TENANT_ID,
        TEST_ACTOR,
        fakeProvider,
        "https://example.com/checkout",
      );

      expect(result.url).toBeTruthy();
      expect(result.url).toContain("cus_real_123");
    });

    it("throws 404 when subscription not found", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(null),
      );

      await expect(
        createBillingPortalSession(TENANT_ID, TEST_ACTOR, fakeProvider, "https://example.com/checkout"),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("throws BILLING_PORTAL_UNAVAILABLE when providerCustomerId is empty", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain({ providerCustomerId: "", status: "TRIALING" }),
      );

      await expect(
        createBillingPortalSession(TENANT_ID, TEST_ACTOR, fakeProvider, "https://example.com/checkout"),
      ).rejects.toMatchObject({ code: "BILLING_PORTAL_UNAVAILABLE" });
    });

    it("throws BILLING_PORTAL_UNAVAILABLE when providerCustomerId is undefined", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain({ providerCustomerId: undefined, status: "TRIALING" }),
      );

      await expect(
        createBillingPortalSession(TENANT_ID, TEST_ACTOR, fakeProvider, "https://example.com/checkout"),
      ).rejects.toMatchObject({ code: "BILLING_PORTAL_UNAVAILABLE" });
    });

    it("uses the configured return URL", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain({ providerCustomerId: "cus_real_456", status: "ACTIVE" }),
      );

      const result = await createBillingPortalSession(
        TENANT_ID,
        TEST_ACTOR,
        fakeProvider,
        "https://app.example.com/checkout",
      );

      expect(result.url).toContain("https://app.example.com/checkout");
    });

    it("rejects when tenant does not match authenticated user", async () => {
      const wrongActor = { ...TEST_ACTOR, tenantId: "999f1f77bcf86cd799439099" };

      await expect(
        createBillingPortalSession(TENANT_ID, wrongActor, fakeProvider, "https://example.com/checkout"),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("handles provider errors gracefully", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain({ providerCustomerId: "cus_real_err", status: "ACTIVE" }),
      );

      fakeProvider.shouldFailNextCreatePortalSession = true;

      await expect(
        createBillingPortalSession(TENANT_ID, TEST_ACTOR, fakeProvider, "https://example.com/checkout"),
      ).rejects.toThrow();
    });
  });
});
