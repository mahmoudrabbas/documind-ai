import { describe, expect, it } from "vitest";
import {
  migrateSubscriptionHistoryIndex,
  type SubscriptionIndexCollection,
} from "../migrate-subscription-history-index.js";

const effectiveStatuses = ["TRIALING", "INCOMPLETE", "ACTIVE", "PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END"];
const target = {
  name: "uq_tenant_effective_subscription",
  key: { tenantId: 1 },
  unique: true,
  partialFilterExpression: { status: { $in: effectiveStatuses } },
};

function database(initial: Array<Record<string, unknown>>, duplicateCount = 0) {
  const state = initial.map((index) => structuredClone(index));
  const collection: SubscriptionIndexCollection = {
    async indexes() { return structuredClone(state) as never; },
    async createIndex(key, options) {
      state.push({ key, ...structuredClone(options) });
      return String(options.name);
    },
    async dropIndex(name) {
      const index = state.findIndex((candidate) => candidate.name === name);
      if (index >= 0) state.splice(index, 1);
    },
    aggregate() {
      return { async toArray() { return duplicateCount ? [{ count: duplicateCount }] : []; } } as never;
    },
  };
  return { db: { collection: () => collection }, state };
}

describe("subscription history index migration", () => {
  it("reports an unrestricted legacy index even when the valid target already exists", async () => {
    const fixture = database([
      { name: "_id_", key: { _id: 1 }, unique: true },
      target,
      { name: "tenantId_1", key: { tenantId: 1 }, unique: true },
    ]);
    const report = await migrateSubscriptionHistoryIndex(fixture.db, false);
    expect(report).toMatchObject({
      existing: [target.name],
      obsolete: ["tenantId_1"],
      dropped: [],
      conflicts: [],
      businessDocumentsMutated: 0,
    });
  });

  it("creates and verifies the partial index before dropping every obsolete tenant-unique index", async () => {
    const fixture = database([
      { name: "_id_", key: { _id: 1 }, unique: true },
      { name: "tenantId_1", key: { tenantId: 1 }, unique: true },
    ]);
    const report = await migrateSubscriptionHistoryIndex(fixture.db, true);
    expect(report.created).toEqual([target.name]);
    expect(report.dropped).toEqual(["tenantId_1"]);
    expect(fixture.state).toContainEqual(target);
    expect(fixture.state).not.toContainEqual(expect.objectContaining({ name: "tenantId_1" }));

    const replay = await migrateSubscriptionHistoryIndex(fixture.db, true);
    expect(replay).toMatchObject({ existing: [target.name], created: [], dropped: [], obsolete: [] });
  });

  it("fails before changing indexes when effective subscriptions conflict", async () => {
    const fixture = database([{ name: "tenantId_1", key: { tenantId: 1 }, unique: true }], 2);
    await expect(migrateSubscriptionHistoryIndex(fixture.db, true)).rejects.toThrow("SUBSCRIPTION_INDEX_MIGRATION_CONFLICT");
    expect(fixture.state).toEqual([{ name: "tenantId_1", key: { tenantId: 1 }, unique: true }]);
  });

  it("fails closed when the target name has the wrong definition", async () => {
    const fixture = database([{ ...target, partialFilterExpression: undefined }]);
    await expect(migrateSubscriptionHistoryIndex(fixture.db, true)).rejects.toThrow("SUBSCRIPTION_INDEX_MIGRATION_CONFLICT");
    expect(fixture.state).toHaveLength(1);
  });
});
