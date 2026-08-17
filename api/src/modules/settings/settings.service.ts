import type { UpdateQuery } from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import {
  NOT_FOUND,
  SETTINGS_VERSION_CONFLICT,
  VALIDATION_ERROR,
} from "../../common/errors/errorCodes.js";
import { getAuditWriter } from "../../common/observability/index.js";
import { config } from "../../config/index.js";
import { storageProvider } from "../../providers/storage/index.js";
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

/* ------------------------------------------------------------------ */
/*  Company logo upload                                                */
/* ------------------------------------------------------------------ */

/**
 * Public route prefix used to serve uploaded tenant logos without
 * authentication. Tenant logos are embedded in outgoing email HTML where
 * credentials cannot be attached, so they must be publicly reachable. The
 * file names are unguessable UUIDs, which provides the access control.
 */
export const LOGO_PUBLIC_ROUTE = "/public/logos";

export interface TenantLogoFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

const LOGO_ALLOWED_TYPES = new Set(
  config.LOGO_ALLOWED_MIME_TYPES.split(",")
    .map((type) => type.trim().toLowerCase())
    .filter(Boolean),
);

/** Builds the absolute, publicly reachable URL for an uploaded logo file. */
export function buildLogoPublicUrl(tenantId: string, fileName: string): string {
  return `${config.PUBLIC_API_URL}${LOGO_PUBLIC_ROUTE}/${tenantId}/${fileName}`;
}

/** True when the given logo URL points at a logo uploaded to this service. */
export function isUploadedLogoUrl(logoUrl: string): boolean {
  return logoUrl.startsWith(`${config.PUBLIC_API_URL}${LOGO_PUBLIC_ROUTE}/`);
}

/**
 * Extracts the storage key (`tenantId/fileName`) from an uploaded logo URL,
 * or returns null when the URL does not reference this service's uploads.
 */
export function extractLogoStorageKeyFromUrl(logoUrl: string): string | null {
  const prefix = `${config.PUBLIC_API_URL}${LOGO_PUBLIC_ROUTE}/`;
  if (!logoUrl.startsWith(prefix)) return null;
  const relative = logoUrl.slice(prefix.length);
  if (!relative.includes("/")) return null;
  const [tenantId, ...fileNameParts] = relative.split("/");
  const fileName = fileNameParts.join("/");
  if (!tenantId || !fileName) return null;
  return `${tenantId}/${fileName}`;
}

/**
 * Persists an uploaded logo image, updates `settings.profile.logoUrl` with a
 * publicly reachable URL, and removes the previous uploaded logo (when any).
 */
export async function uploadTenantLogo(
  tenantId: string,
  file: TenantLogoFile,
  actor: SettingsOperationContext,
): Promise<UpdateTenantSettingsResult> {
  if (!file.buffer || file.buffer.length === 0) {
    throw new AppError(400, VALIDATION_ERROR, "A logo image file is required");
  }

  const mimeType = file.mimetype?.toLowerCase() ?? "";
  if (!LOGO_ALLOWED_TYPES.has(mimeType)) {
    throw new AppError(
      400,
      "UNSUPPORTED_FILE_TYPE",
      `File type ${file.mimetype || "unknown"} is not supported. Allowed: ${config.LOGO_ALLOWED_MIME_TYPES}`,
    );
  }

  if (file.size > config.LOGO_MAX_FILE_SIZE_BYTES) {
    throw new AppError(
      413,
      "FILE_TOO_LARGE",
      `Logo file must be at most ${Math.floor(config.LOGO_MAX_FILE_SIZE_BYTES / 1024 / 1024)} MB`,
    );
  }

  const tenant = await TenantModel.findById(tenantId)
    .select("settings")
    .lean()
    .exec();
  if (!tenant) throw new AppError(404, NOT_FOUND, "Tenant not found");
  const previousLogoUrl = tenant.settings?.profile?.logoUrl ?? null;

  const safeOriginalName = sanitizeLogoFileName(file.originalname, mimeType);
  const storageKey = await storageProvider.saveFile(
    file.buffer,
    safeOriginalName,
    tenantId,
  );
  const fileName = storageKey.split("/").slice(1).join("/");
  const logoUrl = buildLogoPublicUrl(tenantId, fileName);

  try {
    const result = await updateTenantSettings(
      tenantId,
      {
        settings: { profile: { logoUrl } },
      },
      actor,
    );

    if (
      previousLogoUrl &&
      previousLogoUrl !== logoUrl &&
      isUploadedLogoUrl(previousLogoUrl)
    ) {
      const previousStorageKey = extractLogoStorageKeyFromUrl(previousLogoUrl);
      if (previousStorageKey && previousStorageKey !== storageKey) {
        await storageProvider.deleteFile(previousStorageKey).catch(() => {
          // Best-effort cleanup: a stale file must not fail the upload.
        });
      }
    }

    return result;
  } catch (error) {
    await storageProvider.deleteFile(storageKey).catch(() => {
      // Best-effort cleanup on persistence failure.
    });
    throw error;
  }
}

function sanitizeLogoFileName(originalName: string, mimeType: string): string {
  const fallbackExt =
    mimeType === "image/png"
      ? ".png"
      : mimeType === "image/webp"
        ? ".webp"
        : mimeType === "image/gif"
          ? ".gif"
          : mimeType === "image/svg+xml"
            ? ".svg"
            : ".jpg";
  const cleaned = (originalName || "logo")
    .replace(/[^\w.-]+/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "");
  if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(cleaned)) {
    return `${cleaned || "logo"}${fallbackExt}`;
  }
  return cleaned;
}
