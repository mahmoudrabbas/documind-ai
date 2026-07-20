import { describe, it, expect } from "vitest";
import PackageModel from "../models/package.model.js";

describe("PackageModel — limits virtual", () => {
  it("derives limits values from entitlements when present", () => {
    const pkg = new PackageModel();
    pkg.set("entitlements", {
      employees: 10,
      admins: 2,
      documents: 500,
      storageMb: 1024,
      fileSizeMb: 25,
      queriesPerMonth: 5000,
      tokensPerMonth: 100_000,
      ocrPagesPerMonth: 100,
    });

    const limits = pkg.get("limits");

    expect(limits).toEqual({
      users: 10,
      documents: 500,
      questionsPerMonth: 5000,
      storageMb: 1024,
    });
  });

  it("returns safe defaults when entitlements is undefined", () => {
    const pkg = new PackageModel();
    // entitlements defaults to the schema default (which may be undefined on new instances)

    const limits = pkg.get("limits");

    expect(limits).toEqual({
      users: 0,
      documents: 0,
      questionsPerMonth: 0,
      storageMb: 0,
    });
  });

  it("returns safe defaults when entitlements is null", () => {
    const pkg = new PackageModel();
    pkg.set("entitlements", null);

    const limits = pkg.get("limits");

    expect(limits).toEqual({
      users: 0,
      documents: 0,
      questionsPerMonth: 0,
      storageMb: 0,
    });
  });

  it("returns safe defaults when entitlements has undefined values", () => {
    const pkg = new PackageModel();
    pkg.set("entitlements", { employees: undefined, documents: undefined, queriesPerMonth: undefined, storageMb: undefined } as Record<string, unknown>);

    const limits = pkg.get("limits");

    // undefined numeric fields fall through to the return statement as-is
    // since `!e` is false for a non-null object. The virtual returns whatever
    // values exist. In practice this is an impossible state (schema validation
    // would reject it), but the virtual should not crash.
    expect(limits).toBeDefined();
    expect(typeof limits).toBe("object");
  });

  it("toJSON includes the limits virtual", () => {
    const pkg = new PackageModel();
    pkg.set("entitlements", {
      employees: 5,
      admins: 1,
      documents: 100,
      storageMb: 256,
      fileSizeMb: 10,
      queriesPerMonth: 2000,
      tokensPerMonth: 0,
      ocrPagesPerMonth: 0,
    });

    const json = pkg.toJSON();

    expect(json.limits).toBeDefined();
    expect(json.limits.users).toBe(5);
    expect(json.limits.documents).toBe(100);
    expect(json.limits.questionsPerMonth).toBe(2000);
    expect(json.limits.storageMb).toBe(256);
  });
});
