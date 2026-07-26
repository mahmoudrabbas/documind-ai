import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function source(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

// ─── Source-contract: global-settings.ts structure ───────────────────────────

test("source-contract: global-settings reader provides typed defaults for all settings", async () => {
  const src = await source("../global-settings.ts");
  assert.ok(src.includes("supportEmail"), "Defines supportEmail field");
  assert.ok(src.includes("maintenanceMode"), "Defines maintenanceMode field");
  assert.ok(src.includes("allowRegistrations"), "Defines allowRegistrations field");
  assert.ok(src.includes("defaultTrialDays"), "Defines defaultTrialDays field");
  assert.ok(src.includes("dataRetentionDays"), "Defines dataRetentionDays field");
});

test("source-contract: global-settings reader has cache with TTL", async () => {
  const src = await source("../global-settings.ts");
  assert.ok(src.includes("CACHE_TTL_MS"), "Has cache TTL constant");
  assert.ok(src.includes("cacheExpiresAt"), "Tracks cache expiration");
  assert.ok(src.includes("invalidateGlobalSettingsCache"), "Exports cache invalidation function");
});

test("source-contract: global-settings reader validates types from stored values", async () => {
  const src = await source("../global-settings.ts");
  assert.ok(src.includes("Number.isFinite"), "Validates finite numbers");
  assert.ok(src.includes("Number.isInteger"), "Validates integer numbers");
  assert.ok(src.includes("EMAIL_REGEX"), "Has email regex for validation");
  assert.ok(src.includes("EMAIL_MAX_LENGTH"), "Has email max length constant");
});

// ─── Source-contract: maintenance mode middleware ────────────────────────────

test("source-contract: maintenance mode middleware blocks non-admin requests when enabled", async () => {
  const src = await source("../../../common/middlewares/maintenanceMode.middleware.ts");
  assert.ok(src.includes("getGlobalSettings"), "Reads global settings");
  assert.ok(src.includes("maintenanceMode"), "Checks maintenanceMode setting");
  assert.ok(src.includes("503"), "Returns 503 when maintenance mode is active");
  assert.ok(src.includes("MAINTENANCE_MODE"), "Uses MAINTENANCE_MODE error code");
});

test("source-contract: maintenance mode middleware exempts Super Admin users", async () => {
  const src = await source("../../../common/middlewares/maintenanceMode.middleware.ts");
  assert.ok(src.includes("SUPER_ADMIN"), "Exempts Super Admin users");
});

test("source-contract: maintenance mode middleware is mounted in app.ts with route exemptions", async () => {
  const src = await source("../../../app.ts");
  assert.ok(src.includes("maintenanceModeGuard"), "Maintenance middleware is imported");
  assert.ok(src.includes("/healthz"), "Health check is exempted");
  assert.ok(src.includes("/readyz"), "Readiness probe is exempted");
  assert.ok(src.includes("/webhooks/"), "Webhooks are exempted");
});

// ─── Source-contract: registration gate ─────────────────────────────────────

test("source-contract: registration gate checks allowRegistrations before processing", async () => {
  const src = await source("../../auth/auth.service.ts");
  assert.ok(src.includes("getGlobalSettings"), "Reads global settings");
  assert.ok(src.includes("allowRegistrations"), "Checks allowRegistrations setting");
  assert.ok(src.includes("REGISTRATION_DISABLED"), "Uses REGISTRATION_DISABLED error code");
  assert.ok(src.includes("403"), "Returns 403 when registrations are disabled");
});

test("source-contract: registration gate is in registerTenantAndAdmin function", async () => {
  const src = await source("../../auth/auth.service.ts");
  const registerFnStart = src.indexOf("export async function registerTenantAndAdmin");
  assert.ok(registerFnStart > 0, "registerTenantAndAdmin function exists");
  const fnBody = src.substring(registerFnStart, registerFnStart + 800);
  assert.ok(fnBody.includes("allowRegistrations"), "Gate is at the start of registerTenantAndAdmin");
  assert.ok(fnBody.includes("getGlobalSettings"), "Reads settings before processing");
});

test("source-contract: REGISTRATION_DISABLED error code is defined", async () => {
  const src = await source("../../../common/errors/errorCodes.ts");
  assert.ok(src.includes("REGISTRATION_DISABLED"), "REGISTRATION_DISABLED error code exists");
});

// ─── Source-contract: trial days and subscriptions ──────────────────────────

test("source-contract: defaultTrialDays is used as fallback in registration service", async () => {
  const src = await source("../../billing/registration.service.ts");
  assert.ok(src.includes("getGlobalSettings"), "Reads global settings");
  assert.ok(src.includes("defaultTrialDays"), "Uses defaultTrialDays setting");
  assert.ok(src.includes("resolvedTrialDays"), "Resolves trial days with precedence");
  assert.ok(src.includes("Package has no trial"), "Logs when applying global default");
});

test("source-contract: createSubscription accepts optional trialDays parameter", async () => {
  const src = await source("../../billing/subscription.service.ts");
  assert.ok(src.includes("trialDays?: number"), "createSubscription accepts trialDays parameter");
  assert.ok(src.includes("trialEnd"), "Sets trialEnd based on trialDays");
});

test("source-contract: subscription model has trialEnd field", async () => {
  const src = await source("../../../db/models/subscription.model.ts");
  assert.ok(src.includes("trialEnd"), "Subscription model has trialEnd field");
});

// ─── Source-contract: email branding ────────────────────────────────────────

test("source-contract: supportEmail is injected into email branding", async () => {
  const src = await source("../../email/email.service.ts");
  assert.ok(src.includes("getGlobalSettings"), "Email service reads global settings");
  assert.ok(src.includes("supportEmail"), "Injects supportEmail into branding");
});

test("source-contract: email template branding interface includes supportEmail", async () => {
  const apiSrc = await source("../../email/email-templates/templateRegistry.ts");
  assert.ok(apiSrc.includes("supportEmail"), "API template registry has supportEmail in Branding");
  const workerSrc = await source("../../../../../workers/src/email-templates/templateRegistry.ts");
  assert.ok(workerSrc.includes("supportEmail"), "Worker template registry has supportEmail in Branding");
});

test("source-contract: email templates render support email footer", async () => {
  const apiSrc = await source("../../email/email-templates/templateRegistry.ts");
  assert.ok(apiSrc.includes("renderFooter"), "API template has renderFooter function");
  assert.ok(apiSrc.includes("mailto:"), "Footer renders mailto link");
  assert.ok(apiSrc.includes("Need help?"), "Footer has help text");
  const workerSrc = await source("../../../../../workers/src/email-templates/templateRegistry.ts");
  assert.ok(workerSrc.includes("renderFooter"), "Worker template has renderFooter function");
});

// ─── Source-contract: worker integration ────────────────────────────────────

test("source-contract: worker email send job reads supportEmail from global settings", async () => {
  const src = await source("../../../../../workers/src/jobs/emailSendJob.ts");
  assert.ok(src.includes("platformsettings"), "Worker reads platformsettings collection");
  assert.ok(src.includes("global_settings"), "Worker reads global_settings document");
  assert.ok(src.includes("supportEmail"), "Worker injects supportEmail into branding");
});

test("source-contract: data retention job reads dataRetentionDays from global settings", async () => {
  const src = await source("../../../../../workers/src/jobs/dataRetentionJob.ts");
  assert.ok(src.includes("platformsettings"), "Reads platformsettings collection");
  assert.ok(src.includes("global_settings"), "Reads global_settings document");
  assert.ok(src.includes("dataRetentionDays"), "Uses dataRetentionDays setting");
  assert.ok(src.includes("365"), "Has default fallback of 365 days");
});

test("source-contract: data retention job cleans up eligible collections", async () => {
  const src = await source("../../../../../workers/src/jobs/dataRetentionJob.ts");
  assert.ok(src.includes("auditlogs"), "Cleans up audit logs");
  assert.ok(src.includes("emailmessages"), "Cleans up email messages");
  assert.ok(src.includes("emailattempts"), "Cleans up email attempts");
  assert.ok(src.includes("paymentevents"), "Cleans up payment events");
  assert.ok(src.includes("usagelogs"), "Cleans up usage logs");
});

test("source-contract: data retention job is registered in worker handler registry", async () => {
  const src = await source("../../../../../workers/src/jobs/index.ts");
  assert.ok(src.includes("dataRetentionJobHandler"), "Data retention job is imported");
  assert.ok(src.includes('registry.register(dataRetentionJobHandler)'), "Data retention job is registered");
});

test("source-contract: data retention job uses createdAt for cutoff filtering", async () => {
  const src = await source("../../../../../workers/src/jobs/dataRetentionJob.ts");
  assert.ok(src.includes("createdAt"), "Filters by createdAt field");
  assert.ok(src.includes("$lt"), "Uses $lt operator for date comparison");
});

// ─── Source-contract: cache invalidation and error codes ────────────────────

test("source-contract: platform service invalidates cache when global_settings are updated", async () => {
  const src = await source("../platform.service.ts");
  assert.ok(src.includes("invalidateGlobalSettingsCache"), "Imports cache invalidation");
  assert.ok(src.includes("key === GLOBAL_SETTINGS_KEY"), "Only invalidates for GLOBAL_SETTINGS_KEY");
  assert.ok(src.includes("invalidateGlobalSettingsCache()"), "Calls cache invalidation");
});

test("source-contract: error codes include all new global settings error codes", async () => {
  const src = await source("../../../common/errors/errorCodes.ts");
  assert.ok(src.includes("SERVICE_UNAVAILABLE"), "SERVICE_UNAVAILABLE exists");
  assert.ok(src.includes("MAINTENANCE_MODE"), "MAINTENANCE_MODE exists");
  assert.ok(src.includes("REGISTRATION_DISABLED"), "REGISTRATION_DISABLED exists");
});

// ─── Source-contract: service merge and controller wiring ───────────────────

test("source-contract: platform service updateSetting merges partial global_settings with current", async () => {
  const src = await source("../platform.service.ts");
  assert.ok(src.includes("const normalized ="), "Reads and normalizes current settings");
  assert.ok(src.includes("finalValue = { ...normalized, ...value }"), "Merges patch into normalized current");
});

test("source-contract: platform controller uses globalSettingsPatchSchema for global settings update", async () => {
  const src = await source("../platform.controller.ts");
  assert.ok(src.includes("globalSettingsPatchSchema"), "Imports globalSettingsPatchSchema");
  assert.ok(
    src.includes('parse(globalSettingsPatchSchema, req.body)') &&
      src.includes('"global_settings"'),
    "Uses globalSettingsPatchSchema for global_settings update",
  );
});

test("source-contract: platform controller uses settingsBodySchema for ai_configuration update", async () => {
  const src = await source("../platform.controller.ts");
  assert.ok(
    src.includes('parse(settingsBodySchema, req.body)') &&
      src.includes('"ai_configuration"'),
    "Uses settingsBodySchema for ai_configuration (not globalSettingsPatchSchema)",
  );
});

test("source-contract: platform validator exports GlobalSettings and GlobalSettingsPatch types", async () => {
  const src = await source("../platform.validator.ts");
  assert.ok(src.includes("export type GlobalSettings"), "Exports GlobalSettings type");
  assert.ok(src.includes("export type GlobalSettingsPatch"), "Exports GlobalSettingsPatch type");
  assert.ok(src.includes("export const globalSettingsPatchSchema"), "Exports globalSettingsPatchSchema");
});

test("source-contract: global settings schema uses strict mode to reject unknown fields", async () => {
  const src = await source("../platform.validator.ts");
  const strictIndex = src.indexOf(".strict()");
  assert.ok(strictIndex > 0, "Schema uses .strict()");
});

test("source-contract: global settings schema validates supportEmail max length of 254", async () => {
  const src = await source("../platform.validator.ts");
  assert.ok(src.includes("max(254"), "Enforces 254 character max for supportEmail");
});

test("source-contract: global settings schema validates defaultTrialDays range 0-3650", async () => {
  const src = await source("../platform.validator.ts");
  assert.ok(src.includes("min(0") && src.includes("max(3650"), "defaultTrialDays range is 0-3650");
});

test("source-contract: global settings schema validates dataRetentionDays range 1-36500", async () => {
  const src = await source("../platform.validator.ts");
  assert.ok(src.includes("min(1") && src.includes("max(36500"), "dataRetentionDays range is 1-36500");
});

test("source-contract: normalizeGlobalSettings and GLOBAL_SETTINGS_DEFAULTS are exported", async () => {
  const src = await source("../global-settings.ts");
  assert.ok(src.includes("export function normalizeGlobalSettings"), "Exports normalizeGlobalSettings");
  assert.ok(src.includes("export const GLOBAL_SETTINGS_DEFAULTS"), "Exports GLOBAL_SETTINGS_DEFAULTS");
  assert.ok(src.includes("export const GLOBAL_SETTINGS_KEY"), "Exports GLOBAL_SETTINGS_KEY");
});

test("source-contract: getSetting routes global_settings through getGlobalSettings", async () => {
  const src = await source("../platform.service.ts");
  assert.ok(
    src.includes("getGlobalSettings") &&
      src.includes("GLOBAL_SETTINGS_KEY") &&
      src.includes('key === GLOBAL_SETTINGS_KEY'),
    "getSetting dispatches to getGlobalSettings for GLOBAL_SETTINGS_KEY",
  );
});

test("source-contract: updateSetting uses normalizeGlobalSettings from global-settings", async () => {
  const src = await source("../platform.service.ts");
  assert.ok(
    src.includes("normalizeGlobalSettings") &&
      src.includes("key === GLOBAL_SETTINGS_KEY"),
    "updateSetting uses normalizeGlobalSettings and GLOBAL_SETTINGS_KEY",
  );
});
