import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";

process.env.NODE_ENV = "test";

import type { Express } from "express";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import { hashPassword } from "../auth/passwordHashing.js";
import { disconnectRedis } from "../../db/redis.js";
import AgentRunModel, { type AgentRunDocument } from "../../db/models/agentRun.model.js";
import AgentStepModel from "../../db/models/agentStep.model.js";
import AgentToolCallModel from "../../db/models/agentToolCall.model.js";
import AgentApprovalModel from "../../db/models/agentApproval.model.js";
import { ToolRegistry } from "./toolRegistry.js";
import { Supervisor } from "./supervisor.js";
import { createFakeTools } from "./fakeTools.js";
import { createDefaultGuardrails } from "./guardrails.js";
import { FakeModelAdapter } from "../../providers/llm/fakeAdapters.js";

const app: Express = (await import("../../app.js")).default;

const TEST_PASSWORD = "StrongPass123!";

let mongoServer: MongoMemoryReplSet;

async function createTenantAndAdmin() {
  const tenant = await TenantModel.create({
    name: "Test Corp",
    slug: "test-corp",
    status: "active",
    plan: "free",
  });
  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Admin User",
    email: "admin@test.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  return { tenant, user };
}

async function createServer() {
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

async function login(port: number, slug = "test-corp", email = "admin@test.com") {
  const response = await fetch(`http://127.0.0.1:${port}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ companySlug: slug, email, password: TEST_PASSWORD }),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: { tokens: { accessToken: string } } };
  return body.data.tokens.accessToken;
}

before(async () => {
  mongoServer = await MongoMemoryReplSet.create({
    binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
    replSet: { count: 1 },
    instanceOpts: [{ launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000) }],
  });
  await mongoose.connect(mongoServer.getUri(), { dbName: "agents-test" });
});

beforeEach(async () => {
  await AgentRunModel.deleteMany({});
  await AgentStepModel.deleteMany({});
  await AgentToolCallModel.deleteMany({});
  await AgentApprovalModel.deleteMany({});
  await TenantModel.deleteMany({});
  await UserModel.deleteMany({});
});

after(async () => {
  await disconnectRedis();
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

void test("ToolRegistry rejects unregistered tool", async () => {
  const registry = new ToolRegistry();
  for (const tool of createFakeTools()) registry.register(tool);
  const result = await registry.execute({ tenantId: "1", actorId: "1", traceId: "t", requestId: "r", workflowName: "w", agentName: "a" }, "nonexistent", {}, async () => false);
  assert.equal(result.status, "unauthorized");
  assert.equal((result.error as { code: string }).code, "UNREGISTERED_TOOL");
});

void test("ToolRegistry reauthorizes and executes registered tool", async () => {
  const registry = new ToolRegistry();
  for (const tool of createFakeTools()) registry.register(tool);
  const result = await registry.execute({ tenantId: "1", actorId: "1", traceId: "t", requestId: "r", workflowName: "w", agentName: "a" }, "echo", { text: "hi" }, async () => true);
  assert.equal(result.ok, true);
  assert.deepEqual(result.output, { echoed: "hi" });
});

void test("ToolRegistry denies unauthorized tool call", async () => {
  const registry = new ToolRegistry();
  for (const tool of createFakeTools()) registry.register(tool);
  const result = await registry.execute({ tenantId: "1", actorId: "1", traceId: "t", requestId: "r", workflowName: "w", agentName: "a" }, "echo", { text: "hi" }, async () => false);
  assert.equal(result.ok, false);
  assert.equal(result.status, "unauthorized");
  assert.equal((result.error as { code: string }).code, "TOOL_UNAUTHORIZED");
});

void test("Supervisor deterministic plan for handoff input", async () => {
  const supervisor = new Supervisor(new FakeModelAdapter(), createDefaultGuardrails());
  const decision = await supervisor.decide({ tenantId: "1", actorId: "1", traceId: "t", requestId: "r", workflowName: "w", agentName: "a" }, { agentName: "a", note: "handoff to billing" }, ["default-agent", "handoff-agent"]);
  assert.equal(decision.plan.action, "handoff");
  assert.ok(decision.plan.handoffTo && decision.plan.handoffTo !== "unknown");
});

void test("Supervisor deterministic plan for tool input", async () => {
  const supervisor = new Supervisor(new FakeModelAdapter(), createDefaultGuardrails());
  const decision = await supervisor.decide({ tenantId: "1", actorId: "1", traceId: "t", requestId: "r", workflowName: "w", agentName: "a" }, { agentName: "a", note: "call echo tool" }, []);
  assert.equal(decision.plan.action, "tool_call");
  assert.equal(decision.plan.toolName, "echo");
});

void test("Guardrails block oversized input", async () => {
  const guardrails = createDefaultGuardrails();
  const result = await guardrails[0].evaluate({ tenantId: "1", actorId: "1", traceId: "t", requestId: "r", workflowName: "w", agentName: "a" }, { input: { text: "x".repeat(60_000) } });
  assert.equal(result.passed, false);
  assert.equal(result.action, "block");
});

void test("Guardrails require approval for sensitive actions", async () => {
  const guardrails = createDefaultGuardrails();
  const result = await guardrails[1].evaluate({ tenantId: "1", actorId: "1", traceId: "t", requestId: "r", workflowName: "w", agentName: "a" }, { action: "handoff", toolName: "handoff" });
  assert.equal(result.action, "approval_required");
});

void test("POST /agents/runs creates a run and completes plan", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createTenantAndAdmin();
  const token = await login(port);

  const response = await fetch(`http://127.0.0.1:${port}/agents/runs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ workflowName: "test-workflow", agentName: "test-agent", input: { note: "hello" } }),
  });
  assert.equal(response.status, 201);
  const body = (await response.json()) as { success: boolean; data: { id: string; status: string } };
  assert.equal(body.success, true);
  assert.equal(body.data.status, "completed");

  const run = await AgentRunModel.findById(body.data.id).lean().exec();
  assert.ok(run);
  assert.equal(run?.status, "completed");
  assert.equal((run?.input as Record<string, unknown>).note, "hello");
  assert.ok(run?.traceId);
  assert.ok(run?.requestId);

  await closeServer(server);
});

