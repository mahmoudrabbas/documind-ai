import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";

process.env.NODE_ENV = "test";

import type { Express } from "express";
import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { connectRedis, disconnectRedis } from "../../db/redis.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import DocumentModel, { type DocumentClassification, type DocumentDocument } from "../../db/models/document.model.js";
import DocumentVersionModel from "../../db/models/documentVersion.model.js";
import DocumentClassificationModel from "../../db/models/documentClassification.model.js";
import DocumentCategoryModel from "../../db/models/documentCategory.model.js";
import DepartmentModel from "../../db/models/department.model.js";
import DocumentAccessPolicyModel from "../../db/models/documentAccessPolicy.model.js";
import RoleModel from "../../db/models/role.model.js";
import { hashPassword } from "../auth/passwordHashing.js";
import type { DocumentAccessAction } from "../document-access/documentAccess.actions.js";
import * as fsp from "node:fs/promises";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { Permission } from "../permissions/permissions.catalog.js";
import { getDocumentAccessAuthorizationService } from "../document-access/documentAccess.authorization.service.js";
import { config } from "../../config/index.js";
import PackageModel from "../../db/models/package.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import ProcessingRunModel from "../../db/models/processingRun.model.js";
import AuditLogModel from "../../db/models/auditLog.model.js";
import { signJwt } from "../auth/jwtTokens.js";
import { PLATFORM_TENANT_SLUG } from "../../common/auth/platformTenant.js";


const app: Express = (await import("../../app.js")).default;

const TEST_PASSWORD = "StrongPass123!";
const UPLOAD_TEST_DIR = path.resolve(process.cwd(), config.UPLOAD_DIR);

let mongoServer: MongoMemoryReplSet | null = null;
const activeServers = new Set<Server>();

function createServer() {
  return new Promise<Server>((resolve) => {
    const srv = app.listen(0, () => {
      activeServers.add(srv);
      resolve(srv);
    });
  });
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.closeAllConnections?.();
    server.close((err) => {
      activeServers.delete(server);
      if (err && (err as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

async function createActiveTenantAdmin(
  options: { slug?: string; companyName?: string; email?: string; fileSizeMb?: number } = {},
) {
  const fileSizeMb = options.fileSizeMb ?? 20;
  const tenant = await TenantModel.create({
    name: options.companyName ?? "Acme Consulting",
    slug: options.slug ?? "acme-consulting",
    status: "active",
    plan: "free",
  });

  // Create a default package and subscription so the entitlement
  // middleware (documentCountGuard / storageMbGuard on POST /documents)
  // can resolve the tenant's quota snapshot.
  const pkgCode = `test-free-${options.slug ?? "acme-consulting"}`;
  const pkg = await PackageModel.create({
    name: "Test Package",
    code: pkgCode,
    description: "Test package for integration tests",
    active: true,
    version: 1,
    monthlyPrice: 0,
    annualPrice: 0,
    currency: "USD",
    entitlements: {
      employees: 10,
      admins: 1,
      documents: 100,
      storageMb: 1024,
      fileSizeMb,
      queriesPerMonth: 1000,
      tokensPerMonth: 100000,
      ocrPagesPerMonth: 100,
    },
    trialDays: 0,
    visibility: "public",
    supportedModels: ["gpt-4"],
    analyticsLevel: "basic",
    retentionDays: 30,
    supportLevel: "community",
    stripeProductId: "",
    stripePriceId: "",
    stripeAnnualPriceId: "",
    versions: [
      {
        _id: new mongoose.Types.ObjectId(),
        version: 1,
        name: "Test Package v1",
        code: `${pkgCode}-v1`,
        description: "Version 1",
        monthlyPrice: 0,
        annualPrice: 0,
        currency: "USD",
        entitlements: {
          employees: 10,
          admins: 1,
          documents: 100,
          storageMb: 1024,
          fileSizeMb,
          queriesPerMonth: 1000,
          tokensPerMonth: 100000,
          ocrPagesPerMonth: 100,
        },
        trialDays: 0,
        visibility: "public",
        supportedModels: ["gpt-4"],
        analyticsLevel: "basic",
        retentionDays: 30,
        supportLevel: "community",
        stripeProductId: "",
        stripePriceId: "",
        stripeAnnualPriceId: "",
        createdAt: new Date(),
      },
    ],
  });

  await SubscriptionModel.create({
    tenantId: tenant._id,
    packageId: pkg._id,
    packageVersion: 1,
    status: "ACTIVE",
    startedAt: new Date(),
    periodStart: new Date("2026-01-01"),
    periodEnd: new Date("2027-01-01"),
    currentPeriodStart: new Date("2026-01-01"),
    currentPeriodEnd: new Date("2027-01-01"),
    billingInterval: "monthly",
    provider: "test",
    paymentState: "paid",
  });

  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Sarah Ahmed",
    email: options.email ?? "sarah@acme.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });

  return { tenant, user };
}

async function createEmployee(
  tenantId: string,
  options: { email?: string } = {},
) {
  return UserModel.create({
    tenantId,
    name: "John Employee",
    email: options.email ?? "john@acme.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "EMPLOYEE",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
}

async function login(port: number, slug = "acme-consulting", email = "sarah@acme.com") {
  const response = await fetch(`http://127.0.0.1:${port}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ companySlug: slug, email, password: TEST_PASSWORD }),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: { tokens: { accessToken: string } } };

  return body.data.tokens.accessToken;
}

function buildMultipartBody(fileName: string, fileContent: Buffer, metadata: Record<string, string | string[]>) {
  const boundary = "----TestBoundary" + Date.now();
  const parts: string[] = [];

  for (const [key, value] of Object.entries(metadata)) {
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${v}\r\n`);
    }
  }

  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/pdf\r\n\r\n`,
  );

  const head = Buffer.from(parts.join(""), "utf-8");
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf-8");

  return { buffer: Buffer.concat([head, fileContent, tail]), boundary };
}

interface TestDocOverrides {
  fileName?: string;
  originalFileName?: string;
  fileSize?: number;
  mimeType?: string;
  storageKey?: string;
  checksum?: string;
  status?: DocumentDocument["status"];
  metadata?: DocumentDocument["metadata"];
  version?: number;
  versionLabel?: string;
  isArchived?: boolean;
  archivedAt?: Date | null;
  archivedBy?: string | null;
  deletedAt?: Date | null;
  deletedBy?: string | null;
  quarantineStatus?: DocumentDocument["quarantineStatus"];
  scanResult?: DocumentDocument["scanResult"];
  category?: string | null;
  department?: string | null;
  departmentId?: string | null;
  classificationLevel?: Exclude<DocumentClassification, "public">;
  effectiveDate?: Date | null;
  expiryDate?: Date | null;
  additionalPolicyRules?: Array<{
    ruleId: string;
    effect: "allow" | "deny";
    subject: { type: "tenant_member" | "user"; id?: string };
    actions: DocumentAccessAction[];
  }>;
}

async function createTestDocumentWithPolicy(
  tenantId: string,
  userId: string,
  classification: string,
  actions: string[],
  overrides: TestDocOverrides = {},
) {
  const normalizedClassification = classification.toLowerCase().trim();
  let classificationDoc = await DocumentClassificationModel.findOne({
    tenantId,
    normalizedName: normalizedClassification,
    status: "active",
  });
  if (!classificationDoc) {
    try {
      classificationDoc = await DocumentClassificationModel.create({
        tenantId,
        name: classification.charAt(0).toUpperCase() + classification.slice(1),
        normalizedName: normalizedClassification,
        level: overrides.classificationLevel ?? "confidential",
        description: `${classification} classification`,
        status: "active" as const,
        version: 1,
        createdBy: userId,
        updatedBy: userId,
      });
    } catch (error: unknown) {
      if (error && typeof error === "object" && "code" in error && (error as { code?: number }).code === 11000) {
        classificationDoc = await DocumentClassificationModel.findOne({
          tenantId,
          normalizedName: normalizedClassification,
          status: "active",
        });
        if (!classificationDoc) throw error;
      } else {
        throw error;
      }
    }
  }

  const policyId = new Types.ObjectId();
  const now = new Date().toISOString();

  const doc = await DocumentModel.create({
    tenantId,
    fileName: overrides.fileName ?? "test.pdf",
    originalFileName: overrides.originalFileName ?? "test.pdf",
    fileSize: overrides.fileSize ?? 1234,
    mimeType: overrides.mimeType ?? "application/pdf",
    storageKey: overrides.storageKey ?? `${tenantId}/${overrides.fileName ?? "test.pdf"}`,
    checksum: overrides.checksum ?? "abc123",
    status: overrides.status ?? "uploaded",
    metadata: overrides.metadata ?? { title: "Test", description: "Desc", tags: [] },
    classification: overrides.classificationLevel ?? normalizedClassification as DocumentClassification,
    version: overrides.version ?? 1,
    versionLabel: overrides.versionLabel ?? "v1",
    uploadedBy: userId,
    owner: userId,
    classificationId: classificationDoc._id,
    activePolicyId: policyId,
    activePolicyVersion: 1,
    policyChangedAt: new Date(),
    isArchived: overrides.isArchived ?? false,
    archivedAt: overrides.archivedAt ?? null,
    archivedBy: overrides.archivedBy ?? null,
    deletedAt: overrides.deletedAt ?? null,
    deletedBy: overrides.deletedBy ?? null,
    quarantineStatus: overrides.quarantineStatus ?? "none",
    scanResult: overrides.scanResult ?? null,
    category: overrides.category ?? null,
    department: overrides.department ?? null,
    departmentId: overrides.departmentId ?? null,
    effectiveDate: overrides.effectiveDate ?? null,
    expiryDate: overrides.expiryDate ?? null,
  });

  const policy = await DocumentAccessPolicyModel.create({
    tenantId,
    documentId: doc._id,
    policyId,
    policyVersion: 1,
    contractVersion: 1,
    status: "active",
    effectiveFrom: now,
    effectiveUntil: null,
    inherits: null,
    rules: [
      {
        ruleId: "test-owner-rule",
        effect: "allow",
        subject: { type: "owner" },
        actions: actions as DocumentAccessAction[],
      },
      ...(overrides.additionalPolicyRules ?? []),
    ],
    provenance: {
      createdBy: userId,
      createdAt: now,
      reason: "Test fixture",
    },
    indexMetadata: {
      policyId,
      policyVersion: 1,
      classificationId: classificationDoc._id,
      categoryId: null,
      departmentId: overrides.departmentId ?? null,
    },
    createdAt: now,
  });

  return { doc, classification: classificationDoc, policy };
}

async function writeTestDocumentFile(tenantId: string, fileName: string, content: Buffer) {
  const storageKey = `${tenantId}/${fileName}`;
  const fullPath = path.join(UPLOAD_TEST_DIR, storageKey);
  await fsp.mkdir(path.dirname(fullPath), { recursive: true });
  await fsp.writeFile(fullPath, content);
  return storageKey;
}

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "documents-test" });
  } else {
    mongoServer = await MongoMemoryReplSet.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      replSet: { count: 1 },
      instanceOpts: [{ launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000) }],
    });
    await mongoose.connect(mongoServer.getUri(), { dbName: "documents-test" });
  }
  await connectRedis();
  mkdirSync(UPLOAD_TEST_DIR, { recursive: true });
});

beforeEach(async () => {
  await SubscriptionModel.deleteMany({});
  await PackageModel.deleteMany({});
  await TenantModel.deleteMany({});
  await UserModel.deleteMany({});
  await DocumentModel.deleteMany({});
  await DocumentVersionModel.deleteMany({});
  await DocumentClassificationModel.deleteMany({});
  await DocumentCategoryModel.deleteMany({});
  await DepartmentModel.deleteMany({});
  await DocumentAccessPolicyModel.deleteMany({});
  await RoleModel.deleteMany({});
  await ProcessingRunModel.deleteMany({});
  await AuditLogModel.deleteMany({});

  const uploads = await fsp.readdir(UPLOAD_TEST_DIR).catch(() => []);
  for (const dir of uploads) {
    await fsp.rm(path.join(UPLOAD_TEST_DIR, dir), { recursive: true, force: true });
  }
});

after(async () => {
  await fsp.rm(UPLOAD_TEST_DIR, { recursive: true, force: true }).catch(() => {});
  await disconnectRedis();
  await Promise.all(Array.from(activeServers, closeServer));
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

void test("POST /documents — upload a document successfully", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createActiveTenantAdmin();
  const accessToken = await login(port);

  const pdfContent = Buffer.from("%PDF-1.4 test document content", "utf-8");
  const { buffer, boundary } = buildMultipartBody("report.pdf", pdfContent, {
    title: "Annual Report 2024",
    description: "Company financial report",
    tags: ["finance", "annual", "2024"],
  });

  const response = await fetch(`http://127.0.0.1:${port}/documents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: buffer,
  });

  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(response.status, 201);
  assert.equal(body.success, true);

  const doc = (body.data as Record<string, unknown>).document as Record<string, unknown>;
  assert.ok(doc.id);
  assert.equal(doc.fileName, "report.pdf");
  assert.equal(doc.fileSize, pdfContent.length);
  assert.equal(doc.mimeType, "application/pdf");
  assert.equal(doc.status, "uploaded");
  assert.equal((doc.metadata as Record<string, unknown>).title, "Annual Report 2024");
  assert.equal(doc.version, 1);
  assert.equal(doc.versionLabel, "v1");
  assert.equal(doc.classification, "internal");
  assert.equal(doc.isArchived, false);
  assert.equal(doc.quarantineStatus, "none");
  assert.ok(doc.checksum);

  await closeServer(server);
});

void test("POST /documents — returns 413 FILE_SIZE_LIMIT_EXCEEDED when file exceeds the plan's file size limit", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createActiveTenantAdmin({ fileSizeMb: 2 });
  const accessToken = await login(port);

  const pdfContent = Buffer.alloc(3 * 1024 * 1024, 0x41); // 3 MB > 2 MB limit
  pdfContent.write("%PDF-1.4", 0, "ascii");
  const { buffer, boundary } = buildMultipartBody("oversized.pdf", pdfContent, {
    title: "Oversized",
  });

  const response = await fetch(`http://127.0.0.1:${port}/documents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: buffer,
  });

  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(response.status, 413);
  assert.equal(body.error, "FILE_SIZE_LIMIT_EXCEEDED");
  assert.equal(
    body.message,
    "File size 3.0MB exceeds the maximum allowed size of 2MB",
  );

  await closeServer(server);
});

void test("POST /documents — returns 401 without auth", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;

  const pdfContent = Buffer.from("test", "utf-8");
  const { buffer, boundary } = buildMultipartBody("test.pdf", pdfContent, { title: "Test" });

  const response = await fetch(`http://127.0.0.1:${port}/documents`, {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body: buffer,
  });

  assert.equal(response.status, 401);
  await closeServer(server);
});

