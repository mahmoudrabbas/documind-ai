import type { UpdateQuery } from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import {
  NOT_FOUND,
  SETTINGS_VERSION_CONFLICT,
} from "../../common/errors/errorCodes.js";
import { getAuditWriter } from "../../common/observability/index.js";
import TenantModel, {
  DEFAULT_TENANT_SETTINGS,
  type TenantSettings,
} from "../../db/models/tenant.model.js";
import type {
  DeepPartial,
  GetTenantSettingsResult,
  SettingsOperationContext,
  UpdateTenantSettingsResult,
} from "./settings.types.js";
import { validateUpdateSettingsInput } from "./settings.validator.js";

export async function getTenantSettings(
  tenantId: string,
): Promise<GetTenantSettingsResult> {
  const tenant = await TenantModel.findById(tenantId)
    .select("settings settingsVersion settingsUpdatedAt")
    .lean()
    .exec();
  if (!tenant) throw new AppError(404, NOT_FOUND, "Tenant not found");

  return {
    settings: { ...DEFAULT_TENANT_SETTINGS, ...tenant.settings },
    settingsVersion: tenant.settingsVersion ?? 0,
    settingsUpdatedAt: tenant.settingsUpdatedAt
      ? tenant.settingsUpdatedAt.toISOString()
      : null,
  };
}

export async function updateTenantSettings(
  tenantId: string,
  input: unknown,
  actor: SettingsOperationContext,
): Promise<UpdateTenantSettingsResult> {
  const payload = validateUpdateSettingsInput(input);

  const tenant = await TenantModel.findById(tenantId)
    .select("name settings settingsVersion")
    .lean()
    .exec();
  if (!tenant) throw new AppError(404, NOT_FOUND, "Tenant not found");

  const currentVersion = tenant.settingsVersion ?? 0;
  if (
    payload.expectedVersion !== undefined &&
    payload.expectedVersion !== currentVersion
  ) {
    throw new AppError(409, SETTINGS_VERSION_CONFLICT, "Settings were updated by another user", [
      {
        field: "expectedVersion",
        message: `Expected version ${payload.expectedVersion} but current version is ${currentVersion}`,
      },
    ]);
  }

  const base: TenantSettings = {
    ...DEFAULT_TENANT_SETTINGS,
    ...tenant.settings,
  };
  const merged = mergeSettings(base, payload.settings);
  const changedKeys = collectChangedKeys(base, merged);

  const newName =
    typeof payload.settings.profile?.companyName === "string" &&
    payload.settings.profile.companyName.trim().length > 0
      ? payload.settings.profile.companyName.trim()
      : undefined;

  const update: UpdateQuery<unknown> = {
    $set: {
      settings: merged,
      settingsUpdatedAt: new Date(),
      ...(newName ? { name: newName } : {}),
    },
    $inc: { settingsVersion: 1 },
  };

  const filter =
    payload.expectedVersion === undefined
      ? { _id: tenantId }
      : {
          _id: tenantId,
          $or: [
            { settingsVersion: payload.expectedVersion },
            { settingsVersion: { $exists: false } },
          ],
        };

  const updated = await TenantModel.findOneAndUpdate(filter, update, {
    returnDocument: "after",
  })
    .select("settings settingsVersion settingsUpdatedAt")
    .lean()
    .exec();

  if (!updated) {
    const current = await TenantModel.findById(tenantId)
      .select("settingsVersion")
      .lean()
      .exec();
    throw new AppError(
      409,
      SETTINGS_VERSION_CONFLICT,
      "Settings were updated by another user",
      [
        {
          field: "expectedVersion",
          message: `Expected version ${payload.expectedVersion ?? currentVersion} but current version is ${current?.settingsVersion ?? 0}`,
        },
      ],
    );
  }

  await getAuditWriter().write({
    tenantId,
    action: "TENANT_SETTINGS_UPDATED",
    resourceType: "Tenant",
    resourceId: tenantId,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    actorKind: actor.actorKind,
    changes: {
      changedKeys,
      settingsVersion: (updated.settingsVersion ?? 0),
      companyNameChanged: newName !== undefined,
    },
    metadata: {
      traceId: actor.traceId,
      requestId: actor.requestId,
    },
  });

  return {
    settings: { ...DEFAULT_TENANT_SETTINGS, ...updated.settings },
    settingsVersion: updated.settingsVersion ?? 0,
    settingsUpdatedAt: updated.settingsUpdatedAt
      ? updated.settingsUpdatedAt.toISOString()
      : new Date().toISOString(),
    updated: true,
  };
}

function mergeSettings(
  base: TenantSettings,
  patch: DeepPartial<TenantSettings>,
): TenantSettings {
  return {
    profile: { ...base.profile, ...patch.profile },
    defaultLanguage: patch.defaultLanguage ?? base.defaultLanguage,
    emailBranding: { ...base.emailBranding, ...patch.emailBranding },
    aiRuntimePreferences: {
      ...base.aiRuntimePreferences,
      ...patch.aiRuntimePreferences,
    },
    notifications: { ...base.notifications, ...patch.notifications },
  };
}

function collectChangedKeys(
  before: TenantSettings,
  after: TenantSettings,
): string[] {
  const changed: string[] = [];
  const groups = [
    "profile",
    "emailBranding",
    "aiRuntimePreferences",
    "notifications",
  ] as const;
  for (const group of groups) {
    for (const key of Object.keys(before[group]) as (keyof TenantSettings[typeof group])[]) {
      if (before[group][key] !== after[group][key]) {
        changed.push(`${group}.${String(key)}`);
      }
    }
  }
  if (before.defaultLanguage !== after.defaultLanguage) {
    changed.push("defaultLanguage");
  }
  return changed;
}
