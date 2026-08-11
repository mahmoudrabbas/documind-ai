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

export interface GlobalSettings {
  supportEmail: string;
  maintenanceMode: boolean;
  allowRegistrations: boolean;
  defaultTrialDays: number;
  dataRetentionDays: number;
}

export type GlobalSettingsPatch = Partial<GlobalSettings>;

export interface PackageVersionSnapshot {
  version: number;
  name: string;
  code: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  monthlyPriceCents?: number;
  annualPriceCents?: number;
  currency: string;
  trialDays: number;
  visibility: PackageVisibility;
  /** @deprecated Use `entitlements` instead */
  limits?: {
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
  monthlyPriceCents?: number;
  annualPriceCents?: number;
  currency: string;
  trialDays: number;
  visibility: PackageVisibility;
  /** @deprecated Use `entitlements` instead */
  limits?: {
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

export interface PackageCreateInput {
  name: string;
  code: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  currency: string;
  trialDays: number;
  visibility: PackageVisibility;
  entitlements: PackageEntitlements;
  supportedModels: string[];
  analyticsLevel: AnalyticsLevel;
  retentionDays: number;
  supportLevel: SupportLevel;
}

export type PackageVersionInput = Omit<PackageCreateInput, "code"> & {
  expectedVersion: number;
};

export interface PackageLifecycleInput {
  expectedVersion: number;
  reason: string;
}

export type PackageLifecycleAction = "archive" | "activate";

export interface PackageImpactPreview {
  package: {
    id: string;
    name: string;
    code: string;
    version: number;
    active: boolean;
  };
  action: PackageLifecycleAction;
  subscriptionUsageCount: number;
  affectedSubscriptionStates: Record<string, number>;
  landingVisibilityImpact: "removed" | "restored" | "unchanged";
  warnings: string[];
  blockingReasons: string[];
  transitionAllowed: boolean;
}

export interface PlatformSubscription {
  _id: string;
  tenantId: { _id: string; name: string; slug: string; status: string } | null;
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
  version: number;
  periodStart: string | null;
  periodEnd: string | null;
  trialEnd: string | null;
  cancelledAt: string | null;
  renewsAt: string | null;
  providerManaged: boolean;
  providerState: { hasCustomer: boolean; hasSubscription: boolean; hasPrice: boolean };
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  updatedAt: string;
}

export type SubscriptionOperationAction = "provision" | "update";
export type SubscriptionModelStatus = Uppercase<SubscriptionStatus>;
export type PlatformSubscriptionRecord = Omit<PlatformSubscription, "status"> & {
  status: SubscriptionModelStatus;
};

export interface PlatformSubscriptionDetail {
  tenant: { _id: string; name: string; slug: string; status: string };
  subscription: PlatformSubscriptionRecord | null;
  legalTransitions: SubscriptionModelStatus[];
}

export interface SubscriptionImpactPreview {
  tenant: { _id: string; name: string; slug: string; status: string };
  subscription: PlatformSubscriptionRecord | null;
  currentPackage: { id: string; name: string; code: string; version: number; entitlements: PackageEntitlements } | null;
  targetPackage: { id: string; name: string; code: string; version: number; entitlements: PackageEntitlements } | null;
  legalTransitions: SubscriptionModelStatus[];
  packageChanged: boolean;
  statusChanged: boolean;
  providerManaged: boolean;
  operationMode: "local-only" | "provider-managed";
  checkoutOrProviderActionRequired: boolean;
  entitlementChanges: Array<{
    entitlement: keyof PackageEntitlements;
    from: number;
    to: number;
    direction: "increase" | "decrease" | "unchanged";
  }>;
  warnings: string[];
  blockingReasons: string[];
  transitionAllowed: boolean;
}

export interface SubscriptionProvisionInput {
  packageId: string;
  status: "trialing" | "active";
  expectedVersion: 0;
  reason: string;
}

export interface SubscriptionUpdateInput {
  packageId?: string;
  status?: SubscriptionStatus;
  expectedVersion: number;
  reason: string;
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
  tenantId: { _id: string; name: string; slug: string } | null;
  createdAt: string;
}
export interface PlatformJob {
  _id: string;
  fileName: string;
  status: string;
  tenantId: { _id: string; name: string; slug: string } | null;
  createdAt: string;
  updatedAt: string;
}
import type { Role } from "@/constants/routes";

export interface RetrievalDebugCandidate {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  tenantId: string;
  text: string;
  score: number;
  pageNumber?: number;
  sectionTitle?: string;
  classification?: string;
  retrievalMethod: "vector" | "keyword" | "hybrid";
  scoreBreakdown?: {
    vectorScore?: number;
    keywordScore?: number;
    fusionScore: number;
  };
}

export interface EvidenceScoreBreakdown {
  fusionScore: number;
  rerankScore: number;
  semanticScore: number;
  exactTermScore: number;
  sourceAuthorityScore: number;
  versionPreferenceScore: number;
  totalScore: number;
}

export interface CitationAnchor {
  chunkId: string;
  documentId: string;
  documentVersionId?: string;
  pageNumber?: number;
  sectionTitle?: string;
}

export interface EvidenceItem {
  rank: number;
  candidate: RetrievalDebugCandidate;
  scoreBreakdown: EvidenceScoreBreakdown;
  citationAnchor: CitationAnchor;
  textExcerpt: string;
  expanded?: boolean;
  neighborChunkIds?: string[];
}

export interface ConflictGroup {
  conflictId: string;
  description: string;
  itemIndices: number[];
}

export interface SufficiencyAssessment {
  level: "SUFFICIENT" | "WEAK" | "CONFLICTING" | "NO_EVIDENCE";
  reasons: string[];
}

export interface EvidenceBundle {
  items: EvidenceItem[];
  totalTokenCount: number;
  maxTokenCount: number;
  inputCandidateCount: number;
  conflictGroups: ConflictGroup[];
  sufficiency: SufficiencyAssessment;
  scoreExplanation: string;
  accessPolicyVersion?: string;
  createdAt: string;
}

export interface RetrievalDebugResult {
  candidates: RetrievalDebugCandidate[];
  totalCandidates: number;
  filterSummary: {
    tenantFilter: boolean;
    roleFilter: string;
    permissionScopes: string[];
    explicitFilters: string[];
    versionFilter: boolean;
  };
  diagnostics: {
    vectorLatencyMs?: number;
    keywordLatencyMs?: number;
    fusionLatencyMs?: number;
    totalLatencyMs: number;
    vectorCandidateCount: number;
    keywordCandidateCount: number;
    traceId: string;
  };
  evidenceBundle?: EvidenceBundle;
}

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
