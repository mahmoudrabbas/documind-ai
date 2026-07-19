export type PlatformMetricKey =
  | "companies"
  | "activeCompanies"
  | "users"
  | "documents"
  | "questions"
  | "failedJobs"
  | "storageBytes"
  | "estimatedCost";

export interface PackageEntitlements {
  employees: number;
  admins: number;
  documents: number;
  storageMb: number;
  fileSizeMb: number;
  queriesPerMonth: number;
  tokensPerMonth: number;
  ocrPagesPerMonth: number;
}

export type AnalyticsLevel = "basic" | "advanced" | "enterprise";
export type SupportLevel = "community" | "standard" | "priority" | "dedicated";
export type PackageVisibility = "public" | "internal";

export type SubscriptionStatus =
  | "trialing"
  | "incomplete"
  | "active"
  | "past_due"
  | "paused"
  | "cancel_at_period_end"
  | "canceled"
  | "expired"
  | "unpaid";

export interface PackageVersionSnapshot {
  version: number;
  monthlyPrice: number;
  annualPrice: number;
  currency: string;
  trialDays: number;
  /** @deprecated Use `entitlements` instead */
  limits: {
    users: number;
    documents: number;
    questionsPerMonth: number;
    storageMb: number;
  };
  entitlements: PackageEntitlements;
  supportedModels: string[];
  analyticsLevel: AnalyticsLevel;
  retentionDays: number;
  supportLevel: SupportLevel;
  createdAt: string;
}

export interface PlatformPackage {
  _id: string;
  name: string;
  code: string;
  description: string;
  active: boolean;
  version: number;
  monthlyPrice: number;
  annualPrice: number;
  currency: string;
  trialDays: number;
  visibility: PackageVisibility;
  /** @deprecated Use `entitlements` instead */
  limits: {
    users: number;
    documents: number;
    questionsPerMonth: number;
    storageMb: number;
  };
  entitlements: PackageEntitlements;
  supportedModels: string[];
  analyticsLevel: AnalyticsLevel;
  retentionDays: number;
  supportLevel: SupportLevel;
  versions: PackageVersionSnapshot[];
  createdAt: string;
  updatedAt: string;
}

export interface PlatformSubscription {
  _id: string;
  tenantId: { _id: string; name: string; slug: string; status: string };
  packageId: {
    _id: string;
    name: string;
    code: string;
    version: number;
    monthlyPrice: number;
    currency: string;
  };
  packageVersion: number;
  status: SubscriptionStatus;
  periodStart: string | null;
  periodEnd: string | null;
  trialEnd: string | null;
  canceledAt: string | null;
  renewsAt: string | null;
  provider: string;
  providerSubscriptionId: string | null;
  providerCustomerId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  updatedAt: string;
}

export interface PlatformAuditLog {
  _id: string;
  action: string;
  actorEmail: string | null;
  actorRole: string | null;
  outcome: "SUCCESS" | "FAILURE" | "DENIED";
  resourceType: string;
  resourceId: string;
  changes: Record<string, unknown>;
  createdAt: string;
}

export interface Pagination {
  page: number;
  pageSize: number;
  totalPages: number;
  totalRecords: number;
}
export interface PlatformUser {
  _id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  emailVerified: boolean;
  tenantId: { _id: string; name: string; slug: string };
  createdAt: string;
}
export interface PlatformJob {
  _id: string;
  fileName: string;
  status: string;
  tenantId: { _id: string; name: string; slug: string };
  createdAt: string;
  updatedAt: string;
}
import type { Role } from "@/constants/routes";

export const SUBSCRIPTION_STATUS_COLORS: Record<SubscriptionStatus, string> = {
  trialing: "bg-blue-100 text-blue-800",
  incomplete: "bg-yellow-100 text-yellow-800",
  active: "bg-green-100 text-green-800",
  past_due: "bg-orange-100 text-orange-800",
  paused: "bg-gray-100 text-gray-800",
  cancel_at_period_end: "bg-yellow-100 text-yellow-800",
  canceled: "bg-red-100 text-red-800",
  expired: "bg-gray-100 text-gray-800",
  unpaid: "bg-red-100 text-red-800",
};

export const SUPPORT_LEVELS: SupportLevel[] = [
  "community",
  "standard",
  "priority",
  "dedicated",
];

export const ANALYTICS_LEVELS: AnalyticsLevel[] = [
  "basic",
  "advanced",
  "enterprise",
];
