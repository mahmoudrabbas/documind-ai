import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mockSubscriptionModel = vi.hoisted(() => ({
  findOne: vi.fn(),
}));

vi.mock("../../../db/models/subscription.model.js", () => ({
  default: mockSubscriptionModel,
}));

// Mock the module-level dependencies that registration.service.ts imports.
// These must be defined before importing registration.service.ts.

vi.mock("../subscription.service.js", () => ({
  createSubscription: vi.fn(),
}));

vi.mock("../package.service.js", () => ({
  getPackageByCode: vi.fn(),
  createPackage: vi.fn(),
  mapToSnapshot: vi.fn(),
}));

const mockGetGlobalSettings = vi.hoisted(() => vi.fn());
vi.mock("../../platform/global-settings.js", () => ({
  getGlobalSettings: mockGetGlobalSettings,
}));

// ── Imports under test ───────────────────────────────────────────────────────

import { provisionSubscription } from "../registration.service.js";
import { createSubscription } from "../subscription.service.js";
import { getPackageByCode, createPackage, mapToSnapshot } from "../package.service.js";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for future test expansion
import { AppError } from "../../../common/errors/AppError.js";

// ── Constants & fixtures ─────────────────────────────────────────────────────

const TENANT_ID = "507f1f77bcf86cd799439011";
const PACKAGE_ID = "507f1f77bcf86cd799439012";
const FREE_CODE = "free";

interface MockDoc {
  _id: string;
  id: string;
  name: string;
  code: string;
  version: number;
  monthlyPrice: number;
  [key: string]: unknown;
}

function makePackageDoc(overrides: Partial<MockDoc> = {}): MockDoc {
  return {
    _id: PACKAGE_ID,
    id: PACKAGE_ID,
    name: "Free",
    code: FREE_CODE,
    description: "Free tier with basic access",
    active: true,
    version: 1,
    monthlyPrice: 0,
    annualPrice: 0,
    currency: "USD",
    trialDays: 0,
    entitlements: {
      employees: 5, admins: 0, documents: 100, storageMb: 100,
      fileSizeMb: 10, queriesPerMonth: 500, tokensPerMonth: 0, ocrPagesPerMonth: 0,
    },
    supportedModels: ["basic"],
    analyticsLevel: "basic",
    retentionDays: 90,
    supportLevel: "community",
    visibility: "public",
    ...overrides,
  };
}

function makeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    packageId: PACKAGE_ID,
    version: 1,
    name: "Free",
    code: FREE_CODE,
    description: "Free tier with basic access",
    monthlyPrice: 0,
    annualPrice: 0,
    currency: "USD",
    trialDays: 0,
    entitlements: {
      employees: 5, admins: 0, documents: 100, storageMb: 100,
      fileSizeMb: 10, queriesPerMonth: 500, tokensPerMonth: 0, ocrPagesPerMonth: 0,
    },
    supportedModels: ["basic"],
    analyticsLevel: "basic",
    retentionDays: 90,
    supportLevel: "community",
    visibility: "public",
    ...overrides,
  };
}

function makeSubscriptionDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: "507f1f77bcf86cd799439013",
    id: "507f1f77bcf86cd799439013",
    tenantId: TENANT_ID,
    packageId: PACKAGE_ID,
    packageVersion: 1,
    status: "TRIALING",
    ...overrides,
  };
}

function queryChainLean<T>(result: T) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = { lean: vi.fn(), exec: vi.fn().mockResolvedValue(result) };
  q.lean.mockReturnValue(q);
  return q;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetGlobalSettings.mockResolvedValue({
    supportEmail: "support@example.com",
    maintenanceMode: false,
    allowRegistrations: true,
    defaultTrialDays: 0,
    dataRetentionDays: 365,
  });
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("RegistrationService", () => {
  describe("provisionSubscription", () => {
    it("creates a subscription with the given packageCode", async () => {
      // Idempotency check — no existing subscription
      mockSubscriptionModel.findOne.mockReturnValue(queryChainLean(null));
      // Package lookup succeeds
      const pkg = makePackageDoc({ name: "Pro Plan", code: "pro" });
      vi.mocked(getPackageByCode).mockResolvedValue(pkg as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(mapToSnapshot).mockReturnValue(makeSnapshot({ packageId: PACKAGE_ID }) as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(createSubscription).mockResolvedValue(
        makeSubscriptionDoc() as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      );

      const result = await provisionSubscription(TENANT_ID, "pro");

      expect(getPackageByCode).toHaveBeenCalledWith("pro");
      expect(mapToSnapshot).toHaveBeenCalledWith(pkg);
      expect(createSubscription).toHaveBeenCalledWith(
        TENANT_ID,
        PACKAGE_ID,
        1,
        "TRIALING",
        undefined,
        0,
      );
      expect(result).toBeDefined();
    });

    it("provisions the default free package when packageCode is omitted", async () => {
      mockSubscriptionModel.findOne.mockReturnValue(queryChainLean(null));
      const pkg = makePackageDoc();
      vi.mocked(getPackageByCode).mockResolvedValue(pkg as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(mapToSnapshot).mockReturnValue(makeSnapshot() as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(createSubscription).mockResolvedValue(
        makeSubscriptionDoc() as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      );

      const result = await provisionSubscription(TENANT_ID);

      expect(getPackageByCode).toHaveBeenCalledWith(FREE_CODE);
      expect(result).toBeDefined();
    });

    it("bootstraps the free package if it does not exist yet", async () => {
      mockSubscriptionModel.findOne.mockReturnValue(queryChainLean(null));
      // First lookup returns null (no free package exists)
      vi.mocked(getPackageByCode).mockResolvedValue(null);
      // createPackage creates it
      const createdPkg = makePackageDoc();
      vi.mocked(createPackage).mockResolvedValue(createdPkg as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(mapToSnapshot).mockReturnValue(makeSnapshot() as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      vi.mocked(createSubscription).mockResolvedValue(
        makeSubscriptionDoc() as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      );

      const result = await provisionSubscription(TENANT_ID);

      expect(createPackage).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Free",
          code: FREE_CODE,
          monthlyPrice: 0,
          entitlements: expect.objectContaining({ employees: 5, documents: 100 }),
        }),
        undefined,
      );
      expect(createSubscription).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("is idempotent — returns existing subscription on second call", async () => {
      const existingSub = makeSubscriptionDoc();
      mockSubscriptionModel.findOne.mockReturnValue(queryChainLean(existingSub));

      const result = await provisionSubscription(TENANT_ID, "pro");

      expect(getPackageByCode).not.toHaveBeenCalled();
      expect(createSubscription).not.toHaveBeenCalled();
      expect(result).toEqual(existingSub);
    });

    it("throws 404 for an invalid packageCode", async () => {
      mockSubscriptionModel.findOne.mockReturnValue(queryChainLean(null));
      vi.mocked(getPackageByCode).mockResolvedValue(null);

      await expect(
        provisionSubscription(TENANT_ID, "nonexistent-tier"),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: "NOT_FOUND",
      });

      expect(getPackageByCode).toHaveBeenCalledWith("nonexistent-tier");
      expect(createPackage).not.toHaveBeenCalled(); // only auto-bootstraps "free"
    });
  });
});
