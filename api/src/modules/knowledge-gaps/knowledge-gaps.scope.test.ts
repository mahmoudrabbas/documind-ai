import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import mongoose from "mongoose";
import type { Request, Response } from "express";
import KnowledgeGapModel from "../../db/models/knowledgeGap.model.js";
import GapOccurrenceModel from "../../db/models/gapOccurrence.model.js";
import GapReevaluationModel from "../../db/models/gapReevaluation.model.js";
import UserModel from "../../db/models/user.model.js";
import DepartmentModel from "../../db/models/department.model.js";
import knowledgeGapsRoutes from "./knowledge-gaps.routes.js";
import {
  buildKnowledgeGapVisibilityQuery,
  KnowledgeGapsRepository,
  type KnowledgeGapVisibility,
} from "./knowledge-gaps.repository.js";
import { InMemoryPermissionEvaluator } from "../permissions/permissions.evaluator.fake.js";
import { setPermissionEvaluator } from "../permissions/permissions.evaluator.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { KnowledgeGapsService } from "./knowledge-gaps.service.js";
import type { KnowledgeGapAgentPort } from "./knowledge-gaps.agent.js";
import type { OutboxTriggerPort } from "../notifications/ports/outboxTrigger.port.js";

before(async () => {
  assert.ok(process.env.MONGODB_URI, "The API test runner must provide a disposable MongoDB URI");
  await mongoose.connect(process.env.MONGODB_URI);
});

afterEach(async () => {
  setPermissionEvaluator(null);
  await Promise.all([
    KnowledgeGapModel.deleteMany({}),
    GapOccurrenceModel.deleteMany({}),
    GapReevaluationModel.deleteMany({}),
    UserModel.deleteMany({}),
    DepartmentModel.deleteMany({}),
  ]);
});

after(async () => {
  await mongoose.disconnect();
});

test("scoped Knowledge Gap reads constrain every configured visibility dimension", () => {
  const visibility: KnowledgeGapVisibility = {
    actorId: "507f191e810c19729de860ea",
    assignedOnly: false,
    scopes: {
      selfOnly: false,
      departmentIds: ["507f1f77bcf86cd799439011"],
      documentCategories: ["Finance"],
      documentClassifications: ["Confidential"],
    },
  };

  assert.deepEqual(buildKnowledgeGapVisibilityQuery(visibility), {
    $and: [
      { "visibilityMetadata.departmentIds.0": { $exists: true } },
      {
        "visibilityMetadata.departmentIds": {
          $not: { $elemMatch: { $nin: ["507f1f77bcf86cd799439011"] } },
        },
      },
      { "visibilityMetadata.documentCategories.0": { $exists: true } },
      {
        "visibilityMetadata.documentCategories": {
          $not: { $elemMatch: { $nin: ["finance"] } },
        },
      },
      { "visibilityMetadata.documentClassifications.0": { $exists: true } },
      {
        "visibilityMetadata.documentClassifications": {
          $not: { $elemMatch: { $nin: ["confidential"] } },
        },
      },
    ],
  });
});

test("unscoped Knowledge Gap reads do not add visibility restrictions", () => {
  assert.deepEqual(buildKnowledgeGapVisibilityQuery({ scopes: null }), {});
});

test("employee assignment visibility applies even without a custom scope grant", () => {
  assert.deepEqual(
    buildKnowledgeGapVisibilityQuery({
      actorId: "507f191e810c19729de860ea",
      assignedOnly: true,
      scopes: null,
    }),
    {
      $and: [{
        $or: [
          { assigneeId: "507f191e810c19729de860ea" },
          { "visibilityMetadata.reporterActorIds": "507f191e810c19729de860ea" },
        ],
      }],
    },
  );
});

test("real Knowledge Gap read routes accept a scoped employee grant", async () => {
  const tenantId = new mongoose.Types.ObjectId().toString();
  const actorId = new mongoose.Types.ObjectId().toString();
  const roleId = new mongoose.Types.ObjectId().toString();
  const departmentId = new mongoose.Types.ObjectId().toString();
  const evaluator = new InMemoryPermissionEvaluator();
  evaluator.addUser(actorId, tenantId, "EMPLOYEE", roleId);
  evaluator.addRole(roleId, tenantId, "EMPLOYEE", [{
    permission: Permission.KNOWLEDGE_GAPS_READ,
    scopes: {
      selfOnly: false,
      departmentIds: [departmentId],
      documentCategories: [],
      documentClassifications: [],
    },
  }]);
  setPermissionEvaluator(evaluator);

  type RouteLayer = {
    route?: {
      path: string;
      methods: Record<string, boolean>;
      stack: Array<{ handle: (req: Request, res: Response, next: (error?: unknown) => void) => unknown }>;
    };
  };
  const layers = (knowledgeGapsRoutes as unknown as { stack: RouteLayer[] }).stack;

  for (const path of ["/", "/metrics"]) {
    const route = layers.find((layer) => layer.route?.path === path && layer.route.methods.get)?.route;
    assert.ok(route, `Expected GET ${path} route`);
    const permissionMiddleware = route.stack[0]?.handle;
    assert.ok(permissionMiddleware, `Expected permission middleware for GET ${path}`);

    const request = {
      auth: { userId: actorId, tenantId, role: "EMPLOYEE", email: "employee@example.test" },
      tenantId,
      headers: {},
      log: { error() {} },
    } as unknown as Request;
    let nextError: unknown;
    await permissionMiddleware(request, {} as Response, (error) => {
      nextError = error;
    });

    assert.equal(nextError, undefined);
    assert.equal(request.permissionAuthorization?.resourceContextRequired, true);
    assert.deepEqual(request.permissionAuthorization?.scopes?.departmentIds, [departmentId]);
  }
});

