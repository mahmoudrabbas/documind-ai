import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";

process.env.NODE_ENV = "test";

import type { Express } from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { connectRedis, disconnectRedis } from "../../db/redis.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import DocumentModel from "../../db/models/document.model.js";
import { hashPassword } from "../auth/passwordHashing.js";
import * as fsp from "node:fs/promises";
import path from "node:path";
import { mkdirSync } from "node:fs";

const app: Express = (await import("../../app.js")).default;

const TEST_PASSWORD = "StrongPass123!";
const UPLOAD_TEST_DIR = path.join(process.cwd(), ".test-uploads");

let mongoServer: MongoMemoryServer;

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
  mongoServer = await MongoMemoryServer.create({
    binary: { version: process.env.MONGOMS_VERSION ?? "6.0.20" },
  });
  await mongoose.connect(mongoServer.getUri(), { dbName: "documents-test" });
  await connectRedis();
  mkdirSync(UPLOAD_TEST_DIR, { recursive: true });
});

beforeEach(async () => {
  await TenantModel.deleteMany({});
  await UserModel.deleteMany({});
  await DocumentModel.deleteMany({});

  const uploads = await fsp.readdir(UPLOAD_TEST_DIR).catch(() => []);
  for (const dir of uploads) {
    await fsp.rm(path.join(UPLOAD_TEST_DIR, dir), { recursive: true, force: true });
  }
});

after(async () => {
  await fsp.rm(UPLOAD_TEST_DIR, { recursive: true, force: true }).catch(() => {});
  await disconnectRedis();
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
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
    fileSize: 100 + i,
    mimeType: "application/pdf",
    storagePath: `${tenant.id}/file-${i}.pdf`,
    status: "uploaded" as const,
    metadata: { title: `Doc ${i}`, description: "", tags: [] },
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
    fileSize: 1234,
    mimeType: "application/pdf",
    storagePath: `${tenant.id}/test.pdf`,
    status: "uploaded",
    metadata: { title: "Test", description: "Desc", tags: ["tag1"] },
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
    fileSize: 1234,
    mimeType: "application/pdf",
    storagePath: `${tenant.id}/test.pdf`,
    status: "uploaded",
    metadata: { title: "Original", description: "Orig", tags: ["old"] },
    uploadedBy: user.id,
  });

  const response = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: "Updated Title", tags: ["new", "tags"] }),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;
  const result = (body.data as Record<string, unknown>).document as Record<string, unknown>;

  assert.equal((result.metadata as Record<string, unknown>).title, "Updated Title");
  assert.deepEqual((result.metadata as Record<string, unknown>).tags, ["new", "tags"]);
  await closeServer(server);
});

void test("DELETE /documents/:id — deletes document", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant, user } = await createActiveTenantAdmin();
  const accessToken = await login(port);

  const doc = await DocumentModel.create({
    tenantId: tenant.id,
    fileName: "test.pdf",
    fileSize: 1234,
    mimeType: "application/pdf",
    storagePath: `${tenant.id}/test.pdf`,
    status: "uploaded",
    metadata: { title: "To Delete", description: "", tags: [] },
    uploadedBy: user.id,
  });

  const response = await fetch(`http://127.0.0.1:${port}/documents/${doc.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  assert.equal(response.status, 200);

  const deleted = await DocumentModel.findById(doc.id);
  assert.equal(deleted, null);
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
    fileSize: 100,
    mimeType: "application/pdf",
    storagePath: `${tenantB.id}/secret.pdf`,
    status: "uploaded",
    metadata: { title: "Secret", description: "", tags: [] },
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
