import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function source(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("checkout and email routes use canonical tenant permissions", async () => {
  const [checkout, email] = await Promise.all([
    source("../checkout/checkout.routes.ts"),
    source("../email/email.routes.ts"),
  ]);

  assert.ok(checkout.includes("Permission.BILLING_MANAGE"));
  assert.ok(checkout.includes("Permission.BILLING_READ"));
  assert.doesNotMatch(checkout, /authorize\(/);
  assert.ok(email.includes("Permission.COMPANY_SETTINGS_READ"));
  assert.ok(email.includes("Permission.COMPANY_SETTINGS_UPDATE"));
  assert.doesNotMatch(email, /authorize\(/);
});

test("platform, reconciliation, jobs, and agents retain boundaries plus permissions", async () => {
  const [platform, reconciliation, jobs, agents, paymentAdmin] = await Promise.all([
    source("../platform/platform.routes.ts"),
    source("../reconciliation/reconciliation.routes.ts"),
    source("../jobs/jobs.routes.ts"),
    source("../agents/agents.routes.ts"),
    source("../payment-webhooks/payment-webhooks.admin.ts"),
  ]);

  for (const routeSource of [platform, reconciliation, jobs, agents, paymentAdmin]) {
    assert.ok(routeSource.includes("requirePermission("));
  }
  assert.ok(platform.includes("requirePlatformTenant"));
  assert.ok(reconciliation.includes("Permission.BILLING_READ"));
  assert.ok(jobs.includes("Permission.DOCUMENTS_OCR_PROCESS"));
  assert.ok(agents.includes("Permission.CHAT_CREATE"));
  assert.ok(agents.includes("Permission.CHAT_READ"));
  assert.ok(agents.includes("Permission.CHAT_DELETE"));
  assert.ok(paymentAdmin.includes("Permission.BILLING_MANAGE"));
});

test("changed domain services reauthorize persisted actors", async () => {
  const paths = [
    "../checkout/checkout.service.ts",
    "../email/email.service.ts",
    "../platform/platform.service.ts",
    "../admin/admin.service.ts",
    "../reconciliation/reconciliation.service.ts",
    "../jobs/jobs.service.ts",
    "../processing/processing.service.ts",
    "../agents/agents.service.ts",
    "../payment-webhooks/payment-webhooks.service.ts",
  ];
  const services = await Promise.all(paths.map(source));

  for (const [index, service] of services.entries()) {
    assert.match(
      service,
      /authorize(?:Tenant|Platform)Operation\(/,
      `${paths[index]} must enforce service authorization`,
    );
  }
});

test("customer jobs cannot enqueue arbitrary system or email work", async () => {
  const jobs = await source("../jobs/jobs.service.ts");
  assert.ok(jobs.includes('body.jobType !== "document.ocr"'));
  assert.ok(jobs.includes("tenantId: actor.tenantId"));
  assert.ok(jobs.includes("actorId: actor.actorId"));
});

test("Phase 3C audits keep settings values and queue payloads out of metadata", async () => {
  const [platform, jobs, email] = await Promise.all([
    source("../platform/platform.service.ts"),
    source("../jobs/jobs.service.ts"),
    source("../email/email.service.ts"),
  ]);

  assert.ok(platform.includes("changedFields: Object.keys(value).sort()"));
  assert.doesNotMatch(platform, /changes:\s*value/);
  assert.doesNotMatch(jobs, /metadata:\s*\{[^}]*payload/s);
  assert.doesNotMatch(email, /metadata:\s*\{[^}]*variables/s);
  assert.ok(email.includes(".select(\"-variables -recipientHash -idempotencyKey\")"));
  assert.ok(platform.includes("\"[REDACTED]\""));
});
