import test from "node:test";
import assert from "node:assert";
import type { Model } from "mongoose";
import {
  requireTenantId,
  tenantScopedCreate,
  tenantScopedDeleteOne,
  tenantScopedFindById,
  tenantScopedFindOne,
  tenantScopedUpdateOne,
} from "./tenantScopedRepository.js";

interface FakeModel<T> {
  findOne: (filter: T) => { exec: () => Promise<T> };
  create: (document: T) => Promise<T>;
  updateOne: (filter: T, update: unknown, options?: unknown) => { exec: () => Promise<unknown> };
  deleteOne: (filter: T) => { exec: () => Promise<T> };
}

test("tenantScopedRepository helper", async (t) => {
  await t.test("requireTenantId accepts valid values", () => {
    assert.strictEqual(requireTenantId("tenant-123"), "tenant-123");
    assert.strictEqual(requireTenantId(" tenant-abc "), "tenant-abc");
  });

  await t.test("requireTenantId rejects invalid tenantId values", () => {
    for (const invalid of [undefined, null, "", "   ", 123]) {
      assert.throws(
        () => requireTenantId(invalid),
        {
          name: "AppError",
          message: "tenantId is required and must be a non-empty string",
        },
      );
    }
  });

  await t.test("tenantScopedFindOne applies tenantId to the query", async () => {
    const actuals: unknown[] = [];
    const model: FakeModel<Record<string, unknown>> = {
      findOne(filter) {
        actuals.push(filter);
        return { exec: async () => filter };
      },
      create: async () => ({} as Record<string, unknown>),
      updateOne: () => ({ exec: async () => ({}) }),
      deleteOne: () => ({ exec: async () => ({}) }),
    };

    const result = await tenantScopedFindOne(model as unknown as Model<Record<string, unknown>>, "tenant-1", { email: "alice@example.com" }).exec();

    assert.deepStrictEqual(result, { email: "alice@example.com", tenantId: "tenant-1" });
    assert.deepStrictEqual(actuals[0], { email: "alice@example.com", tenantId: "tenant-1" });
  });

  await t.test("tenantScopedFindById applies tenantId and id filters", async () => {
    const actuals: unknown[] = [];
    const model: FakeModel<Record<string, unknown>> = {
      findOne(filter) {
        actuals.push(filter);
        return { exec: async () => filter };
      },
      create: async () => ({} as Record<string, unknown>),
      updateOne: () => ({ exec: async () => ({}) }),
      deleteOne: () => ({ exec: async () => ({}) }),
    };

    const result = await tenantScopedFindById(model as unknown as Model<Record<string, unknown>>, "tenant-7", "123").exec();

    assert.deepStrictEqual(result, { _id: "123", tenantId: "tenant-7" });
    assert.deepStrictEqual(actuals[0], { _id: "123", tenantId: "tenant-7" });
  });

  await t.test("tenantScopedUpdateOne applies tenantId to the update filter", async () => {
    const actuals: unknown[] = [];
    const model: FakeModel<Record<string, unknown>> = {
      findOne: () => ({ exec: async () => ({}) }),
      create: async () => ({} as Record<string, unknown>),
      updateOne(filter, update, options) {
        actuals.push({ filter, update, options });
        return { exec: async () => ({ filter, update, options }) };
      },
      deleteOne: () => ({ exec: async () => ({}) }),
    };

    const result = await tenantScopedUpdateOne(
      model as unknown as Model<Record<string, unknown>>,
      "tenant-5",
      { userId: "user-1" },
      { $set: { status: "inactive" } },
      { upsert: true },
    ).exec();

    assert.deepStrictEqual(result, {
      filter: { userId: "user-1", tenantId: "tenant-5" },
      update: { $set: { status: "inactive" } },
      options: { upsert: true },
    });
    assert.deepStrictEqual(actuals[0], {
      filter: { userId: "user-1", tenantId: "tenant-5" },
      update: { $set: { status: "inactive" } },
      options: { upsert: true },
    });
  });

  await t.test("tenantScopedDeleteOne applies tenantId to the delete filter", async () => {
    const actuals: unknown[] = [];
    const model: FakeModel<Record<string, unknown>> = {
      findOne: () => ({ exec: async () => ({}) }),
      create: async () => ({} as Record<string, unknown>),
      updateOne: () => ({ exec: async () => ({}) }),
      deleteOne(filter) {
        actuals.push(filter);
        return { exec: async () => filter };
      },
    };

    const result = await tenantScopedDeleteOne(model as unknown as Model<Record<string, unknown>>, "tenant-8", { userId: "user-8" }).exec();

    assert.deepStrictEqual(result, { userId: "user-8", tenantId: "tenant-8" });
    assert.deepStrictEqual(actuals[0], { userId: "user-8", tenantId: "tenant-8" });
  });

  await t.test("tenantScopedCreate validates tenantId on create documents", async () => {
    const model: FakeModel<Record<string, unknown>> = {
      findOne: () => ({ exec: async () => ({}) }),
      create: async (document) => document,
      updateOne: () => ({ exec: async () => ({}) }),
      deleteOne: () => ({ exec: async () => ({}) }),
    };

    const document = { tenantId: "tenant-9", email: "bob@example.com" };
    const result = await tenantScopedCreate(model as unknown as Model<Record<string, unknown>>, document);

    assert.deepStrictEqual(result, document);
  });

  await t.test("tenantScopedCreate rejects documents with invalid tenantId", async () => {
    const model: FakeModel<Record<string, unknown>> = {
      findOne: () => ({ exec: async () => ({}) }),
      create: async (document) => document,
      updateOne: () => ({ exec: async () => ({}) }),
      deleteOne: () => ({ exec: async () => ({}) }),
    };

    await assert.rejects(
      async () => tenantScopedCreate(model as unknown as Model<Record<string, unknown>>, { tenantId: "", email: "bob@example.com" }),
      {
        name: "AppError",
        message: "tenantId is required and must be a non-empty string",
      },
    );
  });
});
