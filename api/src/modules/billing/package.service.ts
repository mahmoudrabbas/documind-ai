import PackageModel, {
  type PackageDocument,
  type PackageEntitlements,
} from "../../db/models/package.model.js";
import { Types } from "mongoose";
import SubscriptionModel from "../../db/models/subscription.model.js";
import { AppError } from "../../common/errors/AppError.js";
import {
  PACKAGE_ALREADY_ACTIVE,
  PACKAGE_ALREADY_ARCHIVED,
  PACKAGE_CODE_CONFLICT,
  PACKAGE_NOT_FOUND,
  PACKAGE_TRANSITION_BLOCKED,
  PACKAGE_VERSION_CONFLICT,
} from "../../common/errors/errorCodes.js";
import { getAuditWriter } from "../../common/observability/index.js";
import type { BaseRole } from "../../common/auth/baseRoles.js";
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
  role?: BaseRole;
  tenantId?: string;
  traceId?: string;
  requestId?: string;
}

export interface PackageVersionInput {
  expectedVersion: number;
  name?: string;
  description?: string;
  monthlyPrice?: number;
  annualPrice?: number;
  currency?: string;
  trialDays?: number;
  entitlements?: PackageEntitlement;
  supportedModels?: string[];
  analyticsLevel?: "basic" | "advanced" | "enterprise";
  retentionDays?: number;
  supportLevel?: "community" | "standard" | "priority" | "dedicated";
  visibility?: "public" | "internal";
  stripeProductId?: string;
  stripePriceId?: string;
  stripeAnnualPriceId?: string;
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
  outcome: "SUCCESS" | "DENIED" | "FAILURE" = "SUCCESS",
): void {
  const writer = getAuditWriter();
  writer.write({
    action: action as never,
    resourceType: resourceType as never,
    resourceId,
    changes,
    tenantId: actor?.tenantId,
    actorId: actor?.userId,
    actorEmail: actor?.email,
    actorRole: actor?.role,
    actorKind: actor ? "USER" : "SYSTEM",
    outcome,
    metadata: actor
      ? { traceId: actor.traceId, requestId: actor.requestId }
      : undefined,
  }).catch((err: unknown) => {
    console.error("Audit write failed (non-blocking):", err);
  });
}

function packageNotFound(): AppError {
  return new AppError(404, PACKAGE_NOT_FOUND, "Package not found");
}

function versionConflict(currentVersion?: number): AppError {
  return new AppError(
    409,
    PACKAGE_VERSION_CONFLICT,
    "Package was changed by another operation",
    currentVersion === undefined ? null : { currentVersion },
  );
}

function isDuplicateKey(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === 11000,
  );
}

