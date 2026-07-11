import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const sourceUrl = new URL("./app-navigation.tsx", import.meta.url);

describe("authenticated navigation source", () => {
  it("uses provider logout once and replaces history", async () => {
    const source = await readFile(sourceUrl, "utf8");
    expect(source).toContain("logoutPending.current");
    expect(source).toContain("await auth.logout()");
    expect(source).toContain('router.replace("/login")');
    expect(source).toContain("Logging out…");
  });
  it("keeps role-specific navigation", async () => {
    const source = await readFile(sourceUrl, "utf8");
    expect(source).toContain('auth.user.role === "SUPER_ADMIN"');
    expect(source).toContain('auth.user.role === "COMPANY_ADMIN"');
    expect(source).toContain('"Tenant Management", "/platform/tenants"');
    expect(source).toContain('"Team", "/dashboard/users"');
  });
});
