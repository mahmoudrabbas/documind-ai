import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import DepartmentModel from "../../db/models/department.model.js";
import DocumentClassificationModel from "../../db/models/documentClassification.model.js";
import RoleModel from "../../db/models/role.model.js";
import UserModel from "../../db/models/user.model.js";
import { PERMISSION_CONTRACT_VERSION, Permission } from "../permissions/permissions.catalog.js";
import { resetPermissionEvaluator } from "../permissions/permissions.evaluator.js";
import { DocumentPolicyManagementService } from "./documentPolicyManagement.service.js";
import { POLICY_IMPACT_ACTIONS } from "./documentPolicyManagement.types.js";
import type { DocumentAccessPolicy, DocumentAccessResourceContext } from "./documentAccess.types.js";
import type { PolicyImpact } from "./documentPolicyManagement.types.js";

/**
 * Access Policy Preview performance gate.
 *
 * The preview evaluates EVERY active tenant user against both the current and
 * the proposed policy, for every impact action. Authorization resolution is
 * deliberately uncached (permissions.evaluator.ts) so role changes are visible
 * across API instances, so the naive shape of that loop issued
 * `users x actions x 2` independent `resolve()` round-trips — ~90 sequential
 * Mongo queries per user, which is what made the preview take tens of seconds
 * on a small tenant.
 *
 * `resolve(actor)` reads only persisted ACTOR state (user row, tenant, custom
 * role, department assignment). It does not depend on the permission, the
 * resource or the action, so all of a user's calls inside ONE preview return
 * the same value. This test pins the query count to O(users), which is the
 * invariant that keeps the endpoint fast; it deliberately asserts round-trip
 * COUNTS rather than wall-clock, so it cannot go flaky on a loaded CI box.
 *
 * It must never be "fixed" by removing an authorization check: the companion
 * assertion below re-checks that the impact numbers themselves are unchanged.
 */

const USER_COUNT = 20;
const tenantId = new mongoose.Types.ObjectId();
const documentId = new mongoose.Types.ObjectId();
const ownerId = new mongoose.Types.ObjectId();
const policyId = new mongoose.Types.ObjectId();
const classificationId = new mongoose.Types.ObjectId();
const departmentId = new mongoose.Types.ObjectId();
const customRoleId = new mongoose.Types.ObjectId();
const memberIds = Array.from({ length: USER_COUNT - 1 }, () => new mongoose.Types.ObjectId());

let mongo: MongoMemoryServer | null = null;
let commandCount = 0;

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
  });
  await mongoose.connect(mongo.getUri(), {
    dbName: "document-policy-preview-performance",
    monitorCommands: true,
  });
  // Count real driver round-trips, so the measurement cannot be fooled by
  // query building or by Mongoose-level short-circuits.
  mongoose.connection.getClient().on("commandStarted", (event) => {
    if (event.commandName === "endSessions" || event.commandName === "ping") return;
    commandCount += 1;
  });
  await Promise.all([
    UserModel.init(),
    RoleModel.init(),
    DepartmentModel.init(),
    DocumentClassificationModel.init(),
  ]);
});

