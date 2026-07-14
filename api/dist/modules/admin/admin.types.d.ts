export interface TenantPublicView {
    id: string;
    name: string;
    slug: string;
    status: "active" | "trial" | "pending" | "pending_verification";
    plan: "free" | "trial" | "pro";
    createdAt: string;
    updatedAt: string;
    stats: {
        users: number;
        documents: number;
        questions: number;
    };
}
export interface ListTenantsInput {
    page: number;
    pageSize: number;
    status?: string;
    plan?: string;
    search?: string;
}
export interface ListTenantsResult {
    tenants: TenantPublicView[];
    pagination: {
        page: number;
        pageSize: number;
        totalPages: number;
        totalRecords: number;
    };
}
export interface UpdateTenantInput {
    id: string;
    status?: "active" | "trial" | "suspended";
    plan?: "free" | "trial" | "pro";
}
export type UpdateTenantResult = TenantPublicView;
export interface GetTenantInput {
    id: string;
}
//# sourceMappingURL=admin.types.d.ts.map