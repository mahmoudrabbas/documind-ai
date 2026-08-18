import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { validatePackageInput } from "./package-form.contract";
import { resolvePackageEntitlement } from "./package-display.contract";
import type { PackageCreateInput } from "@/types/api/super-admin.types";

const valid: PackageCreateInput = {
  name: "Professional", code: "professional", description: "For teams",
  monthlyPrice: 49, annualPrice: 490, currency: "USD", trialDays: 14,
  visibility: "public", supportedModels: ["basic"], analyticsLevel: "advanced",
  retentionDays: 365, supportLevel: "priority",
  entitlements: { employees: 20, admins: 2, documents: 1000, storageMb: 10000,
    fileSizeMb: 25, queriesPerMonth: 5000, tokensPerMonth: 100000, ocrPagesPerMonth: 500 },
};

describe("package management state contracts", () => {
  it("renders zero-valued current entitlements without requiring legacy limits", () => {
    const currentOnly = { entitlements: { storageMb: 0, queriesPerMonth: 0 } };

    expect(resolvePackageEntitlement(currentOnly, "storageMb", "storageMb")).toBe(0);
    expect(
      resolvePackageEntitlement(currentOnly, "queriesPerMonth", "questionsPerMonth"),
    ).toBe(0);
    expect(resolvePackageEntitlement(currentOnly, "documents", "documents")).toBeUndefined();
  });

  it("validates integer entitlements, model uniqueness, currency, and prices", () => {
    expect(validatePackageInput(valid)).toBeNull();
    expect(validatePackageInput({ ...valid, monthlyPrice: Number.NaN })).toContain("Monthly price");
    expect(validatePackageInput({ ...valid, entitlements: { ...valid.entitlements, employees: 1.5 } })).toContain("Employees");
    expect(validatePackageInput({ ...valid, supportedModels: ["basic", "basic"] })).toContain("duplicates");
  });

  it("loads impact once per stable open/action/package version and supports retry", async () => {
    const source = await readFile(new URL("./package-lifecycle-dialog.tsx", import.meta.url), "utf8");
    expect(source).toContain("useEffect(() =>");
    expect(source).toContain("[action, open, pkg._id, pkg.version, retry]");
    expect(source).toContain("setRetry((value) => value + 1)");
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain("event.target === event.currentTarget");
  });

  it("reloads current data on success and stale conflicts and hides mutation forms without permission", async () => {
    const form = await readFile(new URL("./package-form.tsx", import.meta.url), "utf8");
    const detail = await readFile(new URL("../../app/(dashboard)/super-admin/packages/[packageId]/page.tsx", import.meta.url), "utf8");
    expect(form).toContain('caught.code === "PACKAGE_VERSION_CONFLICT"');
    expect(form).toContain("await onSaved?.()");
    /* The no-permission notice is translated, so the guard is asserted via
       its dictionary key rather than the English sentence it renders. */
    expect(form).toContain('t("superAdmin.packageForm.noPermission")');
    expect(detail).toContain("onSaved={state.reload}");
  });

  it("landing pricing contains no hardcoded package fallback", async () => {
    const source = await readFile(new URL("../marketing/PricingSection.tsx", import.meta.url), "utf8");
    expect(source).toContain('"/public/packages"');
    expect(source).not.toContain("free-fallback");
    expect(source).not.toContain("fallbackFree");
  });
});
