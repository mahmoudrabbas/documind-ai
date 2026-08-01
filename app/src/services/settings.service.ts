import { apiClient } from "@/lib/api-client";
import type {
  DeepPartial,
  GetSettingsResponse,
  TenantSettings,
  UpdateSettingsResponse,
} from "@/types/api/settings.types";

export function getTenantSettings(signal?: AbortSignal) {
  return apiClient<GetSettingsResponse>("/settings", { signal });
}

export function updateTenantSettings(input: {
  settings: DeepPartial<TenantSettings>;
  expectedVersion?: number;
}) {
  return apiClient<UpdateSettingsResponse>("/settings", {
    method: "PUT",
    body: input,
  });
}
