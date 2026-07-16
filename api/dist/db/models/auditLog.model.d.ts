import mongoose from "mongoose";
export interface AuditLogDocument extends mongoose.Document {
    tenantId: mongoose.Types.ObjectId | "system";
    userId: mongoose.Types.ObjectId | "system";
    resourceType: string;
    resourceId: string;
    action: string;
    actorId: mongoose.Types.ObjectId | "system";
    actorEmail: string;
    actorRole: string;
    changes: Record<string, unknown>;
    traceId?: string;
    requestId?: string;
    outcome: "SUCCESS" | "FAILURE" | "DENIED";
    metadata?: Record<string, unknown>;
    createdAt: Date;
    expiresAt?: Date;
}
type AuditLogModelType = mongoose.Model<AuditLogDocument>;
declare const AuditLogModel: AuditLogModelType;
export default AuditLogModel;
//# sourceMappingURL=auditLog.model.d.ts.map