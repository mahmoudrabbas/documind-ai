import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const authDir = new URL("./", import.meta.url);
const verifyEmailDir = new URL("../verify-email/", authDir);
const authComponentsDir = new URL("../../components/auth/", authDir);

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
    expect(source).toContain('href="/"');
    expect(source).toContain('t("auth.backToHome")');
    expect(source).toContain('href={resendVerificationHref}');
    expect(source).toContain("rateLimitRetryAfter !== null");
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
    expect(source).toContain('href="/"');
    expect(source).toContain('t("auth.backToHome")');
    expect(source).toContain("rateLimitRetryAfter !== null");
  });

  it("resend-verification sends companySlug and email with 429 recovery", async () => {
    const source = await readSource("resend-verification/page.tsx");

    expect(source).toContain("/auth/resend-verification-email");
    expect(source).toContain("companySlug: companySlug.trim().toLowerCase()");
    expect(source).toContain("email: email.trim().toLowerCase()");
    expect(source).toContain("RateLimitAlert");
    expect(source).toContain("rateLimitRetryAfter !== null");
    expect(source).toContain("submissionPending.current");
    expect(source).toContain("const submitDisabled = isSubmitting || rateLimitRetryAfter !== null");
    expect(source).not.toContain("useEffect(");
  });

  it("rate-limit alert supports countdowns and long human-readable waits without retry loops", async () => {
    const source = await readSource("rate-limit-alert.tsx", authComponentsDir);

    expect(source).toContain('auth.rateLimitLongWait');
    expect(source).toContain("secondsLeft > 120");
    expect(source).toContain("setInterval");
    expect(source).not.toContain("fetch(");
  });

  it("keeps verify-email styled as a full auth card with a login action", async () => {
    const source = await readSource("verify-email-client.tsx", verifyEmailDir);

    expect(source).toContain("AuthPageShell");
    expect(source).toContain('href="/login"');
    expect(source).not.toMatch(/localStorage|sessionStorage/);
  });
});
