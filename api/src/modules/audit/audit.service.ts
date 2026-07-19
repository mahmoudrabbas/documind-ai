import mongoose from "mongoose";
import { isSystemPlatformTenant } from "../../common/auth/platformTenant.js";
import { AppError } from "../../common/errors/AppError.js";
import {
  NOT_FOUND,
  PERMISSION_REQUIRED,
} from "../../common/errors/errorCodes.js";
import {
  requireAuthenticatedAuditActor,
  type AuthenticatedAuditActor,
} from "../../common/observability/auditActor.js";
import { getAuditWriter } from "../../common/observability/index.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import { authorizePermission } from "../permissions/permissions.authorization.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  countAuditLogs,
  exportAuditLogs,
  findAuditLogs,
  findPlatformAuditLogs,
  getAuditLogById,
} from "./audit.repository.js";
import type {
  AuditOperationContext,
  AuditQueryFilter,
} from "./audit.types.js";
import {
  validateAuditLogIdInput,
  validateAuditLogsInput,
  validateExportAuditLogsInput,
  validatePlatformAuditInput,
} from "./audit.validator.js";

type ResolvedAuditContext =
  AuthenticatedAuditActor &
  Pick<AuditOperationContext, "traceId" | "requestId">;

export async function listTenantAuditLogs(
  input: unknown,
  inputContext: AuditOperationContext,
) {
  const context = await authorizeTenantAudit(inputContext);
  const payload = validateAuditLogsInput(input);
  const { page, pageSize, ...filter } = payload;
  const [logs, totalRecords] = await Promise.all([
    findAuditLogs(context.tenantId, filter, page, pageSize),
    countAuditLogs(context.tenantId, filter),
  ]);
  await auditAccess(context, "list", filter, logs.length);
  return {
    logs,
    pagination: {
      page,
      pageSize,
      totalRecords,
      totalPages: Math.ceil(totalRecords / pageSize),
    },
  };
}

export async function getTenantAuditLog(
  input: unknown,
  inputContext: AuditOperationContext,
) {
  const context = await authorizeTenantAudit(inputContext);
  const { id } = validateAuditLogIdInput(input);
  const log = await getAuditLogById(context.tenantId, id);
  if (!log) throw new AppError(404, NOT_FOUND, "Audit log not found");
  await auditAccess(context, "detail", { resourceId: id }, 1);
  return { log };
}

export async function exportTenantAuditLogs(
  input: unknown,
  inputContext: AuditOperationContext,
) {
  const context = await authorizeTenantAudit(inputContext);
  const payload = validateExportAuditLogsInput(input);
  const filter: AuditQueryFilter = {
    ...payload,
    dateTo: payload.dateTo ?? new Date().toISOString(),
  };
  const logs = await exportAuditLogs(context.tenantId, filter, 10_000);
  await getAuditWriter().write({
    tenantId: context.tenantId,
    action: "AUDIT_EXPORTED",
    resourceType: "System",
    resourceId: "audit_logs",
    actorId: context.actorId,
    actorEmail: context.actorEmail,
    actorRole: context.actorRole,
    actorKind: context.actorKind,
    changes: { count: logs.length, filters: safeFilters(filter) },
    metadata: {
      traceId: context.traceId,
      requestId: context.requestId,
    },
  });
  return { logs };
}

export async function listPlatformAuditLogs(
  input: {
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
  },
  inputContext: AuditOperationContext,
) {
  const context = await authorizePlatformAudit(inputContext);
  const payload = validatePlatformAuditInput(input);
  const result = await findPlatformAuditLogs(payload);
  await auditAccess(context, "list", {}, result.logs.length);
  return result;
}

