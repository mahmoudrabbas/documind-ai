import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  registerAndVerifyCompany,
} from "./helpers";

test.describe("Forgot / Reset Password", () => {
  test.describe("Forgot Password Page", () => {
    test("page loads correctly with form fields and submit button", async ({
      page,
    }) => {
      await page.goto(`${BASE_URL}/forgot-password`);

      const slugInput = page.locator("#companySlug");
      const emailInput = page.locator("#email");
      const submitButton = page.locator('button[type="submit"]');

      await expect(slugInput).toBeVisible();
      await expect(emailInput).toBeVisible();
      await expect(submitButton).toBeVisible();
    });

    test("shows success message after valid submission", async ({ page }) => {
      await page.goto(`${BASE_URL}/forgot-password`);

      await page.fill("#companySlug", "test-company");
      await page.fill("#email", "admin@example.com");
      await page.click('button[type="submit"]');

      const successHeading = page.getByRole("heading", {
        name: /password.*email|check.*email|sent/i,
      });
      await expect(successHeading).toBeVisible();
    });

    test("shows same generic success for non-existent slug (no enumeration)", async ({
      page,
    }) => {
      await page.goto(`${BASE_URL}/forgot-password`);

      await page.fill("#companySlug", "non-existent-company-slug-xyz");
      await page.fill("#email", "nobody@example.com");
      await page.click('button[type="submit"]');

      const successHeading = page.getByRole("heading", {
        name: /password.*email|check.*email|sent/i,
      });
      await expect(successHeading).toBeVisible();
    });

    test("has a link back to login", async ({ page }) => {
      await page.goto(`${BASE_URL}/forgot-password`);

      const loginLink = page.getByRole("link", { name: /login|sign.*in/i });
      await expect(loginLink).toBeVisible();
      await expect(loginLink).toHaveAttribute("href", "/login");
    });
  });

  test.describe("Reset Password Page", () => {
    test("shows error state when navigated without token params", async ({
      page,
    }) => {
      await page.goto(`${BASE_URL}/reset-password`);

      const errorMessage = page.getByText(/missing|invalid|error/i);
      await expect(errorMessage).toBeVisible();
    });

    test("shows reset form when token and slug are provided", async ({
      page,
    }) => {
      await page.goto(
        `${BASE_URL}/reset-password?token=invalid-token-abc&slug=test`,
      );

      const passwordInput = page.locator('input[name="password"], #password');
      await expect(passwordInput).toBeVisible();
    });

    test("shows error when submitting invalid reset token", async ({ page }) => {
      await page.goto(
        `${BASE_URL}/reset-password?token=invalid-token-abc&slug=test-slug`,
      );

      const passwordInput = page.locator('input[name="password"], #password');
      await expect(passwordInput).toBeVisible({ timeout: 10000 });

      await passwordInput.fill("NewPassword123!");

      const confirmInput = page.locator(
        'input[name="confirmPassword"], #confirmPassword',
      );
      if (await confirmInput.isVisible()) {
        await confirmInput.fill("NewPassword123!");
      }

      await page.locator('button[type="submit"]').click();

      const alert = page.locator('[role="alert"]');
      await expect(alert).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe("Full forgot-password round-trip", () => {
    test("submit forgot-password then navigate to reset form and verify UI", async ({
      page,
    }) => {
      const { slug, email } = await registerAndVerifyCompany();

      await page.goto(`${BASE_URL}/forgot-password`);
      await page.fill("#companySlug", slug);
      await page.fill("#email", email);
      await page.click('button[type="submit"]');

      const successHeading = page.getByRole("heading", {
        name: /password.*email|check.*email|sent/i,
      });
      await expect(successHeading).toBeVisible({ timeout: 10000 });

      await page.goto(
        `${BASE_URL}/reset-password?token=some-token-from-email&slug=${slug}`,
      );

      const passwordInput = page.locator('input[name="password"], #password');
      await expect(passwordInput).toBeVisible({ timeout: 10000 });
    });
  });
});
