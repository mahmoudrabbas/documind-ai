import mongoose, { Schema } from "mongoose";

export interface RoleDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  normalizedName: string;
  baseRole: "COMPANY_ADMIN" | "EMPLOYEE";
  createdAt: Date;
  updatedAt: Date;
}

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

const RoleModel = mongoose.model<RoleDocument>("Role", roleSchema);

export default RoleModel;
