import { apiClient } from "@/lib/api-client";
import type {
  PermissionCatalogResponse,
  CurrentPermissionsResponse,
} from "@/types/api/permissions.types";

export function getPermissionCatalog() {
  return apiClient<PermissionCatalogResponse>("/permissions");
}

export function getMyPermissions() {
  return apiClient<CurrentPermissionsResponse>("/permissions/me");
}
