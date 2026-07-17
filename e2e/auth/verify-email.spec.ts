import { test, expect } from "@playwright/test";
import { BASE_URL, API_URL, registerViaApi, uniqueSlug, uniqueEmail } from "./helpers";

async function getTestVerificationToken(email: string, slug: string) {
  const res = await fetch(`${API_URL}/auth/test/verify-email-token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, companySlug: slug }),
  });
  const data = (await res.json()) as { success: boolean; data?: { token: string } };
  return data.data?.token;
}

test.describe("Email verification browser flow", () => {
  test("navigating with valid token shows success state", async ({ page }) => {
    const slug = uniqueSlug("verify-e2e");
    const email = uniqueEmail("verify-e2e");

    await registerViaApi({ companySlug: slug, email });
    const token = await getTestVerificationToken(email, slug);
    expect(token, "test endpoint should return a token").toBeTruthy();

    await page.goto(`${BASE_URL}/verify-email?token=${token}`);

    const successMessage = page.getByRole("status", {
      name: /email verified|successfully/i,
    });
    await expect(successMessage).toBeVisible({ timeout: 15000 });

    const signInLink = page.getByRole("link", { name: /sign in|log in/i });
    await expect(signInLink).toBeVisible();
  });

  test("navigating with invalid token shows error state", async ({ page }) => {
    await page.goto(`${BASE_URL}/verify-email?token=invalid-token-xyz`);

    const errorMessage = page.getByRole("alert");
    await expect(errorMessage).toBeVisible({ timeout: 15000 });
    await expect(errorMessage).toContainText(
      /could not verify|expired|invalid|missing/i,
    );
  });

  test("navigating without token shows error state", async ({ page }) => {
    await page.goto(`${BASE_URL}/verify-email`);

    const signInLink = page.getByRole("link", { name: /sign in|log in/i });
    await expect(signInLink).toBeVisible({ timeout: 15000 });
  });

  test("success page links back to login", async ({ page }) => {
    const slug = uniqueSlug("verify-link");
    const email = uniqueEmail("verify-link");

    await registerViaApi({ companySlug: slug, email });
    const token = await getTestVerificationToken(email, slug);
    expect(token).toBeTruthy();

    await page.goto(`${BASE_URL}/verify-email?token=${token}`);

    const signInLink = page.getByRole("link", { name: /sign in|log in/i });
    await expect(signInLink).toBeVisible({ timeout: 15000 });
    await signInLink.click();

    await page.waitForURL("**/login", { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });
});
