import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/models/subscription.model.js", () => ({
  default: {
    findOne: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock("../../../db/models/paymentEvent.model.js", () => ({
  default: {
    create: vi.fn(),
    findOne: vi.fn(),
  },
}));

vi.mock("../../../db/models/checkoutSession.model.js", () => ({
  default: {
    updateOne: vi.fn(),
  },
}));

vi.mock("../../../common/observability/index.js", () => ({
  getAuditWriter: () => ({ write: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock("../../billing/subscription.service.js", () => ({
  transitionSubscription: vi.fn(),
}));

vi.mock("../../permissions/permissions.operation.js", () => ({
  authorizePlatformOperation: vi.fn(),
}));

import SubscriptionModel from "../../../db/models/subscription.model.js";
import PaymentEventModel from "../../../db/models/paymentEvent.model.js";
import CheckoutSessionModel from "../../../db/models/checkoutSession.model.js";
import { handlePaymentEvent } from "../../payment-webhooks/payment-webhooks.service.js";
import { transitionSubscription } from "../subscription.service.js";
import type { PaymentProviderEvent } from "../ports/payment-provider.port.js";

const TENANT_ID = "507f1f77bcf86cd799439011";
const SUBSCRIPTION_ID = "507f1f77bcf86cd799439014";
const CUSTOMER_ID = "cus_abc123";
const STRIPE_SUB_ID = "sub_xyz789";

function makeEvent(
  overrides: Partial<PaymentProviderEvent> & {
    rawObject?: Record<string, unknown>;
  },
): PaymentProviderEvent {
  const { rawObject, ...rest } = overrides;
  return {
    id: rest.id ?? "evt_test_1",
    type: rest.type ?? "invoice.paid",
    timestamp: rest.timestamp ?? new Date(),
    provider: rest.provider ?? "stripe",
    raw: {
      data: {
        object: rawObject ?? {},
      },
    },
  };
}

function mockQueryChain<T>(result: T) {
  const chain = {
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(result),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  chain.lean = vi.fn(() => chain);
  chain.sort = vi.fn(() => chain);
  chain.skip = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  return chain;
}

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    _id: SUBSCRIPTION_ID,
    tenantId: TENANT_ID,
    status: "INCOMPLETE",
    providerCustomerId: CUSTOMER_ID,
    providerSubscriptionId: STRIPE_SUB_ID,
    packageId: "507f1f77bcf86cd799439012",
    ...overrides,
  };
}

describe("handlePaymentEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (PaymentEventModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
      mockQueryChain(null),
    );
    (PaymentEventModel.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: "evt_record_1",
      eventId: "evt_test_1",
      status: "received",
      processingErrors: [],
      save: vi.fn().mockResolvedValue(undefined),
    });
    (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
      mockQueryChain(null),
    );
    (SubscriptionModel.updateOne as ReturnType<typeof vi.fn>).mockResolvedValue(
      { modifiedCount: 1 },
    );
    (CheckoutSessionModel.updateOne as ReturnType<
      typeof vi.fn
    >).mockResolvedValue({ modifiedCount: 1 });
    (transitionSubscription as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSub(),
    );
  });

  describe("idempotency", () => {
    it("skips duplicate webhook events", async () => {
      (PaymentEventModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain({ eventId: "evt_dup_1" }),
      );

      const event = makeEvent({ id: "evt_dup_1", type: "invoice.paid" });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).not.toHaveBeenCalled();
    });

    it("processes new events that are not duplicates", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "INCOMPLETE" })),
      );

      const event = makeEvent({
        id: "evt_new_1",
        type: "invoice.paid",
        rawObject: {
          customer: CUSTOMER_ID,
          subscription: STRIPE_SUB_ID,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).toHaveBeenCalled();
    });
  });

  describe("invoice.paid — tenant resolution", () => {
    it("resolves subscription via metadata.tenantId when available", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "INCOMPLETE" })),
      );

      const event = makeEvent({
        id: "evt_ip_1",
        type: "invoice.paid",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          customer: CUSTOMER_ID,
          subscription: STRIPE_SUB_ID,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(SubscriptionModel.findOne).toHaveBeenCalledWith({
        tenantId: expect.anything(),
      });
      expect(transitionSubscription).toHaveBeenCalledWith(
        TENANT_ID,
        "ACTIVE",
        expect.objectContaining({ triggeredBy: "provider_event" }),
      );
    });

    it("falls back to providerCustomerId when metadata.tenantId is absent", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "INCOMPLETE" })),
      );

      const event = makeEvent({
        id: "evt_ip_2",
        type: "invoice.paid",
        rawObject: {
          customer: CUSTOMER_ID,
          subscription: STRIPE_SUB_ID,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(SubscriptionModel.findOne).toHaveBeenCalledWith({
        providerCustomerId: CUSTOMER_ID,
      });
      expect(transitionSubscription).toHaveBeenCalled();
    });

    it("falls back to providerSubscriptionId when customer lookup also fails", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "INCOMPLETE" })),
      );

      const event = makeEvent({
        id: "evt_ip_3",
        type: "invoice.paid",
        rawObject: {
          subscription: STRIPE_SUB_ID,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(SubscriptionModel.findOne).toHaveBeenCalledWith({
        providerSubscriptionId: STRIPE_SUB_ID,
      });
      expect(transitionSubscription).toHaveBeenCalled();
    });

    it("fails when no resolution path finds a subscription", async () => {
      const event = makeEvent({
        id: "evt_ip_4",
        type: "invoice.paid",
        rawObject: {},
      });

      const eventRecord = {
        _id: "rec_1",
        status: "received",
        processingErrors: [],
        save: vi.fn().mockResolvedValue(undefined),
      };
      (PaymentEventModel.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        eventRecord,
      );

      await handlePaymentEvent(event, "{}", "sig");

      expect(eventRecord.status).toBe("failed");
      expect(eventRecord.processingErrors).toContainEqual(
        expect.stringContaining("No subscription found"),
      );
    });
  });

  describe("invoice.paid — subscription activation", () => {
    it("transitions INCOMPLETE → ACTIVE on successful payment", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "INCOMPLETE" })),
      );

      const event = makeEvent({
        id: "evt_ip_act_1",
        type: "invoice.paid",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          customer: CUSTOMER_ID,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).toHaveBeenCalledWith(
        TENANT_ID,
        "ACTIVE",
        expect.objectContaining({ triggeredBy: "provider_event" }),
      );
    });

    it("transitions PAST_DUE → ACTIVE on successful payment", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "PAST_DUE" })),
      );

      const event = makeEvent({
        id: "evt_ip_act_2",
        type: "invoice.paid",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).toHaveBeenCalledWith(
        TENANT_ID,
        "ACTIVE",
        expect.anything(),
      );
    });

    it("does not transition when current status is not in fromStatuses", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "CANCELED" })),
      );

      const event = makeEvent({
        id: "evt_ip_act_3",
        type: "invoice.paid",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).not.toHaveBeenCalled();
    });
  });

  describe("invoice.payment_failed — tenant resolution", () => {
    it("resolves subscription via providerCustomerId when metadata is absent", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(mockQueryChain(null))
        .mockReturnValueOnce(
          mockQueryChain(makeSub({ status: "ACTIVE" })),
        );

      const event = makeEvent({
        id: "evt_ipf_1",
        type: "invoice.payment_failed",
        rawObject: {
          customer: CUSTOMER_ID,
          subscription: STRIPE_SUB_ID,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).toHaveBeenCalledWith(
        TENANT_ID,
        "PAST_DUE",
        expect.objectContaining({ triggeredBy: "provider_event" }),
      );
    });

    it("transitions ACTIVE → PAST_DUE on payment failure", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "ACTIVE" })),
      );

      const event = makeEvent({
        id: "evt_ipf_2",
        type: "invoice.payment_failed",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).toHaveBeenCalledWith(
        TENANT_ID,
        "PAST_DUE",
        expect.anything(),
      );
    });

    it("does not activate subscription on payment failure", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "INCOMPLETE" })),
      );

      const event = makeEvent({
        id: "evt_ipf_3",
        type: "invoice.payment_failed",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).toHaveBeenCalledWith(
        TENANT_ID,
        "PAST_DUE",
        expect.anything(),
      );
      expect(transitionSubscription).not.toHaveBeenCalledWith(
        TENANT_ID,
        "ACTIVE",
        expect.anything(),
      );
    });
  });

  describe("customer.subscription.updated — status mapping", () => {
    it("maps Stripe active status to internal ACTIVE", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "INCOMPLETE" })),
      );

      const event = makeEvent({
        id: "evt_csu_1",
        type: "customer.subscription.updated",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          status: "active",
          cancel_at_period_end: false,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).toHaveBeenCalledWith(
        TENANT_ID,
        "ACTIVE",
        expect.anything(),
      );
    });

    it("maps Stripe past_due status to internal PAST_DUE", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "ACTIVE" })),
      );

      const event = makeEvent({
        id: "evt_csu_2",
        type: "customer.subscription.updated",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          status: "past_due",
          cancel_at_period_end: false,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).toHaveBeenCalledWith(
        TENANT_ID,
        "PAST_DUE",
        expect.anything(),
      );
    });

    it("maps Stripe incomplete_expired to internal EXPIRED", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "INCOMPLETE" })),
      );

      const event = makeEvent({
        id: "evt_csu_3",
        type: "customer.subscription.updated",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          status: "incomplete_expired",
          cancel_at_period_end: false,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).toHaveBeenCalledWith(
        TENANT_ID,
        "EXPIRED",
        expect.anything(),
      );
    });

    it("skips transition when mapped status is not legal from current status", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "CANCELED" })),
      );

      const event = makeEvent({
        id: "evt_csu_4",
        type: "customer.subscription.updated",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          status: "active",
          cancel_at_period_end: false,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).not.toHaveBeenCalled();
    });
  });

  describe("customer.subscription.updated — cancel_at_period_end", () => {
    it("transitions to CANCEL_AT_PERIOD_END when cancel_at_period_end is true", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "ACTIVE" })),
      );

      const event = makeEvent({
        id: "evt_cape_1",
        type: "customer.subscription.updated",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          status: "active",
          cancel_at_period_end: true,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).toHaveBeenCalledWith(
        TENANT_ID,
        "CANCEL_AT_PERIOD_END",
        expect.anything(),
      );
    });

    it("does NOT immediately cancel when cancel_at_period_end is true", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "ACTIVE" })),
      );

      const event = makeEvent({
        id: "evt_cape_2",
        type: "customer.subscription.updated",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          status: "active",
          cancel_at_period_end: true,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).not.toHaveBeenCalledWith(
        TENANT_ID,
        "CANCELED",
        expect.anything(),
      );
      expect(transitionSubscription).not.toHaveBeenCalledWith(
        TENANT_ID,
        "EXPIRED",
        expect.anything(),
      );
    });

    it("reverts to ACTIVE when cancel_at_period_end changes from true to false", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "CANCEL_AT_PERIOD_END" })),
      );

      const event = makeEvent({
        id: "evt_cape_3",
        type: "customer.subscription.updated",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          status: "active",
          cancel_at_period_end: false,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).toHaveBeenCalledWith(
        TENANT_ID,
        "ACTIVE",
        expect.anything(),
      );
    });

    it("transitions to CANCELED when Stripe status is canceled", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "CANCEL_AT_PERIOD_END" })),
      );

      const event = makeEvent({
        id: "evt_cape_4",
        type: "customer.subscription.updated",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          status: "canceled",
          cancel_at_period_end: false,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).toHaveBeenCalledWith(
        TENANT_ID,
        "CANCELED",
        expect.anything(),
      );
    });
  });

  describe("customer.subscription.updated — tenant resolution", () => {
    it("resolves subscription via providerCustomerId when metadata is absent", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "INCOMPLETE" })),
      );

      const event = makeEvent({
        id: "evt_csu_res_1",
        type: "customer.subscription.updated",
        rawObject: {
          customer: CUSTOMER_ID,
          status: "active",
          cancel_at_period_end: false,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(SubscriptionModel.findOne).toHaveBeenCalledWith({
        providerCustomerId: CUSTOMER_ID,
      });
      expect(transitionSubscription).toHaveBeenCalled();
    });

    it("resolves subscription via providerSubscriptionId when customer lookup fails", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "INCOMPLETE" })),
      );

      const event = makeEvent({
        id: "evt_csu_res_2",
        type: "customer.subscription.updated",
        rawObject: {
          subscription: STRIPE_SUB_ID,
          status: "active",
          cancel_at_period_end: false,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(SubscriptionModel.findOne).toHaveBeenCalledWith({
        providerSubscriptionId: STRIPE_SUB_ID,
      });
      expect(transitionSubscription).toHaveBeenCalled();
    });

    it("fails when no resolution path finds a subscription", async () => {
      const eventRecord = {
        _id: "rec_2",
        status: "received",
        processingErrors: [],
        save: vi.fn().mockResolvedValue(undefined),
      };
      (PaymentEventModel.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        eventRecord,
      );

      const event = makeEvent({
        id: "evt_csu_res_3",
        type: "customer.subscription.updated",
        rawObject: {
          status: "active",
          cancel_at_period_end: false,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(eventRecord.status).toBe("failed");
    });
  });

  describe("checkout.session.completed", () => {
    it("transitions to INCOMPLETE with paymentState paid", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "TRIALING" })),
      );

      const event = makeEvent({
        id: "evt_csc_1",
        type: "checkout.session.completed",
        rawObject: {
          metadata: { tenantId: TENANT_ID, packageId: "pkg_123" },
          id: "cs_session_1",
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).toHaveBeenCalledWith(
        TENANT_ID,
        "INCOMPLETE",
        expect.objectContaining({ triggeredBy: "provider_event" }),
      );
    });

    it("marks checkout session as completed", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "TRIALING" })),
      );

      const event = makeEvent({
        id: "evt_csc_2",
        type: "checkout.session.completed",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          id: "cs_session_2",
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(CheckoutSessionModel.updateOne).toHaveBeenCalledWith(
        { providerSessionId: "cs_session_2" },
        { $set: expect.objectContaining({ status: "completed" }) },
      );
    });
  });

  describe("checkout.session.completed — failed initial checkout", () => {
    it("marks CheckoutSession as failed when payment_status is unpaid", async () => {
      const event = makeEvent({
        id: "evt_csc_fail_1",
        type: "checkout.session.completed",
        rawObject: {
          id: "cs_session_fail_1",
          payment_status: "unpaid",
          metadata: { tenantId: TENANT_ID, packageId: "pkg_123" },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(CheckoutSessionModel.updateOne).toHaveBeenCalledWith(
        { providerSessionId: "cs_session_fail_1" },
        { $set: expect.objectContaining({ status: "failed" }) },
      );
    });

    it("does NOT create or transition an internal Subscription", async () => {
      const event = makeEvent({
        id: "evt_csc_fail_2",
        type: "checkout.session.completed",
        rawObject: {
          id: "cs_session_fail_2",
          payment_status: "unpaid",
          metadata: { tenantId: TENANT_ID },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).not.toHaveBeenCalled();
      expect(SubscriptionModel.updateOne).not.toHaveBeenCalled();
    });

    it("stores failure reason in CheckoutSession metadata", async () => {
      const event = makeEvent({
        id: "evt_csc_fail_3",
        type: "checkout.session.completed",
        rawObject: {
          id: "cs_session_fail_3",
          payment_status: "unpaid",
          last_payment_error: { message: "Your card was declined." },
          metadata: { tenantId: TENANT_ID },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(CheckoutSessionModel.updateOne).toHaveBeenCalledWith(
        { providerSessionId: "cs_session_fail_3" },
        {
          $set: expect.objectContaining({
            status: "failed",
            metadata: expect.any(Map),
          }),
        },
      );
    });

    it("does NOT fall through to the old static mapping handler", async () => {
      const event = makeEvent({
        id: "evt_csc_fail_4",
        type: "checkout.session.completed",
        rawObject: {
          id: "cs_session_fail_4",
          payment_status: "unpaid",
          metadata: { tenantId: TENANT_ID },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).not.toHaveBeenCalled();
      expect(SubscriptionModel.findOne).not.toHaveBeenCalled();
    });

    it("is idempotent for duplicate failure webhooks", async () => {
      (PaymentEventModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain({ eventId: "evt_csc_fail_dup" }),
      );

      const event = makeEvent({
        id: "evt_csc_fail_dup",
        type: "checkout.session.completed",
        rawObject: {
          id: "cs_session_dup",
          payment_status: "unpaid",
          metadata: { tenantId: TENANT_ID },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(CheckoutSessionModel.updateOne).not.toHaveBeenCalled();
    });
  });

  describe("checkout.session.expired", () => {
    it("marks CheckoutSession as expired", async () => {
      const event = makeEvent({
        id: "evt_cse_1",
        type: "checkout.session.expired",
        rawObject: {
          id: "cs_session_exp_1",
          metadata: { tenantId: TENANT_ID },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(CheckoutSessionModel.updateOne).toHaveBeenCalledWith(
        { providerSessionId: "cs_session_exp_1" },
        { $set: expect.objectContaining({ status: "expired" }) },
      );
    });

    it("does NOT create or transition an internal Subscription", async () => {
      const event = makeEvent({
        id: "evt_cse_2",
        type: "checkout.session.expired",
        rawObject: {
          id: "cs_session_exp_2",
          metadata: { tenantId: TENANT_ID },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).not.toHaveBeenCalled();
      expect(SubscriptionModel.findOne).not.toHaveBeenCalled();
    });

    it("is idempotent for duplicate expiry webhooks", async () => {
      (PaymentEventModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain({ eventId: "evt_cse_dup" }),
      );

      const event = makeEvent({
        id: "evt_cse_dup",
        type: "checkout.session.expired",
        rawObject: {
          id: "cs_session_exp_dup",
          metadata: { tenantId: TENANT_ID },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(CheckoutSessionModel.updateOne).not.toHaveBeenCalled();
    });
  });

  describe("customer.subscription.deleted", () => {
    it("transitions to EXPIRED with paymentState failed", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "ACTIVE" })),
      );

      const event = makeEvent({
        id: "evt_csd_1",
        type: "customer.subscription.deleted",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).toHaveBeenCalledWith(
        TENANT_ID,
        "EXPIRED",
        expect.anything(),
      );
    });
  });

  describe("tenant isolation", () => {
    it("never mixes subscriptions across tenants", async () => {
      const sub1 = makeSub({
        status: "INCOMPLETE",
        providerCustomerId: "cus_tenant1",
      });
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(sub1),
      );

      const event = makeEvent({
        id: "evt_iso_1",
        type: "invoice.paid",
        rawObject: {
          customer: "cus_tenant1",
          subscription: "sub_for_tenant1",
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).toHaveBeenCalledWith(
        TENANT_ID,
        "ACTIVE",
        expect.anything(),
      );
      expect(SubscriptionModel.updateOne).toHaveBeenCalledWith(
        { tenantId: TENANT_ID },
        expect.anything(),
      );
    });
  });
});
