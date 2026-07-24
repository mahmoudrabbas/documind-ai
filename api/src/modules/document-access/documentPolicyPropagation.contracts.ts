import { z } from "zod";

export const DOCUMENT_POLICY_PROPAGATION_JOB = "document.policy.propagate";
export const DOCUMENT_POLICY_PROPAGATION_SCHEMA_VERSION = 1 as const;
export const POLICY_PROPAGATION_DIRECTIONS = ["broadening", "tightening", "mixed"] as const;

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const optionalObjectId = objectId.nullable();

export const documentPolicyPropagationJobV1Schema = z.object({
  schemaVersion: z.literal(DOCUMENT_POLICY_PROPAGATION_SCHEMA_VERSION),
  eventId: z.string().regex(/^[a-f\d]{64}$/i),
  tenantId: objectId,
  documentId: objectId,
  documentVersion: z.number().int().positive(),
  policyId: objectId,
  policyVersion: z.number().int().positive(),
  previousPolicyVersion: z.number().int().nonnegative(),
  generationId: z.string().regex(/^[a-f\d]{64}$/i),
  classificationId: optionalObjectId,
  categoryId: optionalObjectId,
  departmentId: optionalObjectId,
  changeDirection: z.enum(POLICY_PROPAGATION_DIRECTIONS),
  sensitiveBroadening: z.boolean(),
  propagationReason: z.enum(["policy_change", "taxonomy_change"]),
  requestedAt: z.string().datetime({ offset: true }),
  correlationId: z.string().min(1).max(128),
}).strict();

export type DocumentPolicyPropagationJobV1 = z.infer<typeof documentPolicyPropagationJobV1Schema>;

export const derivedAccessMetadataV1Schema = z.object({
  schemaVersion: z.literal(1),
  tenantId: objectId,
  documentId: objectId,
  documentVersion: z.number().int().positive(),
  policyId: objectId,
  policyVersion: z.number().int().positive(),
  classificationId: optionalObjectId,
  categoryId: optionalObjectId,
  departmentId: optionalObjectId,
  generationId: z.string().regex(/^[a-f\d]{64}$/i),
  updatedAt: z.string().datetime({ offset: true }),
  requiresCurrentPolicyRevalidation: z.literal(true),
}).strict();

export type DerivedAccessMetadataV1 = z.infer<typeof derivedAccessMetadataV1Schema>;

export function validateDocumentPolicyPropagationJobV1(input: unknown): DocumentPolicyPropagationJobV1 {
  const serialized = safelySerialize(input);
  if (serialized === null || Buffer.byteLength(serialized, "utf8") > 16 * 1024) throw new Error("DOCUMENT_POLICY_PROPAGATION_INVALID_PAYLOAD");
  const parsed = documentPolicyPropagationJobV1Schema.safeParse(input);
  if (!parsed.success) throw new Error("DOCUMENT_POLICY_PROPAGATION_INVALID_PAYLOAD");
  return parsed.data;
}

export function validateDerivedAccessMetadata(input: unknown): DerivedAccessMetadataV1 | null {
  const parsed = derivedAccessMetadataV1Schema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export function isDerivedAccessMetadataCurrent(input: unknown, expected: {
  tenantId: string; documentId: string; documentVersion: number; policyId: string; policyVersion: number; generationId: string;
  classificationId: string | null; categoryId: string | null; departmentId: string | null;
}): boolean {
  const metadata = validateDerivedAccessMetadata(input);
  return Boolean(metadata && metadata.requiresCurrentPolicyRevalidation && metadata.tenantId === expected.tenantId &&
    metadata.documentId === expected.documentId && metadata.documentVersion === expected.documentVersion &&
    metadata.policyId === expected.policyId && metadata.policyVersion === expected.policyVersion && metadata.generationId === expected.generationId &&
    metadata.classificationId === expected.classificationId && metadata.categoryId === expected.categoryId && metadata.departmentId === expected.departmentId);
}

export function requireCurrentPolicyGeneration(input: unknown, expected: Parameters<typeof isDerivedAccessMetadataCurrent>[1]): DerivedAccessMetadataV1 {
  const metadata = validateDerivedAccessMetadata(input);
  if (!metadata || !isDerivedAccessMetadataCurrent(metadata, expected)) throw new Error("DOCUMENT_POLICY_GENERATION_STALE");
  return metadata;
}

function safelySerialize(input: unknown): string | null { try { return JSON.stringify(input); } catch { return null; } }
