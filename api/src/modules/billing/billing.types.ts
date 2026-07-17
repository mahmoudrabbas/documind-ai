export type SubscriptionStatus =
  | "TRIALING"
  | "INCOMPLETE"
  | "ACTIVE"
  | "PAST_DUE"
  | "PAUSED"
  | "CANCEL_AT_PERIOD_END"
  | "CANCELED"
  | "EXPIRED"
  | "UNPAID";

export type PaymentState = "pending" | "paid" | "failed" | "refunded";

export interface PackageEntitlement {
  employees: number;
  admins: number;
  documents: number;
  storageMb: number;
  fileSizeMb: number;
  queriesPerMonth: number;
  tokensPerMonth: number;
  ocrPagesPerMonth: number;
}

/**
 * Immutable snapshot of a package at a point in time.
 */
export interface PackageSnapshot {
  packageId: string;
  version: number;
  name: string;
  code: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  currency: string;
  trialDays: number;
  entitlements: PackageEntitlement;
  supportedModels: string[];
  analyticsLevel: "basic" | "advanced" | "enterprise";
  retentionDays: number;
  supportLevel: "community" | "standard" | "priority" | "dedicated";
  visibility: "public" | "internal";
}

export interface SubscriptionTransition {
  from: SubscriptionStatus;
  to: SubscriptionStatus;
  reason?: string;
  triggeredBy: "user" | "admin" | "system" | "provider_event";
  providerEventId?: string;
}
