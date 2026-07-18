import mongoose, {
  type ClientSession,
  type QueryFilter,
} from "mongoose";

import TenantModel, {
  type TenantDocument,
} from "../../db/models/tenant.model.js";

import UserModel, {
  type UserDocument,
} from "../../db/models/user.model.js";

import type { BaseRole } from "../../common/auth/baseRoles.js";

import RefreshTokenModel from "../../db/models/refreshToken.model.js";

import {
  ACTIVE_REFRESH_SESSION_FILTER,
  COMPLETED_ROLE_MIGRATION_STATE,
} from "./sessionSecurity.js";

import {
  tenantScopedCreate,
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

export type PopulatedCustomRoleRecord = {
  _id: mongoose.Types.ObjectId;
  name: string;
};

export type UserSingleRecord = {
  _id: mongoose.Types.ObjectId;
  id?: string;
  tenantId: mongoose.Types.ObjectId;
  name: string;
  email: string;
  passwordHash?: string;
  role: BaseRole;
  status: string;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  emailVerificationTokenHash?: string | null;
  emailVerificationExpiresAt?: Date | null;
  passwordResetTokenHash?: string | null;
  passwordResetExpiresAt?: Date | null;
  customRoleId?: mongoose.Types.ObjectId | PopulatedCustomRoleRecord | null;
  createdAt?: Date;
};

type RefreshTokenCreateInput = Parameters<
  typeof createRefreshTokenRecord
>[0];

type RefreshTokenInstance = InstanceType<
  typeof RefreshTokenModel
>;

function buildActiveRefreshTokenFilter(
  tenantId: string,
  userId: string,
  tokenId: string,
): QueryFilter<RefreshTokenInstance> {
  return {
    ...(ACTIVE_REFRESH_SESSION_FILTER as QueryFilter<RefreshTokenInstance>),
    _id: tokenId,
    tenantId,
    userId,
  } as QueryFilter<RefreshTokenInstance>;
}

function buildRefreshTokenIdentityFilter(
  tenantId: string,
  userId: string,
  tokenId: string,
): QueryFilter<RefreshTokenInstance> {
  return {
    _id: tokenId,
    tenantId,
    userId,
  } as QueryFilter<RefreshTokenInstance>;
}

function buildEligibleUserFilter(
  tenantId: string,
  userId: string,
) {
  return {
    _id: userId,
    tenantId,
    roleMigrationState: COMPLETED_ROLE_MIGRATION_STATE,
  };
}

/**
 * Tenant repositories
 */

export async function findTenantBySlug(slug: string) {
  return TenantModel.findOne({ slug })
    .lean()
    .exec();
}

/**
 * This lookup is intentionally tenant-scoped.
 *
 * Do not search tenant users using only their email address because the
 * same email may exist in more than one tenant.
 */
export async function findUserByEmail(
  tenantId: string,
  email: string,
): Promise<UserSingleRecord | null> {
  return UserModel.findOne({ tenantId, email })
    .lean<UserSingleRecord>()
    .exec();
}

export async function findUserDocumentByEmail(
  tenantId: string,
  email: string,
): Promise<UserDocument | null> {
  return UserModel.findOne({ tenantId, email })
    .select(
      "+emailVerificationTokenHash " +
        "+emailVerificationExpiresAt",
    )
    .exec();
}

export async function findUserDocumentByTenantAndEmail(
  tenantId: string,
  email: string,
): Promise<UserDocument | null> {
  return UserModel.findOne({ tenantId, email })
    .select("+passwordHash")
    .exec();
}

export function findSuperAdminByTenantAndEmail(
  tenantId: string,
  email: string,
): Promise<UserDocument | null> {
  return UserModel.findOne({
    tenantId,
    email,
    role: "SUPER_ADMIN",
  })
    .select("+passwordHash")
    .exec();
}

/**
 * ID-only lookup retained for token-driven system flows where the signed
 * token already identifies the user.
 *
 * Tenant-facing controller flows should prefer the tenant-scoped lookup.
 */
export function findUserDocumentById(
  userId: string,
): Promise<UserDocument | null> {
  return UserModel.findById(userId)
    .select(
      "+emailVerificationTokenHash " +
        "+emailVerificationExpiresAt",
    )
    .exec();
}

export function findUserById(
  userId: string,
): Promise<UserSingleRecord | null> {
  return UserModel.findById(userId)
    .lean<UserSingleRecord>()
    .exec();
}

export function findUserByTenantAndId(
  tenantId: string,
  userId: string,
): Promise<UserSingleRecord | null> {
  return UserModel.findOne({ _id: userId, tenantId })
    .populate<{
      customRoleId: {
        _id: mongoose.Types.ObjectId;
        name: string;
      } | null;
    }>(
      "customRoleId",
      "name",
    )
    .lean<UserSingleRecord>()
    .exec();
}

export function findUserDocumentByTenantAndId(
  tenantId: string,
  userId: string,
): Promise<UserDocument | null> {
  return UserModel.findOne({ _id: userId, tenantId })
    .select(
      "+emailVerificationTokenHash " +
        "+emailVerificationExpiresAt",
    )
    .exec();
}

export function findUserWithPasswordByTenantAndId(
  tenantId: string,
  userId: string,
): Promise<UserSingleRecord | null> {
  return UserModel.findOne({ _id: userId, tenantId })
    .select("+passwordHash")
    .lean<UserSingleRecord>()
    .exec();
}

/**
 * Refresh-token repositories
 */

export function createRefreshTokenRecord(
  input: {
    tenantId: string;
    userId: string;
    tokenHash: string;
    jtiHash: string;
    familyId: string;
    expiresAt: Date;
    createdByIp?: string;
    userAgent?: string;
  },
) {
  return tenantScopedCreate(
    RefreshTokenModel,
    input,
  );
}

/**
 * Atomically:
 *
 * 1. Confirms that the user is not undergoing role migration.
 * 2. Increments the user's session guard version.
 * 3. Creates the refresh-token record.
 *
 * The increment is rolled back automatically if token creation fails.
 *
 * This preserves the existing session-guard policy. If the application is
 * intended to support multiple concurrent login sessions without invalidating
 * earlier sessions, review whether incrementing sessionGuardVersion on login
 * is part of the intended policy.
 */
export async function createRefreshTokenRecordForEligibleUser(
  input: RefreshTokenCreateInput,
) {
  const session = await mongoose.startSession();

  let created: RefreshTokenInstance | null = null;
  let eligible = false;

  try {
    await session.withTransaction(async () => {
      eligible = false;
      created = null;

      const userUpdate = await UserModel.updateOne(
        buildEligibleUserFilter(
          input.tenantId,
          input.userId,
        ),
        {
          $inc: {
            sessionGuardVersion: 1,
          },
        },
        {
          session,
        },
      ).exec();

      if (userUpdate.matchedCount !== 1) {
        return;
      }

      const record = new RefreshTokenModel(input);

      created = await record.save({
        session,
      });

      eligible = true;
    });

    return {
      eligible,
      record: created,
    };
  } finally {
    await session.endSession();
  }
}

/**
 * Secure refresh-token rotation.
 *
 * The old implementation incremented sessionGuardVersion before claiming the
 * token. A concurrent or already-claimed refresh token could therefore mutate
 * the user even though rotation failed.
 *
 * The corrected order is:
 *
 * 1. Confirm migration eligibility.
 * 2. Atomically claim the current token.
 * 3. Increment the session guard.
 * 4. Create the replacement token.
 * 5. Link the old token to its replacement.
 *
 * Every operation is inside one MongoDB transaction.
 */
export async function rotateRefreshTokenForEligibleUser(
  input: RefreshTokenCreateInput,
  currentTokenId: string,
  rotatedAt: Date,
) {
  const session = await mongoose.startSession();

  const result: {
    outcome:
      | "rotated"
      | "migration-blocked"
      | "already-claimed";
  } = {
    outcome: "already-claimed",
  };

  let replacement: RefreshTokenInstance | null = null;

  try {
    await session.withTransaction(async () => {
      result.outcome = "already-claimed";
      replacement = null;

      /*
       * First perform a read-only eligibility check.
       *
       * This preserves the existing outcome semantics: a user who is in role
       * migration receives migration-blocked rather than token-state details.
       */
      const eligibleUser = await UserModel.findOne(
        buildEligibleUserFilter(
          input.tenantId,
          input.userId,
        ),
      )
        .select("_id")
        .session(session)
        .lean()
        .exec();

      if (!eligibleUser) {
        result.outcome = "migration-blocked";
        return;
      }

      /*
       * Claim the token before mutating the user.
       *
       * Only one concurrent request can change the token from active to
       * revoked. Other requests receive already-claimed without incrementing
       * sessionGuardVersion.
       */
      const claimedToken =
        await RefreshTokenModel.findOneAndUpdate(
          buildActiveRefreshTokenFilter(
            input.tenantId,
            input.userId,
            currentTokenId,
          ),
          {
            $set: {
              revokedAt: rotatedAt,
            },
          },
          {
            session,
            returnDocument: "after",
          },
        ).exec();

      if (!claimedToken) {
        result.outcome = "already-claimed";
        return;
      }

      /*
       * Re-check migration eligibility during the write.
       *
       * If another operation changed the role-migration state concurrently,
       * MongoDB should raise a write conflict and retry the transaction. A
       * zero match after retry indicates an invariant failure.
       */
      const guardUpdate = await UserModel.updateOne(
        buildEligibleUserFilter(
          input.tenantId,
          input.userId,
        ),
        {
          $inc: {
            sessionGuardVersion: 1,
          },
        },
        {
          session,
        },
      ).exec();

      if (guardUpdate.matchedCount !== 1) {
        throw new Error(
          "ROLE_MIGRATION_STATE_CHANGED_DURING_TOKEN_ROTATION",
        );
      }

      const savedReplacement =
        await new RefreshTokenModel(input).save({
          session,
        });

      replacement = savedReplacement;

      const replacementLink =
        await RefreshTokenModel.updateOne(
          {
            ...buildRefreshTokenIdentityFilter(
              input.tenantId,
              input.userId,
              currentTokenId,
            ),
            replacedByTokenId: null,
          },
          {
            $set: {
              replacedByTokenId:
                savedReplacement._id,
            },
          },
          {
            session,
          },
        ).exec();

      if (replacementLink.matchedCount !== 1) {
        throw new Error(
          "REFRESH_TOKEN_REPLACEMENT_LINK_FAILED",
        );
      }

      result.outcome = "rotated";
    });

    return {
      outcome: result.outcome,
      replacement,
    };
  } finally {
    await session.endSession();
  }
}

export function findRefreshTokenRecord(
  tenantId: string,
  tokenHash: string,
  jtiHash: string,
) {
  return tenantScopedFindOne(
    RefreshTokenModel,
    tenantId,
    {
      tenantId,
      tokenHash,
      jtiHash,
    },
  ).exec();
}

/**
 * All refresh-token mutation helpers are explicitly tenant- and user-scoped.
 */

export function claimRefreshTokenForRotation(
  tenantId: string,
  userId: string,
  tokenId: string,
  revokedAt: Date,
) {
  return RefreshTokenModel.findOneAndUpdate(
    buildActiveRefreshTokenFilter(
      tenantId,
      userId,
      tokenId,
    ),
    {
      $set: {
        revokedAt,
      },
    },
    {
      returnDocument: "after",
    },
  ).exec();
}

export function setRefreshTokenReplacement(
  tenantId: string,
  userId: string,
  tokenId: string,
  replacementId: string,
) {
  return RefreshTokenModel.updateOne(
    {
      ...buildRefreshTokenIdentityFilter(
        tenantId,
        userId,
        tokenId,
      ),
      replacedByTokenId: null,
    },
    {
      $set: {
        replacedByTokenId: replacementId,
      },
    },
  ).exec();
}

export function revokeRefreshToken(
  tenantId: string,
  userId: string,
  tokenId: string,
  revokedAt: Date,
  revokedByIp?: string,
) {
  return RefreshTokenModel.updateOne(
    {
      ...buildRefreshTokenIdentityFilter(
        tenantId,
        userId,
        tokenId,
      ),
      revokedAt: null,
    },
    {
      $set: {
        revokedAt,
        ...(revokedByIp
          ? {
              revokedByIp,
            }
          : {}),
      },
    },
  ).exec();
}

/**
 * Reuse detection and family revocation are one atomic security operation.
 *
 * The old Promise.all implementation could mark the reused token while failing
 * to revoke its family, or revoke the family while failing to record reuse.
 */
export async function markReuseAndRevokeTokenFamily(
  familyId: string,
  tenantId: string,
  userId: string,
  reusedTokenId: string,
  revokedAt: Date,
  revokedByIp?: string,
) {
  const session = await mongoose.startSession();

  try {
    const transactionResult =
      await session.withTransaction(async () => {
        const ipUpdate = revokedByIp
          ? {
              revokedByIp,
            }
          : {};

        const reuseMarkResult =
          await RefreshTokenModel.updateOne(
            {
              _id: reusedTokenId,
              tenantId,
              userId,
              familyId,
              reuseDetectedAt: null,
            },
            {
              $set: {
                reuseDetectedAt: revokedAt,
                ...ipUpdate,
              },
            },
            {
              session,
            },
          ).exec();

        const familyRevokeResult =
          await RefreshTokenModel.updateMany(
            {
              familyId,
              tenantId,
              userId,
              revokedAt: null,
            },
            {
              $set: {
                revokedAt,
                ...ipUpdate,
              },
            },
            {
              session,
            },
          ).exec();

        return [
          reuseMarkResult,
          familyRevokeResult,
        ] as const;
      });

    if (!transactionResult) {
      throw new Error(
        "REFRESH_TOKEN_FAMILY_REVOCATION_TRANSACTION_ABORTED",
      );
    }

    return transactionResult;
  } finally {
    await session.endSession();
  }
}

export function revokeRefreshTokenFamily(
  familyId: string,
  tenantId: string,
  userId: string,
  revokedAt: Date,
  revokedByIp?: string,
) {
  return RefreshTokenModel.updateMany(
    {
      familyId,
      tenantId,
      userId,
      revokedAt: null,
    },
    {
      $set: {
        revokedAt,
        ...(revokedByIp
          ? {
              revokedByIp,
            }
          : {}),
      },
    },
  ).exec();
}

export function revokeAllRefreshTokensForTenantUser(
  userId: string,
  tenantId: string,
  revokedAt: Date,
) {
  return RefreshTokenModel.updateMany(
    {
      userId,
      tenantId,
      revokedAt: null,
    },
    {
      $set: {
        revokedAt,
      },
    },
  ).exec();
}

/**
 * Tenant and user creation
 */

export async function createTenant(
  input: TenantCreateInput,
  session?: ClientSession,
) {
  const [tenant] = await TenantModel.create(
    [input],
    {
      session,
    },
  );

  return tenant as TenantDocument;
}

export async function createUser(
  input: UserCreateInput,
  session?: ClientSession,
) {
  const [user] = await UserModel.create(
    [input],
    {
      session,
    },
  );

  return user as UserDocument;
}

/**
 * Email verification
 */

export async function updateUserVerificationToken(
  userId: string,
  tokenHash: string | null,
  expiresAt: Date | null,
) {
  await UserModel.updateOne(
    {
      _id: userId,
    },
    {
      $set: {
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: expiresAt,
      },
    },
  ).exec();
}

/**
 * Password reset
 */

export async function updateUserPasswordResetToken(
  tenantId: string,
  userId: string,
  tokenHash: string,
  expiresAt: Date,
) {
  await UserModel.updateOne(
    {
      _id: userId,
      tenantId,
    },
    {
      $set: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: expiresAt,
      },
    },
  ).exec();
}