async function authorizeTenantAudit(
  context: AuditOperationContext,
): Promise<ResolvedAuditContext> {
  requireAuthenticatedAuditActor({
    tenantId: context.tenantId,
    actorId: context.actorId,
    actorEmail: context.actorEmail,
    actorRole: context.actorRole,
  });
  if (
    !mongoose.isObjectIdOrHexString(context.tenantId) ||
    !mongoose.isObjectIdOrHexString(context.actorId)
  ) {
    throw new AppError(403, PERMISSION_REQUIRED, "Permission denied");
  }
  const [actor, tenant] = await Promise.all([
    UserModel.findOne({
      _id: context.actorId,
      tenantId: context.tenantId,
    }).select("email role").lean().exec(),
    TenantModel.findById(context.tenantId)
      .select("slug isSystemTenant")
      .lean()
      .exec(),
  ]);
  if (!actor || !tenant || isSystemPlatformTenant(tenant)) {
    throw new AppError(403, PERMISSION_REQUIRED, "Permission denied");
  }
  const resolved = {
    ...requireAuthenticatedAuditActor({
      tenantId: context.tenantId,
      actorId: context.actorId,
      actorEmail: actor.email,
      actorRole: actor.role,
    }),
    traceId: context.traceId,
    requestId: context.requestId,
  };
  await authorizePermission(resolved, Permission.AUDIT_READ);
  return resolved;
}

async function authorizePlatformAudit(
  context: AuditOperationContext,
): Promise<ResolvedAuditContext> {
  requireAuthenticatedAuditActor({
    tenantId: context.tenantId,
    actorId: context.actorId,
    actorEmail: context.actorEmail,
    actorRole: context.actorRole,
  });
  if (
    !mongoose.isObjectIdOrHexString(context.tenantId) ||
    !mongoose.isObjectIdOrHexString(context.actorId)
  ) {
    throw new AppError(403, PERMISSION_REQUIRED, "Permission denied");
  }
  const [actor, tenant] = await Promise.all([
    UserModel.findOne({
      _id: context.actorId,
      tenantId: context.tenantId,
    }).select("email role").lean().exec(),
    TenantModel.findById(context.tenantId)
      .select("slug isSystemTenant status")
      .lean()
      .exec(),
  ]);
  if (
    !actor ||
    actor.role !== "SUPER_ADMIN" ||
    !tenant ||
    tenant.status !== "active" ||
    !isSystemPlatformTenant(tenant)
  ) {
    throw new AppError(403, PERMISSION_REQUIRED, "Permission denied");
  }
  const resolved = {
    ...requireAuthenticatedAuditActor({
      tenantId: context.tenantId,
      actorId: context.actorId,
      actorEmail: actor.email,
      actorRole: actor.role,
    }),
    traceId: context.traceId,
    requestId: context.requestId,
  };
  await authorizePermission(resolved, Permission.AUDIT_READ);
  return resolved;
}

async function auditAccess(
  context: ResolvedAuditContext,
  operation: "list" | "detail",
  filter: AuditQueryFilter,
  count: number,
): Promise<void> {
  await getAuditWriter().write({
    tenantId: context.tenantId,
    action: "AUDIT_QUERIED",
    resourceType: "System",
    resourceId: operation === "detail" ? filter.resourceId ?? "audit_log" : "audit_logs",
    actorId: context.actorId,
    actorEmail: context.actorEmail,
    actorRole: context.actorRole,
    actorKind: context.actorKind,
    changes: { operation, count, filters: safeFilters(filter) },
    metadata: {
      traceId: context.traceId,
      requestId: context.requestId,
    },
  });
}

function safeFilters(filter: AuditQueryFilter): AuditQueryFilter {
  return {
    ...(filter.action ? { action: filter.action } : {}),
    ...(filter.actorId ? { actorId: filter.actorId } : {}),
    ...(filter.actorEmail ? { actorEmail: filter.actorEmail } : {}),
    ...(filter.resourceType ? { resourceType: filter.resourceType } : {}),
    ...(filter.resourceId ? { resourceId: filter.resourceId } : {}),
    ...(filter.dateFrom ? { dateFrom: filter.dateFrom } : {}),
    ...(filter.dateTo ? { dateTo: filter.dateTo } : {}),
    ...(filter.outcome ? { outcome: filter.outcome } : {}),
  };
}

export type { AuditOperationContext };
