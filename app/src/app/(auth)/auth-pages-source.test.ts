import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const authDir = new URL("./", import.meta.url);
const verifyEmailDir = new URL("../verify-email/", authDir);

async function readSource(relativePath: string, base = authDir) {
  return readFile(new URL(relativePath, base), "utf8");
}

describe("auth page source", () => {
  it("keeps the login form fields and in-memory token behavior", async () => {
    const source = await readSource("login/page.tsx");

    expect(source).toContain('name="companySlug"');
    expect(source).toContain('name="email"');
    expect(source).toContain('name="password"');
    expect(source).toContain('credentials: "include"');
    expect(source).toContain(
      "establishSession(response.data.tokens.accessToken",
    );
    expect(source).not.toMatch(/localStorage|sessionStorage/);
  });

  it("keeps the register form fields available", async () => {
    const source = await readSource("register/page.tsx");

    for (const field of [
      "companyName",
      "companySlug",
      "adminName",
      "email",
      "password",
      "confirmPassword",
    ]) {
      expect(source).toContain(`name="${field}"`);
    }
  });

  it("keeps verify-email styled as a full auth card with a login action", async () => {
    const source = await readSource("verify-email-client.tsx", verifyEmailDir);

    expect(source).toContain("AuthPageShell");
    expect(source).toContain('href="/login"');
    expect(source).not.toMatch(/localStorage|sessionStorage/);
  });
});
