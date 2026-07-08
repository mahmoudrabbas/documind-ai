import mongoose from "mongoose";
export interface RefreshTokenDocument extends mongoose.Document {
    tenantId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    tokenHash: string;
    jtiHash: string;
    familyId: string;
    expiresAt: Date;
    revokedAt: Date | null;
    replacedByTokenId: mongoose.Types.ObjectId | null;
    reuseDetectedAt: Date | null;
    createdByIp?: string;
    revokedByIp?: string;
    userAgent?: string;
    createdAt: Date;
    updatedAt: Date;
}
declare const RefreshTokenModel: mongoose.Model<RefreshTokenDocument, {}, {}, {}, mongoose.Document<unknown, {}, RefreshTokenDocument, {}, mongoose.DefaultSchemaOptions> & RefreshTokenDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, RefreshTokenDocument>;
export default RefreshTokenModel;
//# sourceMappingURL=refreshToken.model.d.ts.map