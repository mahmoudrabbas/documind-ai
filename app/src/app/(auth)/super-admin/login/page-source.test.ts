import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
const sourceUrl = new URL("./page.tsx", import.meta.url);
describe("Super Admin login", () => {
  it("uses email/password and the dedicated endpoint", async () => { const source = await readFile(sourceUrl, "utf8"); expect(source).toContain('name="email"'); expect(source).toContain('name="password"'); expect(source).not.toContain("companySlug"); expect(source).toContain('"/auth/super-admin/login"'); expect(source).toContain('credentials: "include"'); });
  it("commits memory session and replaces history", async () => { const source = await readFile(sourceUrl, "utf8"); expect(source).toContain("pending.current"); expect(source).toContain("auth.establishSession"); expect(source).toContain('router.replace("/super-admin/tenants")'); expect(source).not.toMatch(/localStorage|sessionStorage/); });
});