void test("POST /agents/runs rejects unauthenticated request", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createTenantAndAdmin();

  const response = await fetch(`http://127.0.0.1:${port}/agents/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflowName: "test", agentName: "a", input: {} }),
  });
  assert.equal(response.status, 401);

  await closeServer(server);
});

void test("Agent run is tenant scoped", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createTenantAndAdmin();
  const tokenA = await login(port, "test-corp", "admin@test.com");

  const tenantB = await TenantModel.create({
    name: "Other Corp",
    slug: "other-corp",
    status: "active",
    plan: "free",
  });
  await UserModel.create({
    tenantId: tenantB.id,
    name: "Admin B",
    email: "admin@other.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  const tokenB = await login(port, "other-corp", "admin@other.com");

  const createRes = await fetch(`http://127.0.0.1:${port}/agents/runs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
    body: JSON.stringify({ workflowName: "w", agentName: "a", input: {} }),
  });
  assert.equal(createRes.status, 201);
  const created = (await createRes.json()) as { data: { id: string } };

  const readA = await fetch(`http://127.0.0.1:${port}/agents/runs/${created.data.id}`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.equal(readA.status, 200);

  const readB = await fetch(`http://127.0.0.1:${port}/agents/runs/${created.data.id}`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert.equal(readB.status, 404);

  await closeServer(server);
});

void test("Approval flow pauses run and resume approves completion", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createTenantAndAdmin();
  const token = await login(port);

  const createRes = await fetch(`http://127.0.0.1:${port}/agents/runs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ workflowName: "w", agentName: "a", input: { note: "approval please" } }),
  });
  assert.equal(createRes.status, 201);
  const created = (await createRes.json()) as { data: { id: string } };

  const approval = await AgentApprovalModel.findOne({ runId: created.data.id }).lean().exec();
  assert.ok(approval);
  assert.equal(approval?.status, "pending");

  const resumeRes = await fetch(`http://127.0.0.1:${port}/agents/runs/${created.data.id}/approvals/${approval?._id}/resume`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "approve", decisionNote: "approved" }),
  });
  assert.equal(resumeRes.status, 200);
  const resumed = (await resumeRes.json()) as { data: { id: string; status: string } };
  assert.equal(resumed.data.status, "completed");

  const updatedApproval = await AgentApprovalModel.findById(approval?._id).lean().exec();
  assert.equal(updatedApproval?.status, "approved");

  await closeServer(server);
});

void test("Approval reject sets run to failed", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createTenantAndAdmin();
  const token = await login(port);

  const createRes = await fetch(`http://127.0.0.1:${port}/agents/runs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ workflowName: "w", agentName: "a", input: { note: "approval please" } }),
  });
  const created = (await createRes.json()) as { data: { id: string } };
  const approval = await AgentApprovalModel.findOne({ runId: created.data.id }).lean().exec();

  const resumeRes = await fetch(`http://127.0.0.1:${port}/agents/runs/${created.data.id}/approvals/${approval?._id}/resume`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "reject" }),
  });
  assert.equal(resumeRes.status, 200);
  const resumed = (await resumeRes.json()) as { data: { status: string } };
  assert.equal(resumed.data.status, "failed");

  await closeServer(server);
});

void test("Super Admin can list all tenant agent runs", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createTenantAndAdmin();
  const token = await login(port);

  await fetch(`http://127.0.0.1:${port}/agents/runs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ workflowName: "w", agentName: "a", input: {} }),
  });

  const superAdmin = await UserModel.create({
    tenantId: (await TenantModel.findOne({ slug: "test-corp" }))!.id,
    name: "Super Admin",
    email: "super@test.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "SUPER_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  await UserModel.updateOne({ _id: superAdmin.id }, { $set: { tenantId: (await TenantModel.findOne({ slug: "test-corp" }))!.id } });

  const saLogin = await fetch(`http://127.0.0.1:${port}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ companySlug: "test-corp", email: "super@test.com", password: TEST_PASSWORD }),
  });
  const saToken = (await saLogin.json()).data.tokens.accessToken;

  const adminList = await fetch(`http://127.0.0.1:${port}/super-admin/agents/runs`, {
    headers: { Authorization: `Bearer ${saToken}` },
  });
  assert.equal(adminList.status, 200);
  const adminBody = (await adminList.json()) as { data: { runs: Array<{ id: string }> } };
  assert.ok(adminBody.data.runs.length >= 1);

  await closeServer(server);
});

void test("Trace redaction does not leak secrets in run output", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createTenantAndAdmin();
  const token = await login(port);

  const response = await fetch(`http://127.0.0.1:${port}/agents/runs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ workflowName: "w", agentName: "a", input: {} }),
  });
  const created = (await response.json()) as { data: { id: string } };
  const run = await AgentRunModel.findById(created.data.id).lean().exec();
  assert.ok(run);
  const json = JSON.stringify(run);
  assert.ok(!json.includes("StrongPass123!"));
  assert.ok(!json.includes("passwordHash"));

  await closeServer(server);
});
