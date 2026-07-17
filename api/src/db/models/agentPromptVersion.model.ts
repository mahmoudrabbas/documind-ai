import mongoose, { Schema } from "mongoose";

export interface AgentPromptVersionDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId | null;
  isGlobal: boolean;
  name: string;
  version: string;
  prompt: string;
  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
  modelProvider: string;
  modelName: string;
  temperature: number | null;
  topP: number | null;
  maxTokens: number | null;
  toolIds: string[];
  guardrailIds: string[];
  status: "active" | "deprecated" | "draft";
  createdBy: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const agentPromptVersionSchema = new Schema<AgentPromptVersionDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", default: null, index: true },
    isGlobal: { type: Boolean, default: false, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    version: { type: String, required: true, trim: true, maxlength: 40 },
    prompt: { type: String, required: true },
    inputSchema: { type: Schema.Types.Mixed, default: null },
    outputSchema: { type: Schema.Types.Mixed, default: null },
    modelProvider: { type: String, required: true, trim: true, maxlength: 80 },
    modelName: { type: String, required: true, trim: true, maxlength: 120 },
    temperature: { type: Number, default: null, min: 0, max: 2 },
    topP: { type: Number, default: null, min: 0, max: 1 },
    maxTokens: { type: Number, default: null, min: 1 },
    toolIds: { type: [String], default: [] },
    guardrailIds: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["active", "deprecated", "draft"],
      default: "draft",
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

agentPromptVersionSchema.index({ name: 1, version: 1 }, { unique: true });
agentPromptVersionSchema.index({ tenantId: 1, name: 1, status: 1 });
agentPromptVersionSchema.index({ isGlobal: 1, status: 1 });

const AgentPromptVersionModel = mongoose.model<AgentPromptVersionDocument>("AgentPromptVersion", agentPromptVersionSchema);

export default AgentPromptVersionModel;
