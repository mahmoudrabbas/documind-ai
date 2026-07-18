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
import DocumentModel from "../../db/models/document.model.js";
import DocumentVersionModel from "../../db/models/documentVersion.model.js";
import { hashPassword } from "../auth/passwordHashing.js";
import * as fsp from "node:fs/promises";
import path from "node:path";
import { mkdirSync } from "node:fs";


const app: Express = (await import("../../app.js")).default;

const TEST_PASSWORD = "StrongPass123!";
const UPLOAD_TEST_DIR = path.join(process.cwd(), ".test-uploads");

let mongoServer: MongoMemoryReplSet | null = null;

function createServer() {
  return new Promise<Server>((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.closeAllConnections?.();
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function createActiveTenantAdmin(
  options: { slug?: string; companyName?: string; email?: string } = {},
) {
  const tenant = await TenantModel.create({
    name: options.companyName ?? "Acme Consulting",
    slug: options.slug ?? "acme-consulting",
    status: "active",
    plan: "free",
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
  await TenantModel.deleteMany({});
  await UserModel.deleteMany({});
  await DocumentModel.deleteMany({});
  await DocumentVersionModel.deleteMany({});

  const uploads = await fsp.readdir(UPLOAD_TEST_DIR).catch(() => []);
  for (const dir of uploads) {
    await fsp.rm(path.join(UPLOAD_TEST_DIR, dir), { recursive: true, force: true });
  }
});

after(async () => {
  await fsp.rm(UPLOAD_TEST_DIR, { recursive: true, force: true }).catch(() => {});
  await disconnectRedis();
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

void test("POST /documents — quarantines file with signature mismatch", async () => {
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

  assert.equal(response.status, 201);
  const body = (await response.json()) as Record<string, unknown>;
  const doc = (body.data as Record<string, unknown>).document as Record<string, unknown>;
  assert.equal(doc.quarantineStatus, "quarantined");
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
  const port = (server.address() as { port: number }).port;
  const { tenant, user } = await createActiveTenantAdmin();
  const accessToken = await login(port);

  const docs = Array.from({ length: 3 }, (_, i) => ({
    tenantId: tenant.id,
    fileName: `doc-${i}.pdf`,
    originalFileName: `doc-${i}.pdf`,
    fileSize: 100 + i,
    mimeType: "application/pdf",
    storageKey: `${tenant.id}/file-${i}.pdf`,
    checksum: `checksum-${i}`,
    status: "uploaded" as const,
    metadata: { title: `Doc ${i}`, description: "", tags: [] },
    category: null,
    department: null,
    classification: "internal" as const,
    owner: null,
    effectiveDate: null,
    expiryDate: null,
    version: 1,
    versionLabel: "v1",
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    deletedAt: null,
    deletedBy: null,
    quarantineStatus: "none" as const,
    scanResult: null,
    uploadedBy: user.id,
  }));

  await DocumentModel.insertMany(docs);

  const response = await fetch(`http://127.0.0.1:${port}/documents?page=1&pageSize=2`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;
  const data = body.data as Record<string, unknown>;

  assert.equal((data.documents as unknown[]).length, 2);
  assert.equal((data.pagination as Record<string, unknown>).totalRecords, 3);
  assert.equal((data.pagination as Record<string, unknown>).totalPages, 2);
  await closeServer(server);
});

void test("GET /documents/:id — returns single document", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant, user } = await createActiveTenantAdmin();
  const accessToken = await login(port);

  const doc = await DocumentModel.create({
    tenantId: tenant.id,
    fileName: "test.pdf",
    originalFileName: "test.pdf",
    fileSize: 1234,
    mimeType: "application/pdf",
    storageKey: `${tenant.id}/test.pdf`,
    checksum: "abc123",
    status: "uploaded",
    metadata: { title: "Test", description: "Desc", tags: ["tag1"] },
    classification: "internal",
    version: 1,
    versionLabel: "v1",
    uploadedBy: user.id,
  });

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

  const doc = await DocumentModel.create({
    tenantId: tenant.id,
    fileName: "test.pdf",
    originalFileName: "test.pdf",
    fileSize: 1234,
    mimeType: "application/pdf",
    storageKey: `${tenant.id}/test.pdf`,
    checksum: "abc123",
    status: "uploaded",
    metadata: { title: "Original", description: "Orig", tags: ["old"] },
    classification: "internal",
    version: 1,
    versionLabel: "v1",
    uploadedBy: user.id,
  });

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

void test("DELETE /documents/:id — soft deletes document", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant, user } = await createActiveTenantAdmin();
  const accessToken = await login(port);

  const doc = await DocumentModel.create({
    tenantId: tenant.id,
    fileName: "test.pdf",
    originalFileName: "test.pdf",
    fileSize: 1234,
    mimeType: "application/pdf",
    storageKey: `${tenant.id}/test.pdf`,
    checksum: "abc123",
    status: "uploaded",
    metadata: { title: "To Delete", description: "", tags: [] },
    classification: "internal",
    version: 1,
    versionLabel: "v1",
    uploadedBy: user.id,
  });

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
  const port = (server.address() as { port: number }).port;
  await createActiveTenantAdmin();
  const accessToken = await login(port);

  const pdfContent = Buffer.from("%PDF-1.4 download test", "utf-8");

  const storageRes = await fetch(`http://127.0.0.1:${port}/documents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/form-data; boundary=${buildMultipartBody("dl.pdf", pdfContent, { title: "DL" }).boundary}`,
    },
    body: buildMultipartBody("dl.pdf", pdfContent, { title: "DL" }).buffer,
  });
  const storageBody = (await storageRes.json()) as Record<string, unknown>;
  const docData = (storageBody.data as Record<string, unknown>).document as Record<string, unknown>;

  const response = await fetch(`http://127.0.0.1:${port}/documents/${docData.id}/download`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/pdf");
  assert.ok(response.headers.get("Content-Disposition")?.includes("dl.pdf"));

  await closeServer(server);
});

void test("GET /documents/:id/download — returns 404 for cross-tenant", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;

  await createActiveTenantAdmin({ slug: "tenant-a", email: "admin@a.com", companyName: "Tenant A" });
  const { tenant: tenantB, user: userB } = await createActiveTenantAdmin({
    slug: "tenant-b", email: "admin@b.com", companyName: "Tenant B",
  });

  const doc = await DocumentModel.create({
    tenantId: tenantB.id,
    fileName: "secret.pdf",
    originalFileName: "secret.pdf",
    fileSize: 100,
    mimeType: "application/pdf",
    storageKey: `${tenantB.id}/secret.pdf`,
    checksum: "secret-checksum",
    status: "uploaded",
    metadata: { title: "Secret", description: "", tags: [] },
    classification: "restricted",
    version: 1,
    versionLabel: "v1",
    uploadedBy: userB.id,
  });

  const accessToken = await login(port, "tenant-a", "admin@a.com");
  const response = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}/download`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  assert.equal(response.status, 404);
  await closeServer(server);
});

void test("POST /documents/:id/archive — archives document", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant, user } = await createActiveTenantAdmin();
  const accessToken = await login(port);

  const doc = await DocumentModel.create({
    tenantId: tenant.id,
    fileName: "archive-test.pdf",
    originalFileName: "archive-test.pdf",
    fileSize: 100,
    mimeType: "application/pdf",
    storageKey: `${tenant.id}/archive-test.pdf`,
    checksum: "archive-cs",
    status: "uploaded",
    metadata: { title: "Archive Me", description: "", tags: [] },
    classification: "internal",
    version: 1,
    versionLabel: "v1",
    uploadedBy: user.id,
  });

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

  const doc = await DocumentModel.create({
    tenantId: tenant.id,
    fileName: "restore-test.pdf",
    originalFileName: "restore-test.pdf",
    fileSize: 100,
    mimeType: "application/pdf",
    storageKey: `${tenant.id}/restore-test.pdf`,
    checksum: "restore-cs",
    status: "uploaded",
    metadata: { title: "Restore Me", description: "", tags: [] },
    classification: "internal",
    version: 1,
    versionLabel: "v1",
    isArchived: true,
    archivedAt: new Date(),
    archivedBy: user.id,
    uploadedBy: user.id,
  });

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

  const doc = await DocumentModel.create({
    tenantId: tenant.id,
    fileName: "versioned.pdf",
    originalFileName: "versioned.pdf",
    fileSize: 100,
    mimeType: "application/pdf",
    storageKey: `${tenant.id}/versioned.pdf`,
    checksum: "v-cs",
    status: "uploaded",
    metadata: { title: "Versioned", description: "", tags: [] },
    classification: "internal",
    version: 2,
    versionLabel: "v2",
    uploadedBy: user.id,
  });

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
  const port = (server.address() as { port: number }).port;
  const { tenant } = await createActiveTenantAdmin();
  const empUser = await createEmployee(tenant.id);
  const empToken = await login(port, "acme-consulting", "john@acme.com");

  const doc = await DocumentModel.create({
    tenantId: tenant.id,
    fileName: "emp-test.pdf",
    originalFileName: "emp-test.pdf",
    fileSize: 100,
    mimeType: "application/pdf",
    storageKey: `${tenant.id}/emp-test.pdf`,
    checksum: "emp-cs",
    status: "uploaded",
    metadata: { title: "Emp Test", description: "", tags: [] },
    classification: "internal",
    version: 1,
    versionLabel: "v1",
    uploadedBy: empUser.id,
  });

  const response = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}/archive`, {
    method: "POST",
    headers: { Authorization: `Bearer ${empToken}` },
  });

  assert.equal(response.status, 403);
  await closeServer(server);
});

void test("employee can download documents", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant } = await createActiveTenantAdmin();
  const empUser = await createEmployee(tenant.id);

  const storageKey = `${tenant.id}/download-test.pdf`;
  const fullPath = path.join(UPLOAD_TEST_DIR, storageKey);
  await fsp.mkdir(path.dirname(fullPath), { recursive: true });
  await fsp.writeFile(fullPath, Buffer.from("employee download test content"));

  const doc = await DocumentModel.create({
    tenantId: tenant.id,
    fileName: "download-test.pdf",
    originalFileName: "download-test.pdf",
    fileSize: 100,
    mimeType: "application/pdf",
    storageKey,
    checksum: "dl-cs",
    status: "uploaded",
    metadata: { title: "Download Test", description: "", tags: [] },
    classification: "internal",
    quarantineStatus: "none",
    version: 1,
    versionLabel: "v1",
    isArchived: false,
    uploadedBy: empUser.id,
  });

  const empToken = await login(port, "acme-consulting", "john@acme.com");
  const response = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}/download`, {
    headers: { Authorization: `Bearer ${empToken}` },
  });

  assert.equal(response.status, 200);
  await closeServer(server);
});

void test("cross-tenant isolation — tenant A cannot see tenant B's documents", async () => {
  const server = await createServer();
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

  await DocumentModel.create({
    tenantId: tenantB.id,
    fileName: "secret.pdf",
    originalFileName: "secret.pdf",
    fileSize: 100,
    mimeType: "application/pdf",
    storageKey: `${tenantB.id}/secret.pdf`,
    checksum: "secret-cs",
    status: "uploaded",
    metadata: { title: "Secret", description: "", tags: [] },
    classification: "restricted",
    version: 1,
    versionLabel: "v1",
    uploadedBy: userB.id,
  });

  const response = await fetch(`http://127.0.0.1:${port}/documents`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;
  const data = body.data as Record<string, unknown>;

  assert.equal((data.documents as unknown[]).length, 0);
  assert.equal((data.pagination as Record<string, unknown>).totalRecords, 0);
  await closeServer(server);
});

