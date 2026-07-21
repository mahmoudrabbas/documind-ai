import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PackageDocument } from "../../../db/models/package.model.js";
import type { PaymentProvider } from "../ports/payment-provider.port.js";
import {
  syncPackageToStripe,
  isBillable,
  monthlyPricingChanged,
  annualPricingChanged,
} from "../stripe-sync.service.js";
import { AppError } from "../../../common/errors/AppError.js";

function mockPackage(overrides: Record<string, unknown> = {}): PackageDocument {
  const base = {
    _id: "507f1f77bcf86cd799439011",
    name: "Pro Plan",
    code: "pro",
    description: "Pro plan",
    active: true,
    version: 1,
    monthlyPrice: 2900,
    annualPrice: 29000,
    currency: "USD",
    trialDays: 14,
    stripeProductId: "",
    stripePriceId: "",
    stripeAnnualPriceId: "",
    entitlements: {
      employees: 10,
      admins: 2,
      documents: 500,
      storageMb: 1024,
      fileSizeMb: 25,
      queriesPerMonth: 5000,
      tokensPerMonth: 100_000,
      ocrPagesPerMonth: 100,
    },
    supportedModels: ["basic"],
    analyticsLevel: "basic" as const,
    retentionDays: 90,
    supportLevel: "community" as const,
    visibility: "public" as const,
    versions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return { ...base, ...overrides } as unknown as PackageDocument;
}

function createMockProvider(overrides: Partial<PaymentProvider> = {}): PaymentProvider {
  return {
    createCustomer: vi.fn(),
    createCheckoutSession: vi.fn(),
    retrieveCheckoutSession: vi.fn(),
    verifyWebhookSignature: vi.fn(),
    parseWebhookEvent: vi.fn(),
    createProduct: vi.fn().mockResolvedValue({ id: "prod_test_123", name: "Test" }),
    createPrice: vi.fn().mockImplementation((params) =>
      Promise.resolve({
        id: params.interval === "year" ? "price_annual_456" : "price_monthly_456",
        productId: "prod_test_123",
        unitAmount: params.unitAmount,
        currency: params.currency,
        interval: params.interval,
      }),
    ),
    ...overrides,
  } as PaymentProvider;
}

describe("stripe-sync.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isBillable", () => {
    it("returns true when monthlyPrice > 0", () => {
      expect(isBillable(mockPackage({ monthlyPrice: 2900 }))).toBe(true);
    });

    it("returns true when annualPrice > 0", () => {
      expect(isBillable(mockPackage({ monthlyPrice: 0, annualPrice: 29000 }))).toBe(true);
    });

    it("returns false when both prices are 0", () => {
      expect(isBillable(mockPackage({ monthlyPrice: 0, annualPrice: 0 }))).toBe(false);
    });
  });

  describe("monthlyPricingChanged", () => {
    const pkg = mockPackage({ monthlyPrice: 2900, currency: "USD" });

    it("returns true when monthlyPrice changes", () => {
      expect(monthlyPricingChanged(pkg, { monthlyPrice: 3900 })).toBe(true);
    });

    it("returns true when currency changes", () => {
      expect(monthlyPricingChanged(pkg, { currency: "EUR" })).toBe(true);
    });

    it("returns false when nothing changes", () => {
      expect(monthlyPricingChanged(pkg, { monthlyPrice: 2900, currency: "USD" })).toBe(false);
    });

    it("returns false when no updates provided", () => {
      expect(monthlyPricingChanged(pkg, {})).toBe(false);
    });
  });

  describe("annualPricingChanged", () => {
    const pkg = mockPackage({ annualPrice: 29000, currency: "USD" });

    it("returns true when annualPrice changes", () => {
      expect(annualPricingChanged(pkg, { annualPrice: 39000 })).toBe(true);
    });

    it("returns true when currency changes", () => {
      expect(annualPricingChanged(pkg, { currency: "EUR" })).toBe(true);
    });

    it("returns false when nothing changes", () => {
      expect(annualPricingChanged(pkg, { annualPrice: 29000, currency: "USD" })).toBe(false);
    });

    it("returns false when no updates provided", () => {
      expect(annualPricingChanged(pkg, {})).toBe(false);
    });
  });

  describe("syncPackageToStripe", () => {
    it("skips Stripe for free packages", async () => {
      const pkg = mockPackage({ monthlyPrice: 0, annualPrice: 0 });
      const provider = createMockProvider();

      const result = await syncPackageToStripe(pkg, provider);

      expect(result.stripeProductId).toBe("");
      expect(result.stripePriceId).toBe("");
      expect(result.stripeAnnualPriceId).toBe("");
      expect(provider.createProduct).not.toHaveBeenCalled();
      expect(provider.createPrice).not.toHaveBeenCalled();
    });

    it("creates product, monthly price, and annual price for a new billable package", async () => {
      const pkg = mockPackage();
      const provider = createMockProvider();

      const result = await syncPackageToStripe(pkg, provider);

      expect(result.stripeProductId).toBe("prod_test_123");
      expect(result.stripePriceId).toBe("price_monthly_456");
      expect(result.stripeAnnualPriceId).toBe("price_annual_456");
      expect(provider.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Pro Plan", metadata: expect.objectContaining({ packageCode: "pro" }) }),
      );
      expect(provider.createPrice).toHaveBeenCalledTimes(2);
      expect(provider.createPrice).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: "prod_test_123",
          unitAmount: 2900,
          currency: "usd",
          interval: "month",
        }),
      );
      expect(provider.createPrice).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: "prod_test_123",
          unitAmount: 29000,
          currency: "usd",
          interval: "year",
        }),
      );
    });

    it("is idempotent when IDs already exist and pricing unchanged", async () => {
      const pkg = mockPackage({
        stripeProductId: "prod_existing",
        stripePriceId: "price_existing_monthly",
        stripeAnnualPriceId: "price_existing_annual",
      });
      const provider = createMockProvider();

      const result = await syncPackageToStripe(pkg, provider);

      expect(result.stripeProductId).toBe("prod_existing");
      expect(result.stripePriceId).toBe("price_existing_monthly");
      expect(result.stripeAnnualPriceId).toBe("price_existing_annual");
      expect(provider.createProduct).not.toHaveBeenCalled();
      expect(provider.createPrice).not.toHaveBeenCalled();
    });

    it("creates new monthly price when monthly pricing changes", async () => {
      const pkg = mockPackage({
        stripeProductId: "prod_existing",
        stripePriceId: "price_old_monthly",
        stripeAnnualPriceId: "price_existing_annual",
      });
      const provider = createMockProvider();

      const result = await syncPackageToStripe(pkg, provider, { monthlyPrice: 3900 });

      expect(result.stripeProductId).toBe("prod_existing");
      expect(result.stripePriceId).toBe("price_monthly_456");
      expect(result.stripeAnnualPriceId).toBe("price_existing_annual");
      expect(provider.createProduct).not.toHaveBeenCalled();
      expect(provider.createPrice).toHaveBeenCalledOnce();
      expect(provider.createPrice).toHaveBeenCalledWith(
        expect.objectContaining({ unitAmount: 3900, interval: "month" }),
      );
    });

    it("creates new annual price when annual pricing changes", async () => {
      const pkg = mockPackage({
        stripeProductId: "prod_existing",
        stripePriceId: "price_existing_monthly",
        stripeAnnualPriceId: "price_old_annual",
      });
      const provider = createMockProvider();

      const result = await syncPackageToStripe(pkg, provider, { annualPrice: 39000 });

      expect(result.stripeProductId).toBe("prod_existing");
      expect(result.stripePriceId).toBe("price_existing_monthly");
      expect(result.stripeAnnualPriceId).toBe("price_annual_456");
      expect(provider.createProduct).not.toHaveBeenCalled();
      expect(provider.createPrice).toHaveBeenCalledOnce();
      expect(provider.createPrice).toHaveBeenCalledWith(
        expect.objectContaining({ unitAmount: 39000, interval: "year" }),
      );
    });

    it("creates new monthly price when stripePriceId is missing but productId exists", async () => {
      const pkg = mockPackage({
        stripeProductId: "prod_existing",
        stripePriceId: "",
        stripeAnnualPriceId: "price_existing_annual",
      });
      const provider = createMockProvider();

      const result = await syncPackageToStripe(pkg, provider);

      expect(result.stripeProductId).toBe("prod_existing");
      expect(result.stripePriceId).toBe("price_monthly_456");
      expect(result.stripeAnnualPriceId).toBe("price_existing_annual");
      expect(provider.createProduct).not.toHaveBeenCalled();
      expect(provider.createPrice).toHaveBeenCalledOnce();
    });

    it("creates new annual price when stripeAnnualPriceId is missing but productId exists", async () => {
      const pkg = mockPackage({
        stripeProductId: "prod_existing",
        stripePriceId: "price_existing_monthly",
        stripeAnnualPriceId: "",
      });
      const provider = createMockProvider();

      const result = await syncPackageToStripe(pkg, provider);

      expect(result.stripeProductId).toBe("prod_existing");
      expect(result.stripePriceId).toBe("price_existing_monthly");
      expect(result.stripeAnnualPriceId).toBe("price_annual_456");
      expect(provider.createProduct).not.toHaveBeenCalled();
      expect(provider.createPrice).toHaveBeenCalledOnce();
    });

    it("creates both prices when both are missing", async () => {
      const pkg = mockPackage({
        stripeProductId: "prod_existing",
        stripePriceId: "",
        stripeAnnualPriceId: "",
      });
      const provider = createMockProvider();

      const result = await syncPackageToStripe(pkg, provider);

      expect(result.stripeProductId).toBe("prod_existing");
      expect(result.stripePriceId).toBe("price_monthly_456");
      expect(result.stripeAnnualPriceId).toBe("price_annual_456");
      expect(provider.createPrice).toHaveBeenCalledTimes(2);
    });

    it("creates only monthly price when annualPrice is 0", async () => {
      const pkg = mockPackage({
        annualPrice: 0,
        stripeProductId: "",
      });
      const provider = createMockProvider();

      const result = await syncPackageToStripe(pkg, provider);

      expect(result.stripePriceId).toBe("price_monthly_456");
      expect(result.stripeAnnualPriceId).toBe("");
      expect(provider.createPrice).toHaveBeenCalledTimes(1);
      expect(provider.createPrice).toHaveBeenCalledWith(
        expect.objectContaining({ interval: "month" }),
      );
    });

    it("creates only annual price when monthlyPrice is 0", async () => {
      const pkg = mockPackage({
        monthlyPrice: 0,
        annualPrice: 29000,
        stripeProductId: "",
      });
      const provider = createMockProvider();

      const result = await syncPackageToStripe(pkg, provider);

      expect(result.stripePriceId).toBe("");
      expect(result.stripeAnnualPriceId).toBe("price_annual_456");
      expect(provider.createPrice).toHaveBeenCalledTimes(1);
      expect(provider.createPrice).toHaveBeenCalledWith(
        expect.objectContaining({ interval: "year" }),
      );
    });

    it("throws when product creation fails", async () => {
      const pkg = mockPackage();
      const provider = createMockProvider({
        createProduct: vi.fn().mockRejectedValue(new Error("Stripe API error")),
      });

      await expect(syncPackageToStripe(pkg, provider)).rejects.toThrow(AppError);
      expect(pkg.stripeProductId).toBe("");
      expect(pkg.stripePriceId).toBe("");
      expect(pkg.stripeAnnualPriceId).toBe("");
    });

    it("throws when monthly price creation fails", async () => {
      const pkg = mockPackage();
      const provider = createMockProvider({
        createPrice: vi.fn().mockImplementation((params) => {
          if (params.interval === "month") {
            return Promise.reject(new Error("Stripe API error"));
          }
          return Promise.resolve({
            id: "price_annual_456",
            productId: "prod_test_123",
            unitAmount: params.unitAmount,
            currency: params.currency,
            interval: "year",
          });
        }),
      });

      await expect(syncPackageToStripe(pkg, provider)).rejects.toThrow(AppError);
      expect(pkg.stripeProductId).toBe("prod_test_123");
      expect(pkg.stripePriceId).toBe("");
    });

    it("throws when annual price creation fails", async () => {
      const pkg = mockPackage();
      const provider = createMockProvider({
        createPrice: vi.fn().mockImplementation((params) => {
          if (params.interval === "year") {
            return Promise.reject(new Error("Stripe API error"));
          }
          return Promise.resolve({
            id: "price_monthly_456",
            productId: "prod_test_123",
            unitAmount: params.unitAmount,
            currency: params.currency,
            interval: "month",
          });
        }),
      });

      await expect(syncPackageToStripe(pkg, provider)).rejects.toThrow(AppError);
      expect(pkg.stripeProductId).toBe("prod_test_123");
      expect(pkg.stripePriceId).toBe("price_monthly_456");
      expect(pkg.stripeAnnualPriceId).toBe("");
    });

    it("mutates the package document with Stripe IDs", async () => {
      const pkg = mockPackage();
      const provider = createMockProvider();

      await syncPackageToStripe(pkg, provider);

      expect(pkg.stripeProductId).toBe("prod_test_123");
      expect(pkg.stripePriceId).toBe("price_monthly_456");
      expect(pkg.stripeAnnualPriceId).toBe("price_annual_456");
    });

    it("creates new prices when currency changes", async () => {
      const pkg = mockPackage({
        stripeProductId: "prod_existing",
        stripePriceId: "price_old_monthly",
        stripeAnnualPriceId: "price_old_annual",
      });
      const provider = createMockProvider();

      const result = await syncPackageToStripe(pkg, provider, { currency: "EUR" });

      expect(result.stripePriceId).toBe("price_monthly_456");
      expect(result.stripeAnnualPriceId).toBe("price_annual_456");
      expect(provider.createPrice).toHaveBeenCalledTimes(2);
    });
  });
});
