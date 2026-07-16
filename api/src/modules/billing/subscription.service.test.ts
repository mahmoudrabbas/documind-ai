import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

const { mockSubCreate, mockSubFindOne, mockPkgFindOne } = vi.hoisted(() => ({
  mockSubCreate: vi.fn(),
  mockSubFindOne: vi.fn(),
  mockPkgFindOne: vi.fn(),
}));

const mockAuditCreate = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../../db/models/subscription.model.js", () => ({
  default: {
    create: mockSubCreate,
    findOne: mockSubFindOne,
    find: vi.fn(),
  },
}));

vi.mock("../../db/models/package.model.js", () => ({
  default: {
    findOne: mockPkgFindOne,
    findById: vi.fn(),
    find: vi.fn(),
  },
}));

vi.mock("../../db/models/auditLog.model.js", () => ({
  default: { create: mockAuditCreate },
}));

import * as subscriptionService from "./subscription.service.js";
import type { SubscriptionStatus } from "./billing.types.js";
import { LegalTransition } from "./billing.types.js";
import { AppError } from "../../common/errors/AppError.js";
import type { AuthIdentity } from "../auth/auth.types.js";

const actor: AuthIdentity = {
  userId: "u1",
  tenantId: "t1",
  role: "admin",
  email: "admin@test.com",
};

const VALID_OID = "507f1f77bcf86cd799439011";

function fakeSubDoc(overrides: Record<string, unknown> = {}) {
  const doc: Record<string, unknown> = {
    _id: VALID_OID,
    tenantId: VALID_OID,
    packageId: VALID_OID,
    packageVersion: 1,
    status: "TRIALING",
    startedAt: new Date(),
    periodStart: new Date(),
    periodEnd: new Date(Date.now() + 30 * 86400000),
    trialStart: new Date(),
    trialEnd: new Date(Date.now() + 30 * 86400000),
    save: vi.fn().mockResolvedValue(undefined),
    toJSON: vi.fn(),
    ...overrides,
  };
  doc.toJSON = vi.fn().mockReturnValue(doc);
  return doc;
}

function fakePkgDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: "p1",
    name: "Test Pkg",
    code: "test",
    active: true,
    version: 1,
    entitlements: {
      employees: 3,
      admins: 1,
      documents: 50,
      storageMb: 100,
      fileSizeMb: 10,
      queriesPerMonth: 500,
      tokensPerMonth: 0,
      ocrPagesPerMonth: 0,
    },
    ...overrides,
  };
}

function leanChain<T>(resolveValue: T) {
  const chain: Record<string, Mock | (() => Record<string, Mock>)> = {};
  chain.lean = vi.fn(() => chain);
  chain.exec = vi.fn().mockResolvedValue(resolveValue);
  return chain;
}

