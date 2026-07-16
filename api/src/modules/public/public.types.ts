import type { PackageEntitlements } from "../../db/models/package.model.js";

/**
 * Sanitized package DTO for public consumption.
 * Excludes internal billing/entitlement fields: versions[], admins, fileSizeMb,
 * tokensPerMonth, ocrPagesPerMonth, supportedModels, analyticsLevel,
 * retentionDays, supportLevel, active status.
 */
export interface PublicPackageDTO {
  _id: string;
  name: string;
  code: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  currency: string;
  trialDays: number;
  entitlements: Pick<
    PackageEntitlements,
    "employees" | "documents" | "storageMb" | "queriesPerMonth"
  >;
}
