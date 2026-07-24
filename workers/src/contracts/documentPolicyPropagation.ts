import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
export const documentPolicyPropagationPayloadSchema = z.object({
  schemaVersion: z.literal(1), eventId: z.string().regex(/^[a-f\d]{64}$/i), tenantId: objectId, documentId: objectId,
  documentVersion: z.number().int().positive(), policyId: objectId, policyVersion: z.number().int().positive(),
  previousPolicyVersion: z.number().int().nonnegative(), generationId: z.string().regex(/^[a-f\d]{64}$/i),
  classificationId: objectId.nullable(), categoryId: objectId.nullable(), departmentId: objectId.nullable(),
  changeDirection: z.enum(["broadening", "tightening", "mixed"]), sensitiveBroadening: z.boolean(),
  propagationReason: z.enum(["policy_change", "taxonomy_change"]),
  requestedAt: z.string().datetime({ offset: true }),
  correlationId: z.string().min(1).max(128),
}).strict().refine((value) => Buffer.byteLength(JSON.stringify(value), "utf8") <= 16 * 1024, "payload too large");

export type DocumentPolicyPropagationPayload = z.infer<typeof documentPolicyPropagationPayloadSchema>;
export interface DerivedAccessMetadataV1 {
  schemaVersion: 1; tenantId: string; documentId: string; documentVersion: number; policyId: string; policyVersion: number;
  classificationId: string | null; categoryId: string | null; departmentId: string | null; generationId: string;
  updatedAt: string; requiresCurrentPolicyRevalidation: true;
}
