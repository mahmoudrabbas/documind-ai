import { Types } from "mongoose";
import UserModel from "../../db/models/user.model.js";
import DocumentModel from "../../db/models/document.model.js";
import UsageLogModel from "../../db/models/usageLog.model.js";
import OcrUsageRecordModel from "../../db/models/ocrUsageRecord.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import EntitlementReconciliationReportModel from "../../db/models/entitlementReconciliationReport.model.js";
import { SERVICEABLE_STATUSES } from "../billing/subscription-status-policy.js";
import type { QuotaCounterPort } from "./ports/quota-counter.port.js";
import type { EntitlementProviderPort } from "./ports/entitlement-provider.port.js";
import type { EntitlementDimension } from "./entitlement.types.js";
import { MongoQuotaCounter } from "./adapters/mongo-quota-counter.js";
import { MongoEntitlementProvider } from "./adapters/mongo-entitlement-provider.js";

// ── Reconciliation types ─────────────────────────────────────────────────────

export interface ReconciliationResult {
  dimension: string;
  authoritative: number;
  current: number;
  discrepancy: number;
  fixed: boolean;
}

export interface ReconciliationReport {
  tenantId: string;
  mode: "dry-run" | "execute";
  timestamp: string;
  periodStart: string;
  periodEnd: string | null;
  results: ReconciliationResult[];
  totalDiscrepancies: number;
  totalFixed: number;
}

export interface ReconciliationRunReport {
  mode: "dry-run" | "execute";
  timestamp: string;
  totalTenants: number;
  totalDiscrepancies: number;
  totalFixed: number;
  reports: ReconciliationReport[];
}

// ── Reconciliation dimension list ────────────────────────────────────────────
//
// Dimensions that can be reconciled against authoritative data sources.
// Only counter dimensions with a traceable authoritative source are included.

const RECONCILABLE_DIMENSIONS: EntitlementDimension[] = [
  "employees",
  "admins",
  "documents",
  "storageMb",
  "queriesPerMonth",
  "ocrPagesPerMonth",
];

// ── Service ──────────────────────────────────────────────────────────────────

/**
 * Reconciles quota counters against authoritative data sources.
 *
 * Period-based dimensions (queriesPerMonth, ocrPagesPerMonth) are counted
 * within the tenant's current billing period. Cumulative dimensions
 * (employees, admins, documents, storageMb) are counted as a snapshot of
 * the current state.
 *
 * @example
 * ```ts
 * const svc = new ReconciliationService(counter, provider);
 *
 * // Dry-run: log discrepancies without modifying counters
 * const report = await svc.reconcile("tenant-1", "dry-run");
 *
 * // Execute: repair discrepancies
 * const repairReport = await svc.reconcile("tenant-1", "execute");
 * ```
 */
export class ReconciliationService {
  constructor(
    private readonly counter: QuotaCounterPort,
    private readonly provider: EntitlementProviderPort,
  ) {}

