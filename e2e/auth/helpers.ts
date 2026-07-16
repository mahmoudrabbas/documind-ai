import { type Page } from "@playwright/test";

export const BASE_URL = "http://localhost:3000";
export const API_URL = "http://localhost:5000";

export function uniqueSlug(prefix = "e2e-test") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function uniqueEmail(prefix = "admin") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@e2e.test`;
}

export const TEST_PASSWORD = "StrongPass123!";

export async function registerViaApi(data: {
  companyName?: string;
  companySlug: string;
  adminName?: string;
  email: string;
  password?: string;
}) {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      companyName: data.companyName ?? "E2E Test Company",
      companySlug: data.companySlug,
      adminName: data.adminName ?? "Test Admin",
      email: data.email,
      password: data.password ?? TEST_PASSWORD,
    }),
  });
  return res.json() as Promise<{
    success: boolean;
    data?: { tenant: { id: string }; user: { id: string } };
  }>;
}

export async function verifyEmailViaApi(token: string, slug: string) {
  const res = await fetch(
    `${API_URL}/auth/verify-email?token=${encodeURIComponent(token)}&slug=${encodeURIComponent(slug)}`,
  );
  return res.json() as Promise<{ success: boolean }>;
}

export async function registerAndVerifyCompany(
  overrides: { slug?: string; email?: string } = {},
) {
  const slug = overrides.slug ?? uniqueSlug();
  const email = overrides.email ?? uniqueEmail();

  const regResult = await registerViaApi({ companySlug: slug, email });
  if (!regResult.success || !regResult.data) {
    throw new Error(`Registration failed: ${JSON.stringify(regResult)}`);
  }

  const tokenRes = await fetch(`${API_URL}/auth/verify-email-token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, companySlug: slug }),
  });
  const tokenData = (await tokenRes.json()) as {
    success: boolean;
    data?: { token: string };
  };

  if (tokenData.success && tokenData.data?.token) {
    await verifyEmailViaApi(tokenData.data.token, slug);
  }

  return { slug, email, password: TEST_PASSWORD };
}

export async function registerCompany(
  page: Page,
  company: {
    companyName?: string;
    companySlug: string;
    adminName?: string;
    email: string;
    password?: string;
  },
) {
  await page.goto(`${BASE_URL}/register`);
  await page.fill(
    'input[name="companyName"], #companyName',
    company.companyName ?? "E2E Test Company",
  );
  await page.fill('input[name="companySlug"], #companySlug', company.companySlug);
  await page.fill(
    'input[name="adminName"], #adminName',
    company.adminName ?? "Test Admin",
  );
  await page.fill('input[name="email"], #email', company.email);
  await page.fill(
    'input[name="password"], #password',
    company.password ?? TEST_PASSWORD,
  );
  await page.fill(
    'input[name="confirmPassword"], #confirmPassword',
    company.password ?? TEST_PASSWORD,
  );
  await page.click('button[type="submit"]');
}

export async function loginCompany(
  page: Page,
  slug: string,
  email: string,
  password: string,
) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="companySlug"], #companySlug', slug);
  await page.fill('input[name="email"], #email', email);
  await page.fill('input[name="password"], #password', password);
  await page.click('button[type="submit"]');
}

export async function loginSuperAdmin(
  page: Page,
  email: string,
  password: string,
) {
  await page.goto(`${BASE_URL}/super-admin/login`);
  await page.fill('input[name="email"], #email', email);
  await page.fill('input[name="password"], #password', password);
  await page.click('button[type="submit"]');
}
