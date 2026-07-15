import mongoose, { Schema } from "mongoose";

export interface RoleScopes {
  selfOnly: boolean;
  departmentIds: string[];
  categories: string[];
}

export interface RoleDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  normalizedName: string;
  baseRole: "COMPANY_ADMIN" | "EMPLOYEE";
  permissions: string[];
  scopes: RoleScopes;
  status: "active" | "archived";
  version: number;
  createdBy: mongoose.Types.ObjectId | null;
  updatedBy: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const roleScopesSchema = new Schema<RoleScopes>(
  {
    selfOnly: { type: Boolean, default: false },
    departmentIds: { type: [String], default: [] },
    categories: { type: [String], default: [] },
  },
  { _id: false },
);

const roleSchema = new Schema<RoleDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    normalizedName: {
      type: String,
      required: true,
    },
    baseRole: {
      type: String,
      enum: ["COMPANY_ADMIN", "EMPLOYEE"],
      required: true,
    },
    permissions: {
      type: [String],
      default: [],
    },
    scopes: {
      type: roleScopesSchema,
      default: () => ({
        selfOnly: false,
        departmentIds: [],
        categories: [],
      }),
    },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
    },
    version: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        const record = ret as Record<string, unknown> & {
          _id?: unknown;
          __v?: number;
        };
        record.id = record._id?.toString?.() ?? "";
        delete record._id;
        delete record.__v;
        delete record.normalizedName;
        return record;
      },
    },
  },
);

roleSchema.index(
  { tenantId: 1, normalizedName: 1 },
  { unique: true, name: "uniq_role_tenant_name" },
);

roleSchema.index(
  { tenantId: 1, status: 1 },
  { name: "idx_role_tenant_status" },
);

const RoleModel = mongoose.model<RoleDocument>("Role", roleSchema);

export default RoleModel;
