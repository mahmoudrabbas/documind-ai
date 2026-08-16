import { Types } from "mongoose";
import PackageModel from "../db/models/package.model.js";
import SubscriptionModel from "../db/models/subscription.model.js";
import { SERVICEABLE_STATUSES } from "../modules/billing/subscription-status-policy.js";
import {
  addCalendarMonths,
  computeLocalFreePeriod,
} from "../modules/billing/free-fallback.service.js";
import { ReconciliationService } from "../modules/entitlement/reconciliation.service.js";
import { MongoQuotaCounter } from "../modules/entitlement/adapters/mongo-quota-counter.js";
import { MongoEntitlementProvider } from "../modules/entitlement/adapters/mongo-entitlement-provider.js";
import type { EntitlementDimension } from "../modules/entitlement/entitlement.types.js";

/**
 * Legacy local Free subscriptions created before entitlement periods existed
 * carry missing period fields. Because the entitlement provider requires a
 * concrete period to roll the subscription into a fresh monthly cycle, those
 * records would otherwise stay frozen on a `periodEnd: null` shape forever.
 *
 * This migration backfills a deterministic period onto exactly those records.
 * Canonical Free identity is established by PACKAGE identity — the packageId
 * must equal the canonical Free package (code "free", active, public
 * visibility) — never by `providerSubscriptionId === ""`, because an
 * unsynchronized paid subscription can also temporarily have no provider
 * subscription id.
 *
 * ── Repair classes ───────────────────────────────────────────────────────────
 *
 * 1. all-null (`periodStart == null AND periodEnd == null`):
 *    a. If a deterministic immediately-preceding PAID subscription exists for
 *       the same tenant (non-Free package, concrete period that contains the
 *       Free subscription's creation, no conflicting candidate), the Free
 *       subscription INHERITS that exact outgoing paid period. This preserves
 *       period-scoped usage continuity that the YYYY-MM counter key alone
 *       cannot represent.
 *    b. Otherwise (native Free from registration with no paid lineage), the
 *       period is computed with normal local Free semantics
 *       (`computeLocalFreePeriod(now)`), anchored inside the current YYYY-MM
 *       bucket so existing counters stay observable.
 *    c. If the paid lineage is AMBIGUOUS the record is SKIPPED and reported —
 *       never guessed.
 *
 * 2. start-only (`periodStart != null AND periodEnd == null`):
 *    `periodStart` is authoritative and preserved byte-for-byte; only
 *    `periodEnd` is derived one calendar month later with the same
 *    calendar-month arithmetic local Free periods use. Paid-predecessor
 *    recovery is NEVER applied to this class, so a correct original start is
 *    never overwritten merely because an older subscription exists.
 *
 * 3. already-repaired (concrete `periodStart` + `periodEnd` on a record that
 *    still carries `provider == "stripe"` with an empty `providerSubscriptionId`):
 *    this is the shape left behind by the first repair run: the all-null
 *    records were given `computeLocalFreePeriod(migration-now)` boundaries but
 *    their provider was left untouched. Processing this class is gated behind
 *    the explicit `includeRepaired` mode (CLI `--include-repaired`). When
 *    enabled:
 *    a. the deterministic paid predecessor is resolved (same lineage rule);
 *    b. if found and its exact period differs, the record is corrected to that
 *       exact period;
 *    c. the provider is normalized to the local Free lifecycle;
 *    d. period-scoped authoritative counters (queriesPerMonth,
 *       ocrPagesPerMonth) are reconciled monotonically (`ensureAtLeast`).
 *    Without the flag these records are reported as already-correct.
 *
 * ── Provider normalization (BUG 2) ───────────────────────────────────────────
 *
 * A canonical Free subscription must be a local entitlement. Any canonical
 * Free record with `provider == "stripe"` and no `providerSubscriptionId` is
 * normalized to:
 *
 *   provider             = "local"
 *   providerSubscriptionId = ""
 *   providerPriceId      = ""
 *   billingInterval      = "monthly"
 *
 * `providerCustomerId` is PRESERVED when present (a later Free → Paid checkout
 * reuses the existing Stripe customer). When empty and an unambiguous outgoing
 * paid predecessor carries a customer id, the customer id is backfilled from
 * that deterministic lineage only. No Stripe resources are ever created or
 * mutated.
 *
 * Because `providerLinked` derives from `providerSubscriptionId`, and
 * `canOpenPortal` / `canUpdatePaymentMethod` additionally require provider
 * linkage, the normalized record always stays `providerLinked == false`,
 * `canOpenPortal == false`, `canUpdatePaymentMethod == false` while retaining
 * the customer id solely for future customer reuse.
 *
 * ── Counter repair ───────────────────────────────────────────────────────────
 *
 * Correcting the period boundaries alone is not enough: authoritative
 * period-scoped usage would be invisible if the counter was keyed against the
 * wrong bucket. After a period is restored from paid lineage, ONLY
 * queriesPerMonth and ocrPagesPerMonth are reconciled against the exact
 * restored range, using the existing reconciliation architecture with
 * monotonic `ensureAtLeast` semantics — a higher concurrent counter is never
 * lowered. tokensPerMonth and snapshot dimensions (employees, admins,
 * documents, storageMb) are never touched by this migration, and historical
 * quota-counter rows are never deleted.
 *
 * ── Safety ───────────────────────────────────────────────────────────────────
 *
 * - Idempotent: every update is guarded by a compare-and-swap filter carrying
 *   the exact pre-repair shape, so a second run finds nothing to repair.
 * - Concurrent-safe: two concurrent runs race on the same CAS filter; exactly
 *   one wins and the loser counts a skipped-concurrent-change.
 * - Fail-closed: only canonical Free subscriptions in a serviceable status
 *   with a repairable shape are repaired. Paid / provider-backed subscriptions
 *   and ambiguous lineage are skipped and reported rather than guessed at.
 */

