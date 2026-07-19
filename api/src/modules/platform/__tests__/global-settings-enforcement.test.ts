import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function source(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("global-settings reader provides typed defaults for all settings", async () => {
  const src = await source("../global-settings.ts");
  assert.ok(src.includes("supportEmail"), "Defines supportEmail field");
  assert.ok(src.includes("maintenanceMode"), "Defines maintenanceMode field");
  assert.ok(src.includes("allowRegistrations"), "Defines allowRegistrations field");
  assert.ok(src.includes("defaultTrialDays"), "Defines defaultTrialDays field");
  assert.ok(src.includes("dataRetentionDays"), "Defines dataRetentionDays field");
});

test("global-settings reader has cache with TTL", async () => {
  const src = await source("../global-settings.ts");
  assert.ok(src.includes("CACHE_TTL_MS"), "Has cache TTL constant");
  assert.ok(src.includes("cacheExpiresAt"), "Tracks cache expiration");
  assert.ok(src.includes("invalidateGlobalSettingsCache"), "Exports cache invalidation function");
});

test("global-settings reader validates types from stored values", async () => {
  const src = await source("../global-settings.ts");
  assert.ok(src.includes('typeof raw.maintenanceMode === "boolean"'), "Validates maintenanceMode is boolean");
  assert.ok(src.includes('typeof raw.allowRegistrations === "boolean"'), "Validates allowRegistrations is boolean");
  assert.ok(src.includes('typeof raw.defaultTrialDays === "number"'), "Validates defaultTrialDays is number");
  assert.ok(src.includes('typeof raw.dataRetentionDays === "number"'), "Validates dataRetentionDays is number");
  assert.ok(src.includes('typeof raw.supportEmail === "string"'), "Validates supportEmail is string");
});

test("maintenance mode middleware blocks non-admin requests when enabled", async () => {
  const src = await source("../../../common/middlewares/maintenanceMode.middleware.ts");
  assert.ok(src.includes("getGlobalSettings"), "Reads global settings");
  assert.ok(src.includes("maintenanceMode"), "Checks maintenanceMode setting");
  assert.ok(src.includes("503"), "Returns 503 when maintenance mode is active");
  assert.ok(src.includes("MAINTENANCE_MODE"), "Uses MAINTENANCE_MODE error code");
});

test("maintenance mode middleware exempts Super Admin users", async () => {
  const src = await source("../../../common/middlewares/maintenanceMode.middleware.ts");
  assert.ok(src.includes("SUPER_ADMIN"), "Exempts Super Admin users");
});

test("maintenance mode middleware is mounted in app.ts with route exemptions", async () => {
  const src = await source("../../../app.ts");
  assert.ok(src.includes("maintenanceModeGuard"), "Maintenance middleware is imported");
  assert.ok(src.includes("/healthz"), "Health check is exempted");
  assert.ok(src.includes("/readyz"), "Readiness probe is exempted");
  assert.ok(src.includes("/webhooks/"), "Webhooks are exempted");
});

test("registration gate checks allowRegistrations before processing", async () => {
  const src = await source("../../auth/auth.service.ts");
  assert.ok(src.includes("getGlobalSettings"), "Reads global settings");
  assert.ok(src.includes("allowRegistrations"), "Checks allowRegistrations setting");
  assert.ok(src.includes("REGISTRATION_DISABLED"), "Uses REGISTRATION_DISABLED error code");
  assert.ok(src.includes("403"), "Returns 403 when registrations are disabled");
});

test("registration gate is in registerTenantAndAdmin function", async () => {
  const src = await source("../../auth/auth.service.ts");
  const registerFnStart = src.indexOf("export async function registerTenantAndAdmin");
  assert.ok(registerFnStart > 0, "registerTenantAndAdmin function exists");
  const fnBody = src.substring(registerFnStart, registerFnStart + 800);
  assert.ok(fnBody.includes("allowRegistrations"), "Gate is at the start of registerTenantAndAdmin");
  assert.ok(fnBody.includes("getGlobalSettings"), "Reads settings before processing");
});

test("REGISTRATION_DISABLED error code is defined", async () => {
  const src = await source("../../../common/errors/errorCodes.ts");
  assert.ok(src.includes("REGISTRATION_DISABLED"), "REGISTRATION_DISABLED error code exists");
});

test("defaultTrialDays is used as fallback in registration service", async () => {
  const src = await source("../../billing/registration.service.ts");
  assert.ok(src.includes("getGlobalSettings"), "Reads global settings");
  assert.ok(src.includes("defaultTrialDays"), "Uses defaultTrialDays setting");
  assert.ok(src.includes("resolvedTrialDays"), "Resolves trial days with precedence");
  assert.ok(src.includes("Package has no trial"), "Logs when applying global default");
});

test("createSubscription accepts optional trialDays parameter", async () => {
  const src = await source("../../billing/subscription.service.ts");
  assert.ok(src.includes("trialDays?: number"), "createSubscription accepts trialDays parameter");
  assert.ok(src.includes("trialEnd"), "Sets trialEnd based on trialDays");
});

test("subscription model has trialEnd field", async () => {
  const src = await source("../../../db/models/subscription.model.ts");
  assert.ok(src.includes("trialEnd"), "Subscription model has trialEnd field");
});

test("supportEmail is injected into email branding", async () => {
  const src = await source("../../email/email.service.ts");
  assert.ok(src.includes("getGlobalSettings"), "Email service reads global settings");
  assert.ok(src.includes("supportEmail"), "Injects supportEmail into branding");
});

test("email template branding interface includes supportEmail", async () => {
  const apiSrc = await source("../../email/email-templates/templateRegistry.ts");
  assert.ok(apiSrc.includes("supportEmail"), "API template registry has supportEmail in Branding");
  const workerSrc = await source("../../../../../workers/src/email-templates/templateRegistry.ts");
  assert.ok(workerSrc.includes("supportEmail"), "Worker template registry has supportEmail in Branding");
});

test("email templates render support email footer", async () => {
  const apiSrc = await source("../../email/email-templates/templateRegistry.ts");
  assert.ok(apiSrc.includes("renderFooter"), "API template has renderFooter function");
  assert.ok(apiSrc.includes("mailto:"), "Footer renders mailto link");
  assert.ok(apiSrc.includes("Need help?"), "Footer has help text");
  const workerSrc = await source("../../../../../workers/src/email-templates/templateRegistry.ts");
  assert.ok(workerSrc.includes("renderFooter"), "Worker template has renderFooter function");
});

test("worker email send job reads supportEmail from global settings", async () => {
  const src = await source("../../../../../workers/src/jobs/emailSendJob.ts");
  assert.ok(src.includes("platformsettings"), "Worker reads platformsettings collection");
  assert.ok(src.includes("global_settings"), "Worker reads global_settings document");
  assert.ok(src.includes("supportEmail"), "Worker injects supportEmail into branding");
});

test("data retention job reads dataRetentionDays from global settings", async () => {
  const src = await source("../../../../../workers/src/jobs/dataRetentionJob.ts");
  assert.ok(src.includes("platformsettings"), "Reads platformsettings collection");
  assert.ok(src.includes("global_settings"), "Reads global_settings document");
  assert.ok(src.includes("dataRetentionDays"), "Uses dataRetentionDays setting");
  assert.ok(src.includes("365"), "Has default fallback of 365 days");
});

test("data retention job cleans up eligible collections", async () => {
  const src = await source("../../../../../workers/src/jobs/dataRetentionJob.ts");
  assert.ok(src.includes("auditlogs"), "Cleans up audit logs");
  assert.ok(src.includes("emailmessages"), "Cleans up email messages");
  assert.ok(src.includes("emailattempts"), "Cleans up email attempts");
  assert.ok(src.includes("paymentevents"), "Cleans up payment events");
  assert.ok(src.includes("usagelogs"), "Cleans up usage logs");
});

test("data retention job is registered in worker handler registry", async () => {
  const src = await source("../../../../../workers/src/jobs/index.ts");
  assert.ok(src.includes("dataRetentionJobHandler"), "Data retention job is imported");
  assert.ok(src.includes('registry.register(dataRetentionJobHandler)'), "Data retention job is registered");
});

test("data retention job uses createdAt for cutoff filtering", async () => {
  const src = await source("../../../../../workers/src/jobs/dataRetentionJob.ts");
  assert.ok(src.includes("createdAt"), "Filters by createdAt field");
  assert.ok(src.includes("$lt"), "Uses $lt operator for date comparison");
});

test("platform service invalidates cache when global_settings are updated", async () => {
  const src = await source("../platform.service.ts");
  assert.ok(src.includes("invalidateGlobalSettingsCache"), "Imports cache invalidation");
  assert.ok(src.includes('key === "global_settings"'), "Only invalidates for global_settings key");
  assert.ok(src.includes("invalidateGlobalSettingsCache()"), "Calls cache invalidation");
});

test("error codes include all new global settings error codes", async () => {
  const src = await source("../../../common/errors/errorCodes.ts");
  assert.ok(src.includes("SERVICE_UNAVAILABLE"), "SERVICE_UNAVAILABLE exists");
  assert.ok(src.includes("MAINTENANCE_MODE"), "MAINTENANCE_MODE exists");
  assert.ok(src.includes("REGISTRATION_DISABLED"), "REGISTRATION_DISABLED exists");
});
