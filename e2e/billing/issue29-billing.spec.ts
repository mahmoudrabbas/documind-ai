import { expect, test, type Page, type Route } from "@playwright/test";

const API_URL = "http://localhost:5000";
const tenantId = "64b000000000000000000001";
const userId = "64b000000000000000000002";
const invoiceId = "64b000000000000000000003";
const refundId = "64b000000000000000000004";
const operationId = "64b000000000000000000005";

const summary = {
  id: "64b000000000000000000006",
  tenantId,
  packageId: {
    _id: "64b000000000000000000007",
    name: "Pro",
    code: "pro",
    version: 2,
    monthlyPrice: 20,
    annualPrice: 200,
    monthlyPriceCents: 2000,
    annualPriceCents: 20000,
    currency: "USD",
    entitlements: { employees: 10, admins: 2, documents: 500, storageMb: 2048, fileSizeMb: 20, queriesPerMonth: 2000, tokensPerMonth: 20000, ocrPagesPerMonth: 200 },
  },
  packageVersion: 2,
  billingInterval: "monthly",
  status: "ACTIVE",
  paymentState: "paid",
  periodStart: "2026-07-01T00:00:00.000Z",
  periodEnd: "2026-08-01T00:00:00.000Z",
  currentPeriodStart: "2026-07-01T00:00:00.000Z",
  currentPeriodEnd: "2026-08-01T00:00:00.000Z",
  trialStart: null,
  trialEnd: null,
  cancelAtPeriodEnd: false,
  cancellationEffectiveAt: null,
  providerManaged: true,
  providerLinked: true,
  pendingOperation: null,
  canOpenPortal: true,
  canUpdatePaymentMethod: true,
  canViewInvoices: true,
  canChangePlan: true,
  canCancel: true,
  canReactivate: false,
  canRequestRefund: true,
  lifecycle: { eligible: true, inGracePeriod: false, accessEndsAt: null, reason: "ACTIVE" },
  invoiceSummary: { total: 2, open: 0, paid: 2, pastDue: 0 },
};

const invoice = {
  id: invoiceId,
  invoiceNumber: "INV-2026-001",
  status: "paid",
  currency: "USD",
  amountDueMinor: 1250,
  amountPaidMinor: 1250,
  amountRemainingMinor: 0,
  subtotalMinor: 1250,
  taxMinor: null,
  createdAt: "2026-07-02T00:00:00.000Z",
  dueAt: null,
  paidAt: "2026-07-02T00:00:00.000Z",
  periodStart: "2026-07-01T00:00:00.000Z",
  periodEnd: "2026-08-01T00:00:00.000Z",
  refundedAmountMinor: 0,
  reservedRefundAmountMinor: 0,
  remainingRefundableMinor: 1250,
  canRequestRefund: true,
  hostedInvoiceAvailable: true,
  invoicePdfAvailable: true,
  receiptAvailable: false,
};

test.describe("Issue 29 billing browser flows", () => {
  // The official Playwright configuration starts Next.js in development mode.
  // Allow its first on-demand compilation without weakening assertion timeouts.
  test.describe.configure({ timeout: 180_000 });

  test("renders tenant billing, paginates invoices, opens a fresh secure link, and launches the payment portal", async ({ page, context }) => {
    const state = await installTenantBillingFixtures(page);
    await context.route("https://billing.example.test/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>Secure billing fixture</title>" }));
    await page.goto("/dashboard/settings/billing");

    await expect(page.getByRole("heading", { name: "Billing & invoices" })).toBeVisible();
    await expect(page.getByText("INV-2026-001").first()).toBeVisible();
    await expect(page.getByText("$12.50").first()).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect.poll(() => state.invoicePages).toContain(2);

    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: /Open invoice documents/ }).first().click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL("https://billing.example.test/invoice-document");

    await page.getByRole("button", { name: "Update payment method" }).click();
    await expect.poll(() => state.portalFlow).toBe("payment_method_update");
    await expect(page).toHaveURL("https://billing.example.test/payment-method");
  });

  test("keeps a plan change pending until the provider-confirmed operation completes", async ({ page }) => {
    const state = await installTenantBillingFixtures(page);
    await page.goto("/dashboard/settings/billing");
    await page.getByRole("button", { name: "Change plan" }).click();
    await page.getByRole("button", { name: "Preview change" }).click();
    await expect(page.getByRole("heading", { name: "Proration preview" })).toBeVisible();
    await expect(page.getByText("$50.00")).toBeVisible();

    await page.getByRole("button", { name: "Confirm change" }).click();
    await expect(page.getByText(/awaiting provider confirmation/i)).toBeVisible();
    expect(state.planChangeSubmissions).toBe(1);
    expect(state.lastIdempotencyKey).toBeTruthy();
    await expect.poll(() => state.operationReads, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
    await expect(page.getByText(/awaiting provider confirmation/i)).toBeHidden();
    expect(state.planChangeSubmissions).toBe(1);
  });

  test("submits a refund request for review without optimistic provider success", async ({ page }) => {
    const state = await installTenantBillingFixtures(page);
    await page.goto("/dashboard/settings/billing");
    await page.getByRole("button", { name: "Request refund" }).first().click();
    await expect(page.getByText(/reviewed by a platform operator/i)).toBeVisible();
    await page.getByRole("button", { name: "Submit refund request" }).click();

    await expect(page.getByText(/submitted for review/i)).toBeAttached();
    await expect(page.getByText("Requested").first()).toBeVisible();
    expect(state.refundSubmissions).toBe(1);
    expect(state.refundStatus).toBe("REQUESTED");
  });

  test("renders the tenant billing experience in Arabic RTL", async ({ page }) => {
    await installTenantBillingFixtures(page);
    await page.context().addCookies([{ name: "documind-locale", value: "ar", domain: "localhost", path: "/" }]);
    await page.goto("/dashboard/settings/billing");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "الفوترة والفواتير" })).toBeVisible();
    await expect(page.getByRole("button", { name: "تغيير الخطة" })).toBeVisible();
  });

  test("allows a platform reviewer to inspect and confirm a refund using local DTOs", async ({ page }) => {
    const state = await installPlatformRefundFixtures(page);
    await page.goto("/super-admin/refunds");
    await expect(page.getByRole("heading", { name: "Refund reviews" })).toBeVisible();
    await expect(page.getByText("Tenant A")).toBeVisible();
    await page.getByRole("button", { name: "Confirm refund" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirm refund" }).click();
    await expect.poll(() => state.confirmations).toBe(1);
    await expect(page.getByText("Refund action saved.")).toBeAttached();
  });
});

