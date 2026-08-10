import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import { getAuditWriter } from "../../common/observability/index.js";
import type { AuditOperationContext } from "../audit/audit.types.js";
import QuotaOverrideModel from "../../db/models/quotaOverride.model.js";
import TenantModel from "../../db/models/tenant.model.js";
import EntitlementReconciliationReportModel from "../../db/models/entitlementReconciliationReport.model.js";
import { getReconciliationService } from "./reconciliation.service.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;
const endpoint =
  (handler: Handler) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await handler(req, res);
      if (!res.headersSent) res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

const auditContext = (req: Request): AuditOperationContext => {
  if (!req.auth || !req.tenantId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }
  const resolved = requireAuthenticatedAuditActor({
    tenantId: req.tenantId,
    actorId: req.auth.userId,
    actorEmail: req.auth.email,
    actorRole: req.auth.role,
  });
  return {
    tenantId: resolved.tenantId,
    actorId: resolved.actorId,
    actorEmail: resolved.actorEmail,
    actorRole: resolved.actorRole,
    traceId: req.traceId,
    requestId: req.requestId,
  };
};

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(400, VALIDATION_ERROR, "Validation failed", {
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        issue: issue.message,
      })),
    });
  }
  return result.data;
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const counterDimensions = [
  "employees",
  "admins",
  "documents",
  "storageMb",
  "fileSizeMb",
  "queriesPerMonth",
  "tokensPerMonth",
  "ocrPagesPerMonth",
] as const;

const setOverrideSchema = z
  .object({
    dimension: z.enum(counterDimensions),
    limit: z.number().int().min(0, "limit must be >= 0"),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

const listOverridesQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    tenantId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid tenantId")
      .optional(),
  })
  .strict();

const paramsWithTenantId = z
  .object({
    tenantId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid tenantId"),
  })
  .strict();

const paramsWithTenantAndDimension = z
  .object({
    tenantId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid tenantId"),
    dimension: z.enum(counterDimensions),
  })
  .strict();

const reconcileSchema = z
  .object({
    mode: z.enum(["dry-run", "execute"]).default("dry-run"),
    tenantId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid tenantId")
      .optional(),
  })
  .strict();

const listReconciliationReportsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    tenantId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid tenantId")
      .optional(),
  })
  .strict();

// ── Controllers ──────────────────────────────────────────────────────────────

/**
 * Shape of the `tenantId` / `createdBy` fields after `.populate()`.
 *
 * A populated ref resolves to the referenced document; it stays a bare
 * ObjectId when the referenced document no longer exists (deleted tenant,
 * removed admin). Both cases must be handled — see `flattenOverride`.
 */
type PopulatedRef<T> = mongoose.Types.ObjectId | (T & { _id: mongoose.Types.ObjectId });

function isPopulated<T>(
  ref: PopulatedRef<T> | null | undefined,
): ref is T & { _id: mongoose.Types.ObjectId } {
  return Boolean(ref) && !(ref instanceof mongoose.Types.ObjectId);
}

/**
 * Flatten a populated override document into the wire contract.
 *
 * `tenantId` stays a plain string so existing clients and the
 * `PUT/DELETE /overrides/:tenantId` round-trip keep working unchanged; the
 * human-readable fields are added alongside it. Admin UIs display an
 * identifier only when the tenant record is genuinely gone.
 */
function flattenOverride(override: {
  tenantId: PopulatedRef<{ name?: string; slug?: string; status?: string }>;
  createdBy?: PopulatedRef<{ name?: string; email?: string }> | null;
  [key: string]: unknown;
}) {
  const { tenantId, createdBy, ...rest } = override;
  const tenant = isPopulated(tenantId) ? tenantId : null;
  const actor = isPopulated(createdBy) ? createdBy : null;

  return {
    ...rest,
    tenantId: (tenant?._id ?? tenantId).toString(),
    tenantName: tenant?.name ?? null,
    tenantSlug: tenant?.slug ?? null,
    tenantStatus: tenant?.status ?? null,
    /** True when the referenced tenant no longer exists — the override is orphaned. */
    tenantMissing: tenant === null,
    createdBy: (actor?._id ?? createdBy)?.toString() ?? null,
    createdByName: actor?.name ?? null,
    createdByEmail: actor?.email ?? null,
  };
}

