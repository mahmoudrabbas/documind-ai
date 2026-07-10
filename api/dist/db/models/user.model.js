import mongoose, { Schema } from "mongoose";
function sanitizeUserTransform(_doc, ret) {
    ret.id = ret._id?.toString?.() ?? "";
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    delete ret.emailVerificationTokenHash;
    delete ret.emailVerificationExpiresAt;
    return ret;
}
const userSchema = new Schema({
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
}, {
    timestamps: true,
    toJSON: {
        transform: sanitizeUserTransform,
    },
    toObject: {
        transform: sanitizeUserTransform,
    },
});
userSchema.index({ tenantId: 1, email: 1 }, {
    unique: true,
    name: "uniq_user_tenant_email",
});
userSchema.index({ role: 1 }, { unique: true, partialFilterExpression: { role: "SUPER_ADMIN" }, name: "uniq_initial_super_admin" });
userSchema.index({ email: 1 }, {
    name: "idx_user_email",
});
const UserModel = mongoose.model("User", userSchema);
export default UserModel;
//# sourceMappingURL=user.model.js.map