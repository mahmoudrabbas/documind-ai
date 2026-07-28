import { Types } from "mongoose";
import UserModel from "../../db/models/user.model.js";
import DocumentModel from "../../db/models/document.model.js";
import UsageLogModel from "../../db/models/usageLog.model.js";
import OcrUsageRecordModel from "../../db/models/ocrUsageRecord.model.js";
import type { QuotaCounterPort } from "./ports/quota-counter.port.js";
import type { EntitlementProviderPort } from "./ports/entitlement-provider.port.js";
import type { EntitlementDimension } from "./entitlement.types.js";

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

    return {
      tenantId,
      mode,
      timestamp: new Date().toISOString(),
      periodStart,
      periodEnd,
      results,
      totalDiscrepancies,
      totalFixed,
    };
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
        });

      case "admins":
        return UserModel.countDocuments({
          tenantId: tenantObjectId,
          role: "COMPANY_ADMIN",
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
        const ocrFilter: Record<string, unknown> = {
          tenantId: tenantObjectId,
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
