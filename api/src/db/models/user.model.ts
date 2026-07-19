import mongoose, { Schema } from "mongoose";
import type { BaseRole } from "../../common/auth/baseRoles.js";

export interface UserDocument extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  id: string;
  tenantId: mongoose.Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: BaseRole;
  status: string;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  emailVerificationTokenHash: string | null;
  emailVerificationExpiresAt: Date | null;
  passwordResetTokenHash: string | null;
  passwordResetExpiresAt: Date | null;
  customRoleId: mongoose.Types.ObjectId | null;
  permissionBaseline: "standard" | "legacy-none";
  roleMigrationState: "complete" | "pending-session-revocation";
  sessionGuardVersion: number;
  employeeProfile?: {
    employeeId?: string;
    department?: string;
    jobTitle?: string;
    phone?: string;
    hireDate?: Date;
    managerId?: mongoose.Types.ObjectId;
    preferredLanguage?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

function sanitizeUserTransform(
  _doc: mongoose.Document,
  ret: Record<string, unknown> & { _id?: unknown; __v?: number }
) {
  ret.id = ret._id?.toString?.() ?? "";

  delete ret._id;
  delete ret.__v;
  delete ret.passwordHash;
  delete ret.emailVerificationTokenHash;
  delete ret.emailVerificationExpiresAt;
  delete ret.passwordResetTokenHash;
  delete ret.passwordResetExpiresAt;

  return ret;
}

const EmployeeProfileSchema = new Schema(
  {
    employeeId: { type: String, trim: true, maxlength: 50 },
    department: { type: String, trim: true, maxlength: 100 },
    jobTitle: { type: String, trim: true, maxlength: 100 },
    phone: { type: String, trim: true, maxlength: 30 },
    hireDate: { type: Date },
    managerId: { type: Schema.Types.ObjectId, ref: "User" },
    preferredLanguage: { type: String, enum: ["en", "ar"], default: "en" },
  },
  { _id: false }
);

const userSchema = new Schema<UserDocument>(
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
      maxlength: 120,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ["SUPER_ADMIN", "COMPANY_ADMIN", "EMPLOYEE"],
      required: true,
    },
    customRoleId: {
      type: Schema.Types.ObjectId,
      ref: "Role",
      default: null,
    },
    permissionBaseline: {
      type: String,
      enum: ["standard", "legacy-none"],
      default: "standard",
    },
    roleMigrationState: {
      type: String,
      enum: ["complete", "pending-session-revocation"],
      default: "complete",
    },
    sessionGuardVersion: { type: Number, default: 0, min: 0 },
    employeeProfile: { type: EmployeeProfileSchema, required: false },
    status: {
      type: String,
      enum: ["active", "pending", "pending_email_verification", "disabled"],
      default: "pending_email_verification",
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerifiedAt: {
      type: Date,
      default: null,
    },
    emailVerificationTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    emailVerificationExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },
    passwordResetTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    passwordResetExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: sanitizeUserTransform,
    },
    toObject: {
      transform: sanitizeUserTransform,
    },
  }
);

userSchema.index(
  { tenantId: 1, email: 1 },
  {
    unique: true,
    name: "uniq_user_tenant_email",
  }
);

userSchema.index(
  { tenantId: 1, customRoleId: 1 },
  { name: "idx_user_tenant_custom_role" },
);

userSchema.index(
  { role: 1 },
  { unique: true, partialFilterExpression: { role: "SUPER_ADMIN" }, name: "uniq_initial_super_admin" },
);

userSchema.index(
  { email: 1 },
  {
    name: "idx_user_email",
  }
);

userSchema.index(
  { tenantId: 1, "employeeProfile.employeeId": 1 },
  {
    unique: true,
    partialFilterExpression: {
      "employeeProfile.employeeId": { $type: "string" },
    },
    name: "uniq_tenant_employee_id",
  }
);

userSchema.index(
  { "employeeProfile.department": 1 },
  { name: "idx_employee_department" },
);

const UserModel = mongoose.model<UserDocument>("User", userSchema);

export default UserModel;
