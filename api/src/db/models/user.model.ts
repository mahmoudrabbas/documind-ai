import mongoose, { Schema } from "mongoose";

export interface UserDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: string;
  status: string;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  emailVerificationTokenHash: string | null;
  emailVerificationExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

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
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["SUPER_ADMIN", "COMPANY_ADMIN", "EMPLOYEE"],
      required: true,
    },
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
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        const record = ret as Record<string, unknown> & { _id?: unknown; __v?: number };
        record.id = record._id?.toString?.() ?? "";
        delete record._id;
        delete record.__v;
        delete record.passwordHash;
        delete record.emailVerificationTokenHash;
        delete record.emailVerificationExpiresAt;
        return record;
      },
    },
  }
);

const UserModel = mongoose.model<UserDocument>("User", userSchema);

export default UserModel;