async function installTenantBillingFixtures(page: Page) {
  const state = {
    invoicePages: [] as number[],
    portalFlow: "",
    planChangeSubmissions: 0,
    lastIdempotencyKey: "",
    operationReads: 0,
    refundSubmissions: 0,
    refundStatus: "",
  };
  let refunds: unknown[] = [];
  let pendingOperation = false;

  await page.route(`${API_URL}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/auth/refresh") return json(route, { success: true, data: { tokens: { accessToken: "browser-fixture-token" } } });
    if (url.pathname === "/auth/me") return json(route, session("COMPANY_ADMIN"));
    if (url.pathname === "/permissions/me") return json(route, permissions(["billing:read", "billing:manage", "company-settings:read"]));
    if (url.pathname === "/billing/summary") return json(route, {
      success: true,
      data: { ...summary, pendingOperation: pendingOperation ? operation("PLAN_CHANGE", "PROVIDER_PENDING") : null },
    });
    if (url.pathname === "/billing/invoices") {
      const pageNumber = Number(url.searchParams.get("page") ?? "1");
      state.invoicePages.push(pageNumber);
      return json(route, { success: true, data: { invoices: [invoice], pagination: { page: pageNumber, pageSize: 10, totalRecords: 20, totalPages: 2 } } });
    }
    if (url.pathname === `/billing/invoices/${invoiceId}/links`) return json(route, { success: true, data: { hostedInvoiceUrl: "https://billing.example.test/invoice-document", invoicePdfUrl: null, receiptUrl: null } });
    if (url.pathname === "/public/packages") return json(route, { success: true, data: [{ id: "64b000000000000000000008", name: "Enterprise", code: "enterprise", description: "Enterprise package", monthlyPrice: 70, annualPrice: 700, monthlyPriceCents: 7000, annualPriceCents: 70000, currency: "USD", trialDays: 0, entitlements: { employees: 25, documents: 2000, storageMb: 8192, queriesPerMonth: 10000 }, supportedModels: ["basic"], analyticsLevel: "advanced", retentionDays: 90, supportLevel: "priority" }] });
    if (url.pathname === "/billing/subscription-change-previews") return json(route, { success: true, data: { id: "64b000000000000000000009", currentPackage: { id: summary.packageId._id, name: "Pro", code: "pro", version: 2 }, targetPackage: { id: "64b000000000000000000008", name: "Enterprise", code: "enterprise", version: 3 }, billingInterval: "monthly", currency: "USD", amountDueMinor: 5000, amountCreditMinor: 0, effectiveAt: "2026-07-29T12:00:00.000Z", nextBillingDate: "2026-08-01T00:00:00.000Z", entitlementImpact: [{ field: "employees", current: 10, target: 25, delta: 15 }], expiresAt: "2026-07-29T12:15:00.000Z", subscriptionRevision: 3 } });
    if (url.pathname === "/billing/subscription-changes") {
      state.planChangeSubmissions += 1;
      pendingOperation = true;
      const body = request.postDataJSON() as { idempotencyKey: string };
      state.lastIdempotencyKey = body.idempotencyKey;
      return json(route, { success: true, data: { operation: operation("PLAN_CHANGE", "PROVIDER_PENDING"), replayed: false } });
    }
    if (url.pathname === `/billing/operations/${operationId}`) {
      state.operationReads += 1;
      if (state.operationReads > 1) pendingOperation = false;
      return json(route, { success: true, data: operation("PLAN_CHANGE", state.operationReads > 1 ? "CONFIRMED" : "PROVIDER_PENDING") });
    }
    if (url.pathname === "/billing/refund-requests" && request.method() === "POST") {
      state.refundSubmissions += 1;
      state.refundStatus = "REQUESTED";
      refunds = [refund("REQUESTED")];
      return json(route, { success: true, data: { refund: refunds[0], replayed: false } });
    }
    if (url.pathname === "/billing/refund-requests") return json(route, { success: true, data: { refunds, pagination: { page: 1, pageSize: 10, totalRecords: refunds.length, totalPages: refunds.length ? 1 : 0 } } });
    if (url.pathname === "/billing/portal-sessions") {
      state.portalFlow = (request.postDataJSON() as { flow: string }).flow;
      return json(route, { success: true, data: { url: "https://billing.example.test/payment-method", expiresAt: "2026-07-29T12:10:00.000Z" } });
    }
    return json(route, { success: false, error: { code: "NOT_FOUND", message: "Fixture route not found" } }, 404);
  });
  return state;
}

async function installPlatformRefundFixtures(page: Page) {
  const state = { confirmations: 0 };
  const requested = refund("REQUESTED");
  await page.route(`${API_URL}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/auth/refresh") return json(route, { success: true, data: { tokens: { accessToken: "platform-browser-fixture-token" } } });
    if (url.pathname === "/auth/me") return json(route, session("SUPER_ADMIN"));
    if (url.pathname === "/permissions/me") return json(route, permissions(["billing:read", "billing:refund-confirm"]));
    if (url.pathname === "/super-admin/refunds" && request.method() === "GET") return json(route, { success: true, data: { refunds: [requested], pagination: { page: 1, pageSize: 20, totalRecords: 1, totalPages: 1 } } });
    if (url.pathname === `/super-admin/refunds/${refundId}/confirm`) {
      state.confirmations += 1;
      return json(route, { success: true, data: { refund: refund("PROVIDER_PENDING"), operation: operation("REFUND", "PROVIDER_PENDING"), replayed: false } });
    }
    if (url.pathname === `/super-admin/refunds/${refundId}`) return json(route, { success: true, data: requested });
    return json(route, { success: false, error: { code: "NOT_FOUND", message: "Fixture route not found" } }, 404);
  });
  return state;
}

