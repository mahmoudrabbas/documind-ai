import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const adminSourceUrl = new URL("../payment-webhooks.admin.ts", import.meta.url);
const serviceSourceUrl = new URL("../payment-webhooks.service.ts", import.meta.url);
const billingServiceUrl = new URL("../../../../../app/src/services/billing.service.ts", import.meta.url);

async function source(url: URL): Promise<string> {
  return readFile(url, "utf8");
}

test("admin routes use canonical /payment-events paths (no /admin prefix)", async () => {
  const src = await source(adminSourceUrl);
  assert.ok(
    src.includes('router.get("/payment-events"'),
    "GET route should be /payment-events (not /admin/payment-events)",
  );
  assert.ok(
    src.includes('router.post("/payment-events/:eventId/reprocess"'),
    "POST reprocess route should be /payment-events/:eventId/reprocess",
  );
  assert.doesNotMatch(
    src,
    /\/admin\/payment-events/,
    "Must not contain redundant /admin/payment-events path",
  );
});

test("admin routes require authentication and platform tenant", async () => {
  const src = await source(adminSourceUrl);
  assert.ok(
    src.includes("authenticate"),
    "Routes must require authentication middleware",
  );
  assert.ok(
    src.includes("requirePlatformTenant"),
    "Routes must require platform tenant middleware",
  );
});

test("GET /payment-events requires BILLING_READ permission", async () => {
  const src = await source(adminSourceUrl);
  assert.ok(
    src.includes("Permission.BILLING_READ"),
    "List endpoint must require BILLING_READ permission",
  );
});

test("POST /payment-events/:eventId/reprocess requires BILLING_MANAGE permission", async () => {
  const src = await source(adminSourceUrl);
  assert.ok(
    src.includes("Permission.BILLING_MANAGE"),
    "Reprocess endpoint must require BILLING_MANAGE permission",
  );
});

test("GET /payment-events supports pagination parameters", async () => {
  const src = await source(adminSourceUrl);
  assert.ok(
    src.includes("req.query.page"),
    "Must read page from query params",
  );
  assert.ok(
    src.includes("req.query.pageSize"),
    "Must read pageSize from query params",
  );
  assert.ok(
    src.includes("Math.max(1"),
    "Page must be clamped to minimum 1",
  );
  assert.ok(
    src.includes("Math.min(100"),
    "PageSize must be clamped to maximum 100",
  );
});

test("GET /payment-events supports status and eventType filters", async () => {
  const src = await source(adminSourceUrl);
  assert.ok(
    src.includes("req.query.status"),
    "Must read status filter from query params",
  );
  assert.ok(
    src.includes("req.query.eventType"),
    "Must read eventType filter from query params",
  );
});

test("GET /payment-events delegates to listPaymentEvents service", async () => {
  const src = await source(adminSourceUrl);
  assert.ok(
    src.includes("listPaymentEvents"),
    "Must call listPaymentEvents service function",
  );
});

test("POST /payment-events/:eventId/reprocess delegates to reprocessEvent service", async () => {
  const src = await source(adminSourceUrl);
  assert.ok(
    src.includes("reprocessEvent"),
    "Must call reprocessEvent service function",
  );
});

test("GET /payment-events returns success response contract", async () => {
  const src = await source(adminSourceUrl);
  assert.ok(
    src.includes('{ success: true, data: result }'),
    "Must return { success: true, data: result } response",
  );
});

test("POST /payment-events/:eventId/reprocess returns success response contract", async () => {
  const src = await source(adminSourceUrl);
  assert.ok(
    src.includes('{ reprocessed: true }'),
    "Must return { reprocessed: true } in response data",
  );
});

test("reprocess endpoint safely extracts eventId from params", async () => {
  const src = await source(adminSourceUrl);
  assert.ok(
    src.includes("Array.isArray(req.params.eventId)"),
    "Must handle eventId as potential array (Express multi-value param safety)",
  );
});

test("admin routes delegate to operationContext for audit actor", async () => {
  const src = await source(adminSourceUrl);
  assert.ok(
    src.includes("operationContext(req)"),
    "Both routes must pass operationContext to service calls",
  );
  assert.ok(
    src.includes("requireAuthenticatedAuditActor"),
    "operationContext must use requireAuthenticatedAuditActor",
  );
});

test("service enforces BILLING_READ authorization for listing", async () => {
  const src = await source(serviceSourceUrl);
  assert.ok(
    src.includes("BILLING_READ"),
    "Service must authorize BILLING_READ for listPaymentEvents",
  );
});

test("service enforces BILLING_MANAGE authorization for reprocessing", async () => {
  const src = await source(serviceSourceUrl);
  assert.ok(
    src.includes("BILLING_MANAGE"),
    "Service must authorize BILLING_MANAGE for reprocessEvent",
  );
});

test("service uses authorizePlatformOperation for domain authorization", async () => {
  const src = await source(serviceSourceUrl);
  assert.ok(
    src.includes("authorizePlatformOperation("),
    "Service must use authorizePlatformOperation for domain-level authorization",
  );
});

test("frontend billing service calls /super-admin/payment-events (not /admin/payment-events)", async () => {
  const src = await source(billingServiceUrl);
  assert.ok(
    src.includes("/super-admin/payment-events"),
    "Frontend must call /super-admin/payment-events endpoint",
  );
  assert.doesNotMatch(
    src,
    /\/admin\/payment-events/,
    "Frontend must not call the old /admin/payment-events endpoint",
  );
});

test("frontend billing service calls /super-admin/payment-events/:eventId/reprocess", async () => {
  const src = await source(billingServiceUrl);
  assert.ok(
    src.includes("/super-admin/payment-events/"),
    "Frontend reprocess call must use /super-admin/payment-events/ prefix",
  );
});

test("frontend listPaymentEvents supports pagination and filter params", async () => {
  const src = await source(billingServiceUrl);
  assert.ok(src.includes('"page"'), "Must support page parameter");
  assert.ok(src.includes('"pageSize"'), "Must support pageSize parameter");
  assert.ok(src.includes('"status"'), "Must support status filter");
  assert.ok(src.includes('"eventType"'), "Must support eventType filter");
});

test("frontend reprocessPaymentEvent uses POST method", async () => {
  const src = await source(billingServiceUrl);
  assert.ok(
    src.includes('method: "POST"'),
    "Reprocess call must use POST method",
  );
});
