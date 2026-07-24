import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../../common/errors/AppError.js";
import { createPolicyPreviewArtifact, verifyPolicyPreviewArtifact } from "./documentPolicyManagement.previewArtifact.js";

const entry = { documentId: "64a000000000000000000001", policyId: "64a000000000000000000002", policyVersion: 3,
  draftFingerprint: "a".repeat(64), semanticFingerprint: "b".repeat(64), sensitive: true, materializedEffectiveFrom: "2026-07-23T00:00:00.000Z" };

test("preview artifact is signed, short-lived, and preserves security bindings", () => {
  const now = Date.parse("2026-07-23T00:00:00Z");
  const artifact = createPolicyPreviewArtifact({ purpose: "document_policy_preview", tenantId: "tenant", actorId: "actor", entries: [entry] }, now);
  const payload = verifyPolicyPreviewArtifact(artifact.token, now + 1);
  assert.equal(payload.actorId, "actor"); assert.equal(payload.tenantId, "tenant"); assert.deepEqual(payload.entries, [entry]);
  assert.equal(payload.exp, Math.floor((now + 600_000) / 1000));
});

test("tampered and expired preview artifacts fail closed", () => {
  const now = Date.parse("2026-07-23T00:00:00Z");
  const artifact = createPolicyPreviewArtifact({ purpose: "document_policy_preview", tenantId: "tenant", actorId: "actor", entries: [entry] }, now);
  assert.throws(() => verifyPolicyPreviewArtifact(`${artifact.token}x`, now), AppError);
  assert.throws(() => verifyPolicyPreviewArtifact(artifact.token, now + 601_000), AppError);
});
