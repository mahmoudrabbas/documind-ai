import { isBaseRole } from "../../common/auth/baseRoles.js";
import mongoose from "mongoose";
import RoleModel from "../../db/models/role.model.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import { PLATFORM_TENANT_SLUG } from "../../common/auth/platformTenant.js";
import { createStructuredLogger } from "../../common/utils/structuredLogger.js";
import { ALL_PERMISSIONS, BASE_ROLE_DEFAULTS, PERMISSION_CONTRACT_VERSION, type PermissionValue } from "./permissions.catalog.js";
import { decidePermission, emptyResolved } from "./permissions.decision.js";
import { normalizeRoleGrants } from "./permissions.grants.js";
import type {
  PermissionActor,
  PermissionEvaluationInput,
  PermissionEvaluator,
  ResolvedPermissions,
} from "./permissions.types.js";

export class PermissionEvaluatorImpl implements PermissionEvaluator {
  async resolve(actor: PermissionActor): Promise<ResolvedPermissions> {
    if (!mongoose.isObjectIdOrHexString(actor.actorId) || !mongoose.isObjectIdOrHexString(actor.tenantId)) {
      return emptyResolved(actor.baseRole);
    }
    const user = await UserModel.findOne({ _id: actor.actorId, tenantId: actor.tenantId }).lean().exec();
    if (!user || !isBaseRole(user.role) || user.status !== "active") {
      return emptyResolved(actor.baseRole);
    }

    const baseRole = user.role;
    if (user.roleMigrationState === "pending-session-revocation" || user.permissionBaseline === "legacy-none") {
      return emptyResolved(baseRole);
    }
    if (baseRole === "SUPER_ADMIN") {
      const platformTenant = await TenantModel.exists({
        _id: actor.tenantId,
        slug: PLATFORM_TENANT_SLUG,
        isSystemTenant: true,
        status: "active",
      });
      if (!platformTenant) {
        return emptyResolved(baseRole);
      }
    }
    const basePermissions = baseRole === "SUPER_ADMIN" ? ALL_PERMISSIONS : BASE_ROLE_DEFAULTS[baseRole];
    const grants = new Map<PermissionValue, { source: "platform" | "base-role" | "custom-role"; scope: import("./permissions.types.js").PermissionScopes | null }>();
    for (const permission of basePermissions) {
      grants.set(permission, { source: baseRole === "SUPER_ADMIN" ? "platform" : "base-role", scope: null });
    }

    // Platform administrators never consume tenant custom-role assignments, even if
    // a corrupt legacy row still contains one.
    const customRoleId = baseRole === "SUPER_ADMIN" ? null : user.customRoleId?.toString() ?? null;
    let roleVersion: number | null = null;
    let customRoleState: ResolvedPermissions["customRoleState"] = customRoleId ? "missing" : "none";

    if (customRoleId && baseRole !== "SUPER_ADMIN" && mongoose.isObjectIdOrHexString(customRoleId)) {
      const role = await RoleModel.findOne({ _id: customRoleId, tenantId: actor.tenantId }).lean().exec();
      if (role) {
        roleVersion = role.version;
        customRoleState = role.status === "active" ? "active" : "archived";
        if (role.status === "active") {
          try {
            if (role.baseRole !== baseRole) throw new Error("base-role mismatch");
            if (role.contractVersion !== PERMISSION_CONTRACT_VERSION) throw new Error("unsupported contract version");
            if (role.migrationState !== "complete") throw new Error("role migration is incomplete");
            const actors = [role.createdBy, role.updatedBy];
            if (actors.some((actorId) => !actorId || !mongoose.isValidObjectId(actorId))) throw new Error("invalid role provenance");
            const actorIds = actors.map((actorId) => new mongoose.Types.ObjectId(actorId!.toString()));
            const actorCount = await UserModel.countDocuments({
              _id: { $in: actorIds },
              tenantId: actor.tenantId,
            });
            if (actorCount !== new Set(actorIds.map((actorId) => actorId.toString())).size) {
              throw new Error("cross-tenant role provenance");
            }
            const persistedGrants = normalizeRoleGrants(role.grants, { requireCanonical: true });
            for (const grant of persistedGrants) {
              if (!grants.has(grant.permission)) {
                grants.set(grant.permission, { source: "custom-role", scope: grant.scopes ?? null });
              }
            }
          } catch (error) {
            customRoleState = "invalid";
            permissionSecurityLogger.warn({
              event: "invalid_persisted_role",
              tenantId: actor.tenantId,
              actorId: actor.actorId,
              roleId: customRoleId,
              reason: error instanceof Error ? error.message : "invalid role",
            }, "Ignored invalid persisted permission role");
          }
        }
      }
    } else if (customRoleId && baseRole !== "SUPER_ADMIN") {
      customRoleState = "invalid";
    }

    const roleIsValid =
      customRoleState === "none" || customRoleState === "active";
    const effectiveGrants = roleIsValid
      ? grants
      : new Map<PermissionValue, {
          source: "platform" | "base-role" | "custom-role";
          scope: import("./permissions.types.js").PermissionScopes | null;
        }>();

    return {
      permissions: new Set(effectiveGrants.keys()),
      grants: effectiveGrants,
      baseRole,
      customRoleId,
      roleVersion,
      customRoleState,
    };
  }

  async evaluate(input: PermissionEvaluationInput) {
    return decidePermission(input, await this.resolve(input));
  }

  // Resolution is intentionally uncached so authorization changes are visible across API instances.
  evict(actorId: string, tenantId: string): void { void actorId; void tenantId; }
  evictAllForTenant(tenantId: string): void { void tenantId; }
}

const permissionSecurityLogger = createStructuredLogger("permission-security");

let defaultEvaluator: PermissionEvaluator | null = null;
export function getPermissionEvaluator(): PermissionEvaluator {
  defaultEvaluator ??= new PermissionEvaluatorImpl();
  return defaultEvaluator;
}
export function setPermissionEvaluator(evaluator: PermissionEvaluator | null): void {
  defaultEvaluator = evaluator;
}
export function resetPermissionEvaluator(): void {
  defaultEvaluator = null;
}
