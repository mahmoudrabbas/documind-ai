import mongoose, { Schema } from "mongoose";
import { normalizeTaxonomyName } from "../../modules/document-taxonomy/documentTaxonomy.normalization.js";
import { CLASSIFICATION_LEVELS, type ClassificationLevel } from "../../modules/document-taxonomy/documentTaxonomy.types.js";

export interface DocumentClassificationDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  normalizedName: string;
  level: ClassificationLevel;
  description: string | null;
  status: "active" | "archived";
  version: number;
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const documentClassificationSchema = new Schema<DocumentClassificationDocument>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
  normalizedName: { type: String, required: true, trim: true, maxlength: 100 },
  level: { type: String, enum: CLASSIFICATION_LEVELS, required: true },
  description: { type: String, default: null, maxlength: 500 },
  status: { type: String, enum: ["active", "archived"], default: "active", required: true },
  version: { type: Number, default: 1, required: true, min: 1 },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

documentClassificationSchema.pre("validate", function validateCanonicalName() {
  if (this.normalizedName !== normalizeTaxonomyName(this.name)) {
    this.invalidate("normalizedName", "normalizedName must match the canonical taxonomy name");
  }
});

documentClassificationSchema.index(
  { tenantId: 1, normalizedName: 1 },
  { unique: true, name: "uniq_document_classification_tenant_name" },
);
documentClassificationSchema.index(
  { tenantId: 1, status: 1, normalizedName: 1, _id: 1 },
  { name: "idx_document_classification_tenant_status_name" },
);
documentClassificationSchema.index(
  { tenantId: 1, level: 1, status: 1 },
  { name: "idx_document_classification_tenant_level_status" },
);

export default mongoose.model<DocumentClassificationDocument>(
  "DocumentClassification",
  documentClassificationSchema,
);
