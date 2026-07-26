import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import type { Server } from "node:http";

process.env.NODE_ENV = "test";

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { config } from "../../config/index.js";
import DepartmentModel from "../../db/models/department.model.js";
import DocumentCategoryModel from "../../db/models/documentCategory.model.js";
import DocumentClassificationModel from "../../db/models/documentClassification.model.js";
import DocumentModel from "../../db/models/document.model.js";
import RoleModel from "../../db/models/role.model.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import DocumentAccessPolicyModel from "../../db/models/documentAccessPolicy.model.js";
import { disconnectRedis } from "../../db/redis.js";
import { signJwt } from "../auth/jwtTokens.js";
import { hashPassword } from "../auth/passwordHashing.js";
import type { PermissionGrant } from "../../modules/permissions/permissions.types.js";

const app = (await import("../../app.js")).default as unknown as { listen: (port: number, cb: () => void) => Server };
let mongo: MongoMemoryServer | null = null;
const TEST_PASSWORD = "StrongPass123!";

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
    instance: { launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000) },
  });
  await mongoose.connect(mongo.getUri(), { dbName: "policy-editor-options" });
  await Promise.all([
    DocumentAccessPolicyModel.init(),
    DocumentClassificationModel.init(),
    DocumentCategoryModel.init(),
    DepartmentModel.init(),
  ]);
});

beforeEach(async () => {
  await Promise.all([
    DocumentAccessPolicyModel.deleteMany({}),
    DocumentModel.deleteMany({}),
    DocumentClassificationModel.deleteMany({}),
    DocumentCategoryModel.deleteMany({}),
    DepartmentModel.deleteMany({}),
    RoleModel.deleteMany({}),
    UserModel.deleteMany({}),
    TenantModel.deleteMany({}),
  ]);
});

