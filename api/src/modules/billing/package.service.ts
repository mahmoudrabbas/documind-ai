import PackageModel, {
  type PackageDocument,
} from "../../db/models/package.model.js";
import AuditLogModel from "../../db/models/auditLog.model.js";
import { AppError } from "../../common/errors/AppError.js";
import type { AuthIdentity } from "../auth/auth.types.js";
import type {
  CreatePackageInput,
  UpdatePackageInput,
  PackageSnapshot,
} from "./billing.types.js";

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

function buildSnapshot(doc: PackageDocument): PackageSnapshot {
  return {
    name: doc.name,
    code: doc.code,
    description: doc.description,
    active: doc.active,
    version: doc.version,
    monthlyPrice: doc.monthlyPrice,
    annualPrice: doc.annualPrice,
    trialDays: doc.trialDays,
    currency: doc.currency,
    visibility: doc.visibility,
    supportedModels: [...doc.supportedModels],
    analyticsLevel: doc.analyticsLevel,
    retentionDays: doc.retentionDays,
    supportLevel: doc.supportLevel,
    entitlements: { ...doc.entitlements },
    createdAt: new Date(),
  };
}

async function audit(
  actor: AuthIdentity,
  action: string,
  resourceType: string,
  resourceId: string,
  changes: Record<string, unknown>,
  tenantId = actor.tenantId,
) {
  await AuditLogModel.create({
    tenantId,
    userId: actor.userId,
    actorId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action,
    resourceType,
    resourceId,
    changes,
  });
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Create a new package with version = 1 and an initial snapshot in the
 * `versions[]` array containing every billable field.
 */
export async function createPackage(
  input: CreatePackageInput,
  actor: AuthIdentity,
) {
  const now = new Date();
  const snapshot: PackageSnapshot = {
    name: input.name,
    code: input.code,
    description: input.description ?? "",
    active: true,
    version: 1,
    monthlyPrice: input.monthlyPrice,
    annualPrice: input.annualPrice ?? 0,
    trialDays: input.trialDays ?? 30,
    currency: input.currency ?? "USD",
    visibility: input.visibility ?? "public",
    supportedModels: input.supportedModels ?? ["basic"],
    analyticsLevel: input.analyticsLevel ?? "basic",
    retentionDays: input.retentionDays ?? 90,
    supportLevel: input.supportLevel ?? "community",
    entitlements: { ...input.entitlements },
    createdAt: now,
  };

  const doc = await PackageModel.create({
    ...input,
    active: true,
    version: 1,
    versions: [snapshot],
  });

  await audit(
    actor,
    "PACKAGE_CREATED",
    "package",
    String(doc._id),
    input as unknown as Record<string, unknown>,
  );

  return doc.toJSON();
}

/**
 * Retrieve a single package by ID. Throws 404 when not found.
 */
export async function getPackage(id: string) {
  const value = await PackageModel.findById(id).lean().exec();
  if (!value) throw new AppError(404, "NOT_FOUND", "Package not found");
  return value;
}

/**
 * List all packages sorted by most-recently-created first.
 */
export async function listPackages() {
  return PackageModel.find().sort({ createdAt: -1 }).lean().exec();
}

/**
 * List only active packages — suitable for public-facing selection screens.
 */
export async function listActivePackages() {
  return PackageModel.find({ active: true })
    .sort({ createdAt: -1 })
    .lean()
    .exec();
}

/**
 * Create a new version of an existing package. Bumps the version counter and
 * pushes a full-field snapshot into the `versions[]` array. All current
 * package fields are captured in the snapshot.
 *
 * Returns `{ package, versionBumped: true }`.
 */
export async function createVersion(
  id: string,
  input: UpdatePackageInput,
  actor: AuthIdentity,
) {
  const existing = await PackageModel.findById(id).exec();
  if (!existing) throw new AppError(404, "NOT_FOUND", "Package not found");

  // Apply partial updates before snapshotting
  if (input.name !== undefined) existing.name = input.name;
  if (input.code !== undefined) existing.code = input.code;
  if (input.description !== undefined) existing.description = input.description;
  if (input.monthlyPrice !== undefined) existing.monthlyPrice = input.monthlyPrice;
  if (input.annualPrice !== undefined) existing.annualPrice = input.annualPrice;
  if (input.trialDays !== undefined) existing.trialDays = input.trialDays;
  if (input.currency !== undefined) existing.currency = input.currency;
  if (input.visibility !== undefined) existing.visibility = input.visibility;
  if (input.supportedModels !== undefined)
    existing.supportedModels = input.supportedModels;
  if (input.analyticsLevel !== undefined)
    existing.analyticsLevel = input.analyticsLevel;
  if (input.retentionDays !== undefined)
    existing.retentionDays = input.retentionDays;
  if (input.supportLevel !== undefined)
    existing.supportLevel = input.supportLevel;
  if (input.entitlements !== undefined)
    existing.entitlements = { ...input.entitlements };

  existing.version += 1;
  existing.versions.push(buildSnapshot(existing));
  await existing.save();

  await audit(
    actor,
    "PACKAGE_VERSION_CREATED",
    "package",
    id,
    input as unknown as Record<string, unknown>,
  );

  return { package: existing.toJSON(), versionBumped: true as const };
}

/**
 * Soft-delete / hide a package by setting `active = false`.
 */
export async function archivePackage(id: string, actor: AuthIdentity) {
  const existing = await PackageModel.findById(id).exec();
  if (!existing) throw new AppError(404, "NOT_FOUND", "Package not found");

  existing.active = false;
  await existing.save();

  await audit(
    actor,
    "PACKAGE_ARCHIVED",
    "package",
    id,
    { active: false },
  );

  return existing.toJSON();
}