export interface RepairLegacyFreePeriodsOptions {
  /** Persist repairs. Defaults to false (dry-run only). */
  apply?: boolean;
  /** Restrict the scan to a single tenant (ObjectId hex string). */
  tenantId?: string;
  /** Resume the scan after this subscription _id (ObjectId hex string). */
  afterId?: string;
  /**
   * Explicit opt-in mode: also process already-repaired records — concrete
   * period boundaries combined with the legacy `provider == "stripe"` /
   * empty `providerSubscriptionId` marker — correcting their period from
   * deterministic paid lineage, normalizing the provider, and reconciling
   * period-scoped counters. Off by default; without it such records are
   * reported as already-correct.
   */
  includeRepaired?: boolean;
  /** Deterministic anchor for tests; defaults to `new Date()`. */
  now?: Date;
}

export type RepairDetailStatus =
  | "wouldRepair"
  | "repaired"
  | "normalizedOnly"
  | "alreadyCorrect"
  | "skipped";

export interface CounterPreview {
  current: number;
  authoritative: number;
  raised: boolean;
}

export interface RepairDetail {
  subscriptionId: string;
  tenantId: string;
  repairClass: "allNull" | "startOnly" | "alreadyRepaired" | "alreadyCorrect" | "skipped";
  status: RepairDetailStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  proposedPeriodStart: string | null;
  proposedPeriodEnd: string | null;
  predecessorId: string | null;
  providerBefore: string;
  providerAfter: string;
  providerCustomerIdBefore: string;
  providerCustomerIdAfter: string;
  providerNormalized: boolean;
  counterReconciliationRequired: boolean;
  queries: CounterPreview | null;
  ocr: CounterPreview | null;
  skipReason?: string;
}

export interface RepairLegacyFreePeriodsReport {
  mode: "dry-run" | "apply";
  tenantFiltered: boolean;
  afterId: string | null;
  includeRepaired: boolean;
  canonicalFreePackageId: string;
  examined: number;
  eligible: number;
  wouldRepair: number;
  repaired: number;
  repairedIds: string[];
  /** Records whose period was restored from the exact outgoing paid period. */
  repairedFromPaidPeriod: number;
  /** All-null records repaired with normal local Free period semantics. */
  repairedLocalFree: number;
  /** Start-only records repaired by preserving the start and deriving the end. */
  repairedStartOnly: number;
  /** Records whose provider was normalized to the local Free lifecycle. */
  normalizedProvider: number;
  /** queriesPerMonth counters raised by monotonic authoritative reconciliation. */
  reconciledQueries: number;
  /** ocrPagesPerMonth counters raised by monotonic authoritative reconciliation. */
  reconciledOcr: number;
  alreadyCorrect: number;
  skippedNonFree: number;
  skippedNonServiceable: number;
  skippedPartialPeriod: number;
  skippedNullTenant: number;
  skippedAmbiguousLineage: number;
  skippedConcurrentChange: number;
  lastScannedId: string | null;
  details: RepairDetail[];
}

export class RepairLegacyFreePeriodsError extends Error {
  constructor(
    public readonly code:
      | "CANONICAL_FREE_PACKAGE_NOT_FOUND"
      | "LEGACY_FREE_READ_FAILED"
      | "LEGACY_FREE_WRITE_FAILED",
    public readonly resumeAfterId: string | null,
  ) {
    super(code);
    this.name = "RepairLegacyFreePeriodsError";
  }
}

interface SubscriptionLeanRecord {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId | null;
  packageId: Types.ObjectId | null;
  status: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  createdAt?: Date | null;
  startedAt?: Date | null;
  provider?: string;
  providerSubscriptionId?: string;
  providerPriceId?: string;
  billingInterval?: string | null;
  providerCustomerId?: string;
}

interface PaidLineage {
  status: "found" | "none" | "ambiguous";
  predecessor?: SubscriptionLeanRecord;
}

/**
 * Resolve the deterministic immediately-preceding paid subscription for a
 * canonical Free subscription.
 *
 * Rule (every constraint must hold):
 * - same tenant;
 * - predecessor is non-Free (packageId != canonical Free package);
 * - predecessor carries a concrete periodStart + periodEnd;
 * - the Free subscription's creation (`createdAt`, falling back to
 *   `startedAt`) occurred WHILE the predecessor's period was current
 *   (`predecessor.periodStart <= free.createdAt <= predecessor.periodEnd`);
 * - the predecessor temporally precedes the Free in lifecycle order
 *   (its creation is not after the Free's creation);
 * - exactly ONE candidate satisfies all of the above — more than one is a
 *   conflicting lineage and is reported as ambiguous.
 */
