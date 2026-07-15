import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  PermissionEvaluator,
} from "./permissions.types.js";
import { InMemoryPermissionEvaluator } from "./permissions.evaluator.fake.js";

function contractTests(
  label: string,
  createEvaluator: () => PermissionEvaluator,
  cleanup?: () => Promise<void>,
) {
  test(`${label} — returns empty permissions for unknown user`, async () => {
    const evaluator = createEvaluator();
    const result = await evaluator.resolve(
      "unknown-user-id",
      "tenant-1",
    );
    assert.equal(result.permissions.size, 0);
    assert.equal(result.baseRole, "EMPLOYEE");
    await cleanup?.();
  });

  test(`${label} — SUPER_ADMIN gets all permissions`, async () => {
    const evaluator = createEvaluator();
    const fake = evaluator as unknown as InMemoryPermissionEvaluator;
    if (fake.addUser) {
      fake.addUser("sa-1", "tenant-1", "SUPER_ADMIN");
    }
    const result = await evaluator.resolve("sa-1", "tenant-1");
    assert.equal(result.baseRole, "SUPER_ADMIN");
    assert.ok(result.permissions.size > 10);
    await cleanup?.();
  });

  test(`${label} — EMPLOYEE gets default employee permissions`, async () => {
    const evaluator = createEvaluator();
    const fake = evaluator as unknown as InMemoryPermissionEvaluator;
    if (fake.addUser) {
      fake.addUser("emp-1", "tenant-1", "EMPLOYEE");
    }
    const result = await evaluator.resolve("emp-1", "tenant-1");
    assert.equal(result.baseRole, "EMPLOYEE");
    assert.ok(result.permissions.has("documents:read"));
    assert.ok(result.permissions.has("documents:create"));
    assert.ok(result.permissions.has("chat:read"));
    assert.ok(!result.permissions.has("users:read"));
    assert.ok(!result.permissions.has("roles:create"));
    await cleanup?.();
  });

  test(`${label} — COMPANY_ADMIN gets all tenant permissions`, async () => {
    const evaluator = createEvaluator();
    const fake = evaluator as unknown as InMemoryPermissionEvaluator;
    if (fake.addUser) {
      fake.addUser("admin-1", "tenant-1", "COMPANY_ADMIN");
    }
    const result = await evaluator.resolve("admin-1", "tenant-1");
    assert.equal(result.baseRole, "COMPANY_ADMIN");
    assert.ok(result.permissions.has("users:read"));
    assert.ok(result.permissions.has("roles:create"));
    assert.ok(result.permissions.has("documents:read"));
    assert.ok(result.permissions.has("billing:manage"));
    assert.ok(!result.permissions.has("platform:admin"));
    await cleanup?.();
  });

  test(`${label} — custom role permissions merge with base defaults`, async () => {
    const evaluator = createEvaluator();
    const fake = evaluator as unknown as InMemoryPermissionEvaluator;
    if (fake.addUser && fake.addRole) {
      fake.addUser("emp-2", "tenant-1", "EMPLOYEE", "role-1");
      fake.addRole("role-1", "tenant-1", "EMPLOYEE", [
        "analytics:read",
        "analytics:export",
      ]);
    }
    const result = await evaluator.resolve("emp-2", "tenant-1");
    assert.ok(result.permissions.has("documents:read"));
    assert.ok(result.permissions.has("analytics:read"));
    assert.ok(result.permissions.has("analytics:export"));
    assert.ok(!result.permissions.has("users:read"));
    await cleanup?.();
  });

  test(`${label} — custom role scopes are applied`, async () => {
    const evaluator = createEvaluator();
    const fake = evaluator as unknown as InMemoryPermissionEvaluator;
    if (fake.addUser && fake.addRole) {
      fake.addUser("emp-3", "tenant-1", "EMPLOYEE", "role-2");
      fake.addRole(
        "role-2",
        "tenant-1",
        "EMPLOYEE",
        ["documents:read"],
        { selfOnly: true },
      );
    }
    const result = await evaluator.resolve("emp-3", "tenant-1");
    assert.ok(result.permissions.has("documents:read"));
    assert.equal(result.scopes.selfOnly, true);
    await cleanup?.();
  });

  test(`${label} — evict clears cached entry`, async () => {
    const evaluator = createEvaluator();
    const fake = evaluator as unknown as InMemoryPermissionEvaluator;
    if (fake.addUser) {
      fake.addUser("emp-4", "tenant-1", "EMPLOYEE");
    }
    await evaluator.resolve("emp-4", "tenant-1");
    evaluator.evict("emp-4", "tenant-1");
    const result = await evaluator.resolve("emp-4", "tenant-1");
    assert.ok(result.permissions.has("documents:read"));
    await cleanup?.();
  });

  test(`${label} — permissions are tenant-scoped`, async () => {
    const evaluator = createEvaluator();
    const fake = evaluator as unknown as InMemoryPermissionEvaluator;
    fake.addUser(
      "admin-a",
      "tenant-A",
      "COMPANY_ADMIN",
    );
    fake.addUser(
      "admin-b",
        "tenant-B",
        "EMPLOYEE",
      );
    const resultA = await evaluator.resolve(
      "admin-a",
      "tenant-A",
    );
    const resultB = await evaluator.resolve(
      "admin-b",
      "tenant-B",
    );
    assert.equal(resultA.baseRole, "COMPANY_ADMIN");
    assert.equal(resultB.baseRole, "EMPLOYEE");
    assert.ok(
      resultA.permissions.size > resultB.permissions.size,
    );
    await cleanup?.();
  });
}

contractTests(
  "InMemoryPermissionEvaluator",
  () => new InMemoryPermissionEvaluator(),
);
