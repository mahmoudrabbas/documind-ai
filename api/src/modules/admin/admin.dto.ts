import type { ListTenantsInput, ListTenantsResult } from "./admin.types.js";
import type { UpdateTenantInput, UpdateTenantResult } from "./admin.types.js";

export type ListTenantsDto = ListTenantsInput;
export type ListTenantsResponseDto = ListTenantsResult;

export type UpdateTenantDto = Omit<UpdateTenantInput, "id">;
export type UpdateTenantResponseDto = UpdateTenantResult;
