import { describe, expect, it } from "vitest";
import type { SubscriptionStatus } from "../../db/models/subscription.model.js";
import {
  SERVICEABLE_STATUSES,
  isServiceablePaymentState,
  isServiceableStatus,
} from "./subscription-status-policy.js";

describe("subscription-status-policy", () => {
  describe("SERVICEABLE_STATUSES", () => {
    it("contains exactly the four serviceable statuses", () => {
      expect(SERVICEABLE_STATUSES.size).toBe(4);
      expect(SERVICEABLE_STATUSES.has("ACTIVE")).toBe(true);
      expect(SERVICEABLE_STATUSES.has("TRIALING")).toBe(true);
      expect(SERVICEABLE_STATUSES.has("CANCEL_AT_PERIOD_END")).toBe(true);
      expect(SERVICEABLE_STATUSES.has("PAST_DUE")).toBe(true);
    });
  });

  describe("isServiceableStatus", () => {
    it("returns true for the four serviceable statuses", () => {
      for (const status of SERVICEABLE_STATUSES) {
        expect(isServiceableStatus(status)).toBe(true);
      }
    });

    it("returns false for the other five statuses", () => {
      expect(isServiceableStatus("CANCELED")).toBe(false);
      expect(isServiceableStatus("EXPIRED")).toBe(false);
      expect(isServiceableStatus("UNPAID")).toBe(false);
      expect(isServiceableStatus("INCOMPLETE")).toBe(false);
      expect(isServiceableStatus("PAUSED")).toBe(false);
    });

    it("returns false for an unknown status string without throwing", () => {
      expect(
        isServiceableStatus("SOME_UNKNOWN_STATUS" as SubscriptionStatus),
      ).toBe(false);
    });
  });

  describe("isServiceablePaymentState", () => {
    it("returns false for refunded", () => {
      expect(isServiceablePaymentState("refunded")).toBe(false);
    });

    it("returns true for paid", () => {
      expect(isServiceablePaymentState("paid")).toBe(true);
    });

    it("returns true for pending and failed (transient states delegated to the status policy)", () => {
      expect(isServiceablePaymentState("pending")).toBe(true);
      expect(isServiceablePaymentState("failed")).toBe(true);
    });
  });
});
