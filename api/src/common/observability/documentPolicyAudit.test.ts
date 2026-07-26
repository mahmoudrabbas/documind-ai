import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryAuditWriter } from "./auditWriter.js";
import type { AuditAction } from "./auditEvents.js";

test("Phase 7 audit catalog accepts taxonomy, policy, denial, and propagation actions", async () => {
  const actions: AuditAction[] = ["DOCUMENT_CATEGORY_CREATED", "DOCUMENT_DEPARTMENT_UPDATED", "DOCUMENT_CLASSIFICATION_ARCHIVED",
    "DOCUMENT_POLICY_PREVIEWED", "DOCUMENT_POLICY_APPLIED", "DOCUMENT_ACCESS_DENIED", "DOCUMENT_ACCESS_STALE_POLICY_REJECTED",
    "DOCUMENT_POLICY_PROPAGATION_REQUESTED", "DOCUMENT_POLICY_PROPAGATION_DISPATCHED", "DOCUMENT_POLICY_PROPAGATION_COMPLETED",
    "DOCUMENT_POLICY_PROPAGATION_FAILED", "DOCUMENT_POLICY_PROPAGATION_SUPERSEDED", "DOCUMENT_POLICY_REINDEX_REQUESTED"];
  const writer = new InMemoryAuditWriter();
  for (const action of actions) await writer.write({ action, resourceType: "DocumentPolicyPropagation", resourceId: "safe-id",
    tenantId: "111111111111111111111111", actorKind: "SYSTEM", metadata: { eventId: "safe-event", policyVersion: 2, reasonCode: "SAFE_CODE" } });
  assert.deepEqual(writer.events.map((event) => event.action), actions);
  const serialized = JSON.stringify(writer.events);
  for (const forbidden of ["previewToken", "rules", "filename", "content", "email", "stack"]) assert.equal(serialized.includes(forbidden), false);
});
