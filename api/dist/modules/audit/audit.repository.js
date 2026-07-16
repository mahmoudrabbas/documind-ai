import AuditLogModel from "../../db/models/auditLog.model.js";
// Keep backward compatibility for existing codebase callers temporarily, 
// though we will refactor them to use getAuditWriter() directly
export function createAuditLog(input) {
    // We use the model directly here to prevent circular loops 
    // since MongoAuditWriter calls createAuditLog
    return AuditLogModel.create(input);
}
export function buildAuditFilter(filter) {
    const query = {};
    if (filter.tenantId)
        query.tenantId = filter.tenantId;
    if (filter.action)
        query.action = filter.action;
    if (filter.actorId)
        query.actorId = filter.actorId;
    if (filter.actorEmail) {
        // Escape regex special characters to prevent ReDoS
        const escaped = filter.actorEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.actorEmail = { $regex: escaped, $options: "i" };
    }
    if (filter.resourceType)
        query.resourceType = filter.resourceType;
    if (filter.resourceId)
        query.resourceId = filter.resourceId;
    if (filter.outcome)
        query.outcome = filter.outcome;
    if (filter.dateFrom || filter.dateTo) {
        const dateFilter = {};
        if (filter.dateFrom)
            dateFilter.$gte = new Date(filter.dateFrom);
        if (filter.dateTo)
            dateFilter.$lte = new Date(filter.dateTo);
        query.createdAt = dateFilter;
    }
    return query;
}
export async function findAuditLogs(filter, page, pageSize) {
    const query = buildAuditFilter(filter);
    return AuditLogModel.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec();
}
export async function countAuditLogs(filter) {
    const query = buildAuditFilter(filter);
    return AuditLogModel.countDocuments(query);
}
export async function getAuditLogById(id, tenantId) {
    const query = { _id: id };
    if (tenantId)
        query.tenantId = tenantId;
    return AuditLogModel.findOne(query).lean().exec();
}
export async function exportAuditLogs(filter, limit = 10000) {
    const query = buildAuditFilter(filter);
    return AuditLogModel.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
        .exec();
}
//# sourceMappingURL=audit.repository.js.map