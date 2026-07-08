import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
export async function findTenantBySlug(slug) {
    return TenantModel.findOne({ slug }).lean().exec();
}
export async function findUserByEmail(email) {
    return UserModel.findOne({ email }).lean().exec();
}
export async function findUserDocumentByEmail(email) {
    return UserModel.findOne({ email }).select("+emailVerificationTokenHash").exec();
}
export async function findUserDocumentByTenantAndEmail(tenantId, email) {
    return UserModel.findOne({ tenantId, email }).select("+passwordHash").exec();
}
export function findUserDocumentById(userId) {
    return UserModel.findById(userId)
        .select("+emailVerificationTokenHash +emailVerificationExpiresAt")
        .exec();
}
export function findUserById(userId) {
    return UserModel.findById(userId).lean().exec();
}
export async function createTenant(input, session) {
    const [tenant] = await TenantModel.create([input], { session });
    return tenant;
}
export async function createUser(input, session) {
    const [user] = await UserModel.create([input], { session });
    return user;
}
export async function updateUserVerificationToken(userId, tokenHash, expiresAt) {
    await UserModel.updateOne({ _id: userId }, {
        $set: {
            emailVerificationTokenHash: tokenHash,
            emailVerificationExpiresAt: expiresAt,
        },
    }).exec();
}
export async function activateTenantIfPendingVerification(tenantId) {
    return TenantModel.findOneAndUpdate({ _id: tenantId, status: "pending_verification" }, { $set: { status: "active" } }, { returnDocument: "after" })
        .lean()
        .exec();
}
export async function findTenantById(tenantId) {
    return TenantModel.findById(tenantId).lean().exec();
}
export async function deleteTenantById(tenantId) {
    await TenantModel.deleteOne({ _id: tenantId });
}
export async function deleteUserById(userId) {
    await UserModel.deleteOne({ _id: userId });
}
//# sourceMappingURL=auth.repository.js.map