import { normalizeDocumentAccessPolicy } from "./documentAccess.policy.validator.js";
import type { DocumentAccessPolicy } from "./documentAccess.types.js";

export interface DefaultDocumentPolicyInput {
  tenantId: string;
  documentId: string;
  policyId: string;
  ownerId: string;
  classificationId: string;
  createdAt: string;
  reason?: string;
}

export function createDefaultDocumentAccessPolicy(
  input: DefaultDocumentPolicyInput,
): Readonly<DocumentAccessPolicy> {
  const policy = normalizeDocumentAccessPolicy({
    contractVersion: 1,
    tenantId: input.tenantId,
    documentId: input.documentId,
    policyId: input.policyId,
    policyVersion: 1,
    status: "active",
    effectiveFrom: input.createdAt,
    effectiveUntil: null,
    inherits: null,
    rules: [{
      ruleId: "default-owner-minimum",
      effect: "allow",
      subject: { type: "owner" },
      actions: ["discover", "read", "download"],
    }],
    provenance: {
      createdBy: input.ownerId,
      createdAt: input.createdAt,
      ...(input.reason ? { reason: input.reason } : {}),
    },
    indexMetadata: {
      policyId: input.policyId,
      policyVersion: 1,
      classificationId: input.classificationId,
      categoryId: null,
      departmentId: null,
    },
  });
  return deepFreeze(policy);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
