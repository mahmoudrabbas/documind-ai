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
  it("filters shell-specific navigation through effective permissions", async () => {
    const source = await readFile(sourceUrl, "utf8");
    expect(source).toContain("getAppContext(auth.user.role)");
    expect(source).toContain("PLATFORM_SIDEBAR_LINKS");
    expect(source).toContain("TENANT_SIDEBAR_LINKS");
    expect(source).toContain("filterNavigationLinks(");
    expect(source).toContain("permissions.status,");
    expect(source).toContain("permissions.can");
    expect(source).not.toContain("SIDEBAR_LINKS[auth.user.role]");
  });
});
