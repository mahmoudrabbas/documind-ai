import type {
  PermissionEvaluator,
  PermissionScopes,
  ResolvedPermissions,
} from "./permissions.types.js";
import { DEFAULT_SCOPES } from "./permissions.types.js";
import { BASE_ROLE_DEFAULTS, ALL_PERMISSIONS } from "./permissions.catalog.js";

interface FakeRoleRecord {
  permissions: string[];
  scopes: PermissionScopes;
  baseRole: string;
  status: string;
}

interface FakeUserRecord {
  baseRole: string;
  customRoleId: string | null;
}

const SUPER_ADMIN_PERMISSIONS = new Set(ALL_PERMISSIONS);

export class InMemoryPermissionEvaluator
  implements PermissionEvaluator
{
  private users = new Map<string, FakeUserRecord>();
  private roles = new Map<string, FakeRoleRecord>();
  private cache = new Map<
    string,
    { result: ResolvedPermissions; expiresAt: number }
  >();
  private cacheTtlMs: number;

  constructor(options?: { cacheTtlMs?: number }) {
    this.cacheTtlMs = options?.cacheTtlMs ?? 30_000;
  }

  addUser(
    userId: string,
    tenantId: string,
    baseRole: string,
    customRoleId: string | null = null,
  ) {
    this.users.set(this.key(userId, tenantId), {
      baseRole,
      customRoleId,
    });
  }

  addRole(
    roleId: string,
    tenantId: string,
    baseRole: string,
    permissions: string[],
    scopes?: Partial<PermissionScopes>,
  ) {
    this.roles.set(this.key(roleId, tenantId), {
      baseRole,
      permissions,
      scopes: { ...DEFAULT_SCOPES, ...scopes },
      status: "active",
    });
  }

  addUnmigratedRole(
    roleId: string,
    tenantId: string,
    baseRole: string,
  ) {
    this.roles.set(this.key(roleId, tenantId), {
      baseRole,
      permissions: [],
      scopes: DEFAULT_SCOPES,
      status: "active",
      version: 0,
    } as FakeRoleRecord & { version: number });
  }

  async resolve(
    userId: string,
    tenantId: string,
  ): Promise<ResolvedPermissions> {
    const cacheKey = this.key(userId, tenantId);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    const userRecord = this.users.get(cacheKey);
    if (!userRecord) {
    return {
        permissions: new Set<string>(),
        scopes: DEFAULT_SCOPES,
        baseRole: "EMPLOYEE",
      };
    }

    if (userRecord.baseRole === "SUPER_ADMIN") {
      const result: ResolvedPermissions = {
        permissions: new Set(SUPER_ADMIN_PERMISSIONS),
        scopes: DEFAULT_SCOPES,
        baseRole: "SUPER_ADMIN",
      };
      this.setCache(cacheKey, result);
      return result;
    }

    const baseDefaults =
      BASE_ROLE_DEFAULTS[userRecord.baseRole] ?? [];
    const permissions = new Set<string>(baseDefaults);

    if (userRecord.customRoleId) {
      const roleKey = this.key(
        userRecord.customRoleId,
        tenantId,
      );
      const roleRecord = this.roles.get(roleKey);

      if (
        roleRecord &&
        roleRecord.status === "active"
      ) {
        for (const p of roleRecord.permissions) {
          permissions.add(p);
        }

        const scopes = { ...roleRecord.scopes };
        const result: ResolvedPermissions = {
          permissions,
          scopes,
          baseRole: userRecord.baseRole,
        };
        this.setCache(cacheKey, result);
        return result;
      }
    }

    const result: ResolvedPermissions = {
      permissions,
      scopes: DEFAULT_SCOPES,
      baseRole: userRecord.baseRole,
    };
    this.setCache(cacheKey, result);
    return result;
  }

  evict(userId: string, tenantId: string) {
    this.cache.delete(this.key(userId, tenantId));
  }

  evictAllForTenant(tenantId: string) {
    const prefix = `${tenantId}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  clear() {
    this.users.clear();
    this.roles.clear();
    this.cache.clear();
  }

  private key(id: string, tenantId: string): string {
    return `${tenantId}:${id}`;
  }

  private setCache(
    key: string,
    result: ResolvedPermissions,
  ) {
    this.cache.set(key, {
      result,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }
}
