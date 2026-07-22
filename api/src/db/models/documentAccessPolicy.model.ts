import mongoose, { Schema } from "mongoose";
import { DOCUMENT_ACCESS_ACTIONS } from "../../modules/document-access/documentAccess.actions.js";
import type {
  DocumentAccessPolicyRule,
  DocumentAccessPolicyStatus,
} from "../../modules/document-access/documentAccess.types.js";

export interface DocumentAccessPolicyDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  policyId: mongoose.Types.ObjectId;
  policyVersion: number;
  contractVersion: 1;
  status: DocumentAccessPolicyStatus;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  inherits: { policyId: mongoose.Types.ObjectId; policyVersion: number } | null;
  rules: DocumentAccessPolicyRule[];
  provenance: { createdBy: mongoose.Types.ObjectId; createdAt: Date; reason?: string };
  indexMetadata: {
    policyId: mongoose.Types.ObjectId;
    policyVersion: number;
    classificationId: mongoose.Types.ObjectId | null;
    categoryId: mongoose.Types.ObjectId | null;
    departmentId: mongoose.Types.ObjectId | null;
  };
  createdAt: Date;
}

const subjectSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["user", "custom_role", "department", "owner", "tenant_member"],
      required: true,
    },
    id: { type: String, required: false },
  },
  { _id: false },
);

const ruleSchema = new Schema(
  {
    ruleId: { type: String, required: true, trim: true },
    effect: { type: String, enum: ["allow", "deny"], required: true },
    subject: { type: subjectSchema, required: true },
    actions: { type: [String], enum: DOCUMENT_ACCESS_ACTIONS, required: true },
  },
  { _id: false },
);

const referenceSchema = new Schema(
  {
    policyId: { type: Schema.Types.ObjectId, required: true },
    policyVersion: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const policySchema = new Schema<DocumentAccessPolicyDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    documentId: { type: Schema.Types.ObjectId, ref: "Document", required: true },
    policyId: { type: Schema.Types.ObjectId, required: true },
    policyVersion: { type: Number, required: true, min: 1 },
    contractVersion: { type: Number, enum: [1], required: true },
    status: {
      type: String,
      enum: ["draft", "active", "inactive", "retired"],
      required: true,
    },
    effectiveFrom: { type: Date, required: true },
    effectiveUntil: { type: Date, default: null },
    inherits: { type: referenceSchema, default: null },
    rules: { type: [ruleSchema], required: true },
    provenance: {
      type: new Schema(
        {
          createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
          createdAt: { type: Date, required: true },
          reason: { type: String, trim: true, maxlength: 500 },
        },
        { _id: false },
      ),
      required: true,
    },
    indexMetadata: {
      type: new Schema(
        {
          policyId: { type: Schema.Types.ObjectId, required: true },
          policyVersion: { type: Number, required: true, min: 1 },
          classificationId: { type: Schema.Types.ObjectId, default: null },
          categoryId: { type: Schema.Types.ObjectId, default: null },
          departmentId: { type: Schema.Types.ObjectId, default: null },
        },
        { _id: false },
      ),
      required: true,
    },
    createdAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false },
);

policySchema.pre("validate", function validateSnapshotIdentity() {
  if (!Number.isSafeInteger(this.policyVersion) || this.policyVersion < 1) {
    this.invalidate("policyVersion", "Policy version must be a positive safe integer");
  }
  if (
    !this.indexMetadata ||
    !this.policyId.equals(this.indexMetadata.policyId) ||
    this.policyVersion !== this.indexMetadata.policyVersion
  ) {
    this.invalidate("indexMetadata", "Policy index metadata identity must match the snapshot");
  }
  if (this.effectiveUntil && this.effectiveUntil <= this.effectiveFrom) {
    this.invalidate("effectiveUntil", "effectiveUntil must be later than effectiveFrom");
  }
});

policySchema.pre("save", function rejectExistingSnapshotSave() {
  if (!this.isNew) throw new Error("DOCUMENT_POLICY_SNAPSHOT_IMMUTABLE");
});

for (const operation of [
  "findOneAndUpdate",
  "findOneAndReplace",
  "updateOne",
  "updateMany",
  "replaceOne",
] as const) {
  policySchema.pre(operation, function rejectSnapshotMutation() {
    throw new Error("DOCUMENT_POLICY_SNAPSHOT_IMMUTABLE");
  });
}
policySchema.pre("bulkWrite", function rejectBulkMutation() {
  throw new Error("DOCUMENT_POLICY_SNAPSHOT_IMMUTABLE");
});

policySchema.index(
  { tenantId: 1, documentId: 1, policyId: 1, policyVersion: 1 },
  { unique: true, name: "uniq_document_policy_snapshot" },
);
policySchema.index(
  { tenantId: 1, documentId: 1, policyVersion: -1, policyId: 1 },
  { name: "idx_document_policy_history" },
);
policySchema.index(
  { tenantId: 1, policyId: 1, policyVersion: -1 },
  { name: "idx_tenant_policy_family" },
);
policySchema.index(
  { tenantId: 1, documentId: 1, effectiveFrom: 1, effectiveUntil: 1 },
  { name: "idx_document_policy_effective_time" },
);

const DocumentAccessPolicyModel = mongoose.model<DocumentAccessPolicyDocument>(
  "DocumentAccessPolicy",
  policySchema,
);
export default DocumentAccessPolicyModel;
