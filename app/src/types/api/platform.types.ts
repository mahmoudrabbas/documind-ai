export const TENANT_STATUSES = [
  "active",
  "trial",
  "pending",
  "pending_verification",
] as const;
export const TENANT_PLANS = ["free", "trial", "pro"] as const;
export const PAGE_SIZES = [10, 20, 50, 100] as const;

export type TenantStatus = (typeof TENANT_STATUSES)[number] | "suspended";
export type TenantPlan = (typeof TENANT_PLANS)[number];

export interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  plan: TenantPlan;
  createdAt: string;
  updatedAt: string;
  stats: { users: number; documents: number; questions: number };
}

export interface TenantListQuery {
  page: number;
  pageSize: (typeof PAGE_SIZES)[number];
  search: string;
  status: "" | (typeof TENANT_STATUSES)[number];
  plan: "" | TenantPlan;
}

export interface TenantListResponse {
  success: true;
  data: {
    tenants: PlatformTenant[];
    pagination: {
      page: number;
      pageSize: number;
      totalPages: number;
      totalRecords: number;
    };
  };
}
