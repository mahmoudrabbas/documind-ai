import { expect, test, type Page } from "@playwright/test";

const desktopViewports = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
];

async function expectNoDocumentOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    documentHeight: document.documentElement.scrollHeight,
    documentWidth: document.documentElement.scrollWidth,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
  }));

  expect(dimensions.documentHeight).toBeLessThanOrEqual(
    dimensions.viewportHeight,
  );
  expect(dimensions.documentWidth).toBeLessThanOrEqual(
    dimensions.viewportWidth,
  );
}

test.describe("Auth shell layout", () => {
  for (const viewport of desktopViewports) {
    for (const route of ["login", "register", "super-admin/login"]) {
      test(`/${route} fits ${viewport.width}x${viewport.height} without body scrolling`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await page.goto(`/${route}`);

        await expect(page.locator("[data-auth-shell]")).toBeVisible();
        await expect(page.locator("[data-auth-hero-panel]")).toBeVisible();
        await expectNoDocumentOverflow(page);

        const panelOverflow = await page
          .locator("[data-auth-form-panel]")
          .evaluate((panel) => panel.scrollHeight - panel.clientHeight);
        expect(panelOverflow).toBeLessThanOrEqual(1);
      });
    }
  }

  test("mobile register remains vertically scrollable without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 650 });
    await page.goto("/register");

    await expect(page.locator("[data-auth-shell]")).toBeVisible();
    await expect(page.locator("[data-auth-hero-panel]")).toBeHidden();
    const dimensions = await page.evaluate(() => ({
      documentHeight: document.documentElement.scrollHeight,
      documentWidth: document.documentElement.scrollWidth,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    }));
    expect(dimensions.documentHeight).toBeGreaterThan(
      dimensions.viewportHeight,
    );
    expect(dimensions.documentWidth).toBeLessThanOrEqual(
      dimensions.viewportWidth,
    );
    await expect(page.locator("button[type=submit]")).toBeVisible();
  });

  test("mobile Super Admin login uses the single-column shell", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 650 });
    await page.goto("/super-admin/login");

    await expect(page.locator("[data-auth-shell]")).toBeVisible();
    await expect(page.locator("[data-auth-hero-panel]")).toBeHidden();
    const widths = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport);
    await expect(page.locator("button[type=submit]")).toBeVisible();
  });

  test("tablet Super Admin login uses the single-column shell without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/super-admin/login");

    await expect(page.locator("[data-auth-shell]")).toBeVisible();
    await expect(page.locator("[data-auth-hero-panel]")).toBeHidden();
    const widths = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport);
  });

  test("short desktop heights keep body fixed and scroll the form panel", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 600 });
    await page.goto("/register");

    await expect(page.locator("[data-auth-shell]")).toBeVisible();
    await expectNoDocumentOverflow(page);
    const panelOverflow = await page
      .locator("[data-auth-form-panel]")
      .evaluate((panel) => panel.scrollHeight - panel.clientHeight);
    expect(panelOverflow).toBeGreaterThan(1);
    await page.locator("button[type=submit]").scrollIntoViewIfNeeded();
    await expect(page.locator("button[type=submit]")).toBeVisible();
  });

  test("a desktop login error stays inside the auth shell", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.route("**/auth/login", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid credentials",
          },
        }),
      });
    });
    await page.goto("/login");
    await page.fill("#companySlug", "example-company");
    await page.fill("#email", "person@example.com");
    await page.fill("#password", "WrongPassword1!");
    await page.click("button[type=submit]");

    await expect(page.locator('form [role="alert"]')).toBeVisible();
    await expectNoDocumentOverflow(page);
  });
});