void test("POST /documents — returns 400 when file is missing", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createActiveTenantAdmin();
  const accessToken = await login(port);

  const boundary = "----TestBoundary";
  const body = `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nTest\r\n--${boundary}--\r\n`;

  const response = await fetch(`http://127.0.0.1:${port}/documents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  assert.equal(response.status, 400);
  await closeServer(server);
});

void test("POST /documents — returns 400 for zero-byte file", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createActiveTenantAdmin();
  const accessToken = await login(port);

  const { buffer, boundary } = buildMultipartBody("empty.pdf", Buffer.alloc(0), { title: "Empty" });

  const response = await fetch(`http://127.0.0.1:${port}/documents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: buffer,
  });

  assert.equal(response.status, 400);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.error, "FILE_ZERO_BYTES");
  await closeServer(server);
});

void test("POST /documents — rejects file with signature mismatch", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createActiveTenantAdmin();
  const accessToken = await login(port);

  const pdfContent = Buffer.from("test", "utf-8");
  const { buffer, boundary } = buildMultipartBody("malicious.pdf", pdfContent, { title: "Bad" });

  const response = await fetch(`http://127.0.0.1:${port}/documents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: buffer,
  });

  assert.equal(response.status, 400);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.error, "FILE_SIGNATURE_MISMATCH");
  assert.equal(await DocumentModel.countDocuments({}), 0);
  await closeServer(server);
});

void test("GET /documents — returns empty list when no documents", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createActiveTenantAdmin();
  const accessToken = await login(port);

  const response = await fetch(`http://127.0.0.1:${port}/documents`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;
  const data = body.data as Record<string, unknown>;

  assert.deepEqual(data.documents, []);
  assert.equal((data.pagination as Record<string, unknown>).totalRecords, 0);
  await closeServer(server);
});

void test("GET /documents — paginated list", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;
    const { tenant, user } = await createActiveTenantAdmin();
    const accessToken = await login(port);

    const allActions = ["discover", "read", "download", "update", "delete", "archive", "restore", "replace"];
    await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        createTestDocumentWithPolicy(tenant.id, user.id, "internal", allActions, {
          fileName: `doc-${i}.pdf`,
          originalFileName: `doc-${i}.pdf`,
          fileSize: 100 + i,
          storageKey: `${tenant.id}/file-${i}.pdf`,
          checksum: `checksum-${i}`,
          metadata: { title: `Doc ${i}`, description: "", tags: [] },
        }),
      ),
    );

    const response = await fetch(`http://127.0.0.1:${port}/documents?page=1&pageSize=2`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as Record<string, unknown>;
    const data = body.data as Record<string, unknown>;

    assert.equal((data.documents as unknown[]).length, 2);
    assert.equal((data.pagination as Record<string, unknown>).totalRecords, 3);
    assert.equal((data.pagination as Record<string, unknown>).totalPages, 2);
  } finally {
    await closeServer(server);
  }
});

void test("GET /documents/:id — returns single document", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant, user } = await createActiveTenantAdmin();
  const accessToken = await login(port);

  const { doc } = await createTestDocumentWithPolicy(
    tenant.id, user.id, "internal",
    ["discover", "read", "download"],
    { metadata: { title: "Test", description: "Desc", tags: ["tag1"] } },
  );

  const response = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;
  const result = (body.data as Record<string, unknown>).document as Record<string, unknown>;

  assert.equal(result.fileName, "test.pdf");
  assert.equal((result.metadata as Record<string, unknown>).title, "Test");
  assert.equal(result.classification, "internal");
  assert.equal(result.versionLabel, "v1");
  await closeServer(server);
});

void test("GET /documents/:id — returns 404 for non-existent", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createActiveTenantAdmin();
  const accessToken = await login(port);

  const response = await fetch(`http://127.0.0.1:${port}/documents/000000000000000000000000`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  assert.equal(response.status, 404);
  await closeServer(server);
});

void test("PATCH /documents/:id — updates metadata", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant, user } = await createActiveTenantAdmin();
  const accessToken = await login(port);

  const { doc } = await createTestDocumentWithPolicy(
    tenant.id, user.id, "internal",
    ["discover", "read", "download", "update"],
    { metadata: { title: "Original", description: "Orig", tags: ["old"] } },
  );

  const response = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: "Updated Title", tags: ["new", "tags"], classification: "confidential" }),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;
  const result = (body.data as Record<string, unknown>).document as Record<string, unknown>;

  assert.equal((result.metadata as Record<string, unknown>).title, "Updated Title");
  assert.deepEqual((result.metadata as Record<string, unknown>).tags, ["new", "tags"]);
  assert.equal(result.classification, "confidential");
  await closeServer(server);
});

