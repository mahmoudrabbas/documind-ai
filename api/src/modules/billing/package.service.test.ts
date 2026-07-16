import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
//  Mocks — vi.hoisted ensures these are hoisted with vi.mock
// ---------------------------------------------------------------------------

const { mockCreate, mockFindById, mockFind, mockFindOne } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindById: vi.fn(),
  mockFind: vi.fn(),
  mockFindOne: vi.fn(),
}));

vi.mock("../../db/models/package.model.js", () => ({
  default: {
    create: mockCreate,
    findById: mockFindById,
    find: mockFind,
    findOne: mockFindOne,
  },
}));

const mockAuditCreate = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../../db/models/auditLog.model.js", () => ({
  default: { create: mockAuditCreate },
}));

// ---------------------------------------------------------------------------
//  Imports
// ---------------------------------------------------------------------------

import type { Mock } from "vitest";
import PackageModel from "../../db/models/package.model.js";
import AuditLogModel from "../../db/models/auditLog.model.js";
import * as packageService from "./package.service.js";
import { AppError } from "../../common/errors/AppError.js";
import type {
  CreatePackageInput,
  UpdatePackageInput,
} from "./billing.types.js";
import type { AuthIdentity } from "../auth/auth.types.js";

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

/** Build a fake Mongoose query chain that resolves a value. */
function queryChain<T>(resolveValue: T) {
  const chain: Record<string, Mock | (() => Record<string, Mock>)> = {};
  chain.lean = vi.fn(() => chain);
  chain.sort = vi.fn(() => chain);
  chain.populate = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  chain.exec = vi.fn().mockResolvedValue(resolveValue);
  return chain;
}