beforeEach(async () => {
  await Promise.all([
    UserModel.deleteMany({}),
    RoleModel.deleteMany({}),
    DepartmentModel.deleteMany({}),
    DocumentClassificationModel.deleteMany({}),
  ]);
  await DepartmentModel.create({
    _id: departmentId,
    tenantId,
    name: "Engineering",
    normalizedName: "engineering",
    status: "active",
    createdBy: ownerId,
    updatedBy: ownerId,
  });
  await DocumentClassificationModel.create({
    _id: classificationId,
    tenantId,
    name: "Internal",
    normalizedName: "internal",
    level: "restricted",
    status: "active",
    createdBy: ownerId,
    updatedBy: ownerId,
  });
  await UserModel.create([
    seedUser(ownerId, "Owner", null),
    ...memberIds.map((id, index) => seedUser(id, `Member ${index}`, customRoleId)),
  ]);
  // A real custom role, so `resolve()` performs its full read set
  // (user + role + provenance count + department) for most of the fixture.
  await RoleModel.collection.insertOne({
    _id: customRoleId,
    tenantId,
    name: "Reader",
    normalizedName: "reader",
    baseRole: "EMPLOYEE",
    grants: [{ permission: Permission.DOCUMENTS_READ }],
    contractVersion: PERMISSION_CONTRACT_VERSION,
    status: "active",
    version: 1,
    migrationState: "complete",
    createdBy: ownerId,
    updatedBy: ownerId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  resetPermissionEvaluator();
  commandCount = 0;
});

after(async () => {
  resetPermissionEvaluator();
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test("preview impact issues O(users) authorization round-trips, not O(users x actions)", async (t) => {
  const current = ownerPolicy();
  const proposed = policy(2, [
    ...current.rules,
    { ruleId: "tenant-read", effect: "allow", subject: { type: "tenant_member" }, actions: ["read"] },
  ]);

  const before = commandCount;
  const impact = await calculateImpact(current, proposed);
  const queries = commandCount - before;

  // Every tenant member gains `read`; the owner already had it.
  assert.equal(impact.direction, "broadening");
  assert.equal(impact.usersGainingAny, USER_COUNT - 1);
  assert.equal(impact.usersLosingAny, 0);
  assert.deepEqual(impact.byAction.read, { gained: USER_COUNT - 1, lost: 0 });

  // Authorization state is resolved once per user per preview, not once per
  // (user, action, policy-side). The naive shape cost >= users x actions x 2.
  const naiveFloor = USER_COUNT * POLICY_IMPACT_ACTIONS.length * 2;
  const budget = USER_COUNT * 8 + 20;
  t.diagnostic(`${queries} Mongo round-trips for ${USER_COUNT} users (budget ${budget}, naive floor ${naiveFloor})`);
  assert.ok(
    queries <= budget,
    `preview issued ${queries} Mongo round-trips for ${USER_COUNT} users (budget ${budget}, naive floor ${naiveFloor})`,
  );
});

test("repeat previews stay independent: a role change between previews is visible", async () => {
  const current = ownerPolicy();
  const proposed = policy(2, [
    ...current.rules,
    {
      ruleId: "member-read",
      effect: "allow",
      subject: { type: "custom_role", id: customRoleId.toString() },
      actions: ["read"],
    },
  ]);

  const first = await calculateImpact(current, proposed);
  assert.equal(first.byAction.read.gained, USER_COUNT - 1);

  // Memoization must not outlive one preview: archiving the custom role makes
  // every member's grants resolve empty, so the next preview must see it.
  await RoleModel.collection.updateOne({ _id: customRoleId }, { $set: { status: "archived" } });
  const second = await calculateImpact(current, proposed);
  assert.equal(second.byAction.read.gained, 0);
  assert.equal(second.usersGainingAny, 0);
});

function seedUser(
  id: mongoose.Types.ObjectId,
  name: string,
  role: mongoose.Types.ObjectId | null,
) {
  return {
    _id: id,
    tenantId,
    name,
    email: `${id.toString()}@example.test`,
    passwordHash: "test",
    role: "EMPLOYEE" as const,
    ...(role ? { customRoleId: role } : {}),
    status: "active" as const,
    emailVerified: true,
    employeeProfile: { departmentId },
  };
}

async function calculateImpact(current: DocumentAccessPolicy, proposed: DocumentAccessPolicy) {
  const service = new DocumentPolicyManagementService() as unknown as {
    impact(
      state: {
        document: { _id: mongoose.Types.ObjectId; tenantId: mongoose.Types.ObjectId };
        resource: DocumentAccessResourceContext;
        policy: DocumentAccessPolicy;
      },
      proposedPolicy: DocumentAccessPolicy,
    ): Promise<PolicyImpact>;
  };
  return service.impact(
    {
      document: { _id: documentId, tenantId },
      resource: {
        tenantId: tenantId.toString(),
        documentId: documentId.toString(),
        ownerId: ownerId.toString(),
        categoryId: null,
        departmentId: null,
        classificationId: classificationId.toString(),
        classification: "internal",
        legacyCategory: null,
        legacyDepartment: null,
        activePolicyId: policyId.toString(),
        activePolicyVersion: current.policyVersion,
      },
      policy: current,
    },
    proposed,
  );
}

function ownerPolicy(): DocumentAccessPolicy {
  return policy(1, [
    {
      ruleId: "owner-access",
      effect: "allow",
      subject: { type: "owner" },
      actions: ["discover", "read", "download"],
    },
  ]);
}

function policy(version: number, rules: DocumentAccessPolicy["rules"]): DocumentAccessPolicy {
  const createdAt = "2020-01-01T00:00:00.000Z";
  return {
    contractVersion: 1,
    tenantId: tenantId.toString(),
    documentId: documentId.toString(),
    policyId: policyId.toString(),
    policyVersion: version,
    status: "active",
    effectiveFrom: createdAt,
    effectiveUntil: null,
    inherits: null,
    rules,
    provenance: { createdBy: ownerId.toString(), createdAt },
    indexMetadata: {
      policyId: policyId.toString(),
      policyVersion: version,
      classificationId: classificationId.toString(),
      categoryId: null,
      departmentId: null,
    },
  };
}
