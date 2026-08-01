/**
 * Typed, strict zod metadata schemas for the notification factory (T4).
 *
 * Each schema corresponds to exactly one notification type. All seven are
 * `z.strictObject` — any unknown key is rejected with a ZodError, so the
 * factory never accepts arbitrary/free-form metadata. Field size caps mirror
 * the T1 model guardrails (title 256 / metadata 4KB) and the plan's per-type
 * field list (round-9 schemas).
 *
 * PURE TYPES ONLY — no I/O, no mongoose, no express.
 */
import { z } from "zod";

/** Values aligned with the knowledge-gaps module (GapSeverity). */
export const KNOWLEDGE_GAP_SEVERITY_VALUES = ["low", "medium", "high", "critical"] as const;
export type KnowledgeGapSeverity = (typeof KNOWLEDGE_GAP_SEVERITY_VALUES)[number];

export const ROLE_CHANGE_ACTION_VALUES = ["assigned", "removed", "changed", "migrated"] as const;
export type RoleChangeAction = (typeof ROLE_CHANGE_ACTION_VALUES)[number];

export const ROLE_TYPE_VALUES = ["base", "custom"] as const;
export type RoleType = (typeof ROLE_TYPE_VALUES)[number];

/** processing_failed → documents/normal (plan line 254). */
export const processingFailedMetadataSchema = z.strictObject({
  documentId: z.string().min(1).max(128),
  documentTitle: z.string().min(1).max(256),
  errorCode: z.string().min(1).max(128),
  /** Pipeline stage that failed; maps to the retry endpoint (ocr vs indexing). */
  stage: z.string().min(1).max(64),
  retryable: z.boolean(),
});
export type ProcessingFailedMetadata = z.infer<typeof processingFailedMetadataSchema>;

/** quota_exceeded → billing (plan line 254). resetAt is ISO-8601 (mirrors
 *  the jobEnvelope createdAt datetime style). */
export const quotaExceededMetadataSchema = z.strictObject({
  /** CounterDimension name, e.g. "ocrPagesPerMonth" (entitlement.types.ts). */
  quotaType: z.string().min(1).max(64),
  limit: z.number().nonnegative().finite(),
  usage: z.number().nonnegative().finite(),
  resetAt: z.string().datetime({ offset: true }),
});
export type QuotaExceededMetadata = z.infer<typeof quotaExceededMetadataSchema>;

/** knowledge_gap_created → knowledge (plan line 254). */
export const knowledgeGapMetadataSchema = z.strictObject({
  topic: z.string().min(1).max(256),
  severity: z.enum(KNOWLEDGE_GAP_SEVERITY_VALUES),
  questionPreview: z.string().min(1).max(80),
});
export type KnowledgeGapMetadata = z.infer<typeof knowledgeGapMetadataSchema>;

/** invitation_accepted → workflow/normal (plan line 254). */
export const invitationAcceptedMetadataSchema = z.strictObject({
  inviteeUserId: z.string().min(1).max(128),
  inviteeName: z.string().min(1).max(256),
});
export type InvitationAcceptedMetadata = z.infer<typeof invitationAcceptedMetadataSchema>;

/** welcome → workflow/low (plan line 254). */
export const welcomeMetadataSchema = z.strictObject({
  companyName: z.string().min(1).max(256),
});
export type WelcomeMetadata = z.infer<typeof welcomeMetadataSchema>;

/** role_changed → workflow/normal (plan line 254). */
export const roleChangedMetadataSchema = z.strictObject({
  roleType: z.enum(ROLE_TYPE_VALUES),
  action: z.enum(ROLE_CHANGE_ACTION_VALUES),
  roleName: z.string().min(1).max(256),
  beforeRole: z.string().max(256).optional(),
  afterRole: z.string().max(256).optional(),
});
export type RoleChangedMetadata = z.infer<typeof roleChangedMetadataSchema>;

/** document_uploaded → documents/normal (plan line 254). */
export const documentUploadedMetadataSchema = z.strictObject({
  documentId: z.string().min(1).max(128),
  documentTitle: z.string().min(1).max(256),
  department: z.string().max(100).optional(),
  classification: z.string().max(64).optional(),
});
export type DocumentUploadedMetadata = z.infer<typeof documentUploadedMetadataSchema>;

/** Notification type → metadata schema. NOTE: NOT a full
 *  Record<NotificationType, …> — processing_complete (8th type) has no
 *  round-9 schema and no builder, by plan decision. */
export const notificationMetadataSchemas = {
  processing_failed: processingFailedMetadataSchema,
  quota_exceeded: quotaExceededMetadataSchema,
  knowledge_gap_created: knowledgeGapMetadataSchema,
  invitation_accepted: invitationAcceptedMetadataSchema,
  welcome: welcomeMetadataSchema,
  role_changed: roleChangedMetadataSchema,
  document_uploaded: documentUploadedMetadataSchema,
} as const;

/** Discriminated union of all typed metadata, keyed by notification type. */
export interface NotificationMetadataMap {
  processing_failed: ProcessingFailedMetadata;
  quota_exceeded: QuotaExceededMetadata;
  knowledge_gap_created: KnowledgeGapMetadata;
  invitation_accepted: InvitationAcceptedMetadata;
  welcome: WelcomeMetadata;
  role_changed: RoleChangedMetadata;
  document_uploaded: DocumentUploadedMetadata;
}

export type NotificationMetadata = NotificationMetadataMap[keyof NotificationMetadataMap];