  /**
   * Reconcile all dimensions for a tenant.
   *
   * In dry-run mode, discrepancies are logged via console.warn and the
   * counter is never modified. In execute mode, each discrepant counter
   * is updated to the authoritative value via `counter.set()`.
   *
   * Returns a report summarising what was found and what was fixed.
   */
  async reconcile(
    tenantId: string,
    mode: "dry-run" | "execute",
  ): Promise<ReconciliationReport> {
    const range = await this.provider.getPeriodRange(tenantId);
    const periodStart = `${range.periodStart.getFullYear()}-${String(range.periodStart.getMonth() + 1).padStart(2, "0")}`;
    const periodEnd = range.periodEnd?.toISOString() ?? null;

    const results: ReconciliationResult[] = [];
    let totalDiscrepancies = 0;
    let totalFixed = 0;

    for (const dimension of RECONCILABLE_DIMENSIONS) {
      const authoritative = await this.countFromSource(
        tenantId,
        dimension,
        range.periodStart,
        range.periodEnd,
      );
      const current = await this.counter.getUsage(
        tenantId,
        dimension,
        periodStart,
      );
      const discrepancy = authoritative - current;
      const hasDiscrepancy = discrepancy !== 0;

      if (hasDiscrepancy) {
        totalDiscrepancies++;
      }

      let fixed = false;
      if (hasDiscrepancy && mode === "execute") {
        await this.counter.set(tenantId, dimension, periodStart, authoritative);
        fixed = true;
        totalFixed++;
      }

      if (hasDiscrepancy) {
        console.warn(
          `[Reconciliation] ${mode === "dry-run" ? "DRY-RUN" : "FIXED"} ` +
            `tenant=${tenantId} dimension=${dimension} ` +
            `authoritative=${authoritative} current=${current} discrepancy=${discrepancy}`,
        );
      }

      results.push({
        dimension,
        authoritative,
        current,
        discrepancy,
        fixed,
      });
    }

    const report: ReconciliationReport = {
      tenantId,
      mode,
      timestamp: new Date().toISOString(),
      periodStart,
      periodEnd,
      results,
      totalDiscrepancies,
      totalFixed,
    };

    await this.persistReport(report);

    return report;
  }

  /**
   * Repair a stale-low counter for a single dimension without ever lowering
   * newer concurrent consumption.
   *
   * Intended for request-path quota enforcement. Unlike reconcile(...,
   * "execute"), this method uses ensureAtLeast() rather than set().
   */
  async reconcileAtLeast(
    tenantId: string,
    dimension: EntitlementDimension,
  ): Promise<number> {
    if (!RECONCILABLE_DIMENSIONS.includes(dimension)) {
      throw new Error(
        `Dimension ${dimension} does not have an authoritative reconciliation source`,
      );
    }

    const range = await this.provider.getPeriodRange(tenantId);
    const periodStart =
      `${range.periodStart.getFullYear()}-` +
      `${String(range.periodStart.getMonth() + 1).padStart(2, "0")}`;

    const authoritative = await this.countFromSource(
      tenantId,
      dimension,
      range.periodStart,
      range.periodEnd,
    );

    return this.counter.ensureAtLeast(
      tenantId,
      dimension,
      periodStart,
      authoritative,
    );
  }

  /**
   * Reconcile every tenant with a serviceable subscription.
   *
   * Enumerates all tenant ids from the Subscription collection restricted to
   * serviceable statuses (see `SERVICEABLE_STATUSES`) and runs `reconcile()`
   * for each, aggregating the per-tenant reports. Per-tenant reports are
   * persisted by `reconcile()` as usual; this method persists nothing extra.
   * A run with zero tenants returns an empty aggregate.
   */
  async reconcileAll(mode: "dry-run" | "execute"): Promise<ReconciliationRunReport> {
    const distinctTenantIds = await SubscriptionModel.distinct("tenantId", {
      status: { $in: [...SERVICEABLE_STATUSES] },
    }).exec();

    const skippedNullTenants = distinctTenantIds.reduce(
      (count, tenantId) => count + (tenantId == null ? 1 : 0),
      0,
    );
    if (skippedNullTenants > 0) {
      console.warn(
        `[Reconciliation] skipped ${skippedNullTenants} subscription(s) with a null tenantId in a serviceable status`,
      );
    }

    const tenantIds = distinctTenantIds.filter(
      (tenantId): tenantId is Types.ObjectId => tenantId != null,
    );

    const reports: ReconciliationReport[] = [];
    for (const tenantId of tenantIds) {
      reports.push(await this.reconcile(String(tenantId), mode));
    }

    return {
      mode,
      timestamp: new Date().toISOString(),
      totalTenants: reports.length,
      totalDiscrepancies: reports.reduce(
        (sum, report) => sum + report.totalDiscrepancies,
        0,
      ),
      totalFixed: reports.reduce((sum, report) => sum + report.totalFixed, 0),
      reports,
    };
  }

