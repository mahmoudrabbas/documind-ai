import { test, expect } from "@playwright/test";
import { BASE_URL, registerCompany, uniqueSlug, uniqueEmail, TEST_PASSWORD } from "./helpers";

test.describe("Registration page", () => {
  test("loads correctly with all form fields visible", async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);

    for (const field of [
      "companyName",
      "companySlug",
      "adminName",
      "email",
      "password",
      "confirmPassword",
    ]) {
      await expect(page.locator(`input[name="${field}"], #${field}`)).toBeVisible();
    }

    await expect(
      page.locator('button[type="submit"]'),
    ).toBeVisible();
  });

  test("successful registration shows success message", async ({ page }) => {
    const slug = uniqueSlug();
    const email = uniqueEmail();

    await registerCompany(page, {
      companyName: "E2E Test Company",
      companySlug: slug,
      email,
      password: TEST_PASSWORD,
    });

    const successAlert = page.locator('[role="status"]');
    await expect(successAlert).toBeVisible({ timeout: 10_000 });
    await expect(successAlert).toContainText(/verify your email/i);
  });

  test("registration with weak password shows validation error", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/register`);

    await page.fill(
      'input[name="companyName"], #companyName',
      "Weak Pass Company",
    );
    await page.fill(
      'input[name="companySlug"], #companySlug',
      uniqueSlug("weak-pass"),
    );
    await page.fill('input[name="adminName"], #adminName', "Test Admin");
    await page.fill('input[name="email"], #email', uniqueEmail("weak-pass"));
    await page.fill('input[name="password"], #password', "123");
    await page.fill(
      'input[name="confirmPassword"], #confirmPassword',
      "123",
    );

    await page.click('button[type="submit"]');

    const passwordError = page.locator("#password-error");
    await expect(passwordError).toBeVisible();
    await expect(passwordError).toContainText(
      /at least 8 characters/i,
    );
  });

  test("registration with mismatched passwords shows error", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/register`);

    await page.fill(
      'input[name="companyName"], #companyName',
      "Mismatch Company",
    );
    await page.fill(
      'input[name="companySlug"], #companySlug',
      uniqueSlug("mismatch"),
    );
    await page.fill('input[name="adminName"], #adminName', "Test Admin");
    await page.fill(
      'input[name="email"], #email',
      uniqueEmail("mismatch"),
    );
    await page.fill('input[name="password"], #password', TEST_PASSWORD);
    await page.fill(
      'input[name="confirmPassword"], #confirmPassword',
      "DifferentPass456!",
    );

    await page.click('button[type="submit"]');

    const confirmError = page.locator("#confirmPassword-error");
    await expect(confirmError).toBeVisible();
    await expect(confirmError).toContainText(/passwords must match/i);
  });

  test("registration with duplicate slug shows error", async ({ page }) => {
    const slug = uniqueSlug("dup-slug");

    await registerCompany(page, {
      companyName: "Duplicate Slug Company",
      companySlug: slug,
      email: uniqueEmail("dup-slug"),
      password: TEST_PASSWORD,
    });

    await expect(page.locator('[role="status"]')).toBeVisible({
      timeout: 10_000,
    });

    await registerCompany(page, {
      companyName: "Duplicate Slug Company Two",
      companySlug: slug,
      email: uniqueEmail("dup-slug-2"),
      password: TEST_PASSWORD,
    });

    const formError = page.locator('[role="alert"]');
    await expect(formError).toBeVisible({ timeout: 10_000 });
  });

  test("form auto-generates slug from company name", async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);

    const slugInput = page.locator('input[name="companySlug"], #companySlug');
    await expect(slugInput).toHaveValue("");

    await page.fill(
      'input[name="companyName"], #companyName',
      "Acme Corp Inc",
    );

    await expect(slugInput).toHaveValue("acme-corp-inc");
  });

  test("has a link to the login page", async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);

    const loginLink = page.locator('a[href="/login"]');
    await expect(loginLink).toBeVisible();
  });
});