/** Build a fake Mongoose document (mutable, with .save() and .toJSON()). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeDoc(overrides: Record<string, any> = {}) {
  const doc: Record<string, unknown> = {
    _id: "507f1f77bcf86cd799439011",
    name: "Test Package",
    code: "test-pkg",
    description: "A test package",
    active: true,
    version: 1,
    monthlyPrice: 0,
    annualPrice: 0,
    trialDays: 30,
    currency: "USD",
    visibility: "public" as const,
    supportedModels: ["basic"],
    analyticsLevel: "basic" as const,
    retentionDays: 90,
    supportLevel: "community" as const,
    entitlements: {
      employees: 3,
      admins: 1,
      documents: 50,
      storageMb: 100,
      fileSizeMb: 10,
      queriesPerMonth: 500,
      tokensPerMonth: 0,
      ocrPagesPerMonth: 0,
    },
    versions: [],
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-01-01T00:00:00Z"),
    save: vi.fn().mockResolvedValue(undefined),
    toJSON: vi.fn(),
    ...overrides,
  };
  doc.toJSON = vi.fn().mockReturnValue(doc);
  return doc;
}

const actor: AuthIdentity = {
  userId: "u1",
  tenantId: "t1",
  role: "admin",
  email: "admin@test.com",
};

const defaultInput: CreatePackageInput = {
  name: "Pro Plan",
  code: "pro",
  description: "Professional plan",
  monthlyPrice: 29,
  annualPrice: 290,
  trialDays: 14,
  currency: "USD",
  visibility: "public",
  supportedModels: ["basic", "advanced"],
  analyticsLevel: "advanced",
  retentionDays: 365,
  supportLevel: "standard",
  entitlements: {
    employees: 100,
    admins: 10,
    documents: 5_000,
    storageMb: 10_240,
    fileSizeMb: 100,
    queriesPerMonth: 50_000,
    tokensPerMonth: 1_000_000,
    ocrPagesPerMonth: 5_000,
  },
};

// ---------------------------------------------------------------------------
//  Tests
// ---------------------------------------------------------------------------

describe("PackageService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  //  createPackage
  // -----------------------------------------------------------------------

  describe("createPackage", () => {
    it("creates a package with version=1 and a full FR-PAY-001 snapshot", async () => {
      const expected = fakeDoc(defaultInput);
      mockCreate.mockResolvedValue(expected);

      const result = await packageService.createPackage(defaultInput, actor);

      expect(PackageModel.create).toHaveBeenCalledTimes(1);
      const createArg = mockCreate.mock.calls[0][0];

      // All input fields are spread into the doc
      for (const key of Object.keys(defaultInput) as Array<keyof CreatePackageInput>) {
        expect(createArg[key]).toEqual(defaultInput[key]);
      }
      expect(createArg.active).toBe(true);
      expect(createArg.version).toBe(1);

      // versions[0] is the initial snapshot
      expect(createArg.versions).toHaveLength(1);
      const snap = createArg.versions[0];
      expect(snap.version).toBe(1);
      expect(snap.name).toBe("Pro Plan");
      expect(snap.monthlyPrice).toBe(29);
      expect(snap.annualPrice).toBe(290);
      expect(snap.trialDays).toBe(14);
      expect(snap.currency).toBe("USD");
      expect(snap.active).toBe(true);
      expect(snap.entitlements).toEqual(defaultInput.entitlements);

      // Audit trail
      expect(AuditLogModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: "PACKAGE_CREATED" }),
      );

      expect(result).toEqual(expected);
    });

    it("stores entitlement values correctly", async () => {
      const input: CreatePackageInput = {
        name: "Basic",
        code: "basic",
        monthlyPrice: 0,
        entitlements: {
          employees: 10,
          admins: 2,
          documents: 100,
          storageMb: 500,
          fileSizeMb: 25,
          queriesPerMonth: 1_000,
          tokensPerMonth: 100_000,
          ocrPagesPerMonth: 100,
        },
      };

      const expected = fakeDoc(input);
      mockCreate.mockResolvedValue(expected);

      await packageService.createPackage(input, actor);

      const createArg = mockCreate.mock.calls[0][0];
      expect(createArg.entitlements).toEqual(input.entitlements);
      expect(createArg.versions[0].entitlements).toEqual(input.entitlements);
    });

    it("applies defaults for optional fields", async () => {
      const input: CreatePackageInput = {
        name: "Minimal",
        code: "min",
        monthlyPrice: 0,
        entitlements: {
          employees: 3,
          admins: 1,
          documents: 50,
          storageMb: 100,
          fileSizeMb: 10,
          queriesPerMonth: 500,
          tokensPerMonth: 0,
          ocrPagesPerMonth: 0,
        },
      };

      mockCreate.mockResolvedValue(fakeDoc(input));

      await packageService.createPackage(input, actor);

      const createArg = mockCreate.mock.calls[0][0];
      const snap = createArg.versions[0];

      expect(snap.description).toBe("");
      expect(snap.annualPrice).toBe(0);
      expect(snap.trialDays).toBe(30);
      expect(snap.currency).toBe("USD");
      expect(snap.visibility).toBe("public");
      expect(snap.supportedModels).toEqual(["basic"]);
      expect(snap.analyticsLevel).toBe("basic");
      expect(snap.retentionDays).toBe(90);
      expect(snap.supportLevel).toBe("community");
    });
  });

  // -----------------------------------------------------------------------
  //  getPackage
  // -----------------------------------------------------------------------

  describe("getPackage", () => {
    it("returns the package when found", async () => {
      const pkg = fakeDoc({ name: "Found Package" });
      (PackageModel.findById as Mock).mockReturnValue(
        queryChain(pkg),
      );

      const result = await packageService.getPackage("some-id");

      expect(PackageModel.findById).toHaveBeenCalledWith("some-id");
      expect(result).toEqual(pkg);
    });

    it("throws 404 when package not found", async () => {
      (PackageModel.findById as Mock).mockReturnValue(
        queryChain(null),
      );

      await expect(packageService.getPackage("missing-id")).rejects.toThrow(
        AppError,
      );
      await expect(packageService.getPackage("missing-id")).rejects.toThrow(
        "Package not found",
      );
    });
  });

  // -----------------------------------------------------------------------
  //  listPackages
  // -----------------------------------------------------------------------

  describe("listPackages", () => {
    it("returns all packages sorted by createdAt descending", async () => {
      const pkgs = [fakeDoc({ name: "B" }), fakeDoc({ name: "A" })];
      (PackageModel.find as Mock).mockReturnValue(
        queryChain(pkgs),
      );

      const result = await packageService.listPackages();

      expect(PackageModel.find).toHaveBeenCalledWith();
      expect(result).toEqual(pkgs);
    });
  });

  // -----------------------------------------------------------------------
  //  listActivePackages
  // -----------------------------------------------------------------------

  describe("listActivePackages", () => {
    it("returns only active packages", async () => {
      const active = [fakeDoc({ name: "Active One" })];
      const qc = queryChain(active);
      (PackageModel.find as Mock).mockReturnValue(qc);

      const result = await packageService.listActivePackages();

      expect(PackageModel.find).toHaveBeenCalledWith({ active: true });
      expect(result).toEqual(active);
    });
  });

  // -----------------------------------------------------------------------
  //  createVersion
  // -----------------------------------------------------------------------

  describe("createVersion", () => {
    const id = "507f1f77bcf86cd799439011";

    it("bumps the version and pushes a new snapshot", async () => {
      const existing = fakeDoc({ version: 2, versions: [{ version: 1 }] });
      (PackageModel.findById as Mock).mockReturnValue(
        queryChain(existing),
      );
      // Override exec — findById(id).exec() returns the doc directly (no lean)
      const chainWithoutLean: Record<string, Mock | (() => Record<string, Mock>)> = {};
      chainWithoutLean.exec = vi.fn().mockResolvedValue(existing);
      (PackageModel.findById as Mock).mockReturnValue(chainWithoutLean);

      const input: UpdatePackageInput = {
        monthlyPrice: 49,
        description: "Updated description",
      };

      const result = await packageService.createVersion(id, input, actor);

      expect(existing.monthlyPrice).toBe(49);
      expect(existing.description).toBe("Updated description");
      expect(existing.version).toBe(3); // bumped from 2
      expect(existing.save).toHaveBeenCalledTimes(1);
      expect(existing.versions).toHaveLength(2); // original + new push

      expect(AuditLogModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: "PACKAGE_VERSION_CREATED" }),
      );

      expect(result.versionBumped).toBe(true);
    });

    it("throws 404 when package does not exist", async () => {
      const chainWithoutLean: Record<string, unknown> = {};
      chainWithoutLean.exec = vi.fn().mockResolvedValue(null);
      (PackageModel.findById as Mock).mockReturnValue(chainWithoutLean);

      await expect(
        packageService.createVersion("bad-id", { monthlyPrice: 10 }, actor),
      ).rejects.toThrow("Package not found");
    });
  });

  // -----------------------------------------------------------------------
  //  archivePackage
  // -----------------------------------------------------------------------

  describe("archivePackage", () => {
    const id = "507f1f77bcf86cd799439011";

    it("sets active=false on an existing package", async () => {
      const existing = fakeDoc({ active: true });
      const chainWithoutLean: Record<string, unknown> = {};
      chainWithoutLean.exec = vi.fn().mockResolvedValue(existing);
      (PackageModel.findById as Mock).mockReturnValue(chainWithoutLean);

      const result = await packageService.archivePackage(id, actor);

      expect(existing.active).toBe(false);
      expect(existing.save).toHaveBeenCalledTimes(1);

      expect(AuditLogModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "PACKAGE_ARCHIVED",
          changes: { active: false },
        }),
      );

      expect(result).toEqual(existing);
    });

    it("throws 404 when package does not exist", async () => {
      const chainWithoutLean: Record<string, unknown> = {};
      chainWithoutLean.exec = vi.fn().mockResolvedValue(null);
      (PackageModel.findById as Mock).mockReturnValue(chainWithoutLean);

      await expect(
        packageService.archivePackage("bad-id", actor),
      ).rejects.toThrow("Package not found");
    });
  });
});
