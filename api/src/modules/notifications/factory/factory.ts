/**
 * Notification factory (T4) — PURE REGISTRY LOOKUP only (OCP, plan round-11).
 *
 * `createNotificationDraft(event)` = `builderRegistry[event.type].build(event)`.
 * The core holds NO per-type switch/drafting logic: adding a type = add ONE
 * builder file under `builders/` + ONE registry line here, nothing else.
 *
 * The only generic post-build work here is the shared size-cap / URL-allowlist
 * enforcement (title 256 / body 2048 / metadata 4KB / actions ≤4) — uniform
 * across every type, not per-type logic.
 *
 * PURE — no I/O, no mongoose, no express.
 */
import type {
  LocalizedText,
  NotificationAction,
  NotificationCategory,
  NotificationPriority,
  NotificationSource,
  NotificationTraceIds,
  NotificationType,
} from "../../../db/models/notification.model.js";
import {
  MAX_ACTIONS,
  NotificationFactoryError,
  assertActionUrlAllowed,
  assertBodyLength,
  assertMetadataSize,
  assertTitleLength,
  type LocalizedSource,
} from "./sanitize.js";
import { processingCompleteBuilder } from "./builders/processingComplete.builder.js";
import { processingFailedBuilder } from "./builders/processingFailed.builder.js";
import { quotaExceededBuilder } from "./builders/quotaExceeded.builder.js";
import { knowledgeGapBuilder } from "./builders/knowledgeGap.builder.js";
import { invitationAcceptedBuilder } from "./builders/invitationAccepted.builder.js";
import { welcomeBuilder } from "./builders/welcome.builder.js";
import { roleChangedBuilder } from "./builders/roleChanged.builder.js";
import { documentUploadedBuilder } from "./builders/documentUploaded.builder.js";

/**
 * Incoming trigger event envelope. Fields mirror the producer envelope
 * (workers jobEnvelope.ts:24-61 conventions: traceId/actorId/idempotencyKey)
 * plus the T1 model fields (dedupEventId, deduplicatedAt, source, traceIds).
 * `metadata` is the raw, unvalidated payload — each builder parses it with its
 * own strict zod schema (unknown keys → ZodError).
 */
export interface NotificationEvent {
  type: NotificationType;
  metadata: unknown;
  actorId?: string;
  traceIds?: NotificationTraceIds;
  dedupEventId?: string;
  deduplicatedAt?: Date | string | null;
  source?: NotificationSource;
  createdBy?: string | null;
  /** Optional partial bilingual overrides; missing locale falls back (en canonical). */
  title?: LocalizedSource;
  body?: LocalizedSource;
}

/** Draft shape the factory produces — a superset of the T1 document fields. */
export interface NotificationDraft {
  type: NotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: LocalizedText;
  body: LocalizedText;
  dedupEventId: string;
  actions: NotificationAction[];
  metadata: Record<string, unknown>;
  source?: NotificationSource;
  actorId?: string;
  traceIds?: NotificationTraceIds;
  createdBy?: string | null;
  version: number;
}

export interface NotificationBuilder {
  type: NotificationType;
  build(event: NotificationEvent): NotificationDraft;
}

/** The registry — data, not a switch. Every NotificationType maps to exactly
 *  one builder (processing_complete added in T18). */
export const builderRegistry: Readonly<Record<NotificationType, NotificationBuilder | undefined>> =
  {
    processing_complete: processingCompleteBuilder,
    processing_failed: processingFailedBuilder,
    quota_exceeded: quotaExceededBuilder,
    knowledge_gap_created: knowledgeGapBuilder,
    invitation_accepted: invitationAcceptedBuilder,
    welcome: welcomeBuilder,
    role_changed: roleChangedBuilder,
    document_uploaded: documentUploadedBuilder,
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The factory sits at a runtime boundary (outbox/Redis JSON), so it accepts
 * `unknown` and validates the envelope shape here: an object carrying a string
 * `type` plus a `metadata` payload (strictly parsed per-type by the builder).
 * Any other input is rejected with a typed error before registry lookup.
 */
export function createNotificationDraft(event: unknown): NotificationDraft {
  if (!isRecord(event) || typeof event.type !== "string" || !("metadata" in event)) {
    throw new NotificationFactoryError(
      "UNKNOWN_TYPE",
      "invalid notification event envelope: expected { type, metadata, ... }",
    );
  }
  const builder = builderRegistry[event.type as NotificationType];
  if (builder === undefined) {
    throw new NotificationFactoryError(
      "UNKNOWN_TYPE",
      `no builder registered for notification type '${event.type}'`,
    );
  }
  const draft = builder.build(event as unknown as NotificationEvent);

  // Generic, type-agnostic guardrails (guardrail 5 + action allowlist).
  assertTitleLength(draft.title);
  assertBodyLength(draft.body);
  assertMetadataSize(draft.metadata);
  if (draft.actions.length > MAX_ACTIONS) {
    throw new NotificationFactoryError(
      "SIZE_LIMIT",
      `actions exceed ${MAX_ACTIONS} items (${draft.actions.length})`,
    );
  }
  for (const action of draft.actions) {
    assertActionUrlAllowed(action.url);
  }
  return draft;
}