void test("Company Admin cannot bypass explicit document-policy denials for ordinary actions", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;
    const { tenant, user } = await createActiveTenantAdmin();
    const accessToken = await login(port);
    const { doc } = await createTestDocumentWithPolicy(
      tenant.id,
      user.id,
      "internal",
      ["read", "download", "update", "delete"],
      {
        metadata: { title: "Policy protected", description: "", tags: [] },
        additionalPolicyRules: [{
          ruleId: "deny-company-admin-ordinary-actions",
          effect: "deny",
          subject: { type: "tenant_member" },
          actions: ["read", "download", "update", "delete"],
        }],
      },
    );

    const headers = { Authorization: `Bearer ${accessToken}` };
    const read = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}`, { headers });
    const download = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}/download`, { headers });
    const update = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Unauthorized change" }),
    });
    const deletion = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}`, {
      method: "DELETE",
      headers,
    });

    assert.equal(read.status, 404);
    assert.equal(download.status, 404);
    assert.equal(update.status, 404);
    assert.equal(deletion.status, 404);
    const unchanged = await DocumentModel.findById(doc.id).lean().exec();
    assert.equal(unchanged?.metadata.title, "Policy protected");
    assert.equal(unchanged?.deletedAt, null);
  } finally {
    await closeServer(server);
  }
});

void test("Company Admin ordinary actions fail closed without an active policy while manage_access recovery remains authorized", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;
    const { tenant, user } = await createActiveTenantAdmin();
    const accessToken = await login(port);
    const { doc, policy } = await createTestDocumentWithPolicy(
      tenant.id,
      user.id,
      "internal",
      ["read", "download", "update", "manage_access"],
    );
    await DocumentModel.updateOne(
      { _id: doc._id, tenantId: tenant._id },
      { $unset: { activePolicyId: 1, activePolicyVersion: 1 } },
    );

    const headers = { Authorization: `Bearer ${accessToken}` };
    const read = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}`, { headers });
    const download = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}/download`, { headers });
    const update = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Unauthorized change" }),
    });

    assert.equal(read.status, 404);
    assert.equal(download.status, 404);
    assert.equal(update.status, 404);
    await assert.doesNotReject(
      getDocumentAccessAuthorizationService().authorizeDocumentAction(
        { tenantId: tenant.id, actorId: user.id },
        doc.id,
        "manage_access",
      ),
    );

    await DocumentModel.updateOne(
      { _id: doc._id, tenantId: tenant._id },
      { $set: { activePolicyId: new Types.ObjectId(), activePolicyVersion: 1 } },
    );
    const stalePolicyRead = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}`, { headers });
    assert.equal(stalePolicyRead.status, 404);

    await DocumentAccessPolicyModel.collection.updateOne(
      { _id: policy._id },
      { $set: { contractVersion: 2 } },
    );
    await DocumentModel.updateOne(
      { _id: doc._id, tenantId: tenant._id },
      { $set: { activePolicyId: policy.policyId, activePolicyVersion: policy.policyVersion } },
    );
    const malformedPolicyRead = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}`, { headers });
    assert.equal(malformedPolicyRead.status, 400);
  } finally {
    await closeServer(server);
  }
});

void test("document owner cannot bypass an explicit read denial", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;
    const { tenant } = await createActiveTenantAdmin();
    const employee = await createEmployee(tenant.id);
    const accessToken = await login(port, tenant.slug, employee.email);
    const { doc } = await createTestDocumentWithPolicy(
      tenant.id,
      employee.id,
      "internal",
      ["read"],
      { additionalPolicyRules: [{
        ruleId: "deny-owner-read",
        effect: "deny",
        subject: { type: "user", id: employee.id },
        actions: ["read"],
      }] },
    );

    const response = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    assert.equal(response.status, 404);
  } finally {
    await closeServer(server);
  }
});

void test("ordinary metadata update rejects every owner assignment and cannot grant owner access", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;
    const { tenant, user } = await createActiveTenantAdmin();
    const localTarget = await createEmployee(tenant.id, { email: "new-owner@acme.com" });
    const { user: foreignTarget } = await createActiveTenantAdmin({
      slug: "foreign-owner-tenant",
      companyName: "Foreign Owner Tenant",
      email: "foreign-owner@example.com",
    });
    const accessToken = await login(port);
    const { doc } = await createTestDocumentWithPolicy(
      tenant.id,
      user.id,
      "internal",
      ["read", "update"],
    );
    const attemptedOwners = [
      localTarget.id,
      foreignTarget.id,
      new Types.ObjectId().toString(),
    ];

    for (const owner of attemptedOwners) {
      const response = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ owner }),
      });
      assert.equal(response.status, 400);
      const unchanged = await DocumentModel.findById(doc.id).select("owner").lean().exec();
      assert.equal(unchanged?.owner?.toString(), user.id);
    }

    const targetToken = await login(port, tenant.slug, localTarget.email);
    const targetRead = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}`, {
      headers: { Authorization: `Bearer ${targetToken}` },
    });
    assert.equal(targetRead.status, 404);
  } finally {
    await closeServer(server);
  }
});

void test("use_in_ai continues to require exact policy authorization for Company Admin and owner", async () => {
  const { tenant, user } = await createActiveTenantAdmin();
  const employee = await createEmployee(tenant.id);
  const adminDocument = await createTestDocumentWithPolicy(tenant.id, user.id, "internal", ["use_in_ai"]);
  const ownerDocument = await createTestDocumentWithPolicy(tenant.id, employee.id, "internal", ["use_in_ai"], {
    fileName: "owner-ai.pdf",
    checksum: "owner-ai-checksum",
  });
  const deniedAdminDocument = await createTestDocumentWithPolicy(tenant.id, user.id, "internal", ["use_in_ai"], {
    fileName: "denied-admin-ai.pdf",
    checksum: "denied-admin-ai-checksum",
    additionalPolicyRules: [{ ruleId: "deny-admin-ai", effect: "deny", subject: { type: "tenant_member" }, actions: ["use_in_ai"] }],
  });
  const deniedOwnerDocument = await createTestDocumentWithPolicy(tenant.id, employee.id, "internal", ["use_in_ai"], {
    fileName: "denied-owner-ai.pdf",
    checksum: "denied-owner-ai-checksum",
    additionalPolicyRules: [{ ruleId: "deny-owner-ai", effect: "deny", subject: { type: "tenant_member" }, actions: ["use_in_ai"] }],
  });
  const authorization = getDocumentAccessAuthorizationService();

  await assert.doesNotReject(authorization.authorizeDocumentAction(
    { tenantId: tenant.id, actorId: user.id }, adminDocument.doc.id, "use_in_ai",
  ));
  await assert.doesNotReject(authorization.authorizeDocumentAction(
    { tenantId: tenant.id, actorId: employee.id }, ownerDocument.doc.id, "use_in_ai",
  ));

  await assert.rejects(authorization.authorizeDocumentAction(
    { tenantId: tenant.id, actorId: user.id }, deniedAdminDocument.doc.id, "use_in_ai",
  ));
  await assert.rejects(authorization.authorizeDocumentAction(
    { tenantId: tenant.id, actorId: employee.id }, deniedOwnerDocument.doc.id, "use_in_ai",
  ));
});

void test("DELETE /documents/:id — soft deletes document", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant, user } = await createActiveTenantAdmin();
  const accessToken = await login(port);

  const { doc } = await createTestDocumentWithPolicy(
    tenant.id, user.id, "internal",
    ["discover", "read", "download", "delete"],
    { metadata: { title: "To Delete", description: "", tags: [] } },
  );

  const response = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  assert.equal(response.status, 200);

  const softDeleted = await DocumentModel.findById(doc.id);
  assert.ok(softDeleted);
  assert.ok(softDeleted.deletedAt);

  const response2 = await fetch(`http://127.0.0.1:${port}/documents`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body2 = (await response2.json()) as Record<string, unknown>;
  const data2 = body2.data as Record<string, unknown>;
  assert.equal((data2.documents as unknown[]).length, 0);

  await closeServer(server);
});

void test("DELETE /documents/:id — returns 404 for non-existent", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createActiveTenantAdmin();
  const accessToken = await login(port);

  const response = await fetch(`http://127.0.0.1:${port}/documents/000000000000000000000000`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  assert.equal(response.status, 404);
  await closeServer(server);
});

void test("GET /documents/:id/download — downloads document", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;
    await createActiveTenantAdmin();
    const accessToken = await login(port);

    const pdfContent = Buffer.from("%PDF-1.4 download test", "utf-8");
    const { buffer, boundary } = buildMultipartBody("dl.pdf", pdfContent, {
      title: "DL",
    });

    const storageRes = await fetch(`http://127.0.0.1:${port}/documents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: buffer,
    });
    const storageBody = (await storageRes.json()) as Record<string, unknown>;
    const docData = (storageBody.data as Record<string, unknown>).document as Record<
      string,
      unknown
    >;

    const response = await fetch(
      `http://127.0.0.1:${port}/documents/${docData.id}/download`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "application/pdf");
    assert.ok(response.headers.get("Content-Disposition")?.includes("dl.pdf"));
  } finally {
    await closeServer(server);
  }
});

void test("GET /documents/:id/download — returns 404 for cross-tenant", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;

    await createActiveTenantAdmin({ slug: "tenant-a", email: "admin@a.com", companyName: "Tenant A" });
    const { tenant: tenantB, user: userB } = await createActiveTenantAdmin({
      slug: "tenant-b", email: "admin@b.com", companyName: "Tenant B",
    });

    const { doc } = await createTestDocumentWithPolicy(
      tenantB.id, userB.id, "restricted",
      ["discover", "read", "download"],
      { metadata: { title: "Secret", description: "", tags: [] } },
    );

    const accessToken = await login(port, "tenant-a", "admin@a.com");
    const response = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}/download`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    assert.equal(response.status, 404);
  } finally {
    await closeServer(server);
  }
});

void test("POST /documents/:id/archive — archives document", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant, user } = await createActiveTenantAdmin();
  const accessToken = await login(port);

  const { doc } = await createTestDocumentWithPolicy(
    tenant.id, user.id, "internal",
    ["discover", "read", "download", "archive"],
    { metadata: { title: "Archive Me", description: "", tags: [] } },
  );

  const response = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}/archive`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  assert.equal(response.status, 200);

  const archived = await DocumentModel.findById(doc.id);
  assert.ok(archived);
  assert.equal(archived.isArchived, true);
  assert.ok(archived.archivedAt);

  const listRes = await fetch(`http://127.0.0.1:${port}/documents`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const listBody = (await listRes.json()) as Record<string, unknown>;
  const listData = listBody.data as Record<string, unknown>;
  assert.equal((listData.documents as unknown[]).length, 0);

  await closeServer(server);
});

void test("POST /documents/:id/restore — restores archived document", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant, user } = await createActiveTenantAdmin();
  const accessToken = await login(port);

  const { doc } = await createTestDocumentWithPolicy(
    tenant.id, user.id, "internal",
    ["discover", "read", "download", "restore"],
    {
      metadata: { title: "Restore Me", description: "", tags: [] },
      isArchived: true,
      archivedAt: new Date(),
      archivedBy: user.id,
    },
  );

  const response = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}/restore`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  assert.equal(response.status, 200);

  const restored = await DocumentModel.findById(doc.id);
  assert.ok(restored);
  assert.equal(restored.isArchived, false);
  assert.equal(restored.archivedAt, null);

  await closeServer(server);
});

void test("GET /documents/:id/versions — lists version history", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant, user } = await createActiveTenantAdmin();
  const accessToken = await login(port);

  const { doc } = await createTestDocumentWithPolicy(
    tenant.id, user.id, "internal",
    ["discover", "read", "download"],
    {
      metadata: { title: "Versioned", description: "", tags: [] },
      fileName: "versioned.pdf",
      originalFileName: "versioned.pdf",
      storageKey: `${tenant.id}/versioned.pdf`,
      checksum: "v-cs",
      version: 2,
      versionLabel: "v2",
    },
  );

  await DocumentVersionModel.insertMany([
    {
      documentId: doc.id,
      tenantId: tenant.id,
      version: 1,
      versionLabel: "v1",
      fileName: "versioned-v1.pdf",
      fileSize: 80,
      mimeType: "application/pdf",
      checksum: "v1-cs",
      storageKey: `${tenant.id}/v1.pdf`,
      uploadedBy: user.id,
      uploadReason: "initial",
      changeDescription: null,
    },
    {
      documentId: doc.id,
      tenantId: tenant.id,
      version: 2,
      versionLabel: "v2",
      fileName: "versioned-v2.pdf",
      fileSize: 100,
      mimeType: "application/pdf",
      checksum: "v2-cs",
      storageKey: `${tenant.id}/v2.pdf`,
      uploadedBy: user.id,
      uploadReason: "replace",
      changeDescription: "Updated content",
    },
  ]);

  const response = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}/versions`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;
  const data = body.data as Record<string, unknown>;
  const versions = data.versions as Array<Record<string, unknown>>;

  assert.equal(versions.length, 2);
  assert.equal(versions[0].version, 2);
  assert.equal(versions[1].version, 1);

  await closeServer(server);
});

