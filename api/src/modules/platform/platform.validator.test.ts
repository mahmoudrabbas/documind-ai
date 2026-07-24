import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../../common/errors/AppError.js";
import {
  globalSettingsPatchSchema,
  idSchema,
  packageBodySchema,
  packageUpdateSchema,
  parse,
  settingsBodySchema,
  subscriptionUpdateSchema,
} from "./platform.validator.js";

test("platform package validation accepts bounded entitlements and normalized codes", () => {
  const value = parse(packageBodySchema, {
    name: "Professional",
    code: "PRO-2026",
    description: "Production package",
    monthlyPrice: 49,
    currency: "usd",
    entitlements: {
      employees: 25,
      admins: 3,
      documents: 1000,
      storageMb: 10240,
      fileSizeMb: 20,
      queriesPerMonth: 5000,
      tokensPerMonth: 100000,
      ocrPagesPerMonth: 500,
    },
  });
  assert.equal(value.code, "pro-2026");
  assert.equal(value.currency, "USD");
});

test("platform package validation rejects unknown and invalid entitlement fields", () => {
  assert.throws(
    () =>
      parse(packageBodySchema, {
        name: "Bad",
        code: "bad",
        monthlyPrice: -1,
        entitlements: { employees: 0 },
        privilege: "SUPER_ADMIN",
      }),
    AppError,
  );
  assert.throws(() => parse(packageUpdateSchema, {}), AppError);
});

test("subscription validation requires server-valid object identifiers", () => {
  assert.throws(
    () =>
      parse(subscriptionUpdateSchema, {
        packageId: "attacker-controlled",
        status: "active",
      }),
    AppError,
  );
  assert.throws(() => parse(idSchema, { id: "not-an-object-id" }), AppError);
});

test("platform settings accept primitives and reject nested secrets", () => {
  assert.deepEqual(
    parse(settingsBodySchema, { maintenanceMode: true, trialDays: 14 }),
    {
      maintenanceMode: true,
      trialDays: 14,
    },
  );
  assert.throws(
    () => parse(settingsBodySchema, { provider: { apiKey: "secret" } }),
    AppError,
  );
});

// ─── Global Settings strict validation tests ────────────────────────────────

test("global settings patch accepts complete valid settings", () => {
  const value = parse(globalSettingsPatchSchema, {
    supportEmail: "admin@example.com",
    maintenanceMode: false,
    allowRegistrations: true,
    defaultTrialDays: 14,
    dataRetentionDays: 365,
  });
  assert.equal(value.supportEmail, "admin@example.com");
  assert.equal(value.maintenanceMode, false);
  assert.equal(value.allowRegistrations, true);
  assert.equal(value.defaultTrialDays, 14);
  assert.equal(value.dataRetentionDays, 365);
});

test("global settings patch accepts a valid partial patch", () => {
  const value = parse(globalSettingsPatchSchema, {
    maintenanceMode: true,
  });
  assert.equal(value.maintenanceMode, true);
  assert.equal(value.supportEmail, undefined);
  assert.equal(value.defaultTrialDays, undefined);
});

test("global settings patch accepts supportEmail as an empty string", () => {
  const value = parse(globalSettingsPatchSchema, {
    supportEmail: "",
  });
  assert.equal(value.supportEmail, "");
});

test("global settings patch trims supportEmail", () => {
  const value = parse(globalSettingsPatchSchema, {
    supportEmail: "  admin@example.com  ",
  });
  assert.equal(value.supportEmail, "admin@example.com");
});

test("global settings patch rejects invalid email", () => {
  assert.throws(
    () =>
      parse(globalSettingsPatchSchema, {
        supportEmail: "not-an-email",
      }),
    AppError,
  );
});

test("global settings patch rejects unknown fields", () => {
  assert.throws(
    () =>
      parse(globalSettingsPatchSchema, {
        maintenanceMode: true,
        unknownField: "value",
      }),
    AppError,
  );
});

test("global settings patch rejects empty object", () => {
  assert.throws(() => parse(globalSettingsPatchSchema, {}), AppError);
});

test("global settings patch rejects null values", () => {
  assert.throws(
    () =>
      parse(globalSettingsPatchSchema, {
        supportEmail: null,
      }),
    AppError,
  );
  assert.throws(
    () =>
      parse(globalSettingsPatchSchema, {
        maintenanceMode: null,
      }),
    AppError,
  );
  assert.throws(
    () =>
      parse(globalSettingsPatchSchema, {
        defaultTrialDays: null,
      }),
    AppError,
  );
});

test("global settings patch rejects string values for numeric settings", () => {
  assert.throws(
    () =>
      parse(globalSettingsPatchSchema, {
        defaultTrialDays: "14",
      }),
    AppError,
  );
  assert.throws(
    () =>
      parse(globalSettingsPatchSchema, {
        dataRetentionDays: "365",
      }),
    AppError,
  );
});

test("global settings patch rejects decimals for integer fields", () => {
  assert.throws(
    () =>
      parse(globalSettingsPatchSchema, {
        defaultTrialDays: 14.5,
      }),
    AppError,
  );
  assert.throws(
    () =>
      parse(globalSettingsPatchSchema, {
        dataRetentionDays: 365.7,
      }),
    AppError,
  );
});

test("global settings patch rejects negative defaultTrialDays", () => {
  assert.throws(
    () =>
      parse(globalSettingsPatchSchema, {
        defaultTrialDays: -1,
      }),
    AppError,
  );
});

test("global settings patch rejects zero dataRetentionDays", () => {
  assert.throws(
    () =>
      parse(globalSettingsPatchSchema, {
        dataRetentionDays: 0,
      }),
    AppError,
  );
});

test("global settings patch rejects values above configured maximums", () => {
  assert.throws(
    () =>
      parse(globalSettingsPatchSchema, {
        defaultTrialDays: 3651,
      }),
    AppError,
  );
  assert.throws(
    () =>
      parse(globalSettingsPatchSchema, {
        dataRetentionDays: 36501,
      }),
    AppError,
  );
  assert.throws(
    () =>
      parse(globalSettingsPatchSchema, {
        supportEmail: "a".repeat(255) + "@example.com",
      }),
    AppError,
  );
});

test("global settings patch rejects Infinity", () => {
  assert.throws(
    () =>
      parse(globalSettingsPatchSchema, {
        defaultTrialDays: Infinity,
      }),
    AppError,
  );
  assert.throws(
    () =>
      parse(globalSettingsPatchSchema, {
        dataRetentionDays: Infinity,
      }),
    AppError,
  );
});

test("global settings patch rejects NaN", () => {
  assert.throws(
    () =>
      parse(globalSettingsPatchSchema, {
        defaultTrialDays: NaN,
      }),
    AppError,
  );
});
