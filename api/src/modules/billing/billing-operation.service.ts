import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import {
  BILLING_CURRENCY_MISMATCH,
  BILLING_IDEMPOTENCY_KEY_REUSED, BILLING_OPERATION_ALREADY_PENDING,
  BILLING_OPERATION_CONFLICT, BILLING_OPERATION_NOT_FOUND, BILLING_PREVIEW_STALE,
  BILLING_PROVIDER_OWNERSHIP_MISMATCH,
  BILLING_PROVIDER_UNAVAILABLE, BILLING_SUBSCRIPTION_CHANGED,
  BILLING_OPERATION_NOT_ALLOWED,
} from "../../common/errors/errorCodes.js";
import { getAuditWriter } from "../../common/observability/index.js";
import BillingOperationModel, { type BillingOperationConflictGroup, type BillingOperationDocument, type BillingOperationType } from "../../db/models/billingOperation.model.js";
import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";

const PENDING = ["REQUESTED", "PROVIDER_PENDING", "RETRY_PENDING"] as const;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

export interface StartBillingOperationInput {
  tenantId: string; actor: OperationAuthorizationContext; operationType: BillingOperationType;
  idempotencyKey: string; normalizedRequest: Record<string, unknown>; subscriptionId?: string;
  provider: string; targetPackageId?: string; packageVersionId?: string;
  expectedSubscriptionRevision?: number; previewReference?: string; previewExpiresAt?: Date;
  cancellationType?: "IMMEDIATE" | "PERIOD_END"; effectiveAt?: Date | null;
}

export interface StartedBillingOperation {
  operation: BillingOperationDocument; replayed: boolean;
}

