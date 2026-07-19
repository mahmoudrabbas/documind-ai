import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("./platform.routes.ts", import.meta.url);
const validatorSourceUrl = new URL("./platform.validator.ts", import.meta.url);
const serviceSourceUrl = new URL("./platform.service.ts", import.meta.url);
const billingTypesUrl = new URL("../billing/billing.types.ts", import.meta.url);
const billingPackageServiceUrl = new URL("../billing/package.service.ts", import.meta.url);

test("every platform control-center route enforces platform tenant and permissions", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(
    source,
    /router\.use\(authenticate, requirePlatformTenant\)/,
  );
  assert.ok(source.includes("requirePermission(Permission.BILLING_MANAGE)"));
  assert.ok(source.includes("requirePermission(Permission.COMPANY_SETTINGS_UPDATE)"));
  for (const route of [
    "/overview",
    "/packages",
    "/subscriptions",
    "/users",
    "/usage",
    "/jobs",
    "/system-health",
    "/audit",
    "/ai-configuration",
    "/settings",
  ]) {
    assert.ok(source.includes(`"${route}`), `missing protected route ${route}`);
  }
});

// ─── FR-PAY-001: Package creation with granular entitlements ─────────────────

test("platform validator packageBodySchema accepts FR-PAY-001 granular entitlement fields", async () => {
  const source = await readFile(validatorSourceUrl, "utf8");

  // FR-PAY-001 requires: employees, admins, documents, storageMb, fileSizeMb,
  //   queriesPerMonth, tokensPerMonth, ocrPagesPerMonth
  assert.ok(source.includes("employees:"), "schema validates employees");
  assert.ok(source.includes("admins:"), "schema validates admins");
  assert.ok(source.includes("documents:"), "schema validates documents");
  assert.ok(source.includes("storageMb:"), "schema validates storageMb");
  assert.ok(source.includes("fileSizeMb:"), "schema validates fileSizeMb");
  assert.ok(source.includes("queriesPerMonth:"), "schema validates queriesPerMonth");
  assert.ok(source.includes("tokensPerMonth:"), "schema validates tokensPerMonth");
  assert.ok(source.includes("ocrPagesPerMonth:"), "schema validates ocrPagesPerMonth");

  // FR-PAY-001 also requires: annualPrice, trialDays, visibility
  assert.ok(source.includes("annualPrice:"), "schema validates annualPrice");
  assert.ok(source.includes("trialDays:"), "schema validates trialDays");
  assert.ok(source.includes("visibility:"), "schema validates visibility");
  assert.ok(source.includes("supportedModels:"), "schema validates supportedModels");
  assert.ok(source.includes("analyticsLevel:"), "schema validates analyticsLevel");
  assert.ok(source.includes("retentionDays:"), "schema validates retentionDays");
  assert.ok(source.includes("supportLevel:"), "schema validates supportLevel");
});

// ─── FR-PAY-001: Platform createPackage delegates to billing package.service ─

test("platform.service.ts createPackage delegates to billing PackageService.createPackage", async () => {
  const source = await readFile(serviceSourceUrl, "utf8");

  // The platform service should delegate the actual package creation to the
  // billing domain's PackageService.createPackage
  assert.ok(
    source.includes('PackageService.createPackage(input'),
    "platform createPackage delegates to billing PackageService",
  );
  assert.ok(
    source.includes('annualPrice') || source.includes('annualPrice'),
    "FR-PAY-001 annualPrice passed through",
  );
  assert.ok(
    source.includes('trialDays') || source.includes('trialDays'),
    "FR-PAY-001 trialDays passed through",
  );
});

// ─── Package update bumps version ────────────────────────────────────────────

test("platform.service.ts updatePackage version bumps after field changes", async () => {
  const source = await readFile(serviceSourceUrl, "utf8");

  // updatePackage should call PackageService.createVersion to bump the version
  assert.ok(
    source.includes("PackageService.createVersion("),
    "updatePackage bumps version via PackageService.createVersion",
  );
  assert.ok(
    source.includes("versionBumped: true"),
    "updatePackage returns versionBumped: true",
  );
});

test("billing package.service.ts createPackage sets version=1 with initial snapshot", async () => {
  const source = await readFile(billingPackageServiceUrl, "utf8");

  assert.ok(
    source.includes("version = 1"),
    "new packages start at version 1",
  );
  assert.ok(
    source.includes("versions:"),
    "package has versions array",
  );
});

test("billing package.service.ts createVersion bumps version and returns versionBumped", async () => {
  const source = await readFile(billingPackageServiceUrl, "utf8");

  assert.ok(
    source.includes("pkg.version += 1"),
    "createVersion increments version by 1",
  );
  assert.ok(
    source.includes("versionBumped: true"),
    "createVersion returns versionBumped: true",
  );
});

// ─── FR-PAY-004: Subscription 9-state lifecycle ──────────────────────────────

test("billing.types.ts defines all 9 subscription statuses", async () => {
  const source = await readFile(billingTypesUrl, "utf8");

  const expectedStatuses = [
    "TRIALING",
    "INCOMPLETE",
    "ACTIVE",
    "PAST_DUE",
    "PAUSED",
    "CANCEL_AT_PERIOD_END",
    "CANCELED",
    "EXPIRED",
    "UNPAID",
  ];

  for (const status of expectedStatuses) {
    assert.ok(
      source.includes(`"${status}"`),
      `billing types define status "${status}"`,
    );
  }
});

test("subscription.service.ts LEGAL_TRANSITIONS defines state machine for all 9 statuses", async () => {
  const subServiceSource = await readFile(
    new URL("../billing/subscription.service.ts", import.meta.url),
    "utf8",
  );

  const bareKeys = [
    "TRIALING:",
    "INCOMPLETE:",
    "ACTIVE:",
    "PAST_DUE:",
    "PAUSED:",
    "CANCELED:",
    "EXPIRED:",
    "UNPAID:",
  ];
  for (const key of bareKeys) {
    assert.ok(
      subServiceSource.includes(key),
      `LEGAL_TRANSITIONS has key for ${key.replace(":", "")}`,
    );
  }
  assert.ok(
    subServiceSource.includes('"CANCEL_AT_PERIOD_END"'),
    'LEGAL_TRANSITIONS has key for CANCEL_AT_PERIOD_END',
  );

  // CANCELED is terminal (empty transition array)
  assert.ok(
    subServiceSource.includes("CANCELED: []"),
    "CANCELED is a terminal state (no legal transitions)",
  );
});

test("platform route source registers PATCH /subscriptions/:tenantId", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.ok(
    source.includes('/subscriptions/:tenantId"'),
    "PATCH /subscriptions/:tenantId registered",
  );
});

test("subscription.model.ts SubscriptionStatus enum has all 9 values", async () => {
  const modelSource = await readFile(
    new URL("../../db/models/subscription.model.ts", import.meta.url),
    "utf8",
  );

  const expectedStatuses = [
    '"TRIALING"',
    '"INCOMPLETE"',
    '"ACTIVE"',
    '"PAST_DUE"',
    '"PAUSED"',
    '"CANCEL_AT_PERIOD_END"',
    '"CANCELED"',
    '"EXPIRED"',
    '"UNPAID"',
  ];

  for (const status of expectedStatuses) {
    assert.ok(
      modelSource.includes(status),
      `subscription model enum includes ${status}`,
    );
  }
});
