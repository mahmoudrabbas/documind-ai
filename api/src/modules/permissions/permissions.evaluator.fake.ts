import type { BaseRole, TenantRoleBase } from "../../common/auth/baseRoles.js";
import { ALL_PERMISSIONS, BASE_ROLE_DEFAULTS, PERMISSION_CONTRACT_VERSION, type PermissionValue } from "./permissions.catalog.js";
import { decidePermission, emptyResolved } from "./permissions.decision.js";
import { normalizeRoleGrants } from "./permissions.grants.js";
import type {
  PermissionActor,
  PermissionEvaluationInput,
  PermissionEvaluator,
  PermissionScopes,
  ResolvedPermissions,
} from "./permissions.types.js";

interface FakeRoleRecord {
  grants: unknown;
  baseRole: TenantRoleBase;
  status: "active" | "archived" | string;
  version: number;
  contractVersion: number;
  migrationState?: string;
  provenanceValid: boolean;
}
interface FakeUserRecord {
  baseRole: BaseRole;
  customRoleId: string | null;
  status: "active" | "disabled";
  permissionBaseline: "standard" | "legacy-none";
  roleMigrationState: "complete" | "pending-session-revocation";
}

export class InMemoryPermissionEvaluator implements PermissionEvaluator {
  private users = new Map<string, FakeUserRecord>();
  private roles = new Map<string, FakeRoleRecord>();

  addUser(userId: string, tenantId: string, baseRole: BaseRole, customRoleId: string | null = null, status: "active" | "disabled" = "active", options: { permissionBaseline?: "standard" | "legacy-none"; roleMigrationState?: "complete" | "pending-session-revocation" } = {}) {
    this.users.set(this.key(userId, tenantId), {
      baseRole,
      customRoleId,
      status,
      permissionBaseline: options.permissionBaseline ?? "standard",
      roleMigrationState: options.roleMigrationState ?? "complete",
    });
  }

  addRole(roleId: string, tenantId: string, baseRole: TenantRoleBase, grants: unknown, options: { status?: "active" | "archived"; version?: number; contractVersion?: number; raw?: boolean; migrationState?: string; omitMigrationState?: boolean; provenanceValid?: boolean } = {}) {
    this.roles.set(this.key(roleId, tenantId), {
      baseRole,
      grants: options.raw ? grants : normalizeRoleGrants(grants),
      status: options.status ?? "active",
      version: options.version ?? 1,
      contractVersion: options.contractVersion ?? PERMISSION_CONTRACT_VERSION,
      ...(!options.omitMigrationState ? { migrationState: options.migrationState ?? "complete" } : {}),
      provenanceValid: options.provenanceValid ?? true,
    });
  }

  addUnmigratedRole(roleId: string, tenantId: string, baseRole: TenantRoleBase) {
    this.addRole(roleId, tenantId, baseRole, [], { version: 1 });
  }

  async resolve(actor: PermissionActor): Promise<ResolvedPermissions> {
    const user = this.users.get(this.key(actor.actorId, actor.tenantId));
    if (!user || user.status !== "active") return emptyResolved(actor.baseRole);
    if (user.permissionBaseline === "legacy-none" || user.roleMigrationState !== "complete") {
      return emptyResolved(user.baseRole);
    }

    const defaults = user.baseRole === "SUPER_ADMIN" ? ALL_PERMISSIONS : BASE_ROLE_DEFAULTS[user.baseRole];
    const grants = new Map<PermissionValue, { source: "platform" | "base-role" | "custom-role"; scope: PermissionScopes | null }>();
    for (const permission of defaults) grants.set(permission, { source: user.baseRole === "SUPER_ADMIN" ? "platform" : "base-role", scope: null });

    const customRoleId = user.baseRole === "SUPER_ADMIN" ? null : user.customRoleId;
    const role = customRoleId ? this.roles.get(this.key(customRoleId, actor.tenantId)) : undefined;
    let customRoleState: ResolvedPermissions["customRoleState"] = !customRoleId ? "none" : !role ? "missing" : role.status === "active" ? "active" : "archived";
    if (role?.status === "active" && user.baseRole !== "SUPER_ADMIN") {
      try {
        if (role.baseRole !== user.baseRole || role.contractVersion !== PERMISSION_CONTRACT_VERSION || role.migrationState !== "complete" || !role.provenanceValid) throw new Error("invalid role contract");
        for (const grant of normalizeRoleGrants(role.grants, { requireCanonical: true })) {
          if (!grants.has(grant.permission)) grants.set(grant.permission, { source: "custom-role", scope: grant.scopes ?? null });
        }
      } catch {
        customRoleState = "invalid";
      }
    }
    return {
      permissions: new Set(grants.keys()), grants, baseRole: user.baseRole,
      customRoleId, roleVersion: role?.version ?? null, customRoleState,
    };
  }

  async evaluate(input: PermissionEvaluationInput) {
    return decidePermission(input, await this.resolve(input));
  }
  evict(actorId: string, tenantId: string) { void actorId; void tenantId; }
  evictAllForTenant(tenantId: string) { void tenantId; }
  clear() { this.users.clear(); this.roles.clear(); }
  removeRole(roleId: string, tenantId: string) { this.roles.delete(this.key(roleId, tenantId)); }
  private key(id: string, tenantId: string) { return `${tenantId}:${id}`; }
}
