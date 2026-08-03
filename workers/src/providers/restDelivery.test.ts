import test from "node:test";
import assert from "node:assert/strict";
import type {
  NotificationTransportPort,
  TransportDeliveryInput,
  TransportDeliveryResult,
} from "../contracts/notificationTransport.js";
import { RestDelivery } from "./restDelivery.js";

function makeInput(overrides: Partial<TransportDeliveryInput> = {}): TransportDeliveryInput {
  return {
    notificationId: "notif-1",
    tenantId: "tenant-1",
    userId: "user-1",
    type: "processing_failed",
    priority: "high",
    title: "OCR processing failed",
    body: "The document could not be processed.",
    actions: [{ label: "Retry", url: "/documents/doc-1/ocr/retry" }],
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    ...overrides,
  };
}

test("RestDelivery - returns {ok:true} for any input (Phase 1 no-op contract)", async () => {
  const delivery = new RestDelivery();

  const basic = await delivery.deliver(makeInput());
  assert.deepEqual(basic, { ok: true });

  const emptyActions = await delivery.deliver(
    makeInput({ notificationId: "notif-2", type: "welcome", priority: "normal", actions: [] }),
  );
  assert.deepEqual(emptyActions, { ok: true });

  const arabicBody = await delivery.deliver(
    makeInput({
      notificationId: "notif-3",
      userId: "user-2",
      type: "invitation_accepted",
      priority: "low",
      title: "تم قبول الدعوة",
      body: "انضم مستخدم جديد إلى شركتك.",
      actions: [],
      createdAt: new Date("2026-08-01T11:00:00.000Z"),
    }),
  );
  assert.deepEqual(arabicBody, { ok: true });
});

// Port substitutability (LSP): a failing adapter that reports the shared
// failure taxonomy must typecheck as a NotificationTransportPort. The worker
// (T11) maps errorCategory 'permanent' -> PermanentJobError.
class FailingAdapter implements NotificationTransportPort {
  async deliver(_input: TransportDeliveryInput): Promise<TransportDeliveryResult> {
    return { ok: false, errorCategory: "permanent", errorMessage: "channel unreachable" };
  }
}

test("FailingAdapter - permanent-failure result typechecks as the port and honors the taxonomy", async () => {
  const adapter: NotificationTransportPort = new FailingAdapter();
  const result = await adapter.deliver(makeInput());

  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, "permanent");
  assert.equal(result.errorMessage, "channel unreachable");
});
