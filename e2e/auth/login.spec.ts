import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  registerAndVerifyCompany,
  loginCompany,
  uniqueSlug,
  uniqueEmail,
} from "./helpers";

test.describe("Login page", () => {
  test("page loads correctly with all form fields", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    await expect(page).toHaveTitle(/login|sign in/i);

    await expect(page.locator("#companySlug")).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("login with valid credentials redirects to dashboard", async ({
    page,
  }) => {
    const { slug, email, password } = await registerAndVerifyCompany();

    await loginCompany(page, slug, email, password);

    await page.waitForURL("**/dashboard", { timeout: 15000 });
    expect(page.url()).toContain("/dashboard");
  });

  test("login with wrong password shows error", async ({ page }) => {
    const { slug, email } = await registerAndVerifyCompany();

    await loginCompany(page, slug, email, "WrongPassword999!");

    const alert = page.locator('[role="alert"]');
    await expect(alert).toBeVisible({ timeout: 10000 });
    await expect(alert).not.toContainText("Too many requests");
  });

  test("login with non-existent slug shows error", async ({ page }) => {
    await loginCompany(
      page,
      `no-such-company-${Date.now()}`,
      `nobody-${Date.now()}@test.com`,
      "WhateverPass1!",
    );

    const alert = page.locator('[role="alert"]');
    await expect(alert).toBeVisible({ timeout: 10000 });
    await expect(alert).not.toContainText("Too many requests");
  });

  test("login page has link to register", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    const registerLink = page.locator('a[href="/register"]');
    await expect(registerLink).toBeVisible();
  });

  test("login page has link to forgot password", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    const forgotLink = page.locator('a[href="/forgot-password"]');
    await expect(forgotLink).toBeVisible();
  });

  test("guest users cannot access dashboard", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);

    await page.waitForURL("**/login", { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("rate limit shows countdown after many rapid submissions", async ({
    page,
  }) => {
    const slug = uniqueSlug("ratelimit");
    const email = uniqueEmail("ratelimit");

    await page.goto(`${BASE_URL}/login`);

    for (let i = 0; i < 105; i++) {
      await page.fill("#companySlug", slug);
      await page.fill("#email", email);
      await page.fill("#password", "WrongPassword!");
      await page.click('button[type="submit"]');
      await page.waitForTimeout(200);
    }

    const rateAlert = page.locator('[role="alert"]:has-text("Too many requests")');
    await expect(rateAlert).toBeVisible({ timeout: 30000 });
    await expect(rateAlert).toContainText("second");
  });

  test("rate limit countdown reaches zero and shows retry prompt", async ({
    page,
  }) => {
    const slug = uniqueSlug("retry");
    const email = uniqueEmail("retry");

    await page.goto(`${BASE_URL}/login`);

    for (let i = 0; i < 105; i++) {
      await page.fill("#companySlug", slug);
      await page.fill("#email", email);
      await page.fill("#password", "WrongPassword!");
      await page.click('button[type="submit"]');
      await page.waitForTimeout(200);
    }

    const rateAlert = page.locator('[role="alert"]:has-text("Too many requests")');
    await expect(rateAlert).toBeVisible({ timeout: 30000 });

    const retryPrompt = page.locator('[role="alert"]:has-text("You can try again")');
    await expect(retryPrompt).toBeVisible({ timeout: 120000 });
    await expect(retryPrompt.getByRole("button", { name: /retry/i })).toBeVisible();
  });
});
