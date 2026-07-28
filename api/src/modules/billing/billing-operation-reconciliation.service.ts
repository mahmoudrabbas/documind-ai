import { Types } from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import { BILLING_PROVIDER_OWNERSHIP_MISMATCH } from "../../common/errors/errorCodes.js";
import BillingOperationModel from "../../db/models/billingOperation.model.js";
import { BillingOperationService } from "./billing-operation.service.js";

export interface BillingOperationReconciliationInput {
  tenantId: string; operationReference?: string; providerOperationReference?: string;
  providerObjectReference?: string; providerEventId: string; outcome: "CONFIRMED" | "FAILED" | "RETRY_PENDING";
  failureCode?: string;
}

/** Reusable webhook reconciliation primitive. It never orders by event ID. */
export async function reconcileBillingOperation(input: BillingOperationReconciliationInput): Promise<{ matched: boolean; operationId: string | null }> {
  const referenceQuery: Record<string, unknown>[] = [];
  if (input.operationReference && Types.ObjectId.isValid(input.operationReference)) referenceQuery.push({ _id: new Types.ObjectId(input.operationReference) });
  if (input.providerOperationReference) referenceQuery.push({ providerOperationReference: input.providerOperationReference });
  if (input.providerObjectReference) referenceQuery.push({ providerObjectReference: input.providerObjectReference });
  if (!referenceQuery.length) return { matched: false, operationId: null };

  const operation = await BillingOperationModel.findOne({ $or: referenceQuery, status: { $in: ["REQUESTED", "PROVIDER_PENDING", "RETRY_PENDING"] } }).exec();
  if (!operation) return { matched: false, operationId: null };
  if (String(operation.tenantId) !== input.tenantId) throw new AppError(409, BILLING_PROVIDER_OWNERSHIP_MISMATCH, "Provider billing operation ownership mismatch");
  const service = new BillingOperationService();
  if (input.outcome === "CONFIRMED") await service.confirm(String(operation._id), input.tenantId, input.providerEventId);
  else if (input.outcome === "RETRY_PENDING") await service.markRetryPending(String(operation._id), input.tenantId, input.failureCode ?? "BILLING_PROVIDER_UNAVAILABLE", new Date(Date.now() + 60_000));
  else await service.fail(String(operation._id), input.tenantId, input.failureCode ?? "BILLING_PROVIDER_UNAVAILABLE");
  return { matched: true, operationId: String(operation._id) };
}
