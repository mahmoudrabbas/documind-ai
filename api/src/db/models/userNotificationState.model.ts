import mongoose, { Schema } from "mongoose";

// ── Notification preferences (reserved — design only) ───────────────────────
//
// The notificationPreferences model is NOT created or wired yet (no preferences
// UI in Phase 1-3; no service/API usage). Reserved shape for Phase 4:
//   {
//     tenantId: ObjectId,        // same tenant as the state doc
//     userId: ObjectId,          // same user as the state doc
//     enabledTypes: {            // per-type enabled flags, e.g.
//       processing_failed: true, //   { processing_failed: true, quota_exceeded: true, ... }
//       quota_exceeded: true,
//     },
//     digestInterval: "off" | "daily" | "weekly",
//   }
// Unique per {tenantId, userId}. Until preferences ship, the per-type mute
// stopgap lives on this state model (mutedTypes below).

export interface UserNotificationStateDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  unreadCount: number;
  lastReadAt: Date | null;
  mutedTypes: string[];
  updatedAt: Date;
}

const userNotificationStateSchema = new Schema<UserNotificationStateDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    unreadCount: { type: Number, default: 0, min: 0 },
    lastReadAt: { type: Date, default: null },
    mutedTypes: { type: [String], default: [] },
  },
  { versionKey: false, timestamps: true },
);

// One state document per (tenant, user). The unique index guarantees a single
// O(1) unread counter per user. The counter is updated with atomic $inc
// (findOneAndUpdate — pattern: mongo-quota-counter.ts adapter), never
// read-modify-write.
userNotificationStateSchema.index(
  { tenantId: 1, userId: 1 },
  { unique: true, name: "uniq_user_notification_state" },
);

export default mongoose.model<UserNotificationStateDocument>(
  "UserNotificationState",
  userNotificationStateSchema,
);