void test("employee cannot archive (permission denied)", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;
    const { tenant } = await createActiveTenantAdmin();
    const empUser = await createEmployee(tenant.id);
    const empToken = await login(port, "acme-consulting", "john@acme.com");

    const { doc } = await createTestDocumentWithPolicy(
      tenant.id, empUser.id, "internal",
      ["discover", "read", "download", "archive"],
      { metadata: { title: "Emp Test", description: "", tags: [] } },
    );

    const response = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}/archive`, {
      method: "POST",
      headers: { Authorization: `Bearer ${empToken}` },
    });

    assert.equal(response.status, 403);
  } finally {
    await closeServer(server);
  }
});

void test("employee can download documents with documents.download and matching document access", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;
    const { tenant, user: adminUser } = await createActiveTenantAdmin();
    const empUser = await createEmployee(tenant.id);
    const role = await RoleModel.create({
      tenantId: tenant._id,
      name: "Scoped Downloader",
      normalizedName: "scoped downloader",
      baseRole: "EMPLOYEE",
      grants: [{
        permission: Permission.DOCUMENTS_DOWNLOAD,
        scopes: {
          selfOnly: false,
          departmentIds: [],
          documentCategories: [],
          documentClassifications: ["internal"],
        },
      }],
      createdBy: adminUser._id,
      updatedBy: adminUser._id,
    });
    await UserModel.updateOne(
      { _id: empUser._id },
      { $set: { customRoleId: role._id } },
    );

    const storageKey = `${tenant.id}/download-test.pdf`;
    const fullPath = path.join(UPLOAD_TEST_DIR, storageKey);
    const fileContent = Buffer.from("employee download test content");
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(fullPath, fileContent);

    const { doc } = await createTestDocumentWithPolicy(
      tenant.id, empUser.id, "internal",
      ["discover", "read", "download"],
      {
        fileName: "download-test.pdf",
        originalFileName: "download-test.pdf",
        fileSize: fileContent.length,
        storageKey,
        checksum: "dl-cs",
        metadata: { title: "Download Test", description: "", tags: [] },
        category: "policy",
        quarantineStatus: "none",
        isArchived: false,
      },
    );

    const empToken = await login(port, "acme-consulting", "john@acme.com");
    const response = await fetch(
      `http://127.0.0.1:${port}/documents/${doc.id}/download`,
      {
        headers: { Authorization: `Bearer ${empToken}` },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(await response.text(), fileContent.toString("utf-8"));
  } finally {
    await closeServer(server);
  }
});

void test("employee without documents.download receives a stable authorization denial", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;
    const { tenant } = await createActiveTenantAdmin();
    const empUser = await createEmployee(tenant.id);

    const storageKey = `${tenant.id}/ordinary-employee.pdf`;
    const fullPath = path.join(UPLOAD_TEST_DIR, storageKey);
    const fileContent = Buffer.from("ordinary employee content");
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(fullPath, fileContent);

    const { doc } = await createTestDocumentWithPolicy(
      tenant.id, empUser.id, "internal",
      ["discover", "read", "download"],
      {
        fileName: "ordinary-employee.pdf",
        originalFileName: "ordinary-employee.pdf",
        fileSize: fileContent.length,
        storageKey,
        checksum: "ordinary-employee",
        metadata: { title: "Ordinary Employee", description: "", tags: [] },
        quarantineStatus: "none",
        isArchived: false,
      },
    );

    const empToken = await login(port, "acme-consulting", "john@acme.com");
    const response = await fetch(
      `http://127.0.0.1:${port}/documents/${doc.id}/download`,
      {
        headers: { Authorization: `Bearer ${empToken}` },
      },
    );

    assert.equal(response.status, 403);
    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(
      (body.error as { code?: string } | undefined)?.code,
      "PERMISSION_REQUIRED",
    );
  } finally {
    await closeServer(server);
  }
});

void test("AUTH-COR-004 — preview uses read permission and read policy while download remains separate", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;
    const { tenant } = await createActiveTenantAdmin();
    const employee = await createEmployee(tenant.id);
    const fileContent = Buffer.from("read-only preview content");
    const storageKey = await writeTestDocumentFile(tenant.id, "read-preview.pdf", fileContent);
    const { doc } = await createTestDocumentWithPolicy(
      tenant.id,
      employee.id,
      "internal",
      ["read"],
      {
        fileName: "read-preview.pdf",
        originalFileName: "read-preview.pdf",
        fileSize: fileContent.length,
        storageKey,
        checksum: "read-preview",
      },
    );
    const token = await login(port, "acme-consulting", employee.email);
    const headers = { Authorization: `Bearer ${token}` };

    const preview = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}/preview`, { headers });
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get("Content-Disposition"), "inline");
    assert.equal(await preview.text(), fileContent.toString("utf-8"));

    const download = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}/download`, { headers });
    assert.equal(download.status, 403);

    await DocumentModel.updateOne(
      { _id: doc._id, tenantId: tenant._id },
      { $set: { isArchived: true, archivedAt: new Date(), archivedBy: employee._id } },
    );
    const archivedPreview = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}/preview`, { headers });
    assert.equal(archivedPreview.status, 200);
    assert.equal(await archivedPreview.text(), fileContent.toString("utf-8"));
  } finally {
    await closeServer(server);
  }
});

void test("AUTH-COR-004 — preview read-policy denial applies to Company Admin and document owner", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;
    const { tenant, user: admin } = await createActiveTenantAdmin();
    const employee = await createEmployee(tenant.id);
    const adminFile = Buffer.from("admin denied preview");
    const ownerFile = Buffer.from("owner denied preview");
    const [adminStorageKey, ownerStorageKey] = await Promise.all([
      writeTestDocumentFile(tenant.id, "admin-denied-preview.pdf", adminFile),
      writeTestDocumentFile(tenant.id, "owner-denied-preview.pdf", ownerFile),
    ]);
    const { doc: adminDoc } = await createTestDocumentWithPolicy(
      tenant.id,
      admin.id,
      "internal",
      ["read"],
      {
        fileName: "admin-denied-preview.pdf",
        storageKey: adminStorageKey,
        fileSize: adminFile.length,
        checksum: "admin-denied-preview",
        additionalPolicyRules: [{ ruleId: "deny-admin-preview", effect: "deny", subject: { type: "user", id: admin.id }, actions: ["read"] }],
      },
    );
    const { doc: ownerDoc } = await createTestDocumentWithPolicy(
      tenant.id,
      employee.id,
      "internal",
      ["read"],
      {
        fileName: "owner-denied-preview.pdf",
        storageKey: ownerStorageKey,
        fileSize: ownerFile.length,
        checksum: "owner-denied-preview",
        additionalPolicyRules: [{ ruleId: "deny-owner-preview", effect: "deny", subject: { type: "user", id: employee.id }, actions: ["read"] }],
      },
    );
    const [adminToken, employeeToken] = await Promise.all([
      login(port),
      login(port, "acme-consulting", employee.email),
    ]);

    const adminPreview = await fetch(`http://127.0.0.1:${port}/documents/${adminDoc.id}/preview`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const ownerPreview = await fetch(`http://127.0.0.1:${port}/documents/${ownerDoc.id}/preview`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    assert.equal(adminPreview.status, 404);
    assert.equal(ownerPreview.status, 404);
  } finally {
    await closeServer(server);
  }
});

void test("AUTH-COR-004 — scoped preview enforces the authoritative document scope", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;
    const { tenant, user: admin } = await createActiveTenantAdmin();
    const employee = await createEmployee(tenant.id);
    const [hr, finance] = await Promise.all([
      DepartmentModel.create({ tenantId: tenant._id, name: "HR", normalizedName: "hr", description: null, status: "active", version: 1, createdBy: admin._id, updatedBy: admin._id }),
      DepartmentModel.create({ tenantId: tenant._id, name: "Finance", normalizedName: "finance", description: null, status: "active", version: 1, createdBy: admin._id, updatedBy: admin._id }),
    ]);
    const role = await RoleModel.create({
      tenantId: tenant._id,
      name: "HR Preview Reader",
      normalizedName: "hr preview reader",
      baseRole: "EMPLOYEE",
      grants: [{
        permission: Permission.DOCUMENTS_READ,
        scopes: { selfOnly: false, departmentIds: [hr.id], documentCategories: [], documentClassifications: [] },
      }],
      createdBy: admin._id,
      updatedBy: admin._id,
    });
    await UserModel.updateOne({ _id: employee._id }, { $set: { customRoleId: role._id } });
    const fileContent = Buffer.from("scoped preview content");
    const [hrStorageKey, financeStorageKey] = await Promise.all([
      writeTestDocumentFile(tenant.id, "hr-preview.pdf", fileContent),
      writeTestDocumentFile(tenant.id, "finance-preview.pdf", fileContent),
    ]);
    const { doc: hrDoc } = await createTestDocumentWithPolicy(tenant.id, employee.id, "internal", ["read"], {
      fileName: "hr-preview.pdf", storageKey: hrStorageKey, fileSize: fileContent.length, checksum: "hr-preview", department: "HR", departmentId: hr.id,
    });
    const { doc: financeDoc } = await createTestDocumentWithPolicy(tenant.id, employee.id, "internal", ["read"], {
      fileName: "finance-preview.pdf", storageKey: financeStorageKey, fileSize: fileContent.length, checksum: "finance-preview", department: "Finance", departmentId: finance.id,
    });
    const token = await login(port, "acme-consulting", employee.email);
    const headers = { Authorization: `Bearer ${token}` };

    const allowed = await fetch(`http://127.0.0.1:${port}/documents/${hrDoc.id}/preview`, { headers });
    const denied = await fetch(`http://127.0.0.1:${port}/documents/${financeDoc.id}/preview`, { headers });
    assert.equal(allowed.status, 200);
    assert.equal(await allowed.text(), fileContent.toString("utf-8"));
    assert.equal(denied.status, 404);
  } finally {
    await closeServer(server);
  }
});

