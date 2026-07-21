import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mockPackageModel = vi.hoisted(() => ({
  create: vi.fn(),
  findById: vi.fn(),
  find: vi.fn(),
  findOne: vi.fn(),
  findByIdAndUpdate: vi.fn(),
}));

const mockAuditWrite = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../../../db/models/package.model.js", () => ({
  default: mockPackageModel,
}));

vi.mock("../../../common/observability/index.js", () => ({
  getAuditWriter: () => ({ write: mockAuditWrite }),
}));

// ── Imports under test ───────────────────────────────────────────────────────

import {
  createPackage,
  getPackage,
  listPackages,
  listActivePackages,
  getPackageByCode,
  createVersion,
  archivePackage,
  mapToSnapshot,
} from "../package.service.js";
import { AppError } from "../../../common/errors/AppError.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const PKG_ID = "507f1f77bcf86cd799439011";

function queryChain<T>(result: T) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sortFn: any = vi.fn();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leanFn: any = vi.fn();
  // Build chain: .sort().lean().exec()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: any = { sort: sortFn, lean: leanFn, exec: vi.fn().mockResolvedValue(result) };
  sortFn.mockReturnValue(query);
  leanFn.mockReturnValue(query);
  return query;
}

function doc(overrides: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    _id: PKG_ID,
    id: PKG_ID,
    name: "Basic Plan",
    code: "basic",
    description: "Basic plan description",
    active: true,
    version: 1,
    monthlyPrice: 29,
    annualPrice: 290,
    currency: "USD",
    trialDays: 14,
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
    supportedModels: ["basic", "advanced"],
    analyticsLevel: "advanced",
    retentionDays: 365,
    supportLevel: "standard",
    visibility: "public",
    stripeProductId: "",
    stripePriceId: "",
    stripeAnnualPriceId: "",
    versions: [
      {
        version: 1,
        monthlyPrice: 29,
        entitlements: {
          employees: 10, admins: 2, documents: 500, storageMb: 1024,
          fileSizeMb: 25, queriesPerMonth: 5000, tokensPerMonth: 100_000, ocrPagesPerMonth: 100,
        },
        annualPrice: 290,
        trialDays: 14,
        visibility: "public",
        supportedModels: ["basic", "advanced"],
        analyticsLevel: "advanced",
        retentionDays: 365,
        supportLevel: "standard",
        createdAt: new Date("2025-01-01"),
      },
    ],
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  };

  const merged = { ...base, ...overrides };

  // save is only present on full mongoose documents (not lean results)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docObj: any = { ...merged };
  docObj.toJSON = vi.fn(() => {
    const json = { ...merged };
    // toJSON strips methods
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (json as any).toJSON;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (json as any).save;
    return json;
  });
  docObj.save = vi.fn().mockResolvedValue(docObj);

  return docObj;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("PackageService", () => {
  // ── createPackage ───────────────────────────────────────────────────────

  describe("createPackage", () => {
    const INPUT = {
      name: "Basic Plan",
      code: "basic",
      description: "Basic plan description",
      monthlyPrice: 29,
      annualPrice: 290,
      currency: "USD",
      trialDays: 14,
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
      supportedModels: ["basic", "advanced"],
      analyticsLevel: "advanced" as const,
      retentionDays: 365,
      supportLevel: "standard" as const,
      visibility: "public" as const,
    };

    it("creates a package with version=1", async () => {
      const pkg = doc();
      mockPackageModel.create.mockResolvedValue(pkg);

      const result = await createPackage(INPUT);

      expect(result.version).toBe(1);
      expect(mockPackageModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ version: 1, name: "Basic Plan", code: "basic" }),
      );
    });

    it("captures initial snapshot in versions array", async () => {
      const pkg = doc();
      mockPackageModel.create.mockResolvedValue(pkg);

      const result = await createPackage(INPUT);

      expect(result.versions).toHaveLength(1);
      expect(result.versions[0].version).toBe(1);
      expect(result.versions[0].monthlyPrice).toBe(29);
    });

    it("stores all FR-PAY-001 entitlement fields", async () => {
      const pkg = doc();
      mockPackageModel.create.mockResolvedValue(pkg);

      const result = await createPackage(INPUT);

      expect(result.entitlements).toEqual({
        employees: 10,
        admins: 2,
        documents: 500,
        storageMb: 1024,
        fileSizeMb: 25,
        queriesPerMonth: 5000,
        tokensPerMonth: 100_000,
        ocrPagesPerMonth: 100,
      });
    });

    it("stores annualPrice, trialDays, visibility, analyticsLevel, retentionDays, supportLevel", async () => {
      const pkg = doc();
      mockPackageModel.create.mockResolvedValue(pkg);

      const result = await createPackage(INPUT);

      expect(result.annualPrice).toBe(290);
      expect(result.trialDays).toBe(14);
      expect(result.visibility).toBe("public");
      expect(result.analyticsLevel).toBe("advanced");
      expect(result.retentionDays).toBe(365);
      expect(result.supportLevel).toBe("standard");
      expect(result.supportedModels).toEqual(["basic", "advanced"]);
    });

    it("applies defaults when optional fields are omitted", async () => {
      const minimal = {
        name: "Minimal",
        code: "minimal",
        monthlyPrice: 0,
        entitlements: {
          employees: 1, admins: 0, documents: 10, storageMb: 50,
          fileSizeMb: 5, queriesPerMonth: 100, tokensPerMonth: 0, ocrPagesPerMonth: 0,
        },
      };
      const pkg = doc({
        name: "Minimal",
        code: "minimal",
        version: 1,
        monthlyPrice: 0,
        annualPrice: 0,
        currency: "USD",
        trialDays: 30,
        description: "",
        entitlements: {
          employees: 1, admins: 0, documents: 10, storageMb: 50,
          fileSizeMb: 5, queriesPerMonth: 100, tokensPerMonth: 0, ocrPagesPerMonth: 0,
        },
        supportedModels: ["basic"],
        analyticsLevel: "basic",
        retentionDays: 90,
        supportLevel: "community",
        visibility: "public",
      });
      mockPackageModel.create.mockResolvedValue(pkg);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await createPackage(minimal as any);

      expect(result.annualPrice).toBe(0);
      expect(result.trialDays).toBe(30);
      expect(result.visibility).toBe("public");
      expect(result.analyticsLevel).toBe("basic");
      expect(result.supportLevel).toBe("community");
      expect(result.retentionDays).toBe(90);
      expect(result.supportedModels).toEqual(["basic"]);
      expect(result.currency).toBe("USD");
    });
  });

  // ── getPackage ──────────────────────────────────────────────────────────

  describe("getPackage", () => {
    it("returns a package by ID", async () => {
      const pkg = doc();
      mockPackageModel.findById.mockReturnValue(queryChain(pkg));

      const result = await getPackage(PKG_ID);

      expect(result).toBeDefined();
      expect(result._id).toBe(PKG_ID);
      expect(result.name).toBe("Basic Plan");
      expect(mockPackageModel.findById).toHaveBeenCalledWith(PKG_ID);
    });

    it("throws 404 when package is not found", async () => {
      mockPackageModel.findById.mockReturnValue(queryChain(null));

      await expect(getPackage("nonexistent")).rejects.toThrow(AppError);
      await expect(getPackage("nonexistent")).rejects.toMatchObject({
        statusCode: 404,
        code: "NOT_FOUND",
      });
    });
  });

  // ── listPackages ────────────────────────────────────────────────────────

  describe("listPackages", () => {
    it("returns all packages sorted by creation date descending", async () => {
      const pkg1 = doc({ _id: "a00000000000000000000001", id: "a00000000000000000000001", name: "A" });
      const pkg2 = doc({ _id: "b00000000000000000000002", id: "b00000000000000000000002", name: "B" });
      mockPackageModel.find.mockReturnValue(queryChain([pkg1, pkg2]));

      const result = await listPackages();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("A");
      expect(mockPackageModel.find).toHaveBeenCalledWith();
    });
  });

  // ── listActivePackages ──────────────────────────────────────────────────

  describe("listActivePackages", () => {
    it("filters active and public packages only", async () => {
      const pkg = doc();
      mockPackageModel.find.mockReturnValue(queryChain([pkg]));

      const result = await listActivePackages();

      expect(result).toHaveLength(1);
      expect(mockPackageModel.find).toHaveBeenCalledWith({ active: true, visibility: "public" });
    });

    it("excludes inactive or internal packages", async () => {
      mockPackageModel.find.mockReturnValue(queryChain([]));

      const result = await listActivePackages();

      expect(result).toHaveLength(0);
    });
  });

  // ── getPackageByCode ────────────────────────────────────────────────────

  describe("getPackageByCode", () => {
    it("finds an active package by code", async () => {
      const pkg = doc();
      mockPackageModel.findOne.mockReturnValue(queryChain(pkg));

      const result = await getPackageByCode("basic");

      expect(result).toBeDefined();
      expect(result!.code).toBe("basic");
      expect(mockPackageModel.findOne).toHaveBeenCalledWith({ code: "basic", active: true });
    });

    it("returns null for unknown code", async () => {
      mockPackageModel.findOne.mockReturnValue(queryChain(null));

      const result = await getPackageByCode("nonexistent");

      expect(result).toBeNull();
    });
  });

  // ── createVersion ───────────────────────────────────────────────────────

  describe("createVersion", () => {
    it("bumps version (+1) and returns versionBumped=true", async () => {
      const pkg = doc({ version: 1, versions: [] });
      // createVersion uses .exec() only, no .lean()
      mockPackageModel.findById.mockReturnValue({ exec: vi.fn().mockResolvedValue(pkg) });

      const result = await createVersion(PKG_ID);

      expect(result.versionBumped).toBe(true);
      expect(pkg.version).toBe(2);
      expect(pkg.versions).toHaveLength(1);
      expect(pkg.versions[0].version).toBe(2);
      expect(pkg.save).toHaveBeenCalledOnce();
    });

    it("pushes a full snapshot into the versions array", async () => {
      const pkg = doc({ version: 1, versions: [] });
      mockPackageModel.findById.mockReturnValue({ exec: vi.fn().mockResolvedValue(pkg) });

      await createVersion(PKG_ID);

      expect(pkg.versions[0]).toMatchObject({
        version: 2,
        monthlyPrice: 29,
        annualPrice: 290,
        trialDays: 14,
        visibility: "public",
      });
    });

    it("throws 404 when package is not found", async () => {
      mockPackageModel.findById.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });

      await expect(createVersion("nonexistent")).rejects.toMatchObject({
        statusCode: 404,
        code: "NOT_FOUND",
      });
    });
  });

  // ── archivePackage ──────────────────────────────────────────────────────

  describe("archivePackage", () => {
    it("sets active=false on the package", async () => {
      const archived = doc({ active: false });
      mockPackageModel.findByIdAndUpdate.mockReturnValue(queryChain(archived));

      const result = await archivePackage(PKG_ID);

      expect(result.active).toBe(false);
      expect(mockPackageModel.findByIdAndUpdate).toHaveBeenCalledWith(
        PKG_ID,
        { $set: { active: false } },
        { returnDocument: "after", runValidators: true },
      );
    });

    it("throws 404 when package is not found", async () => {
      mockPackageModel.findByIdAndUpdate.mockReturnValue(queryChain(null));

      await expect(archivePackage("nonexistent")).rejects.toMatchObject({
        statusCode: 404,
        code: "NOT_FOUND",
      });
    });
  });

  // ── mapToSnapshot ───────────────────────────────────────────────────────

  describe("mapToSnapshot", () => {
    it("creates a PackageSnapshot with all FR-PAY-001 fields from a document", () => {
      const pkg = doc();

      const snapshot = mapToSnapshot(pkg);

      expect(snapshot.packageId).toBe(PKG_ID);
      expect(snapshot.version).toBe(1);
      expect(snapshot.name).toBe("Basic Plan");
      expect(snapshot.code).toBe("basic");
      expect(snapshot.description).toBe("Basic plan description");
      expect(snapshot.monthlyPrice).toBe(29);
      expect(snapshot.annualPrice).toBe(290);
      expect(snapshot.currency).toBe("USD");
      expect(snapshot.trialDays).toBe(14);
      expect(snapshot.entitlements).toEqual({
        employees: 10, admins: 2, documents: 500, storageMb: 1024,
        fileSizeMb: 25, queriesPerMonth: 5000, tokensPerMonth: 100_000, ocrPagesPerMonth: 100,
      });
      expect(snapshot.supportedModels).toEqual(["basic", "advanced"]);
      expect(snapshot.analyticsLevel).toBe("advanced");
      expect(snapshot.retentionDays).toBe(365);
      expect(snapshot.supportLevel).toBe("standard");
      expect(snapshot.visibility).toBe("public");
    });

    it("handles missing fields with sensible defaults", () => {
      const minimal = { _id: "abc", name: "T", code: "t" };

      const snapshot = mapToSnapshot(minimal);

      expect(snapshot.packageId).toBe("abc");
      expect(snapshot.version).toBe(0);
      expect(snapshot.monthlyPrice).toBe(0);
      expect(snapshot.annualPrice).toBe(0);
      expect(snapshot.currency).toBe("USD");
      expect(snapshot.trialDays).toBe(0);
      expect(snapshot.entitlements.employees).toBe(1);
      expect(snapshot.entitlements.fileSizeMb).toBe(10);
      expect(snapshot.analyticsLevel).toBe("basic");
      expect(snapshot.supportLevel).toBe("community");
      expect(snapshot.visibility).toBe("public");
      expect(snapshot.retentionDays).toBe(0);
    });

    it("returns a plain object (immutable snapshot, not a document)", () => {
      const pkg = doc();

      const snapshot = mapToSnapshot(pkg);

      expect(snapshot).not.toHaveProperty("save");
      expect(snapshot).not.toHaveProperty("toJSON");
      expect(snapshot).not.toHaveProperty("versions");
    });

    it("returns safe defaults when entitlements is undefined", () => {
      const noEnt = doc({ entitlements: undefined });

      const snapshot = mapToSnapshot(noEnt);

      expect(snapshot.entitlements).toEqual({
        employees: 1,
        admins: 0,
        documents: 0,
        storageMb: 0,
        fileSizeMb: 10,
        queriesPerMonth: 0,
        tokensPerMonth: 0,
        ocrPagesPerMonth: 0,
      });
    });
  });

  // ── Legacy normalisation in createVersion ──────────────────────────────────

  describe("createVersion — legacy snapshot normalisation", () => {
    it("backfills entitlements on legacy version snapshots that lack them", async () => {
      const legacyVersions = [
        {
          version: 1,
          monthlyPrice: 29,
          limits: { users: 5, documents: 100, questionsPerMonth: 500, storageMb: 512 },
          annualPrice: 290,
          trialDays: 14,
          visibility: "public",
          supportedModels: ["basic"],
          analyticsLevel: "basic" as const,
          retentionDays: 90,
          supportLevel: "community" as const,
          createdAt: new Date("2024-01-01"),
        },
      ];
      const pkg = doc({ version: 1, versions: legacyVersions });
      mockPackageModel.findById.mockReturnValue({ exec: vi.fn().mockResolvedValue(pkg) });

      const result = await createVersion(PKG_ID);

      expect(result.versionBumped).toBe(true);
      expect(pkg.versions).toHaveLength(2);
      // The first snapshot should now have entitlements derived from limits
      expect(pkg.versions[0].entitlements).toBeDefined();
      expect(pkg.versions[0].entitlements!.employees).toBe(5);
      expect(pkg.versions[0].entitlements!.documents).toBe(100);
      expect(pkg.versions[0].entitlements!.queriesPerMonth).toBe(500);
      expect(pkg.versions[0].entitlements!.admins).toBe(1);
      expect(pkg.versions[0].entitlements!.fileSizeMb).toBe(10);
      expect(pkg.versions[0].entitlements!.tokensPerMonth).toBe(0);
      expect(pkg.versions[0].entitlements!.ocrPagesPerMonth).toBe(0);
    });

    it("backfills entitlements from root entitlements when no legacy limits exist", async () => {
      const legacyVersions = [
        {
          version: 1,
          monthlyPrice: 29,
          annualPrice: 290,
          trialDays: 14,
          visibility: "public",
          supportedModels: ["basic"],
          analyticsLevel: "basic" as const,
          retentionDays: 90,
          supportLevel: "community" as const,
          createdAt: new Date("2024-01-01"),
          // no entitlements, no limits
        },
      ];
      const pkg = doc({ version: 1, versions: legacyVersions });
      mockPackageModel.findById.mockReturnValue({ exec: vi.fn().mockResolvedValue(pkg) });

      await createVersion(PKG_ID);

      // Should fall back to root entitlements
      expect(pkg.versions[0].entitlements).toBeDefined();
      expect(pkg.versions[0].entitlements!.employees).toBe(10); // from root entitlements
      expect(pkg.versions[0].entitlements!.documents).toBe(500);
    });

    it("does not modify already-correct version snapshots", async () => {
      const correctVersions = [
        {
          version: 1,
          monthlyPrice: 29,
          entitlements: {
            employees: 10, admins: 2, documents: 500, storageMb: 1024,
            fileSizeMb: 25, queriesPerMonth: 5000, tokensPerMonth: 100_000, ocrPagesPerMonth: 100,
          },
          annualPrice: 290,
          trialDays: 14,
          visibility: "public",
          supportedModels: ["basic"],
          analyticsLevel: "basic" as const,
          retentionDays: 90,
          supportLevel: "community" as const,
          createdAt: new Date("2024-01-01"),
        },
      ];
      const pkg = doc({ version: 1, versions: correctVersions });
      mockPackageModel.findById.mockReturnValue({ exec: vi.fn().mockResolvedValue(pkg) });

      await createVersion(PKG_ID);

      // First snapshot should remain unchanged
      expect(pkg.versions[0].entitlements!.employees).toBe(10);
      expect(pkg.versions[0].entitlements!.admins).toBe(2);
    });

    it("normalises multiple legacy snapshots in one pass", async () => {
      const legacyVersions = [
        {
          version: 1,
          monthlyPrice: 19,
          limits: { users: 1, documents: 10, questionsPerMonth: 100, storageMb: 50 },
          annualPrice: 190,
          trialDays: 7,
          visibility: "public",
          supportedModels: ["basic"],
          analyticsLevel: "basic" as const,
          retentionDays: 30,
          supportLevel: "community" as const,
          createdAt: new Date("2024-01-01"),
        },
        {
          version: 2,
          monthlyPrice: 29,
          limits: { users: 5, documents: 100, questionsPerMonth: 500, storageMb: 512 },
          annualPrice: 290,
          trialDays: 14,
          visibility: "public",
          supportedModels: ["basic"],
          analyticsLevel: "basic" as const,
          retentionDays: 90,
          supportLevel: "community" as const,
          createdAt: new Date("2024-06-01"),
        },
      ];
      const pkg = doc({ version: 2, versions: legacyVersions });
      mockPackageModel.findById.mockReturnValue({ exec: vi.fn().mockResolvedValue(pkg) });

      await createVersion(PKG_ID);

      expect(pkg.versions).toHaveLength(3);
      expect(pkg.versions[0].entitlements!.employees).toBe(1);
      expect(pkg.versions[1].entitlements!.employees).toBe(5);
    });
  });
});
