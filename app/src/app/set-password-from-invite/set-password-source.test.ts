import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const sourceUrl = new URL(
  "./set-password-from-invite-client.tsx",
  import.meta.url,
);

describe("invite password page source", () => {
  it("keeps password validation errors inline without consuming navigation state", async () => {
    const source = await readFile(sourceUrl, "utf8");
    expect(source).toContain('code === "PASSWORD_VALIDATION_FAILED"');
    expect(source).toMatch(/setState\(\{\s+status: "form"/);
    expect(source).toContain('t("auth.passwordsDoNotMatch")');
    expect(source).toContain("disabled={!formValid");
    expect(source).toContain("INVITE_REISSUE_REQUIRED");
    expect(source).toContain("rateLimitRetryAfter !== null");
    expect(source).not.toContain('router.push("/login")');
  });

  it("renders invitation context and a readable responsive auth card", async () => {
    const source = await readFile(sourceUrl, "utf8");
    expect(source).toContain("details.companyName");
    expect(source).toContain("details.role");
    expect(source).toContain("details.email");
    expect(source).toContain("AuthPageShell");
    expect(source).toContain('t("auth.showPassword")');
  });

  it("performs a single validation request on page load with stable deps", async () => {
    const source = await readFile(sourceUrl, "utf8");
    const validateCallCount = source.split('"/users/validate-invite"').length - 1;
    expect(validateCallCount).toBe(1);
    // The validation effect depends only on the memoized token and the
    // stable `t` translation function, so no render loop can re-fire it.
    expect(source).toMatch(/},\s*\[token,\s*t\]\);/);
    expect(source).not.toContain("router.push(\"/login\")");
  });
});
