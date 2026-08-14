export type TenantDefaultLanguage = "en" | "ar";
export type TenantResponseStyle = "concise" | "balanced" | "detailed";

export interface TenantSettings {
  profile: {
    companyName: string | null;
    logoUrl: string | null;
    timezone: string | null;
  };
  defaultLanguage: TenantDefaultLanguage;
  aiRuntimePreferences: {
    temperature: number;
    maxTokens: number;
    responseStyle: TenantResponseStyle;
    citationsEnabled: boolean;
  };
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export interface GetTenantSettingsResult {
  settings: TenantSettings;
  settingsVersion: number;
  settingsUpdatedAt: string | null;
}

export interface UpdateTenantSettingsResult extends GetTenantSettingsResult {
  updated: boolean;
}

export interface GetSettingsResponse {
  success: true;
  data: GetTenantSettingsResult;
}

export interface UpdateSettingsResponse {
  success: true;
  message: string;
  data: UpdateTenantSettingsResult;
}

export interface UploadLogoResponse {
  success: true;
  message: string;
  data: UpdateTenantSettingsResult;
}
