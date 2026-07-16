import mongoose, { Schema } from "mongoose";
import type { TenantRoleBase } from "../../common/auth/baseRoles.js";
import {
  PERMISSION_CONTRACT_VERSION,
} from "../../modules/permissions/permissions.catalog.js";
import { normalizeRoleGrants } from "../../modules/permissions/permissions.grants.js";
import type { PermissionGrant, PermissionScopes } from "../../modules/permissions/permissions.types.js";

export interface RoleDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  normalizedName: string;
  baseRole: TenantRoleBase;
  grants: PermissionGrant[];
  contractVersion: number;
  status: "active" | "archived";
  version: number;
  createdBy?: mongoose.Types.ObjectId | null;
  updatedBy?: mongoose.Types.ObjectId | null;
  migrationState?: "complete" | "quarantined";
  migrationReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export function normalizeRoleName(name: string): string {
  return name.trim().toLowerCase();
}

const scopesSchema = new Schema<PermissionScopes>({
  selfOnly: { type: Boolean, required: true },
  departmentIds: {
    type: [String],
    required: true,
    validate: {
      validator: (values: string[]) => values.every((value) => mongoose.isValidObjectId(value)),
      message: "Department scopes must contain valid identifiers",
    },
  },
  documentCategories: { type: [String], required: true },
  documentClassifications: { type: [String], required: true },
}, { _id: false });

const grantSchema = new Schema<PermissionGrant>({
  permission: { type: String, required: true },
  scopes: { type: scopesSchema, required: false },
}, { _id: false });

const roleSchema = new Schema<RoleDocument>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
  normalizedName: { type: String, required: true, trim: true, lowercase: true },
  baseRole: { type: String, enum: ["COMPANY_ADMIN", "EMPLOYEE"], required: true },
  grants: {
    type: [grantSchema],
    default: [],
  },
  contractVersion: { type: Number, required: true, enum: [PERMISSION_CONTRACT_VERSION], default: PERMISSION_CONTRACT_VERSION },
  status: { type: String, enum: ["active", "archived"], required: true, default: "active" },
  version: { type: Number, required: true, default: 1, min: 1 },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  migrationState: { type: String, enum: ["complete", "quarantined"], default: "complete" },
  migrationReason: { type: String, maxlength: 120 },
}, {
  timestamps: true,
  optimisticConcurrency: true,
  toJSON: {
    transform(_doc, ret) {
      const record = ret as Record<string, unknown> & { _id?: unknown; __v?: number };
      record.id = record._id?.toString?.() ?? "";
      delete record._id;
      delete record.__v;
      delete record.normalizedName;
      return record;
    },
  },
});

roleSchema.pre("validate", function normalizeAndValidate() {
  if (typeof this.name === "string") {
    const canonicalName = normalizeRoleName(this.name);
    if (this.normalizedName !== canonicalName) {
      this.invalidate("normalizedName", "normalizedName must match the canonical role name");
    }
  }
  try {
    const rawGrants = (this.grants ?? []).map((grant) =>
      typeof (grant as unknown as { toObject?: unknown }).toObject === "function"
        ? (grant as unknown as { toObject(): unknown }).toObject()
        : grant);
    this.grants = normalizeRoleGrants(rawGrants);
  } catch (error) {
    this.invalidate("grants", error instanceof Error ? error.message : "Invalid grants");
  }
});

roleSchema.pre("save", async function validateProvenance() {
  if (!this.isNew) {
    const persisted = await this.collection.findOne(
      { _id: this._id },
      { projection: { tenantId: 1, version: 1 }, session: this.$session() ?? undefined },
    );
    if (!persisted) throw new Error("Role no longer exists");
    if (!persisted.tenantId.equals(this.tenantId)) {
      throw new Error("Role tenant cannot change");
    }
    if (!Number.isInteger(this.version) || this.version !== Number(persisted.version) + 1) {
      throw new Error("Role version must increase by exactly one");
    }
  }
  if (this.migrationState === "quarantined") return;
  const User = mongoose.models.User;
  if (!User) throw new Error("User model is unavailable for role provenance validation");
  const actors = [this.createdBy, this.updatedBy];
  if (actors.some((actor) => !actor || !mongoose.isValidObjectId(actor))) {
    throw new Error("Role provenance requires valid actors");
  }
  const actorQuery = User.countDocuments({ _id: { $in: actors }, tenantId: this.tenantId });
  if (this.$session()) actorQuery.session(this.$session());
  const count = await actorQuery;
  if (count !== new Set(actors.map((actor) => actor?.toString())).size) {
    throw new Error("Role provenance actors must belong to the role tenant");
  }
});

for (const operation of ["findOneAndUpdate", "findOneAndReplace", "updateOne", "updateMany", "replaceOne"] as const) {
  roleSchema.pre(operation, function rejectRoleQueryMutation() {
    throw new Error("ROLE_QUERY_UPDATE_FORBIDDEN");
  });
}

roleSchema.pre("bulkWrite", function rejectRoleBulkMutation() {
  throw new Error("ROLE_BULK_WRITE_FORBIDDEN");
});

roleSchema.pre("insertMany", function rejectRoleInsertMany() {
  throw new Error("ROLE_INSERT_MANY_FORBIDDEN");
});

roleSchema.index({ tenantId: 1, normalizedName: 1 }, { unique: true, name: "uniq_role_tenant_name" });
roleSchema.index({ tenantId: 1, status: 1 }, { name: "idx_role_tenant_status" });

const RoleModel = mongoose.model<RoleDocument>("Role", roleSchema);
export default RoleModel;
