import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { InMemoryDocumentCapabilityEvaluator } from "./documentAccess.capability.js";
import { InMemoryDocumentAccessPolicyEvaluator } from "./documentAccess.evaluator.inMemory.js";
import { tenantAActor } from "./documentAccess.fixtures.js";
import {
  resolveCanonicalRetrievalAuthorization,
  type CanonicalRetrievalDocument,
  type RetrievalAuthorizationDeps,
} from "./documentAccess.retrievalAuthorization.js";
import type { DocumentAccessPolicy } from "./documentAccess.types.js";

const tenantId = tenantAActor.tenantId;
const actorId = tenantAActor.actorId;

function document(input: Partial<CanonicalRetrievalDocument> & { documentId: string }): CanonicalRetrievalDocument {
  return {
    ownerId: actorId,
    categoryId: null,
    departmentId: null,
    classificationId: null,
    classification: "confidential",
    category: null,
    activePolicyId: `64a0000000000000000001${input.documentId.slice(-2)}`,
    activePolicyVersion: 1,
    ...input,
  };
}

function policy(
  doc: CanonicalRetrievalDocument,
  rules: DocumentAccessPolicy["rules"],
  overrides: Partial<DocumentAccessPolicy> = {},
): DocumentAccessPolicy {
  return {
    contractVersion: 1,
    tenantId,
    documentId: doc.documentId,
    policyId: doc.activePolicyId!,
    policyVersion: 1,
    status: "active",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: null,
    inherits: null,
    rules,
    provenance: { createdBy: actorId, createdAt: "2026-01-01T00:00:00.000Z" },
    indexMetadata: {
      policyId: doc.activePolicyId!,
      policyVersion: 1,
      categoryId: doc.categoryId,
      departmentId: doc.departmentId,
      classificationId: doc.classificationId,
    },
    ...overrides,
  };
}

function deps(input: {
  documents: CanonicalRetrievalDocument[];
  policies: Map<string, DocumentAccessPolicy>;
  grant?: { scope: unknown } | null;
  failCandidates?: boolean;
}): RetrievalAuthorizationDeps {
  const evaluator = new InMemoryDocumentAccessPolicyEvaluator(
    new InMemoryDocumentCapabilityEvaluator(true),
  );
  return {
    resolveActor: async () => tenantAActor,
    resolveUseInAiGrant: async () =>
      input.grant === undefined ? { scope: null } : input.grant,
    findCandidateDocuments: async () => {
      if (input.failCandidates) throw new Error("database unavailable");
      return input.documents;
    },
    findExactPolicy: async (_tenant, documentId, policyId, version) => {
      const found = input.policies.get(documentId);
      return found &&
        found.policyId === policyId &&
        found.policyVersion === version
        ? found
        : null;
    },
    evaluate: (evaluation) => evaluator.evaluate(evaluation),
  };
}

describe("canonical retrieval authorization allowlist", () => {
  test("missing documents:use-in-ai grant fails closed with PERMISSION_REQUIRED", async () => {
    const result = await resolveCanonicalRetrievalAuthorization(
      { tenantId, actorId },
      deps({ documents: [], policies: new Map(), grant: null }),
    );
    assert.equal(result.filter.mode, "deny_all");
    assert.equal(result.denialReason, "PERMISSION_REQUIRED");
    assert.deepEqual(result.filter.allowedDocumentIds, []);
  });

  test("resolver dependency failure fails closed with RESOLVER_FAILED, never unrestricted", async () => {
    const result = await resolveCanonicalRetrievalAuthorization(
      { tenantId, actorId },
      deps({
        documents: [],
        policies: new Map(),
        failCandidates: true,
      }),
    );
    assert.equal(result.filter.mode, "deny_all");
    assert.equal(result.denialReason, "RESOLVER_FAILED");
  });

  test("explicit EMPLOYEE use_in_ai grant on a confidential document is allowed", async () => {
    const confidential = document({ documentId: "64a000000000000000000101" });
    const policies = new Map([
      [
        confidential.documentId,
        policy(confidential, [
          {
            ruleId: "user-ai",
            effect: "allow",
            subject: { type: "user", id: actorId },
            actions: ["use_in_ai"],
          },
        ]),
      ],
    ]);
    const result = await resolveCanonicalRetrievalAuthorization(
      { tenantId, actorId },
      deps({ documents: [confidential], policies }),
    );
    assert.equal(result.filter.mode, "constrained");
    assert.deepEqual(result.filter.allowedDocumentIds, [confidential.documentId]);
    assert.equal(result.denialReason, undefined);
  });

  test("explicit deny wins over user allow", async () => {
    const doc = document({ documentId: "64a000000000000000000102" });
    const policies = new Map([
      [
        doc.documentId,
        policy(doc, [
          {
            ruleId: "user-ai-allow",
            effect: "allow",
            subject: { type: "user", id: actorId },
            actions: ["use_in_ai"],
          },
          {
            ruleId: "user-ai-deny",
            effect: "deny",
            subject: { type: "user", id: actorId },
            actions: ["use_in_ai"],
          },
        ]),
      ],
    ]);
    const result = await resolveCanonicalRetrievalAuthorization(
      { tenantId, actorId },
      deps({ documents: [doc], policies }),
    );
    assert.equal(result.filter.mode, "deny_all");
    assert.equal(result.denialReason, "NO_AUTHORIZED_DOCUMENTS");
  });

  test("owner-subject grants authorize and tenant_member grants cover everyone", async () => {
    const owned = document({ documentId: "64a000000000000000000103" });
    const member = document({
      documentId: "64a000000000000000000104",
      ownerId: "64a000000000000000000099",
    });
    const policies = new Map([
      [
        owned.documentId,
        policy(owned, [
          {
            ruleId: "owner-ai",
            effect: "allow",
            subject: { type: "owner" },
            actions: ["use_in_ai"],
          },
        ]),
      ],
      [
        member.documentId,
        policy(member, [
          {
            ruleId: "member-ai",
            effect: "allow",
            subject: { type: "tenant_member" },
            actions: ["use_in_ai"],
          },
        ]),
      ],
    ]);
    const result = await resolveCanonicalRetrievalAuthorization(
      { tenantId, actorId },
      deps({ documents: [owned, member], policies }),
    );
    assert.equal(result.filter.mode, "constrained");
    assert.deepEqual([...result.filter.allowedDocumentIds].sort(), [
      member.documentId,
      owned.documentId,
    ].sort());
  });

  test("documents without an active policy or with stale index metadata are excluded", async () => {
    const noPolicy = document({
      documentId: "64a000000000000000000105",
      activePolicyId: null,
      activePolicyVersion: null,
    });
    const stale = document({ documentId: "64a000000000000000000106" });
    const stalePolicy = policy(stale, [
      {
        ruleId: "user-ai",
        effect: "allow",
        subject: { type: "user", id: actorId },
        actions: ["use_in_ai"],
      },
    ], {
      indexMetadata: {
        policyId: stale.activePolicyId!,
        policyVersion: 1,
        categoryId: null,
        departmentId: null,
        // Points at a different classification than the document now carries.
        classificationId: "64a0000000000000000000ff",
      },
    });
    const result = await resolveCanonicalRetrievalAuthorization(
      { tenantId, actorId },
      deps({
        documents: [noPolicy, stale],
        policies: new Map([[stale.documentId, stalePolicy]]),
      }),
    );
    assert.equal(result.filter.mode, "deny_all");
    assert.equal(result.denialReason, "NO_AUTHORIZED_DOCUMENTS");
    assert.equal(result.resolvedDocumentCount, 2);
  });
});
