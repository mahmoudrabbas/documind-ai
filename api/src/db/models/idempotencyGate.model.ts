import mongoose, { Schema } from "mongoose";

export interface IdempotencyGateDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  dimension: string;
  requestId: string;
  createdAt: Date;
}

const idempotencyGateSchema = new Schema<IdempotencyGateDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant" },
    dimension: { type: String },
    requestId: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

idempotencyGateSchema.index(
  { tenantId: 1, dimension: 1, requestId: 1 },
  { unique: true, name: "uniq_idempotency_request" },
);

idempotencyGateSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 86400, name: "ttl_idempotency_24h" },
);

const IdempotencyGateModel = mongoose.model<IdempotencyGateDocument>(
  "IdempotencyGate",
  idempotencyGateSchema,
);

export default IdempotencyGateModel;
