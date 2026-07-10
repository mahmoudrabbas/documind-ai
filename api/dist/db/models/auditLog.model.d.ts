import mongoose from "mongoose";
export interface AuditLogDocument extends mongoose.Document {
    tenantId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    resourceType: string;
    resourceId: string;
    action: string;
    actorId: mongoose.Types.ObjectId;
    actorEmail: string;
    actorRole: string;
    changes: Record<string, unknown>;
    createdAt: Date;
}
type AuditLogModelType = mongoose.Model<AuditLogDocument>;
declare const AuditLogModel: AuditLogModelType;
export default AuditLogModel;
//# sourceMappingURL=auditLog.model.d.ts.map