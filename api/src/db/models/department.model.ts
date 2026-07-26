import mongoose, { Schema } from "mongoose";
import { normalizeTaxonomyName } from "../../modules/document-taxonomy/documentTaxonomy.normalization.js";

export interface DepartmentDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  normalizedName: string;
  description: string | null;
  status: "active" | "archived";
  version: number;
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const departmentSchema = new Schema<DepartmentDocument>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
  normalizedName: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, default: null, maxlength: 500 },
  status: { type: String, enum: ["active", "archived"], default: "active", required: true },
  version: { type: Number, default: 1, required: true, min: 1 },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

departmentSchema.pre("validate", function validateCanonicalName() {
  if (this.normalizedName !== normalizeTaxonomyName(this.name)) {
    this.invalidate("normalizedName", "normalizedName must match the canonical taxonomy name");
  }
});

departmentSchema.index(
  { tenantId: 1, normalizedName: 1 },
  { unique: true, name: "uniq_department_tenant_name" },
);
departmentSchema.index(
  { tenantId: 1, status: 1, normalizedName: 1, _id: 1 },
  { name: "idx_department_tenant_status_name" },
);

export default mongoose.model<DepartmentDocument>("Department", departmentSchema);
