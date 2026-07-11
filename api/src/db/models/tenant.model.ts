import mongoose, { Schema } from "mongoose";

export interface TenantDocument extends mongoose.Document {
  name: string;
  slug: string;
  status: string;
  plan: string;
  isSystemTenant: boolean;
  selectedPackageCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

const tenantSchema = new Schema<TenantDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 80,
    },
    status: {
      type: String,
      enum: ["active", "trial", "pending", "pending_verification", "suspended"],
      default: "pending_verification",
    },
    plan: {
      type: String,
      enum: ["free", "trial", "pro"],
      default: "free",
    },
    isSystemTenant: {
      type: Boolean,
      default: false,
      index: true,
    },
    selectedPackageCode: {
      type: String,
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
        return record;
      },
    },
  },
);

tenantSchema.index({ status: 1 });

const TenantModel = mongoose.model<TenantDocument>("Tenant", tenantSchema);

export default TenantModel;
