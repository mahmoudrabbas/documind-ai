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
  visibility: "public" | "internal";
  /**
   * @deprecated Use entitlements instead
   */
  limits: {
    users: number;
    documents: number;
    questionsPerMonth: number;
    storageMb: number;
  };
  entitlements: PackageEntitlements;
  supportedModels: string[];
  analyticsLevel: string;
  retentionDays: number;
  supportLevel: string;
  versions: Array<{
    version: number;
    monthlyPrice: number;
    annualPrice: number;
    limits: PlatformPackage["limits"];
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export type PlatformSubscriptionStatus =
  | "TRIALING"
  | "INCOMPLETE"
  | "ACTIVE"
  | "PAST_DUE"
  | "PAUSED"
  | "CANCEL_AT_PERIOD_END"
  | "CANCELED"
  | "EXPIRED"
  | "UNPAID";

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
  status: PlatformSubscriptionStatus;
  periodStart: string | null;
  periodEnd: string | null;
  trialStart: string | null;
  trialEnd: string | null;
  cancellationReason: string | null;
  paymentState: string | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  providerPriceId: string | null;
  updatedAt: string;
}

export interface PlatformAuditLog {
  _id: string;
  action: string;
  actorEmail: string;
  actorRole: string;
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
  role: string;
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