export function resolvePaidLineage(
  free: SubscriptionLeanRecord,
  tenantSubscriptions: readonly SubscriptionLeanRecord[],
  freePackageId: Types.ObjectId,
): PaidLineage {
  if (!free.createdAt && !free.startedAt) {
    return { status: "none" };
  }
  const freeCreatedAt = (free.createdAt ?? free.startedAt) as Date;

  const containing = tenantSubscriptions.filter((candidate) => {
    if (String(candidate._id) === String(free._id)) return false;
    if (!candidate.packageId || candidate.packageId.equals(freePackageId)) {
      return false;
    }
    if (!(candidate.periodStart instanceof Date) || !(candidate.periodEnd instanceof Date)) {
      return false;
    }
    if (candidate.periodStart.getTime() > freeCreatedAt.getTime()) return false;
    if (candidate.periodEnd.getTime() < freeCreatedAt.getTime()) return false;
    return true;
  });

  if (containing.length === 0) return { status: "none" };
  if (containing.length > 1) return { status: "ambiguous" };

  const predecessor = containing[0];
  const predecessorCreatedAt = (predecessor.createdAt ?? predecessor.startedAt) as Date | undefined;
  if (!predecessorCreatedAt || predecessorCreatedAt.getTime() > freeCreatedAt.getTime()) {
    // A subscription that was created after the Free cannot be its
    // immediately-preceding lineage — treat as ambiguous rather than guessing.
    return { status: "ambiguous" };
  }

  return { status: "found", predecessor };
}

/**
 * The legacy already-repaired marker: a canonical Free record that was given
 * concrete period boundaries by the first repair run while its provider was
 * left pointing at Stripe with no provider subscription binding it.
 */
export function isAlreadyRepairedFree(subscription: SubscriptionLeanRecord): boolean {
  return (
    Boolean(subscription.periodStart) &&
    Boolean(subscription.periodEnd) &&
    subscription.provider === "stripe" &&
    !subscription.providerSubscriptionId
  );
}

/**
 * A canonical Free record that is a normal local entitlement already: concrete
 * period plus a local ("" / "local") provider and no provider subscription.
 */
function isCorrectLocalFree(subscription: SubscriptionLeanRecord): boolean {
  return (
    Boolean(subscription.periodStart) &&
    Boolean(subscription.periodEnd) &&
    (subscription.provider === "" || subscription.provider === "local") &&
    !subscription.providerSubscriptionId
  );
}

