import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// ─── A. Normalization tests (pure function — no DB needed) ──────────────────

import {
  GLOBAL_SETTINGS_DEFAULTS,
  normalizeGlobalSettings,
} from "../global-settings.js";

function defaults() {
  return { ...GLOBAL_SETTINGS_DEFAULTS };
}

// A.1 Missing record resolves to complete defaults
test("normalization: missing record resolves to complete defaults", () => {
  const result = normalizeGlobalSettings({});
  assert.deepStrictEqual(result, defaults());
});

// A.2 Incomplete stored record preserves valid values and fills omitted fields
test("normalization: incomplete record preserves valid fields and fills omitted", () => {
  const result = normalizeGlobalSettings({
    maintenanceMode: true,
    supportEmail: "help@example.com",
  });
  assert.equal(result.supportEmail, "help@example.com");
  assert.equal(result.maintenanceMode, true);
  assert.equal(result.allowRegistrations, defaults().allowRegistrations);
  assert.equal(result.defaultTrialDays, defaults().defaultTrialDays);
  assert.equal(result.dataRetentionDays, defaults().dataRetentionDays);
});

// A.3 Unknown stored keys are removed from output
test("normalization: unknown stored keys are stripped from output", () => {
  const result = normalizeGlobalSettings({
    supportEmail: "",
    maintenanceMode: false,
    allowRegistrations: true,
    defaultTrialDays: 7,
    dataRetentionDays: 90,
    legacyField: "should-not-exist",
    anotherOldKey: 42,
  });
  const keys = Object.keys(result);
  assert.deepStrictEqual(keys.sort(), [
    "allowRegistrations",
    "dataRetentionDays",
    "defaultTrialDays",
    "maintenanceMode",
    "supportEmail",
  ]);
  assert.equal((result as unknown as Record<string, unknown>).legacyField, undefined);
  assert.equal((result as unknown as Record<string, unknown>).anotherOldKey, undefined);
});

// A.4 Invalid supportEmail falls back
test("normalization: invalid supportEmail falls back to default", () => {
  const invalidEmails = [
    "not-an-email",
    "missing-at-sign.com",
    "@no-local.com",
    "user@",
    123,
    true,
    null,
    undefined,
    [],
    {},
  ];
  for (const value of invalidEmails) {
    const result = normalizeGlobalSettings({ supportEmail: value });
    assert.equal(
      result.supportEmail,
      defaults().supportEmail,
      `fallback for supportEmail=${JSON.stringify(value)}`,
    );
  }
});

// A.5 Oversized supportEmail (>254 chars) falls back
test("normalization: oversized supportEmail falls back to default", () => {
  const longEmail = "a".repeat(245) + "@example.com";
  assert.ok(longEmail.length > 254, "email exceeds 254 chars");
  const result = normalizeGlobalSettings({ supportEmail: longEmail });
  assert.equal(result.supportEmail, defaults().supportEmail);
});

// A.6 Whitespace around a valid email is trimmed
test("normalization: whitespace around valid email is trimmed", () => {
  const result = normalizeGlobalSettings({
    supportEmail: "  admin@example.com  ",
  });
  assert.equal(result.supportEmail, "admin@example.com");
});

// A.7 Infinity, NaN, decimal, string and out-of-range trial days fall back
test("normalization: invalid defaultTrialDays falls back to default", () => {
  const badValues: Array<[unknown, string]> = [
    [Infinity, "Infinity"],
    [-Infinity, "-Infinity"],
    [NaN, "NaN"],
    [14.5, "decimal"],
    ["14", "string"],
    [-1, "negative"],
    [3651, "above max"],
    [999999, "very large"],
    [null, "null"],
    [true, "boolean"],
  ];
  for (const [value, label] of badValues) {
    const result = normalizeGlobalSettings({ defaultTrialDays: value });
    assert.equal(
      result.defaultTrialDays,
      defaults().defaultTrialDays,
      `fallback for defaultTrialDays=${label}`,
    );
  }
});

// A.8 Infinity, NaN, decimal, string and out-of-range retention days fall back
test("normalization: invalid dataRetentionDays falls back to default", () => {
  const badValues: Array<[unknown, string]> = [
    [Infinity, "Infinity"],
    [-Infinity, "-Infinity"],
    [NaN, "NaN"],
    [365.7, "decimal"],
    ["365", "string"],
    [0, "zero"],
    [-1, "negative"],
    [36501, "above max"],
    [null, "null"],
    [true, "boolean"],
  ];
  for (const [value, label] of badValues) {
    const result = normalizeGlobalSettings({ dataRetentionDays: value });
    assert.equal(
      result.dataRetentionDays,
      defaults().dataRetentionDays,
      `fallback for dataRetentionDays=${label}`,
    );
  }
});

// Valid boundary values are preserved
test("normalization: valid boundary trial days (0 and 3650) are preserved", () => {
  assert.equal(normalizeGlobalSettings({ defaultTrialDays: 0 }).defaultTrialDays, 0);
  assert.equal(normalizeGlobalSettings({ defaultTrialDays: 3650 }).defaultTrialDays, 3650);
});

test("normalization: valid boundary retention days (1 and 36500) are preserved", () => {
  assert.equal(normalizeGlobalSettings({ dataRetentionDays: 1 }).dataRetentionDays, 1);
  assert.equal(normalizeGlobalSettings({ dataRetentionDays: 36500 }).dataRetentionDays, 36500);
});