void test("employee with documents.download but without document-level access is denied", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;
    const { tenant, user: adminUser } = await createActiveTenantAdmin();
    const empUser = await createEmployee(tenant.id);
    const role = await RoleModel.create({
      tenantId: tenant._id,
      name: "Restricted Downloader",
      normalizedName: "restricted downloader",
      baseRole: "EMPLOYEE",
      grants: [{
        permission: Permission.DOCUMENTS_DOWNLOAD,
        scopes: {
          selfOnly: false,
          departmentIds: [],
          documentCategories: [],
          documentClassifications: ["confidential"],
        },
      }],
      createdBy: adminUser._id,
      updatedBy: adminUser._id,
    });
    await UserModel.updateOne(
      { _id: empUser._id },
      { $set: { customRoleId: role._id } },
    );

    const storageKey = `${tenant.id}/no-access.pdf`;
    const fullPath = path.join(UPLOAD_TEST_DIR, storageKey);
    const fileContent = Buffer.from("no access content");
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(fullPath, fileContent);

    const { doc } = await createTestDocumentWithPolicy(
      tenant.id, adminUser.id, "internal",
      ["discover", "read", "download"],
      {
        fileName: "no-access.pdf",
        originalFileName: "no-access.pdf",
        fileSize: fileContent.length,
        storageKey,
        checksum: "no-access",
        metadata: { title: "No Access", description: "", tags: [] },
        quarantineStatus: "none",
        isArchived: false,
      },
    );

    const empToken = await login(port, "acme-consulting", "john@acme.com");
    const response = await fetch(
      `http://127.0.0.1:${port}/documents/${doc.id}/download`,
      {
        headers: { Authorization: `Bearer ${empToken}` },
      },
    );

    assert.equal(response.status, 404);
  } finally {
    await closeServer(server);
  }
});

void test("cross-tenant isolation — tenant A cannot see tenant B's documents", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;

    await createActiveTenantAdmin({
      slug: "tenant-a",
      email: "admin@a.com",
      companyName: "Tenant A",
    });
    const { user: userB, tenant: tenantB } = await createActiveTenantAdmin({
      slug: "tenant-b",
      email: "admin@b.com",
      companyName: "Tenant B",
    });

    const accessToken = await login(port, "tenant-a", "admin@a.com");

    await createTestDocumentWithPolicy(
      tenantB.id, userB.id, "restricted",
      ["discover", "read", "download"],
      { metadata: { title: "Secret", description: "", tags: [] } },
    );

    const response = await fetch(`http://127.0.0.1:${port}/documents`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as Record<string, unknown>;
    const data = body.data as Record<string, unknown>;

    assert.equal((data.documents as unknown[]).length, 0);
    assert.equal((data.pagination as Record<string, unknown>).totalRecords, 0);
  } finally {
    await closeServer(server);
  }
});

void test("GET /documents — search by title substring", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant, user } = await createActiveTenantAdmin();
  const accessToken = await login(port);

  const allActions = ["discover", "read", "download", "update", "delete", "archive", "restore", "replace"];
  await Promise.all([
    createTestDocumentWithPolicy(tenant.id, user.id, "internal", allActions, {
      fileName: "hr-policy.pdf",
      originalFileName: "hr-policy.pdf",
      fileSize: 100,
      storageKey: `${tenant.id}/hr.pdf`,
      checksum: "hr-cs",
      metadata: { title: "HR Policy 2024", description: "", tags: [] },
    }),
    createTestDocumentWithPolicy(tenant.id, user.id, "confidential", allActions, {
      fileName: "finance.pdf",
      originalFileName: "finance.pdf",
      fileSize: 200,
      storageKey: `${tenant.id}/fin.pdf`,
      checksum: "fin-cs",
      metadata: { title: "Finance Report", description: "", tags: [] },
    }),
  ]);

  const response = await fetch(`http://127.0.0.1:${port}/documents?search=HR`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;
  const data = body.data as Record<string, unknown>;
  assert.equal((data.documents as unknown[]).length, 1);
  assert.equal(((data.documents as unknown[])[0] as Record<string, unknown>).fileName, "hr-policy.pdf");
  await closeServer(server);
});

void test("GET /documents — filter by classification", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant, user } = await createActiveTenantAdmin();
  const accessToken = await login(port);

  const allActions = ["discover", "read", "download", "update", "delete", "archive", "restore", "replace"];
  await Promise.all([
    createTestDocumentWithPolicy(tenant.id, user.id, "public", allActions, {
      fileName: "public.pdf",
      originalFileName: "public.pdf",
      fileSize: 100,
      storageKey: `${tenant.id}/pub.pdf`,
      checksum: "pub-cs",
      metadata: { title: "Public Doc", description: "", tags: [] },
    }),
    createTestDocumentWithPolicy(tenant.id, user.id, "restricted", allActions, {
      fileName: "restricted.pdf",
      originalFileName: "restricted.pdf",
      fileSize: 200,
      storageKey: `${tenant.id}/res.pdf`,
      checksum: "res-cs",
      metadata: { title: "Restricted Doc", description: "", tags: [] },
    }),
  ]);

  const response = await fetch(`http://127.0.0.1:${port}/documents?classification=restricted`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;
  const data = body.data as Record<string, unknown>;
  assert.equal((data.documents as unknown[]).length, 1);
  assert.equal(((data.documents as unknown[])[0] as Record<string, unknown>).classification, "restricted");
  await closeServer(server);
});

void test("classification-scoped document operations use canonical taxonomy identity, not shared sensitivity level", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;
    const { tenant, user: admin } = await createActiveTenantAdmin();
    const employee = await createEmployee(tenant.id, { email: "classification-scope@acme.com" });
    const role = await RoleModel.create({
      tenantId: tenant._id,
      name: "Restricted Identity Role",
      normalizedName: "restricted identity role",
      baseRole: "EMPLOYEE",
      grants: [
        Permission.DOCUMENTS_READ,
        Permission.DOCUMENTS_CREATE,
        Permission.DOCUMENTS_USE_IN_AI,
      ].map((permission) => ({
        permission,
        scopes: {
          selfOnly: false,
          departmentIds: [],
          documentCategories: [],
          documentClassifications: ["restricted"],
        },
      })),
      createdBy: admin._id,
      updatedBy: admin._id,
    });
    await UserModel.updateOne({ _id: employee._id }, { $set: { customRoleId: role._id } });

    const restricted = await createTestDocumentWithPolicy(
      tenant.id, employee.id, "Restricted", ["discover", "read", "use_in_ai"],
      { classificationLevel: "restricted", fileName: "restricted-identity.pdf", checksum: "restricted-identity" },
    );
    const payroll = await createTestDocumentWithPolicy(
      tenant.id, employee.id, "Payroll Secret", ["discover", "read", "use_in_ai"],
      { classificationLevel: "restricted", fileName: "payroll-secret.pdf", checksum: "payroll-secret" },
    );
    const token = await login(port, "acme-consulting", "classification-scope@acme.com");

    const optionsResponse = await fetch(`http://127.0.0.1:${port}/documents/upload-options`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const optionsBody = await optionsResponse.json() as { data: { taxonomy: { classifications: Array<{ name: string }> } } };
    assert.equal(optionsResponse.status, 200);
    assert.deepEqual(optionsBody.data.taxonomy.classifications.map((item) => item.name), ["Restricted"]);

    assert.equal((await fetch(`http://127.0.0.1:${port}/documents/${restricted.doc.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${port}/documents/${payroll.doc.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })).status, 404);
    assert.ok(await AuditLogModel.findOne({
      tenantId: tenant._id,
      userId: employee._id,
      action: "PERMISSION_DENIED",
      "changes.reason": "SCOPE_MISMATCH",
      "metadata.resourceContext.documentClassification": "payroll secret",
    }).lean().exec());

    const listResponse = await fetch(`http://127.0.0.1:${port}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(listResponse.status, 200);
    const listed = (await listResponse.json()) as { data: { documents: Array<{ id: string }> } };
    assert.deepEqual(listed.data.documents.map((document) => document.id), [restricted.doc.id]);

    await assert.doesNotReject(getDocumentAccessAuthorizationService().authorizeDocumentAction(
      { tenantId: tenant.id, actorId: employee.id }, restricted.doc.id, "use_in_ai",
    ));
    await assert.rejects(getDocumentAccessAuthorizationService().authorizeDocumentAction(
      { tenantId: tenant.id, actorId: employee.id }, payroll.doc.id, "use_in_ai",
    ));

    for (const [classificationId, expectedStatus] of [
      [restricted.classification.id, 201],
      [payroll.classification.id, 403],
    ] as const) {
      const multipart = buildMultipartBody(`upload-${classificationId}.pdf`, Buffer.from("%PDF-1.4 scoped"), {
        title: "Scoped Classification Upload",
        classificationId,
      });
      const response = await fetch(`http://127.0.0.1:${port}/documents`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": `multipart/form-data; boundary=${multipart.boundary}`,
        },
        body: multipart.buffer,
      });
      assert.equal(response.status, expectedStatus);
    }
  } finally {
    await closeServer(server);
  }
});

