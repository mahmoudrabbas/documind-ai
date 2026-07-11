import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../../common/errors/AppError.js";
import {
  idSchema,
  packageBodySchema,
  packageUpdateSchema,
  parse,
  settingsBodySchema,
  subscriptionUpdateSchema,
} from "./platform.validator.js";

test("platform package validation accepts bounded limits and normalized codes", () => {
  const value = parse(packageBodySchema, {
    name: "Professional",
    code: "PRO-2026",
    description: "Production package",
    monthlyPrice: 49,
    currency: "usd",
    limits: {
      users: 25,
      documents: 1000,
      questionsPerMonth: 5000,
      storageMb: 10240,
    },
  });
  assert.equal(value.code, "pro-2026");
  assert.equal(value.currency, "USD");
});

test("platform package validation rejects unknown and invalid limit fields", () => {
  assert.throws(
    () =>
      parse(packageBodySchema, {
        name: "Bad",
        code: "bad",
        monthlyPrice: -1,
        limits: { users: 0 },
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
