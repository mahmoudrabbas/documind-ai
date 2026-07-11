export type PlatformMetricKey =
  | "companies"
  | "activeCompanies"
  | "users"
  | "documents"
  | "questions"
  | "failedJobs"
  | "storageBytes"
  | "estimatedCost";

export interface PlatformPackage {
  _id: string;
  name: string;
  code: string;
  description: string;
  active: boolean;
  version: number;
  monthlyPrice: number;
  currency: string;
  limits: {
    users: number;
    documents: number;
    questionsPerMonth: number;
    storageMb: number;
  };
  versions: Array<{
    version: number;
    monthlyPrice: number;
    limits: PlatformPackage["limits"];
    createdAt: string;
  }>;
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
  status: string;
  renewsAt: string | null;
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