describe("SubscriptionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createSubscription", () => {
    it("creates a subscription with TRIALING status", async () => {
      mockPkgFindOne.mockReturnValue(leanChain(fakePkgDoc()));
      const expected = fakeSubDoc();
      mockSubCreate.mockResolvedValue(expected);

      const result = await subscriptionService.createSubscription(VALID_OID, VALID_OID, actor);

      expect(mockPkgFindOne).toHaveBeenCalledWith({ _id: VALID_OID, active: true });
      expect(mockSubCreate).toHaveBeenCalledTimes(1);
      const createArg = mockSubCreate.mock.calls[0][0];
      expect(createArg.status).toBe("TRIALING");
      expect(createArg.tenantId.toString()).toBe(VALID_OID);
      expect(createArg.packageId.toString()).toBe(VALID_OID);
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({ action: "SUBSCRIPTION_CREATED" }),
      );
      expect(result).toEqual(expected);
    });

    it("throws when package is not found or inactive", async () => {
      mockPkgFindOne.mockReturnValue(leanChain(null));

      await expect(
        subscriptionService.createSubscription(VALID_OID, "aaaaaaaaaaaaaaaaaaaaaaaa", actor),
      ).rejects.toThrow(AppError);
    });

    it("accepts undefined actor (no audit trail)", async () => {
      mockPkgFindOne.mockReturnValue(leanChain(fakePkgDoc()));
      mockSubCreate.mockResolvedValue(fakeSubDoc());

      await subscriptionService.createSubscription(VALID_OID, VALID_OID, undefined);

      expect(mockAuditCreate).not.toHaveBeenCalled();
    });
  });

  describe("transitionSubscription", () => {
    it("rejects an illegal transition", async () => {
      mockSubFindOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(fakeSubDoc({ status: "TRIALING" })),
      });

      await expect(
        subscriptionService.transitionSubscription(VALID_OID, "UNPAID" as SubscriptionStatus, { actor }),
      ).rejects.toThrow("Cannot transition from TRIALING to UNPAID");
    });

    it("allows a legal transition chain: TRIALING → ACTIVE → CANCELED", async () => {
      const sub = fakeSubDoc({ status: "TRIALING" });
      mockSubFindOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(sub),
      });

      // TRIALING → ACTIVE
      await subscriptionService.transitionSubscription(VALID_OID, "ACTIVE", { actor });
      expect(sub.status).toBe("ACTIVE");
      expect(sub.save).toHaveBeenCalledTimes(1);

      // Reset mocks for second transition
      vi.clearAllMocks();
      mockAuditCreate.mockResolvedValue(undefined);

      const sub2 = fakeSubDoc({ status: "ACTIVE" });
      mockSubFindOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(sub2),
      });

      // ACTIVE → CANCELED
      await subscriptionService.transitionSubscription(VALID_OID, "CANCELED", { actor, reason: "No longer needed" });
      expect(sub2.status).toBe("CANCELED");
      expect(sub2.cancelledAt).toBeInstanceOf(Date);
      expect(sub2.cancellationReason).toBe("No longer needed");
    });

    it("throws 404 when no subscription exists", async () => {
      mockSubFindOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      await expect(
        subscriptionService.transitionSubscription(VALID_OID, "ACTIVE", { actor }),
      ).rejects.toThrow("Subscription not found");
    });
  });

  describe("getSubscription", () => {
    it("returns the subscription when found", async () => {
      const sub = { _id: "sub-1", status: "ACTIVE" };
      const chain: Record<string, Mock | (() => Record<string, Mock>)> = {};
      chain.populate = vi.fn(() => chain);
      chain.lean = vi.fn(() => chain);
      chain.exec = vi.fn().mockResolvedValue(sub);
      mockSubFindOne.mockReturnValue(chain);

      const result = await subscriptionService.getSubscription(VALID_OID);
      expect(result).toEqual(sub);
    });

    it("throws 404 when not found", async () => {
      const chain: Record<string, Mock | (() => Record<string, Mock>)> = {};
      chain.populate = vi.fn(() => chain);
      chain.lean = vi.fn(() => chain);
      chain.exec = vi.fn().mockResolvedValue(null);
      mockSubFindOne.mockReturnValue(chain);

      await expect(subscriptionService.getSubscription(VALID_OID)).rejects.toThrow("Subscription not found");
    });
  });

  

  describe("exhaustive state machine (LegalTransition)", () => {
    const allStates: SubscriptionStatus[] = [
      "TRIALING", "INCOMPLETE", "ACTIVE", "PAST_DUE",
      "PAUSED", "CANCEL_AT_PERIOD_END", "CANCELED", "EXPIRED", "UNPAID",
    ];

    for (const from of allStates) {
      const allowed = LegalTransition[from] ?? [];
      for (const to of allStates) {
        const shouldPass = allowed.includes(to);
        it(`${shouldPass ? "allows" : "rejects"} transition ${from} → ${to}`, async () => {
          const sub = fakeSubDoc({ status: from });
          mockSubFindOne.mockReturnValue({
            exec: vi.fn().mockResolvedValue(shouldPass || from === to ? sub : null),
          });

          // Legal transitions go through; illegal ones throw
          if (shouldPass) {
            const result = await subscriptionService.transitionSubscription(VALID_OID, to, { actor });
            expect(result.status).toBe(to);
          } else if (from === to) {
            await expect(
              subscriptionService.transitionSubscription(VALID_OID, to, { actor }),
            ).rejects.toThrow();
          } else {
            mockSubFindOne.mockReturnValue({
              exec: vi.fn().mockResolvedValue(fakeSubDoc({ status: from })),
            });
            await expect(
              subscriptionService.transitionSubscription(VALID_OID, to, { actor }),
            ).rejects.toThrow();
          }
        });
      }
    }
  });
});