  /**
   * Persist a finished report to the EntitlementReconciliationReport
   * collection. Best-effort: persistence failures are logged but never
   * fail the reconciliation run itself.
   */
  private async persistReport(report: ReconciliationReport): Promise<void> {
    try {
      await EntitlementReconciliationReportModel.create({
        tenantId: new Types.ObjectId(report.tenantId),
        mode: report.mode,
        timestamp: new Date(report.timestamp),
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        results: report.results,
        totalDiscrepancies: report.totalDiscrepancies,
        totalFixed: report.totalFixed,
      });
    } catch (error) {
      console.warn(
        `[Reconciliation] failed to persist report tenant=${report.tenantId} mode=${report.mode}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ── Authoritative source counting ─────────────────────────────────────────

  /**
   * Recount a dimension from its authoritative data source.
   */
  private async countFromSource(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: Date,
    periodEnd: Date | null,
  ): Promise<number> {
    const tenantObjectId = new Types.ObjectId(tenantId);

    switch (dimension) {
      case "employees":
        return UserModel.countDocuments({
          tenantId: tenantObjectId,
          role: "EMPLOYEE",
          status: { $ne: "disabled" },
        });

      case "admins":
        return UserModel.countDocuments({
          tenantId: tenantObjectId,
          role: "COMPANY_ADMIN",
          status: { $ne: "disabled" },
        });

      case "documents":
        return DocumentModel.countDocuments({
          tenantId: tenantObjectId,
          deletedAt: null,
        });

      case "storageMb": {
        const pipeline = await DocumentModel.aggregate<{ totalBytes: number }>([
          {
            $match: {
              tenantId: tenantObjectId,
              deletedAt: null,
            },
          },
          {
            $group: {
              _id: null,
              totalBytes: { $sum: "$fileSize" },
            },
          },
        ]);
        const bytes = pipeline[0]?.totalBytes ?? 0;
        return Math.round((bytes / (1024 * 1024)) * 100) / 100;
      }

      case "queriesPerMonth": {
        const queryFilter: Record<string, unknown> = {
          tenantId: tenantObjectId,
          eventType: "QUESTION_ASKED",
        };
        this.applyPeriodFilter(queryFilter, periodStart, periodEnd);
        return UsageLogModel.countDocuments(queryFilter);
      }

      case "ocrPagesPerMonth": {
        // Auto-OCR (image-only documents ingested through the pipeline) is
        // billed separately from the paid OCR entitlement, so it is excluded
        // from the authoritative count. Records without a source field are
        // legacy manual OCR records and are still counted.
        const ocrFilter: Record<string, unknown> = {
          tenantId: tenantObjectId,
          $or: [
            { source: { $ne: "auto" } },
            { source: { $exists: false } },
          ],
        };
        this.applyPeriodFilter(ocrFilter, periodStart, periodEnd);
        return OcrUsageRecordModel.countDocuments(ocrFilter);
      }

      default:
        // Dimensions not backed by a recountable source return 0.
        // This includes tokensPerMonth, fileSizeMb, and capability keys.
        return 0;
    }
  }

  /**
   * Apply a period-bound filter to a query object.
   *
   * Uses `createdAt` as the timestamp field. When periodEnd is null, filters
   * only from periodStart onwards.
   */
  private applyPeriodFilter(
    filter: Record<string, unknown>,
    periodStart: Date,
    periodEnd: Date | null,
  ): void {
    if (periodEnd) {
      filter.createdAt = { $gte: periodStart, $lt: periodEnd };
    } else {
      filter.createdAt = { $gte: periodStart };
    }
  }
}

// ── Singleton accessor ────────────────────────────────────────────────────

let _reconciliationService: ReconciliationService | null = null;

export function getReconciliationService(): ReconciliationService {
  if (!_reconciliationService) {
    _reconciliationService = new ReconciliationService(
      new MongoQuotaCounter(),
      new MongoEntitlementProvider(),
    );
  }
  return _reconciliationService;
}
