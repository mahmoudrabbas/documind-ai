import mongoose from "mongoose";
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
    passwordResetTokenHash: string | null;
    passwordResetExpiresAt: Date | null;
    customRoleId: mongoose.Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
}
declare const UserModel: mongoose.Model<UserDocument, {}, {}, {}, mongoose.Document<unknown, {}, UserDocument, {}, mongoose.DefaultSchemaOptions> & UserDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, UserDocument>;
export default UserModel;
//# sourceMappingURL=user.model.d.ts.map