test("scoped employee list, metrics, and detail reads exclude unassigned or out-of-scope gaps", async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const actorId = new mongoose.Types.ObjectId();
  const otherActorId = new mongoose.Types.ObjectId();
  const departmentId = new mongoose.Types.ObjectId();
  const otherDepartmentId = new mongoose.Types.ObjectId();

  const [visible, unassigned, wrongDepartment] = await KnowledgeGapModel.create([
    {
      tenantId,
      topic: "Visible Finance Gap",
      representativeQuestion: "What is the finance policy?",
      clusterKey: "visible-finance-gap",
      source: "refusal",
      assigneeId: actorId,
      departmentId,
      sourceMetadata: { category: "finance", documentClassification: "confidential" },
      visibilityMetadata: {
        reporterActorIds: [actorId],
        departmentIds: [departmentId],
        documentCategories: ["finance"],
        documentClassifications: ["confidential"],
      },
    },
    {
      tenantId,
      topic: "Other Employee Gap",
      representativeQuestion: "What is the other policy?",
      clusterKey: "other-employee-gap",
      source: "refusal",
      assigneeId: otherActorId,
      departmentId,
      sourceMetadata: { category: "finance", documentClassification: "confidential" },
      visibilityMetadata: {
        reporterActorIds: [otherActorId],
        departmentIds: [departmentId],
        documentCategories: ["finance"],
        documentClassifications: ["confidential"],
      },
    },
    {
      tenantId,
      topic: "Other Department Gap",
      representativeQuestion: "What is the restricted policy?",
      clusterKey: "other-department-gap",
      source: "refusal",
      assigneeId: actorId,
      departmentId: otherDepartmentId,
      sourceMetadata: { category: "finance", documentClassification: "confidential" },
      visibilityMetadata: {
        reporterActorIds: [actorId],
        departmentIds: [otherDepartmentId],
        documentCategories: ["finance"],
        documentClassifications: ["confidential"],
      },
    },
  ]);

  const visibility: KnowledgeGapVisibility = {
    actorId: actorId.toString(),
    assignedOnly: true,
    scopes: {
      selfOnly: false,
      departmentIds: [departmentId.toString()],
      documentCategories: ["finance"],
      documentClassifications: ["confidential"],
    },
  };
  const repository = new KnowledgeGapsRepository();

  const list = await repository.findGaps({ tenantId: tenantId.toString(), visibility });
  assert.equal(list.total, 1);
  assert.deepEqual(list.gaps.map((gap) => gap.topic), ["Visible Finance Gap"]);

  const metrics = await repository.getMetrics(tenantId.toString(), visibility);
  assert.equal(metrics.totalGaps, 1);
  assert.deepEqual(metrics.topUnresolved.map((gap) => gap.topic), ["Visible Finance Gap"]);

  assert.ok(await repository.findGapById(tenantId.toString(), visible.id, visibility));
  assert.equal(await repository.findGapById(tenantId.toString(), unassigned.id, visibility), null);
  assert.equal(await repository.findGapById(tenantId.toString(), wrongDepartment.id, visibility), null);
});

