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
    expect(source).toContain("Passwords do not match.");
    expect(source).toContain("disabled={!formValid");
    expect(source).not.toContain('router.push("/login")');
  });

  it("renders invitation context and a readable responsive auth card", async () => {
    const source = await readFile(sourceUrl, "utf8");
    expect(source).toContain("details.companyName");
    expect(source).toContain("details.role");
    expect(source).toContain("details.email");
    expect(source).toContain("AuthPageShell");
    expect(source).toContain("Show password");
  });
});
