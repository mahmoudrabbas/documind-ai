import mongoose, { Schema } from "mongoose";

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

const auditLogSchema = new Schema<AuditLogDocument>(
  {
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
  },
  {
    collection: "audit_logs",
    timestamps: { createdAt: true, updatedAt: false },
  },
);

auditLogSchema.index({ tenantId: 1, createdAt: -1 });
auditLogSchema.index({ tenantId: 1, resourceType: 1, resourceId: 1 });

type AuditLogModelType = mongoose.Model<AuditLogDocument>;
const AuditLogModel = mongoose.model<AuditLogDocument>("AuditLog", auditLogSchema) as AuditLogModelType;

export default AuditLogModel;
