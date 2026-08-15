import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryPermissionEvaluator } from "../../permissions/permissions.evaluator.fake.js";
import {
  resetPermissionEvaluator,
  setPermissionEvaluator,
} from "../../permissions/permissions.evaluator.js";
import { platformGuideAgent } from "./platformGuideAgent.js";
import type { AgentRunContext } from "../../agents/agentRunContext.js";

const tenantId = "507f1f77bcf86cd799439011";
const actorId = "507f191e810c19729de860ea";

function makeRunContext(actorRole: "SUPER_ADMIN" | "COMPANY_ADMIN" | "EMPLOYEE"): AgentRunContext {
  return {
    tenantId,
    actorId,
    actorEmail: "actor@example.test",
    actorRole,
    traceId: "trace-1",
    requestId: "request-1",
    workflowName: "copilot-classify",
    agentName: "platform-guide-agent",
  };
}

function withEvaluator(baseRole: "SUPER_ADMIN" | "COMPANY_ADMIN" | "EMPLOYEE", run: () => Promise<void>) {
  const evaluator = new InMemoryPermissionEvaluator();
  evaluator.addUser(actorId, tenantId, baseRole);
  setPermissionEvaluator(evaluator);
  return run().finally(() => resetPermissionEvaluator());
}

test("guide agent builds a navigate.emails session for 'show me the email logs'", async () => {
  await withEvaluator("COMPANY_ADMIN", async () => {
    const result = await platformGuideAgent.execute(
      makeRunContext("COMPANY_ADMIN"),
      { utterance: "show me the email logs", locale: "en", flowIdHint: undefined },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.output.mode, "guide");
    const session = result.output.guideSession;
    assert.equal(session.flowId, "navigate.emails");
    assert.equal(session.entryRoute, "/dashboard/emails");
    assert.equal(session.steps.length, 2);
    assert.equal(session.steps[0]!.target.targetId, "nav-emails");
    assert.equal(session.steps[1]!.target.targetId, "page-heading-emails");
  });
});

test("guide agent falls back to a section guide when a hint fails to expand", async () => {
  await withEvaluator("COMPANY_ADMIN", async () => {
    const result = await platformGuideAgent.execute(
      makeRunContext("COMPANY_ADMIN"),
      { utterance: "show me the audit log", locale: "en", flowIdHint: "bogus.flow" },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.output.guideSession.flowId, "navigate.audit");
    assert.equal(result.output.guideSession.steps[0]!.target.targetId, "nav-audit");
  });
});

test("guide agent ignores a wrong flowIdHint and resolves the section deterministically", async () => {
  await withEvaluator("COMPANY_ADMIN", async () => {
    const result = await platformGuideAgent.execute(
      makeRunContext("COMPANY_ADMIN"),
      { utterance: "show me the email logs", locale: "en", flowIdHint: "settings.open" },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.output.guideSession.flowId, "navigate.emails");
    assert.equal(result.output.guideSession.steps[0]!.target.targetId, "nav-emails");
  });
});

test("guide agent rejects a flowIdHint that does not match the utterance", async () => {
  await withEvaluator("COMPANY_ADMIN", async () => {
    const result = await platformGuideAgent.execute(
      makeRunContext("COMPANY_ADMIN"),
      { utterance: "tell me about the platypus migration", locale: "en", flowIdHint: "settings.open" },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "NO_MATCHING_FLOW");
  });
});

test("guide agent returns NO_MATCHING_FLOW for unknown requests", async () => {
  await withEvaluator("COMPANY_ADMIN", async () => {
    const result = await platformGuideAgent.execute(
      makeRunContext("COMPANY_ADMIN"),
      { utterance: "tell me about the platypus migration", locale: "en", flowIdHint: undefined },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "NO_MATCHING_FLOW");
  });
});

test("guide agent refuses explicit no-guide requests even with a matching flow hint", async () => {
  await withEvaluator("COMPANY_ADMIN", async () => {
    const result = await platformGuideAgent.execute(
      makeRunContext("COMPANY_ADMIN"),
      {
        utterance: "Create the role HR Manager for me. Do not guide me through the UI.",
        locale: "en",
        flowIdHint: "roles.create",
      },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "CAPABILITY_UNAVAILABLE");
  });
});

test("guide agent expands the platform tour for a newcomer request", async () => {
  await withEvaluator("COMPANY_ADMIN", async () => {
    const result = await platformGuideAgent.execute(
      makeRunContext("COMPANY_ADMIN"),
      { utterance: "walk me through the whole platform", locale: "en", flowIdHint: undefined },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.output.mode, "guide");
    const session = result.output.guideSession;
    assert.equal(session.flowId, "platform.tour");
    assert.equal(session.entryRoute, "/dashboard");
    assert.ok(session.steps.length >= 19, "full tour has 19 steps");
    assert.equal(session.steps[0]!.target.targetId, "nav-overview");
    assert.equal(session.steps[1]!.target.targetId, "page-heading-overview");
    assert.equal(
      session.steps[session.steps.length - 1]!.target.targetId,
      "page-heading-chat",
    );
  });
});

test("guide agent expands the platform tour for an employee (permission-trimmed)", async () => {
  await withEvaluator("EMPLOYEE", async () => {
    const result = await platformGuideAgent.execute(
      makeRunContext("EMPLOYEE"),
      { utterance: "give me a tour", locale: "en", flowIdHint: undefined },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.output.guideSession.flowId, "platform.tour");
    assert.ok(result.output.guideSession.steps.length > 0);
  });
});
