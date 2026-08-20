import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../../common/errors/AppError.js";
import {
  globalSettingsPatchSchema,
  idSchema,
  packageBodySchema,
  packageLifecycleBodySchema,
  packageUpdateSchema,
  parse,
  settingsBodySchema,
  subscriptionUpdateSchema,
  subscriptionProvisionSchema,
  subscriptionImpactQuerySchema,
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

test("platform package validation rejects non-finite, decimal integer, duplicate model, and unknown nested values", () => {
  const base = {
    name: "Professional",
    code: "professional",
    monthlyPrice: 49,
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
  };
  assert.throws(() => parse(packageBodySchema, { ...base, monthlyPrice: Number.NaN }), AppError);
  assert.throws(() => parse(packageBodySchema, { ...base, monthlyPrice: Number.POSITIVE_INFINITY }), AppError);
  assert.throws(() => parse(packageBodySchema, { ...base, trialDays: 1.5 }), AppError);
  assert.throws(() => parse(packageBodySchema, { ...base, supportedModels: ["basic", "basic"] }), AppError);
  assert.throws(() => parse(packageBodySchema, {
    ...base,
    entitlements: { ...base.entitlements, hidden: 1 },
  }), AppError);
});

test("package version and lifecycle validation enforce immutable code, expected version, and trimmed reason", () => {
  assert.throws(
    () => parse(packageUpdateSchema, { expectedVersion: 1, code: "renamed" }),
    AppError,
  );
  assert.throws(
    () => parse(packageUpdateSchema, { name: "Updated" }),
    AppError,
  );
  assert.deepEqual(
    parse(packageLifecycleBodySchema, { expectedVersion: 2, reason: "  Commercial review  " }),
    { expectedVersion: 2, reason: "Commercial review" },
  );
  assert.throws(
    () => parse(packageLifecycleBodySchema, { expectedVersion: 2, reason: " x " }),
    AppError,
  );
});

test("subscription validation requires server-valid object identifiers", () => {
  assert.throws(
    () =>
      parse(subscriptionUpdateSchema, {
        packageId: "attacker-controlled",
        status: "active",
        expectedVersion: 1,
        reason: "Administrative review",
      }),
    AppError,
  );
  assert.throws(() => parse(idSchema, { id: "not-an-object-id" }), AppError);
});

test("subscription provisioning and update contracts are strict, trimmed, and explicit", () => {
  const packageId = "6a668bed76ec8e0569d93008";
  assert.deepEqual(parse(subscriptionProvisionSchema, {
    packageId, status: "trialing", expectedVersion: 0, reason: "  Approved by billing operations  ",
  }), { packageId, status: "TRIALING", expectedVersion: 0, reason: "Approved by billing operations" });
  assert.deepEqual(parse(subscriptionUpdateSchema, {
    packageId, expectedVersion: 3, reason: "  Package change approved  ",
  }), { packageId, expectedVersion: 3, reason: "Package change approved" });
  assert.throws(() => parse(subscriptionUpdateSchema, {
    expectedVersion: 3, reason: "Long enough but empty update",
  }), AppError);
  assert.throws(() => parse(subscriptionUpdateSchema, {
    status: "active", expectedVersion: 3, reason: "short", unknown: true,
  }), AppError);
  assert.deepEqual(parse(subscriptionImpactQuerySchema, {
    action: "update", packageId, expectedVersion: "3",
  }), { action: "update", packageId, expectedVersion: 3 });
});

test("platform settings accept AI configuration fields and reject nested secrets", () => {
  assert.deepEqual(
    parse(settingsBodySchema, {
      provider: "groq",
      chatModel: "llama-3.3-70b-versatile",
      embeddingModel: "jina-embeddings-v3",
      temperature: 0.2,
      maxOutputTokens: 2048,
    }),
    {
      provider: "groq",
      chatModel: "llama-3.3-70b-versatile",
      embeddingModel: "jina-embeddings-v3",
      temperature: 0.2,
      maxOutputTokens: 2048,
    },
  );
  assert.throws(
    () => parse(settingsBodySchema, { provider: { apiKey: "secret" } }),
    AppError,
  );
  assert.throws(
    () =>
      parse(settingsBodySchema, {
        provider: "openai",
        chatModel: "x",
        embeddingModel: "y",
        temperature: 0.2,
        maxOutputTokens: 2048,
      }),
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
