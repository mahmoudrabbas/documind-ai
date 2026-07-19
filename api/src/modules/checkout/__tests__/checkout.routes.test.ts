import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const routesSourceUrl = new URL("../checkout.routes.ts", import.meta.url);
const controllerSourceUrl = new URL("../checkout.controller.ts", import.meta.url);
const serviceSourceUrl = new URL("../checkout.service.ts", import.meta.url);
const validatorSourceUrl = new URL("../checkout.validator.ts", import.meta.url);

test("checkout routes require canonical billing permissions", async () => {
  const source = await readFile(routesSourceUrl, "utf8");
  assert.ok(
    source.includes("requirePermission(Permission.BILLING_MANAGE)"),
    "POST /checkout/sessions should require billing management",
  );
  assert.ok(
    source.includes("requirePermission(Permission.BILLING_READ)"),
    "checkout reads should require billing read",
  );
  assert.ok(
    source.includes("authenticate"),
    "Routes should require authentication",
  );
});

test("checkout routes exist for GET sessions and subscription status", async () => {
  const source = await readFile(routesSourceUrl, "utf8");
  assert.ok(
    source.includes('"/sessions"'),
    "GET sessions route exists",
  );
  assert.ok(
    source.includes('"/subscription"'),
    "GET subscription route exists",
  );
});

test("checkout controller creates checkout session", async () => {
  const source = await readFile(controllerSourceUrl, "utf8");
  assert.ok(
    source.includes("createCheckoutSession"),
    "Controller delegates to service",
  );
  assert.ok(
    source.includes("createCheckoutSchema"),
    "Controller validates with schema",
  );
});

test("checkout validator accepts packageId and billingInterval", async () => {
  const source = await readFile(validatorSourceUrl, "utf8");
  assert.ok(source.includes("packageId"), "Schema validates packageId");
  assert.ok(source.includes("billingInterval"), "Schema validates billingInterval");
  assert.ok(
    source.includes("monthly") && source.includes("annual"),
    "Schema accepts monthly and annual intervals",
  );
});

test("checkout service uses PaymentProvider interface", async () => {
  const source = await readFile(serviceSourceUrl, "utf8");
  assert.ok(
    source.includes("PaymentProvider"),
    "Service imports PaymentProvider type",
  );
  assert.ok(
    source.includes("provider.createCheckoutSession"),
    "Service calls provider.createCheckoutSession",
  );
  assert.ok(
    source.includes("provider.createCustomer"),
    "Service calls provider.createCustomer",
  );
});
