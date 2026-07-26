import type { ListTenantsInput, ListTenantsResult } from "./admin.types.js";
import type { UpdateTenantInput, UpdateTenantResult } from "./admin.types.js";
import type {
  TenantDetailView,
  TenantLifecycleInput,
  TenantLifecyclePreview,
  TenantLifecycleResult,
  TenantPreviewInput,
} from "./admin.types.js";

export type ListTenantsDto = ListTenantsInput;
export type ListTenantsResponseDto = ListTenantsResult;

export type UpdateTenantDto = Omit<UpdateTenantInput, "id">;
export type UpdateTenantResponseDto = UpdateTenantResult;

export type TenantDetailDto = TenantDetailView;
export type TenantLifecycleDto = TenantLifecycleInput;
export type TenantLifecycleResponseDto = TenantLifecycleResult;
export type TenantPreviewDto = TenantPreviewInput;
export type TenantPreviewResponseDto = TenantLifecyclePreview;
