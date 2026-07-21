import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mockSubscriptionModel = vi.hoisted(() => ({
  create: vi.fn(),
  findOne: vi.fn(),
  find: vi.fn(),
}));

const mockAuditWrite = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../../../db/models/subscription.model.js", () => ({
  default: mockSubscriptionModel,
}));

vi.mock("../../../common/observability/index.js", () => ({
  getAuditWriter: () => ({ write: mockAuditWrite }),
}));

// ── Imports under test ───────────────────────────────────────────────────────

import {
  createSubscription,
  transitionSubscription,
  getSubscription,
  listSubscriptions,
  getLegalTransitions,
} from "../subscription.service.js";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for future test expansion
import { AppError } from "../../../common/errors/AppError.js";
import type { SubscriptionStatus } from "../billing.types.js";

// ── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = "507f1f77bcf86cd799439011";
const PACKAGE_ID = "507f1f77bcf86cd799439012";
const SUB_ID = "507f1f77bcf86cd799439013";

// All 9 subscription statuses
const ALL_STATUSES: SubscriptionStatus[] = [
  "TRIALING",
  "INCOMPLETE",
  "ACTIVE",
  "PAST_DUE",
  "PAUSED",
  "CANCEL_AT_PERIOD_END",
  "CANCELED",
  "EXPIRED",
  "UNPAID",
];

// Mirror of LEGAL_TRANSITIONS from subscription.service.ts
const LEGAL: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  TRIALING: ["ACTIVE", "INCOMPLETE", "PAST_DUE", "CANCEL_AT_PERIOD_END"],
  INCOMPLETE: ["ACTIVE", "PAST_DUE", "EXPIRED"],
  ACTIVE: ["PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END", "EXPIRED"],
  PAST_DUE: ["ACTIVE", "PAUSED", "EXPIRED", "UNPAID"],
  PAUSED: ["ACTIVE", "EXPIRED"],
  "CANCEL_AT_PERIOD_END": ["ACTIVE", "CANCELED", "EXPIRED"],
  CANCELED: [],
  EXPIRED: ["ACTIVE", "UNPAID"],
  UNPAID: ["ACTIVE", "EXPIRED"],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function queryChainExec<T>(result: T) {
  return { exec: vi.fn().mockResolvedValue(result) };
}

function queryChainLean<T>(result: T) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: any = { lean: vi.fn(), exec: vi.fn().mockResolvedValue(result) };
  query.lean.mockReturnValue(query);
  return query;
}

function queryChainLeanSort<T>(result: T) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: any = { sort: vi.fn(), lean: vi.fn(), exec: vi.fn().mockResolvedValue(result) };
  query.sort.mockReturnValue(query);
  query.lean.mockReturnValue(query);
  return query;
}

interface MockSub {
  _id: string;
  id: string;
  tenantId: string;
  packageId: string;
  packageVersion: number;
  status: string;
  startedAt: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string;
  providerCustomerId: string;
  providerSubscriptionId: string;
  providerPriceId: string;
  paymentState: string;
  lastProviderEventId: string;
  createdAt: Date;
  updatedAt: Date;
  save: ReturnType<typeof vi.fn>;
  toJSON: ReturnType<typeof vi.fn>;
}

