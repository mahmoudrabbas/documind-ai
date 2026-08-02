import mongoose from "mongoose";
import type { NotificationEvent } from "./factory/factory.js";
import type {
  RecipientResolution,
  RecipientResolverPort,
} from "./ports/recipientResolver.port.js";
import UserModel from "../../db/models/user.model.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.length > 0) {
      out.push(item);
    }
  }
  return [...new Set(out)];
}

const ACTIVE_STATUS = "active";

/**
 * Narrow data seam the resolver uses to turn T25 audiences into userIds.
 * The default implementation queries UserModel (real DB); tests can inject a
 * fake. Every method returns only ACTIVE users of the given tenant.
 */
export interface RecipientAudienceLookup {
  usersForDepartments(tenantId: string, departments: string[]): Promise<string[]>;
  usersForRoles(tenantId: string, roleIds: string[]): Promise<string[]>;
  activeTenantUsers(tenantId: string): Promise<string[]>;
}

/** Default lookup — REAL queries against the User collection (tenant-scoped,
 *  ACTIVE-status-filtered, name/id semantics per the User model). */
function createMongoRecipientAudienceLookup(): RecipientAudienceLookup {
  return {
    async usersForDepartments(tenantId, departments) {
      const users = await UserModel.find({
        tenantId,
        status: ACTIVE_STATUS,
        "employeeProfile.department": { $in: departments },
      })
        .select("_id")
        .lean()
        .exec();
      return users.map((user) => user._id.toString());
    },
    async usersForRoles(tenantId, roleIds) {
      // customRoleId is an ObjectId — invalid ids must never reach $in (CastError).
      const validRoleIds = roleIds.filter((id) => mongoose.isObjectIdOrHexString(id));
      if (validRoleIds.length === 0) return [];
      const users = await UserModel.find({
        tenantId,
        status: ACTIVE_STATUS,
        customRoleId: { $in: validRoleIds },
      })
        .select("_id")
        .lean()
        .exec();
      return users.map((user) => user._id.toString());
    },
    async activeTenantUsers(tenantId) {
      const users = await UserModel.find({ tenantId, status: ACTIVE_STATUS })
        .select("_id")
        .lean()
        .exec();
      return users.map((user) => user._id.toString());
    },
  };
}

/**
 * Recipient resolver (T6 + T25) — implements RecipientResolverPort (DIP: the
 * service depends on the port, never on this class). Resolution precedence:
 *
 *  1. `recipientUserIds` on the event envelope (producer-resolved explicit ids),
 *  2. `metadata.recipients.userIds` (producer-supplied metadata shape),
 *  3. T25 audiences `metadata.recipients.{departments, roles, tenantMembers}` —
 *     resolved against the tenant's ACTIVE users, unioned and deduped.
 *
 * Explicit id lists always win: when present, audiences are never consulted.
 * The acting user is NOT excluded here — the service filters `excludedActors`
 * out of `userIds` before fan-out.
 */
export class RecipientResolver implements RecipientResolverPort {
  constructor(
    private readonly lookup: RecipientAudienceLookup = createMongoRecipientAudienceLookup(),
  ) {}

  async resolveRecipients(tenantId: string, event: NotificationEvent): Promise<RecipientResolution> {
    const excludedActors = event.actorId ? [event.actorId] : [];
    const userIds = await this.resolveUserIds(tenantId, event);
    return { userIds, excludedActors };
  }

  private async resolveUserIds(tenantId: string, event: NotificationEvent): Promise<string[]> {
    // Optional producer-supplied envelope field, not declared on NotificationEvent.
    if (isRecord(event) && "recipientUserIds" in event) {
      const explicit = toStringArray(event.recipientUserIds);
      if (explicit.length > 0) {
        return explicit;
      }
    }
    if (isRecord(event.metadata)) {
      const recipients = event.metadata.recipients;
      if (isRecord(recipients)) {
        const explicit = toStringArray(recipients.userIds);
        if (explicit.length > 0) {
          return explicit;
        }
        return this.resolveAudiences(tenantId, recipients);
      }
    }
    return [];
  }

  private async resolveAudiences(
    tenantId: string,
    recipients: Record<string, unknown>,
  ): Promise<string[]> {
    const departments = toStringArray(recipients.departments);
    const roles = toStringArray(recipients.roles);
    const tenantMembers = recipients.tenantMembers === true;
    if (departments.length === 0 && roles.length === 0 && !tenantMembers) return [];

    const [byDepartment, byRole, byTenant] = await Promise.all([
      departments.length > 0
        ? this.lookup.usersForDepartments(tenantId, departments)
        : Promise.resolve([]),
      roles.length > 0 ? this.lookup.usersForRoles(tenantId, roles) : Promise.resolve([]),
      tenantMembers ? this.lookup.activeTenantUsers(tenantId) : Promise.resolve([]),
    ]);
    return [...new Set([...byDepartment, ...byRole, ...byTenant])];
  }
}
