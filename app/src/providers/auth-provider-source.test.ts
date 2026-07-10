import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("AuthProvider logout", () => {
  it("always clears local session state after credentialed logout", async () => {
    const source = await readFile(new URL("./auth-provider.tsx", import.meta.url), "utf8");
    expect(source).toContain('apiClient("/auth/logout"');
    expect(source).toContain('credentials: "include"');
    expect(source).toContain("finally");
    expect(source).toContain("clearAccessToken()");
    expect(source).toContain('status: "unauthenticated", user: null, tenant: null, accessToken: null');
    expect(source).not.toMatch(/localStorage|sessionStorage/);
  });
});