export function findUserByTenantAndIdWithPasswordResetToken(
  tenantId: string,
  userId: string,
): Promise<UserDocument | null> {
  return UserModel.findOne({ _id: userId, tenantId })
    .select(
      "+passwordResetTokenHash " +
        "+passwordResetExpiresAt",
    )
    .exec();
}

/**
 * Consumes the reset token, updates the password, increments the session guard,
 * and revokes every active refresh token in one transaction.
 *
 * This prevents old sessions from remaining valid after a password reset.
 */
export async function consumePasswordResetTokenAndUpdatePassword(
  tenantId: string,
  userId: string,
  tokenHash: string,
  passwordHash: string,
) {
  const session = await mongoose.startSession();

  let updatedUser:
    | InstanceType<typeof UserModel>
    | null = null;

  try {
    await session.withTransaction(async () => {
      updatedUser =
        await UserModel.findOneAndUpdate(
          {
            _id: userId,
            tenantId,
            passwordResetTokenHash: tokenHash,
            passwordResetExpiresAt: {
              $gt: new Date(),
            },
          },
          {
            $set: {
              passwordHash,
              passwordResetTokenHash: null,
              passwordResetExpiresAt: null,
            },
            $inc: {
              sessionGuardVersion: 1,
            },
          },
          {
            session,
            returnDocument: "after",
          },
        ).exec();

      if (!updatedUser) {
        return;
      }

      await RefreshTokenModel.updateMany(
        {
          userId,
          tenantId,
          revokedAt: null,
        },
        {
          $set: {
            revokedAt: new Date(),
          },
        },
        {
          session,
        },
      ).exec();
    });

    return updatedUser;
  } catch (error) {
    const isTransactionUnsupported =
      error instanceof Error &&
      /replica set|transaction|Transaction numbers are only allowed|retryable writes/i.test(
        error.message,
      );

    if (!isTransactionUnsupported) {
      throw error;
    }

    updatedUser = await UserModel.findOneAndUpdate(
      {
        _id: userId,
        tenantId,
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: {
          $gt: new Date(),
        },
      },
      {
        $set: {
          passwordHash,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
        },
        $inc: {
          sessionGuardVersion: 1,
        },
      },
      {
        returnDocument: "after",
      },
    ).exec();

    if (!updatedUser) {
      return updatedUser;
    }

    await RefreshTokenModel.updateMany(
      {
        userId,
        tenantId,
        revokedAt: null,
      },
      {
        $set: {
          revokedAt: new Date(),
        },
      },
    ).exec();

    return updatedUser;
  } finally {
    await session.endSession();
  }
}

/**
 * Tenant activation and cleanup
 */

export async function activateTenantIfPendingVerification(
  tenantId: string,
) {
  return TenantModel.findOneAndUpdate(
    {
      _id: tenantId,
      status: "pending_verification",
    },
    {
      $set: {
        status: "active",
      },
    },
    {
      returnDocument: "after",
    },
  )
    .lean()
    .exec();
}

export async function findTenantById(
  tenantId: string,
) {
  return TenantModel.findById(tenantId)
    .lean()
    .exec();
}

export async function deleteTenantById(
  tenantId: string,
) {
  await TenantModel.deleteOne({
    _id: tenantId,
  }).exec();
}

export async function deleteUserById(
  userId: string,
) {
  await UserModel.deleteOne({
    _id: userId,
  }).exec();
}
