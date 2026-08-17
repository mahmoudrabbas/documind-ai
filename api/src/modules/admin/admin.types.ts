export type TenantLifecycleStatus = "active" | "trial" | "pending" | "pending_verification" | "suspended";

export interface TenantPublicView {
  id: string;
  name: string;
  slug: string;
  status: TenantLifecycleStatus;
  plan: "free" | "trial" | "pro";
  /**
   * Identifier of the package attached to the tenant's current effective
   * subscription, or `null` when the tenant has no effective subscription.
   * This is the authoritative "Plan" source of truth for the Companies view.
   */
  effectivePackageId: string | null;
  /**
   * Human-readable name of the package attached to the tenant's current
   * effective subscription, or `null` when the tenant has no effective
   * subscription.
   */
  effectivePackageName: string | null;
  /**
   * Lowercased status of the tenant's current effective subscription, or `null`
   * when the tenant has no effective subscription. Mirrors the subscription
   * list endpoint's lowercase status convention.
   */
  effectiveSubscriptionStatus: string | null;
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
  status?: TenantLifecycleStatus;
  plan?: string;
  /**
   * Filter by the package of the tenant's current effective subscription.
   * This is the authoritative Companies Plan filter and is independent of the
   * legacy `plan` field. When provided, tenants are restricted to those whose
   * effective subscription references the given package id.
   */
  packageId?: string;
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
  status: TenantLifecycleStatus;
  plan: "free" | "trial" | "pro";
  isSystemTenant: boolean;
  createdAt: string;
  updatedAt: string;
  users: TenantUserSummary;
  package: TenantPackageSummary | null;
  subscription: TenantSubscriptionSummary | null;
  usage: TenantUsageSummary;
  recentAudit: TenantAuditSummaryEntry[];
}

export type TenantLifecycleTargetStatus = "active" | "suspended";

export interface TenantLifecycleInput {
  id: string;
  reason: string;
}

export interface TenantPreviewInput {
  id: string;
}

export interface TenantLifecyclePreview {
  tenantId: string;
  tenantName: string;
  currentStatus: TenantLifecycleStatus;
  targetStatus: TenantLifecycleTargetStatus;
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
  status: TenantLifecycleStatus;
  plan: "free" | "trial" | "pro";
  createdAt: string;
  updatedAt: string;
  alreadyInTargetState?: boolean;
}
