import mongoose, { Schema } from "mongoose";
const auditLogSchema = new Schema({
    tenantId: {
        type: Schema.Types.ObjectId,
        ref: "Tenant",
        required: true,
        index: true,
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    resourceType: {
        type: String,
        required: true,
    },
    resourceId: {
        type: String,
        required: true,
    },
    action: {
        type: String,
        required: true,
    },
    actorId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    actorEmail: {
        type: String,
        required: true,
    },
    actorRole: {
        type: String,
        required: true,
    },
    changes: {
        type: Schema.Types.Mixed,
        required: true,
        default: {},
    },
}, {
    collection: "audit_logs",
    timestamps: { createdAt: true, updatedAt: false },
});
auditLogSchema.index({ tenantId: 1, createdAt: -1 });
auditLogSchema.index({ tenantId: 1, resourceType: 1, resourceId: 1 });
const AuditLogModel = mongoose.model("AuditLog", auditLogSchema);
export default AuditLogModel;
//# sourceMappingURL=auditLog.model.js.map