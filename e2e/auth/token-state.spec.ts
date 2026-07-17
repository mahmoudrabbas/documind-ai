import { test, expect } from "@playwright/test";
import { BASE_URL } from "./helpers";

test.describe("Token state page", () => {
  test("expired state shows correct content and link", async ({ page }) => {
    await page.goto(`${BASE_URL}/token-state?state=expired`);

    const heading = page.locator("#token-state-title");
    await expect(heading).toBeVisible();
    await expect(heading).toContainText(/expired|expir/i);

    const actionLink = page.locator('a[href="/forgot-password"]');
    await expect(actionLink).toBeVisible();
    await expect(actionLink).toContainText(/request.*link|new.*link/i);

    const backLink = page.getByRole("link", { name: /back to sign in/i });
    await expect(backLink).toBeVisible();
  });

  test("used state shows correct content and link", async ({ page }) => {
    await page.goto(`${BASE_URL}/token-state?state=used`);

    const heading = page.locator("#token-state-title");
    await expect(heading).toBeVisible();
    await expect(heading).toContainText(/used|already/i);

    const actionLink = page.locator('a[href="/login"]');
    await expect(actionLink).toBeVisible();
    await expect(actionLink).toContainText(/sign in/i);
  });

  test("invalid state shows correct content and link", async ({ page }) => {
    await page.goto(`${BASE_URL}/token-state?state=invalid`);

    const heading = page.locator("#token-state-title");
    await expect(heading).toBeVisible();
    await expect(heading).toContainText(/invalid|error/i);

    const actionLink = page.locator('a[href="/login"]');
    await expect(actionLink).toBeVisible();
  });

  test("revoked state shows correct content and link", async ({ page }) => {
    await page.goto(`${BASE_URL}/token-state?state=revoked`);

    const heading = page.locator("#token-state-title");
    await expect(heading).toBeVisible();
    await expect(heading).toContainText(/revoked|block/i);

    const actionLink = page.locator('a[href="/forgot-password"]');
    await expect(actionLink).toBeVisible();
  });

  test("unknown state falls back to invalid display", async ({ page }) => {
    await page.goto(`${BASE_URL}/token-state?state=unknown-state`);

    const heading = page.locator("#token-state-title");
    await expect(heading).toBeVisible();

    const backLink = page.getByRole("link", { name: /back to sign in/i });
    await expect(backLink).toBeVisible();
  });

  test("all states have back to sign in link", async ({ page }) => {
    for (const state of ["expired", "used", "invalid", "revoked"]) {
      await page.goto(`${BASE_URL}/token-state?state=${state}`);

      const backLink = page.getByRole("link", { name: /back to sign in/i });
      await expect(backLink).toBeVisible();
      await expect(backLink).toHaveAttribute("href", "/login");
    }
  });
});