test("reportCandidate persists canonical visibility so an unassigned scoped reporter can read the real gap", async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const actorId = new mongoose.Types.ObjectId();
  const roleId = new mongoose.Types.ObjectId();
  const departmentId = new mongoose.Types.ObjectId();
  await DepartmentModel.create({
    _id: departmentId,
    tenantId,
    name: "Finance",
    normalizedName: "finance",
    status: "active",
    version: 1,
    createdBy: actorId,
    updatedBy: actorId,
  });
  await UserModel.create({
    _id: actorId,
    tenantId,
    name: "Scoped Reporter",
    email: "scoped-reporter@example.test",
    passwordHash: "not-used",
    role: "EMPLOYEE",
    status: "active",
    emailVerified: true,
    customRoleId: roleId,
    permissionBaseline: "standard",
    roleMigrationState: "complete",
    employeeProfile: { departmentId },
  });

  const evaluator = new InMemoryPermissionEvaluator();
  evaluator.addUser(actorId.toString(), tenantId.toString(), "EMPLOYEE", roleId.toString());
  evaluator.addRole(roleId.toString(), tenantId.toString(), "EMPLOYEE", [{
    permission: Permission.KNOWLEDGE_GAPS_READ,
    scopes: {
      selfOnly: false,
      departmentIds: [departmentId.toString()],
      documentCategories: ["Finance"],
      documentClassifications: ["Confidential"],
    },
  }]);
  setPermissionEvaluator(evaluator);

  const agent: KnowledgeGapAgentPort = {
    async proposeGapAnalysis() {
      return {
        topic: "Missing finance procedure",
        severity: "medium",
        department: "Finance",
        confidence: 0.9,
        reasoning: "The authorized corpus does not contain this procedure.",
      };
    },
  };
  const trigger: OutboxTriggerPort = { async publishTrigger() {} };
  const service = new KnowledgeGapsService(
    new KnowledgeGapsRepository(),
    agent,
    undefined,
    trigger,
  );

  const gap = await service.reportCandidate(tenantId.toString(), actorId.toString(), {
    question: "How do I complete the missing finance procedure?",
    outcome: "refused",
    category: "inaccurate",
    confidence: 0.4,
    evidenceSummaryIds: [],
  });
  assert.ok(gap);
  const visibility: KnowledgeGapVisibility = {
    actorId: actorId.toString(),
    assignedOnly: true,
    scopes: {
      selfOnly: false,
      departmentIds: [departmentId.toString()],
      documentCategories: ["finance"],
      documentClassifications: ["confidential"],
    },
  };

  const visible = await service.listGaps(tenantId.toString(), {
    page: 1,
    pageSize: 20,
    sortBy: "createdAt",
    sortOrder: "desc",
  }, visibility);

  assert.equal(visible.total, 1);
  assert.equal(String(visible.gaps[0]?._id), String(gap._id));
  assert.equal(gap.assigneeId, null);
  assert.equal(gap.sourceMetadata?.category, "inaccurate");
});

test("scoped child reads return safe projections without actor, conversation, message, document, or evidence identifiers", async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const actorId = new mongoose.Types.ObjectId();
  const otherActorId = new mongoose.Types.ObjectId();
  const departmentId = new mongoose.Types.ObjectId();
  const conversationId = new mongoose.Types.ObjectId();
  const messageId = new mongoose.Types.ObjectId();
  const documentId = new mongoose.Types.ObjectId();
  const gap = await KnowledgeGapModel.create({
    tenantId,
    topic: "Visible scoped gap",
    representativeQuestion: "What is the visible policy?",
    clusterKey: "visible-scoped-child-gap",
    source: "refusal",
    assigneeId: actorId,
    departmentId,
    sourceMetadata: { category: "finance", documentClassification: "confidential" },
    visibilityMetadata: {
      reporterActorIds: [actorId],
      departmentIds: [departmentId],
      documentCategories: ["finance"],
      documentClassifications: ["confidential"],
    },
  });
  await GapOccurrenceModel.create({
    tenantId,
    gapId: gap._id,
    question: "What did another employee ask?",
    normalizedIntent: "other employee secret intent",
    outcome: "refused",
    category: "incomplete",
    confidence: 0.4,
    evidenceSummaryIds: ["unauthorized-evidence-id"],
    conversationId,
    messageId,
    actorId: otherActorId,
    actorDepartment: "Finance",
    traceId: "sensitive-trace-id",
  });
  await GapReevaluationModel.create({
    tenantId,
    gapId: gap._id,
    documentId,
    result: "improved",
    evidenceBefore: { documentId: documentId.toString(), secret: "before" },
    evidenceAfter: { documentId: documentId.toString(), secret: "after" },
    notes: "Improved after verification",
    evaluatedBy: otherActorId,
  });

  const visibility: KnowledgeGapVisibility = {
    actorId: actorId.toString(),
    assignedOnly: true,
    scopes: {
      selfOnly: false,
      departmentIds: [departmentId.toString()],
      documentCategories: ["finance"],
      documentClassifications: ["confidential"],
    },
  };
  const service = new KnowledgeGapsService(new KnowledgeGapsRepository());
  const occurrenceResult = await service.getOccurrences(
    tenantId.toString(), String(gap._id), 1, 20, visibility,
  );
  const reevaluations = await service.getReevaluations(
    tenantId.toString(), String(gap._id), visibility,
  );
  const occurrence = occurrenceResult.occurrences[0] as unknown as Record<string, unknown>;
  const reevaluation = reevaluations[0] as unknown as Record<string, unknown>;

  for (const field of [
    "tenantId",
    "gapId",
    "question",
    "normalizedIntent",
    "evidenceSummaryIds",
    "conversationId",
    "messageId",
    "actorId",
    "actorDepartment",
    "traceId",
  ]) {
    assert.equal(occurrence[field], undefined, `occurrence must omit ${field}`);
  }
  assert.equal(reevaluation.result, "improved");
  assert.equal(reevaluation.notes, "Improved after verification");
  for (const field of [
    "tenantId",
    "gapId",
    "documentId",
    "evidenceBefore",
    "evidenceAfter",
    "evaluatedBy",
  ]) {
    assert.equal(reevaluation[field], undefined, `reevaluation must omit ${field}`);
  }
});