export const listOverridesController = endpoint(async (req) => {
  const { page, pageSize, tenantId } = parse(
    listOverridesQuerySchema,
    req.query,
  );
  const filter: Record<string, unknown> = {};
  if (tenantId)
    filter.tenantId = new mongoose.Types.ObjectId(tenantId);

  const [overrides, total] = await Promise.all([
    QuotaOverrideModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      // Resolve refs so the admin UI can render names instead of ObjectIds.
      .populate("tenantId", "name slug status")
      .populate("createdBy", "name email")
      .lean()
      .exec(),
    QuotaOverrideModel.countDocuments(filter).exec(),
  ]);

  return {
    overrides: overrides.map((override) =>
      flattenOverride(override as unknown as Parameters<typeof flattenOverride>[0]),
    ),
    pagination: {
      page,
      pageSize,
      total,
      // `totalRecords` mirrors `total` for parity with the other platform list
      // endpoints, whose clients read `pagination.totalRecords`.
      totalRecords: total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
});

export const setOverrideController = endpoint(async (req) => {
  const { tenantId } = parse(paramsWithTenantId, req.params);
  const { dimension, limit, reason } = parse(setOverrideSchema, req.body);
  const ctx = auditContext(req);

  const tenantObjectId = new mongoose.Types.ObjectId(tenantId);

  const existing = await QuotaOverrideModel.findOne({
    tenantId: tenantObjectId,
    dimension,
  })
    .lean()
    .exec();

  const override = await QuotaOverrideModel.findOneAndUpdate(
    { tenantId: tenantObjectId, dimension },
    {
      $set: {
        limit,
        reason: reason ?? "",
        enabled: true,
        createdBy: new mongoose.Types.ObjectId(ctx.actorId),
      },
    },
    { upsert: true, returnDocument: "after", runValidators: true },
  )
    // Match the list contract so the client can patch the row in place.
    .populate("tenantId", "name slug status")
    .populate("createdBy", "name email")
    .lean()
    .exec();

  await getAuditWriter().write({
    action: "QUOTA_OVERRIDE",
    resourceType: "EntitlementOverride",
    resourceId: `${tenantId}:${dimension}`,
    changes: {
      dimension,
      limit,
      reason: reason ?? "",
    },
    metadata: {
      prevValue: existing
        ? { limit: existing.limit, reason: existing.reason }
        : null,
      newValue: { limit, reason: reason ?? "" },
    },
    tenantId: ctx.tenantId,
    actorId: ctx.actorId,
    actorEmail: ctx.actorEmail,
    actorRole: ctx.actorRole,
  });

  return flattenOverride(
    override as unknown as Parameters<typeof flattenOverride>[0],
  );
});

export const removeOverrideController = endpoint(async (req) => {
  const { tenantId, dimension } = parse(
    paramsWithTenantAndDimension,
    req.params,
  );
  const ctx = auditContext(req);

  const tenantObjectId = new mongoose.Types.ObjectId(tenantId);

  const existing = await QuotaOverrideModel.findOneAndDelete({
    tenantId: tenantObjectId,
    dimension,
  })
    .lean()
    .exec();

  if (!existing) {
    throw new AppError(
      404,
      "NOT_FOUND",
      `Quota override not found for tenant ${tenantId} dimension ${dimension}`,
    );
  }

  await getAuditWriter().write({
    action: "QUOTA_OVERRIDE",
    resourceType: "EntitlementOverride",
    resourceId: `${tenantId}:${dimension}`,
    changes: {
      dimension,
      removed: true,
    },
    metadata: {
      prevValue: { limit: existing.limit, reason: existing.reason },
      newValue: null,
    },
    tenantId: ctx.tenantId,
    actorId: ctx.actorId,
    actorEmail: ctx.actorEmail,
    actorRole: ctx.actorRole,
  });

  return { removed: true, tenantId, dimension };
});

/**
 * Normalise a reconciliation report into the flat, name-bearing shape the
 * admin UI renders.
 *
 * The domain service returns per-tenant reports each holding a nested
 * `results[]` of per-dimension rows, and `reconcile()` (single tenant)
 * returns one report where `reconcileAll()` returns many. Both are flattened
 * to one row per (tenant, dimension) with the tenant name resolved in a
 * single batched query.
 */
async function attachTenantNames(
  raw:
    | Awaited<ReturnType<ReturnType<typeof getReconciliationService>["reconcile"]>>
    | Awaited<ReturnType<ReturnType<typeof getReconciliationService>["reconcileAll"]>>,
) {
  const perTenant = "reports" in raw ? raw.reports : [raw];

  const tenantIds = [...new Set(perTenant.map((report) => report.tenantId))];
  const tenants = await TenantModel.find({
    _id: { $in: tenantIds.map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .select("name slug")
    .lean()
    .exec();
  const nameById = new Map(
    tenants.map((tenant) => [
      tenant._id.toString(),
      { name: tenant.name as string, slug: tenant.slug as string },
    ]),
  );

  const rows = perTenant.flatMap((report) =>
    report.results.map((result) => ({
      tenantId: report.tenantId,
      tenantName: nameById.get(report.tenantId)?.name ?? null,
      tenantSlug: nameById.get(report.tenantId)?.slug ?? null,
      dimension: result.dimension,
      authoritative: result.authoritative,
      current: result.current,
      discrepancy: result.discrepancy,
      fixed: result.fixed,
    })),
  );

  return {
    mode: raw.mode,
    timestamp: raw.timestamp,
    totalTenants: "totalTenants" in raw ? raw.totalTenants : perTenant.length,
    totalDiscrepancies: raw.totalDiscrepancies,
    totalFixed: raw.totalFixed,
    // Only discrepant rows are worth showing; a clean dimension is noise.
    reports: rows.filter((row) => row.discrepancy !== 0),
  };
}

export const reconcileController = endpoint(async (req) => {
  const { mode, tenantId } = parse(reconcileSchema, req.body);
  const ctx = auditContext(req);

  const rawReport = tenantId
    ? await getReconciliationService().reconcile(tenantId, mode)
    : await getReconciliationService().reconcileAll(mode);

  // Resolve tenant names at the presentation boundary so the admin UI never
  // has to render a bare ObjectId. The domain service stays name-agnostic.
  const report = await attachTenantNames(rawReport);

  await getAuditWriter().write({
    action: "ENTITLEMENT_RECONCILE",
    resourceType: "EntitlementReconciliation",
    resourceId: tenantId ?? "all",
    metadata: {
      mode,
      totalDiscrepancies: report.totalDiscrepancies,
      totalFixed: report.totalFixed,
    },
    tenantId: ctx.tenantId,
    actorId: ctx.actorId,
    actorEmail: ctx.actorEmail,
    actorRole: ctx.actorRole,
  });

  return report;
});

export const listReconciliationReportsController = endpoint(async (req) => {
  const { page, pageSize, tenantId } = parse(
    listReconciliationReportsQuerySchema,
    req.query,
  );
  const filter: Record<string, unknown> = {};
  if (tenantId) filter.tenantId = new mongoose.Types.ObjectId(tenantId);

  const [reports, total] = await Promise.all([
    EntitlementReconciliationReportModel.find(filter)
      .sort({ timestamp: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean()
      .exec(),
    EntitlementReconciliationReportModel.countDocuments(filter).exec(),
  ]);

  return {
    reports,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
});
