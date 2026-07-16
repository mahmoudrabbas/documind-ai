import type { AuditQueryFilter } from "./audit.types.js";
export declare function createAuditLog(input: Record<string, unknown>): Promise<import("mongoose").Document<unknown, {}, import("../../db/models/auditLog.model.js").AuditLogDocument, {}, import("mongoose").DefaultSchemaOptions> & import("../../db/models/auditLog.model.js").AuditLogDocument & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}>;
export declare function buildAuditFilter(filter: AuditQueryFilter): Record<string, unknown>;
export declare function findAuditLogs(filter: AuditQueryFilter, page: number, pageSize: number): Promise<(import("../../db/models/auditLog.model.js").AuditLogDocument & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
})[]>;
export declare function countAuditLogs(filter: AuditQueryFilter): Promise<number>;
export declare function getAuditLogById(id: string, tenantId?: string): Promise<(import("../../db/models/auditLog.model.js").AuditLogDocument & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
}) | null>;
export declare function exportAuditLogs(filter: AuditQueryFilter, limit?: number): Promise<(import("../../db/models/auditLog.model.js").AuditLogDocument & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
})[]>;
//# sourceMappingURL=audit.repository.d.ts.map