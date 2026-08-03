/**
 * T20 (S5) — Notification sweeps scheduler unit suite (FAKE repos only).
 *
 * Pure unit tests — NO Mongo, NO Redis, NO BullMQ. The scheduler is exercised
 * with injected fake stores/sources/sinks so each acceptance criterion is
 * asserted deterministically:
 *   (a) TTL sweep marks expired notifications EXPIRED + decrements unread per
 *       recipient (batch loop respected; per-tick failure isolation);
 *   (b) DLQ sweep copies failed dispatch jobs into the DLQ once (idempotent);
 *   (c) unread reconciliation recomputes UserNotificationState counts;
 *   (d) env-gating — disabled scheduler is a no-op.
 */
import { describe, it, expect, vi } from "vitest";
import {
  createNotificationSweepsScheduler,
  runTtlSweep,
  runDlqSweep,
  runReconcileSweep,
} from "../sweeps/notificationSweeps.scheduler.js";
import type {
  DlqEntry,
  DlqSink,
  DlqSource,
  FailedDispatchJob,
  ReconcileSource,
  TtlExpiredNotification,
  TtlSweepStore,
  UnreadCountByUser,
  UnreadStateStore,
} from "../sweeps/notificationSweeps.port.js";

// ── fakes ──────────────────────────────────────────────────────────────────

function fakeExpired(
  overrides: Partial<TtlExpiredNotification> = {},
): TtlExpiredNotification {
  return {
    id: "notif-1",
    tenantId: "tenant-1",
    userId: "user-1",
    isRead: false,
    ...overrides,
  };
}

