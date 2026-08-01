/**
 * invitation_accepted + welcome trigger producer (T25a) — the API-side entry
 * point that fires BOTH notification triggers the moment an invited user
 * completes the invite flow (setPasswordFromInvite → status flips to active).
 *
 * DIP (T10): this producer depends ONLY on the narrow OutboxTriggerPort — it
 * never calls service.create / NotificationService directly and never touches
 * the outbox model or dispatcher internals. The caller injects the port
 * (the wired singleton from getNotificationOutboxDispatcher()).
 *
 * Emissions:
 *   - invitation_accepted → active admins (SUPER_ADMIN, COMPANY_ADMIN) of the
 *     tenant, EXCLUDING the invitee. Category workflow, priority normal, no
 *     actions (round-9), dedupEventId = invitee userId.
 *   - welcome              → the invitee only. Category workflow, priority low,
 *     no actions, dedupEventId = invitee userId.
 */
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import UserModel from "../../../db/models/user.model.js";
import { buildNotificationDedupKey, DEDUP_WINDOW_HOURS } from "workers/contracts";
import type { OutboxTriggerPort } from "../ports/outboxTrigger.port.js";

const ACTIVE_ADMIN_ROLES = ["SUPER_ADMIN", "COMPANY_ADMIN"] as const;

export interface InvitationAcceptedTriggerInput {
  tenantId: string;
  inviteeUserId: string;
  inviteeName: string;
  companyName: string;
  traceId?: string;
  correlationId?: string;
  causationId?: string;
}

/**
 * Resolve the tenant's active admins, excluding the invitee. Falls back to an
 * empty recipient list (a tenant with no other admin still completes the
 * invite flow; the welcome trigger to the invitee is unaffected).
 */
async function resolveAdminRecipients(
  tenantId: string,
  inviteeUserId: string,
): Promise<string[]> {
  const admins = await UserModel.find({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    status: "active",
    role: { $in: [...ACTIVE_ADMIN_ROLES] },
    _id: { $ne: new mongoose.Types.ObjectId(inviteeUserId) },
  })
    .select("_id")
    .lean()
    .exec();
  return admins.map((admin) => admin._id.toString());
}

export async function publishInvitationAcceptedTriggers(
  port: OutboxTriggerPort,
  input: InvitationAcceptedTriggerInput,
): Promise<void> {
  const source = {
    type: "invitation" as const,
    id: input.inviteeUserId,
    displayName: input.inviteeName,
  };
  const traceIds =
    input.traceId || input.correlationId || input.causationId
      ? {
          traceId: input.traceId ?? "",
          correlationId: input.correlationId ?? "",
          causationId: input.causationId ?? "",
        }
      : undefined;

  const adminRecipients = await resolveAdminRecipients(
    input.tenantId,
    input.inviteeUserId,
  );

  // invitation_accepted → tenant admins (excluding invitee). The raw payload is
  // consumed by the T4 factory builder; type is appended by the dispatcher.
  await port.publishTrigger({
    eventId: randomUUID(),
    type: "invitation_accepted",
    tenantId: input.tenantId,
    actorId: input.inviteeUserId,
    dedupKey: buildNotificationDedupKey(
      "invitation_accepted",
      input.inviteeUserId,
      new Date(),
      DEDUP_WINDOW_HOURS.invitation_accepted,
    ),
    recipientUserIds: adminRecipients,
    payload: {
      metadata: { inviteeUserId: input.inviteeUserId, inviteeName: input.inviteeName },
      dedupEventId: input.inviteeUserId,
      actorId: input.inviteeUserId,
      source,
      ...(traceIds ? { traceIds } : {}),
    },
  });

  // welcome → the invitee only.
  await port.publishTrigger({
    eventId: randomUUID(),
    type: "welcome",
    tenantId: input.tenantId,
    actorId: input.inviteeUserId,
    dedupKey: buildNotificationDedupKey(
      "welcome",
      input.inviteeUserId,
      new Date(),
      DEDUP_WINDOW_HOURS.welcome,
    ),
    recipientUserIds: [input.inviteeUserId],
    payload: {
      metadata: { companyName: input.companyName },
      dedupEventId: input.inviteeUserId,
      actorId: input.inviteeUserId,
      source,
      ...(traceIds ? { traceIds } : {}),
    },
  });
}