function keyFor(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function iso(date: Date | null | undefined): string | null {
  return date instanceof Date ? date.toISOString() : null;
}

function needsProviderNormalization(subscription: SubscriptionLeanRecord): boolean {
  if (subscription.providerSubscriptionId) return false;
  if (subscription.provider === "stripe") return true;
  return subscription.provider !== "" && subscription.provider !== "local";
}

function providerNormalizationSet(subscription: SubscriptionLeanRecord): Record<string, unknown> {
  const set: Record<string, unknown> = {
    provider: "local",
    providerSubscriptionId: "",
    providerPriceId: "",
    billingInterval: "monthly",
  };
  if (subscription.providerCustomerId) {
    set.providerCustomerId = subscription.providerCustomerId;
  }
  return set;
}

/**
 * CAS-safe provider predicate: legacy records may carry `provider: "stripe"`,
 * an empty string, or a missing field entirely. The exact pre-repair provider
 * must be matched so a concurrent mutation can never be silently overwritten.
 */
function providerFilter(value: string | undefined | null): Record<string, unknown> {
  if (value) return { provider: value };
  return { $or: [{ provider: "" }, { provider: { $exists: false } }] };
}

interface PlannedRepair {
  filter: Record<string, unknown>;
  set: Record<string, unknown>;
  repairedFromPaidPeriod: boolean;
  repairedLocalFree: boolean;
  repairedStartOnly: boolean;
  normalizeProvider: boolean;
  reconcile: boolean;
  targetPeriodStart: Date;
  targetPeriodEnd: Date;
}

export async function repairLegacyFreePeriods(
  options: RepairLegacyFreePeriodsOptions = {},
): Promise<RepairLegacyFreePeriodsReport> {
  const apply = options.apply === true;
  const includeRepaired = options.includeRepaired === true;
  const now = options.now ?? new Date();
  const tenantId = options.tenantId
    ? Types.ObjectId.createFromHexString(options.tenantId)
    : undefined;
  const afterId = options.afterId
    ? Types.ObjectId.createFromHexString(options.afterId)
    : undefined;

  let freePackage;
  try {
    freePackage = await PackageModel.findOne({
      code: "free",
      active: true,
      visibility: "public",
    }).select("_id").lean().exec();
  } catch {
    throw new RepairLegacyFreePeriodsError("LEGACY_FREE_READ_FAILED", null);
  }
  if (!freePackage) {
    throw new RepairLegacyFreePeriodsError("CANONICAL_FREE_PACKAGE_NOT_FOUND", null);
  }
  const freePackageId = freePackage._id as Types.ObjectId;

  const report: RepairLegacyFreePeriodsReport = {
    mode: apply ? "apply" : "dry-run",
    tenantFiltered: tenantId !== undefined,
    afterId: afterId?.toHexString() ?? null,
    includeRepaired,
    canonicalFreePackageId: String(freePackageId),
    examined: 0,
    eligible: 0,
    wouldRepair: 0,
    repaired: 0,
    repairedIds: [],
    repairedFromPaidPeriod: 0,
    repairedLocalFree: 0,
    repairedStartOnly: 0,
    normalizedProvider: 0,
    reconciledQueries: 0,
    reconciledOcr: 0,
    alreadyCorrect: 0,
    skippedNonFree: 0,
    skippedNonServiceable: 0,
    skippedPartialPeriod: 0,
    skippedNullTenant: 0,
    skippedAmbiguousLineage: 0,
    skippedConcurrentChange: 0,
    lastScannedId: null,
    details: [],
  };

  let subscriptions;
  try {
    subscriptions = await SubscriptionModel.find({
      ...(tenantId ? { tenantId } : {}),
      ...(afterId ? { _id: { $gt: afterId } } : {}),
    })
      .select(
        "_id tenantId packageId status periodStart periodEnd currentPeriodStart currentPeriodEnd createdAt startedAt provider providerSubscriptionId providerPriceId billingInterval providerCustomerId",
      )
      .sort({ _id: 1 })
      .lean()
      .exec();
  } catch {
    throw new RepairLegacyFreePeriodsError(
      "LEGACY_FREE_READ_FAILED",
      options.afterId ?? null,
    );
  }

  const reconciliation = new ReconciliationService(
    new MongoQuotaCounter(),
    new MongoEntitlementProvider(),
  );
  const counter = new MongoQuotaCounter();

  const tenantHistoryCache = new Map<string, Promise<SubscriptionLeanRecord[]>>();
  function loadTenantHistory(tenant: Types.ObjectId): Promise<SubscriptionLeanRecord[]> {
    const key = tenant.toHexString();
    const cached = tenantHistoryCache.get(key);
    if (cached) return cached;
    const loaded = SubscriptionModel.find({ tenantId: tenant })
      .select(
        "_id tenantId packageId status periodStart periodEnd currentPeriodStart currentPeriodEnd createdAt startedAt provider providerSubscriptionId providerPriceId billingInterval providerCustomerId",
      )
      .lean()
      .exec() as Promise<SubscriptionLeanRecord[]>;
    tenantHistoryCache.set(key, loaded);
    return loaded;
  }

  async function reconcileCounters(
    tenant: Types.ObjectId,
    periodStart: Date,
    periodEnd: Date,
    persist: boolean,
  ): Promise<{ queries: CounterPreview; ocr: CounterPreview }> {
    const tenantId = tenant.toHexString();
    const key = keyFor(periodStart);
    // The counter key is month-granular (YYYY-MM of the period start), so the
    // authoritative recount must cover the whole calendar month of that key —
    // not just the strict [periodStart, periodEnd) window. Usage consumed
    // earlier in the same month (before the retained period began) must still
    // count against the restored month quota.
    const monthStart = new Date(
      Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1),
    );
    const dimensions: EntitlementDimension[] = ["queriesPerMonth", "ocrPagesPerMonth"];
    const previews = {
      queries: { current: 0, authoritative: 0, raised: false },
      ocr: { current: 0, authoritative: 0, raised: false },
    } as { queries: CounterPreview; ocr: CounterPreview };
    for (const dimension of dimensions) {
      const authoritative = await reconciliation.countPeriodAuthoritative(
        tenantId,
        dimension,
        monthStart,
        monthEnd,
      );
      const current = await counter.getUsage(tenantId, dimension, key);
      const preview =
        dimension === "queriesPerMonth" ? previews.queries : previews.ocr;
      preview.current = current;
      preview.authoritative = authoritative;
      preview.raised = authoritative > current;
      if (persist && preview.raised) {
        await reconciliation.reconcilePeriodAtLeast(
          tenantId,
          dimension,
          monthStart,
          monthEnd,
        );
      }
    }
    return previews;
  }

  function pushDetail(detail: Omit<RepairDetail, "subscriptionId" | "tenantId">, subscription: SubscriptionLeanRecord): void {
    report.details.push({
      subscriptionId: String(subscription._id),
      tenantId: String(subscription.tenantId),
      ...detail,
    });
  }

  for (const subscription of subscriptions as SubscriptionLeanRecord[]) {
    report.examined += 1;
    report.lastScannedId = String(subscription._id);

    if (!subscription.tenantId) {
      report.skippedNullTenant += 1;
      pushDetail(
        {
          repairClass: "skipped",
          status: "skipped",
          currentPeriodStart: iso(subscription.periodStart),
          currentPeriodEnd: iso(subscription.periodEnd),
          proposedPeriodStart: null,
          proposedPeriodEnd: null,
          predecessorId: null,
          providerBefore: subscription.provider ?? "",
          providerAfter: subscription.provider ?? "",
          providerCustomerIdBefore: subscription.providerCustomerId ?? "",
          providerCustomerIdAfter: subscription.providerCustomerId ?? "",
          providerNormalized: false,
          counterReconciliationRequired: false,
          queries: null,
          ocr: null,
          skipReason: "null-tenant",
        },
        subscription,
      );
      continue;
    }
    if (
      !subscription.packageId ||
      !subscription.packageId.equals(freePackageId)
    ) {
      report.skippedNonFree += 1;
      continue;
    }
    if (!SERVICEABLE_STATUSES.has(subscription.status as never)) {
      report.skippedNonServiceable += 1;
      continue;
    }

    const hasStart = Boolean(subscription.periodStart);
    const hasEnd = Boolean(subscription.periodEnd);

    // ── Dispatch on repair shape ────────────────────────────────────────────
    if (hasStart && hasEnd) {
      if (isCorrectLocalFree(subscription)) {
        report.alreadyCorrect += 1;
        pushDetail(
          {
            repairClass: "alreadyCorrect",
            status: "alreadyCorrect",
            currentPeriodStart: iso(subscription.periodStart),
            currentPeriodEnd: iso(subscription.periodEnd),
            proposedPeriodStart: iso(subscription.periodStart),
            proposedPeriodEnd: iso(subscription.periodEnd),
            predecessorId: null,
            providerBefore: subscription.provider ?? "",
            providerAfter: subscription.provider ?? "",
            providerCustomerIdBefore: subscription.providerCustomerId ?? "",
            providerCustomerIdAfter: subscription.providerCustomerId ?? "",
            providerNormalized: false,
            counterReconciliationRequired: false,
            queries: null,
            ocr: null,
          },
          subscription,
        );
        continue;
      }
      if (subscription.providerSubscriptionId) {
        // A provider-linked Paid subscription (non-empty providerSubscriptionId)
        // is never normalized as Free — skip and report.
        report.skippedNonFree += 1;
        pushDetail(
          {
            repairClass: "skipped",
            status: "skipped",
            currentPeriodStart: iso(subscription.periodStart),
            currentPeriodEnd: iso(subscription.periodEnd),
            proposedPeriodStart: null,
            proposedPeriodEnd: null,
            predecessorId: null,
            providerBefore: subscription.provider ?? "",
            providerAfter: subscription.provider ?? "",
            providerCustomerIdBefore: subscription.providerCustomerId ?? "",
            providerCustomerIdAfter: subscription.providerCustomerId ?? "",
            providerNormalized: false,
            counterReconciliationRequired: false,
            queries: null,
            ocr: null,
            skipReason: "provider-linked-paid",
          },
          subscription,
        );
        continue;
      }
      if (!includeRepaired) {
        // Already-repaired records are only corrected in the explicit mode.
        report.alreadyCorrect += 1;
        pushDetail(
          {
            repairClass: "alreadyRepaired",
            status: "alreadyCorrect",
            currentPeriodStart: iso(subscription.periodStart),
            currentPeriodEnd: iso(subscription.periodEnd),
            proposedPeriodStart: null,
            proposedPeriodEnd: null,
            predecessorId: null,
            providerBefore: subscription.provider ?? "",
            providerAfter: subscription.provider ?? "",
            providerCustomerIdBefore: subscription.providerCustomerId ?? "",
            providerCustomerIdAfter: subscription.providerCustomerId ?? "",
            providerNormalized: false,
            counterReconciliationRequired: false,
            queries: null,
            ocr: null,
            skipReason: "include-repaired-disabled",
          },
          subscription,
        );
        continue;
      }

      // Already-repaired all-null record — correct from deterministic lineage.
      const lineage = resolvePaidLineage(
        subscription,
        await loadTenantHistory(subscription.tenantId),
        freePackageId,
      );
      if (lineage.status === "ambiguous") {
        report.skippedAmbiguousLineage += 1;
        pushDetail(
          {
            repairClass: "alreadyRepaired",
            status: "skipped",
            currentPeriodStart: iso(subscription.periodStart),
            currentPeriodEnd: iso(subscription.periodEnd),
            proposedPeriodStart: null,
            proposedPeriodEnd: null,
            predecessorId: null,
            providerBefore: subscription.provider ?? "",
            providerAfter: subscription.provider ?? "",
            providerCustomerIdBefore: subscription.providerCustomerId ?? "",
            providerCustomerIdAfter: subscription.providerCustomerId ?? "",
            providerNormalized: false,
            counterReconciliationRequired: false,
            queries: null,
            ocr: null,
            skipReason: "ambiguous-lineage",
          },
          subscription,
        );
        continue;
      }
      if (lineage.status === "found") {
        const predecessor = lineage.predecessor as SubscriptionLeanRecord;
        const targetStart = predecessor.periodStart as Date;
        const targetEnd = predecessor.periodEnd as Date;
        const periodChanged =
          targetStart.getTime() !== subscription.periodStart!.getTime() ||
          targetEnd.getTime() !== subscription.periodEnd!.getTime();
        const normalizeProvider = needsProviderNormalization(subscription);
        const customerIdAfter = subscription.providerCustomerId
          ? subscription.providerCustomerId
          : predecessor.providerCustomerId ?? "";

        if (!periodChanged && !normalizeProvider) {
          report.alreadyCorrect += 1;
          pushDetail(
            {
              repairClass: "alreadyRepaired",
              status: "alreadyCorrect",
              currentPeriodStart: iso(subscription.periodStart),
              currentPeriodEnd: iso(subscription.periodEnd),
              proposedPeriodStart: iso(subscription.periodStart),
              proposedPeriodEnd: iso(subscription.periodEnd),
              predecessorId: String(predecessor._id),
              providerBefore: subscription.provider ?? "",
              providerAfter: subscription.provider ?? "",
              providerCustomerIdBefore: subscription.providerCustomerId ?? "",
              providerCustomerIdAfter: subscription.providerCustomerId ?? "",
              providerNormalized: false,
              counterReconciliationRequired: false,
              queries: null,
              ocr: null,
            },
            subscription,
          );
          continue;
        }

        const set: Record<string, unknown> = {
          ...(periodChanged
            ? {
                periodStart: targetStart,
                periodEnd: targetEnd,
                currentPeriodStart: targetStart,
                currentPeriodEnd: targetEnd,
              }
            : {}),
          ...(normalizeProvider ? providerNormalizationSet(subscription) : {}),
        };
        if (customerIdAfter !== subscription.providerCustomerId) {
          set.providerCustomerId = customerIdAfter;
        }

        const plan: PlannedRepair = {
          filter: {
            periodStart: subscription.periodStart,
            periodEnd: subscription.periodEnd,
            ...providerFilter(subscription.provider),
            providerSubscriptionId: subscription.providerSubscriptionId ?? "",
            providerCustomerId: subscription.providerCustomerId ?? "",
          },
          set,
          repairedFromPaidPeriod: periodChanged,
          repairedLocalFree: false,
          repairedStartOnly: false,
          normalizeProvider,
          reconcile: periodChanged,
          targetPeriodStart: targetStart,
          targetPeriodEnd: targetEnd,
        };
        report.eligible += 1;

        const previews = periodChanged
          ? await reconcileCounters(
              subscription.tenantId,
              targetStart,
              targetEnd,
              false,
            )
          : null;

        if (!apply) {
          report.wouldRepair += 1;
          if (plan.repairedFromPaidPeriod) report.repairedFromPaidPeriod += 1;
          if (plan.normalizeProvider) report.normalizedProvider += 1;
          if (previews?.queries.raised) report.reconciledQueries += 1;
          if (previews?.ocr.raised) report.reconciledOcr += 1;
          pushDetail(
            {
              repairClass: "alreadyRepaired",
              status: "wouldRepair",
              currentPeriodStart: iso(subscription.periodStart),
              currentPeriodEnd: iso(subscription.periodEnd),
              proposedPeriodStart: iso(targetStart),
              proposedPeriodEnd: iso(targetEnd),
              predecessorId: String(predecessor._id),
              providerBefore: subscription.provider ?? "",
              providerAfter: normalizeProvider ? "local" : subscription.provider ?? "",
              providerCustomerIdBefore: subscription.providerCustomerId ?? "",
              providerCustomerIdAfter: customerIdAfter,
              providerNormalized: normalizeProvider,
              counterReconciliationRequired: plan.reconcile,
              queries: previews?.queries ?? null,
              ocr: previews?.ocr ?? null,
            },
            subscription,
          );
          continue;
        }

        const updated = await persistRepair(subscription, plan);
        if (!updated) {
          report.skippedConcurrentChange += 1;
          continue;
        }
        report.repaired += 1;
        report.repairedIds.push(String(subscription._id));
        if (plan.repairedFromPaidPeriod) report.repairedFromPaidPeriod += 1;
        if (plan.normalizeProvider) report.normalizedProvider += 1;

        const appliedPreviews = plan.reconcile
          ? await reconcileCounters(subscription.tenantId, targetStart, targetEnd, true)
          : null;
        if (appliedPreviews?.queries.raised) report.reconciledQueries += 1;
        if (appliedPreviews?.ocr.raised) report.reconciledOcr += 1;
        pushDetail(
          {
            repairClass: "alreadyRepaired",
            status: "repaired",
            currentPeriodStart: iso(subscription.periodStart),
            currentPeriodEnd: iso(subscription.periodEnd),
            proposedPeriodStart: iso(targetStart),
            proposedPeriodEnd: iso(targetEnd),
            predecessorId: String(predecessor._id),
            providerBefore: subscription.provider ?? "",
            providerAfter: normalizeProvider ? "local" : subscription.provider ?? "",
            providerCustomerIdBefore: subscription.providerCustomerId ?? "",
            providerCustomerIdAfter: customerIdAfter,
            providerNormalized: normalizeProvider,
            counterReconciliationRequired: plan.reconcile,
            queries: appliedPreviews?.queries ?? null,
            ocr: appliedPreviews?.ocr ?? null,
          },
          subscription,
        );
        continue;
      }

      // Lineage "none": an already-repaired record with no paid predecessor.
      // Keep its existing period; normalize the provider (bug 2).
      const normalizeProvider = needsProviderNormalization(subscription);
      if (!normalizeProvider) {
        report.alreadyCorrect += 1;
        pushDetail(
          {
            repairClass: "alreadyRepaired",
            status: "alreadyCorrect",
            currentPeriodStart: iso(subscription.periodStart),
            currentPeriodEnd: iso(subscription.periodEnd),
            proposedPeriodStart: iso(subscription.periodStart),
            proposedPeriodEnd: iso(subscription.periodEnd),
            predecessorId: null,
            providerBefore: subscription.provider ?? "",
            providerAfter: subscription.provider ?? "",
            providerCustomerIdBefore: subscription.providerCustomerId ?? "",
            providerCustomerIdAfter: subscription.providerCustomerId ?? "",
            providerNormalized: false,
            counterReconciliationRequired: false,
            queries: null,
            ocr: null,
          },
          subscription,
        );
        continue;
      }

      report.eligible += 1;
      const plan: PlannedRepair = {
        filter: {
          periodStart: subscription.periodStart,
          periodEnd: subscription.periodEnd,
          ...providerFilter(subscription.provider),
          providerSubscriptionId: subscription.providerSubscriptionId ?? "",
          providerCustomerId: subscription.providerCustomerId ?? "",
        },
        set: providerNormalizationSet(subscription),
        repairedFromPaidPeriod: false,
        repairedLocalFree: false,
        repairedStartOnly: false,
        normalizeProvider: true,
        reconcile: false,
        targetPeriodStart: subscription.periodStart as Date,
        targetPeriodEnd: subscription.periodEnd as Date,
      };

      if (!apply) {
        report.wouldRepair += 1;
        report.normalizedProvider += 1;
        pushDetail(
          {
            repairClass: "alreadyRepaired",
            status: "wouldRepair",
            currentPeriodStart: iso(subscription.periodStart),
            currentPeriodEnd: iso(subscription.periodEnd),
            proposedPeriodStart: iso(subscription.periodStart),
            proposedPeriodEnd: iso(subscription.periodEnd),
            predecessorId: null,
            providerBefore: subscription.provider ?? "",
            providerAfter: "local",
            providerCustomerIdBefore: subscription.providerCustomerId ?? "",
            providerCustomerIdAfter: subscription.providerCustomerId ?? "",
            providerNormalized: true,
            counterReconciliationRequired: false,
            queries: null,
            ocr: null,
          },
          subscription,
        );
        continue;
      }

      const updated = await persistRepair(subscription, plan);
      if (!updated) {
        report.skippedConcurrentChange += 1;
        continue;
      }
      report.repaired += 1;
      report.repairedIds.push(String(subscription._id));
      report.normalizedProvider += 1;
      pushDetail(
        {
          repairClass: "alreadyRepaired",
          status: "repaired",
          currentPeriodStart: iso(subscription.periodStart),
          currentPeriodEnd: iso(subscription.periodEnd),
          proposedPeriodStart: iso(subscription.periodStart),
          proposedPeriodEnd: iso(subscription.periodEnd),
          predecessorId: null,
          providerBefore: subscription.provider ?? "",
          providerAfter: "local",
          providerCustomerIdBefore: subscription.providerCustomerId ?? "",
          providerCustomerIdAfter: subscription.providerCustomerId ?? "",
          providerNormalized: true,
          counterReconciliationRequired: false,
          queries: null,
          ocr: null,
        },
        subscription,
      );
      continue;
    }
    if (!hasStart && hasEnd) {
      // No authoritative start boundary — never invent one.
      report.skippedPartialPeriod += 1;
      pushDetail(
        {
          repairClass: "skipped",
          status: "skipped",
          currentPeriodStart: null,
          currentPeriodEnd: iso(subscription.periodEnd),
          proposedPeriodStart: null,
          proposedPeriodEnd: null,
          predecessorId: null,
          providerBefore: subscription.provider ?? "",
          providerAfter: subscription.provider ?? "",
          providerCustomerIdBefore: subscription.providerCustomerId ?? "",
          providerCustomerIdAfter: subscription.providerCustomerId ?? "",
          providerNormalized: false,
          counterReconciliationRequired: false,
          queries: null,
          ocr: null,
          skipReason: "partial-period",
        },
        subscription,
      );
      continue;
    }

    // ── Start-only: periodStart present, periodEnd null ─────────────────────
    // The start is authoritative — preserve it exactly and derive the end one
    // calendar month later. Paid-predecessor recovery is never applied.
    if (hasStart) {
      const targetStart = subscription.periodStart as Date;
      const targetEnd = addCalendarMonths(targetStart, 1);
      const normalizeProvider = needsProviderNormalization(subscription);
      const customerIdAfter = subscription.providerCustomerId ?? "";
      const plan: PlannedRepair = {
        filter: {
          periodStart: targetStart,
          periodEnd: null,
          ...providerFilter(subscription.provider),
          providerSubscriptionId: subscription.providerSubscriptionId ?? "",
          providerCustomerId: subscription.providerCustomerId ?? "",
        },
        set: {
          periodStart: targetStart,
          periodEnd: targetEnd,
          currentPeriodStart: targetStart,
          currentPeriodEnd: targetEnd,
          ...(normalizeProvider ? providerNormalizationSet(subscription) : {}),
        },
        repairedFromPaidPeriod: false,
        repairedLocalFree: false,
        repairedStartOnly: true,
        normalizeProvider,
        reconcile: false,
        targetPeriodStart: targetStart,
        targetPeriodEnd: targetEnd,
      };
      report.eligible += 1;

      if (!apply) {
        report.wouldRepair += 1;
        report.repairedStartOnly += 1;
        if (normalizeProvider) report.normalizedProvider += 1;
        pushDetail(
          {
            repairClass: "startOnly",
            status: "wouldRepair",
            currentPeriodStart: iso(subscription.periodStart),
            currentPeriodEnd: null,
            proposedPeriodStart: iso(targetStart),
            proposedPeriodEnd: iso(targetEnd),
            predecessorId: null,
            providerBefore: subscription.provider ?? "",
            providerAfter: normalizeProvider ? "local" : subscription.provider ?? "",
            providerCustomerIdBefore: subscription.providerCustomerId ?? "",
            providerCustomerIdAfter: customerIdAfter,
            providerNormalized: normalizeProvider,
            counterReconciliationRequired: false,
            queries: null,
            ocr: null,
          },
          subscription,
        );
        continue;
      }

      const updated = await persistRepair(subscription, plan);
      if (!updated) {
        report.skippedConcurrentChange += 1;
        continue;
      }
      report.repaired += 1;
      report.repairedIds.push(String(subscription._id));
      report.repairedStartOnly += 1;
      if (normalizeProvider) report.normalizedProvider += 1;
      pushDetail(
        {
          repairClass: "startOnly",
          status: "repaired",
          currentPeriodStart: iso(subscription.periodStart),
          currentPeriodEnd: null,
          proposedPeriodStart: iso(targetStart),
          proposedPeriodEnd: iso(targetEnd),
          predecessorId: null,
          providerBefore: subscription.provider ?? "",
          providerAfter: normalizeProvider ? "local" : subscription.provider ?? "",
          providerCustomerIdBefore: subscription.providerCustomerId ?? "",
          providerCustomerIdAfter: customerIdAfter,
          providerNormalized: normalizeProvider,
          counterReconciliationRequired: false,
          queries: null,
          ocr: null,
        },
        subscription,
      );
      continue;
    }

    // ── All-null: periodStart null, periodEnd null ──────────────────────────
    const lineage = resolvePaidLineage(
      subscription,
      await loadTenantHistory(subscription.tenantId),
      freePackageId,
    );
    if (lineage.status === "ambiguous") {
      report.skippedAmbiguousLineage += 1;
      pushDetail(
        {
          repairClass: "allNull",
          status: "skipped",
          currentPeriodStart: null,
          currentPeriodEnd: null,
          proposedPeriodStart: null,
          proposedPeriodEnd: null,
          predecessorId: null,
          providerBefore: subscription.provider ?? "",
          providerAfter: subscription.provider ?? "",
          providerCustomerIdBefore: subscription.providerCustomerId ?? "",
          providerCustomerIdAfter: subscription.providerCustomerId ?? "",
          providerNormalized: false,
          counterReconciliationRequired: false,
          queries: null,
          ocr: null,
          skipReason: "ambiguous-lineage",
        },
        subscription,
      );
      continue;
    }

    let targetStart: Date;
    let targetEnd: Date;
    let repairedFromPaidPeriod = false;
    let predecessorId: string | null = null;
    let customerIdAfter = subscription.providerCustomerId ?? "";

    if (lineage.status === "found") {
      const predecessor = lineage.predecessor as SubscriptionLeanRecord;
      targetStart = predecessor.periodStart as Date;
      targetEnd = predecessor.periodEnd as Date;
      repairedFromPaidPeriod = true;
      predecessorId = String(predecessor._id);
      if (!customerIdAfter) customerIdAfter = predecessor.providerCustomerId ?? "";
    } else {
      // Native Free from registration — normal local Free period semantics.
      const local = computeLocalFreePeriod(now);
      targetStart = local.periodStart;
      targetEnd = local.periodEnd;
    }

    const normalizeProvider = needsProviderNormalization(subscription);
    const plan: PlannedRepair = {
      filter: {
        periodStart: null,
        periodEnd: null,
        ...providerFilter(subscription.provider),
        providerSubscriptionId: subscription.providerSubscriptionId ?? "",
        providerCustomerId: subscription.providerCustomerId ?? "",
      },
      set: {
        periodStart: targetStart,
        periodEnd: targetEnd,
        currentPeriodStart: targetStart,
        currentPeriodEnd: targetEnd,
        ...(normalizeProvider ? providerNormalizationSet(subscription) : {}),
        ...(customerIdAfter !== subscription.providerCustomerId
          ? { providerCustomerId: customerIdAfter }
          : {}),
      },
      repairedFromPaidPeriod,
      repairedLocalFree: !repairedFromPaidPeriod,
      repairedStartOnly: false,
      normalizeProvider,
      reconcile: repairedFromPaidPeriod,
      targetPeriodStart: targetStart,
      targetPeriodEnd: targetEnd,
    };
    report.eligible += 1;

    const previews = plan.reconcile
      ? await reconcileCounters(subscription.tenantId, targetStart, targetEnd, false)
      : null;

    if (!apply) {
      report.wouldRepair += 1;
      if (plan.repairedFromPaidPeriod) report.repairedFromPaidPeriod += 1;
      if (plan.repairedLocalFree) report.repairedLocalFree += 1;
      if (plan.normalizeProvider) report.normalizedProvider += 1;
      if (previews?.queries.raised) report.reconciledQueries += 1;
      if (previews?.ocr.raised) report.reconciledOcr += 1;
      pushDetail(
        {
          repairClass: "allNull",
          status: "wouldRepair",
          currentPeriodStart: null,
          currentPeriodEnd: null,
          proposedPeriodStart: iso(targetStart),
          proposedPeriodEnd: iso(targetEnd),
          predecessorId,
          providerBefore: subscription.provider ?? "",
          providerAfter: normalizeProvider ? "local" : subscription.provider ?? "",
          providerCustomerIdBefore: subscription.providerCustomerId ?? "",
          providerCustomerIdAfter: customerIdAfter,
          providerNormalized: normalizeProvider,
          counterReconciliationRequired: plan.reconcile,
          queries: previews?.queries ?? null,
          ocr: previews?.ocr ?? null,
        },
        subscription,
      );
      continue;
    }

    const updated = await persistRepair(subscription, plan);
    if (!updated) {
      report.skippedConcurrentChange += 1;
      continue;
    }
    report.repaired += 1;
    report.repairedIds.push(String(subscription._id));
    if (plan.repairedFromPaidPeriod) report.repairedFromPaidPeriod += 1;
    if (plan.repairedLocalFree) report.repairedLocalFree += 1;
    if (plan.normalizeProvider) report.normalizedProvider += 1;

    const appliedPreviews = plan.reconcile
      ? await reconcileCounters(subscription.tenantId, targetStart, targetEnd, true)
      : null;
    if (appliedPreviews?.queries.raised) report.reconciledQueries += 1;
    if (appliedPreviews?.ocr.raised) report.reconciledOcr += 1;
    pushDetail(
      {
        repairClass: "allNull",
        status: "repaired",
        currentPeriodStart: null,
        currentPeriodEnd: null,
        proposedPeriodStart: iso(targetStart),
        proposedPeriodEnd: iso(targetEnd),
        predecessorId,
        providerBefore: subscription.provider ?? "",
        providerAfter: normalizeProvider ? "local" : subscription.provider ?? "",
        providerCustomerIdBefore: subscription.providerCustomerId ?? "",
        providerCustomerIdAfter: customerIdAfter,
        providerNormalized: normalizeProvider,
        counterReconciliationRequired: plan.reconcile,
        queries: appliedPreviews?.queries ?? null,
        ocr: appliedPreviews?.ocr ?? null,
      },
      subscription,
    );
  }

  return report;
}

async function persistRepair(
  subscription: SubscriptionLeanRecord,
  plan: PlannedRepair,
): Promise<boolean> {
  try {
    const updated = await SubscriptionModel.findOneAndUpdate(
      {
        _id: subscription._id,
        tenantId: subscription.tenantId,
        packageId: subscription.packageId,
        status: { $in: [...SERVICEABLE_STATUSES] },
        ...plan.filter,
      },
      { $set: plan.set },
      { returnDocument: "after" },
    ).exec();
    return updated !== null;
  } catch {
    throw new RepairLegacyFreePeriodsError(
      "LEGACY_FREE_WRITE_FAILED",
      String(subscription._id),
    );
  }
}