function makeSubscription(overrides: Partial<Record<string, unknown>> = {}): MockSub {
  const base: Record<string, unknown> = {
    _id: SUB_ID,
    id: SUB_ID,
    tenantId: TENANT_ID,
    packageId: PACKAGE_ID,
    packageVersion: 1,
    status: "ACTIVE",
    startedAt: new Date("2025-01-01"),
    periodStart: null,
    periodEnd: null,
    trialStart: null,
    trialEnd: null,
    cancelledAt: null,
    cancellationReason: "",
    providerCustomerId: "",
    providerSubscriptionId: "",
    providerPriceId: "",
    paymentState: "pending",
    lastProviderEventId: "",
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  };

  const merged = { ...base, ...overrides };

  const sub: Record<string, unknown> = { ...merged };
  sub.save = vi.fn().mockResolvedValue(undefined);
  sub.toJSON = vi.fn(function () {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { save, toJSON, ...rest } = sub;
    return rest;
  });

  return sub as unknown as MockSub;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("SubscriptionService", () => {
  // ── createSubscription ──────────────────────────────────────────────────

  describe("createSubscription", () => {
    it("creates a subscription with default TRIALING status", async () => {
      const sub = makeSubscription({ status: "TRIALING", trialStart: new Date() });
      mockSubscriptionModel.create.mockResolvedValue(sub);

      const result = await createSubscription(TENANT_ID, PACKAGE_ID, 1);

      expect(result.status).toBe("TRIALING");
      expect(mockSubscriptionModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: expect.anything(),
          packageId: expect.anything(),
          packageVersion: 1,
          status: "TRIALING",
        }),
      );
    });

    it("accepts a custom status parameter", async () => {
      const sub = makeSubscription({ status: "ACTIVE" });
      mockSubscriptionModel.create.mockResolvedValue(sub);

      const result = await createSubscription(TENANT_ID, PACKAGE_ID, 1, "ACTIVE");

      expect(result.status).toBe("ACTIVE");
      expect(mockSubscriptionModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ACTIVE" }),
      );
    });
  });

  // ── transitionSubscription — legal paths ─────────────────────────────────

  describe("transitionSubscription", () => {
    describe("legal transitions (all must succeed)", () => {
      // Build test cases: every legal (from→to) pair
      const legalCases = ALL_STATUSES.flatMap((from) =>
        LEGAL[from].map((to) => ({ from, to })),
      );

      it.each(legalCases)("$from → $to", async ({ from, to }) => {
        const sub = makeSubscription({ status: from });
        mockSubscriptionModel.findOne.mockReturnValue(queryChainExec(sub));

        const result = await transitionSubscription(TENANT_ID, to as SubscriptionStatus);

        expect(result.status).toBe(to);
        expect(sub.save).toHaveBeenCalledOnce();
      });
    });

    // ── transitionSubscription — illegal paths ───────────────────────────────

    describe("illegal transitions (all must throw 400)", () => {
      const illegalCases = ALL_STATUSES.flatMap((from) =>
        ALL_STATUSES.filter((to) => !LEGAL[from].includes(to)).map((to) => ({ from, to })),
      );

      it.each(illegalCases)("$from → $to throws BAD_REQUEST", async ({ from, to }) => {
        const sub = makeSubscription({ status: from });
        mockSubscriptionModel.findOne.mockReturnValue(queryChainExec(sub));

        await expect(
          transitionSubscription(TENANT_ID, to as SubscriptionStatus),
        ).rejects.toMatchObject({ statusCode: 400, code: "BAD_REQUEST" });
      });
    });

    // ── transitionSubscription — not found ─────────────────────────────────

    it("throws 404 when no subscription exists for the tenant", async () => {
      mockSubscriptionModel.findOne.mockReturnValue(queryChainExec(null));

      await expect(
        transitionSubscription(TENANT_ID, "ACTIVE" as SubscriptionStatus),
      ).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
    });

    // ── transitionSubscription — side effects ──────────────────────────────

    describe("side-effect fields", () => {
      it("TRIALING → ACTIVE sets trialEnd", async () => {
        const before = new Date();
        const sub = makeSubscription({ status: "TRIALING", trialStart: before, trialEnd: null });
        mockSubscriptionModel.findOne.mockReturnValue(queryChainExec(sub));

        const result = await transitionSubscription(TENANT_ID, "ACTIVE" as SubscriptionStatus);

        expect(result.status).toBe("ACTIVE");
        expect(sub.trialEnd).not.toBeNull();
        expect(sub.trialEnd instanceof Date).toBe(true);
      });

      it("CANCEL_AT_PERIOD_END → CANCELED sets cancelledAt", async () => {
        const sub = makeSubscription({ status: "CANCEL_AT_PERIOD_END", cancelledAt: null });
        mockSubscriptionModel.findOne.mockReturnValue(queryChainExec(sub));

        const result = await transitionSubscription(TENANT_ID, "CANCELED" as SubscriptionStatus);

        expect(result.status).toBe("CANCELED");
        expect(sub.cancelledAt).not.toBeNull();
        expect(sub.cancelledAt instanceof Date).toBe(true);
      });

      it("EXPIRED transition sets periodEnd to now", async () => {
        const sub = makeSubscription({ status: "ACTIVE", periodEnd: null });
        mockSubscriptionModel.findOne.mockReturnValue(queryChainExec(sub));

        const result = await transitionSubscription(TENANT_ID, "EXPIRED" as SubscriptionStatus);

        expect(result.status).toBe("EXPIRED");
        expect(sub.periodEnd).not.toBeNull();
        expect(sub.periodEnd instanceof Date).toBe(true);
      });

      it("supports options.packageId and options.packageVersion", async () => {
        const newPkgId = "507f1f77bcf86cd799439099";
        const sub = makeSubscription({ status: "ACTIVE", packageVersion: 1 });
        mockSubscriptionModel.findOne.mockReturnValue(queryChainExec(sub));

        const result = await transitionSubscription(
          TENANT_ID,
          "EXPIRED" as SubscriptionStatus,
          { packageId: newPkgId, packageVersion: 2 },
        );

        // Update should have been applied to the document
        expect(result.status).toBe("EXPIRED");
      });

      it("other transitions (e.g. ACTIVE→PAST_DUE) do not set trialEnd/cancelledAt", async () => {
        const sub = makeSubscription({
          status: "ACTIVE",
          trialEnd: null,
          cancelledAt: null,
        });
        mockSubscriptionModel.findOne.mockReturnValue(queryChainExec(sub));

        const result = await transitionSubscription(TENANT_ID, "PAST_DUE" as SubscriptionStatus);

        expect(result.status).toBe("PAST_DUE");
        expect(sub.trialEnd).toBeNull();
        expect(sub.cancelledAt).toBeNull();
      });
    });

    // ── transitionSubscription — options propagation ───────────────────────

    it("accepts TransitionOptions (reason, triggeredBy, providerEventId, periodEnd)", async () => {
      const sub = makeSubscription({ status: "ACTIVE" });
      mockSubscriptionModel.findOne.mockReturnValue(queryChainExec(sub));

      const result = await transitionSubscription(
        TENANT_ID,
        "PAST_DUE" as SubscriptionStatus,
        {
          reason: "Payment failed",
          triggeredBy: "provider_event",
          providerEventId: "evt_123",
          periodEnd: new Date("2025-06-01"),
        },
      );

      expect(result.status).toBe("PAST_DUE");
    });
  });

  // ── getSubscription ─────────────────────────────────────────────────────

  describe("getSubscription", () => {
    it("returns a subscription for the given tenant", async () => {
      const sub = makeSubscription();
      mockSubscriptionModel.findOne.mockReturnValue(queryChainLean(sub));

      const result = await getSubscription(TENANT_ID);

      expect(result).toBeDefined();
      expect(result.tenantId).toBe(TENANT_ID);
    });

    it("throws 404 when no subscription exists", async () => {
      mockSubscriptionModel.findOne.mockReturnValue(queryChainLean(null));

      await expect(getSubscription("nonexistent")).rejects.toMatchObject({
        statusCode: 404,
        code: "NOT_FOUND",
      });
    });
  });

  // ── listSubscriptions ───────────────────────────────────────────────────

  describe("listSubscriptions", () => {
    it("returns all subscriptions when no filter is provided", async () => {
      const subs = [makeSubscription(), makeSubscription({ _id: "a00000000000000000000002", id: "a00000000000000000000002" })];
      mockSubscriptionModel.find.mockReturnValue(queryChainLeanSort(subs));

      const result = await listSubscriptions();

      expect(result).toHaveLength(2);
      expect(mockSubscriptionModel.find).toHaveBeenCalledWith({});
    });

    it("filters by status when provided", async () => {
      const sub = makeSubscription({ status: "TRIALING" });
      mockSubscriptionModel.find.mockReturnValue(queryChainLeanSort([sub]));

      const result = await listSubscriptions({ status: "TRIALING" });

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe("TRIALING");
      expect(mockSubscriptionModel.find).toHaveBeenCalledWith({ status: "TRIALING" });
    });

    it("filters by tenantId when provided", async () => {
      mockSubscriptionModel.find.mockReturnValue(queryChainLeanSort([]));

      const result = await listSubscriptions({ tenantId: TENANT_ID });

      expect(result).toHaveLength(0);
      expect(mockSubscriptionModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: expect.anything() }),
      );
    });

    it("combines status and tenantId filter", async () => {
      mockSubscriptionModel.find.mockReturnValue(queryChainLeanSort([]));

      await listSubscriptions({ status: "ACTIVE", tenantId: TENANT_ID });

      expect(mockSubscriptionModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ACTIVE", tenantId: expect.anything() }),
      );
    });
  });

  // ── getLegalTransitions ─────────────────────────────────────────────────

  describe("getLegalTransitions", () => {
    it("returns correct targets for every status", () => {
      for (const status of ALL_STATUSES) {
        const targets = getLegalTransitions(status);
        expect(targets).toEqual(LEGAL[status]);
      }
    });
  });
});
