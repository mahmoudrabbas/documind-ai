import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import { Permission } from "./permissions.catalog.js";
import { InMemoryPermissionEvaluator } from "./permissions.evaluator.fake.js";
import { RequestScopedPermissionEvaluator } from "./permissions.requestScoped.js";
import type {
  PermissionActor,
  PermissionDecision,
  PermissionEvaluationInput,
  PermissionEvaluator,
  ResolvedPermissions,
} from "./permissions.types.js";

/**
 * `RequestScopedPermissionEvaluator` is an authorization component, so its
 * contract is pinned explicitly rather than left implied by its call sites.
 *
 * It deliberately does NOT join permissions.evaluator.contract.test.ts: that
 * suite asserts "role changes are visible without a stale cache" against one
 * long-lived evaluator instance, which is precisely the usage this wrapper
 * forbids. The equivalent safety property here is that a FRESH instance always
 * sees current state, which is what its single-computation lifetime guarantees
 * (see "a new scope sees a role change" below).
 */

const tenantId = new mongoose.Types.ObjectId().toString();
const otherTenantId = new mongoose.Types.ObjectId().toString();
const userId = new mongoose.Types.ObjectId().toString();
const otherUserId = new mongoose.Types.ObjectId().toString();
const roleId = new mongoose.Types.ObjectId().toString();

/** Counts delegate round-trips without altering any decision. */
class CountingEvaluator implements PermissionEvaluator {
  resolveCalls = 0;
  evictCalls: Array<[string, string]> = [];
  tenantEvictCalls: string[] = [];

  constructor(private readonly inner: InMemoryPermissionEvaluator) {}

  async resolve(actor: PermissionActor): Promise<ResolvedPermissions> {
    this.resolveCalls += 1;
    return this.inner.resolve(actor);
  }
  async evaluate(input: PermissionEvaluationInput): Promise<PermissionDecision> {
    return this.inner.evaluate(input);
  }
  evict(actorId: string, tenant: string): void {
    this.evictCalls.push([actorId, tenant]);
  }
  evictAllForTenant(tenant: string): void {
    this.tenantEvictCalls.push(tenant);
  }
}

function harness() {
  const fake = new InMemoryPermissionEvaluator();
  fake.addUser(userId, tenantId, "EMPLOYEE", roleId);
  fake.addUser(otherUserId, tenantId, "EMPLOYEE");
  fake.addRole(roleId, tenantId, "EMPLOYEE", [{ permission: Permission.ANALYTICS_READ }]);
  const delegate = new CountingEvaluator(fake);
  return { fake, delegate, scoped: new RequestScopedPermissionEvaluator(delegate) };
}

function actor(id = userId, tenant = tenantId): PermissionActor {
  return { actorId: id, tenantId: tenant, baseRole: "EMPLOYEE", customRoleId: roleId };
}

test("resolves an actor once per scope, however many checks it serves", async () => {
  const { delegate, scoped } = harness();
  const permissions = [
    Permission.DOCUMENTS_READ,
    Permission.ANALYTICS_READ,
    Permission.ROLES_CREATE,
    Permission.BILLING_MANAGE,
  ];

  for (const permission of permissions) {
    await scoped.evaluate({ ...actor(), permission });
  }
  await scoped.resolve(actor());

  assert.equal(delegate.resolveCalls, 1);
});