export function canonicalBillingRequest(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function fingerprintBillingRequest(value: unknown): string {
  return createHash("sha256").update(canonicalBillingRequest(value)).digest("hex");
}

export function hashIdempotencyKey(value: string): string {
  if (!value || value.length > 255) throw new AppError(409, BILLING_OPERATION_CONFLICT, "Invalid billing idempotency key");
  return createHash("sha256").update(value).digest("hex");
}

export class BillingOperationService {
  async execute<T extends { operationReference?: string; state?: { id?: string }; effectiveAt?: Date; cancellationType?: "IMMEDIATE" | "PERIOD_END" }>(input: StartBillingOperationInput, mutation: (operation: BillingOperationDocument) => Promise<T>): Promise<{ operation: BillingOperationDocument; result: T | null; replayed: boolean }> {
    const started = await this.begin(input);
    if (started.replayed) return { operation: started.operation, result: null, replayed: true };
    return this.invokeProvider(await this.markProviderPending(started.operation), input.tenantId, mutation);
  }

  async resume<T extends { operationReference?: string; state?: { id?: string }; effectiveAt?: Date; cancellationType?: "IMMEDIATE" | "PERIOD_END" }>(operationId: string, tenantId: string, mutation: (operation: BillingOperationDocument) => Promise<T>): Promise<{ operation: BillingOperationDocument; result: T; replayed: false }> {
    const operation = await this.findForTenant(operationId, tenantId);
    if (operation.status !== "RETRY_PENDING") throw new AppError(409, BILLING_OPERATION_CONFLICT, "Billing operation is not retryable");
    return this.invokeProvider(await this.markProviderPending(operation), tenantId, mutation);
  }

  async begin(input: StartBillingOperationInput): Promise<StartedBillingOperation> {
    const tenantId = new Types.ObjectId(input.tenantId);
    const idempotencyKeyHash = hashIdempotencyKey(input.idempotencyKey);
    const requestFingerprint = fingerprintBillingRequest(input.normalizedRequest);
    const conflictGroup = conflictGroupFor(input.operationType);
    const prior = await BillingOperationModel.findOne({ tenantId, idempotencyKeyHash }).select("+idempotencyKeyHash +requestFingerprint").exec();
    if (prior) return this.replayOrConflict(prior, requestFingerprint, input.actor);

    if (input.subscriptionId && conflictGroup) {
      const incompatible = await BillingOperationModel.findOne({ tenantId, subscriptionId: new Types.ObjectId(input.subscriptionId), conflictGroup, status: { $in: PENDING } }).exec();
      if (incompatible) throw new AppError(409, BILLING_OPERATION_ALREADY_PENDING, "A billing operation is already pending");
    }

    try {
      const operation = await BillingOperationModel.create({
        tenantId, actorId: new Types.ObjectId(input.actor.actorId), actorRole: input.actor.actorRole,
        operationType: input.operationType, status: "REQUESTED", conflictGroup,
        subscriptionId: input.subscriptionId ? new Types.ObjectId(input.subscriptionId) : null,
        targetPackageId: input.targetPackageId ? new Types.ObjectId(input.targetPackageId) : null,
        packageVersionId: input.packageVersionId ? new Types.ObjectId(input.packageVersionId) : null,
        expectedSubscriptionRevision: input.expectedSubscriptionRevision ?? null,
        requestFingerprint, idempotencyKeyHash, provider: input.provider,
        previewReference: input.previewReference ?? "", previewExpiresAt: input.previewExpiresAt ?? null,
        cancellationType: input.cancellationType ?? null, effectiveAt: input.effectiveAt ?? null,
        traceId: input.actor.traceId ?? "", requestId: input.actor.requestId ?? "",
      });
      this.audit("BILLING_OPERATION_CREATED", operation, input.actor);
      return { operation, replayed: false };
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const raced = await BillingOperationModel.findOne({ tenantId, idempotencyKeyHash }).select("+idempotencyKeyHash +requestFingerprint").exec();
      if (raced) return this.replayOrConflict(raced, requestFingerprint, input.actor);
      throw new AppError(409, BILLING_OPERATION_ALREADY_PENDING, "A billing operation is already pending");
    }
  }

  async markProviderPending(operation: BillingOperationDocument): Promise<BillingOperationDocument> {
    const updated = await BillingOperationModel.findOneAndUpdate(
      { _id: operation._id, tenantId: operation.tenantId, status: { $in: ["REQUESTED", "RETRY_PENDING"] }, revision: operation.revision },
      { $set: { status: "PROVIDER_PENDING", providerRequestedAt: new Date() }, $inc: { revision: 1 } }, { returnDocument: "after" },
    ).exec();
    if (!updated) throw new AppError(409, BILLING_OPERATION_CONFLICT, "Billing operation changed concurrently");
    this.auditPersisted("BILLING_PROVIDER_MUTATION_REQUESTED", updated);
    return updated;
  }

  async recordProviderResult(
    operationId: string,
    tenantId: string,
    result: {
      operationReference?: string;
      objectReference?: string;
      effectiveAt?: Date;
      cancellationType?: "IMMEDIATE" | "PERIOD_END";
    },
  ): Promise<void> {
    const update = await BillingOperationModel.updateOne(
      { _id: operationId, tenantId: new Types.ObjectId(tenantId), status: "PROVIDER_PENDING" },
      {
        $set: {
          providerOperationReference: result.operationReference ?? "",
          providerObjectReference: result.objectReference ?? "",
          ...(result.effectiveAt !== undefined ? { effectiveAt: result.effectiveAt } : {}),
          ...(result.cancellationType !== undefined ? { cancellationType: result.cancellationType } : {}),
        },
        $inc: { revision: 1 },
      },
    );
    if (update.matchedCount !== 1) throw new AppError(409, BILLING_OPERATION_CONFLICT, "Provider result could not be persisted");
  }

  async markRetryPending(operationId: string, tenantId: string, failureCode: string, nextRetryAt: Date): Promise<void> {
    const operation = await BillingOperationModel.findOneAndUpdate({ _id: operationId, tenantId: new Types.ObjectId(tenantId), status: "PROVIDER_PENDING" }, {
      $set: { status: "RETRY_PENDING", failureCode, nextRetryAt }, $inc: { retryCount: 1, revision: 1 },
    }, { returnDocument: "after" }).exec();
    if (!operation) throw new AppError(409, BILLING_OPERATION_CONFLICT, "Billing operation changed concurrently");
    this.auditPersisted("BILLING_PROVIDER_MUTATION_FAILED", operation);
  }

  async confirm(operationId: string, tenantId: string, providerEventId?: string): Promise<void> {
    const set: Record<string, unknown> = { status: "CONFIRMED", confirmedAt: new Date(), failureCode: "", nextRetryAt: null };
    const update: Record<string, unknown> = { $set: set, $inc: { revision: 1 } };
    if (providerEventId) update.$addToSet = { confirmingProviderEventIds: providerEventId };
    const operation = await BillingOperationModel.findOneAndUpdate({ _id: operationId, tenantId: new Types.ObjectId(tenantId), status: { $in: PENDING } }, update, { returnDocument: "after" }).exec();
    if (operation) this.auditPersisted("BILLING_OPERATION_CONFIRMED", operation);
  }

  async fail(operationId: string, tenantId: string, failureCode: string): Promise<void> {
    const operation = await BillingOperationModel.findOneAndUpdate({ _id: operationId, tenantId: new Types.ObjectId(tenantId), status: { $in: PENDING } }, {
      $set: { status: "FAILED", failedAt: new Date(), failureCode, nextRetryAt: null }, $inc: { revision: 1 },
    }, { returnDocument: "after" }).exec();
    if (operation) this.auditPersisted("BILLING_PROVIDER_MUTATION_FAILED", operation);
  }

  async supersede(operationId: string, tenantId: string): Promise<void> {
    await BillingOperationModel.updateOne({ _id: operationId, tenantId: new Types.ObjectId(tenantId), status: { $in: PENDING } }, { $set: { status: "SUPERSEDED", nextRetryAt: null }, $inc: { revision: 1 } });
  }

  async findForTenant(operationId: string, tenantId: string): Promise<BillingOperationDocument> {
    const operation = Types.ObjectId.isValid(operationId)
      ? await BillingOperationModel.findOne({ _id: operationId, tenantId: new Types.ObjectId(tenantId) }).exec() : null;
    if (!operation) throw new AppError(404, BILLING_OPERATION_NOT_FOUND, "Billing operation not found");
    return operation;
  }

  private replayOrConflict(prior: BillingOperationDocument, fingerprint: string, actor: OperationAuthorizationContext): StartedBillingOperation {
    if (prior.requestFingerprint !== fingerprint || !HASH_PATTERN.test(prior.requestFingerprint)) {
      this.audit("BILLING_OPERATION_CONFLICT", prior, actor);
      throw new AppError(409, BILLING_IDEMPOTENCY_KEY_REUSED, "Billing idempotency key was reused for another request");
    }
    this.audit("BILLING_OPERATION_REPLAYED", prior, actor);
    return { operation: prior, replayed: true };
  }

  private async invokeProvider<T extends { operationReference?: string; state?: { id?: string }; effectiveAt?: Date; cancellationType?: "IMMEDIATE" | "PERIOD_END" }>(operation: BillingOperationDocument, tenantId: string, mutation: (operation: BillingOperationDocument) => Promise<T>): Promise<{ operation: BillingOperationDocument; result: T; replayed: false }> {
    try {
      const result = await mutation(operation);
      await this.recordProviderResult(String(operation._id), tenantId, {
        operationReference: result.operationReference,
        objectReference: result.state?.id,
        effectiveAt: result.effectiveAt,
        cancellationType: result.cancellationType,
      });
      return { operation, result, replayed: false };
    } catch (error) {
      const mapped = mapBillingProviderError(error);
      if (mapped.statusCode >= 500) {
        await this.markRetryPending(String(operation._id), tenantId, mapped.code, new Date(Date.now() + 60_000));
      } else {
        await this.fail(String(operation._id), tenantId, mapped.code);
      }
      throw mapped;
    }
  }

  private audit(action: "BILLING_OPERATION_CREATED" | "BILLING_OPERATION_REPLAYED" | "BILLING_OPERATION_CONFLICT", operation: BillingOperationDocument, actor: OperationAuthorizationContext): void {
    void getAuditWriter().write({ action, resourceType: "BillingOperation", resourceId: String(operation._id), tenantId: String(operation.tenantId),
      actorId: actor.actorId, actorEmail: actor.actorEmail, actorRole: actor.actorRole,
      changes: { operationType: operation.operationType, status: operation.status } });
  }

  private auditPersisted(action: "BILLING_PROVIDER_MUTATION_REQUESTED" | "BILLING_PROVIDER_MUTATION_FAILED" | "BILLING_OPERATION_CONFIRMED", operation: BillingOperationDocument): void {
    void getAuditWriter().write({ action, resourceType: "BillingOperation", resourceId: String(operation._id), tenantId: String(operation.tenantId),
      actorId: String(operation.actorId), actorRole: operation.actorRole === "SUPER_ADMIN" || operation.actorRole === "COMPANY_ADMIN" || operation.actorRole === "EMPLOYEE" ? operation.actorRole : null,
      changes: { operationType: operation.operationType, status: operation.status, failureCode: operation.failureCode || undefined } });
  }
}

export interface PreviewValidationInput {
  now: Date; expiresAt: Date; expectedSubscriptionRevision: number; actualSubscriptionRevision: number;
  expectedPackageVersionId: string; actualPackageVersionId: string; expectedCurrency: string; actualCurrency: string;
  targetAvailable: boolean;
}
export function validateBillingPreview(input: PreviewValidationInput): void {
  if (input.expiresAt.getTime() <= input.now.getTime() || !input.targetAvailable) throw new AppError(409, BILLING_PREVIEW_STALE, "Billing preview is stale");
  if (input.expectedSubscriptionRevision !== input.actualSubscriptionRevision || input.expectedPackageVersionId !== input.actualPackageVersionId || input.expectedCurrency.toUpperCase() !== input.actualCurrency.toUpperCase()) {
    throw new AppError(409, BILLING_SUBSCRIPTION_CHANGED, "Subscription changed after preview");
  }
}

export function mapBillingProviderError(_error: unknown): AppError {
  if (_error instanceof AppError) return _error;
  const message = _error instanceof Error ? _error.message : "";
  if (/ownership mismatch/i.test(message)) return new AppError(409, BILLING_PROVIDER_OWNERSHIP_MISMATCH, "Billing provider ownership validation failed");
  if (/currency mismatch/i.test(message)) return new AppError(409, BILLING_CURRENCY_MISMATCH, "Billing currency does not match the requested operation");
  if (/already effective|new checkout is required|not allowed|required/i.test(message)) return new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "Billing operation is not allowed");
  return new AppError(503, BILLING_PROVIDER_UNAVAILABLE, "Billing provider is temporarily unavailable");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key, item]) => item !== undefined && !VOLATILE_FINGERPRINT_KEYS.has(key)).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonicalize(item)]));
  if (typeof value === "number" && !Number.isFinite(value)) throw new AppError(400, BILLING_OPERATION_CONFLICT, "Billing request contains a non-finite number");
  return value;
}
const VOLATILE_FINGERPRINT_KEYS = new Set(["traceId", "requestId", "requestedAt", "timestamp", "uiLabel", "providerMetadata", "secret"]);
function isDuplicateKey(error: unknown): boolean { return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 11000; }
export function conflictGroupFor(operationType: BillingOperationType): BillingOperationConflictGroup | null {
  return operationType === "REFUND" ? null : "SUBSCRIPTION_MUTATION";
}
