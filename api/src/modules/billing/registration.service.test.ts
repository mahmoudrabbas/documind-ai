import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPkgFindOne, mockPkgFindById, mockSubFindOne } = vi.hoisted(() => ({
  mockPkgFindOne: vi.fn(),
  mockPkgFindById: vi.fn(),
  mockSubFindOne: vi.fn(),
}));

const mockSubCreate = vi.hoisted(() => vi.fn());

vi.mock("../../db/models/package.model.js", () => ({
  default: {
    findOne: mockPkgFindOne,
    findById: mockPkgFindById,
  },
}));

vi.mock("../../db/models/subscription.model.js", () => ({
  default: {
    findOne: mockSubFindOne,
    create: mockSubCreate,
  },
}));

vi.mock("./subscription.service.js", () => ({
  createSubscription: vi
    .fn()
    .mockResolvedValue({ _id: "sub-1", status: "TRIALING", packageVersion: 1 }),
}));

import { provisionSubscription, getEntitlements } from "./registration.service.js";
import { AppError } from "../../common/errors/AppError.js";

function leanChain<T>(resolveValue: T) {
  return {
    lean: vi.fn<() => Record<string, unknown>>().mockReturnThis(),
    select: vi.fn<() => Record<string, unknown>>().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(resolveValue),
  };
}

describe("RegistrationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("provisionSubscription", () => {
    it("provisions with a packageCode", async () => {
      mockPkgFindOne.mockReturnValue(
        leanChain({ _id: "pkg-1", code: "pro", active: true, version: 2 }),
      );

      const result = await provisionSubscription("tenant-1", "pro");

      expect(mockPkgFindOne).toHaveBeenCalledWith({ code: "pro", active: true });
      expect(result).toMatchObject({ _id: "sub-1", status: "TRIALING" });
    });

    it("falls back to 'free' package when no packageCode given", async () => {
      mockPkgFindOne.mockReturnValue(
        leanChain({ _id: "pkg-free", code: "free", active: true, version: 1 }),
      );

      const result = await provisionSubscription("tenant-2");

      expect(mockPkgFindOne).toHaveBeenCalledWith({ code: "free", active: true });
      expect(result).toMatchObject({ _id: "sub-1" });
    });

    it("throws when package code not found", async () => {
      mockPkgFindOne.mockReturnValue(leanChain(null));

      await expect(
        provisionSubscription("tenant-1", "nonexistent"),
      ).rejects.toThrow(AppError);
    });

    it("throws when the matched package is inactive", async () => {
      mockPkgFindOne.mockReturnValue(leanChain(null));

      await expect(
        provisionSubscription("tenant-1", "inactive-pkg"),
      ).rejects.toThrow(AppError);
    });
  });

  describe("getEntitlements", () => {
    it("returns full entitlement object for a tenant", async () => {
      mockSubFindOne.mockReturnValue(
        leanChain({ packageId: "pkg-1" }),
      );
      mockPkgFindById.mockReturnValue(
        leanChain({
          entitlements: {
            employees: 10,
            admins: 2,
            documents: 500,
            storageMb: 1024,
            fileSizeMb: 50,
            queriesPerMonth: 10000,
            tokensPerMonth: 500000,
            ocrPagesPerMonth: 200,
          },
        }),
      );

      const result = await getEntitlements("tenant-1");

      expect(result).toEqual({
        employees: 10,
        admins: 2,
        documents: 500,
        storageMb: 1024,
        fileSizeMb: 50,
        queriesPerMonth: 10000,
        tokensPerMonth: 500000,
        ocrPagesPerMonth: 200,
      });
    });

    it("throws when no subscription exists", async () => {
      mockSubFindOne.mockReturnValue(leanChain(null));

      await expect(getEntitlements("nonexistent")).rejects.toThrow("No subscription found");
    });

    it("throws when linked package is missing", async () => {
      mockSubFindOne.mockReturnValue(leanChain({ packageId: "pkg-missing" }));
      mockPkgFindById.mockReturnValue(leanChain(null));

      await expect(getEntitlements("tenant-orphan")).rejects.toThrow("Linked package not found");
    });
  });
});
