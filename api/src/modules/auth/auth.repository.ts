import mongoose, { type ClientSession } from "mongoose";
import TenantModel, { type TenantDocument } from "../../db/models/tenant.model.js";
import UserModel, { type UserDocument } from "../../db/models/user.model.js";
import type { BaseRole } from "../../common/auth/baseRoles.js";
import RefreshTokenModel from "../../db/models/refreshToken.model.js";
import { ACTIVE_REFRESH_SESSION_FILTER, COMPLETED_ROLE_MIGRATION_STATE } from "./sessionSecurity.js";
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
  selectedPackageCode?: string;
}

export interface UserCreateInput {
  tenantId: string;
  name: string;
  email: string;
  passwordHash: string;
  role: BaseRole;
  status: string;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  customRoleId?: string;
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
export function findSuperAdminByEmail(email: string) {
  return UserModel.findOne({ email, role: "SUPER_ADMIN" }).select("+passwordHash").exec();
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
    .populate<{ customRoleId: { _id: string; name: string } | null }>(
      "customRoleId",
      "name",
    )
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

/**
 * Retry configuration for transactions that fail due to
 * transient replica-set-not-ready errors (code 20 / IllegalOperation).
 * Once the replica set is fully initialized, transactions will work
 * on the first attempt.
 */
const TRANSACTION_MAX_RETRIES = 3;
const TRANSACTION_RETRY_BASE_DELAY_MS = 500;

function isReplicaSetNotReadyError(err: unknown): boolean {
  const mongoErr = err as { code?: number; codeName?: string } | undefined;
  return (mongoErr?.code === 20 || mongoErr?.codeName === "IllegalOperation") ?? false;
}

export async function createRefreshTokenRecordForEligibleUser(input: Parameters<typeof createRefreshTokenRecord>[0]) {
  let lastError: unknown;

  for (let attempt = 0; attempt < TRANSACTION_MAX_RETRIES; attempt++) {
    const session = await mongoose.startSession();
    let created: InstanceType<typeof RefreshTokenModel> | null = null;
    let eligible = false;
    try {
      await session.withTransaction(async () => {
        eligible = false;
        created = null;
        const user = await UserModel.findOneAndUpdate(
          { _id: input.userId, tenantId: input.tenantId, roleMigrationState: COMPLETED_ROLE_MIGRATION_STATE },
          { $inc: { sessionGuardVersion: 1 } },
          { session, returnDocument: "after" },
        ).exec();
        if (!user) return;
        eligible = true;
        created = await new RefreshTokenModel(input).save({ session });
      });
      return { eligible, record: created };
    } catch (err) {
      lastError = err;
      if (isReplicaSetNotReadyError(err) && attempt < TRANSACTION_MAX_RETRIES - 1) {
        const delay = Math.min(TRANSACTION_RETRY_BASE_DELAY_MS * 2 ** attempt, 5000);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    } finally {
      await session.endSession();
    }
  }
  throw lastError;
}

export async function rotateRefreshTokenForEligibleUser(
  input: Parameters<typeof createRefreshTokenRecord>[0],
  currentTokenId: string,
  rotatedAt: Date,
) {
  const session = await mongoose.startSession();
  const result: { outcome: "rotated" | "migration-blocked" | "already-claimed" } = { outcome: "already-claimed" };
  let replacement: InstanceType<typeof RefreshTokenModel> | null = null;
  try {
    await session.withTransaction(async () => {
      result.outcome = "already-claimed";
      replacement = null;
      const user = await UserModel.findOneAndUpdate(
        { _id: input.userId, tenantId: input.tenantId, roleMigrationState: COMPLETED_ROLE_MIGRATION_STATE },
        { $inc: { sessionGuardVersion: 1 } },
        { session, returnDocument: "after" },
      ).exec();
      if (!user) {
        result.outcome = "migration-blocked";
        return;
      }
      const claimed = await RefreshTokenModel.findOneAndUpdate(
        { _id: currentTokenId, tenantId: input.tenantId, userId: input.userId, ...ACTIVE_REFRESH_SESSION_FILTER } as never,
        { $set: { revokedAt: rotatedAt } },
        { session, returnDocument: "after" },
      ).exec();
      if (!claimed) return;
      replacement = await new RefreshTokenModel(input).save({ session });
      await RefreshTokenModel.updateOne(
        { _id: currentTokenId, tenantId: input.tenantId, userId: input.userId },
        { $set: { replacedByTokenId: replacement._id } },
        { session },
      ).exec();
      result.outcome = "rotated";
    });
    return { outcome: result.outcome, replacement };
  } finally {
    await session.endSession();
  }
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

export async function updateUserPasswordResetToken(
  tenantId: string,
  userId: string,
  tokenHash: string,
  expiresAt: Date,
) {
  await UserModel.updateOne(
    { _id: userId, tenantId },
    {
      $set: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: expiresAt,
      },
    },
  ).exec();
}

export function findUserByTenantAndIdWithPasswordResetToken(tenantId: string, userId: string) {
  return UserModel.findOne({ _id: userId, tenantId })
    .select("+passwordResetTokenHash +passwordResetExpiresAt")
    .exec();
}

export function consumePasswordResetTokenAndUpdatePassword(
  tenantId: string,
  userId: string,
  tokenHash: string,
  passwordHash: string,
) {
  return UserModel.findOneAndUpdate(
    {
      _id: userId,
      tenantId,
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    },
    {
      $set: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    },
    { returnDocument: "after" },
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
