import { test, expect } from "@playwright/test";
import { BASE_URL, loginSuperAdmin } from "./helpers";

test.describe("Super Admin Login page", () => {
  test("page loads correctly with form fields", async ({ page }) => {
    await page.goto(`${BASE_URL}/super-admin/login`);

    await expect(page).toHaveTitle(/super admin|sign in/i);

    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("page displays platform admin branding", async ({ page }) => {
    await page.goto(`${BASE_URL}/super-admin/login`);

    await expect(page.getByText("Super Admin Sign In")).toBeVisible();
    await expect(
      page.getByText("Use your platform administrator credentials"),
    ).toBeVisible();
  });

  test("login with wrong password shows error", async ({ page }) => {
    await loginSuperAdmin(
      page,
      `no-super-admin-${Date.now()}@test.com`,
      "WrongPassword999!",
    );

    const alert = page.locator('[role="alert"]');
    await expect(alert).toBeVisible({ timeout: 10000 });
    await expect(alert).toContainText(/invalid|unable to sign in/i);
    await expect(alert).not.toContainText("Too many requests");
  });

  test("page has sign in button", async ({ page }) => {
    await page.goto(`${BASE_URL}/super-admin/login`);

    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toContainText(/sign in/i);
  });

  test("page displays security footer", async ({ page }) => {
    await page.goto(`${BASE_URL}/super-admin/login`);

    await expect(page.getByText("AES-256 Encrypted")).toBeVisible();
  });
});
