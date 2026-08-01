import mongoose, { Schema } from "mongoose";

/**
 * Notification retention TTL.
 *
 * Notifications live for 90 days from creation, then the `{ expiresAt: 1 }`
 * TTL index purges them. The 90-day window is enforced at the SCHEMA level
 * (a pre-validate hook computes `expiresAt = createdAt + 90d` when it is not
 * provided) so every producer (factory, service, tests) gets the identical
 * retention window without repeating the constant. A producer may still
 * override by passing an explicit `expiresAt` (e.g. tests exercising the TTL
 * purge path). The full TTL audit scheduler (T20) later reuses the
 * `isNotificationExpired` helper below to mark docs EXPIRED before the TTL
 * monitor actually removes them.
 */
export const NOTIFICATION_TTL_DAYS = 90;
export const NOTIFICATION_TTL_MS = NOTIFICATION_TTL_DAYS * 24 * 60 * 60 * 1000;

export const NOTIFICATION_TYPE_VALUES = [
  "processing_complete",
  "processing_failed",
  "quota_exceeded",
  "knowledge_gap_created",
  "invitation_accepted",
  "welcome",
  "role_changed",
  "document_uploaded",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPE_VALUES)[number];

export const NOTIFICATION_CATEGORY_VALUES = [
  "system",
  "billing",
  "security",
  "documents",
  "knowledge",
  "workflow",
  "admin",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORY_VALUES)[number];

export const NOTIFICATION_PRIORITY_VALUES = ["critical", "high", "normal", "low"] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITY_VALUES)[number];

export const NOTIFICATION_LIFECYCLE_STATE_VALUES = [
  "CREATED",
  "QUEUED",
  "DISPATCHED",
  "VISIBLE",
  "SEEN",
  "READ",
  "ARCHIVED",
  "EXPIRED",
  "DELETED",
] as const;
export type NotificationLifecycleState = (typeof NOTIFICATION_LIFECYCLE_STATE_VALUES)[number];

export const NOTIFICATION_DELIVERY_STATUS_VALUES = ["pending", "delivered", "failed"] as const;
export type NotificationDeliveryStatus = (typeof NOTIFICATION_DELIVERY_STATUS_VALUES)[number];

/** Bilingual content. Both locales are required at the schema level; the
 *  factory (T4) is responsible for the fallback rule (missing locale falls
 *  back to the other, en canonical — both missing is a factory error). */
export interface LocalizedText {
  en: string;
  ar: string;
}

export interface NotificationAction {
  label: LocalizedText;
  url: string;
  method?: string;
  icon?: string;
  variant?: string;
}

export interface NotificationTraceIds {
  traceId?: string;
  correlationId?: string;
  causationId?: string;
}

export interface NotificationSource {
  type?: string;
  id?: string;
  displayName?: string;
}

export interface NotificationDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  /** Bucketed key (e.g. `${type}:${dedupEventId}:${bucket}`). Used ONLY as the
   *  unique-index guard against same-bucket concurrent inserts; the PRIMARY
   *  dedup gate is the sliding-window range query on dedupEventId + deduplicatedAt. */
  dedupKey: string;
  /** Business entity id (e.g. documentId) backing the sliding-window dedup
   *  range query. */
  dedupEventId: string;
  deduplicatedAt?: Date | null;
  type: NotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: LocalizedText;
  body: LocalizedText;
  source?: NotificationSource;
  actorId?: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  traceIds?: NotificationTraceIds;
  actions?: NotificationAction[];
  metadata?: Record<string, unknown>;
  lifecycleState: NotificationLifecycleState;
  version: number;
  deliveryStatus: NotificationDeliveryStatus;
  deliveryAttempts: number;
  failureReason?: string | null;
  deliveredAt?: Date | null;
  isRead: boolean;
  readAt?: Date | null;
  isSeen: boolean;
  seenAt?: Date | null;
  isArchived: boolean;
  archivedAt?: Date | null;
  deletedAt?: Date | null;
  deletedBy?: string | null;
  /** Reserved for Phase 3 collapse (grouping related notifications). */
  collapseKey?: string | null;
  collapsedCount: number;
  /** RESERVED for Phase 4 quota resolution. NEVER populated in Phase 1-3. */
  resolutionKey?: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

const titleSchema = new Schema<LocalizedText>(
  {
    en: { type: String, required: true, maxlength: 256 },
    ar: { type: String, required: true, maxlength: 256 },
  },
  { _id: false },
);

