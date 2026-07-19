import mongoose from "mongoose";
import AuditLogModel from "../../db/models/auditLog.model.js";
import { redactObject } from "../../common/observability/redactionRules.js";
import type { AuditQueryFilter } from "./audit.types.js";

// Keep backward compatibility for existing codebase callers temporarily, 
// though we will refactor them to use getAuditWriter() directly
export function createAuditLog(input: Record<string, unknown>) {
  // We use the model directly here to prevent circular loops 
  // since MongoAuditWriter calls createAuditLog
  return AuditLogModel.create(input);
}

export function buildTenantAuditFilter(
  tenantId: string,
  filter: AuditQueryFilter,
) {
  const query: Record<string, unknown> = {
    tenantId: new mongoose.Types.ObjectId(tenantId),
  };

  if (filter.action) query.action = filter.action;
  if (filter.actorId) query.actorId = new mongoose.Types.ObjectId(filter.actorId);
  if (filter.actorEmail) query.actorEmail = filter.actorEmail;
  if (filter.resourceType) query.resourceType = filter.resourceType;
  if (filter.resourceId) query.resourceId = filter.resourceId;
  if (filter.outcome) query.outcome = filter.outcome;
  
  if (filter.dateFrom || filter.dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (filter.dateFrom) dateFilter.$gte = new Date(filter.dateFrom);
    if (filter.dateTo) dateFilter.$lte = new Date(filter.dateTo);
    query.createdAt = dateFilter;
  }

  return query;
}

export async function findAuditLogs(
  tenantId: string,
  filter: AuditQueryFilter,
  page: number,
  pageSize: number,
) {
  const query = buildTenantAuditFilter(tenantId, filter);
  const logs = await AuditLogModel.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean()
    .exec();
  return logs.map((log) => serializeAuditLog(log));
}

export async function countAuditLogs(tenantId: string, filter: AuditQueryFilter) {
  const query = buildTenantAuditFilter(tenantId, filter);
  return AuditLogModel.countDocuments(query);
}

export async function getAuditLogById(tenantId: string, id: string) {
  const log = await AuditLogModel.findOne({
    _id: id,
    tenantId: new mongoose.Types.ObjectId(tenantId),
  }).lean().exec();
  return log ? serializeAuditLog(log) : null;
}

export async function exportAuditLogs(
  tenantId: string,
  filter: AuditQueryFilter,
  limit = 10000,
) {
  const query = buildTenantAuditFilter(tenantId, filter);
  const logs = await AuditLogModel.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
    .exec();
  return logs.map((log) => serializeAuditLog(log, true));
}

export async function findPlatformAuditLogs(
  input: {
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
  },
) {
  const query: Record<string, unknown> = {};
  if (input.status) query.action = input.status;
  if (input.search) {
    const escaped = input.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$or = [
      { actorEmail: { $regex: escaped, $options: "i" } },
      { action: { $regex: escaped, $options: "i" } },
      { resourceType: { $regex: escaped, $options: "i" } },
    ];
  }
  const [documents, totalRecords] = await Promise.all([
    AuditLogModel.find(query)
      .sort({ createdAt: -1 })
      .skip((input.page - 1) * input.pageSize)
      .limit(input.pageSize)
      .lean()
      .exec(),
    AuditLogModel.countDocuments(query),
  ]);
  return {
    logs: documents.map((log) => serializeAuditLog(log)),
    pagination: {
      ...input,
      totalRecords,
      totalPages: Math.ceil(totalRecords / input.pageSize),
    },
  };
}

export function serializeAuditLog(input: unknown, spreadsheetSafe = false) {
  const log = asRecord(input);
  const changes = redactObject(asRecord(log.changes));
  const metadata = log.metadata === undefined
    ? undefined
    : redactObject(asRecord(log.metadata));
  const safe = {
    _id: stringifyId(log._id),
    tenantId: stringifyId(log.tenantId),
    resourceType: stringValue(log.resourceType),
    resourceId: stringValue(log.resourceId),
    action: stringValue(log.action),
    actorId: nullableId(log.actorId),
    actorEmail: nullableString(log.actorEmail),
    actorRole: nullableString(log.actorRole),
    actorKind: stringValue(log.actorKind),
    changes,
    ...(metadata ? { metadata } : {}),
    traceId: optionalString(log.traceId),
    requestId: optionalString(log.requestId),
    outcome: stringValue(log.outcome),
    createdAt: dateValue(log.createdAt),
  };
  if (!spreadsheetSafe) return safe;
  return {
    ...safe,
    resourceId: neutralizeSpreadsheetString(safe.resourceId),
    changes: neutralizeSpreadsheetRecord(safe.changes),
    ...(safe.metadata
      ? { metadata: neutralizeSpreadsheetRecord(safe.metadata) }
      : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

function stringifyId(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function nullableId(value: unknown): string | null {
  return value === undefined || value === null ? null : String(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function dateValue(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? "");
}

function neutralizeSpreadsheetString(value: string): string {
  return /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function neutralizeSpreadsheetValue(value: unknown): unknown {
  if (typeof value === "string") {
    return neutralizeSpreadsheetString(value);
  }
  if (Array.isArray(value)) return value.map(neutralizeSpreadsheetValue);
  if (value && typeof value === "object") {
    return neutralizeSpreadsheetRecord(asRecord(value));
  }
  return value;
}

function neutralizeSpreadsheetRecord(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      neutralizeSpreadsheetValue(nested),
    ]),
  );
}
