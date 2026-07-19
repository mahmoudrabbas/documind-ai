import PlatformSettingModel from "../../db/models/platformSetting.model.js";

const GLOBAL_SETTINGS_KEY = "global_settings";

export interface GlobalSettings {
  supportEmail: string;
  maintenanceMode: boolean;
  allowRegistrations: boolean;
  defaultTrialDays: number;
  dataRetentionDays: number;
}

const DEFAULTS: GlobalSettings = {
  supportEmail: "",
  maintenanceMode: false,
  allowRegistrations: true,
  defaultTrialDays: 14,
  dataRetentionDays: 365,
};

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

  cache = {
    supportEmail: typeof raw.supportEmail === "string" ? raw.supportEmail : DEFAULTS.supportEmail,
    maintenanceMode: typeof raw.maintenanceMode === "boolean" ? raw.maintenanceMode : DEFAULTS.maintenanceMode,
    allowRegistrations: typeof raw.allowRegistrations === "boolean" ? raw.allowRegistrations : DEFAULTS.allowRegistrations,
    defaultTrialDays: typeof raw.defaultTrialDays === "number" && raw.defaultTrialDays >= 0 ? raw.defaultTrialDays : DEFAULTS.defaultTrialDays,
    dataRetentionDays: typeof raw.dataRetentionDays === "number" && raw.dataRetentionDays > 0 ? raw.dataRetentionDays : DEFAULTS.dataRetentionDays,
  };
  cacheExpiresAt = now + CACHE_TTL_MS;

  return cache;
}

export function invalidateGlobalSettingsCache(): void {
  cache = null;
  cacheExpiresAt = 0;
}