void test("GET /documents — search by title substring", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant, user } = await createActiveTenantAdmin();
  const accessToken = await login(port);

  await DocumentModel.insertMany([
    {
      tenantId: tenant.id, fileName: "hr-policy.pdf", originalFileName: "hr-policy.pdf",
      fileSize: 100, mimeType: "application/pdf", storageKey: `${tenant.id}/hr.pdf`,
      checksum: "hr-cs", status: "uploaded", classification: "internal", version: 1,
      versionLabel: "v1", metadata: { title: "HR Policy 2024", description: "", tags: [] },
      uploadedBy: user.id,
    },
    {
      tenantId: tenant.id, fileName: "finance.pdf", originalFileName: "finance.pdf",
      fileSize: 200, mimeType: "application/pdf", storageKey: `${tenant.id}/fin.pdf`,
      checksum: "fin-cs", status: "uploaded", classification: "confidential", version: 1,
      versionLabel: "v1", metadata: { title: "Finance Report", description: "", tags: [] },
      uploadedBy: user.id,
    },
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

  await DocumentModel.insertMany([
    {
      tenantId: tenant.id, fileName: "public.pdf", originalFileName: "public.pdf",
      fileSize: 100, mimeType: "application/pdf", storageKey: `${tenant.id}/pub.pdf`,
      checksum: "pub-cs", status: "uploaded", classification: "public", version: 1,
      versionLabel: "v1", metadata: { title: "Public Doc", description: "", tags: [] },
      uploadedBy: user.id,
    },
    {
      tenantId: tenant.id, fileName: "restricted.pdf", originalFileName: "restricted.pdf",
      fileSize: 200, mimeType: "application/pdf", storageKey: `${tenant.id}/res.pdf`,
      checksum: "res-cs", status: "uploaded", classification: "restricted", version: 1,
      versionLabel: "v1", metadata: { title: "Restricted Doc", description: "", tags: [] },
      uploadedBy: user.id,
    },
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

void test("PUT /documents/:id/replace — replaces document and creates new version", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createActiveTenantAdmin();
  const accessToken = await login(port);

  const pdfContent = Buffer.from("%PDF-1.4 original content", "utf-8");
  const { buffer: uploadBuffer, boundary: uploadBoundary } = buildMultipartBody("original.pdf", pdfContent, { title: "Original" });

  const uploadRes = await fetch(`http://127.0.0.1:${port}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/form-data; boundary=${uploadBoundary}` },
    body: uploadBuffer,
  });
  assert.equal(uploadRes.status, 201);
  const uploadBody = (await uploadRes.json()) as Record<string, unknown>;
  const docId = ((uploadBody.data as Record<string, unknown>).document as Record<string, unknown>).id;

  const newContent = Buffer.from("%PDF-1.4 replaced content v2", "utf-8");
  const { buffer: replaceBuffer, boundary: replaceBoundary } = buildMultipartBody("replaced.pdf", newContent, {});

  const replaceRes = await fetch(`http://127.0.0.1:${port}/documents/${docId}/replace`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/form-data; boundary=${replaceBoundary}` },
    body: replaceBuffer,
  });
  assert.equal(replaceRes.status, 200);
  const replaceBody = (await replaceRes.json()) as Record<string, unknown>;
  assert.equal(replaceBody.success, true);

  const doc = (replaceBody.data as Record<string, unknown>).document as Record<string, unknown>;
  assert.equal(doc.fileName, "replaced.pdf");
  assert.equal(doc.version, 2);
  assert.equal(doc.versionLabel, "v2");
  assert.equal(doc.fileSize, newContent.length);

  const versionsRes = await fetch(`http://127.0.0.1:${port}/documents/${docId}/versions`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const versionsBody = (await versionsRes.json()) as Record<string, unknown>;
  const versions = (versionsBody.data as Record<string, unknown>).versions as unknown[];
  assert.equal(versions.length, 2);

  await closeServer(server);
});

void test("DELETE /documents/:id/permanent — permanently deletes document and versions", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createActiveTenantAdmin();
  const accessToken = await login(port);

  const pdfContent = Buffer.from("%PDF-1.4 to be deleted", "utf-8");
  const { buffer, boundary } = buildMultipartBody("delete-me.pdf", pdfContent, { title: "Delete Me" });

  const uploadRes = await fetch(`http://127.0.0.1:${port}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body: buffer,
  });
  assert.equal(uploadRes.status, 201);
  const uploadBody = (await uploadRes.json()) as Record<string, unknown>;
  const docId = ((uploadBody.data as Record<string, unknown>).document as Record<string, unknown>).id;

  const softDeleteRes = await fetch(`http://127.0.0.1:${port}/documents/${docId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert.equal(softDeleteRes.status, 200);

  const permDeleteRes = await fetch(`http://127.0.0.1:${port}/documents/${docId}/permanent`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert.equal(permDeleteRes.status, 200);
  const permBody = (await permDeleteRes.json()) as Record<string, unknown>;
  assert.equal(permBody.success, true);

  const getRes = await fetch(`http://127.0.0.1:${port}/documents/${docId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert.equal(getRes.status, 404);

  const versions = await DocumentVersionModel.find({ documentId: new Types.ObjectId(docId as string) }).exec();
  assert.equal(versions.length, 0);

  await closeServer(server);
});

void test("DELETE /documents/:id/permanent — returns 400 if not soft-deleted first", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createActiveTenantAdmin();
  const accessToken = await login(port);

  const pdfContent = Buffer.from("%PDF-1.4 not deleted", "utf-8");
  const { buffer, boundary } = buildMultipartBody("not-deleted.pdf", pdfContent, { title: "Not Deleted" });

  const uploadRes = await fetch(`http://127.0.0.1:${port}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body: buffer,
  });
  assert.equal(uploadRes.status, 201);
  const uploadBody = (await uploadRes.json()) as Record<string, unknown>;
  const docId = ((uploadBody.data as Record<string, unknown>).document as Record<string, unknown>).id;

  const permDeleteRes = await fetch(`http://127.0.0.1:${port}/documents/${docId}/permanent`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert.equal(permDeleteRes.status, 400);

  await closeServer(server);
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

void test("POST /documents — detects signature mismatch (fake PDF with DOCX bytes)", async () => {
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

  const body2 = (await response.json()) as Record<string, unknown>;
  const doc = (body2.data as Record<string, unknown>).document as Record<string, unknown>;
  assert.equal(doc.quarantineStatus, "quarantined");
  assert.equal(doc.scanResult && (doc.scanResult as Record<string, unknown>).result, "error");

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
