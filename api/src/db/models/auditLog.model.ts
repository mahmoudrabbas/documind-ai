import mongoose, { Schema } from "mongoose";

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

const auditLogSchema = new Schema<AuditLogDocument>(
  {
    tenantId: {
      type: Schema.Types.Mixed,
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.Mixed,
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
      type: Schema.Types.Mixed,
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
    traceId: {
      type: String,
      index: true,
    },
    requestId: {
      type: String,
    },
    outcome: {
      type: String,
      enum: ["SUCCESS", "FAILURE", "DENIED"],
      default: "SUCCESS",
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    expiresAt: {
      type: Date,
      index: { expires: 0 },
    },
  },
  {
    collection: "audit_logs",
    timestamps: { createdAt: true, updatedAt: false },
  },
);

auditLogSchema.index({ tenantId: 1, createdAt: -1 });
auditLogSchema.index({ tenantId: 1, action: 1, createdAt: -1 });
auditLogSchema.index({ tenantId: 1, actorId: 1, createdAt: -1 });
auditLogSchema.index({ tenantId: 1, resourceType: 1, resourceId: 1 });

type AuditLogModelType = mongoose.Model<AuditLogDocument>;
const AuditLogModel = mongoose.model<AuditLogDocument>("AuditLog", auditLogSchema) as AuditLogModelType;

export default AuditLogModel;
