import { apiClient } from "@/lib/api-client";
import type {
  PermissionCatalogResponse,
  MyPermissionsResponse,
} from "@/types/api/permissions.types";

export async function getPermissionCatalog(
  signal?: AbortSignal,
): Promise<PermissionCatalogResponse> {
  return apiClient<PermissionCatalogResponse>("/permissions", {
    method: "GET",
    signal,
  });
}

export async function getMyPermissions(
  signal?: AbortSignal,
): Promise<MyPermissionsResponse> {
  return apiClient<MyPermissionsResponse>("/permissions/me", {
    method: "GET",
    signal,
  });
}
