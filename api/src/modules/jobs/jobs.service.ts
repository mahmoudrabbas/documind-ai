import { AppError } from "../../common/errors/AppError.js";
import { INVALID_PERMISSION } from "../../common/errors/errorCodes.js";
import { getAuditWriter } from "../../common/observability/index.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  authorizePlatformOperation,
  authorizeTenantOperation,
  type OperationAuthorizationContext,
} from "../permissions/permissions.operation.js";
import { getApiJobDispatcher } from "./jobDispatcher.js";

export async function enqueueCustomerJob(
  body: Record<string, unknown>,
  context: OperationAuthorizationContext,
) {
  const actor = await authorizeTenantOperation(
    context,
    Permission.DOCUMENTS_OCR_PROCESS,
  );
  if (body.jobType !== "document.ocr") {
    throw new AppError(
      400,
      INVALID_PERMISSION,
      "Customer job type is not supported",
    );
  }
  const payload =
    body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? { ...(body.payload as Record<string, unknown>), tenantId: actor.tenantId }
      : body.payload;

  return getApiJobDispatcher().enqueue({
    jobType: body.jobType,
    tenantId: actor.tenantId,
    actorId: actor.actorId,
    traceId: body.traceId,
    idempotencyKey: body.idempotencyKey,
    payload,
    createdAt: new Date().toISOString(),
    priority: body.priority,
    scheduledFor: body.scheduledFor,
    displayName: body.displayName,
  });
}

export async function getPlatformJobMetrics(
  context: OperationAuthorizationContext,
) {
  await authorizePlatformOperation(context, Permission.COMPANY_SETTINGS_READ);
  return getApiJobDispatcher().getMetrics();
}

export async function getPlatformJobStatus(
  jobId: string,
  context: OperationAuthorizationContext,
) {
  await authorizePlatformOperation(context, Permission.COMPANY_SETTINGS_READ);
  return getApiJobDispatcher().getJobStatus(jobId);
}

export async function replayPlatformJob(
  jobId: string,
  context: OperationAuthorizationContext,
) {
  const actor = await authorizePlatformOperation(
    context,
    Permission.COMPANY_SETTINGS_UPDATE,
  );
  const replayed = await getApiJobDispatcher().replayJob(jobId);
  if (replayed) {
    await getAuditWriter().write({
      tenantId: actor.tenantId,
      action: "JOB_REPLAYED",
      resourceType: "System",
      resourceId: jobId,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      actorRole: actor.actorRole,
      actorKind: actor.actorKind,
      changes: { operation: "replay" },
      metadata: { traceId: actor.traceId, requestId: actor.requestId },
    });
  }
  return replayed;
}