function snapshotFrom(
  pkg: Pick<
    PackageDocument,
    | "name"
    | "code"
    | "description"
    | "monthlyPrice"
    | "annualPrice"
    | "currency"
    | "trialDays"
    | "entitlements"
    | "visibility"
    | "supportedModels"
    | "analyticsLevel"
    | "retentionDays"
    | "supportLevel"
    | "stripeProductId"
    | "stripePriceId"
    | "stripeAnnualPriceId"
  >,
  version: number,
) {
  return {
    version,
    name: pkg.name,
    code: pkg.code,
    description: pkg.description,
    monthlyPrice: pkg.monthlyPrice,
    annualPrice: pkg.annualPrice,
    currency: pkg.currency,
    trialDays: pkg.trialDays,
    entitlements: { ...pkg.entitlements },
    visibility: pkg.visibility,
    supportedModels: [...pkg.supportedModels],
    analyticsLevel: pkg.analyticsLevel,
    retentionDays: pkg.retentionDays,
    supportLevel: pkg.supportLevel,
    stripeProductId: pkg.stripeProductId ?? "",
    stripePriceId: pkg.stripePriceId ?? "",
    stripeAnnualPriceId: pkg.stripeAnnualPriceId ?? "",
    createdAt: new Date(),
  };
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
  const packageValues = {
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
    stripeProductId: "",
    stripePriceId: "",
    stripeAnnualPriceId: "",
  };

  let pkg: PackageDocument;
  try {
    pkg = await PackageModel.create({
      ...packageValues,
    version,
    versions: [
      {
        name: packageValues.name,
        code: packageValues.code,
        description: packageValues.description,
        version,
        monthlyPrice: packageValues.monthlyPrice,
        entitlements: { ...packageValues.entitlements },
        annualPrice: packageValues.annualPrice,
        currency: packageValues.currency,
        trialDays: packageValues.trialDays,
        visibility: packageValues.visibility,
        supportedModels: [...packageValues.supportedModels],
        analyticsLevel: packageValues.analyticsLevel,
        retentionDays: packageValues.retentionDays,
        supportLevel: packageValues.supportLevel,
        stripeProductId: "",
        stripePriceId: "",
        stripeAnnualPriceId: "",
        createdAt,
      },
    ],
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      writeAudit(
        "PACKAGE_CREATED",
        "Package",
        data.code,
        { code: data.code, reason: PACKAGE_CODE_CONFLICT },
        actor,
        "DENIED",
      );
      throw new AppError(
        409,
        PACKAGE_CODE_CONFLICT,
        "Package code is already in use",
      );
    }
    throw error;
  }

  writeAudit("PACKAGE_CREATED", "Package", String(pkg._id), data as unknown as Record<string, unknown>, actor);
  return pkg.toJSON();
}

/**
 * Get a package by its ID. Throws if not found.
 */
export async function getPackage(id: string): Promise<PackageDocument> {
  const pkg = await PackageModel.findById(id).lean().exec();
  if (!pkg) {
    throw packageNotFound();
  }
  return withMoneyContract(pkg);
}

/**
 * List ALL packages (active + inactive). Super Admin scope.
 */
export async function listPackages(): Promise<PackageDocument[]> {
  const packages = await PackageModel.find().sort({ createdAt: -1 }).lean().exec();
  return packages.map((pkg) => withMoneyContract(pkg));
}

function withMoneyContract<T>(pkg: T): T {
  const doc = pkg as unknown as Record<string, unknown>;
  const monthlyPrice = doc.monthlyPrice as number;
  const annualPrice = doc.annualPrice as number;
  const versions = (doc.versions as Array<Record<string, unknown>> | undefined)?.map(
    (version) => ({
      ...version,
      monthlyPriceCents: version.monthlyPrice,
      annualPriceCents: version.annualPrice,
    }),
  );
  return {
    ...doc,
    monthlyPriceCents: monthlyPrice,
    annualPriceCents: annualPrice,
    ...(versions ? { versions } : {}),
  } as unknown as T;
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
  input: PackageVersionInput,
  actor?: BillingActor,
): Promise<CreateVersionResult> {
  const current = await PackageModel.findById(id).lean().exec();
  if (!current) throw packageNotFound();
  if (current.version !== input.expectedVersion) {
    writeAudit(
      "PACKAGE_VERSION_CREATED",
      "Package",
      id,
      { expectedVersion: input.expectedVersion, currentVersion: current.version },
      actor,
      "DENIED",
    );
    throw versionConflict(current.version);
  }

  const nextVersion = current.version + 1;
  const next = {
    ...current,
    ...input,
    code: current.code,
    version: nextVersion,
    entitlements: input.entitlements
      ? { ...input.entitlements }
      : { ...current.entitlements },
    supportedModels: input.supportedModels
      ? [...input.supportedModels]
      : [...current.supportedModels],
  } as unknown as PackageDocument;
  const snapshot = snapshotFrom(next, nextVersion);
  const setValues = {
    name: next.name,
    description: next.description,
    monthlyPrice: next.monthlyPrice,
    annualPrice: next.annualPrice,
    currency: next.currency,
    trialDays: next.trialDays,
    entitlements: next.entitlements,
    visibility: next.visibility,
    supportedModels: next.supportedModels,
    analyticsLevel: next.analyticsLevel,
    retentionDays: next.retentionDays,
    supportLevel: next.supportLevel,
    stripeProductId: next.stripeProductId,
    stripePriceId: next.stripePriceId,
    stripeAnnualPriceId: next.stripeAnnualPriceId,
  };
  const updated = await PackageModel.findOneAndUpdate(
    { _id: id, version: input.expectedVersion },
    {
      $set: setValues,
      $inc: { version: 1 },
      $push: { versions: snapshot },
    },
    { returnDocument: "after", runValidators: true },
  )
    .lean()
    .exec();
  if (!updated) {
    const latest = await PackageModel.findById(id).select("version").lean().exec();
    if (!latest) throw packageNotFound();
    throw versionConflict(latest.version);
  }

  writeAudit(
    "PACKAGE_VERSION_CREATED",
    "Package",
    id,
    {
      oldVersion: input.expectedVersion,
      newVersion: nextVersion,
      oldState: { active: current.active, visibility: current.visibility },
      newState: { active: updated.active, visibility: updated.visibility },
    },
    actor,
  );
  return { package: mapToSnapshot(updated), versionBumped: true };
}

/**
 * Archive a package by setting active=false.
 */
export async function previewPackageImpact(
  id: string,
  action: PackageLifecycleAction,
  actor?: BillingActor,
  recordAudit = true,
): Promise<PackageImpactPreview> {
  const [pkg, states] = await Promise.all([
    PackageModel.findById(id).lean().exec(),
    SubscriptionModel.aggregate<{ _id: string; count: number }>([
      { $match: { packageId: new Types.ObjectId(id) } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);
  if (!pkg) throw packageNotFound();

  const affectedSubscriptionStates = Object.fromEntries(
    states.map((state) => [state._id, state.count]),
  );
  const subscriptionUsageCount = states.reduce(
    (sum, state) => sum + state.count,
    0,
  );
  const blockingReasons: string[] = [];
  if (action === "archive" && !pkg.active) {
    blockingReasons.push(PACKAGE_ALREADY_ARCHIVED);
  }
  if (action === "activate" && pkg.active) {
    blockingReasons.push(PACKAGE_ALREADY_ACTIVE);
  }
  const warnings = subscriptionUsageCount
    ? [
        `${subscriptionUsageCount} existing subscription(s) retain their referenced package version`,
      ]
    : [];
  const preview: PackageImpactPreview = {
    package: {
      id: String(pkg._id),
      name: pkg.name,
      code: pkg.code,
      version: pkg.version,
      active: pkg.active,
    },
    action,
    subscriptionUsageCount,
    affectedSubscriptionStates,
    landingVisibilityImpact:
      pkg.visibility !== "public"
        ? "unchanged"
        : action === "archive"
          ? "removed"
          : "restored",
    warnings,
    blockingReasons,
    transitionAllowed: blockingReasons.length === 0,
  };
  if (recordAudit) {
    writeAudit(
      action === "archive"
        ? "PACKAGE_ARCHIVE_PREVIEWED"
        : "PACKAGE_ACTIVATE_PREVIEWED",
      "Package",
      id,
      { action, version: pkg.version, transitionAllowed: preview.transitionAllowed },
      actor,
    );
  }
  return preview;
}

async function transitionPackage(
  id: string,
  action: PackageLifecycleAction,
  expectedVersion: number,
  reason: string,
  actor?: BillingActor,
): Promise<PackageDocument> {
  const preview = await previewPackageImpact(id, action, undefined, false);
  if (!preview.transitionAllowed) {
    const code = preview.blockingReasons[0] ?? PACKAGE_TRANSITION_BLOCKED;
    writeAudit(
      action === "archive" ? "PACKAGE_ARCHIVED" : "PACKAGE_ACTIVATED",
      "Package",
      id,
      { reason, version: expectedVersion, blockingReasons: preview.blockingReasons },
      actor,
      "DENIED",
    );
    throw new AppError(409, code, "Package lifecycle transition is not allowed", {
      blockingReasons: preview.blockingReasons,
    });
  }
  if (preview.package.version !== expectedVersion) {
    writeAudit(
      action === "archive" ? "PACKAGE_ARCHIVED" : "PACKAGE_ACTIVATED",
      "Package",
      id,
      { reason, expectedVersion, currentVersion: preview.package.version },
      actor,
      "DENIED",
    );
    throw versionConflict(preview.package.version);
  }
  const active = action === "activate";
  const updated = await PackageModel.findOneAndUpdate(
    { _id: id, version: expectedVersion, active: !active },
    { $set: { active } },
    { returnDocument: "after", runValidators: true },
  )
    .lean()
    .exec();
  if (!updated) throw versionConflict();
  writeAudit(
    action === "archive" ? "PACKAGE_ARCHIVED" : "PACKAGE_ACTIVATED",
    "Package",
    id,
    {
      oldState: { active: !active },
      newState: { active },
      version: expectedVersion,
      reason,
      subscriptionUsageCount: preview.subscriptionUsageCount,
    },
    actor,
  );
  return updated;
}

export const archivePackage = (
  id: string,
  expectedVersion: number,
  reason: string,
  actor?: BillingActor,
) => transitionPackage(id, "archive", expectedVersion, reason, actor);

export const activatePackage = (
  id: string,
  expectedVersion: number,
  reason: string,
  actor?: BillingActor,
) => transitionPackage(id, "activate", expectedVersion, reason, actor);

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
