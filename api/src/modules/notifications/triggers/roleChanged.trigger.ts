/**
 * role_changed trigger producer (T25b) — the API-side entry point fired at the
 * four role-mutation hook points:
 *   - updateUser base-role branch       → action "changed",  roleType "base"
 *   - assignRole                        → action "assigned", roleType "custom"
 *   - removeRoleAssignment              → action "removed",  roleType "custom"
 *   - migrateRoleUsers (per user)       → action "migrated", roleType "custom"
 *
 * DIP (T10): this producer depends ONLY on the narrow OutboxTriggerPort — it
 * never calls service.create / NotificationService directly and never touches
 * the outbox model or dispatcher internals. The caller injects the port (the
 * wired singleton from getNotificationOutboxDispatcher()).
 *
 * ONE role_changed type with RoleChangedMetadata {roleType, action, roleName,
 * beforeRole?, afterRole?}; recipient = target user only; category workflow,
 * priority normal (builder-owned); dedupEventId = target userId; replace dedup
 * per userId (latest state wins — role-flap safe; handled by T5/T6).
 *
 * ACTIVE-STATUS GATE (plan T25b): no role_changed is EVER emitted for a target
 * whose status is not "active" — pending_email_verification invitees (and any
 * pending/disabled user) are skipped here, so the four hooks cannot leak a
 * notification to a non-active target even if they resolve the wrong status.
 */
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import UserModel from "../../../db/models/user.model.js";
import { buildNotificationDedupKey, DEDUP_WINDOW_HOURS } from "workers/contracts";
import type { OutboxTriggerPort } from "../ports/outboxTrigger.port.js";
import type { RoleChangeAction, RoleType } from "../factory/metadata.schemas.js";

/** Source envelope shared by every role_changed emission. */
export interface RoleChangedSource {
  type: "role";
  id: string;
  displayName: string;
}

export interface RoleChangedTriggerInput {
  tenantId: string;
  /** The user whose role changed — the single recipient + dedupEventId. */
  targetUserId: string;
  /** The acting user (admin/owner) who performed the role change. */
  actorId: string;
  roleType: RoleType;
  action: RoleChangeAction;
  /** The role this notification is about (new/affected role name, ≤256). */
  roleName: string;
  beforeRole?: string;
  afterRole?: string;
  /** Source id ({type:"role", id, displayName}); base roles use the role name. */
  roleId: string;
  /** Target's status at the moment of the change. REQUIRED — the producer
   *  refuses to emit unless it is "active". */
  targetStatus: string;
  traceId?: string;
  correlationId?: string;
  causationId?: string;
}

export interface RoleMigratedTriggerInput {
  tenantId: string;
  /** The acting user (admin/owner) who ran the migration. */
  actorId: string;
  /** Destination role id — the role every affected user ends up with. */
  roleId: string;
  /** Destination role name — metadata roleName + afterRole for every user. */
  destinationRoleName: string;
  /** Affected user ids (all statuses, as resolved in-transaction). The active
   *  gate is applied HERE via a status-filtered read — no extra round trips
   *  inside the role transaction. */
  userIds: string[];
  traceId?: string;
  correlationId?: string;
  causationId?: string;
}

function buildTraceIds(input: {
  traceId?: string;
  correlationId?: string;
  causationId?: string;
}): { traceId: string; correlationId: string; causationId: string } | undefined {
  return input.traceId || input.correlationId || input.causationId
    ? {
        traceId: input.traceId ?? "",
        correlationId: input.correlationId ?? "",
        causationId: input.causationId ?? "",
      }
    : undefined;
}

/**
 * Single-target role_changed emission (assigned/removed/changed).
 *
 * Active-status gate enforced HERE: a target whose status is not "active"
 * (e.g. pending_email_verification) produces no outbox entry at all.
 */
export async function publishRoleChangedTrigger(
  port: OutboxTriggerPort,
  input: RoleChangedTriggerInput,
): Promise<void> {
  if (input.targetStatus !== "active") {
    return;
  }

  const source: RoleChangedSource = {
    type: "role",
    id: input.roleId,
    displayName: input.roleName,
  };
  const traceIds = buildTraceIds(input);
  const metadata = {
    roleType: input.roleType,
    action: input.action,
    roleName: input.roleName,
    ...(input.beforeRole !== undefined ? { beforeRole: input.beforeRole } : {}),
    ...(input.afterRole !== undefined ? { afterRole: input.afterRole } : {}),
  };

  await port.publishTrigger({
    eventId: randomUUID(),
    type: "role_changed",
    tenantId: input.tenantId,
    actorId: input.actorId,
    dedupKey: buildNotificationDedupKey(
      "role_changed",
      input.targetUserId,
      new Date(),
      DEDUP_WINDOW_HOURS.role_changed,
    ),
    recipientUserIds: [input.targetUserId],
    payload: {
      metadata,
      dedupEventId: input.targetUserId,
      actorId: input.actorId,
      source,
      ...(traceIds ? { traceIds } : {}),
    },
  });
}

/**
 * Migration fan-out — ONE role_changed trigger per AFFECTED ACTIVE user
 * (action "migrated", roleType "custom", roleName = afterRole = destination
 * role name), each with its own dedupEventId = that userId so every user gets
 * their own replace-rule dedup bucket. The active-status gate is the
 * producer's resolution: a status-filtered read over the in-transaction
 * affectedUsers ids (pending/disabled users are silently skipped).
 */
export async function publishRoleMigratedTriggers(
  port: OutboxTriggerPort,
  input: RoleMigratedTriggerInput,
): Promise<void> {
  if (input.userIds.length === 0) {
    return;
  }

  const activeUsers = await UserModel.find({
    tenantId: new mongoose.Types.ObjectId(input.tenantId),
    _id: { $in: input.userIds.map((id) => new mongoose.Types.ObjectId(id)) },
    status: "active",
  })
    .select("_id")
    .lean()
    .exec();
  const activeIds = new Set(activeUsers.map((user) => user._id.toString()));

  const source: RoleChangedSource = {
    type: "role",
    id: input.roleId,
    displayName: input.destinationRoleName,
  };
  const traceIds = buildTraceIds(input);

  for (const userId of input.userIds) {
    if (!activeIds.has(userId)) {
      continue;
    }
    await port.publishTrigger({
      eventId: randomUUID(),
      type: "role_changed",
      tenantId: input.tenantId,
      actorId: input.actorId,
      dedupKey: buildNotificationDedupKey(
        "role_changed",
        userId,
        new Date(),
        DEDUP_WINDOW_HOURS.role_changed,
      ),
      recipientUserIds: [userId],
      payload: {
        metadata: {
          roleType: "custom",
          action: "migrated",
          roleName: input.destinationRoleName,
          afterRole: input.destinationRoleName,
        },
        dedupEventId: userId,
        actorId: input.actorId,
        source,
        ...(traceIds ? { traceIds } : {}),
      },
    });
  }
}
