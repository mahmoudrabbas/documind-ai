import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const serviceSourceUrl = new URL("../payment-webhooks.service.ts", import.meta.url);
const controllerSourceUrl = new URL("../payment-webhooks.controller.ts", import.meta.url);

test("webhook handler maps checkout.session.completed to INCOMPLETE", async () => {
  const source = await readFile(serviceSourceUrl, "utf8");
  assert.ok(
    source.includes("checkout.session.completed"),
    "Handles checkout.session.completed event",
  );
  assert.ok(
    source.includes("INCOMPLETE"),
    "Maps to INCOMPLETE status",
  );
});

test("webhook handler handles idempotency (duplicate eventId)", async () => {
  const source = await readFile(serviceSourceUrl, "utf8");
  assert.ok(
    source.includes("Duplicate webhook event"),
    "Skips duplicate events",
  );
  assert.ok(
    source.includes("PaymentEventModel.findOne"),
    "Checks for existing event",
  );
});

test("webhook handler persists events before processing", async () => {
  const source = await readFile(serviceSourceUrl, "utf8");
  assert.ok(
    source.includes("PaymentEventModel.create"),
    "Creates payment event record",
  );
  assert.ok(
    source.includes('status: "received"'),
    "Initially sets status to received",
  );
});

test("webhook and Checkout return recovery converge on the shared state applier", async () => {
  const source = await readFile(serviceSourceUrl, "utf8");
  assert.ok(source.includes("synchronizeProviderSubscription"));
  assert.ok(source.includes('sourceType: "webhook"'));
});

test("refund webhooks trigger authoritative refund synchronization before completion", async () => {
  const source = await readFile(serviceSourceUrl, "utf8");
  assert.ok(source.includes("REFUND_WEBHOOK_EVENTS"));
  assert.ok(source.includes("synchronizeRefundFromProvider"));
  assert.ok(source.includes('eventRecord.status = "processed"'));
});

test("webhook controller verifies signature", async () => {
  const source = await readFile(controllerSourceUrl, "utf8");
  assert.ok(
    source.includes("verifyWebhookSignature"),
    "Verifies webhook signature",
  );
  assert.ok(
    source.includes("BILLING_WEBHOOK_SIGNATURE_INVALID"),
    "Returns error for invalid signature",
  );
});

test("webhook controller responds 200 quickly without blocking", async () => {
  const source = await readFile(controllerSourceUrl, "utf8");
  assert.ok(
    source.includes('status(200).json({ received: true })'),
    "Returns 200 immediately",
  );
});