void test("PUT /documents/:id/replace — replaces document and creates new version", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;
    const { tenant, user } = await createActiveTenantAdmin();
    const accessToken = await login(port);

    const pdfContent = Buffer.from("%PDF-1.4 original content", "utf-8");
    const allActions = ["discover", "read", "download", "update", "delete", "archive", "restore", "replace"];
    const { doc } = await createTestDocumentWithPolicy(
      tenant.id, user.id, "restricted", allActions, {
        fileName: "original.pdf",
        originalFileName: "original.pdf",
        fileSize: pdfContent.length,
        storageKey: `${tenant.id}/original.pdf`,
        checksum: "original-cs",
        metadata: { title: "Original", description: null, tags: [] },
      },
    );

    const fullPath = path.join(UPLOAD_TEST_DIR, `${tenant.id}/original.pdf`);
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(fullPath, pdfContent);

    await DocumentVersionModel.create({
      documentId: doc.id,
      tenantId: tenant.id,
      version: 1,
      versionLabel: "v1",
      fileName: "original.pdf",
      fileSize: pdfContent.length,
      mimeType: "application/pdf",
      checksum: "original-cs",
      storageKey: `${tenant.id}/original.pdf`,
      uploadedBy: user.id,
      uploadReason: "initial",
      changeDescription: null,
    });

    const newContent = Buffer.from("%PDF-1.4 replaced content v2", "utf-8");
    const { buffer: replaceBuffer, boundary: replaceBoundary } = buildMultipartBody("replaced.pdf", newContent, {});

    const replaceRes = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}/replace`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/form-data; boundary=${replaceBoundary}` },
      body: replaceBuffer,
    });
    assert.equal(replaceRes.status, 200);
    const replaceBody = (await replaceRes.json()) as Record<string, unknown>;
    assert.equal(replaceBody.success, true);

    const result = (replaceBody.data as Record<string, unknown>).document as Record<string, unknown>;
    assert.equal(result.fileName, "replaced.pdf");
    assert.equal(result.version, 2);
    assert.equal(result.versionLabel, "v2");
    assert.equal(result.fileSize, newContent.length);

    const versionsRes = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}/versions`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const versionsBody = (await versionsRes.json()) as Record<string, unknown>;
    const versions = (versionsBody.data as Record<string, unknown>).versions as unknown[];
    assert.equal(versions.length, 2);
  } finally {
    await closeServer(server);
  }
});

void test("DELETE /documents/:id/permanent — permanently deletes document and versions", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;
    const { tenant, user } = await createActiveTenantAdmin();
    const accessToken = await login(port);

    const pdfContent = Buffer.from("%PDF-1.4 to be deleted", "utf-8");
    const allActions = ["discover", "read", "download", "update", "delete", "archive", "restore", "replace"];
    const { doc } = await createTestDocumentWithPolicy(
      tenant.id, user.id, "restricted", allActions, {
        fileName: "delete-me.pdf",
        originalFileName: "delete-me.pdf",
        fileSize: pdfContent.length,
        storageKey: `${tenant.id}/delete-me.pdf`,
        checksum: "delete-cs",
        metadata: { title: "Delete Me", description: null, tags: [] },
      },
    );

    const fullPath = path.join(UPLOAD_TEST_DIR, `${tenant.id}/delete-me.pdf`);
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(fullPath, pdfContent);

    const softDeleteRes = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.equal(softDeleteRes.status, 200);

    const permDeleteRes = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}/permanent`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.equal(permDeleteRes.status, 200);
    const permBody = (await permDeleteRes.json()) as Record<string, unknown>;
    assert.equal(permBody.success, true);

    const getRes = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.equal(getRes.status, 404);

    const versions = await DocumentVersionModel.find({ documentId: new Types.ObjectId(doc.id as string) }).exec();
    assert.equal(versions.length, 0);
  } finally {
    await closeServer(server);
  }
});

void test("DELETE /documents/:id/permanent — returns 400 if not soft-deleted first", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;
    const { tenant, user } = await createActiveTenantAdmin();
    const accessToken = await login(port);

    const pdfContent = Buffer.from("%PDF-1.4 not deleted", "utf-8");
    const allActions = ["discover", "read", "download", "update", "delete", "archive", "restore", "replace"];
    const { doc } = await createTestDocumentWithPolicy(
      tenant.id, user.id, "restricted", allActions, {
        fileName: "not-deleted.pdf",
        originalFileName: "not-deleted.pdf",
        fileSize: pdfContent.length,
        storageKey: `${tenant.id}/not-deleted.pdf`,
        checksum: "not-deleted-cs",
        metadata: { title: "Not Deleted", description: null, tags: [] },
      },
    );

    const fullPath = path.join(UPLOAD_TEST_DIR, `${tenant.id}/not-deleted.pdf`);
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(fullPath, pdfContent);

    const permDeleteRes = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}/permanent`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.equal(permDeleteRes.status, 400);
  } finally {
    await closeServer(server);
  }
});

void test("POST /documents — returns duplicate warning when same checksum exists", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createActiveTenantAdmin();
  const accessToken = await login(port);

  const pdfContent = Buffer.from("%PDF-1.4 duplicate content", "utf-8");

  const { buffer: buf1, boundary: b1 } = buildMultipartBody("first.pdf", pdfContent, { title: "First" });
  const res1 = await fetch(`http://127.0.0.1:${port}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/form-data; boundary=${b1}` },
    body: buf1,
  });
  assert.equal(res1.status, 201);

  const { buffer: buf2, boundary: b2 } = buildMultipartBody("second.pdf", pdfContent, { title: "Second" });
  const res2 = await fetch(`http://127.0.0.1:${port}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/form-data; boundary=${b2}` },
    body: buf2,
  });
  assert.equal(res2.status, 201);
  const body2 = (await res2.json()) as Record<string, unknown>;
  const data2 = body2.data as Record<string, unknown>;
  assert.ok(data2.duplicateWarning, "should have duplicateWarning");
  const warning = data2.duplicateWarning as Record<string, unknown>;
  assert.ok(warning.existingDocumentId);
  assert.ok(warning.existingTitle);

  await closeServer(server);
});

void test("POST /documents — rejects unsupported MIME type", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createActiveTenantAdmin();
  const accessToken = await login(port);

  const boundary = "----TestBoundary" + Date.now();
  const exeContent = Buffer.from("MZ executable content", "utf-8");
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nMalware\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="virus.exe"\r\nContent-Type: application/x-msdownload\r\n\r\n`),
    exeContent,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const response = await fetch(`http://127.0.0.1:${port}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body,
  });
  assert.ok(response.status >= 400, "should reject unsupported file type");

  await closeServer(server);
});

void test("POST /documents — rejects signature mismatch (fake PDF with DOCX bytes)", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createActiveTenantAdmin();
  const accessToken = await login(port);

  const fakePdfContent = Buffer.from("PK\x03\x04 this is actually docx content pretending to be pdf", "utf-8");
  const { buffer, boundary } = buildMultipartBody("fake.pdf", fakePdfContent, { title: "Fake PDF" });

  const response = await fetch(`http://127.0.0.1:${port}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body: buffer,
  });

  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(response.status, 400);
  assert.equal(body.error, "FILE_SIGNATURE_MISMATCH");
  assert.equal(await DocumentModel.countDocuments({}), 0);

  await closeServer(server);
});

void test("POST /documents — rejects zero-byte file", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createActiveTenantAdmin();
  const accessToken = await login(port);

  const { buffer, boundary } = buildMultipartBody("empty.pdf", Buffer.alloc(0), { title: "Empty" });

  const response = await fetch(`http://127.0.0.1:${port}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body: buffer,
  });
  assert.equal(response.status, 400);

  await closeServer(server);
});

void test("POST /documents — sanitizes path traversal in filename", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createActiveTenantAdmin();
  const accessToken = await login(port);

  const pdfContent = Buffer.from("%PDF-1.4 traversal test", "utf-8");
  const { buffer, boundary } = buildMultipartBody("../../../etc/passwd.pdf", pdfContent, { title: "Traversal" });

  const response = await fetch(`http://127.0.0.1:${port}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body: buffer,
  });
  assert.equal(response.status, 201);
  const responseBody = await response.json() as { data: { document: { fileName: string } } };
  const docFileName = responseBody.data.document.fileName;
  assert.ok(!docFileName.includes(".."), "filename should not contain path traversal");
  assert.ok(!docFileName.includes("/"), "filename should not contain forward slash");

  await closeServer(server);
});

void test("POST /documents — stores selected taxonomy and references it in the default access policy", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant, user } = await createActiveTenantAdmin();
  const accessToken = await login(port);

  const category = await DocumentCategoryModel.create({
    tenantId: tenant._id, name: "Legal", normalizedName: "legal", description: null,
    status: "active", version: 1, createdBy: user._id, updatedBy: user._id,
  });
  const department = await DepartmentModel.create({
    tenantId: tenant._id, name: "Finance", normalizedName: "finance", description: null,
    status: "active", version: 1, createdBy: user._id, updatedBy: user._id,
  });
  const classification = await DocumentClassificationModel.create({
    tenantId: tenant._id, name: "Confidential", normalizedName: "confidential", level: "confidential",
    description: null, status: "active", version: 1, createdBy: user._id, updatedBy: user._id,
  });

  const pdfContent = Buffer.from("%PDF-1.4 taxonomy upload", "utf-8");
  const { buffer, boundary } = buildMultipartBody("contract.pdf", pdfContent, {
    title: "Legal Contract",
    categoryId: category._id.toString(),
    departmentId: department._id.toString(),
    classificationId: classification._id.toString(),
  });

  const response = await fetch(`http://127.0.0.1:${port}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body: buffer,
  });

  const body = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 201);
  assert.equal(body.success, true);

  const doc = (body.data as Record<string, unknown>).document as Record<string, unknown>;
  assert.equal(doc.category, "Legal");
  assert.equal(doc.department, "Finance");
  assert.equal(doc.classification, "confidential");

  const stored = await DocumentModel.findOne({ _id: String(doc.id), tenantId: tenant._id });
  assert.ok(stored, "document should be persisted");
  assert.equal(stored.categoryId?.toString(), category._id.toString());
  assert.equal(stored.departmentId?.toString(), department._id.toString());
  assert.equal(stored.classificationId?.toString(), classification._id.toString());

  const policy = await DocumentAccessPolicyModel.findOne({ documentId: stored._id, status: "active" });
  assert.ok(policy, "default access policy should be created");
  assert.equal(policy.indexMetadata?.categoryId?.toString(), category._id.toString());
  assert.equal(policy.indexMetadata?.departmentId?.toString(), department._id.toString());
  assert.equal(policy.indexMetadata?.classificationId?.toString(), classification._id.toString());

  await closeServer(server);
});

