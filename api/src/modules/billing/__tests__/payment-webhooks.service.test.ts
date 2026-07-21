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
    find: vi.fn(),
    findOne: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock("../../../common/observability/index.js", () => ({
  getAuditWriter: () => ({ write: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock("../../billing/subscription.service.js", () => ({
  transitionSubscription: vi.fn(),
  LEGAL_TRANSITIONS: {
    TRIALING: ["ACTIVE", "PAST_DUE", "CANCEL_AT_PERIOD_END"],
    INCOMPLETE: ["ACTIVE", "PAST_DUE", "EXPIRED"],
    ACTIVE: ["PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END", "EXPIRED"],
    PAST_DUE: ["ACTIVE", "PAUSED", "EXPIRED", "UNPAID"],
    PAUSED: ["ACTIVE", "EXPIRED"],
    "CANCEL_AT_PERIOD_END": ["ACTIVE", "CANCELED", "EXPIRED"],
    CANCELED: [],
    EXPIRED: ["ACTIVE", "UNPAID"],
    UNPAID: ["ACTIVE", "EXPIRED"],
  },
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
    (CheckoutSessionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
      mockQueryChain(null),
    );
    (CheckoutSessionModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
      mockQueryChain([]),
    );
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

    it("skips transition when subscription is already ACTIVE", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "ACTIVE" })),
      );

      const event = makeEvent({
        id: "evt_ip_act_4",
        type: "invoice.paid",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).not.toHaveBeenCalled();
      const updateArgs = (SubscriptionModel.updateOne as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(updateArgs[0]).toEqual({ tenantId: expect.anything() });
      expect(updateArgs[1].$set).toMatchObject({ paymentState: "paid" });
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
    it("persists cancelAtPeriodEnd=true without transition when status is unchanged", async () => {
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

      expect(transitionSubscription).not.toHaveBeenCalled();
      const updateArgs = (SubscriptionModel.updateOne as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(updateArgs[0]).toEqual({ tenantId: expect.anything() });
      expect(updateArgs[1].$set).toMatchObject({ cancelAtPeriodEnd: true });
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

    it("clears cancelAtPeriodEnd when cancel_at_period_end changes to false", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "ACTIVE" })),
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

      expect(transitionSubscription).not.toHaveBeenCalled();
      const updateArgs = (SubscriptionModel.updateOne as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(updateArgs[0]).toEqual({ tenantId: expect.anything() });
      expect(updateArgs[1].$set).toMatchObject({ cancelAtPeriodEnd: false });
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

  describe("customer.subscription.updated — current_period_end persistence", () => {
    it("persists current_period_end as periodEnd", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "ACTIVE" })),
      );

      const event = makeEvent({
        id: "evt_cpe_1",
        type: "customer.subscription.updated",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          status: "active",
          cancel_at_period_end: false,
          current_period_end: 1700000000,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).not.toHaveBeenCalled();
      const updateArgs = (SubscriptionModel.updateOne as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(updateArgs[1].$set).toMatchObject({ periodEnd: new Date(1700000000 * 1000) });
    });

    it("persists cancelAtPeriodEnd and periodEnd on status change", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "ACTIVE" })),
      );

      const event = makeEvent({
        id: "evt_cpe_2",
        type: "customer.subscription.updated",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          status: "past_due",
          cancel_at_period_end: false,
          current_period_end: 1700000000,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).toHaveBeenCalledWith(
        TENANT_ID,
        "PAST_DUE",
        expect.anything(),
      );
      const updateArgs = (SubscriptionModel.updateOne as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(updateArgs[1].$set).toMatchObject({
        cancelAtPeriodEnd: false,
        periodEnd: new Date(1700000000 * 1000),
      });
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
          $set: {
            status: "failed",
            "metadata.payment_status": "unpaid",
            "metadata.providerEventId": "evt_csc_fail_3",
            "metadata.failureReason": "Your card was declined.",
          },
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

  describe("payment_intent.payment_failed — initial checkout decline", () => {
    it("marks pending CheckoutSession as failed", async () => {
      (CheckoutSessionModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain([{ _id: "cs_1", status: "pending", tenantId: TENANT_ID }]),
      );

      const event = makeEvent({
        id: "evt_pipf_1",
        type: "payment_intent.payment_failed",
        rawObject: {
          metadata: { tenantId: TENANT_ID, packageId: "pkg_1" },
          last_payment_error: { message: "Your card was declined." },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(CheckoutSessionModel.find).toHaveBeenCalledWith({
        tenantId: expect.anything(),
        status: "pending",
      });
      expect(CheckoutSessionModel.updateOne).toHaveBeenCalledWith(
        { _id: "cs_1", status: "pending" },
        { $set: expect.objectContaining({ status: "failed" }) },
      );
    });

    it("does NOT create or transition an internal Subscription", async () => {
      (CheckoutSessionModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain([{ _id: "cs_2", status: "pending", tenantId: TENANT_ID }]),
      );

      const event = makeEvent({
        id: "evt_pipf_2",
        type: "payment_intent.payment_failed",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          last_payment_error: { message: "Card declined" },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).not.toHaveBeenCalled();
      expect(SubscriptionModel.findOne).not.toHaveBeenCalled();
    });

    it("stores failure reason from last_payment_error", async () => {
      (CheckoutSessionModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain([{ _id: "cs_3", status: "pending", tenantId: TENANT_ID }]),
      );

      const event = makeEvent({
        id: "evt_pipf_3",
        type: "payment_intent.payment_failed",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          last_payment_error: { message: "Insufficient funds" },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(CheckoutSessionModel.updateOne).toHaveBeenCalledWith(
        { _id: "cs_3", status: "pending" },
        {
          $set: {
            status: "failed",
            "metadata.providerEventId": "evt_pipf_3",
            "metadata.failureReason": "Insufficient funds",
          },
        },
      );
    });

    it("records error when no pending CheckoutSession exists for tenantId", async () => {
      (CheckoutSessionModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain([]),
      );

      const eventRecord = {
        _id: "rec_pipf_4",
        status: "received",
        processingErrors: [],
        save: vi.fn().mockResolvedValue(undefined),
      };
      (PaymentEventModel.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        eventRecord,
      );

      const event = makeEvent({
        id: "evt_pipf_4",
        type: "payment_intent.payment_failed",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(CheckoutSessionModel.updateOne).not.toHaveBeenCalled();
      expect(transitionSubscription).not.toHaveBeenCalled();
      expect(eventRecord.status).toBe("failed");
      expect(eventRecord.processingErrors).toContainEqual(
        expect.stringContaining("No pending CheckoutSession found"),
      );
    });

    it("records error when neither tenantId nor customer is present", async () => {
      const eventRecord = {
        _id: "rec_pipf_5",
        status: "received",
        processingErrors: [],
        save: vi.fn().mockResolvedValue(undefined),
      };
      (PaymentEventModel.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        eventRecord,
      );

      const event = makeEvent({
        id: "evt_pipf_5",
        type: "payment_intent.payment_failed",
        rawObject: {
          last_payment_error: { message: "Declined" },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(CheckoutSessionModel.updateOne).not.toHaveBeenCalled();
      expect(eventRecord.status).toBe("failed");
      expect(eventRecord.processingErrors).toContainEqual(
        expect.stringContaining("No pending CheckoutSession found"),
      );
    });

    it("is idempotent for duplicate webhook delivery", async () => {
      (PaymentEventModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain({ eventId: "evt_pipf_dup" }),
      );

      const event = makeEvent({
        id: "evt_pipf_dup",
        type: "payment_intent.payment_failed",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(CheckoutSessionModel.updateOne).not.toHaveBeenCalled();
    });
  });

  describe("payment_intent.payment_failed — providerCustomerId fallback (real Stripe behavior)", () => {
    it("marks pending CheckoutSession as failed via customer ID when metadata.tenantId is absent", async () => {
      // No order_reference, no metadata.tenantId → only customer lookup runs via find()
      (CheckoutSessionModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain([{ _id: "cs_fallback_1", status: "pending", tenantId: TENANT_ID }]),
      );

      const event = makeEvent({
        id: "evt_pipf_fb_1",
        type: "payment_intent.payment_failed",
        rawObject: {
          customer: CUSTOMER_ID,
          last_payment_error: { message: "Your card was declined." },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(CheckoutSessionModel.find).toHaveBeenCalledWith({
        providerCustomerId: CUSTOMER_ID,
        status: "pending",
      });
      expect(CheckoutSessionModel.updateOne).toHaveBeenCalledWith(
        { _id: "cs_fallback_1", status: "pending" },
        { $set: expect.objectContaining({ status: "failed" }) },
      );
    });

    it("does NOT create or transition an internal Subscription via fallback path", async () => {
      (CheckoutSessionModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain([{ _id: "cs_fallback_2", status: "pending", tenantId: TENANT_ID }]),
      );

      const event = makeEvent({
        id: "evt_pipf_fb_2",
        type: "payment_intent.payment_failed",
        rawObject: {
          customer: CUSTOMER_ID,
          last_payment_error: { message: "Card declined" },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).not.toHaveBeenCalled();
      expect(SubscriptionModel.findOne).not.toHaveBeenCalled();
    });

    it("records error when tenantId lookup fails and customer ID has no pending session", async () => {
      // No order_reference, no metadata.tenantId, customer lookup → empty
      // find already returns [] from beforeEach default.

      const eventRecord = {
        _id: "rec_pipf_fb_3",
        status: "received",
        processingErrors: [],
        save: vi.fn().mockResolvedValue(undefined),
      };
      (PaymentEventModel.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        eventRecord,
      );

      const event = makeEvent({
        id: "evt_pipf_fb_3",
        type: "payment_intent.payment_failed",
        rawObject: {
          customer: CUSTOMER_ID,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(CheckoutSessionModel.updateOne).not.toHaveBeenCalled();
      expect(eventRecord.status).toBe("failed");
      expect(eventRecord.processingErrors).toContainEqual(
        expect.stringContaining("No pending CheckoutSession found"),
      );
    });

    it("is idempotent for duplicate webhook delivery via fallback path", async () => {
      (PaymentEventModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain({ eventId: "evt_pipf_fb_dup" }),
      );

      const event = makeEvent({
        id: "evt_pipf_fb_dup",
        type: "payment_intent.payment_failed",
        rawObject: {
          customer: CUSTOMER_ID,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(CheckoutSessionModel.updateOne).not.toHaveBeenCalled();
    });
  });

  describe("charge.failed — initial checkout decline", () => {
    it("marks pending CheckoutSession as failed", async () => {
      (CheckoutSessionModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain([{ _id: "cs_c1", status: "pending", tenantId: TENANT_ID }]),
      );

      const event = makeEvent({
        id: "evt_cf_1",
        type: "charge.failed",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          failure_message: "Your card was declined.",
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(CheckoutSessionModel.find).toHaveBeenCalledWith({
        tenantId: expect.anything(),
        status: "pending",
      });
      expect(CheckoutSessionModel.updateOne).toHaveBeenCalledWith(
        { _id: "cs_c1", status: "pending" },
        { $set: expect.objectContaining({ status: "failed" }) },
      );
    });

    it("does NOT create or transition an internal Subscription", async () => {
      (CheckoutSessionModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain([{ _id: "cs_c2", status: "pending", tenantId: TENANT_ID }]),
      );

      const event = makeEvent({
        id: "evt_cf_2",
        type: "charge.failed",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          failure_message: "Card declined",
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).not.toHaveBeenCalled();
      expect(SubscriptionModel.findOne).not.toHaveBeenCalled();
    });

    it("is idempotent for duplicate webhook delivery", async () => {
      (PaymentEventModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain({ eventId: "evt_cf_dup" }),
      );

      const event = makeEvent({
        id: "evt_cf_dup",
        type: "charge.failed",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(CheckoutSessionModel.updateOne).not.toHaveBeenCalled();
    });

    it("marks pending CheckoutSession as failed via customer ID fallback", async () => {
      // No order_reference on Charge, no metadata.tenantId → only customer lookup via find()
      (CheckoutSessionModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain([{ _id: "cs_cf_fb", status: "pending", tenantId: TENANT_ID }]),
      );

      const event = makeEvent({
        id: "evt_cf_fb_1",
        type: "charge.failed",
        rawObject: {
          customer: CUSTOMER_ID,
          failure_message: "Your card was declined.",
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(CheckoutSessionModel.find).toHaveBeenCalledWith({
        providerCustomerId: CUSTOMER_ID,
        status: "pending",
      });
      expect(CheckoutSessionModel.updateOne).toHaveBeenCalledWith(
        { _id: "cs_cf_fb", status: "pending" },
        { $set: expect.objectContaining({ status: "failed" }) },
      );
    });

    it("records error when no correlation identifier is present", async () => {
      const eventRecord = {
        _id: "rec_cf_no_id",
        status: "received",
        processingErrors: [],
        save: vi.fn().mockResolvedValue(undefined),
      };
      (PaymentEventModel.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        eventRecord,
      );

      const event = makeEvent({
        id: "evt_cf_no_id",
        type: "charge.failed",
        rawObject: {
          failure_message: "Declined",
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(CheckoutSessionModel.updateOne).not.toHaveBeenCalled();
      expect(eventRecord.status).toBe("failed");
      expect(eventRecord.processingErrors).toContainEqual(
        expect.stringContaining("No pending CheckoutSession found"),
      );
    });
  });

  describe("real-world declined card flow — both events", () => {
    it("second failure event is a no-op when CheckoutSession already failed", async () => {
      // In real Stripe, PaymentIntent/Charge events carry customer, NOT metadata.
      // The first event (PI) correlates via customer find().
      (CheckoutSessionModel.find as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(                        // PI: customer lookup → found
          mockQueryChain([{ _id: "cs_real", status: "pending", tenantId: TENANT_ID }]),
        );

      const piEvent = makeEvent({
        id: "evt_real_pi",
        type: "payment_intent.payment_failed",
        rawObject: {
          customer: CUSTOMER_ID,
          last_payment_error: { message: "Declined" },
        },
      });
      await handlePaymentEvent(piEvent, "{}", "sig");

      expect(CheckoutSessionModel.updateOne).toHaveBeenCalledWith(
        { _id: "cs_real", status: "pending" },
        expect.objectContaining({ $set: expect.objectContaining({ status: "failed" }) }),
      );

      // Second event (charge.failed) arrives — CheckoutSession already failed
      vi.clearAllMocks();
      (PaymentEventModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(null),
      );
      (PaymentEventModel.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        _id: "evt_record_2",
        eventId: "evt_real_charge",
        status: "received",
        processingErrors: [],
        save: vi.fn().mockResolvedValue(undefined),
      });
      // customer lookup finds no pending sessions (already failed)
      (CheckoutSessionModel.find as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(
          mockQueryChain([]),
        );

      const chargeEvent = makeEvent({
        id: "evt_real_charge",
        type: "charge.failed",
        rawObject: {
          customer: CUSTOMER_ID,
          failure_message: "Declined",
        },
      });
      await handlePaymentEvent(chargeEvent, "{}", "sig");

      // The updateOne is NOT called because no pending session was found
      expect(CheckoutSessionModel.updateOne).not.toHaveBeenCalled();
    });
  });

  describe("payment_intent.payment_failed — order_reference deterministic correlation", () => {
    it("correlates via payment_details.order_reference → providerSessionId (real Stripe event shape)", async () => {
      // This is the exact event shape from the production incident:
      // PI has customer AND payment_details.order_reference (the CheckoutSession ID).
      // findOne is called for the deterministic order_reference lookup.
      (CheckoutSessionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain({
          _id: "cs_exact_1",
          providerSessionId: "cs_test_a1X2sh462MQExU0cLbyRZd17ITCpkK6Q7ejXjQH0jgMDDnLLVF4yuzvzI7",
          status: "pending",
          tenantId: TENANT_ID,
        }),
      );

      const event = makeEvent({
        id: "evt_3TveqfBWDqJ5axSm17XF56sI",
        type: "payment_intent.payment_failed",
        rawObject: {
          id: "pi_3TveqfBWDqJ5axSm1LKI3Mtd",
          customer: "cus_UvGUvNvyTSEObm",
          payment_details: {
            order_reference: "cs_test_a1X2sh462MQExU0cLbyRZd17ITCpkK6Q7ejXjQH0jgMDDnLLVF4yuzvzI7",
          },
          metadata: {},
          last_payment_error: { message: "Your card was declined." },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      // findOne was called with providerSessionId (deterministic lookup)
      expect(CheckoutSessionModel.findOne).toHaveBeenCalledWith({
        providerSessionId: "cs_test_a1X2sh462MQExU0cLbyRZd17ITCpkK6Q7ejXjQH0jgMDDnLLVF4yuzvzI7",
        status: "pending",
      });
      // find was NOT called (deterministic hit on tier 1)
      expect(CheckoutSessionModel.find).not.toHaveBeenCalled();
      expect(CheckoutSessionModel.updateOne).toHaveBeenCalledWith(
        { _id: "cs_exact_1", status: "pending" },
        { $set: expect.objectContaining({ status: "failed" }) },
      );
    });

    it("falls through to tenantId/customer when order_reference does not match any pending session", async () => {
      // order_reference present but no matching session (already completed/expired)
      (CheckoutSessionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(null),
      );
      // Tier 2: tenantId lookup → exactly one pending session
      (CheckoutSessionModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain([{ _id: "cs_fb_tenant", status: "pending", tenantId: TENANT_ID }]),
      );

      const event = makeEvent({
        id: "evt_or_fb_1",
        type: "payment_intent.payment_failed",
        rawObject: {
          customer: CUSTOMER_ID,
          payment_details: {
            order_reference: "cs_completed_session",
          },
          metadata: { tenantId: TENANT_ID },
          last_payment_error: { message: "Declined" },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      // Tier 1: tried order_reference → null
      expect(CheckoutSessionModel.findOne).toHaveBeenCalledWith({
        providerSessionId: "cs_completed_session",
        status: "pending",
      });
      // Tier 2: tried tenantId → found exactly one
      expect(CheckoutSessionModel.find).toHaveBeenCalledWith({
        tenantId: expect.anything(),
        status: "pending",
      });
      expect(CheckoutSessionModel.updateOne).toHaveBeenCalledWith(
        { _id: "cs_fb_tenant", status: "pending" },
        { $set: expect.objectContaining({ status: "failed" }) },
      );
    });
  });

  describe("payment_intent.payment_failed — ambiguous multi-session rejection", () => {
    it("rejects correlation when two pending sessions share the same providerCustomerId", async () => {
      // This is the exact production scenario: two pending sessions for the same customer.
      // Without order_reference, the handler MUST NOT pick one arbitrarily.
      const eventRecord = {
        _id: "rec_ambig_1",
        status: "received",
        processingErrors: [],
        save: vi.fn().mockResolvedValue(undefined),
      };
      (PaymentEventModel.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        eventRecord,
      );

      // Tier 1: no order_reference → skipped
      // Tier 2: no metadata.tenantId → skipped
      // Tier 3: customer has 2 pending sessions → ambiguous → reject
      (CheckoutSessionModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain([
          { _id: "cs_ambig_a", status: "pending", providerCustomerId: CUSTOMER_ID },
          { _id: "cs_ambig_b", status: "pending", providerCustomerId: CUSTOMER_ID },
        ]),
      );

      const event = makeEvent({
        id: "evt_ambig_1",
        type: "payment_intent.payment_failed",
        rawObject: {
          customer: CUSTOMER_ID,
          last_payment_error: { message: "Declined" },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      // MUST NOT update either session
      expect(CheckoutSessionModel.updateOne).not.toHaveBeenCalled();
      expect(eventRecord.status).toBe("failed");
      expect(eventRecord.processingErrors).toContainEqual(
        expect.stringContaining("No pending CheckoutSession found"),
      );
    });

    it("rejects correlation when two pending sessions share the same tenantId", async () => {
      const eventRecord = {
        _id: "rec_ambig_2",
        status: "received",
        processingErrors: [],
        save: vi.fn().mockResolvedValue(undefined),
      };
      (PaymentEventModel.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        eventRecord,
      );

      // Tier 1: no order_reference → skipped
      // Tier 2: tenantId has 2 pending sessions → ambiguous → reject
      (CheckoutSessionModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain([
          { _id: "cs_tenant_a", status: "pending", tenantId: TENANT_ID },
          { _id: "cs_tenant_b", status: "pending", tenantId: TENANT_ID },
        ]),
      );

      const event = makeEvent({
        id: "evt_ambig_2",
        type: "payment_intent.payment_failed",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          last_payment_error: { message: "Declined" },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(CheckoutSessionModel.updateOne).not.toHaveBeenCalled();
      expect(eventRecord.status).toBe("failed");
    });

    it("succeeds via order_reference even when customer has multiple pending sessions", async () => {
      // The exact production scenario: two pending sessions for same customer,
      // but order_reference disambiguates to the correct one.
      (CheckoutSessionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain({
          _id: "cs_target",
          providerSessionId: "cs_test_a1X2sh462MQExU0cLbyRZd17ITCpkK6Q7ejXjQH0jgMDDnLLVF4yuzvzI7",
          status: "pending",
          tenantId: TENANT_ID,
          providerCustomerId: CUSTOMER_ID,
        }),
      );

      const event = makeEvent({
        id: "evt_target_1",
        type: "payment_intent.payment_failed",
        rawObject: {
          id: "pi_target",
          customer: CUSTOMER_ID,
          payment_details: {
            order_reference: "cs_test_a1X2sh462MQExU0cLbyRZd17ITCpkK6Q7ejXjQH0jgMDDnLLVF4yuzvzI7",
          },
          metadata: {},
          last_payment_error: { message: "Declined" },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      // Tier 1 hit: deterministic lookup by order_reference
      expect(CheckoutSessionModel.findOne).toHaveBeenCalledWith({
        providerSessionId: "cs_test_a1X2sh462MQExU0cLbyRZd17ITCpkK6Q7ejXjQH0jgMDDnLLVF4yuzvzI7",
        status: "pending",
      });
      // find was NOT called — order_reference was sufficient
      expect(CheckoutSessionModel.find).not.toHaveBeenCalled();
      expect(CheckoutSessionModel.updateOne).toHaveBeenCalledWith(
        { _id: "cs_target", status: "pending" },
        { $set: expect.objectContaining({ status: "failed" }) },
      );
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

  describe("TEST 1: cancellation via portal — cancel_at_period_end + cancel_at", () => {
    it("persists cancelAtPeriodEnd=true, cancelledAt timestamp, and keeps status ACTIVE", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "ACTIVE" })),
      );

      const cancelAtTs = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
      const event = makeEvent({
        id: "evt_cancel_1",
        type: "customer.subscription.updated",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          status: "active",
          cancel_at_period_end: true,
          cancel_at: cancelAtTs,
          current_period_end: cancelAtTs,
          id: STRIPE_SUB_ID,
          customer: CUSTOMER_ID,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).not.toHaveBeenCalled();
      const updateArgs = (SubscriptionModel.updateOne as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(updateArgs[0]).toEqual({ tenantId: expect.anything() });
      expect(updateArgs[1].$set).toMatchObject({
        cancelAtPeriodEnd: true,
        cancelledAt: new Date(cancelAtTs * 1000),
        periodEnd: new Date(cancelAtTs * 1000),
        paymentState: "paid",
        lastProviderEventId: "evt_cancel_1",
      });
    });
  });

  describe("TEST 2: cancel_at_period_end cleared — subscription stays active", () => {
    it("clears cancelAtPeriodEnd and cancelledAt when cancel_at_period_end changes to false", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "ACTIVE" })),
      );

      const event = makeEvent({
        id: "evt_cancel_clear_1",
        type: "customer.subscription.updated",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          status: "active",
          cancel_at_period_end: false,
          cancel_at: 0,
          id: STRIPE_SUB_ID,
          customer: CUSTOMER_ID,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).not.toHaveBeenCalled();
      const updateArgs = (SubscriptionModel.updateOne as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(updateArgs[1].$set).toMatchObject({
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        paymentState: "paid",
      });
    });
  });

  describe("TEST 3: customer.subscription.deleted expires subscription", () => {
    it("transitions ACTIVE → EXPIRED with paymentState failed", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "ACTIVE" })),
      );

      const event = makeEvent({
        id: "evt_delete_1",
        type: "customer.subscription.deleted",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          id: STRIPE_SUB_ID,
          customer: CUSTOMER_ID,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).toHaveBeenCalledWith(
        TENANT_ID,
        "EXPIRED",
        expect.objectContaining({ triggeredBy: "provider_event" }),
      );
      const updateArgs = (SubscriptionModel.updateOne as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(updateArgs[1].$set).toMatchObject({ paymentState: "failed" });
    });

    it("transitions CANCEL_AT_PERIOD_END → EXPIRED when period ends", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "CANCEL_AT_PERIOD_END" })),
      );

      const event = makeEvent({
        id: "evt_delete_2",
        type: "customer.subscription.deleted",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          id: STRIPE_SUB_ID,
          customer: CUSTOMER_ID,
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

  describe("TEST 4: duplicate customer.subscription.updated is idempotent", () => {
    it("processes only once — duplicate is skipped", async () => {
      (PaymentEventModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain({ eventId: "evt_dup_csu_1" }),
      );

      const event = makeEvent({
        id: "evt_dup_csu_1",
        type: "customer.subscription.updated",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          status: "active",
          cancel_at_period_end: true,
          cancel_at: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).not.toHaveBeenCalled();
      expect(SubscriptionModel.updateOne).not.toHaveBeenCalled();
    });
  });

  describe("TEST 5: event timestamp ordering — lastProviderEventTimestamp is persisted", () => {
    it("stores event.timestamp as lastProviderEventTimestamp", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "ACTIVE" })),
      );

      const eventTimestamp = new Date("2026-08-01T12:00:00Z");
      const event = makeEvent({
        id: "evt_ts_1",
        type: "customer.subscription.updated",
        timestamp: eventTimestamp,
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          status: "active",
          cancel_at_period_end: true,
          cancel_at: Math.floor(eventTimestamp.getTime() / 1000) + 30 * 24 * 60 * 60,
          id: STRIPE_SUB_ID,
          customer: CUSTOMER_ID,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      const updateArgs = (SubscriptionModel.updateOne as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(updateArgs[1].$set).toMatchObject({
        lastProviderEventTimestamp: eventTimestamp,
      });
    });
  });

  describe("TEST 6: ACTIVE → ACTIVE metadata-only update — no error", () => {
    it("does not call transitionSubscription and persists metadata", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "ACTIVE" })),
      );

      const event = makeEvent({
        id: "evt_meta_1",
        type: "customer.subscription.updated",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          status: "active",
          cancel_at_period_end: true,
          cancel_at: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          id: STRIPE_SUB_ID,
          customer: CUSTOMER_ID,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).not.toHaveBeenCalled();
      const updateArgs = (SubscriptionModel.updateOne as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(updateArgs[0]).toEqual({ tenantId: expect.anything() });
      expect(updateArgs[1].$set).toMatchObject({
        cancelAtPeriodEnd: true,
        paymentState: "paid",
      });
    });
  });

  describe("TEST 7: checkout.session.completed uses cs_... session ID", () => {
    it("queries CheckoutSession by the actual Stripe session ID, not event ID", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "TRIALING" })),
      );

      const event = makeEvent({
        id: "evt_csc_cs_1",
        type: "checkout.session.completed",
        rawObject: {
          id: "cs_test_session_abc123",
          metadata: { tenantId: TENANT_ID, packageId: "507f1f77bcf86cd799439012" },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(CheckoutSessionModel.updateOne).toHaveBeenCalledWith(
        { providerSessionId: "cs_test_session_abc123" },
        { $set: expect.objectContaining({ status: "completed" }) },
      );
    });
  });

  describe("TEST 8: payment failure preserves CheckoutSession metadata", () => {
    it("uses $set with individual metadata fields instead of replacing entire Map", async () => {
      (CheckoutSessionModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain([{ _id: "cs_meta_1", status: "pending", tenantId: TENANT_ID }]),
      );

      const event = makeEvent({
        id: "evt_pm_1",
        type: "payment_intent.payment_failed",
        rawObject: {
          metadata: { tenantId: TENANT_ID, packageId: "pkg_1" },
          last_payment_error: { message: "Card declined" },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(CheckoutSessionModel.updateOne).toHaveBeenCalledWith(
        { _id: "cs_meta_1", status: "pending" },
        {
          $set: {
            status: "failed",
            "metadata.providerEventId": "evt_pm_1",
            "metadata.failureReason": "Card declined",
          },
        },
      );
    });

    it("checkout.session.expired uses $set with individual metadata fields", async () => {
      const event = makeEvent({
        id: "evt_pm_2",
        type: "checkout.session.expired",
        rawObject: {
          id: "cs_exp_meta_1",
          metadata: { tenantId: TENANT_ID },
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(CheckoutSessionModel.updateOne).toHaveBeenCalledWith(
        { providerSessionId: "cs_exp_meta_1" },
        {
          $set: {
            status: "expired",
            "metadata.providerEventId": "evt_pm_2",
          },
        },
      );
    });
  });

  describe("TEST 9: past_due status sets paymentState to failed", () => {
    it("maps Stripe past_due to paymentState failed, not paid", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "ACTIVE" })),
      );

      const event = makeEvent({
        id: "evt_pd_1",
        type: "customer.subscription.updated",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          status: "past_due",
          cancel_at_period_end: false,
          id: STRIPE_SUB_ID,
          customer: CUSTOMER_ID,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      expect(transitionSubscription).toHaveBeenCalledWith(
        TENANT_ID,
        "PAST_DUE",
        expect.anything(),
      );
      const updateArgs = (SubscriptionModel.updateOne as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(updateArgs[1].$set).toMatchObject({ paymentState: "failed" });
    });

    it("maps Stripe unpaid to paymentState failed via PAST_DUE", async () => {
      (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
        mockQueryChain(makeSub({ status: "PAST_DUE" })),
      );

      const event = makeEvent({
        id: "evt_pd_2",
        type: "customer.subscription.updated",
        rawObject: {
          metadata: { tenantId: TENANT_ID },
          status: "unpaid",
          cancel_at_period_end: false,
          id: STRIPE_SUB_ID,
          customer: CUSTOMER_ID,
        },
      });
      await handlePaymentEvent(event, "{}", "sig");

      const updateArgs = (SubscriptionModel.updateOne as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(updateArgs[1].$set).toMatchObject({ paymentState: "failed" });
    });
  });
});