after(async () => {
  await disconnectRedis();
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

async function createTenant(slug: string) {
  return TenantModel.create({ name: `${slug} Corp`, slug, status: "active", plan: "pro" });
}

async function createUser(tenantId: string, email: string, role: "COMPANY_ADMIN" | "EMPLOYEE", overrides: Record<string, unknown> = {}) {
  return UserModel.create({
    tenantId, name: email.split("@")[0], email, passwordHash: await hashPassword(TEST_PASSWORD),
    role, status: "active", emailVerified: true, emailVerifiedAt: new Date(), ...overrides,
  });
}

async function createRole(tenantId: string, name: string, grants: Array<{ permission: string }>, createdBy: string) {
  return RoleModel.create({
    tenantId, name, normalizedName: name.trim().toLowerCase(), baseRole: "EMPLOYEE",
    grants: grants as unknown as PermissionGrant[], contractVersion: 1, status: "active", createdBy, updatedBy: createdBy,
  });
}

async function createClassification(tenantId: string, name: string, level = "confidential" as const) {
  const admin = await UserModel.findOne({ tenantId }).exec();
  if (!admin) throw new Error(`Admin not found for tenant ${tenantId}`);
  return DocumentClassificationModel.create({
    tenantId, name, normalizedName: name.trim().toLowerCase(), level,
    status: "active", createdBy: admin._id, updatedBy: admin._id,
  });
}

async function createCategory(tenantId: string, name: string) {
  const admin = await UserModel.findOne({ tenantId }).exec();
  if (!admin) throw new Error(`Admin not found for tenant ${tenantId}`);
  return DocumentCategoryModel.create({
    tenantId, name, normalizedName: name.trim().toLowerCase(),
    status: "active", createdBy: admin._id, updatedBy: admin._id,
  });
}

async function createDepartment(tenantId: string, name: string) {
  const admin = await UserModel.findOne({ tenantId }).exec();
  if (!admin) throw new Error(`Admin not found for tenant ${tenantId}`);
  return DepartmentModel.create({
    tenantId, name, normalizedName: name.trim().toLowerCase(),
    status: "active", createdBy: admin._id, updatedBy: admin._id,
  });
}

async function createDocument(tenantId: string, uploadedBy: string, classificationId?: string) {
  return DocumentModel.create({
    tenantId, fileName: "test.pdf", originalFileName: "test.pdf", fileSize: 100,
    mimeType: "application/pdf", storageKey: `${tenantId}/test.pdf`, checksum: "abc",
    status: "processed", classification: "confidential", quarantineStatus: "none",
    uploadedBy, owner: uploadedBy, ...(classificationId ? { classificationId } : {}),
  });
}

async function createActivePolicy(tenantId: string, documentId: string, createdByUserId: string, metadata?: { classificationId?: string | null; categoryId?: string | null; departmentId?: string | null }) {
  const policyId = new mongoose.Types.ObjectId();
  const policyVersion = 1;
  const snapshot = new DocumentAccessPolicyModel({
    tenantId, documentId, policyId, policyVersion,
    contractVersion: 1, status: "active",
    effectiveFrom: new Date(), effectiveUntil: null, inherits: null,
    rules: [{ ruleId: "owner-rule", effect: "allow", subject: { type: "owner" }, actions: ["read", "manage_access"] }],
    provenance: { createdBy: createdByUserId, createdAt: new Date() },
    indexMetadata: { policyId, policyVersion, classificationId: metadata?.classificationId ?? null, categoryId: metadata?.categoryId ?? null, departmentId: metadata?.departmentId ?? null },
    createdAt: new Date(),
  });
  const policy = await snapshot.save();
  await DocumentModel.updateOne(
    { _id: documentId, tenantId },
    { $set: { activePolicyId: policyId, activePolicyVersion: 1 } },
  );
  return policy;
}

function createToken(user: { id: string; tenantId: string; role: string; email: string }) {
  return signJwt({ sub: user.id, tenantId: user.tenantId, role: user.role, email: user.email, type: "access" }, config.JWT_SECRET, "5m");
}

function createServer(): Promise<Server> {
  return new Promise((resolve) => { resolve(app.listen(0, () => {})); });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => { server.closeAllConnections?.(); server.close((err) => err ? reject(err) : resolve()); });
}

function url(server: Server, path: string) {
  const port = (server.address() as { port: number }).port;
  return `http://127.0.0.1:${port}${path}`;
}

function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

test("Company Admin can open the editor options for a document they manage", async () => {
  const tenant = await createTenant("policy-admin");
  const admin = await createUser(tenant.id, "admin@policy-admin.com", "COMPANY_ADMIN");
  const cls = await createClassification(tenant.id, "Secret");
  const cat = await createCategory(tenant.id, "Legal");
  const dept = await createDepartment(tenant.id, "Engineering");
  const doc = await createDocument(tenant.id, admin.id, cls.id);
  await createActivePolicy(tenant.id, doc.id, admin.id, { classificationId: cls.id });

  const otherUser = await createUser(tenant.id, "other@policy-admin.com", "EMPLOYEE");
  await DocumentClassificationModel.create({
    tenantId: tenant.id, name: "Old", normalizedName: "old", level: "internal",
    status: "archived", createdBy: admin._id, updatedBy: admin._id,
  });

  const token = createToken({ id: admin.id, tenantId: tenant.id, role: admin.role, email: admin.email });
  const server = await createServer();
  try {
    const response = await fetch(url(server, `/documents/${doc.id}/policy-editor/options`), { headers: auth(token) });
    const body = await json(response);
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    const data = body.data as Record<string, unknown>;

    assert.equal(typeof data.documentOwnerId, "string");
    assert.equal(data.documentOwnerId, admin.id);
    assert.equal(data.taxonomyEditable, true);

    const users = data.users as Array<{ id: string; name: string }>;
    assert.ok(users.length >= 2);
    assert.ok(users.some((u) => u.id === admin.id));
    assert.ok(users.some((u) => u.id === otherUser.id));
    assert.ok(!users.some((u) => "email" in u));
    assert.ok(!users.some((u) => "passwordHash" in u));

    const roles = data.roles as Array<{ id: string; name: string }>;
    assert.ok(Array.isArray(roles));

    const classifications = data.classifications as Array<{ id: string; name: string; level: string }>;
    assert.ok(classifications.some((c) => c.id === cls.id));
    assert.ok(!classifications.some((c) => c.name === "Old"));
    assert.ok(!classifications.some((c) => "description" in c));
    assert.ok(!classifications.some((c) => "version" in c));

    const categories = data.categories as Array<{ id: string; name: string }>;
    assert.ok(categories.some((c) => c.id === cat.id));
    assert.ok(!categories.some((c) => "description" in c));

    const departments = data.departments as Array<{ id: string; name: string }>;
    assert.ok(departments.some((d) => d.id === dept.id));
    assert.ok(!departments.some((d) => "description" in d));
  } finally {
    await closeServer(server);
  }
});

test("Employee with coarse Manage Document Access and document manage_access can open the editor", async () => {
  const tenant = await createTenant("policy-delegated");
  const admin = await createUser(tenant.id, "admin@policy-delegated.com", "COMPANY_ADMIN");
  const role = await createRole(tenant.id, "Policy Manager", [{ permission: "documents:manage-access" }], admin.id);
  const employee = await createUser(tenant.id, "mahmoud@policy-delegated.com", "EMPLOYEE");
  await UserModel.updateOne({ _id: employee._id }, { $set: { customRoleId: role._id } });

  const cls = await createClassification(tenant.id, "Restricted");
  const doc = await createDocument(tenant.id, employee.id, cls.id);
  await createActivePolicy(tenant.id, doc.id, employee.id, { classificationId: cls.id });

  const token = createToken({ id: employee.id, tenantId: tenant.id, role: employee.role, email: employee.email });
  const server = await createServer();
  try {
    const response = await fetch(url(server, `/documents/${doc.id}/policy-editor/options`), { headers: auth(token) });
    const body = await json(response);
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    const data = body.data as Record<string, unknown>;
    assert.equal(typeof data.documentOwnerId, "string");
    assert.equal(data.documentOwnerId, employee.id);
    assert.equal(data.taxonomyEditable, true);
    assert.ok(Array.isArray(data.users));
    assert.ok(Array.isArray(data.roles));
    assert.ok(Array.isArray(data.classifications));
  } finally {
    await closeServer(server);
  }
});

test("delegated non-owner manager sees taxonomyEditable as false", async () => {
  const tenant = await createTenant("policy-taxonomy");
  const admin = await createUser(tenant.id, "admin@policy-taxonomy.com", "COMPANY_ADMIN");
  const role = await createRole(tenant.id, "Policy Manager", [{ permission: "documents:manage-access" }], admin.id);
  const employee = await createUser(tenant.id, "emp@policy-taxonomy.com", "EMPLOYEE");
  await UserModel.updateOne({ _id: employee._id }, { $set: { customRoleId: role._id } });

  const cls = await createClassification(tenant.id, "Secret");
  const doc = await createDocument(tenant.id, admin.id, cls.id);

  const policyId = new mongoose.Types.ObjectId();
  const snapshot = new DocumentAccessPolicyModel({
    tenantId: tenant.id, documentId: doc.id, policyId, policyVersion: 1,
    contractVersion: 1, status: "active",
    effectiveFrom: new Date(), effectiveUntil: null, inherits: null,
    rules: [
      { ruleId: "owner-rule", effect: "allow", subject: { type: "owner" }, actions: ["read", "manage_access"] },
      { ruleId: "emp-rule", effect: "allow", subject: { type: "user", id: employee.id }, actions: ["discover", "read", "manage_access"] },
    ],
    provenance: { createdBy: admin.id, createdAt: new Date() },
    indexMetadata: { policyId, policyVersion: 1, classificationId: cls.id, categoryId: null, departmentId: null },
    createdAt: new Date(),
  });
  await snapshot.save();
  await DocumentModel.updateOne({ _id: doc.id, tenantId: tenant.id }, { $set: { activePolicyId: policyId, activePolicyVersion: 1 } });

  const token = createToken({ id: employee.id, tenantId: tenant.id, role: employee.role, email: employee.email });
  const server = await createServer();
  try {
    const response = await fetch(url(server, `/documents/${doc.id}/policy-editor/options`), { headers: auth(token) });
    const body = await json(response);
    assert.equal(response.status, 200);
    const data = body.data as Record<string, unknown>;
    assert.equal(data.documentOwnerId, admin.id);
    assert.equal(data.taxonomyEditable, false);
  } finally {
    await closeServer(server);
  }
});

test("Employee without document manage_access receives hidden 404", async () => {
  const tenant = await createTenant("policy-noaccess");
  const admin = await createUser(tenant.id, "admin@policy-noaccess.com", "COMPANY_ADMIN");
  const role = await createRole(tenant.id, "Limited Manager", [{ permission: "documents:manage-access" }], admin.id);
  const employee = await createUser(tenant.id, "limited@policy-noaccess.com", "EMPLOYEE");
  await UserModel.updateOne({ _id: employee._id }, { $set: { customRoleId: role._id } });

  const cls = await createClassification(tenant.id, "Secret");
  const doc = await createDocument(tenant.id, admin.id, cls.id);
  await createActivePolicy(tenant.id, doc.id, admin.id, { classificationId: cls.id });

  const token = createToken({ id: employee.id, tenantId: tenant.id, role: employee.role, email: employee.email });
  const server = await createServer();
  try {
    const response = await fetch(url(server, `/documents/${doc.id}/policy-editor/options`), { headers: auth(token) });
    assert.equal(response.status, 404);
  } finally {
    await closeServer(server);
  }
});

test("Employee with document rule but without coarse Manage Document Access is denied", async () => {
  const tenant = await createTenant("policy-nocoarse");
  const admin = await createUser(tenant.id, "admin@policy-nocoarse.com", "COMPANY_ADMIN");
  const employee = await createUser(tenant.id, "emp@policy-nocoarse.com", "EMPLOYEE");

  const cls = await createClassification(tenant.id, "Internal");
  const doc = await createDocument(tenant.id, admin.id, cls.id);
  await createActivePolicy(tenant.id, doc.id, admin.id, { classificationId: cls.id });

  const token = createToken({ id: employee.id, tenantId: tenant.id, role: employee.role, email: employee.email });
  const server = await createServer();
  try {
    const response = await fetch(url(server, `/documents/${doc.id}/policy-editor/options`), { headers: auth(token) });
    assert.equal(response.status, 403);
  } finally {
    await closeServer(server);
  }
});

test("cross-tenant records are never returned", async () => {
  const tenantA = await createTenant("tenant-cross-a");
  const tenantB = await createTenant("tenant-cross-b");
  const adminA = await createUser(tenantA.id, "admin@cross-a.com", "COMPANY_ADMIN");
  const adminB = await createUser(tenantB.id, "admin@cross-b.com", "COMPANY_ADMIN");

  await createClassification(tenantA.id, "Secret A");
  await createClassification(tenantB.id, "Secret B");
  await createCategory(tenantA.id, "Legal A");
  await createCategory(tenantB.id, "Legal B");
  await createDepartment(tenantA.id, "Eng A");
  await createDepartment(tenantB.id, "Eng B");

  const roleB = await createRole(tenantB.id, "Role B", [{ permission: "documents:manage-access" }], adminB.id);

  const docA = await createDocument(tenantA.id, adminA.id);
  await createActivePolicy(tenantA.id, docA.id, adminA.id);

  const token = createToken({ id: adminA.id, tenantId: tenantA.id, role: adminA.role, email: adminA.email });
  const server = await createServer();
  try {
    const response = await fetch(url(server, `/documents/${docA.id}/policy-editor/options`), { headers: auth(token) });
    const body = await json(response);
    assert.equal(response.status, 200);
    const data = body.data as Record<string, unknown>;

    const users = data.users as Array<{ id: string; name: string }>;
    assert.ok(!users.some((u) => u.id === adminB.id));

    const roles = data.roles as Array<{ id: string; name: string }>;
    assert.ok(!roles.some((r) => r.id === roleB.id));

    const classifications = data.classifications as Array<{ id: string; name: string }>;
    assert.ok(classifications.every((c) => c.name !== "Secret B"));

    const categories = data.categories as Array<{ id: string; name: string }>;
    assert.ok(categories.every((c) => c.name !== "Legal B"));

    const departments = data.departments as Array<{ id: string; name: string }>;
    assert.ok(departments.every((d) => d.name !== "Eng B"));
  } finally {
    await closeServer(server);
  }
});

test("archived taxonomy records are excluded", async () => {
  const tenant = await createTenant("policy-archived");
  const admin = await createUser(tenant.id, "admin@policy-archived.com", "COMPANY_ADMIN");

  const activeCls = await createClassification(tenant.id, "Active Cls");
  const archivedCls = await DocumentClassificationModel.create({
    tenantId: tenant.id, name: "Archived Cls", normalizedName: "archived cls", level: "internal",
    status: "archived", createdBy: admin._id, updatedBy: admin._id,
  });
  const activeCat = await createCategory(tenant.id, "Active Cat");
  const archivedCat = await DocumentCategoryModel.create({
    tenantId: tenant.id, name: "Archived Cat", normalizedName: "archived cat",
    status: "archived", createdBy: admin._id, updatedBy: admin._id,
  });
  const activeDept = await createDepartment(tenant.id, "Active Dept");
  const archivedDept = await DepartmentModel.create({
    tenantId: tenant.id, name: "Archived Dept", normalizedName: "archived dept",
    status: "archived", createdBy: admin._id, updatedBy: admin._id,
  });

  const doc = await createDocument(tenant.id, admin.id, activeCls.id);
  await createActivePolicy(tenant.id, doc.id, admin.id, { classificationId: activeCls.id });

  const token = createToken({ id: admin.id, tenantId: tenant.id, role: admin.role, email: admin.email });
  const server = await createServer();
  try {
    const response = await fetch(url(server, `/documents/${doc.id}/policy-editor/options`), { headers: auth(token) });
    const body = await json(response);
    assert.equal(response.status, 200);
    const data = body.data as Record<string, unknown>;

    const cls = data.classifications as Array<{ id: string }>;
    assert.ok(cls.some((c) => c.id === activeCls.id));
    assert.ok(!cls.some((c) => c.id === archivedCls.id));

    const cats = data.categories as Array<{ id: string }>;
    assert.ok(cats.some((c) => c.id === activeCat.id));
    assert.ok(!cats.some((c) => c.id === archivedCat.id));

    const depts = data.departments as Array<{ id: string }>;
    assert.ok(depts.some((d) => d.id === activeDept.id));
    assert.ok(!depts.some((d) => d.id === archivedDept.id));
  } finally {
    await closeServer(server);
  }
});

test("general Users/Roles/Taxonomy admin endpoints remain forbidden for delegated employee", async () => {
  const tenant = await createTenant("policy-forbidden");
  const admin = await createUser(tenant.id, "admin@policy-forbidden.com", "COMPANY_ADMIN");
  const role = await createRole(tenant.id, "Policy Manager", [{ permission: "documents:manage-access" }], admin.id);
  const employee = await createUser(tenant.id, "emp@policy-forbidden.com", "EMPLOYEE");
  await UserModel.updateOne({ _id: employee._id }, { $set: { customRoleId: role._id } });

  const cls = await createClassification(tenant.id, "Restricted");
  const doc = await createDocument(tenant.id, admin.id, cls.id);
  await createActivePolicy(tenant.id, doc.id, admin.id, { classificationId: cls.id });

  const token = createToken({ id: employee.id, tenantId: tenant.id, role: employee.role, email: employee.email });
  const server = await createServer();
  try {
    const usersRes = await fetch(url(server, "/users"), { headers: auth(token) });
    assert.equal(usersRes.status, 403);

    const rolesRes = await fetch(url(server, "/roles"), { headers: auth(token) });
    assert.equal(rolesRes.status, 403);

    const clsRes = await fetch(url(server, "/document-taxonomy/classifications"), { headers: auth(token) });
    assert.equal(clsRes.status, 403);

    const catRes = await fetch(url(server, "/document-taxonomy/categories"), { headers: auth(token) });
    assert.equal(catRes.status, 403);

    const deptRes = await fetch(url(server, "/document-taxonomy/departments"), { headers: auth(token) });
    assert.equal(deptRes.status, 403);
  } finally {
    await closeServer(server);
  }
});

test("unauthenticated request is rejected", async () => {
  const tenant = await createTenant("policy-unauth");
  const admin = await createUser(tenant.id, "admin@policy-unauth.com", "COMPANY_ADMIN");
  const cls = await createClassification(tenant.id, "Internal");
  const doc = await createDocument(tenant.id, admin.id, cls.id);
  await createActivePolicy(tenant.id, doc.id, admin.id, { classificationId: cls.id });

  const server = await createServer();
  try {
    const response = await fetch(url(server, `/documents/${doc.id}/policy-editor/options`));
    assert.equal(response.status, 401);
  } finally {
    await closeServer(server);
  }
});

test("returns minimal fields only — no secrets or profile data", async () => {
  const tenant = await createTenant("policy-minimal");
  const admin = await createUser(tenant.id, "admin@policy-minimal.com", "COMPANY_ADMIN");
  await createUser(tenant.id, "emp@policy-minimal.com", "EMPLOYEE", {
    employeeProfile: { department: "HR", jobTitle: "Manager", phone: "555-1234" },
  });

  await createRole(tenant.id, "Test Role", [{ permission: "documents:read" }], admin.id);

  const cls = await createClassification(tenant.id, "Confidential", "confidential");
  await createCategory(tenant.id, "Legal");
  await createDepartment(tenant.id, "Engineering");

  const doc = await createDocument(tenant.id, admin.id, cls.id);
  await createActivePolicy(tenant.id, doc.id, admin.id, { classificationId: cls.id });

  const token = createToken({ id: admin.id, tenantId: tenant.id, role: admin.role, email: admin.email });
  const server = await createServer();
  try {
    const response = await fetch(url(server, `/documents/${doc.id}/policy-editor/options`), { headers: auth(token) });
    const body = await json(response);
    assert.equal(response.status, 200);
    const data = body.data as Record<string, unknown>;

    for (const user of data.users as Array<Record<string, unknown>>) {
      const keys = Object.keys(user);
      assert.deepEqual(keys, ["id", "name"]);
    }

    for (const r of data.roles as Array<Record<string, unknown>>) {
      const keys = Object.keys(r);
      assert.deepEqual(keys, ["id", "name"]);
    }

    for (const c of data.classifications as Array<Record<string, unknown>>) {
      const keys = Object.keys(c);
      assert.deepEqual(keys, ["id", "name", "level"]);
    }

    for (const c of data.categories as Array<Record<string, unknown>>) {
      const keys = Object.keys(c);
      assert.deepEqual(keys, ["id", "name"]);
    }

    for (const d of data.departments as Array<Record<string, unknown>>) {
      const keys = Object.keys(d);
      assert.deepEqual(keys, ["id", "name"]);
    }
  } finally {
    await closeServer(server);
  }
});