function session(role: "COMPANY_ADMIN" | "SUPER_ADMIN") {
  return { success: true, data: { user: { id: userId, tenantId, name: "Billing Reviewer", email: "reviewer@example.test", role, status: "active", emailVerified: true }, tenant: { id: tenantId, name: role === "SUPER_ADMIN" ? "Platform" : "Tenant A", slug: role === "SUPER_ADMIN" ? "documind.ai" : "tenant-a", status: "active", plan: "pro" } } };
}

function permissions(values: string[]) {
  return { success: true, data: { permissions: values, grants: Object.fromEntries(values.map((value) => [value, { source: "base-role", scope: null }])), baseRole: values.includes("billing:refund-confirm") ? "SUPER_ADMIN" : "COMPANY_ADMIN", customRoleId: null, customRoleState: "none", roleVersion: null } };
}

function operation(type: string, status: "PROVIDER_PENDING" | "CONFIRMED") {
  return { id: operationId, type, status, requestedAt: "2026-07-29T12:00:00.000Z", confirmedAt: status === "CONFIRMED" ? "2026-07-29T12:00:10.000Z" : null, failedAt: null, retryCount: 0, failureCode: null, effectiveAt: null, cancellationType: null };
}

function refund(status: "REQUESTED" | "PROVIDER_PENDING") {
  return { id: refundId, tenantId, tenant: { id: tenantId, name: "Tenant A", slug: "tenant-a" }, invoiceId, invoiceNumber: "INV-2026-001", subscriptionId: summary.id, subscription: { id: summary.id, status: "ACTIVE", packageName: "Pro", packageCode: "pro", packageVersion: 2 }, amountMinor: 500, currency: "USD", refundableRemainingMinor: 750, refundedAmountMinor: 0, reservedRefundAmountMinor: 500, reason: "customer_request", requestedBy: { id: userId, name: "Company Admin", email: "admin@example.test" }, confirmedBy: status === "PROVIDER_PENDING" ? { id: "64b000000000000000000010", name: "Platform Reviewer", email: "platform@example.test" } : null, requestedAt: "2026-07-29T12:00:00.000Z", confirmedAt: status === "PROVIDER_PENDING" ? "2026-07-29T12:05:00.000Z" : null, rejectedAt: null, rejectionReason: null, status, providerPending: status === "PROVIDER_PENDING", failureCode: null, operationId, previousRefundSummary: { successfulCount: 0, successfulAmountMinor: 0, pendingCount: 0, pendingAmountMinor: 0 } };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}