void test("POST /documents — default upload references the Internal classification in its policy", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant } = await createActiveTenantAdmin();
  const accessToken = await login(port);

  const pdfContent = Buffer.from("%PDF-1.4 default taxonomy", "utf-8");
  const { buffer, boundary } = buildMultipartBody("default.pdf", pdfContent, { title: "Default Taxonomy" });

  const response = await fetch(`http://127.0.0.1:${port}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body: buffer,
  });

  const body = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 201);
  const doc = (body.data as Record<string, unknown>).document as Record<string, unknown>;
  assert.equal(doc.classification, "internal");
  assert.equal(doc.category, null);
  assert.equal(doc.department, null);

  const stored = await DocumentModel.findOne({ _id: String(doc.id), tenantId: tenant._id });
  assert.ok(stored);
  const internal = await DocumentClassificationModel.findOne({ tenantId: tenant._id, normalizedName: "internal", status: "active" });
  assert.ok(internal, "Internal classification should be ensured for the tenant");
  const policy = await DocumentAccessPolicyModel.findOne({ documentId: stored._id, status: "active" });
  assert.ok(policy);
  assert.equal(policy.indexMetadata?.classificationId?.toString(), internal._id.toString());
  assert.equal(policy.indexMetadata?.categoryId, null);
  assert.equal(policy.indexMetadata?.departmentId, null);

  await closeServer(server);
});

void test("POST /documents — returns 400 TAXONOMY_RECORD_NOT_FOUND for unknown taxonomy id", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createActiveTenantAdmin();
  const accessToken = await login(port);

  const pdfContent = Buffer.from("%PDF-1.4 unknown taxonomy", "utf-8");
  const { buffer, boundary } = buildMultipartBody("x.pdf", pdfContent, {
    title: "Unknown taxonomy",
    classificationId: new mongoose.Types.ObjectId().toString(),
  });

  const response = await fetch(`http://127.0.0.1:${port}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body: buffer,
  });

  const body = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 400);
  assert.equal(body.error, "TAXONOMY_RECORD_NOT_FOUND");

  await closeServer(server);
});

void test("POST /documents — returns 400 TAXONOMY_RECORD_ARCHIVED for archived taxonomy id", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant, user } = await createActiveTenantAdmin();
  const accessToken = await login(port);

  const category = await DocumentCategoryModel.create({
    tenantId: tenant._id, name: "Old", normalizedName: "old", description: null,
    status: "archived", version: 1, createdBy: user._id, updatedBy: user._id,
  });

  const pdfContent = Buffer.from("%PDF-1.4 archived taxonomy", "utf-8");
  const { buffer, boundary } = buildMultipartBody("x.pdf", pdfContent, {
    title: "Archived taxonomy",
    categoryId: category._id.toString(),
  });

  const response = await fetch(`http://127.0.0.1:${port}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body: buffer,
  });

  const body = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 400);
  assert.equal(body.error, "TAXONOMY_RECORD_ARCHIVED");

  await closeServer(server);
});

void test("POST /documents — returns 400 VALIDATION_ERROR for malformed taxonomy id", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createActiveTenantAdmin();
  const accessToken = await login(port);

  const pdfContent = Buffer.from("%PDF-1.4 malformed taxonomy", "utf-8");
  const { buffer, boundary } = buildMultipartBody("x.pdf", pdfContent, {
    title: "Malformed taxonomy",
    departmentId: "not-an-object-id",
  });

  const response = await fetch(`http://127.0.0.1:${port}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body: buffer,
  });

  const body = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 400);
  assert.equal(body.error, "VALIDATION_ERROR");

  await closeServer(server);
});

void test("GET /documents/upload-options — returns active taxonomy and effective upload limits", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant, user } = await createActiveTenantAdmin({ fileSizeMb: 2 });
  const accessToken = await login(port);

  await DocumentCategoryModel.create({
    tenantId: tenant._id, name: "HR", normalizedName: "hr", description: null,
    status: "active", version: 1, createdBy: user._id, updatedBy: user._id,
  });
  await DepartmentModel.create({
    tenantId: tenant._id, name: "Engineering", normalizedName: "engineering", description: null,
    status: "active", version: 1, createdBy: user._id, updatedBy: user._id,
  });
  await DocumentClassificationModel.create({
    tenantId: tenant._id, name: "Restricted", normalizedName: "restricted", level: "restricted",
    description: null, status: "active", version: 1, createdBy: user._id, updatedBy: user._id,
  });
  // Archived records must be excluded from the upload form.
  await DocumentCategoryModel.create({
    tenantId: tenant._id, name: "ArchivedCat", normalizedName: "archivedcat", description: null,
    status: "archived", version: 1, createdBy: user._id, updatedBy: user._id,
  });

  const response = await fetch(`http://127.0.0.1:${port}/documents/upload-options`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  assert.equal(response.status, 200);
  const body = await response.json() as {
    success: boolean;
    data: {
      taxonomy: {
        classifications: Array<{ id: string; name: string; level: string }>;
        categories: Array<{ id: string; name: string }>;
        departments: Array<{ id: string; name: string }>;
      };
      upload: { maxFileSizeBytes: number; allowedMimeTypes: string[]; fileExtensions: string[] };
    };
  };
  assert.equal(body.success, true);
  assert.deepEqual(body.data.taxonomy.categories.map((c) => c.name), ["HR"]);
  assert.deepEqual(body.data.taxonomy.departments.map((d) => d.name), ["Engineering"]);
  assert.equal(body.data.taxonomy.classifications.length, 1);
  assert.equal(body.data.taxonomy.classifications[0].name, "Restricted");
  assert.equal(body.data.taxonomy.classifications[0].level, "restricted");
  assert.equal(body.data.upload.maxFileSizeBytes, 2 * 1024 * 1024);
  assert.ok(body.data.upload.allowedMimeTypes.includes("application/pdf"));
  assert.ok(body.data.upload.fileExtensions.includes(".pdf"));

  await closeServer(server);
});

void test("GET /documents/upload-options — returns 401 without auth", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;

  const response = await fetch(`http://127.0.0.1:${port}/documents/upload-options`);
  assert.equal(response.status, 401);

  await closeServer(server);
});

void test("AUTH-COR-001 — scoped document mutations use authoritative taxonomy and still obey document policy", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;
    const { tenant, user: admin } = await createActiveTenantAdmin();
    const employee = await createEmployee(tenant.id);
    const [hr, finance] = await Promise.all([
      DepartmentModel.create({ tenantId: tenant._id, name: "HR", normalizedName: "hr", description: null, status: "active", version: 1, createdBy: admin._id, updatedBy: admin._id }),
      DepartmentModel.create({ tenantId: tenant._id, name: "Finance", normalizedName: "finance", description: null, status: "active", version: 1, createdBy: admin._id, updatedBy: admin._id }),
    ]);
    const scopes = { selfOnly: false, departmentIds: [hr.id], documentCategories: [], documentClassifications: [] };
    const role = await RoleModel.create({
      tenantId: tenant._id,
      name: "HR Document Operator",
      normalizedName: "hr document operator",
      baseRole: "EMPLOYEE",
      grants: [
        { permission: Permission.DOCUMENTS_UPDATE, scopes },
        { permission: Permission.DOCUMENTS_ARCHIVE, scopes },
      ],
      createdBy: admin._id,
      updatedBy: admin._id,
    });
    await UserModel.updateOne({ _id: employee._id }, { $set: { customRoleId: role._id } });
    const actions = ["discover", "read", "update", "archive", "restore", "replace"];
    const { doc: hrDoc } = await createTestDocumentWithPolicy(tenant.id, employee.id, "internal", actions, { department: "HR", departmentId: hr.id });
    const { doc: financeDoc } = await createTestDocumentWithPolicy(tenant.id, employee.id, "internal", actions, { department: "Finance", departmentId: finance.id, checksum: "finance-scoped-deny" });
    const { doc: policyDeniedDoc } = await createTestDocumentWithPolicy(tenant.id, employee.id, "internal", actions, {
      department: "HR",
      departmentId: hr.id,
      checksum: "policy-denied-scoped-update",
      additionalPolicyRules: [{ ruleId: "deny-employee-update", effect: "deny", subject: { type: "user", id: employee.id }, actions: ["update"] }],
    });
    const token = await login(port, "acme-consulting", employee.email);

    const allowed = await fetch(`http://127.0.0.1:${port}/documents/${hrDoc.id}`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ title: "HR updated" }),
    });
    assert.equal(allowed.status, 200, await allowed.text());

    const denied = await fetch(`http://127.0.0.1:${port}/documents/${financeDoc.id}`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ title: "Finance updated" }),
    });
    assert.equal(denied.status, 404);

    const archived = await fetch(`http://127.0.0.1:${port}/documents/${hrDoc.id}/archive`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(archived.status, 200);

    const policyDenied = await fetch(`http://127.0.0.1:${port}/documents/${policyDeniedDoc.id}`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ title: "Must not change" }),
    });
    assert.equal(policyDenied.status, 404);
    assert.notEqual((await DocumentModel.findById(policyDeniedDoc.id))?.metadata.title, "Must not change");
  } finally {
    await closeServer(server);
  }
});

