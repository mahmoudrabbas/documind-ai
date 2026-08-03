import { describe, expect, it } from "vitest";
import SubscriptionModel from "../models/subscription.model.js";

const effectiveStatuses = ["TRIALING", "INCOMPLETE", "ACTIVE", "PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END"];

describe("Subscription production model indexes", () => {
  it("defines only the partial tenant uniqueness constraint", () => {
    const indexes = SubscriptionModel.schema.indexes() as Array<[Record<string, number>, Record<string, unknown>]>;
    const tenantUnique = indexes.filter(([key, options]) => key.tenantId === 1 && options.unique === true);
    expect(tenantUnique).toHaveLength(1);
    expect(tenantUnique[0]).toEqual([
      { tenantId: 1 },
      expect.objectContaining({
        unique: true,
        name: "uq_tenant_effective_subscription",
        partialFilterExpression: { status: { $in: effectiveStatuses } },
      }),
    ]);
    expect(SubscriptionModel.schema.path("tenantId").options.unique).not.toBe(true);
    expect(indexes.some(([, options]) => options.name === "tenantId_1")).toBe(false);
  });
});
