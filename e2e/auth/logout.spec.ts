import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  registerAndVerifyCompany,
  loginCompany,
} from "./helpers";

test.describe("Logout and session management", () => {
  let credentials: { slug: string; email: string; password: string };

  test.beforeAll(async () => {
    credentials = await registerAndVerifyCompany({
      slug: `e2e-logout-${Date.now()}`,
    });
  });

  test.beforeEach(async ({ page }) => {
    await loginCompany(
      page,
      credentials.slug,
      credentials.email,
      credentials.password,
    );
    await page.waitForURL("**/dashboard/**", { timeout: 15000 });
  });

  test("Logout clears session and redirects to login", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);

    const avatar = page.locator('button[aria-haspopup="menu"]');
    await avatar.click();
    await page.getByRole("menuitem", { name: /logout/i }).click();

    await page.waitForURL("**/login", { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("After logout, dashboard is inaccessible", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);

    const avatar = page.locator('button[aria-haspopup="menu"]');
    await avatar.click();
    await page.getByRole("menuitem", { name: /logout/i }).click();
    await page.waitForURL("**/login", { timeout: 10000 });

    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForURL("**/login*", { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("Logout-all button exists in settings", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/settings`);

    const logoutAllBtn = page.getByRole("button", {
      name: /sign out all/i,
    });
    await expect(logoutAllBtn).toBeVisible();
  });

  test("Logout-all shows confirmation dialog", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/settings`);

    const logoutAllBtn = page.getByRole("button", {
      name: /sign out all/i,
    });
    await logoutAllBtn.click();

    await expect(
      page.getByText(/are you sure.*revoke all refresh tokens/i),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /yes, revoke all/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /cancel/i }),
    ).toBeVisible();
  });

  test("Logout-all confirmation revokes sessions", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/settings`);

    const logoutAllBtn = page.getByRole("button", {
      name: /sign out all/i,
    });
    await logoutAllBtn.click();

    await page.getByRole("button", { name: /yes, revoke all/i }).click();

    await page.waitForURL("**/login*", { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });
});
