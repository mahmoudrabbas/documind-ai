import mongoose, { Schema } from "mongoose";
const refreshTokenSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, required: true, ref: "Tenant" },
    userId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    tokenHash: { type: String, required: true },
    jtiHash: { type: String, required: true },
    familyId: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedByTokenId: {
        type: Schema.Types.ObjectId,
        ref: "RefreshToken",
        default: null,
    },
    reuseDetectedAt: { type: Date, default: null },
    createdByIp: { type: String },
    revokedByIp: { type: String },
    userAgent: { type: String },
}, { timestamps: true, collection: "refresh_tokens" });
refreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
refreshTokenSchema.index({ jtiHash: 1 }, { unique: true });
refreshTokenSchema.index({ tenantId: 1, userId: 1 });
refreshTokenSchema.index({ familyId: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshTokenSchema.index({ tenantId: 1, userId: 1, revokedAt: 1 });
const RefreshTokenModel = mongoose.model("RefreshToken", refreshTokenSchema);
export default RefreshTokenModel;
//# sourceMappingURL=refreshToken.model.js.map