const bodySchema = new Schema<LocalizedText>(
  {
    en: { type: String, required: true, maxlength: 2048 },
    ar: { type: String, required: true, maxlength: 2048 },
  },
  { _id: false },
);

const actionSchema = new Schema<NotificationAction>(
  {
    label: {
      en: { type: String, required: true },
      ar: { type: String, required: true },
    },
    url: { type: String, required: true },
    method: { type: String },
    icon: { type: String },
    variant: { type: String },
  },
  { _id: false },
);

const sourceSchema = new Schema<NotificationSource>(
  {
    type: { type: String },
    id: { type: String },
    displayName: { type: String },
  },
  { _id: false },
);

const traceIdsSchema = new Schema<NotificationTraceIds>(
  {
    traceId: { type: String },
    correlationId: { type: String },
    causationId: { type: String },
  },
  { _id: false },
);

const notificationSchema = new Schema<NotificationDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    dedupKey: { type: String, required: true },
    dedupEventId: { type: String, required: true },
    deduplicatedAt: { type: Date },
    type: { type: String, enum: [...NOTIFICATION_TYPE_VALUES], required: true },
    category: { type: String, enum: [...NOTIFICATION_CATEGORY_VALUES], required: true },
    priority: { type: String, enum: [...NOTIFICATION_PRIORITY_VALUES], default: "normal" },
    title: { type: titleSchema, required: true },
    body: { type: bodySchema, required: true },
    source: { type: sourceSchema },
    actorId: { type: String },
    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
    traceIds: { type: traceIdsSchema },
    actions: {
      type: [actionSchema],
      default: [],
      validate: {
        validator: (value: NotificationAction[] | null | undefined) =>
          (value ?? []).length <= 4,
        message: "actions cannot exceed 4 items",
      },
    },
    metadata: { type: Schema.Types.Mixed },
    lifecycleState: {
      type: String,
      enum: [...NOTIFICATION_LIFECYCLE_STATE_VALUES],
      default: "CREATED",
    },
    version: { type: Number, default: 1, min: 1 },
    deliveryStatus: {
      type: String,
      enum: [...NOTIFICATION_DELIVERY_STATUS_VALUES],
      default: "pending",
    },
    deliveryAttempts: { type: Number, default: 0, min: 0 },
    failureReason: { type: String, default: null },
    deliveredAt: { type: Date, default: null },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    isSeen: { type: Boolean, default: false },
    seenAt: { type: Date, default: null },
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
    collapseKey: { type: String, default: null },
    collapsedCount: { type: Number, default: 0, min: 0 },
    resolutionKey: { type: String, default: null },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        const record = ret as Record<string, unknown> & { _id?: unknown; __v?: number };
        record.id = record._id?.toString?.() ?? "";
        delete record._id;
        delete record.__v;
        return record;
      },
    },
  },
);

// Enforce the 90-day retention default at the schema level: when `expiresAt`
// is not provided, derive it from `createdAt` (falling back to now when
// timestamps have not yet populated it) + NOTIFICATION_TTL_MS. The `required`
// validator runs after pre-validate hooks, so this satisfies the required
// constraint while still honouring an explicit `expiresAt` (TTL-purge tests).
// Synchronous (no `next`) per repo convention — see documentAccessPolicy.model.ts.
notificationSchema.pre("validate", function applyDefaultExpiry() {
  if (!this.expiresAt) {
    const base = this.createdAt instanceof Date ? this.createdAt.getTime() : Date.now();
    this.expiresAt = new Date(base + NOTIFICATION_TTL_MS);
  }
});

notificationSchema.index(
  { tenantId: 1, userId: 1, dedupKey: 1 },
  { unique: true, name: "uniq_notif_dedup" },
);
notificationSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, userId: 1, isArchived: 1, deletedAt: 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, userId: 1, type: 1, dedupEventId: 1, deduplicatedAt: 1 });
notificationSchema.index(
  { tenantId: 1, userId: 1, isRead: 1, createdAt: -1 },
  { partialFilterExpression: { isRead: false } },
);
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const NotificationModel =
  (mongoose.models.Notification as mongoose.Model<NotificationDocument> | undefined) ??
  mongoose.model<NotificationDocument>("Notification", notificationSchema);

export default NotificationModel;

/** TTL purge-path helper (inline stand-in — the full TTL audit scheduler in
 *  T20 reuses this). A notification is EXPIRED/deletable when `expiresAt` has
 *  passed; this mirrors the `expiresAt: { $gt: now }` live-feed filter, so a
 *  doc excluded from reads is exactly the doc this helper marks EXPIRED. */
export function isNotificationExpired(
  expiresAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() <= now.getTime();
}
