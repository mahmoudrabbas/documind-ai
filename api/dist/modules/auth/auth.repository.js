import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import RefreshTokenModel from "../../db/models/refreshToken.model.js";
import { tenantScopedCreate, tenantScopedFindById, tenantScopedFindOne, } from "../../db/repositories/tenantScopedRepository.js";
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
    return tenantScopedFindOne(UserModel, tenantId, { tenantId, email })
        .select("+passwordHash")
        .exec();
}
export function findSuperAdminByEmail(email) {
    return UserModel.findOne({ email, role: "SUPER_ADMIN" }).select("+passwordHash").exec();
}
export function findUserDocumentById(userId) {
    return UserModel.findById(userId)
        .select("+emailVerificationTokenHash +emailVerificationExpiresAt")
        .exec();
}
export function findUserById(userId) {
    return UserModel.findById(userId).lean().exec();
}
export function findUserByTenantAndId(tenantId, userId) {
    return tenantScopedFindById(UserModel, tenantId, userId)
        .lean()
        .exec();
}
export function createRefreshTokenRecord(input) {
    return tenantScopedCreate(RefreshTokenModel, input);
}
export function findRefreshTokenRecord(tenantId, tokenHash, jtiHash) {
    return tenantScopedFindOne(RefreshTokenModel, tenantId, { tokenHash, jtiHash }).exec();
}
export function claimRefreshTokenForRotation(tokenId, revokedAt) {
    return RefreshTokenModel.findOneAndUpdate({ _id: tokenId, revokedAt: null }, { $set: { revokedAt } }, { returnDocument: "after" }).exec();
}
export function setRefreshTokenReplacement(tokenId, replacementId) {
    return RefreshTokenModel.updateOne({ _id: tokenId }, { $set: { replacedByTokenId: replacementId } }).exec();
}
export function revokeRefreshToken(tokenId, revokedAt, revokedByIp) {
    return RefreshTokenModel.updateOne({ _id: tokenId, revokedAt: null }, { $set: { revokedAt, ...(revokedByIp ? { revokedByIp } : {}) } }).exec();
}
export function markReuseAndRevokeTokenFamily(familyId, tenantId, userId, reusedTokenId, revokedAt, revokedByIp) {
    const ipUpdate = revokedByIp ? { revokedByIp } : {};
    return Promise.all([
        RefreshTokenModel.updateOne({ _id: reusedTokenId, reuseDetectedAt: null }, { $set: { reuseDetectedAt: revokedAt, ...ipUpdate } }).exec(),
        RefreshTokenModel.updateMany({ familyId, tenantId, userId, revokedAt: null }, { $set: { revokedAt, ...ipUpdate } }).exec(),
    ]);
}
export function revokeRefreshTokenFamily(familyId, tenantId, userId, revokedAt, revokedByIp) {
    return RefreshTokenModel.updateMany({ familyId, tenantId, userId, revokedAt: null }, {
        $set: {
            revokedAt,
            ...(revokedByIp ? { revokedByIp } : {}),
        },
    }).exec();
}
export function revokeAllRefreshTokensForTenantUser(userId, tenantId, revokedAt) {
    return RefreshTokenModel.updateMany({ userId, tenantId, revokedAt: null }, { $set: { revokedAt } }).exec();
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