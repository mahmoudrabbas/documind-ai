import mongoose, { Schema } from "mongoose";

export interface AgentModelConfigDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId | null;
  isGlobal: boolean;
  providerKey: string;
  modelName: string;
  adapterType: "fake" | "openai" | "anthropic" | "azure" | "custom";
  config: Record<string, unknown>;
  isDefault: boolean;
  status: "active" | "inactive";
  createdBy: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const agentModelConfigSchema = new Schema<AgentModelConfigDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", default: null, index: true },
    isGlobal: { type: Boolean, default: false, required: true, index: true },
    providerKey: { type: String, required: true, trim: true, maxlength: 80 },
    modelName: { type: String, required: true, trim: true, maxlength: 120 },
    adapterType: {
      type: String,
      enum: ["fake", "openai", "anthropic", "azure", "custom"],
      required: true,
      default: "fake",
    },
    config: { type: Schema.Types.Mixed, required: true, default: {} },
    isDefault: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      required: true,
      index: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        const record = ret as Record<string, unknown> & { _id?: unknown; __v?: number };
        record.id = record._id?.toString?.() ?? "";
        delete record._id;
        delete record.__v;
        return record;
      },
    },
  }
);

agentModelConfigSchema.index({ tenantId: 1, providerKey: 1, modelName: 1 }, { unique: true, partialFilterExpression: { tenantId: { $ne: null } } });
agentModelConfigSchema.index({ isGlobal: 1, providerKey: 1, modelName: 1 }, { unique: true, partialFilterExpression: { isGlobal: true, tenantId: null } });

const AgentModelConfigModel = mongoose.model<AgentModelConfigDocument>("AgentModelConfig", agentModelConfigSchema);

export default AgentModelConfigModel;
