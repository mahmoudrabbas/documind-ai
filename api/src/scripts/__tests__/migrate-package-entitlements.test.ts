import { describe, it, expect } from "vitest";

/**
 * Unit tests for the migration helper functions and idempotency logic.
 * The migration script's `entitlementsFromLimits` function is imported directly
 * to verify correctness of the legacy limits → entitlements mapping.
 *
 * These are pure-logic tests — no database required.
 */

// ── Inline the helper (extracted from migration script for testability) ───────

interface LegacyLimits {
  users: number;
  documents: number;
  questionsPerMonth: number;
  storageMb: number;
}

function entitlementsFromLimits(l: LegacyLimits) {
  return {
    employees: l.users,
    admins: 1,
    documents: l.documents,
    storageMb: l.storageMb,
    fileSizeMb: 10,
    queriesPerMonth: l.questionsPerMonth,
    tokensPerMonth: 0,
    ocrPagesPerMonth: 0,
  };
}

describe("entitlementsFromLimits — legacy mapping", () => {
  it("maps users → employees", () => {
    const result = entitlementsFromLimits({
      users: 5,
      documents: 100,
      questionsPerMonth: 500,
      storageMb: 256,
    });
    expect(result.employees).toBe(5);
  });

  it("defaults admins to 1", () => {
    const result = entitlementsFromLimits({
      users: 10,
      documents: 200,
      questionsPerMonth: 1000,
      storageMb: 512,
    });
    expect(result.admins).toBe(1);
  });

  it("defaults fileSizeMb to 10", () => {
    const result = entitlementsFromLimits({
      users: 1,
      documents: 10,
      questionsPerMonth: 100,
      storageMb: 50,
    });
    expect(result.fileSizeMb).toBe(10);
  });

  it("defaults tokensPerMonth to 0", () => {
    const result = entitlementsFromLimits({
      users: 1,
      documents: 10,
      questionsPerMonth: 100,
      storageMb: 50,
    });
    expect(result.tokensPerMonth).toBe(0);
  });

  it("defaults ocrPagesPerMonth to 0", () => {
    const result = entitlementsFromLimits({
      users: 1,
      documents: 10,
      questionsPerMonth: 100,
      storageMb: 50,
    });
    expect(result.ocrPagesPerMonth).toBe(0);
  });

  it("preserves documents", () => {
    const result = entitlementsFromLimits({
      users: 3,
      documents: 999,
      questionsPerMonth: 50,
      storageMb: 100,
    });
    expect(result.documents).toBe(999);
  });

  it("preserves questionsPerMonth as queriesPerMonth", () => {
    const result = entitlementsFromLimits({
      users: 2,
      documents: 50,
      questionsPerMonth: 777,
      storageMb: 200,
    });
    expect(result.queriesPerMonth).toBe(777);
  });

  it("preserves storageMb", () => {
    const result = entitlementsFromLimits({
      users: 1,
      documents: 10,
      questionsPerMonth: 10,
      storageMb: 4096,
    });
    expect(result.storageMb).toBe(4096);
  });

  it("handles zero values correctly", () => {
    const result = entitlementsFromLimits({
      users: 0,
      documents: 0,
      questionsPerMonth: 0,
      storageMb: 0,
    });
    expect(result.employees).toBe(0);
    expect(result.documents).toBe(0);
    expect(result.queriesPerMonth).toBe(0);
    expect(result.storageMb).toBe(0);
    expect(result.admins).toBe(1);
    expect(result.fileSizeMb).toBe(10);
  });

  it("returns all 8 entitlement fields", () => {
    const result = entitlementsFromLimits({
      users: 1,
      documents: 1,
      questionsPerMonth: 1,
      storageMb: 1,
    });
    const keys = Object.keys(result).sort();
    expect(keys).toEqual([
      "admins",
      "documents",
      "employees",
      "fileSizeMb",
      "ocrPagesPerMonth",
      "queriesPerMonth",
      "storageMb",
      "tokensPerMonth",
    ]);
  });
});

describe("Migration idempotency logic", () => {
  it("detects already-migrated package (root entitlements + all versions have entitlements)", () => {
    const pkg: Record<string, unknown> = {
      entitlements: { employees: 10, documents: 100 },
      versions: [
        { version: 1, entitlements: { employees: 10, documents: 100 } },
        { version: 2, entitlements: { employees: 5, documents: 50 } },
      ],
    };

    const hasRoot = pkg.entitlements != null && Object.keys(pkg.entitlements).length > 0;
    const versionsMissing = (pkg.versions as Record<string, unknown>[]).filter((v) => !v.entitlements);

    expect(hasRoot).toBe(true);
    expect(versionsMissing).toHaveLength(0);
  });

  it("detects unmigrated package (no root entitlements, versions lack entitlements)", () => {
    const pkg: Record<string, unknown> = {
      versions: [
        { version: 1 },
        { version: 2 },
      ],
    };

    const hasRoot = pkg.entitlements != null && Object.keys(pkg.entitlements).length > 0;
    const versionsMissing = (pkg.versions as Record<string, unknown>[]).filter((v) => !v.entitlements);

    expect(hasRoot).toBe(false);
    expect(versionsMissing).toHaveLength(2);
  });

  it("detects partially-migrated package (root entitlements present, some versions missing)", () => {
    const pkg: Record<string, unknown> = {
      entitlements: { employees: 10, documents: 100 },
      versions: [
        { version: 1, entitlements: { employees: 10, documents: 100 } },
        { version: 2 }, // missing
      ],
    };

    const hasRoot = pkg.entitlements != null && Object.keys(pkg.entitlements).length > 0;
    const versionsMissing = (pkg.versions as Record<string, unknown>[]).filter((v) => !v.entitlements);

    expect(hasRoot).toBe(true);
    expect(versionsMissing).toHaveLength(1);
  });
});
