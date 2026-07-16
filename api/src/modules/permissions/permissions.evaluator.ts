import UserModel from "../../db/models/user.model.js";
import RoleModel from "../../db/models/role.model.js";
import type { PermissionEvaluator, ResolvedPermissions, PermissionScopes } from "./permissions.types.js";
import { DEFAULT_SCOPES } from "./permissions.types.js";
import { BASE_ROLE_DEFAULTS, ALL_PERMISSIONS } from "./permissions.catalog.js";

interface CacheEntry {
  result: ResolvedPermissions;
  expiresAt: number;
}

const SUPER_ADMIN_PERMISSIONS = new Set(ALL_PERMISSIONS);

export class PermissionEvaluatorImpl implements PermissionEvaluator {
  private cache = new Map<string, CacheEntry>();
  private cacheTtlMs: number;

  constructor(options?: { cacheTtlMs?: number }) {
    this.cacheTtlMs = options?.cacheTtlMs ?? 30_000;
  }

  async resolve(
    userId: string,
    tenantId: string,
  ): Promise<ResolvedPermissions> {
    const key = `${tenantId}:${userId}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    const user = await UserModel.findOne({
      _id: userId,
      tenantId,
    }).lean().exec();

    if (!user) {
      return {
        permissions: new Set<string>(),
        scopes: DEFAULT_SCOPES,
        baseRole: "EMPLOYEE",
      };
    }

    if (user.role === "SUPER_ADMIN") {
      const result: ResolvedPermissions = {
        permissions: new Set(SUPER_ADMIN_PERMISSIONS),
        scopes: DEFAULT_SCOPES,
        baseRole: "SUPER_ADMIN",
      };
      this.setCache(key, result);
      return result;
    }

    const baseDefaults =
      BASE_ROLE_DEFAULTS[user.role] ?? [];
    const permissions = new Set<string>(baseDefaults);

    let scopes: PermissionScopes = { ...DEFAULT_SCOPES };

    if (user.customRoleId) {
      const role = await RoleModel.findOne({
        _id: user.customRoleId,
        tenantId,
        status: "active",
      }).lean().exec();

      if (role) {
        const rolePermissions =
          (role as unknown as { permissions?: string[] })
            .permissions ?? [];

        if (rolePermissions.length > 0) {
          for (const p of rolePermissions) {
            permissions.add(p);
          }
        }

        const roleScopes =
          (role as unknown as { scopes?: PermissionScopes })
            .scopes;
        if (roleScopes) {
          scopes = {
            selfOnly: roleScopes.selfOnly ?? false,
            departmentIds: roleScopes.departmentIds ?? [],
            categories: roleScopes.categories ?? [],
          };
        }
      }
    }

    const result: ResolvedPermissions = {
      permissions,
      scopes,
      baseRole: user.role,
    };

    this.setCache(key, result);
    return result;
  }

  evict(userId: string, tenantId: string): void {
    this.cache.delete(`${tenantId}:${userId}`);
  }

  evictAllForTenant(tenantId: string): void {
    const prefix = `${tenantId}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  private setCache(key: string, result: ResolvedPermissions) {
    if (this.cache.size > 10_000) {
      this.cache.clear();
    }
    this.cache.set(key, {
      result,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }
}

let defaultEvaluator: PermissionEvaluatorImpl | null = null;

export function getPermissionEvaluator(): PermissionEvaluatorImpl {
  if (!defaultEvaluator) {
    defaultEvaluator = new PermissionEvaluatorImpl();
  }
  return defaultEvaluator;
}

export function resetPermissionEvaluator(): void {
  if (defaultEvaluator) {
    defaultEvaluator = null;
  }
}