void test("AUTH-COR-001 — scoped users:read filters in Mongo and users:update checks the target", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;
    const { tenant, user: admin } = await createActiveTenantAdmin();
    const [hr, finance] = await Promise.all([
      DepartmentModel.create({ tenantId: tenant._id, name: "HR", normalizedName: "hr", description: null, status: "active", version: 1, createdBy: admin._id, updatedBy: admin._id }),
      DepartmentModel.create({ tenantId: tenant._id, name: "Finance", normalizedName: "finance", description: null, status: "active", version: 1, createdBy: admin._id, updatedBy: admin._id }),
    ]);
    const actor = await createEmployee(tenant.id, { email: "hr-operator@acme.com" });
    const hrTarget = await createEmployee(tenant.id, { email: "hr-target@acme.com" });
    const financeTarget = await createEmployee(tenant.id, { email: "finance-target@acme.com" });
    await UserModel.updateOne({ _id: actor._id }, { $set: { "employeeProfile.department": "HR" } });
    await UserModel.updateOne({ _id: hrTarget._id }, { $set: { "employeeProfile.department": "hr" } });
    await UserModel.updateOne({ _id: financeTarget._id }, { $set: { "employeeProfile.department": "Finance" } });
    const scopes = { selfOnly: false, departmentIds: [hr.id], documentCategories: [], documentClassifications: [] };
    const role = await RoleModel.create({ tenantId: tenant._id, name: "HR User Manager", normalizedName: "hr user manager", baseRole: "EMPLOYEE", grants: [
      { permission: Permission.USERS_READ, scopes }, { permission: Permission.USERS_UPDATE, scopes },
    ], createdBy: admin._id, updatedBy: admin._id });
    await UserModel.updateOne({ _id: actor._id }, { $set: { customRoleId: role._id } });
    const token = await login(port, "acme-consulting", actor.email);

    const list = await fetch(`http://127.0.0.1:${port}/users`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(list.status, 200);
    const listBody = await list.json() as { data: { users: Array<{ id: string }>; pagination: { totalRecords: number } } };
    assert.deepEqual(new Set(listBody.data.users.map((user) => user.id)), new Set([actor.id, hrTarget.id]));
    assert.equal(listBody.data.pagination.totalRecords, 2);

    const allowed = await fetch(`http://127.0.0.1:${port}/users/${hrTarget.id}`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ status: "disabled" }) });
    assert.equal(allowed.status, 200);
    const denied = await fetch(`http://127.0.0.1:${port}/users/${financeTarget.id}`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ status: "disabled" }) });
    assert.equal(denied.status, 403);
    assert.equal((await UserModel.findById(financeTarget.id))?.status, "active");
    assert.notEqual(finance.id, hr.id);

    const selfActor = await createEmployee(tenant.id, { email: "self-manager@acme.com" });
    const selfRole = await RoleModel.create({ tenantId: tenant._id, name: "Self User Manager", normalizedName: "self user manager", baseRole: "EMPLOYEE", grants: [
      { permission: Permission.USERS_READ, scopes: { selfOnly: true, departmentIds: [], documentCategories: [], documentClassifications: [] } },
      { permission: Permission.USERS_UPDATE, scopes: { selfOnly: true, departmentIds: [], documentCategories: [], documentClassifications: [] } },
    ], createdBy: admin._id, updatedBy: admin._id });
    await UserModel.updateOne({ _id: selfActor._id }, { $set: { customRoleId: selfRole._id } });
    const selfToken = await login(port, "acme-consulting", selfActor.email);
    const selfList = await fetch(`http://127.0.0.1:${port}/users`, { headers: { Authorization: `Bearer ${selfToken}` } });
    const selfListBody = await selfList.json() as { data: { users: Array<{ id: string }> } };
    assert.deepEqual(selfListBody.data.users.map((user) => user.id), [selfActor.id]);
    const otherUpdate = await fetch(`http://127.0.0.1:${port}/users/${hrTarget.id}`, { method: "PATCH", headers: { Authorization: `Bearer ${selfToken}`, "content-type": "application/json" }, body: JSON.stringify({ status: "active" }) });
    assert.equal(otherUpdate.status, 403);
    assert.equal(await AuditLogModel.countDocuments({
      tenantId: tenant._id,
      userId: selfActor._id,
      action: "PERMISSION_DENIED",
      "changes.reason": "SCOPE_MISMATCH",
    }), 1);
    const ownUpdate = await fetch(`http://127.0.0.1:${port}/users/${selfActor.id}`, { method: "PATCH", headers: { Authorization: `Bearer ${selfToken}`, "content-type": "application/json" }, body: JSON.stringify({ status: "disabled" }) });
    assert.equal(ownUpdate.status, 200);
  } finally {
    await closeServer(server);
  }
});

void test("AUTH-COR-001 — scoped reprocess denies out-of-scope documents before processing side effects", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;
    const { tenant, user: admin } = await createActiveTenantAdmin();
    const employee = await createEmployee(tenant.id);
    const [hr, finance] = await Promise.all([
      DepartmentModel.create({ tenantId: tenant._id, name: "HR", normalizedName: "hr", description: null, status: "active", version: 1, createdBy: admin._id, updatedBy: admin._id }),
      DepartmentModel.create({ tenantId: tenant._id, name: "Finance", normalizedName: "finance", description: null, status: "active", version: 1, createdBy: admin._id, updatedBy: admin._id }),
    ]);
    const role = await RoleModel.create({ tenantId: tenant._id, name: "HR Reprocessor", normalizedName: "hr reprocessor", baseRole: "EMPLOYEE", grants: [{
      permission: Permission.DOCUMENTS_OCR_PROCESS,
      scopes: { selfOnly: false, departmentIds: [hr.id], documentCategories: [], documentClassifications: [] },
    }], createdBy: admin._id, updatedBy: admin._id });
    await UserModel.updateOne({ _id: employee._id }, { $set: { customRoleId: role._id } });
    const { doc } = await createTestDocumentWithPolicy(tenant.id, employee.id, "internal", ["reprocess"], { department: "Finance", departmentId: finance.id, checksum: "finance-reprocess-deny" });
    const { doc: allowedDoc } = await createTestDocumentWithPolicy(tenant.id, employee.id, "internal", ["reprocess"], { department: "HR", departmentId: hr.id, checksum: "hr-reprocess-allow" });
    const { doc: policyDeniedDoc } = await createTestDocumentWithPolicy(tenant.id, employee.id, "internal", ["reprocess"], {
      department: "HR", departmentId: hr.id, checksum: "hr-reprocess-policy-deny",
      additionalPolicyRules: [{ ruleId: "deny-scoped-reprocess", effect: "deny", subject: { type: "user", id: employee.id }, actions: ["reprocess"] }],
    });
    const token = await login(port, "acme-consulting", employee.email);
    const response = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}/processing/reprocess`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 403);
    assert.equal(await ProcessingRunModel.countDocuments({ tenantId: tenant._id, documentId: doc._id }), 0);

    const denialAudit = await AuditLogModel.findOne({
      tenantId: tenant._id,
      userId: employee._id,
      action: "PERMISSION_DENIED",
      "changes.reason": "SCOPE_MISMATCH",
    }).lean().exec();
    assert.ok(denialAudit, "downstream department scope mismatch must persist PERMISSION_DENIED");

    const policyDenied = await fetch(`http://127.0.0.1:${port}/documents/${policyDeniedDoc.id}/processing/reprocess`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    assert.equal(policyDenied.status, 404);
    assert.equal(await ProcessingRunModel.countDocuments({ tenantId: tenant._id, documentId: policyDeniedDoc._id }), 0);

    const allowed = await fetch(`http://127.0.0.1:${port}/documents/${allowedDoc.id}/processing/reprocess`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    assert.equal(allowed.status, 200, await allowed.text());
    assert.equal(await ProcessingRunModel.countDocuments({ tenantId: tenant._id, documentId: allowedDoc._id }), 1);
  } finally {
    await closeServer(server);
  }
});

void test("processing mutations enforce DAP reprocess for Company Admin before run or extraction side effects", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;
    const { tenant, user: admin } = await createActiveTenantAdmin();
    const { doc } = await createTestDocumentWithPolicy(tenant.id, admin.id, "internal", ["reprocess"], {
      checksum: "company-admin-processing-deny",
      additionalPolicyRules: [{ ruleId: "deny-admin-reprocess", effect: "deny", subject: { type: "user", id: admin.id }, actions: ["reprocess"] }],
    });
    const token = await login(port);

    for (const endpoint of ["processing/initiate", "processing/retry", "processing/reprocess", "processing/cancel", "extraction/retrigger"]) {
      const response = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}/${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      assert.equal(response.status, 404, `${endpoint} must obey explicit reprocess deny`);
      assert.equal(await ProcessingRunModel.countDocuments({ documentId: doc._id }), 0);
      assert.equal((await DocumentModel.findById(doc._id))?.status, "uploaded");
    }
  } finally {
    await closeServer(server);
  }
});

void test("stale SUPER_ADMIN JWT loses foreign processing access after persisted role change", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;
    const platformTenant = await TenantModel.create({
      name: "DocuMind Platform",
      slug: PLATFORM_TENANT_SLUG,
      isSystemTenant: true,
      status: "active",
      plan: "pro",
    });
    const platformUser = await UserModel.create({
      tenantId: platformTenant._id,
      name: "Platform Operator",
      email: "platform-processing@example.com",
      passwordHash: await hashPassword(TEST_PASSWORD),
      role: "SUPER_ADMIN",
      status: "active",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });
    const { tenant: customerTenant, user: customerAdmin } = await createActiveTenantAdmin({
      slug: "processing-customer",
      companyName: "Processing Customer",
      email: "processing-customer@example.com",
    });
    const { doc } = await createTestDocumentWithPolicy(customerTenant.id, customerAdmin.id, "internal", ["read", "reprocess"], {
      checksum: "foreign-processing-document",
    });
    const staleToken = signJwt({
      sub: platformUser.id,
      tenantId: platformTenant.id,
      type: "access",
      role: "SUPER_ADMIN",
      email: platformUser.email,
      sessionVersion: platformUser.sessionVersion,
    }, config.JWT_SECRET, "15m");

    const legitimate = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}/processing/status`, {
      headers: { Authorization: `Bearer ${staleToken}` },
    });
    assert.equal(legitimate.status, 200, await legitimate.text());

    await UserModel.updateOne({ _id: platformUser._id }, { $set: { role: "COMPANY_ADMIN" } });
    const denied = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}/processing/status`, {
      headers: { Authorization: `Bearer ${staleToken}` },
    });
    assert.equal(denied.status, 404);
  } finally {
    await closeServer(server);
  }
});

void test("AUTH-COR-001 — scoped document create validates authoritative taxonomy before storage", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as { port: number }).port;
    const { tenant, user: admin } = await createActiveTenantAdmin();
    const employee = await createEmployee(tenant.id);
    const [hr, finance] = await Promise.all([
      DepartmentModel.create({ tenantId: tenant._id, name: "HR", normalizedName: "hr", description: null, status: "active", version: 1, createdBy: admin._id, updatedBy: admin._id }),
      DepartmentModel.create({ tenantId: tenant._id, name: "Finance", normalizedName: "finance", description: null, status: "active", version: 1, createdBy: admin._id, updatedBy: admin._id }),
    ]);
    const role = await RoleModel.create({ tenantId: tenant._id, name: "HR Uploader", normalizedName: "hr uploader", baseRole: "EMPLOYEE", grants: [{
      permission: Permission.DOCUMENTS_CREATE,
      scopes: { selfOnly: false, departmentIds: [hr.id], documentCategories: [], documentClassifications: [] },
    }], createdBy: admin._id, updatedBy: admin._id });
    await UserModel.updateOne({ _id: employee._id }, { $set: { customRoleId: role._id } });
    const token = await login(port, "acme-consulting", employee.email);
    const inScopeBody = buildMultipartBody("hr-create.pdf", Buffer.from("%PDF-1.4 scoped HR"), { title: "HR create", departmentId: hr.id });
    const allowed = await fetch(`http://127.0.0.1:${port}/documents`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/form-data; boundary=${inScopeBody.boundary}` }, body: inScopeBody.buffer });
    assert.equal(allowed.status, 201);

    const outOfScopeBody = buildMultipartBody("finance-create.pdf", Buffer.from("%PDF-1.4 scoped Finance"), { title: "Finance create", departmentId: finance.id });
    const denied = await fetch(`http://127.0.0.1:${port}/documents`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/form-data; boundary=${outOfScopeBody.boundary}` }, body: outOfScopeBody.buffer });
    assert.equal(denied.status, 403);
    assert.equal(await DocumentModel.countDocuments({ tenantId: tenant._id, departmentId: finance._id }), 0);
  } finally {
    await closeServer(server);
  }
});
