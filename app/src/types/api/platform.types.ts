export const TENANT_STATUSES = [
  "active",
  "trial",
  "pending",
  "pending_verification",
  "suspended",
] as const;
export const TENANT_PLANS = ["free", "trial", "pro"] as const;
export const PAGE_SIZES = [10, 20, 50, 100] as const;

export type TenantStatus = (typeof TENANT_STATUSES)[number];
export type TenantPlan = (typeof TENANT_PLANS)[number];

export interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  /** @deprecated Use subscription data from super-admin subscriptions endpoint instead. */
  plan: TenantPlan;
  /**
   * Identifier of the package attached to the tenant's current effective
   * subscription, or null when the tenant has no effective subscription.
   * This is the authoritative "Plan" source of truth for the Companies view.
   */
  effectivePackageId: string | null;
  /**
   * Display name of the package attached to the tenant's current effective
   * subscription, or null when the tenant has no effective subscription.
   */
  effectivePackageName: string | null;
  createdAt: string;
  updatedAt: string;
  stats: { users: number; documents: number; questions: number };
}

export interface TenantListQuery {
  page: number;
  pageSize: (typeof PAGE_SIZES)[number];
  search: string;
  status: "" | TenantStatus;
  /** @deprecated Use subscription data from super-admin subscriptions endpoint instead. */
  plan: "" | TenantPlan;
  /**
   * Authoritative Companies Plan filter: the id of the package whose current
   * effective subscription must match. Applied server-side, before pagination.
   * Independent of the legacy `plan` field.
*/
  packageId?: string;
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

export interface TenantUserSummary {
  total: number;
  active: number;
  companyAdmins: number;
  employees: number;
}

export interface TenantPackageSummary {
  packageId: string;
  packageName: string;
  packageCode: string;
  packageVersion: number;
  entitlements: {
    employees: number;
    admins: number;
    documents: number;
    storageMb: number;
    fileSizeMb: number;
    queriesPerMonth: number;
    tokensPerMonth: number;
    ocrPagesPerMonth: number;
  } | null;
}

export interface TenantSubscriptionSummary {
  subscriptionId: string;
  status: string;
  provider: string;
  periodStart: string | null;
  periodEnd: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface TenantUsageSummary {
  documents: number;
  storageBytes: number;
  questions: number;
}

export interface TenantAuditSummaryEntry {
  id: string;
  action: string;
  actorEmail: string | null;
  actorRole: string | null;
  outcome: string;
  createdAt: string;
}

export interface TenantDetailView {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  plan: TenantPlan;
  isSystemTenant: boolean;
  createdAt: string;
  updatedAt: string;
  users: TenantUserSummary;
  package: TenantPackageSummary | null;
  subscription: TenantSubscriptionSummary | null;
  usage: TenantUsageSummary;
  recentAudit: TenantAuditSummaryEntry[];
}

export interface TenantLifecyclePreview {
  tenantId: string;
  tenantName: string;
  currentStatus: TenantStatus;
  targetStatus: "active" | "suspended";
  transitionAllowed: boolean;
  alreadyInTargetState: boolean;
  totalUsersAffected: number;
  activeUsersAffected: number;
  activeCompanyAdminsAffected: number;
  currentSubscriptionStatus: string | null;
  documentCount: number;
  warnings: string[];
  blockingReasons: string[];
}

export interface TenantLifecycleResult {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  plan: TenantPlan;
  createdAt: string;
  updatedAt: string;
  alreadyInTargetState?: boolean;
}
