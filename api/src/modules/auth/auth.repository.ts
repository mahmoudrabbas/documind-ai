import type { ClientSession } from "mongoose";
import TenantModel, { type TenantDocument } from "../../db/models/tenant.model.js";
import UserModel, { type UserDocument } from "../../db/models/user.model.js";
import RefreshTokenModel from "../../db/models/refreshToken.model.js";
import {
  tenantScopedCreate,
  tenantScopedFindById,
  tenantScopedFindOne,
} from "../../db/repositories/tenantScopedRepository.js";

export interface TenantCreateInput {
  name: string;
  slug: string;
  status: string;
  plan: string;
}

export interface UserCreateInput {
  tenantId: string;
  name: string;
  email: string;
  passwordHash: string;
  role: string;
  status: string;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
}

export async function findTenantBySlug(slug: string) {
  return TenantModel.findOne({ slug }).lean<TenantDocument>().exec();
}

export async function findUserByEmail(email: string) {
  return UserModel.findOne({ email }).lean<UserDocument>().exec();
}

export async function findUserDocumentByEmail(email: string) {
  return UserModel.findOne({ email }).select("+emailVerificationTokenHash").exec();
}

export async function findUserDocumentByTenantAndEmail(tenantId: string, email: string) {
  return tenantScopedFindOne(UserModel, tenantId, { tenantId, email })
    .select("+passwordHash")
    .exec();
}

export function findUserDocumentById(userId: string) {
  return UserModel.findById(userId)
    .select("+emailVerificationTokenHash +emailVerificationExpiresAt")
    .exec();
}

export function findUserById(userId: string) {
  return UserModel.findById(userId).lean<UserDocument>().exec();
}

export function findUserByTenantAndId(tenantId: string, userId: string) {
  return tenantScopedFindById(UserModel, tenantId, userId)
    .lean<UserDocument>()
    .exec();
}

export function createRefreshTokenRecord(input: {
  tenantId: string;
  userId: string;
  tokenHash: string;
  jtiHash: string;
  familyId: string;
  expiresAt: Date;
  createdByIp?: string;
  userAgent?: string;
}) {
  return tenantScopedCreate(RefreshTokenModel, input);
}

export function findRefreshTokenRecord(
  tenantId: string,
  tokenHash: string,
  jtiHash: string
) {
  return tenantScopedFindOne(RefreshTokenModel, tenantId, { tokenHash, jtiHash }).exec();
}

export function claimRefreshTokenForRotation(
  tokenId: string,
  revokedAt: Date
) {
  return RefreshTokenModel.findOneAndUpdate(
    { _id: tokenId, revokedAt: null },
    { $set: { revokedAt } },
    { returnDocument: "after" }
  ).exec();
}

export function setRefreshTokenReplacement(
  tokenId: string,
  replacementId: string
) {
  return RefreshTokenModel.updateOne(
    { _id: tokenId },
    { $set: { replacedByTokenId: replacementId } }
  ).exec();
}

export function revokeRefreshToken(
  tokenId: string,
  revokedAt: Date,
  revokedByIp?: string
) {
  return RefreshTokenModel.updateOne(
    { _id: tokenId, revokedAt: null },
    { $set: { revokedAt, ...(revokedByIp ? { revokedByIp } : {}) } }
  ).exec();
}

export function markReuseAndRevokeTokenFamily(
  familyId: string,
  tenantId: string,
  userId: string,
  reusedTokenId: string,
  revokedAt: Date,
  revokedByIp?: string
) {
  const ipUpdate = revokedByIp ? { revokedByIp } : {};

  return Promise.all([
    RefreshTokenModel.updateOne(
      { _id: reusedTokenId, reuseDetectedAt: null },
      { $set: { reuseDetectedAt: revokedAt, ...ipUpdate } }
    ).exec(),
    RefreshTokenModel.updateMany(
      { familyId, tenantId, userId, revokedAt: null },
      { $set: { revokedAt, ...ipUpdate } }
    ).exec(),
  ]);
}

export function revokeRefreshTokenFamily(
  familyId: string,
  tenantId: string,
  userId: string,
  revokedAt: Date,
  revokedByIp?: string
) {
  return RefreshTokenModel.updateMany(
    { familyId, tenantId, userId, revokedAt: null },
    {
      $set: {
        revokedAt,
        ...(revokedByIp ? { revokedByIp } : {}),
      },
    }
  ).exec();
}

export function revokeAllRefreshTokensForTenantUser(
  userId: string,
  tenantId: string,
  revokedAt: Date
) {
  return RefreshTokenModel.updateMany(
    { userId, tenantId, revokedAt: null },
    { $set: { revokedAt } }
  ).exec();
}

export async function createTenant(input: TenantCreateInput, session?: ClientSession) {
  const [tenant] = await TenantModel.create([input], { session });
  return tenant as TenantDocument;
}

export async function createUser(input: UserCreateInput, session?: ClientSession) {
  const [user] = await UserModel.create([input], { session });
  return user as UserDocument;
}

export async function updateUserVerificationToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date
) {
  await UserModel.updateOne(
    { _id: userId },
    {
      $set: {
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: expiresAt,
      },
    }
  ).exec();
}

export async function activateTenantIfPendingVerification(tenantId: string) {
  return TenantModel.findOneAndUpdate(
    { _id: tenantId, status: "pending_verification" },
    { $set: { status: "active" } },
    { returnDocument: "after" }
  )
    .lean<TenantDocument>()
    .exec();
}

export async function findTenantById(tenantId: string) {
  return TenantModel.findById(tenantId).lean<TenantDocument>().exec();
}

export async function deleteTenantById(tenantId: string) {
  await TenantModel.deleteOne({ _id: tenantId });
}

export async function deleteUserById(userId: string) {
  await UserModel.deleteOne({ _id: userId });
}