test("produces exactly the delegate's decisions, never widening one", async () => {
  const { fake, delegate, scoped } = harness();
  // Every catalog permission this fixture could plausibly be asked about,
  // including ones the actor must be denied.
  const permissions = [
    Permission.DOCUMENTS_READ,
    Permission.DOCUMENTS_UPDATE,
    Permission.DOCUMENTS_DELETE,
    Permission.DOCUMENTS_MANAGE_ACCESS,
    Permission.ANALYTICS_READ,
    Permission.ROLES_CREATE,
    Permission.ROLES_DELETE,
    Permission.BILLING_MANAGE,
    Permission.BILLING_READ,
  ];

  for (const permission of permissions) {
    const input = { ...actor(), permission };
    const direct = await fake.evaluate(input);
    const viaScope = await scoped.evaluate(input);
    assert.equal(viaScope.allowed, direct.allowed, `allowed mismatch for ${permission}`);
    assert.equal(viaScope.source, direct.source, `source mismatch for ${permission}`);
    assert.equal(viaScope.denialCode, direct.denialCode, `denialCode mismatch for ${permission}`);
  }
  // At least one allow and one deny actually exercised, so parity is meaningful.
  assert.equal((await scoped.evaluate({ ...actor(), permission: Permission.ANALYTICS_READ })).allowed, true);
  assert.equal((await scoped.evaluate({ ...actor(), permission: Permission.ROLES_CREATE })).allowed, false);
  assert.equal(delegate.resolveCalls, 1);
});

test("never shares one actor's resolution with another actor or tenant", async () => {
  const { delegate, scoped } = harness();

  const withRole = await scoped.resolve(actor());
  const withoutRole = await scoped.resolve(actor(otherUserId));
  const crossTenant = await scoped.resolve(actor(userId, otherTenantId));

  assert.ok(withRole.permissions.has(Permission.ANALYTICS_READ));
  assert.ok(!withoutRole.permissions.has(Permission.ANALYTICS_READ));
  // The same user id in a tenant they do not belong to resolves to nothing.
  assert.equal(crossTenant.permissions.size, 0);
  assert.equal(delegate.resolveCalls, 3);
});

test("concurrent checks for one actor share a single in-flight resolution", async () => {
  const { delegate, scoped } = harness();

  const results = await Promise.all([
    scoped.evaluate({ ...actor(), permission: Permission.ANALYTICS_READ }),
    scoped.evaluate({ ...actor(), permission: Permission.DOCUMENTS_READ }),
    scoped.resolve(actor()),
    scoped.resolve(actor()),
  ]);

  assert.equal(delegate.resolveCalls, 1);
  assert.equal((results[0] as PermissionDecision).allowed, true);
});

test("a new scope sees a role change: memoization cannot outlive one computation", async () => {
  const { fake, delegate, scoped } = harness();

  assert.ok((await scoped.resolve(actor())).permissions.has(Permission.ANALYTICS_READ));

  fake.addRole(roleId, tenantId, "EMPLOYEE", [{ permission: Permission.ANALYTICS_READ }], {
    status: "archived",
  });

  // The existing scope keeps its coherent snapshot for the computation it is
  // serving...
  assert.ok((await scoped.resolve(actor())).permissions.has(Permission.ANALYTICS_READ));
  assert.equal(delegate.resolveCalls, 1);

  // ...and the next computation, which builds a new scope, sees the change.
  const next = new RequestScopedPermissionEvaluator(delegate);
  assert.ok(!(await next.resolve(actor())).permissions.has(Permission.ANALYTICS_READ));
  assert.equal(
    (await next.evaluate({ ...actor(), permission: Permission.ANALYTICS_READ })).allowed,
    false,
  );
});

test("eviction clears the scope and forwards to the delegate", async () => {
  const { fake, delegate, scoped } = harness();

  await scoped.resolve(actor());
  assert.equal(delegate.resolveCalls, 1);

  fake.addRole(roleId, tenantId, "EMPLOYEE", [{ permission: Permission.ANALYTICS_READ }], {
    status: "archived",
  });
  scoped.evict(userId, tenantId);

  assert.ok(!(await scoped.resolve(actor())).permissions.has(Permission.ANALYTICS_READ));
  assert.equal(delegate.resolveCalls, 2);
  assert.deepEqual(delegate.evictCalls, [[userId, tenantId]]);

  scoped.evictAllForTenant(tenantId);
  await scoped.resolve(actor());
  assert.equal(delegate.resolveCalls, 3);
  assert.deepEqual(delegate.tenantEvictCalls, [tenantId]);
});