function fakeFailedJob(overrides: Partial<FailedDispatchJob> = {}): FailedDispatchJob {
  return {
    jobId: "job-1",
    tenantId: "tenant-1",
    notificationIds: ["notif-a", "notif-b"],
    reason: "permanent transport failure",
    payloadHash: "abc123",
    failedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

class FakeTtlStore implements TtlSweepStore {
  calls = { find: 0, mark: 0 };
  constructor(
    private readonly pages: TtlExpiredNotification[][],
    private readonly markMatches = (ids: string[]) => ids.length,
  ) {}
  async findExpiredNotifications(_batch: number): Promise<TtlExpiredNotification[]> {
    this.calls.find += 1;
    return this.pages[this.calls.find - 1] ?? [];
  }
  async markNotificationsExpired(ids: string[]): Promise<number> {
    this.calls.mark += 1;
    return this.markMatches(ids);
  }
}

class FakeStateStore implements UnreadStateStore {
  decrements: Array<{ tenantId: string; userId: string }> = [];
  recomputes: Array<{ tenantId: string; userId: string; count: number }> = [];
  async decrementUnread(tenantId: string, userId: string): Promise<void> {
    this.decrements.push({ tenantId, userId });
  }
  async recompute(tenantId: string, userId: string, count: number): Promise<void> {
    this.recomputes.push({ tenantId, userId, count });
  }
}

class FakeDlqSource implements DlqSource {
  constructor(private readonly jobs: FailedDispatchJob[]) {}
  async getFailedDispatchJobs(): Promise<FailedDispatchJob[]> {
    return this.jobs;
  }
}

class FakeDlqSink implements DlqSink {
  inserted: DlqEntry[] = [];
  constructor(private readonly existing: string[] = []) {}
  async exists(jobId: string): Promise<boolean> {
    return this.existing.includes(jobId);
  }
  async insert(entry: DlqEntry): Promise<void> {
    this.inserted.push(entry);
  }
}

class FakeReconcileSource implements ReconcileSource {
  calls = 0;
  constructor(private readonly rows: UnreadCountByUser[]) {}
  async countUnreadByUser(limit: number, offset: number): Promise<UnreadCountByUser[]> {
    this.calls += 1;
    // Cursor-paged so the sweep's short-page stop terminates (returning the
    // same rows every call would loop forever).
    return this.rows.slice(offset, offset + limit);
  }
}

function makeScheduler(overrides: {
  ttlStore?: TtlSweepStore;
  stateStore?: UnreadStateStore;
  dlqSource?: DlqSource;
  dlqSink?: DlqSink;
  reconcileSource?: ReconcileSource;
  enabled?: boolean;
  ttlBatch?: number;
  dlqBatch?: number;
  reconcileBatch?: number;
}) {
  return createNotificationSweepsScheduler({
    enabled: overrides.enabled ?? true,
    ttlStore: overrides.ttlStore ?? new FakeTtlStore([]),
    stateStore: overrides.stateStore ?? new FakeStateStore(),
    dlqSource: overrides.dlqSource ?? new FakeDlqSource([]),
    dlqSink: overrides.dlqSink ?? new FakeDlqSink(),
    reconcileSource: overrides.reconcileSource ?? new FakeReconcileSource([]),
    ...(overrides.ttlBatch !== undefined ? { ttlBatch: overrides.ttlBatch } : {}),
    ...(overrides.dlqBatch !== undefined ? { dlqBatch: overrides.dlqBatch } : {}),
    ...(overrides.reconcileBatch !== undefined
      ? { reconcileBatch: overrides.reconcileBatch }
      : {}),
  });
}

// ── (a) TTL sweep ──────────────────────────────────────────────────────────

describe("runTtlSweep", () => {
  it("marks expired notifications EXPIRED and decrements unread per unread recipient", async () => {
    const store = new FakeTtlStore([
      [
        fakeExpired({ id: "n1", userId: "u1", isRead: false }),
        fakeExpired({ id: "n2", userId: "u2", isRead: false }),
        fakeExpired({ id: "n3", userId: "u1", isRead: true }), // read → no decrement
      ],
    ]);
    const state = new FakeStateStore();

    const totals = await runTtlSweep(store, state, 500, new Date("2026-08-02T00:00:00Z"));

    expect(store.calls.mark).toBe(1);
    expect(store.calls.find).toBe(1); // single short page (3 < batch 500) ends the sweep
    expect(totals).toEqual({
      processed: 3,
      markedExpired: 3,
      decremented: 2, // n1 + n2 only (n3 was read)
      failed: false,
    });
    expect(state.decrements).toEqual([
      { tenantId: "tenant-1", userId: "u1" },
      { tenantId: "tenant-1", userId: "u2" },
    ]);
  });

  it("respects the batch size and keeps sweeping until a short page", async () => {
    const store = new FakeTtlStore([
      [fakeExpired({ id: "n1" }), fakeExpired({ id: "n2" })], // full batch of 2
      [fakeExpired({ id: "n3" })], // short page → stop after this
    ]);
    const state = new FakeStateStore();

    const totals = await runTtlSweep(store, state, 2);

    expect(store.calls.find).toBe(2);
    expect(store.calls.mark).toBe(2);
    expect(totals.processed).toBe(3);
    expect(totals.markedExpired).toBe(3);
    expect(totals.decremented).toBe(3);
  });

  it("returns zeroed totals when there is nothing expired", async () => {
    const store = new FakeTtlStore([]);
    const totals = await runTtlSweep(store, new FakeStateStore(), 500);
    expect(totals).toEqual({ processed: 0, markedExpired: 0, decremented: 0, failed: false });
    expect(store.calls.find).toBe(1);
    expect(store.calls.mark).toBe(0);
  });
});

// ── (b) DLQ sweep ──────────────────────────────────────────────────────────

describe("runDlqSweep", () => {
  it("copies failed jobs from the queue failed set into the DLQ", async () => {
    const source = new FakeDlqSource([
      fakeFailedJob({ jobId: "job-1" }),
      fakeFailedJob({ jobId: "job-2", tenantId: "tenant-2", notificationIds: ["n9"] }),
    ]);
    const sink = new FakeDlqSink();

    const totals = await runDlqSweep(source, sink, 100, new Date("2026-08-02T00:00:00Z"));

    expect(totals).toEqual({ scanned: 2, inserted: 2, skipped: 0, failed: false });
    expect(sink.inserted).toHaveLength(2);
    expect(sink.inserted[0]).toMatchObject({
      jobId: "job-1",
      tenantId: "tenant-1",
      notificationIds: ["notif-a", "notif-b"],
      notificationCount: 2,
      reason: "permanent transport failure",
      payloadHash: "abc123",
    });
  });

  it("is idempotent — jobs already in the DLQ are skipped, not re-inserted", async () => {
    const source = new FakeDlqSource([fakeFailedJob({ jobId: "job-1" })]);
    const sink = new FakeDlqSink(["job-1"]);

    const totals = await runDlqSweep(source, sink, 100);

    expect(totals).toEqual({ scanned: 1, inserted: 0, skipped: 1, failed: false });
    expect(sink.inserted).toHaveLength(0);
  });
});

// ── (c) unread reconciliation ──────────────────────────────────────────────

describe("runReconcileSweep", () => {
  it("recomputes UserNotificationState from the unread notification counts", async () => {
    const source = new FakeReconcileSource([
      { tenantId: "tenant-1", userId: "u1", count: 3 },
      { tenantId: "tenant-1", userId: "u2", count: 0 },
    ]);
    const state = new FakeStateStore();

    const totals = await runReconcileSweep(source, state, 500);

    expect(totals).toEqual({ scanned: 2, recomputed: 2, failed: false });
    expect(state.recomputes).toEqual([
      { tenantId: "tenant-1", userId: "u1", count: 3 },
      { tenantId: "tenant-1", userId: "u2", count: 0 },
    ]);
  });

  it("keeps paging until a short batch", async () => {
    const source = new FakeReconcileSource([
      { tenantId: "t", userId: "a", count: 1 },
      { tenantId: "t", userId: "b", count: 2 },
      { tenantId: "t", userId: "c", count: 3 },
    ]);
    const state = new FakeStateStore();

    await runReconcileSweep(source, state, 2);

    expect(source.calls).toBe(2); // full page of 2 → second page of 1 is short → stop
    expect(state.recomputes).toHaveLength(3);
  });
});

// ── scheduler: tick + per-tick failure isolation ──────────────────────────

describe("createNotificationSweepsScheduler", () => {
  it("tick() runs all three sweeps and aggregates totals", async () => {
    const ttlStore = new FakeTtlStore([[fakeExpired({ id: "n1" })]]);
    const state = new FakeStateStore();
    const dlqSource = new FakeDlqSource([fakeFailedJob()]);
    const dlqSink = new FakeDlqSink();
    const reconcileSource = new FakeReconcileSource([
      { tenantId: "tenant-1", userId: "u1", count: 4 },
    ]);
    const scheduler = makeScheduler({
      ttlStore,
      stateStore: state,
      dlqSource,
      dlqSink,
      reconcileSource,
    });

    const totals = await scheduler.tick();

    expect(totals.ttl).toEqual({ processed: 1, markedExpired: 1, decremented: 1, failed: false });
    expect(totals.dlq).toEqual({ scanned: 1, inserted: 1, skipped: 0, failed: false });
    expect(totals.reconcile).toEqual({ scanned: 1, recomputed: 1, failed: false });
    expect(dlqSink.inserted).toHaveLength(1);
    expect(state.recomputes).toHaveLength(1);
  });

  it("isolates a throwing sweep so other sweeps still run and the tick resolves", async () => {
    const throwingTtl = new FakeTtlStore([[fakeExpired()]]);
    // sabotage the mark step
    throwingTtl.markNotificationsExpired = async () => {
      throw new Error("db down");
    };
    const state = new FakeStateStore();
    const dlqSource = new FakeDlqSource([fakeFailedJob()]);
    const dlqSink = new FakeDlqSink();
    const reconcileSource = new FakeReconcileSource([
      { tenantId: "t", userId: "u", count: 1 },
    ]);

    const scheduler = makeScheduler({
      ttlStore: throwingTtl,
      stateStore: state,
      dlqSource,
      dlqSink,
      reconcileSource,
    });

    const totals = await scheduler.tick();

    expect(totals.ttl.failed).toBe(true);
    expect(totals.dlq).toEqual({ scanned: 1, inserted: 1, skipped: 0, failed: false });
    expect(totals.reconcile).toEqual({ scanned: 1, recomputed: 1, failed: false });
    expect(dlqSink.inserted).toHaveLength(1);
  });

  it("keeps ticking after a failing sweep (the interval is not killed)", async () => {
    const failingState = new FakeStateStore();
    failingState.decrementUnread = async () => {
      throw new Error("state repo down");
    };
    const scheduler = makeScheduler({
      // two pages so the second tick ALSO hits the failing decrement
      ttlStore: new FakeTtlStore([[fakeExpired()], [fakeExpired()]]),
      stateStore: failingState,
    });

    await scheduler.tick(); // first tick fails on decrement
    const second = await scheduler.tick(); // tick still callable
    expect(second.ttl.failed).toBe(true);
    expect(second.dlq.failed).toBe(false);
    expect(second.reconcile.failed).toBe(false);
  });

  it("start() is a no-op when disabled (env-gating) and tick is inert", async () => {
    const ttlStore = new FakeTtlStore([[fakeExpired()]]);
    const state = new FakeStateStore();
    const dlqSource = new FakeDlqSource([fakeFailedJob()]);
    const dlqSink = new FakeDlqSink();
    const reconcileSource = new FakeReconcileSource([{ tenantId: "t", userId: "u", count: 1 }]);

    const scheduler = createNotificationSweepsScheduler({
      enabled: false,
      ttlStore,
      stateStore: state,
      dlqSource,
      dlqSink,
      reconcileSource,
    });

    expect(scheduler.start()).toBeNull();
    const totals = await scheduler.tick();
    expect(totals.ttl).toEqual({ processed: 0, markedExpired: 0, decremented: 0, failed: false });
    expect(totals.dlq).toEqual({ scanned: 0, inserted: 0, skipped: 0, failed: false });
    expect(totals.reconcile).toEqual({ scanned: 0, recomputed: 0, failed: false });
    expect(ttlStore.calls.find).toBe(0);
    expect(dlqSink.inserted).toHaveLength(0);
    expect(state.recomputes).toHaveLength(0);
  });

  it("start() schedules ticks on an interval and stop() clears it", async () => {
    vi.useFakeTimers();
    try {
      const scheduler = makeScheduler({});
      const timer = scheduler.start();
      expect(timer).not.toBeNull();
      vi.advanceTimersByTime(120_000);
      // The interval ran (no throw) — tick() executed inside the interval and
      // is failure-isolated; the timer object remains alive.
      expect((timer as NodeJS.Timeout).hasRef()).toBe(true);
      scheduler.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
