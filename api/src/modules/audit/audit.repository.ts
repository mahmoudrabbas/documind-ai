import AuditLogModel from "../../db/models/auditLog.model.js";
import type { AuditQueryFilter } from "./audit.types.js";

// Keep backward compatibility for existing codebase callers temporarily, 
// though we will refactor them to use getAuditWriter() directly
export function createAuditLog(input: Record<string, unknown>) {
  // We use the model directly here to prevent circular loops 
  // since MongoAuditWriter calls createAuditLog
  return AuditLogModel.create(input);
}

export function buildAuditFilter(filter: AuditQueryFilter) {
  const query: Record<string, unknown> = {};

  if (filter.tenantId) query.tenantId = filter.tenantId;
  if (filter.action) query.action = filter.action;
  if (filter.actorId) query.actorId = filter.actorId;
  if (filter.actorEmail) {
    // Escape regex special characters to prevent ReDoS
    const escaped = filter.actorEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.actorEmail = { $regex: escaped, $options: "i" };
  }
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

export async function findAuditLogs(filter: AuditQueryFilter, page: number, pageSize: number) {
  const query = buildAuditFilter(filter);
  return AuditLogModel.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean()
    .exec();
}

export async function countAuditLogs(filter: AuditQueryFilter) {
  const query = buildAuditFilter(filter);
  return AuditLogModel.countDocuments(query);
}

export async function getAuditLogById(id: string, tenantId?: string) {
  const query: Record<string, unknown> = { _id: id };
  if (tenantId) query.tenantId = tenantId;
  return AuditLogModel.findOne(query).lean().exec();
}

export async function exportAuditLogs(filter: AuditQueryFilter, limit = 10000) {
  const query = buildAuditFilter(filter);
  return AuditLogModel.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
    .exec();
}
