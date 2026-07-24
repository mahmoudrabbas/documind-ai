import PlatformSettingModel from "../../db/models/platformSetting.model.js";

export const GLOBAL_SETTINGS_KEY = "global_settings";

export interface GlobalSettings {
  supportEmail: string;
  maintenanceMode: boolean;
  allowRegistrations: boolean;
  defaultTrialDays: number;
  dataRetentionDays: number;
}

export const GLOBAL_SETTINGS_DEFAULTS: GlobalSettings = {
  supportEmail: "",
  maintenanceMode: false,
  allowRegistrations: true,
  defaultTrialDays: 14,
  dataRetentionDays: 365,
};

const EMAIL_MAX_LENGTH = 254;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.length > EMAIL_MAX_LENGTH) return false;
  return EMAIL_REGEX.test(trimmed);
}

function isFiniteInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}

export function normalizeGlobalSettings(
  raw: Record<string, unknown>,
): GlobalSettings {
  const supportEmailRaw = raw.supportEmail;
  const supportEmail =
    typeof supportEmailRaw === "string" && isValidEmail(supportEmailRaw)
      ? supportEmailRaw.trim()
      : GLOBAL_SETTINGS_DEFAULTS.supportEmail;

  const defaultTrialDaysRaw = raw.defaultTrialDays;
  const defaultTrialDays =
    isFiniteInteger(defaultTrialDaysRaw) &&
    (defaultTrialDaysRaw as number) >= 0 &&
    (defaultTrialDaysRaw as number) <= 3650
      ? (defaultTrialDaysRaw as number)
      : GLOBAL_SETTINGS_DEFAULTS.defaultTrialDays;

  const dataRetentionDaysRaw = raw.dataRetentionDays;
  const dataRetentionDays =
    isFiniteInteger(dataRetentionDaysRaw) &&
    (dataRetentionDaysRaw as number) >= 1 &&
    (dataRetentionDaysRaw as number) <= 36500
      ? (dataRetentionDaysRaw as number)
      : GLOBAL_SETTINGS_DEFAULTS.dataRetentionDays;

  return {
    supportEmail,
    maintenanceMode:
      typeof raw.maintenanceMode === "boolean"
        ? raw.maintenanceMode
        : GLOBAL_SETTINGS_DEFAULTS.maintenanceMode,
    allowRegistrations:
      typeof raw.allowRegistrations === "boolean"
        ? raw.allowRegistrations
        : GLOBAL_SETTINGS_DEFAULTS.allowRegistrations,
    defaultTrialDays,
    dataRetentionDays,
  };
}

let cache: GlobalSettings | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 30_000;

export async function getGlobalSettings(): Promise<GlobalSettings> {
  const now = Date.now();
  if (cache && now < cacheExpiresAt) {
    return cache;
  }

  const doc = await PlatformSettingModel.findOne({ key: GLOBAL_SETTINGS_KEY })
    .lean()
    .exec();

  const raw = (doc?.value ?? {}) as Record<string, unknown>;

  cache = normalizeGlobalSettings(raw);
  cacheExpiresAt = now + CACHE_TTL_MS;

  return cache;
}

export function invalidateGlobalSettingsCache(): void {
  cache = null;
  cacheExpiresAt = 0;
}
