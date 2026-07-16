import type { SubscriptionStatus } from "../../db/models/subscription.model.js";
import type { PackageEntitlements } from "../../db/models/package.model.js";

export type { SubscriptionStatus };

/**
 * Flattened snapshot of all PackageDocument fields at a given version.
 * No deep schema refs — everything is inlined.
 */
export interface PackageSnapshot {
  name: string;
  code: string;
  description: string;
  active: boolean;
  version: number;
  monthlyPrice: number;
  annualPrice: number;
  trialDays: number;
  currency: string;
  visibility: "public" | "internal";
  supportedModels: string[];
  analyticsLevel: "basic" | "advanced" | "enterprise";
  retentionDays: number;
  supportLevel: "community" | "standard" | "priority" | "dedicated";
  entitlements: PackageEntitlements;
  createdAt: Date;
}

/**
 * Data-driven map of allowed state transitions for the 9-state subscription
 * lifecycle. Every transition not present in this map is illegal.
 */
export const LegalTransition: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  TRIALING: ["ACTIVE", "EXPIRED", "CANCELED"],
  INCOMPLETE: ["ACTIVE", "EXPIRED"],
  ACTIVE: ["PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END", "CANCELED"],
  PAST_DUE: ["ACTIVE", "PAUSED", "CANCELED", "EXPIRED"],
  PAUSED: ["ACTIVE", "CANCELED"],
  CANCEL_AT_PERIOD_END: ["ACTIVE", "CANCELED", "EXPIRED"],
  CANCELED: ["ACTIVE"],
  EXPIRED: ["ACTIVE"],
  UNPAID: ["PAST_DUE", "CANCELED"],
};

/** Input DTO for creating a new package (FR-PAY-001). */
export interface CreatePackageInput {
  name: string;
  code: string;
  description?: string;
  monthlyPrice: number;
  annualPrice?: number;
  trialDays?: number;
  currency?: string;
  visibility?: "public" | "internal";
  supportedModels?: string[];
  analyticsLevel?: "basic" | "advanced" | "enterprise";
  retentionDays?: number;
  supportLevel?: "community" | "standard" | "priority" | "dedicated";
  entitlements: PackageEntitlements;
}

/** Input DTO for updating an existing package (all fields optional). */
export type UpdatePackageInput = Partial<CreatePackageInput>;

/** Input DTO for requesting a subscription state transition. */
export interface SubscriptionTransitionInput {
  targetStatus: SubscriptionStatus;
  reason?: string;
}

/** Input DTO for provisioning a subscription during registration. */
export interface RegistrationProvisionInput {
  packageCode?: string;
}
