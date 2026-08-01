import type {
  TenantDefaultLanguage,
  TenantResponseStyle,
  TenantSettings,
} from "../../db/models/tenant.model.js";

export type {
  TenantDefaultLanguage,
  TenantResponseStyle,
  TenantSettings,
};

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export interface GetTenantSettingsResult {
  settings: TenantSettings;
  settingsVersion: number;
  settingsUpdatedAt: string | null;
}

export interface UpdateTenantSettingsInput {
  settings: DeepPartial<TenantSettings>;
  expectedVersion?: number;
}

export interface UpdateTenantSettingsResult extends GetTenantSettingsResult {
  updated: boolean;
}

export interface SettingsOperationContext {
  tenantId: string;
  actorId: string;
  actorEmail: string;
  actorRole: import("../../common/auth/baseRoles.js").BaseRole;
  actorKind: import("../../common/observability/auditEvents.js").AuditActorKind;
  traceId?: string;
  requestId?: string;
}
