import PackageModel, {
  type PackageDocument,
  type PackageEntitlements,
} from "../../db/models/package.model.js";
import { AppError } from "../../common/errors/AppError.js";
import { NOT_FOUND } from "../../common/errors/errorCodes.js";
import { getAuditWriter } from "../../common/observability/index.js";
import type { PackageSnapshot, PackageEntitlement } from "./billing.types.js";

// ── Domain input types ──────────────────────────────────────────────────────

export interface CreatePackageInput {
  name: string;
  code: string;
  description?: string;
  monthlyPrice: number;
  annualPrice?: number;
  currency?: string;
  trialDays?: number;
  entitlements: PackageEntitlement;
  supportedModels?: string[];
  analyticsLevel?: "basic" | "advanced" | "enterprise";
  retentionDays?: number;
  supportLevel?: "community" | "standard" | "priority" | "dedicated";
  visibility?: "public" | "internal";
}

export interface BillingActor {
  userId: string;
  email?: string;
  role?: string;
}

export interface CreateVersionResult {
  package: PackageSnapshot;
  versionBumped: true;
}

// ── Audit helper ────────────────────────────────────────────────────────────

function writeAudit(
  action: string,
  resourceType: string,
  resourceId: string,
  changes: Record<string, unknown>,
  actor?: BillingActor,
): void {
  const writer = getAuditWriter();
  writer.write({
    action: action as never,
    resourceType: resourceType as never,
    resourceId,
    changes,
    tenantId: "system",
    actorId: actor?.userId,
    actorEmail: actor?.email,
    actorRole: actor?.role,
  }).catch((err: unknown) => {
    console.error("Audit write failed (non-blocking):", err);
  });
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Create a new package with version=1 and an initial version snapshot.
 */
export async function createPackage(
  data: CreatePackageInput,
  actor?: BillingActor,
): Promise<PackageDocument> {
  const createdAt = new Date();
  const version = 1;

  const pkg = await PackageModel.create({
    name: data.name,
    code: data.code,
    description: data.description ?? "",
    monthlyPrice: data.monthlyPrice,
    annualPrice: data.annualPrice ?? 0,
    currency: data.currency ?? "USD",
    trialDays: data.trialDays ?? 30,
    entitlements: data.entitlements,
    supportedModels: data.supportedModels ?? ["basic"],
    analyticsLevel: data.analyticsLevel ?? "basic",
    retentionDays: data.retentionDays ?? 90,
    supportLevel: data.supportLevel ?? "community",
    visibility: data.visibility ?? "public",
    version,
    versions: [
      {
        version,
        monthlyPrice: data.monthlyPrice,
        entitlements: data.entitlements,
        annualPrice: data.annualPrice ?? 0,
        trialDays: data.trialDays ?? 30,
        visibility: data.visibility ?? "public",
        supportedModels: data.supportedModels ?? ["basic"],
        analyticsLevel: data.analyticsLevel ?? "basic",
        retentionDays: data.retentionDays ?? 90,
        supportLevel: data.supportLevel ?? "community",
        createdAt,
      },
    ],
  });

  writeAudit("PACKAGE_CREATED", "Package", pkg.id, data as unknown as Record<string, unknown>, actor);
  return pkg.toJSON();
}

/**
 * Get a package by its ID. Throws if not found.
 */
export async function getPackage(id: string): Promise<PackageDocument> {
  const pkg = await PackageModel.findById(id).lean().exec();
  if (!pkg) {
    throw new AppError(404, NOT_FOUND, "Package not found");
  }
  return pkg;
}

/**
 * List ALL packages (active + inactive). Super Admin scope.
 */
export async function listPackages(): Promise<PackageDocument[]> {
  return PackageModel.find().sort({ createdAt: -1 }).lean().exec();
}

/**
 * List only active, public packages.
 */
export async function listActivePackages(): Promise<PackageDocument[]> {
  return PackageModel.find({ active: true, visibility: "public" })
    .sort({ createdAt: -1 })
    .lean()
    .exec();
}

/**
 * Find an active package by its unique code.
 */
export async function getPackageByCode(code: string): Promise<PackageDocument | null> {
  return PackageModel.findOne({ code, active: true }).lean().exec();
}

/**
 * Bump the package version (+1), snapshot the current state into the versions
 * array, and persist. Returns the updated snapshot and a confirmation flag.
 */
export async function createVersion(
  id: string,
  actor?: BillingActor,
): Promise<CreateVersionResult> {
  const pkg = await PackageModel.findById(id).exec();
  if (!pkg) {
    throw new AppError(404, NOT_FOUND, "Package not found");
  }

  pkg.version += 1;
  pkg.versions.push({
    version: pkg.version,
    monthlyPrice: pkg.monthlyPrice,
    entitlements: pkg.entitlements,
    annualPrice: pkg.annualPrice,
    trialDays: pkg.trialDays,
    visibility: pkg.visibility,
    supportedModels: pkg.supportedModels,
    analyticsLevel: pkg.analyticsLevel,
    retentionDays: pkg.retentionDays,
    supportLevel: pkg.supportLevel,
    createdAt: new Date(),
  });
  await pkg.save();

  writeAudit(
    "PACKAGE_UPDATED",
    "Package",
    id,
    { version: pkg.version, action: "version_bumped" },
    actor,
  );

  return {
    package: mapToSnapshot(pkg.toJSON()),
    versionBumped: true,
  };
}

/**
 * Archive a package by setting active=false.
 */
export async function archivePackage(
  id: string,
  actor?: BillingActor,
): Promise<PackageDocument> {
  const pkg = await PackageModel.findByIdAndUpdate(
    id,
    { $set: { active: false } },
    { new: true, runValidators: true },
  )
    .lean()
    .exec();

  if (!pkg) {
    throw new AppError(404, NOT_FOUND, "Package not found");
  }

  writeAudit("PACKAGE_UPDATED", "Package", id, { active: false }, actor);
  return pkg;
}

/**
 * Create an immutable PackageSnapshot from a PackageDocument, omitting the
 * versions history array.
 */
export function mapToSnapshot(
  pkg: PackageDocument | Record<string, unknown>,
): PackageSnapshot {
  const doc = pkg as Record<string, unknown>;
  const ent = doc.entitlements as PackageEntitlements | PackageEntitlement | undefined;

  return {
    packageId: String(doc._id ?? doc.packageId ?? ""),
    version: (doc.version as number) ?? 0,
    name: (doc.name as string) ?? "",
    code: (doc.code as string) ?? "",
    description: (doc.description as string) ?? "",
    monthlyPrice: (doc.monthlyPrice as number) ?? 0,
    annualPrice: (doc.annualPrice as number) ?? 0,
    currency: (doc.currency as string) ?? "USD",
    trialDays: (doc.trialDays as number) ?? 0,
    entitlements: {
      employees: (ent?.employees as number) ?? 1,
      admins: (ent?.admins as number) ?? 0,
      documents: (ent?.documents as number) ?? 0,
      storageMb: (ent?.storageMb as number) ?? 0,
      fileSizeMb: (ent?.fileSizeMb as number) ?? 10,
      queriesPerMonth: (ent?.queriesPerMonth as number) ?? 0,
      tokensPerMonth: (ent?.tokensPerMonth as number) ?? 0,
      ocrPagesPerMonth: (ent?.ocrPagesPerMonth as number) ?? 0,
    },
    supportedModels: (doc.supportedModels as string[]) ?? [],
    analyticsLevel: (doc.analyticsLevel as PackageSnapshot["analyticsLevel"]) ?? "basic",
    retentionDays: (doc.retentionDays as number) ?? 0,
    supportLevel: (doc.supportLevel as PackageSnapshot["supportLevel"]) ?? "community",
    visibility: (doc.visibility as PackageSnapshot["visibility"]) ?? "public",
  };
}