test("normalization: empty supportEmail is accepted", () => {
  assert.equal(normalizeGlobalSettings({ supportEmail: "" }).supportEmail, "");
});

test("normalization: booleans default correctly", () => {
  assert.equal(normalizeGlobalSettings({}).maintenanceMode, false);
  assert.equal(normalizeGlobalSettings({}).allowRegistrations, true);
  assert.equal(normalizeGlobalSettings({ maintenanceMode: "yes" }).maintenanceMode, false);
  assert.equal(normalizeGlobalSettings({ allowRegistrations: 1 }).allowRegistrations, true);
});

// ─── Source-contract assertions (supplemental, not runtime proof) ───────────

test("source-contract: global-settings.ts exports canonical types and constants", async () => {
  const src = await readFile(
    new URL("../global-settings.ts", import.meta.url),
    "utf8",
  );
  assert.ok(src.includes("export function normalizeGlobalSettings"), "exports normalizeGlobalSettings");
  assert.ok(src.includes("export const GLOBAL_SETTINGS_DEFAULTS"), "exports GLOBAL_SETTINGS_DEFAULTS");
  assert.ok(src.includes("export const GLOBAL_SETTINGS_KEY"), "exports GLOBAL_SETTINGS_KEY");
  assert.ok(src.includes("export interface GlobalSettings"), "exports GlobalSettings interface");
});

test("source-contract: global-settings normalization validates email format and max length", async () => {
  const src = await readFile(
    new URL("../global-settings.ts", import.meta.url),
    "utf8",
  );
  assert.ok(src.includes("EMAIL_REGEX"), "has email regex");
  assert.ok(src.includes("EMAIL_MAX_LENGTH"), "has email max length constant");
  assert.ok(src.includes("Number.isFinite"), "validates finite numbers");
  assert.ok(src.includes("Number.isInteger"), "validates integer numbers");
});

test("source-contract: platform service getSetting routes global_settings through getGlobalSettings", async () => {
  const src = await readFile(
    new URL("../platform.service.ts", import.meta.url),
    "utf8",
  );
  assert.ok(
    src.includes("getGlobalSettings") &&
      src.includes("GLOBAL_SETTINGS_KEY") &&
      src.includes("key === GLOBAL_SETTINGS_KEY"),
    "getSetting dispatches to getGlobalSettings for GLOBAL_SETTINGS_KEY",
  );
});

test("source-contract: platform service updateSetting uses normalizeGlobalSettings and GLOBAL_SETTINGS_KEY", async () => {
  const src = await readFile(
    new URL("../platform.service.ts", import.meta.url),
    "utf8",
  );
  assert.ok(
    src.includes("normalizeGlobalSettings") &&
      src.includes("key === GLOBAL_SETTINGS_KEY"),
    "updateSetting uses normalizeGlobalSettings and GLOBAL_SETTINGS_KEY",
  );
});

test("source-contract: platform controller uses globalSettingsPatchSchema for PATCH /settings", async () => {
  const src = await readFile(
    new URL("../platform.controller.ts", import.meta.url),
    "utf8",
  );
  assert.ok(src.includes("globalSettingsPatchSchema"), "imports globalSettingsPatchSchema");
  assert.ok(
    src.includes('parse(globalSettingsPatchSchema, req.body)') &&
      src.includes('"global_settings"'),
    "uses globalSettingsPatchSchema for global_settings update",
  );
});

test("source-contract: platform controller uses settingsBodySchema for AI configuration", async () => {
  const src = await readFile(
    new URL("../platform.controller.ts", import.meta.url),
    "utf8",
  );
  assert.ok(
    src.includes('parse(settingsBodySchema, req.body)') &&
      src.includes('"ai_configuration"'),
    "uses settingsBodySchema for ai_configuration (not globalSettingsPatchSchema)",
  );
});

test("source-contract: platform routes enforce COMPANY_SETTINGS_READ and COMPANY_SETTINGS_UPDATE", async () => {
  const src = await readFile(
    new URL("../platform.routes.ts", import.meta.url),
    "utf8",
  );
  assert.ok(
    src.includes("COMPANY_SETTINGS_READ") &&
      src.includes('"/settings"'),
    "GET /settings requires COMPANY_SETTINGS_READ",
  );
  assert.ok(
    src.includes("COMPANY_SETTINGS_UPDATE") &&
      src.includes("/settings"),
    "PATCH /settings requires COMPANY_SETTINGS_UPDATE",
  );
});

test("source-contract: global-settings cache is invalidated on update", async () => {
  const src = await readFile(
    new URL("../platform.service.ts", import.meta.url),
    "utf8",
  );
  assert.ok(src.includes("invalidateGlobalSettingsCache"), "imports cache invalidation");
  assert.ok(src.includes("key === GLOBAL_SETTINGS_KEY"), "only invalidates for GLOBAL_SETTINGS_KEY");
  assert.ok(src.includes("invalidateGlobalSettingsCache()"), "calls cache invalidation");
});

test("source-contract: validator exports GlobalSettings and GlobalSettingsPatch types", async () => {
  const src = await readFile(
    new URL("../platform.validator.ts", import.meta.url),
    "utf8",
  );
  assert.ok(src.includes("export type GlobalSettings"), "exports GlobalSettings type");
  assert.ok(src.includes("export type GlobalSettingsPatch"), "exports GlobalSettingsPatch type");
  assert.ok(src.includes("export const globalSettingsPatchSchema"), "exports globalSettingsPatchSchema");
  assert.ok(src.includes(".strict()"), "schema uses strict mode");
});
